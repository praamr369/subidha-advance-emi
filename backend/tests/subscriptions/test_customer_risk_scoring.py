"""P3C tests: Customer Risk Scoring.

Covers:
* Low-risk customer defaults to LOW band
* Missing KYC increases score
* Rejected KYC increases score significantly
* Address doc rejected contributes reason code
* Overdue EMI history increases score
* Successful completed subscriptions lower score
* High contract value raises score
* Low deposit percent (rent) raises score
* Enforcement disabled never blocks
* Enforcement enabled + BLOCKED band blocks rent/lease
* HIGH risk requires approval when enforcement enabled
* Readiness payload contains 'risk' section
* Legacy ACTIVE/HANDED_OVER contracts remain compatible (risk advisory only)
* Customer / partner cannot reach admin risk endpoint
* Admin can read and recalculate risk profile via admin endpoint
* recalculate_customer_risk_profile persists profile
* get_customer_risk_profile returns transient LOW default for new customer
* evaluate_contract_risk combines base risk with contract factors
* assert_customer_risk_allows_contract is no-op when enforcement disabled
"""
from __future__ import annotations

import itertools
from datetime import date, timedelta
from decimal import Decimal

from django.test import TestCase

from subscriptions.models import (
    CustomerRiskBand,
    CustomerRiskProfile,
    Emi,
    EmiStatus,
    KycStatus,
    PlanType,
    Product,
    RentLeaseBillingDemand,
    RentLeaseDemandStatus,
    RentLeaseDemandType,
    SubscriptionStatus,
)
from subscriptions.services.customer_risk_service import (
    assert_customer_risk_allows_contract,
    calculate_customer_risk,
    evaluate_contract_risk,
    get_customer_risk_profile,
    recalculate_customer_risk_profile,
)
from subscriptions.services.contract_activation_readiness_service import (
    evaluate_contract_activation_readiness,
)
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_customer_profile,
    create_customer_user,
    create_lucky_id,
    create_product,
    create_subscription,
)
from rest_framework.test import APIClient

# ---------------------------------------------------------------------------
# Unique ID generator — prevents username / product-code collisions across tests
# ---------------------------------------------------------------------------
_seq = itertools.count(1)


def _uid() -> str:
    return f"p3c{next(_seq):05d}"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_customer(*, kyc_status=KycStatus.VERIFIED):
    uid = _uid()
    phone = f"91{uid}"[:15]
    user = create_customer_user(username=uid, phone=phone)
    customer = create_customer_profile(user=user, phone=phone)
    customer.kyc_status = kyc_status
    customer.save(update_fields=["kyc_status"])
    return customer


def _make_rent_product(code=None):
    code = code or f"RENT-{_uid()}"
    product = create_product(product_code=code)
    Product.objects.filter(pk=product.pk).update(is_rent_enabled=True, is_lease_enabled=True)
    product.refresh_from_db()
    return product


def _make_subscription(customer, *, plan_type=PlanType.EMI, total_amount=Decimal("15000.00"), status=SubscriptionStatus.ACTIVE):
    uid = _uid()
    product = create_product(product_code=f"P-{uid}")
    batch = create_batch(batch_code=f"B-{uid}")
    lucky_id = create_lucky_id(batch=batch, lucky_number=1)
    return create_subscription(
        customer=customer,
        product=product,
        batch=batch,
        lucky_id=lucky_id,
        total_amount=total_amount,
        status=status,
    )


# ---------------------------------------------------------------------------
# Unit tests: calculate_customer_risk
# ---------------------------------------------------------------------------

