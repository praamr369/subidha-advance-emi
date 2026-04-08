from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal

from django.db.models import Count, Q, Sum
from django.utils import timezone

from subscriptions.models import (
    Batch,
    BatchStatus,
    Commission,
    CommissionStatus,
    Emi,
    EmiStatus,
    LuckyDraw,
    MONEY_ZERO,
    PartnerCollectionRequest,
    PartnerCollectionRequestStatus,
    Payment,
    SubscriptionStatus,
)
from subscriptions.services.dashboard_scopes import (
    AdminScope,
    CashierScope,
    CustomerScope,
    DashboardScope,
    PartnerScope,
)
from subscriptions.services.financial_health_service import system_financial_health
from subscriptions.services.risk_service import evaluate_all_active_subscriptions
from subscriptions.services.subscription_financial_service import (
    build_customer_dashboard_summary,
    build_reconciliation_attention_payload,
)


WINDOW_DEFAULT = "DEFAULT"
WINDOW_THIS_MONTH = "THIS_MONTH"
WINDOW_LAST_30_DAYS = "LAST_30_DAYS"
WINDOW_CUSTOM = "CUSTOM"
WINDOW_CHOICES = {
    WINDOW_DEFAULT,
    WINDOW_THIS_MONTH,
    WINDOW_LAST_30_DAYS,
    WINDOW_CUSTOM,
}


def _money(value) -> str:
    return f"{Decimal(str(value or MONEY_ZERO)).quantize(Decimal('0.01')):.2f}"


def _date(value) -> str | None:
    return value.isoformat() if value else None


@dataclass(frozen=True)
class DashboardWindowParams:
    window: str = WINDOW_DEFAULT
    as_of: date | None = None
    start_date: date | None = None
    end_date: date | None = None

    @property
    def reference_date(self) -> date:
        return self.as_of or self.end_date or timezone.localdate()

    @property
    def has_surface_filter(self) -> bool:
        return bool(
            self.as_of is not None
            or self.start_date is not None
            or self.end_date is not None
            or self.window != WINDOW_DEFAULT
        )

    def to_payload(self) -> dict[str, object]:
        return {
            "window": self.window,
            "as_of": _date(self.as_of),
            "start_date": _date(self.start_date),
            "end_date": _date(self.end_date),
        }


def resolve_dashboard_window(
    *,
    window: str | None = None,
    as_of: date | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
) -> DashboardWindowParams:
    normalized_window = (window or WINDOW_DEFAULT).strip().upper()
    if normalized_window not in WINDOW_CHOICES:
        normalized_window = WINDOW_DEFAULT

    today = timezone.localdate()
    resolved_start = start_date
    resolved_end = end_date
    resolved_as_of = as_of

    if normalized_window == WINDOW_THIS_MONTH:
        resolved_start = today.replace(day=1)
        resolved_end = today
    elif normalized_window == WINDOW_LAST_30_DAYS:
        resolved_start = today - timedelta(days=29)
        resolved_end = today

    if resolved_start and resolved_end and resolved_start > resolved_end:
        resolved_start, resolved_end = resolved_end, resolved_start

    return DashboardWindowParams(
        window=normalized_window,
        as_of=resolved_as_of,
        start_date=resolved_start,
        end_date=resolved_end,
    )


def _payment_queryset():
    return Payment.objects.select_related(
        "customer",
        "subscription",
        "subscription__customer",
        "subscription__product",
        "subscription__batch",
        "subscription__partner",
        "subscription__lucky_id",
        "emi",
        "collected_by",
        "verified_by",
    )


def _partner_collection_request_queryset(partner):
    return (
        PartnerCollectionRequest.objects.select_related(
            "partner",
            "subscription",
            "customer",
            "reviewed_by",
            "approved_payment",
            "approved_emi",
        )
        .filter(partner=partner)
        .order_by("-created_at", "-id")
    )


def _cashier_visible_payments_queryset():
    return (
        _payment_queryset()
        .filter(collected_by__role="CASHIER")
        .order_by("-created_at", "-id")
    )


def _pending_emi_sort_key(row: dict) -> tuple[date, int, int]:
    due_date_raw = row.get("due_date")
    try:
        due_date = date.fromisoformat(str(due_date_raw))
    except (TypeError, ValueError):
        due_date = date.max

    return (
        due_date,
        int(row.get("month_no") or 0),
        int(row.get("id") or 0),
    )


