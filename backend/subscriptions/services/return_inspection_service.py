"""Rent/Lease return inspection service."""
from __future__ import annotations

from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from subscriptions.models import (
    AuditLog,
    InspectionCondition,
    InspectionOutcome,
    InspectionStatus,
    PlanType,
    RentLeaseReturnInspection,
    Subscription,
)
from subscriptions.services.audit_service import log_audit

MONEY_ZERO = Decimal("0.00")


@transaction.atomic
def create_return_inspection(
    *, subscription: Subscription, performed_by
) -> RentLeaseReturnInspection:
    """Create PENDING inspection. Idempotent."""
    if subscription.plan_type not in (PlanType.RENT, PlanType.LEASE):
        raise ValidationError("Return inspections are only for RENT and LEASE contracts.")

    existing = RentLeaseReturnInspection.objects.filter(subscription=subscription).first()
    if existing:
        return existing

    inspection = RentLeaseReturnInspection.objects.create(
        subscription=subscription,
        status=InspectionStatus.PENDING,
        condition_recorded=InspectionCondition.NOT_ASSESSED,
        damage_deduction_amount=MONEY_ZERO,
        deposit_refund_amount=MONEY_ZERO,
        deposit_refund_approved=False,
    )

    log_audit(
        action_type=AuditLog.ActionType.CONTRACT_RETURN_INSPECTION_CREATED,
        instance=subscription,
        performed_by=performed_by,
        metadata={"inspection_id": inspection.pk},
    )
    return inspection


@transaction.atomic
def record_inspection(
    *,
    inspection: RentLeaseReturnInspection,
    inspected_by,
    condition: str,
    outcome: str,
    damage_notes: str = "",
    damage_deduction_amount: Decimal = MONEY_ZERO,
    deposit_refund_amount: Decimal = MONEY_ZERO,
    inspection_date=None,
    stock_routing_notes: str = "",
) -> RentLeaseReturnInspection:
    if inspection.status not in (InspectionStatus.PENDING, InspectionStatus.IN_PROGRESS):
        raise ValidationError(
            f"Cannot record inspection in status '{inspection.status}'."
        )
    if condition not in InspectionCondition.values:
        raise ValidationError({"condition": f"Unknown condition: {condition!r}"})
    if outcome not in InspectionOutcome.values:
        raise ValidationError({"outcome": f"Unknown outcome: {outcome!r}"})
    if damage_deduction_amount < MONEY_ZERO:
        raise ValidationError({"damage_deduction_amount": "Damage deduction cannot be negative."})
    if deposit_refund_amount < MONEY_ZERO:
        raise ValidationError({"deposit_refund_amount": "Deposit refund cannot be negative."})

    inspection.status = InspectionStatus.COMPLETED
    inspection.inspected_by = inspected_by
    inspection.condition_recorded = condition
    inspection.outcome = outcome
    inspection.damage_notes = (damage_notes or "").strip()
    inspection.damage_deduction_amount = damage_deduction_amount
    inspection.deposit_refund_amount = deposit_refund_amount
    inspection.inspection_date = inspection_date or timezone.localdate()
    inspection.stock_routing_notes = (stock_routing_notes or "").strip()
    inspection.save()
    return inspection


@transaction.atomic
def approve_inspection(
    *, inspection: RentLeaseReturnInspection, approved_by
) -> RentLeaseReturnInspection:
    """Approve inspection. Product only becomes sellable after SELLABLE outcome here."""
    if inspection.status != InspectionStatus.COMPLETED:
        raise ValidationError(
            f"Cannot approve inspection in status '{inspection.status}'. Must be COMPLETED."
        )
    if not inspection.outcome:
        raise ValidationError("Inspection outcome must be set before approval.")

    inspection.status = InspectionStatus.APPROVED
    inspection.approved_by = approved_by
    inspection.approved_at = timezone.now()
    inspection.deposit_refund_approved = True
    inspection.save(update_fields=[
        "status", "approved_by", "approved_at", "deposit_refund_approved", "updated_at"
    ])

    # Keep deposit deductions/refunds append-only and auditable.
    from subscriptions.services.rent_lease_billing_service import (
        approve_deposit_refund,
        record_damage_deduction,
    )
    if inspection.damage_deduction_amount > MONEY_ZERO:
        record_damage_deduction(
            subscription=inspection.subscription,
            amount=inspection.damage_deduction_amount,
            reason=(inspection.damage_notes or "Damage deduction from approved return inspection."),
            performed_by=approved_by,
            inspection=inspection,
        )
    if inspection.deposit_refund_amount > MONEY_ZERO:
        approve_deposit_refund(
            subscription=inspection.subscription,
            amount=inspection.deposit_refund_amount,
            approved_by=approved_by,
            inspection=inspection,
        )

    _route_returned_stock(inspection, approved_by)

    log_audit(
        action_type=AuditLog.ActionType.CONTRACT_RETURN_INSPECTION_APPROVED,
        instance=inspection.subscription,
        performed_by=approved_by,
        metadata={
            "outcome": inspection.outcome,
            "damage_deduction": str(inspection.damage_deduction_amount),
            "deposit_refund": str(inspection.deposit_refund_amount),
        },
    )

    # Close possession record
    from subscriptions.models import ProductPossession, PossessionStatus
    possession = ProductPossession.objects.filter(subscription=inspection.subscription).first()
    if possession and possession.status != PossessionStatus.CLOSED:
        possession.status = PossessionStatus.CLOSED
        possession.save(update_fields=["status", "updated_at"])

    return inspection


def _route_returned_stock(
    inspection: RentLeaseReturnInspection, performed_by
) -> None:
    from inventory.services.stock_movement_service import post_movement
    from inventory.models import StockMovementType

    subscription = inspection.subscription
    try:
        item = subscription.product.inventory_item
    except Exception:
        return  # No inventory item; skip stock routing

    outcome = inspection.outcome
    ref = {"reference_model": "RentLeaseReturnInspection", "reference_id": str(inspection.pk), "posted_by": performed_by}

    if outcome == InspectionOutcome.SELLABLE:
        post_movement(inventory_item=item, movement_type=StockMovementType.CUSTOMER_RETURN,
                      quantity_in=1, quantity_out=0,
                      notes=f"Returned from Sub#{subscription.pk} — SELLABLE", **ref)
    elif outcome == InspectionOutcome.MAINTENANCE_REQUIRED:
        post_movement(inventory_item=item, movement_type=StockMovementType.MAINTENANCE_HOLD,
                      quantity_in=0, quantity_out=1,
                      notes=f"Returned from Sub#{subscription.pk} — MAINTENANCE", **ref)
    elif outcome in (InspectionOutcome.DAMAGED, InspectionOutcome.SCRAPPED):
        post_movement(inventory_item=item, movement_type=StockMovementType.DAMAGE,
                      quantity_in=0, quantity_out=1,
                      notes=f"Returned from Sub#{subscription.pk} — {outcome}", **ref)
