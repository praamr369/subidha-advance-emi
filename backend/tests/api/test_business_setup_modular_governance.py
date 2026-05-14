from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import ChartOfAccount, ChartOfAccountType, FinanceAccountCoaMapping
from tests.helpers import create_admin_user, create_cashier_user, create_customer_user, create_partner_user


class BusinessSetupModularGovernanceTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="subidhafurniture", phone="919000001111")
        self.partner = create_partner_user(username="p1", phone="919000001112")
        self.cashier = create_cashier_user(username="c1", phone="919000001113")
        self.customer = create_customer_user(username="u1", phone="919000001114")

    def test_reset_scopes_endpoint_admin_only(self):
        self.client.force_authenticate(self.admin)
        ok = self.client.get("/api/v1/admin/business-setup/reset-scopes/")
        self.assertEqual(ok.status_code, status.HTTP_200_OK)
        self.assertIn("scopes", ok.data)

        for user in (self.partner, self.cashier, self.customer):
            self.client.force_authenticate(user)
            blocked = self.client.get("/api/v1/admin/business-setup/reset-scopes/")
            self.assertEqual(blocked.status_code, status.HTTP_403_FORBIDDEN)

    def test_public_profile_only_preview(self):
        self.client.force_authenticate(self.admin)
        res = self.client.post(
            "/api/v1/admin/business-setup/reset-preview-v2/",
            {"scopes": ["PUBLIC_PROFILE_ONLY"], "preserve_username": "subidhafurniture"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        labels = {row["label"] for row in res.data["targets"]["models"]}
        self.assertTrue(all(label.startswith("subscriptions.PublicBusinessProfile") for label in labels) or len(labels) == 0)

    def test_business_profile_only_preview(self):
        self.client.force_authenticate(self.admin)
        res = self.client.post(
            "/api/v1/admin/business-setup/reset-preview-v2/",
            {"scopes": ["BUSINESS_PROFILE_ONLY"], "preserve_username": "subidhafurniture"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        labels = {row["label"] for row in res.data["targets"]["models"]}
        self.assertTrue(all(label.startswith("subscriptions.BusinessProfile") for label in labels) or len(labels) == 0)

    def test_coa_mappings_only_preview_excludes_journal_by_scope(self):
        self.client.force_authenticate(self.admin)
        ChartOfAccount.objects.create(
            code="MAP-TEST-COA",
            name="Map Test",
            account_type=ChartOfAccountType.ASSET,
            is_active=True,
            allow_manual_posting=True,
        )
        res = self.client.post(
            "/api/v1/admin/business-setup/reset-preview-v2/",
            {"scopes": ["COA_MAPPINGS_ONLY"], "preserve_username": "subidhafurniture"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        labels = {row["label"] for row in res.data["targets"]["models"]}
        self.assertNotIn("accounting.JournalEntry", labels)
        self.assertNotIn("subscriptions.Payment", labels)

    def test_reset_execute_requires_typed_confirmation(self):
        self.client.force_authenticate(self.admin)
        res = self.client.post(
            "/api/v1/admin/business-setup/reset-v2/",
            {
                "scopes": ["PUBLIC_PROFILE_ONLY"],
                "preserve_username": "subidhafurniture",
                "confirmation_phrase": "WRONG",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_backup_creation_and_restore_preview_admin_only(self):
        self.client.force_authenticate(self.admin)
        backup = self.client.post(
            "/api/v1/admin/business-setup/backups/",
            {"job_type": "SELECTED_SCOPES_EXPORT", "scopes": ["PUBLIC_PROFILE_ONLY"]},
            format="json",
        )
        self.assertEqual(backup.status_code, status.HTTP_201_CREATED)
        backup_id = backup.data["id"]

        preview = self.client.post(
            "/api/v1/admin/business-setup/restore/preview/",
            {"backup_job_id": backup_id, "scopes": ["PUBLIC_PROFILE_ONLY"]},
            format="json",
        )
        self.assertEqual(preview.status_code, status.HTTP_200_OK)

        restore_execute = self.client.post(
            "/api/v1/admin/business-setup/restore/",
            {"restore_job_id": preview.data["restore_job_id"], "confirmation_phrase": "WRONG"},
            format="json",
        )
        self.assertEqual(restore_execute.status_code, status.HTTP_400_BAD_REQUEST)
