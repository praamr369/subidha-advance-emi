"""
P4C — Customer Advance and Security Deposit Liability Reconciliation Center.

Read-only diagnostic layer.  No financial record is ever mutated.
No AccountingBridgePosting, JournalEntry, JournalLine, Payment, EMI,
StockLedger, BillingInvoice, ReceiptDocument, DirectSale,
RentLeaseBillingDemand, RentLeaseDepositTransaction, CustomerAdvance,
Commission, Payout, Reconciliation, or MoneyMovement rows are created
or modified by any function in this module.
"""
from __future__ import annotations

import calendar
import datetime as _dt
from datetime import date
from decimal import Decimal
from typing import Any

MONEY_ZERO = Decimal("0.00")

STATUS_OK = "OK"
STATUS_INFO = "INFO"
STATUS_WARNING = "WARNING"
STATUS_CRITICAL = "CRITICAL"

SEVERITY_INFO = "INFO"
SEVERITY_WARNING = "WARNING"
SEVERITY_CRITICAL = "CRITICAL"

_SEVERITY_RANK = {STATUS_OK: 0, STATUS_INFO: 1, STATUS_WARNING: 2, STATUS_CRITICAL: 3}

# Bridge purposes used by the customer advance flow.
_CA_RECEIPT_PURPOSE = "CUSTOMER_ADVANCE_RECEIPT"
_CA_APPLICATION_PURPOSE = "CUSTOMER_ADVANCE_APPLICATION"
_CA_REFUND_PURPOSE = "CUSTOMER_ADVANCE_REFUND"
_CA_RECEIPT_SOURCE_MODEL = "CustomerAdvance"
_CA_APPLICATION_SOURCE_MODEL = "CustomerAdvanceAllocation"
_CA_REFUND_SOURCE_MODEL = "CustomerAdvanceRefund"

# Bridge purposes used by the security deposit flow.
_DEP_RECEIPT_PURPOSES = {
    "SECURITY_DEPOSIT_RECEIPT",
    "RENT_SECURITY_DEPOSIT_RECEIPT",
    "LEASE_SECURITY_DEPOSIT_RECEIPT",
}
_DEP_REFUND_PURPOSES = {
    "SECURITY_DEPOSIT_REFUND",
    "RENT_SECURITY_DEPOSIT_REFUND",
    "LEASE_SECURITY_DEPOSIT_REFUND",
}
_DEP_DAMAGE_PURPOSE_FRAGMENT = "DAMAGE"
_DEP_SOURCE_MODEL = "RentLeaseDepositTransaction"

# Stale threshold for unapplied advances.
_STALE_ADVANCE_DAYS = 90

# Bridge gap scan cap (avoids full-table scans on large datasets).
_BRIDGE_SCAN_CAP = 5000


def _worst(*statuses: str) -> str:
    return max(statuses, key=lambda s: _SEVERITY_RANK.get(s, 0))


def _money(value: Any) -> Decimal:
    return Decimal(str(value or 0)).quantize(MONEY_ZERO)


def _money_str(value: Any) -> str:
    return f"{_money(value)}"


def _deferred_check(key: str, title: str, message: str, source_area: str) -> dict:
    return {
        "key": key,
        "status": STATUS_INFO,
        "severity": SEVERITY_INFO,
        "title": title,
        "message": message,
        "count": 0,
        "source_area": source_area,
        "action_url": None,
        "deferred": True,
        "metadata": {},
    }


def _check(
    *,
    key: str,
    status: str,
    severity: str,
    title: str,
    message: str,
    count: int = 0,
    amount: str | None = None,
    source_area: str,
    action_url: str | None = None,
    deferred: bool = False,
    metadata: dict | None = None,
) -> dict:
    item: dict[str, Any] = {
        "key": key,
        "status": status,
        "severity": severity,
        "title": title,
        "message": message,
        "count": count,
        "source_area": source_area,
        "action_url": action_url,
        "deferred": deferred,
        "metadata": metadata or {},
    }
    if amount is not None:
        item["amount"] = amount
    return item


def _resolve_period(
    as_of: date | None,
    period: dict | None,
) -> tuple[date, int, int, date, date]:
    from django.utils import timezone

    if as_of is None:
        as_of = timezone.localdate()
    year = int((period or {}).get("year") or as_of.year)
    month = int((period or {}).get("month") or as_of.month)
    last_day = calendar.monthrange(year, month)[1]
    start = date(year, month, 1)
    end = date(year, month, last_day)
    return as_of, year, month, start, end


# ─────────────────────────────────────────────────────────────────────────────
# Bridge gap helpers
# ─────────────────────────────────────────────────────────────────────────────

