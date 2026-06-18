"""
P4E — Export-Ready Accounting Reports Service.

Read-only export layer.  No financial records are created or mutated.
No AccountingBridgePosting, JournalEntry, JournalLine, Payment, EMI,
StockLedger, BillingInvoice, ReceiptDocument, DirectSale, Commission,
Payout, Reconciliation, MoneyMovement, CustomerAdvance,
RentLeaseDepositTransaction, or RentLeaseBillingDemand rows are
created or modified by any function in this module.
"""
from __future__ import annotations

import calendar as _cal
import datetime as _dt
from datetime import date
from decimal import Decimal
from typing import Any

MONEY_ZERO = Decimal("0.00")
_DEFAULT_JOURNAL_LIMIT = 500
_MAX_JOURNAL_LIMIT = 2000
_DEFAULT_BRIDGE_LIMIT = 1000
_MAX_BRIDGE_LIMIT = 5000


def _money(value: Any) -> Decimal:
    return Decimal(str(value or 0)).quantize(MONEY_ZERO)


def _money_str(value: Any) -> str:
    return f"{_money(value)}"


def _utcnow() -> str:
    return _dt.datetime.utcnow().isoformat() + "Z"


def _resolve_period(
    year: int | None,
    month: int | None,
    as_of: date | None,
) -> tuple[date, int, int, date, date]:
    from django.utils import timezone

    if as_of is None:
        as_of = timezone.localdate()
    _year = int(year or as_of.year)
    _month = int(month or as_of.month)
    last_day = _cal.monthrange(_year, _month)[1]
    start = date(_year, _month, 1)
    end = date(_year, _month, last_day)
    return as_of, _year, _month, start, end


def _export_envelope(
    *,
    report_key: str,
    year: int,
    month: int,
    as_of: date,
    columns: list[str],
    rows: list[dict],
    totals: dict,
    warnings: list[str],
    metadata: dict | None = None,
) -> dict:
    return {
        "report_key": report_key,
        "period": {"year": year, "month": month},
        "as_of": as_of.isoformat(),
        "columns": columns,
        "rows": rows,
        "totals": totals,
        "warnings": warnings,
        "metadata": {
            "generated_at": _utcnow(),
            "read_only": True,
            **(metadata or {}),
        },
    }


# ─────────────────────────────────────────────────────────────────────────────
# Index
# ─────────────────────────────────────────────────────────────────────────────

def build_accounting_export_index(
    year: int | None = None,
    month: int | None = None,
    as_of: date | None = None,
) -> dict:
    """Return an index of all available P4E export reports."""
    as_of, _year, _month, start, end = _resolve_period(year, month, as_of)
    return {
        "report_key": "accounting_export_index",
        "period": {"year": _year, "month": _month},
        "as_of": as_of.isoformat(),
        "period_start": start.isoformat(),
        "period_end": end.isoformat(),
        "reports": [
            {
                "key": "trial_balance_export",
                "title": "Trial Balance Export",
                "description": "Posted journal account balances for the period. Source: P4B.",
                "endpoint": "admin/accounting/exports/trial-balance/",
                "formats": ["json", "csv"],
            },
            {
                "key": "journal_export",
                "title": "Journal Register Export",
                "description": "Posted journal entry lines. Drafts excluded by default; voided always excluded.",
                "endpoint": "admin/accounting/exports/journals/",
                "formats": ["json", "csv"],
            },
            {
                "key": "ledger_export",
                "title": "Account Ledger Summary Export",
                "description": "Period debit/credit/balance grouped by chart account. Line detail deferred.",
                "endpoint": "admin/accounting/exports/ledgers/",
                "formats": ["json", "csv"],
            },
            {
                "key": "receivables_export",
                "title": "Receivables Export",
                "description": "Outstanding posted invoice and rent/lease demand balances.",
                "endpoint": "admin/accounting/exports/receivables/",
                "formats": ["json", "csv"],
            },
            {
                "key": "liability_export",
                "title": "Liability Reconciliation Export",
                "description": "Customer advance and security deposit liability posture. Source: P4C.",
                "endpoint": "admin/accounting/exports/liabilities/",
                "formats": ["json", "csv"],
            },
            {
                "key": "bridge_audit_export",
                "title": "Bridge Audit Export",
                "description": "AccountingBridgePosting rows by purpose and posting status.",
                "endpoint": "admin/accounting/exports/bridge-audit/",
                "formats": ["json", "csv"],
            },
        ],
        "metadata": {
            "generated_at": _utcnow(),
            "read_only": True,
            "note": (
                "P4E Export-Ready Accounting Reports — read-only. "
                "No financial records are created or mutated. "
                "Direct Tally/Zoho sync is deferred."
            ),
        },
    }


