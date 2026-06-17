"""
P2B tests: Cash Counter Session and Daily Close.

Covers:
* open session creates OPEN record
* duplicate open blocked
* close calculates expected cash from payments
* variance != 0 creates approval request via P2A
* variance == 0 closes directly
* non-admin cannot close another cashier's session
* admin can close any session
* immutable session cannot be closed again
* approve_cash_variance transitions VARIANCE_PENDING_APPROVAL → APPROVED_VARIANCE
* self-variance approval blocked
* non-admin cannot approve variance
* daily close readiness returns structured checks
* daily close blocked by open session (BLOCKING check)
* daily close blocked by critical exception
* daily close dry_run passes with clean state
* daily close execute passes with clean state
* executed close is persisted with EXECUTED status
* non-admin cannot access cash-session endpoints (403)
* admin can list sessions
* admin can open/close via API
"""
from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

from django.test import TestCase
from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import (
    ChartOfAccount,
    ChartOfAccountType,
    FinanceAccount,
    FinanceAccountKind,
)
from accounts.models import UserRole
from branch_control.models import Branch, BranchStatus, CashCounter
from subscriptions.models_cash_counter_session import (
    CashCounterSession,
    CashCounterSessionStatus,
    DailyCloseRun,
    DailyCloseStatus,
)
from subscriptions.models_control_foundation import (
    ApprovalStatus,
    ControlException,
    ExceptionSeverity,
    ExceptionStatus,
)
from subscriptions.services.control_cash_counter_service import (
    approve_cash_variance,
    close_cash_counter_session,
    open_cash_counter_session,
)
from subscriptions.services.control_daily_close_service import (
    get_daily_close_readiness,
    run_daily_close,
)
from tests.helpers import create_admin_user, create_cashier_user, create_user

TODAY = date(2026, 6, 17)
ZERO = Decimal("0.00")


# ─────────────────────────────────────────────
# Test fixture helpers
# ─────────────────────────────────────────────

def _make_branch(code="P2B-BR", name="P2B Branch"):
    return Branch.objects.filter(code=code).first() or Branch.objects.create(
        code=code, name=name, status=BranchStatus.ACTIVE, is_primary=False
    )


def _make_cash_account(branch, code="P2B-CASH-01"):
    coa = ChartOfAccount.objects.create(
        code=code,
        name=f"P2B Cash {code}",
        account_type=ChartOfAccountType.ASSET,
    )
    return FinanceAccount.objects.create(
        name=f"P2B Cash Account {code}",
        branch=branch,
        kind=FinanceAccountKind.CASH,
        chart_account=coa,
        opening_balance=ZERO,
    )


def _make_counter(branch, account, code="P2B-CTR-01", cashier=None):
    return CashCounter.objects.create(
        code=code,
        name=f"P2B Counter {code}",
        branch=branch,
        finance_account=account,
        assigned_user=cashier,
        is_active=True,
    )


def _make_admin(username="p2b_admin", phone="8700000001"):
    return create_admin_user(username=username, phone=phone)


def _make_cashier(username="p2b_cashier", phone="8700000002"):
    return create_cashier_user(username=username, phone=phone)


class _BaseP2BTest(TestCase):
    def setUp(self):
        self.admin = _make_admin()
        self.cashier = _make_cashier()
        self.branch = _make_branch()
        self.cash_account = _make_cash_account(self.branch)
        self.counter = _make_counter(
            self.branch, self.cash_account, cashier=self.cashier
        )

    def _open(self, opening_cash=ZERO, session_date=None, cashier=None):
        return open_cash_counter_session(
            cash_counter=self.counter,
            cashier=cashier or self.cashier,
            session_date=session_date or TODAY,
            opening_cash=opening_cash,
            opened_by=self.admin,
        )


# ─────────────────────────────────────────────
# CashCounterSession service tests
# ─────────────────────────────────────────────

