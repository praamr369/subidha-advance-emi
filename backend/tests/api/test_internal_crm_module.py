from datetime import timedelta

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from crm.models import Lead
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_cashier_user,
    create_customer_profile,
    create_lucky_id,
    create_product,
    create_subscription,
)


class InternalCrmModuleApiTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="crm_mod_admin", phone="9900000101")
        self.cashier = create_cashier_user(username="crm_mod_cashier", phone="9900000102")
        self.product = create_product(name="CRM Module Product", product_code="CRM-MOD-001")
        self.client.force_authenticate(self.admin)

    def _create_lead(self, **overrides):
        payload = {
            "name": "Lead One",
            "phone": "01710000000",
            "email": "lead1@example.com",
            "source": "WALK_IN",
            "interested_product": self.product.id,
            "interested_plan_type": "LUCKY_PLAN",
            "stage": "NEW",
        }
        payload.update(overrides)
        response = self.client.post("/api/v1/admin/crm/internal/leads/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        return response.data

    def test_create_lead(self):
        row = self._create_lead()
        self.assertEqual(row["stage"], "NEW")
        self.assertEqual(row["interested_plan_type"], "LUCKY_PLAN")

    def test_move_lead_stage(self):
        row = self._create_lead()
        response = self.client.post(
            f"/api/v1/admin/crm/internal/leads/{row['id']}/stage/",
            {"stage": "INTERESTED"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["stage"], "INTERESTED")

    def test_convert_lead_to_customer(self):
        row = self._create_lead()
        response = self.client.post(
            f"/api/v1/admin/crm/internal/leads/{row['id']}/convert/",
            {"create_customer": True},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertTrue(response.data["customer_id"])
        lead = Lead.objects.get(pk=row["id"])
        self.assertIsNotNone(lead.converted_customer_id)
        self.assertEqual(lead.stage, "CONVERTED")

    def test_customer_profile_shows_existing_contracts(self):
        customer = create_customer_profile(name="CRM Profile Customer", phone="9900000111")
        batch = create_batch(batch_code="CRM-MOD-BATCH")
        lucky = create_lucky_id(batch=batch, lucky_number=23)
        create_subscription(customer=customer, product=self.product, batch=batch, lucky_id=lucky)
        response = self.client.get(f"/api/v1/admin/crm/internal/customers/{customer.id}/profile/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertGreaterEqual(len(response.data["contracts"]), 1)

    def test_follow_up_overdue_logic(self):
        row = self._create_lead()
        due_at = (timezone.now() - timedelta(hours=2)).isoformat()
        create_response = self.client.post(
            "/api/v1/admin/crm/internal/follow-ups/",
            {
                "lead": row["id"],
                "customer": None,
                "assigned_to": self.cashier.id,
                "due_at": due_at,
                "status": "OPEN",
                "call_note": "",
            },
            format="json",
        )
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED, create_response.data)
        list_response = self.client.get("/api/v1/admin/crm/internal/follow-ups/")
        self.assertEqual(list_response.status_code, status.HTTP_200_OK, list_response.data)
        self.assertGreaterEqual(list_response.data["overdue_count"], 1)

    def test_role_access_control(self):
        self.client.force_authenticate(self.cashier)
        response = self.client.get("/api/v1/admin/crm/internal/leads/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

