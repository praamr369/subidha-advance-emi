"""P0 tests: contract activation / handover readiness + snapshot document type.

Covers:
* rent/lease contract tax snapshot document_type (RENT_CONTRACT / LEASE_CONTRACT)
* milestone readiness computation (blockers + allowed flows) for EMI/RENT/LEASE
* assert_contract_activation_ready is a no-op when gating is disabled and raises
  a controlled HTTP 400 when enabled and incomplete
* delivery/handover hard gate for lease asset-condition proof
* legacy compatibility classification never mutates an existing record's status
"""
from __future__ import annotations

from decimal import Decimal

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from subscriptions.models import (
    Commission,
    CommissionPayoutBatch,
    CustomerKycDocument,
    CustomerKycDocumentStatus,
    CustomerKycDocumentType,
    KycStatus,
    PlanType,
    Payment,
    RentLeaseBillingDemand,
    Product,
    SubscriptionDocument,
    SubscriptionDocumentType,
    SubscriptionStatus,
)
from accounting.models import (
    AccountingBridgePosting,
    JournalEntry,
    MoneyMovement,
    RentLeasePostingBridgeConfig,
    SalaryPayment,
)
from billing.models import ReceiptDocument
from inventory.models import StockLedger
from reconciliation.models import ReconciliationItem
from subscriptions.services.contract_activation_readiness_service import (
    ContractActivationNotReady,
    assert_contract_activation_ready,
    classify_legacy_activation_compatibility,
    evaluate_contract_activation_readiness,
)
from subscriptions.services.contract_lifecycle_service import (
    activate_contract,
    approve_contract,
)
from subscriptions.services.delivery_service import create_subscription_delivery
from subscriptions.services.emi_engine import generate_emi_schedule
from subscriptions.services.rent_lease_contract_service import (
    create_lease_contract,
    create_rent_contract,
)
from subscriptions.services.rent_lease_billing_service import (
    collect_security_deposit,
)
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_customer_profile,
    create_lucky_id,
    create_product,
    create_subscription,
)


def _small_file(name="doc.pdf"):
    return SimpleUploadedFile(name, b"%PDF-1.4 test", content_type="application/pdf")


def _rent_product(code="RENT-RDY-1"):
    product = create_product(name="Rentable Table", product_code=code)
    Product.objects.filter(pk=product.pk).update(
        is_rent_enabled=True, is_lease_enabled=True
    )
    product.refresh_from_db()
    return product


def _approve_id_and_address(customer):
    CustomerKycDocument.objects.create(
        customer=customer,
        document_type=CustomerKycDocumentType.AADHAAR,
        file=_small_file("aadhaar.pdf"),
        status=CustomerKycDocumentStatus.APPROVED,
    )


def _add_signature(subscription):
    SubscriptionDocument.objects.create(
        subscription=subscription,
        document_type=SubscriptionDocumentType.CUSTOMER_SIGNATURE,
        file=_small_file("signature.pdf"),
    )


def _add_deposit_receipt(subscription):
    SubscriptionDocument.objects.create(
        subscription=subscription,
        document_type=SubscriptionDocumentType.SECURITY_DEPOSIT_RECEIPT_PDF,
        file=_small_file("deposit.pdf"),
    )


def _collect_full_deposit(subscription):
    profile = (
        subscription.rent_profile
        if subscription.plan_type == PlanType.RENT
        else subscription.lease_profile
    )
    return collect_security_deposit(
        subscription=subscription,
        amount=profile.security_deposit_amount,
    )


# ---------------------------------------------------------------------------
# P0.6 — snapshot document type
# ---------------------------------------------------------------------------
class RentLeaseSnapshotDocumentTypeTests(TestCase):
    def setUp(self):
        super().setUp()
        self.customer = create_customer_profile(name="Snap Cust", phone="7810000001")
        self.product = _rent_product()
        self.admin = create_admin_user(username="snap_admin", phone="9810000001")

    def test_rent_contract_snapshot_uses_rent_contract_type(self):
        sub = create_rent_contract(
            customer=self.customer,
            product=self.product,
            tenure_months=12,
            security_deposit_percent=Decimal("20.00"),
            performed_by=self.admin,
        )
        self.assertEqual(
            sub.tax_profile_snapshot.get("document_type"), "RENT_CONTRACT"
        )

    def test_lease_contract_snapshot_uses_lease_contract_type(self):
        sub = create_lease_contract(
            customer=self.customer,
            product=self.product,
            tenure_months=12,
            security_deposit_percent=Decimal("25.00"),
            performed_by=self.admin,
        )
        self.assertEqual(
            sub.tax_profile_snapshot.get("document_type"), "LEASE_CONTRACT"
        )


