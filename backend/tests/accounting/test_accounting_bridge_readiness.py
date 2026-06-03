from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import (
    AccountingBridgePosting,
    ChartOfAccount,
    ChartOfAccountType,
    FinanceAccount,
    FinanceAccountCoaMapping,
    FinanceAccountKind,
    FinanceAccountMappingPurpose,
    JournalEntry,
    JournalEntryLine,
    RentLeaseAccountingAccountMapping,
)
from accounting.services.accounting_setup_service import AccountingSetupService
from billing.models import ReceiptDocument
from reconciliation.models import ReconciliationItem
from settlements.models import SettlementAllocation
from subscriptions.models import Commission, CommissionPayoutBatch, CommissionPayoutLine, Payment


User = get_user_model()


class AccountingBridgeReadinessTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username="bridge_ready_admin",
            email="bridge-ready-admin@example.com",
            password="pass1234",
            phone="01719990001",
            role="ADMIN",
            is_staff=True,
        )
        self.client.force_authenticate(user=self.admin)

    def _bootstrap(self):
        AccountingSetupService.bootstrap(actor=self.admin, dry_run=False)

    def test_readiness_endpoint_loads(self):
        response = self.client.get("/api/v1/admin/accounting/bridge-readiness/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("summary", response.data)
        self.assertIn("events", response.data)

    def test_each_configured_event_returns_structured_status(self):
        response = self.client.get("/api/v1/admin/accounting/bridge-readiness/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreater(len(response.data["events"]), 0)
        for event in response.data["events"]:
            self.assertIn("event_key", event)
            self.assertIn("label", event)
            self.assertIn("source_module", event)
            self.assertIn("event_group", event)
            self.assertIn(event["status"], {"READY", "INFO", "WARNING", "ERROR", "NOT_CONFIGURED"})
            self.assertFalse(event["can_post"])
            self.assertEqual(event["posting_mode"], "AUDIT_DEFERRED")
            self.assertIsInstance(event["debit_accounts"], list)
            self.assertIsInstance(event["credit_accounts"], list)
            self.assertIsInstance(event["finance_accounts"], list)
            self.assertIsInstance(event["blocking_reasons"], list)
            self.assertIn("operator_action", event)

    def test_direct_sale_and_emi_event_readiness_keys_are_exposed(self):
        response = self.client.get("/api/v1/admin/accounting/bridge-readiness/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        events = {event["event_key"]: event for event in response.data["events"]}
        required = {
            "advance_emi_collection",
            "subscription_emi_payment",
            "subscription_emi_waiver_loss",
            "direct_sale_invoice",
            "direct_sale_receipt",
            "direct_sale_return",
            "direct_sale_outstanding",
        }
        self.assertTrue(required.issubset(set(events)))
        for event_key in required:
            self.assertFalse(events[event_key]["can_post"])
            self.assertEqual(events[event_key]["posting_mode"], "AUDIT_DEFERRED")
            self.assertIn(events[event_key]["event_group"], {"EMI", "Direct Sale"})

    def test_multiple_valid_cash_accounts_do_not_produce_warning(self):
        self._bootstrap()
        cash_chart = ChartOfAccount.objects.get(system_code="CASH_COLLECTION")
        extra_cash = FinanceAccount.objects.create(
            name="Bridge Readiness Extra Cash Desk",
            kind=FinanceAccountKind.CASH,
            chart_account=cash_chart,
            is_active=True,
            is_real_settlement_account=True,
        )
        FinanceAccountCoaMapping.objects.create(
            finance_account=extra_cash,
            chart_account=cash_chart,
            purpose=FinanceAccountMappingPurpose.CASH_COLLECTION,
            is_active=True,
            is_default=False,
            created_by=self.admin,
            updated_by=self.admin,
        )

        response = self.client.get("/api/v1/admin/accounting/bridge-readiness/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        cash_reasons = [
            reason
            for event in response.data["events"]
            for reason in event["blocking_reasons"]
            if "multiple" in reason.lower() and "cash" in reason.lower()
        ]
        self.assertEqual(cash_reasons, [])

    def test_missing_finance_account_coa_mapping_produces_warning(self):
        self._bootstrap()
        FinanceAccountCoaMapping.objects.filter(
            purpose=FinanceAccountMappingPurpose.CUSTOMER_RECEIVABLE,
            is_active=True,
        ).update(is_active=False)

        response = self.client.get("/api/v1/admin/accounting/bridge-readiness/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(
            any(
                event["status"] == "WARNING"
                and any("CUSTOMER_RECEIVABLE" in reason for reason in event["blocking_reasons"])
                for event in response.data["events"]
            )
        )

    def test_missing_sales_income_mapping_blocks_direct_sale_invoice_readiness(self):
        self._bootstrap()
        FinanceAccountCoaMapping.objects.filter(
            purpose=FinanceAccountMappingPurpose.DIRECT_SALE_INCOME,
            is_active=True,
        ).update(is_active=False)

        response = self.client.get("/api/v1/admin/accounting/bridge-readiness/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        direct_sale_invoice = next(
            event for event in response.data["events"] if event["event_key"] == "direct_sale_invoice"
        )
        self.assertEqual(direct_sale_invoice["status"], "WARNING")
        self.assertFalse(direct_sale_invoice["can_post"])
        self.assertTrue(
            any("DIRECT_SALE_INCOME" in reason for reason in direct_sale_invoice["blocking_reasons"])
        )

    def test_missing_collection_mapping_blocks_direct_sale_receipt_readiness(self):
        self._bootstrap()
        FinanceAccountCoaMapping.objects.filter(
            purpose=FinanceAccountMappingPurpose.CASH_COLLECTION,
            is_active=True,
        ).update(is_active=False)

        response = self.client.get("/api/v1/admin/accounting/bridge-readiness/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        direct_sale_receipt = next(
            event for event in response.data["events"] if event["event_key"] == "direct_sale_receipt"
        )
        self.assertEqual(direct_sale_receipt["status"], "WARNING")
        self.assertFalse(direct_sale_receipt["can_post"])
        self.assertTrue(
            any("CASH_COLLECTION" in reason for reason in direct_sale_receipt["blocking_reasons"])
        )

    def test_invalid_coa_type_produces_error(self):
        self._bootstrap()
        liability = ChartOfAccount.objects.create(
            code="BRIDGE-BAD-LIAB",
            name="Bridge Bad Liability",
            account_type=ChartOfAccountType.LIABILITY,
            is_active=True,
            allow_manual_posting=True,
            system_code="BRIDGE_BAD_LIABILITY",
        )
        mapping = FinanceAccountCoaMapping.objects.filter(
            purpose=FinanceAccountMappingPurpose.CUSTOMER_RECEIVABLE,
            is_active=True,
        ).first()
        self.assertIsNotNone(mapping)
        FinanceAccountCoaMapping.objects.filter(pk=mapping.pk).update(chart_account=liability)

        response = self.client.get("/api/v1/admin/accounting/bridge-readiness/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(
            any(
                event["status"] == "ERROR"
                and any("CUSTOMER_RECEIVABLE" in reason or "must be ASSET" in reason for reason in event["blocking_reasons"])
                for event in response.data["events"]
            )
        )

    def test_rent_lease_valid_mapping_returns_ready_or_info_with_audit_deferred(self):
        self._bootstrap()
        rent_income = ChartOfAccount.objects.get(system_code="RENT_INCOME")
        deposit_liability = ChartOfAccount.objects.get(system_code="SECURITY_DEPOSIT_LIABILITY")
        cash_chart = ChartOfAccount.objects.get(system_code="CASH_COLLECTION")
        damage_recovery = ChartOfAccount.objects.get(system_code="DAMAGE_RECOVERY")
        cash = FinanceAccount.objects.filter(kind=FinanceAccountKind.CASH, is_active=True).first()
        self.assertIsNotNone(cash)
        RentLeaseAccountingAccountMapping.objects.create(
            monthly_income_account=rent_income,
            deposit_liability_account=deposit_liability,
            deposit_refund_account=cash_chart,
            damage_recovery_income_account=damage_recovery,
            settlement_finance_account=cash,
            is_active=True,
        )

        response = self.client.get("/api/v1/admin/accounting/bridge-readiness/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        rent_events = [event for event in response.data["events"] if event["event_key"].startswith("rent_lease")]
        self.assertGreaterEqual(len(rent_events), 1)
        for event in rent_events:
            self.assertIn(event["status"], {"READY", "INFO"})
            self.assertFalse(event["can_post"])
            self.assertEqual(event["posting_mode"], "AUDIT_DEFERRED")

    def test_readiness_creates_no_financial_records(self):
        counts_before = {
            "journals": JournalEntry.objects.count(),
            "journal_lines": JournalEntryLine.objects.count(),
            "bridge_postings": AccountingBridgePosting.objects.count(),
            "payments": Payment.objects.count(),
            "commissions": Commission.objects.count(),
            "payout_batches": CommissionPayoutBatch.objects.count(),
            "payout_lines": CommissionPayoutLine.objects.count(),
            "receipts": ReceiptDocument.objects.count(),
            "settlement_allocations": SettlementAllocation.objects.count(),
            "reconciliation_items": ReconciliationItem.objects.count(),
        }

        response = self.client.get("/api/v1/admin/accounting/bridge-readiness/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        counts_after = {
            "journals": JournalEntry.objects.count(),
            "journal_lines": JournalEntryLine.objects.count(),
            "bridge_postings": AccountingBridgePosting.objects.count(),
            "payments": Payment.objects.count(),
            "commissions": Commission.objects.count(),
            "payout_batches": CommissionPayoutBatch.objects.count(),
            "payout_lines": CommissionPayoutLine.objects.count(),
            "receipts": ReceiptDocument.objects.count(),
            "settlement_allocations": SettlementAllocation.objects.count(),
            "reconciliation_items": ReconciliationItem.objects.count(),
        }
        self.assertEqual(counts_after, counts_before)
