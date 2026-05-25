"""Contract amendment Phase 1 service.

Phase 1 records auditable requests and admin review decisions only. It does not
mutate subscriptions, rent/lease contracts, payments, receipts, journals, EMI
rows, waivers, lucky draw records, inventory, commissions, payouts, or audit
history.
"""
from __future__ import annotations

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from subscriptions.models import AuditLog, ContractAmendment, PlanType, Subscription, SubscriptionStatus
from subscriptions.models_contract_amendment import PHASE1_AMENDMENT_TYPES
from subscriptions.services.audit_service import log_audit

_AMENDABLE_STATUSES = {
    SubscriptionStatus.ACTIVE,
    SubscriptionStatus.APPROVED,
    SubscriptionStatus.PAYMENT_PENDING,
    SubscriptionStatus.DELIVERY_PENDING,
    SubscriptionStatus.HANDED_OVER,
}

_HIGH_RISK_AMENDMENTS = {
    "TENURE_EXTENSION",
    "PRODUCT_CHANGE",
    "LUCKY_ID_CHANGE",
    "BATCH_CHANGE",
    "DEPOSIT_ADJUSTMENT",
    "EMI_AMOUNT_CHANGE",
    "CONTRACT_PRICE_CHANGE",
    "RENT_AMOUNT_CHANGE",
    "LEASE_TERM_CHANGE",
}


def _source_for(*, contract_type: str, subscription: Subscription | None = None, rent_lease_contract: Subscription | None = None) -> Subscription:
    if contract_type == "EMI_SUBSCRIPTION":
        if not subscription:
            raise ValidationError({"subscription": "EMI subscription source is required."})
        if rent_lease_contract:
            raise ValidationError({"source": "Exactly one contract source is allowed."})
        if subscription.plan_type != PlanType.EMI:
            raise ValidationError({"subscription": "EMI amendment requires an EMI subscription."})
        return subscription
    if contract_type == "RENT_LEASE":
        if not rent_lease_contract:
            raise ValidationError({"rent_lease_contract": "Rent/lease contract source is required."})
        if subscription:
            raise ValidationError({"source": "Exactly one contract source is allowed."})
        if rent_lease_contract.plan_type not in {PlanType.RENT, PlanType.LEASE}:
            raise ValidationError({"rent_lease_contract": "Rent/lease amendment requires a RENT or LEASE contract."})
        return rent_lease_contract
    raise ValidationError({"contract_type": "Direct Sale amendments are not supported."})


def _snapshot_for(source: Subscription) -> dict:
    return {
        "subscription_id": source.id,
        "subscription_number": source.subscription_number,
        "contract_reference": source.contract_reference,
        "plan_type": source.plan_type,
        "customer_id": source.customer_id,
        "product_id": source.product_id,
        "batch_id": source.batch_id,
        "lucky_id_id": source.lucky_id_id,
        "tenure_months": source.tenure_months,
        "total_amount": str(source.total_amount),
        "monthly_amount": str(source.monthly_amount),
        "status": source.status,
        "start_date": str(source.start_date),
    }


def _review_flags(contract_type: str, amendment_type: str) -> dict:
    return {
        "requires_emi_recalculation": amendment_type in {"TENURE_EXTENSION", "EMI_AMOUNT_CHANGE", "CONTRACT_PRICE_CHANGE"},
        "requires_inventory_review": amendment_type in {"PRODUCT_CHANGE"},
        "requires_lucky_id_review": amendment_type in {"LUCKY_ID_CHANGE", "BATCH_CHANGE"},
        "requires_accounting_review": amendment_type in _HIGH_RISK_AMENDMENTS,
        "requires_rent_lease_review": contract_type == "RENT_LEASE" or amendment_type in {"DEPOSIT_ADJUSTMENT", "RENT_AMOUNT_CHANGE", "LEASE_TERM_CHANGE"},
    }


