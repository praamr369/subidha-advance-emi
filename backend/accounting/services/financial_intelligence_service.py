"""
P4A — Financial Intelligence Readiness Service.

Read-only diagnostic layer.  No financial record is ever mutated.
No AccountingBridgePosting, JournalEntry, Payment, EMI, StockLedger,
BillingInvoice, ReceiptDocument, DirectSale, RentLeaseBillingDemand,
RentLeaseDepositTransaction, Commission, Payout, Reconciliation, or
MoneyMovement rows are created or modified by any function in this module.
"""
from __future__ import annotations

import calendar
from datetime import date, datetime
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


def _worst(*statuses: str) -> str:
    return max(statuses, key=lambda s: _SEVERITY_RANK.get(s, 0))


def _money(value: Any) -> str:
    return f"{Decimal(str(value or '0')).quantize(MONEY_ZERO)}"


def _deferred(message: str = "Automation not available yet") -> dict:
    return {"status": STATUS_INFO, "message": message, "deferred": True}


def _action_item(
    *,
    key: str,
    severity: str,
    title: str,
    description: str,
    source_area: str,
    count: int = 0,
    amount: str | None = None,
    action_url: str | None = None,
    deferred: bool = False,
    metadata: dict | None = None,
) -> dict:
    item: dict[str, Any] = {
        "key": key,
        "severity": severity,
        "title": title,
        "description": description,
        "source_area": source_area,
        "count": count,
        "deferred": deferred,
    }
    if amount is not None:
        item["amount"] = amount
    if action_url:
        item["action_url"] = action_url
    if metadata:
        item["metadata"] = metadata
    return item


# ─────────────────────────────────────────────────────────────────────────────
# Period helpers
# ─────────────────────────────────────────────────────────────────────────────

def _resolve_period(as_of: date | None, year: int | None, month: int | None) -> tuple[date, int, int, date, date]:
    """Return (as_of, year, month, period_start, period_end)."""
    if as_of is None:
        from django.utils import timezone
        as_of = timezone.localdate()
    if year is None or month is None:
        year = as_of.year
        month = as_of.month
    year = int(year)
    month = int(month)
    last_day = calendar.monthrange(year, month)[1]
    start = date(year, month, 1)
    end = date(year, month, last_day)
    return as_of, year, month, start, end


# ─────────────────────────────────────────────────────────────────────────────
# Section A — Collection posture
# ─────────────────────────────────────────────────────────────────────────────

def _collection_posture(start: date, end: date) -> dict:
    try:
        from django.db.models import Count, Q, Sum
        from subscriptions.models import Payment, PaymentMethod

        qs = Payment.objects.filter(payment_date__gte=start, payment_date__lte=end)

        total_agg = qs.aggregate(count=Count("id"), amount=Sum("amount"))
        total_count = total_agg["count"] or 0
        total_amount = _money(total_agg["amount"])

        cash_agg = qs.filter(method=PaymentMethod.CASH).aggregate(count=Count("id"), amount=Sum("amount"))
        upi_agg = qs.filter(method=PaymentMethod.UPI).aggregate(count=Count("id"), amount=Sum("amount"))
        bank_agg = qs.filter(method=PaymentMethod.BANK).aggregate(count=Count("id"), amount=Sum("amount"))

        reversed_count = qs.filter(
            allocation_metadata__reversal__is_reversed=True
        ).count()

        missing_receipt_count = qs.filter(receipt_document__isnull=True).count()

        status = STATUS_OK
        warnings: list[str] = []
        if missing_receipt_count > 0:
            status = _worst(status, STATUS_WARNING)
            warnings.append(f"{missing_receipt_count} payment(s) have no linked receipt document.")

        return {
            "status": status,
            "period_payment_count": total_count,
            "period_payment_amount": total_amount,
            "method_split": {
                "cash": {"count": cash_agg["count"] or 0, "amount": _money(cash_agg["amount"])},
                "upi": {"count": upi_agg["count"] or 0, "amount": _money(upi_agg["amount"])},
                "bank": {"count": bank_agg["count"] or 0, "amount": _money(bank_agg["amount"])},
            },
            "reversed_payment_count": reversed_count,
            "missing_receipt_count": missing_receipt_count,
            "warnings": warnings,
        }
    except Exception as exc:
        return {**_deferred(f"Collection posture unavailable: {exc!s:.200}"), "section": "collection"}


# ─────────────────────────────────────────────────────────────────────────────
# Section B — Billing posture
# ─────────────────────────────────────────────────────────────────────────────

