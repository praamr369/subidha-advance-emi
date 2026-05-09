from __future__ import annotations

from datetime import date
from decimal import Decimal

from django.db.models import Count, Q, Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone

from subscriptions.models import (
    Commission,
    CommissionPayoutBatch,
    CommissionStatus,
    Customer,
    Emi,
    EmiStatus,
    MONEY_ZERO,
    Payment,
    PlanType,
    PublicLead,
    PublicLeadIntent,
    PublicLeadStatus,
    Subscription,
    SubscriptionDocument,
    SubscriptionDocumentType,
    SubscriptionStatus,
)
from subscriptions.services.dashboard_canonical_financial_summary_service import (
    DashboardWindowParams,
    get_dashboard_summary,
)
from subscriptions.services.dashboard_scopes import AdminScope
from subscriptions.services.delivery_service import (
    build_delivery_report_summary,
    get_delivery_queryset,
)
from subscriptions.services.subscription_financial_service import (
    build_reconciliation_attention_payload,
    get_subscription_detail_queryset,
)
from core.services.operational_visibility import invoice_active_q, receipt_active_q


MAX_TREND_POINTS = 120
DECIMAL_ZERO = Decimal("0.00")


def _decimal(value: object) -> Decimal:
    return Decimal(str(value or MONEY_ZERO)).quantize(Decimal("0.01"))


def _money(value: object) -> str:
    return f"{_decimal(value):.2f}"


def _to_iso(day: object) -> str | None:
    if isinstance(day, date):
        return day.isoformat()
    return None


def _trim_trend_points(points: list[dict[str, object]]) -> list[dict[str, object]]:
    if len(points) <= MAX_TREND_POINTS:
        return points
    return points[-MAX_TREND_POINTS:]


def _apply_date_window_to_queryset(queryset, *, field_name: str, window_params: DashboardWindowParams):
    if window_params.start_date and window_params.end_date:
        return queryset.filter(
            **{f"{field_name}__range": (window_params.start_date, window_params.end_date)}
        )
    if window_params.as_of:
        return queryset.filter(**{f"{field_name}__lte": window_params.as_of})
    if window_params.end_date:
        return queryset.filter(**{f"{field_name}__lte": window_params.end_date})
    return queryset


def _apply_activity_window(queryset, window_params: DashboardWindowParams):
    if not window_params.has_surface_filter:
        return queryset

    if window_params.start_date and window_params.end_date:
        return queryset.filter(
            Q(created_at__date__range=(window_params.start_date, window_params.end_date))
            | Q(start_date__range=(window_params.start_date, window_params.end_date))
            | Q(emis__due_date__range=(window_params.start_date, window_params.end_date))
            | Q(payments__payment_date__range=(window_params.start_date, window_params.end_date))
        ).distinct()

    reference_date = window_params.reference_date
    return queryset.filter(
        Q(created_at__date__lte=reference_date)
        | Q(start_date__lte=reference_date)
        | Q(emis__due_date__lte=reference_date)
        | Q(payments__payment_date__lte=reference_date)
    ).distinct()


def _build_collections_trend(window_params: DashboardWindowParams) -> dict[str, object]:
    payments_queryset = _apply_date_window_to_queryset(
        Payment.objects.all(),
        field_name="payment_date",
        window_params=window_params,
    )
    reversed_filter = Q(allocation_metadata__reversal__is_reversed=True)

    grouped_rows = (
        payments_queryset.values("payment_date")
        .annotate(
            count=Count("id"),
            gross_amount=Coalesce(Sum("amount"), Value(DECIMAL_ZERO)),
            reversed_count=Count("id", filter=reversed_filter),
            reversed_amount=Coalesce(
                Sum("amount", filter=reversed_filter),
                Value(DECIMAL_ZERO),
            ),
        )
        .order_by("payment_date")
    )

    points: list[dict[str, object]] = []
    for row in grouped_rows:
        gross_amount = _decimal(row["gross_amount"])
        reversed_amount = _decimal(row["reversed_amount"])
        net_amount = gross_amount - reversed_amount
        count = int(row["count"] or 0)
        reversed_count = int(row["reversed_count"] or 0)

        points.append(
            {
                "date": _to_iso(row["payment_date"]),
                "count": count,
                "active_count": max(count - reversed_count, 0),
                "reversed_count": reversed_count,
                "gross_amount": _money(gross_amount),
                "reversed_amount": _money(reversed_amount),
                "net_amount": _money(net_amount),
            }
        )

    aggregate_row = payments_queryset.aggregate(
        count=Count("id"),
        gross_amount=Coalesce(Sum("amount"), Value(DECIMAL_ZERO)),
        reversed_count=Count("id", filter=reversed_filter),
        reversed_amount=Coalesce(
            Sum("amount", filter=reversed_filter),
            Value(DECIMAL_ZERO),
        ),
    )
    gross_total = _decimal(aggregate_row["gross_amount"])
    reversed_total = _decimal(aggregate_row["reversed_amount"])
    net_total = gross_total - reversed_total
    total_count = int(aggregate_row["count"] or 0)
    reversed_count = int(aggregate_row["reversed_count"] or 0)

    return {
        "summary": {
            "count": total_count,
            "active_count": max(total_count - reversed_count, 0),
            "reversed_count": reversed_count,
            "gross_amount": _money(gross_total),
            "reversed_amount": _money(reversed_total),
            "net_amount": _money(net_total),
        },
        "points": _trim_trend_points(points),
    }


