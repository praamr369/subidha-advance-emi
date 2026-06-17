"""
P3C — Customer Risk Scoring Service.

Computes an advisory risk score for a customer based on real, existing data:
KYC status, document vault state, payment/EMI history, contract value, deposit
percent, and partner origin.

Enforcement is opt-in.  When CUSTOMER_RISK_ENFORCEMENT_ENABLED is False (the
default) this service NEVER blocks or raises — it only computes and stores.

Score bands (configurable via BusinessPolicy; hard defaults below):
  LOW     0-24
  MEDIUM  25-49
  HIGH    50-74
  BLOCKED 75+

Relevant policy keys (all default-safe):
  CUSTOMER_RISK_ENFORCEMENT_ENABLED   bool   False
  CUSTOMER_RISK_MEDIUM_THRESHOLD      int    25
  CUSTOMER_RISK_HIGH_THRESHOLD        int    50
  CUSTOMER_RISK_BLOCKED_THRESHOLD     int    75
  HIGH_RISK_REQUIRES_APPROVAL         bool   True
  BLOCKED_RISK_BLOCKS_RENT_LEASE      bool   True
"""
from __future__ import annotations

import logging
from datetime import date
from decimal import Decimal
from typing import Any

from django.db import transaction
from django.utils import timezone

from subscriptions.models import (
    CustomerKycDocumentStatus,
    CustomerRiskBand,
    CustomerRiskProfile,
    EmiStatus,
    KycStatus,
    PlanType,
    SubscriptionStatus,
)
from subscriptions.services.audit_service import log_audit
from subscriptions.models import AuditLog

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Policy key constants (mirrors control_policy_service.PolicyKey pattern)
# ---------------------------------------------------------------------------

POLICY_ENFORCEMENT_ENABLED = "CUSTOMER_RISK_ENFORCEMENT_ENABLED"
POLICY_MEDIUM_THRESHOLD = "CUSTOMER_RISK_MEDIUM_THRESHOLD"
POLICY_HIGH_THRESHOLD = "CUSTOMER_RISK_HIGH_THRESHOLD"
POLICY_BLOCKED_THRESHOLD = "CUSTOMER_RISK_BLOCKED_THRESHOLD"
POLICY_HIGH_REQUIRES_APPROVAL = "HIGH_RISK_REQUIRES_APPROVAL"
POLICY_BLOCKED_BLOCKS_RENT_LEASE = "BLOCKED_RISK_BLOCKS_RENT_LEASE"

_SAFE_DEFAULTS: dict[str, Any] = {
    POLICY_ENFORCEMENT_ENABLED: False,
    POLICY_MEDIUM_THRESHOLD: 25,
    POLICY_HIGH_THRESHOLD: 50,
    POLICY_BLOCKED_THRESHOLD: 75,
    POLICY_HIGH_REQUIRES_APPROVAL: True,
    POLICY_BLOCKED_BLOCKS_RENT_LEASE: True,
}

# Score weights
_W_KYC_MISSING = 30
_W_KYC_REJECTED = 35
_W_DOC_MISSING = 10
_W_DOC_REJECTED = 15
_W_OVERDUE_EMI = 12       # per overdue EMI (capped)
_W_OVERDUE_RENT = 10      # per overdue rent/lease demand (capped)
_W_PRIOR_CANCEL = 8
_W_LOW_DEPOSIT = 10
_W_HIGH_VALUE = 8
_W_PARTNER_ORIGIN = 5
_W_UNRESOLVED_EXCEPTION = 6
_W_PAID_HISTORY = -8      # per completed subscription (capped reduction)
_W_VERIFIED_KYC = -10
_MAX_OVERDUE_PENALTY = 30
_MAX_PAID_REDUCTION = 20
_MAX_OVERDUE_RENT_PENALTY = 20
_HIGH_VALUE_THRESHOLD = Decimal("50000.00")
_LOW_DEPOSIT_THRESHOLD = Decimal("20.00")  # percent


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _get_policy(key: str) -> Any:
    try:
        from subscriptions.services.control_policy_service import get_policy_value
        return get_policy_value(key, default=_SAFE_DEFAULTS.get(key))
    except Exception:
        return _SAFE_DEFAULTS.get(key)


def _band_for_score(score: int) -> str:
    medium = _get_policy(POLICY_MEDIUM_THRESHOLD) or 25
    high = _get_policy(POLICY_HIGH_THRESHOLD) or 50
    blocked = _get_policy(POLICY_BLOCKED_THRESHOLD) or 75
    if score >= blocked:
        return CustomerRiskBand.BLOCKED
    if score >= high:
        return CustomerRiskBand.HIGH
    if score >= medium:
        return CustomerRiskBand.MEDIUM
    return CustomerRiskBand.LOW