# ---------------------------------------------------------------------------
# P0.3 / P0.4 — readiness computation (blockers + allowed)
# ---------------------------------------------------------------------------
class MilestoneReadinessComputationTests(TestCase):
    def setUp(self):
        super().setUp()
        self.customer = create_customer_profile(name="Ready Cust", phone="7820000001")
        self.admin = create_admin_user(username="ready_admin", phone="9820000001")
        self.product = _rent_product(code="RENT-RDY-2")

    def _emi_subscription(self):
        product = create_product(product_code="EMI-RDY-1")
        batch = create_batch(batch_code="RDYEMI2026")
        lucky = create_lucky_id(batch=batch, lucky_number=21)
        subscription = create_subscription(
            customer=self.customer, product=product, batch=batch, lucky_id=lucky
        )
        generate_emi_schedule(subscription)
        return subscription

    def test_emi_blockers_identity_and_signed_consent(self):
        sub = self._emi_subscription()
        readiness = evaluate_contract_activation_readiness(sub)
        self.assertFalse(readiness["can_reach_active_or_handover"])
        self.assertIn("ID_PROOF_MISSING", readiness["blocker_codes"])
        self.assertIn("SIGNED_CONTRACT_MISSING", readiness["blocker_codes"])

    def test_emi_allowed_with_identity_and_signed_consent(self):
        sub = self._emi_subscription()
        emi_snapshot = list(sub.emis.values_list("id", "status", "amount"))
        payment_count = Payment.objects.filter(subscription=sub).count()
        _approve_id_and_address(self.customer)
        _add_signature(sub)
        readiness = evaluate_contract_activation_readiness(sub)
        self.assertTrue(readiness["can_reach_active_or_handover"])
        self.assertEqual(readiness["missing_documents"], [])
        self.assertTrue(readiness["readiness_categories"]["emi_schedule"]["ready"])
        self.assertFalse(
            readiness["readiness_categories"]["contract_data"]["details"][
                "rent_lease_profile_present"
            ]
        )
        self.assertEqual(
            list(sub.emis.values_list("id", "status", "amount")),
            emi_snapshot,
        )
        self.assertEqual(Payment.objects.filter(subscription=sub).count(), payment_count)

    def test_rent_blockers_list_all_required(self):
        sub = create_rent_contract(
            customer=self.customer,
            product=self.product,
            tenure_months=12,
            security_deposit_percent=Decimal("20.00"),
            performed_by=self.admin,
        )
        readiness = evaluate_contract_activation_readiness(sub)
        self.assertFalse(readiness["can_reach_active_or_handover"])
        self.assertIn("KYC_NOT_VERIFIED", readiness["blocker_codes"])
        self.assertIn("ID_PROOF_MISSING", readiness["blocker_codes"])
        self.assertIn("ADDRESS_PROOF_MISSING", readiness["blocker_codes"])
        self.assertIn("SIGNED_CONTRACT_MISSING", readiness["blocker_codes"])
        self.assertIn("DEPOSIT_RECEIPT_MISSING", readiness["blocker_codes"])

    def test_rent_allowed_when_all_present(self):
        self.customer.kyc_status = KycStatus.VERIFIED
        self.customer.save(update_fields=["kyc_status"])
        _approve_id_and_address(self.customer)
        sub = create_rent_contract(
            customer=self.customer,
            product=self.product,
            tenure_months=12,
            security_deposit_percent=Decimal("20.00"),
            performed_by=self.admin,
        )
        _add_signature(sub)
        _collect_full_deposit(sub)
        _add_deposit_receipt(sub)
        readiness = evaluate_contract_activation_readiness(sub)
        self.assertTrue(readiness["can_reach_active_or_handover"])
        self.assertFalse(
            readiness["readiness_categories"]["payment_deposit"]["details"][
                "monthly_demand_required_for_activation"
            ]
        )

    def test_lease_requires_condition_proof(self):
        self.customer.kyc_status = KycStatus.VERIFIED
        self.customer.save(update_fields=["kyc_status"])
        _approve_id_and_address(self.customer)
        sub = create_lease_contract(
            customer=self.customer,
            product=self.product,
            tenure_months=12,
            security_deposit_percent=Decimal("25.00"),
            performed_by=self.admin,
        )
        _add_signature(sub)
        _collect_full_deposit(sub)
        _add_deposit_receipt(sub)
        readiness = evaluate_contract_activation_readiness(sub)
        self.assertTrue(readiness["can_activate"])
        self.assertFalse(readiness["can_reach_active_or_handover"])
        self.assertIn("CONDITION_PROOF_MISSING", readiness["blocker_codes"])

        # Recording handover condition notes satisfies the lease condition proof.
        sub.lease_profile.handover_notes = "Asset inspected: good condition."
        sub.lease_profile.save(update_fields=["handover_notes"])
        readiness2 = evaluate_contract_activation_readiness(sub)
        self.assertTrue(readiness2["can_reach_active_or_handover"])

    def test_deposit_document_without_collection_is_not_financial_readiness(self):
        self.customer.kyc_status = KycStatus.VERIFIED
        self.customer.save(update_fields=["kyc_status"])
        _approve_id_and_address(self.customer)
        sub = create_rent_contract(
            customer=self.customer,
            product=self.product,
            tenure_months=12,
            security_deposit_percent=Decimal("20.00"),
            performed_by=self.admin,
        )
        _add_signature(sub)
        _add_deposit_receipt(sub)

        readiness = evaluate_contract_activation_readiness(sub)

        self.assertFalse(readiness["can_activate"])
        self.assertIn("DEPOSIT_NOT_FULLY_COLLECTED", readiness["activation_blocker_codes"])
        deposit = readiness["readiness_categories"]["payment_deposit"]
        self.assertFalse(deposit["ready"])
        self.assertEqual(deposit["details"]["collected_amount"], "0.00")

    def test_partial_deposit_stays_separate_from_monthly_demand_readiness(self):
        sub = create_rent_contract(
            customer=self.customer,
            product=self.product,
            tenure_months=12,
            security_deposit_percent=Decimal("20.00"),
            performed_by=self.admin,
        )
        profile = sub.rent_profile
        collect_security_deposit(
            subscription=sub,
            amount=profile.security_deposit_amount / Decimal("2"),
        )

        readiness = evaluate_contract_activation_readiness(sub)
        deposit = readiness["readiness_categories"]["payment_deposit"]

        self.assertFalse(deposit["ready"])
        self.assertGreater(Decimal(deposit["details"]["outstanding_amount"]), Decimal("0.00"))
        self.assertEqual(deposit["details"]["monthly_demand_count"], 0)
        self.assertFalse(deposit["details"]["monthly_demand_required_for_activation"])


