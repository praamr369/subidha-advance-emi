from datetime import date
from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from accounting.models import (
    ChartOfAccount,
    ChartOfAccountType,
    JournalEntry,
    JournalEntryGroup,
    JournalEntryType,
)
from accounting.services.control_validation_service import (
    validate_financial_period_balance,
    validate_journal_group_balance,
)
from accounting.services.journal_posting_service import (
    create_journal_entry,
    post_journal_entry,
    reverse_journal_group,
)
from tests.helpers import create_admin_user, ensure_journal_numbering_profile_for_date


class AccountingControlLayerTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = create_admin_user(username="ctl_admin", phone="9811111111")
        self.client.force_authenticate(self.admin)
        self.cash = ChartOfAccount.objects.create(
            code="CTL-CASH",
            name="Control Cash",
            account_type=ChartOfAccountType.ASSET,
        )
        self.income = ChartOfAccount.objects.create(
            code="CTL-INCOME",
            name="Control Income",
            account_type=ChartOfAccountType.INCOME,
        )
        ensure_journal_numbering_profile_for_date(date(2026, 4, 30), performed_by=self.admin)

    def _create_balanced_group(self):
        entry = create_journal_entry(
            entry_date=date(2026, 4, 30),
            entry_type=JournalEntryType.SYSTEM_BRIDGE,
            memo="Control layer test entry",
            source_model="Payment",
            source_id="1",
            lines=[
                {"chart_account": self.cash, "debit_amount": Decimal("100.00"), "credit_amount": Decimal("0.00")},
                {"chart_account": self.income, "debit_amount": Decimal("0.00"), "credit_amount": Decimal("100.00")},
            ],
        )
        post_journal_entry(journal_entry_id=entry.id, posted_by=self.admin)
        group = JournalEntryGroup.objects.create(
            source_module="tests.accounting.test_control_layer",
            source_object_id=str(entry.id),
            transaction_date=entry.entry_date,
            narration="Balanced test group",
            total_debit=Decimal("100.00"),
            total_credit=Decimal("100.00"),
            created_by=self.admin,
        )
        JournalEntry.objects.filter(pk=entry.id).update(journal_group=group)
        return group

    def test_balanced_journal_validation(self):
        group = self._create_balanced_group()
        result = validate_journal_group_balance(group)
        self.assertTrue(result["is_balanced"])

    def test_unbalanced_detection(self):
        group = self._create_balanced_group()
        group.total_credit = Decimal("90.00")
        group.save(update_fields=["total_credit", "is_balanced", "updated_at"])
        summary = validate_financial_period_balance(date_from=date(2026, 4, 1), date_to=date(2026, 4, 30))
        self.assertGreaterEqual(summary["unbalanced_group_count"], 1)

    def test_reversal_creates_opposite_entries(self):
        group = self._create_balanced_group()
        reversal, created = reverse_journal_group(
            journal_group_id=group.id,
            reason="Test reversal",
            performed_by=self.admin,
        )
        self.assertTrue(created)
        original_lines = list(group.journal_entries.first().lines.order_by("id"))
        reversed_lines = list(reversal.journal_entries.first().lines.order_by("id"))
        self.assertEqual(len(original_lines), len(reversed_lines))
        self.assertEqual(original_lines[0].debit_amount, reversed_lines[0].credit_amount)
        self.assertEqual(original_lines[0].credit_amount, reversed_lines[0].debit_amount)

    def test_reversal_does_not_delete_original(self):
        group = self._create_balanced_group()
        original_entry_id = group.journal_entries.first().id
        reverse_journal_group(
            journal_group_id=group.id,
            reason="Keep original",
            performed_by=self.admin,
        )
        self.assertTrue(JournalEntry.objects.filter(id=original_entry_id).exists())

    def test_accounting_dashboard_loads(self):
        response = self.client.get("/api/v1/admin/accounting/control-center/")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertIn("kpis", response.data)

    def test_reports_match_existing_ledger_data(self):
        self._create_balanced_group()
        trial = self.client.get("/api/v1/accounting/reports/trial-balance/")
        self.assertEqual(trial.status_code, 200, trial.data)
        self.assertTrue(trial.data.get("balanced"))