def _build_payment_method_mix(window_params: DashboardWindowParams) -> dict[str, object]:
    try:
        from billing.models import ReceiptDocument
    except Exception:
        return {
            "rows": [],
            "summary": {
                "total_net_amount": "0.00",
            },
        }

    receipts_queryset = _apply_date_window_to_queryset(
        ReceiptDocument.objects.select_related("payment"),
        field_name="receipt_date",
        window_params=window_params,
    ).filter(receipt_active_q())
    reversed_filter = Q(payment__allocation_metadata__reversal__is_reversed=True)
    grouped_rows = (
        receipts_queryset.values("payment__method")
        .annotate(
            count=Count("id"),
            gross_amount=Coalesce(Sum("amount"), Value(DECIMAL_ZERO)),
            reversed_count=Count("id", filter=reversed_filter),
            reversed_amount=Coalesce(
                Sum("amount", filter=reversed_filter),
                Value(DECIMAL_ZERO),
            ),
        )
        .order_by("payment__method")
    )

    bucket_template: dict[str, dict[str, object]] = {
        "CASH": {
            "method": "CASH",
            "count": 0,
            "active_count": 0,
            "reversed_count": 0,
            "gross_amount": "0.00",
            "reversed_amount": "0.00",
            "net_amount": "0.00",
        },
        "UPI": {
            "method": "UPI",
            "count": 0,
            "active_count": 0,
            "reversed_count": 0,
            "gross_amount": "0.00",
            "reversed_amount": "0.00",
            "net_amount": "0.00",
        },
        "BANK": {
            "method": "BANK",
            "count": 0,
            "active_count": 0,
            "reversed_count": 0,
            "gross_amount": "0.00",
            "reversed_amount": "0.00",
            "net_amount": "0.00",
        },
        "OTHER": {
            "method": "OTHER",
            "count": 0,
            "active_count": 0,
            "reversed_count": 0,
            "gross_amount": "0.00",
            "reversed_amount": "0.00",
            "net_amount": "0.00",
        },
    }

    for row in grouped_rows:
        method = str(row.get("payment__method") or "").strip().upper()
        bucket_key = method if method in {"CASH", "UPI", "BANK"} else "OTHER"
        gross_amount = _decimal(row.get("gross_amount"))
        reversed_amount = _decimal(row.get("reversed_amount"))
        count = int(row.get("count") or 0)
        reversed_count = int(row.get("reversed_count") or 0)

        current = bucket_template[bucket_key]
        current["count"] = int(current["count"]) + count
        current["reversed_count"] = int(current["reversed_count"]) + reversed_count
        current["active_count"] = max(
            int(current["count"]) - int(current["reversed_count"]),
            0,
        )

        merged_gross = _decimal(current["gross_amount"]) + gross_amount
        merged_reversed = _decimal(current["reversed_amount"]) + reversed_amount
        merged_net = merged_gross - merged_reversed

        current["gross_amount"] = _money(merged_gross)
        current["reversed_amount"] = _money(merged_reversed)
        current["net_amount"] = _money(merged_net)

    rows = [bucket_template["CASH"], bucket_template["UPI"], bucket_template["BANK"], bucket_template["OTHER"]]
    total_net = sum((_decimal(row["net_amount"]) for row in rows), DECIMAL_ZERO)
    return {
        "rows": rows,
        "summary": {
            "total_net_amount": _money(total_net),
        },
    }


