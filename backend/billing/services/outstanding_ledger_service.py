from __future__ import annotations

import csv
import io
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Any

from django.db.models import Prefetch
from django.utils import timezone

from core.services.operational_visibility import (
    direct_sale_active_q,
    invoice_active_q,
    subscription_collectible_q,
)
from billing.models import BillingDocumentStatus, BillingInvoice, DirectSale
from subscriptions.models import Emi, EmiStatus, FinancialLedger, LedgerEntryType, PlanType, q2

MONEY_ZERO = Decimal("0.00")

OP_ADVANCE_EMI = "advance_emi"
OP_RENT = "rent"
OP_LEASE = "lease"
OP_DIRECT_SALE = "direct_sale"
OP_BILLING_INVOICE = "billing_invoice"
OP_ALL = "all"

STATE_ALL = "all"
STATE_OVERDUE = "overdue"
STATE_DUE_TODAY = "due_today"
STATE_UPCOMING = "upcoming"
STATE_NOT_DUE = "not_due"

AGE_ALL = "all"
AGE_CURRENT = "current"
AGE_1_7 = "1_7"
AGE_8_15 = "8_15"
AGE_16_30 = "16_30"
AGE_31_60 = "31_60"
AGE_60_PLUS = "60_plus"

ALLOWED_ORDERING = {
    "due_date",
    "-due_date",
    "outstanding_amount",
    "-outstanding_amount",
    "overdue_days",
    "-overdue_days",
    "customer_name",
    "-customer_name",
    "operation_type",
    "-operation_type",
}


@dataclass(frozen=True)
class OutstandingLedgerFilters:
    state: str = STATE_ALL
    operation: str = OP_ALL
    q: str = ""
    customer: str = ""
    from_date: date | None = None
    to_date: date | None = None
    age_bucket: str = AGE_ALL
    min_amount: Decimal | None = None
    max_amount: Decimal | None = None
    ordering: str = "due_date"
    page: int = 1
    page_size: int = 20


def _money(value: Any) -> Decimal:
    return q2(Decimal(str(value or MONEY_ZERO)))


def _money_string(value: Decimal) -> str:
    return f"{_money(value):.2f}"


def _overdue_days(*, due_date: date | None, today: date) -> int:
    if not due_date:
        return 0
    return max((today - due_date).days, 0)


def _age_bucket_from_days(days: int) -> str:
    if days <= 0:
        return AGE_CURRENT
    if days <= 7:
        return AGE_1_7
    if days <= 15:
        return AGE_8_15
    if days <= 30:
        return AGE_16_30
    if days <= 60:
        return AGE_31_60
    return AGE_60_PLUS


def _state_for_due_date(*, due_date: date | None, today: date) -> str:
    if not due_date:
        return STATE_NOT_DUE
    if due_date < today:
        return STATE_OVERDUE
    if due_date == today:
        return STATE_DUE_TODAY
    return STATE_UPCOMING


def _safe_int(value: str | None, default: int, *, min_value: int, max_value: int) -> int:
    try:
        parsed = int(value or default)
    except (TypeError, ValueError):
        parsed = default
    return max(min_value, min(max_value, parsed))


