from django.test import TestCase
from django.utils import timezone

from accounting.models import AccountingBridgePosting, DocumentSequence, FinanceAccountCoaMapping, JournalEntry
from accounting.services.accounting_postability_service import evaluate_accounting_postability
from accounting.services.document_sequence_service import DocumentType
from accounting.services.setup_defaults_service import apply_accounting_setup_defaults
from tests.accounting.helpers import seed_bridge_ready_environment
from tests.helpers import create_admin_user


class PhaseFSetupStabilizationTests(TestCase):
    def setUp(self):
        self.admin = create_admin_user(username="phase_f_setup_admin", phone="9304700101")

    def test_seed_defaults_twice_is_idempotent_for_mappings(self):
        seed_bridge_ready_environment(timezone.localdate(), performed_by=self.admin)
        first_mapping_count = FinanceAccountCoaMapping.objects.count()
        first_profile_count = DocumentSequence.objects.filter(document_type=DocumentType.JOURNAL_ENTRY).count()
        apply_accounting_setup_defaults(performed_by=self.admin)
        self.assertEqual(FinanceAccountCoaMapping.objects.count(), first_mapping_count)
        self.assertEqual(DocumentSequence.objects.filter(document_type=DocumentType.JOURNAL_ENTRY).count(), first_profile_count)

    def test_seed_defaults_creates_journal_profile_without_consuming_number(self):
        seed_bridge_ready_environment(timezone.localdate(), performed_by=self.admin)
        sequence = DocumentSequence.objects.filter(document_type=DocumentType.JOURNAL_ENTRY, is_active=True).order_by("-id").first()
        self.assertIsNotNone(sequence)
        self.assertEqual(sequence.next_number, 1)
        apply_accounting_setup_defaults(performed_by=self.admin)
        sequence.refresh_from_db()
        self.assertEqual(sequence.next_number, 1)

    def test_seed_defaults_does_not_create_operational_financial_rows(self):
        before = {
            "journals": JournalEntry.objects.count(),
            "bridge": AccountingBridgePosting.objects.count(),
        }
        seed_bridge_ready_environment(timezone.localdate(), performed_by=self.admin)
        after = {
            "journals": JournalEntry.objects.count(),
            "bridge": AccountingBridgePosting.objects.count(),
        }
        self.assertEqual(after, before)

    def test_staff_advance_keeps_canonical_unsupported_with_legacy_not_configured(self):
        status = evaluate_accounting_postability(
            event_key="staff_advance",
            event_label="Staff advance",
            module="HR & Payroll",
            source_model="StaffAdvance",
            bridge_row=None,
            source_workflow_exists=False,
        )
        self.assertEqual(status["status"], "UNSUPPORTED_SOURCE")
        self.assertEqual(status["canonical_status"], "UNSUPPORTED_SOURCE")
        self.assertEqual(status["legacy_status"], "NOT_CONFIGURED")
        self.assertFalse(status["can_preview"])
        self.assertFalse(status["can_post"])
        self.assertEqual(JournalEntry.objects.count(), 0)

    def test_canonical_blocker_statuses_are_not_collapsed_to_mapping(self):
        period = {"financial_year_ready": True, "accounting_period_ready": True, "journal_numbering_ready": True}
        for blocked_status in ("BLOCKED_BY_PERIOD", "BLOCKED_BY_NUMBERING", "BLOCKED_BY_APPROVAL"):
            result = evaluate_accounting_postability(
                event_key="commission_payout",
                event_label="Commission payout",
                module="subscriptions",
                source_model="CommissionPayoutBatch",
                bridge_row={"status": blocked_status, "blocking_reasons": [blocked_status]},
                period_readiness=period,
                source_workflow_exists=True,
            )
            self.assertEqual(result["status"], blocked_status)
            self.assertFalse(result["can_post"])