def _bridge_gap_count(source_model: str, purpose: str, source_ids: set[str]) -> int:
    """
    Return the count of source_ids that have no AccountingBridgePosting
    for (source_model, purpose).  Capped at _BRIDGE_SCAN_CAP ids to
    prevent full-table scans.
    """
    if not source_ids:
        return 0
    capped = set(list(source_ids)[:_BRIDGE_SCAN_CAP])
    try:
        from accounting.models import AccountingBridgePosting
        posted_ids = set(
            AccountingBridgePosting.objects.filter(
                source_model=source_model,
                purpose=purpose,
                source_id__in=capped,
            ).values_list("source_id", flat=True)
        )
        return len(capped - posted_ids)
    except Exception:
        return 0


def _bridge_gap_count_multi_purpose(
    source_model: str, purposes: set[str], source_ids: set[str]
) -> int:
    """
    Return source_ids count that have no posting for any of the given purposes.
    A source_id is considered covered if at least one matching posting exists.
    """
    if not source_ids or not purposes:
        return 0
    capped = set(list(source_ids)[:_BRIDGE_SCAN_CAP])
    try:
        from accounting.models import AccountingBridgePosting
        posted_ids = set(
            AccountingBridgePosting.objects.filter(
                source_model=source_model,
                purpose__in=purposes,
                source_id__in=capped,
            ).values_list("source_id", flat=True)
        )
        return len(capped - posted_ids)
    except Exception:
        return 0


# ─────────────────────────────────────────────────────────────────────────────
# Customer advance reconciliation
# ─────────────────────────────────────────────────────────────────────────────

