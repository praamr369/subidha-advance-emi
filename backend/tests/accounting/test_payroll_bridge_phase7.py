from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import (
    AccountingBridgePosting,
    ChartOfAccount,
    EmployeeExpenseClaim,
    EmployeeExpenseClaimPayment,
    FinanceAccountCoaMapping,
    FinanceAccountMappingPurpose,
    JournalEntry,
    MoneyMovement,
    PayrollPeriod,
    SalaryPayment,
    SalarySheet,
)
from accounting.services.accounting_setup_service import AccountingSetupService
from billing.models import ReceiptDocument
from reconciliation.models import ReconciliationItem
from settlements.models import SettlementAllocation
from subscriptions.models import Payment


User = get_user_model()


class PayrollBridgeReadinessPhase7Tests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username="payroll_phase7_admin",
            email="payroll-phase7@example.com",
            password="pass1234",
            phone="01719990047",
            role="ADMIN",
            is_staff=True,
        )
        self.client.force_authenticate(user=self.admin)

    def _bootstrap(self):
        AccountingSetupService.bootstrap(actor=self.admin, dry_run=False)

    def _events(self):
        response = self.client.get("/api/v1/admin/accounting/bridge-readiness/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return {event["event_key"]: event for event in response.data["events"]}

    def test_payroll_readiness_events_are_exposed(self):
        events = self._events()
        required = {
            "salary_expense",
            "salary_payable",
            "salary_payment",
            "staff_advance",
            "expense_claim_payment",
        }
        self.assertTrue(required.issubset(events.keys()))
        for event_key in required:
            self.assertEqual(events[event_key]["posting_mode"], "AUDIT_DEFERRED")
            self.assertFalse(events[event_key]["can_post"])

    def test_staff_advance_is_not_configured_without_real_source_model(self):
        events = self._events()
        self.assertEqual(events["staff_advance"]["status"], "UNSUPPORTED_SOURCE")
        self.assertEqual(events["staff_advance"].get("legacy_status"), "NOT_CONFIGURED")
        self.assertFalse(events["staff_advance"]["can_post"])
        self.assertTrue(
            any("StaffAdvance" in reason for reason in events["staff_advance"]["blocking_reasons"])
        )

    def test_missing_salary_payable_blocks_salary_readiness(self):
        self._bootstrap()
        ChartOfAccount.objects.filter(system_code="SALARY_PAYABLE").update(is_active=False)
        events = self._events()
        affected = [events[key] for key in ("salary_expense", "salary_payable", "salary_payment") if key in events]
        self.assertTrue(
            any(
                event["status"] in {"ERROR", "NOT_CONFIGURED"}
                and any("SALARY_PAYABLE" in reason or "inactive" in reason for reason in event["blocking_reasons"])
                for event in affected
            )
        )

    def test_missing_salary_expense_mapping_blocks_salary_readiness(self):
        self._bootstrap()
        FinanceAccountCoaMapping.objects.filter(
            purpose=FinanceAccountMappingPurpose.SALARY_EXPENSE,
            is_active=True,
        ).update(is_active=False)
        events = self._events()
        affected = [events[key] for key in ("salary_expense", "salary_payable") if key in events]
        self.assertTrue(
            any(
                event["status"] == "WARNING"
                and any("SALARY_EXPENSE" in reason for reason in event["blocking_reasons"])
                for event in affected
            )
        )

    def test_mapped_collection_accounts_make_salary_payment_finance_side_ready(self):
        self._bootstrap()
        events = self._events()
        salary_payment = events["salary_payment"]
        self.assertGreaterEqual(len(salary_payment["finance_accounts"]), 1)
        self.assertFalse(
            any("No active real settlement FinanceAccount" in reason for reason in salary_payment["blocking_reasons"])
        )

    def test_expense_claim_payment_exposes_expense_and_finance_readiness(self):
        self._bootstrap()
        events = self._events()
        claim_payment = events["expense_claim_payment"]
        self.assertGreaterEqual(len(claim_payment["finance_accounts"]), 1)
        self.assertGreaterEqual(len(claim_payment["debit_accounts"]), 1)
        self.assertFalse(claim_payment["can_post"])

    def test_payroll_readiness_creates_no_financial_or_source_records(self):
        before = {
            "journals": JournalEntry.objects.count(),
            "bridge_postings": AccountingBridgePosting.objects.count(),
            "payments": Payment.objects.count(),
            "receipts": ReceiptDocument.objects.count(),
            "money_movements": MoneyMovement.objects.count(),
            "settlement_allocations": SettlementAllocation.objects.count(),
            "reconciliation_items": ReconciliationItem.objects.count(),
            "payroll_periods": PayrollPeriod.objects.count(),
            "salary_sheets": SalarySheet.objects.count(),
            "salary_payments": SalaryPayment.objects.count(),
            "expense_claims": EmployeeExpenseClaim.objects.count(),
            "expense_claim_payments": EmployeeExpenseClaimPayment.objects.count(),
        }
        response = self.client.get("/api/v1/admin/accounting/bridge-readiness/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        after = {
            "journals": JournalEntry.objects.count(),
            "bridge_postings": AccountingBridgePosting.objects.count(),
            "payments": Payment.objects.count(),
            "receipts": ReceiptDocument.objects.count(),
            "money_movements": MoneyMovement.objects.count(),
            "settlement_allocations": SettlementAllocation.objects.count(),
            "reconciliation_items": ReconciliationItem.objects.count(),
            "payroll_periods": PayrollPeriod.objects.count(),
            "salary_sheets": SalarySheet.objects.count(),
            "salary_payments": SalaryPayment.objects.count(),
            "expense_claims": EmployeeExpenseClaim.objects.count(),
            "expense_claim_payments": EmployeeExpenseClaimPayment.objects.count(),
        }
        self.assertEqual(after, before)
