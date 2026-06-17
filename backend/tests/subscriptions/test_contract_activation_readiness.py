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
    CustomerKycDocument,
    CustomerKycDocumentStatus,
    CustomerKycDocumentType,
    KycStatus,
    PlanType,
    Product,
    SubscriptionDocument,
    SubscriptionDocumentType,
    SubscriptionStatus,
)
from subscriptions.services.contract_activation_readiness_service import (
    ContractActivationNotReady,
    assert_contract_activation_ready,
    classify_legacy_activation_compatibility,
    evaluate_contract_activation_readiness,
)
from subscriptions.services.delivery_service import create_subscription_delivery
from subscriptions.services.rent_lease_contract_service import (
    create_lease_contract,
    create_rent_contract,
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
        return create_subscription(
            customer=self.customer, product=product, batch=batch, lucky_id=lucky
        )

    def test_emi_blockers_identity_and_signed_consent(self):
        sub = self._emi_subscription()
        readiness = evaluate_contract_activation_readiness(sub)
        self.assertFalse(readiness["can_reach_active_or_handover"])
        self.assertIn("ID_PROOF_MISSING", readiness["blocker_codes"])
        self.assertIn("SIGNED_CONTRACT_MISSING", readiness["blocker_codes"])

    def test_emi_allowed_with_identity_and_signed_consent(self):
        sub = self._emi_subscription()
        _approve_id_and_address(self.customer)
        _add_signature(sub)
        readiness = evaluate_contract_activation_readiness(sub)
        self.assertTrue(readiness["can_reach_active_or_handover"])
        self.assertEqual(readiness["missing_documents"], [])

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
        _add_deposit_receipt(sub)
        readiness = evaluate_contract_activation_readiness(sub)
        self.assertTrue(readiness["can_reach_active_or_handover"])

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
        _add_deposit_receipt(sub)
        readiness = evaluate_contract_activation_readiness(sub)
        self.assertFalse(readiness["can_reach_active_or_handover"])
        self.assertIn("CONDITION_PROOF_MISSING", readiness["blocker_codes"])

        # Recording handover condition notes satisfies the lease condition proof.
        sub.lease_profile.handover_notes = "Asset inspected: good condition."
        sub.lease_profile.save(update_fields=["handover_notes"])
        readiness2 = evaluate_contract_activation_readiness(sub)
        self.assertTrue(readiness2["can_reach_active_or_handover"])


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
        _add_deposit_receipt(sub)
        result = classify_legacy_activation_compatibility(sub)
        self.assertEqual(result["compatibility"], "COMPLIANT")


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