def _build_receivables_pressure(window_params: DashboardWindowParams) -> dict[str, object]:
    reference_date = window_params.reference_date
    bucket_meta = [
        ("NOT_DUE", "Not Due"),
        ("OVERDUE_1_30", "Overdue 1-30 days"),
        ("OVERDUE_31_60", "Overdue 31-60 days"),
        ("OVERDUE_61_90", "Overdue 61-90 days"),
        ("OVERDUE_91_PLUS", "Overdue 91+ days"),
        ("NO_DUE_DATE", "No Due Date"),
    ]
    buckets: dict[str, dict[str, object]] = {
        key: {"bucket": key, "label": label, "count": 0, "amount": "0.00"}
        for key, label in bucket_meta
    }

    pending_count = 0
    overdue_count = 0
    pending_amount = DECIMAL_ZERO
    overdue_amount = DECIMAL_ZERO

    subscriptions = get_subscription_detail_queryset().order_by("id")
    for subscription in subscriptions.iterator(chunk_size=100):
        snapshot = getattr(subscription, "_subscription_financial_snapshot", None)
        if snapshot is None:
            from subscriptions.services.subscription_financial_service import (
                build_subscription_financial_snapshot,
            )

            snapshot = build_subscription_financial_snapshot(subscription)

        for emi_row in snapshot.get("emis") or []:
            if emi_row.get("derived_status") != EmiStatus.PENDING:
                continue

            pending_count += 1
            balance_amount = _decimal(
                emi_row.get("balance_amount") or emi_row.get("amount") or "0.00"
            )
            pending_amount += balance_amount

            due_raw = emi_row.get("due_date")
            due_date = None
            if due_raw:
                try:
                    due_date = date.fromisoformat(str(due_raw))
                except (TypeError, ValueError):
                    due_date = None

            if due_date is None:
                bucket_key = "NO_DUE_DATE"
            elif due_date >= reference_date:
                bucket_key = "NOT_DUE"
            else:
                overdue_count += 1
                overdue_amount += balance_amount
                overdue_days = (reference_date - due_date).days
                if overdue_days <= 30:
                    bucket_key = "OVERDUE_1_30"
                elif overdue_days <= 60:
                    bucket_key = "OVERDUE_31_60"
                elif overdue_days <= 90:
                    bucket_key = "OVERDUE_61_90"
                else:
                    bucket_key = "OVERDUE_91_PLUS"

            bucket = buckets[bucket_key]
            bucket["count"] = int(bucket["count"]) + 1
            bucket["amount"] = _money(_decimal(bucket["amount"]) + balance_amount)

    return {
        "reference_date": reference_date.isoformat(),
        "pending_count": pending_count,
        "pending_amount": _money(pending_amount),
        "overdue_count": overdue_count,
        "overdue_amount": _money(overdue_amount),
        "aging": [buckets[key] for key, _ in bucket_meta],
    }


def _build_subscription_mix(window_params: DashboardWindowParams) -> dict[str, object]:
    plan_rows = (
        Subscription.objects.values("plan_type")
        .annotate(count=Count("id"))
        .order_by("plan_type")
    )
    plan_mix = {str(row["plan_type"] or PlanType.EMI): int(row["count"] or 0) for row in plan_rows}
    for plan_type in PlanType.values:
        plan_mix.setdefault(plan_type, 0)

    status_rows = (
        Subscription.objects.values("status")
        .annotate(count=Count("id"))
        .order_by("status")
    )
    subscription_status_mix = [
        {"status": str(row["status"] or ""), "count": int(row["count"] or 0)}
        for row in status_rows
    ]

    batch_rows = (
        Subscription.objects.values("batch_id", "batch__batch_code")
        .annotate(
            subscription_count=Count("id"),
            active_subscription_count=Count("id", filter=Q(status="ACTIVE")),
            monthly_booked_value=Coalesce(Sum("monthly_amount"), Value(DECIMAL_ZERO)),
        )
        .order_by("-monthly_booked_value", "batch__batch_code", "batch_id")[:8]
    )
    batch_mix = [
        {
            "batch_id": int(row["batch_id"]) if row["batch_id"] else None,
            "batch_code": row["batch__batch_code"] or f"BATCH-{row['batch_id']}",
            "subscription_count": int(row["subscription_count"] or 0),
            "active_subscription_count": int(row["active_subscription_count"] or 0),
            "monthly_booked_value": _money(row["monthly_booked_value"]),
        }
        for row in batch_rows
    ]

    new_subscription_rows = (
        _apply_date_window_to_queryset(
            Subscription.objects.all(),
            field_name="start_date",
            window_params=window_params,
        )
        .values("start_date")
        .annotate(
            count=Count("id"),
            monthly_booked_value=Coalesce(Sum("monthly_amount"), Value(DECIMAL_ZERO)),
        )
        .order_by("start_date")
    )
    trend_points = [
        {
            "date": _to_iso(row["start_date"]),
            "count": int(row["count"] or 0),
            "monthly_booked_value": _money(row["monthly_booked_value"]),
        }
        for row in new_subscription_rows
    ]

    return {
        "plan_type": [
            {"plan_type": key, "count": value}
            for key, value in plan_mix.items()
        ],
        "status": subscription_status_mix,
        "batch_mix": batch_mix,
        "new_subscriptions_trend": _trim_trend_points(trend_points),
    }