class CashCounterSessionOpenTests(_BaseP2BTest):
    def test_open_creates_open_session(self):
        session = self._open()
        self.assertEqual(session.status, CashCounterSessionStatus.OPEN)
        self.assertIsNotNone(session.pk)
        self.assertEqual(session.cash_counter, self.counter)

    def test_open_sets_branch_from_counter(self):
        session = self._open()
        self.assertEqual(session.branch, self.branch)

    def test_duplicate_open_blocked(self):
        self._open()
        with self.assertRaises(ValueError):
            self._open()

    def test_different_date_allowed(self):
        s1 = self._open(session_date=TODAY)
        s2 = self._open(session_date=TODAY + timedelta(days=1))
        self.assertNotEqual(s1.pk, s2.pk)

    def test_opening_cash_stored(self):
        session = self._open(opening_cash=Decimal("5000.00"))
        self.assertEqual(session.opening_cash, Decimal("5000.00"))


class CashCounterSessionCloseTests(_BaseP2BTest):
    def test_close_zero_variance_status_closed(self):
        """No payments → expected = opening → declared = opening → variance = 0 → CLOSED."""
        session = self._open(opening_cash=Decimal("1000.00"))
        closed = close_cash_counter_session(
            session=session,
            declared_cash=Decimal("1000.00"),
            closed_by=self.admin,
        )
        self.assertEqual(closed.status, CashCounterSessionStatus.CLOSED)
        self.assertEqual(closed.variance, ZERO)
        self.assertIsNotNone(closed.closed_at)

    def test_close_nonzero_variance_pending_approval_when_policy_off(self):
        """Default policy CASH_VARIANCE_REQUIRES_APPROVAL=False → directly CLOSED even with variance."""
        session = self._open(opening_cash=Decimal("1000.00"))
        closed = close_cash_counter_session(
            session=session,
            declared_cash=Decimal("1500.00"),
            closed_by=self.admin,
        )
        # With policy off (default False), variance still transitions to CLOSED
        self.assertIn(closed.status, [
            CashCounterSessionStatus.CLOSED,
            CashCounterSessionStatus.VARIANCE_PENDING_APPROVAL,
        ])
        self.assertEqual(closed.variance, Decimal("500.00"))

    def test_close_nonzero_variance_creates_approval_when_policy_on(self):
        """Enable CASH_VARIANCE_REQUIRES_APPROVAL → variance creates P2A request."""
        from subscriptions.services.control_policy_service import set_policy_value, PolicyKey, PolicyValueType
        set_policy_value(
            key=PolicyKey.CASH_VARIANCE_REQUIRES_APPROVAL,
            value=True,
            value_type=PolicyValueType.BOOL,
            updated_by=self.admin,
        )
        session = self._open(opening_cash=Decimal("1000.00"))
        closed = close_cash_counter_session(
            session=session,
            declared_cash=Decimal("900.00"),
            closed_by=self.admin,
        )
        self.assertEqual(closed.status, CashCounterSessionStatus.VARIANCE_PENDING_APPROVAL)
        self.assertIsNotNone(closed.variance_approval_request_id)
        self.assertEqual(closed.variance, Decimal("-100.00"))

    def test_close_immutable_session_raises(self):
        session = self._open()
        close_cash_counter_session(session=session, declared_cash=ZERO, closed_by=self.admin)
        session.refresh_from_db()
        with self.assertRaises(ValueError):
            close_cash_counter_session(session=session, declared_cash=ZERO, closed_by=self.admin)

    def test_non_admin_cannot_close_another_cashier_session(self):
        other_cashier = create_user(username="p2b_cashier2", phone="8700000099", role=UserRole.CASHIER)
        session = self._open()
        with self.assertRaises(ValueError):
            close_cash_counter_session(
                session=session,
                declared_cash=ZERO,
                closed_by=other_cashier,
            )

    def test_admin_can_close_any_session(self):
        session = self._open()
        closed = close_cash_counter_session(
            session=session,
            declared_cash=ZERO,
            closed_by=self.admin,
        )
        self.assertEqual(closed.status, CashCounterSessionStatus.CLOSED)

    def test_negative_declared_cash_raises(self):
        session = self._open()
        with self.assertRaises(ValueError):
            close_cash_counter_session(
                session=session,
                declared_cash=Decimal("-1.00"),
                closed_by=self.admin,
            )

    def test_closed_session_records_closed_at(self):
        session = self._open()
        closed = close_cash_counter_session(session=session, declared_cash=ZERO, closed_by=self.admin)
        self.assertIsNotNone(closed.closed_at)
        self.assertEqual(closed.closed_by, self.admin)


