"""
P5B — Growth Request Workflow: service layer.

All functions operate on request state only.
No subscription, EMI, payment, JournalEntry, AccountingBridgePosting,
StockLedger, LuckyDraw, Commission, or Payout row is created or mutated.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from django.utils import timezone


def _get_request_models():
    from subscriptions.models_growth_requests import (
        CustomerGrowthRequest,
        GrowthRequestDecision,
        GrowthRequestLine,
        GrowthRequestStatus,
        GrowthDecisionType,
        GrowthRequestPriority,
    )
    return (
        CustomerGrowthRequest, GrowthRequestDecision,
        GrowthRequestLine, GrowthRequestStatus,
        GrowthDecisionType, GrowthRequestPriority,
    )


def _generate_request_number() -> str:
    from subscriptions.models_growth_requests import CustomerGrowthRequest
    prefix = "GR"
    year = datetime.now().strftime("%y")
    suffix = uuid.uuid4().hex[:6].upper()
    candidate = f"{prefix}{year}-{suffix}"
    while CustomerGrowthRequest.objects.filter(request_number=candidate).exists():
        suffix = uuid.uuid4().hex[:6].upper()
        candidate = f"{prefix}{year}-{suffix}"
    return candidate


def _get_customer_risk_snapshot(customer) -> dict:
    try:
        profile = customer.risk_profile
        return {
            "risk_band": profile.risk_band,
            "risk_score": profile.risk_score,
            "reason_codes": profile.reason_codes or [],
            "snapshot_at": timezone.now().isoformat(),
        }
    except Exception:
        return {"risk_band": "LOW", "risk_score": 0, "reason_codes": [], "snapshot_at": timezone.now().isoformat()}


# ─────────────────────────────────────────────────────────────────────────────
# Create
# ─────────────────────────────────────────────────────────────────────────────

def create_growth_request(
    *,
    customer,
    request_type: str,
    source_subscription=None,
    desired_plan_template=None,
    desired_offer_package=None,
    requested_product=None,
    current_product=None,
    expected_value=None,
    reason: str = "",
    notes: str = "",
    priority: str = "NORMAL",
    metadata: dict | None = None,
    performed_by=None,
):
    """
    Create a new CustomerGrowthRequest in DRAFT status.

    Captures customer risk as an advisory snapshot.
    Does not create any subscription, EMI, payment, or accounting record.
    """
    (CustomerGrowthRequest, _, _, GrowthRequestStatus, _, _) = _get_request_models()

    risk_snapshot = _get_customer_risk_snapshot(customer)
    approval_required = _determine_approval_required(risk_snapshot, expected_value)

    return CustomerGrowthRequest.objects.create(
        request_number=_generate_request_number(),
        customer=customer,
        source_subscription=source_subscription,
        request_type=request_type,
        status=GrowthRequestStatus.DRAFT,
        priority=priority,
        desired_plan_template=desired_plan_template,
        desired_offer_package=desired_offer_package,
        requested_product=requested_product,
        current_product=current_product,
        expected_value=expected_value,
        reason=reason,
        notes=notes,
        risk_snapshot=risk_snapshot,
        approval_required=approval_required,
        metadata=metadata or {},
        created_by=performed_by,
        updated_by=performed_by,
    )


def _determine_approval_required(risk_snapshot: dict, expected_value=None) -> bool:
    band = risk_snapshot.get("risk_band", "LOW")
    if band in ("HIGH", "BLOCKED"):
        return True
    if expected_value is not None:
        try:
            from decimal import Decimal
            if Decimal(str(expected_value)) > Decimal("50000"):
                return True
        except Exception:
            pass
    return False


# ─────────────────────────────────────────────────────────────────────────────
# Submit
# ─────────────────────────────────────────────────────────────────────────────

def submit_growth_request(request, *, performed_by=None):
    """
    Transition request from DRAFT → SUBMITTED.

    No subscription, EMI, payment, or accounting record is created.
    """
    (_, _, _, GrowthRequestStatus, _, _) = _get_request_models()
    if request.status != GrowthRequestStatus.DRAFT:
        raise ValueError(f"Only DRAFT requests can be submitted. Current status: {request.status}")

    request.status = GrowthRequestStatus.SUBMITTED
    request.updated_by = performed_by
    request.save(update_fields=["status", "updated_by", "updated_at"])
    return request


# ─────────────────────────────────────────────────────────────────────────────
# Evaluate
# ─────────────────────────────────────────────────────────────────────────────

def evaluate_growth_request(request) -> dict:
    """
    Return an advisory evaluation dict for a growth request.

    Does not mutate the request or any other record.
    """
    warnings: list[str] = []
    risk_band = request.risk_snapshot.get("risk_band", "LOW")
    if risk_band == "BLOCKED":
        warnings.append("Customer risk band is BLOCKED — request not recommended.")
    elif risk_band == "HIGH":
        warnings.append("Customer risk band is HIGH — approval required.")

    if request.source_subscription:
        sub = request.source_subscription
        if hasattr(sub, "status"):
            if sub.status not in ("ACTIVE", "HANDED_OVER", "COMPLETED"):
                warnings.append(f"Source subscription status is {sub.status}.")

    if request.desired_plan_template and not request.desired_plan_template.is_active:
        warnings.append("Desired plan template is inactive.")

    if request.desired_offer_package:
        pkg = request.desired_offer_package
        if pkg.status != "ACTIVE":
            warnings.append(f"Desired offer package status is {pkg.status}.")

    return {
        "approval_required": request.approval_required,
        "risk_band": risk_band,
        "warnings": warnings,
        "can_approve": not request.is_terminal,
        "can_reject": not request.is_terminal,
        "can_submit": request.status == "DRAFT",
    }


# ─────────────────────────────────────────────────────────────────────────────
# Approve / Reject
# ─────────────────────────────────────────────────────────────────────────────

def approve_growth_request(request, *, approved_by, reason: str = ""):
    """
    Approve a CustomerGrowthRequest.

    Changes request status to APPROVED and records a decision.
    Does not create any subscription, EMI, payment, or accounting record.
    """
    (_, GrowthRequestDecision, _, GrowthRequestStatus, GrowthDecisionType, _) = _get_request_models()

    if request.is_terminal:
        raise ValueError(f"Request {request.request_number} is already in terminal status {request.status}.")
    if request.status not in (GrowthRequestStatus.SUBMITTED, GrowthRequestStatus.UNDER_REVIEW):
        raise ValueError(f"Request must be SUBMITTED or UNDER_REVIEW to approve. Current: {request.status}")

    now = timezone.now()
    request.status = GrowthRequestStatus.APPROVED
    request.approved_by = approved_by
    request.decided_at = now
    request.updated_by = approved_by
    request.save(update_fields=["status", "approved_by", "decided_at", "updated_by", "updated_at"])

    GrowthRequestDecision.objects.create(
        growth_request=request,
        decision=GrowthDecisionType.APPROVE,
        reason=reason,
        decided_by=approved_by,
        decided_at=now,
    )
    return request


def reject_growth_request(request, *, rejected_by, reason: str):
    """
    Reject a CustomerGrowthRequest.

    Changes request status to REJECTED and records a decision.
    Does not create any subscription, EMI, payment, or accounting record.
    """
    (_, GrowthRequestDecision, _, GrowthRequestStatus, GrowthDecisionType, _) = _get_request_models()

    if request.is_terminal:
        raise ValueError(f"Request {request.request_number} is already in terminal status {request.status}.")

    now = timezone.now()
    request.status = GrowthRequestStatus.REJECTED
    request.decided_at = now
    request.updated_by = rejected_by
    request.save(update_fields=["status", "decided_at", "updated_by", "updated_at"])

    GrowthRequestDecision.objects.create(
        growth_request=request,
        decision=GrowthDecisionType.REJECT,
        reason=reason,
        decided_by=rejected_by,
        decided_at=now,
    )
    return request


# ─────────────────────────────────────────────────────────────────────────────
# Preview
# ─────────────────────────────────────────────────────────────────────────────

def build_growth_request_preview(request) -> dict[str, Any]:
    """Return a read-only preview dict for a CustomerGrowthRequest."""
    evaluation = evaluate_growth_request(request)
    lines = list(request.lines.select_related("product").all())
    return {
        "request_number": request.request_number,
        "request_type": request.request_type,
        "status": request.status,
        "priority": request.priority,
        "customer_id": request.customer_id,
        "source_subscription_id": request.source_subscription_id,
        "desired_plan_template_id": request.desired_plan_template_id,
        "desired_offer_package_id": request.desired_offer_package_id,
        "requested_product_id": request.requested_product_id,
        "current_product_id": request.current_product_id,
        "expected_value": str(request.expected_value) if request.expected_value is not None else None,
        "reason": request.reason,
        "risk_snapshot": request.risk_snapshot,
        "approval_required": request.approval_required,
        "evaluation": evaluation,
        "lines": [
            {
                "line_type": line.line_type,
                "product_id": line.product_id,
                "quantity": line.quantity,
                "proposed_price": str(line.proposed_price) if line.proposed_price is not None else None,
            }
            for line in lines
        ],
        "decided_at": request.decided_at.isoformat() if request.decided_at else None,
        "created_at": request.created_at.isoformat(),
    }
