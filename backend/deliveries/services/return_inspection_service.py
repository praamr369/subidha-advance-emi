"""Rent/Lease return inspection service."""
from __future__ import annotations

from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from subscriptions.models import (
    AuditLog,
    DeliveryStatus,
    InspectionCondition,
    InspectionOutcome,
    InspectionStatus,
    PlanType,
    RentalAsset,
    RentalAssetStatus,
    RentLeaseReturnInspection,
    Subscription,
    SubscriptionStatus,
)
from subscriptions.services.audit_service import log_audit

MONEY_ZERO = Decimal("0.00")
ONE_UNIT = Decimal("1.000")


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
    from contracts.services.rent_lease_billing_service import (
        approvable_deposit_refund_amount,
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
    # Approve only what is not already approved (e.g. from the deposits page),
    # so the same deposit is never approved twice.
    refund_to_approve = min(
        inspection.deposit_refund_amount,
        approvable_deposit_refund_amount(subscription=inspection.subscription),
    )
    if refund_to_approve > MONEY_ZERO:
        approve_deposit_refund(
            subscription=inspection.subscription,
            amount=refund_to_approve,
            approved_by=approved_by,
            inspection=inspection,
        )

    complete_inspected_return(inspection, performed_by=approved_by)

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


@transaction.atomic
def complete_inspected_return(
    inspection: RentLeaseReturnInspection, *, performed_by=None
) -> dict:
    """Bring the returned unit back and route it by the approved outcome.

    1. The delivery is closed as RETURNED. The delivery bridge posts the
       plan-specific RENT_RETURN_IN / LEASE_RETURN_IN (+1) and marks the rental
       asset RETURNED — the unit is physically back in the building.
    2. The outcome then decides where it goes: SELLABLE stays in stock and the
       asset is available again; MAINTENANCE_REQUIRED goes on maintenance hold;
       DAMAGED / SCRAPPED is written off.
    3. The contract moves to RETURNED.

    Every step is idempotent, so this is safe to re-run for an inspection that
    was approved before the return was wired through.
    """
    if inspection.status != InspectionStatus.APPROVED:
        raise ValidationError("Only an approved inspection can complete the return.")

    subscription = Subscription.objects.select_for_update().get(pk=inspection.subscription_id)
    # Capture the asset first: closing the delivery unlinks it from the contract.
    asset = (
        RentalAsset.objects.select_for_update()
        .filter(current_subscription=subscription)
        .exclude(status=RentalAssetStatus.RETIRED)
        .order_by("id")
        .first()
    ) or _asset_returned_from(subscription)

    result = {"delivery": _close_return_delivery(subscription, inspection, performed_by)}
    result["outcome_stock"] = _route_returned_stock(inspection, subscription, performed_by)
    result["asset"] = _route_returned_asset(inspection, asset, performed_by)
    result["subscription_status"] = _mark_subscription_returned(subscription)
    result["cancelled_demand_ids"] = cancel_unbilled_rent_demands(subscription)
    return result


def cancel_unbilled_rent_demands(subscription: Subscription) -> list[int]:
    """Cancel monthly rent/lease demands for periods that start after the return.

    The goods are back, so those months are not owed. Only untouched demands
    (nothing collected) are cancelled; part-paid demands and the month the
    return fell in stay for the desk to settle. Idempotent.
    """
    from subscriptions.models import (
        RentLeaseBillingDemand,
        RentLeaseDemandStatus,
        RentLeaseDemandType,
        SubscriptionDelivery,
    )

    returned_at = (
        SubscriptionDelivery.objects.filter(subscription=subscription, returned_at__isnull=False)
        .order_by("-returned_at")
        .values_list("returned_at", flat=True)
        .first()
    )
    return_date = timezone.localdate(returned_at) if returned_at else timezone.localdate()
    demands = list(
        RentLeaseBillingDemand.objects.select_for_update().filter(
            subscription=subscription,
            demand_type__in=[RentLeaseDemandType.RENT_MONTHLY, RentLeaseDemandType.LEASE_MONTHLY],
            status__in=[RentLeaseDemandStatus.PENDING, RentLeaseDemandStatus.OVERDUE, RentLeaseDemandStatus.DRY_RUN],
            collected_amount=MONEY_ZERO,
            billing_period_start__gt=return_date,
        )
    )
    for demand in demands:
        demand.status = RentLeaseDemandStatus.CANCELLED
        demand.metadata = {
            **(demand.metadata or {}),
            "cancelled_reason": "GOODS_RETURNED",
            "returned_on": return_date.isoformat(),
        }
        demand.save(update_fields=["status", "metadata", "updated_at"])
    return [demand.id for demand in demands]


def returned_asset_id_for_subscription(subscription_id) -> int | None:
    """Id of the rental asset most recently brought back from this contract.

    A return unlinks the asset from its contract; the RENTAL_ASSET_RETURNED
    audit row is what still ties them together.
    """
    return (
        AuditLog.objects.filter(
            action_type=AuditLog.ActionType.RENTAL_ASSET_RETURNED,
            model_name="RentalAsset",
            metadata__prev_subscription_id=subscription_id,
        )
        .order_by("-id")
        .values_list("object_id", flat=True)
        .first()
    )


def _asset_returned_from(subscription: Subscription):
    """The asset already brought back from this contract, still awaiting routing.

    When the delivery desk marks the return first, the asset is unlinked from
    the contract (RETURNED, no current_subscription) before the inspection is
    approved. Its RENTAL_ASSET_RETURNED audit row still names the contract.
    """
    returned = returned_asset_id_for_subscription(subscription.pk)
    if returned is None:
        return None
    return (
        RentalAsset.objects.select_for_update()
        .filter(pk=returned, status=RentalAssetStatus.RETURNED, current_subscription__isnull=True)
        .first()
    )


def _tracked_inventory_item(subscription: Subscription):
    """The product's stock record, or None when stock isn't tracked."""
    try:
        item = subscription.product.inventory_profile
    except Exception:
        return None
    if item is None or not item.stock_tracking_enabled:
        return None
    return item


def _close_return_delivery(subscription, inspection, performed_by) -> dict:
    return return_unit_to_stock(
        subscription,
        reference_model="RentLeaseReturnInspection",
        reference_id=inspection.pk,
        movement_date=inspection.inspection_date,
        notes="Return inspection approved.",
        performed_by=performed_by,
    )


def return_unit_to_stock(
    subscription: Subscription,
    *,
    reference_model: str,
    reference_id,
    movement_date=None,
    notes: str = "",
    performed_by=None,
) -> dict:
    """Bring a unit back from the customer.

    Closes the contract's delivery as RETURNED — the delivery bridge posts the
    plan-specific *_RETURN_IN (+1) and marks the rental asset RETURNED. A unit
    handed over without a delivery record gets the return-in posted directly
    against ``reference_model``/``reference_id`` instead.

    Shared by return-inspection approval and repossession completion so both
    bring stock back the same way. Idempotent: the delivery only moves forward
    and the stock entry is unique per reference.
    """
    from deliveries.services.delivery_service import (
        get_current_subscription_delivery,
        mark_subscription_delivery_returned,
        request_subscription_delivery_return,
    )

    delivery = get_current_subscription_delivery(subscription)
    if delivery is not None and delivery.status in (
        DeliveryStatus.DELIVERED,
        DeliveryStatus.RETURN_REQUESTED,
        DeliveryStatus.RETURNED,
    ):
        try:
            if delivery.status == DeliveryStatus.DELIVERED:
                delivery = request_subscription_delivery_return(
                    delivery=delivery,
                    performed_by=performed_by,
                    notes=notes,
                )
            if delivery.status == DeliveryStatus.RETURN_REQUESTED:
                delivery = mark_subscription_delivery_returned(
                    delivery=delivery,
                    performed_by=performed_by,
                    notes=notes,
                )
        except ValueError as exc:
            raise ValidationError(str(exc)) from exc
        return {"delivery_id": delivery.pk, "status": delivery.status}

    # Handed over without a delivery record: bring the unit back directly.
    item = _tracked_inventory_item(subscription)
    if item is None:
        return {"delivery_id": None, "skipped": True, "reason": "inventory_not_tracked"}
    from inventory.models import RETURN_IN_MOVEMENT_TYPE_BY_PLAN
    from inventory.services.stock_service import create_stock_ledger_entry

    movement_type = RETURN_IN_MOVEMENT_TYPE_BY_PLAN[str(subscription.plan_type)]
    entry, created = create_stock_ledger_entry(
        inventory_item=item,
        movement_type=movement_type,
        movement_date=movement_date or timezone.localdate(),
        quantity_in=ONE_UNIT,
        reference_model=reference_model,
        reference_id=str(reference_id),
        notes=f"Returned from Sub#{subscription.pk}",
        posted_by=performed_by,
    )
    return {"delivery_id": None, "movement_type": movement_type, "stock_ledger_id": entry.pk, "created": created}


def _route_returned_stock(inspection, subscription, performed_by) -> dict:
    outcome = inspection.outcome
    if outcome == InspectionOutcome.SELLABLE:
        # The return-in already put the unit back in sellable stock.
        return {"movement_type": None, "reason": "sellable_stays_in_stock"}

    item = _tracked_inventory_item(subscription)
    if item is None:
        return {"movement_type": None, "skipped": True, "reason": "inventory_not_tracked"}

    from inventory.models import StockMovementType
    from inventory.services.stock_service import create_stock_ledger_entry

    movement_type = (
        StockMovementType.MAINTENANCE_HOLD
        if outcome == InspectionOutcome.MAINTENANCE_REQUIRED
        else StockMovementType.DAMAGE
    )
    entry, created = create_stock_ledger_entry(
        inventory_item=item,
        movement_type=movement_type,
        movement_date=inspection.inspection_date or timezone.localdate(),
        quantity_out=ONE_UNIT,
        reference_model="RentLeaseReturnInspection",
        reference_id=str(inspection.pk),
        notes=f"Returned from Sub#{subscription.pk} — {outcome}",
        posted_by=performed_by,
    )
    return {"movement_type": movement_type, "stock_ledger_id": entry.pk, "created": created}


def _route_returned_asset(inspection, asset, performed_by) -> dict:
    if asset is None:
        return {"changed": False, "reason": "no_linked_asset"}

    from deliveries.services.rental_asset_lifecycle_service import (
        mark_asset_available,
        mark_asset_returned,
        mark_asset_under_repair,
        retire_asset,
    )

    asset.refresh_from_db()
    if asset.status == RentalAssetStatus.HANDED_OVER:
        asset = mark_asset_returned(asset, performed_by=performed_by)
    if asset.status != RentalAssetStatus.RETURNED:
        # Already routed (or moved on since) — leave it alone.
        return {"changed": False, "asset_id": asset.pk, "status": asset.status}

    outcome = inspection.outcome
    if outcome == InspectionOutcome.SELLABLE:
        asset = mark_asset_available(asset, performed_by=performed_by)
    elif outcome == InspectionOutcome.SCRAPPED:
        asset = retire_asset(asset, performed_by=performed_by, reason="Scrapped at return inspection.")
    else:
        asset = mark_asset_under_repair(
            asset,
            performed_by=performed_by,
            reason=inspection.stock_routing_notes or f"Return inspection outcome: {outcome}.",
        )
    return {"changed": True, "asset_id": asset.pk, "status": asset.status}


@transaction.atomic
def release_returned_asset(asset: RentalAsset, *, performed_by=None) -> RentalAsset:
    """Put a returned or repaired unit back in the rental pool.

    A MAINTENANCE_REQUIRED inspection left a MAINTENANCE_HOLD on the stock
    record; releasing the unit lifts it with a matching MAINTENANCE_RELEASE
    (both are soft holds — physical stock is unchanged, availability returns).
    Holds are matched per inventory item, oldest unreleased first.
    """
    from deliveries.services.rental_asset_lifecycle_service import mark_asset_available
    from inventory.models import StockLedger, StockMovementType
    from inventory.services.stock_service import create_stock_ledger_entry

    asset = RentalAsset.objects.select_for_update().get(pk=asset.pk)
    if asset.status not in (RentalAssetStatus.RETURNED, RentalAssetStatus.UNDER_REPAIR):
        raise ValidationError(
            f"Only a returned or under-repair asset can be released; "
            f"'{asset.asset_code}' is {asset.status}."
        )

    item = asset.inventory_item
    if item is None:
        try:
            item = asset.product.inventory_profile
        except Exception:
            item = None

    if asset.status == RentalAssetStatus.UNDER_REPAIR and item is not None:
        released_refs = StockLedger.objects.filter(
            inventory_item=item,
            movement_type=StockMovementType.MAINTENANCE_RELEASE,
            reference_model="RentLeaseReturnInspection",
        ).values_list("reference_id", flat=True)
        hold = (
            StockLedger.objects.filter(
                inventory_item=item,
                movement_type=StockMovementType.MAINTENANCE_HOLD,
                reference_model="RentLeaseReturnInspection",
            )
            .exclude(reference_id__in=list(released_refs))
            .order_by("pk")
            .first()
        )
        if hold is not None:
            create_stock_ledger_entry(
                inventory_item=item,
                movement_type=StockMovementType.MAINTENANCE_RELEASE,
                movement_date=timezone.localdate(),
                quantity_in=ONE_UNIT,
                stock_location=hold.stock_location,
                reference_model="RentLeaseReturnInspection",
                reference_id=hold.reference_id,
                notes=f"Released {asset.asset_code} after maintenance",
                posted_by=performed_by,
            )

    return mark_asset_available(asset, performed_by=performed_by)


def _mark_subscription_returned(subscription: Subscription) -> str:
    from subscriptions.services.state_machine import change_subscription_status

    subscription.refresh_from_db(fields=["status"])
    if subscription.status == SubscriptionStatus.HANDED_OVER:
        change_subscription_status(subscription, SubscriptionStatus.RETURN_PENDING)
    if subscription.status == SubscriptionStatus.RETURN_PENDING:
        change_subscription_status(subscription, SubscriptionStatus.RETURNED)
    return subscription.status
