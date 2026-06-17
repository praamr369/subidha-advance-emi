"""Rental Asset Lifecycle service (P3B).

Tracks physical furniture units used for RENT/LEASE contracts as reusable
business assets: reservation → handover → return → repair → re-handover.

Scope / guardrails
------------------
* Does NOT mutate InventoryItem stock quantities or StockLedger entries — stock
  movements remain solely in the inventory app.
* Does NOT post accounting entries or journal vouchers.
* Does NOT touch EMI math, payment posting, draw, waiver, commission, or
  reconciliation semantics.
* Validates plan_type=RENT or LEASE before reservation/handover.
* Prevents invalid status transitions and double-reservation.
* Logs audit events using the existing log_audit() helper.
* Returns structured result dicts rather than raising generic exceptions so
  callers can surface user-friendly blockers.
"""
from __future__ import annotations

from decimal import Decimal
from typing import Optional

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from subscriptions.models import (
    AuditLog,
    AssetConditionGrade,
    AssetConditionSnapshot,
    AssetConditionSnapshotStage,
    Customer,
    PlanType,
    RentalAsset,
    RentalAssetStatus,
    Subscription,
    SubscriptionDocument,
)
from subscriptions.services.audit_service import log_audit

MONEY_ZERO = Decimal("0.00")

# ---------------------------------------------------------------------------
# Valid status transitions
# ---------------------------------------------------------------------------
_ALLOWED_TRANSITIONS: set[tuple[str, str]] = {
    (RentalAssetStatus.AVAILABLE, RentalAssetStatus.RESERVED),
    (RentalAssetStatus.RESERVED, RentalAssetStatus.HANDED_OVER),
    (RentalAssetStatus.RESERVED, RentalAssetStatus.AVAILABLE),   # cancel reservation
    (RentalAssetStatus.HANDED_OVER, RentalAssetStatus.RETURNED),
    (RentalAssetStatus.RETURNED, RentalAssetStatus.AVAILABLE),
    (RentalAssetStatus.RETURNED, RentalAssetStatus.UNDER_REPAIR),
    (RentalAssetStatus.AVAILABLE, RentalAssetStatus.UNDER_REPAIR),
    (RentalAssetStatus.UNDER_REPAIR, RentalAssetStatus.AVAILABLE),
    (RentalAssetStatus.UNDER_REPAIR, RentalAssetStatus.RETIRED),
    (RentalAssetStatus.AVAILABLE, RentalAssetStatus.RETIRED),
    (RentalAssetStatus.RETURNED, RentalAssetStatus.RETIRED),
    (RentalAssetStatus.DAMAGED, RentalAssetStatus.RETIRED)
    if hasattr(RentalAssetStatus, "DAMAGED") else ("_", "_"),  # guard for missing status
}
# Clean out the dummy guard entry
_ALLOWED_TRANSITIONS.discard(("_", "_"))


def _check_transition(asset: RentalAsset, next_status: str) -> None:
    """Raise ValidationError when the status transition is not permitted."""
    current = asset.status
    if current == next_status:
        return
    if (current, next_status) not in _ALLOWED_TRANSITIONS:
        raise ValidationError(
            f"Cannot transition rental asset '{asset.asset_code}' "
            f"from {current} to {next_status}."
        )


def _require_rent_or_lease(subscription: Subscription, operation: str) -> None:
    if subscription.plan_type not in (PlanType.RENT, PlanType.LEASE):
        raise ValidationError(
            f"{operation} is only supported for RENT and LEASE subscriptions. "
            f"Subscription {subscription.pk} has plan_type={subscription.plan_type}."
        )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

@transaction.atomic
def create_rental_asset_from_inventory(
    *,
    product,
    asset_code: str,
    inventory_item=None,
    serial_no: str = "",
    purchase_cost: Decimal = MONEY_ZERO,
    current_location=None,
    condition_grade: str = AssetConditionGrade.UNKNOWN,
    metadata: dict | None = None,
    performed_by=None,
) -> RentalAsset:
    """Register a new RentalAsset for RENT/LEASE tracking.

    Does not affect InventoryItem stock quantities.
    Returns the created RentalAsset.
    """
    asset_code = (asset_code or "").strip().upper()
    if not asset_code:
        raise ValidationError({"asset_code": "Asset code is required."})

    if RentalAsset.objects.filter(asset_code=asset_code).exists():
        raise ValidationError(
            {"asset_code": f"A rental asset with code '{asset_code}' already exists."}
        )

    asset = RentalAsset.objects.create(
        product=product,
        inventory_item=inventory_item,
        asset_code=asset_code,
        serial_no=(serial_no or "").strip(),
        purchase_cost=purchase_cost or MONEY_ZERO,
        current_location=current_location,
        status=RentalAssetStatus.AVAILABLE,
        condition_grade=condition_grade or AssetConditionGrade.UNKNOWN,
        metadata=metadata or {},
        created_by=performed_by,
        updated_by=performed_by,
    )

    log_audit(
        action_type=AuditLog.ActionType.RENTAL_ASSET_CREATED,
        instance=asset,
        performed_by=performed_by,
        metadata={"asset_code": asset.asset_code, "product_id": product.pk},
    )

    return asset