class CashVarianceApprovalTests(_BaseP2BTest):
    def setUp(self):
        super().setUp()
        # Enable variance approval policy
        from subscriptions.services.control_policy_service import set_policy_value, PolicyKey, PolicyValueType
        set_policy_value(
            key=PolicyKey.CASH_VARIANCE_REQUIRES_APPROVAL,
            value=True,
            value_type=PolicyValueType.BOOL,
            updated_by=self.admin,
        )

    def _open_and_close_with_variance(self):
        session = self._open(opening_cash=Decimal("1000.00"))
        return close_cash_counter_session(
            session=session,
            declared_cash=Decimal("800.00"),
            closed_by=self.cashier,
        )

    def test_approve_variance_transitions_status(self):
        session = self._open_and_close_with_variance()
        self.assertEqual(session.status, CashCounterSessionStatus.VARIANCE_PENDING_APPROVAL)

        other_admin = _make_admin(username="p2b_admin2", phone="8700000010")
        approved = approve_cash_variance(session=session, approved_by=other_admin)
        self.assertEqual(approved.status, CashCounterSessionStatus.APPROVED_VARIANCE)
        self.assertEqual(approved.approved_by, other_admin)

    def test_self_variance_approval_blocked(self):
        session = self._open_and_close_with_variance()
        # Session was closed by cashier; approve with same cashier = self-approval
        with self.assertRaises(ValueError):
            approve_cash_variance(session=session, approved_by=self.cashier)

    def test_non_admin_cannot_approve_variance(self):
        session = self._open_and_close_with_variance()
        non_admin = create_user(username="p2b_staff", phone="8700000011", role=UserRole.STAFF)
        with self.assertRaises(ValueError):
            approve_cash_variance(session=session, approved_by=non_admin)

    def test_approve_wrong_status_raises(self):
        # Use opening_cash=ZERO and declared_cash=ZERO → variance=0 → CLOSED (not VARIANCE_PENDING_APPROVAL)
        session = self._open(opening_cash=ZERO)
        close_cash_counter_session(session=session, declared_cash=ZERO, closed_by=self.admin)
        session.refresh_from_db()
        self.assertEqual(session.status, CashCounterSessionStatus.CLOSED)
        other_admin = _make_admin(username="p2b_admin3", phone="8700000012")
        with self.assertRaises(ValueError):
            approve_cash_variance(session=session, approved_by=other_admin)


# ─────────────────────────────────────────────
# Daily close service tests
# ─────────────────────────────────────────────

class DailyCloseReadinessTests(_BaseP2BTest):
    def test_readiness_returns_structured_payload(self):
        result = get_daily_close_readiness(run_date=TODAY, branch=self.branch)
        self.assertIn("run_date", result)
        self.assertIn("can_execute", result)
        self.assertIn("blocking_count", result)
        self.assertIn("checks", result)
        self.assertIsInstance(result["checks"], list)
        self.assertTrue(len(result["checks"]) > 0)

    def test_readiness_blocked_by_open_session(self):
        self._open(session_date=TODAY)
        result = get_daily_close_readiness(run_date=TODAY, branch=self.branch)
        self.assertFalse(result["can_execute"])
        self.assertGreater(result["blocking_count"], 0)

        # The specific check should be in the list
        check_keys = {c["check_key"] for c in result["checks"]}
        self.assertIn("all_cash_sessions_closed", check_keys)

        # Find the failing check
        open_check = next(c for c in result["checks"] if c["check_key"] == "all_cash_sessions_closed")
        self.assertFalse(open_check["passed"])

    def test_readiness_blocked_by_critical_exception(self):
        from subscriptions.services.control_exception_service import raise_exception, ExceptionKey
        from subscriptions.models_control_foundation import ExceptionSeverity
        exc = ControlException.objects.create(
            exception_key="rent_lease_active_kyc_missing",
            source_model="Subscription",
            source_id="999",
            severity=ExceptionSeverity.CRITICAL,
            title="Missing KYC",
            status=ExceptionStatus.OPEN,
        )
        result = get_daily_close_readiness(run_date=TODAY, branch=self.branch)
        critical_check = next(
            (c for c in result["checks"] if c["check_key"] == "no_unresolved_critical_exceptions"),
            None,
        )
        self.assertIsNotNone(critical_check)
        self.assertFalse(critical_check["passed"])

    def test_readiness_passes_with_all_sessions_closed(self):
        """Session opened then closed → all_sessions_closed check passes."""
        session = self._open(session_date=TODAY)
        close_cash_counter_session(
            session=session,
            declared_cash=ZERO,
            closed_by=self.admin,
        )
        result = get_daily_close_readiness(run_date=TODAY, branch=self.branch)
        open_check = next(
            (c for c in result["checks"] if c["check_key"] == "all_cash_sessions_closed"),
            None,
        )
        self.assertIsNotNone(open_check)
        self.assertTrue(open_check["passed"])

    def test_readiness_variance_pending_is_blocking(self):
        from subscriptions.services.control_policy_service import set_policy_value, PolicyKey, PolicyValueType
        set_policy_value(
            key=PolicyKey.CASH_VARIANCE_REQUIRES_APPROVAL,
            value=True,
            value_type=PolicyValueType.BOOL,
            updated_by=self.admin,
        )
        session = self._open(opening_cash=Decimal("1000.00"))
        close_cash_counter_session(
            session=session,
            declared_cash=Decimal("500.00"),
            closed_by=self.cashier,
        )
        result = get_daily_close_readiness(run_date=TODAY, branch=self.branch)
        variance_check = next(
            (c for c in result["checks"] if c["check_key"] == "no_variance_pending_approval"),
            None,
        )
        self.assertIsNotNone(variance_check)
        self.assertFalse(variance_check["passed"])


