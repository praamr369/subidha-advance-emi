from django.utils import timezone

from subscriptions.models import AuditLog


def _normalize_metadata(metadata):
    if metadata is None:
        return {}
    if isinstance(metadata, dict):
        return metadata
    return {"value": metadata}


def log_audit(
    *,
    action_type,
    instance,
    performed_by=None,
    metadata=None,
):
    """
    Centralized audit logger.

    Rules:
    - Must be called inside the existing transaction.
    - Stores model name and object id from the provided instance.
    - Keeps metadata normalized to a dictionary.
    """

    AuditLog.objects.create(
        action_type=action_type,
        model_name=instance.__class__.__name__,
        object_id=instance.pk,
        performed_by=performed_by,
        metadata=_normalize_metadata(metadata),
        created_at=timezone.now(),
    )


def log_payment_collected(
    *,
    payment,
    emi,
    subscription,
    performed_by=None,
    method=None,
    reference_no=None,
    notes=None,
):
    """
    Structured helper for payment collection audit events.
    Kept additive so existing callers using log_audit(...) do not break.
    """
    log_audit(
        action_type=AuditLog.ActionType.EMI_PAID,
        instance=payment,
        performed_by=performed_by,
        metadata={
            "event": "PAYMENT_COLLECTED",
            "payment_id": payment.id,
            "subscription_id": subscription.id,
            "emi_id": emi.id if emi else None,
            "amount": str(payment.amount),
            "method": method or getattr(payment, "method", None),
            "reference_no": reference_no or getattr(payment, "reference_no", None),
            "notes": notes or "",
        },
    )


def log_payment_reversed(
    *,
    payment,
    emi,
    subscription,
    performed_by=None,
    reason="",
):
    """
    Structured helper for payment reversal audit events.
    Uses a generic financial action type already available in the current schema.
    """
    log_audit(
        action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
        instance=payment,
        performed_by=performed_by,
        metadata={
            "event": "PAYMENT_REVERSED",
            "payment_id": payment.id,
            "subscription_id": subscription.id,
            "emi_id": emi.id if emi else None,
            "amount": str(payment.amount),
            "reference_no": getattr(payment, "reference_no", None),
            "reason": reason or "",
        },
    )


def log_reconciliation_event(
    *,
    instance,
    performed_by=None,
    event,
    metadata=None,
):
    """
    Generic helper for reconciliation-related audit entries.
    Uses PAYMENT_FLAGGED as the safe existing action type until a more
    specific action enum is introduced in a later additive phase.
    """
    payload = {
        "event": event,
        **(_normalize_metadata(metadata)),
    }

    log_audit(
        action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
        instance=instance,
        performed_by=performed_by,
        metadata=payload,
    )

def log_customer_kyc_decision(
    *,
    customer,
    performed_by=None,
    old_status="",
    new_status="",
    reason="",
):
    log_audit(
        action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
        instance=customer,
        performed_by=performed_by,
        metadata={
            "event": "CUSTOMER_KYC_DECISION",
            "customer_id": customer.id,
            "old_status": old_status,
            "new_status": new_status,
            "reason": reason or "",
        },
    )