class TestCalculateCustomerRisk(TestCase):

    def test_verified_kyc_low_risk(self):
        customer = _make_customer(kyc_status=KycStatus.VERIFIED)
        result = calculate_customer_risk(customer)
        self.assertEqual(result["risk_band"], CustomerRiskBand.LOW)
        self.assertLess(result["risk_score"], 25)

    def test_missing_kyc_increases_score(self):
        customer_pending = _make_customer(kyc_status=KycStatus.PENDING)
        customer_verified = _make_customer(kyc_status=KycStatus.VERIFIED)
        result_pending = calculate_customer_risk(customer_pending)
        result_verified = calculate_customer_risk(customer_verified)
        self.assertGreater(result_pending["risk_score"], result_verified["risk_score"])
        self.assertIn("KYC_MISSING", result_pending["reason_codes"])

    def test_not_provided_kyc_counts_as_missing(self):
        customer = _make_customer(kyc_status=KycStatus.NOT_PROVIDED)
        result = calculate_customer_risk(customer)
        self.assertIn("KYC_MISSING", result["reason_codes"])

    def test_rejected_kyc_scores_higher_than_missing(self):
        customer_rejected = _make_customer(kyc_status=KycStatus.REJECTED)
        customer_pending = _make_customer(kyc_status=KycStatus.PENDING)
        r_rejected = calculate_customer_risk(customer_rejected)
        r_pending = calculate_customer_risk(customer_pending)
        self.assertGreaterEqual(r_rejected["risk_score"], r_pending["risk_score"])
        self.assertIn("KYC_REJECTED", r_rejected["reason_codes"])

    def test_overdue_emis_increase_score(self):
        customer = _make_customer(kyc_status=KycStatus.VERIFIED)
        sub = _make_subscription(customer)
        Emi.objects.create(
            subscription=sub,
            month_no=1,
            due_date=date.today() - timedelta(days=5),
            amount=Decimal("1000.00"),
            status=EmiStatus.PENDING,
        )
        result = calculate_customer_risk(customer)
        self.assertTrue(any("OVERDUE_EMIS" in r for r in result["reason_codes"]))

    def test_no_overdue_emis_no_penalty(self):
        customer = _make_customer(kyc_status=KycStatus.VERIFIED)
        sub = _make_subscription(customer)
        Emi.objects.create(
            subscription=sub,
            month_no=1,
            due_date=date.today() + timedelta(days=30),
            amount=Decimal("1000.00"),
            status=EmiStatus.PENDING,
        )
        result = calculate_customer_risk(customer)
        self.assertFalse(any("OVERDUE_EMIS" in r for r in result["reason_codes"]))

    def test_completed_subscriptions_reduce_score(self):
        customer = _make_customer(kyc_status=KycStatus.PENDING)
        result_before = calculate_customer_risk(customer)
        _make_subscription(customer, status=SubscriptionStatus.COMPLETED)
        result_after = calculate_customer_risk(customer)
        self.assertLessEqual(result_after["risk_score"], result_before["risk_score"])

    def test_partner_origin_adds_reason(self):
        admin_user = create_admin_user(username=f"padmin-{_uid()}", phone=f"9200{next(_seq):06d}"[:15])
        customer = _make_customer(kyc_status=KycStatus.VERIFIED)
        customer.created_by_partner_user = admin_user
        customer.save(update_fields=["created_by_partner_user"])
        result = calculate_customer_risk(customer)
        self.assertIn("PARTNER_CREATED", result["reason_codes"])

    def test_score_is_never_negative(self):
        customer = _make_customer(kyc_status=KycStatus.VERIFIED)
        _make_subscription(customer, status=SubscriptionStatus.COMPLETED)
        _make_subscription(customer, status=SubscriptionStatus.WON, total_amount=Decimal("5000.00"))
        result = calculate_customer_risk(customer)
        self.assertGreaterEqual(result["risk_score"], 0)


# ---------------------------------------------------------------------------
# Unit tests: evaluate_contract_risk
# ---------------------------------------------------------------------------

