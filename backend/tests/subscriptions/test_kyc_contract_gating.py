"""Tests for the additive KYC / document readiness contract gate.

Covers (per spec):
* direct sale still works without KYC
* EMI activation blocked when KYC missing / allowed when verified
* rent activation blocked when ID/address proof missing
* lease activation blocked when required proof missing
* delivery/handover blocked when KYC or handover document missing
* exception approval requires an admin and a reason
* a controlled HTTP 400 (not a 500) is returned through the API
* the gate is non-breaking when disabled (default)
"""
from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from subscriptions.models import (
    AuditLog,
    CustomerKycDocument,
    CustomerKycDocumentStatus,
    CustomerKycDocumentType,
    KycDocumentCategory,
    KycStatus,
    PlanType,
    Product,
    SubscriptionDocument,
    SubscriptionDocumentType,
    SubscriptionStatus,
)
from subscriptions.services.contract_lifecycle_service import activate_contract
from subscriptions.services.customer_service import exception_approve_kyc
from subscriptions.services.delivery_service import create_subscription_delivery
from subscriptions.services.emi_engine import generate_emi_schedule
from subscriptions.services.kyc_readiness_service import (
    KycGateError,
    evaluate_kyc_readiness,
    get_contract_kyc_readiness,
)
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


def _rent_product(code="RENT-PROD-1"):
    product = create_product(name="Rentable Sofa", product_code=code)
    Product.objects.filter(pk=product.pk).update(
        is_rent_enabled=True, is_lease_enabled=True
    )
    product.refresh_from_db()
    return product


def _approve_id_and_address(customer):
    """Single approved Aadhaar -> infers both ID and address proof."""
    CustomerKycDocument.objects.create(
        customer=customer,
        document_type=CustomerKycDocumentType.AADHAAR,
        file=_small_file("aadhaar.pdf"),
        status=CustomerKycDocumentStatus.APPROVED,
    )


