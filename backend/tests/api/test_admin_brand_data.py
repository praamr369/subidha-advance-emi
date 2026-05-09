from unittest.mock import patch

from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import JournalEntry
from subscriptions.models import AuditLog, Commission, Emi, Payment, Subscription
from subscriptions.models_business_setup import BrandImportedItem, PublicBusinessProfile
from tests.helpers import create_admin_user, create_cashier_user


class AdminBrandDataApiTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="brand_admin", phone="9301000001")
        self.cashier = create_cashier_user(username="brand_cashier", phone="9301000002")
        self.manual_payload = {
            "brand_name": "Subidha Furniture",
            "tagline": "Designed for the way you live",
            "phone": "9000000001",
            "email": "hello@subidha.example",
            "address": "Main showroom address",
            "facebook_url": "https://facebook.com/subidha",
        }

    def test_only_admin_can_access_brand_import_apis(self):
        self.client.force_authenticate(self.cashier)
        response = self.client.get("/api/v1/admin/brand-data/sources/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_manual_preview_creates_pending_imported_items(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post("/api/v1/admin/brand-data/import/manual/preview/", self.manual_payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, msg=response.data)
        self.assertGreater(response.data["item_count"], 0)
        self.assertTrue(BrandImportedItem.objects.filter(approval_status=BrandImportedItem.ApprovalStatus.PENDING).exists())
        event = AuditLog.objects.order_by("-id").first()
        self.assertEqual(event.metadata.get("event"), "BRAND_IMPORT_PREVIEW_CREATED")

    def test_apply_requires_explicit_approved_item_ids(self):
        self.client.force_authenticate(self.admin)
        preview = self.client.post("/api/v1/admin/brand-data/import/manual/preview/", self.manual_payload, format="json")
        item_id = preview.data["items"][0]["id"]
        response = self.client.post("/api/v1/admin/brand-data/apply/", {"approved_item_ids": [item_id]}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_apply_updates_only_public_profile_fields(self):
        self.client.force_authenticate(self.admin)
        before_counts = {
            "payment": Payment.objects.count(),
            "subscription": Subscription.objects.count(),
            "emi": Emi.objects.count(),
            "commission": Commission.objects.count(),
            "journal": JournalEntry.objects.count(),
        }
        preview = self.client.post("/api/v1/admin/brand-data/import/manual/preview/", self.manual_payload, format="json")
        item_ids = [item["id"] for item in preview.data["items"]]
        for item_id in item_ids:
            approve = self.client.post("/api/v1/admin/brand-data/import/social-link/", {"item_id": item_id, "action": "approve"}, format="json")
            self.assertEqual(approve.status_code, status.HTTP_200_OK, msg=approve.data)
        apply_response = self.client.post("/api/v1/admin/brand-data/apply/", {"approved_item_ids": item_ids}, format="json")
        self.assertEqual(apply_response.status_code, status.HTTP_200_OK, msg=apply_response.data)
        profile = PublicBusinessProfile.objects.filter(is_active=True).first()
        self.assertIsNotNone(profile)
        self.assertEqual(profile.display_name, "Subidha Furniture")
        self.assertEqual(Payment.objects.count(), before_counts["payment"])
        self.assertEqual(Subscription.objects.count(), before_counts["subscription"])
        self.assertEqual(Emi.objects.count(), before_counts["emi"])
        self.assertEqual(Commission.objects.count(), before_counts["commission"])
        self.assertEqual(JournalEntry.objects.count(), before_counts["journal"])

    @patch.dict("os.environ", {}, clear=True)
    def test_provider_endpoints_fail_safely_when_credentials_missing(self):
        self.client.force_authenticate(self.admin)
        google = self.client.post("/api/v1/admin/brand-data/import/google-business/preview/", {}, format="json")
        youtube = self.client.post("/api/v1/admin/brand-data/import/youtube/preview/", {}, format="json")
        self.assertEqual(google.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(youtube.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(google.data.get("code"), "PROVIDER_NOT_CONFIGURED")
        self.assertEqual(youtube.data.get("code"), "PROVIDER_NOT_CONFIGURED")
