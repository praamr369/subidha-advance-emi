from decimal import Decimal, ROUND_HALF_UP

from django.db.models import Count, F, Q, Sum
from django.utils import timezone

from subscriptions.models import Commission, CommissionStatus, EmiStatus, MONEY_ZERO, Payment


def _money(value) -> str:
    return f"{_money_decimal(value):.2f}"


def _money_decimal(value) -> Decimal:
    return Decimal(str(value or MONEY_ZERO)).quantize(
        Decimal("0.01"),
        rounding=ROUND_HALF_UP,
    )


def _expected_commission(amount, rate) -> Decimal:
    return (
        _money_decimal(amount) * _money_decimal(rate) / Decimal("100.00")
    ).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _eligible_partner_payment_queryset(*, partner_id=None):
    queryset = (
        Payment.objects.select_related(
            "customer",
            "subscription",
            "subscription__partner",
            "emi",
            "verified_by",
        )
        .filter(subscription__partner__role="PARTNER")
        .exclude(allocation_metadata__reversal__is_reversed=True)
        .filter(Q(emi__isnull=True) | ~Q(emi__status=EmiStatus.WAIVED))
    )

    if partner_id:
        queryset = queryset.filter(subscription__partner_id=partner_id)

    return queryset


def get_filtered_commission_queryset(
    *,
    partner_id=None,
    status=None,
    subscription_id=None,
    payment_id=None,
    date_from=None,
    date_to=None,
):
    queryset = Commission.objects.select_related(
        "partner",
        "subscription",
        "subscription__customer",
        "subscription__batch",
        "subscription__lucky_id",
        "payment",
        "emi",
        "payout_line__payout_batch",
    ).order_by("-created_at", "-id")

    if partner_id:
        queryset = queryset.filter(partner_id=partner_id)

    if status:
        queryset = queryset.filter(status=status)

    if subscription_id:
        queryset = queryset.filter(subscription_id=subscription_id)

    if payment_id:
        queryset = queryset.filter(payment_id=payment_id)

    if date_from:
        queryset = queryset.filter(created_at__date__gte=date_from)

    if date_to:
        queryset = queryset.filter(created_at__date__lte=date_to)

    return queryset


def build_commission_summary(
    *,
    partner_id=None,
    status=None,
    subscription_id=None,
    payment_id=None,
    date_from=None,
    date_to=None,
):
    queryset = get_filtered_commission_queryset(
        partner_id=partner_id,
        status=status,
        subscription_id=subscription_id,
        payment_id=payment_id,
        date_from=date_from,
        date_to=date_to,
    )

    total_commission = (
        queryset.exclude(status=CommissionStatus.REVERSED)
        .aggregate(total=Sum("commission_amount"))["total"]
        or MONEY_ZERO
    )
    pending_commission = (
        queryset.filter(status=CommissionStatus.PENDING)
        .aggregate(total=Sum("commission_amount"))["total"]
        or MONEY_ZERO
    )
    settled_commission = (
        queryset.filter(status=CommissionStatus.SETTLED)
        .aggregate(total=Sum("commission_amount"))["total"]
        or MONEY_ZERO
    )
    reversed_commission = (
        queryset.filter(status=CommissionStatus.REVERSED)
        .aggregate(total=Sum("commission_amount"))["total"]
        or MONEY_ZERO
    )

    status_counts = queryset.aggregate(
        total_count=Count("id"),
        pending_count=Count("id", filter=Q(status=CommissionStatus.PENDING)),
        settled_count=Count("id", filter=Q(status=CommissionStatus.SETTLED)),
        reversed_count=Count("id", filter=Q(status=CommissionStatus.REVERSED)),
    )

    per_partner_rows = (
        queryset.values("partner_id", "partner__username")
        .annotate(
            commission_count=Count("id"),
            total_commission=Sum(
                "commission_amount",
                filter=~Q(status=CommissionStatus.REVERSED),
            ),
            pending_commission=Sum(
                "commission_amount",
                filter=Q(status=CommissionStatus.PENDING),
            ),
            settled_commission=Sum(
                "commission_amount",
                filter=Q(status=CommissionStatus.SETTLED),
            ),
            reversed_commission=Sum(
                "commission_amount",
                filter=Q(status=CommissionStatus.REVERSED),
            ),
        )
        .order_by("partner__username", "partner_id")
    )

    return {
        "summary": {
            "total_commission": _money(total_commission),
            "pending_commission": _money(pending_commission),
            "settled_commission": _money(settled_commission),
            "reversed_commission": _money(reversed_commission),
            "total_count": status_counts["total_count"] or 0,
            "pending_count": status_counts["pending_count"] or 0,
            "settled_count": status_counts["settled_count"] or 0,
            "reversed_count": status_counts["reversed_count"] or 0,
        },
        "per_partner": [
            {
                "partner_id": row["partner_id"],
                "partner_username": row["partner__username"] or "",
                "total_commission": _money(row["total_commission"]),
                "pending_commission": _money(row["pending_commission"]),
                "settled_commission": _money(row["settled_commission"]),
                "reversed_commission": _money(row["reversed_commission"]),
                "commission_count": row["commission_count"],
            }
            for row in per_partner_rows
        ],
    }


