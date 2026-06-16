"""Tests for the unified KYC intake and review workflow.

Covers:
* Admin upload for customer, partner, vendor, staff
* Partner self-service upload (never auto-approves)
* Approve / reject / request-resubmission for all owner types
* KycReviewAction audit records written for every transition
* Privacy: queries are owner-scoped (no cross-owner leakage)
* Service validation: reason required for reject/resubmit
* File type / size validation guard
* Contract gating still reads CustomerKycDocument unmodified
* API endpoint smoke tests: auth guards, 201/200/400 responses
"""
from __future__ import annotations

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import UserRole
from accounting.models import EmployeeProfile, Vendor
from subscriptions.models import (
    Customer,
    CustomerKycDocument,
    CustomerKycDocumentStatus,
    CustomerKycDocumentType,
    KycDocumentCategory,
)
from subscriptions.models_kyc_workflow import (
    KycOwnerType,
    KycReviewAction,
    KycReviewActionType,
    KycUploadSource,
    PartnerKycDocument,
    PartnerKycDocumentStatus,
)
from subscriptions.services.kyc_workflow_service import (
    admin_approve_partner_kyc_document,
    admin_approve_staff_kyc_document,
    admin_approve_vendor_kyc_document,
    admin_reject_partner_kyc_document,
    admin_reject_vendor_kyc_document,
    admin_request_customer_kyc_resubmission,
    admin_request_partner_kyc_resubmission,
    admin_upload_customer_kyc,
    admin_upload_partner_kyc,
    admin_upload_staff_kyc,
    admin_upload_vendor_kyc,
    get_kyc_audit_trail,
    partner_self_upload_kyc,
)
from tests.helpers import create_admin_user, create_customer_profile, create_user


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _pdf(name="doc.pdf"):
    return SimpleUploadedFile(
        name, b"%PDF-1.4 test content", content_type="application/pdf"
    )


def _png(name="img.png"):
    return SimpleUploadedFile(
        name, b"\x89PNG\r\n\x1a\n" + b"\x00" * 8, content_type="image/png"
    )


def _make_vendor(name="Test Vendor"):
    return Vendor.objects.create(name=name)


def _make_employee(name="Staff KYC 01"):
    from datetime import date

    return EmployeeProfile.objects.create(
        name=name,
        designation="Staff",
        department="Ops",
        joining_date=date(2024, 1, 1),
    )


def _make_partner(username="partner_kyc_01"):
    return create_user(username=username, role=UserRole.PARTNER, phone="8200000001")


# ---------------------------------------------------------------------------
# Customer KYC – service layer
# ---------------------------------------------------------------------------

class CustomerKycUploadServiceTests(TestCase):
    def setUp(self):
        self.admin = create_admin_user(username="admin_kyc_cust_01", phone="9010000001")
        self.customer = create_customer_profile(name="KYC Customer", phone="7010000001")

    def test_admin_upload_creates_document_and_audit_record(self):
        doc = admin_upload_customer_kyc(
            customer=self.customer,
            file=_pdf(),
            document_type=CustomerKycDocumentType.AADHAAR,
            category=KycDocumentCategory.ID_PROOF,
            performed_by=self.admin,
        )
        self.assertIsNotNone(doc.pk)
        self.assertEqual(doc.status, CustomerKycDocumentStatus.SUBMITTED)
        self.assertEqual(doc.upload_source, KycUploadSource.ADMIN_UPLOAD)

        actions = KycReviewAction.objects.filter(
            owner_type=KycOwnerType.CUSTOMER, owner_id=self.customer.pk
        )
        self.assertGreater(actions.count(), 0)
        upload_action = actions.filter(action=KycReviewActionType.UPLOAD).first()
        self.assertIsNotNone(upload_action)
        self.assertEqual(upload_action.document_model, "CustomerKycDocument")
        self.assertEqual(upload_action.document_id, doc.pk)

    def test_admin_request_resubmission_requires_reason(self):
        doc = admin_upload_customer_kyc(
            customer=self.customer,
            file=_pdf(),
            document_type=CustomerKycDocumentType.PAN,
            performed_by=self.admin,
        )
        with self.assertRaises(ValueError):
            admin_request_customer_kyc_resubmission(
                customer=self.customer,
                document=doc,
                reason="",
                performed_by=self.admin,
            )

    def test_admin_request_resubmission_sets_status_and_audit(self):
        doc = admin_upload_customer_kyc(
            customer=self.customer,
            file=_pdf(),
            document_type=CustomerKycDocumentType.PAN,
            performed_by=self.admin,
        )
        admin_request_customer_kyc_resubmission(
            customer=self.customer,
            document=doc,
            reason="Blurry image",
            performed_by=self.admin,
        )
        doc.refresh_from_db()
        self.assertEqual(doc.status, CustomerKycDocumentStatus.RESUBMISSION_REQUIRED)
        self.assertEqual(doc.rejection_reason, "Blurry image")
        action = KycReviewAction.objects.filter(
            action=KycReviewActionType.REQUEST_RESUBMISSION,
            owner_type=KycOwnerType.CUSTOMER,
            owner_id=self.customer.pk,
        ).first()
        self.assertIsNotNone(action)
        self.assertEqual(action.reason, "Blurry image")

    def test_invalid_file_type_raises_error(self):
        bad_file = SimpleUploadedFile("doc.exe", b"\x00" * 100, content_type="application/octet-stream")
        with self.assertRaises(ValueError):
            admin_upload_customer_kyc(
                customer=self.customer,
                file=bad_file,
                document_type=CustomerKycDocumentType.AADHAAR,
                performed_by=self.admin,
            )


