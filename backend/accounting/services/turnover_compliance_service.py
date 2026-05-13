from __future__ import annotations

from datetime import date
from decimal import Decimal

from django.db.models import Sum
from django.utils import timezone

from accounting.models import ComplianceAlertThreshold
from billing.models import DirectSale
from inventory.models import PurchaseBill, PurchaseBillStatus
from subscriptions.models import RentLeaseBillingDemand, RentLeaseDemandType

MONEY_ZERO = Decimal("0.00")


def _money(value) -> Decimal:
    return Decimal(str(value or MONEY_ZERO)).quantize(Decimal("0.01"))


def build_turnover_summary(*, start_date: date | None = None, end_date: date | None = None) -> dict:
    start = start_date or date(2000, 1, 1)
    end = end_date or timezone.localdate()

    direct_sale_turnover = _money(
        DirectSale.objects.exclude(
            status__in=[
                "CANCELLED",
                "CANCELLED_PRE_INVOICE",
                "CANCELLED_AFTER_DELIVERY",
                "REVERSED_POST_INVOICE",
                "ARCHIVED",
            ]
        )
        .filter(sale_date__gte=start, sale_date__lte=end)
        .aggregate(total=Sum("grand_total"))["total"]
    )

    rent_turnover = _money(
        RentLeaseBillingDemand.objects.filter(
            due_date__gte=start,
            due_date__lte=end,
            demand_type=RentLeaseDemandType.RENT_MONTHLY,
        ).aggregate(total=Sum("collected_amount"))["total"]
    )
    lease_turnover = _money(
        RentLeaseBillingDemand.objects.filter(
            due_date__gte=start,
            due_date__lte=end,
            demand_type=RentLeaseDemandType.LEASE_MONTHLY,
        ).aggregate(total=Sum("collected_amount"))["total"]
    )

    service_turnover = _money(
        DirectSale.objects.filter(
            sale_date__gte=start,
            sale_date__lte=end,
            source_reference__icontains="SERVICE",
        ).aggregate(total=Sum("grand_total"))["total"]
    )

    supplier_gst_as_cost = _money(
        PurchaseBill.objects.filter(
            bill_date__gte=start,
            bill_date__lte=end,
            status=PurchaseBillStatus.POSTED,
            tax_profile_snapshot__supplier_gst_as_cost=True,
        ).aggregate(total=Sum("tax_total"))["total"]
    )

    aggregate_turnover = _money(direct_sale_turnover + rent_turnover + lease_turnover + service_turnover)

    return {
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "aggregate_turnover": f"{aggregate_turnover:.2f}",
        "direct_sale_turnover": f"{direct_sale_turnover:.2f}",
        "rent_turnover": f"{rent_turnover:.2f}",
        "lease_turnover": f"{lease_turnover:.2f}",
        "service_turnover": f"{service_turnover:.2f}",
        "supplier_gst_paid_not_claimable": f"{supplier_gst_as_cost:.2f}",
        "interstate_sale_attempts": 0,
    }


def build_threshold_alerts(*, summary: dict) -> list[dict]:
    thresholds = {
        row.key: row
        for row in ComplianceAlertThreshold.objects.filter(is_active=True)
    }
    key_map = {
        "AGGREGATE_TURNOVER": "aggregate_turnover",
        "DIRECT_SALE_TURNOVER": "direct_sale_turnover",
        "RENT_TURNOVER": "rent_turnover",
        "LEASE_TURNOVER": "lease_turnover",
        "SERVICE_TURNOVER": "service_turnover",
        "SUPPLIER_GST_COST": "supplier_gst_paid_not_claimable",
    }
    alerts: list[dict] = []
    for threshold_key, value_key in key_map.items():
        threshold = thresholds.get(threshold_key)
        if threshold is None:
            continue
        current_value = Decimal(str(summary.get(value_key) or "0.00")).quantize(Decimal("0.01"))
        is_triggered = current_value >= threshold.threshold_amount
        alerts.append(
            {
                "key": threshold.key,
                "label": threshold.label,
                "threshold_amount": f"{threshold.threshold_amount:.2f}",
                "current_value": f"{current_value:.2f}",
                "triggered": is_triggered,
            }
        )
    return alerts