# ─────────────────────────────────────────────────────────────────────────────
# A. Trial Balance Export
# ─────────────────────────────────────────────────────────────────────────────

def build_trial_balance_export(
    year: int | None = None,
    month: int | None = None,
    as_of: date | None = None,
) -> dict:
    """
    Export trial balance using the P4B trial balance check service.

    Opening balances are deferred (returned as 0 with an INFO marker).
    VOID and DRAFT entries are excluded. Read-only.
    """
    from accounting.services.trial_balance_check_service import build_trial_balance_check

    as_of, _year, _month, _start, _end = _resolve_period(year, month, as_of)
    payload = build_trial_balance_check(
        as_of=as_of,
        period={"year": _year, "month": _month},
    )

    columns = [
        "account_code",
        "account_name",
        "account_type",
        "is_active",
        "normal_balance",
        "period_debit",
        "period_credit",
        "net_balance",
        "row_status",
    ]

    rows = []
    for row in payload.get("rows", []):
        rows.append({
            "account_code": row.get("account_code", ""),
            "account_name": row.get("account_name", ""),
            "account_type": row.get("account_type", ""),
            "is_active": row.get("is_active", True),
            "normal_balance": row.get("normal_balance", ""),
            "period_debit": row.get("period_debit", "0.00"),
            "period_credit": row.get("period_credit", "0.00"),
            "net_balance": row.get("net_balance", "0.00"),
            "row_status": row.get("status", ""),
        })

    warnings: list[str] = []
    if not payload.get("is_balanced", False):
        warnings.append(
            f"Trial balance is UNBALANCED. Difference: {payload.get('difference', '0.00')}"
        )
    for check in payload.get("checks", []):
        if check.get("status") in ("WARNING", "CRITICAL"):
            msg = check.get("message", "")
            if msg:
                warnings.append(msg)

    return _export_envelope(
        report_key="trial_balance_export",
        year=_year,
        month=_month,
        as_of=as_of,
        columns=columns,
        rows=rows,
        totals={
            "total_debit": payload.get("total_debit", "0.00"),
            "total_credit": payload.get("total_credit", "0.00"),
            "difference": payload.get("difference", "0.00"),
            "is_balanced": payload.get("is_balanced", False),
            "overall_status": payload.get("status", ""),
        },
        warnings=warnings,
        metadata={
            "source": "P4B trial_balance_check_service",
            "period_start": payload.get("period_start"),
            "period_end": payload.get("period_end"),
            "opening_balance": "deferred",
        },
    )


# ─────────────────────────────────────────────────────────────────────────────
# B. Journal Export
# ─────────────────────────────────────────────────────────────────────────────

