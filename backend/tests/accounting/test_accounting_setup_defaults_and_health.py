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
    FinanceAccountMappingPurpose,
    FinanceAccountCoaMapping,
    JournalEntry,
    JournalEntryLine,
    JournalEntryStatus,
    JournalEntryType,
)
from accounting.services.setup_defaults_service import apply_accounting_setup_defaults
from accounting.services.setup_health_service import get_accounting_setup_health
from accounting.services.collection_mapping_repair_service import (
    CONFIRM_COLLECTION_MAPPING_REPAIR,
    execute_collection_mapping_repairs,
    preview_collection_mapping_repairs,
)
from accounting.services.system_accounts_service import ensure_system_account
from tests.helpers import create_admin_user
from tests.helpers import ensure_default_payment_collection_accounts
from accounting.services.accounting_setup_service import AccountingSetupService


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

    def test_setup_health_reports_multiple_ready_cash_accounts_as_info(self):
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
        FinanceAccountCoaMapping.objects.create(
            finance_account=FinanceAccount.objects.get(name="Health Dupe Cash Desk"),
            chart_account=cash_chart,
            purpose=FinanceAccountMappingPurpose.CASH_COLLECTION,
            is_active=True,
        )
        health = get_accounting_setup_health()
        self.assertNotEqual(health["status"], "BLOCKED")
        self.assertTrue(any(issue["code"] == "MULTIPLE_ACTIVE_CASH_ACCOUNTS" for issue in health["infos"]))
        self.assertFalse(any("Multiple active CASH" in str(msg) for msg in health["warnings"]))

    def test_setup_health_warns_when_extra_cash_account_is_unmapped(self):
        apply_accounting_setup_defaults(performed_by=self.admin)
        cash_chart = ChartOfAccount.objects.create(
            code="HEALTH-UNMAPPED-CASH",
            name="Health Unmapped Cash",
            account_type=ChartOfAccountType.ASSET,
            is_active=True,
            allow_manual_posting=True,
        )
        FinanceAccount.objects.create(
            name="Health Unmapped Cash Desk",
            kind=FinanceAccountKind.CASH,
            chart_account=cash_chart,
            opening_balance=Decimal("0.00"),
            is_active=True,
            is_real_settlement_account=True,
        )
        health = get_accounting_setup_health()
        self.assertEqual(health["status"], "WARNING")
        self.assertTrue(any(issue["code"] == "MULTIPLE_ACTIVE_CASH_ACCOUNTS_WITH_BLOCKED_MAPPING" for issue in health["warnings"]))

    def test_collection_mapping_repair_creates_missing_safe_mapping(self):
        cash_chart = ChartOfAccount.objects.create(
            code="REPAIR-MISSING-MAP",
            name="Repair Missing Mapping Cash",
            account_type=ChartOfAccountType.ASSET,
            is_active=True,
            allow_manual_posting=True,
        )
        finance_account = FinanceAccount.objects.create(
            name="Repair Missing Mapping Desk",
            kind=FinanceAccountKind.CASH,
            chart_account=cash_chart,
            opening_balance=Decimal("0.00"),
            is_active=True,
            is_real_settlement_account=True,
        )

        preview = preview_collection_mapping_repairs(finance_account_id=finance_account.id)
        self.assertEqual(preview["summary"]["repairable_count"], 1)

        result = execute_collection_mapping_repairs(
            actor=self.admin,
            confirmation_text=CONFIRM_COLLECTION_MAPPING_REPAIR,
            finance_account_id=finance_account.id,
        )

        self.assertEqual(result["summary"]["repaired_count"], 1)
        self.assertTrue(
            FinanceAccountCoaMapping.objects.filter(
                finance_account=finance_account,
                chart_account=cash_chart,
                purpose=FinanceAccountMappingPurpose.CASH_COLLECTION,
                is_active=True,
            ).exists()
        )

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

    def test_setup_health_reports_missing_before_defaults_and_clears_after_apply(self):
        before = get_accounting_setup_health()
        self.assertGreater(len(before["canonical_accounts"]["missing"]), 0)

        apply_accounting_setup_defaults(performed_by=self.admin)
        after = get_accounting_setup_health()
        self.assertEqual(len(after["canonical_accounts"]["missing"]), 0)

    def test_apply_defaults_is_idempotent_for_system_codes(self):
        apply_accounting_setup_defaults(performed_by=self.admin)
        first_count = ChartOfAccount.objects.exclude(system_code__isnull=True).exclude(system_code="").count()

        apply_accounting_setup_defaults(performed_by=self.admin)
        second_count = ChartOfAccount.objects.exclude(system_code__isnull=True).exclude(system_code="").count()

        self.assertEqual(first_count, second_count)

    def test_apply_defaults_maps_default_test_collection_accounts(self):
        ensure_default_payment_collection_accounts()
        apply_accounting_setup_defaults(performed_by=self.admin)

        self.assertTrue(
            FinanceAccountCoaMapping.objects.filter(
                finance_account__name__iexact="Default Test Cash Account",
                purpose=FinanceAccountMappingPurpose.CASH_COLLECTION,
                is_active=True,
            ).exists()
        )
        self.assertTrue(
            FinanceAccountCoaMapping.objects.filter(
                finance_account__name__iexact="Default Test Bank Account",
                purpose=FinanceAccountMappingPurpose.BANK_COLLECTION,
                is_active=True,
            ).exists()
        )
        self.assertTrue(
            FinanceAccountCoaMapping.objects.filter(
                finance_account__name__iexact="Default Test UPI Account",
                purpose=FinanceAccountMappingPurpose.UPI_COLLECTION,
                is_active=True,
            ).exists()
        )

    def test_validation_passes_after_defaults_and_fails_when_required_purpose_mapping_is_inactive(self):
        apply_accounting_setup_defaults(performed_by=self.admin)
        ready = AccountingSetupService.validate_accounting_setup()
        self.assertTrue(ready["mappings_complete"])

        mapping = FinanceAccountCoaMapping.objects.filter(
            purpose=FinanceAccountMappingPurpose.EMI_INCOME,
            is_active=True,
        ).first()
        self.assertIsNotNone(mapping)
        mapping.is_active = False
        mapping.save(update_fields=["is_active", "updated_at"])

        broken = AccountingSetupService.validate_accounting_setup()
        self.assertFalse(broken["mappings_complete"])
        self.assertIn(FinanceAccountMappingPurpose.EMI_INCOME, broken["missing_required_mappings"])

    def test_validation_warns_when_cash_collection_mapping_points_to_non_asset(self):
        apply_accounting_setup_defaults(performed_by=self.admin)
        liability = ChartOfAccount.objects.create(
            code="BAD-CASH-LIA",
            name="Bad Cash Liability",
            account_type=ChartOfAccountType.LIABILITY,
            is_active=True,
            allow_manual_posting=True,
        )
        mapping = FinanceAccountCoaMapping.objects.filter(
            purpose=FinanceAccountMappingPurpose.CASH_COLLECTION,
            is_active=True,
        ).first()
        self.assertIsNotNone(mapping)
        FinanceAccountCoaMapping.objects.filter(pk=mapping.pk).update(chart_account=liability)

        broken = AccountingSetupService.validate_accounting_setup()

        self.assertFalse(broken["mappings_complete"])
        self.assertTrue(any(w["code"] == "MAPPING_ACCOUNT_TYPE_MISMATCH" for w in broken["warnings"]))