def _build_contract_performance(window_params: DashboardWindowParams) -> dict[str, object]:
    subscription_queryset = _apply_activity_window(
        Subscription.objects.all(),
        window_params=window_params,
    )
    schedule_queryset = _apply_date_window_to_queryset(
        Emi.objects.select_related("subscription"),
        field_name="due_date",
        window_params=window_params,
    )

    status_by_plan = {
        plan_type: {
            status: 0
            for status in SubscriptionStatus.values
        }
        for plan_type in PlanType.values
    }
    contract_value_by_plan = {
        plan_type: {
            "plan_type": plan_type,
            "count": 0,
            "active_count": 0,
            "completed_count": 0,
            "defaulted_count": 0,
            "contract_value": "0.00",
            "monthly_value": "0.00",
            "waived_value": "0.00",
        }
        for plan_type in PlanType.values
    }

    contract_rows = (
        subscription_queryset.values("plan_type")
        .annotate(
            count=Count("id"),
            active_count=Count("id", filter=Q(status=SubscriptionStatus.ACTIVE)),
            completed_count=Count("id", filter=Q(status=SubscriptionStatus.COMPLETED)),
            defaulted_count=Count("id", filter=Q(status=SubscriptionStatus.DEFAULTED)),
            contract_value=Coalesce(Sum("total_amount"), Value(DECIMAL_ZERO)),
            monthly_value=Coalesce(Sum("monthly_amount"), Value(DECIMAL_ZERO)),
            waived_value=Coalesce(Sum("waived_amount"), Value(DECIMAL_ZERO)),
        )
        .order_by("plan_type")
    )
    for row in contract_rows:
        plan_type = str(row["plan_type"] or PlanType.EMI)
        contract_value_by_plan.setdefault(
            plan_type,
            {
                "plan_type": plan_type,
                "count": 0,
                "active_count": 0,
                "completed_count": 0,
                "defaulted_count": 0,
                "contract_value": "0.00",
                "monthly_value": "0.00",
                "waived_value": "0.00",
            },
        )
        contract_value_by_plan[plan_type].update(
            {
                "count": int(row["count"] or 0),
                "active_count": int(row["active_count"] or 0),
                "completed_count": int(row["completed_count"] or 0),
                "defaulted_count": int(row["defaulted_count"] or 0),
                "contract_value": _money(row["contract_value"]),
                "monthly_value": _money(row["monthly_value"]),
                "waived_value": _money(row["waived_value"]),
            }
        )

    for row in (
        subscription_queryset.values("plan_type", "status")
        .annotate(count=Count("id"))
        .order_by("plan_type", "status")
    ):
        plan_type = str(row["plan_type"] or PlanType.EMI)
        status = str(row["status"] or "")
        status_by_plan.setdefault(plan_type, {})
        status_by_plan[plan_type][status] = int(row["count"] or 0)

    schedule_totals: dict[str, dict[str, object]] = {
        plan_type: {
            "plan_type": plan_type,
            "pending_count": 0,
            "pending_amount": "0.00",
            "paid_count": 0,
            "paid_amount": "0.00",
            "waived_count": 0,
            "waived_amount": "0.00",
            "total_count": 0,
            "total_amount": "0.00",
        }
        for plan_type in PlanType.values
    }
    for row in (
        schedule_queryset.values("subscription__plan_type", "status")
        .annotate(count=Count("id"), amount=Coalesce(Sum("amount"), Value(DECIMAL_ZERO)))
        .order_by("subscription__plan_type", "status")
    ):
        plan_type = str(row["subscription__plan_type"] or PlanType.EMI)
        status = str(row["status"] or "")
        bucket = schedule_totals.setdefault(
            plan_type,
            {
                "plan_type": plan_type,
                "pending_count": 0,
                "pending_amount": "0.00",
                "paid_count": 0,
                "paid_amount": "0.00",
                "waived_count": 0,
                "waived_amount": "0.00",
                "total_count": 0,
                "total_amount": "0.00",
            },
        )
        count = int(row["count"] or 0)
        amount = _decimal(row["amount"])
        bucket["total_count"] = int(bucket["total_count"]) + count
        bucket["total_amount"] = _money(_decimal(bucket["total_amount"]) + amount)
        if status == EmiStatus.PENDING:
            bucket["pending_count"] = int(bucket["pending_count"]) + count
            bucket["pending_amount"] = _money(_decimal(bucket["pending_amount"]) + amount)
        elif status == EmiStatus.PAID:
            bucket["paid_count"] = int(bucket["paid_count"]) + count
            bucket["paid_amount"] = _money(_decimal(bucket["paid_amount"]) + amount)
        elif status == EmiStatus.WAIVED:
            bucket["waived_count"] = int(bucket["waived_count"]) + count
            bucket["waived_amount"] = _money(_decimal(bucket["waived_amount"]) + amount)

    return {
        "status_by_plan": [
            {
                "plan_type": plan_type,
                "statuses": status_counts,
            }
            for plan_type, status_counts in status_by_plan.items()
        ],
        "value_by_plan": list(contract_value_by_plan.values()),
        "schedule_totals_by_plan": list(schedule_totals.values()),
    }


