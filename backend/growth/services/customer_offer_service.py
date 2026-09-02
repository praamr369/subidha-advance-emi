"""
Per-customer offer eligibility and grants.

Two layers, deliberately separate:

* **Segments** (``OfferPackage.audience_type``) decide whether a customer is a
  *candidate* for an offer. Candidacy alone never changes a price.
* **Grants** (``CustomerOfferGrant``) are what actually move a price, and only
  once a person has approved them. This keeps margin decisions with staff
  rather than handing discounts out automatically.

Applies on authenticated surfaces only — the customer portal and admin quoting.
The anonymous public catalogue has no customer, so it is unaffected.
"""
from __future__ import annotations

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

SEGMENT_ALL = "ALL"
SEGMENT_NEW = "NEW_CUSTOMER"
SEGMENT_EXISTING = "EXISTING_CUSTOMER"
SEGMENT_PARTNER = "PARTNER_REFERRED"
SEGMENT_HIGH_TRUST = "HIGH_TRUST_CUSTOMER"


# ── segment membership ───────────────────────────────────────────────────────

def _contract_count(customer) -> int:
    """How many contracts this customer has ever held."""
    try:
        from subscriptions.models import Subscription

        return Subscription.objects.filter(customer=customer).count()
    except Exception:  # noqa: BLE001 - segment checks must not break pricing
        return 0


def _is_partner_referred(customer) -> bool:
    try:
        from subscriptions.models import Subscription

        return Subscription.objects.filter(
            customer=customer, referred_by__isnull=False
        ).exists()
    except Exception:  # noqa: BLE001
        return False


def _risk_band(customer) -> str:
    try:
        return customer.risk_profile.risk_band or "LOW"
    except Exception:  # noqa: BLE001 - no profile means no adverse signal
        return "LOW"


def customer_matches_segment(customer, audience_type: str) -> tuple[bool, str]:
    """
    Does this customer belong to the offer's audience?

    Returns (matches, reason). Unlike the previous advisory implementation this
    genuinely excludes non-members — an offer aimed at new customers must not
    quietly apply to everyone.
    """
    if audience_type == SEGMENT_ALL:
        return True, ""

    if customer is None:
        return False, "Offer targets a customer segment and no customer was supplied."

    if audience_type == SEGMENT_NEW:
        if _contract_count(customer) == 0:
            return True, ""
        return False, "Offer is for new customers; this customer already holds contracts."

    if audience_type == SEGMENT_EXISTING:
        if _contract_count(customer) > 0:
            return True, ""
        return False, "Offer is for existing customers; this customer has no contracts yet."

    if audience_type == SEGMENT_PARTNER:
        if _is_partner_referred(customer):
            return True, ""
        return False, "Offer is for partner-referred customers; no partner referral found."

    if audience_type == SEGMENT_HIGH_TRUST:
        band = _risk_band(customer)
        if band == "LOW":
            return True, ""
        return False, f"Offer is for high-trust customers; risk band is {band}."

    # Unknown audience: fail closed rather than hand out a discount.
    return False, f"Unrecognised audience type '{audience_type}'."


# ── candidates ───────────────────────────────────────────────────────────────

def list_candidate_offers(customer, plan_type=None, on_date=None) -> list[dict]:
    """
    Offers this customer could be granted: live packages whose segment they match
    and which they do not already hold a live grant for.

    Advisory only — nothing here changes a price.
    """
    from growth.models import (
        CustomerOfferGrant,
        CustomerOfferGrantStatus,
        OfferPackage,
        OfferPackageStatus,
    )

    on_date = on_date or timezone.localdate()

    qs = OfferPackage.objects.filter(
        status=OfferPackageStatus.ACTIVE,
        plan_template__is_active=True,
    ).select_related("plan_template")
    if plan_type:
        qs = qs.filter(plan_template__plan_type=plan_type)

    held = set(
        CustomerOfferGrant.objects.filter(
            customer=customer,
            status__in=[CustomerOfferGrantStatus.PENDING, CustomerOfferGrantStatus.APPROVED],
        ).values_list("offer_package_id", flat=True)
    )

    out: list[dict] = []
    for pkg in qs.order_by("display_priority", "package_code"):
        if pkg.start_date and on_date < pkg.start_date:
            continue
        if pkg.end_date and on_date > pkg.end_date:
            continue

        matches, reason = customer_matches_segment(customer, pkg.audience_type)
        if not matches:
            continue

        out.append(
            {
                "package_code": pkg.package_code,
                "package_name": pkg.name,
                "package_id": pkg.id,
                "plan_type": pkg.plan_template.plan_type,
                "audience_type": pkg.audience_type,
                "requires_approval": True,  # always, by policy
                "already_held": pkg.id in held,
                "segment_reason": reason,
            }
        )
    return out