def _days_overdue(
    due_date_raw: str | None,
    *,
    reference_date: date | None = None,
) -> int:
    if not due_date_raw:
        return 0

    try:
        due_date = date.fromisoformat(str(due_date_raw))
    except (TypeError, ValueError):
        return 0

    effective_reference_date = reference_date or timezone.localdate()
    return max((effective_reference_date - due_date).days, 0)


def _matches_due_window(
    *,
    due_date_raw: str | None,
    window_params: DashboardWindowParams,
) -> bool:
    if not (window_params.start_date or window_params.end_date):
        return True

    if not due_date_raw:
        return False

    try:
        due_date = date.fromisoformat(str(due_date_raw))
    except (TypeError, ValueError):
        return False

    if window_params.start_date and due_date < window_params.start_date:
        return False
    if window_params.end_date and due_date > window_params.end_date:
        return False
    return True


def _is_pending_row_overdue(
    pending_row: dict[str, object],
    *,
    reference_date: date,
) -> bool:
    due_date_raw = pending_row.get("due_date")
    if not due_date_raw:
        return False

    try:
        due_date = date.fromisoformat(str(due_date_raw))
    except (TypeError, ValueError):
        return False

    return due_date < reference_date


def _build_due_subscription_rows(
    subscriptions,
    *,
    window_params: DashboardWindowParams | None = None,
    only_state: str | None = None,
) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    effective_window = window_params or resolve_dashboard_window()
    reference_date = effective_window.reference_date

    for subscription in subscriptions:
        snapshot = getattr(subscription, "_subscription_financial_snapshot", None) or {}
        pending_rows = [
            row
            for row in snapshot.get("emis") or []
            if row.get("derived_status") == EmiStatus.PENDING
        ]
        if not pending_rows:
            continue

        filtered_pending_rows = [
            row
            for row in pending_rows
            if _matches_due_window(
                due_date_raw=row.get("due_date"),
                window_params=effective_window,
            )
        ]
        if only_state == "OVERDUE":
            filtered_pending_rows = [
                row
                for row in filtered_pending_rows
                if _is_pending_row_overdue(row, reference_date=reference_date)
            ]
        elif only_state == "UPCOMING":
            filtered_pending_rows = [
                row
                for row in filtered_pending_rows
                if not _is_pending_row_overdue(row, reference_date=reference_date)
            ]

        if not filtered_pending_rows:
            continue

        next_due = min(filtered_pending_rows, key=_pending_emi_sort_key)
        is_overdue = _is_pending_row_overdue(next_due, reference_date=reference_date)
        rows.append(
            {
                "id": subscription.id,
                "subscription_id": subscription.id,
                "subscription_number": f"SUB-{subscription.id}",
                "customer_id": getattr(subscription.customer, "id", None),
                "customer_name": getattr(subscription.customer, "name", ""),
                "customer_phone": getattr(subscription.customer, "phone", ""),
                "product_name": getattr(subscription.product, "name", ""),
                "batch_code": getattr(subscription.batch, "batch_code", None),
                "lucky_number": getattr(subscription.lucky_id, "lucky_number", None),
                "due_date": next_due.get("due_date"),
                "monthly_amount": _money(getattr(subscription, "monthly_amount", MONEY_ZERO)),
                "pending_amount": _money(next_due.get("balance_amount")),
                "overdue_days": _days_overdue(
                    next_due.get("due_date"),
                    reference_date=reference_date,
                )
                if is_overdue
                else 0,
                "is_overdue": is_overdue,
                "emi_id": next_due.get("id"),
                "month_no": next_due.get("month_no"),
            }
        )

    rows.sort(
        key=lambda row: (
            0 if row.get("is_overdue") else 1,
            _pending_emi_sort_key(
                {
                    "due_date": row.get("due_date"),
                    "month_no": row.get("month_no"),
                    "id": row.get("emi_id"),
                }
            ),
        )
    )
    return rows


