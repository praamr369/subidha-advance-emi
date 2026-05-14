from datetime import timedelta

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from subscriptions.services.payment_service import record_emi_payment
from subscriptions.services.public_lead_service import (
    complete_public_lead_conversion,
    create_public_lead,
)
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_customer_profile,
    create_customer_user,
    create_delivery,
    create_emi,
    create_lucky_id,
    create_partner_user,
    create_payment_collection_finance_account,
    create_product,
    create_subscription,
    create_user,
)


class CrmApiTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(
            username="crm_admin",
            phone="9388000901",
        )
        self.client.force_authenticate(user=self.admin)
        self.customer = create_customer_profile(
            name="CRM Customer",
            phone="7388000901",
        )
        product = create_product(name="CRM Product", product_code="CRM-PROD-001")
        batch = create_batch(batch_code="CRM-BATCH-2026", duration_months=12, total_slots=100)
        lucky_id = create_lucky_id(batch=batch, lucky_number=11)
        self.subscription = create_subscription(
            customer=self.customer,
            product=product,
            batch=batch,
            lucky_id=lucky_id,
            tenure_months=12,
        )
        self.emi = create_emi(
            subscription=self.subscription,
            month_no=1,
            amount="100.00",
        )
        self.delivery = create_delivery(
            subscription=self.subscription,
            receiver_name="CRM Receiver",
            receiver_phone="01910000000",
        )
        self.finance_account = create_payment_collection_finance_account(
            code="CRM-TST-FIN-001",
            name="CRM Test Finance Account",
        )
        self.lead = create_public_lead(
            name="CRM Lead",
            phone="7388000902",
            city="Dhaka",
            interested_product="Wardrobe",
        )
        complete_public_lead_conversion(
            lead=self.lead,
            customer=self.customer,
            subscription=None,
            performed_by=self.admin,
        )

    def test_crm_overview_and_party_directory_surfaces_seeded_parties(self):
        overview = self.client.get("/api/v1/crm/overview/")
        self.assertEqual(overview.status_code, status.HTTP_200_OK, overview.data)
        self.assertGreaterEqual(overview.data["summary"]["party_count"], 1)
        self.assertGreaterEqual(len(overview.data["recent_leads"]), 1)

        parties = self.client.get("/api/v1/crm/parties/?role_type=LEAD")
        self.assertEqual(parties.status_code, status.HTTP_200_OK, parties.data)
        self.assertGreaterEqual(parties.data["count"], 1)
        self.assertIn("LEAD", parties.data["results"][0]["role_types"])

    def test_crm_party_detail_and_interaction_creation_work(self):
        parties = self.client.get("/api/v1/crm/parties/?role_type=LEAD")
        self.assertEqual(parties.status_code, status.HTTP_200_OK, parties.data)
        party_id = parties.data["results"][0]["id"]

        create_response = self.client.post(
            f"/api/v1/crm/parties/{party_id}/interactions/",
            {
                "interaction_type": "FOLLOW_UP",
                "subject": "Call back after showroom visit",
                "note": "Customer asked for a follow-up call tomorrow afternoon.",
                "next_follow_up_at": (timezone.now() + timedelta(days=1)).isoformat(),
                "create_follow_up_reminder": True,
            },
            format="json",
        )
        self.assertEqual(
            create_response.status_code,
            status.HTTP_200_OK,
            create_response.data,
        )
        self.assertEqual(
            create_response.data["interaction"]["interaction_type"],
            "FOLLOW_UP",
        )
        self.assertTrue(create_response.data["interaction"]["reminder"])

        detail = self.client.get(f"/api/v1/crm/parties/{party_id}/")
        self.assertEqual(detail.status_code, status.HTTP_200_OK, detail.data)
        self.assertEqual(detail.data["party"]["id"], party_id)
        self.assertGreaterEqual(detail.data["summary"]["lead_count"], 1)
        self.assertGreaterEqual(detail.data["summary"]["interaction_count"], 1)
        self.assertEqual(detail.data["related"]["interactions"][0]["interaction_type"], "FOLLOW_UP")

    def test_party_directory_merges_multiple_people_roles_on_shared_phone(self):
        shared_phone = "7388000999"
        shared_customer_user = create_customer_user(
            username="crm_customer_shared",
            phone="7388000988",
        )
        create_customer_profile(
            user=shared_customer_user,
            name="Unified Person",
            phone=shared_phone,
        )
        create_partner_user(
            username="crm_partner_shared",
            phone=shared_phone,
        )

        parties = self.client.get(f"/api/v1/crm/parties/?q={shared_phone}")
        self.assertEqual(parties.status_code, status.HTTP_200_OK, parties.data)
        self.assertGreaterEqual(parties.data["count"], 1)

        party_id = parties.data["results"][0]["id"]
        detail = self.client.get(f"/api/v1/crm/parties/{party_id}/")
        self.assertEqual(detail.status_code, status.HTTP_200_OK, detail.data)
        self.assertIn("CUSTOMER", detail.data["party"]["role_types"])
        self.assertIn("PARTNER", detail.data["party"]["role_types"])

        patch_response = self.client.patch(
            f"/api/v1/crm/parties/{party_id}/",
            {"notes_summary": "Shared profile across customer and partner contexts."},
            format="json",
        )
        self.assertEqual(patch_response.status_code, status.HTTP_200_OK, patch_response.data)
        self.assertEqual(
            patch_response.data["party"]["notes_summary"],
            "Shared profile across customer and partner contexts.",
        )

    def test_party_timeline_surfaces_payment_and_delivery_events(self):
        record_emi_payment(
            emi_id=self.emi.id,
            amount="100.00",
            collected_by=self.admin,
            method="CASH",
            reference_no="CRM-PAY-REF-001",
            finance_account_id=self.finance_account.id,
        )

        parties = self.client.get("/api/v1/crm/parties/?role_type=CUSTOMER")
        self.assertEqual(parties.status_code, status.HTTP_200_OK, parties.data)
        party_id = parties.data["results"][0]["id"]

        detail = self.client.get(f"/api/v1/crm/parties/{party_id}/")
        self.assertEqual(detail.status_code, status.HTTP_200_OK, detail.data)
        timeline = detail.data["timeline"]
        self.assertTrue(any(item.get("event_type") == "PAYMENT" for item in timeline))
        self.assertTrue(any(item.get("event_type") == "DELIVERY" for item in timeline))
        self.assertGreaterEqual(detail.data["summary"].get("payment_count", 0), 1)

    def test_non_admin_roles_cannot_access_admin_crm_surfaces(self):
        customer_user = create_customer_user(username="crm_non_admin_customer", phone="7388000122")
        partner_user = create_partner_user(username="crm_non_admin_partner", phone="7388000123")
        cashier_user = create_user(
            username="crm_non_admin_cashier",
            password="CashierPass123!",
            role="CASHIER",
            phone="7388000124",
        )

        for user in [customer_user, partner_user, cashier_user]:
            self.client.force_authenticate(user=user)
            overview = self.client.get("/api/v1/crm/overview/")
            self.assertEqual(overview.status_code, status.HTTP_403_FORBIDDEN, overview.data)
