from datetime import timedelta

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from subscriptions.services.public_lead_service import (
    complete_public_lead_conversion,
    create_public_lead,
)
from tests.helpers import create_admin_user, create_customer_profile, create_customer_user, create_partner_user


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