def build_customer_advance_reconciliation(
    as_of: date | None = None,
    period: dict | None = None,
) -> dict:
    """
    Read-only reconciliation snapshot for customer advances.

    Liability formula:
        expected_liability = total_advance_collected
                           - total_advance_applied
                           - total_advance_refunded

    The expected_liability should equal the sum of all CustomerAdvance.unapplied_amount
    (unapplied_balance).  A non-zero difference is a WARNING.
    """
    resolved_as_of, year, month, start, end = _resolve_period(as_of, period)
    checks: list[dict] = []
    overall = STATUS_OK

    try:
        from django.db.models import Count, Q, Sum
        from subscriptions.models import (
            CustomerAdvance,
            CustomerAdvanceStatus,
            CustomerAdvanceAllocation,
        )
        try:
            from subscriptions.models_customer_advance_refund import (
                CustomerAdvanceRefund,
                CustomerAdvanceRefundStatus,
            )
            refund_model_available = True
        except ImportError:
            refund_model_available = False

        source_available = True
    except ImportError:
        source_available = False

    if not source_available:
        checks.append(_deferred_check(
            "customer_advance_source_available",
            "Customer Advance Source Model",
            "CustomerAdvance model not importable — source subsystem unavailable.",
            "customer_advance",
        ))
        return {
            "status": STATUS_INFO,
            "source_available": False,
            "total_advance_collected": _money_str(0),
            "total_advance_applied": _money_str(0),
            "total_advance_refunded": _money_str(0),
            "expected_liability": _money_str(0),
            "unapplied_balance": _money_str(0),
            "difference": _money_str(0),
            "mismatch_count": 0,
            "bridge_gap_count": 0,
            "stale_unapplied_count": 0,
            "posted_liability_balance": None,
            "checks": checks,
            "metadata": {"as_of": resolved_as_of.isoformat(), "year": year, "month": month},
        }

    # ── Source available check ────────────────────────────────────────────────
    checks.append(_check(
        key="customer_advance_source_available",
        status=STATUS_OK,
        severity=SEVERITY_INFO,
        title="Customer Advance Source Model",
        message="CustomerAdvance source model is available.",
        source_area="customer_advance",
    ))

    # ── Totals ────────────────────────────────────────────────────────────────
    try:
        adv_agg = CustomerAdvance.objects.aggregate(
            total=Sum("amount"),
            unapplied=Sum("unapplied_amount"),
            count=Count("id"),
        )
        total_advance_collected = _money(adv_agg["total"])
        unapplied_balance = _money(adv_agg["unapplied"])
        total_advance_count = adv_agg["count"] or 0
    except Exception as exc:
        return {**_deferred_section("customer_advance", f"Advance aggregate unavailable: {exc!s:.200}")}

    try:
        alloc_agg = CustomerAdvanceAllocation.objects.aggregate(total=Sum("amount"))
        total_advance_applied = _money(alloc_agg["total"])
    except Exception:
        total_advance_applied = MONEY_ZERO

    total_advance_refunded = MONEY_ZERO
    if refund_model_available:
        try:
            ref_agg = CustomerAdvanceRefund.objects.filter(
                status=CustomerAdvanceRefundStatus.ACTIVE,
            ).aggregate(total=Sum("amount"))
            total_advance_refunded = _money(ref_agg["total"])
        except Exception:
            total_advance_refunded = MONEY_ZERO

    expected_liability = _money(total_advance_collected - total_advance_applied - total_advance_refunded)
    difference = _money(expected_liability - unapplied_balance)

    # ── Liability mismatch check ──────────────────────────────────────────────
    try:
        # FULLY_APPLIED with unapplied_amount > 0 is a data inconsistency.
        mismatch_fully_applied = CustomerAdvance.objects.filter(
            status=CustomerAdvanceStatus.FULLY_APPLIED,
            unapplied_amount__gt=MONEY_ZERO,
        ).count()
        # UNAPPLIED with unapplied_amount == 0 is also inconsistent.
        mismatch_unapplied_zero = CustomerAdvance.objects.filter(
            status=CustomerAdvanceStatus.UNAPPLIED,
            unapplied_amount=MONEY_ZERO,
        ).count()
        mismatch_count = mismatch_fully_applied + mismatch_unapplied_zero

        if mismatch_count == 0 and difference == MONEY_ZERO:
            checks.append(_check(
                key="customer_advance_liability_mismatch",
                status=STATUS_OK,
                severity=SEVERITY_INFO,
                title="Customer Advance Liability Match",
                message="Expected liability matches unapplied balance. No data inconsistencies detected.",
                count=0,
                source_area="customer_advance",
            ))
        else:
            severity = SEVERITY_CRITICAL if abs(difference) > Decimal("1000") else SEVERITY_WARNING
            mismatch_status = STATUS_CRITICAL if severity == SEVERITY_CRITICAL else STATUS_WARNING
            overall = _worst(overall, mismatch_status)
            checks.append(_check(
                key="customer_advance_liability_mismatch",
                status=mismatch_status,
                severity=severity,
                title="Customer Advance Liability Mismatch",
                message=(
                    f"Expected liability ({_money_str(expected_liability)}) differs from "
                    f"unapplied balance ({_money_str(unapplied_balance)}) by "
                    f"{_money_str(difference)}. "
                    f"Status inconsistencies: {mismatch_count}."
                ),
                count=mismatch_count,
                amount=_money_str(abs(difference)),
                source_area="customer_advance",
                action_url="/admin/accounting/customer-advances",
                metadata={
                    "mismatch_fully_applied": mismatch_fully_applied,
                    "mismatch_unapplied_zero": mismatch_unapplied_zero,
                    "difference": _money_str(difference),
                },
            ))
    except Exception as exc:
        checks.append(_deferred_check(
            "customer_advance_liability_mismatch",
            "Customer Advance Liability Mismatch",
            f"Mismatch check unavailable: {exc!s:.200}",
            "customer_advance",
        ))
        mismatch_count = 0

    # ── Bridge gap — receipts ─────────────────────────────────────────────────
    try:
        advance_ids = set(
            str(i) for i in
            CustomerAdvance.objects.values_list("id", flat=True)[:_BRIDGE_SCAN_CAP]
        )
        receipt_gap = _bridge_gap_count(_CA_RECEIPT_SOURCE_MODEL, _CA_RECEIPT_PURPOSE, advance_ids)
        total_bridge_gap = receipt_gap

        alloc_ids = set(
            str(i) for i in
            CustomerAdvanceAllocation.objects.values_list("id", flat=True)[:_BRIDGE_SCAN_CAP]
        )
        application_gap = _bridge_gap_count(
            _CA_APPLICATION_SOURCE_MODEL, _CA_APPLICATION_PURPOSE, alloc_ids
        )
        total_bridge_gap += application_gap

        refund_gap = 0
        if refund_model_available:
            refund_ids = set(
                str(i) for i in
                CustomerAdvanceRefund.objects.values_list("id", flat=True)[:_BRIDGE_SCAN_CAP]
            )
            refund_gap = _bridge_gap_count(
                _CA_REFUND_SOURCE_MODEL, _CA_REFUND_PURPOSE, refund_ids
            )
            total_bridge_gap += refund_gap

        if total_bridge_gap == 0:
            checks.append(_check(
                key="customer_advance_bridge_gap",
                status=STATUS_OK,
                severity=SEVERITY_INFO,
                title="Customer Advance Bridge Coverage",
                message="No detected bridge posting gaps for customer advance source records.",
                count=0,
                source_area="customer_advance",
                metadata={
                    "receipt_gap": receipt_gap,
                    "application_gap": application_gap,
                    "refund_gap": refund_gap,
                    "cap": _BRIDGE_SCAN_CAP,
                },
            ))
        else:
            overall = _worst(overall, STATUS_WARNING)
            checks.append(_check(
                key="customer_advance_bridge_gap",
                status=STATUS_WARNING,
                severity=SEVERITY_WARNING,
                title="Customer Advance Bridge Posting Gaps",
                message=(
                    f"{total_bridge_gap} customer advance source record(s) are missing "
                    f"accounting bridge postings (receipt_gap={receipt_gap}, "
                    f"application_gap={application_gap}, refund_gap={refund_gap})."
                ),
                count=total_bridge_gap,
                source_area="customer_advance",
                action_url="/admin/accounting/bridge-reconciliation",
                metadata={
                    "receipt_gap": receipt_gap,
                    "application_gap": application_gap,
                    "refund_gap": refund_gap,
                    "cap": _BRIDGE_SCAN_CAP,
                },
            ))
    except Exception as exc:
        checks.append(_deferred_check(
            "customer_advance_bridge_gap",
            "Customer Advance Bridge Gaps",
            f"Bridge gap detection unavailable: {exc!s:.200}",
            "customer_advance",
        ))
        total_bridge_gap = 0
        receipt_gap = application_gap = refund_gap = 0

    # ── Stale unapplied advances ──────────────────────────────────────────────
    try:
        stale_threshold = date.today() - _dt.timedelta(days=_STALE_ADVANCE_DAYS)
        stale_unapplied_count = CustomerAdvance.objects.filter(
            status__in=[CustomerAdvanceStatus.UNAPPLIED, CustomerAdvanceStatus.PARTIALLY_APPLIED],
            unapplied_amount__gt=MONEY_ZERO,
            created_at__date__lte=stale_threshold,
        ).count()

        if stale_unapplied_count == 0:
            checks.append(_check(
                key="stale_unresolved_liability_items",
                status=STATUS_OK,
                severity=SEVERITY_INFO,
                title="Stale Unapplied Advances",
                message=f"No unapplied advances older than {_STALE_ADVANCE_DAYS} days.",
                count=0,
                source_area="customer_advance",
                metadata={"threshold_days": _STALE_ADVANCE_DAYS},
            ))
        else:
            overall = _worst(overall, STATUS_WARNING)
            checks.append(_check(
                key="stale_unresolved_liability_items",
                status=STATUS_WARNING,
                severity=SEVERITY_WARNING,
                title="Stale Unapplied Customer Advances",
                message=(
                    f"{stale_unapplied_count} customer advance(s) have been unapplied "
                    f"or partially applied for more than {_STALE_ADVANCE_DAYS} days."
                ),
                count=stale_unapplied_count,
                source_area="customer_advance",
                action_url="/admin/accounting/customer-advances",
                metadata={"threshold_days": _STALE_ADVANCE_DAYS, "cutoff_date": stale_threshold.isoformat()},
            ))
    except Exception as exc:
        checks.append(_deferred_check(
            "stale_unresolved_liability_items",
            "Stale Unapplied Advances",
            f"Stale advance check unavailable: {exc!s:.200}",
            "customer_advance",
        ))
        stale_unapplied_count = 0

    return {
        "status": overall,
        "source_available": True,
        "total_advance_collected": _money_str(total_advance_collected),
        "total_advance_applied": _money_str(total_advance_applied),
        "total_advance_refunded": _money_str(total_advance_refunded),
        "expected_liability": _money_str(expected_liability),
        "unapplied_balance": _money_str(unapplied_balance),
        "posted_liability_balance": None,
        "difference": _money_str(difference),
        "mismatch_count": mismatch_count,
        "bridge_gap_count": total_bridge_gap,
        "stale_unapplied_count": stale_unapplied_count,
        "checks": checks,
        "metadata": {
            "as_of": resolved_as_of.isoformat(),
            "year": year,
            "month": month,
            "total_advance_count": total_advance_count,
            "bridge_scan_cap": _BRIDGE_SCAN_CAP,
            "note": (
                "posted_liability_balance is deferred — chart-of-accounts mapping "
                "required for automated ledger lookup."
            ),
        },
    }