def _billing_posture(start: date, end: date) -> dict:
    try:
        from django.db.models import Count, Q, Sum
        from billing.models import BillingInvoice, BillingDocumentStatus, DirectSale, DirectSaleStatus
        from subscriptions.models import RentLeaseBillingDemand, RentLeaseDemandStatus

        inv_qs = BillingInvoice.objects.filter(
            invoice_date__gte=start, invoice_date__lte=end
        ).exclude(status__in=[BillingDocumentStatus.CANCELLED, BillingDocumentStatus.VOID])
        inv_agg = inv_qs.aggregate(count=Count("id"), amount=Sum("grand_total"))
        inv_count = inv_agg["count"] or 0
        inv_amount = _money(inv_agg["amount"])

        inv_without_receipt = inv_qs.filter(receipts__isnull=True).count()

        ds_qs = DirectSale.objects.filter(
            sale_date__gte=start, sale_date__lte=end
        ).exclude(status__in=[
            DirectSaleStatus.CANCELLED,
            DirectSaleStatus.CANCELLED_PRE_INVOICE,
            DirectSaleStatus.CANCELLED_AFTER_DELIVERY,
            DirectSaleStatus.REVERSED_POST_INVOICE,
        ])
        ds_agg = ds_qs.aggregate(count=Count("id"), amount=Sum("grand_total"))
        ds_count = ds_agg["count"] or 0
        ds_amount = _money(ds_agg["amount"])

        demand_qs = RentLeaseBillingDemand.objects.filter(
            due_date__gte=start, due_date__lte=end
        )
        demand_agg = demand_qs.aggregate(count=Count("id"), amount=Sum("amount"))
        demand_count = demand_agg["count"] or 0
        demand_amount = _money(demand_agg["amount"])

        overdue_count = RentLeaseBillingDemand.objects.filter(
            status=RentLeaseDemandStatus.OVERDUE
        ).count()

        status = STATUS_OK
        warnings: list[str] = []
        if inv_without_receipt > 0:
            status = _worst(status, STATUS_WARNING)
            warnings.append(f"{inv_without_receipt} billing invoice(s) have no linked receipt.")
        if overdue_count > 0:
            status = _worst(status, STATUS_WARNING)
            warnings.append(f"{overdue_count} rent/lease demand(s) are overdue.")

        return {
            "status": status,
            "invoice_count": inv_count,
            "invoice_amount": inv_amount,
            "invoices_without_receipt_count": inv_without_receipt,
            "direct_sale_count": ds_count,
            "direct_sale_amount": ds_amount,
            "rent_lease_demand_count": demand_count,
            "rent_lease_demand_amount": demand_amount,
            "overdue_demand_count": overdue_count,
            "warnings": warnings,
        }
    except Exception as exc:
        return {**_deferred(f"Billing posture unavailable: {exc!s:.200}"), "section": "billing"}


# ─────────────────────────────────────────────────────────────────────────────
# Section C — Accounting bridge posture
# ─────────────────────────────────────────────────────────────────────────────

def _bridge_posture_internal(start: date, end: date) -> dict:
    try:
        from django.db.models import Count, Q
        from accounting.models import AccountingBridgePosting, JournalEntryStatus

        # AccountingBridgePosting has no independent status field;
        # state is reflected via the linked JournalEntry.
        all_postings = AccountingBridgePosting.objects.select_related("journal_entry")

        posted = all_postings.filter(journal_entry__status=JournalEntryStatus.POSTED)
        draft = all_postings.filter(journal_entry__status=JournalEntryStatus.DRAFT)
        void = all_postings.filter(journal_entry__status=JournalEntryStatus.VOID)

        period_postings = all_postings.filter(
            source_event_date__gte=start, source_event_date__lte=end
        )
        period_posted = period_postings.filter(journal_entry__status=JournalEntryStatus.POSTED).count()
        period_draft = period_postings.filter(journal_entry__status=JournalEntryStatus.DRAFT).count()

        total_posted = posted.count()
        total_draft = draft.count()
        total_void = void.count()
        total_all = all_postings.count()

        status = STATUS_OK
        warnings: list[str] = []
        if total_draft > 0:
            status = _worst(status, STATUS_WARNING)
            warnings.append(f"{total_draft} bridge posting(s) have DRAFT journal entries (not yet posted).")

        # Purpose-level breakdown — top 10 by purpose
        purpose_rows = (
            all_postings
            .values("purpose")
            .annotate(count=Count("id"))
            .order_by("-count")[:10]
        )
        purpose_breakdown = [
            {"purpose": r["purpose"], "count": r["count"]}
            for r in purpose_rows
        ]

        return {
            "status": status,
            "total_bridge_postings": total_all,
            "total_posted": total_posted,
            "total_draft": total_draft,
            "total_void": total_void,
            "period_bridge_postings": period_postings.count(),
            "period_posted": period_posted,
            "period_draft": period_draft,
            "purpose_breakdown": purpose_breakdown,
            "note": (
                "Bridge postings reflect successful accounting journal entries for each source record. "
                "DRAFT entries indicate incomplete postings that require admin review."
            ),
            "warnings": warnings,
            "damage_deduction_posture": _bridge_damage_deduction_posture(),
            "rent_lease_bridge_posture": _bridge_rent_lease_posture(),
        }
    except Exception as exc:
        return {**_deferred(f"Bridge posture unavailable: {exc!s:.200}"), "section": "bridge"}