def parse_outstanding_filters(params) -> OutstandingLedgerFilters:
    state = (params.get("state") or STATE_ALL).strip().lower()
    if state not in {STATE_ALL, STATE_OVERDUE, STATE_DUE_TODAY, STATE_UPCOMING, STATE_NOT_DUE}:
        state = STATE_ALL

    operation = (params.get("operation") or OP_ALL).strip().lower()
    if operation not in {OP_ALL, OP_ADVANCE_EMI, OP_RENT, OP_LEASE, OP_DIRECT_SALE, OP_BILLING_INVOICE}:
        operation = OP_ALL

    age_bucket = (params.get("age_bucket") or AGE_ALL).strip().lower()
    if age_bucket not in {AGE_ALL, AGE_CURRENT, AGE_1_7, AGE_8_15, AGE_16_30, AGE_31_60, AGE_60_PLUS}:
        age_bucket = AGE_ALL

    ordering = (params.get("ordering") or "due_date").strip()
    if ordering not in ALLOWED_ORDERING:
        ordering = "due_date"

    from_date = None
    to_date = None
    try:
        from_date_raw = (params.get("from_date") or "").strip()
        if from_date_raw:
            from_date = date.fromisoformat(from_date_raw)
    except ValueError:
        from_date = None
    try:
        to_date_raw = (params.get("to_date") or "").strip()
        if to_date_raw:
            to_date = date.fromisoformat(to_date_raw)
    except ValueError:
        to_date = None

    min_amount = None
    max_amount = None
    try:
        min_amount_raw = (params.get("min_amount") or "").strip()
        if min_amount_raw:
            min_amount = _money(min_amount_raw)
    except Exception:
        min_amount = None
    try:
        max_amount_raw = (params.get("max_amount") or "").strip()
        if max_amount_raw:
            max_amount = _money(max_amount_raw)
    except Exception:
        max_amount = None

    return OutstandingLedgerFilters(
        state=state,
        operation=operation,
        q=(params.get("q") or "").strip(),
        customer=(params.get("customer") or "").strip(),
        from_date=from_date,
        to_date=to_date,
        age_bucket=age_bucket,
        min_amount=min_amount,
        max_amount=max_amount,
        ordering=ordering,
        page=_safe_int(params.get("page"), 1, min_value=1, max_value=100_000),
        page_size=_safe_int(params.get("page_size"), 20, min_value=1, max_value=200),
    )


def _emi_net_paid_from_prefetch(emi: Emi) -> Decimal:
    """Compute net paid from prefetched ledger_entries — avoids per-EMI DB queries."""
    paid = MONEY_ZERO
    reversed_ = MONEY_ZERO
    for entry in emi.ledger_entries.all():
        if entry.entry_type == LedgerEntryType.EMI_PAYMENT:
            paid += Decimal(str(entry.amount or MONEY_ZERO))
        elif entry.entry_type == LedgerEntryType.PAYMENT_REVERSAL:
            reversed_ += Decimal(str(entry.amount or MONEY_ZERO))
    return q2(max(q2(paid) - q2(reversed_), MONEY_ZERO))


def _collect_subscription_rows(*, today: date) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    emis = (
        Emi.objects.select_related(
            "subscription",
            "subscription__customer",
            "subscription__product",
            "subscription__batch",
            "subscription__lucky_id",
        )
        .prefetch_related(
            Prefetch(
                "ledger_entries",
                queryset=FinancialLedger.objects.only("emi_id", "entry_type", "amount"),
            )
        )
        .filter(status=EmiStatus.PENDING)
        .filter(subscription_collectible_q("subscription__"))
        .order_by("due_date", "id")
    )
    for emi in emis:
        paid_amount = _emi_net_paid_from_prefetch(emi)
        outstanding = q2(max(q2(emi.amount) - paid_amount, MONEY_ZERO))
        if outstanding <= MONEY_ZERO:
            continue
        sub = emi.subscription
        customer = sub.customer
        due_date = emi.due_date
        overdue_days = _overdue_days(due_date=due_date, today=today)
        op = OP_ADVANCE_EMI
        if sub.plan_type == PlanType.RENT:
            op = OP_RENT
        elif sub.plan_type == PlanType.LEASE:
            op = OP_LEASE
        waived_amount = _money(emi.amount) - paid_amount - outstanding
        if waived_amount < MONEY_ZERO:
            waived_amount = MONEY_ZERO
        rows.append(
            {
                "id": f"EMI-{emi.id}",
                "operation_type": op,
                "source_type": "EMI",
                "source_id": emi.id,
                "customer_id": customer.id if customer else None,
                "customer_name": customer.name if customer else "",
                "customer_phone": customer.phone if customer else "",
                "contract_reference": sub.contract_reference or sub.subscription_number or f"SUB-{sub.id}",
                "document_no": "",
                "product_summary": f"{sub.product.product_code} - {sub.product.name}",
                "batch_code": getattr(sub.batch, "batch_code", None),
                "lucky_number": (
                    getattr(sub.lucky_id, "display_number", None)
                    or (str(sub.lucky_id.lucky_number) if sub.lucky_id_id else None)
                ),
                "due_date": due_date.isoformat() if due_date else None,
                "original_amount": _money_string(_money(emi.amount)),
                "paid_amount": _money_string(paid_amount),
                "waived_amount": _money_string(waived_amount),
                "outstanding_amount": _money_string(outstanding),
                "overdue_days": overdue_days,
                "age_bucket": _age_bucket_from_days(overdue_days),
                "status": "OVERDUE" if overdue_days > 0 else "DUE",
                "collection_allowed": True,
                "detail_url": f"/admin/subscriptions/{sub.id}",
                "customer_url": f"/admin/customers/{customer.id}" if customer else "",
                "payment_url": f"/admin/finance/collect?workflow=advance-emi&subscription={sub.id}&emi={emi.id}",
                "risk_flags": ["OVERDUE_30_PLUS"] if overdue_days >= 30 else [],
                "_due_date_obj": due_date,
                "_operation_weight": 1 if op == OP_ADVANCE_EMI else 2 if op == OP_RENT else 3,
                "_outstanding_decimal": outstanding,
                "_state": _state_for_due_date(due_date=due_date, today=today),
            }
        )
    return rows


