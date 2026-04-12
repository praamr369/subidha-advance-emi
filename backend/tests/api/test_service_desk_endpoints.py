from rest_framework import status
from rest_framework.test import APITestCase

from branch_control.models import Branch
from subscriptions.services.customer_support_service import create_customer_support_request
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_customer_profile,
    create_lucky_id,
    create_product,
    create_subscription,
)


class ServiceDeskApiTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="service_desk_api_admin", phone="9387700002")
        self.client.force_authenticate(user=self.admin)
        self.customer = create_customer_profile(
            name="Service Desk API Customer",
            phone="7387700002",
        )
        self.branch = Branch.objects.filter(is_primary=True).get()
        self.branch.code = "BR-SVC"
        self.branch.name = "Service Branch"
        self.branch.save(update_fields=["code", "name", "updated_at"])
        product = create_product(
            name="Service Desk Branch Product",
            product_code="SVC-PRD-001",
        )
        batch = create_batch(
            batch_code="SVCBATCH2026",
            total_slots=100,
            duration_months=12,
        )
        lucky_id = create_lucky_id(batch=batch, lucky_number=1)
        self.subscription = create_subscription(
            customer=self.customer,
            product=product,
            batch=batch,
            lucky_id=lucky_id,
            tenure_months=12,
        )
        self.subscription.branch = self.branch
        self.subscription.save(update_fields=["branch"])
        self.support_request = create_customer_support_request(
            customer=self.customer,
            category="OTHER",
            message="Customer wants an escalated complaint review.",
            subscription=self.subscription,
            performed_by=self.admin,
        )

    def test_admin_can_create_case_and_complaint_register_surfaces_linkage(self):
        create_response = self.client.post(
            "/api/v1/service-desk/cases/",
            {
                "case_type": "COMPLAINT",
                "support_request": self.support_request.id,
                "issue_summary": "Escalated complaint from support queue",
                "issue_details": "Complaint needs a service-desk owner.",
                "reporter_name_snapshot": self.customer.name,
                "reporter_phone_snapshot": self.customer.phone,
            },
            format="json",
        )
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED, create_response.data)
        case_id = create_response.data["id"]

        complaints = self.client.get("/api/v1/service-desk/complaints/")
        self.assertEqual(complaints.status_code, status.HTTP_200_OK, complaints.data)
        self.assertEqual(complaints.data["results"][0]["linked_service_case_id"], case_id)
        self.assertEqual(complaints.data["results"][0]["branch_code"], "BR-SVC")

        branch_filtered = self.client.get("/api/v1/service-desk/complaints/", {"branch": self.branch.id})
        self.assertEqual(branch_filtered.status_code, status.HTTP_200_OK, branch_filtered.data)
        self.assertEqual(branch_filtered.data["count"], 1)

    def test_crm_party_timeline_surfaces_service_case(self):
        create_response = self.client.post(
            "/api/v1/service-desk/cases/",
            {
                "case_type": "COMPLAINT",
                "support_request": self.support_request.id,
                "issue_summary": "CRM-visible complaint case",
                "issue_details": "Case must appear in the party timeline.",
                "reporter_name_snapshot": self.customer.name,
                "reporter_phone_snapshot": self.customer.phone,
            },
            format="json",
        )
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED, create_response.data)

        parties = self.client.get("/api/v1/crm/parties/?role_type=CUSTOMER")
        self.assertEqual(parties.status_code, status.HTTP_200_OK, parties.data)
        party_id = parties.data["results"][0]["id"]

        detail = self.client.get(f"/api/v1/crm/parties/{party_id}/")
        self.assertEqual(detail.status_code, status.HTTP_200_OK, detail.data)
        self.assertGreaterEqual(detail.data["summary"]["service_case_count"], 1)
        self.assertGreaterEqual(detail.data["summary"]["complaint_case_count"], 1)
        self.assertTrue(
            any(
                item.get("link", {}).get("service_case_id") == create_response.data["id"]
                and item.get("branch_code") == "BR-SVC"
                for item in detail.data["timeline"]
            )
        )
