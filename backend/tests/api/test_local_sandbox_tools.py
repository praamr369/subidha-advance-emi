from rest_framework import status
from rest_framework.test import APITestCase
from django.test import override_settings

from accounting.models import ChartOfAccount, ChartOfAccountType
from tests.helpers import create_admin_user, create_customer_user, create_partner_user
from subscriptions.services.setup_snapshot_service import export_setup_snapshot, import_setup_snapshot


class LocalSandboxToolsApiTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="subidhafurniture", phone="919900000001")
        self.partner = create_partner_user(username="pt", phone="919900000002")
        self.customer = create_customer_user(username="ct", phone="919900000003")

    def test_setup_readiness_admin_only(self):
        self.client.force_authenticate(self.admin)
        ok = self.client.get("/api/v1/admin/setup-readiness/")
        self.assertEqual(ok.status_code, status.HTTP_200_OK)

        self.client.force_authenticate(self.partner)
        denied = self.client.get("/api/v1/admin/setup-readiness/")
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)

    @override_settings(DEBUG=False, ENVIRONMENT_NAME="production")
    def test_local_tools_disabled_in_production_like(self):
        self.client.force_authenticate(self.admin)
        blocked = self.client.get("/api/v1/admin/setup-readiness/")
        self.assertEqual(blocked.status_code, status.HTTP_403_FORBIDDEN)

    def test_export_excludes_transactional_sections(self):
        payload = export_setup_snapshot().payload
        sections = payload.get("sections", {})
        self.assertNotIn("subscriptions.Customer", sections)
        self.assertNotIn("subscriptions.Payment", sections)

    def test_import_restores_setup_snapshot(self):
        coa = ChartOfAccount.objects.create(code="SNAP-COA-001", name="Snapshot COA", account_type=ChartOfAccountType.ASSET, is_active=True)
        payload = export_setup_snapshot().payload
        ChartOfAccount.objects.filter(id=coa.id).delete()
        self.assertFalse(ChartOfAccount.objects.filter(code="SNAP-COA-001").exists())
        import_setup_snapshot(payload=payload, dry_run=False)
        self.assertTrue(ChartOfAccount.objects.filter(code="SNAP-COA-001").exists())

    def test_reset_requires_phrase(self):
        self.client.force_authenticate(self.admin)
        res = self.client.post(
            "/api/v1/admin/local-sandbox/reset/",
            {
                "scopes": ["customers"],
                "preserve_admin_username": "subidhafurniture",
                "preserve_setup": True,
                "confirm_phrase": "WRONG",
                "dry_run": True,
                "sandbox_only": True,
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_setup_snapshot_restore_preview_included_and_excluded(self):
        self.client.force_authenticate(self.admin)
        payload = export_setup_snapshot().payload
        res = self.client.post(
            "/api/v1/admin/business-setup/restore/preview/",
            {
                "restore_type": "SETUP_SNAPSHOT_RESTORE_PREVIEW",
                "snapshot_payload": payload,
                "preserve_admin_username": "subidhafurniture",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        preview = res.data["preview"]
        self.assertIn("included_sections", preview)
        self.assertIn("excluded_sections", preview)
        self.assertIn("checklist", preview)

    def test_setup_snapshot_restore_rejects_transactional_models(self):
        self.client.force_authenticate(self.admin)
        payload = export_setup_snapshot().payload
        payload["sections"]["subscriptions.Payment"] = []
        res = self.client.post(
            "/api/v1/admin/business-setup/restore/preview/",
            {
                "restore_type": "SETUP_SNAPSHOT_RESTORE_PREVIEW",
                "snapshot_payload": payload,
                "preserve_admin_username": "subidhafurniture",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertFalse(res.data["preview"]["allowed_to_restore"])

    def test_setup_snapshot_restore_requires_exact_phrase(self):
        self.client.force_authenticate(self.admin)
        payload = export_setup_snapshot().payload
        prev = self.client.post(
            "/api/v1/admin/business-setup/restore/preview/",
            {
                "restore_type": "SETUP_SNAPSHOT_RESTORE_PREVIEW",
                "snapshot_payload": payload,
                "preserve_admin_username": "subidhafurniture",
            },
            format="json",
        )
        restore_job_id = prev.data["restore_job_id"]
        execute = self.client.post(
            "/api/v1/admin/business-setup/restore/",
            {"restore_job_id": restore_job_id, "confirmation_phrase": "WRONG"},
            format="json",
        )
        self.assertEqual(execute.status_code, status.HTTP_400_BAD_REQUEST)

    @override_settings(DEBUG=False, ENVIRONMENT_NAME="production")
    def test_setup_snapshot_restore_preview_blocked_in_production_like(self):
        self.client.force_authenticate(self.admin)
        payload = export_setup_snapshot().payload
        res = self.client.post(
            "/api/v1/admin/business-setup/restore/preview/",
            {
                "restore_type": "SETUP_SNAPSHOT_RESTORE_PREVIEW",
                "snapshot_payload": payload,
                "preserve_admin_username": "subidhafurniture",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertFalse(res.data["preview"]["allowed_to_restore"])
