from __future__ import annotations

from django.db.models import Sum

from subscriptions.models import Customer, Emi, EmiStatus, MONEY_ZERO, Payment, SubscriptionStatus
from subscriptions.services.winner_state_service import winner_history_q


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
    subscriptions = customer.subscriptions.all()
    payments = Payment.objects.filter(customer=customer)
    emis = Emi.objects.filter(subscription__customer=customer)

    return {
        "total_subscriptions": subscriptions.count(),
        "active_subscriptions": subscriptions.filter(
            status=SubscriptionStatus.ACTIVE
        ).count(),
        "won_subscriptions": subscriptions.filter(winner_history_q()).distinct().count(),
        "completed_subscriptions": subscriptions.filter(
            status=SubscriptionStatus.COMPLETED
        ).count(),
        "pending_emis": emis.filter(status=EmiStatus.PENDING).count(),
        "paid_emis": emis.filter(status=EmiStatus.PAID).count(),
        "waived_emis": emis.filter(status=EmiStatus.WAIVED).count(),
        "total_paid_amount": str(
            payments.aggregate(total=Sum("amount"))["total"] or MONEY_ZERO
        ),
    }