def _build_winner_surface(summary: dict[str, object], *, scope: DashboardScope) -> dict[str, object]:
    winner_subscriptions = int(summary.get("winner_subscriptions") or 0)
    total_waived_amount = _money(summary.get("total_waived_amount"))
    waived_emis = int(summary.get("waived_emis") or 0)

    if winner_subscriptions > 0 or waived_emis > 0:
        note = (
            "Winner history stays separate from payment settlement. Future EMI waiver only is already reflected in these totals."
        )
    else:
        note = (
            f"No winner waiver is currently recorded inside the {scope.label.lower()} scope."
        )

    return {
        "winner_subscriptions": winner_subscriptions,
        "waived_emis": waived_emis,
        "total_waived_amount": total_waived_amount,
        "note": note,
    }


def _build_reconciliation_surface(queryset) -> dict[str, object]:
    payload = build_reconciliation_attention_payload(queryset)
    return {
        "checked_count": payload["checked_count"],
        "flagged_count": payload["flagged_count"],
        "results": list(payload["results"])[:10],
        "note": payload["note"],
    }


def _next_draw_date_for_batch(today: date, draw_day: int) -> date:
    if today.day <= draw_day:
        return today.replace(day=draw_day)

    if today.month == 12:
        return date(today.year + 1, 1, draw_day)

    return date(today.year, today.month + 1, draw_day)


def _build_admin_batch_surface(today: date) -> dict[str, object]:
    total_batches = Batch.objects.count()
    total_draws = LuckyDraw.objects.count()

    live_batches = list(
        Batch.objects.filter(
            status__in=[
                BatchStatus.OPEN,
                BatchStatus.FULL,
                BatchStatus.DRAW_IN_PROGRESS,
            ]
        )
        .annotate(subscription_count=Count("subscriptions", distinct=True))
        .order_by("draw_day", "id")
    )
    live_batch_count = len(live_batches)
    open_batch_count = sum(
        1 for batch in live_batches if batch.status == BatchStatus.OPEN
    )

    next_draw_row = None
    next_draw_date = None

    for row in live_batches:
        candidate_date = _next_draw_date_for_batch(today, row.draw_day)
        if next_draw_date is None or candidate_date < next_draw_date:
            next_draw_date = candidate_date
            next_draw_row = row

    next_draw_batch = None
    if next_draw_row is not None and next_draw_date is not None:
        next_draw_batch = {
            "id": next_draw_row.id,
            "batch_code": next_draw_row.batch_code,
            "status": next_draw_row.status,
            "draw_day": next_draw_row.draw_day,
            "draw_date": next_draw_date.isoformat(),
            "days_until_draw": max((next_draw_date - today).days, 0),
            "subscription_count": next_draw_row.subscription_count,
            "total_slots": next_draw_row.total_slots,
            "available_slots": max(
                next_draw_row.total_slots - next_draw_row.subscription_count,
                0,
            ),
        }

    return {
        "total_batches": total_batches,
        "total_draws": total_draws,
        "live_batches": live_batch_count,
        "open_batches": open_batch_count,
        "next_draw_batch": next_draw_batch,
    }


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


def _apply_date_window_to_queryset(
    queryset,
    *,
    field_name: str,
    window_params: DashboardWindowParams,
):
    if window_params.start_date and window_params.end_date:
        return queryset.filter(
            **{f"{field_name}__range": (window_params.start_date, window_params.end_date)}
        )
    if window_params.as_of:
        return queryset.filter(**{f"{field_name}__lte": window_params.as_of})
    if window_params.end_date:
        return queryset.filter(**{f"{field_name}__lte": window_params.end_date})
    return queryset


@dataclass
class DashboardSummaryDTO:
    scope: DashboardScope
    summary: dict[str, object]
    filters: dict[str, object] = field(default_factory=dict)
    subscriptions: list = field(default_factory=list)
    identity: dict[str, object] = field(default_factory=dict)
    due_subscriptions: list[dict[str, object]] = field(default_factory=list)
    winner_surface: dict[str, object] = field(default_factory=dict)
    reconciliation: dict[str, object] = field(default_factory=dict)
    metrics: dict[str, object] = field(default_factory=dict)
    payment_rows: list = field(default_factory=list)
    collection_request_rows: list = field(default_factory=list)
    follow_up_rows: list = field(default_factory=list)


