"""P3A tests: Document Vault — model extensions, checklist, verify/reject, access log.

Covers:
* Old SubscriptionDocument rows remain valid after migration (safe defaults)
* Required-document checklist for EMI / RENT / LEASE / direct-sale
* Missing required doc blocks readiness
* Rejected required doc blocks readiness (vault-state blocker)
* Expired required doc blocks readiness
* Verified required doc passes
* Access log created by verify / reject helpers
* verify_document updates verified_by / verified_at
* reject_document updates rejection_reason + verification_status
* Legacy ACTIVE record classification stays read-only (not mutated by vault)
* Direct sale is not blocked by rent/lease document rules
* contract_activation_readiness_service honours REJECTED subscription docs
* document-readiness API endpoint returns correct structure
"""
from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APITestCase

from subscriptions.models import (
    CustomerKycDocument,
    CustomerKycDocumentStatus,
    CustomerKycDocumentType,
    DocumentAccessAction,
    DocumentAccessLevel,
    DocumentAccessLog,
    DocumentSignedStatus,
    DocumentVerificationStatus,
    KycStatus,
    Product,
    SubscriptionDocument,
    SubscriptionDocumentType,
    SubscriptionStatus,
)
from subscriptions.services.contract_activation_readiness_service import (
    evaluate_contract_activation_readiness,
)
from subscriptions.services.document_vault_service import (
    build_required_document_checklist,
    calculate_document_checksum,
    document_is_expired,
    log_document_access,
    reject_document,
    verify_document,
)
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
    return SimpleUploadedFile(name, b"%PDF-1.4 vault test", content_type="application/pdf")


def _rent_product(code="VAULT-RENT-1"):
    product = create_product(name="Vault Table", product_code=code)
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


def _make_doc(subscription, doc_type=SubscriptionDocumentType.CUSTOMER_SIGNATURE, **kwargs):
    return SubscriptionDocument.objects.create(
        subscription=subscription,
        document_type=doc_type,
        file=_small_file(f"{doc_type}.pdf"),
        **kwargs,
    )


# ---------------------------------------------------------------------------
# 1. Safe defaults — old rows remain valid after migration
# ---------------------------------------------------------------------------
class VaultFieldSafeDefaultsTests(TestCase):
    def setUp(self):
        super().setUp()
        self.customer = create_customer_profile(name="Vault Cust", phone="7900000001")
        self.admin = create_admin_user(username="vault_admin1", phone="9900000001")
        product = create_product(product_code="VAULT-EMI-1")
        batch = create_batch(batch_code="VAULTEMI01")
        lucky = create_lucky_id(batch=batch, lucky_number=91)
        self.sub = create_subscription(
            customer=self.customer, product=product, batch=batch, lucky_id=lucky
        )

    def test_new_document_has_safe_vault_defaults(self):
        doc = _make_doc(self.sub)
        self.assertEqual(doc.checksum_sha256, "")
        self.assertIsNone(doc.expires_on)
        self.assertEqual(doc.signed_status, DocumentSignedStatus.UNKNOWN)
        self.assertEqual(doc.access_level, DocumentAccessLevel.INTERNAL)
        self.assertIsNone(doc.verified_by)
        self.assertIsNone(doc.verified_at)
        self.assertEqual(doc.rejection_reason, "")
        self.assertEqual(doc.metadata, {})

    def test_document_reloads_without_error(self):
        doc = _make_doc(self.sub)
        reloaded = SubscriptionDocument.objects.get(pk=doc.pk)
        self.assertEqual(reloaded.signed_status, DocumentSignedStatus.UNKNOWN)
        self.assertEqual(reloaded.access_level, DocumentAccessLevel.INTERNAL)