def build_journal_export(
    year: int | None = None,
    month: int | None = None,
    as_of: date | None = None,
    include_draft: bool = False,
    limit: int | None = None,
) -> dict:
    """
    Export journal entry lines for the period.

    Posted entries included by default. Draft entries included only when
    include_draft=True. Voided entries always excluded. Read-only.
    """
    from accounting.models import JournalEntryLine, JournalEntryStatus

    as_of, _year, _month, start, end = _resolve_period(year, month, as_of)
    effective_limit = min(int(limit or _DEFAULT_JOURNAL_LIMIT), _MAX_JOURNAL_LIMIT)

    statuses = [JournalEntryStatus.POSTED]
    if include_draft:
        statuses.append(JournalEntryStatus.DRAFT)

    qs = (
        JournalEntryLine.objects.select_related("journal_entry", "chart_account")
        .filter(
            journal_entry__status__in=statuses,
            journal_entry__entry_date__gte=start,
            journal_entry__entry_date__lte=end,
        )
        .order_by(
            "journal_entry__entry_date",
            "journal_entry__entry_no",
            "id",
        )
    )

    total_count = qs.count()
    truncated = total_count > effective_limit
    lines = list(qs[: effective_limit])

    columns = [
        "entry_no",
        "entry_date",
        "entry_type",
        "voucher_type",
        "source_type",
        "source_reference",
        "source_model",
        "source_id",
        "memo",
        "account_code",
        "account_name",
        "account_type",
        "debit_amount",
        "credit_amount",
        "description",
        "journal_status",
    ]

    rows = []
    total_debit = MONEY_ZERO
    total_credit = MONEY_ZERO

    for line in lines:
        je = line.journal_entry
        acc = line.chart_account
        dr = _money(line.debit_amount)
        cr = _money(line.credit_amount)
        total_debit += dr
        total_credit += cr
        rows.append({
            "entry_no": je.entry_no or "",
            "entry_date": je.entry_date.isoformat() if je.entry_date else "",
            "entry_type": je.entry_type or "",
            "voucher_type": je.voucher_type or "",
            "source_type": je.source_type or "",
            "source_reference": je.source_reference or "",
            "source_model": je.source_model or "",
            "source_id": je.source_id or "",
            "memo": je.memo or "",
            "account_code": acc.code if acc else "",
            "account_name": acc.name if acc else "",
            "account_type": acc.account_type if acc else "",
            "debit_amount": _money_str(dr),
            "credit_amount": _money_str(cr),
            "description": line.description or "",
            "journal_status": je.status or "",
        })

    warnings: list[str] = []
    if truncated:
        warnings.append(
            f"Result truncated to {effective_limit} of {total_count} lines. "
            "Use limit param (max 2000) or narrow the period."
        )
    if include_draft:
        warnings.append("Draft journal entries are included in this export.")

    return _export_envelope(
        report_key="journal_export",
        year=_year,
        month=_month,
        as_of=as_of,
        columns=columns,
        rows=rows,
        totals={
            "total_debit": _money_str(total_debit),
            "total_credit": _money_str(total_credit),
            "line_count": len(rows),
            "total_line_count": total_count,
            "truncated": truncated,
        },
        warnings=warnings,
        metadata={
            "include_draft": include_draft,
            "void_excluded": True,
            "limit": effective_limit,
        },
    )


# ─────────────────────────────────────────────────────────────────────────────
# C. Ledger Export
# ─────────────────────────────────────────────────────────────────────────────

def build_ledger_export(
    year: int | None = None,
    month: int | None = None,
    as_of: date | None = None,
) -> dict:
    """
    Export account-level ledger summary for the period.

    One row per chart account active in the period. Opening balance is
    deferred (0). Closing balance reflects period activity only.
    Line-level per-account detail is available via the account ledger
    endpoint and is deferred from this aggregate export. Read-only.
    """
    from accounting.services.reporting_service import build_trial_balance

    as_of, _year, _month, start, end = _resolve_period(year, month, as_of)
    tb = build_trial_balance(start_date=start, end_date=end)

    columns = [
        "account_code",
        "account_name",
        "account_type",
        "opening_balance",
        "period_debit",
        "period_credit",
        "closing_balance",
        "balance_side",
    ]

    rows = []
    total_debit = MONEY_ZERO
    total_credit = MONEY_ZERO

    for row in tb.get("rows", []):
        dr = _money(row.get("debit_total", 0))
        cr = _money(row.get("credit_total", 0))
        total_debit += dr
        total_credit += cr
        rows.append({
            "account_code": row.get("account_code", ""),
            "account_name": row.get("account_name", ""),
            "account_type": row.get("account_type", ""),
            "opening_balance": "0.00",
            "period_debit": _money_str(dr),
            "period_credit": _money_str(cr),
            "closing_balance": row.get("balance", "0.00"),
            "balance_side": row.get("balance_side", ""),
        })

    return _export_envelope(
        report_key="ledger_export",
        year=_year,
        month=_month,
        as_of=as_of,
        columns=columns,
        rows=rows,
        totals={
            "total_debit": _money_str(total_debit),
            "total_credit": _money_str(total_credit),
            "account_count": len(rows),
        },
        warnings=[
            "Opening balance is deferred (shown as 0). "
            "Closing balance reflects period activity only.",
        ],
        metadata={
            "source": "reporting_service.build_trial_balance",
            "line_level_detail": "deferred",
            "note": "Per-account line detail available via the account ledger endpoint.",
        },
    )


