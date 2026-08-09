"""Layer-B: accounting bridge invariant.

Every accounting bridge (operational event -> journal) must produce a balanced
double-entry group: total debits == total credits. `validate_journal_group_balance`
is the shared guard used across the bridge family and the finance controls, so
proving it enforces the invariant once covers the whole bridge surface.
"""
from datetime import date
from decimal import Decimal

from django.test import TestCase

from accounting.models import (
    ChartOfAccount,
    JournalEntry,
    JournalEntryGroup,
    JournalEntryLine,
)
from accounting.services.control_validation_service import (
    validate_journal_group_balance,
)


class AccountingBridgeBalanceTest(TestCase):
    @classmethod
    def setUpTestData(cls):
        account_type = ChartOfAccount._meta.get_field("account_type").choices[0][0]
        cls.cash = ChartOfAccount.objects.create(name="Cash (test)", account_type=account_type)
        cls.rev = ChartOfAccount.objects.create(name="Revenue (test)", account_type=account_type)

    def _group(self, debit, credit, *, line_debit, line_credit):
        group = JournalEntryGroup.objects.create(
            source_module="test.bridge",
            source_object_id="1",
            transaction_date=date.today(),
            total_debit=Decimal(debit),
            total_credit=Decimal(credit),
        )
        entry = JournalEntry.objects.create(
            entry_date=date.today(), entry_type="SYSTEM_BRIDGE", journal_group=group
        )
        JournalEntryLine.objects.create(
            journal_entry=entry, chart_account=self.cash,
            debit_amount=Decimal(line_debit), credit_amount=Decimal("0.00"),
        )
        JournalEntryLine.objects.create(
            journal_entry=entry, chart_account=self.rev,
            debit_amount=Decimal("0.00"), credit_amount=Decimal(line_credit),
        )
        return group

    def test_balanced_group_validates(self):
        group = self._group("100.00", "100.00", line_debit="100.00", line_credit="100.00")
        result = validate_journal_group_balance(group)
        self.assertTrue(result["is_balanced"], result)
        self.assertEqual(result["computed_total_debit"], "100.00")
        self.assertEqual(result["computed_total_credit"], "100.00")

    def test_unbalanced_lines_fail(self):
        # Lines don't balance (debit 100 vs credit 90) -> invariant violated.
        group = self._group("100.00", "100.00", line_debit="100.00", line_credit="90.00")
        self.assertFalse(validate_journal_group_balance(group)["is_balanced"])

    def test_stored_totals_mismatch_fails(self):
        # Lines balance but stored group totals disagree -> still flagged.
        group = self._group("100.00", "999.00", line_debit="100.00", line_credit="100.00")
        self.assertFalse(validate_journal_group_balance(group)["is_balanced"])