# ---------------------------------------------------------------------------
# 2. document_is_expired helper
# ---------------------------------------------------------------------------
class DocumentExpiryTests(TestCase):
    def setUp(self):
        super().setUp()
        customer = create_customer_profile(name="Exp Cust", phone="7900000002")
        product = create_product(product_code="VAULT-EXP-1")
        batch = create_batch(batch_code="VAULTEXP01")
        lucky = create_lucky_id(batch=batch, lucky_number=92)
        self.sub = create_subscription(
            customer=customer, product=product, batch=batch, lucky_id=lucky
        )

    def test_no_expiry_never_expired(self):
        doc = _make_doc(self.sub)
        self.assertFalse(document_is_expired(doc))

    def test_future_expiry_not_expired(self):
        doc = _make_doc(self.sub)
        doc.expires_on = date.today() + timedelta(days=30)
        doc.save(update_fields=["expires_on"])
        self.assertFalse(document_is_expired(doc))

    def test_past_expiry_is_expired(self):
        doc = _make_doc(self.sub)
        doc.expires_on = date.today() - timedelta(days=1)
        doc.save(update_fields=["expires_on"])
        self.assertTrue(document_is_expired(doc))

    def test_today_expiry_is_not_expired(self):
        # expires_on is the last valid date (inclusive); expires today = still valid today.
        doc = _make_doc(self.sub)
        doc.expires_on = date.today()
        doc.save(update_fields=["expires_on"])
        self.assertFalse(document_is_expired(doc))


# ---------------------------------------------------------------------------
# 3. verify_document / reject_document
# ---------------------------------------------------------------------------
class VerifyRejectDocumentTests(TestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="vault_admin2", phone="9900000002")
        customer = create_customer_profile(name="VR Cust", phone="7900000003")
        product = create_product(product_code="VAULT-VR-1")
        batch = create_batch(batch_code="VAULTVR01")
        lucky = create_lucky_id(batch=batch, lucky_number=93)
        self.sub = create_subscription(
            customer=customer, product=product, batch=batch, lucky_id=lucky
        )

    def test_verify_document_sets_fields(self):
        doc = _make_doc(self.sub)
        self.assertEqual(doc.verification_status, DocumentVerificationStatus.PENDING)
        verify_document(doc, self.admin, notes="Looks good")
        doc.refresh_from_db()
        self.assertEqual(doc.verification_status, DocumentVerificationStatus.VERIFIED)
        self.assertEqual(doc.verified_by, self.admin)
        self.assertIsNotNone(doc.verified_at)

    def test_verify_creates_access_log(self):
        doc = _make_doc(self.sub)
        verify_document(doc, self.admin)
        log = DocumentAccessLog.objects.filter(
            document=doc, action=DocumentAccessAction.VERIFY
        ).first()
        self.assertIsNotNone(log)
        self.assertEqual(log.user, self.admin)

    def test_reject_document_sets_fields(self):
        doc = _make_doc(self.sub)
        reject_document(doc, self.admin, reason="Blurry scan")
        doc.refresh_from_db()
        self.assertEqual(doc.verification_status, DocumentVerificationStatus.REJECTED)
        self.assertEqual(doc.rejection_reason, "Blurry scan")

    def test_reject_creates_access_log(self):
        doc = _make_doc(self.sub)
        reject_document(doc, self.admin, reason="Invalid")
        log = DocumentAccessLog.objects.filter(
            document=doc, action=DocumentAccessAction.REJECT
        ).first()
        self.assertIsNotNone(log)
        self.assertEqual(log.metadata.get("reason"), "Invalid")


# ---------------------------------------------------------------------------
# 4. log_document_access helper
# ---------------------------------------------------------------------------
class LogDocumentAccessTests(TestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="vault_admin3", phone="9900000003")
        customer = create_customer_profile(name="Log Cust", phone="7900000004")
        product = create_product(product_code="VAULT-LOG-1")
        batch = create_batch(batch_code="VAULTLOG01")
        lucky = create_lucky_id(batch=batch, lucky_number=94)
        self.sub = create_subscription(
            customer=customer, product=product, batch=batch, lucky_id=lucky
        )

    def test_log_creates_entry(self):
        doc = _make_doc(self.sub)
        entry = log_document_access(doc, self.admin, DocumentAccessAction.VIEW)
        self.assertIsNotNone(entry)
        self.assertIsNotNone(entry.pk)
        self.assertEqual(entry.action, DocumentAccessAction.VIEW)
        self.assertEqual(entry.user, self.admin)

    def test_log_with_anonymous_user(self):
        doc = _make_doc(self.sub)
        entry = log_document_access(doc, None, DocumentAccessAction.DOWNLOAD)
        self.assertIsNotNone(entry)
        self.assertIsNone(entry.user)