def _kyc_reason(customer) -> tuple[int, list[str]]:
    kyc_status = getattr(customer, "kyc_status", KycStatus.PENDING)
    if kyc_status in (KycStatus.NOT_PROVIDED, KycStatus.PENDING, KycStatus.SUBMITTED):
        return _W_KYC_MISSING, ["KYC_MISSING"]
    if kyc_status == KycStatus.REJECTED:
        return _W_KYC_REJECTED, ["KYC_REJECTED"]
    if kyc_status in (KycStatus.VERIFIED, KycStatus.APPROVED, KycStatus.EXCEPTION_APPROVED):
        return _W_VERIFIED_KYC, []
    return 0, []


def _document_reason(customer) -> tuple[int, list[str]]:
    """Check for missing/rejected KYC documents (address proof focus)."""
    delta = 0
    reasons: list[str] = []
    try:
        docs = list(customer.kyc_documents.all())
    except Exception:
        return 0, []

    if not docs:
        return 0, []

    today = date.today()
    address_docs = [
        d for d in docs
        if (getattr(d, "category", "") or "") in ("ADDRESS_PROOF",)
        or (getattr(d, "document_type", "") or "") in ("AADHAAR", "PASSPORT", "VOTER_ID", "DRIVING_LICENSE")
    ]
    all_rejected = address_docs and all(
        d.status == CustomerKycDocumentStatus.REJECTED
        for d in address_docs
    )
    any_expired = address_docs and any(
        (getattr(d, "expires_on", None) is not None and d.expires_on < today)
        for d in address_docs
        if d.status != CustomerKycDocumentStatus.REJECTED
    )
    if all_rejected:
        delta += _W_DOC_REJECTED
        reasons.append("ADDRESS_DOC_REJECTED")
    elif any_expired:
        delta += _W_DOC_MISSING
        reasons.append("ADDRESS_DOC_EXPIRED")

    return delta, reasons


def _overdue_emi_reason(customer) -> tuple[int, list[str]]:
    try:
        from subscriptions.models import Emi, Subscription
        today = date.today()
        overdue_count = Emi.objects.filter(
            subscription__customer=customer,
            status=EmiStatus.PENDING,
            due_date__lt=today,
        ).count()
    except Exception:
        return 0, []

    if overdue_count == 0:
        return 0, []
    penalty = min(overdue_count * _W_OVERDUE_EMI, _MAX_OVERDUE_PENALTY)
    return penalty, [f"OVERDUE_EMIS:{overdue_count}"]


def _overdue_rent_reason(customer) -> tuple[int, list[str]]:
    try:
        from subscriptions.models import RentLeaseBillingDemand, RentLeaseDemandStatus
        today = date.today()
        overdue_count = RentLeaseBillingDemand.objects.filter(
            subscription__customer=customer,
            status=RentLeaseDemandStatus.PENDING,
            due_date__lt=today,
        ).count()
    except Exception:
        return 0, []

    if overdue_count == 0:
        return 0, []
    penalty = min(overdue_count * _W_OVERDUE_RENT, _MAX_OVERDUE_RENT_PENALTY)
    return penalty, [f"OVERDUE_RENT_DEMANDS:{overdue_count}"]


def _paid_history_reason(customer) -> tuple[int, list[str]]:
    try:
        from subscriptions.models import Subscription
        completed_count = Subscription.objects.filter(
            customer=customer,
            status__in=[SubscriptionStatus.COMPLETED, SubscriptionStatus.WON],
        ).count()
    except Exception:
        return 0, []

    if completed_count == 0:
        return 0, []
    reduction = max(completed_count * _W_PAID_HISTORY, -_MAX_PAID_REDUCTION)
    return reduction, []


def _prior_cancellation_reason(customer) -> tuple[int, list[str]]:
    try:
        from subscriptions.models import OperationalCancellation
        cancelled = OperationalCancellation.objects.filter(
            customer=customer,
        ).count()
    except Exception:
        cancelled = 0

    if not cancelled:
        try:
            from subscriptions.models import Subscription
            cancelled = Subscription.objects.filter(
                customer=customer,
                status=SubscriptionStatus.CANCELLED,
            ).count()
        except Exception:
            cancelled = 0

    if cancelled == 0:
        return 0, []
    return _W_PRIOR_CANCEL, ["PRIOR_CANCELLATION"]


def _partner_origin_reason(customer) -> tuple[int, list[str]]:
    if getattr(customer, "created_by_partner_user_id", None):
        return _W_PARTNER_ORIGIN, ["PARTNER_CREATED"]
    return 0, []