def _serialize_payment_row(payment):
    partner = getattr(payment.subscription, "partner", None)
    customer = getattr(payment, "customer", None)
    subscription = getattr(payment, "subscription", None)
    emi = getattr(payment, "emi", None)
    return {
        "payment_id": payment.id,
        "payment_reference_no": payment.reference_no,
        "payment_amount": _money(payment.amount),
        "payment_date": payment.payment_date.isoformat() if payment.payment_date else None,
        "partner_id": getattr(partner, "id", None),
        "partner_username": getattr(partner, "username", "") or "",
        "customer_name": getattr(customer, "name", "") or "",
        "customer_phone": getattr(customer, "phone", "") or "",
        "subscription_id": payment.subscription_id,
        "subscription_number": f"SUB-{payment.subscription_id}" if payment.subscription_id else None,
        "emi_id": payment.emi_id,
        "emi_month_no": getattr(emi, "month_no", None),
        "verified_by_id": payment.verified_by_id,
        "commission_rate": _money(getattr(partner, "commission_rate", MONEY_ZERO)),
        "expected_commission_amount": _money(
            _expected_commission(
                payment.amount,
                getattr(partner, "commission_rate", MONEY_ZERO),
            )
        ),
    }


def _serialize_commission_row(commission):
    partner = getattr(commission, "partner", None)
    payment = getattr(commission, "payment", None)
    subscription = getattr(commission, "subscription", None)
    customer = getattr(subscription, "customer", None) if subscription else None
    payout_line = getattr(commission, "payout_line", None)
    payout_batch = getattr(payout_line, "payout_batch", None) if payout_line else None
    return {
        "commission_id": commission.id,
        "partner_id": commission.partner_id,
        "partner_username": getattr(partner, "username", "") or "",
        "subscription_id": commission.subscription_id,
        "subscription_number": f"SUB-{commission.subscription_id}" if commission.subscription_id else None,
        "payment_id": commission.payment_id,
        "payment_reference_no": getattr(payment, "reference_no", None),
        "customer_name": getattr(customer, "name", "") or "",
        "customer_phone": getattr(customer, "phone", "") or "",
        "commission_rate": _money(commission.commission_rate),
        "commission_amount": _money(commission.commission_amount),
        "status": commission.status,
        "settlement_date": commission.settlement_date.isoformat()
        if commission.settlement_date
        else None,
        "payout_batch_id": getattr(payout_batch, "id", None),
        "payout_batch_code": getattr(payout_batch, "batch_code", None),
        "reversal_reason": commission.reversal_reason,
    }


