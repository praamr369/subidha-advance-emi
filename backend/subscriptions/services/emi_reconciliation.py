from decimal import Decimal
from django.core.exceptions import ValidationError
from django.db.models import Sum, Count, Max

from subscriptions.models import EmiStatus, SubscriptionStatus


def reconcile_subscription_emis(subscription):
    """
    Deep financial integrity validation.
    Raises ValidationError if corruption detected.
    """

    emis = subscription.emis.all().order_by("month_no")

    # ----------------------------------------------------
    # 1️⃣ EMI Count Must Match Tenure
    # ----------------------------------------------------

    if emis.count() != subscription.tenure_months:
        raise ValidationError("EMI count does not match tenure.")

    # ----------------------------------------------------
    # 2️⃣ No Duplicate Month Numbers
    # ----------------------------------------------------

    duplicates = (
        emis.values("month_no")
        .annotate(c=Count("id"))
        .filter(c__gt=1)
    )

    if duplicates.exists():
        raise ValidationError("Duplicate EMI month numbers detected.")

    # ----------------------------------------------------
    # 3️⃣ Month Continuity Check (1..tenure)
    # ----------------------------------------------------

    expected_months = set(range(1, subscription.tenure_months + 1))
    actual_months = set(emis.values_list("month_no", flat=True))

    if expected_months != actual_months:
        raise ValidationError("EMI month sequence corrupted.")

    # ----------------------------------------------------
    # 4️⃣ No EMI Beyond Tenure
    # ----------------------------------------------------

    max_month = emis.aggregate(max_m=Max("month_no"))["max_m"]

    if max_month > subscription.tenure_months:
        raise ValidationError("EMI month exceeds tenure.")

    # ----------------------------------------------------
    # 5️⃣ Sum Validation
    # ----------------------------------------------------

    total = emis.aggregate(total=Sum("amount"))["total"] or Decimal("0.00")

    if total != subscription.total_amount:
        raise ValidationError(
            f"EMI total mismatch. Expected {subscription.total_amount}, got {total}"
        )

    # ----------------------------------------------------
    # 6️⃣ Negative EMI Protection
    # ----------------------------------------------------

    if emis.filter(amount__lt=0).exists():
        raise ValidationError("Negative EMI detected.")

    # ----------------------------------------------------
    # 7️⃣ Payment Integrity Check
    # ----------------------------------------------------

    for emi in emis:
        paid = emi.payments.aggregate(
            total=Sum("amount")
        )["total"] or Decimal("0.00")

        if paid > emi.amount:
            raise ValidationError(
                f"Overpayment detected on EMI month {emi.month_no}"
            )

    # ----------------------------------------------------
    # 8️⃣ Winner Logic Consistency
    # ----------------------------------------------------

    if subscription.status == SubscriptionStatus.WON:

        if not subscription.winner_month:
            raise ValidationError("Winner month missing for WON subscription.")

        post_winner_emis = emis.filter(
            month_no__gt=subscription.winner_month
        )

        if post_winner_emis.exclude(status=EmiStatus.WAIVED).exists():
            raise ValidationError(
                "Post-winner EMIs must be WAIVED."
            )

    # ----------------------------------------------------
    # 9️⃣ Completion Consistency
    # ----------------------------------------------------

    remaining = emis.exclude(
        status__in=[EmiStatus.PAID, EmiStatus.WAIVED]
    )

    if not remaining.exists():
        if subscription.status not in [
            SubscriptionStatus.COMPLETED,
            SubscriptionStatus.WON,
        ]:
            raise ValidationError(
                "Subscription status inconsistent with EMI completion."
            )

    return True