def _bridge_damage_deduction_posture() -> dict:
    """P1 damage deduction bridge — read-only summary count."""
    try:
        from django.db.models import Count
        from accounting.models import AccountingBridgePosting

        damage_qs = AccountingBridgePosting.objects.filter(
            source_model="RentLeaseDepositTransaction",
            purpose__icontains="DAMAGE",
        )
        posted = damage_qs.filter(journal_entry__status="POSTED").count()
        draft = damage_qs.filter(journal_entry__status="DRAFT").count()
        return {
            "source": "RentLeaseDepositTransaction",
            "purpose_filter": "DAMAGE",
            "posted_count": posted,
            "draft_count": draft,
            "status": STATUS_WARNING if draft > 0 else STATUS_OK,
        }
    except Exception as exc:
        return _deferred(f"Damage deduction bridge posture unavailable: {exc!s:.200}")


def _bridge_rent_lease_posture() -> dict:
    """Rent/lease demand and deposit bridge summary."""
    try:
        from django.db.models import Count
        from accounting.models import AccountingBridgePosting

        rl_qs = AccountingBridgePosting.objects.filter(
            source_model__in=["RentLeaseBillingDemand", "RentLeaseDepositTransaction", "CustomerAdvance"]
        )
        posted = rl_qs.filter(journal_entry__status="POSTED").count()
        draft = rl_qs.filter(journal_entry__status="DRAFT").count()
        by_model = list(
            rl_qs.values("source_model").annotate(count=Count("id")).order_by("source_model")
        )
        return {
            "posted_count": posted,
            "draft_count": draft,
            "by_source_model": by_model,
            "status": STATUS_WARNING if draft > 0 else STATUS_OK,
        }
    except Exception as exc:
        return _deferred(f"Rent/lease bridge posture unavailable: {exc!s:.200}")


def build_bridge_posture(as_of: date | None = None, period: dict | None = None) -> dict:
    _as_of, year, month, start, end = _resolve_period(
        as_of, (period or {}).get("year"), (period or {}).get("month")
    )
    return _bridge_posture_internal(start, end)


# ─────────────────────────────────────────────────────────────────────────────
# Section D — Reconciliation posture
# ─────────────────────────────────────────────────────────────────────────────

def _reconciliation_posture_internal() -> dict:
    try:
        from django.db.models import Count, Q
        from reconciliation.models import (
            ReconciliationItem,
            ReconciliationItemStatus,
            ReconciliationRun,
            ReconciliationRunStatus,
            ReconciliationSeverity,
        )

        _RESOLVED_STATUSES = {
            ReconciliationItemStatus.RESOLVED,
            ReconciliationItemStatus.FALSE_POSITIVE,
            ReconciliationItemStatus.WAIVED_BY_APPROVAL,
            ReconciliationItemStatus.MATCHED,
        }

        unresolved = ReconciliationItem.objects.exclude(status__in=_RESOLVED_STATUSES)
        total_unresolved = unresolved.count()
        critical_unresolved = unresolved.filter(
            severity=ReconciliationSeverity.CRITICAL
        ).count()
        high_unresolved = unresolved.filter(
            severity=ReconciliationSeverity.HIGH
        ).count()
        amount_mismatch = unresolved.filter(
            status=ReconciliationItemStatus.AMOUNT_MISMATCH
        ).count()

        # Stale: created > 30 days ago and still unresolved
        from django.utils import timezone
        import datetime as _dt
        stale_threshold = timezone.now() - _dt.timedelta(days=30)
        stale_count = unresolved.filter(created_at__lt=stale_threshold).count()

        recent_run = (
            ReconciliationRun.objects.filter(
                status=ReconciliationRunStatus.COMPLETED
            )
            .order_by("-started_at")
            .first()
        )
        last_run_at = recent_run.started_at.isoformat() if recent_run else None
        last_run_module = recent_run.module if recent_run else None

        status = STATUS_OK
        warnings: list[str] = []
        if critical_unresolved > 0:
            status = _worst(status, STATUS_CRITICAL)
            warnings.append(f"{critical_unresolved} CRITICAL unresolved reconciliation item(s).")
        elif high_unresolved > 0:
            status = _worst(status, STATUS_WARNING)
            warnings.append(f"{high_unresolved} HIGH-severity unresolved reconciliation item(s).")
        if stale_count > 0:
            status = _worst(status, STATUS_WARNING)
            warnings.append(f"{stale_count} reconciliation item(s) are stale (>30 days old).")

        return {
            "status": status,
            "total_unresolved_items": total_unresolved,
            "critical_unresolved": critical_unresolved,
            "high_unresolved": high_unresolved,
            "amount_mismatch_count": amount_mismatch,
            "stale_item_count": stale_count,
            "last_reconciliation_run_at": last_run_at,
            "last_reconciliation_run_module": last_run_module,
            "warnings": warnings,
        }
    except Exception as exc:
        return {**_deferred(f"Reconciliation posture unavailable: {exc!s:.200}"), "section": "reconciliation"}