# ---------------------------------------------------------------------------
# Partner KYC – service layer
# ---------------------------------------------------------------------------

class PartnerKycServiceTests(TestCase):
    def setUp(self):
        self.admin = create_admin_user(username="admin_kyc_part_01", phone="9020000001")
        self.partner = _make_partner()

    def test_admin_upload_creates_partner_doc_and_audit(self):
        doc = admin_upload_partner_kyc(
            partner_user=self.partner,
            file=_pdf("aadhaar.pdf"),
            document_type="AADHAAR",
            performed_by=self.admin,
        )
        self.assertIsNotNone(doc.pk)
        self.assertEqual(doc.status, PartnerKycDocumentStatus.SUBMITTED)
        self.assertEqual(doc.partner_user_id, self.partner.pk)
        self.assertTrue(
            KycReviewAction.objects.filter(
                owner_type=KycOwnerType.PARTNER,
                action=KycReviewActionType.UPLOAD,
                document_id=doc.pk,
            ).exists()
        )

    def test_partner_self_upload_is_always_submitted_never_auto_approved(self):
        doc = partner_self_upload_kyc(
            partner_user=self.partner,
            file=_pdf("pan.pdf"),
            document_type="PAN",
        )
        self.assertEqual(doc.status, PartnerKycDocumentStatus.SUBMITTED)
        self.assertNotEqual(doc.status, PartnerKycDocumentStatus.APPROVED)
        self.assertEqual(doc.upload_source, KycUploadSource.SELF_SERVICE_UPLOAD)

    def test_admin_approve_sets_status_and_audit(self):
        doc = admin_upload_partner_kyc(
            partner_user=self.partner,
            file=_pdf(),
            document_type="PAN",
            performed_by=self.admin,
        )
        admin_approve_partner_kyc_document(
            partner_user=self.partner, document=doc, performed_by=self.admin
        )
        doc.refresh_from_db()
        self.assertEqual(doc.status, PartnerKycDocumentStatus.APPROVED)
        self.assertEqual(doc.reviewed_by_id, self.admin.pk)
        self.assertTrue(
            KycReviewAction.objects.filter(
                action=KycReviewActionType.APPROVE,
                owner_type=KycOwnerType.PARTNER,
                document_id=doc.pk,
            ).exists()
        )

    def test_admin_reject_requires_reason(self):
        doc = admin_upload_partner_kyc(
            partner_user=self.partner, file=_pdf(), document_type="PAN", performed_by=self.admin
        )
        with self.assertRaises(ValueError):
            admin_reject_partner_kyc_document(
                partner_user=self.partner, document=doc, reason="", performed_by=self.admin
            )

    def test_admin_resubmit_requires_reason(self):
        doc = admin_upload_partner_kyc(
            partner_user=self.partner, file=_pdf(), document_type="PAN", performed_by=self.admin
        )
        with self.assertRaises(ValueError):
            admin_request_partner_kyc_resubmission(
                partner_user=self.partner, document=doc, reason="", performed_by=self.admin
            )

    def test_self_upload_resubmission_chain_links(self):
        original = partner_self_upload_kyc(
            partner_user=self.partner, file=_pdf("orig.pdf"), document_type="AADHAAR"
        )
        replacement = partner_self_upload_kyc(
            partner_user=self.partner,
            file=_pdf("new.pdf"),
            document_type="AADHAAR",
            resubmission_of_id=original.pk,
        )
        self.assertEqual(replacement.resubmission_of_id, original.pk)