# ---------------------------------------------------------------------------
# 5. build_required_document_checklist — plan-type requirements
# ---------------------------------------------------------------------------
class ChecklistEmiTests(TestCase):
    def setUp(self):
        super().setUp()
        self.customer = create_customer_profile(name="EMI Checklist", phone="7900000005")
        product = create_product(product_code="VAULT-EMI-2")
        batch = create_batch(batch_code="VAULTEMI02")
        lucky = create_lucky_id(batch=batch, lucky_number=95)
        self.sub = create_subscription(
            customer=self.customer, product=product, batch=batch, lucky_id=lucky
        )

    def test_emi_requires_id_proof_and_signed_contract(self):
        result = build_required_document_checklist(self.sub)
        keys = [item["document_key"] for item in result["required_documents"]]
        self.assertIn("ID_PROOF", keys)
        self.assertIn("SIGNED_CONTRACT", keys)
        # Should not include rent/lease-only docs
        self.assertNotIn("ADDRESS_PROOF", keys)
        self.assertNotIn("DEPOSIT_RECEIPT", keys)

    def test_emi_missing_docs_block_readiness(self):
        result = build_required_document_checklist(self.sub)
        self.assertFalse(result["overall"]["ready"])
        self.assertIn("ID_PROOF_MISSING", result["overall"]["blocker_codes"])
        self.assertIn("SIGNED_CONTRACT_MISSING", result["overall"]["blocker_codes"])

    def test_emi_ready_when_all_present(self):
        _approve_id_and_address(self.customer)
        _make_doc(self.sub, SubscriptionDocumentType.CUSTOMER_SIGNATURE)
        result = build_required_document_checklist(self.sub)
        self.assertTrue(result["overall"]["ready"])
        self.assertEqual(result["overall"]["blocker_codes"], [])


class ChecklistRentTests(TestCase):
    def setUp(self):
        super().setUp()
        self.customer = create_customer_profile(name="Rent Checklist", phone="7900000006")
        self.admin = create_admin_user(username="vault_admin4", phone="9900000004")
        product = _rent_product("VAULT-RENT-2")
        self.sub = create_rent_contract(
            customer=self.customer,
            product=product,
            tenure_months=12,
            security_deposit_percent=Decimal("20.00"),
            performed_by=self.admin,
        )

    def test_rent_requires_id_address_signed_deposit(self):
        result = build_required_document_checklist(self.sub)
        keys = [item["document_key"] for item in result["required_documents"]]
        self.assertIn("ID_PROOF", keys)
        self.assertIn("ADDRESS_PROOF", keys)
        self.assertIn("SIGNED_CONTRACT", keys)
        self.assertIn("DEPOSIT_RECEIPT", keys)

    def test_rent_missing_docs_block_readiness(self):
        result = build_required_document_checklist(self.sub)
        self.assertFalse(result["overall"]["ready"])
        blocker_codes = result["overall"]["blocker_codes"]
        self.assertIn("ID_PROOF_MISSING", blocker_codes)
        self.assertIn("ADDRESS_PROOF_MISSING", blocker_codes)
        self.assertIn("SIGNED_CONTRACT_MISSING", blocker_codes)
        self.assertIn("DEPOSIT_RECEIPT_MISSING", blocker_codes)