class KycReadinessComputationTests(TestCase):
    def setUp(self):
        super().setUp()
        self.customer = create_customer_profile(name="Readiness Cust", phone="7100000001")

    def test_direct_sale_is_never_gated(self):
        readiness = get_contract_kyc_readiness(self.customer, "DIRECT_SALE")
        self.assertTrue(readiness["is_direct_sale"])
        self.assertTrue(readiness["can_activate"])
        self.assertTrue(readiness["can_deliver"])
        self.assertEqual(readiness["missing_documents"], [])
        self.assertEqual(readiness["blocker_codes"], [])

    def test_customer_level_action_readiness_keeps_low_risk_actions_open(self):
        readiness = evaluate_kyc_readiness(self.customer, "lead_create")
        self.assertTrue(readiness["ready"])
        self.assertEqual(readiness["status"], "READY")
        self.assertIn("LEAD_CREATE", readiness["allowed_actions"])
        self.assertIn("BROCHURE_ENQUIRY", readiness["allowed_actions"])

    def test_customer_level_action_readiness_blocks_lucky_plan_activation_without_kyc(self):
        readiness = evaluate_kyc_readiness(self.customer, "lucky_plan_activation")
        self.assertFalse(readiness["ready"])
        self.assertEqual(readiness["status"], "BLOCKED")
        self.assertIn("KYC_NOT_VERIFIED", readiness["blockers"])
        self.assertNotIn("LUCKY_PLAN_ACTIVATION", readiness["allowed_actions"])

    def test_rent_readiness_lists_missing_id_and_address(self):
        self.customer.kyc_status = KycStatus.VERIFIED
        self.customer.save(update_fields=["kyc_status"])
        readiness = get_contract_kyc_readiness(self.customer, PlanType.RENT)
        self.assertFalse(readiness["is_direct_sale"])
        self.assertFalse(readiness["can_activate"])
        self.assertIn("ID_PROOF", readiness["missing_documents"])
        self.assertIn("ADDRESS_PROOF", readiness["missing_documents"])

    def test_rent_readiness_passes_activation_with_id_address(self):
        self.customer.kyc_status = KycStatus.VERIFIED
        self.customer.save(update_fields=["kyc_status"])
        _approve_id_and_address(self.customer)
        readiness = get_contract_kyc_readiness(self.customer, PlanType.RENT)
        self.assertTrue(readiness["can_activate"])
        # Contract PDF / handover are still pending so delivery is not ready.
        self.assertFalse(readiness["can_deliver"])

    def test_emi_readiness_lists_missing_id_and_address_at_activate_stage(self):
        self.customer.kyc_status = KycStatus.VERIFIED
        self.customer.save(update_fields=["kyc_status"])
        readiness = get_contract_kyc_readiness(self.customer, PlanType.EMI)
        self.assertFalse(readiness["is_direct_sale"])
        self.assertFalse(readiness["can_activate"])
        self.assertIn("ID_PROOF", readiness["missing_documents"])
        self.assertIn("ADDRESS_PROOF", readiness["missing_documents"])
        id_row = next(r for r in readiness["required_documents"] if r["code"] == "ID_PROOF")
        addr_row = next(r for r in readiness["required_documents"] if r["code"] == "ADDRESS_PROOF")
        self.assertEqual(id_row["stage"], "activate")
        self.assertEqual(addr_row["stage"], "activate")

    def test_pending_upload_is_not_reported_as_verified(self):
        CustomerKycDocument.objects.create(
            customer=self.customer,
            document_type=CustomerKycDocumentType.AADHAAR,
            file=_small_file(),
            status=CustomerKycDocumentStatus.SUBMITTED,
        )
        self.customer.kyc_status = KycStatus.VERIFIED
        self.customer.save(update_fields=["kyc_status"])
        readiness = get_contract_kyc_readiness(self.customer, PlanType.RENT)
        id_row = next(r for r in readiness["required_documents"] if r["code"] == "ID_PROOF")
        self.assertFalse(id_row["present"])
        self.assertEqual(id_row["status"], "PENDING")

    def test_expired_optional_document_blocks_activation(self):
        self.customer.kyc_status = KycStatus.VERIFIED
        self.customer.save(update_fields=["kyc_status"])
        CustomerKycDocument.objects.create(
            customer=self.customer,
            document_type=CustomerKycDocumentType.AADHAAR,
            category=KycDocumentCategory.ID_PROOF,
            file=_small_file("id-proof.pdf"),
            status=CustomerKycDocumentStatus.APPROVED,
        )
        CustomerKycDocument.objects.create(
            customer=self.customer,
            document_type=CustomerKycDocumentType.OTHER,
            category=KycDocumentCategory.ADDRESS_PROOF,
            file=_small_file("address-proof.pdf"),
            status=CustomerKycDocumentStatus.APPROVED,
        )
        CustomerKycDocument.objects.create(
            customer=self.customer,
            document_type=CustomerKycDocumentType.OTHER,
            category=KycDocumentCategory.CUSTOMER_PHOTO,
            file=_small_file("customer-photo.pdf"),
            status=CustomerKycDocumentStatus.APPROVED,
            expiry_date=date.today() - timedelta(days=1),
        )
        readiness = get_contract_kyc_readiness(self.customer, PlanType.RENT)
        self.assertFalse(readiness["can_activate"])
        self.assertIn(KycDocumentCategory.CUSTOMER_PHOTO, readiness["expired_categories"])
        self.assertIn("KYC_DOCUMENT_EXPIRED", readiness["blocker_codes"])

    def test_customer_level_action_readiness_returns_verified_and_expiry_metadata(self):
        self.customer.kyc_status = KycStatus.VERIFIED
        self.customer.kyc_reviewed_at = timezone.now()
        self.customer.save(update_fields=["kyc_status", "kyc_reviewed_at"])
        CustomerKycDocument.objects.create(
            customer=self.customer,
            document_type=CustomerKycDocumentType.AADHAAR,
            category=KycDocumentCategory.ID_PROOF,
            file=_small_file("id-proof.pdf"),
            status=CustomerKycDocumentStatus.APPROVED,
            expiry_date=date.today() + timedelta(days=90),
        )
        readiness = evaluate_kyc_readiness(self.customer, "refund_release")
        self.assertTrue(readiness["ready"])
        self.assertEqual(readiness["status"], "READY")
        self.assertEqual(readiness["kyc_profile_id"], self.customer.pk)
        self.assertIsNotNone(readiness["verified_at"])
        self.assertEqual(readiness["expires_at"], date.today() + timedelta(days=90))


