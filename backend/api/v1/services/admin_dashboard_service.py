from django.utils.timezone import now
from django.db.models import Sum, Count
from django.core.cache import cache

from subscriptions.models import (
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


def build_admin_dashboard():

    # ------------------------------
    # 1️⃣ Try cache first
    # ------------------------------
    cached = cache.get(CACHE_KEY)
    if cached:
        return cached

    today = now().date()

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