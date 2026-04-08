from __future__ import annotations

from math import ceil
from typing import Any

from subscriptions.models import Payment
from subscriptions.services.dashboard_canonical_financial_summary_service import (
    DashboardWindowParams,
    _apply_activity_window,
    _apply_date_window_to_queryset,
    _build_due_subscription_rows,
    _build_reconciliation_surface,
    _cashier_visible_payments_queryset,
    _payment_queryset,
    resolve_dashboard_window,
)
from subscriptions.services.dashboard_scopes import (
    CashierScope,
    CustomerScope,
    DashboardScope,
    PartnerScope,
)
from subscriptions.services.subscription_financial_service import (
    build_customer_dashboard_summary,
)
from subscriptions.services.winner_state_service import (
    get_revealed_winning_draw,
    winner_history_q,
)

SURFACE_UPCOMING = "upcoming"
SURFACE_OVERDUE = "overdue"
SURFACE_RECENT_PAYMENTS = "recent-payments"
SURFACE_WINNERS = "winners"
SURFACE_RECONCILIATION_EXCEPTIONS = "reconciliation-exceptions"

SURFACE_DEFAULT_ORDERING: dict[str, str] = {
    SURFACE_UPCOMING: "due_date",
    SURFACE_OVERDUE: "due_date",
    SURFACE_RECENT_PAYMENTS: "-payment_date",
    SURFACE_WINNERS: "-draw_revealed_at",
    SURFACE_RECONCILIATION_EXCEPTIONS: "-delta",
}

SURFACE_ORDERING_ALLOWLIST: dict[str, set[str]] = {
    SURFACE_UPCOMING: {
        "due_date",
        "pending_amount",
        "monthly_amount",
        "customer_name",
        "product_name",
        "subscription_number",
    },
    SURFACE_OVERDUE: {
        "due_date",
        "pending_amount",
        "monthly_amount",
        "customer_name",
        "overdue_days",
        "subscription_number",
    },
    SURFACE_RECENT_PAYMENTS: {
        "payment_date",
        "created_at",
        "amount",
        "customer_name",
        "subscription_number",
        "method",
    },
    SURFACE_WINNERS: {
        "draw_revealed_at",
        "waived_amount",
        "remaining_amount",
        "customer_name",
        "subscription_number",
        "winner_month",
    },
    SURFACE_RECONCILIATION_EXCEPTIONS: {
        "delta",
        "computed_outstanding",
        "pending_outstanding",
        "paid_amount",
        "customer_name",
        "subscription_number",
    },
}


def resolve_surface_ordering(surface_code: str, requested_ordering: str | None = None) -> str:
    default_ordering = SURFACE_DEFAULT_ORDERING[surface_code]
    if not requested_ordering:
        return default_ordering

    candidate = requested_ordering.strip()
    reverse = candidate.startswith("-")
    field_name = candidate[1:] if reverse else candidate
    if field_name not in SURFACE_ORDERING_ALLOWLIST[surface_code]:
        return default_ordering
    return f"-{field_name}" if reverse else field_name


def paginate_surface_rows(rows: list[dict[str, Any]], *, page: int, page_size: int) -> dict[str, Any]:
    total_count = len(rows)
    if total_count == 0:
        return {
            "count": 0,
            "page": page,
            "page_size": page_size,
            "total_pages": 0,
            "results": [],
        }

    total_pages = ceil(total_count / page_size)
    safe_page = min(page, total_pages)
    start = (safe_page - 1) * page_size
    end = start + page_size
    return {
        "count": total_count,
        "page": safe_page,
        "page_size": page_size,
        "total_pages": total_pages,
        "results": rows[start:end],
    }


def _sortable_value(value: Any):
    if value is None:
        return (1, "")
    if isinstance(value, bool):
        return (0, int(value))
    if isinstance(value, (int, float)):
        return (0, value)
    if isinstance(value, str):
        try:
            return (0, float(value))
        except ValueError:
            return (0, value.lower())
    return (0, str(value).lower())