@override_settings(KYC_CONTRACT_GATING_ENABLED=True)
class EmiActivationGateTests(TestCase):
    def setUp(self):
        super().setUp()
        self.customer = create_customer_profile(name="EMI Cust", phone="7200000001")
        self.product = create_product(product_code="EMI-PROD-1")
        self.batch = create_batch(batch_code="EMIGATE2026")
        self.lucky = create_lucky_id(batch=self.batch, lucky_number=7)
        self.admin = create_admin_user(username="emi_gate_admin", phone="9200000001")

    def _approved_emi_subscription(self):
        sub = create_subscription(
            customer=self.customer,
            product=self.product,
            batch=self.batch,
            lucky_id=self.lucky,
            status=SubscriptionStatus.APPROVED,
        )
        generate_emi_schedule(sub)
        return sub

    def test_emi_activation_blocked_when_kyc_missing(self):
        sub = self._approved_emi_subscription()
        with self.assertRaises(KycGateError) as ctx:
            activate_contract(subscription=sub, performed_by=self.admin)
        self.assertEqual(ctx.exception.code, "KYC_REQUIRED")
        self.assertIn("KYC_NOT_VERIFIED", ctx.exception.blocker_codes)
        sub.refresh_from_db()
        self.assertEqual(sub.status, SubscriptionStatus.APPROVED)

    def test_emi_activation_blocked_when_kyc_verified_but_id_address_missing(self):
        # KYC status alone is not enough — ID + address proof also required.
        self.customer.kyc_status = KycStatus.VERIFIED
        self.customer.save(update_fields=["kyc_status"])
        sub = self._approved_emi_subscription()
        with self.assertRaises(KycGateError) as ctx:
            activate_contract(subscription=sub, performed_by=self.admin)
        self.assertEqual(ctx.exception.code, "KYC_REQUIRED")
        self.assertIn("ID_PROOF_MISSING", ctx.exception.blocker_codes)
        self.assertIn("ADDRESS_PROOF_MISSING", ctx.exception.blocker_codes)
        sub.refresh_from_db()
        self.assertEqual(sub.status, SubscriptionStatus.APPROVED)

    def test_emi_activation_allowed_when_kyc_verified_and_id_address_present(self):
        self.customer.kyc_status = KycStatus.VERIFIED
        self.customer.save(update_fields=["kyc_status"])
        _approve_id_and_address(self.customer)
        sub = self._approved_emi_subscription()
        activate_contract(subscription=sub, performed_by=self.admin)
        sub.refresh_from_db()
        self.assertEqual(sub.status, SubscriptionStatus.ACTIVE)

    def test_emi_activation_allowed_with_exception_approval(self):
        exception_approve_kyc(self.customer, reason="VIP walk-in", performed_by=self.admin)
        _approve_id_and_address(self.customer)
        sub = self._approved_emi_subscription()
        activate_contract(subscription=sub, performed_by=self.admin)
        sub.refresh_from_db()
        self.assertEqual(sub.status, SubscriptionStatus.ACTIVE)


@override_settings(KYC_CONTRACT_GATING_ENABLED=True)
class RentLeaseActivationGateTests(TestCase):
    def setUp(self):
        super().setUp()
        self.customer = create_customer_profile(name="Rent Cust", phone="7300000001")
        self.product = _rent_product()
        self.admin = create_admin_user(username="rent_gate_admin", phone="9300000001")

    def test_rent_activation_blocked_when_id_address_proof_missing(self):
        self.customer.kyc_status = KycStatus.VERIFIED
        self.customer.save(update_fields=["kyc_status"])
        with self.assertRaises(KycGateError) as ctx:
            create_rent_contract(
                customer=self.customer,
                product=self.product,
                tenure_months=12,
                security_deposit_percent=Decimal("20.00"),
                performed_by=self.admin,
            )
        self.assertEqual(ctx.exception.code, "KYC_REQUIRED")
        self.assertIn("ID_PROOF_MISSING", ctx.exception.blocker_codes)
        self.assertIn("ADDRESS_PROOF_MISSING", ctx.exception.blocker_codes)

    def test_lease_activation_blocked_when_kyc_not_verified(self):
        with self.assertRaises(KycGateError) as ctx:
            create_lease_contract(
                customer=self.customer,
                product=self.product,
                tenure_months=12,
                security_deposit_percent=Decimal("25.00"),
                performed_by=self.admin,
            )
        self.assertEqual(ctx.exception.code, "KYC_REQUIRED")
        self.assertIn("KYC_NOT_VERIFIED", ctx.exception.blocker_codes)

    def test_rent_activation_allowed_when_id_address_present(self):
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
        self.assertEqual(sub.status, SubscriptionStatus.ACTIVE)

    def test_save_as_draft_is_always_allowed(self):
        # No KYC at all, but a draft must still be creatable.
        sub = create_rent_contract(
            customer=self.customer,
            product=self.product,
            tenure_months=12,
            security_deposit_percent=Decimal("20.00"),
            performed_by=self.admin,
            save_as_draft=True,
        )
        self.assertEqual(sub.status, SubscriptionStatus.DRAFT)


