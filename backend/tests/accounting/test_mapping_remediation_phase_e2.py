from datetime import date

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import (
    AccountingPeriod,
    AccountingPeriodStatus,
    ChartOfAccount,
    ChartOfAccountType,
    DocumentSequence,
    FinancialYear,
    JournalEntry,
)
from accounting.services.accounting_mapping_remediation_service import build_mapping_remediation_summary
from tests.helpers import create_admin_user, create_customer_user


class AccountingMappingRemediationPhaseE2Tests(APITestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="phase_e2_mapping_admin", phone="9304000911")
        self.client.force_authenticate(user=self.admin)

    def test_read_only_mapping_remediation_creates_no_journal_or_document_sequence(self):
        journal_before = JournalEntry.objects.count()
        sequence_before = DocumentSequence.objects.count()

        payload = build_mapping_remediation_summary()

        self.assertTrue(payload["read_only"])
        self.assertIn("rows", payload)
        self.assertEqual(JournalEntry.objects.count(), journal_before)
        self.assertEqual(DocumentSequence.objects.count(), sequence_before)

    def test_seed_supported_defaults_creates_no_journal_or_document_sequence(self):
        journal_before = JournalEntry.objects.count()
        sequence_before = DocumentSequence.objects.count()

        response = self.client.post("/api/v1/admin/accounting/mapping-remediation/seed-supported-defaults/", {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["journal_entries_created"], 0)
        self.assertEqual(response.data["document_sequences_allocated"], 0)
        self.assertEqual(JournalEntry.objects.count(), journal_before)
        self.assertEqual(DocumentSequence.objects.count(), sequence_before)

    def test_staff_advance_remains_unsupported_and_non_postable(self):
        response = self.client.get("/api/v1/admin/accounting/mapping-remediation/")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        rows = {row["event_type"]: row for row in response.data["rows"]}
        self.assertIn("staff_advance", rows)
        self.assertEqual(rows["staff_advance"]["status"], "UNSUPPORTED_SOURCE")
        self.assertFalse(rows["staff_advance"]["can_post"])
        self.assertFalse(rows["staff_advance"]["can_apply_mapping"])

    def test_create_cogs_account_action_creates_no_journal(self):
        before = JournalEntry.objects.count()
        response = self.client.post(
            "/api/v1/admin/accounting/mapping-remediation/create-account/",
            {"event_type": "inventory_delivery_out"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(JournalEntry.objects.count(), before)
        self.assertTrue(ChartOfAccount.objects.filter(system_code="COGS", account_type=ChartOfAccountType.EXPENSE).exists())

    def test_apply_cogs_mapping_action_creates_no_journal(self):
        self.client.post(
            "/api/v1/admin/accounting/mapping-remediation/create-account/",
            {"event_type": "inventory_delivery_out"},
            format="json",
        )
        before = JournalEntry.objects.count()
        response = self.client.post(
            "/api/v1/admin/accounting/mapping-remediation/apply/",
            {"event_type": "inventory_delivery_out"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(JournalEntry.objects.count(), before)

    def test_customer_cannot_use_mapping_setup_actions(self):
        customer = create_customer_user(username="phase_e2_customer", phone="9304000912")
        self.client.force_authenticate(user=customer)

        response = self.client.post("/api/v1/admin/accounting/mapping-remediation/seed-supported-defaults/", {}, format="json")

        self.assertIn(response.status_code, {status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN})

    def test_generate_current_period_creates_only_missing_current_period(self):
        today = timezone.localdate()
        FinancialYear.objects.update(is_active=False)
        fy = FinancialYear.objects.create(
            code=f"FY{today.year}-{str(today.year + 1)[-2:]}",
            name="Current Test FY",
            start_date=date(today.year, 4, 1) if today.month >= 4 else date(today.year - 1, 4, 1),
            end_date=date(today.year + 1, 3, 31) if today.month >= 4 else date(today.year, 3, 31),
            is_active=True,
        )
        AccountingPeriod.objects.filter(financial_year=fy, start_date__lte=today, end_date__gte=today).delete()
        journal_before = JournalEntry.objects.count()

        response = self.client.post("/api/v1/accounting/periods/generate-current/", {}, format="json")
        second = self.client.post("/api/v1/accounting/periods/generate-current/", {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertTrue(response.data["created"])
        self.assertEqual(second.status_code, status.HTTP_200_OK, second.data)
        self.assertFalse(second.data["created"])
        self.assertEqual(JournalEntry.objects.count(), journal_before)
        self.assertEqual(AccountingPeriod.objects.filter(financial_year=fy, status=AccountingPeriodStatus.OPEN).count(), 1)
