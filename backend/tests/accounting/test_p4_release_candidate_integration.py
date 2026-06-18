"""P4 release-candidate integration checks across the read-only finance surfaces."""
from __future__ import annotations

from django.test import TestCase
from rest_framework.test import APIClient

from accounting.models import (
    AccountingBridgePosting,
    AccountingPeriod,
    JournalEntry,
    JournalEntryLine,
    MoneyMovement,
)
from billing.models import BillingInvoice, ReceiptDocument
from inventory.models import StockLedger
from reconciliation.models import ReconciliationItem
from subscriptions.models import (
    Commission,
    CommissionPayoutBatch,
    CustomerAdvance,
    Emi,
    Payment,
    PaymentReconciliation,
    RentLeaseBillingDemand,
    RentLeaseDepositTransaction,
    Subscription,
)
from tests.helpers import create_admin_user


class P4ReleaseCandidateIntegrationTests(TestCase):
    maxDiff = None

    def setUp(self):
        self.client = APIClient()
        self.admin = create_admin_user(
            username="p4_rc_admin",
            phone="9189990001",
        )
        self.client.force_authenticate(user=self.admin)
        self.params = {"year": 2026, "month": 6, "as_of": "2026-06-18"}

    @staticmethod
    def _financial_counts() -> dict[str, int]:
        models = (
            AccountingBridgePosting,
            AccountingPeriod,
            JournalEntry,
            JournalEntryLine,
            MoneyMovement,
            Payment,
            Emi,
            Subscription,
            BillingInvoice,
            ReceiptDocument,
            StockLedger,
            RentLeaseBillingDemand,
            RentLeaseDepositTransaction,
            CustomerAdvance,
            Commission,
            CommissionPayoutBatch,
            PaymentReconciliation,
            ReconciliationItem,
        )
        return {
            model._meta.label: model.objects.count()
            for model in models
        }

    def test_combined_financial_intelligence_contains_trial_balance_and_liabilities(self):
        response = self.client.get(
            "/api/v1/admin/financial-intelligence/",
            self.params,
        )

        self.assertEqual(response.status_code, 200)
        sections = response.data["sections"]
        self.assertIn("trial_balance", sections)
        self.assertIn("advance_deposit", sections)
        self.assertIn("customer_advance", sections["advance_deposit"])
        self.assertIn("security_deposit", sections["advance_deposit"])

    def test_full_p4_read_sequence_does_not_write_financial_records(self):
        urls = (
            "/api/v1/admin/financial-intelligence/",
            "/api/v1/admin/financial-intelligence/trial-balance/",
            "/api/v1/admin/financial-intelligence/liability-reconciliation/",
            "/api/v1/admin/accounting/close-cockpit/",
            "/api/v1/admin/accounting/exports/",
            "/api/v1/admin/accounting/exports/trial-balance/",
            "/api/v1/admin/accounting/exports/journals/",
            "/api/v1/admin/accounting/exports/ledgers/",
            "/api/v1/admin/accounting/exports/receivables/",
            "/api/v1/admin/accounting/exports/liabilities/",
            "/api/v1/admin/accounting/exports/bridge-audit/",
        )
        before = self._financial_counts()

        for url in urls:
            with self.subTest(url=url):
                response = self.client.get(url, self.params)
                self.assertEqual(response.status_code, 200)

        self.assertEqual(self._financial_counts(), before)