def _collect_direct_sale_rows(*, today: date) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    sales = (
        DirectSale.objects.select_related("customer")
        .prefetch_related(Prefetch("lines"), Prefetch("billing_invoices"))
        .filter(direct_sale_active_q())
        .filter(billing_invoices__status=BillingDocumentStatus.POSTED)
        .distinct()
        .filter(balance_total__gt=MONEY_ZERO)
        .order_by("sale_date", "id")
    )
    for sale in sales:
        outstanding = _money(sale.balance_total)
        if outstanding <= MONEY_ZERO:
            continue
        paid_amount = _money(sale.received_total)
        due_date = sale.sale_date
        overdue_days = _overdue_days(due_date=due_date, today=today)
        customer = sale.customer
        latest_invoice = sale.billing_invoices.order_by("-id").first()
        lines = list(sale.lines.all()[:3])
        line_text = ", ".join([(line.description or "").strip() for line in lines if (line.description or "").strip()])
        rows.append(
            {
                "id": f"DIRECT-SALE-{sale.id}",
                "operation_type": OP_DIRECT_SALE,
                "source_type": "DIRECT_SALE",
                "source_id": sale.id,
                "customer_id": customer.id if customer else None,
                "customer_name": (customer.name if customer else sale.customer_name_snapshot) or "",
                "customer_phone": (customer.phone if customer else sale.customer_phone_snapshot) or "",
                "contract_reference": sale.sale_no or f"SALE-{sale.id}",
                "document_no": latest_invoice.document_no if latest_invoice else "",
                "product_summary": line_text or (sale.sale_no or f"Direct Sale {sale.id}"),
                "batch_code": None,
                "lucky_number": None,
                "due_date": due_date.isoformat() if due_date else None,
                "original_amount": _money_string(_money(sale.grand_total)),
                "paid_amount": _money_string(paid_amount),
                "waived_amount": _money_string(MONEY_ZERO),
                "outstanding_amount": _money_string(outstanding),
                "overdue_days": overdue_days,
                "age_bucket": _age_bucket_from_days(overdue_days),
                "status": "OVERDUE" if overdue_days > 0 else "DUE",
                "collection_allowed": True,
                "detail_url": f"/admin/billing/direct-sales/{sale.id}",
                "customer_url": f"/admin/customers/{customer.id}" if customer else "",
                "payment_url": f"/admin/finance/collect?workflow=direct-sale&direct_sale_id={sale.id}",
                "risk_flags": ["OVERDUE_30_PLUS"] if overdue_days >= 30 else [],
                "_due_date_obj": due_date,
                "_operation_weight": 4,
                "_outstanding_decimal": outstanding,
                "_state": _state_for_due_date(due_date=due_date, today=today),
            }
        )
    return rows


