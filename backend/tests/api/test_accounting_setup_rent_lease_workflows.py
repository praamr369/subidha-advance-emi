from rest_framework.test import APITestCase

from accounting.models import (
    AccountingPostingProfile,
    ChartOfAccount,
    ChartOfAccountType,
    FinanceAccountMappingPurpose,
)
from accounting.services.accounting_setup_matrix_service import build_accounting_setup_matrix


class AccountingSetupRentLeaseWorkflowReadinessTests(APITestCase):
    def _coa(self, code, name, account_type):
        return ChartOfAccount.objects.create(
            code=code,
            name=name,
            account_type=account_type,
            is_active=True,
            allow_manual_posting=True,
        )

    def _profile(self, key, account):
        return AccountingPostingProfile.objects.create(
            key=key,
            label=key.replace("_", " ").title(),
            chart_account=account,
            is_active=True,
            is_system_only=True,
        )

    def _row(self, key):
        payload = build_accounting_setup_matrix()
        return next(row for row in payload["posting_profile_readiness"] if row["key"] == key)

    def test_rent_lease_collection_ready_when_required_accounts_exist(self):
        asset = self._coa("RL-CASH", "Rent Lease Cash", ChartOfAccountType.ASSET)
        rent_income = self._coa("RL-RENT", "Rent Income", ChartOfAccountType.INCOME)
        lease_income = self._coa("RL-LEASE", "Lease Income", ChartOfAccountType.INCOME)
        self._profile("CASH_COLLECTION", asset)
        self._profile("BANK_COLLECTION", asset)
        self._profile("UPI_COLLECTION", asset)
        self._profile(FinanceAccountMappingPurpose.RENT_INCOME, rent_income)
        self._profile(FinanceAccountMappingPurpose.LEASE_INCOME, lease_income)

        row = self._row("rent_lease_collection")

        self.assertTrue(row["implemented"])
        self.assertEqual(row["status"], "READY")
        self.assertEqual(row["blockers"], [])
        self.assertIn("Operational source collection is enabled", row["operator_note"])

    def test_security_deposit_ready_when_required_accounts_exist(self):
        asset = self._coa("RL-CASH-DEP", "Deposit Cash", ChartOfAccountType.ASSET)
        liability = self._coa("RL-DEP-LIAB", "Security Deposit Liability", ChartOfAccountType.LIABILITY)
        self._profile("CASH_COLLECTION", asset)
        self._profile("BANK_COLLECTION", asset)
        self._profile("UPI_COLLECTION", asset)
        self._profile(FinanceAccountMappingPurpose.SECURITY_DEPOSIT_LIABILITY, liability)

        row = self._row("security_deposit")

        self.assertTrue(row["implemented"])
        self.assertEqual(row["status"], "READY")
        self.assertEqual(row["blockers"], [])
        self.assertIn("Accounting posting bridge remains audit-deferred", row["operator_note"])

    def test_missing_rent_lease_accounts_block_readiness_not_fake_ready(self):
        row = self._row("rent_lease_collection")

        self.assertTrue(row["implemented"])
        self.assertIn(row["status"], {"BLOCKED", "PARTIAL"})
        self.assertNotEqual(row["status"], "READY")
        self.assertGreater(len(row["blockers"]), 0)

    def test_missing_security_deposit_liability_blocks_readiness_not_fake_ready(self):
        asset = self._coa("RL-CASH-ONLY", "Cash Only", ChartOfAccountType.ASSET)
        self._profile("CASH_COLLECTION", asset)
        self._profile("BANK_COLLECTION", asset)
        self._profile("UPI_COLLECTION", asset)

        row = self._row("security_deposit")

        self.assertTrue(row["implemented"])
        self.assertNotEqual(row["status"], "READY")
        self.assertTrue(any("SECURITY_DEPOSIT_LIABILITY" in blocker for blocker in row["blockers"]))