def build_reconciliation_posture(as_of: date | None = None, period: dict | None = None) -> dict:
    return _reconciliation_posture_internal()


# ─────────────────────────────────────────────────────────────────────────────
# Section E — Customer advance / security deposit posture
# ─────────────────────────────────────────────────────────────────────────────

def _advance_deposit_posture_internal(start: date, end: date) -> dict:
    try:
        from django.db.models import Count, Q, Sum
        from subscriptions.models import (
            CustomerAdvance,
            CustomerAdvanceStatus,
            RentLeaseDepositTransaction,
            RentLeaseDepositTransactionType,
            RentLeaseDepositTransactionStatus,
        )

        adv_agg = CustomerAdvance.objects.aggregate(
            total_count=Count("id"),
            total_amount=Sum("amount"),
            total_unapplied=Sum("unapplied_amount"),
        )
        adv_unapplied_count = CustomerAdvance.objects.filter(
            status__in=[CustomerAdvanceStatus.UNAPPLIED, CustomerAdvanceStatus.PARTIALLY_APPLIED],
            unapplied_amount__gt=MONEY_ZERO,
        ).count()

        # Liability mismatch: unapplied_amount differs from what status implies
        # Full_applied but unapplied > 0 is a data quality risk
        liability_mismatch_count = CustomerAdvance.objects.filter(
            status=CustomerAdvanceStatus.FULLY_APPLIED,
            unapplied_amount__gt=MONEY_ZERO,
        ).count()

        dep_qs = RentLeaseDepositTransaction.objects.exclude(
            status__in=[
                RentLeaseDepositTransactionStatus.VOIDED,
                RentLeaseDepositTransactionStatus.REVERSED,
            ]
        )
        collected = dep_qs.filter(
            transaction_type__in=[
                RentLeaseDepositTransactionType.COLLECTED,
                RentLeaseDepositTransactionType.DEPOSIT_RECEIPT,
            ]
        ).aggregate(count=Count("id"), amount=Sum("amount"))
        refunded = dep_qs.filter(
            transaction_type__in=[
                RentLeaseDepositTransactionType.REFUNDED,
                RentLeaseDepositTransactionType.DEPOSIT_REFUND,
            ]
        ).aggregate(count=Count("id"), amount=Sum("amount"))
        deducted = dep_qs.filter(
            transaction_type=RentLeaseDepositTransactionType.DEDUCTION
        ).aggregate(count=Count("id"), amount=Sum("amount"))

        # Deposit transactions without bridge posting (unposted liability)
        from accounting.models import AccountingBridgePosting
        dep_ids_with_bridge = set(
            AccountingBridgePosting.objects.filter(
                source_model="RentLeaseDepositTransaction"
            ).values_list("source_id", flat=True)
        )
        total_dep_ids = set(dep_qs.values_list("id", flat=True).iterator())
        dep_without_bridge_count = len(
            {str(i) for i in total_dep_ids} - {str(i) for i in dep_ids_with_bridge}
        )

        status = STATUS_OK
        warnings: list[str] = []
        if liability_mismatch_count > 0:
            status = _worst(status, STATUS_WARNING)
            warnings.append(
                f"{liability_mismatch_count} CustomerAdvance record(s) are FULLY_APPLIED but have unapplied_amount > 0."
            )
        if dep_without_bridge_count > 0:
            status = _worst(status, STATUS_WARNING)
            warnings.append(
                f"{dep_without_bridge_count} deposit transaction(s) have no accounting bridge posting."
            )

        return {
            "status": status,
            "customer_advance": {
                "total_count": adv_agg["total_count"] or 0,
                "total_amount": _money(adv_agg["total_amount"]),
                "total_unapplied_amount": _money(adv_agg["total_unapplied"]),
                "open_unapplied_count": adv_unapplied_count,
                "liability_mismatch_count": liability_mismatch_count,
            },
            "security_deposit": {
                "collected_count": collected["count"] or 0,
                "collected_amount": _money(collected["amount"]),
                "refunded_count": refunded["count"] or 0,
                "refunded_amount": _money(refunded["amount"]),
                "deducted_count": deducted["count"] or 0,
                "deducted_amount": _money(deducted["amount"]),
                "deposit_transactions_without_bridge": dep_without_bridge_count,
            },
            "warnings": warnings,
        }
    except Exception as exc:
        return {
            **_deferred(f"Advance/deposit posture unavailable: {exc!s:.200}"),
            "section": "advance_deposit",
        }


# ─────────────────────────────────────────────────────────────────────────────
# Section F — Control close posture
# ─────────────────────────────────────────────────────────────────────────────