@override_settings(KYC_CONTRACT_GATING_ENABLED=True)
class DeliveryHandoverGateTests(TestCase):
    def setUp(self):
        super().setUp()
        self.customer = create_customer_profile(name="Deliver Cust", phone="7400000001")
        self.product = _rent_product(code="RENT-DLV-1")
        self.admin = create_admin_user(username="dlv_gate_admin", phone="9400000001")
        self.customer.kyc_status = KycStatus.VERIFIED
        self.customer.save(update_fields=["kyc_status"])
        _approve_id_and_address(self.customer)
        # Draft skips the activation gate so we can isolate the delivery gate.
        self.sub = create_rent_contract(
            customer=self.customer,
            product=self.product,
            tenure_months=12,
            security_deposit_percent=Decimal("20.00"),
            performed_by=self.admin,
            save_as_draft=True,
        )

    def test_delivery_blocked_when_handover_document_missing(self):
        with self.assertRaises(KycGateError) as ctx:
            create_subscription_delivery(subscription=self.sub, performed_by=self.admin)
        self.assertEqual(ctx.exception.code, "KYC_REQUIRED")
        self.assertIn("HANDOVER_DOCUMENT_MISSING", ctx.exception.blocker_codes)

    def test_delivery_allowed_when_all_contract_documents_present(self):
        for doc_type in (
            SubscriptionDocumentType.RENT_CONTRACT_PDF,
            SubscriptionDocumentType.SECURITY_DEPOSIT_RECEIPT_PDF,
            SubscriptionDocumentType.CUSTOMER_SIGNATURE,
            SubscriptionDocumentType.ASSET_HANDOVER_ACKNOWLEDGEMENT,
        ):
            SubscriptionDocument.objects.create(
                subscription=self.sub,
                document_type=doc_type,
                file=_small_file(f"{doc_type}.pdf"),
            )
        collect_security_deposit(
            subscription=self.sub,
            amount=self.sub.rent_profile.security_deposit_amount,
        )
        type(self.sub).objects.filter(pk=self.sub.pk).update(
            status=SubscriptionStatus.ACTIVE
        )
        self.sub.refresh_from_db()
        delivery = create_subscription_delivery(
            subscription=self.sub, performed_by=self.admin
        )
        self.assertIsNotNone(delivery.pk)


class ExceptionApprovalTests(TestCase):
    def setUp(self):
        super().setUp()
        self.customer = create_customer_profile(name="Exc Cust", phone="7500000001")
        self.admin = create_admin_user(username="exc_admin", phone="9500000001")

    def test_exception_approval_requires_reason(self):
        with self.assertRaises(DjangoValidationError):
            exception_approve_kyc(self.customer, reason="", performed_by=self.admin)

    def test_exception_approval_requires_actor(self):
        with self.assertRaises(DjangoValidationError):
            exception_approve_kyc(self.customer, reason="ok", performed_by=None)

    def test_exception_approval_records_audit(self):
        exception_approve_kyc(
            self.customer, reason="Manager override", performed_by=self.admin
        )
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.kyc_status, KycStatus.EXCEPTION_APPROVED)
        self.assertTrue(
            AuditLog.objects.filter(
                action_type=AuditLog.ActionType.CUSTOMER_KYC_EXCEPTION_APPROVED,
                object_id=self.customer.pk,
            ).exists()
        )


class GateApiTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="gate_api_admin", phone="9600000001")
        self.client.force_authenticate(user=self.admin)
        self.customer = create_customer_profile(name="Gate API Cust", phone="7600000001")
        self.product = _rent_product(code="RENT-API-1")

    def _rent_payload(self, **overrides):
        payload = {
            "customer": self.customer.id,
            "product": self.product.id,
            "tenure_months": 12,
            "security_deposit_percent": "20.00",
        }
        payload.update(overrides)
        return payload

    @override_settings(KYC_CONTRACT_GATING_ENABLED=True)
    def test_rent_create_returns_controlled_400_not_500(self):
        resp = self.client.post(
            "/api/v1/admin/contracts/rent/", self._rent_payload(), format="json"
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(resp.data.get("code"), "KYC_REQUIRED")
        self.assertIn("ID_PROOF", resp.data.get("missing_documents", []))

    @override_settings(KYC_CONTRACT_GATING_ENABLED=True)
    def test_rent_create_draft_allowed_through_api(self):
        resp = self.client.post(
            "/api/v1/admin/contracts/rent/",
            self._rent_payload(save_as_draft=True),
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

    def test_rent_create_not_blocked_when_gating_disabled(self):
        # Default behaviour (flag off) must remain unchanged / non-breaking.
        resp = self.client.post(
            "/api/v1/admin/contracts/rent/", self._rent_payload(), format="json"
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

    def test_contract_readiness_endpoint(self):
        resp = self.client.get(
            f"/api/v1/admin/customers/{self.customer.id}/contract-readiness/",
            {"plan_type": "RENT"},
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("can_activate", resp.data)
        self.assertIn("missing_documents", resp.data)

    def test_kyc_exception_approve_endpoint_requires_reason(self):
        resp = self.client.post(
            f"/api/v1/admin/customers/{self.customer.id}/kyc-exception-approve/",
            {},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_kyc_exception_approve_endpoint_sets_status(self):
        resp = self.client.post(
            f"/api/v1/admin/customers/{self.customer.id}/kyc-exception-approve/",
            {"reason": "Approved by branch manager"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["kyc_status"], KycStatus.EXCEPTION_APPROVED)