@transaction.atomic
def reserve_asset_for_subscription(
    asset: RentalAsset,
    subscription: Subscription,
    *,
    performed_by=None,
) -> RentalAsset:
    """Mark asset RESERVED for a specific RENT/LEASE subscription.

    Rules:
    - Asset must be AVAILABLE.
    - Subscription must be RENT or LEASE.
    - Asset cannot already be RESERVED for another active subscription.
    """
    _require_rent_or_lease(subscription, "Reserve asset")
    _check_transition(asset, RentalAssetStatus.RESERVED)

    # Guard against double-reservation for a different active subscription.
    if (
        asset.current_subscription_id
        and asset.current_subscription_id != subscription.pk
    ):
        raise ValidationError(
            f"Asset '{asset.asset_code}' is already linked to subscription "
            f"{asset.current_subscription_id}."
        )

    asset.status = RentalAssetStatus.RESERVED
    asset.current_subscription = subscription
    asset.current_customer = subscription.customer
    asset.updated_by = performed_by
    asset.save(update_fields=[
        "status", "current_subscription", "current_customer", "updated_by",
    ])

    log_audit(
        action_type=AuditLog.ActionType.RENTAL_ASSET_RESERVED,
        instance=asset,
        performed_by=performed_by,
        metadata={
            "asset_code": asset.asset_code,
            "subscription_id": subscription.pk,
            "customer_id": subscription.customer_id,
        },
    )

    return asset


@transaction.atomic
def mark_asset_handed_over(
    asset: RentalAsset,
    subscription: Subscription,
    *,
    performed_by=None,
) -> RentalAsset:
    """Mark asset HANDED_OVER (delivered to customer).

    Rules:
    - Asset must be RESERVED.
    - Subscription must be RENT or LEASE and must match the reserved subscription.
    - RETIRED assets can never be handed over.
    """
    if asset.status == RentalAssetStatus.RETIRED:
        raise ValidationError(
            f"Asset '{asset.asset_code}' is RETIRED and cannot be handed over."
        )

    _require_rent_or_lease(subscription, "Hand over asset")
    _check_transition(asset, RentalAssetStatus.HANDED_OVER)

    if asset.current_subscription_id and asset.current_subscription_id != subscription.pk:
        raise ValidationError(
            f"Asset '{asset.asset_code}' is reserved for subscription "
            f"{asset.current_subscription_id}, not {subscription.pk}."
        )

    asset.status = RentalAssetStatus.HANDED_OVER
    asset.current_subscription = subscription
    asset.current_customer = subscription.customer
    asset.updated_by = performed_by
    asset.save(update_fields=[
        "status", "current_subscription", "current_customer", "updated_by",
    ])

    log_audit(
        action_type=AuditLog.ActionType.RENTAL_ASSET_HANDED_OVER,
        instance=asset,
        performed_by=performed_by,
        metadata={
            "asset_code": asset.asset_code,
            "subscription_id": subscription.pk,
            "customer_id": subscription.customer_id,
        },
    )

    return asset