def _build_reconciliation_posture(window_params: DashboardWindowParams) -> dict[str, object]:
    scoped_queryset = _apply_activity_window(
        Subscription.objects.all(),
        window_params=window_params,
    )
    payload = build_reconciliation_attention_payload(scoped_queryset)
    checked_count = int(payload.get("checked_count") or 0)
    flagged_count = int(payload.get("flagged_count") or 0)
    flagged_ratio = round((flagged_count / checked_count) * 100, 2) if checked_count else 0.0

    return {
        "checked_count": checked_count,
        "flagged_count": flagged_count,
        "flagged_ratio": flagged_ratio,
        "note": payload.get("note") or "",
        "results": list(payload.get("results") or [])[:10],
    }


def _build_crm_customer_posture(window_params: DashboardWindowParams) -> dict[str, object]:
    lead_queryset = _apply_date_window_to_queryset(
        PublicLead.objects.all(),
        field_name="created_at__date",
        window_params=window_params,
    )
    customer_queryset = _apply_date_window_to_queryset(
        Customer.objects.all(),
        field_name="created_at__date",
        window_params=window_params,
    )

    status_counts = {status: 0 for status in PublicLeadStatus.values}
    for row in lead_queryset.values("status").annotate(count=Count("id")).order_by("status"):
        status_counts[str(row["status"] or "")] = int(row["count"] or 0)

    intent_counts = {intent: 0 for intent in PublicLeadIntent.values}
    for row in lead_queryset.values("intent").annotate(count=Count("id")).order_by("intent"):
        intent_counts[str(row["intent"] or "")] = int(row["count"] or 0)

    return {
        "leads": {
            "total_count": lead_queryset.count(),
            "open_count": lead_queryset.filter(
                status__in=[
                    PublicLeadStatus.NEW,
                    PublicLeadStatus.IN_PROGRESS,
                    PublicLeadStatus.CONTACTED,
                ]
            ).count(),
            "converted_count": lead_queryset.filter(status=PublicLeadStatus.CONVERTED).count(),
            "by_status": [
                {"status": status, "count": count}
                for status, count in status_counts.items()
            ],
            "by_intent": [
                {"intent": intent, "count": count}
                for intent, count in intent_counts.items()
            ],
        },
        "customers": {
            "new_count": customer_queryset.count(),
            "kyc_pending_count": Customer.objects.filter(kyc_status="PENDING").count(),
            "kyc_verified_count": Customer.objects.filter(kyc_status="VERIFIED").count(),
        },
    }


def _build_delivery_posture(window_params: DashboardWindowParams) -> dict[str, object]:
    queryset = _apply_date_window_to_queryset(
        get_delivery_queryset(),
        field_name="created_at__date",
        window_params=window_params,
    )
    summary = build_delivery_report_summary(queryset)
    return {
        "supported": True,
        "summary": summary,
    }


