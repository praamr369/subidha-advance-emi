"""Repossession completion — bring the recovered unit back like a return."""
from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from subscriptions.models import RentalAsset, RentalAssetStatus


@transaction.atomic
def complete_repossession_return(repossession, *, performed_by=None) -> dict:
    """Bring the repossessed unit back into stock and the rental pool.

    Completing a repossession means the unit is physically back. It used to
    change only the case status: the delivery stayed DELIVERED, stock never
    came back, and the rental asset still showed HANDED_OVER — so the unit
    could never be released. This runs the same return path as an approved
    return inspection, then marks the asset RETURNED if the delivery did not.

    The contract's own status is left alone; a repossessed contract's status
    has its own rules. Idempotent: re-running posts nothing new.
    """
    from deliveries.services.rental_asset_lifecycle_service import mark_asset_returned
    from deliveries.services.return_inspection_service import return_unit_to_stock

    subscription = repossession.subscription
    # Capture the asset first: closing the delivery unlinks it from the contract.
    asset = (
        RentalAsset.objects.select_for_update()
        .filter(current_subscription=subscription)
        .exclude(status=RentalAssetStatus.RETIRED)
        .order_by("id")
        .first()
    )
    completed_on = (
        timezone.localdate(repossession.completed_at)
        if repossession.completed_at
        else timezone.localdate()
    )

    stock = return_unit_to_stock(
        subscription,
        reference_model="Repossession",
        reference_id=repossession.pk,
        movement_date=completed_on,
        notes="Repossession completed.",
        performed_by=performed_by,
    )

    asset_result: dict = {"changed": False, "reason": "no_linked_asset"}
    if asset is not None:
        asset.refresh_from_db()
        if asset.status == RentalAssetStatus.HANDED_OVER:
            asset = mark_asset_returned(asset, performed_by=performed_by)
            asset_result = {"changed": True, "asset_id": asset.pk, "status": str(asset.status)}
        else:
            asset_result = {"changed": False, "asset_id": asset.pk, "status": str(asset.status)}

    return {"stock": {key: (str(value) if key in {"status", "movement_type"} else value) for key, value in stock.items()}, "asset": asset_result}
