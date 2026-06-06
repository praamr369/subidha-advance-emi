from django.test import TestCase
from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import (
    AccountingBridgePosting,
    AccountingPostingProfile,
    ChartOfAccount,
    ChartOfAccountType,
    DocumentSequence,
    JournalEntry,
)
from accounting.services.accounting_mapping_remediation_service import build_mapping_remediation_summary
from tests.helpers import create_admin_user


class AccountingMappingRemediationServiceTests(TestCase):
    def test_read_only_summary_does_not_create_journal_or_document_sequence(self):
        journal_before = JournalEntry.objects.count()
        sequence_before = DocumentSequence.objects.count()

        payload = build_mapping_remediation_summary()

        self.assertEqual(JournalEntry.objects.count(), journal_before)
        self.assertEqual(DocumentSequence.objects.count(), sequence_before)
        self.assertTrue(payload["read_only"])
        self.assertEqual(payload["journal_entries_created"], 0)
        self.assertEqual(payload["document_sequences_allocated"], 0)


class AccountingMappingRemediationApiTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="mapping_remediation_admin", phone="9304000881")
        self.client.force_authenticate(user=self.admin)

    def test_remediation_summary_returns_cogs_and_staff_advance_blockers(self):
        response = self.client.get("/api/v1/admin/accounting/mapping-remediation/")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        rows = {row["event_type"]: row for row in response.data["rows"]}
        self.assertIn("inventory_delivery_out", rows)
        self.assertIn("manufacturing_wastage", rows)
        self.assertIn("staff_advance", rows)
        self.assertFalse(rows["staff_advance"]["can_post"])
        self.assertFalse(rows["staff_advance"]["is_supported"])
        self.assertEqual(rows["staff_advance"]["status"], "UNSUPPORTED_SOURCE")

    def test_create_missing_cogs_account_is_idempotent_and_does_not_post(self):
        bridge_before = AccountingBridgePosting.objects.count()
        journal_before = JournalEntry.objects.count()
        first = self.client.post(
            "/api/v1/admin/accounting/mapping-remediation/create-account/",
            {"event_type": "inventory_delivery_out"},
            format="json",
        )
        second = self.client.post(
            "/api/v1/admin/accounting/mapping-remediation/create-account/",
            {"event_type": "inventory_delivery_out"},
            format="json",
        )

        self.assertEqual(first.status_code, status.HTTP_200_OK, first.data)
        self.assertEqual(second.status_code, status.HTTP_200_OK, second.data)
        self.assertTrue(first.data["created"])
        self.assertFalse(second.data["created"])
        self.assertEqual(ChartOfAccount.objects.filter(system_code="COGS").count(), 1)
        account = ChartOfAccount.objects.get(system_code="COGS")
        self.assertEqual(account.account_type, ChartOfAccountType.EXPENSE)
        self.assertEqual(JournalEntry.objects.count(), journal_before)
        self.assertEqual(AccountingBridgePosting.objects.count(), bridge_before)

    def test_apply_cogs_mapping_is_idempotent_and_does_not_post(self):
        self.client.post(
            "/api/v1/admin/accounting/mapping-remediation/create-account/",
            {"event_type": "inventory_delivery_out"},
            format="json",
        )
        bridge_before = AccountingBridgePosting.objects.count()
        journal_before = JournalEntry.objects.count()
        first = self.client.post(
            "/api/v1/admin/accounting/mapping-remediation/apply/",
            {"event_type": "inventory_delivery_out"},
            format="json",
        )
        second = self.client.post(
            "/api/v1/admin/accounting/mapping-remediation/apply/",
            {"event_type": "inventory_delivery_out"},
            format="json",
        )

        self.assertEqual(first.status_code, status.HTTP_200_OK, first.data)
        self.assertEqual(second.status_code, status.HTTP_200_OK, second.data)
        self.assertTrue(first.data["created"])
        self.assertFalse(second.data["created"])
        self.assertEqual(AccountingPostingProfile.objects.filter(key="COGS").count(), 1)
        self.assertEqual(JournalEntry.objects.count(), journal_before)
        self.assertEqual(AccountingBridgePosting.objects.count(), bridge_before)

    def test_create_missing_manufacturing_wastage_account_is_idempotent(self):
        first = self.client.post(
            "/api/v1/admin/accounting/mapping-remediation/create-account/",
            {"event_type": "manufacturing_wastage"},
            format="json",
        )
        second = self.client.post(
            "/api/v1/admin/accounting/mapping-remediation/create-account/",
            {"event_type": "manufacturing_wastage"},
            format="json",
        )

        self.assertEqual(first.status_code, status.HTTP_200_OK, first.data)
        self.assertEqual(second.status_code, status.HTTP_200_OK, second.data)
        self.assertEqual(ChartOfAccount.objects.filter(system_code="MANUFACTURING_WASTAGE").count(), 1)
        self.assertTrue(first.data["created"])
        self.assertFalse(second.data["created"])

    def test_staff_advance_create_account_remains_blocked_without_source_model(self):
        response = self.client.post(
            "/api/v1/admin/accounting/mapping-remediation/create-account/",
            {"event_type": "staff_advance"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
        self.assertFalse(ChartOfAccount.objects.filter(system_code="STAFF_ADVANCE_ASSET").exists())
        self.assertFalse(AccountingPostingProfile.objects.filter(key="STAFF_ADVANCE_ASSET").exists())

    def test_bridge_reconciliation_filter_accepts_ready_unposted_status(self):
        response = self.client.get("/api/v1/accounting/bridge-reconciliation/?status=READY_UNPOSTED")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertIn("results", response.data)