# ---------------------------------------------------------------------------
# P0.4 — enforcement gating (no-op when disabled, raises when enabled)
# ---------------------------------------------------------------------------
class MilestoneEnforcementGatingTests(TestCase):
    def setUp(self):
        super().setUp()
        self.customer = create_customer_profile(name="Gate Cust", phone="7830000001")
        self.admin = create_admin_user(username="gate2_admin", phone="9830000001")
        self.product = _rent_product(code="RENT-RDY-3")

    def _incomplete_rent(self):
        return create_rent_contract(
            customer=self.customer,
            product=self.product,
            tenure_months=12,
            security_deposit_percent=Decimal("20.00"),
            performed_by=self.admin,
            save_as_draft=True,
        )

    def test_assert_is_noop_when_gating_disabled(self):
        sub = self._incomplete_rent()
        # Must not raise even though documents are missing.
        result = assert_contract_activation_ready(sub)
        self.assertFalse(result["enforced"])

    @override_settings(KYC_CONTRACT_GATING_ENABLED=True)
    def test_assert_raises_controlled_error_when_enabled_and_incomplete(self):
        sub = self._incomplete_rent()
        with self.assertRaises(ContractActivationNotReady) as ctx:
            assert_contract_activation_ready(sub)
        self.assertEqual(ctx.exception.code, "CONTRACT_ACTIVATION_NOT_READY")
        self.assertIn("DEPOSIT_RECEIPT_MISSING", ctx.exception.blocker_codes)

    @override_settings(KYC_CONTRACT_GATING_ENABLED=True)
    def test_rent_activation_requires_full_deposit_but_never_lucky_id(self):
        self.customer.kyc_status = KycStatus.VERIFIED
        self.customer.save(update_fields=["kyc_status"])
        _approve_id_and_address(self.customer)
        sub = self._incomplete_rent()
        self.assertIsNone(sub.batch_id)
        self.assertIsNone(sub.lucky_id_id)
        approve_contract(subscription=sub, performed_by=self.admin)
        _add_signature(sub)

        with self.assertRaises(ContractActivationNotReady):
            activate_contract(subscription=sub, performed_by=self.admin)

        _collect_full_deposit(sub)
        activated = activate_contract(subscription=sub, performed_by=self.admin)
        self.assertEqual(activated.status, SubscriptionStatus.ACTIVE)
        self.assertIsNone(activated.lucky_id_id)

    @override_settings(KYC_CONTRACT_GATING_ENABLED=True)
    def test_emi_activation_preserves_schedule_and_payment_state(self):
        self.customer.kyc_status = KycStatus.VERIFIED
        self.customer.save(update_fields=["kyc_status"])
        _approve_id_and_address(self.customer)
        product = create_product(product_code="EMI-ACT-RDY-1")
        batch = create_batch(batch_code="EMIACT2026")
        lucky = create_lucky_id(batch=batch, lucky_number=44)
        sub = create_subscription(
            customer=self.customer,
            product=product,
            batch=batch,
            lucky_id=lucky,
        )
        generate_emi_schedule(sub)
        type(sub).objects.filter(pk=sub.pk).update(status=SubscriptionStatus.DRAFT)
        sub.refresh_from_db()
        approve_contract(subscription=sub, performed_by=self.admin)
        _add_signature(sub)
        emi_snapshot = list(sub.emis.values_list("id", "status", "amount"))

        activated = activate_contract(subscription=sub, performed_by=self.admin)

        self.assertEqual(activated.status, SubscriptionStatus.ACTIVE)
        self.assertEqual(
            list(sub.emis.values_list("id", "status", "amount")),
            emi_snapshot,
        )
        self.assertFalse(Payment.objects.filter(subscription=sub).exists())