def _build_invoice_document_posture(window_params: DashboardWindowParams) -> dict[str, object]:
    invoice_posture = {
        "supported": False,
        "summary": {
            "invoice_count": 0,
            "invoice_total": "0.00",
            "invoice_balance": "0.00",
            "active_invoice_count": 0,
            "historical_invoice_count": 0,
            "historical_invoice_total": "0.00",
            "direct_sale_invoice_count": 0,
            "direct_sale_invoice_total": "0.00",
            "receipt_count": 0,
            "receipt_total": "0.00",
            "active_receipt_count": 0,
            "active_receipt_total": "0.00",
            "historical_receipt_count": 0,
            "historical_receipt_total": "0.00",
        },
        "invoice_status": [],
        "receipt_status": [],
        "print_status": {
            "invoices_printed": 0,
            "invoices_unprinted": 0,
            "receipts_printed": 0,
            "receipts_unprinted": 0,
        },
        "contract_documents": {
            "rent_contract_pdf_count": 0,
            "lease_contract_pdf_count": 0,
            "by_verification_status": [],
        },
    }

    try:
        from billing.models import BillingInvoice, BillingSourceType, ReceiptDocument
    except Exception:
        return invoice_posture

    invoice_queryset = _apply_date_window_to_queryset(
        BillingInvoice.objects.all(),
        field_name="invoice_date",
        window_params=window_params,
    )
    receipt_queryset = _apply_date_window_to_queryset(
        ReceiptDocument.objects.all(),
        field_name="receipt_date",
        window_params=window_params,
    )

    invoice_summary = invoice_queryset.aggregate(
        count=Count("id"),
        total=Coalesce(Sum("grand_total"), Value(DECIMAL_ZERO)),
        balance=Coalesce(Sum("balance_total", filter=invoice_active_q()), Value(DECIMAL_ZERO)),
        active_count=Count("id", filter=invoice_active_q()),
        direct_sale_count=Count("id", filter=Q(source_type=BillingSourceType.DIRECT_SALE)),
        direct_sale_total=Coalesce(
            Sum("grand_total", filter=Q(source_type=BillingSourceType.DIRECT_SALE)),
            Value(DECIMAL_ZERO),
        ),
    )
    receipt_summary = receipt_queryset.aggregate(
        count=Count("id"),
        total=Coalesce(Sum("amount"), Value(DECIMAL_ZERO)),
        active_count=Count("id", filter=receipt_active_q()),
        active_total=Coalesce(Sum("amount", filter=receipt_active_q()), Value(DECIMAL_ZERO)),
    )

    verification_rows = (
        SubscriptionDocument.objects.values("verification_status")
        .annotate(count=Count("id"))
        .order_by("verification_status")
    )

    return {
        "supported": True,
        "summary": {
            "invoice_count": int(invoice_summary["count"] or 0),
            "invoice_total": _money(invoice_summary["total"]),
            "invoice_balance": _money(invoice_summary["balance"]),
            "active_invoice_count": int(invoice_summary["active_count"] or 0),
            "historical_invoice_count": int(invoice_summary["count"] or 0)
            - int(invoice_summary["active_count"] or 0),
            "historical_invoice_total": _money(
                _decimal(invoice_summary["total"]) - _decimal(invoice_summary["balance"])
            ),
            "direct_sale_invoice_count": int(invoice_summary["direct_sale_count"] or 0),
            "direct_sale_invoice_total": _money(invoice_summary["direct_sale_total"]),
            "receipt_count": int(receipt_summary["count"] or 0),
            "receipt_total": _money(receipt_summary["total"]),
            "active_receipt_count": int(receipt_summary["active_count"] or 0),
            "active_receipt_total": _money(receipt_summary["active_total"]),
            "historical_receipt_count": int(receipt_summary["count"] or 0)
            - int(receipt_summary["active_count"] or 0),
            "historical_receipt_total": _money(
                _decimal(receipt_summary["total"]) - _decimal(receipt_summary["active_total"])
            ),
        },
        "invoice_status": [
            {
                "status": str(row["status"] or ""),
                "count": int(row["count"] or 0),
                "total": _money(row["total"]),
            }
            for row in invoice_queryset.values("status")
            .annotate(count=Count("id"), total=Coalesce(Sum("grand_total"), Value(DECIMAL_ZERO)))
            .order_by("status")
        ],
        "receipt_status": [
            {
                "status": str(row["status"] or ""),
                "count": int(row["count"] or 0),
                "total": _money(row["total"]),
            }
            for row in receipt_queryset.values("status")
            .annotate(count=Count("id"), total=Coalesce(Sum("amount"), Value(DECIMAL_ZERO)))
            .order_by("status")
        ],
        "print_status": {
            "invoices_printed": invoice_queryset.filter(printed_count__gt=0).count(),
            "invoices_unprinted": invoice_queryset.filter(printed_count=0).count(),
            "receipts_printed": receipt_queryset.filter(printed_count__gt=0).count(),
            "receipts_unprinted": receipt_queryset.filter(printed_count=0).count(),
        },
        "contract_documents": {
            "rent_contract_pdf_count": SubscriptionDocument.objects.filter(
                document_type=SubscriptionDocumentType.RENT_CONTRACT_PDF
            ).count(),
            "lease_contract_pdf_count": SubscriptionDocument.objects.filter(
                document_type=SubscriptionDocumentType.LEASE_CONTRACT_PDF
            ).count(),
            "by_verification_status": [
                {
                    "verification_status": str(row["verification_status"] or ""),
                    "count": int(row["count"] or 0),
                }
                for row in verification_rows
            ],
        },
    }


def _build_direct_sales_posture(window_params: DashboardWindowParams) -> dict[str, object]:
    try:
        from billing.models import DirectSale, DirectSaleStatus
    except Exception:
        return {
            "supported": False,
            "summary": {
                "count": 0,
                "gross_total": "0.00",
            },
            "trend": [],
        }

    queryset = _apply_date_window_to_queryset(
        DirectSale.objects.exclude(status=DirectSaleStatus.CANCELLED),
        field_name="sale_date",
        window_params=window_params,
    )
    summary = queryset.aggregate(
        count=Count("id"),
        gross_total=Coalesce(Sum("grand_total"), Value(DECIMAL_ZERO)),
    )
    trend_rows = (
        queryset.values("sale_date")
        .annotate(
            count=Count("id"),
            gross_total=Coalesce(Sum("grand_total"), Value(DECIMAL_ZERO)),
        )
        .order_by("sale_date")
    )
    trend = [
        {
            "date": _to_iso(row["sale_date"]),
            "count": int(row["count"] or 0),
            "gross_total": _money(row["gross_total"]),
        }
        for row in trend_rows
    ]

    return {
        "supported": True,
        "summary": {
            "count": int(summary["count"] or 0),
            "gross_total": _money(summary["gross_total"]),
        },
        "trend": _trim_trend_points(trend),
    }