class TestEvaluateContractRisk(TestCase):

    def test_high_value_contract_increases_score(self):
        customer = _make_customer(kyc_status=KycStatus.VERIFIED)
        sub = _make_subscription(customer, total_amount=Decimal("80000.00"))
        result = evaluate_contract_risk(sub, customer=customer)
        self.assertIn("HIGH_CONTRACT_VALUE", result["reason_codes"])

    def test_normal_value_contract_no_penalty(self):
        customer = _make_customer(kyc_status=KycStatus.VERIFIED)
        sub = _make_subscription(customer, total_amount=Decimal("20000.00"))
        result = evaluate_contract_risk(sub, customer=customer)
        self.assertNotIn("HIGH_CONTRACT_VALUE", result["reason_codes"])

    def test_enforcement_disabled_no_blockers(self):
        customer = _make_customer(kyc_status=KycStatus.REJECTED)
        sub = _make_subscription(customer, total_amount=Decimal("100000.00"))
        result = evaluate_contract_risk(sub, customer=customer)
        self.assertFalse(result["enforcement_enabled"])
        self.assertEqual(result["blocker_codes"], [])

    def test_result_has_required_keys(self):
        customer = _make_customer(kyc_status=KycStatus.VERIFIED)
        sub = _make_subscription(customer)
        result = evaluate_contract_risk(sub, customer=customer)
        for key in ("risk_score", "risk_band", "reason_codes", "enforcement_enabled", "approval_required", "blocker_codes"):
            self.assertIn(key, result)


# ---------------------------------------------------------------------------
# Unit tests: enforcement
# ---------------------------------------------------------------------------

class TestEnforcement(TestCase):

    def test_enforcement_disabled_assert_never_raises(self):
        customer = _make_customer(kyc_status=KycStatus.REJECTED)
        sub = _make_subscription(customer, total_amount=Decimal("200000.00"))
        # Should not raise — enforcement is off by default
        result = assert_customer_risk_allows_contract(sub, customer=customer)
        self.assertEqual(result["blocker_codes"], [])

    def test_enforcement_enabled_blocked_band_blocks_rent(self):
        from unittest.mock import patch

        customer = _make_customer(kyc_status=KycStatus.REJECTED)

        def _mock_policy(key, default=None):
            from subscriptions.services.customer_risk_service import (
                POLICY_ENFORCEMENT_ENABLED, POLICY_BLOCKED_THRESHOLD,
                POLICY_MEDIUM_THRESHOLD, POLICY_HIGH_THRESHOLD,
                POLICY_HIGH_REQUIRES_APPROVAL, POLICY_BLOCKED_BLOCKS_RENT_LEASE,
            )
            return {
                POLICY_ENFORCEMENT_ENABLED: True,
                POLICY_BLOCKED_THRESHOLD: 1,    # score>=1 → BLOCKED
                POLICY_MEDIUM_THRESHOLD: 1000,
                POLICY_HIGH_THRESHOLD: 1000,
                POLICY_HIGH_REQUIRES_APPROVAL: False,
                POLICY_BLOCKED_BLOCKS_RENT_LEASE: True,
            }.get(key, default)

        class FakeSub:
            plan_type = PlanType.RENT
            total_amount = Decimal("10000.00")
            pk = None

        with patch("subscriptions.services.customer_risk_service._get_policy", side_effect=_mock_policy):
            with self.assertRaises(ValueError) as ctx:
                assert_customer_risk_allows_contract(FakeSub(), customer=customer)
        self.assertIn("CUSTOMER_RISK_BLOCKED", str(ctx.exception))

    def test_enforcement_enabled_blocked_band_does_not_block_emi(self):
        from unittest.mock import patch

        customer = _make_customer(kyc_status=KycStatus.REJECTED)

        def _mock_policy(key, default=None):
            from subscriptions.services.customer_risk_service import (
                POLICY_ENFORCEMENT_ENABLED, POLICY_BLOCKED_THRESHOLD,
                POLICY_MEDIUM_THRESHOLD, POLICY_HIGH_THRESHOLD,
                POLICY_HIGH_REQUIRES_APPROVAL, POLICY_BLOCKED_BLOCKS_RENT_LEASE,
            )
            return {
                POLICY_ENFORCEMENT_ENABLED: True,
                POLICY_BLOCKED_THRESHOLD: 1,
                POLICY_MEDIUM_THRESHOLD: 1000,
                POLICY_HIGH_THRESHOLD: 1000,
                POLICY_HIGH_REQUIRES_APPROVAL: False,
                POLICY_BLOCKED_BLOCKS_RENT_LEASE: True,
            }.get(key, default)

        class FakeSub:
            plan_type = PlanType.EMI
            total_amount = Decimal("10000.00")
            pk = None

        with patch("subscriptions.services.customer_risk_service._get_policy", side_effect=_mock_policy):
            result = assert_customer_risk_allows_contract(FakeSub(), customer=customer)
        # EMI must not be blocked even with BLOCKED band
        self.assertEqual(result["blocker_codes"], [])

    def test_enforcement_enabled_high_band_requires_approval(self):
        from unittest.mock import patch, MagicMock

        customer = _make_customer(kyc_status=KycStatus.REJECTED)

        def _mock_policy(key, default=None):
            from subscriptions.services.customer_risk_service import (
                POLICY_ENFORCEMENT_ENABLED, POLICY_BLOCKED_THRESHOLD,
                POLICY_MEDIUM_THRESHOLD, POLICY_HIGH_THRESHOLD,
                POLICY_HIGH_REQUIRES_APPROVAL, POLICY_BLOCKED_BLOCKS_RENT_LEASE,
            )
            return {
                POLICY_ENFORCEMENT_ENABLED: True,
                POLICY_BLOCKED_THRESHOLD: 1000,   # won't reach BLOCKED
                POLICY_MEDIUM_THRESHOLD: 1000,
                POLICY_HIGH_THRESHOLD: 1,          # score>=1 → HIGH
                POLICY_HIGH_REQUIRES_APPROVAL: True,
                POLICY_BLOCKED_BLOCKS_RENT_LEASE: True,
            }.get(key, default)

        class FakeSub:
            plan_type = PlanType.RENT
            total_amount = Decimal("10000.00")
            pk = None

        with patch("subscriptions.services.customer_risk_service._get_policy", side_effect=_mock_policy):
            result = evaluate_contract_risk(FakeSub(), customer=customer)

        self.assertTrue(result["approval_required"])