class ChecklistLeaseTests(TestCase):
    def setUp(self):
        super().setUp()
        self.customer = create_customer_profile(name="Lease Checklist", phone="7900000007")
        self.admin = create_admin_user(username="vault_admin5", phone="9900000005")
        product = _rent_product("VAULT-LEASE-1")
        self.sub = create_lease_contract(
            customer=self.customer,
            product=product,
            tenure_months=12,
            security_deposit_percent=Decimal("25.00"),
            performed_by=self.admin,
        )

    def test_lease_requires_condition_proof(self):
        result = build_required_document_checklist(self.sub)
        keys = [item["document_key"] for item in result["required_documents"]]
        self.assertIn("ID_PROOF", keys)
        self.assertIn("ADDRESS_PROOF", keys)
        self.assertIn("SIGNED_CONTRACT", keys)
        self.assertIn("DEPOSIT_RECEIPT", keys)
        self.assertIn("CONDITION_PROOF", keys)

    def test_lease_blocks_without_condition_proof(self):
        result = build_required_document_checklist(self.sub)
        self.assertFalse(result["overall"]["ready"])
        self.assertIn("CONDITION_PROOF_MISSING", result["overall"]["blocker_codes"])


class ChecklistDirectSaleServiceTests(TestCase):
    """Verify the direct-sale fast path at service level using a mock plan_type string.

    Subscriptions are constrained to EMI/RENT/LEASE by the model (PlanType choices),
    so we cannot create a DB-backed direct-sale subscription.  The service behaviour
    is exercised by monkeypatching the plan_type attribute on an existing subscription,
    which is safe since the service only reads plan_type without persisting it.
    """

    def setUp(self):
        super().setUp()
        customer = create_customer_profile(name="DS Checklist", phone="7900000008")
        product = create_product(product_code="VAULT-DS-1")
        batch = create_batch(batch_code="VAULTDS001")
        lucky = create_lucky_id(batch=batch, lucky_number=8)
        self.sub = create_subscription(
            customer=customer, product=product, batch=batch, lucky_id=lucky
        )

    def test_direct_sale_plan_type_returns_empty_checklist(self):
        # Temporarily override plan_type to simulate the direct-sale fast path.
        self.sub.plan_type = "DIRECT_SALE_PLAN"
        result = build_required_document_checklist(self.sub)
        self.assertTrue(result["is_direct_sale"])
        self.assertTrue(result["overall"]["ready"])
        self.assertEqual(result["required_documents"], [])


# ---------------------------------------------------------------------------
# 6. Rejected / expired doc counts as blocker in checklist
# ---------------------------------------------------------------------------
class RejectedExpiredBlockerTests(TestCase):
    def setUp(self):
        super().setUp()
        self.customer = create_customer_profile(name="Rej Exp Cust", phone="7900000009")
        self.admin = create_admin_user(username="vault_admin6", phone="9900000006")
        product = create_product(product_code="VAULT-RJ-1")
        batch = create_batch(batch_code="VAULTRJ001")
        lucky = create_lucky_id(batch=batch, lucky_number=99)
        self.sub = create_subscription(
            customer=self.customer, product=product, batch=batch, lucky_id=lucky
        )
        _approve_id_and_address(self.customer)

    def test_rejected_required_doc_blocks_readiness(self):
        doc = _make_doc(self.sub, SubscriptionDocumentType.CUSTOMER_SIGNATURE)
        reject_document(doc, self.admin, reason="Rejected test")
        result = build_required_document_checklist(self.sub)
        self.assertFalse(result["overall"]["ready"])
        rejected_item = next(
            (i for i in result["required_documents"] if i["document_key"] == "SIGNED_CONTRACT"),
            None,
        )
        self.assertIsNotNone(rejected_item)
        self.assertEqual(rejected_item["status"], "REJECTED")

    def test_expired_required_doc_blocks_readiness(self):
        doc = _make_doc(self.sub, SubscriptionDocumentType.CUSTOMER_SIGNATURE)
        doc.expires_on = date.today() - timedelta(days=1)
        doc.save(update_fields=["expires_on"])
        result = build_required_document_checklist(self.sub)
        self.assertFalse(result["overall"]["ready"])
        expired_item = next(
            (i for i in result["required_documents"] if i["document_key"] == "SIGNED_CONTRACT"),
            None,
        )
        self.assertIsNotNone(expired_item)
        self.assertEqual(expired_item["status"], "EXPIRED")

    def test_verified_non_expired_doc_passes(self):
        doc = _make_doc(self.sub, SubscriptionDocumentType.CUSTOMER_SIGNATURE)
        verify_document(doc, self.admin)
        result = build_required_document_checklist(self.sub)
        signed_item = next(
            (i for i in result["required_documents"] if i["document_key"] == "SIGNED_CONTRACT"),
            None,
        )
        self.assertIsNotNone(signed_item)
        self.assertEqual(signed_item["status"], "VERIFIED")
        self.assertIsNone(signed_item["blocker_code"])