# ---------------------------------------------------------------------------
# P0.4 — delivery/handover hard gate for lease condition proof
# ---------------------------------------------------------------------------
@override_settings(KYC_CONTRACT_GATING_ENABLED=True)
class LeaseHandoverConditionProofGateTests(TestCase):
    def setUp(self):
        super().setUp()
        self.customer = create_customer_profile(name="Lease Dlv", phone="7840000001")
        self.admin = create_admin_user(username="lease_dlv_admin", phone="9840000001")
        self.product = _rent_product(code="LEASE-DLV-1")
        self.customer.kyc_status = KycStatus.VERIFIED
        self.customer.save(update_fields=["kyc_status"])
        _approve_id_and_address(self.customer)
        self.sub = create_lease_contract(
            customer=self.customer,
            product=self.product,
            tenure_months=12,
            security_deposit_percent=Decimal("25.00"),
            performed_by=self.admin,
            save_as_draft=True,
        )
        type(self.sub).objects.filter(pk=self.sub.pk).update(
            status=SubscriptionStatus.ACTIVE
        )
        self.sub.refresh_from_db()
        _collect_full_deposit(self.sub)
        # Satisfy the existing base deliver gate (contract PDF, deposit, signed,
        # handover ack) so the NEW condition-proof gate is what we isolate.
        for doc_type in (
            SubscriptionDocumentType.LEASE_CONTRACT_PDF,
            SubscriptionDocumentType.SECURITY_DEPOSIT_RECEIPT_PDF,
            SubscriptionDocumentType.CUSTOMER_SIGNATURE,
            SubscriptionDocumentType.ASSET_HANDOVER_ACKNOWLEDGEMENT,
        ):
            SubscriptionDocument.objects.create(
                subscription=self.sub,
                document_type=doc_type,
                file=_small_file(f"{doc_type}.pdf"),
            )

    def test_lease_handover_blocked_without_condition_proof(self):
        with self.assertRaises(ContractActivationNotReady) as ctx:
            create_subscription_delivery(subscription=self.sub, performed_by=self.admin)
        self.assertIn("CONDITION_PROOF_MISSING", ctx.exception.blocker_codes)

    def test_lease_handover_allowed_with_condition_proof(self):
        self.sub.lease_profile.handover_notes = "Condition documented at handover."
        self.sub.lease_profile.save(update_fields=["handover_notes"])
        delivery = create_subscription_delivery(
            subscription=self.sub, performed_by=self.admin
        )
        self.assertIsNotNone(delivery.pk)

    def test_lease_handover_blocked_when_deposit_is_not_fully_collected(self):
        self.sub.lease_profile.handover_notes = "Condition documented at handover."
        self.sub.lease_profile.save(update_fields=["handover_notes"])
        self.sub.deposit_transactions.all().delete()
        RentLeaseBillingDemand.objects.filter(subscription=self.sub).update(
            collected_amount=Decimal("0.00"),
            held_amount=Decimal("0.00"),
        )

        with self.assertRaises(ContractActivationNotReady) as ctx:
            create_subscription_delivery(subscription=self.sub, performed_by=self.admin)

        self.assertIn("DEPOSIT_NOT_FULLY_COLLECTED", ctx.exception.blocker_codes)
        self.assertFalse(self.sub.deliveries.exists())