def _unresolved_exception_reason(customer) -> tuple[int, list[str]]:
    """Light check: any OPEN critical control exception linked to this customer."""
    try:
        from subscriptions.models_control_foundation import ControlException, ExceptionStatus, ExceptionSeverity
        has_open = ControlException.objects.filter(
            status=ExceptionStatus.OPEN,
            severity=ExceptionSeverity.CRITICAL,
            source_model="Customer",
            source_id=str(customer.pk),
        ).exists()
        if has_open:
            return _W_UNRESOLVED_EXCEPTION, ["UNRESOLVED_CRITICAL_EXCEPTION"]
    except Exception:
        pass
    return 0, []


def _contract_value_reason(subscription_or_payload) -> tuple[int, list[str]]:
    """High contract value increases risk (used in evaluate_contract_risk)."""
    try:
        if hasattr(subscription_or_payload, "total_amount"):
            total = subscription_or_payload.total_amount or Decimal("0")
        else:
            total = Decimal(str(subscription_or_payload.get("total_amount", 0) or 0))
        if total >= _HIGH_VALUE_THRESHOLD:
            return _W_HIGH_VALUE, ["HIGH_CONTRACT_VALUE"]
    except Exception:
        pass
    return 0, []


def _deposit_percent_reason(subscription_or_payload) -> tuple[int, list[str]]:
    """Low security deposit percent on rent/lease increases risk."""
    try:
        plan = None
        if hasattr(subscription_or_payload, "plan_type"):
            plan = subscription_or_payload.plan_type
        else:
            plan = subscription_or_payload.get("plan_type")

        if plan not in (PlanType.RENT, PlanType.LEASE):
            return 0, []

        pct = None
        if hasattr(subscription_or_payload, "rent_profile"):
            profile = getattr(subscription_or_payload, "rent_profile", None)
            if profile:
                pct = getattr(profile, "security_deposit_percent", None)
        elif hasattr(subscription_or_payload, "lease_profile"):
            profile = getattr(subscription_or_payload, "lease_profile", None)
            if profile:
                pct = getattr(profile, "security_deposit_percent", None)
        else:
            pct = subscription_or_payload.get("security_deposit_percent") if isinstance(subscription_or_payload, dict) else None

        if pct is not None and Decimal(str(pct)) < _LOW_DEPOSIT_THRESHOLD:
            return _W_LOW_DEPOSIT, ["LOW_DEPOSIT_PERCENT"]
    except Exception:
        pass
    return 0, []


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def calculate_customer_risk(customer, context: dict | None = None) -> dict:
    """
    Compute risk score + band + reason_codes for *customer*.

    Pure computation — does NOT persist. Never raises.
    Returns a dict with keys: risk_score, risk_band, reason_codes.
    """
    context = context or {}
    delta = 0
    reasons: list[str] = []

    def _add(d: int, r: list[str]) -> None:
        nonlocal delta
        delta += d
        reasons.extend(r)

    _add(*_kyc_reason(customer))
    _add(*_document_reason(customer))
    _add(*_overdue_emi_reason(customer))
    _add(*_overdue_rent_reason(customer))
    _add(*_paid_history_reason(customer))
    _add(*_prior_cancellation_reason(customer))
    _add(*_partner_origin_reason(customer))
    _add(*_unresolved_exception_reason(customer))

    score = max(0, delta)
    band = _band_for_score(score)

    return {
        "risk_score": score,
        "risk_band": band,
        "reason_codes": reasons,
    }


@transaction.atomic
def recalculate_customer_risk_profile(customer, performed_by=None) -> CustomerRiskProfile:
    """
    Compute and persist (upsert) a CustomerRiskProfile for *customer*.

    Safe to call repeatedly. Writes an audit log entry.
    """
    result = calculate_customer_risk(customer)

    profile, created = CustomerRiskProfile.objects.get_or_create(
        customer=customer,
        defaults={
            "risk_score": result["risk_score"],
            "risk_band": result["risk_band"],
            "reason_codes": result["reason_codes"],
            "last_calculated_at": timezone.now(),
        },
    )
    if not created:
        profile.risk_score = result["risk_score"]
        profile.risk_band = result["risk_band"]
        profile.reason_codes = result["reason_codes"]
        profile.last_calculated_at = timezone.now()
        profile.save(update_fields=["risk_score", "risk_band", "reason_codes", "last_calculated_at"])

    try:
        log_audit(
            action_type=AuditLog.ActionType.USER_UPDATED,
            instance=profile,
            performed_by=performed_by,
            metadata={
                "event": "CUSTOMER_RISK_RECALCULATED",
                "customer_id": customer.pk,
                "risk_score": result["risk_score"],
                "risk_band": result["risk_band"],
                "reason_codes": result["reason_codes"],
            },
        )
    except Exception:
        pass

    return profile


