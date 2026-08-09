"""End-to-end test of the lead → customer pipeline through the real admin API.

Covers the workflow wired in this session:
  * feedback captured on every stage move (timeline FollowUpTask created)
  * mandatory Lost reason
  * Customer auto-created & linked at KYC_PENDING
  * KYC approval gate before READY_TO_CONVERT
  * conversion reuses the same customer (no duplicate)
"""
from __future__ import annotations

from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from accounts.models import UserRole
from crm.models import FollowUpTask, Lead, LeadStage
from subscriptions.models import (
    Customer,
    CustomerKycDocument,
    KycStatus,
)
from customers.services.kyc_workflow_service import (
    admin_approve_customer_kyc_document,
)


class LeadToCustomerE2ETest(APITestCase):
    def setUp(self):
        from accounts.models import User

        self.client = APIClient()
        self.admin = User.objects.create_user(
            username="e2e_admin", password="pass1234", role=UserRole.ADMIN, phone="9800000111"
        )
        self.client.force_authenticate(self.admin)

    def _move(self, lead_id, stage, **body):
        return self.client.post(
            f"/api/v1/admin/crm/internal/leads/{lead_id}/stage/",
            {"stage": stage, **body},
            format="json",
        )

    def test_full_flow(self):
        # 1. Create lead ----------------------------------------------------
        resp = self.client.post(
            "/api/v1/admin/crm/internal/leads/",
            {"name": "E2E Prospect", "phone": "9400000777", "source": "WALK_IN",
             "interested_plan_type": "DIRECT_SALE"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.content)
        lead_id = resp.data["id"]
        self.assertEqual(Lead.objects.get(pk=lead_id).stage, LeadStage.NEW)

        # 2. NEW -> CONTACTED with feedback; a timeline task is recorded ----
        r = self._move(lead_id, "CONTACTED", note="Called, interested in sofa set")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertTrue(
            FollowUpTask.objects.filter(lead_id=lead_id, status="DONE",
                                        call_note__icontains="Called, interested").exists()
        )

        # 3. CONTACTED -> INTERESTED ---------------------------------------
        self.assertEqual(self._move(lead_id, "INTERESTED", note="Confirmed budget").status_code, 200)

        # 4. INTERESTED -> KYC_PENDING creates & links a customer ----------
        r = self._move(lead_id, "KYC_PENDING", note="Collecting documents")
        self.assertEqual(r.status_code, 200, r.content)
        lead = Lead.objects.get(pk=lead_id)
        self.assertEqual(lead.stage, LeadStage.KYC_PENDING)
        self.assertIsNotNone(lead.converted_customer_id)
        customer = lead.converted_customer
        self.assertEqual(Customer.objects.filter(phone="9400000777").count(), 1)

        # 5. KYC gate blocks READY_TO_CONVERT while KYC unapproved ----------
        r = self._move(lead_id, "READY_TO_CONVERT", note="try early")
        self.assertEqual(r.status_code, 400, r.content)
        self.assertIn("KYC", str(r.content))
        self.assertEqual(Lead.objects.get(pk=lead_id).stage, LeadStage.KYC_PENDING)

        # 6. Upload a KYC doc then approve it -> customer KYC APPROVED ------
        upload = self.client.post(
            f"/api/v1/admin/customers/{customer.id}/kyc-documents/upload/",
            {"document_type": "AADHAAR",
             "file": SimpleUploadedFile("aadhaar.pdf", b"%PDF-1.4 test", content_type="application/pdf")},
            format="multipart",
        )
        self.assertEqual(upload.status_code, 201, upload.content)
        doc = CustomerKycDocument.objects.get(pk=upload.data["id"])
        admin_approve_customer_kyc_document(customer=customer, document=doc, performed_by=self.admin)
        customer.refresh_from_db()
        self.assertIn(
            customer.kyc_status,
            {KycStatus.APPROVED, KycStatus.VERIFIED, KycStatus.EXCEPTION_APPROVED},
        )

        # 7. Now the gate opens: KYC_PENDING -> READY_TO_CONVERT -----------
        r = self._move(lead_id, "READY_TO_CONVERT", note="KYC verified")
        self.assertEqual(r.status_code, 200, r.content)

        # 8. Convert -> reuses the SAME customer (no duplicate) ------------
        r = self.client.post(
            f"/api/v1/admin/crm/internal/leads/{lead_id}/convert/",
            {"create_customer": True},
            format="json",
        )
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.data["customer_id"], customer.id)
        self.assertEqual(Lead.objects.get(pk=lead_id).stage, LeadStage.CONVERTED)
        self.assertEqual(Customer.objects.filter(phone="9400000777").count(), 1)

    def test_lost_requires_reason(self):
        resp = self.client.post(
            "/api/v1/admin/crm/internal/leads/",
            {"name": "Lost Guy", "phone": "9400000888", "source": "WALK_IN"},
            format="json",
        )
        lead_id = resp.data["id"]
        # No note -> rejected
        self.assertEqual(self._move(lead_id, "LOST").status_code, 400)
        # With reason -> ok
        self.assertEqual(self._move(lead_id, "LOST", note="Bought elsewhere").status_code, 200)
        self.assertEqual(Lead.objects.get(pk=lead_id).stage, LeadStage.LOST)