# ── grants ───────────────────────────────────────────────────────────────────

@transaction.atomic
def request_offer_grant(*, customer, offer_package, requested_by=None, note="", expires_on=None):
    """
    Record that a customer should get an offer. Always starts PENDING: by policy
    an offer never applies until a person approves it.
    """
    from growth.models import CustomerOfferGrant, CustomerOfferGrantStatus

    live = CustomerOfferGrant.objects.filter(
        customer=customer,
        offer_package=offer_package,
        status__in=[CustomerOfferGrantStatus.PENDING, CustomerOfferGrantStatus.APPROVED],
    ).first()
    if live:
        raise ValidationError(
            {"offer_package": f"Customer already has a {live.status} grant for this offer."}
        )

    grant = CustomerOfferGrant(
        customer=customer,
        offer_package=offer_package,
        status=CustomerOfferGrantStatus.PENDING,
        requested_by=requested_by,
        note=(note or "").strip(),
        expires_on=expires_on,
    )
    grant.full_clean()
    grant.save()
    return grant


@transaction.atomic
def decide_offer_grant(*, grant, approve: bool, decided_by, decision_note=""):
    """Approve or reject a pending grant. Approval is what makes it price-bearing."""
    from growth.models import CustomerOfferGrantStatus

    if decided_by is None:
        raise ValidationError({"decided_by": "A decision must record who made it."})
    if grant.status != CustomerOfferGrantStatus.PENDING:
        raise ValidationError(
            {"status": f"Only a PENDING grant can be decided; this one is {grant.status}."}
        )

    grant.status = (
        CustomerOfferGrantStatus.APPROVED if approve else CustomerOfferGrantStatus.REJECTED
    )
    grant.decided_by = decided_by
    grant.decided_at = timezone.now()
    grant.decision_note = (decision_note or "").strip()
    grant.full_clean()
    grant.save()
    return grant


@transaction.atomic
def withdraw_offer_grant(*, grant, decided_by, decision_note=""):
    """Pull back a grant that was approved, or cancel one still pending."""
    from growth.models import CustomerOfferGrantStatus

    if grant.status in (
        CustomerOfferGrantStatus.REJECTED,
        CustomerOfferGrantStatus.WITHDRAWN,
    ):
        raise ValidationError({"status": f"Grant is already {grant.status}."})

    grant.status = CustomerOfferGrantStatus.WITHDRAWN
    grant.decided_by = decided_by
    grant.decided_at = timezone.now()
    grant.decision_note = (decision_note or "").strip()
    grant.save()
    return grant


def live_grants_for(customer, plan_type=None, on_date=None) -> list:
    """Approved, unexpired grants whose package window is open."""
    from growth.models import CustomerOfferGrant, CustomerOfferGrantStatus

    if customer is None:
        return []

    on_date = on_date or timezone.localdate()
    qs = CustomerOfferGrant.objects.filter(
        customer=customer, status=CustomerOfferGrantStatus.APPROVED
    ).select_related("offer_package", "offer_package__plan_template")
    if plan_type:
        qs = qs.filter(offer_package__plan_template__plan_type=plan_type)

    return [g for g in qs if g.is_live(on_date)]