@transaction.atomic
def create_amendment(
    *,
    subscription: Subscription | None = None,
    rent_lease_contract: Subscription | None = None,
    contract_type: str = "EMI_SUBSCRIPTION",
    amendment_type: str,
    requested_values: dict | None = None,
    reason: str,
    requested_by,
    requested_role: str,
    admin_note: str = "",
    metadata: dict | None = None,
    previous_values: dict | None = None,
    new_values: dict | None = None,
    notes: str = "",
) -> ContractAmendment:
    if amendment_type not in PHASE1_AMENDMENT_TYPES:
        raise ValidationError({"amendment_type": f"Unknown amendment type: {amendment_type!r}"})
    if requested_role not in {"CUSTOMER", "PARTNER"}:
        raise ValidationError({"requested_role": "Only CUSTOMER or PARTNER can request amendments."})
    if not reason or not reason.strip():
        raise ValidationError({"reason": "Amendment reason is required."})

    source = _source_for(contract_type=contract_type, subscription=subscription, rent_lease_contract=rent_lease_contract)
    if source.status not in _AMENDABLE_STATUSES:
        raise ValidationError(f"Cannot request an amendment on a contract in status '{source.status}'.")

    values = requested_values if requested_values is not None else (new_values or {})
    old_values = previous_values if previous_values is not None else _snapshot_for(source)
    flags = _review_flags(contract_type, amendment_type)

    amendment = ContractAmendment.objects.create(
        subscription=source if contract_type == "EMI_SUBSCRIPTION" else None,
        rent_lease_contract=source if contract_type == "RENT_LEASE" else None,
        contract_type=contract_type,
        customer=source.customer,
        partner=source.partner,
        requested_by=requested_by,
        requested_role=requested_role,
        amendment_type=amendment_type,
        status="REQUESTED",
        previous_values=old_values,
        new_values=values or {},
        old_values=old_values,
        requested_values=values or {},
        reason=reason.strip(),
        admin_note=(admin_note or "").strip(),
        notes=(notes or "").strip(),
        metadata={"phase": "PHASE_1_REQUEST_ONLY", **(metadata or {})},
        **flags,
    )

    log_audit(
        action_type=AuditLog.ActionType.CONTRACT_AMENDMENT_REQUESTED,
        instance=source,
        performed_by=requested_by,
        metadata={"amendment_id": amendment.pk, "amendment_no": amendment.amendment_no, "amendment_type": amendment_type, "phase": "PHASE_1"},
    )
    return amendment


@transaction.atomic
def mark_under_review(*, amendment: ContractAmendment, reviewed_by, admin_note: str = "") -> ContractAmendment:
    if amendment.status != "REQUESTED":
        raise ValidationError(f"Cannot move amendment in status '{amendment.status}' to review. Must be REQUESTED.")
    amendment.status = "UNDER_REVIEW"
    amendment.admin_note = (admin_note or amendment.admin_note or "").strip()
    amendment.save(update_fields=["status", "admin_note", "updated_at"])
    return amendment


@transaction.atomic
def approve_amendment(*, amendment: ContractAmendment, approved_by, approved_values: dict | None = None, admin_note: str = "") -> ContractAmendment:
    if amendment.status not in {"REQUESTED", "UNDER_REVIEW"}:
        raise ValidationError(f"Cannot approve amendment in status '{amendment.status}'.")
    amendment.status = "APPROVED"
    amendment.approved_by = approved_by
    amendment.approved_at = timezone.now()
    amendment.approved_values = approved_values if approved_values is not None else (amendment.requested_values or {})
    amendment.admin_note = (admin_note or amendment.admin_note or "").strip()
    amendment.metadata = {**(amendment.metadata or {}), "approved_without_implementation": True}
    amendment.save(update_fields=["status", "approved_by", "approved_at", "approved_values", "admin_note", "metadata", "updated_at"])

    source = amendment.source_contract()
    log_audit(
        action_type=AuditLog.ActionType.CONTRACT_AMENDMENT_APPROVED,
        instance=source,
        performed_by=approved_by,
        metadata={"amendment_id": amendment.pk, "amendment_no": amendment.amendment_no, "phase": "PHASE_1_APPROVAL_ONLY"},
    )
    return amendment


@transaction.atomic
def reject_amendment(*, amendment: ContractAmendment, rejected_by, rejection_reason: str, admin_note: str = "") -> ContractAmendment:
    if amendment.status not in {"REQUESTED", "UNDER_REVIEW"}:
        raise ValidationError(f"Cannot reject amendment in status '{amendment.status}'.")
    if not rejection_reason or not rejection_reason.strip():
        raise ValidationError({"rejection_reason": "Rejection reason is required."})

    amendment.status = "REJECTED"
    amendment.rejection_reason = rejection_reason.strip()
    amendment.admin_note = (admin_note or amendment.admin_note or "").strip()
    amendment.save(update_fields=["status", "rejection_reason", "admin_note", "updated_at"])

    source = amendment.source_contract()
    log_audit(
        action_type=AuditLog.ActionType.CONTRACT_AMENDMENT_REJECTED,
        instance=source,
        performed_by=rejected_by,
        metadata={"amendment_id": amendment.pk, "amendment_no": amendment.amendment_no, "reason": rejection_reason[:200], "phase": "PHASE_1"},
    )
    return amendment


@transaction.atomic
def apply_amendment(*, amendment: ContractAmendment, applied_by) -> ContractAmendment:
    raise ValidationError("Implementation is blocked in Phase 1. Use later controlled implementation phases.")