def _control_posture_internal(year: int, month: int) -> dict:
    sections: dict[str, Any] = {}
    overall = STATUS_OK

    # P2A: ControlException
    try:
        from subscriptions.models_control_foundation import ControlException, ExceptionSeverity, ExceptionStatus

        open_exc = ControlException.objects.filter(status=ExceptionStatus.OPEN)
        critical_count = open_exc.filter(
            severity__in=[ExceptionSeverity.CRITICAL, ExceptionSeverity.HIGH]
        ).count()
        warning_count = open_exc.filter(severity=ExceptionSeverity.WARNING).count()
        total_open = open_exc.count()

        exc_status = STATUS_OK
        if critical_count > 0:
            exc_status = STATUS_CRITICAL
        elif warning_count > 0:
            exc_status = STATUS_WARNING

        sections["control_exceptions"] = {
            "status": exc_status,
            "open_critical_high_count": critical_count,
            "open_warning_count": warning_count,
            "total_open_count": total_open,
        }
        overall = _worst(overall, exc_status)
    except Exception as exc:
        sections["control_exceptions"] = _deferred(f"ControlException check unavailable: {exc!s:.200}")

    # P2B: Cash counter sessions + daily close
    try:
        from subscriptions.models_cash_counter_session import (
            CashCounterSession,
            CashCounterSessionStatus,
            DailyCloseRun,
            DailyCloseStatus,
        )
        import calendar as _cal
        last_day = _cal.monthrange(year, month)[1]
        period_start = date(year, month, 1)
        period_end = date(year, month, last_day)

        open_sessions = CashCounterSession.objects.filter(
            status=CashCounterSessionStatus.OPEN
        ).count()
        variance_pending = CashCounterSession.objects.filter(
            status=CashCounterSessionStatus.VARIANCE_PENDING_APPROVAL
        ).count()

        latest_daily_close = (
            DailyCloseRun.objects.filter(run_date__gte=period_start, run_date__lte=period_end)
            .order_by("-run_date", "-created_at")
            .first()
        )
        latest_close_status = latest_daily_close.status if latest_daily_close else None
        latest_close_date = (
            latest_daily_close.run_date.isoformat() if latest_daily_close else None
        )

        # Count days in month with open sessions but no EXECUTED daily close
        active_dates = set(
            CashCounterSession.objects.filter(
                session_date__gte=period_start,
                session_date__lte=period_end,
            )
            .exclude(status=CashCounterSessionStatus.CANCELLED)
            .values_list("session_date", flat=True)
            .distinct()
        )
        executed_dates = set(
            DailyCloseRun.objects.filter(
                run_date__gte=period_start,
                run_date__lte=period_end,
                status=DailyCloseStatus.EXECUTED,
            )
            .values_list("run_date", flat=True)
            .distinct()
        )
        missing_close_dates = active_dates - executed_dates

        session_status = STATUS_OK
        if open_sessions > 0:
            session_status = _worst(session_status, STATUS_WARNING)
        if variance_pending > 0:
            session_status = _worst(session_status, STATUS_WARNING)
        if len(missing_close_dates) > 0:
            session_status = _worst(session_status, STATUS_WARNING)

        sections["cash_desk"] = {
            "status": session_status,
            "open_sessions_count": open_sessions,
            "variance_pending_count": variance_pending,
            "period_dates_missing_close": len(missing_close_dates),
            "latest_daily_close_date": latest_close_date,
            "latest_daily_close_status": latest_close_status,
        }
        overall = _worst(overall, session_status)
    except Exception as exc:
        sections["cash_desk"] = _deferred(f"Cash desk posture unavailable: {exc!s:.200}")

    # P2C: Month-end close
    try:
        from subscriptions.models_month_end_close import (
            MonthEndCloseRun,
            MonthEndCloseStatus,
            MonthEndCheckSeverity,
            MonthEndCloseCheckResult,
        )

        latest_run = (
            MonthEndCloseRun.objects.filter(period_year=year, period_month=month)
            .order_by("-run_at", "-id")
            .first()
        )
        if latest_run:
            blocking_checks = (
                MonthEndCloseCheckResult.objects.filter(
                    run=latest_run,
                    severity=MonthEndCheckSeverity.BLOCKING,
                    passed=False,
                ).count()
            )
            me_status = (
                STATUS_CRITICAL if latest_run.status == MonthEndCloseStatus.BLOCKED or blocking_checks > 0
                else STATUS_OK if latest_run.status == MonthEndCloseStatus.EXECUTED
                else STATUS_INFO
            )
            sections["month_end_close"] = {
                "status": me_status,
                "latest_run_status": latest_run.status,
                "latest_run_at": latest_run.run_at.isoformat(),
                "is_dry_run": latest_run.is_dry_run,
                "blocking_check_count": blocking_checks,
            }
        else:
            sections["month_end_close"] = {
                "status": STATUS_INFO,
                "message": f"No month-end close run recorded for {year}-{month:02d}.",
                "latest_run_status": None,
                "latest_run_at": None,
                "is_dry_run": None,
                "blocking_check_count": 0,
            }
        overall = _worst(overall, sections["month_end_close"]["status"])
    except Exception as exc:
        sections["month_end_close"] = _deferred(f"Month-end close posture unavailable: {exc!s:.200}")

    return {"status": overall, **sections}


