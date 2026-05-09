from rest_framework import status
from rest_framework.test import APITestCase

from subscriptions.models import AuditLog
from subscriptions.models_business_setup import PublicBusinessProfile
from tests.helpers import (
    create_admin_user,
    create_cashier_user,
    create_partner_user,
    create_user,
)


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
        self.partner = create_partner_user(username="public_profile_partner", phone="9101000013")
        self.cashier = create_cashier_user(username="public_profile_cashier", phone="9101000014")

    def test_admin_get_returns_safe_defaults_when_no_profile(self):
        self.assertFalse(PublicBusinessProfile.objects.exists())
        self.client.force_authenticate(self.admin)
        response = self.client.get("/api/v1/admin/public-site/profile/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, msg=response.data)
        self.assertEqual(response.data.get("display_name"), "")
        self.assertEqual(response.data.get("is_active"), True)

    def test_admin_only_access_is_enforced(self):
        self.client.force_authenticate(self.customer)
        response = self.client.get("/api/v1/admin/public-site/profile/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_partner_and_cashier_cannot_patch(self):
        payload = {"display_name": "X", "is_active": True}
        self.client.force_authenticate(self.partner)
        self.assertEqual(
            self.client.patch("/api/v1/admin/public-site/profile/", payload, format="json").status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.client.force_authenticate(self.cashier)
        self.assertEqual(
            self.client.patch("/api/v1/admin/public-site/profile/", payload, format="json").status_code,
            status.HTTP_403_FORBIDDEN,
        )

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

    def test_http_url_rejected_for_social_fields(self):
        self.client.force_authenticate(self.admin)
        payload = {"facebook_url": "http://facebook.com/x", "is_active": True}
        response = self.client.patch("/api/v1/admin/public-site/profile/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_invalid_support_email_rejected(self):
        self.client.force_authenticate(self.admin)
        payload = {"support_email": "not-an-email", "is_active": True}
        response = self.client.patch("/api/v1/admin/public-site/profile/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_audit_event_recorded_on_patch(self):
        before = AuditLog.objects.filter(action_type=AuditLog.ActionType.PUBLIC_SITE_UPDATED).count()
        self.client.force_authenticate(self.admin)
        response = self.client.patch(
            "/api/v1/admin/public-site/profile/",
            {"display_name": "Audited Store", "is_active": True},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, msg=response.data)
        after = AuditLog.objects.filter(action_type=AuditLog.ActionType.PUBLIC_SITE_UPDATED).count()
        self.assertEqual(after, before + 1)
        last = AuditLog.objects.filter(action_type=AuditLog.ActionType.PUBLIC_SITE_UPDATED).order_by("-id").first()
        self.assertEqual(last.metadata.get("event"), "PUBLIC_SITE_PROFILE_UPDATED")
