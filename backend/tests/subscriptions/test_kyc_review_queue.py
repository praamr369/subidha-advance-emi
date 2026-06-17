"""Tests for the CRM-wide KYC review queue and party-level KYC cockpit.

Covers:
* Review queue aggregates customer / partner / vendor / staff KYC documents
* Filter by owner_type and by status
* Approve from the queue creates a KycReviewAction audit record
* Reject / request-resubmission require a reason
* Non-admin cannot access the review queue or its actions
* CRM party linked to a customer returns that customer's KYC
* Unconverted CRM party returns the controlled not-available response
* No self-service approval endpoint exists (privacy / authority safety)
* The queue never duplicates documents and reuses the canonical stores
"""
from __future__ import annotations

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.urls import Resolver404, resolve
from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import EmployeeProfile, Vendor
from accounts.models import UserRole
from crm.models import PartyLink, PartyLinkRole, PartyMaster
from subscriptions.models_kyc_workflow import (
    KycOwnerType,
    KycReviewAction,
    KycReviewActionType,
)
from subscriptions.services.kyc_workflow_service import (
    admin_upload_customer_kyc,
    admin_upload_partner_kyc,
    admin_upload_staff_kyc,
    admin_upload_vendor_kyc,
    build_kyc_review_queue,
    get_party_kyc_readiness,
)
from tests.helpers import (
    create_admin_user,
    create_customer_profile,
    create_user,
)


def _pdf(name="doc.pdf"):
    return SimpleUploadedFile(name, b"%PDF-1.4 test content", content_type="application/pdf")


def _make_vendor(name="Queue Vendor"):
    return Vendor.objects.create(name=name, phone="7900000001", email="vendor@example.com")


def _make_employee(name="Queue Staff"):
    from datetime import date

    return EmployeeProfile.objects.create(
        name=name,
        designation="Staff",
        department="Ops",
        phone="7900000002",
        joining_date=date(2024, 1, 1),
    )


def _make_partner(username="queue_partner_01"):
    return create_user(
        username=username,
        role=UserRole.PARTNER,
        phone="7900000003",
        email="partner@example.com",
    )


class KycReviewQueueServiceTests(TestCase):
    def setUp(self):
        self.admin = create_admin_user(username="admin_queue_01", phone="9100000001")
        self.customer = create_customer_profile(name="Queue Customer", phone="7100000001")
        self.partner = _make_partner()
        self.vendor = _make_vendor()
        self.employee = _make_employee()

        admin_upload_customer_kyc(
            customer=self.customer, file=_pdf(), document_type="AADHAAR", performed_by=self.admin
        )
        admin_upload_partner_kyc(
            partner_user=self.partner, file=_pdf("p.pdf"), document_type="PAN", performed_by=self.admin
        )
        admin_upload_vendor_kyc(
            vendor=self.vendor, file=_pdf("v.pdf"), document_type="GST_CERTIFICATE", performed_by=self.admin
        )
        admin_upload_staff_kyc(
            employee=self.employee, file=_pdf("s.pdf"), document_type="AADHAAR", performed_by=self.admin
        )

    def test_queue_lists_all_owner_types(self):
        data = build_kyc_review_queue()
        owner_types = {row["owner_type"] for row in data["results"]}
        self.assertEqual(
            owner_types,
            {
                KycOwnerType.CUSTOMER,
                KycOwnerType.PARTNER,
                KycOwnerType.VENDOR,
                KycOwnerType.STAFF,
            },
        )
        self.assertEqual(data["count"], 4)
        # Each row carries normalized owner identity + actions, never duplicated docs.
        ids = [(row["owner_type"], row["document_id"]) for row in data["results"]]
        self.assertEqual(len(ids), len(set(ids)))
        for row in data["results"]:
            self.assertIn("approve", row["allowed_actions"])
            self.assertTrue(row["download_url"].startswith("/api/v1/admin/"))

    def test_filter_by_owner_type(self):
        data = build_kyc_review_queue(owner_type="vendor")
        self.assertEqual(data["count"], 1)
        self.assertEqual(data["results"][0]["owner_type"], KycOwnerType.VENDOR)
        self.assertEqual(data["results"][0]["owner_id"], self.vendor.pk)

    def test_filter_by_status(self):
        # All uploads are SUBMITTED; REJECTED should currently be empty.
        submitted = build_kyc_review_queue(status="SUBMITTED")
        self.assertEqual(submitted["count"], 4)
        rejected = build_kyc_review_queue(status="REJECTED")
        self.assertEqual(rejected["count"], 0)

    def test_search_matches_owner_identity(self):
        data = build_kyc_review_queue(search="Queue Customer")
        self.assertEqual(data["count"], 1)
        self.assertEqual(data["results"][0]["owner_type"], KycOwnerType.CUSTOMER)

    def test_approved_documents_excluded_by_default(self):
        from subscriptions.services.kyc_workflow_service import queue_approve_kyc_document

        partner_doc = self.partner.partner_kyc_documents.first()
        queue_approve_kyc_document(
            owner_type="partner", document_id=partner_doc.pk, performed_by=self.admin
        )
        data = build_kyc_review_queue()
        # Approved partner doc drops out of the default queue.
        self.assertEqual(data["count"], 3)
        self.assertNotIn(
            KycOwnerType.PARTNER,
            {row["owner_type"] for row in data["results"]},
        )


class KycReviewQueueApiTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="admin_queue_api_01", phone="9100000002")
        self.partner_user = _make_partner(username="queue_partner_api")
        self.customer = create_customer_profile(name="API Queue Customer", phone="7100000002")
        self.vendor = _make_vendor(name="API Queue Vendor")

        self.partner_doc = admin_upload_partner_kyc(
            partner_user=self.partner_user, file=_pdf("p.pdf"), document_type="PAN", performed_by=self.admin
        )
        self.customer_doc = admin_upload_customer_kyc(
            customer=self.customer, file=_pdf(), document_type="AADHAAR", performed_by=self.admin
        )
        self.queue_url = "/api/v1/admin/kyc/review-queue/"

    def test_requires_authentication(self):
        resp = self.client.get(self.queue_url)
        self.assertIn(resp.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))

    def test_non_admin_cannot_access_queue(self):
        self.client.force_authenticate(user=self.partner_user)
        resp = self.client.get(self.queue_url)
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_lists_queue(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get(self.queue_url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(resp.data["count"], 2)
        self.assertIn("summary", resp.data)

    def test_approve_from_queue_creates_audit_action(self):
        self.client.force_authenticate(user=self.admin)
        url = f"/api/v1/admin/kyc/review-queue/partner/{self.partner_doc.pk}/approve/"
        resp = self.client.post(url, data={}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["status"], "APPROVED")
        self.assertTrue(
            KycReviewAction.objects.filter(
                owner_type=KycOwnerType.PARTNER,
                action=KycReviewActionType.APPROVE,
                document_id=self.partner_doc.pk,
            ).exists()
        )

    def test_reject_requires_reason(self):
        self.client.force_authenticate(user=self.admin)
        url = f"/api/v1/admin/kyc/review-queue/partner/{self.partner_doc.pk}/reject/"
        resp = self.client.post(url, data={}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_reject_with_reason_succeeds_and_audits(self):
        self.client.force_authenticate(user=self.admin)
        url = f"/api/v1/admin/kyc/review-queue/partner/{self.partner_doc.pk}/reject/"
        resp = self.client.post(url, data={"reason": "Blurred"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["status"], "REJECTED")
        self.assertTrue(
            KycReviewAction.objects.filter(
                owner_type=KycOwnerType.PARTNER,
                action=KycReviewActionType.REJECT,
                document_id=self.partner_doc.pk,
            ).exists()
        )

    def test_request_resubmission_requires_reason(self):
        self.client.force_authenticate(user=self.admin)
        url = f"/api/v1/admin/kyc/review-queue/customer/{self.customer_doc.pk}/request-resubmission/"
        resp = self.client.post(url, data={}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_unknown_owner_type_rejected(self):
        self.client.force_authenticate(user=self.admin)
        url = f"/api/v1/admin/kyc/review-queue/spaceship/{self.partner_doc.pk}/approve/"
        resp = self.client.post(url, data={}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_missing_document_returns_404(self):
        self.client.force_authenticate(user=self.admin)
        url = "/api/v1/admin/kyc/review-queue/partner/99999999/approve/"
        resp = self.client.post(url, data={}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_no_self_service_approval_endpoint_exists(self):
        # Self-service portals never expose an approve/reject route.
        for path in (
            f"/api/v1/partner/kyc/documents/{self.partner_doc.pk}/approve/",
            f"/api/v1/vendor/kyc/documents/1/approve/",
            f"/api/v1/staff/kyc/documents/1/reject/",
        ):
            with self.assertRaises(Resolver404):
                resolve(path)


class PartyKycCockpitTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="admin_party_kyc_01", phone="9100000003")
        self.customer = create_customer_profile(name="Linked Party Customer", phone="7100000003")
        admin_upload_customer_kyc(
            customer=self.customer, file=_pdf(), document_type="AADHAAR", performed_by=self.admin
        )

        self.linked_party = PartyMaster.objects.create(display_name="Linked Party Customer")
        PartyLink.objects.create(
            party=self.linked_party,
            role_type=PartyLinkRole.CUSTOMER,
            source_app_label="subscriptions",
            source_model="Customer",
            source_pk=self.customer.pk,
            is_primary=True,
        )

        self.lead_party = PartyMaster.objects.create(display_name="Unconverted Lead")
        PartyLink.objects.create(
            party=self.lead_party,
            role_type=PartyLinkRole.LEAD,
            source_app_label="subscriptions",
            source_model="PublicLead",
            source_pk=4242,
        )

    def test_linked_party_returns_customer_kyc(self):
        data = get_party_kyc_readiness(self.linked_party)
        self.assertTrue(data["kyc_available"])
        self.assertEqual(data["owner_type"], KycOwnerType.CUSTOMER)
        self.assertEqual(data["owner_id"], self.customer.pk)
        self.assertEqual(len(data["documents"]), 1)
        self.assertEqual(data["documents"][0]["document_type"], "AADHAAR")

    def test_unconverted_party_returns_controlled_response(self):
        data = get_party_kyc_readiness(self.lead_party)
        self.assertFalse(data["kyc_available"])
        self.assertIn("converted", data["reason"].lower())
        self.assertEqual(data["documents"] if "documents" in data else [], [])

    def test_party_kyc_api_linked(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get(f"/api/v1/admin/crm/parties/{self.linked_party.pk}/kyc/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertTrue(resp.data["kyc_available"])
        self.assertEqual(resp.data["owner_type"], KycOwnerType.CUSTOMER)

    def test_party_kyc_api_unconverted(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get(f"/api/v1/admin/crm/parties/{self.lead_party.pk}/kyc/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertFalse(resp.data["kyc_available"])

    def test_party_kyc_api_non_admin_forbidden(self):
        partner = _make_partner(username="party_kyc_partner")
        self.client.force_authenticate(user=partner)
        resp = self.client.get(f"/api/v1/admin/crm/parties/{self.linked_party.pk}/kyc/")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