def _build_inventory_movement_posture(window_params: DashboardWindowParams) -> dict[str, object]:
    try:
        from inventory.models import InventoryItem, StockLedger
    except Exception:
        return {
            "supported": False,
            "active_item_count": 0,
            "tracked_item_count": 0,
            "movement_summary": {
                "count": 0,
                "quantity_in": "0.000",
                "quantity_out": "0.000",
            },
            "movement_type": [],
        }

    ledger_queryset = _apply_date_window_to_queryset(
        StockLedger.objects.all(),
        field_name="movement_date",
        window_params=window_params,
    )
    summary = ledger_queryset.aggregate(
        count=Count("id"),
        quantity_in=Coalesce(Sum("quantity_in"), Value(Decimal("0.000"))),
        quantity_out=Coalesce(Sum("quantity_out"), Value(Decimal("0.000"))),
    )

    return {
        "supported": True,
        "active_item_count": InventoryItem.objects.filter(is_active=True).count(),
        "tracked_item_count": InventoryItem.objects.filter(stock_tracking_enabled=True).count(),
        "movement_summary": {
            "count": int(summary["count"] or 0),
            "quantity_in": f"{Decimal(str(summary['quantity_in'] or 0)).quantize(Decimal('0.001')):.3f}",
            "quantity_out": f"{Decimal(str(summary['quantity_out'] or 0)).quantize(Decimal('0.001')):.3f}",
        },
        "movement_type": [
            {
                "movement_type": str(row["movement_type"] or ""),
                "count": int(row["count"] or 0),
                "quantity_in": f"{Decimal(str(row['quantity_in'] or 0)).quantize(Decimal('0.001')):.3f}",
                "quantity_out": f"{Decimal(str(row['quantity_out'] or 0)).quantize(Decimal('0.001')):.3f}",
            }
            for row in ledger_queryset.values("movement_type")
            .annotate(
                count=Count("id"),
                quantity_in=Coalesce(Sum("quantity_in"), Value(Decimal("0.000"))),
                quantity_out=Coalesce(Sum("quantity_out"), Value(Decimal("0.000"))),
            )
            .order_by("movement_type")
        ],
    }


def _build_finance_posture(window_params: DashboardWindowParams) -> dict[str, object]:
    chart_of_accounts_count = 0
    finance_accounts_count = 0
    try:
        from accounting.models import ChartOfAccount, FinanceAccount

        chart_of_accounts_count = ChartOfAccount.objects.count()
        finance_accounts_count = FinanceAccount.objects.count()
    except Exception:
        chart_of_accounts_count = 0
        finance_accounts_count = 0

    purchase_obligations = {
        "draft_count": 0,
        "draft_total": "0.00",
        "approved_count": 0,
        "approved_total": "0.00",
        "posted_count": 0,
        "posted_total": "0.00",
    }
    try:
        from inventory.models import PurchaseBill, PurchaseBillStatus

        purchase_queryset = _apply_date_window_to_queryset(
            PurchaseBill.objects.all(),
            field_name="bill_date",
            window_params=window_params,
        )
        purchase_obligations = {
            "draft_count": purchase_queryset.filter(status=PurchaseBillStatus.DRAFT).count(),
            "draft_total": _money(
                purchase_queryset.filter(status=PurchaseBillStatus.DRAFT).aggregate(
                    total=Sum("grand_total")
                )["total"]
            ),
            "approved_count": purchase_queryset.filter(status=PurchaseBillStatus.APPROVED).count(),
            "approved_total": _money(
                purchase_queryset.filter(status=PurchaseBillStatus.APPROVED).aggregate(
                    total=Sum("grand_total")
                )["total"]
            ),
            "posted_count": purchase_queryset.filter(status=PurchaseBillStatus.POSTED).count(),
            "posted_total": _money(
                purchase_queryset.filter(status=PurchaseBillStatus.POSTED).aggregate(
                    total=Sum("grand_total")
                )["total"]
            ),
        }
    except Exception:
        pass

    commission_queryset = _apply_date_window_to_queryset(
        Commission.objects.all(),
        field_name="created_at__date",
        window_params=window_params,
    )
    commission_summary = {
        "total_count": commission_queryset.count(),
        "total_commission": _money(
            commission_queryset.exclude(status=CommissionStatus.REVERSED).aggregate(
                total=Sum("commission_amount")
            )["total"]
        ),
        "pending_count": commission_queryset.filter(status=CommissionStatus.PENDING).count(),
        "pending_amount": _money(
            commission_queryset.filter(status=CommissionStatus.PENDING).aggregate(
                total=Sum("commission_amount")
            )["total"]
        ),
        "settled_count": commission_queryset.filter(status=CommissionStatus.SETTLED).count(),
        "settled_amount": _money(
            commission_queryset.filter(status=CommissionStatus.SETTLED).aggregate(
                total=Sum("commission_amount")
            )["total"]
        ),
        "reversed_count": commission_queryset.filter(status=CommissionStatus.REVERSED).count(),
        "reversed_amount": _money(
            commission_queryset.filter(status=CommissionStatus.REVERSED).aggregate(
                total=Sum("commission_amount")
            )["total"]
        ),
    }

    payout_queryset = _apply_date_window_to_queryset(
        CommissionPayoutBatch.objects.all(),
        field_name="payout_date",
        window_params=window_params,
    )
    payout_batches = {
        "total_count": payout_queryset.count(),
        "draft_count": payout_queryset.filter(status=CommissionPayoutBatch.Status.DRAFT).count(),
        "draft_total": _money(
            payout_queryset.filter(status=CommissionPayoutBatch.Status.DRAFT).aggregate(
                total=Sum("total_amount")
            )["total"]
        ),
        "finalized_count": payout_queryset.filter(status=CommissionPayoutBatch.Status.FINALIZED).count(),
        "finalized_total": _money(
            payout_queryset.filter(status=CommissionPayoutBatch.Status.FINALIZED).aggregate(
                total=Sum("total_amount")
            )["total"]
        ),
        "cancelled_count": payout_queryset.filter(status=CommissionPayoutBatch.Status.CANCELLED).count(),
        "cancelled_total": _money(
            payout_queryset.filter(status=CommissionPayoutBatch.Status.CANCELLED).aggregate(
                total=Sum("total_amount")
            )["total"]
        ),
    }

    return {
        "supported": True,
        "chart_of_accounts_count": chart_of_accounts_count,
        "finance_accounts_count": finance_accounts_count,
        "purchase_obligations": purchase_obligations,
        "commission_summary": commission_summary,
        "payout_batches": payout_batches,
    }