# ─────────────────────────────────────────────────────────────────────────────
# D. Receivables Export
# ─────────────────────────────────────────────────────────────────────────────

def build_receivables_export(
    year: int | None = None,
    month: int | None = None,
    as_of: date | None = None,
) -> dict:
    """
    Export outstanding receivables for the period.

    Includes posted billing invoices with an outstanding balance and
    rent/lease demands in pending/partial/overdue status. Customer
    phone, address, and KYC data are not included. Read-only.
    """
    as_of, _year, _month, start, end = _resolve_period(year, month, as_of)

    columns = [
        "source",
        "document_no",
        "date",
        "demand_type",
        "grand_total",
        "received_total",
        "outstanding",
        "status",
    ]

    rows: list[dict] = []
    warnings: list[str] = []
    total_invoice_outstanding = MONEY_ZERO
    total_rent_lease_outstanding = MONEY_ZERO

    # ── Invoice receivables ───────────────────────────────────────────────────
    try:
        from billing.models import BillingInvoice, BillingDocumentStatus

        inv_qs = (
            BillingInvoice.objects.filter(
                status=BillingDocumentStatus.POSTED,
                balance_total__gt=MONEY_ZERO,
                invoice_date__gte=start,
                invoice_date__lte=end,
            )
            .order_by("invoice_date", "id")
            .values(
                "document_no",
                "invoice_date",
                "grand_total",
                "received_total",
                "balance_total",
                "status",
                "source_type",
            )
        )
        for inv in inv_qs:
            bal = _money(inv["balance_total"])
            total_invoice_outstanding += bal
            rows.append({
                "source": "INVOICE",
                "document_no": inv["document_no"] or "",
                "date": inv["invoice_date"].isoformat() if inv["invoice_date"] else "",
                "demand_type": inv["source_type"] or "",
                "grand_total": _money_str(inv["grand_total"]),
                "received_total": _money_str(inv["received_total"]),
                "outstanding": _money_str(bal),
                "status": inv["status"] or "",
            })
    except Exception as exc:
        warnings.append(f"Invoice receivables unavailable: {exc!s:.200}")

    # ── Rent/lease demand receivables ─────────────────────────────────────────
    try:
        from subscriptions.models import RentLeaseBillingDemand, RentLeaseDemandStatus

        outstanding_statuses = [
            RentLeaseDemandStatus.PENDING,
            RentLeaseDemandStatus.PARTIAL,
            RentLeaseDemandStatus.OVERDUE,
        ]
        demand_qs = (
            RentLeaseBillingDemand.objects.filter(
                status__in=outstanding_statuses,
                due_date__gte=start,
                due_date__lte=end,
            )
            .order_by("due_date", "id")
            .values(
                "reference_key",
                "demand_type",
                "due_date",
                "amount",
                "collected_amount",
                "status",
            )
        )
        for dem in demand_qs:
            outstanding = _money(dem["amount"]) - _money(dem["collected_amount"])
            if outstanding < MONEY_ZERO:
                outstanding = MONEY_ZERO
            total_rent_lease_outstanding += outstanding
            rows.append({
                "source": "RENT_LEASE_DEMAND",
                "document_no": dem["reference_key"] or "",
                "date": dem["due_date"].isoformat() if dem["due_date"] else "",
                "demand_type": dem["demand_type"] or "",
                "grand_total": _money_str(dem["amount"]),
                "received_total": _money_str(dem["collected_amount"]),
                "outstanding": _money_str(outstanding),
                "status": dem["status"] or "",
            })
    except Exception as exc:
        warnings.append(f"Rent/lease demand receivables unavailable: {exc!s:.200}")

    return _export_envelope(
        report_key="receivables_export",
        year=_year,
        month=_month,
        as_of=as_of,
        columns=columns,
        rows=rows,
        totals={
            "invoice_outstanding": _money_str(total_invoice_outstanding),
            "rent_lease_outstanding": _money_str(total_rent_lease_outstanding),
            "total_outstanding": _money_str(
                total_invoice_outstanding + total_rent_lease_outstanding
            ),
            "row_count": len(rows),
        },
        warnings=warnings,
        metadata={
            "privacy_note": "Customer phone/address/KYC data not included.",
            "invoice_filter": "Posted invoices with balance_total > 0 dated within period.",
            "demand_filter": "Pending/partial/overdue rent-lease demands due within period.",
        },
    )