# ---------------------------------------------------------------------------
# 7. contract_activation_readiness_service respects vault REJECTED state
# ---------------------------------------------------------------------------
class ActivationReadinessVaultIntegrationTests(TestCase):
    def setUp(self):
        super().setUp()
        self.customer = create_customer_profile(name="ARS Vault", phone="7900000010")
        self.admin = create_admin_user(username="vault_admin7", phone="9900000007")
        self.customer.kyc_status = KycStatus.VERIFIED
        self.customer.save(update_fields=["kyc_status"])
        _approve_id_and_address(self.customer)
        product = _rent_product("VAULT-ARS-1")
        self.sub = create_rent_contract(
            customer=self.customer,
            product=product,
            tenure_months=12,
            security_deposit_percent=Decimal("20.00"),
            performed_by=self.admin,
        )

    def test_rejected_signature_doc_blocks_activation_readiness(self):
        sig_doc = _make_doc(self.sub, SubscriptionDocumentType.CUSTOMER_SIGNATURE)
        _make_doc(self.sub, SubscriptionDocumentType.SECURITY_DEPOSIT_RECEIPT_PDF)
        reject_document(sig_doc, self.admin, reason="Bad scan")
        readiness = evaluate_contract_activation_readiness(self.sub)
        self.assertFalse(readiness["can_reach_active_or_handover"])
        self.assertIn("SIGNED_CONTRACT_REJECTED", readiness["blocker_codes"])

    def test_rejected_deposit_receipt_blocks_activation_readiness(self):
        _make_doc(self.sub, SubscriptionDocumentType.CUSTOMER_SIGNATURE)
        dep_doc = _make_doc(self.sub, SubscriptionDocumentType.SECURITY_DEPOSIT_RECEIPT_PDF)
        reject_document(dep_doc, self.admin, reason="Counterfeit")
        readiness = evaluate_contract_activation_readiness(self.sub)
        self.assertFalse(readiness["can_reach_active_or_handover"])
        self.assertIn("DEPOSIT_RECEIPT_REJECTED", readiness["blocker_codes"])

    def test_verified_docs_allow_activation_readiness(self):
        sig_doc = _make_doc(self.sub, SubscriptionDocumentType.CUSTOMER_SIGNATURE)
        dep_doc = _make_doc(self.sub, SubscriptionDocumentType.SECURITY_DEPOSIT_RECEIPT_PDF)
        verify_document(sig_doc, self.admin)
        verify_document(dep_doc, self.admin)
        readiness = evaluate_contract_activation_readiness(self.sub)
        self.assertTrue(readiness["can_reach_active_or_handover"])
        self.assertEqual(readiness["blocker_codes"], [])