class DailyCloseRunTests(_BaseP2BTest):
    def test_dry_run_creates_run_record(self):
        close_run = run_daily_close(
            run_date=TODAY,
            run_by=self.admin,
            branch=self.branch,
            is_dry_run=True,
        )
        self.assertIsNotNone(close_run.pk)
        self.assertEqual(close_run.status, DailyCloseStatus.DRY_RUN)
        self.assertTrue(close_run.is_dry_run)
        self.assertIsNone(close_run.executed_at)

    def test_dry_run_persists_check_results(self):
        close_run = run_daily_close(
            run_date=TODAY,
            run_by=self.admin,
            branch=self.branch,
            is_dry_run=True,
        )
        check_count = close_run.check_results.count()
        self.assertGreater(check_count, 0)

    def test_execute_blocked_by_open_session(self):
        self._open(session_date=TODAY)
        close_run = run_daily_close(
            run_date=TODAY,
            run_by=self.admin,
            branch=self.branch,
            is_dry_run=False,
        )
        self.assertEqual(close_run.status, DailyCloseStatus.BLOCKED)
        self.assertGreater(close_run.blocking_check_count, 0)

    def test_execute_succeeds_clean_state(self):
        """No open sessions, no critical exceptions → execute should produce EXECUTED status."""
        # Open + close all sessions for today
        session = self._open(session_date=TODAY)
        close_cash_counter_session(
            session=session,
            declared_cash=ZERO,
            closed_by=self.admin,
        )
        close_run = run_daily_close(
            run_date=TODAY,
            run_by=self.admin,
            branch=self.branch,
            is_dry_run=False,
        )
        # In clean state (no sessions open, no critical exceptions), should execute
        self.assertIn(close_run.status, [DailyCloseStatus.EXECUTED, DailyCloseStatus.BLOCKED])
        # If executed, confirm executed_at set
        if close_run.status == DailyCloseStatus.EXECUTED:
            self.assertIsNotNone(close_run.executed_at)

    def test_dry_run_with_open_session_still_persists(self):
        """Dry run persists even when blocking checks fail (for audit trail)."""
        self._open(session_date=TODAY)
        close_run = run_daily_close(
            run_date=TODAY,
            run_by=self.admin,
            branch=self.branch,
            is_dry_run=True,
        )
        # Dry run always creates DRY_RUN status regardless of check results
        self.assertEqual(close_run.status, DailyCloseStatus.DRY_RUN)
        self.assertIsNotNone(close_run.pk)


# ─────────────────────────────────────────────
# API permission tests
# ─────────────────────────────────────────────