def build_control_posture(as_of: date | None = None, period: dict | None = None) -> dict:
    _as_of, year, month, start, end = _resolve_period(
        as_of, (period or {}).get("year"), (period or {}).get("month")
    )
    return _control_posture_internal(year, month)


# ─────────────────────────────────────────────────────────────────────────────
# Section G — Inventory-finance posture
# ─────────────────────────────────────────────────────────────────────────────

def _inventory_finance_posture_internal(start: date, end: date) -> dict:
    """
    Diagnostic-only posture for inventory-finance alignment.
    Inventory valuation is deferred (no automated valuation service).
    Delivered-without-stock-ledger check uses existing DQ service logic.
    """
    try:
        from django.db.models import Count, Q, Exists, OuterRef
        from subscriptions.models import SubscriptionDelivery, DeliveryStatus
        from billing.models import DirectSale, DirectSaleStatus
        from inventory.models import StockLedger

        # Delivered subscriptions in period without any stock ledger entry
        delivered_ids = set(
            SubscriptionDelivery.objects.filter(
                status=DeliveryStatus.DELIVERED,
                created_at__date__gte=start,
                created_at__date__lte=end,
            ).values_list("subscription_id", flat=True)
        )
        subs_with_stock = set(
            StockLedger.objects.filter(
                reference_model="SubscriptionDelivery",
                movement_date__gte=start,
                movement_date__lte=end,
            ).values_list("reference_id", flat=True)
        )
        delivered_no_stock_count = sum(
            1 for sid in delivered_ids
            if str(sid) not in subs_with_stock
        )

        # Direct sales in INVOICED/DELIVERED state in period without stock ledger
        ds_invoiced_ids = set(
            DirectSale.objects.filter(
                sale_date__gte=start,
                sale_date__lte=end,
                status__in=[DirectSaleStatus.INVOICED, DirectSaleStatus.DELIVERED],
            ).values_list("id", flat=True)
        )
        ds_with_stock = set(
            StockLedger.objects.filter(
                reference_model="DirectSale",
                movement_date__gte=start,
                movement_date__lte=end,
            ).values_list("reference_id", flat=True)
        )
        ds_no_stock_count = sum(
            1 for did in ds_invoiced_ids
            if str(did) not in ds_with_stock
        )

        status = STATUS_OK
        warnings: list[str] = []
        if delivered_no_stock_count > 0:
            status = _worst(status, STATUS_WARNING)
            warnings.append(
                f"{delivered_no_stock_count} delivered subscription(s) in period have no stock ledger movement."
            )
        if ds_no_stock_count > 0:
            status = _worst(status, STATUS_WARNING)
            warnings.append(
                f"{ds_no_stock_count} invoiced/delivered direct sale(s) in period have no stock ledger movement."
            )

        return {
            "status": status,
            "delivered_without_stock_ledger_count": delivered_no_stock_count,
            "direct_sale_without_stock_ledger_count": ds_no_stock_count,
            "inventory_valuation": _deferred("Inventory valuation is not automated. Manual review required."),
            "warnings": warnings,
        }
    except Exception as exc:
        return {
            **_deferred(f"Inventory-finance posture unavailable: {exc!s:.200}"),
            "section": "inventory_finance",
        }


# ─────────────────────────────────────────────────────────────────────────────
# Action items
# ─────────────────────────────────────────────────────────────────────────────

