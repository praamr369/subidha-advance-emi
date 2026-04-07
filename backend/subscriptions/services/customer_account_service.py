from __future__ import annotations

from subscriptions.models import Customer
from subscriptions.services.subscription_financial_service import (
    build_customer_dashboard_summary,
    get_subscription_detail_queryset,
)


def sync_customer_login_identity(
    customer: Customer,
    *,
    name: str,
    phone: str,
    email: str,
    address: str,
    city: str,
) -> Customer:
    normalized_name = (name or "").strip()
    normalized_phone = (phone or "").strip()
    normalized_email = (email or "").strip()
    normalized_address = (address or "").strip()
    normalized_city = (city or "").strip()

    customer.name = normalized_name
    customer.phone = normalized_phone
    customer.address = normalized_address
    customer.city = normalized_city
    customer.save()

    user = customer.user
    user.phone = normalized_phone
    user.email = normalized_email
    user.first_name = normalized_name
    user.save()
    return customer


def build_customer_profile_summary(customer: Customer) -> dict[str, object]:
    subscriptions = list(
        get_subscription_detail_queryset()
        .filter(customer=customer)
        .order_by("-created_at", "-id")
    )
    summary = build_customer_dashboard_summary(subscriptions)

    return {
        "total_subscriptions": summary["subscription_count"],
        "active_subscriptions": summary["active_subscriptions"],
        "won_subscriptions": summary["winner_subscriptions"],
        "completed_subscriptions": summary["completed_subscriptions"],
        "pending_emis": summary["pending_emis"],
        "paid_emis": summary["paid_emis"],
        "waived_emis": summary["waived_emis"],
        "total_paid_amount": summary["total_paid_amount"],
    }
