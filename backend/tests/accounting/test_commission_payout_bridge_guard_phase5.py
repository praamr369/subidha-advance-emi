from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from accounting.models import AccountingBridgePosting, JournalEntry
from accounting.services.commission_payout_bridge_guard_service import (
    POSTING_NOT_APPROVED,
    run_commission_settlement_bridges_guarded,
    run_payout_batch_bridges_guarded,
)


User = get_user_model()


class CommissionPayoutBridgePostingGuardTests(TestCase):
    def setUp(self):
        self.today = timezone.localdate()
        self.admin = User.objects.create_user(
            username="commission_guard_admin",
            email="commission-guard@example.com",
            password="pass1234",
            phone="01719990026",
            role="ADMIN",
            is_staff=True,
        )

    def test_commission_bridge_without_posting_approval_creates_no_posting(self):
        before = {
            "journals": JournalEntry.objects.count(),
            "bridge_postings": AccountingBridgePosting.objects.count(),
        }
        payload = run_commission_settlement_bridges_guarded(
            start_date=self.today - timedelta(days=1),
            end_date=self.today,
            dry_run=False,
            posting_approved=False,
            performed_by=self.admin,
        )
        after = {
            "journals": JournalEntry.objects.count(),
            "bridge_postings": AccountingBridgePosting.objects.count(),
        }

        self.assertEqual(payload["status"], POSTING_NOT_APPROVED)
        self.assertEqual(payload["created_count"], 0)
        self.assertEqual(after, before)

    def test_payout_batch_bridge_without_posting_approval_creates_no_posting(self):
        before = {
            "journals": JournalEntry.objects.count(),
            "bridge_postings": AccountingBridgePosting.objects.count(),
        }
        payload = run_payout_batch_bridges_guarded(
            start_date=self.today - timedelta(days=1),
            end_date=self.today,
            dry_run=False,
            posting_approved=False,
            performed_by=self.admin,
        )
        after = {
            "journals": JournalEntry.objects.count(),
            "bridge_postings": AccountingBridgePosting.objects.count(),
        }

        self.assertEqual(payload["status"], POSTING_NOT_APPROVED)
        self.assertEqual(payload["created_count"], 0)
        self.assertEqual(after, before)

    def test_dry_run_does_not_require_posting_approval(self):
        payload = run_commission_settlement_bridges_guarded(
            start_date=self.today - timedelta(days=1),
            end_date=self.today,
            dry_run=True,
            posting_approved=False,
            performed_by=self.admin,
        )

        self.assertEqual(payload["purpose"], "COMMISSION_SETTLEMENT")
        self.assertTrue(payload["dry_run"])
        self.assertNotEqual(payload.get("status"), POSTING_NOT_APPROVED)
