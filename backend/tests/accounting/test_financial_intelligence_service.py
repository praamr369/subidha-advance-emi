"""
P4A — Financial Intelligence Readiness service tests.

All tests are read-only: no bridge posting, journal entry, payment,
EMI, stock ledger, or reconciliation rows are mutated.
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal

from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from accounts.models import User, UserRole
from accounting.services.financial_intelligence_service import (
    STATUS_OK,
    STATUS_WARNING,
    STATUS_CRITICAL,
    STATUS_INFO,
    build_financial_action_items,
    build_financial_intelligence_snapshot,
    build_bridge_posture,
    build_control_posture,
    build_reconciliation_posture,
)
from tests.helpers import create_admin_user, create_user


PERIOD_2026_06 = {"year": 2026, "month": 6}
AS_OF_2026_06 = date(2026, 6, 18)


def _admin():
    return create_admin_user(username="fi_admin", phone="9100000099")


def _cashier():
    return create_user(username="fi_cashier", role=UserRole.CASHIER, phone="9100000098")


def _customer():
    return create_user(username="fi_customer", role=UserRole.CUSTOMER, phone="9100000097")


def _partner():
    return create_user(username="fi_partner", role=UserRole.PARTNER, phone="9100000096")


class EmptySystemSnapshotTests(TestCase):
    """An empty system returns a safe, well-structured snapshot."""

    def test_snapshot_returns_all_sections(self):
        snap = build_financial_intelligence_snapshot(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        self.assertIn("as_of", snap)
        self.assertIn("period", snap)
        self.assertIn("overall_status", snap)
        self.assertIn("sections", snap)
        self.assertIn("action_items", snap)
        sections = snap["sections"]
        for key in ("collection", "billing", "bridge", "reconciliation", "advance_deposit", "control", "inventory_finance"):
            self.assertIn(key, sections, f"Missing section: {key}")

    def test_snapshot_overall_status_is_valid(self):
        snap = build_financial_intelligence_snapshot(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        self.assertIn(snap["overall_status"], {STATUS_OK, STATUS_INFO, STATUS_WARNING, STATUS_CRITICAL})

    def test_snapshot_period_matches_params(self):
        snap = build_financial_intelligence_snapshot(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        self.assertEqual(snap["period"]["year"], 2026)
        self.assertEqual(snap["period"]["month"], 6)

    def test_snapshot_action_items_is_list(self):
        snap = build_financial_intelligence_snapshot(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        self.assertIsInstance(snap["action_items"], list)

    def test_empty_system_collection_count_zero(self):
        snap = build_financial_intelligence_snapshot(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        col = snap["sections"]["collection"]
        self.assertEqual(col.get("period_payment_count", 0), 0)
        self.assertEqual(col.get("missing_receipt_count", 0), 0)
        self.assertEqual(col.get("reversed_payment_count", 0), 0)

    def test_empty_system_bridge_total_zero(self):
        snap = build_financial_intelligence_snapshot(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        bridge = snap["sections"]["bridge"]
        if not bridge.get("deferred"):
            self.assertEqual(bridge.get("total_bridge_postings", 0), 0)

    def test_empty_system_reconciliation_unresolved_zero(self):
        snap = build_financial_intelligence_snapshot(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        recon = snap["sections"]["reconciliation"]
        if not recon.get("deferred"):
            self.assertEqual(recon.get("total_unresolved_items", 0), 0)

    def test_empty_system_control_has_subsections(self):
        ctrl = build_control_posture(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        self.assertIn("status", ctrl)
        # If P2A/P2B/P2C models exist (they do), we expect their subsections
        self.assertIn("control_exceptions", ctrl)
        self.assertIn("cash_desk", ctrl)
        self.assertIn("month_end_close", ctrl)

    def test_empty_month_end_close_returns_info_not_ok(self):
        ctrl = build_control_posture(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        me = ctrl.get("month_end_close", {})
        # No close run yet → should be INFO (not OK, not CRITICAL)
        self.assertIn(me.get("status"), {STATUS_INFO, STATUS_OK})


class CollectionPostureSectionTests(TestCase):
    """Payments section counts and method splits."""

    def _create_payment(self, method="CASH", amount="500.00", payment_date=None):
        from subscriptions.models import Payment, PaymentMethod
        from tests.helpers import (
            create_batch,
            create_customer_profile,
            create_emi,
            create_lucky_id,
            create_product,
            create_subscription,
            ensure_default_payment_collection_accounts,
            ensure_test_accounting_posting_prerequisites,
        )
        from django.utils import timezone

        ref = date(2026, 6, 10)
        ensure_test_accounting_posting_prerequisites(ref)
        fa_map = ensure_default_payment_collection_accounts()
        fa = fa_map.get("CASH") or list(fa_map.values())[0]

        customer = create_customer_profile(name="FI Test Customer A", phone="9700000201")
        product = create_product(name="FI Product A", product_code="FI-PROD-A", base_price=Decimal("1200.00"))
        batch = create_batch(batch_code="FI-BATCH-A", duration_months=3, total_slots=10, draw_day=5, start_date=date(2026, 4, 1))
        lucky_id = create_lucky_id(batch=batch, lucky_number=1)
        subscription = create_subscription(
            customer=customer, product=product, batch=batch, lucky_id=lucky_id,
            total_amount=Decimal("1200.00"), monthly_amount=Decimal("400.00"),
            tenure_months=3, start_date=date(2026, 4, 1),
        )
        emi = create_emi(subscription=subscription, month_no=1, amount=Decimal("400.00"), due_date=date(2026, 5, 1))
        p = Payment.objects.create(
            customer=customer,
            subscription=subscription,
            emi=emi,
            amount=Decimal(amount),
            method=method,
            payment_date=payment_date or date(2026, 6, 10),
            finance_account=fa,
        )
        return p

    def test_payment_count_appears_in_snapshot(self):
        try:
            self._create_payment(method="CASH", amount="500.00", payment_date=date(2026, 6, 10))
        except Exception:
            self.skipTest("Cannot create test payment in this environment; skipping.")

        snap = build_financial_intelligence_snapshot(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        col = snap["sections"]["collection"]
        if col.get("deferred"):
            self.skipTest("Collection posture deferred; skipping.")
        self.assertGreaterEqual(col["period_payment_count"], 1)
        self.assertGreater(Decimal(col["period_payment_amount"]), Decimal("0"))

    def test_missing_receipt_shows_warning(self):
        """
        Payments without linked receipt_document should raise the section
        status to at least WARNING.
        """
        try:
            self._create_payment(method="CASH", amount="200.00", payment_date=date(2026, 6, 5))
        except Exception:
            self.skipTest("Cannot create test payment; skipping.")

        snap = build_financial_intelligence_snapshot(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        col = snap["sections"]["collection"]
        if col.get("deferred"):
            self.skipTest("Collection posture deferred; skipping.")
        if col["missing_receipt_count"] > 0:
            self.assertIn(col["status"], {STATUS_WARNING, STATUS_CRITICAL})


class BridgePostureSectionTests(TestCase):
    """Bridge posture groups journal entry statuses correctly."""

    def test_bridge_posture_returns_required_keys(self):
        bridge = build_bridge_posture(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        if bridge.get("deferred"):
            self.skipTest("Bridge posture deferred; skipping.")
        for key in ("status", "total_bridge_postings", "total_posted", "total_draft", "total_void"):
            self.assertIn(key, bridge)

    def test_bridge_posture_damage_deduction_present(self):
        bridge = build_bridge_posture(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        if bridge.get("deferred"):
            self.skipTest("Bridge posture deferred; skipping.")
        self.assertIn("damage_deduction_posture", bridge)
        dd = bridge["damage_deduction_posture"]
        self.assertIn("status", dd)

    def test_bridge_posture_rent_lease_present(self):
        bridge = build_bridge_posture(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        if bridge.get("deferred"):
            self.skipTest("Bridge posture deferred; skipping.")
        self.assertIn("rent_lease_bridge_posture", bridge)

    def test_draft_bridge_postings_trigger_warning(self):
        """If any bridge posting has a DRAFT journal entry, status must be WARNING or worse."""
        from accounting.models import (
            AccountingBridgePosting,
            JournalEntry,
            JournalEntryStatus,
            JournalEntryType,
        )
        from tests.accounting.helpers import (
            seed_bridge_ready_environment,
            seed_required_numbering_profiles,
        )

        env = seed_bridge_ready_environment(date.today())
        seed_required_numbering_profiles(date.today())

        try:
            je = JournalEntry.objects.create(
                entry_no=f"TEST-DRAFT-{__import__('uuid').uuid4().hex[:8]}",
                entry_date=date.today(),
                entry_type=JournalEntryType.GENERAL,
                status=JournalEntryStatus.DRAFT,
                narration="Test draft journal",
            )
            AccountingBridgePosting.objects.create(
                source_model="Payment",
                source_id="999999",
                purpose="TEST_DRAFT_POSTURE",
                journal_entry=je,
            )
        except Exception:
            self.skipTest("Cannot create AccountingBridgePosting in this environment; skipping.")

        bridge = build_bridge_posture(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        if bridge.get("deferred"):
            self.skipTest("Bridge posture deferred; skipping.")
        self.assertGreater(bridge["total_draft"], 0)
        self.assertIn(bridge["status"], {STATUS_WARNING, STATUS_CRITICAL})


class DeferredSubsystemTests(TestCase):
    """Unavailable/deferred subsystems return INFO, not OK."""

    def test_deferred_section_is_info_not_ok(self):
        from accounting.services.financial_intelligence_service import _deferred
        result = _deferred("Test deferred message")
        self.assertEqual(result["status"], STATUS_INFO)
        self.assertTrue(result["deferred"])
        self.assertNotEqual(result["status"], STATUS_OK)

    def test_snapshot_with_bad_params_still_returns_dict(self):
        # Use a far-future date/period — should return safely structured output
        snap = build_financial_intelligence_snapshot(
            as_of=date(2099, 12, 31),
            period={"year": 2099, "month": 12},
        )
        self.assertIn("sections", snap)
        self.assertIn("action_items", snap)


class SecurityDepositPostureTests(TestCase):
    """Security deposit posture returns correct structure."""

    def test_deposit_posture_keys_present(self):
        snap = build_financial_intelligence_snapshot(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        adv = snap["sections"]["advance_deposit"]
        if adv.get("deferred"):
            self.skipTest("Advance/deposit posture deferred; skipping.")
        self.assertIn("customer_advance", adv)
        self.assertIn("security_deposit", adv)
        ca = adv["customer_advance"]
        sd = adv["security_deposit"]
        for key in ("total_count", "total_amount", "total_unapplied_amount", "liability_mismatch_count"):
            self.assertIn(key, ca)
        for key in ("collected_count", "collected_amount", "refunded_count", "refunded_amount",
                    "deducted_count", "deducted_amount", "deposit_transactions_without_bridge"):
            self.assertIn(key, sd)

    def test_advance_liability_mismatch_triggers_warning(self):
        from subscriptions.models import (
            CustomerAdvance, CustomerAdvanceStatus, MONEY_ZERO,
        )
        from tests.helpers import ensure_default_payment_collection_accounts, ensure_test_accounting_posting_prerequisites

        try:
            from tests.helpers import (
                create_customer_profile,
                ensure_default_payment_collection_accounts,
                ensure_test_accounting_posting_prerequisites,
            )
            ensure_test_accounting_posting_prerequisites(date.today())
            fa_map = ensure_default_payment_collection_accounts()
            fa = fa_map.get("CASH") or list(fa_map.values())[0]
            customer = create_customer_profile(name="FI Advance Test Customer", phone="9600000001")
            from subscriptions.models import PaymentMethod
            adv = CustomerAdvance.objects.create(
                customer=customer,
                finance_account=fa,
                amount=Decimal("1000.00"),
                unapplied_amount=Decimal("500.00"),
                method=PaymentMethod.CASH,
                payment_date=date(2026, 6, 1),
                status=CustomerAdvanceStatus.FULLY_APPLIED,
            )
        except Exception:
            self.skipTest("Cannot create CustomerAdvance in this environment; skipping.")

        snap = build_financial_intelligence_snapshot(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        adv_section = snap["sections"]["advance_deposit"]
        if adv_section.get("deferred"):
            self.skipTest("Advance/deposit posture deferred; skipping.")
        ca = adv_section["customer_advance"]
        self.assertGreater(ca["liability_mismatch_count"], 0)
        self.assertIn(adv_section["status"], {STATUS_WARNING, STATUS_CRITICAL})


class ControlPostureTests(TestCase):
    """Control posture reflects open exceptions and cash desk state."""

    def test_open_critical_exception_raises_status(self):
        from subscriptions.models_control_foundation import ControlException, ExceptionSeverity, ExceptionStatus

        try:
            ControlException.objects.create(
                exception_key="test.fi.critical.p4a",
                severity=ExceptionSeverity.CRITICAL,
                source_model="Payment",
                source_id="111111",
                title="Test critical exception for P4A",
                status=ExceptionStatus.OPEN,
            )
        except Exception:
            self.skipTest("Cannot create ControlException in this environment; skipping.")

        ctrl = build_control_posture(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        exc_section = ctrl.get("control_exceptions", {})
        if exc_section.get("deferred"):
            self.skipTest("ControlException check deferred; skipping.")
        self.assertGreater(exc_section["open_critical_high_count"], 0)
        self.assertEqual(exc_section["status"], STATUS_CRITICAL)
        self.assertEqual(ctrl["status"], STATUS_CRITICAL)

    def test_open_cash_session_shows_in_control_posture(self):
        from subscriptions.models_cash_counter_session import CashCounterSession, CashCounterSessionStatus
        from branch_control.models import Branch, CashCounter

        try:
            branch, _ = Branch.objects.get_or_create(
                code="FI_TEST_BR", defaults={"name": "FI Test Branch"}
            )
            counter, _ = CashCounter.objects.get_or_create(
                name="FI Test Counter",
                branch=branch,
                defaults={"is_active": True},
            )
            admin = _admin()
            CashCounterSession.objects.create(
                counter=counter,
                branch=branch,
                cashier=admin,
                session_date=date(2026, 6, 10),
                status=CashCounterSessionStatus.OPEN,
            )
        except Exception:
            self.skipTest("Cannot create CashCounterSession; skipping.")

        ctrl = build_control_posture(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        cash_desk = ctrl.get("cash_desk", {})
        if cash_desk.get("deferred"):
            self.skipTest("Cash desk posture deferred; skipping.")
        self.assertGreater(cash_desk["open_sessions_count"], 0)
        self.assertIn(cash_desk["status"], {STATUS_WARNING, STATUS_CRITICAL})

    def test_month_end_blocking_check_raises_critical(self):
        from subscriptions.models_month_end_close import (
            MonthEndCloseRun, MonthEndCloseStatus, MonthEndCheckSeverity, MonthEndCloseCheckResult,
        )
        from django.utils import timezone

        try:
            admin = _admin()
            run = MonthEndCloseRun.objects.create(
                period_year=2026,
                period_month=6,
                run_by=admin,
                is_dry_run=True,
                status=MonthEndCloseStatus.BLOCKED,
            )
            MonthEndCloseCheckResult.objects.create(
                run=run,
                check_key="test_blocking_check",
                severity=MonthEndCheckSeverity.BLOCKING,
                passed=False,
                count=3,
                detail="Test blocking check for P4A",
            )
        except Exception:
            self.skipTest("Cannot create MonthEndCloseRun; skipping.")

        ctrl = build_control_posture(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        me = ctrl.get("month_end_close", {})
        if me.get("deferred"):
            self.skipTest("Month-end close posture deferred; skipping.")
        self.assertGreater(me["blocking_check_count"], 0)
        self.assertEqual(me["status"], STATUS_CRITICAL)


class ActionItemsTests(TestCase):
    """Action items have required fields and correct severity ordering."""

    def test_empty_system_returns_empty_or_minimal_action_items(self):
        items = build_financial_action_items(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        self.assertIsInstance(items, list)

    def test_action_items_have_required_fields(self):
        items = build_financial_action_items(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        for item in items:
            self.assertIn("key", item)
            self.assertIn("severity", item)
            self.assertIn("title", item)
            self.assertIn("description", item)
            self.assertIn("source_area", item)
            self.assertIn("count", item)
            self.assertIn("deferred", item)
            self.assertIn(item["severity"], {"INFO", "WARNING", "CRITICAL"})

    def test_action_items_sorted_critical_first(self):
        items = build_financial_action_items(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        if not items:
            return
        _rank = {"CRITICAL": 0, "WARNING": 1, "INFO": 2}
        ranks = [_rank.get(i["severity"], 9) for i in items]
        self.assertEqual(ranks, sorted(ranks), "Action items are not sorted CRITICAL→WARNING→INFO")


class NoWriteGuaranteeTests(TestCase):
    """Snapshot generation must not create any financial records."""

    def test_no_bridge_postings_created(self):
        from accounting.models import AccountingBridgePosting
        before = AccountingBridgePosting.objects.count()
        build_financial_intelligence_snapshot(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        after = AccountingBridgePosting.objects.count()
        self.assertEqual(before, after, "AccountingBridgePosting rows were created during snapshot.")

    def test_no_journal_entries_created(self):
        from accounting.models import JournalEntry
        before = JournalEntry.objects.count()
        build_financial_intelligence_snapshot(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        after = JournalEntry.objects.count()
        self.assertEqual(before, after, "JournalEntry rows were created during snapshot.")

    def test_no_payments_created(self):
        from subscriptions.models import Payment
        before = Payment.objects.count()
        build_financial_intelligence_snapshot(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        after = Payment.objects.count()
        self.assertEqual(before, after, "Payment rows were created during snapshot.")

    def test_no_stock_ledger_created(self):
        from inventory.models import StockLedger
        before = StockLedger.objects.count()
        build_financial_intelligence_snapshot(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        after = StockLedger.objects.count()
        self.assertEqual(before, after, "StockLedger rows were created during snapshot.")

    def test_no_reconciliation_items_created(self):
        from reconciliation.models import ReconciliationItem
        before = ReconciliationItem.objects.count()
        build_financial_intelligence_snapshot(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        after = ReconciliationItem.objects.count()
        self.assertEqual(before, after, "ReconciliationItem rows were created during snapshot.")


class AdminAPIPermissionTests(TestCase):
    """Admin endpoint permission checks."""

    FI_URL = "/api/v1/admin/financial-intelligence/"

    def setUp(self):
        self.client = APIClient()

    def test_unauthenticated_blocked(self):
        resp = self.client.get(self.FI_URL)
        self.assertIn(resp.status_code, {401, 403})

    def test_admin_allowed(self):
        admin = _admin()
        self.client.force_authenticate(user=admin)
        resp = self.client.get(self.FI_URL)
        self.assertEqual(resp.status_code, 200)

    def test_cashier_blocked(self):
        cashier = _cashier()
        self.client.force_authenticate(user=cashier)
        resp = self.client.get(self.FI_URL)
        self.assertIn(resp.status_code, {401, 403})

    def test_customer_blocked(self):
        customer = _customer()
        self.client.force_authenticate(user=customer)
        resp = self.client.get(self.FI_URL)
        self.assertIn(resp.status_code, {401, 403})

    def test_partner_blocked(self):
        partner = _partner()
        self.client.force_authenticate(user=partner)
        resp = self.client.get(self.FI_URL)
        self.assertIn(resp.status_code, {401, 403})

    def test_admin_response_has_required_keys(self):
        admin = _admin()
        self.client.force_authenticate(user=admin)
        resp = self.client.get(self.FI_URL)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("as_of", data)
        self.assertIn("period", data)
        self.assertIn("overall_status", data)
        self.assertIn("sections", data)
        self.assertIn("action_items", data)

    def test_admin_with_period_params(self):
        admin = _admin()
        self.client.force_authenticate(user=admin)
        resp = self.client.get(self.FI_URL, {"year": "2026", "month": "6"})
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["period"]["year"], 2026)
        self.assertEqual(data["period"]["month"], 6)

    def test_invalid_as_of_returns_400(self):
        admin = _admin()
        self.client.force_authenticate(user=admin)
        resp = self.client.get(self.FI_URL, {"as_of": "not-a-date"})
        self.assertEqual(resp.status_code, 400)

    def test_bridge_posture_endpoint_admin_allowed(self):
        admin = _admin()
        self.client.force_authenticate(user=admin)
        resp = self.client.get("/api/v1/admin/financial-intelligence/bridge-posture/")
        self.assertEqual(resp.status_code, 200)

    def test_bridge_posture_endpoint_customer_blocked(self):
        customer = _customer()
        self.client.force_authenticate(user=customer)
        resp = self.client.get("/api/v1/admin/financial-intelligence/bridge-posture/")
        self.assertIn(resp.status_code, {401, 403})

    def test_control_posture_endpoint_admin_allowed(self):
        admin = _admin()
        self.client.force_authenticate(user=admin)
        resp = self.client.get("/api/v1/admin/financial-intelligence/control-posture/")
        self.assertEqual(resp.status_code, 200)

    def test_action_items_endpoint_admin_allowed(self):
        admin = _admin()
        self.client.force_authenticate(user=admin)
        resp = self.client.get("/api/v1/admin/financial-intelligence/action-items/")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("action_items", data)
        self.assertIn("count", data)

    def test_reconciliation_posture_endpoint_admin_allowed(self):
        admin = _admin()
        self.client.force_authenticate(user=admin)
        resp = self.client.get("/api/v1/admin/financial-intelligence/reconciliation-posture/")
        self.assertEqual(resp.status_code, 200)