def _deferred_section(source_area: str, message: str) -> dict:
    return {
        "status": STATUS_INFO,
        "source_available": False,
        "message": message,
        "deferred": True,
        "checks": [],
        "metadata": {"source_area": source_area},
    }


# ─────────────────────────────────────────────────────────────────────────────
# Security deposit reconciliation
# ─────────────────────────────────────────────────────────────────────────────

def build_security_deposit_reconciliation(
    as_of: date | None = None,
    period: dict | None = None,
) -> dict:
    """
    Read-only reconciliation snapshot for rent/lease security deposits.

    Liability formula:
        expected_deposit_liability = total_deposit_collected
                                   - total_deposit_refunded
                                   - total_deposit_deducted

    Deposit transaction types:
        COLLECTED / DEPOSIT_RECEIPT  → increases liability
        REFUNDED  / DEPOSIT_REFUND   → decreases liability
        DEDUCTION                    → decreases liability (damage recovery)
    """
    resolved_as_of, year, month, start, end = _resolve_period(as_of, period)
    checks: list[dict] = []
    overall = STATUS_OK

    try:
        from django.db.models import Count, Sum
        from subscriptions.models import (
            RentLeaseDepositTransaction,
            RentLeaseDepositTransactionType,
            RentLeaseDepositTransactionStatus,
            Subscription,
            PlanType,
        )
        source_available = True
    except ImportError:
        source_available = False

    if not source_available:
        checks.append(_deferred_check(
            "security_deposit_source_available",
            "Security Deposit Source Model",
            "RentLeaseDepositTransaction model not importable.",
            "security_deposit",
        ))
        return {
            "status": STATUS_INFO,
            "source_available": False,
            "total_deposit_collected": _money_str(0),
            "total_deposit_refunded": _money_str(0),
            "total_deposit_deducted": _money_str(0),
            "expected_deposit_liability": _money_str(0),
            "posted_deposit_liability_balance": None,
            "unposted_collection_count": 0,
            "unposted_refund_count": 0,
            "unposted_deduction_count": 0,
            "active_contract_deposit_gap_count": 0,
            "mismatch_count": 0,
            "checks": checks,
            "metadata": {"as_of": resolved_as_of.isoformat(), "year": year, "month": month},
        }

    # ── Source available check ────────────────────────────────────────────────
    checks.append(_check(
        key="security_deposit_source_available",
        status=STATUS_OK,
        severity=SEVERITY_INFO,
        title="Security Deposit Source Model",
        message="RentLeaseDepositTransaction source model is available.",
        source_area="security_deposit",
    ))

    # ── Active (non-voided/reversed) transactions ─────────────────────────────
    _VOID_STATUSES = {
        RentLeaseDepositTransactionStatus.VOIDED,
        RentLeaseDepositTransactionStatus.REVERSED,
    }
    dep_qs = RentLeaseDepositTransaction.objects.exclude(status__in=_VOID_STATUSES)

    _COLLECT_TYPES = {
        RentLeaseDepositTransactionType.COLLECTED,
        RentLeaseDepositTransactionType.DEPOSIT_RECEIPT,
    }
    _REFUND_TYPES = {
        RentLeaseDepositTransactionType.REFUNDED,
        RentLeaseDepositTransactionType.DEPOSIT_REFUND,
    }

    try:
        coll_agg = dep_qs.filter(transaction_type__in=_COLLECT_TYPES).aggregate(
            count=Count("id"), amount=Sum("amount")
        )
        ref_agg = dep_qs.filter(transaction_type__in=_REFUND_TYPES).aggregate(
            count=Count("id"), amount=Sum("amount")
        )
        ded_agg = dep_qs.filter(
            transaction_type=RentLeaseDepositTransactionType.DEDUCTION
        ).aggregate(count=Count("id"), amount=Sum("amount"))

        total_deposit_collected = _money(coll_agg["amount"])
        total_deposit_refunded = _money(ref_agg["amount"])
        total_deposit_deducted = _money(ded_agg["amount"])
        expected_deposit_liability = _money(
            total_deposit_collected - total_deposit_refunded - total_deposit_deducted
        )

        coll_count = coll_agg["count"] or 0
        ref_count = ref_agg["count"] or 0
        ded_count = ded_agg["count"] or 0
    except Exception as exc:
        return {**_deferred_section("security_deposit", f"Deposit aggregate unavailable: {exc!s:.200}")}

    # ── Liability mismatch — we can only compare with posted GL balance if the
    #    mapping is resolved; defer that to future work. ─────────────────────
    mismatch_count = 0
    checks.append(_check(
        key="security_deposit_liability_mismatch",
        status=STATUS_INFO,
        severity=SEVERITY_INFO,
        title="Security Deposit GL Balance Comparison",
        message=(
            "Posted GL liability balance comparison deferred — chart-of-accounts "
            "mapping for deposit liability account requires manual configuration."
        ),
        count=0,
        source_area="security_deposit",
        deferred=True,
        metadata={"expected_deposit_liability": _money_str(expected_deposit_liability)},
    ))

    # ── Bridge gap — collections ──────────────────────────────────────────────
    try:
        coll_ids = set(
            str(i) for i in
            dep_qs.filter(transaction_type__in=_COLLECT_TYPES)
            .values_list("id", flat=True)[:_BRIDGE_SCAN_CAP]
        )
        collection_bridge_gap = _bridge_gap_count_multi_purpose(
            _DEP_SOURCE_MODEL, _DEP_RECEIPT_PURPOSES, coll_ids
        )
        unposted_collection_count = collection_bridge_gap

        if collection_bridge_gap == 0:
            checks.append(_check(
                key="security_deposit_collection_bridge_gap",
                status=STATUS_OK,
                severity=SEVERITY_INFO,
                title="Security Deposit Collection Bridge Coverage",
                message="No detected bridge posting gaps for deposit collection records.",
                count=0,
                source_area="security_deposit",
                metadata={"cap": _BRIDGE_SCAN_CAP},
            ))
        else:
            overall = _worst(overall, STATUS_WARNING)
            checks.append(_check(
                key="security_deposit_collection_bridge_gap",
                status=STATUS_WARNING,
                severity=SEVERITY_WARNING,
                title="Security Deposit Collection Bridge Gaps",
                message=f"{collection_bridge_gap} deposit collection record(s) have no accounting bridge posting.",
                count=collection_bridge_gap,
                source_area="security_deposit",
                action_url="/admin/accounting/bridge-reconciliation",
                metadata={"cap": _BRIDGE_SCAN_CAP},
            ))
    except Exception as exc:
        checks.append(_deferred_check(
            "security_deposit_collection_bridge_gap",
            "Security Deposit Collection Bridge Gaps",
            f"Collection bridge gap detection unavailable: {exc!s:.200}",
            "security_deposit",
        ))
        unposted_collection_count = 0

    # ── Bridge gap — refunds ──────────────────────────────────────────────────
    try:
        ref_ids = set(
            str(i) for i in
            dep_qs.filter(transaction_type__in=_REFUND_TYPES)
            .values_list("id", flat=True)[:_BRIDGE_SCAN_CAP]
        )
        refund_bridge_gap = _bridge_gap_count_multi_purpose(
            _DEP_SOURCE_MODEL, _DEP_REFUND_PURPOSES, ref_ids
        )
        unposted_refund_count = refund_bridge_gap

        if refund_bridge_gap == 0:
            checks.append(_check(
                key="security_deposit_refund_bridge_gap",
                status=STATUS_OK,
                severity=SEVERITY_INFO,
                title="Security Deposit Refund Bridge Coverage",
                message="No detected bridge posting gaps for deposit refund records.",
                count=0,
                source_area="security_deposit",
                metadata={"cap": _BRIDGE_SCAN_CAP},
            ))
        else:
            overall = _worst(overall, STATUS_WARNING)
            checks.append(_check(
                key="security_deposit_refund_bridge_gap",
                status=STATUS_WARNING,
                severity=SEVERITY_WARNING,
                title="Security Deposit Refund Bridge Gaps",
                message=f"{refund_bridge_gap} deposit refund record(s) have no accounting bridge posting.",
                count=refund_bridge_gap,
                source_area="security_deposit",
                action_url="/admin/accounting/bridge-reconciliation",
                metadata={"cap": _BRIDGE_SCAN_CAP},
            ))
    except Exception as exc:
        checks.append(_deferred_check(
            "security_deposit_refund_bridge_gap",
            "Security Deposit Refund Bridge Gaps",
            f"Refund bridge gap detection unavailable: {exc!s:.200}",
            "security_deposit",
        ))
        unposted_refund_count = 0

    # ── Bridge gap — deductions (damage) ─────────────────────────────────────
    try:
        ded_ids = set(
            str(i) for i in
            dep_qs.filter(transaction_type=RentLeaseDepositTransactionType.DEDUCTION)
            .values_list("id", flat=True)[:_BRIDGE_SCAN_CAP]
        )
        from accounting.models import AccountingBridgePosting
        damage_posted_ids = set(
            AccountingBridgePosting.objects.filter(
                source_model=_DEP_SOURCE_MODEL,
                purpose__icontains=_DEP_DAMAGE_PURPOSE_FRAGMENT,
                source_id__in=ded_ids,
            ).values_list("source_id", flat=True)
        )
        deduction_bridge_gap = len(ded_ids - damage_posted_ids)
        unposted_deduction_count = deduction_bridge_gap

        if deduction_bridge_gap == 0:
            checks.append(_check(
                key="security_deposit_deduction_bridge_gap",
                status=STATUS_OK,
                severity=SEVERITY_INFO,
                title="Security Deposit Deduction Bridge Coverage",
                message="No detected bridge posting gaps for deposit deduction (damage) records.",
                count=0,
                source_area="security_deposit",
                metadata={"cap": _BRIDGE_SCAN_CAP},
            ))
        else:
            overall = _worst(overall, STATUS_WARNING)
            checks.append(_check(
                key="security_deposit_deduction_bridge_gap",
                status=STATUS_WARNING,
                severity=SEVERITY_WARNING,
                title="Security Deposit Deduction Bridge Gaps",
                message=f"{deduction_bridge_gap} deposit deduction (damage) record(s) have no accounting bridge posting.",
                count=deduction_bridge_gap,
                source_area="security_deposit",
                action_url="/admin/accounting/bridge-reconciliation",
                metadata={"cap": _BRIDGE_SCAN_CAP},
            ))
    except Exception as exc:
        checks.append(_deferred_check(
            "security_deposit_deduction_bridge_gap",
            "Security Deposit Deduction Bridge Gaps",
            f"Deduction bridge gap detection unavailable: {exc!s:.200}",
            "security_deposit",
        ))
        unposted_deduction_count = 0

    # ── Active rent/lease contracts without deposit posture ───────────────────
    active_contract_deposit_gap_count = 0
    try:
        from subscriptions.models import Subscription, SubscriptionStatus

        active_rent_lease_ids = set(
            Subscription.objects.filter(
                plan_type__in=[PlanType.RENT, PlanType.LEASE],
                status=SubscriptionStatus.ACTIVE,
            ).values_list("id", flat=True)[:_BRIDGE_SCAN_CAP]
        )
        if active_rent_lease_ids:
            subs_with_deposit = set(
                dep_qs.filter(
                    subscription_id__in=active_rent_lease_ids,
                    transaction_type__in=_COLLECT_TYPES,
                ).values_list("subscription_id", flat=True)
            )
            no_deposit_ids = active_rent_lease_ids - subs_with_deposit
            active_contract_deposit_gap_count = len(no_deposit_ids)

        if active_contract_deposit_gap_count == 0:
            checks.append(_check(
                key="active_rent_lease_without_deposit_posture",
                status=STATUS_OK,
                severity=SEVERITY_INFO,
                title="Active Rent/Lease Deposit Coverage",
                message="All active rent/lease subscriptions have at least one deposit collection record.",
                count=0,
                source_area="security_deposit",
                metadata={"scanned": len(active_rent_lease_ids) if active_rent_lease_ids else 0},
            ))
        else:
            overall = _worst(overall, STATUS_WARNING)
            checks.append(_check(
                key="active_rent_lease_without_deposit_posture",
                status=STATUS_WARNING,
                severity=SEVERITY_WARNING,
                title="Active Rent/Lease Contracts Without Deposit",
                message=(
                    f"{active_contract_deposit_gap_count} active rent/lease subscription(s) "
                    "have no deposit collection record."
                ),
                count=active_contract_deposit_gap_count,
                source_area="security_deposit",
                action_url="/admin/rent-lease/deposits",
                metadata={"cap": _BRIDGE_SCAN_CAP},
            ))
    except Exception as exc:
        checks.append(_deferred_check(
            "active_rent_lease_without_deposit_posture",
            "Active Rent/Lease Without Deposit",
            f"Active contract deposit check unavailable: {exc!s:.200}",
            "security_deposit",
        ))

    return {
        "status": overall,
        "source_available": True,
        "total_deposit_collected": _money_str(total_deposit_collected),
        "total_deposit_refunded": _money_str(total_deposit_refunded),
        "total_deposit_deducted": _money_str(total_deposit_deducted),
        "expected_deposit_liability": _money_str(expected_deposit_liability),
        "posted_deposit_liability_balance": None,
        "unposted_collection_count": unposted_collection_count,
        "unposted_refund_count": unposted_refund_count,
        "unposted_deduction_count": unposted_deduction_count,
        "active_contract_deposit_gap_count": active_contract_deposit_gap_count,
        "mismatch_count": mismatch_count,
        "checks": checks,
        "metadata": {
            "as_of": resolved_as_of.isoformat(),
            "year": year,
            "month": month,
            "collection_count": coll_count,
            "refund_count": ref_count,
            "deduction_count": ded_count,
            "bridge_scan_cap": _BRIDGE_SCAN_CAP,
            "note": (
                "posted_deposit_liability_balance is deferred — chart-of-accounts "
                "mapping for deposit liability account requires manual configuration."
            ),
        },
    }