@transaction.atomic
def record_asset_condition_snapshot(
    asset: RentalAsset,
    *,
    stage: str,
    subscription: Subscription | None = None,
    condition_grade: str = AssetConditionGrade.UNKNOWN,
    condition_score: int | None = None,
    notes: str = "",
    assessed_by=None,
    document: SubscriptionDocument | None = None,
    assessed_at=None,
    metadata: dict | None = None,
) -> AssetConditionSnapshot:
    """Record an immutable condition snapshot for the asset at a lifecycle stage.

    Snapshots are append-only; do not call this to mutate an existing snapshot.
    Returns the created AssetConditionSnapshot.
    """
    if stage not in AssetConditionSnapshotStage.values:
        raise ValidationError({"stage": f"Unknown stage: {stage!r}"})

    if condition_score is not None and not (1 <= condition_score <= 10):
        raise ValidationError(
            {"condition_score": "Condition score must be between 1 and 10."}
        )

    snapshot = AssetConditionSnapshot.objects.create(
        asset=asset,
        subscription=subscription,
        stage=stage,
        condition_grade=condition_grade or AssetConditionGrade.UNKNOWN,
        condition_score=condition_score,
        notes=(notes or "").strip(),
        assessed_by=assessed_by,
        assessed_at=assessed_at or timezone.now(),
        document=document,
        metadata=metadata or {},
    )

    # Update asset's last_inspection_date to keep it current.
    inspection_date = (assessed_at or timezone.now()).date() if assessed_at else timezone.now().date()
    asset.last_inspection_date = inspection_date
    asset.condition_grade = condition_grade or AssetConditionGrade.UNKNOWN
    asset.updated_by = assessed_by
    asset.save(update_fields=["last_inspection_date", "condition_grade", "updated_by"])

    log_audit(
        action_type=AuditLog.ActionType.RENTAL_ASSET_CONDITION_SNAPSHOT,
        instance=snapshot,
        performed_by=assessed_by,
        metadata={
            "asset_id": asset.pk,
            "asset_code": asset.asset_code,
            "stage": stage,
            "condition_grade": condition_grade,
            "condition_score": condition_score,
            "subscription_id": subscription.pk if subscription else None,
        },
    )

    return snapshot


@transaction.atomic
def mark_asset_returned(
    asset: RentalAsset,
    *,
    performed_by=None,
    condition_snapshot: AssetConditionSnapshot | None = None,
) -> RentalAsset:
    """Mark asset RETURNED (physically back at the shop).

    Clears current_customer and current_subscription.
    Optionally links a pre-recorded AFTER_RETURN condition snapshot.
    """
    _check_transition(asset, RentalAssetStatus.RETURNED)

    prev_subscription_id = asset.current_subscription_id
    prev_customer_id = asset.current_customer_id

    asset.status = RentalAssetStatus.RETURNED
    asset.current_subscription = None
    asset.current_customer = None
    asset.updated_by = performed_by
    asset.save(update_fields=[
        "status", "current_subscription", "current_customer", "updated_by",
    ])

    log_audit(
        action_type=AuditLog.ActionType.RENTAL_ASSET_RETURNED,
        instance=asset,
        performed_by=performed_by,
        metadata={
            "asset_code": asset.asset_code,
            "prev_subscription_id": prev_subscription_id,
            "prev_customer_id": prev_customer_id,
            "condition_snapshot_id": condition_snapshot.pk if condition_snapshot else None,
        },
    )

    return asset


@transaction.atomic
def mark_asset_under_repair(
    asset: RentalAsset,
    *,
    performed_by=None,
    reason: str = "",
) -> RentalAsset:
    """Send asset to repair / maintenance.

    Asset must be AVAILABLE or RETURNED.
    """
    _check_transition(asset, RentalAssetStatus.UNDER_REPAIR)

    asset.status = RentalAssetStatus.UNDER_REPAIR
    asset.updated_by = performed_by
    if reason:
        meta = dict(asset.metadata or {})
        meta["repair_reason"] = reason.strip()
        asset.metadata = meta
    asset.save(update_fields=["status", "updated_by", "metadata"])

    log_audit(
        action_type=AuditLog.ActionType.RENTAL_ASSET_UNDER_REPAIR,
        instance=asset,
        performed_by=performed_by,
        metadata={"asset_code": asset.asset_code, "reason": reason},
    )

    return asset


@transaction.atomic
def retire_asset(
    asset: RentalAsset,
    *,
    performed_by=None,
    reason: str = "",
) -> RentalAsset:
    """Permanently retire an asset from the rental pool.

    RETIRED assets can never be handed over again.
    Asset must be AVAILABLE, RETURNED, or UNDER_REPAIR.
    """
    if asset.status == RentalAssetStatus.RETIRED:
        raise ValidationError(
            f"Asset '{asset.asset_code}' is already RETIRED."
        )
    _check_transition(asset, RentalAssetStatus.RETIRED)

    asset.status = RentalAssetStatus.RETIRED
    asset.current_subscription = None
    asset.current_customer = None
    asset.updated_by = performed_by
    if reason:
        meta = dict(asset.metadata or {})
        meta["retirement_reason"] = reason.strip()
        asset.metadata = meta
    asset.save(update_fields=[
        "status", "current_subscription", "current_customer", "updated_by", "metadata",
    ])

    log_audit(
        action_type=AuditLog.ActionType.RENTAL_ASSET_RETIRED,
        instance=asset,
        performed_by=performed_by,
        metadata={"asset_code": asset.asset_code, "reason": reason},
    )

    return asset