# ---------------------------------------------------------------------------
# 8. Legacy ACTIVE record status is never mutated by vault checks
# ---------------------------------------------------------------------------
class LegacyActiveMutationSafetyTests(TestCase):
    def setUp(self):
        super().setUp()
        self.customer = create_customer_profile(name="Legacy Safe", phone="7900000011")
        self.admin = create_admin_user(username="vault_admin8", phone="9900000008")
        product = _rent_product("VAULT-LEG-1")
        self.sub = create_rent_contract(
            customer=self.customer,
            product=product,
            tenure_months=12,
            security_deposit_percent=Decimal("20.00"),
            performed_by=self.admin,
        )

    def test_vault_checklist_does_not_mutate_subscription_status(self):
        original_status = self.sub.status
        build_required_document_checklist(self.sub)
        self.sub.refresh_from_db()
        self.assertEqual(self.sub.status, original_status)

    def test_readiness_evaluation_does_not_mutate_subscription_status(self):
        original_status = self.sub.status
        evaluate_contract_activation_readiness(self.sub)
        self.sub.refresh_from_db()
        self.assertEqual(self.sub.status, original_status)


# ---------------------------------------------------------------------------
# 9. document-readiness API endpoint
# ---------------------------------------------------------------------------
class DocumentReadinessEndpointTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="vault_api_admin", phone="9900000009")
        self.client.force_authenticate(user=self.admin)
        self.customer = create_customer_profile(name="API Vault", phone="7900000012")
        product = _rent_product("VAULT-API-1")
        self.sub = create_rent_contract(
            customer=self.customer,
            product=product,
            tenure_months=12,
            security_deposit_percent=Decimal("20.00"),
            performed_by=self.admin,
        )

    def test_endpoint_returns_200(self):
        resp = self.client.get(
            f"/api/v1/admin/subscriptions/{self.sub.id}/document-readiness/"
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_endpoint_has_required_fields(self):
        resp = self.client.get(
            f"/api/v1/admin/subscriptions/{self.sub.id}/document-readiness/"
        )
        data = resp.data
        self.assertIn("subscription_id", data)
        self.assertIn("plan_type", data)
        self.assertIn("required_documents", data)
        self.assertIn("overall", data)
        self.assertIn("ready", data["overall"])
        self.assertIn("blocker_codes", data["overall"])

    def test_endpoint_blocks_when_docs_missing(self):
        resp = self.client.get(
            f"/api/v1/admin/subscriptions/{self.sub.id}/document-readiness/"
        )
        self.assertFalse(resp.data["overall"]["ready"])
        self.assertIn("DEPOSIT_RECEIPT_MISSING", resp.data["overall"]["blocker_codes"])

    def test_each_item_has_vault_fields(self):
        resp = self.client.get(
            f"/api/v1/admin/subscriptions/{self.sub.id}/document-readiness/"
        )
        for item in resp.data["required_documents"]:
            self.assertIn("document_key", item)
            self.assertIn("label", item)
            self.assertIn("required", item)
            self.assertIn("status", item)
            self.assertIn("signed_status", item)
            self.assertIn("access_level", item)
            self.assertIn("expires_on", item)

    def test_endpoint_returns_plan_type(self):
        resp = self.client.get(
            f"/api/v1/admin/subscriptions/{self.sub.id}/document-readiness/"
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn(resp.data["plan_type"], {"EMI", "RENT", "LEASE"})
        self.assertEqual(resp.data["subscription_id"], self.sub.id)


# ---------------------------------------------------------------------------
# 10. calculate_document_checksum
# ---------------------------------------------------------------------------
class ChecksumTests(TestCase):
    def setUp(self):
        super().setUp()
        customer = create_customer_profile(name="CK Cust", phone="7900000014")
        product = create_product(product_code="VAULT-CK-1")
        batch = create_batch(batch_code="VAULTCK001")
        lucky = create_lucky_id(batch=batch, lucky_number=14)
        self.sub = create_subscription(
            customer=customer, product=product, batch=batch, lucky_id=lucky
        )

    def test_checksum_returns_hex_string(self):
        doc = _make_doc(self.sub)
        checksum = calculate_document_checksum(doc)
        self.assertIsInstance(checksum, str)
        self.assertEqual(len(checksum), 64)

    def test_checksum_is_deterministic(self):
        doc = _make_doc(self.sub)
        c1 = calculate_document_checksum(doc)
        c2 = calculate_document_checksum(doc)
        self.assertEqual(c1, c2)