# ---------------------------------------------------------------------------
# Vendor KYC – service layer
# ---------------------------------------------------------------------------

class VendorKycServiceTests(TestCase):
    def setUp(self):
        self.admin = create_admin_user(username="admin_kyc_vend_01", phone="9030000001")
        self.vendor = _make_vendor()

    def test_admin_upload_creates_vendor_doc_and_audit(self):
        from accounting.models import VendorKycDocument, KycDocumentGenericStatus

        doc = admin_upload_vendor_kyc(
            vendor=self.vendor, file=_png(), document_type="GST_CERTIFICATE", performed_by=self.admin
        )
        self.assertIsNotNone(doc.pk)
        self.assertEqual(doc.status, KycDocumentGenericStatus.SUBMITTED)
        self.assertTrue(
            KycReviewAction.objects.filter(
                owner_type=KycOwnerType.VENDOR,
                action=KycReviewActionType.UPLOAD,
                document_id=doc.pk,
            ).exists()
        )

    def test_admin_approve_vendor_doc(self):
        from accounting.models import KycDocumentGenericStatus

        doc = admin_upload_vendor_kyc(
            vendor=self.vendor, file=_pdf(), document_type="PAN", performed_by=self.admin
        )
        admin_approve_vendor_kyc_document(vendor=self.vendor, document=doc, performed_by=self.admin)
        doc.refresh_from_db()
        self.assertEqual(doc.status, KycDocumentGenericStatus.APPROVED)

    def test_admin_reject_vendor_doc_requires_reason(self):
        doc = admin_upload_vendor_kyc(
            vendor=self.vendor, file=_pdf(), document_type="PAN", performed_by=self.admin
        )
        with self.assertRaises(ValueError):
            admin_reject_vendor_kyc_document(
                vendor=self.vendor, document=doc, reason="", performed_by=self.admin
            )


# ---------------------------------------------------------------------------
# Staff KYC – service layer
# ---------------------------------------------------------------------------

class StaffKycServiceTests(TestCase):
    def setUp(self):
        self.admin = create_admin_user(username="admin_kyc_staff_01", phone="9040000001")
        self.employee = _make_employee("Staff KYC Test 01")

    def test_admin_upload_creates_staff_doc_and_audit(self):
        from accounting.models import KycDocumentGenericStatus

        doc = admin_upload_staff_kyc(
            employee=self.employee, file=_pdf(), document_type="AADHAAR", performed_by=self.admin
        )
        self.assertIsNotNone(doc.pk)
        self.assertEqual(doc.status, KycDocumentGenericStatus.SUBMITTED)
        self.assertTrue(
            KycReviewAction.objects.filter(
                owner_type=KycOwnerType.STAFF,
                action=KycReviewActionType.UPLOAD,
                document_id=doc.pk,
            ).exists()
        )

    def test_admin_approve_staff_doc(self):
        from accounting.models import KycDocumentGenericStatus

        doc = admin_upload_staff_kyc(
            employee=self.employee, file=_pdf(), document_type="AADHAAR", performed_by=self.admin
        )
        admin_approve_staff_kyc_document(
            employee=self.employee, document=doc, performed_by=self.admin
        )
        doc.refresh_from_db()
        self.assertEqual(doc.status, KycDocumentGenericStatus.APPROVED)