def build_admin_reporting_analytics_summary(
    *,
    actor_user,
    window_params: DashboardWindowParams,
) -> dict[str, object]:
    dashboard = get_dashboard_summary(AdminScope(), actor_user, window_params=window_params)

    collections_trend = _build_collections_trend(window_params)
    payment_method_mix = _build_payment_method_mix(window_params)
    receivables_pressure = _build_receivables_pressure(window_params)
    subscription_mix = _build_subscription_mix(window_params)
    contract_performance = _build_contract_performance(window_params)
    crm_customer_posture = _build_crm_customer_posture(window_params)
    reconciliation_posture = _build_reconciliation_posture(window_params)
    delivery_posture = _build_delivery_posture(window_params)
    direct_sales_posture = _build_direct_sales_posture(window_params)
    invoice_document_posture = _build_invoice_document_posture(window_params)
    inventory_movement_posture = _build_inventory_movement_posture(window_params)
    finance_posture = _build_finance_posture(window_params)

    delivery_summary = delivery_posture["summary"]
    commission_summary = finance_posture["commission_summary"]

    return {
        "generated_at": timezone.now().isoformat(),
        "filters": window_params.to_payload(),
        "summary": dashboard.summary,
        "overview": {
            "window_net_collections": invoice_document_posture["summary"]["active_receipt_total"],
            "window_active_collection_count": invoice_document_posture["summary"]["active_receipt_count"],
            "window_reversed_amount": collections_trend["summary"]["reversed_amount"],
            "outstanding_amount": dashboard.summary.get("outstanding_amount", "0.00"),
            "overdue_emi_count": receivables_pressure["overdue_count"],
            "overdue_emi_amount": receivables_pressure["overdue_amount"],
            "reconciliation_flagged_count": reconciliation_posture["flagged_count"],
            "delivery_action_count": (
                int(delivery_summary.get("pending") or 0)
                + int(delivery_summary.get("scheduled") or 0)
                + int(delivery_summary.get("in_transit") or 0)
            ),
            "direct_sales_window_count": direct_sales_posture["summary"]["count"],
            "direct_sales_window_gross_total": direct_sales_posture["summary"]["gross_total"],
            "invoice_balance": invoice_document_posture["summary"]["invoice_balance"],
            "open_lead_count": crm_customer_posture["leads"]["open_count"],
            "pending_commission_amount": commission_summary["pending_amount"],
            "pending_commission_count": commission_summary["pending_count"],
        },
        "collections_trend": collections_trend,
        "payment_method_mix": payment_method_mix,
        "receivables_pressure": receivables_pressure,
        "subscription_mix": subscription_mix,
        "contract_performance": contract_performance,
        "crm_customer_posture": crm_customer_posture,
        "reconciliation_posture": reconciliation_posture,
        "delivery_posture": delivery_posture,
        "direct_sales_posture": direct_sales_posture,
        "invoice_document_posture": invoice_document_posture,
        "inventory_movement_posture": inventory_movement_posture,
        "finance_posture": finance_posture,
    }
