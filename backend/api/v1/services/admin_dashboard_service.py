from datetime import date
from decimal import Decimal

from django.db.models import Count, Sum
from django.core.cache import cache
from django.utils import timezone

from core.services.operational_visibility import subscription_dashboard_visible_q
from subscriptions.models import (
    BatchStatus,
    Commission,
    CommissionStatus,
    Emi,
    Payment,
    Subscription,
    EmiStatus,
    SubscriptionStatus,
    Batch,
    LuckyDraw,
    PlanType,
    PublicLead,
    PublicLeadStatus,
)
from subscriptions.services.dashboard_canonical_financial_summary_service import (
    get_dashboard_summary,
)
from subscriptions.services.dashboard_scopes import AdminScope

from subscriptions.services.risk_service import evaluate_all_active_subscriptions
from subscriptions.services.financial_health_service import system_financial_health
from subscriptions.services.winner_state_service import winner_history_q


CACHE_KEY = "admin_dashboard_v1"
CACHE_TIMEOUT = 60  # seconds


def _money(value) -> str:
    return f"{Decimal(str(value or 0)).quantize(Decimal('0.01')):.2f}"


def _next_draw_date_for_batch(today: date, draw_day: int) -> date:
    if today.day <= draw_day:
        return today.replace(day=draw_day)

    if today.month == 12:
        return date(today.year + 1, 1, draw_day)

    return date(today.year, today.month + 1, draw_day)