# ─────────────────────────────────────────────────────────────────────────────
# Action items
# ─────────────────────────────────────────────────────────────────────────────

def build_liability_reconciliation_action_items(
    as_of: date | None = None,
    period: dict | None = None,
) -> list[dict]:
    """
    Return prioritised action items for liability reconciliation issues.
    Items sourced from the advance and deposit reconciliation snapshots.
    """
    from accounting.services.financial_intelligence_service import (
        _action_item,
        SEVERITY_WARNING,
        SEVERITY_CRITICAL,
        SEVERITY_INFO,
    )

    items: list[dict] = []

    # Customer advance
    try:
        adv = build_customer_advance_reconciliation(as_of=as_of, period=period)
        if adv.get("mismatch_count", 0) > 0:
            items.append(_action_item(
                key="liability.customer_advance_mismatch",
                severity=SEVERITY_WARNING,
                title="Customer Advance Liability Mismatch",
                description=(
                    f"{adv['mismatch_count']} customer advance record(s) have status/amount "
                    "inconsistencies affecting expected liability calculation."
                ),
                source_area="advance_deposit",
                count=adv["mismatch_count"],
                amount=adv.get("difference"),
                action_url="/admin/accounting/customer-advances",
            ))
        if adv.get("bridge_gap_count", 0) > 0:
            items.append(_action_item(
                key="liability.customer_advance_bridge_gap",
                severity=SEVERITY_WARNING,
                title="Customer Advance Bridge Posting Gaps",
                description=(
                    f"{adv['bridge_gap_count']} customer advance source record(s) are missing "
                    "accounting bridge postings."
                ),
                source_area="advance_deposit",
                count=adv["bridge_gap_count"],
                action_url="/admin/accounting/bridge-reconciliation",
            ))
        if adv.get("stale_unapplied_count", 0) > 0:
            items.append(_action_item(
                key="liability.stale_unapplied_advances",
                severity=SEVERITY_WARNING,
                title="Stale Unapplied Customer Advances",
                description=(
                    f"{adv['stale_unapplied_count']} customer advance(s) remain unapplied "
                    f"for more than {_STALE_ADVANCE_DAYS} days."
                ),
                source_area="advance_deposit",
                count=adv["stale_unapplied_count"],
                action_url="/admin/accounting/customer-advances",
            ))
    except Exception:
        pass

    # Security deposit
    try:
        dep = build_security_deposit_reconciliation(as_of=as_of, period=period)
        total_dep_gaps = (
            dep.get("unposted_collection_count", 0)
            + dep.get("unposted_refund_count", 0)
            + dep.get("unposted_deduction_count", 0)
        )
        if total_dep_gaps > 0:
            items.append(_action_item(
                key="liability.deposit_bridge_gaps",
                severity=SEVERITY_WARNING,
                title="Security Deposit Bridge Posting Gaps",
                description=(
                    f"{total_dep_gaps} security deposit transaction(s) are missing "
                    "accounting bridge postings."
                ),
                source_area="advance_deposit",
                count=total_dep_gaps,
                action_url="/admin/accounting/bridge-reconciliation",
            ))
        if dep.get("active_contract_deposit_gap_count", 0) > 0:
            items.append(_action_item(
                key="liability.active_contracts_without_deposit",
                severity=SEVERITY_WARNING,
                title="Active Rent/Lease Without Security Deposit",
                description=(
                    f"{dep['active_contract_deposit_gap_count']} active rent/lease "
                    "subscription(s) have no deposit collection record."
                ),
                source_area="advance_deposit",
                count=dep["active_contract_deposit_gap_count"],
                action_url="/admin/rent-lease/deposits",
            ))
    except Exception:
        pass

    _rank = {SEVERITY_CRITICAL: 0, SEVERITY_WARNING: 1, SEVERITY_INFO: 2}
    items.sort(key=lambda a: _rank.get(a.get("severity", "INFO"), 9))
    return items


