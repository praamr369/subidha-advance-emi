from __future__ import annotations

from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from accounting.models import (
    AccountingPostingProfile,
    ChartOfAccount,
    ChartOfAccountType,
    FinanceAccount,
    FinanceAccountKind,
    JournalEntry,
    JournalEntryLine,
    JournalEntryStatus,
    JournalEntryType,
)
from accounting.services.setup_defaults_service import apply_accounting_setup_defaults
from accounting.services.setup_health_service import get_accounting_setup_health
from accounting.services.system_accounts_service import ensure_system_account
from tests.helpers import create_admin_user


class SystemAccountEnsureTests(TestCase):
    def test_ensure_system_account_claims_existing_code_row_with_missing_system_code(self):
        row = ChartOfAccount.objects.create(
            code="AR-1000",
            name="Receivables Legacy",
            account_type=ChartOfAccountType.ASSET,
            is_active=False,
            allow_manual_posting=True,
        )
        result = ensure_system_account(
            system_code="CUSTOMER_RECEIVABLE",
            code="AR-1000",
            name="Accounts Receivable",
            account_type=ChartOfAccountType.ASSET,
            allow_manual_posting=False,
            reactivate=False,
        )
        self.assertFalse(result.created)
        self.assertTrue(result.claimed)
        self.assertFalse(result.conflict)

        row.refresh_from_db()
        self.assertEqual(row.system_code, "CUSTOMER_RECEIVABLE")
        self.assertEqual(row.code, "AR-1000")
        self.assertEqual(row.name, "Accounts Receivable")
        self.assertEqual(row.account_type, ChartOfAccountType.ASSET)
        self.assertFalse(row.allow_manual_posting)
        self.assertFalse(row.is_active)

    def test_ensure_system_account_does_not_overwrite_different_system_code(self):
        row = ChartOfAccount.objects.create(
            code="AR-1000",
            name="Receivables Claimed Elsewhere",
            account_type=ChartOfAccountType.ASSET,
            is_active=True,
            allow_manual_posting=True,
            system_code="SOME_OTHER_SYSTEM_CODE",
        )
        result = ensure_system_account(
            system_code="CUSTOMER_RECEIVABLE",
            code="AR-1000",
            name="Accounts Receivable",
            account_type=ChartOfAccountType.ASSET,
            allow_manual_posting=False,
            reactivate=True,
        )
        self.assertFalse(result.created)
        self.assertFalse(result.claimed)
        self.assertTrue(result.conflict)

        row.refresh_from_db()
        self.assertEqual(row.system_code, "SOME_OTHER_SYSTEM_CODE")
        self.assertEqual(row.name, "Receivables Claimed Elsewhere")


class SetupDefaultsAndHealthTests(TestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="acct_defaults_admin", phone="9364000991")

    def test_apply_defaults_creates_canonical_accounts_posting_profiles_and_marks_legacy_duplicates(self):
        legacy = ChartOfAccount.objects.create(
            code="COA-20260501000000",
            name="Cash in Hand",
            account_type=ChartOfAccountType.ASSET,
            is_active=True,
            allow_manual_posting=True,
        )
        payload = apply_accounting_setup_defaults(performed_by=self.admin)
        self.assertNotEqual(payload.get("status"), "BLOCKED")

        self.assertTrue(ChartOfAccount.objects.filter(system_code="CASH_COLLECTION", code="CASH-1000").exists())
        self.assertTrue(AccountingPostingProfile.objects.filter(key="CUSTOMER_RECEIVABLE", is_active=True).exists())

        legacy.refresh_from_db()
        self.assertTrue(legacy.is_legacy)
        self.assertTrue(bool(legacy.superseded_by_id))

    def test_setup_health_blocks_multiple_active_settlement_finance_accounts(self):
        apply_accounting_setup_defaults(performed_by=self.admin)
        cash_chart = ChartOfAccount.objects.create(
            code="HEALTH-DUPE-CASH",
            name="Health Dupe Cash",
            account_type=ChartOfAccountType.ASSET,
            is_active=True,
            allow_manual_posting=True,
        )
        FinanceAccount.objects.create(
            name="Health Dupe Cash Desk",
            kind=FinanceAccountKind.CASH,
            chart_account=cash_chart,
            opening_balance=Decimal("0.00"),
            is_active=True,
            is_real_settlement_account=True,
        )
        health = get_accounting_setup_health()
        self.assertEqual(health["status"], "BLOCKED")
        self.assertTrue(any("Multiple active CASH" in msg for msg in health["blockers"]))

    def test_setup_health_warns_when_legacy_coa_rows_exist(self):
        apply_accounting_setup_defaults(performed_by=self.admin)
        ChartOfAccount.objects.create(
            code="COA-20260502000000",
            name="Legacy Noise Account",
            account_type=ChartOfAccountType.EXPENSE,
            is_active=True,
            allow_manual_posting=True,
            is_legacy=True,
            legacy_reason="Legacy compatibility fixture",
        )
        health = get_accounting_setup_health()
        self.assertIn(health["status"], {"OK", "WARNING"})
        self.assertTrue(any("COA-*" in w for w in health["warnings"]))

    def test_setup_health_blocks_zero_line_and_unbalanced_posted_journals(self):
        apply_accounting_setup_defaults(performed_by=self.admin)
        asset = ChartOfAccount.objects.create(
            code="HLTH-J-ASSET",
            name="Health Journal Asset",
            account_type=ChartOfAccountType.ASSET,
            is_active=True,
            allow_manual_posting=True,
        )
        income = ChartOfAccount.objects.create(
            code="HLTH-J-INCOME",
            name="Health Journal Income",
            account_type=ChartOfAccountType.INCOME,
            is_active=True,
            allow_manual_posting=True,
        )
        # Zero-line posted journal
        JournalEntry.objects.create(
            entry_date=timezone.localdate(),
            entry_type=JournalEntryType.MANUAL,
            status=JournalEntryStatus.POSTED,
            memo="Zero line posted journal",
            posted_by=self.admin,
            posted_at=timezone.now(),
            approved_by=self.admin,
            approved_at=timezone.now(),
        )
        # Unbalanced posted journal
        unbalanced = JournalEntry.objects.create(
            entry_date=timezone.localdate(),
            entry_type=JournalEntryType.MANUAL,
            status=JournalEntryStatus.POSTED,
            memo="Unbalanced posted journal",
            posted_by=self.admin,
            posted_at=timezone.now(),
            approved_by=self.admin,
            approved_at=timezone.now(),
        )
        JournalEntryLine.objects.create(
            journal_entry=unbalanced,
            chart_account=asset,
            debit_amount=Decimal("10.00"),
            credit_amount=Decimal("0.00"),
        )
        JournalEntryLine.objects.create(
            journal_entry=unbalanced,
            chart_account=income,
            debit_amount=Decimal("0.00"),
            credit_amount=Decimal("9.00"),
        )
        health = get_accounting_setup_health()
        self.assertEqual(health["status"], "BLOCKED")
        self.assertGreaterEqual(health["journals"]["posted_zero_line_count"], 1)
        self.assertGreaterEqual(health["journals"]["posted_unbalanced_count"], 1)