# ─────────────────────────────────────────────────────────────────────────────
# E. Liability Export
# ─────────────────────────────────────────────────────────────────────────────

def build_liability_export(
    year: int | None = None,
    month: int | None = None,
    as_of: date | None = None,
) -> dict:
    """
    Export liability posture using the P4C liability reconciliation service.

    Returns customer advance and security deposit metrics flattened into
    export rows. No bridge postings or GL records are created. Read-only.
    """
    from accounting.services.liability_reconciliation_service import (
        build_liability_reconciliation_snapshot,
    )

    as_of, _year, _month, _start, _end = _resolve_period(year, month, as_of)
    snapshot = build_liability_reconciliation_snapshot(
        as_of=as_of,
        period={"year": _year, "month": _month},
    )

    adv = snapshot.get("customer_advance", {})
    dep = snapshot.get("security_deposit", {})

    columns = [
        "liability_type",
        "metric",
        "value",
        "status",
        "notes",
    ]

    rows = [
        {
            "liability_type": "CUSTOMER_ADVANCE",
            "metric": "total_collected",
            "value": adv.get("total_advance_collected", "0.00"),
            "status": adv.get("status", ""),
            "notes": "",
        },
        {
            "liability_type": "CUSTOMER_ADVANCE",
            "metric": "total_applied",
            "value": adv.get("total_advance_applied", "0.00"),
            "status": adv.get("status", ""),
            "notes": "",
        },
        {
            "liability_type": "CUSTOMER_ADVANCE",
            "metric": "total_refunded",
            "value": adv.get("total_advance_refunded", "0.00"),
            "status": adv.get("status", ""),
            "notes": "",
        },
        {
            "liability_type": "CUSTOMER_ADVANCE",
            "metric": "expected_liability",
            "value": adv.get("expected_liability", "0.00"),
            "status": adv.get("status", ""),
            "notes": f"Bridge gap: {adv.get('bridge_gap_count', 0)}",
        },
        {
            "liability_type": "CUSTOMER_ADVANCE",
            "metric": "unapplied_balance",
            "value": adv.get("unapplied_balance", "0.00"),
            "status": adv.get("status", ""),
            "notes": f"Mismatch count: {adv.get('mismatch_count', 0)}",
        },
        {
            "liability_type": "SECURITY_DEPOSIT",
            "metric": "total_received",
            "value": dep.get("total_deposit_collected", "0.00"),
            "status": dep.get("status", ""),
            "notes": "",
        },
        {
            "liability_type": "SECURITY_DEPOSIT",
            "metric": "total_refunded",
            "value": dep.get("total_deposit_refunded", "0.00"),
            "status": dep.get("status", ""),
            "notes": "",
        },
        {
            "liability_type": "SECURITY_DEPOSIT",
            "metric": "total_deducted",
            "value": dep.get("total_deposit_deducted", "0.00"),
            "status": dep.get("status", ""),
            "notes": "",
        },
        {
            "liability_type": "SECURITY_DEPOSIT",
            "metric": "expected_liability",
            "value": dep.get("expected_deposit_liability", "0.00"),
            "status": dep.get("status", ""),
            "notes": f"Bridge gap: {dep.get('active_contract_deposit_gap_count', 0)}",
        },
    ]

    warnings: list[str] = []
    for check in snapshot.get("checks", []):
        if check.get("status") in ("WARNING", "CRITICAL"):
            msg = check.get("message", "")
            if msg:
                warnings.append(msg)

    return _export_envelope(
        report_key="liability_export",
        year=_year,
        month=_month,
        as_of=as_of,
        columns=columns,
        rows=rows,
        totals={
            "customer_advance_expected": adv.get("expected_liability", "0.00"),
            "security_deposit_expected": dep.get("expected_deposit_liability", "0.00"),
            "overall_status": snapshot.get("overall_status", ""),
        },
        warnings=warnings,
        metadata={
            "source": "P4C liability_reconciliation_service",
            "gl_comparison": "deferred",
            "note": "GL account balance comparison requires mapped chart accounts.",
        },
    )


