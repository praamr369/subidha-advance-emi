from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import AccountingBridgePosting, FinanceAccountCoaMapping, FinanceAccountMappingPurpose, JournalEntry, MoneyMovement
from accounting.services.accounting_setup_service import AccountingSetupService
from billing.models import BillingCreditNote, BillingDebitNote, ReceiptDocument
from reconciliation.models import ReconciliationItem
from service_desk.models import ServiceDeskCase
from settlements.models import SettlementAllocation
from subscriptions.models import Payment, Subscription


User = get_user_model()


class ReturnsDamageCreditBridgeReadinessPhase9Tests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username="returns_damage_credit_phase9_admin",
            email="returns-damage-credit-phase9@example.com",
            password="pass1234",
            phone="01719990069",
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

    def test_returns_damage_credit_readiness_events_are_exposed(self):
        events = self._events()
        required = {
            "customer_return",
            "sales_return",
            "credit_note_issue",
            "customer_refund",
            "customer_credit_adjustment",
            "damage_recovery",
            "security_deposit_damage_deduction",
            "refund_customer_credit",
        }
        self.assertTrue(required.issubset(events.keys()))
        for event_key in required:
            self.assertEqual(events[event_key]["event_group"], "Returns, Damage & Credit")
            self.assertEqual(events[event_key]["posting_mode"], "AUDIT_DEFERRED")
            self.assertFalse(events[event_key]["can_post"])

    def test_missing_customer_receivable_blocks_returns_credit_readiness(self):
        self._bootstrap()
        FinanceAccountCoaMapping.objects.filter(
            purpose=FinanceAccountMappingPurpose.CUSTOMER_RECEIVABLE,
            is_active=True,
        ).update(is_active=False)
        events = self._events()
        affected = [
            events["customer_return"],
            events["sales_return"],
            events["customer_credit_adjustment"],
            events["refund_customer_credit"],
        ]
        self.assertTrue(
            any(
                event["status"] == "WARNING"
                and any("CUSTOMER_RECEIVABLE" in reason for reason in event["blocking_reasons"])
                for event in affected
            )
        )

    def test_missing_customer_credit_liability_blocks_refund_and_credit_note_readiness(self):
        self._bootstrap()
        FinanceAccountCoaMapping.objects.filter(
            purpose=FinanceAccountMappingPurpose.CUSTOMER_ADVANCE_UNEARNED_REVENUE,
            is_active=True,
        ).update(is_active=False)
        events = self._events()
        affected = [events["credit_note_issue"], events["customer_refund"], events["customer_credit_adjustment"]]
        self.assertTrue(
            any(
                event["status"] == "WARNING"
                and any("CUSTOMER_ADVANCE_UNEARNED_REVENUE" in reason for reason in event["blocking_reasons"])
                for event in affected
            )
        )

    def test_mapped_collection_accounts_make_customer_refund_finance_side_ready(self):
        self._bootstrap()
        events = self._events()
        refund = events["customer_refund"]
        self.assertGreaterEqual(len(refund["finance_accounts"]), 1)
        self.assertFalse(
            any("No active real settlement FinanceAccount" in reason for reason in refund["blocking_reasons"])
        )

    def test_security_deposit_damage_deduction_uses_rent_lease_mapping_posture(self):
        events = self._events()
        deduction = events["security_deposit_damage_deduction"]
        self.assertEqual(deduction["posting_mode"], "AUDIT_DEFERRED")
        self.assertFalse(deduction["can_post"])
        self.assertIn("RentLeaseAccountingAccountMapping", " ".join(deduction["debit_requirements"] + deduction["credit_requirements"]))

    def test_readiness_creates_no_financial_or_source_records(self):
        before = {
            "journals": JournalEntry.objects.count(),
            "bridge_postings": AccountingBridgePosting.objects.count(),
            "payments": Payment.objects.count(),
            "receipts": ReceiptDocument.objects.count(),
            "money_movements": MoneyMovement.objects.count(),
            "settlement_allocations": SettlementAllocation.objects.count(),
            "reconciliation_items": ReconciliationItem.objects.count(),
            "credit_notes": BillingCreditNote.objects.count(),
            "debit_notes": BillingDebitNote.objects.count(),
            "service_cases": ServiceDeskCase.objects.count(),
            "subscriptions": Subscription.objects.count(),
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
            "credit_notes": BillingCreditNote.objects.count(),
            "debit_notes": BillingDebitNote.objects.count(),
            "service_cases": ServiceDeskCase.objects.count(),
            "subscriptions": Subscription.objects.count(),
        }
        self.assertEqual(after, before)
