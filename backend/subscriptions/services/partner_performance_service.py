"""
P5C — Partner Performance and Accountability Dashboard.

All functions are read-only. No Commission, Payout, Payment,
Subscription, EMI, AccountingBridgePosting, or StockLedger row
is created or mutated.

"Partner" in this system is a User with role="PARTNER".
Subscription.partner and Commission.partner are both FKs to AUTH_USER_MODEL.
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any


def build_partner_performance_snapshot(partner, as_of: date | None = None, period: dict | None = None) -> dict[str, Any]:
    """
    Build a read-only advisory performance snapshot for one partner (User with role PARTNER).

    Sources: Subscription, Payment, Commission, Emi, CustomerGrowthRequest.
    No record is created or mutated.
    """
    from subscriptions.models import (
        Commission, CommissionStatus, Emi, EmiStatus,
        Payment, Subscription, SubscriptionStatus,
    )

    as_of = as_of or date.today()

    # Subscriptions referred by this partner
    all_subs = Subscription.objects.filter(partner=partner)
    active_subs = all_subs.filter(status__in=[
        SubscriptionStatus.ACTIVE,
        SubscriptionStatus.HANDED_OVER,
    ]).count()
    completed_subs = all_subs.filter(status=SubscriptionStatus.COMPLETED).count()
    total_subs = all_subs.count()

    # Customer IDs from these subscriptions
    customer_ids = list(all_subs.values_list("customer_id", flat=True).distinct())

    # Collections (Payment has no status field — all payments are recorded collections)
    collections_total = Decimal("0")
    if customer_ids:
        try:
            payments = Payment.objects.filter(subscription__partner=partner)
            for p in payments:
                if p.amount:
                    collections_total += p.amount
        except Exception:
            pass

    # Overdue EMIs
    overdue_count = 0
    if customer_ids:
        try:
            overdue_count = Emi.objects.filter(
                subscription__partner=partner,
                status=EmiStatus.OVERDUE,
            ).count()
        except Exception:
            pass

    # Commission metrics (PENDING/SETTLED/REVERSED)
    commission_earned = Decimal("0")
    commission_approved = Decimal("0")
    commission_paid = Decimal("0")
    try:
        for c in Commission.objects.filter(partner=partner):
            amount = c.commission_amount or Decimal("0")
            if c.status != CommissionStatus.REVERSED:
                commission_earned += amount
            if c.status == CommissionStatus.SETTLED:
                commission_approved += amount
                commission_paid += amount
    except Exception:
        pass

    pending_commission = commission_earned - commission_paid

    # Growth requests from partner's customers
    growth_request_count = 0
    if customer_ids:
        try:
            from subscriptions.models_growth_requests import CustomerGrowthRequest
            growth_request_count = CustomerGrowthRequest.objects.filter(
                customer_id__in=customer_ids
            ).count()
        except Exception:
            pass

    risk_flags = _build_risk_flags(overdue_count, pending_commission)

    return {
        "partner_id": partner.pk,
        "partner_name": getattr(partner, "get_full_name", lambda: str(partner))() or str(partner),
        "as_of": as_of.isoformat(),
        "total_subscriptions": total_subs,
        "active_subscriptions": active_subs,
        "completed_subscriptions": completed_subs,
        "referred_customer_count": len(customer_ids),
        "collections_total": str(collections_total),
        "overdue_customer_count": overdue_count,
        "commission_earned": str(commission_earned),
        "commission_approved": str(commission_approved),
        "commission_paid": str(commission_paid),
        "pending_commission": str(pending_commission),
        "growth_request_count": growth_request_count,
        "risk_flags": risk_flags,
    }


def _build_risk_flags(overdue_count: int, pending_commission: Decimal) -> list[dict]:
    flags: list[dict] = []
    if overdue_count > 0:
        flags.append({
            "code": "OVERDUE_CUSTOMERS",
            "severity": "WARNING" if overdue_count < 5 else "HIGH",
            "message": f"{overdue_count} referred subscription(s) have overdue EMIs.",
        })
    if pending_commission > Decimal("10000"):
        flags.append({
            "code": "HIGH_PENDING_COMMISSION",
            "severity": "INFO",
            "message": f"Pending commission exceeds ₹10,000.",
        })
    return flags


def build_partner_risk_flags(partner, period: dict | None = None) -> list[dict]:
    overdue_count = 0
    try:
        from subscriptions.models import Emi, EmiStatus
        overdue_count = Emi.objects.filter(
            subscription__partner=partner,
            status=EmiStatus.OVERDUE,
        ).count()
    except Exception:
        pass
    return _build_risk_flags(overdue_count, Decimal("0"))


def build_partner_action_items(partner, period: dict | None = None) -> list[dict]:
    items: list[dict] = []
    try:
        from subscriptions.models import Emi, EmiStatus
        overdue = Emi.objects.filter(
            subscription__partner=partner,
            status=EmiStatus.OVERDUE,
        ).select_related("subscription__customer")[:10]
        for emi in overdue:
            items.append({
                "action_type": "FOLLOW_UP_OVERDUE",
                "customer_id": emi.subscription.customer_id,
                "emi_id": emi.pk,
                "due_date": emi.due_date.isoformat() if emi.due_date else None,
                "severity": "WARNING",
            })
    except Exception:
        pass
    return items


def list_partner_performance(period: dict | None = None, as_of: date | None = None) -> list[dict]:
    """
    Return read-only performance snapshots for all users with PARTNER role.
    No record is created or mutated.
    """
    from django.contrib.auth import get_user_model
    User = get_user_model()
    as_of = as_of or date.today()

    try:
        partners = User.objects.filter(role="PARTNER", is_active=True)
    except Exception:
        return []

    return [
        build_partner_performance_snapshot(p, as_of=as_of, period=period)
        for p in partners
    ]