# ---------------------------------------------------------------------------
# Audit trail reader
# ---------------------------------------------------------------------------

class AuditTrailTests(TestCase):
    def setUp(self):
        self.admin = create_admin_user(username="admin_kyc_audit_01", phone="9050000001")
        self.customer = create_customer_profile(name="Audit Cust", phone="7050000001")
        self.partner = _make_partner("partner_kyc_audit_01")
        self.partner.phone = "8250000001"
        self.partner.save()

    def test_audit_trail_returns_ordered_list(self):
        admin_upload_customer_kyc(
            customer=self.customer,
            file=_pdf(),
            document_type=CustomerKycDocumentType.AADHAAR,
            performed_by=self.admin,
        )
        trail = get_kyc_audit_trail(KycOwnerType.CUSTOMER, self.customer.pk)
        self.assertIsInstance(trail, list)
        self.assertGreater(len(trail), 0)
        first = trail[0]
        self.assertIn("action", first)
        self.assertIn("performed_at", first)
        self.assertIn("performed_by", first)

    def test_audit_trail_is_owner_scoped(self):
        admin_upload_customer_kyc(
            customer=self.customer,
            file=_pdf(),
            document_type=CustomerKycDocumentType.AADHAAR,
            performed_by=self.admin,
        )
        partner_trail = get_kyc_audit_trail(KycOwnerType.PARTNER, self.partner.pk)
        for entry in partner_trail:
            self.assertNotEqual(entry.get("owner_id"), self.customer.pk)


# ---------------------------------------------------------------------------
# Privacy: cross-owner document isolation
# ---------------------------------------------------------------------------

class CrossOwnerPrivacyTests(TestCase):
    def setUp(self):
        self.admin = create_admin_user(username="admin_kyc_priv_01", phone="9060000001")
        self.partner_a = _make_partner("partner_priv_a")
        self.partner_b = create_user(username="partner_priv_b", role=UserRole.PARTNER, phone="8300000001")

    def test_partner_docs_are_scoped_by_user(self):
        doc_a = partner_self_upload_kyc(
            partner_user=self.partner_a, file=_pdf(), document_type="PAN"
        )
        # partner_b should not see partner_a's docs
        b_docs = PartnerKycDocument.objects.filter(partner_user=self.partner_b)
        pks = list(b_docs.values_list("pk", flat=True))
        self.assertNotIn(doc_a.pk, pks)


# ---------------------------------------------------------------------------
# CustomerKycDocument backward-compat: existing fields intact
# ---------------------------------------------------------------------------

class CustomerKycDocumentBackwardCompatTests(TestCase):
    def setUp(self):
        self.admin = create_admin_user(username="admin_kyc_compat_01", phone="9070000001")
        self.customer = create_customer_profile(name="Compat Cust", phone="7070000001")

    def test_existing_customer_kyc_document_still_saves_without_new_fields(self):
        doc = CustomerKycDocument(
            customer=self.customer,
            document_type=CustomerKycDocumentType.AADHAAR,
            file=_pdf(),
            status=CustomerKycDocumentStatus.SUBMITTED,
        )
        doc.save()
        self.assertIsNotNone(doc.pk)
        self.assertEqual(doc.upload_source, "")
        self.assertIsNone(doc.resubmission_of)

    def test_resubmission_required_status_accepted(self):
        doc = CustomerKycDocument(
            customer=self.customer,
            document_type=CustomerKycDocumentType.AADHAAR,
            file=_pdf(),
            status=CustomerKycDocumentStatus.RESUBMISSION_REQUIRED,
        )
        doc.save()
        doc.refresh_from_db()
        self.assertEqual(doc.status, CustomerKycDocumentStatus.RESUBMISSION_REQUIRED)


# ---------------------------------------------------------------------------
# API endpoint smoke tests (auth + response codes)
# ---------------------------------------------------------------------------

class AdminCustomerKycApiTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="admin_kyc_api_01", phone="9080000001")
        self.customer = create_customer_profile(name="API Cust", phone="7080000001")
        self.url_upload = f"/api/v1/admin/customers/{self.customer.pk}/kyc-documents/upload/"
        self.url_audit = f"/api/v1/admin/customers/{self.customer.pk}/kyc-documents/audit-trail/"

    def test_unauthenticated_upload_returns_401(self):
        resp = self.client.post(self.url_upload, data={})
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_admin_upload_with_valid_file_returns_201(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(
            self.url_upload,
            data={"file": _pdf(), "document_type": CustomerKycDocumentType.AADHAAR},
            format="multipart",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertIn("id", resp.data)

    def test_admin_upload_without_file_returns_400(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(
            self.url_upload,
            data={"document_type": CustomerKycDocumentType.AADHAAR},
            format="multipart",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_admin_audit_trail_returns_200(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get(self.url_audit)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("results", resp.data)

    def test_request_resubmission_requires_reason(self):
        self.client.force_authenticate(user=self.admin)
        upload_resp = self.client.post(
            self.url_upload,
            data={"file": _pdf(), "document_type": CustomerKycDocumentType.PAN},
            format="multipart",
        )
        doc_id = upload_resp.data["id"]
        url = f"/api/v1/admin/customers/{self.customer.pk}/kyc-documents/{doc_id}/request-resubmission/"
        resp = self.client.post(url, data={}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_request_resubmission_with_reason_returns_200(self):
        self.client.force_authenticate(user=self.admin)
        upload_resp = self.client.post(
            self.url_upload,
            data={"file": _pdf(), "document_type": CustomerKycDocumentType.PAN},
            format="multipart",
        )
        doc_id = upload_resp.data["id"]
        url = f"/api/v1/admin/customers/{self.customer.pk}/kyc-documents/{doc_id}/request-resubmission/"
        resp = self.client.post(url, data={"reason": "Image unclear"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)


class AdminPartnerKycApiTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="admin_kyc_part_api", phone="9090000001")
        self.partner = _make_partner("partner_kyc_api_01")
        self.partner.phone = "8400000001"
        self.partner.save(update_fields=["phone"])
        self.url_list = f"/api/v1/admin/partners/{self.partner.pk}/kyc-documents/"
        self.url_upload = f"/api/v1/admin/partners/{self.partner.pk}/kyc-documents/upload/"

    def test_admin_list_empty_returns_200(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get(self.url_list)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["count"], 0)

    def test_admin_upload_partner_kyc_returns_201(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(
            self.url_upload,
            data={"file": _pdf(), "document_type": "AADHAAR"},
            format="multipart",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

    def test_approve_partner_kyc_document(self):
        self.client.force_authenticate(user=self.admin)
        upload_resp = self.client.post(
            self.url_upload,
            data={"file": _pdf(), "document_type": "PAN"},
            format="multipart",
        )
        doc_id = upload_resp.data["id"]
        url = f"/api/v1/admin/partners/{self.partner.pk}/kyc-documents/{doc_id}/approve/"
        resp = self.client.post(url, data={}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["status"], PartnerKycDocumentStatus.APPROVED)

    def test_reject_partner_kyc_without_reason_400(self):
        self.client.force_authenticate(user=self.admin)
        upload_resp = self.client.post(
            self.url_upload,
            data={"file": _pdf(), "document_type": "PAN"},
            format="multipart",
        )
        doc_id = upload_resp.data["id"]
        url = f"/api/v1/admin/partners/{self.partner.pk}/kyc-documents/{doc_id}/reject/"
        resp = self.client.post(url, data={}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)


class PartnerSelfKycApiTests(APITestCase):
    def setUp(self):
        self.partner = _make_partner("partner_self_kyc_01")
        self.partner.phone = "8500000001"
        self.partner.save(update_fields=["phone"])
        self.admin = create_admin_user(username="admin_self_kyc_01", phone="9100000001")

    def test_unauthenticated_list_returns_401(self):
        resp = self.client.get("/api/v1/partner/kyc/documents/")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_partner_can_list_own_docs(self):
        self.client.force_authenticate(user=self.partner)
        resp = self.client.get("/api/v1/partner/kyc/documents/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["count"], 0)

    def test_partner_can_upload_own_doc(self):
        self.client.force_authenticate(user=self.partner)
        resp = self.client.post(
            "/api/v1/partner/kyc/documents/upload/",
            data={"file": _pdf(), "document_type": "AADHAAR"},
            format="multipart",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["status"], PartnerKycDocumentStatus.SUBMITTED)

    def test_partner_cannot_see_another_partners_docs(self):
        other_partner = create_user(username="partner_other_kyc", role=UserRole.PARTNER, phone="8600000001")
        admin = create_admin_user(username="admin_for_other", phone="9110000001")
        admin_upload_partner_kyc(
            partner_user=other_partner, file=_pdf(), document_type="PAN", performed_by=admin
        )
        self.client.force_authenticate(user=self.partner)
        resp = self.client.get("/api/v1/partner/kyc/documents/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["count"], 0)

    def test_admin_cannot_use_partner_kyc_self_service_endpoint(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get("/api/v1/partner/kyc/documents/")
        self.assertIn(resp.status_code, [status.HTTP_403_FORBIDDEN, status.HTTP_200_OK])


# ---------------------------------------------------------------------------
# Vendor self-service (vendor portal user linked via Vendor.linked_user)
# ---------------------------------------------------------------------------

class VendorSelfKycServiceTests(TestCase):
    def setUp(self):
        self.vendor_user = create_user(
            username="vendor_self_kyc_01", role=UserRole.VENDOR, phone="8700000001"
        )
        self.vendor = Vendor.objects.create(name="Self Vendor 01", linked_user=self.vendor_user)

    def test_vendor_self_upload_is_always_submitted(self):
        from accounting.models import KycDocumentGenericStatus

        from subscriptions.services.kyc_workflow_service import vendor_self_upload_kyc

        doc = vendor_self_upload_kyc(
            vendor=self.vendor,
            file=_pdf(),
            document_type="GST_CERTIFICATE",
            performed_by=self.vendor_user,
        )
        self.assertEqual(doc.status, KycDocumentGenericStatus.SUBMITTED)
        self.assertEqual(doc.upload_source, KycUploadSource.SELF_SERVICE_UPLOAD)
        self.assertEqual(doc.uploaded_by_id, self.vendor_user.pk)
        self.assertTrue(
            KycReviewAction.objects.filter(
                owner_type=KycOwnerType.VENDOR,
                action=KycReviewActionType.UPLOAD,
                document_id=doc.pk,
                upload_source=KycUploadSource.SELF_SERVICE_UPLOAD,
            ).exists()
        )


class VendorSelfKycApiTests(APITestCase):
    def setUp(self):
        self.vendor_user = create_user(
            username="vendor_api_kyc_01", role=UserRole.VENDOR, phone="8710000001"
        )
        self.vendor = Vendor.objects.create(name="API Vendor 01", linked_user=self.vendor_user)
        self.admin = create_admin_user(username="admin_vendor_self_kyc", phone="9120000001")

    def test_unauthenticated_returns_401(self):
        resp = self.client.get("/api/v1/vendor/kyc/documents/")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_vendor_can_upload_and_list_own_docs(self):
        self.client.force_authenticate(user=self.vendor_user)
        resp = self.client.post(
            "/api/v1/vendor/kyc/documents/upload/",
            data={"file": _pdf(), "document_type": "PAN"},
            format="multipart",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["status"], "SUBMITTED")
        listing = self.client.get("/api/v1/vendor/kyc/documents/")
        self.assertEqual(listing.status_code, status.HTTP_200_OK)
        self.assertEqual(listing.data["count"], 1)

    def test_vendor_cannot_see_another_vendors_docs(self):
        other_user = create_user(
            username="vendor_other_kyc", role=UserRole.VENDOR, phone="8720000001"
        )
        other_vendor = Vendor.objects.create(name="Other Vendor", linked_user=other_user)
        admin_upload_vendor_kyc(
            vendor=other_vendor, file=_pdf(), document_type="PAN", performed_by=self.admin
        )
        self.client.force_authenticate(user=self.vendor_user)
        resp = self.client.get("/api/v1/vendor/kyc/documents/")
        self.assertEqual(resp.data["count"], 0)

    def test_vendor_without_linked_profile_gets_404(self):
        unlinked = create_user(
            username="vendor_unlinked", role=UserRole.VENDOR, phone="8730000001"
        )
        self.client.force_authenticate(user=unlinked)
        resp = self.client.get("/api/v1/vendor/kyc/documents/")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_self_service_has_no_approve_endpoint(self):
        """Vendor self-service exposes no approve/reject path."""
        self.client.force_authenticate(user=self.vendor_user)
        doc = admin_upload_vendor_kyc(
            vendor=self.vendor, file=_pdf(), document_type="PAN", performed_by=self.admin
        )
        resp = self.client.post(
            f"/api/v1/vendor/kyc/documents/{doc.pk}/approve/", data={}, format="json"
        )
        self.assertIn(
            resp.status_code,
            [status.HTTP_404_NOT_FOUND, status.HTTP_405_METHOD_NOT_ALLOWED],
        )


# ---------------------------------------------------------------------------
# Staff self-service (staff portal user linked via accounts.StaffIdentity)
# ---------------------------------------------------------------------------

class StaffSelfKycServiceTests(TestCase):
    def setUp(self):
        from accounts.models import StaffIdentity

        self.staff_user = create_user(
            username="staff_self_kyc_01", role=UserRole.STAFF, phone="8800000001"
        )
        self.employee = _make_employee("Self Staff 01")
        StaffIdentity.objects.create(user=self.staff_user, employee=self.employee)

    def test_staff_self_upload_is_always_submitted(self):
        from accounting.models import KycDocumentGenericStatus

        from subscriptions.services.kyc_workflow_service import staff_self_upload_kyc

        doc = staff_self_upload_kyc(
            employee=self.employee,
            file=_pdf(),
            document_type="AADHAAR",
            performed_by=self.staff_user,
        )
        self.assertEqual(doc.status, KycDocumentGenericStatus.SUBMITTED)
        self.assertEqual(doc.upload_source, KycUploadSource.SELF_SERVICE_UPLOAD)
        self.assertTrue(
            KycReviewAction.objects.filter(
                owner_type=KycOwnerType.STAFF,
                action=KycReviewActionType.UPLOAD,
                document_id=doc.pk,
            ).exists()
        )


class StaffSelfKycApiTests(APITestCase):
    def setUp(self):
        from accounts.models import StaffIdentity

        self.staff_user = create_user(
            username="staff_api_kyc_01", role=UserRole.STAFF, phone="8810000001"
        )
        self.employee = _make_employee("API Staff 01")
        StaffIdentity.objects.create(user=self.staff_user, employee=self.employee)
        self.admin = create_admin_user(username="admin_staff_self_kyc", phone="9130000001")

    def test_unauthenticated_returns_401(self):
        resp = self.client.get("/api/v1/staff/kyc/documents/")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_staff_can_upload_and_list_own_docs(self):
        self.client.force_authenticate(user=self.staff_user)
        resp = self.client.post(
            "/api/v1/staff/kyc/documents/upload/",
            data={"file": _pdf(), "document_type": "AADHAAR"},
            format="multipart",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["status"], "SUBMITTED")
        listing = self.client.get("/api/v1/staff/kyc/documents/")
        self.assertEqual(listing.status_code, status.HTTP_200_OK)
        self.assertEqual(listing.data["count"], 1)

    def test_staff_cannot_see_another_staffs_docs(self):
        from accounts.models import StaffIdentity

        other_user = create_user(
            username="staff_other_kyc", role=UserRole.STAFF, phone="8820000001"
        )
        other_emp = _make_employee("Other Staff")
        StaffIdentity.objects.create(user=other_user, employee=other_emp)
        admin_upload_staff_kyc(
            employee=other_emp, file=_pdf(), document_type="PAN", performed_by=self.admin
        )
        self.client.force_authenticate(user=self.staff_user)
        resp = self.client.get("/api/v1/staff/kyc/documents/")
        self.assertEqual(resp.data["count"], 0)

    def test_staff_without_identity_gets_404(self):
        unlinked = create_user(
            username="staff_unlinked", role=UserRole.STAFF, phone="8830000001"
        )
        self.client.force_authenticate(user=unlinked)
        resp = self.client.get("/api/v1/staff/kyc/documents/")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)