def get_customer_risk_profile(customer) -> CustomerRiskProfile:
    """Return the stored risk profile, or a transient LOW default if none exists yet."""
    try:
        return customer.risk_profile
    except CustomerRiskProfile.DoesNotExist:
        pass
    # Return an unsaved default — callers should use recalculate_... to persist.
    profile = CustomerRiskProfile(
        customer=customer,
        risk_score=0,
        risk_band=CustomerRiskBand.LOW,
        reason_codes=[],
    )
    return profile


def evaluate_contract_risk(subscription_or_payload, customer=None) -> dict:
    """
    Evaluate risk for a specific contract (new or existing).

    Combines the customer's base risk with contract-specific factors
    (high value, low deposit). Returns an advisory payload; never raises.
    """
    if customer is None and hasattr(subscription_or_payload, "customer"):
        customer = subscription_or_payload.customer

    base = calculate_customer_risk(customer) if customer else {"risk_score": 0, "risk_band": CustomerRiskBand.LOW, "reason_codes": []}

    extra_delta = 0
    extra_reasons: list[str] = []

    def _add(d: int, r: list[str]) -> None:
        nonlocal extra_delta
        extra_delta += d
        extra_reasons.extend(r)

    _add(*_contract_value_reason(subscription_or_payload))
    _add(*_deposit_percent_reason(subscription_or_payload))

    combined_score = max(0, base["risk_score"] + extra_delta)
    combined_band = _band_for_score(combined_score)
    combined_reasons = base["reason_codes"] + extra_reasons

    enforcement_enabled = bool(_get_policy(POLICY_ENFORCEMENT_ENABLED))
    high_requires_approval = bool(_get_policy(POLICY_HIGH_REQUIRES_APPROVAL))
    blocked_blocks = bool(_get_policy(POLICY_BLOCKED_BLOCKS_RENT_LEASE))

    approval_required = (
        enforcement_enabled
        and high_requires_approval
        and combined_band in (CustomerRiskBand.HIGH, CustomerRiskBand.BLOCKED)
    )

    blocker_codes: list[str] = []
    if enforcement_enabled and blocked_blocks and combined_band == CustomerRiskBand.BLOCKED:
        plan = None
        if hasattr(subscription_or_payload, "plan_type"):
            plan = subscription_or_payload.plan_type
        elif isinstance(subscription_or_payload, dict):
            plan = subscription_or_payload.get("plan_type")
        if plan in (PlanType.RENT, PlanType.LEASE):
            blocker_codes.append("CUSTOMER_RISK_BLOCKED")

    return {
        "risk_score": combined_score,
        "risk_band": combined_band,
        "reason_codes": combined_reasons,
        "enforcement_enabled": enforcement_enabled,
        "approval_required": approval_required,
        "blocker_codes": blocker_codes,
    }


def assert_customer_risk_allows_contract(subscription_or_payload, customer=None, performed_by=None) -> dict:
    """
    Raise ValueError with blocker_codes when enforcement is enabled and the
    customer is BLOCKED for a rent/lease contract.

    When enforcement is disabled (default), this is always a no-op.
    Returns the risk payload so callers can log it.
    """
    risk = evaluate_contract_risk(subscription_or_payload, customer=customer)

    if risk["blocker_codes"]:
        raise ValueError(
            f"Contract blocked by customer risk policy: {', '.join(risk['blocker_codes'])}. "
            f"Risk band: {risk['risk_band']}. Reasons: {', '.join(risk['reason_codes'])}."
        )

    if risk["approval_required"]:
        _try_create_approval(subscription_or_payload, customer=customer, risk=risk, performed_by=performed_by)

    return risk


# ---------------------------------------------------------------------------
# Approval integration (optional — gracefully absent if approval service N/A)
# ---------------------------------------------------------------------------

def _try_create_approval(subscription_or_payload, *, customer, risk: dict, performed_by) -> None:
    try:
        from subscriptions.services.control_approval_service import create_approval_request
        from subscriptions.models_control_foundation import ApprovalRiskLevel

        source_id = str(getattr(subscription_or_payload, "pk", None) or "new")
        create_approval_request(
            source_model="Subscription",
            source_id=source_id,
            action_key="RENT_LEASE_HIGH_RISK_CUSTOMER",
            requested_by=performed_by,
            risk_level=ApprovalRiskLevel.HIGH,
            request_reason=(
                f"Customer risk band is {risk['risk_band']} (score={risk['risk_score']}). "
                f"Reasons: {', '.join(risk['reason_codes'])}."
            ),
            metadata={"customer_id": getattr(customer, "pk", None), "risk": risk},
        )
    except Exception as exc:
        log.warning("P3C: could not create approval request for high-risk contract: %s", exc)