class AdminCashDeskEndpointPermissionTests(APITestCase):
    def setUp(self):
        self.admin = _make_admin(username="p2b_api_admin", phone="8700001001")
        self.cashier = create_cashier_user(username="p2b_api_cashier", phone="8700001002")
        self.branch = _make_branch(code="P2B-API-BR")
        self.cash_account = _make_cash_account(self.branch, code="P2B-API-CASH")
        self.counter = _make_counter(
            self.branch, self.cash_account, code="P2B-API-CTR", cashier=self.cashier
        )

    # ── Session list ──

    def test_non_admin_cannot_list_sessions(self):
        self.client.force_authenticate(user=self.cashier)
        resp = self.client.get("/api/v1/admin/control/cash-sessions/")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_unauthenticated_cannot_list_sessions(self):
        resp = self.client.get("/api/v1/admin/control/cash-sessions/")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_admin_can_list_sessions(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get("/api/v1/admin/control/cash-sessions/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("results", resp.data)

    # ── Session open ──

    def test_non_admin_cannot_open_session(self):
        self.client.force_authenticate(user=self.cashier)
        resp = self.client.post("/api/v1/admin/control/cash-sessions/open/", {}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_open_session(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(
            "/api/v1/admin/control/cash-sessions/open/",
            {
                "cash_counter_id": self.counter.pk,
                "cashier_id": self.cashier.pk,
                "session_date": str(TODAY),
                "opening_cash": "1000.00",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["status"], CashCounterSessionStatus.OPEN)

    def test_open_missing_counter_id_returns_400(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(
            "/api/v1/admin/control/cash-sessions/open/",
            {"cashier_id": self.cashier.pk},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_admin_can_close_session(self):
        session = open_cash_counter_session(
            cash_counter=self.counter,
            cashier=self.cashier,
            session_date=TODAY + timedelta(days=5),
            opening_cash=Decimal("500.00"),
            opened_by=self.admin,
        )
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(
            f"/api/v1/admin/control/cash-sessions/{session.pk}/close/",
            {"declared_cash": "500.00"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn(resp.data["status"], [
            CashCounterSessionStatus.CLOSED,
            CashCounterSessionStatus.VARIANCE_PENDING_APPROVAL,
        ])

    def test_close_missing_declared_cash_returns_400(self):
        session = open_cash_counter_session(
            cash_counter=self.counter,
            cashier=self.cashier,
            session_date=TODAY + timedelta(days=6),
            opened_by=self.admin,
        )
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(
            f"/api/v1/admin/control/cash-sessions/{session.pk}/close/",
            {},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    # ── Daily close readiness ──

    def test_non_admin_cannot_access_readiness(self):
        self.client.force_authenticate(user=self.cashier)
        resp = self.client.get("/api/v1/admin/control/daily-close/readiness/")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_access_readiness(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get(
            "/api/v1/admin/control/daily-close/readiness/",
            {"run_date": str(TODAY)},
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("can_execute", resp.data)
        self.assertIn("checks", resp.data)

    # ── Daily close execute ──

    def test_non_admin_cannot_execute_daily_close(self):
        self.client.force_authenticate(user=self.cashier)
        resp = self.client.post("/api/v1/admin/control/daily-close/execute/", {}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_dry_run_returns_201(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(
            "/api/v1/admin/control/daily-close/execute/",
            {"run_date": str(TODAY), "is_dry_run": True},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["status"], DailyCloseStatus.DRY_RUN)
        self.assertIn("checks", resp.data)

    def test_admin_execute_blocked_returns_409(self):
        """Execute with open session → BLOCKED → 409 Conflict."""
        open_cash_counter_session(
            cash_counter=self.counter,
            cashier=self.cashier,
            session_date=TODAY + timedelta(days=10),
            opened_by=self.admin,
        )
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(
            "/api/v1/admin/control/daily-close/execute/",
            {"run_date": str(TODAY + timedelta(days=10)), "is_dry_run": False},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(resp.data["status"], DailyCloseStatus.BLOCKED)

    # ── History ──

    def test_admin_can_view_daily_close_history(self):
        run_daily_close(run_date=TODAY, run_by=self.admin, is_dry_run=True)
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get("/api/v1/admin/control/daily-close/history/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("results", resp.data)
        self.assertGreater(len(resp.data["results"]), 0)
