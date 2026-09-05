"""Journal lifecycle audit rows must carry an honest action_type.

PAYMENT_FLAGGED is used across this codebase as a catch-all for events with no
type of their own — 89 call sites in 41 files, spanning accounting, billing,
contracts, payments, inventory and reminders. A journal void was therefore
recorded as a flagged payment. Every row is written, so nothing is lost, but
action_type carries no meaning and finding a void needs a metadata substring
search.

Scope here is deliberately the three journal transitions an auditor asks for by
name, which all flow through one choke point. Relabelling the rest requires a
taxonomy across six domains rather than a find-and-replace; a partial sweep was
attempted and reverted, because half-relabelled is worse than uniformly
unhelpful.
"""
from django.test import TestCase

from accounting.services.journal_posting_service import (
    _EVENT_ACTION_TYPES,
    _log_accounting_event,
)
from audit.models import AuditLog


class JournalEntry:
    """Minimal stand-in.

    log_audit only reads instance.__class__.__name__ and instance.pk, so the
    class name is what lands in AuditLog.model_name.
    """

    pk = 1


class AccountingAuditActionTypeTests(TestCase):
    def _log(self, event):
        _log_accounting_event(event=event, instance=JournalEntry(), metadata={"x": 1})
        return AuditLog.objects.latest("id")

    def test_journal_void_is_recorded_as_a_void(self):
        entry = self._log("ACCOUNTING_JOURNAL_VOIDED")

        self.assertEqual(
            entry.action_type, AuditLog.ActionType.ACCOUNTING_JOURNAL_VOIDED
        )

    def test_journal_post_is_recorded_as_a_post(self):
        entry = self._log("ACCOUNTING_JOURNAL_POSTED")

        self.assertEqual(
            entry.action_type, AuditLog.ActionType.ACCOUNTING_JOURNAL_POSTED
        )

    def test_group_reversal_is_recorded_as_a_reversal(self):
        entry = self._log("ACCOUNTING_JOURNAL_GROUP_REVERSED")

        self.assertEqual(
            entry.action_type, AuditLog.ActionType.ACCOUNTING_JOURNAL_GROUP_REVERSED
        )

    def test_unmapped_events_keep_the_existing_catch_all(self):
        """Unchanged behaviour, asserted so the partial scope stays deliberate.

        PAYMENT_FLAGGED is a codebase-wide catch-all (89 sites, 41 files).
        Only the three journal transitions were given real types; relabelling
        the rest needs a taxonomy spanning six domains.
        """
        entry = self._log("ACCOUNTING_BRIDGE_POSTED")

        self.assertEqual(entry.action_type, AuditLog.ActionType.PAYMENT_FLAGGED)

    def test_blocked_events_do_not_claim_the_action_happened(self):
        """A refusal is not a state change.

        ACCOUNTING_JOURNAL_VOID_BLOCKED means a void was *prevented*; filing it
        as ACCOUNTING_JOURNAL_VOIDED would tell an auditor the opposite of what
        occurred.
        """
        entry = self._log("ACCOUNTING_JOURNAL_VOID_BLOCKED")

        self.assertEqual(entry.action_type, AuditLog.ActionType.PAYMENT_FLAGGED)
        self.assertNotEqual(
            entry.action_type, AuditLog.ActionType.ACCOUNTING_JOURNAL_VOIDED
        )

    def test_specific_event_is_still_preserved_in_metadata(self):
        """The generic type must not lose the detail it replaced."""
        entry = self._log("ACCOUNTING_BRIDGE_POSTED")

        self.assertEqual(entry.metadata["event"], "ACCOUNTING_BRIDGE_POSTED")
        self.assertEqual(entry.metadata["x"], 1)

    def test_journal_transitions_are_not_filed_as_flagged_payments(self):
        """The regression this change exists to prevent."""
        for event in (
            "ACCOUNTING_JOURNAL_POSTED",
            "ACCOUNTING_JOURNAL_VOIDED",
            "ACCOUNTING_JOURNAL_GROUP_REVERSED",
        ):
            with self.subTest(event=event):
                entry = self._log(event)
                self.assertNotEqual(
                    entry.action_type,
                    AuditLog.ActionType.PAYMENT_FLAGGED,
                    f"{event} must not be recorded as a flagged payment",
                )

    def test_mapped_events_are_all_real_action_types(self):
        """Guards against a typo'd mapping silently falling back to generic."""
        valid = set(AuditLog.ActionType.values)

        for event, action_type in _EVENT_ACTION_TYPES.items():
            with self.subTest(event=event):
                self.assertIn(action_type, valid)
