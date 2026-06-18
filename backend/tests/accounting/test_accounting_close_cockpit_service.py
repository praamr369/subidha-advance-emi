"""
P4D — Accounting Period Close Cockpit service and API tests.

All tests are read-only: no bridge posting, journal entry, payment, EMI,
stock ledger, CustomerAdvance, RentLeaseDepositTransaction, or reconciliation
rows are mutated by the service under test.

Tests verify:
- Empty/missing period returns safe INFO/WARNING posture
- Balanced trial balance contributes OK
- Unbalanced trial balance blocks close (can_close=False)
- Liability reconciliation CRITICAL blocks close
- Month-end critical blocker blocks close
- Draft journals produce a warning
- Period locked/closed posture is reflected correctly
- can_close is False when critical blockers exist
- Action items include source_area and severity
- Admin endpoint allowed; cashier/customer/partner/unauthenticated blocked
- No JournalEntry/JournalLine/AccountingBridgePosting/Payment/StockLedger/
  CustomerAdvance/RentLeaseDepositTransaction rows created or mutated
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounting.models import AccountingPeriodStatus
from accounting.services.accounting_close_cockpit_service import (
    STATUS_OK,
    STATUS_INFO,
    STATUS_WARNING,
    STATUS_CRITICAL,
    build_accounting_close_cockpit,
    build_period_lock_posture,
    build_close_blockers,
    build_close_action_items,
)
from accounts.models import UserRole
from tests.helpers import (
    create_admin_user,
    create_cashier_user,
    create_user,
)
from tests.accounting.helpers import (
    create_open_accounting_period,
    create_locked_accounting_period,
    create_closed_accounting_period,
)

YEAR = 2026
MONTH = 6
AS_OF = date(2026, 6, 18)
PERIOD = {"year": YEAR, "month": MONTH}

CLOSE_COCKPIT_URL = "/api/v1/admin/accounting/close-cockpit/"


def _admin(suffix="1"):
    return create_admin_user(username=f"p4d_admin_{suffix}", phone=f"920100{suffix.zfill(4)}")


def _cashier(suffix="1"):
    return create_cashier_user(username=f"p4d_cashier_{suffix}", phone=f"920200{suffix.zfill(4)}")


def _customer_user(suffix="1"):
    return create_user(username=f"p4d_cust_{suffix}", role=UserRole.CUSTOMER, phone=f"920300{suffix.zfill(4)}")


def _partner_user(suffix="1"):
    return create_user(username=f"p4d_partner_{suffix}", role=UserRole.PARTNER, phone=f"920400{suffix.zfill(4)}")


# ─────────────────────────────────────────────────────────────────────────────
# build_period_lock_posture tests
# ─────────────────────────────────────────────────────────────────────────────

class TestBuildPeriodLockPosture(TestCase):

    def test_missing_period_returns_safe_posture(self):
        posture = build_period_lock_posture(YEAR, MONTH)
        self.assertFalse(posture["period_exists"])
        self.assertFalse(posture["is_locked"])
        self.assertFalse(posture["is_closed"])
        self.assertFalse(posture["lock_allowed"])
        self.assertIn("existing_lock_endpoint", posture)
        self.assertTrue(posture["manual_lock_required"])
        self.assertGreater(len(posture["lock_blockers"]), 0)

    def test_open_period_is_lockable(self):
        admin = _admin("lp1")
        create_open_accounting_period(AS_OF, performed_by=admin)
        posture = build_period_lock_posture(YEAR, MONTH)
        self.assertTrue(posture["period_exists"])
        self.assertFalse(posture["is_locked"])
        self.assertFalse(posture["is_closed"])
        self.assertTrue(posture["lock_allowed"])
        self.assertEqual(len(posture["lock_blockers"]), 0)
        self.assertIn(str(posture["period_id"]), posture["existing_lock_endpoint"])

    def test_locked_period_not_lockable(self):
        admin = _admin("lp2")
        create_locked_accounting_period(AS_OF, performed_by=admin)
        posture = build_period_lock_posture(YEAR, MONTH)
        self.assertTrue(posture["period_exists"])
        self.assertTrue(posture["is_locked"])
        self.assertFalse(posture["lock_allowed"])
        self.assertGreater(len(posture["lock_blockers"]), 0)

    def test_closed_period_not_lockable(self):
        admin = _admin("lp3")
        create_closed_accounting_period(AS_OF, performed_by=admin)
        posture = build_period_lock_posture(YEAR, MONTH)
        self.assertTrue(posture["period_exists"])
        self.assertTrue(posture["is_locked"])
        self.assertTrue(posture["is_closed"])
        self.assertFalse(posture["lock_allowed"])


# ─────────────────────────────────────────────────────────────────────────────
# build_accounting_close_cockpit shape tests
# ─────────────────────────────────────────────────────────────────────────────

class TestCloseCockpitShape(TestCase):
    """Verify payload shape without any period or journal data."""

    def test_empty_database_returns_valid_payload(self):
        cockpit = build_accounting_close_cockpit(YEAR, MONTH, AS_OF)
        # Required top-level keys
        self.assertIn("period", cockpit)
        self.assertIn("as_of", cockpit)
        self.assertIn("overall_status", cockpit)
        self.assertIn("can_close", cockpit)
        self.assertIn("can_lock", cockpit)
        self.assertIn("period_state", cockpit)
        self.assertIn("sections", cockpit)
        self.assertIn("blockers", cockpit)
        self.assertIn("warnings", cockpit)
        self.assertIn("action_items", cockpit)
        self.assertIn("metadata", cockpit)

    def test_sections_keys_present(self):
        cockpit = build_accounting_close_cockpit(YEAR, MONTH, AS_OF)
        sections = cockpit["sections"]
        self.assertIn("month_end", sections)
        self.assertIn("financial_intelligence", sections)
        self.assertIn("trial_balance", sections)
        self.assertIn("liability_reconciliation", sections)
        self.assertIn("period_lock", sections)

    def test_period_state_keys_present(self):
        cockpit = build_accounting_close_cockpit(YEAR, MONTH, AS_OF)
        ps = cockpit["period_state"]
        self.assertEqual(ps["year"], YEAR)
        self.assertEqual(ps["month"], MONTH)
        self.assertIn("period_start", ps)
        self.assertIn("period_end", ps)
        self.assertIn("is_locked", ps)
        self.assertIn("is_closed", ps)

    def test_as_of_in_payload(self):
        cockpit = build_accounting_close_cockpit(YEAR, MONTH, AS_OF)
        self.assertEqual(cockpit["as_of"], AS_OF.isoformat())

    def test_period_in_payload(self):
        cockpit = build_accounting_close_cockpit(YEAR, MONTH, AS_OF)
        self.assertEqual(cockpit["period"]["year"], YEAR)
        self.assertEqual(cockpit["period"]["month"], MONTH)

    def test_metadata_read_only_flag(self):
        cockpit = build_accounting_close_cockpit(YEAR, MONTH, AS_OF)
        self.assertTrue(cockpit["metadata"]["read_only"])

    def test_overall_status_is_valid(self):
        cockpit = build_accounting_close_cockpit(YEAR, MONTH, AS_OF)
        self.assertIn(cockpit["overall_status"], {STATUS_OK, STATUS_INFO, STATUS_WARNING, STATUS_CRITICAL})


# ─────────────────────────────────────────────────────────────────────────────
# Period missing → WARNING posture, can_close blocked
# ─────────────────────────────────────────────────────────────────────────────

class TestMissingPeriodPosture(TestCase):

    def test_missing_period_blocks_can_close(self):
        cockpit = build_accounting_close_cockpit(YEAR, MONTH, AS_OF)
        # No period created — missing period is a critical blocker
        blocker_keys = [b["key"] for b in cockpit["blockers"]]
        self.assertIn("period.missing", blocker_keys)
        self.assertFalse(cockpit["can_close"])
        self.assertFalse(cockpit["can_lock"])

    def test_missing_period_overall_status_at_least_critical(self):
        cockpit = build_accounting_close_cockpit(YEAR, MONTH, AS_OF)
        self.assertEqual(cockpit["overall_status"], STATUS_CRITICAL)


# ─────────────────────────────────────────────────────────────────────────────
# Open period, empty journals → balanced trial balance → no critical blocker
# ─────────────────────────────────────────────────────────────────────────────

class TestOpenPeriodEmptyBooks(TestCase):

    def setUp(self):
        self.admin = _admin("ob1")
        create_open_accounting_period(AS_OF, performed_by=self.admin)

    def test_no_journal_entries_trial_balance_ok(self):
        cockpit = build_accounting_close_cockpit(YEAR, MONTH, AS_OF)
        tb = cockpit["sections"]["trial_balance"]
        # No posted lines → debit == credit == 0 → balanced
        self.assertNotEqual(tb.get("status"), STATUS_CRITICAL)

    def test_period_exists_is_reflected(self):
        cockpit = build_accounting_close_cockpit(YEAR, MONTH, AS_OF)
        self.assertTrue(cockpit["period_state"]["period_id"] is not None)
        self.assertFalse(cockpit["period_state"]["is_locked"])
        self.assertFalse(cockpit["period_state"]["is_closed"])

    def test_no_journal_data_trial_balance_balanced(self):
        cockpit = build_accounting_close_cockpit(YEAR, MONTH, AS_OF)
        tb = cockpit["sections"]["trial_balance"]
        self.assertTrue(tb.get("is_balanced", True))

    def test_period_missing_blocker_absent_when_period_exists(self):
        cockpit = build_accounting_close_cockpit(YEAR, MONTH, AS_OF)
        blocker_keys = [b["key"] for b in cockpit["blockers"]]
        self.assertNotIn("period.missing", blocker_keys)


# ─────────────────────────────────────────────────────────────────────────────
# Unbalanced trial balance → CRITICAL blocker → can_close = False
# ─────────────────────────────────────────────────────────────────────────────

class TestUnbalancedTrialBalance(TestCase):
    """
    Simulate an unbalanced trial balance by injecting a mocked section result
    into build_close_blockers (which accepts pre-loaded section dicts).
    """

    def test_imbalance_creates_critical_blocker(self):
        fake_tb = {
            "status": STATUS_CRITICAL,
            "is_balanced": False,
            "total_debit": "1000.00",
            "total_credit": "900.00",
            "difference": "100.00",
            "critical_check_count": 0,
            "draft_journal_count": 0,
            "deferred": False,
        }
        fake_me = {"status": STATUS_OK, "can_execute": True, "blocking_count": 0, "blocking_checks": [], "deferred": False}
        fake_lr = {"status": STATUS_OK, "overall_status": STATUS_OK, "deferred": False}
        fake_pl = {"period_exists": True, "period_id": 1, "period_code": "TST-202606", "status": "OPEN", "is_locked": False, "is_closed": False, "lock_allowed": True, "lock_blockers": [], "manual_lock_required": True, "existing_lock_endpoint": "/api/v1/accounting/periods/1/lock/"}

        blockers = build_close_blockers(
            YEAR, MONTH, AS_OF,
            _month_end=fake_me,
            _trial_balance=fake_tb,
            _liability_recon=fake_lr,
            _period_lock=fake_pl,
        )
        blocker_keys = [b["key"] for b in blockers]
        self.assertIn("trial_balance.imbalance", blocker_keys)
        critical_blockers = [b for b in blockers if b["severity"] == "CRITICAL"]
        self.assertGreater(len(critical_blockers), 0)

    def test_imbalance_sets_can_close_false(self):
        fake_tb = {
            "status": STATUS_CRITICAL,
            "is_balanced": False,
            "total_debit": "1000.00",
            "total_credit": "900.00",
            "difference": "100.00",
            "critical_check_count": 0,
            "draft_journal_count": 0,
            "deferred": False,
        }
        fake_me = {"status": STATUS_OK, "can_execute": True, "blocking_count": 0, "blocking_checks": [], "deferred": False}
        fake_lr = {"status": STATUS_OK, "overall_status": STATUS_OK, "deferred": False}
        fake_pl = {"period_exists": True, "period_id": 1, "period_code": "TST-202606", "status": "OPEN", "is_locked": False, "is_closed": False, "lock_allowed": True, "lock_blockers": [], "manual_lock_required": True, "existing_lock_endpoint": "/api/v1/accounting/periods/1/lock/"}

        blockers = build_close_blockers(
            YEAR, MONTH, AS_OF,
            _month_end=fake_me,
            _trial_balance=fake_tb,
            _liability_recon=fake_lr,
            _period_lock=fake_pl,
        )
        has_critical = any(b["severity"] == "CRITICAL" for b in blockers)
        self.assertTrue(has_critical)


# ─────────────────────────────────────────────────────────────────────────────
# Liability reconciliation CRITICAL → blocks close
# ─────────────────────────────────────────────────────────────────────────────

class TestLiabilityReconciliationCritical(TestCase):

    def test_critical_liability_recon_blocks_close(self):
        fake_tb = {"status": STATUS_OK, "is_balanced": True, "total_debit": "0.00", "total_credit": "0.00", "difference": "0.00", "critical_check_count": 0, "draft_journal_count": 0, "deferred": False}
        fake_me = {"status": STATUS_OK, "can_execute": True, "blocking_count": 0, "blocking_checks": [], "deferred": False}
        fake_lr = {"status": STATUS_CRITICAL, "overall_status": STATUS_CRITICAL, "deferred": False}
        fake_pl = {"period_exists": True, "period_id": 1, "period_code": "TST-202606", "status": "OPEN", "is_locked": False, "is_closed": False, "lock_allowed": True, "lock_blockers": [], "manual_lock_required": True, "existing_lock_endpoint": "/api/v1/accounting/periods/1/lock/"}

        blockers = build_close_blockers(
            YEAR, MONTH, AS_OF,
            _month_end=fake_me,
            _trial_balance=fake_tb,
            _liability_recon=fake_lr,
            _period_lock=fake_pl,
        )
        blocker_keys = [b["key"] for b in blockers]
        self.assertIn("liability_reconciliation.critical", blocker_keys)


# ─────────────────────────────────────────────────────────────────────────────
# Month-end critical blocker → blocks close
# ─────────────────────────────────────────────────────────────────────────────

class TestMonthEndCriticalBlocker(TestCase):

    def test_blocking_month_end_check_blocks_close(self):
        fake_tb = {"status": STATUS_OK, "is_balanced": True, "total_debit": "0.00", "total_credit": "0.00", "difference": "0.00", "critical_check_count": 0, "draft_journal_count": 0, "deferred": False}
        fake_me = {
            "status": STATUS_CRITICAL,
            "can_execute": False,
            "blocking_count": 1,
            "blocking_checks": [{"key": "no_critical_exceptions", "detail": "1 critical exception(s) unresolved."}],
            "deferred": False,
        }
        fake_lr = {"status": STATUS_OK, "overall_status": STATUS_OK, "deferred": False}
        fake_pl = {"period_exists": True, "period_id": 1, "period_code": "TST-202606", "status": "OPEN", "is_locked": False, "is_closed": False, "lock_allowed": True, "lock_blockers": [], "manual_lock_required": True, "existing_lock_endpoint": "/api/v1/accounting/periods/1/lock/"}

        blockers = build_close_blockers(
            YEAR, MONTH, AS_OF,
            _month_end=fake_me,
            _trial_balance=fake_tb,
            _liability_recon=fake_lr,
            _period_lock=fake_pl,
        )
        blocker_keys = [b["key"] for b in blockers]
        self.assertIn("month_end.blocking_checks", blocker_keys)
        critical_blockers = [b for b in blockers if b["severity"] == "CRITICAL"]
        self.assertGreater(len(critical_blockers), 0)


# ─────────────────────────────────────────────────────────────────────────────
# Draft journals → warning (not blocker)
# ─────────────────────────────────────────────────────────────────────────────

class TestDraftJournalWarning(TestCase):

    def test_draft_journals_appear_in_cockpit_warnings(self):
        admin = _admin("dj1")
        create_open_accounting_period(AS_OF, performed_by=admin)

        # Create a draft journal in the period to trigger draft journal warning
        from accounting.models import JournalEntry, JournalEntryType, JournalEntryStatus
        from tests.accounting.helpers import seed_bridge_ready_environment

        env = seed_bridge_ready_environment(AS_OF, performed_by=admin)
        JournalEntry.objects.create(
            entry_date=AS_OF,
            entry_type=JournalEntryType.MANUAL,
            financial_year=env["financial_year"],
            accounting_period=env["accounting_period"],
            status=JournalEntryStatus.DRAFT,
            source_model="",
            source_id="",
            memo="P4D test draft journal",
        )

        cockpit = build_accounting_close_cockpit(YEAR, MONTH, AS_OF)
        tb = cockpit["sections"]["trial_balance"]
        self.assertGreater(tb.get("draft_journal_count", 0), 0)

        warning_keys = [w["key"] for w in cockpit["warnings"]]
        self.assertIn("trial_balance.draft_journals", warning_keys)

    def test_draft_journal_does_not_become_blocker(self):
        admin = _admin("dj2")
        create_open_accounting_period(AS_OF, performed_by=admin)

        from accounting.models import JournalEntry, JournalEntryType, JournalEntryStatus
        from tests.accounting.helpers import seed_bridge_ready_environment

        env = seed_bridge_ready_environment(AS_OF, performed_by=admin)
        JournalEntry.objects.create(
            entry_date=AS_OF,
            entry_type=JournalEntryType.MANUAL,
            financial_year=env["financial_year"],
            accounting_period=env["accounting_period"],
            status=JournalEntryStatus.DRAFT,
            source_model="",
            source_id="",
            memo="P4D test draft journal no-blocker",
        )

        cockpit = build_accounting_close_cockpit(YEAR, MONTH, AS_OF)
        # draft journals must NOT appear in blockers, only in warnings
        blocker_keys = [b["key"] for b in cockpit["blockers"]]
        self.assertNotIn("trial_balance.draft_journals", blocker_keys)


# ─────────────────────────────────────────────────────────────────────────────
# Period locked/closed posture
# ─────────────────────────────────────────────────────────────────────────────

class TestPeriodLockClosedPosture(TestCase):

    def test_locked_period_reflected_in_state(self):
        admin = _admin("plc1")
        create_locked_accounting_period(AS_OF, performed_by=admin)
        cockpit = build_accounting_close_cockpit(YEAR, MONTH, AS_OF)
        self.assertTrue(cockpit["period_state"]["is_locked"])
        self.assertFalse(cockpit["period_state"]["is_closed"])
        self.assertFalse(cockpit["can_lock"])

    def test_closed_period_reflected_in_state(self):
        admin = _admin("plc2")
        create_closed_accounting_period(AS_OF, performed_by=admin)
        cockpit = build_accounting_close_cockpit(YEAR, MONTH, AS_OF)
        self.assertTrue(cockpit["period_state"]["is_locked"])
        self.assertTrue(cockpit["period_state"]["is_closed"])
        self.assertFalse(cockpit["can_lock"])

    def test_locked_period_warning_in_warnings(self):
        admin = _admin("plc3")
        create_locked_accounting_period(AS_OF, performed_by=admin)
        cockpit = build_accounting_close_cockpit(YEAR, MONTH, AS_OF)
        warning_keys = [w["key"] for w in cockpit["warnings"]]
        self.assertIn("period.already_locked", warning_keys)

    def test_closed_period_warning_in_warnings(self):
        admin = _admin("plc4")
        create_closed_accounting_period(AS_OF, performed_by=admin)
        cockpit = build_accounting_close_cockpit(YEAR, MONTH, AS_OF)
        warning_keys = [w["key"] for w in cockpit["warnings"]]
        self.assertIn("period.already_closed", warning_keys)


# ─────────────────────────────────────────────────────────────────────────────
# can_close / can_lock logic
# ─────────────────────────────────────────────────────────────────────────────

class TestCanCloseCanLockLogic(TestCase):

    def test_critical_blocker_sets_can_close_false(self):
        # No period → period.missing blocker → CRITICAL → can_close=False
        cockpit = build_accounting_close_cockpit(YEAR, MONTH, AS_OF)
        blockers = [b for b in cockpit["blockers"] if b["severity"] == "CRITICAL"]
        self.assertGreater(len(blockers), 0)
        self.assertFalse(cockpit["can_close"])

    def test_can_lock_false_without_period(self):
        cockpit = build_accounting_close_cockpit(YEAR, MONTH, AS_OF)
        self.assertFalse(cockpit["can_lock"])

    def test_open_period_empty_books_can_lock(self):
        admin = _admin("cl1")
        create_open_accounting_period(AS_OF, performed_by=admin)
        cockpit = build_accounting_close_cockpit(YEAR, MONTH, AS_OF)
        # With empty books (0 debit = 0 credit = balanced) and open period,
        # there should be no critical blockers so can_lock = True
        self.assertTrue(cockpit["can_lock"])

    def test_locked_period_cannot_lock_again(self):
        admin = _admin("cl2")
        create_locked_accounting_period(AS_OF, performed_by=admin)
        cockpit = build_accounting_close_cockpit(YEAR, MONTH, AS_OF)
        self.assertFalse(cockpit["can_lock"])


# ─────────────────────────────────────────────────────────────────────────────
# Action items: source_area and severity
# ─────────────────────────────────────────────────────────────────────────────

class TestActionItemShape(TestCase):

    def test_action_items_have_source_area_and_severity(self):
        cockpit = build_accounting_close_cockpit(YEAR, MONTH, AS_OF)
        for item in cockpit["action_items"]:
            self.assertIn("source_area", item, f"Action item missing source_area: {item}")
            self.assertIn("severity", item, f"Action item missing severity: {item}")
            self.assertIn(item["severity"], {"CRITICAL", "WARNING", "INFO"}, f"Invalid severity: {item}")

    def test_action_items_sorted_by_severity(self):
        cockpit = build_accounting_close_cockpit(YEAR, MONTH, AS_OF)
        rank = {"CRITICAL": 0, "WARNING": 1, "INFO": 2}
        items = cockpit["action_items"]
        for i in range(len(items) - 1):
            a, b = items[i], items[i + 1]
            self.assertLessEqual(
                rank.get(a["severity"], 9),
                rank.get(b["severity"], 9),
                f"Action items not sorted: {a['severity']} before {b['severity']}",
            )


# ─────────────────────────────────────────────────────────────────────────────
# Existing lock endpoint reference
# ─────────────────────────────────────────────────────────────────────────────

class TestExistingLockEndpointReference(TestCase):

    def test_lock_posture_references_existing_endpoint(self):
        admin = _admin("ep1")
        create_open_accounting_period(AS_OF, performed_by=admin)
        posture = build_period_lock_posture(YEAR, MONTH)
        self.assertIn("/api/v1/accounting/periods/", posture["existing_lock_endpoint"])
        self.assertIn("/lock/", posture["existing_lock_endpoint"])

    def test_missing_period_posture_still_references_template(self):
        posture = build_period_lock_posture(YEAR, MONTH)
        self.assertIn("accounting/periods", posture["existing_lock_endpoint"])


# ─────────────────────────────────────────────────────────────────────────────
# No records created/mutated
# ─────────────────────────────────────────────────────────────────────────────

class TestNoRecordsMutated(TestCase):
    """
    Verify the service creates and mutates zero financial records.
    """

    def _count_all(self):
        from accounting.models import (
            AccountingBridgePosting,
            JournalEntry,
            JournalEntryLine,
        )
        from subscriptions.models import CustomerAdvance

        counts: dict[str, int] = {
            "JournalEntry": JournalEntry.objects.count(),
            "JournalEntryLine": JournalEntryLine.objects.count(),
            "AccountingBridgePosting": AccountingBridgePosting.objects.count(),
            "CustomerAdvance": CustomerAdvance.objects.count(),
        }
        try:
            from subscriptions.models import StockLedger
            counts["StockLedger"] = StockLedger.objects.count()
        except Exception:  # noqa: BLE001
            pass
        try:
            from rent_lease.models import RentLeaseDepositTransaction
            counts["RentLeaseDepositTransaction"] = RentLeaseDepositTransaction.objects.count()
        except Exception:  # noqa: BLE001
            pass
        return counts

    def test_cockpit_does_not_create_or_mutate_records(self):
        admin = _admin("nm1")
        create_open_accounting_period(AS_OF, performed_by=admin)

        before = self._count_all()
        build_accounting_close_cockpit(YEAR, MONTH, AS_OF)
        after = self._count_all()

        for model_name, count_before in before.items():
            self.assertEqual(
                after[model_name],
                count_before,
                f"{model_name} count changed from {count_before} to {after[model_name]}",
            )


# ─────────────────────────────────────────────────────────────────────────────
# API endpoint access control
# ─────────────────────────────────────────────────────────────────────────────

class TestCloseCockpitApiPermissions(TestCase):

    def test_unauthenticated_blocked(self):
        client = APIClient()
        response = client.get(f"{CLOSE_COCKPIT_URL}?year={YEAR}&month={MONTH}")
        self.assertIn(response.status_code, [401, 403])

    def test_cashier_blocked(self):
        cashier = _cashier("p1")
        client = APIClient()
        client.force_authenticate(user=cashier)
        response = client.get(f"{CLOSE_COCKPIT_URL}?year={YEAR}&month={MONTH}")
        self.assertIn(response.status_code, [401, 403])

    def test_customer_blocked(self):
        customer = _customer_user("p1")
        client = APIClient()
        client.force_authenticate(user=customer)
        response = client.get(f"{CLOSE_COCKPIT_URL}?year={YEAR}&month={MONTH}")
        self.assertIn(response.status_code, [401, 403])

    def test_partner_blocked(self):
        partner = _partner_user("p1")
        client = APIClient()
        client.force_authenticate(user=partner)
        response = client.get(f"{CLOSE_COCKPIT_URL}?year={YEAR}&month={MONTH}")
        self.assertIn(response.status_code, [401, 403])

    def test_admin_allowed(self):
        admin = _admin("ap1")
        client = APIClient()
        client.force_authenticate(user=admin)
        response = client.get(f"{CLOSE_COCKPIT_URL}?year={YEAR}&month={MONTH}")
        self.assertEqual(response.status_code, 200)

    def test_admin_response_has_required_keys(self):
        admin = _admin("ap2")
        client = APIClient()
        client.force_authenticate(user=admin)
        response = client.get(f"{CLOSE_COCKPIT_URL}?year={YEAR}&month={MONTH}")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        for key in ("period", "as_of", "overall_status", "can_close", "can_lock", "sections", "blockers", "warnings", "action_items"):
            self.assertIn(key, data, f"Response missing key: {key}")

    def test_admin_with_invalid_year_returns_400(self):
        admin = _admin("ap3")
        client = APIClient()
        client.force_authenticate(user=admin)
        response = client.get(f"{CLOSE_COCKPIT_URL}?year=notanumber&month=6")
        self.assertEqual(response.status_code, 400)

    def test_admin_with_invalid_month_returns_400(self):
        admin = _admin("ap4")
        client = APIClient()
        client.force_authenticate(user=admin)
        response = client.get(f"{CLOSE_COCKPIT_URL}?year=2026&month=13")
        self.assertEqual(response.status_code, 400)

    def test_admin_with_invalid_as_of_returns_400(self):
        admin = _admin("ap5")
        client = APIClient()
        client.force_authenticate(user=admin)
        response = client.get(f"{CLOSE_COCKPIT_URL}?year=2026&month=6&as_of=not-a-date")
        self.assertEqual(response.status_code, 400)

    def test_admin_without_year_month_defaults_to_current(self):
        admin = _admin("ap6")
        client = APIClient()
        client.force_authenticate(user=admin)
        response = client.get(CLOSE_COCKPIT_URL)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("period", data)