def build_financial_action_items(as_of: date | None = None, period: dict | None = None) -> list[dict]:
    _as_of, year, month, start, end = _resolve_period(
        as_of, (period or {}).get("year"), (period or {}).get("month")
    )
    items: list[dict] = []

    # Collection: missing receipts
    try:
        from subscriptions.models import Payment
        missing = Payment.objects.filter(
            payment_date__gte=start, payment_date__lte=end,
            receipt_document__isnull=True,
        ).count()
        if missing > 0:
            items.append(_action_item(
                key="collection.payments_missing_receipt",
                severity=SEVERITY_WARNING,
                title="Payments Without Receipt Documents",
                description=f"{missing} payment(s) in period have no linked receipt document.",
                source_area="collection",
                count=missing,
                action_url="/admin/receipts",
            ))
    except Exception:
        pass

    # Bridge: draft postings
    try:
        from accounting.models import AccountingBridgePosting, JournalEntryStatus
        draft_count = AccountingBridgePosting.objects.filter(
            journal_entry__status=JournalEntryStatus.DRAFT
        ).count()
        if draft_count > 0:
            items.append(_action_item(
                key="bridge.draft_journal_entries",
                severity=SEVERITY_WARNING,
                title="Bridge Postings With Draft Journal Entries",
                description=f"{draft_count} bridge posting(s) have DRAFT journal entries that are not yet posted.",
                source_area="accounting_bridge",
                count=draft_count,
                action_url="/admin/accounting/bridge-reconciliation",
            ))
    except Exception:
        pass

    # Reconciliation: critical unresolved items
    try:
        from reconciliation.models import ReconciliationItem, ReconciliationItemStatus, ReconciliationSeverity
        critical = ReconciliationItem.objects.exclude(
            status__in=[
                ReconciliationItemStatus.RESOLVED,
                ReconciliationItemStatus.FALSE_POSITIVE,
                ReconciliationItemStatus.WAIVED_BY_APPROVAL,
                ReconciliationItemStatus.MATCHED,
            ]
        ).filter(severity=ReconciliationSeverity.CRITICAL).count()
        if critical > 0:
            items.append(_action_item(
                key="reconciliation.critical_unresolved",
                severity=SEVERITY_CRITICAL,
                title="Critical Unresolved Reconciliation Items",
                description=f"{critical} CRITICAL unresolved reconciliation item(s) require immediate attention.",
                source_area="reconciliation",
                count=critical,
            ))
    except Exception:
        pass

    # Control: open critical exceptions
    try:
        from subscriptions.models_control_foundation import ControlException, ExceptionSeverity, ExceptionStatus
        critical_exc = ControlException.objects.filter(
            status=ExceptionStatus.OPEN,
            severity__in=[ExceptionSeverity.CRITICAL, ExceptionSeverity.HIGH],
        ).count()
        if critical_exc > 0:
            items.append(_action_item(
                key="control.open_critical_exceptions",
                severity=SEVERITY_CRITICAL,
                title="Open Critical/High Control Exceptions",
                description=f"{critical_exc} open CRITICAL/HIGH control exception(s) must be resolved before close.",
                source_area="control_foundation",
                count=critical_exc,
                action_url="/admin/control/exceptions",
            ))
    except Exception:
        pass

    # Control: open cash sessions
    try:
        from subscriptions.models_cash_counter_session import CashCounterSession, CashCounterSessionStatus
        open_sess = CashCounterSession.objects.filter(status=CashCounterSessionStatus.OPEN).count()
        if open_sess > 0:
            items.append(_action_item(
                key="cash_desk.open_sessions",
                severity=SEVERITY_WARNING,
                title="Open Cash Counter Sessions",
                description=f"{open_sess} cash counter session(s) are still OPEN and must be closed before daily close.",
                source_area="cash_desk",
                count=open_sess,
                action_url="/admin/control/cash-desk",
            ))
    except Exception:
        pass

    # Month-end: blocking checks
    try:
        from subscriptions.models_month_end_close import (
            MonthEndCloseRun, MonthEndCloseCheckResult, MonthEndCheckSeverity
        )
        latest_run = (
            MonthEndCloseRun.objects.filter(period_year=year, period_month=month)
            .order_by("-run_at", "-id")
            .first()
        )
        if latest_run:
            blocking = MonthEndCloseCheckResult.objects.filter(
                run=latest_run,
                severity=MonthEndCheckSeverity.BLOCKING,
                passed=False,
            ).count()
            if blocking > 0:
                items.append(_action_item(
                    key="month_end.blocking_checks",
                    severity=SEVERITY_CRITICAL,
                    title="Month-End Close Has Blocking Checks",
                    description=f"{blocking} BLOCKING check(s) must pass before month-end can be executed.",
                    source_area="month_end_close",
                    count=blocking,
                    action_url="/admin/control/month-end-close",
                ))
    except Exception:
        pass

    # Overdue rent/lease demands
    try:
        from django.db.models import Count as _Count, Sum as _Sum
        from subscriptions.models import RentLeaseBillingDemand, RentLeaseDemandStatus
        overdue_agg = RentLeaseBillingDemand.objects.filter(
            status=RentLeaseDemandStatus.OVERDUE
        ).aggregate(count=_Count("id"), amount=_Sum("amount"))
        overdue_count = overdue_agg["count"] or 0
        if overdue_count > 0:
            items.append(_action_item(
                key="billing.overdue_demands",
                severity=SEVERITY_WARNING,
                title="Overdue Rent/Lease Demands",
                description=f"{overdue_count} rent/lease demand(s) are marked OVERDUE.",
                source_area="billing",
                count=overdue_count,
                amount=_money(overdue_agg["amount"]),
                action_url="/admin/rent-lease/demands",
            ))
    except Exception:
        pass

    # Customer advance liability mismatch
    try:
        from subscriptions.models import CustomerAdvance, CustomerAdvanceStatus
        mismatch = CustomerAdvance.objects.filter(
            status=CustomerAdvanceStatus.FULLY_APPLIED,
            unapplied_amount__gt=MONEY_ZERO,
        ).count()
        if mismatch > 0:
            items.append(_action_item(
                key="advance.liability_mismatch",
                severity=SEVERITY_WARNING,
                title="Customer Advance Liability Mismatch",
                description=f"{mismatch} CustomerAdvance record(s) are FULLY_APPLIED but have unapplied_amount > 0.",
                source_area="advance_deposit",
                count=mismatch,
            ))
    except Exception:
        pass

    # Billing invoices without receipts
    try:
        from billing.models import BillingInvoice, BillingDocumentStatus
        inv_without_receipt = BillingInvoice.objects.filter(
            invoice_date__gte=start, invoice_date__lte=end,
            receipts__isnull=True,
        ).exclude(
            status__in=[BillingDocumentStatus.CANCELLED, BillingDocumentStatus.VOID]
        ).count()
        if inv_without_receipt > 0:
            items.append(_action_item(
                key="billing.invoices_without_receipt",
                severity=SEVERITY_WARNING,
                title="Billing Invoices Without Receipts",
                description=f"{inv_without_receipt} billing invoice(s) in period have no linked receipt.",
                source_area="billing",
                count=inv_without_receipt,
            ))
    except Exception:
        pass

    # Sort: CRITICAL first, then WARNING, then INFO
    _rank = {SEVERITY_CRITICAL: 0, SEVERITY_WARNING: 1, SEVERITY_INFO: 2}
    items.sort(key=lambda a: _rank.get(a["severity"], 9))
    return items


