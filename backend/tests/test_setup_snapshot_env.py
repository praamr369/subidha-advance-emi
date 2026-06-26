"""Environment rules for setup-snapshot export/import.

Export is allowed in all environments (read-only). Import (write) is permitted
only in dev/staging/test and is fail-closed in production.
"""

from django.test import TestCase, override_settings

from subscriptions.services.setup_snapshot_service import (
    SCHEMA_VERSION,
    SetupSnapshotImportError,
    EXCLUDED_TRANSACTIONAL_MODEL_PREFIXES,
    export_setup_snapshot,
    import_setup_snapshot,
    is_setup_import_allowed,
    validate_setup_snapshot_payload,
)


class SetupSnapshotExportTests(TestCase):
    def test_export_includes_schema_version_and_no_transactional_sections(self):
        payload = export_setup_snapshot(exported_by="tester").payload
        self.assertEqual(payload["schema_version"], SCHEMA_VERSION)
        self.assertEqual(payload["kind"], "setup_snapshot")
        self.assertIn("sections", payload)
        for label in payload["sections"].keys():
            for prefix in EXCLUDED_TRANSACTIONAL_MODEL_PREFIXES:
                self.assertFalse(
                    label.startswith(prefix),
                    msg=f"Transactional section leaked into export: {label}",
                )

    @override_settings(DEBUG=False, ENVIRONMENT_NAME="production")
    def test_export_allowed_in_production(self):
        # Export is read-only and must work for production admins.
        payload = export_setup_snapshot(exported_by="prod-admin").payload
        self.assertEqual(payload["schema_version"], SCHEMA_VERSION)


class SetupSnapshotImportEnvTests(TestCase):
    def _minimal_payload(self):
        return {
            "kind": "setup_snapshot",
            "schema_version": SCHEMA_VERSION,
            "sections": {
                "reminders.NotificationTemplate": [
                    {
                        "model": "reminders.notificationtemplate",
                        "pk": 999001,
                        "fields": {
                            "key": "SNAPSHOT_TEST_TEMPLATE",
                            "name": "Snapshot Test",
                            "channel": "EMAIL",
                            "subject": "Hi",
                            "body": "Body",
                            "is_active": True,
                            "description": "",
                        },
                    }
                ]
            },
        }

    @override_settings(DEBUG=False, ENVIRONMENT_NAME="production")
    def test_import_blocked_in_production(self):
        self.assertFalse(is_setup_import_allowed())
        with self.assertRaises(SetupSnapshotImportError):
            import_setup_snapshot(payload=self._minimal_payload(), dry_run=False)

    @override_settings(DEBUG=False, ENVIRONMENT_NAME="staging")
    def test_import_allowed_in_staging(self):
        self.assertTrue(is_setup_import_allowed())
        result = import_setup_snapshot(payload=self._minimal_payload(), dry_run=False)
        self.assertEqual(result["mode"], "applied")
        from reminders.models import NotificationTemplate

        self.assertTrue(
            NotificationTemplate.objects.filter(key="SNAPSHOT_TEST_TEMPLATE").exists()
        )

    @override_settings(DEBUG=True, ENVIRONMENT_NAME="development")
    def test_import_idempotent_in_dev(self):
        payload = self._minimal_payload()
        import_setup_snapshot(payload=payload, dry_run=False)
        import_setup_snapshot(payload=payload, dry_run=False)  # second run must not duplicate
        from reminders.models import NotificationTemplate

        self.assertEqual(
            NotificationTemplate.objects.filter(key="SNAPSHOT_TEST_TEMPLATE").count(), 1
        )

    @override_settings(DEBUG=False, ENVIRONMENT_NAME="production")
    def test_dry_run_preview_allowed_in_production(self):
        # Preview (read) is allowed everywhere and reports it cannot write here.
        result = import_setup_snapshot(payload=self._minimal_payload(), dry_run=True)
        self.assertFalse(result["import_allowed_here"])

    def test_validation_rejects_transactional_section(self):
        bad = {
            "kind": "setup_snapshot",
            "schema_version": SCHEMA_VERSION,
            "sections": {"subscriptions.Payment": [{"pk": 1, "fields": {}}]},
        }
        errors = validate_setup_snapshot_payload(bad)
        self.assertTrue(any("Payment" in e for e in errors))