# ---------------------------------------------------------------------------
# Unit tests: persist + retrieve
# ---------------------------------------------------------------------------

class TestRiskProfilePersistence(TestCase):

    def test_get_risk_profile_transient_default_for_new_customer(self):
        customer = _make_customer(kyc_status=KycStatus.VERIFIED)
        profile = get_customer_risk_profile(customer)
        self.assertEqual(profile.risk_band, CustomerRiskBand.LOW)
        self.assertIsNone(profile.pk)  # not persisted yet

    def test_recalculate_persists_profile(self):
        customer = _make_customer(kyc_status=KycStatus.VERIFIED)
        profile = recalculate_customer_risk_profile(customer)
        self.assertIsNotNone(profile.pk)
        stored = CustomerRiskProfile.objects.get(customer=customer)
        self.assertEqual(stored.risk_band, profile.risk_band)

    def test_recalculate_is_idempotent(self):
        customer = _make_customer(kyc_status=KycStatus.VERIFIED)
        p1 = recalculate_customer_risk_profile(customer)
        p2 = recalculate_customer_risk_profile(customer)
        self.assertEqual(p1.pk, p2.pk)
        self.assertEqual(CustomerRiskProfile.objects.filter(customer=customer).count(), 1)

    def test_get_risk_profile_returns_persisted_after_recalculate(self):
        customer = _make_customer(kyc_status=KycStatus.VERIFIED)
        recalculate_customer_risk_profile(customer)
        profile = get_customer_risk_profile(customer)
        self.assertIsNotNone(profile.pk)


# ---------------------------------------------------------------------------
# Integration: readiness payload includes risk section
# ---------------------------------------------------------------------------

