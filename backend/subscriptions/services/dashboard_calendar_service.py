from datetime import date
from typing import Any, Dict, List

from django.contrib.auth import get_user_model
from django.db.models import QuerySet

from system_jobs.models import DashboardMemo


def _ev(id, date, title, source_type, href, is_completed, color, customer_name=None):
    return {
        "id": id,
        "date": date,
        "title": title,
        "source_type": source_type,
        "href": href,
        "is_completed": is_completed,
        "color": color,
        "customer_name": customer_name,
    }


def fetch_dashboard_calendar_events(start_date: date, end_date: date, user) -> List[Dict[str, Any]]:
    events: List[Dict[str, Any]] = []
    dr = [start_date, end_date]

    # 1. Custom Memos
    for m in DashboardMemo.objects.filter(user=user, date__range=dr):
        events.append(_ev(
            f"memo-{m.id}", m.date.isoformat(), m.title,
            "MEMO", "", m.is_completed, m.color_code or "slate",
        ))

    # 2. Subscription EMIs (Due)
    try:
        from subscriptions.models import Emi, EmiStatus
        emis = Emi.objects.filter(
            due_date__range=dr,
            status__in=[EmiStatus.PENDING, EmiStatus.OVERDUE]
        ).select_related('subscription', 'subscription__customer')
        for emi in emis:
            events.append(_ev(
                f"emi-{emi.id}", emi.due_date.isoformat(),
                f"EMI {emi.month_no} - {emi.subscription.subscription_number}",
                "SUBSCRIPTION_EMI", f"/admin/customers/subscriptions/{emi.subscription.id}",
                False, "red",
                emi.subscription.customer.name if emi.subscription.customer else None,
            ))
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning('Calendar events error in section %s: %s', '# 2. Subscription EMIs (Due)', str(e))

    # 3. Direct Sales (Outstanding)
    try:
        from billing.models import DirectSale
        ds = DirectSale.objects.filter(
            sale_date__range=dr, balance_total__gt=0
        ).exclude(status__in=["CANCELLED", "RETURNED", "ARCHIVED", "EXCHANGED_CLOSED"]).select_related('customer')
        for sale in ds:
            events.append(_ev(
                f"ds-{sale.id}", sale.sale_date.isoformat(),
                f"Direct Sale {sale.sale_no}", "DIRECT_SALE",
                f"/admin/billing/direct-sale/{sale.id}", False, "orange",
                sale.customer.name if sale.customer else None,
            ))
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning('Calendar events error in section %s: %s', '# 3. Direct Sales (Outstanding)', str(e))

    return events