# ─────────────────────────────────────────────────────────────────────────────
# Section H — Trial Balance posture (P4B)
# ─────────────────────────────────────────────────────────────────────────────

def _trial_balance_posture_internal(start: date, end: date) -> dict:
    """
    Delegate to P4B trial balance check service.  Returns a condensed summary
    suitable for inclusion in the P4A snapshot.  Never raises — wrapped
    defensively so a P4B failure cannot crash the full P4A snapshot.
    """
    try:
        from accounting.services.trial_balance_check_service import build_trial_balance_check
        check = build_trial_balance_check(
            as_of=end,
            period={"year": end.year, "month": end.month},
        )
        critical_count = check.get("critical_check_count", 0)
        is_balanced = check.get("is_balanced", False)
        status = check.get("status", STATUS_INFO)

        action_item: dict | None = None
        if not is_balanced:
            action_item = {
                "key": "trial_balance.imbalance",
                "severity": "CRITICAL",
                "title": "Trial Balance Imbalance",
                "description": (
                    f"Debit/credit totals do not match: "
                    f"debit={check.get('total_debit')}, credit={check.get('total_credit')}, "
                    f"difference={check.get('difference')}."
                ),
                "source_area": "trial_balance",
            }

        return {
            "status": status,
            "is_balanced": is_balanced,
            "total_debit": check.get("total_debit"),
            "total_credit": check.get("total_credit"),
            "difference": check.get("difference"),
            "critical_check_count": critical_count,
            "action_item": action_item,
        }
    except Exception as exc:
        return {**_deferred(f"Trial balance posture unavailable: {exc!s:.200}"), "section": "trial_balance"}


# ─────────────────────────────────────────────────────────────────────────────
# Main snapshot entry point
# ─────────────────────────────────────────────────────────────────────────────

def build_financial_intelligence_snapshot(
    as_of: date | None = None,
    period: dict | None = None,
) -> dict:
    """
    Build a complete read-only financial intelligence snapshot.

    All sub-checks are wrapped defensively so a single subsystem failure
    never crashes the full snapshot.
    """
    resolved_as_of, year, month, start, end = _resolve_period(
        as_of, (period or {}).get("year"), (period or {}).get("month")
    )

    collection = _collection_posture(start, end)
    billing = _billing_posture(start, end)
    bridge = _bridge_posture_internal(start, end)
    reconciliation = _reconciliation_posture_internal()
    advance_deposit = _advance_deposit_posture_internal(start, end)
    control = _control_posture_internal(year, month)
    inventory = _inventory_finance_posture_internal(start, end)

    trial_balance = _trial_balance_posture_internal(start, end)

    action_items = build_financial_action_items(
        as_of=resolved_as_of,
        period={"year": year, "month": month},
    )

    section_statuses = [
        collection.get("status", STATUS_INFO),
        billing.get("status", STATUS_INFO),
        bridge.get("status", STATUS_INFO),
        reconciliation.get("status", STATUS_INFO),
        advance_deposit.get("status", STATUS_INFO),
        control.get("status", STATUS_INFO),
        inventory.get("status", STATUS_INFO),
        trial_balance.get("status", STATUS_INFO),
    ]
    overall_status = STATUS_OK
    for s in section_statuses:
        overall_status = _worst(overall_status, s)

    return {
        "as_of": resolved_as_of.isoformat(),
        "period": {"year": year, "month": month},
        "overall_status": overall_status,
        "sections": {
            "collection": collection,
            "billing": billing,
            "bridge": bridge,
            "reconciliation": reconciliation,
            "advance_deposit": advance_deposit,
            "control": control,
            "inventory_finance": inventory,
            "trial_balance": trial_balance,
        },
        "action_items": action_items,
    }