# ─────────────────────────────────────────────────────────────────────────────
# Main snapshot entry point
# ─────────────────────────────────────────────────────────────────────────────

def build_liability_reconciliation_snapshot(
    as_of: date | None = None,
    period: dict | None = None,
) -> dict:
    """
    Build the complete P4C liability reconciliation snapshot.

    All sub-checks are wrapped defensively so a single subsystem failure
    never crashes the full snapshot.
    """
    resolved_as_of, year, month, start, end = _resolve_period(as_of, period)

    adv = build_customer_advance_reconciliation(as_of=resolved_as_of, period={"year": year, "month": month})
    dep = build_security_deposit_reconciliation(as_of=resolved_as_of, period={"year": year, "month": month})
    action_items = build_liability_reconciliation_action_items(
        as_of=resolved_as_of, period={"year": year, "month": month}
    )

    all_checks = list(adv.get("checks", [])) + list(dep.get("checks", []))

    overall_status = _worst(
        adv.get("status", STATUS_INFO),
        dep.get("status", STATUS_INFO),
    )

    return {
        "as_of": resolved_as_of.isoformat(),
        "period": {"year": year, "month": month},
        "overall_status": overall_status,
        "customer_advance": adv,
        "security_deposit": dep,
        "checks": all_checks,
        "action_items": action_items,
        "metadata": {
            "generated_at": _dt.datetime.utcnow().isoformat() + "Z",
            "read_only": True,
            "note": (
                "P4C Liability Reconciliation Center — read-only diagnostic. "
                "No financial records are created or mutated."
            ),
        },
    }
