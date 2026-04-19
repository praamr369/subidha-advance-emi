from rest_framework import status
from rest_framework.test import APITestCase

from subscriptions.models_business_setup import PublicBusinessProfile
from tests.helpers import create_admin_user, create_user


class AdminPublicBusinessProfileApiTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="public_profile_admin", phone="9101000011")
        self.customer = create_user(
            username="public_profile_customer",
            password="CustomerPass123!",
            role="CUSTOMER",
            phone="9101000012",
            first_name="Public",
        )

    def test_admin_only_access_is_enforced(self):
        self.client.force_authenticate(self.customer)
        response = self.client.get("/api/v1/admin/public-site/profile/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_upsert_and_public_can_read(self):
        self.client.force_authenticate(self.admin)

        payload = {
            "display_name": "Subidha Furniture",
            "tagline": "Designed for the way you live",
            "support_phone": "9101000001",
            "support_email": "support@subidha.example",
            "whatsapp_phone": "+91 9101000001",
            "instagram_url": "https://instagram.com/subidha",
            "map_url": "https://maps.google.com/?q=subidha",
            "business_hours": "Mon–Sat: 10:00–20:00",
            "is_active": True,
        }

        response = self.client.patch("/api/v1/admin/public-site/profile/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK, msg=response.data)

        saved = PublicBusinessProfile.objects.filter(is_active=True).first()
        self.assertIsNotNone(saved)
        self.assertEqual(saved.whatsapp_phone, "9101000001")

        public = self.client.get("/api/v1/public/business-profile/")
        self.assertEqual(public.status_code, status.HTTP_200_OK)
        self.assertEqual(public.data["profile"]["display_name"], "Subidha Furniture")

    def test_whatsapp_phone_validation(self):
        self.client.force_authenticate(self.admin)
        payload = {"whatsapp_phone": "123", "is_active": True}
        response = self.client.patch("/api/v1/admin/public-site/profile/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

