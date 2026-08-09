"""
P5D — Customer Retention and Reminder Intelligence.

All functions are read-only advisory. No Payment, EMI, Subscription,
Document, StockLedger, LuckyDraw, Commission, or Payout record is created
or mutated. No SMS/WhatsApp/email is sent.
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any


# ─────────────────────────────────────────────────────────────────────────────
# Signal classifiers
# ─────────────────────────────────────────────────────────────────────────────

def _overdue_emi_signal(customer) -> list[dict]:
    signals = []
    try:
        from subscriptions.models import Emi, EmiStatus
        overdue_emis = Emi.objects.filter(
            subscription__customer=customer,
            status=EmiStatus.OVERDUE,
        ).select_related("subscription")[:5]
        for emi in overdue_emis:
            signals.append({
                "signal_type": "OVERDUE_EMI",
                "severity": "HIGH",
                "due_date": emi.due_date.isoformat() if emi.due_date else None,
                "source_model": "Emi",
                "source_id": emi.pk,
                "subscription_id": emi.subscription_id,
                "suggested_action": "Follow up on overdue EMI payment.",
            })
    except Exception:
        pass
    return signals


def _upcoming_emi_signal(customer, as_of: date) -> list[dict]:
    signals = []
    try:
        from subscriptions.models import Emi, EmiStatus
        upcoming = Emi.objects.filter(
            subscription__customer=customer,
            status=EmiStatus.PENDING,
            due_date__gte=as_of,
            due_date__lte=as_of + timedelta(days=7),
        ).select_related("subscription")[:3]
        for emi in upcoming:
            signals.append({
                "signal_type": "UPCOMING_EMI",
                "severity": "INFO",
                "due_date": emi.due_date.isoformat() if emi.due_date else None,
                "source_model": "Emi",
                "source_id": emi.pk,
                "subscription_id": emi.subscription_id,
                "suggested_action": "Send payment reminder for upcoming EMI.",
            })
    except Exception:
        pass
    return signals


def _high_risk_signal(customer) -> list[dict]:
    try:
        profile = customer.risk_profile
        if profile.risk_band in ("HIGH", "BLOCKED"):
            return [{
                "signal_type": "HIGH_RISK",
                "severity": "HIGH" if profile.risk_band == "HIGH" else "CRITICAL",
                "source_model": "CustomerRiskProfile",
                "source_id": profile.pk,
                "suggested_action": "Review customer risk profile and KYC status.",
                "risk_band": profile.risk_band,
            }]
    except Exception:
        pass
    return []


def _rejected_document_signal(customer) -> list[dict]:
    signals = []
    try:
        from subscriptions.models import KycDocument, KycStatus
        rejected = KycDocument.objects.filter(
            customer=customer,
            is_required=True,
            status=KycStatus.REJECTED,
        )[:3]
        for doc in rejected:
            signals.append({
                "signal_type": "REJECTED_REQUIRED_DOCUMENT",
                "severity": "WARNING",
                "source_model": "KycDocument",
                "source_id": doc.pk,
                "suggested_action": "Customer must resubmit rejected required KYC document.",
            })
    except Exception:
        pass
    return signals


def _renewal_opportunity_signal(customer, as_of: date) -> list[dict]:
    signals = []
    try:
        from subscriptions.models import Subscription, SubscriptionStatus
        near_end = Subscription.objects.filter(
            customer=customer,
            status__in=[SubscriptionStatus.ACTIVE, SubscriptionStatus.HANDED_OVER],
            end_date__gte=as_of,
            end_date__lte=as_of + timedelta(days=30),
        )[:2]
        for sub in near_end:
            signals.append({
                "signal_type": "RENEWAL_OPPORTUNITY",
                "severity": "INFO",
                "due_date": sub.end_date.isoformat() if sub.end_date else None,
                "source_model": "Subscription",
                "source_id": sub.pk,
                "subscription_id": sub.pk,
                "suggested_action": "Contact customer about contract renewal.",
            })
    except Exception:
        pass
    return signals


def _pending_growth_request_signal(customer) -> list[dict]:
    signals = []
    try:
        from subscriptions.models_growth_requests import CustomerGrowthRequest, GrowthRequestStatus
        pending = CustomerGrowthRequest.objects.filter(
            customer=customer,
            status__in=[
                GrowthRequestStatus.SUBMITTED,
                GrowthRequestStatus.UNDER_REVIEW,
            ],
        )[:3]
        for req in pending:
            signals.append({
                "signal_type": "PENDING_GROWTH_REQUEST",
                "severity": "INFO",
                "source_model": "CustomerGrowthRequest",
                "source_id": req.pk,
                "request_type": req.request_type,
                "suggested_action": f"Review pending {req.request_type} request {req.request_number}.",
            })
    except Exception:
        pass
    return signals


def _rent_lease_overdue_signal(customer) -> list[dict]:
    signals = []
    try:
        from subscriptions.models import RentLeaseBillingDemand, RentLeaseDemandStatus
        overdue_demands = RentLeaseBillingDemand.objects.filter(
            contract__customer=customer,
            status__in=[RentLeaseDemandStatus.OVERDUE, RentLeaseDemandStatus.PENDING],
        )[:3]
        for demand in overdue_demands:
            signals.append({
                "signal_type": "RENT_LEASE_DEMAND_OVERDUE",
                "severity": "HIGH",
                "due_date": demand.due_date.isoformat() if demand.due_date else None,
                "source_model": "RentLeaseBillingDemand",
                "source_id": demand.pk,
                "suggested_action": "Follow up on overdue rent/lease billing demand.",
            })
    except Exception:
        pass
    return signals


# ─────────────────────────────────────────────────────────────────────────────
# Main service functions
# ─────────────────────────────────────────────────────────────────────────────

def classify_retention_signal(source: dict) -> str:
    """Return a short classification label for a retention signal dict."""
    return source.get("signal_type", "UNKNOWN")


def build_customer_retention_profile(customer, as_of: date | None = None) -> dict[str, Any]:
    """
    Build a read-only retention profile for a customer.

    Returns signals with severity, suggested actions, and source references.
    No record is created or mutated.
    """
    as_of = as_of or date.today()
    signals: list[dict] = []

    signals.extend(_overdue_emi_signal(customer))
    signals.extend(_upcoming_emi_signal(customer, as_of))
    signals.extend(_rent_lease_overdue_signal(customer))
    signals.extend(_high_risk_signal(customer))
    signals.extend(_rejected_document_signal(customer))
    signals.extend(_renewal_opportunity_signal(customer, as_of))
    signals.extend(_pending_growth_request_signal(customer))

    severity_order = {"CRITICAL": 0, "HIGH": 1, "WARNING": 2, "INFO": 3}
    signals.sort(key=lambda s: severity_order.get(s.get("severity", "INFO"), 99))

    return {
        "customer_id": customer.pk,
        "as_of": as_of.isoformat(),
        "signal_count": len(signals),
        "signals": signals,
        "has_critical": any(s["severity"] == "CRITICAL" for s in signals),
        "has_high": any(s["severity"] == "HIGH" for s in signals),
    }


def list_retention_opportunities(as_of: date | None = None, filters: dict | None = None) -> list[dict]:
    """
    Return retention profiles for all customers with at least one signal.
    No record is created or mutated.
    """
    from subscriptions.models import Customer
    as_of = as_of or date.today()

    results = []
    for customer in Customer.objects.all().iterator(chunk_size=200):
        profile = build_customer_retention_profile(customer, as_of=as_of)
        if profile["signal_count"] > 0:
            results.append(profile)

    results.sort(
        key=lambda p: (
            0 if p["has_critical"] else 1 if p["has_high"] else 2,
            -p["signal_count"],
        )
    )
    return results


def build_retention_action_items(customer=None, as_of: date | None = None) -> list[dict]:
    """Return flat list of suggested action items for admin follow-up."""
    as_of = as_of or date.today()
    if customer is not None:
        profile = build_customer_retention_profile(customer, as_of=as_of)
        return profile["signals"]

    all_profiles = list_retention_opportunities(as_of=as_of)
    items = []
    for p in all_profiles[:50]:
        for s in p["signals"]:
            items.append({**s, "customer_id": p["customer_id"]})
    return items
