from rest_framework import status
from rest_framework.test import APITestCase

from subscriptions.models_business_setup import PublicBusinessProfile


class PublicBusinessProfileApiTests(APITestCase):
    def test_public_profile_returns_null_when_missing(self):
        response = self.client.get("/api/v1/public/business-profile/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNone(response.data.get("profile"))

    def test_public_profile_returns_safe_fields(self):
        PublicBusinessProfile.objects.create(
            display_name="Subidha Furniture",
            tagline="Designed for the way you live",
            support_phone="9101000001",
            whatsapp_phone="9101000001",
            facebook_url="https://facebook.com/subidha",
            is_active=True,
        )

        response = self.client.get("/api/v1/public/business-profile/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        profile = response.data.get("profile")
        self.assertIsInstance(profile, dict)

        # Explicitly ensure admin/internal-only fields are not returned.
        self.assertNotIn("id", profile)
        self.assertNotIn("is_active", profile)
        self.assertNotIn("created_at", profile)

        self.assertEqual(profile.get("display_name"), "Subidha Furniture")
        self.assertEqual(profile.get("tagline"), "Designed for the way you live")

