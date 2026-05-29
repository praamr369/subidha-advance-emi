from django.core.exceptions import ValidationError
from subscriptions.models import ContractAmendment, LuckyId, Batch, Subscription, SubscriptionStatus

def preview_lucky_id_batch_amendment(amendment: ContractAmendment) -> dict:
    source = amendment.source_contract()
    if not source:
        raise ValidationError({"detail": "Source subscription is required for preview."})
    
    if source.status in {SubscriptionStatus.CANCELLED, "CLOSED", "COMPLETED", "DEFAULTED", "RETURNED", "TERMINATED", "REVERSED"}:
        raise ValidationError({"detail": f"Amendment is blocked for terminal subscription status '{source.status}'."})

    current_batch_id = source.batch_id
    current_batch_code = source.batch.batch_code if source.batch else None
    current_lucky_id_id = source.lucky_id_id
    current_lucky_number = source.lucky_id.lucky_number if source.lucky_id else None

    requested_values = amendment.requested_values or amendment.new_values or {}

    requested_batch_id = requested_values.get("batch_id") or requested_values.get("batch")
    requested_batch_code = requested_values.get("batch_code")
    requested_lucky_id_id = requested_values.get("lucky_id_id") or requested_values.get("lucky_id")
    requested_lucky_number = requested_values.get("lucky_number")

    requested_batch = None
    if requested_batch_id:
        requested_batch = Batch.objects.filter(pk=requested_batch_id).first()
    elif requested_batch_code:
        requested_batch = Batch.objects.filter(batch_code=requested_batch_code).first()
    
    if requested_batch:
        requested_batch_id = requested_batch.pk
        requested_batch_code = requested_batch.batch_code

    requested_lucky_id = None
    if requested_lucky_id_id:
        requested_lucky_id = LuckyId.objects.filter(pk=requested_lucky_id_id).first()
    elif requested_lucky_number is not None:
        batch_to_use = requested_batch if requested_batch else source.batch
        if batch_to_use:
            requested_lucky_id = LuckyId.objects.filter(batch=batch_to_use, lucky_number=requested_lucky_number).first()
    
    if requested_lucky_id:
        requested_lucky_id_id = requested_lucky_id.pk
        requested_lucky_number = requested_lucky_id.lucky_number

    availability_status = "UNKNOWN"
    ownership_conflict_status = "NONE"
    draw_status_risk = "NONE"
    waiver_winner_risk = "NONE"

    if requested_lucky_id:
        if requested_lucky_id.status == "AVAILABLE":
            availability_status = "AVAILABLE"
        else:
            availability_status = "UNAVAILABLE"
            active_owner = Subscription.objects.filter(lucky_id=requested_lucky_id).exclude(pk=source.pk).exclude(status__in=[SubscriptionStatus.CANCELLED, "CLOSED", "COMPLETED", "DEFAULTED", "RETURNED", "TERMINATED", "REVERSED"]).first()
            if active_owner:
                ownership_conflict_status = f"Assigned to active subscription #{active_owner.pk}"
            else:
                ownership_conflict_status = "Previously used or assigned elsewhere"

    target_batch = requested_batch if requested_batch else source.batch
    if target_batch:
        if target_batch.status not in ["DRAFT", "OPEN"]:
            draw_status_risk = f"Batch is in {target_batch.status} status and might have draws executed."
        if target_batch.locked_at:
            draw_status_risk = "Batch is locked for draws."

    if source.winner_month or source.waived_amount > 0:
        waiver_winner_risk = "Contract already has recorded waivers or won draws."

    if not requested_batch_id and requested_lucky_id_id is None:
        # Fallback if we couldn't parse the requested values
        blocked_reason = "No valid requested batch or lucky ID found."
    elif requested_lucky_id and requested_lucky_id.batch_id != (target_batch.pk if target_batch else current_batch_id):
        blocked_reason = "Requested Lucky ID does not belong to the requested or current batch."
    elif requested_lucky_id and availability_status != "AVAILABLE":
        blocked_reason = "Requested Lucky ID is not available."
    else:
        blocked_reason = "Execution is not enabled yet. Lucky ID and batch changes require a dedicated draw-safe audited workflow."

    return {
        "current_subscription_id": source.pk,
        "current_contract_reference": source.contract_reference or source.subscription_number,
        "current_batch_id": current_batch_id,
        "current_batch_code": current_batch_code,
        "current_lucky_id": current_lucky_id_id,
        "current_lucky_number": current_lucky_number,
        "requested_batch_id": requested_batch_id,
        "requested_batch_code": requested_batch_code,
        "requested_lucky_id": requested_lucky_id_id,
        "requested_lucky_number": requested_lucky_number,
        "availability_status": availability_status,
        "ownership_conflict_status": ownership_conflict_status,
        "draw_status_risk": draw_status_risk,
        "waiver_winner_risk": waiver_winner_risk,
        "lifecycle_blocker_reason": blocked_reason,
        "execution_supported": False,
    }
