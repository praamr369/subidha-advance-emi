from datetime import date

from django.db.models import Count, Sum
from django.core.cache import cache
from django.utils import timezone

from subscriptions.models import (
    BatchStatus,
    Emi,
    Payment,
    Subscription,
    EmiStatus,
    SubscriptionStatus,
    Batch,
    LuckyDraw,
)

from subscriptions.services.risk_service import evaluate_all_active_subscriptions
from subscriptions.services.financial_health_service import system_financial_health


CACHE_KEY = "admin_dashboard_v1"
CACHE_TIMEOUT = 60  # seconds


def _next_draw_date_for_batch(today: date, draw_day: int) -> date:
    if today.day <= draw_day:
        return today.replace(day=draw_day)

    if today.month == 12:
        return date(today.year + 1, 1, draw_day)

    return date(today.year, today.month + 1, draw_day)


def build_admin_dashboard():

    # ------------------------------
    # 1️⃣ Try cache first
    # ------------------------------
    cached = cache.get(CACHE_KEY)
    if cached:
        return cached

    today = timezone.localdate()

    # ------------------------------
    # 2️⃣ Risk Engine
    # ------------------------------
    risk_stats = evaluate_all_active_subscriptions()

    total_active = Subscription.objects.filter(
        status=SubscriptionStatus.ACTIVE
    ).count()

    default_rate = (
        risk_stats["defaulted"] / total_active
        if total_active > 0 else 0
    )

    # ------------------------------
    # 3️⃣ Financial Metrics
    # ------------------------------
    total_revenue = Payment.objects.aggregate(
        total=Sum("amount")
    )["total"] or 0

    today_collection = Payment.objects.filter(
        payment_date=today
    ).aggregate(total=Sum("amount"))["total"] or 0

    today_payment_queryset = Payment.objects.select_related(
        "customer",
        "subscription",
        "subscription__batch",
        "subscription__lucky_id",
    ).filter(payment_date=today)

    today_reversed_queryset = today_payment_queryset.filter(
        allocation_metadata__reversal__is_reversed=True
    )
    today_active_queryset = today_payment_queryset.exclude(
        allocation_metadata__reversal__is_reversed=True
    )

    today_gross_amount = (
        today_payment_queryset.aggregate(total=Sum("amount"))["total"] or 0
    )
    today_reversed_amount = (
        today_reversed_queryset.aggregate(total=Sum("amount"))["total"] or 0
    )
    today_net_amount = (
        today_active_queryset.aggregate(total=Sum("amount"))["total"] or 0
    )

    total_outstanding = Emi.objects.filter(
        status=EmiStatus.PENDING
    ).aggregate(total=Sum("amount"))["total"] or 0

    # ------------------------------
    # 4️⃣ EMI Stats
    # ------------------------------
    pending_emis = Emi.objects.filter(
        status=EmiStatus.PENDING
    ).count()

    overdue_emis = Emi.objects.filter(
        status=EmiStatus.PENDING,
        due_date__lt=today
    ).count()

    # ------------------------------
    # 5️⃣ Subscription Stats
    # ------------------------------
    active_subscriptions = total_active

    completed_subscriptions = Subscription.objects.filter(
        status=SubscriptionStatus.COMPLETED
    ).count()

    won_subscriptions = Subscription.objects.filter(
        status=SubscriptionStatus.WON
    ).count()

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
    dashboard_data = {

        # 💰 Financial Layer
        "financial": {
            "total_revenue": total_revenue,
            "today_collection": today_collection,
            "total_outstanding": total_outstanding,
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
            "today_transaction_count": today_payment_queryset.count(),
            "today_active_payments": today_active_queryset.count(),
            "today_reversed_payments": today_reversed_queryset.count(),
            "today_gross_amount": str(today_gross_amount),
            "today_reversed_amount": str(today_reversed_amount),
            "today_net_amount": str(today_net_amount),
        },

        "recent_activity": recent_activity,

        "operations": {
            "due_today_emis": Emi.objects.filter(
                status=EmiStatus.PENDING,
                due_date=today,
            ).count(),
            "overdue_emis": overdue_emis,
            "open_batches": open_batch_count,
            "next_draw_batch": next_draw_batch,
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