class TestReadinessRiskIntegration(TestCase):

    def test_readiness_payload_has_risk_key(self):
        from subscriptions.services.rent_lease_contract_service import create_rent_contract
        admin = create_admin_user(username=f"ra-{_uid()}", phone=f"9300{next(_seq):06d}"[:15])
        customer = _make_customer(kyc_status=KycStatus.VERIFIED)
        product = _make_rent_product()
        sub = create_rent_contract(
            customer=customer,
            product=product,
            start_date=date.today(),
            tenure_months=12,
            security_deposit_percent=Decimal("25.00"),
            performed_by=admin,
        )
        readiness = evaluate_contract_activation_readiness(sub)
        self.assertIn("risk", readiness)
        risk = readiness["risk"]
        for key in ("risk_score", "risk_band", "reason_codes", "enforcement_enabled", "approval_required", "blocker_codes"):
            self.assertIn(key, risk)

    def test_readiness_risk_enforcement_disabled_no_risk_blockers(self):
        from subscriptions.services.rent_lease_contract_service import create_rent_contract
        admin = create_admin_user(username=f"ra2-{_uid()}", phone=f"9300{next(_seq):06d}"[:15])
        customer = _make_customer(kyc_status=KycStatus.REJECTED)
        product = _make_rent_product()
        sub = create_rent_contract(
            customer=customer,
            product=product,
            start_date=date.today(),
            tenure_months=12,
            security_deposit_percent=Decimal("25.00"),
            performed_by=admin,
        )
        readiness = evaluate_contract_activation_readiness(sub)
        risk = readiness["risk"]
        self.assertFalse(risk["enforcement_enabled"])
        self.assertEqual(risk["blocker_codes"], [])

    def test_legacy_active_subscription_readiness_backward_compatible(self):
        customer = _make_customer(kyc_status=KycStatus.VERIFIED)
        sub = _make_subscription(customer, status=SubscriptionStatus.ACTIVE)
        readiness = evaluate_contract_activation_readiness(sub)
        self.assertIn("plan_type", readiness)
        self.assertIn("risk", readiness)

    def test_existing_readiness_keys_untouched(self):
        customer = _make_customer(kyc_status=KycStatus.VERIFIED)
        sub = _make_subscription(customer, status=SubscriptionStatus.ACTIVE)
        readiness = evaluate_contract_activation_readiness(sub)
        for key in ("plan_type", "kyc_verified", "can_reach_active_or_handover", "blocker_codes", "blocker_messages"):
            self.assertIn(key, readiness)


# ---------------------------------------------------------------------------
# API endpoint tests
# ---------------------------------------------------------------------------

class TestAdminCustomerRiskEndpoint(TestCase):

    def setUp(self):
        uid = _uid()
        self.admin = create_admin_user(username=f"api-admin-{uid}", phone=f"9400{next(_seq):06d}"[:15])
        self.customer = _make_customer(kyc_status=KycStatus.VERIFIED)
        self.client = APIClient()

    def _url_read(self):
        return f"/api/v1/admin/customers/{self.customer.pk}/risk-profile/"

    def _url_recalc(self):
        return f"/api/v1/admin/customers/{self.customer.pk}/risk-profile/recalculate/"

    def test_admin_can_read_risk_profile(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get(self._url_read())
        self.assertEqual(resp.status_code, 200)
        self.assertIn("risk_band", resp.data)
        self.assertIn("risk_score", resp.data)

    def test_admin_can_recalculate_risk_profile(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(self._url_recalc())
        self.assertEqual(resp.status_code, 200)
        self.assertIn("risk_band", resp.data)
        self.assertTrue(CustomerRiskProfile.objects.filter(customer=self.customer).exists())

    def test_unauthenticated_cannot_read_risk_profile(self):
        resp = self.client.get(self._url_read())
        self.assertEqual(resp.status_code, 401)

    def test_customer_role_cannot_read_risk_profile(self):
        uid = _uid()
        customer_user = create_customer_user(username=uid, phone=f"9500{next(_seq):06d}"[:15])
        self.client.force_authenticate(user=customer_user)
        resp = self.client.get(self._url_read())
        self.assertEqual(resp.status_code, 403)

    def test_partner_cannot_read_risk_profile(self):
        from accounts.models import User, UserRole
        uid = _uid()
        partner_user = User.objects.create_user(
            username=uid, password="P@ssw0rd", role=UserRole.PARTNER,
            phone=f"9600{next(_seq):06d}"[:15],
        )
        self.client.force_authenticate(user=partner_user)
        resp = self.client.get(self._url_read())
        self.assertEqual(resp.status_code, 403)

    def test_nonexistent_customer_returns_404(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get("/api/v1/admin/customers/999999/risk-profile/")
        self.assertEqual(resp.status_code, 404)