def build_admin_dashboard(*, actor_user=None):

    # ------------------------------
    # 1️⃣ Try cache first
    # ------------------------------
    cached = cache.get(CACHE_KEY)
    if cached:
        return cached

    today = timezone.localdate()
    canonical_dashboard = get_dashboard_summary(AdminScope(), actor_user)
    canonical_summary = canonical_dashboard.summary
    canonical_metrics = canonical_dashboard.metrics

    # ------------------------------
    # 2️⃣ Risk Engine
    # ------------------------------
    risk_stats = evaluate_all_active_subscriptions()

    total_active = Subscription.objects.filter(subscription_dashboard_visible_q()).filter(
        status=SubscriptionStatus.ACTIVE
    ).count()

    default_rate = (
        risk_stats["defaulted"] / total_active
        if total_active > 0 else 0
    )

    # ------------------------------
    # 3️⃣ Financial Metrics
    # ------------------------------
    total_revenue = canonical_summary["total_paid_amount"]
    today_collections = canonical_metrics["collections"]

    today_payment_queryset = Payment.objects.select_related(
        "customer",
        "subscription",
        "subscription__batch",
        "subscription__lucky_id",
    ).filter(payment_date=today)

    total_outstanding = canonical_summary["outstanding_amount"]

    # ------------------------------
    # 4️⃣ EMI Stats
    # ------------------------------
    pending_emis = canonical_summary["pending_emis"]
    overdue_emis = canonical_summary["overdue_emis"]

    # ------------------------------
    # 5️⃣ Subscription Stats
    # ------------------------------
    active_subscriptions = canonical_summary["active_subscriptions"]
    completed_subscriptions = canonical_summary["completed_subscriptions"]
    won_subscriptions = canonical_summary["winner_subscriptions"]

    # ------------------------------
    # 6️⃣ Batch & Draw Stats
    # ------------------------------
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

    next_draw_batch = None
    next_draw_row = None
    next_draw_date = None

    for row in live_batches:
        candidate_date = _next_draw_date_for_batch(today, row.draw_day)
        if next_draw_date is None or candidate_date < next_draw_date:
            next_draw_date = candidate_date
            next_draw_row = row

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

    recent_payment_rows = list(
        today_payment_queryset.order_by("-created_at", "-id")[:5]
    )
    recent_activity = [
        {
            "kind": "PAYMENT",
            "payment_id": payment.id,
            "amount": str(payment.amount),
            "payment_date": payment.payment_date.isoformat()
            if payment.payment_date
            else None,
            "created_at": payment.created_at.isoformat()
            if payment.created_at
            else None,
            "method": payment.method,
            "reference_no": payment.reference_no,
            "customer_name": payment.customer.name if payment.customer_id else None,
            "customer_phone": payment.customer.phone if payment.customer_id else None,
            "subscription_id": payment.subscription_id,
            "subscription_number": f"SUB-{payment.subscription_id}"
            if payment.subscription_id
            else None,
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
                (payment.allocation_metadata or {})
                .get("reversal", {})
                .get("is_reversed")
            ),
        }
        for payment in recent_payment_rows
    ]

    # ------------------------------
    # 7️⃣ Financial Health Engine
    # ------------------------------
    financial_health = system_financial_health()

    # ------------------------------
    # 8️⃣ Assemble Final Response
    # ------------------------------
    portfolio_mix_rows = (
        Subscription.objects.filter(subscription_dashboard_visible_q()).values("plan_type")
        .annotate(count=Count("id"))
        .order_by("plan_type")
    )
    portfolio_mix = {row["plan_type"] or "EMI": row["count"] for row in portfolio_mix_rows}
    for plan_type in PlanType.values:
        portfolio_mix.setdefault(plan_type, 0)

    lead_pipeline = {
        "new": PublicLead.objects.filter(status=PublicLeadStatus.NEW).count(),
        "in_progress": PublicLead.objects.filter(status=PublicLeadStatus.IN_PROGRESS).count(),
        "contacted": PublicLead.objects.filter(status=PublicLeadStatus.CONTACTED).count(),
        "converted": PublicLead.objects.filter(status=PublicLeadStatus.CONVERTED).count(),
        "closed": PublicLead.objects.filter(status=PublicLeadStatus.CLOSED).count(),
    }

    dashboard_data = {

        # 💰 Financial Layer
        "financial": {
            "total_revenue": total_revenue,
            "today_collection": today_collections["today_net_amount"],
            "total_outstanding": total_outstanding,
        },
        "summary": canonical_summary,
        "winner_surface": canonical_dashboard.winner_surface,
        "reconciliation": canonical_dashboard.reconciliation,
        "due_subscriptions": canonical_dashboard.due_subscriptions[:10],
        "subscription_kpis": {
            "total_customers": canonical_metrics["total_customers"],
            "total_subscriptions": canonical_summary["subscription_count"],
            "defaulted_subscriptions": canonical_metrics["defaulted_subscriptions"],
            "total_contract_value": canonical_metrics["total_contract_value"],
            "total_monthly_value": canonical_metrics["total_monthly_value"],
            "total_waived_value": canonical_metrics["total_waived_value"],
        },
        "commission_summary": {
            "total_commission": _money(
                Commission.objects.exclude(status=CommissionStatus.REVERSED).aggregate(
                    total=Sum("commission_amount")
                )["total"]
            ),
            "pending_commission": _money(
                Commission.objects.filter(status=CommissionStatus.PENDING).aggregate(
                    total=Sum("commission_amount")
                )["total"]
            ),
            "settled_commission": _money(
                Commission.objects.filter(status=CommissionStatus.SETTLED).aggregate(
                    total=Sum("commission_amount")
                )["total"]
            ),
            "reversed_commission": _money(
                Commission.objects.filter(status=CommissionStatus.REVERSED).aggregate(
                    total=Sum("commission_amount")
                )["total"]
            ),
            "total_count": Commission.objects.count(),
            "pending_count": Commission.objects.filter(
                status=CommissionStatus.PENDING
            ).count(),
            "settled_count": Commission.objects.filter(
                status=CommissionStatus.SETTLED
            ).count(),
            "reversed_count": Commission.objects.filter(
                status=CommissionStatus.REVERSED
            ).count(),
        },

        # 📊 EMI Layer
        "emi": {
            "pending": pending_emis,
            "overdue": overdue_emis,
        },

        # 📦 Subscription Layer
        "subscriptions": {
            "active": active_subscriptions,
            "completed": completed_subscriptions,
            "won": won_subscriptions,
        },
        "portfolio_mix": {
            "emi": portfolio_mix.get(PlanType.EMI, 0),
            "rent": portfolio_mix.get(PlanType.RENT, 0),
            "lease": portfolio_mix.get(PlanType.LEASE, 0),
        },
        "crm": {
            "lead_pipeline": lead_pipeline,
            "open_leads": lead_pipeline["new"] + lead_pipeline["in_progress"] + lead_pipeline["contacted"],
        },

        # 🎲 Batch Layer
        "batches": {
            "total_batches": total_batches,
            "total_draws": total_draws,
            "live_batches": live_batch_count,
            "open_batches": open_batch_count,
            "next_draw_batch": next_draw_batch,
        },

        # ⚙️ Daily ops layer
        "collections": {
            "today_transaction_count": today_collections["today_transaction_count"],
            "today_active_transaction_count": today_collections["today_active_transaction_count"],
            "today_reversed_transaction_count": today_collections["today_reversed_transaction_count"],
            "today_active_payments": today_collections["today_active_payments"],
            "today_reversed_payments": today_collections["today_reversed_payments"],
            "today_gross_amount": today_collections["today_gross_amount"],
            "today_reversed_amount": today_collections["today_reversed_amount"],
            "today_net_amount": today_collections["today_net_amount"],
        },

        "recent_activity": recent_activity,

        "operations": {
            **canonical_metrics["operations"],
        },

        # 🧠 Risk Layer
        "risk": {
            "healthy": risk_stats["healthy"],
            "at_risk": risk_stats["at_risk"],
            "high_risk": risk_stats["high_risk"],
            "defaulted": risk_stats["defaulted"],
            "default_rate": default_rate,
        },

        # 🏦 System Health
        "financial_health": financial_health,
    }

    # ------------------------------
    # 9️⃣ Cache Result
    # ------------------------------
    cache.set(CACHE_KEY, dashboard_data, CACHE_TIMEOUT)

    return dashboard_data