def _apply_row_ordering(
    rows: list[dict[str, Any]],
    *,
    surface_code: str,
    ordering: str | None = None,
) -> list[dict[str, Any]]:
    resolved_ordering = resolve_surface_ordering(surface_code, ordering)
    default_ordering = SURFACE_DEFAULT_ORDERING[surface_code]
    if resolved_ordering == default_ordering:
        return rows

    reverse = resolved_ordering.startswith("-")
    field_name = resolved_ordering[1:] if reverse else resolved_ordering
    return sorted(
        rows,
        key=lambda row: _sortable_value(row.get(field_name)),
        reverse=reverse,
    )


def _serialize_payment(payment: Payment) -> dict[str, Any]:
    return {
        "payment_id": payment.id,
        "amount": f"{payment.amount:.2f}",
        "payment_date": payment.payment_date.isoformat() if payment.payment_date else None,
        "created_at": payment.created_at.isoformat() if payment.created_at else None,
        "method": payment.method,
        "reference_no": payment.reference_no,
        "customer_name": payment.customer.name if payment.customer_id else None,
        "customer_phone": payment.customer.phone if payment.customer_id else None,
        "subscription_id": payment.subscription_id,
        "subscription_number": f"SUB-{payment.subscription_id}" if payment.subscription_id else None,
        "batch_code": (
            payment.subscription.batch.batch_code
            if payment.subscription_id and payment.subscription.batch_id
            else None
        ),
        "lucky_number": (
            payment.subscription.lucky_id.lucky_number
            if payment.subscription_id and payment.subscription.lucky_id_id
            else None
        ),
        "is_reversed": bool(
            (payment.allocation_metadata or {}).get("reversal", {}).get("is_reversed")
        ),
    }


def _scoped_payment_queryset(scope: DashboardScope, actor_user):
    if isinstance(scope, PartnerScope):
        return (
            _payment_queryset()
            .filter(subscription__partner=actor_user)
            .exclude(allocation_metadata__reversal__is_reversed=True)
            .order_by("-payment_date", "-id")
        )

    if isinstance(scope, CashierScope):
        return _cashier_visible_payments_queryset().order_by("-created_at", "-id")

    if isinstance(scope, CustomerScope):
        customer = getattr(actor_user, "customer_profile", None)
        return (
            _payment_queryset()
            .filter(customer=customer)
            .order_by("-payment_date", "-id")
        )

    return _payment_queryset().order_by("-payment_date", "-id")


def list_upcoming_items(
    *,
    scope: DashboardScope,
    actor_user,
    window_params: DashboardWindowParams | None = None,
    limit: int | None = 10,
    ordering: str | None = None,
) -> list[dict[str, Any]]:
    effective_window = window_params or resolve_dashboard_window()
    subscriptions = list(scope.get_subscription_queryset(actor_user).order_by("-created_at", "-id"))
    build_customer_dashboard_summary(subscriptions)
    rows = _build_due_subscription_rows(
        subscriptions,
        window_params=effective_window,
        only_state="UPCOMING",
    )
    rows = _apply_row_ordering(rows, surface_code=SURFACE_UPCOMING, ordering=ordering)
    return rows if limit is None else rows[:limit]


def list_overdue_items(
    *,
    scope: DashboardScope,
    actor_user,
    window_params: DashboardWindowParams | None = None,
    limit: int | None = 10,
    ordering: str | None = None,
) -> list[dict[str, Any]]:
    effective_window = window_params or resolve_dashboard_window()
    subscriptions = list(scope.get_subscription_queryset(actor_user).order_by("-created_at", "-id"))
    build_customer_dashboard_summary(subscriptions)
    rows = _build_due_subscription_rows(
        subscriptions,
        window_params=effective_window,
        only_state="OVERDUE",
    )
    rows = _apply_row_ordering(rows, surface_code=SURFACE_OVERDUE, ordering=ordering)
    return rows if limit is None else rows[:limit]


