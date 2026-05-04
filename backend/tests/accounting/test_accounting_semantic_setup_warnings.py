from decimal import Decimal

from django.test import TestCase

from accounting.models import (
    ChartOfAccount,
    ChartOfAccountType,
    FinanceAccount,
    FinanceAccountCoaMapping,
    FinanceAccountKind,
    FinanceAccountMappingPurpose,
)
from accounting.services.accounting_setup_service import AccountingSetupService


class AccountingSemanticSetupWarningsTests(TestCase):
    def test_warns_when_bank_finance_primary_chart_is_cash_in_hand(self):
        cash_hand = ChartOfAccount.objects.create(
            code="SEM-CIH",
            name="Cash in Hand",
            account_type=ChartOfAccountType.ASSET,
            is_active=True,
            allow_manual_posting=True,
        )
        FinanceAccount.objects.create(
            name="SEM Broken Bank Anchor",
            kind=FinanceAccountKind.BANK,
            chart_account=cash_hand,
            opening_balance=Decimal("0.00"),
            is_active=True,
            is_real_settlement_account=True,
        )
        warnings = AccountingSetupService.get_setup_warnings()
        codes = [w["code"] for w in warnings]
        self.assertIn("BANK_FINANCE_ANCHORED_TO_CASH_IN_HAND", codes)

    def test_warns_when_upi_finance_primary_chart_is_cash_in_hand(self):
        cash_hand = ChartOfAccount.objects.create(
            code="SEM-CIH-UPI",
            name="Cash in Hand",
            account_type=ChartOfAccountType.ASSET,
            is_active=True,
            allow_manual_posting=True,
        )
        FinanceAccount.objects.create(
            name="SEM Broken UPI Anchor",
            kind=FinanceAccountKind.UPI,
            chart_account=cash_hand,
            opening_balance=Decimal("0.00"),
            is_active=True,
            is_real_settlement_account=True,
            upi_handle="bad@upi",
        )
        warnings = AccountingSetupService.get_setup_warnings()
        codes = [w["code"] for w in warnings]
        self.assertIn("UPI_FINANCE_ANCHORED_TO_CASH_IN_HAND", codes)

    def test_warns_when_bank_collection_mapping_targets_cash_in_hand(self):
        cash_hand = ChartOfAccount.objects.create(
            code="SEM-MAP-CIH",
            name="Cash in Hand",
            account_type=ChartOfAccountType.ASSET,
            is_active=True,
            allow_manual_posting=True,
        )
        bank_chart = ChartOfAccount.objects.create(
            code="SEM-MAP-BANK",
            name="Bank Account",
            account_type=ChartOfAccountType.ASSET,
            is_active=True,
            allow_manual_posting=True,
        )
        bank_fa = FinanceAccount.objects.create(
            name="SEM Broken Mapping Bank FA",
            kind=FinanceAccountKind.BANK,
            chart_account=bank_chart,
            opening_balance=Decimal("0.00"),
            is_active=True,
            is_real_settlement_account=True,
        )
        FinanceAccountCoaMapping.objects.create(
            finance_account=bank_fa,
            chart_account=cash_hand,
            purpose=FinanceAccountMappingPurpose.BANK_COLLECTION,
            is_active=True,
            is_default=False,
        )
        warnings = AccountingSetupService.get_setup_warnings()
        codes = [w["code"] for w in warnings]
        self.assertIn("BANK_COLLECTION_MAPPED_TO_CASH_IN_HAND", codes)