def _collect_standalone_invoice_rows(*, today: date) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    invoices = (
        BillingInvoice.objects.select_related("customer", "subscription", "direct_sale")
        .filter(balance_total__gt=MONEY_ZERO)
        .filter(invoice_active_q())
        .filter(subscription__isnull=True, direct_sale__isnull=True)
        .order_by("invoice_date", "id")
    )
    for inv in invoices:
        outstanding = _money(inv.balance_total)
        if outstanding <= MONEY_ZERO:
            continue
        due_date = inv.invoice_date
        overdue_days = _overdue_days(due_date=due_date, today=today)
        customer = inv.customer
        rows.append(
            {
                "id": f"INVOICE-{inv.id}",
                "operation_type": OP_BILLING_INVOICE,
                "source_type": "BILLING_INVOICE",
                "source_id": inv.id,
                "customer_id": customer.id if customer else None,
                "customer_name": (customer.name if customer else inv.customer_name_snapshot) or "",
                "customer_phone": (customer.phone if customer else inv.customer_phone_snapshot) or "",
                "contract_reference": inv.source_reference or "",
                "document_no": inv.document_no or f"INV-{inv.id}",
                "product_summary": inv.notes or "Standalone billing invoice",
                "batch_code": None,
                "lucky_number": None,
                "due_date": due_date.isoformat() if due_date else None,
                "original_amount": _money_string(_money(inv.grand_total)),
                "paid_amount": _money_string(_money(inv.received_total)),
                "waived_amount": _money_string(MONEY_ZERO),
                "outstanding_amount": _money_string(outstanding),
                "overdue_days": overdue_days,
                "age_bucket": _age_bucket_from_days(overdue_days),
                "status": "OVERDUE" if overdue_days > 0 else "DUE",
                "collection_allowed": False,
                "detail_url": f"/admin/billing/invoices/{inv.id}",
                "customer_url": f"/admin/customers/{customer.id}" if customer else "",
                "payment_url": "",
                "risk_flags": ["STANDALONE_INVOICE", "OVERDUE_30_PLUS"] if overdue_days >= 30 else ["STANDALONE_INVOICE"],
                "_due_date_obj": due_date,
                "_operation_weight": 5,
                "_outstanding_decimal": outstanding,
                "_state": _state_for_due_date(due_date=due_date, today=today),
            }
        )
    return rows


def _matches_text(row: dict[str, Any], query: str) -> bool:
    if not query:
        return True
    hay = " ".join(
        [
            str(row.get("customer_name") or ""),
            str(row.get("customer_phone") or ""),
            str(row.get("contract_reference") or ""),
            str(row.get("document_no") or ""),
            str(row.get("product_summary") or ""),
            str(row.get("source_id") or ""),
        ]
    ).lower()
    return query.lower() in hay


def _sort_rows(rows: list[dict[str, Any]], ordering: str) -> list[dict[str, Any]]:
    reverse = ordering.startswith("-")
    key = ordering[1:] if reverse else ordering

    def value(row: dict[str, Any]):
        if key == "due_date":
            return row.get("_due_date_obj") or date.max
        if key == "outstanding_amount":
            return row.get("_outstanding_decimal") or MONEY_ZERO
        if key == "overdue_days":
            return int(row.get("overdue_days") or 0)
        if key == "customer_name":
            return str(row.get("customer_name") or "").lower()
        if key == "operation_type":
            return int(row.get("_operation_weight") or 999)
        return row.get("_due_date_obj") or date.max

    return sorted(rows, key=value, reverse=reverse)


def _apply_filters(rows: list[dict[str, Any]], filters: OutstandingLedgerFilters) -> list[dict[str, Any]]:
    filtered: list[dict[str, Any]] = []
    for row in rows:
        if filters.operation != OP_ALL and row["operation_type"] != filters.operation:
            continue
        state = str(row.get("_state") or STATE_NOT_DUE)
        if filters.state != STATE_ALL and state != filters.state:
            continue
        if not _matches_text(row, filters.q):
            continue
        if filters.customer:
            c = filters.customer.lower()
            if c not in str(row.get("customer_name") or "").lower() and c not in str(row.get("customer_id") or ""):
                continue
        due_obj = row.get("_due_date_obj")
        if filters.from_date and due_obj and due_obj < filters.from_date:
            continue
        if filters.to_date and due_obj and due_obj > filters.to_date:
            continue
        out_dec = _money(row.get("outstanding_amount"))
        if filters.min_amount is not None and out_dec < filters.min_amount:
            continue
        if filters.max_amount is not None and out_dec > filters.max_amount:
            continue
        if filters.age_bucket != AGE_ALL and row.get("age_bucket") != filters.age_bucket:
            continue
        filtered.append(row)
    return _sort_rows(filtered, filters.ordering)


