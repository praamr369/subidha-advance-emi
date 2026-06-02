from django.test import TestCase
from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import (
    ChartOfAccount,
    ChartOfAccountType,
    FinanceAccount,
    FinanceAccountCoaMapping,
    FinanceAccountKind,
    FinanceAccountMappingPurpose,
    JournalEntry,
    RentLeaseAccountingAccountMapping,
)
from billing.models import ReceiptDocument
from reconciliation.models import ReconciliationItem
from subscriptions.models import Payment
from subscriptions.services.rent_lease_accounting_readiness_service import (
    get_rent_lease_accounting_readiness as canonical_readiness,
)
from subscriptions.services.rent_lease_accounting_posting_service import get_rent_lease_accounting_readiness
from subscriptions.services.rent_lease_finance_sync_service import (
    ensure_premade_rent_lease_accounting_setup,
)
from tests.helpers import create_admin_user


class RentLeasePremadeAccountingSetupTests(TestCase):
    def test_ensure_premade_creates_valid_mapping_without_financial_documents(self):
        before = {
            "journals": JournalEntry.objects.count(),
            "payments": Payment.objects.count(),
            "receipts": ReceiptDocument.objects.count(),
            "reconciliation_items": ReconciliationItem.objects.count(),
        }

        mapping = ensure_premade_rent_lease_accounting_setup()

        self.assertEqual(mapping.monthly_income_account.account_type, ChartOfAccountType.INCOME)
        self.assertEqual(mapping.deposit_liability_account.account_type, ChartOfAccountType.LIABILITY)
        self.assertEqual(mapping.deposit_refund_account.account_type, ChartOfAccountType.ASSET)
        self.assertEqual(mapping.damage_recovery_income_account.account_type, ChartOfAccountType.INCOME)
        self.assertIsNotNone(mapping.settlement_finance_account)
        self.assertTrue(mapping.settlement_finance_account.is_active)
        self.assertTrue(mapping.settlement_finance_account.is_real_settlement_account)
        self.assertEqual(mapping.settlement_finance_account.chart_account.account_type, ChartOfAccountType.ASSET)
        self.assertTrue(mapping.settlement_finance_account.chart_account.is_active)
        self.assertEqual(JournalEntry.objects.count(), before["journals"])
        self.assertEqual(Payment.objects.count(), before["payments"])
        self.assertEqual(ReceiptDocument.objects.count(), before["receipts"])
        self.assertEqual(ReconciliationItem.objects.count(), before["reconciliation_items"])
        self.assertEqual(get_rent_lease_accounting_readiness()["status"], "READY")
        self.assertEqual(canonical_readiness()["status"], "READY")
        self.assertTrue(
            FinanceAccountCoaMapping.objects.filter(
                finance_account=mapping.settlement_finance_account,
                purpose=FinanceAccountMappingPurpose.CASH_COLLECTION,
                chart_account=mapping.settlement_finance_account.chart_account,
                is_active=True,
            ).exists()
        )

    def test_ensure_premade_repairs_inactive_monthly_income_account(self):
        mapping = ensure_premade_rent_lease_accounting_setup()
        broken_monthly = mapping.monthly_income_account
        broken_monthly.is_active = False
        broken_monthly.save(update_fields=["is_active", "updated_at"])

        repaired = ensure_premade_rent_lease_accounting_setup()

        self.assertNotEqual(repaired.monthly_income_account_id, broken_monthly.id)
        self.assertTrue(repaired.monthly_income_account.is_active)
        self.assertEqual(repaired.monthly_income_account.account_type, ChartOfAccountType.INCOME)

    def test_ensure_premade_repairs_deposit_refund_liability_account(self):
        mapping = ensure_premade_rent_lease_accounting_setup()
        RentLeaseAccountingAccountMapping.objects.filter(pk=mapping.pk).update(
            deposit_refund_account_id=mapping.deposit_liability_account_id,
        )

        repaired = ensure_premade_rent_lease_accounting_setup()

        self.assertNotEqual(repaired.deposit_refund_account_id, repaired.deposit_liability_account_id)
        self.assertEqual(repaired.deposit_refund_account.account_type, ChartOfAccountType.ASSET)

    def test_ensure_premade_repairs_inactive_settlement_finance_account(self):
        mapping = ensure_premade_rent_lease_accounting_setup()
        broken_settlement = mapping.settlement_finance_account
        broken_settlement.is_active = False
        broken_settlement.save(update_fields=["is_active", "updated_at"])

        repaired = ensure_premade_rent_lease_accounting_setup()

        self.assertTrue(repaired.settlement_finance_account.is_active)
        self.assertTrue(repaired.settlement_finance_account.is_real_settlement_account)
        self.assertTrue(repaired.settlement_finance_account.chart_account.is_active)
        self.assertEqual(repaired.settlement_finance_account.chart_account.account_type, ChartOfAccountType.ASSET)

    def test_readiness_does_not_report_missing_mapping_after_ensure(self):
        readiness_before = canonical_readiness(auto_create=False)
        self.assertEqual(readiness_before["status"], "NEEDS_MAPPING")

        mapping = ensure_premade_rent_lease_accounting_setup()
        readiness_after = canonical_readiness(auto_create=False)

        self.assertEqual(readiness_after["status"], "READY")
        self.assertEqual(readiness_after["mapping_id"], mapping.id)
        self.assertNotIn("Active rent/lease account mapping is missing.", readiness_after["blockers"])


class AdminFinanceAccountMappingApiTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="mapping_admin", phone="9000004401")
        self.client.force_authenticate(user=self.admin)

    def _chart(self, code: str, account_type: str) -> ChartOfAccount:
        return ChartOfAccount.objects.create(code=code, name=code, account_type=account_type, is_active=True)

    def test_get_account_mapping_repairs_and_returns_payload(self):
        response = self.client.get("/api/v1/admin/finance/account-mapping/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(response.data["mapping"])
        self.assertEqual(response.data["mapping"]["deposit_refund_account_code"], "CASH-1000")
        self.assertEqual(response.data["readiness"]["status"], "READY")

    def test_ensure_premade_action_repairs_and_returns_payload(self):
        mapping = ensure_premade_rent_lease_accounting_setup()
        RentLeaseAccountingAccountMapping.objects.filter(pk=mapping.pk).update(
            deposit_refund_account_id=mapping.deposit_liability_account_id,
        )

        response = self.client.post(
            "/api/v1/admin/finance/account-mapping/",
            {"action": "ENSURE_PREMADE"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        mapping.refresh_from_db()
        self.assertEqual(mapping.deposit_refund_account.account_type, ChartOfAccountType.ASSET)

    def test_invalid_manual_mapping_returns_clean_field_errors(self):
        income = self._chart("MANUALINC001", ChartOfAccountType.INCOME)
        liability = self._chart("MANUALLIA001", ChartOfAccountType.LIABILITY)
        damage = self._chart("MANUALINC002", ChartOfAccountType.INCOME)

        response = self.client.post(
            "/api/v1/admin/finance/account-mapping/",
            {
                "monthly_income_account_id": income.id,
                "deposit_liability_account_id": liability.id,
                "deposit_refund_account_id": liability.id,
                "damage_recovery_income_account_id": damage.id,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "Invalid rent/lease mapping.")
        self.assertEqual(response.data["field_errors"]["deposit_refund_account"], ["Account must be ASSET."])

    def test_valid_manual_mapping_saves(self):
        income = self._chart("MANUALINC003", ChartOfAccountType.INCOME)
        liability = self._chart("MANUALLIA002", ChartOfAccountType.LIABILITY)
        refund = self._chart("MANUALAST001", ChartOfAccountType.ASSET)
        damage = self._chart("MANUALINC004", ChartOfAccountType.INCOME)
        settlement = FinanceAccount.objects.create(
            name="Manual Rent Lease Cash Desk",
            kind=FinanceAccountKind.CASH,
            chart_account=refund,
            is_real_settlement_account=True,
            is_active=True,
        )

        response = self.client.post(
            "/api/v1/admin/finance/account-mapping/",
            {
                "monthly_income_account_id": income.id,
                "deposit_liability_account_id": liability.id,
                "deposit_refund_account_id": refund.id,
                "damage_recovery_income_account_id": damage.id,
                "settlement_finance_account_id": settlement.id,
                "notes": "Manual test mapping",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["mapping"]["deposit_refund_account_id"], refund.id)
        self.assertEqual(response.data["mapping"]["settlement_finance_account_id"], settlement.id)

    def test_rent_lease_summary_uses_same_ready_mapping(self):
        ensure_premade_rent_lease_accounting_setup()

        response = self.client.get("/api/v1/admin/rent-lease/accounting-summary/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["readiness"]["status"], "READY")
        self.assertNotIn("Active rent/lease account mapping is missing.", response.data["readiness"]["blockers"])
