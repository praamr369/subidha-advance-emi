"""
P5A — Growth Foundation: offer package and plan template service.

All functions are read-only advisory. No subscriptions, EMIs, payments,
JournalEntries, AccountingBridgePostings, StockLedger, LuckyDraw, Commission,
or Payout rows are created or mutated by any function in this module.
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any

from django.db.models import Q


def _get_models():
    from subscriptions.models_growth_offers import (
        OfferPackage,
        OfferPackageStatus,
        PlanTemplate,
    )
    return OfferPackage, OfferPackageStatus, PlanTemplate


# ─────────────────────────────────────────────────────────────────────────────
# PlanTemplate preview
# ─────────────────────────────────────────────────────────────────────────────

def build_plan_template_preview(template, product=None, customer=None) -> dict:
    """Return a read-only advisory preview dict for a PlanTemplate."""
    preview: dict[str, Any] = {
        "template_code": template.template_code,
        "name": template.name,
        "plan_type": template.plan_type,
        "tenure_months": template.tenure_months,
        "default_down_payment_percent": (
            str(template.default_down_payment_percent)
            if template.default_down_payment_percent is not None
            else None
        ),
        "default_security_deposit_percent": (
            str(template.default_security_deposit_percent)
            if template.default_security_deposit_percent is not None
            else None
        ),
        "default_grace_days": template.default_grace_days,
        "is_lucky_plan_eligible": template.is_lucky_plan_eligible,
        "requires_batch": template.requires_batch,
        "requires_lucky_id": template.requires_lucky_id,
        "is_active": template.is_active,
    }
    if product is not None:
        preview["product_preview"] = {
            "product_id": product.pk,
            "name": product.name,
            "base_price": str(product.base_price) if hasattr(product, "base_price") else None,
        }
    if customer is not None:
        risk_info = _get_customer_risk_advisory(customer)
        preview["customer_risk_advisory"] = risk_info
    return preview


# ─────────────────────────────────────────────────────────────────────────────
# OfferPackage preview
# ─────────────────────────────────────────────────────────────────────────────

def build_offer_package_preview(offer_package, customer=None) -> dict:
    """Return a read-only advisory preview dict for an OfferPackage."""
    template = offer_package.plan_template
    lines = list(
        offer_package.lines.select_related("product").all()
    )
    line_previews = []
    for line in lines:
        entry: dict[str, Any] = {
            "product_id": line.product_id,
            "product_name": line.product.name if line.product_id else None,
            "quantity": line.quantity,
            "discount_type": line.discount_type,
            "discount_value": str(line.discount_value),
        }
        if line.price_override is not None:
            entry["price_override"] = str(line.price_override)
        line_previews.append(entry)

    preview: dict[str, Any] = {
        "package_code": offer_package.package_code,
        "name": offer_package.name,
        "status": offer_package.status,
        "audience_type": offer_package.audience_type,
        "start_date": offer_package.start_date.isoformat() if offer_package.start_date else None,
        "end_date": offer_package.end_date.isoformat() if offer_package.end_date else None,
        "display_priority": offer_package.display_priority,
        "requires_approval": offer_package.requires_approval,
        "plan_template": build_plan_template_preview(template),
        "lines": line_previews,
    }

    eligibility = evaluate_offer_package_eligibility(offer_package, customer=customer)
    preview["eligibility"] = eligibility

    return preview


# ─────────────────────────────────────────────────────────────────────────────
# Eligibility
# ─────────────────────────────────────────────────────────────────────────────

def evaluate_offer_package_eligibility(offer_package, customer=None, context=None) -> dict:
    """
    Advisory eligibility check for an OfferPackage against an optional customer.

    Returns a dict with:
      eligible: bool (advisory — does not block existing workflows)
      not_recommended: bool (BLOCKED risk)
      approval_required: bool (HIGH risk or package requires_approval)
      warnings: list[str]
      reasons: list[str]

    No ApprovalRequest is created automatically.
    No subscriptions or financial records are mutated.
    """
    today = date.today()
    warnings: list[str] = []
    reasons: list[str] = []
    eligible = True
    not_recommended = False
    approval_required = bool(offer_package.requires_approval)

    # Status check
    from subscriptions.models_growth_offers import OfferPackageStatus
    if offer_package.status != OfferPackageStatus.ACTIVE:
        eligible = False
        reasons.append(f"Offer status is {offer_package.status}, not ACTIVE.")

    # Date window check
    if offer_package.start_date and today < offer_package.start_date:
        eligible = False
        reasons.append(f"Offer not yet valid (starts {offer_package.start_date}).")
    if offer_package.end_date and today > offer_package.end_date:
        eligible = False
        reasons.append(f"Offer has expired (ended {offer_package.end_date}).")

    # Template active
    if not offer_package.plan_template.is_active:
        eligible = False
        reasons.append("Underlying plan template is inactive.")

    if customer is not None:
        # Customer risk advisory
        risk_advisory = _get_customer_risk_advisory(customer)
        band = risk_advisory.get("risk_band", "LOW")
        if band == "BLOCKED":
            not_recommended = True
            warnings.append("Customer risk band is BLOCKED — offer not recommended.")
        elif band == "HIGH":
            approval_required = True
            warnings.append("Customer risk band is HIGH — approval required before proceeding.")

        # Document warnings (expired/rejected required documents)
        doc_warnings = _get_customer_document_warnings(customer)
        warnings.extend(doc_warnings)

        # Audience type check
        audience_ok, audience_reason = _check_audience_eligibility(offer_package, customer)
        if not audience_ok:
            warnings.append(audience_reason)

    return {
        "eligible": eligible,
        "not_recommended": not_recommended,
        "approval_required": approval_required,
        "warnings": warnings,
        "reasons": reasons,
    }


def _get_customer_risk_advisory(customer) -> dict:
    try:
        profile = customer.risk_profile
        return {
            "risk_band": profile.risk_band,
            "risk_score": profile.risk_score,
            "reason_codes": profile.reason_codes or [],
        }
    except Exception:
        return {"risk_band": "LOW", "risk_score": 0, "reason_codes": []}


def _get_customer_document_warnings(customer) -> list[str]:
    warnings: list[str] = []
    try:
        from subscriptions.models import KycDocument, KycStatus
        rejected_docs = KycDocument.objects.filter(
            customer=customer,
            is_required=True,
            status__in=[KycStatus.REJECTED],
        )
        if rejected_docs.exists():
            warnings.append("Customer has rejected required KYC documents.")
    except Exception:
        pass
    return warnings


def _check_audience_eligibility(offer_package, customer) -> tuple[bool, str]:
    from subscriptions.models_growth_offers import OfferAudienceType
    audience = offer_package.audience_type

    if audience == OfferAudienceType.ALL:
        return True, ""

    if audience == OfferAudienceType.PARTNER_REFERRED:
        try:
            from subscriptions.models import Subscription
            has_partner = Subscription.objects.filter(
                customer=customer,
                referred_by__isnull=False,
            ).exists()
            if not has_partner:
                return True, "Offer targets partner-referred customers; no existing partner relation found (advisory)."
        except Exception:
            pass

    return True, ""


# ─────────────────────────────────────────────────────────────────────────────
# Active offer list
# ─────────────────────────────────────────────────────────────────────────────

def list_active_offer_packages(plan_type=None, customer=None) -> list[dict]:
    """
    Return active, date-valid OfferPackages as advisory preview dicts.

    Inactive/expired packages are excluded.
    No subscription, EMI, or financial record is created.
    """
    OfferPackage, OfferPackageStatus, PlanTemplate = _get_models()
    today = date.today()

    qs = OfferPackage.objects.select_related("plan_template").filter(
        status=OfferPackageStatus.ACTIVE,
        plan_template__is_active=True,
    ).filter(
        Q(start_date__isnull=True) | Q(start_date__lte=today)
    ).filter(
        Q(end_date__isnull=True) | Q(end_date__gte=today)
    ).order_by("display_priority", "package_code")

    if plan_type is not None:
        qs = qs.filter(plan_template__plan_type=plan_type)

    result = []
    for pkg in qs:
        entry = build_offer_package_preview(pkg, customer=customer)
        result.append(entry)
    return result


# ─────────────────────────────────────────────────────────────────────────────
# Configuration validation
# ─────────────────────────────────────────────────────────────────────────────

def validate_offer_package_configuration(offer_package) -> dict:
    """
    Validate an OfferPackage configuration for internal consistency.

    Returns {"valid": bool, "errors": list[str], "warnings": list[str]}.
    Does not mutate any record.
    """
    errors: list[str] = []
    warnings: list[str] = []

    template = offer_package.plan_template

    if not template.is_active:
        errors.append("Plan template is inactive.")

    if offer_package.start_date and offer_package.end_date:
        if offer_package.start_date > offer_package.end_date:
            errors.append("start_date is after end_date.")

    if offer_package.min_contract_value is not None and offer_package.max_contract_value is not None:
        if offer_package.min_contract_value > offer_package.max_contract_value:
            errors.append("min_contract_value exceeds max_contract_value.")

    lines = list(offer_package.lines.all())
    for line in lines:
        if line.price_override is not None and line.price_override <= Decimal("0"):
            errors.append(f"Line for product {line.product_id}: price_override must be positive.")
        if line.discount_value < Decimal("0"):
            errors.append(f"Line for product {line.product_id}: discount_value must not be negative.")

    if not lines:
        warnings.append("Offer package has no product lines (lines are optional in P5A).")

    return {
        "valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
    }