def list_recent_payments(
    *,
    scope: DashboardScope,
    actor_user,
    window_params: DashboardWindowParams | None = None,
    limit: int | None = 10,
    ordering: str | None = None,
) -> list[dict[str, Any]]:
    effective_window = window_params or resolve_dashboard_window()
    queryset = _scoped_payment_queryset(scope, actor_user)
    if isinstance(scope, CashierScope):
        queryset = _apply_date_window_to_queryset(
            queryset,
            field_name="created_at__date",
            window_params=effective_window,
        )
    else:
        queryset = _apply_date_window_to_queryset(
            queryset,
            field_name="payment_date",
            window_params=effective_window,
        )
    rows = [_serialize_payment(payment) for payment in queryset]
    rows = _apply_row_ordering(
        rows,
        surface_code=SURFACE_RECENT_PAYMENTS,
        ordering=ordering,
    )
    return rows if limit is None else rows[:limit]


def list_winners(
    *,
    scope: DashboardScope,
    actor_user,
    window_params: DashboardWindowParams | None = None,
    limit: int | None = 10,
    ordering: str | None = None,
) -> list[dict[str, Any]]:
    effective_window = window_params or resolve_dashboard_window()
    queryset = scope.get_subscription_queryset(actor_user).filter(winner_history_q()).distinct()
    subscriptions = list(queryset.order_by("-created_at", "-id"))
    build_customer_dashboard_summary(subscriptions)

    rows: list[dict[str, Any]] = []
    for subscription in subscriptions:
        snapshot = getattr(subscription, "_subscription_financial_snapshot", None) or {}
        winner_summary = snapshot.get("winner_summary") or {}
        winning_draw = get_revealed_winning_draw(subscription)
        revealed_at = getattr(winning_draw, "revealed_at", None)
        revealed_date = revealed_at.date() if revealed_at else None

        if effective_window.start_date and effective_window.end_date and revealed_date:
            if revealed_date < effective_window.start_date or revealed_date > effective_window.end_date:
                continue
        elif effective_window.as_of and revealed_date and revealed_date > effective_window.as_of:
            continue

        rows.append(
            {
                "subscription_id": subscription.id,
                "subscription_number": f"SUB-{subscription.id}",
                "customer_name": getattr(subscription.customer, "name", ""),
                "customer_phone": getattr(subscription.customer, "phone", ""),
                "product_name": getattr(subscription.product, "name", ""),
                "batch_code": getattr(subscription.batch, "batch_code", None),
                "lucky_number": getattr(subscription.lucky_id, "lucky_number", None),
                "winner_status": winner_summary.get("winner_status") or snapshot.get("winner_status"),
                "winner_month": winner_summary.get("winner_month") or snapshot.get("winner_month"),
                "waived_emi_count": winner_summary.get("waived_emi_count") or snapshot.get("emi_count_waived"),
                "waived_amount": winner_summary.get("waived_amount") or snapshot.get("waived_amount"),
                "draw_id": winner_summary.get("draw_id"),
                "draw_month": winner_summary.get("draw_month"),
                "draw_revealed_at": winner_summary.get("draw_revealed_at"),
                "remaining_amount": snapshot.get("remaining_amount"),
            }
        )

    rows.sort(
        key=lambda row: (
            row.get("draw_revealed_at") or "",
            row.get("subscription_id") or 0,
        ),
        reverse=True,
    )
    rows = _apply_row_ordering(rows, surface_code=SURFACE_WINNERS, ordering=ordering)
    return rows if limit is None else rows[:limit]


def list_reconciliation_exceptions(
    *,
    scope: DashboardScope,
    actor_user,
    window_params: DashboardWindowParams | None = None,
    limit: int | None = 10,
    ordering: str | None = None,
) -> list[dict[str, Any]]:
    effective_window = window_params or resolve_dashboard_window()
    queryset = _apply_activity_window(
        scope.get_subscription_queryset(actor_user),
        effective_window,
    )
    rows = _build_reconciliation_surface(queryset)["results"]
    rows = _apply_row_ordering(
        rows,
        surface_code=SURFACE_RECONCILIATION_EXCEPTIONS,
        ordering=ordering,
    )
    return rows if limit is None else rows[:limit]
