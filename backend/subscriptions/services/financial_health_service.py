from django.db.models import Sum
from subscriptions.models import (
    Subscription,
    Emi,
    Payment,
    Batch,
    EmiStatus,
    SubscriptionStatus,
)


def system_financial_health():

    # =============================
    # SYSTEM-WIDE TOTALS
    # =============================

    total_paid = (
        Payment.objects.aggregate(total=Sum("amount"))["total"] or 0
    )

    total_waived = (
        Subscription.objects.aggregate(total=Sum("waived_amount"))["total"] or 0
    )

    total_outstanding = (
        Emi.objects.filter(status=EmiStatus.PENDING)
        .aggregate(total=Sum("amount"))["total"] or 0
    )

    total_receivable = total_paid + total_waived + total_outstanding

    # =============================
    # DEFAULT EXPOSURE
    # =============================

    defaulted_subs = Subscription.objects.filter(
        status=SubscriptionStatus.DEFAULTED
    )

    default_exposure = (
        Emi.objects.filter(
            subscription__in=defaulted_subs,
            status=EmiStatus.PENDING
        ).aggregate(total=Sum("amount"))["total"] or 0
    )

    total_active = Subscription.objects.filter(
        status=SubscriptionStatus.ACTIVE
    ).count()

    total_defaulted = defaulted_subs.count()

    default_rate = (
        total_defaulted / total_active
        if total_active > 0 else 0
    )

    health_score = round(100 - (default_rate * 100), 2)

    # =============================
    # BATCH LIABILITY
    # =============================

    batch_liabilities = []

    for batch in Batch.objects.all():

        batch_outstanding = (
            Emi.objects.filter(
                subscription__batch=batch,
                status=EmiStatus.PENDING
            ).aggregate(total=Sum("amount"))["total"] or 0
        )

        batch_liabilities.append({
            "batch_code": batch.batch_code,
            "outstanding": batch_outstanding,
        })

    return {
        "total_paid": total_paid,
        "total_waived": total_waived,
        "total_outstanding": total_outstanding,
        "total_receivable": total_receivable,
        "default_exposure": default_exposure,
        "default_rate": default_rate,
        "health_score": health_score,
        "batch_liabilities": batch_liabilities,
    }