def build_commission_reconciliation_snapshot(*, partner_id=None, limit=25):
    summary = build_commission_summary(partner_id=partner_id)

    payment_base = _eligible_partner_payment_queryset(partner_id=partner_id)

    payments_missing_commission_qs = (
        payment_base.filter(
            subscription__partner__commission_rate__gt=MONEY_ZERO,
            commission__isnull=True,
        )
        .order_by("-payment_date", "-id")
    )

    commission_base = Commission.objects.select_related(
        "partner",
        "subscription",
        "subscription__customer",
        "payment",
        "payment__subscription",
        "payout_line__payout_batch",
    ).order_by("-created_at", "-id")

    if partner_id:
        commission_base = commission_base.filter(partner_id=partner_id)

    commissions_without_valid_payment_qs = commission_base.filter(
        Q(payment__isnull=True)
        | Q(subscription__isnull=True)
        | ~Q(payment__subscription_id=F("subscription_id"))
        | ~Q(payment__subscription__partner_id=F("partner_id"))
    )

    commissions_on_reversed_payments_qs = commission_base.filter(
        payment__allocation_metadata__reversal__is_reversed=True,
    )

    commissions_zero_rate_or_non_partner_qs = commission_base.filter(
        Q(commission_rate__lte=MONEY_ZERO)
        | ~Q(partner__role="PARTNER")
    )

    partner_rollups: dict[int, dict] = {}

    payment_projection_rows = payment_base.filter(
        subscription__partner__commission_rate__gt=MONEY_ZERO,
    ).values(
        "subscription__partner_id",
        "subscription__partner__username",
        "subscription__partner__commission_rate",
        "amount",
        "commission__id",
    )
    for row in payment_projection_rows.iterator(chunk_size=1000):
        partner_key = row["subscription__partner_id"]
        bucket = partner_rollups.setdefault(
            partner_key,
            {
                "partner_id": partner_key,
                "partner_username": row["subscription__partner__username"] or "",
                "current_commission_rate": _money_decimal(
                    row["subscription__partner__commission_rate"]
                ),
                "payment_count": 0,
                "expected_commission_total": MONEY_ZERO,
                "actual_commission_total": MONEY_ZERO,
                "pending_commission": MONEY_ZERO,
                "settled_commission": MONEY_ZERO,
                "commission_count": 0,
                "missing_commission_count": 0,
                "rate_drift_count": 0,
            },
        )
        bucket["payment_count"] += 1
        bucket["expected_commission_total"] += _expected_commission(
            row["amount"],
            row["subscription__partner__commission_rate"],
        )
        if row["commission__id"] is None:
            bucket["missing_commission_count"] += 1

    actual_partner_rows = (
        Commission.objects.select_related("partner")
        .filter(partner__role="PARTNER")
        .exclude(status=CommissionStatus.REVERSED)
    )
    if partner_id:
        actual_partner_rows = actual_partner_rows.filter(partner_id=partner_id)

    actual_partner_rows = (
        actual_partner_rows.values("partner_id", "partner__username")
        .annotate(
            pending_commission=Sum(
                "commission_amount",
                filter=Q(status=CommissionStatus.PENDING),
            ),
            settled_commission=Sum(
                "commission_amount",
                filter=Q(status=CommissionStatus.SETTLED),
            ),
            actual_commission_total=Sum("commission_amount"),
            commission_count=Count("id"),
            rate_drift_count=Count(
                "id",
                filter=~Q(commission_rate=F("partner__commission_rate")),
            ),
        )
    )

    for row in actual_partner_rows:
        bucket = partner_rollups.setdefault(
            row["partner_id"],
            {
                "partner_id": row["partner_id"],
                "partner_username": row["partner__username"] or "",
                "current_commission_rate": MONEY_ZERO,
                "payment_count": 0,
                "expected_commission_total": MONEY_ZERO,
                "actual_commission_total": MONEY_ZERO,
                "pending_commission": MONEY_ZERO,
                "settled_commission": MONEY_ZERO,
                "commission_count": 0,
                "missing_commission_count": 0,
                "rate_drift_count": 0,
            },
        )
        bucket["partner_username"] = row["partner__username"] or bucket["partner_username"]
        bucket["actual_commission_total"] = _money_decimal(row["actual_commission_total"])
        bucket["pending_commission"] = _money_decimal(row["pending_commission"])
        bucket["settled_commission"] = _money_decimal(row["settled_commission"])
        bucket["commission_count"] = row["commission_count"] or 0
        bucket["rate_drift_count"] = row["rate_drift_count"] or 0

    partner_breakdown = []
    expected_total = MONEY_ZERO
    actual_total = MONEY_ZERO
    partner_mismatch_count = 0
    rate_drift_partner_count = 0

    for row in sorted(
        partner_rollups.values(),
        key=lambda item: (
            -item["expected_commission_total"],
            item["partner_username"],
            item["partner_id"],
        ),
    ):
        mismatch_amount = (
            row["expected_commission_total"] - row["actual_commission_total"]
        ).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        has_mismatch = mismatch_amount != MONEY_ZERO
        has_rate_drift = row["rate_drift_count"] > 0

        if has_mismatch:
            partner_mismatch_count += 1
        if has_rate_drift:
            rate_drift_partner_count += 1

        expected_total += row["expected_commission_total"]
        actual_total += row["actual_commission_total"]

        partner_breakdown.append(
            {
                "partner_id": row["partner_id"],
                "partner_username": row["partner_username"],
                "current_commission_rate": _money(row["current_commission_rate"]),
                "payment_count": row["payment_count"],
                "commission_count": row["commission_count"],
                "missing_commission_count": row["missing_commission_count"],
                "pending_commission": _money(row["pending_commission"]),
                "settled_commission": _money(row["settled_commission"]),
                "expected_commission_total": _money(row["expected_commission_total"]),
                "actual_commission_total": _money(row["actual_commission_total"]),
                "total_commission": _money(row["actual_commission_total"]),
                "mismatch_amount": _money(mismatch_amount),
                "has_mismatch": has_mismatch,
                "has_rate_drift": has_rate_drift,
            }
        )

    summary["summary"]["expected_commission_total"] = _money(expected_total)
    summary["summary"]["actual_commission_total"] = _money(actual_total)
    summary["summary"]["partner_mismatch_count"] = partner_mismatch_count
    summary["summary"]["rate_drift_partner_count"] = rate_drift_partner_count

    return {
        "snapshot_generated_at": timezone.now().isoformat(),
        "filters": {
            "partner": int(partner_id) if partner_id else None,
        },
        "overview": summary["summary"],
        "partner_breakdown": partner_breakdown,
        "warnings": {
            "payments_missing_commission": {
                "count": payments_missing_commission_qs.count(),
                "total_payment_amount": _money(
                    payments_missing_commission_qs.aggregate(total=Sum("amount"))["total"]
                ),
                "results": [
                    _serialize_payment_row(payment)
                    for payment in payments_missing_commission_qs[:limit]
                ],
            },
            "commissions_without_valid_payment": {
                "count": commissions_without_valid_payment_qs.count(),
                "total_commission_amount": _money(
                    commissions_without_valid_payment_qs.aggregate(total=Sum("commission_amount"))["total"]
                ),
                "results": [
                    _serialize_commission_row(commission)
                    for commission in commissions_without_valid_payment_qs[:limit]
                ],
            },
            "commissions_on_reversed_payments": {
                "count": commissions_on_reversed_payments_qs.count(),
                "total_commission_amount": _money(
                    commissions_on_reversed_payments_qs.aggregate(total=Sum("commission_amount"))["total"]
                ),
                "results": [
                    _serialize_commission_row(commission)
                    for commission in commissions_on_reversed_payments_qs[:limit]
                ],
            },
            "commissions_zero_rate_or_non_partner": {
                "count": commissions_zero_rate_or_non_partner_qs.count(),
                "total_commission_amount": _money(
                    commissions_zero_rate_or_non_partner_qs.aggregate(total=Sum("commission_amount"))["total"]
                ),
                "results": [
                    _serialize_commission_row(commission)
                    for commission in commissions_zero_rate_or_non_partner_qs[:limit]
                ],
            },
        },
    }