def get_dashboard_summary(
    scope: DashboardScope,
    actor_user,
    window_params: DashboardWindowParams | None = None,
) -> DashboardSummaryDTO:
    effective_window = window_params or resolve_dashboard_window()
    queryset = scope.get_subscription_queryset(actor_user).order_by("-created_at", "-id")
    subscriptions = list(queryset)
    summary = build_customer_dashboard_summary(subscriptions)
    due_subscriptions = _build_due_subscription_rows(
        subscriptions,
        window_params=effective_window,
    )
    winner_surface = _build_winner_surface(summary, scope=scope)
    reconciliation = _build_reconciliation_surface(
        _apply_activity_window(queryset, effective_window)
    )
    identity = scope.get_identity_payload(actor_user)

    metrics: dict[str, object] = {}
    payment_rows = []
    collection_request_rows = []
    follow_up_rows = []

    if isinstance(scope, AdminScope):
        today = timezone.localdate()
        today_payment_queryset = _payment_queryset().filter(payment_date=today)
        today_reversed_queryset = today_payment_queryset.filter(
            allocation_metadata__reversal__is_reversed=True
        )
        today_active_queryset = today_payment_queryset.exclude(
            allocation_metadata__reversal__is_reversed=True
        )
        batch_surface = _build_admin_batch_surface(today)
        risk_stats = evaluate_all_active_subscriptions()
        total_active = queryset.filter(status=SubscriptionStatus.ACTIVE).count()
        default_rate = risk_stats["defaulted"] / total_active if total_active > 0 else 0
        aggregates = queryset.aggregate(
            total_contract_value=Sum("total_amount"),
            total_monthly_value=Sum("monthly_amount"),
            total_waived_value=Sum("waived_amount"),
        )

        metrics = {
            "total_customers": queryset.values("customer_id").distinct().count(),
            "defaulted_subscriptions": queryset.filter(
                status=SubscriptionStatus.DEFAULTED
            ).count(),
            "total_contract_value": _money(aggregates["total_contract_value"]),
            "total_monthly_value": _money(aggregates["total_monthly_value"]),
            "total_waived_value": _money(aggregates["total_waived_value"]),
            "collections": {
                "today_transaction_count": today_payment_queryset.count(),
                "today_active_payments": today_active_queryset.count(),
                "today_reversed_payments": today_reversed_queryset.count(),
                "today_gross_amount": _money(
                    today_payment_queryset.aggregate(total=Sum("amount"))["total"]
                ),
                "today_reversed_amount": _money(
                    today_reversed_queryset.aggregate(total=Sum("amount"))["total"]
                ),
                "today_net_amount": _money(
                    today_active_queryset.aggregate(total=Sum("amount"))["total"]
                ),
            },
            "operations": {
                "due_today_emis": Emi.objects.filter(
                    subscription__in=queryset,
                    status=EmiStatus.PENDING,
                    due_date=today,
                ).count(),
                "overdue_emis": int(summary.get("overdue_emis") or 0),
                "open_batches": batch_surface["open_batches"],
                "next_draw_batch": batch_surface["next_draw_batch"],
            },
            "batches": batch_surface,
            "risk": {
                "healthy": risk_stats["healthy"],
                "at_risk": risk_stats["at_risk"],
                "high_risk": risk_stats["high_risk"],
                "defaulted": risk_stats["defaulted"],
                "default_rate": default_rate,
            },
            "financial_health": system_financial_health(),
        }
        payment_rows = list(
            _apply_date_window_to_queryset(
                _payment_queryset().order_by("-created_at", "-id"),
                field_name="payment_date",
                window_params=effective_window,
            )[:10]
        )

    elif isinstance(scope, PartnerScope):
        partner = actor_user
        all_payments = (
            _payment_queryset()
            .filter(subscription__partner=partner)
            .order_by("-payment_date", "-id")
        )
        active_payments = all_payments.exclude(
            allocation_metadata__reversal__is_reversed=True
        )
        commissions = Commission.objects.filter(partner=partner)
        collection_requests = _partner_collection_request_queryset(partner)
        request_summary = collection_requests.aggregate(
            submitted_count=Count(
                "id",
                filter=Q(status=PartnerCollectionRequestStatus.SUBMITTED),
            ),
            under_review_count=Count(
                "id",
                filter=Q(status=PartnerCollectionRequestStatus.UNDER_REVIEW),
            ),
            approved_count=Count(
                "id",
                filter=Q(status=PartnerCollectionRequestStatus.APPROVED),
            ),
            rejected_count=Count(
                "id",
                filter=Q(status=PartnerCollectionRequestStatus.REJECTED),
            ),
            cancelled_count=Count(
                "id",
                filter=Q(status=PartnerCollectionRequestStatus.CANCELLED),
            ),
        )
        metrics = {
            "total_customers": queryset.values("customer_id").distinct().count(),
            "defaulted_subscriptions": queryset.filter(
                status=SubscriptionStatus.DEFAULTED
            ).count(),
            "total_commission": _money(
                commissions.exclude(status=CommissionStatus.REVERSED).aggregate(
                    total=Sum("commission_amount")
                )["total"]
            ),
            "pending_commission": _money(
                commissions.filter(status=CommissionStatus.PENDING).aggregate(
                    total=Sum("commission_amount")
                )["total"]
            ),
            "settled_commission": _money(
                commissions.filter(status=CommissionStatus.SETTLED).aggregate(
                    total=Sum("commission_amount")
                )["total"]
            ),
            "submitted_collection_requests": request_summary["submitted_count"] or 0,
            "under_review_collection_requests": request_summary["under_review_count"] or 0,
            "approved_collection_requests": request_summary["approved_count"] or 0,
            "rejected_collection_requests": request_summary["rejected_count"] or 0,
            "cancelled_collection_requests": request_summary["cancelled_count"] or 0,
            "verified_payment_count": active_payments.count(),
            "all_payment_rows_count": all_payments.count(),
        }
        payment_rows = list(
            _apply_date_window_to_queryset(
                active_payments,
                field_name="payment_date",
                window_params=effective_window,
            )[:10]
        )
        collection_request_rows = list(
            _apply_date_window_to_queryset(
                collection_requests.filter(
                    status__in=[
                        PartnerCollectionRequestStatus.SUBMITTED,
                        PartnerCollectionRequestStatus.UNDER_REVIEW,
                        PartnerCollectionRequestStatus.APPROVED,
                    ]
                ),
                field_name="created_at__date",
                window_params=effective_window,
            )[:10]
        )
        follow_up_rows = list(
            _apply_date_window_to_queryset(
                collection_requests.filter(
                    status__in=[
                        PartnerCollectionRequestStatus.REJECTED,
                        PartnerCollectionRequestStatus.CANCELLED,
                    ]
                ),
                field_name="created_at__date",
                window_params=effective_window,
            )[:10]
        )

    elif isinstance(scope, CashierScope):
        today = timezone.localdate()
        today_payments = _cashier_visible_payments_queryset().filter(created_at__date=today)
        metrics = {
            "today_total_collected": _money(
                today_payments.aggregate(total=Sum("amount"))["total"]
            ),
            "today_transaction_count": today_payments.count(),
            "today_cash_total": _money(
                today_payments.filter(method="CASH").aggregate(total=Sum("amount"))[
                    "total"
                ]
            ),
            "today_digital_total": _money(
                today_payments.exclude(method="CASH").aggregate(total=Sum("amount"))[
                    "total"
                ]
            ),
        }
        payment_rows = list(
            _apply_date_window_to_queryset(
                _cashier_visible_payments_queryset().order_by("-created_at", "-id"),
                field_name="created_at__date",
                window_params=effective_window,
            )[:12]
        )

    elif isinstance(scope, CustomerScope):
        customer = getattr(actor_user, "customer_profile", None)
        customer_payments = (
            _payment_queryset()
            .filter(customer=customer)
            .order_by("-payment_date", "-id")
        )
        metrics = {}
        payment_rows = list(
            _apply_date_window_to_queryset(
                customer_payments,
                field_name="payment_date",
                window_params=effective_window,
            )[:10]
        )

    return DashboardSummaryDTO(
        scope=scope,
        summary=summary,
        filters=effective_window.to_payload(),
        subscriptions=subscriptions,
        identity=identity,
        due_subscriptions=due_subscriptions,
        winner_surface=winner_surface,
        reconciliation=reconciliation,
        metrics=metrics,
        payment_rows=payment_rows,
        collection_request_rows=collection_request_rows,
        follow_up_rows=follow_up_rows,
    )