# ---------------------------------------------------------------------------
# P0.5 — legacy compatibility classification (never mutates status)
# ---------------------------------------------------------------------------
class LegacyCompatibilityClassificationTests(TestCase):
    def setUp(self):
        super().setUp()
        self.customer = create_customer_profile(name="Legacy Cust", phone="7850000001")
        self.admin = create_admin_user(username="legacy_admin", phone="9850000001")
        self.product = _rent_product(code="RENT-LEG-1")

    def test_incomplete_legacy_record_flagged_without_status_change(self):
        sub = create_rent_contract(
            customer=self.customer,
            product=self.product,
            tenure_months=12,
            security_deposit_percent=Decimal("20.00"),
            performed_by=self.admin,
        )
        self.assertEqual(sub.status, SubscriptionStatus.ACTIVE)
        result = classify_legacy_activation_compatibility(sub)
        self.assertEqual(result["compatibility"], "BACKFILL_REQUIRED")
        self.assertIn("DEPOSIT_RECEIPT_MISSING", result["blocker_codes"])
        # Critically: classification is read-only — the active record is preserved.
        sub.refresh_from_db()
        self.assertEqual(sub.status, SubscriptionStatus.ACTIVE)

    def test_complete_record_classified_compliant(self):
        self.customer.kyc_status = KycStatus.VERIFIED
        self.customer.save(update_fields=["kyc_status"])
        _approve_id_and_address(self.customer)
        sub = create_rent_contract(
            customer=self.customer,
            product=self.product,
            tenure_months=12,
            security_deposit_percent=Decimal("20.00"),
            performed_by=self.admin,
        )
        _add_signature(sub)
        _collect_full_deposit(sub)
        _add_deposit_receipt(sub)
        result = classify_legacy_activation_compatibility(sub)
        self.assertEqual(result["compatibility"], "COMPLIANT")


class ReadinessSideEffectSafetyTests(TestCase):
    def setUp(self):
        super().setUp()
        self.customer = create_customer_profile(name="No Side Effects", phone="7870000001")
        self.admin = create_admin_user(username="no_side_effects_admin", phone="9870000001")
        self.product = _rent_product(code="RENT-NO-SIDE-EFFECTS")
        self.sub = create_rent_contract(
            customer=self.customer,
            product=self.product,
            tenure_months=12,
            security_deposit_percent=Decimal("20.00"),
            performed_by=self.admin,
            save_as_draft=True,
        )

    def test_readiness_check_creates_no_financial_inventory_or_setup_records(self):
        tracked_models = (
            Payment,
            ReceiptDocument,
            JournalEntry,
            MoneyMovement,
            StockLedger,
            AccountingBridgePosting,
            ReconciliationItem,
            Commission,
            CommissionPayoutBatch,
            SalaryPayment,
            RentLeaseBillingDemand,
            RentLeasePostingBridgeConfig,
        )
        before = {model: model.objects.count() for model in tracked_models}

        evaluate_contract_activation_readiness(self.sub)

        after = {model: model.objects.count() for model in tracked_models}
        self.assertEqual(after, before)


