from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import AccountingBridgePosting, JournalEntry
from billing.models import ReceiptDocument
from reconciliation.models import ReconciliationItem
from settlements.models import SettlementAllocation
from subscriptions.models import Commission, CommissionPayoutBatch, Payment


User = get_user_model()


class CommissionPayoutBridgeReadinessEventsTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username="commission_phase5_admin",
            email="commission-phase5@example.com",
            password="pass1234",
            phone="01719990025",
            role="ADMIN",
            is_staff=True,
        )
        self.client.force_authenticate(user=self.admin)

    def test_commission_and_payout_readiness_events_are_exposed(self):
        response = self.client.get("/api/v1/admin/accounting/bridge-readiness/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        events = {event["event_key"]: event for event in response.data["events"]}
        required_keys = {
            "commission_accrual",
            "commission_approval",
            "commission_payout",
            "payout_batch_payment",
        }
        self.assertTrue(required_keys.issubset(events.keys()))
        for event_key in required_keys:
            self.assertEqual(events[event_key]["event_group"], "Commission")
            self.assertFalse(events[event_key]["can_post"])
            self.assertEqual(events[event_key]["posting_mode"], "AUDIT_DEFERRED")

    def test_commission_payout_readiness_creates_no_records(self):
        before = {
            "journals": JournalEntry.objects.count(),
            "bridge_postings": AccountingBridgePosting.objects.count(),
            "payments": Payment.objects.count(),
            "receipts": ReceiptDocument.objects.count(),
            "settlement_allocations": SettlementAllocation.objects.count(),
            "reconciliation_items": ReconciliationItem.objects.count(),
            "commissions": Commission.objects.count(),
            "payout_batches": CommissionPayoutBatch.objects.count(),
        }
        response = self.client.get("/api/v1/admin/accounting/bridge-readiness/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        after = {
            "journals": JournalEntry.objects.count(),
            "bridge_postings": AccountingBridgePosting.objects.count(),
            "payments": Payment.objects.count(),
            "receipts": ReceiptDocument.objects.count(),
            "settlement_allocations": SettlementAllocation.objects.count(),
            "reconciliation_items": ReconciliationItem.objects.count(),
            "commissions": Commission.objects.count(),
            "payout_batches": CommissionPayoutBatch.objects.count(),
        }
        self.assertEqual(after, before)