def _summary(rows: list[dict[str, Any]], *, today: date) -> dict[str, Any]:
    total = MONEY_ZERO
    overdue_amount = MONEY_ZERO
    due_today = MONEY_ZERO
    upcoming = MONEY_ZERO
    advance = MONEY_ZERO
    rent = MONEY_ZERO
    lease = MONEY_ZERO
    direct_sale = MONEY_ZERO
    invoice = MONEY_ZERO
    overdue_count = 0
    serious_30_plus_count = 0
    for row in rows:
        out = _money(row.get("outstanding_amount"))
        total += out
        state = row.get("_state")
        if state == STATE_OVERDUE:
            overdue_amount += out
            overdue_count += 1
        elif state == STATE_DUE_TODAY:
            due_today += out
        elif state == STATE_UPCOMING:
            upcoming += out

        op = row.get("operation_type")
        if op == OP_ADVANCE_EMI:
            advance += out
        elif op == OP_RENT:
            rent += out
        elif op == OP_LEASE:
            lease += out
        elif op == OP_DIRECT_SALE:
            direct_sale += out
        elif op == OP_BILLING_INVOICE:
            invoice += out

        if int(row.get("overdue_days") or 0) >= 30:
            serious_30_plus_count += 1
    return {
        "total_outstanding_amount": _money_string(total),
        "overdue_amount": _money_string(overdue_amount),
        "due_today_amount": _money_string(due_today),
        "upcoming_amount": _money_string(upcoming),
        "advance_emi_outstanding": _money_string(advance),
        "rent_outstanding": _money_string(rent),
        "lease_outstanding": _money_string(lease),
        "direct_sale_outstanding": _money_string(direct_sale),
        "billing_invoice_outstanding": _money_string(invoice),
        "overdue_count": overdue_count,
        "serious_30_plus_count": serious_30_plus_count,
    }


def build_outstanding_ledger(*, filters: OutstandingLedgerFilters) -> dict[str, Any]:
    today = timezone.localdate()
    rows: list[dict[str, Any]] = []
    rows.extend(_collect_subscription_rows(today=today))
    rows.extend(_collect_direct_sale_rows(today=today))
    rows.extend(_collect_standalone_invoice_rows(today=today))

    filtered = _apply_filters(rows, filters)
    total_count = len(filtered)
    start = (filters.page - 1) * filters.page_size
    end = start + filters.page_size
    page_rows = filtered[start:end]

    serializable_rows = []
    for row in page_rows:
        clean = {k: v for k, v in row.items() if not k.startswith("_")}
        serializable_rows.append(clean)

    return {
        "count": total_count,
        "page": filters.page,
        "page_size": filters.page_size,
        "results": serializable_rows,
        "summary": _summary(filtered, today=today),
    }


def build_outstanding_csv(*, filters: OutstandingLedgerFilters) -> str:
    payload = build_outstanding_ledger(filters=OutstandingLedgerFilters(**{**filters.__dict__, "page": 1, "page_size": 100000}))
    output = io.StringIO()
    writer = csv.writer(output)
    columns = [
        "id",
        "operation_type",
        "source_type",
        "source_id",
        "customer_id",
        "customer_name",
        "customer_phone",
        "contract_reference",
        "document_no",
        "product_summary",
        "batch_code",
        "lucky_number",
        "due_date",
        "original_amount",
        "paid_amount",
        "waived_amount",
        "outstanding_amount",
        "overdue_days",
        "age_bucket",
        "status",
        "collection_allowed",
        "detail_url",
        "customer_url",
        "payment_url",
        "risk_flags",
    ]
    writer.writerow(columns)
    for row in payload["results"]:
        writer.writerow([row.get(col) if col != "risk_flags" else ",".join(row.get("risk_flags") or []) for col in columns])
    return output.getvalue()