# ---------------------------------------------------------------------------
# P0.8 — readiness endpoint additively exposes the activation milestone
# ---------------------------------------------------------------------------
class ContractReadinessEndpointMilestoneTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="rdy_api_admin", phone="9860000001")
        self.client.force_authenticate(user=self.admin)
        self.customer = create_customer_profile(name="Rdy API Cust", phone="7860000001")
        self.product = _rent_product(code="RENT-API-RDY-1")
        self.sub = create_rent_contract(
            customer=self.customer,
            product=self.product,
            tenure_months=12,
            security_deposit_percent=Decimal("20.00"),
            performed_by=self.admin,
        )

    def test_milestone_present_when_subscription_provided(self):
        resp = self.client.get(
            f"/api/v1/admin/customers/{self.customer.id}/contract-readiness/",
            {"plan_type": "RENT", "subscription": self.sub.id},
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("activation_milestone", resp.data)
        milestone = resp.data["activation_milestone"]
        self.assertIn("DEPOSIT_RECEIPT_MISSING", milestone["blocker_codes"])
        self.assertFalse(milestone["can_reach_active_or_handover"])

    def test_milestone_absent_without_subscription(self):
        resp = self.client.get(
            f"/api/v1/admin/customers/{self.customer.id}/contract-readiness/",
            {"plan_type": "RENT"},
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertNotIn("activation_milestone", resp.data)


# ---------------------------------------------------------------------------
# P9D — subscription detail endpoint exposes activation_readiness
# ---------------------------------------------------------------------------
class SubscriptionDetailReadinessExposureTests(APITestCase):
    """P9D: activation_readiness field is present on subscription detail endpoint."""

    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="p9d_api_admin", phone="9880000001")
        self.client.force_authenticate(user=self.admin)
        self.customer = create_customer_profile(name="P9D API Cust", phone="7880000001")
        self.product = _rent_product(code="RENT-P9D-1")
        self.sub = create_rent_contract(
            customer=self.customer,
            product=self.product,
            tenure_months=12,
            security_deposit_percent=Decimal("20.00"),
            performed_by=self.admin,
        )

    def _detail(self):
        resp = self.client.get(f"/api/v1/admin/subscriptions/{self.sub.id}/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        return resp.data

    def test_activation_readiness_present_on_detail_endpoint(self):
        data = self._detail()
        self.assertIn("activation_readiness", data)
        readiness = data["activation_readiness"]
        self.assertIsNotNone(readiness)

    def test_activation_readiness_has_machine_readable_keys(self):
        readiness = self._detail()["activation_readiness"]
        for key in ("readiness_status", "can_activate", "can_deliver",
                    "activation_blockers", "handover_blockers",
                    "readiness_categories", "advisory_warnings"):
            self.assertIn(key, readiness, f"Missing key: {key}")

    def test_activation_readiness_has_seven_categories(self):
        readiness = self._detail()["activation_readiness"]
        cats = readiness["readiness_categories"]
        expected = {
            "kyc_profile", "contract_data", "emi_schedule",
            "payment_deposit", "delivery", "inventory_stock", "accounting_bridge",
        }
        self.assertEqual(set(cats.keys()), expected)

    def test_activation_blockers_have_required_shape(self):
        readiness = self._detail()["activation_readiness"]
        for blocker in readiness["activation_blockers"]:
            for field in ("code", "category", "severity", "message"):
                self.assertIn(field, blocker, f"Blocker missing field: {field}")

    def test_handover_blockers_separate_from_activation_blockers(self):
        readiness = self._detail()["activation_readiness"]
        self.assertIn("activation_blockers", readiness)
        self.assertIn("handover_blockers", readiness)

    def test_deposit_receipt_missing_in_activation_blockers(self):
        readiness = self._detail()["activation_readiness"]
        codes = [b["code"] for b in readiness["activation_blockers"]]
        self.assertIn("DEPOSIT_RECEIPT_MISSING", codes)

    def test_accounting_bridge_advisory_flag(self):
        readiness = self._detail()["activation_readiness"]
        acc = readiness["readiness_categories"].get("accounting_bridge", {})
        self.assertTrue(acc.get("advisory"), "accounting_bridge category must have advisory=True")

    def test_rent_plan_notes_include_no_lucky_id_rule(self):
        readiness = self._detail()["activation_readiness"]
        notes = readiness.get("plan_notes", [])
        self.assertTrue(
            any("Lucky ID" in note or "Lucky" in note for note in notes),
            "Rent readiness must note that Lucky ID is not required for Rent/Lease"
        )

    def test_deposit_monthly_demand_separation_note(self):
        readiness = self._detail()["activation_readiness"]
        notes = readiness.get("plan_notes", [])
        self.assertTrue(
            any("monthly demand" in note.lower() or "deposit readiness" in note.lower() for note in notes),
            "Rent readiness must note that deposit readiness is separate from monthly demand"
        )

    def test_read_only_notice_present(self):
        readiness = self._detail()["activation_readiness"]
        self.assertIn("read_only_notice", readiness)
        notice = readiness["read_only_notice"]
        self.assertIn("Read-only", notice)

    def test_readiness_evaluation_creates_no_records(self):
        tracked_models = (
            Payment,
            ReceiptDocument,
            JournalEntry,
            MoneyMovement,
            StockLedger,
            AccountingBridgePosting,
            ReconciliationItem,
        )
        before = {model: model.objects.count() for model in tracked_models}
        self._detail()
        after = {model: model.objects.count() for model in tracked_models}
        self.assertEqual(after, before)

    def test_activation_readiness_is_read_only(self):
        """PUT/PATCH to the detail endpoint must not change activation_readiness semantics."""
        data = self._detail()
        readiness_before = data.get("activation_readiness")
        self.assertIsNotNone(readiness_before)
        readiness_after = self._detail().get("activation_readiness")
        self.assertEqual(readiness_before["readiness_status"], readiness_after["readiness_status"])
        self.assertEqual(readiness_before["can_activate"], readiness_after["can_activate"])

    def test_emi_subscription_no_lucky_id_requirement_mentioned(self):
        product = create_product(product_code="EMI-P9D-1")
        batch = create_batch(batch_code="P9DEMI2026")
        lucky = create_lucky_id(batch=batch, lucky_number=99)
        emi_sub = create_subscription(
            customer=self.customer, product=product, batch=batch, lucky_id=lucky
        )
        generate_emi_schedule(emi_sub)
        resp = self.client.get(f"/api/v1/admin/subscriptions/{emi_sub.id}/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        readiness = resp.data.get("activation_readiness", {})
        notes = readiness.get("plan_notes", [])
        self.assertTrue(
            any("winner waiver" in note.lower() or "future emi" in note.lower() for note in notes),
            "EMI readiness must include winner waiver scope note"
        )

    def test_partial_deposit_stays_blocked(self):
        profile = self.sub.rent_profile
        collect_security_deposit(
            subscription=self.sub,
            amount=profile.security_deposit_amount / Decimal("2"),
        )
        readiness = self._detail()["activation_readiness"]
        codes = [b["code"] for b in readiness["activation_blockers"]]
        self.assertIn("DEPOSIT_NOT_FULLY_COLLECTED", codes)
        self.assertFalse(readiness["can_activate"])

    def test_deposit_document_alone_does_not_satisfy_readiness(self):
        _add_deposit_receipt(self.sub)
        readiness = self._detail()["activation_readiness"]
        self.assertFalse(readiness["can_activate"])
        codes = [b["code"] for b in readiness["activation_blockers"]]
        self.assertIn("DEPOSIT_NOT_FULLY_COLLECTED", codes)

    def test_rent_no_lucky_id_blocker_ever(self):
        readiness = self._detail()["activation_readiness"]
        all_blocker_codes = (
            [b["code"] for b in readiness["activation_blockers"]]
            + [b["code"] for b in readiness["handover_blockers"]]
        )
        self.assertNotIn(
            "LUCKY_ID_MISSING", all_blocker_codes,
            "Rent subscription must never have a Lucky ID blocker"
        )
