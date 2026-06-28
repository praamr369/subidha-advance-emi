from __future__ import annotations

from django.test import TestCase

from accounting.models import (
    FinanceAccount,
    FinanceAccountCoaMapping,
    FinanceAccountMappingPurpose,
)
from accounting.services.finance_account_collection_guard import (
    assert_finance_account_allowed_for_payment_collection,
    filter_finance_accounts_for_payment_collection,
)
from accounting.services.setup_defaults_service import (
    MAIN_BANK_UPI_FINANCE_ACCOUNT_NAME,
    MAIN_CASH_FINANCE_ACCOUNT_NAME,
    apply_accounting_setup_defaults,
)
from tests.helpers import create_admin_user


class TwoAccountFinanceSetupTests(TestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="two_account_admin", phone="9364001881")

    def test_apply_defaults_keeps_only_cash_and_combined_upi_bank_real_settlement_accounts(self):
        payload = apply_accounting_setup_defaults(performed_by=self.admin)

        self.assertEqual(payload["operating_model"], "TWO_REAL_SETTLEMENT_ACCOUNTS")
        active_real_accounts = list(
            FinanceAccount.objects.filter(is_active=True, is_real_settlement_account=True)
            .order_by("name")
            .values_list("name", flat=True)
        )
        self.assertEqual(
            active_real_accounts,
            [MAIN_CASH_FINANCE_ACCOUNT_NAME, MAIN_BANK_UPI_FINANCE_ACCOUNT_NAME],
        )

    def test_combined_upi_bank_account_is_default_for_bank_upi_and_gateway_collections(self):
        apply_accounting_setup_defaults(performed_by=self.admin)

        bank_upi = FinanceAccount.objects.get(name=MAIN_BANK_UPI_FINANCE_ACCOUNT_NAME)
        for purpose in (
            FinanceAccountMappingPurpose.BANK_COLLECTION,
            FinanceAccountMappingPurpose.UPI_COLLECTION,
            FinanceAccountMappingPurpose.PAYMENT_GATEWAY_COLLECTION,
        ):
            self.assertTrue(
                FinanceAccountCoaMapping.objects.filter(
                    finance_account=bank_upi,
                    purpose=purpose,
                    is_active=True,
                    is_default=True,
                ).exists(),
                msg=f"Missing default mapping for {purpose}",
            )

    def test_cash_account_is_default_for_cash_collection(self):
        apply_accounting_setup_defaults(performed_by=self.admin)

        cash = FinanceAccount.objects.get(name=MAIN_CASH_FINANCE_ACCOUNT_NAME)
        self.assertTrue(
            FinanceAccountCoaMapping.objects.filter(
                finance_account=cash,
                purpose=FinanceAccountMappingPurpose.CASH_COLLECTION,
                is_active=True,
                is_default=True,
            ).exists()
        )

    def test_business_semantic_mappings_stay_on_hidden_ledger_anchor(self):
        apply_accounting_setup_defaults(performed_by=self.admin)

        for purpose in (
            FinanceAccountMappingPurpose.CUSTOMER_RECEIVABLE,
            FinanceAccountMappingPurpose.EMI_INCOME,
            FinanceAccountMappingPurpose.RENT_INCOME,
            FinanceAccountMappingPurpose.LEASE_INCOME,
            FinanceAccountMappingPurpose.DIRECT_SALE_INCOME,
            FinanceAccountMappingPurpose.COMMISSION_PAYABLE,
            FinanceAccountMappingPurpose.COMMISSION_EXPENSE,
            FinanceAccountMappingPurpose.INVENTORY_ASSET,
            FinanceAccountMappingPurpose.SALARY_EXPENSE,
        ):
            mapping = FinanceAccountCoaMapping.objects.get(purpose=purpose, is_active=True, is_default=True)
            self.assertFalse(mapping.finance_account.is_real_settlement_account, msg=purpose)

    def test_receipt_guard_allows_only_the_two_real_settlement_accounts(self):
        apply_accounting_setup_defaults(performed_by=self.admin)

        selectable = list(
            filter_finance_accounts_for_payment_collection(FinanceAccount.objects.all())
            .order_by("name")
            .values_list("name", flat=True)
        )
        self.assertEqual(
            selectable,
            [MAIN_CASH_FINANCE_ACCOUNT_NAME, MAIN_BANK_UPI_FINANCE_ACCOUNT_NAME],
        )
        for account in FinanceAccount.objects.filter(name__in=selectable):
            assert_finance_account_allowed_for_payment_collection(account)