# ─────────────────────────────────────────────────────────────────────────────
# F. Bridge Audit Export
# ─────────────────────────────────────────────────────────────────────────────

def build_bridge_audit_export(
    year: int | None = None,
    month: int | None = None,
    as_of: date | None = None,
    limit: int | None = None,
) -> dict:
    """
    Export AccountingBridgePosting rows for audit.

    Rows are filtered by source_event_date within the period. Rows with
    a null source_event_date fall back to created_at for period scoping.
    No bridge postings are created. Read-only.
    """
    from accounting.models import AccountingBridgePosting

    as_of, _year, _month, start, end = _resolve_period(year, month, as_of)
    effective_limit = min(int(limit or _DEFAULT_BRIDGE_LIMIT), _MAX_BRIDGE_LIMIT)

    dated_qs = (
        AccountingBridgePosting.objects.select_related("journal_entry")
        .filter(
            source_event_date__gte=start,
            source_event_date__lte=end,
        )
        .order_by("purpose", "source_event_date", "id")
    )
    fallback_qs = (
        AccountingBridgePosting.objects.select_related("journal_entry")
        .filter(
            source_event_date__isnull=True,
            created_at__date__gte=start,
            created_at__date__lte=end,
        )
        .order_by("purpose", "created_at", "id")
    )

    dated_count = dated_qs.count()
    fallback_count = fallback_qs.count()
    total_count = dated_count + fallback_count
    truncated = total_count > effective_limit

    dated_slice = list(dated_qs[: effective_limit])
    remaining = effective_limit - len(dated_slice)
    fallback_slice = list(fallback_qs[: remaining]) if remaining > 0 else []
    postings = dated_slice + fallback_slice

    columns = [
        "purpose",
        "source_model",
        "source_id",
        "source_reference",
        "source_document_no",
        "voucher_type",
        "source_type",
        "source_event_date",
        "journal_entry_no",
        "journal_entry_status",
        "journal_entry_date",
    ]

    rows = []
    purpose_summary: dict[str, int] = {}

    for bp in postings:
        je = bp.journal_entry
        purpose = bp.purpose or ""
        purpose_summary[purpose] = purpose_summary.get(purpose, 0) + 1
        rows.append({
            "purpose": purpose,
            "source_model": bp.source_model or "",
            "source_id": bp.source_id or "",
            "source_reference": bp.source_reference or "",
            "source_document_no": bp.source_document_no or "",
            "voucher_type": bp.voucher_type or "",
            "source_type": bp.source_type or "",
            "source_event_date": (
                bp.source_event_date.isoformat() if bp.source_event_date else ""
            ),
            "journal_entry_no": je.entry_no if je else "",
            "journal_entry_status": je.status if je else "",
            "journal_entry_date": (
                je.entry_date.isoformat() if je and je.entry_date else ""
            ),
        })

    warnings: list[str] = []
    if truncated:
        warnings.append(
            f"Result truncated to {effective_limit} of {total_count} rows. "
            "Use limit param (max 5000) or narrow the period."
        )

    return _export_envelope(
        report_key="bridge_audit_export",
        year=_year,
        month=_month,
        as_of=as_of,
        columns=columns,
        rows=rows,
        totals={
            "total_count": total_count,
            "exported_count": len(rows),
            "truncated": truncated,
            "by_purpose": purpose_summary,
        },
        warnings=warnings,
        metadata={
            "note": (
                "Rows with null source_event_date use created_at for period filtering. "
                "No bridge postings are created by this export."
            ),
        },
    )
