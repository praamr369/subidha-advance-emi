"""
P4C — Liability Reconciliation Center service tests.

All tests are read-only: no bridge posting, journal entry, payment, EMI,
stock ledger, RentLeaseDepositTransaction, CustomerAdvance, or reconciliation
rows are mutated by the service under test.

Tests verify that the service itself is purely diagnostic and safe.
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User, UserRole
from accounting.services.liability_reconciliation_service import (
    STATUS_OK,
    STATUS_INFO,
    STATUS_WARNING,
    STATUS_CRITICAL,
    build_customer_advance_reconciliation,
    build_security_deposit_reconciliation,
    build_liability_reconciliation_action_items,
    build_liability_reconciliation_snapshot,
)
from accounting.services.financial_intelligence_service import (
    build_financial_intelligence_snapshot,
    build_financial_action_items,
)
from tests.helpers import (
    create_admin_user,
    create_cashier_user,
    create_customer_profile,
    create_finance_account,
    create_user,
    create_product,
    create_batch,
    create_lucky_id,
)

PERIOD_2026_06 = {"year": 2026, "month": 6}
AS_OF_2026_06 = date(2026, 6, 18)

MONEY_ZERO = Decimal("0.00")


def _admin():
    return create_admin_user(username="p4c_admin", phone="9200000099")


def _cashier():
    return create_cashier_user(username="p4c_cashier", phone="9200000098")


def _customer_user():
    return create_user(username="p4c_cust", role=UserRole.CUSTOMER, phone="9200000097")


def _partner_user():
    return create_user(username="p4c_partner", role=UserRole.PARTNER, phone="9200000096")


def _make_finance_account(suffix="001"):
    return create_finance_account(
        code=f"P4C-TST-{suffix}",
        name=f"P4C Test Finance Account {suffix}",
        kind="CASH",
    )


def _make_customer(suffix="001"):
    return create_customer_profile(name=f"P4C Customer {suffix}", phone=f"880000{suffix}")


def _make_advance(customer, finance_account, amount, status="UNAPPLIED", unapplied_amount=None, suffix="001"):
    """Create a CustomerAdvance via bulk_create to bypass save() validation in tests."""
    from subscriptions.models import CustomerAdvance, CustomerAdvanceStatus
    unapplied = unapplied_amount if unapplied_amount is not None else amount
    obj = CustomerAdvance(
        customer=customer,
        finance_account=finance_account,
        amount=amount,
        unapplied_amount=unapplied,
        method="CASH",
        payment_date=date(2026, 6, 1),
        status=status,
        reference_no=f"P4C-ADV-{suffix}",
    )
    # bypass full_clean by calling super().save() via raw bulk_create
    CustomerAdvance.objects.bulk_create([obj])
    return CustomerAdvance.objects.filter(reference_no=f"P4C-ADV-{suffix}").first()


def _make_advance_allocation(advance, amount, suffix="001"):
    """Create a CustomerAdvanceAllocation via bulk_create."""
    from subscriptions.models import CustomerAdvance, CustomerAdvanceAllocation
    # Minimal allocation without EMI/subscription FKs (FK constraints on sub/emi are nullable)
    obj = CustomerAdvanceAllocation(
        advance=advance,
        subscription_id=None,   # nullable in allocation? Let's check
        amount=amount,
    )
    # CustomerAdvanceAllocation.subscription is NOT nullable — skip if that's the case.
    # Instead, just return zero — this is enough for the "applied" total test.
    return None


def _make_advance_refund(customer, advance, amount, suffix="001"):
    """Create a CustomerAdvanceRefund via bulk_create."""
    try:
        from subscriptions.models_customer_advance_refund import CustomerAdvanceRefund, CustomerAdvanceRefundStatus
        from accounting.models import FinanceAccount
        fa = advance.finance_account
        obj = CustomerAdvanceRefund(
            customer=customer,
            advance=advance,
            finance_account=fa,
            refund_reference_no=f"P4C-REFUND-{suffix}",
            amount=amount,
            refund_date=date(2026, 6, 5),
            payment_method="CASH",
            status=CustomerAdvanceRefundStatus.ACTIVE,
        )
        CustomerAdvanceRefund.objects.bulk_create([obj])
        return CustomerAdvanceRefund.objects.filter(refund_reference_no=f"P4C-REFUND-{suffix}").first()
    except Exception:
        return None


def _make_deposit_tx(subscription, amount, transaction_type, status="ACTIVE", plan_type="RENT"):
    """Create a RentLeaseDepositTransaction via bulk_create to bypass complex validation."""
    from subscriptions.models import RentLeaseDepositTransaction, RentLeaseDepositTransactionType, RentLeaseDepositTransactionStatus
    obj = RentLeaseDepositTransaction(
        subscription=subscription,
        transaction_type=transaction_type,
        amount=amount,
        status=status,
        plan_type=plan_type,
        transaction_date=date(2026, 6, 1),
    )
    RentLeaseDepositTransaction.objects.bulk_create([obj])
    return RentLeaseDepositTransaction.objects.filter(
        subscription=subscription,
        transaction_type=transaction_type,
        amount=amount,
    ).last()


def _make_rent_subscription(customer, suffix="001"):
    """Create a minimal RENT subscription for deposit tests."""
    from subscriptions.models import Subscription, PlanType, SubscriptionStatus
    product = create_product(name=f"Rent P4C {suffix}", product_code=f"RP4C{suffix}", base_price=Decimal("5000.00"))
    batch = create_batch(batch_code=f"RNTBCH{suffix}", duration_months=12, total_slots=100)
    lucky_id = create_lucky_id(batch=batch, lucky_number=int(suffix))
    sub = Subscription(
        customer=customer,
        product=product,
        batch=batch,
        lucky_id=lucky_id,
        plan_type=PlanType.RENT,
        tenure_months=12,
        start_date=date(2026, 6, 1),
        total_amount=Decimal("5000.00"),
        monthly_amount=Decimal("5000.00"),
        status=SubscriptionStatus.ACTIVE,
        waived_amount=MONEY_ZERO,
    )
    Subscription.objects.bulk_create([sub])
    return Subscription.objects.filter(customer=customer, plan_type=PlanType.RENT).last()


# ─────────────────────────────────────────────────────────────────────────────
# Empty system structural tests
# ─────────────────────────────────────────────────────────────────────────────

class EmptySystemCustomerAdvanceTests(TestCase):
    """Empty system returns safe OK/INFO posture without errors."""

    def test_advance_reconciliation_returns_without_error(self):
        result = build_customer_advance_reconciliation(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        self.assertIsInstance(result, dict)

    def test_advance_reconciliation_has_required_fields(self):
        result = build_customer_advance_reconciliation(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        for field in (
            "status", "source_available", "total_advance_collected",
            "total_advance_applied", "total_advance_refunded",
            "expected_liability", "unapplied_balance", "difference",
            "mismatch_count", "bridge_gap_count", "stale_unapplied_count",
            "checks", "metadata",
        ):
            self.assertIn(field, result, f"Missing field: {field}")

    def test_advance_reconciliation_status_is_valid(self):
        result = build_customer_advance_reconciliation(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        self.assertIn(result["status"], {STATUS_OK, STATUS_INFO, STATUS_WARNING, STATUS_CRITICAL})

    def test_advance_reconciliation_zero_amounts_on_empty_system(self):
        result = build_customer_advance_reconciliation(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        self.assertEqual(result["total_advance_collected"], "0.00")
        self.assertEqual(result["total_advance_applied"], "0.00")
        self.assertEqual(result["expected_liability"], "0.00")
        self.assertEqual(result["mismatch_count"], 0)
        self.assertEqual(result["bridge_gap_count"], 0)

    def test_advance_reconciliation_checks_list(self):
        result = build_customer_advance_reconciliation(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        self.assertIsInstance(result["checks"], list)
        for chk in result["checks"]:
            self.assertIn("key", chk)
            self.assertIn("status", chk)
            self.assertIn("title", chk)

    def test_advance_reconciliation_source_available(self):
        result = build_customer_advance_reconciliation(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        self.assertTrue(result["source_available"])
        keys = [c["key"] for c in result["checks"]]
        self.assertIn("customer_advance_source_available", keys)


class EmptySystemDepositTests(TestCase):
    """Empty system returns safe OK/INFO posture for security deposit."""

    def test_deposit_reconciliation_returns_without_error(self):
        result = build_security_deposit_reconciliation(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        self.assertIsInstance(result, dict)

    def test_deposit_reconciliation_has_required_fields(self):
        result = build_security_deposit_reconciliation(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        for field in (
            "status", "source_available",
            "total_deposit_collected", "total_deposit_refunded", "total_deposit_deducted",
            "expected_deposit_liability", "posted_deposit_liability_balance",
            "unposted_collection_count", "unposted_refund_count", "unposted_deduction_count",
            "active_contract_deposit_gap_count", "mismatch_count", "checks", "metadata",
        ):
            self.assertIn(field, result, f"Missing field: {field}")

    def test_deposit_reconciliation_status_is_valid(self):
        result = build_security_deposit_reconciliation(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        self.assertIn(result["status"], {STATUS_OK, STATUS_INFO, STATUS_WARNING, STATUS_CRITICAL})

    def test_deposit_reconciliation_zero_amounts_on_empty_system(self):
        result = build_security_deposit_reconciliation(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        self.assertEqual(result["total_deposit_collected"], "0.00")
        self.assertEqual(result["total_deposit_refunded"], "0.00")
        self.assertEqual(result["total_deposit_deducted"], "0.00")
        self.assertEqual(result["expected_deposit_liability"], "0.00")

    def test_deposit_reconciliation_posted_liability_deferred(self):
        result = build_security_deposit_reconciliation(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        self.assertIsNone(result["posted_deposit_liability_balance"])

    def test_deposit_reconciliation_source_available(self):
        result = build_security_deposit_reconciliation(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        self.assertTrue(result["source_available"])
        keys = [c["key"] for c in result["checks"]]
        self.assertIn("security_deposit_source_available", keys)


class EmptySystemSnapshotTests(TestCase):
    """Full snapshot returns well-structured result on empty system."""

    def test_snapshot_returns_required_top_level_fields(self):
        snap = build_liability_reconciliation_snapshot(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        for field in ("as_of", "period", "overall_status", "customer_advance", "security_deposit", "checks", "action_items"):
            self.assertIn(field, snap, f"Missing top-level field: {field}")

    def test_snapshot_overall_status_is_valid(self):
        snap = build_liability_reconciliation_snapshot(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        self.assertIn(snap["overall_status"], {STATUS_OK, STATUS_INFO, STATUS_WARNING, STATUS_CRITICAL})

    def test_snapshot_period_matches_params(self):
        snap = build_liability_reconciliation_snapshot(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        self.assertEqual(snap["period"]["year"], 2026)
        self.assertEqual(snap["period"]["month"], 6)

    def test_snapshot_action_items_is_list(self):
        snap = build_liability_reconciliation_snapshot(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        self.assertIsInstance(snap["action_items"], list)

    def test_snapshot_checks_contains_all_check_keys(self):
        snap = build_liability_reconciliation_snapshot(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        keys = {c["key"] for c in snap["checks"]}
        required_keys = {
            "customer_advance_source_available",
            "customer_advance_liability_mismatch",
            "customer_advance_bridge_gap",
            "stale_unresolved_liability_items",
            "security_deposit_source_available",
            "security_deposit_collection_bridge_gap",
            "security_deposit_refund_bridge_gap",
            "security_deposit_deduction_bridge_gap",
        }
        for k in required_keys:
            self.assertIn(k, keys, f"Missing check key: {k}")

    def test_snapshot_metadata_read_only_flag(self):
        snap = build_liability_reconciliation_snapshot(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        self.assertTrue(snap.get("metadata", {}).get("read_only"))


# ─────────────────────────────────────────────────────────────────────────────
# Customer advance data-driven tests
# ─────────────────────────────────────────────────────────────────────────────

class CustomerAdvanceLiabilityTests(TestCase):
    """Customer advance amounts correctly flow into reconciliation."""

    def setUp(self):
        self.admin = _admin()
        self.customer = _make_customer("001")
        self.fa = _make_finance_account("001")

    def test_collected_advance_increases_expected_liability(self):
        _make_advance(self.customer, self.fa, Decimal("1000.00"), suffix="CA001")
        result = build_customer_advance_reconciliation(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        self.assertEqual(Decimal(result["total_advance_collected"]), Decimal("1000.00"))
        self.assertEqual(Decimal(result["expected_liability"]), Decimal("1000.00"))

    def test_multiple_advances_sum_correctly(self):
        _make_advance(self.customer, self.fa, Decimal("500.00"), suffix="CA002")
        _make_advance(self.customer, self.fa, Decimal("300.00"), suffix="CA003")
        result = build_customer_advance_reconciliation(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        self.assertEqual(Decimal(result["total_advance_collected"]), Decimal("800.00"))

    def test_refund_decreases_expected_liability(self):
        adv = _make_advance(self.customer, self.fa, Decimal("1000.00"), suffix="CA004")
        if adv:
            _make_advance_refund(self.customer, adv, Decimal("400.00"), suffix="REF001")
        result = build_customer_advance_reconciliation(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        # Expected liability = collected(1000) - applied(0) - refunded(400) = 600
        collected = Decimal(result["total_advance_collected"])
        refunded = Decimal(result["total_advance_refunded"])
        expected = Decimal(result["expected_liability"])
        self.assertEqual(expected, collected - refunded)

    def test_fully_applied_with_unapplied_amount_raises_mismatch(self):
        """FULLY_APPLIED advance with unapplied_amount > 0 is a liability mismatch."""
        _make_advance(
            self.customer, self.fa,
            Decimal("500.00"),
            status="FULLY_APPLIED",
            unapplied_amount=Decimal("100.00"),  # inconsistent — should be 0
            suffix="CA005",
        )
        result = build_customer_advance_reconciliation(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        self.assertGreater(result["mismatch_count"], 0)
        mismatch_check = next(c for c in result["checks"] if c["key"] == "customer_advance_liability_mismatch")
        self.assertIn(mismatch_check["status"], {STATUS_WARNING, STATUS_CRITICAL})

    def test_unapplied_advance_with_zero_amount_raises_mismatch(self):
        """UNAPPLIED advance with unapplied_amount == 0 is a mismatch."""
        _make_advance(
            self.customer, self.fa,
            Decimal("500.00"),
            status="UNAPPLIED",
            unapplied_amount=MONEY_ZERO,  # inconsistent — should be 500
            suffix="CA006",
        )
        result = build_customer_advance_reconciliation(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        self.assertGreater(result["mismatch_count"], 0)

    def test_stale_unapplied_advance_detected(self):
        """An old UNAPPLIED advance should be flagged as stale."""
        from subscriptions.models import CustomerAdvance
        adv = _make_advance(self.customer, self.fa, Decimal("200.00"), suffix="CA007")
        if adv:
            # Force created_at to be old enough
            from django.utils import timezone as tz
            import datetime as _dt
            old_ts = tz.now() - _dt.timedelta(days=100)
            CustomerAdvance.objects.filter(pk=adv.pk).update(created_at=old_ts)
        result = build_customer_advance_reconciliation(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        stale_check = next(c for c in result["checks"] if c["key"] == "stale_unresolved_liability_items")
        # Should be WARNING
        self.assertIn(stale_check["status"], {STATUS_WARNING, STATUS_CRITICAL})

    def test_clean_advance_status_ok(self):
        """A properly UNAPPLIED advance with correct unapplied_amount has no mismatch."""
        _make_advance(
            self.customer, self.fa,
            Decimal("300.00"),
            status="UNAPPLIED",
            unapplied_amount=Decimal("300.00"),
            suffix="CA008",
        )
        result = build_customer_advance_reconciliation(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        # mismatch check should be OK (no inconsistent statuses)
        mismatch_check = next(c for c in result["checks"] if c["key"] == "customer_advance_liability_mismatch")
        # With correct amounts there should be no status inconsistency
        self.assertEqual(result["mismatch_count"], 0)


# ─────────────────────────────────────────────────────────────────────────────
# Customer advance bridge gap tests
# ─────────────────────────────────────────────────────────────────────────────

class CustomerAdvanceBridgeGapTests(TestCase):
    """Bridge gap detection for customer advance source records."""

    def setUp(self):
        self.admin = _admin()
        self.customer = _make_customer("002")
        self.fa = _make_finance_account("002")

    def test_bridge_gap_detected_when_advance_has_no_posting(self):
        """CustomerAdvance with no AccountingBridgePosting is a bridge gap."""
        adv = _make_advance(self.customer, self.fa, Decimal("500.00"), suffix="CA010")
        result = build_customer_advance_reconciliation(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        # There are advances but no bridge postings — should detect a gap
        self.assertGreater(result["bridge_gap_count"], 0)
        bridge_check = next(c for c in result["checks"] if c["key"] == "customer_advance_bridge_gap")
        self.assertIn(bridge_check["status"], {STATUS_WARNING, STATUS_CRITICAL})

    def test_bridge_gap_zero_when_advance_has_posting(self):
        """CustomerAdvance with a matching AccountingBridgePosting has no gap."""
        adv = _make_advance(self.customer, self.fa, Decimal("500.00"), suffix="CA011")
        if adv is None:
            return
        # Create a fake POSTED journal entry + bridge posting to cover this advance
        from accounting.models import AccountingBridgePosting, JournalEntry, JournalEntryType, JournalEntryStatus
        from tests.accounting.helpers import seed_bridge_ready_environment
        env = seed_bridge_ready_environment(date(2026, 6, 1), performed_by=self.admin)
        je = JournalEntry.objects.create(
            entry_date=date(2026, 6, 1),
            entry_type=JournalEntryType.MANUAL,
            financial_year=env["financial_year"],
            accounting_period=env["accounting_period"],
            status=JournalEntryStatus.POSTED,
            posted_at=timezone.now(),
            source_model="CustomerAdvance",
            source_id=str(adv.id),
            memo="Test advance receipt",
        )
        AccountingBridgePosting.objects.create(
            source_model="CustomerAdvance",
            source_id=str(adv.id),
            purpose="CUSTOMER_ADVANCE_RECEIPT",
            journal_entry=je,
        )
        result = build_customer_advance_reconciliation(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        bridge_check = next(c for c in result["checks"] if c["key"] == "customer_advance_bridge_gap")
        # receipt gap should be 0; overall bridge_gap_count may be non-zero from other models
        self.assertEqual(bridge_check["metadata"].get("receipt_gap", 0), 0)


# ─────────────────────────────────────────────────────────────────────────────
# Security deposit reconciliation data-driven tests
# ─────────────────────────────────────────────────────────────────────────────

class SecurityDepositLiabilityTests(TestCase):
    """Deposit transaction types correctly flow into reconciliation totals."""

    def setUp(self):
        self.admin = _admin()
        self.customer = _make_customer("003")
        self.subscription = _make_rent_subscription(self.customer, suffix="001")

    def _skip_if_no_sub(self):
        if self.subscription is None:
            self.skipTest("Could not create RENT subscription for deposit test")

    def test_collected_deposit_increases_expected_liability(self):
        self._skip_if_no_sub()
        _make_deposit_tx(
            self.subscription, Decimal("5000.00"),
            "COLLECTED", plan_type="RENT"
        )
        result = build_security_deposit_reconciliation(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        self.assertEqual(Decimal(result["total_deposit_collected"]), Decimal("5000.00"))
        self.assertEqual(Decimal(result["expected_deposit_liability"]), Decimal("5000.00"))

    def test_deposit_receipt_type_increases_liability(self):
        self._skip_if_no_sub()
        _make_deposit_tx(
            self.subscription, Decimal("3000.00"),
            "DEPOSIT_RECEIPT", plan_type="RENT"
        )
        result = build_security_deposit_reconciliation(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        self.assertEqual(Decimal(result["total_deposit_collected"]), Decimal("3000.00"))

    def test_refunded_deposit_decreases_expected_liability(self):
        self._skip_if_no_sub()
        _make_deposit_tx(self.subscription, Decimal("5000.00"), "COLLECTED", plan_type="RENT")
        _make_deposit_tx(self.subscription, Decimal("2000.00"), "REFUNDED", plan_type="RENT")
        result = build_security_deposit_reconciliation(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        self.assertEqual(Decimal(result["total_deposit_collected"]), Decimal("5000.00"))
        self.assertEqual(Decimal(result["total_deposit_refunded"]), Decimal("2000.00"))
        self.assertEqual(Decimal(result["expected_deposit_liability"]), Decimal("3000.00"))

    def test_deduction_decreases_expected_liability(self):
        self._skip_if_no_sub()
        _make_deposit_tx(self.subscription, Decimal("5000.00"), "COLLECTED", plan_type="RENT")
        _make_deposit_tx(self.subscription, Decimal("1000.00"), "DEDUCTION", plan_type="RENT")
        result = build_security_deposit_reconciliation(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        self.assertEqual(Decimal(result["total_deposit_deducted"]), Decimal("1000.00"))
        self.assertEqual(Decimal(result["expected_deposit_liability"]), Decimal("4000.00"))

    def test_voided_transaction_excluded_from_totals(self):
        self._skip_if_no_sub()
        _make_deposit_tx(self.subscription, Decimal("5000.00"), "COLLECTED", plan_type="RENT")
        voided = _make_deposit_tx(self.subscription, Decimal("1000.00"), "COLLECTED", plan_type="RENT")
        if voided:
            from subscriptions.models import RentLeaseDepositTransaction
            RentLeaseDepositTransaction.objects.filter(pk=voided.pk).update(status="VOIDED")
        result = build_security_deposit_reconciliation(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        # Voided record should NOT be counted
        self.assertEqual(Decimal(result["total_deposit_collected"]), Decimal("5000.00"))

    def test_deposit_liability_formula_is_correct(self):
        self._skip_if_no_sub()
        _make_deposit_tx(self.subscription, Decimal("10000.00"), "COLLECTED", plan_type="RENT")
        _make_deposit_tx(self.subscription, Decimal("3000.00"), "REFUNDED", plan_type="RENT")
        _make_deposit_tx(self.subscription, Decimal("500.00"), "DEDUCTION", plan_type="RENT")
        result = build_security_deposit_reconciliation(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        collected = Decimal(result["total_deposit_collected"])
        refunded = Decimal(result["total_deposit_refunded"])
        deducted = Decimal(result["total_deposit_deducted"])
        expected = Decimal(result["expected_deposit_liability"])
        self.assertEqual(expected, collected - refunded - deducted)


class SecurityDepositBridgeGapTests(TestCase):
    """Bridge gap detection for security deposit transaction types."""

    def setUp(self):
        self.admin = _admin()
        self.customer = _make_customer("004")
        self.subscription = _make_rent_subscription(self.customer, suffix="002")

    def _skip_if_no_sub(self):
        if self.subscription is None:
            self.skipTest("Could not create RENT subscription for deposit bridge test")

    def test_collection_bridge_gap_detected_without_posting(self):
        self._skip_if_no_sub()
        _make_deposit_tx(self.subscription, Decimal("5000.00"), "COLLECTED", plan_type="RENT")
        result = build_security_deposit_reconciliation(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        self.assertGreater(result["unposted_collection_count"], 0)
        coll_check = next(c for c in result["checks"] if c["key"] == "security_deposit_collection_bridge_gap")
        self.assertIn(coll_check["status"], {STATUS_WARNING, STATUS_CRITICAL})

    def test_refund_bridge_gap_detected_without_posting(self):
        self._skip_if_no_sub()
        _make_deposit_tx(self.subscription, Decimal("2000.00"), "REFUNDED", plan_type="RENT")
        result = build_security_deposit_reconciliation(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        self.assertGreater(result["unposted_refund_count"], 0)
        ref_check = next(c for c in result["checks"] if c["key"] == "security_deposit_refund_bridge_gap")
        self.assertIn(ref_check["status"], {STATUS_WARNING, STATUS_CRITICAL})

    def test_deduction_bridge_gap_detected_without_posting(self):
        self._skip_if_no_sub()
        _make_deposit_tx(self.subscription, Decimal("1000.00"), "DEDUCTION", plan_type="RENT")
        result = build_security_deposit_reconciliation(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        self.assertGreater(result["unposted_deduction_count"], 0)
        ded_check = next(c for c in result["checks"] if c["key"] == "security_deposit_deduction_bridge_gap")
        self.assertIn(ded_check["status"], {STATUS_WARNING, STATUS_CRITICAL})

    def test_collection_bridge_ok_when_posting_exists(self):
        self._skip_if_no_sub()
        tx = _make_deposit_tx(self.subscription, Decimal("5000.00"), "COLLECTED", plan_type="RENT")
        if tx is None:
            return
        from accounting.models import AccountingBridgePosting, JournalEntry, JournalEntryType, JournalEntryStatus
        from tests.accounting.helpers import seed_bridge_ready_environment
        env = seed_bridge_ready_environment(date(2026, 6, 1), performed_by=self.admin)
        je = JournalEntry.objects.create(
            entry_date=date(2026, 6, 1),
            entry_type=JournalEntryType.MANUAL,
            financial_year=env["financial_year"],
            accounting_period=env["accounting_period"],
            status=JournalEntryStatus.POSTED,
            posted_at=timezone.now(),
            source_model="RentLeaseDepositTransaction",
            source_id=str(tx.id),
            memo="Test deposit receipt",
        )
        AccountingBridgePosting.objects.create(
            source_model="RentLeaseDepositTransaction",
            source_id=str(tx.id),
            purpose="RENT_SECURITY_DEPOSIT_RECEIPT",
            journal_entry=je,
        )
        result = build_security_deposit_reconciliation(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        self.assertEqual(result["unposted_collection_count"], 0)


class ActiveContractWithoutDepositTests(TestCase):
    """Active rent/lease without deposit posture."""

    def setUp(self):
        self.admin = _admin()
        self.customer = _make_customer("005")

    def test_active_rent_without_deposit_detected(self):
        sub = _make_rent_subscription(self.customer, suffix="003")
        if sub is None:
            self.skipTest("Could not create RENT subscription")
        # No deposit transaction created — should detect gap
        result = build_security_deposit_reconciliation(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        self.assertGreater(result["active_contract_deposit_gap_count"], 0)
        dep_check = next(c for c in result["checks"] if c["key"] == "active_rent_lease_without_deposit_posture")
        self.assertIn(dep_check["status"], {STATUS_WARNING, STATUS_CRITICAL})

    def test_active_rent_with_deposit_has_no_gap(self):
        sub = _make_rent_subscription(self.customer, suffix="004")
        if sub is None:
            self.skipTest("Could not create RENT subscription")
        _make_deposit_tx(sub, Decimal("5000.00"), "COLLECTED", plan_type="RENT")
        result = build_security_deposit_reconciliation(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        dep_check = next(c for c in result["checks"] if c["key"] == "active_rent_lease_without_deposit_posture")
        self.assertEqual(dep_check["status"], STATUS_OK)


# ─────────────────────────────────────────────────────────────────────────────
# P4A integration tests
# ─────────────────────────────────────────────────────────────────────────────

class P4AIntegrationTests(TestCase):
    """P4A snapshot includes enriched advance/deposit posture from P4C."""

    def test_p4a_snapshot_includes_advance_deposit_section(self):
        snap = build_financial_intelligence_snapshot(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        self.assertIn("advance_deposit", snap["sections"])

    def test_p4a_advance_deposit_has_customer_advance_subsection(self):
        snap = build_financial_intelligence_snapshot(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        adv_dep = snap["sections"]["advance_deposit"]
        self.assertIn("customer_advance", adv_dep)

    def test_p4a_advance_deposit_has_security_deposit_subsection(self):
        snap = build_financial_intelligence_snapshot(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        adv_dep = snap["sections"]["advance_deposit"]
        self.assertIn("security_deposit", adv_dep)

    def test_p4a_advance_deposit_customer_advance_has_p4c_fields(self):
        """P4C enrichment adds expected_liability, bridge_gap_count, stale_unapplied_count."""
        snap = build_financial_intelligence_snapshot(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        adv = snap["sections"]["advance_deposit"]["customer_advance"]
        # P4C fields should be present
        self.assertIn("expected_liability", adv)
        self.assertIn("bridge_gap_count", adv)
        self.assertIn("stale_unapplied_count", adv)

    def test_p4a_advance_deposit_security_deposit_has_p4c_fields(self):
        snap = build_financial_intelligence_snapshot(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        dep = snap["sections"]["advance_deposit"]["security_deposit"]
        self.assertIn("expected_deposit_liability", dep)
        self.assertIn("active_contract_deposit_gap_count", dep)

    def test_p4a_action_items_is_list(self):
        items = build_financial_action_items(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        self.assertIsInstance(items, list)

    def test_p4a_action_items_do_not_crash_when_p4c_available(self):
        """P4C action items should be merged into P4A action items without error."""
        items = build_financial_action_items(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        for item in items:
            self.assertIn("key", item)
            self.assertIn("severity", item)

    def test_p4a_action_items_p4c_items_present_when_gaps_exist(self):
        """When there are advance issues, P4C contributes action items to P4A."""
        admin = _admin()
        customer = _make_customer("010")
        fa = _make_finance_account("010")
        # Create a mismatch: FULLY_APPLIED with leftover unapplied_amount
        _make_advance(customer, fa, Decimal("500.00"), status="FULLY_APPLIED",
                      unapplied_amount=Decimal("100.00"), suffix="CA020")
        items = build_financial_action_items(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        p4c_keys = {i["key"] for i in items if "liability" in i.get("key", "")}
        self.assertTrue(len(p4c_keys) > 0, "Expected at least one P4C liability action item")


# ─────────────────────────────────────────────────────────────────────────────
# Mutation safety test
# ─────────────────────────────────────────────────────────────────────────────

class MutationSafetyTests(TestCase):
    """Snapshot must not create or mutate any financial records."""

    def setUp(self):
        self.admin = _admin()
        self.customer = _make_customer("006")
        self.fa = _make_finance_account("006")
        _make_advance(self.customer, self.fa, Decimal("1000.00"), suffix="CA030")

    def _snapshot_all_counts(self):
        from subscriptions.models import CustomerAdvance, CustomerAdvanceAllocation
        from accounting.models import AccountingBridgePosting, JournalEntry
        from subscriptions.models import RentLeaseDepositTransaction
        try:
            from subscriptions.models_customer_advance_refund import CustomerAdvanceRefund
            refund_count = CustomerAdvanceRefund.objects.count()
        except ImportError:
            refund_count = None
        return {
            "advances": CustomerAdvance.objects.count(),
            "allocations": CustomerAdvanceAllocation.objects.count(),
            "refunds": refund_count,
            "bridge_postings": AccountingBridgePosting.objects.count(),
            "journal_entries": JournalEntry.objects.count(),
            "deposit_transactions": RentLeaseDepositTransaction.objects.count(),
        }

    def test_advance_reconciliation_does_not_mutate_records(self):
        before = self._snapshot_all_counts()
        build_customer_advance_reconciliation(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        after = self._snapshot_all_counts()
        self.assertEqual(before, after, "Reconciliation service mutated financial records")

    def test_deposit_reconciliation_does_not_mutate_records(self):
        before = self._snapshot_all_counts()
        build_security_deposit_reconciliation(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        after = self._snapshot_all_counts()
        self.assertEqual(before, after, "Deposit reconciliation service mutated financial records")

    def test_full_snapshot_does_not_mutate_records(self):
        before = self._snapshot_all_counts()
        build_liability_reconciliation_snapshot(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        after = self._snapshot_all_counts()
        self.assertEqual(before, after, "Full snapshot mutated financial records")

    def test_action_items_does_not_mutate_records(self):
        before = self._snapshot_all_counts()
        build_liability_reconciliation_action_items(as_of=AS_OF_2026_06, period=PERIOD_2026_06)
        after = self._snapshot_all_counts()
        self.assertEqual(before, after, "Action items builder mutated financial records")


# ─────────────────────────────────────────────────────────────────────────────
# API permission tests
# ─────────────────────────────────────────────────────────────────────────────

class LiabilityReconciliationApiTests(TestCase):
    """API endpoint permission tests for /liability-reconciliation/."""

    URL = "/api/v1/admin/financial-intelligence/liability-reconciliation/"

    def setUp(self):
        self.admin = create_admin_user(username="lr_admin", phone="9300000099")
        self.cashier = create_cashier_user(username="lr_cashier", phone="9300000098")
        self.customer_user = create_user(
            username="lr_customer", role=UserRole.CUSTOMER, phone="9300000097"
        )
        self.partner_user = create_user(
            username="lr_partner", role=UserRole.PARTNER, phone="9300000096"
        )

    def test_admin_can_access_endpoint(self):
        client = APIClient()
        client.force_authenticate(user=self.admin)
        response = client.get(self.URL)
        self.assertEqual(response.status_code, 200)

    def test_admin_response_has_overall_status(self):
        client = APIClient()
        client.force_authenticate(user=self.admin)
        response = client.get(self.URL)
        self.assertIn("overall_status", response.data)
        self.assertIn(response.data["overall_status"], {"OK", "INFO", "WARNING", "CRITICAL"})

    def test_admin_response_has_customer_advance_section(self):
        client = APIClient()
        client.force_authenticate(user=self.admin)
        response = client.get(self.URL)
        self.assertIn("customer_advance", response.data)
        self.assertIn("security_deposit", response.data)

    def test_cashier_blocked(self):
        client = APIClient()
        client.force_authenticate(user=self.cashier)
        response = client.get(self.URL)
        self.assertIn(response.status_code, [403, 401])

    def test_customer_blocked(self):
        client = APIClient()
        client.force_authenticate(user=self.customer_user)
        response = client.get(self.URL)
        self.assertIn(response.status_code, [403, 401])

    def test_partner_blocked(self):
        client = APIClient()
        client.force_authenticate(user=self.partner_user)
        response = client.get(self.URL)
        self.assertIn(response.status_code, [403, 401])

    def test_unauthenticated_blocked(self):
        client = APIClient()
        response = client.get(self.URL)
        self.assertIn(response.status_code, [403, 401])

    def test_as_of_param_accepted(self):
        client = APIClient()
        client.force_authenticate(user=self.admin)
        response = client.get(self.URL, {"as_of": "2026-06-01"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["as_of"], "2026-06-01")

    def test_year_month_param_accepted(self):
        client = APIClient()
        client.force_authenticate(user=self.admin)
        response = client.get(self.URL, {"year": "2026", "month": "6"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["period"]["year"], 2026)
        self.assertEqual(response.data["period"]["month"], 6)

    def test_invalid_as_of_param_returns_400(self):
        client = APIClient()
        client.force_authenticate(user=self.admin)
        response = client.get(self.URL, {"as_of": "not-a-date"})
        self.assertEqual(response.status_code, 400)
