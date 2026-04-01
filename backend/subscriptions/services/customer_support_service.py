from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from accounts.models import User, UserRole
from subscriptions.models import (
    AuditLog,
    Customer,
    CustomerSupportRequest,
    Payment,
    Subscription,
    SupportRequestStatus,
)
from subscriptions.services.audit_service import log_audit


INTERNAL_ASSIGNABLE_ROLES = {
    UserRole.ADMIN,
    UserRole.CASHIER,
    UserRole.PARTNER,
}


ALLOWED_STATUS_TRANSITIONS: dict[str, set[str]] = {
    SupportRequestStatus.SUBMITTED: {
        SupportRequestStatus.SUBMITTED,
        SupportRequestStatus.UNDER_REVIEW,
    },
    SupportRequestStatus.UNDER_REVIEW: {
        SupportRequestStatus.SUBMITTED,
        SupportRequestStatus.UNDER_REVIEW,
    },
    SupportRequestStatus.CLOSED: {
        SupportRequestStatus.CLOSED,
        SupportRequestStatus.UNDER_REVIEW,
    },
}


def _normalize_notes(value: str | None) -> str:
    return (value or "").strip()


@transaction.atomic
def create_customer_support_request(
    *,
    customer: Customer,
    category: str,
    message: str,
    payment: Payment | None = None,
    subscription: Subscription | None = None,
    performed_by=None,
) -> CustomerSupportRequest:
    if payment is not None and payment.customer_id != customer.id:
        raise ValueError("Selected payment does not belong to this customer.")

    resolved_subscription = subscription
    if payment is not None:
        if resolved_subscription is None:
            resolved_subscription = payment.subscription
        elif payment.subscription_id != resolved_subscription.id:
            raise ValueError("Selected payment does not belong to the selected subscription.")

    if resolved_subscription is not None and resolved_subscription.customer_id != customer.id:
        raise ValueError("Selected subscription does not belong to this customer.")

    request = CustomerSupportRequest.objects.create(
        customer=customer,
        payment=payment,
        subscription=resolved_subscription,
        category=(category or "").strip().upper(),
        message=(message or "").strip(),
    )

    log_audit(
        action_type=AuditLog.ActionType.SUPPORT_REQUEST_CREATED,
        instance=request,
        performed_by=performed_by,
        metadata={
            "event": "CUSTOMER_SUPPORT_REQUEST_CREATED",
            "customer_id": customer.id,
            "payment_id": payment.id if payment else None,
            "subscription_id": resolved_subscription.id if resolved_subscription else None,
            "category": request.category,
        },
    )

    return request


def validate_assignable_user(user: User | None):
    if user is None:
        return

    if not user.is_active:
        raise ValueError("Support request assignee must be active.")

    if user.role not in INTERNAL_ASSIGNABLE_ROLES:
        raise ValueError("Support request assignee must be an internal managed user.")


def _validate_transition(current_status: str, next_status: str):
    if next_status not in SupportRequestStatus.values:
        raise ValueError("Unsupported support request status.")

    allowed_targets = ALLOWED_STATUS_TRANSITIONS.get(current_status, {current_status})
    if next_status not in allowed_targets:
        raise ValueError(
            f"Cannot change support request status from {current_status} to {next_status}."
        )


@transaction.atomic
def update_customer_support_request_status(
    *,
    support_request: CustomerSupportRequest,
    next_status: str,
    performed_by=None,
) -> CustomerSupportRequest:
    current_status = support_request.status
    next_status = (next_status or "").strip().upper()

    _validate_transition(current_status, next_status)

    if current_status == next_status:
        return support_request

    if next_status == SupportRequestStatus.CLOSED:
        raise ValueError(
            "Use the support request resolution action to close this request with a required resolution summary."
        )

    update_fields = ["status", "updated_at"]
    support_request.status = next_status

    if current_status == SupportRequestStatus.CLOSED:
        support_request.resolved_at = None
        support_request.resolved_by = None
        support_request.resolution_summary = ""
        update_fields.extend(["resolved_at", "resolved_by", "resolution_summary"])

    support_request.save(update_fields=update_fields)

    log_audit(
        action_type=AuditLog.ActionType.SUPPORT_REQUEST_STATUS_UPDATED,
        instance=support_request,
        performed_by=performed_by,
        metadata={
            "event": "SUPPORT_REQUEST_STATUS_UPDATED",
            "old_status": current_status,
            "new_status": next_status,
        },
    )

    return support_request


@transaction.atomic
def resolve_customer_support_request(
    *,
    support_request: CustomerSupportRequest,
    resolution_summary: str,
    performed_by=None,
) -> CustomerSupportRequest:
    cleaned_summary = _normalize_notes(resolution_summary)
    if not cleaned_summary:
        raise ValueError("Resolution summary is required to close the support request.")

    if (
        support_request.status == SupportRequestStatus.CLOSED
        and (support_request.resolution_summary or "").strip()
    ):
        raise ValueError(
            "Support request is already resolved. Reopen it before recording a new resolution."
        )

    previous_status = support_request.status
    now = timezone.now()

    support_request.status = SupportRequestStatus.CLOSED
    support_request.resolution_summary = cleaned_summary
    support_request.resolved_at = now
    support_request.resolved_by = performed_by if performed_by is not None else None
    support_request.save(
        update_fields=[
            "status",
            "resolution_summary",
            "resolved_at",
            "resolved_by",
            "updated_at",
        ]
    )

    log_audit(
        action_type=AuditLog.ActionType.SUPPORT_REQUEST_RESOLUTION_RECORDED,
        instance=support_request,
        performed_by=performed_by,
        metadata={
            "event": "SUPPORT_REQUEST_RESOLUTION_RECORDED",
            "resolution_summary": cleaned_summary[:500],
            "summary_length": len(cleaned_summary),
        },
    )

    log_audit(
        action_type=AuditLog.ActionType.SUPPORT_REQUEST_RESOLVED,
        instance=support_request,
        performed_by=performed_by,
        metadata={
            "event": "SUPPORT_REQUEST_RESOLVED",
            "old_status": previous_status,
            "new_status": SupportRequestStatus.CLOSED,
            "resolved_by_id": performed_by.id if performed_by else None,
            "resolved_at": now.isoformat(),
        },
    )

    return support_request


@transaction.atomic
def assign_customer_support_request(
    *,
    support_request: CustomerSupportRequest,
    assignee: User | None,
    performed_by=None,
) -> CustomerSupportRequest:
    validate_assignable_user(assignee)

    previous_assignee = support_request.assigned_to
    previous_assignee_id = support_request.assigned_to_id
    next_assignee_id = assignee.id if assignee else None

    if previous_assignee_id == next_assignee_id:
        return support_request

    support_request.assigned_to = assignee
    support_request.assigned_at = timezone.now() if assignee else None
    support_request.save(update_fields=["assigned_to", "assigned_at", "updated_at"])

    log_audit(
        action_type=AuditLog.ActionType.SUPPORT_REQUEST_ASSIGNED,
        instance=support_request,
        performed_by=performed_by,
        metadata={
            "event": "SUPPORT_REQUEST_ASSIGNED",
            "previous_assignee_id": previous_assignee.id if previous_assignee else None,
            "previous_assignee_username": previous_assignee.username if previous_assignee else None,
            "next_assignee_id": assignee.id if assignee else None,
            "next_assignee_username": assignee.username if assignee else None,
        },
    )

    return support_request


@transaction.atomic
def update_customer_support_request_notes(
    *,
    support_request: CustomerSupportRequest,
    note: str,
    mode: str,
    performed_by=None,
) -> CustomerSupportRequest:
    cleaned_note = _normalize_notes(note)
    if not cleaned_note:
        raise ValueError("Support request note cannot be empty.")

    normalized_mode = (mode or "append").strip().lower()
    if normalized_mode not in {"append", "replace"}:
        raise ValueError("Support request note mode must be either append or replace.")

    current_notes = support_request.internal_notes or ""
    if normalized_mode == "append" and current_notes.strip():
        next_notes = f"{current_notes.rstrip()}\n\n{cleaned_note}"
    else:
        next_notes = cleaned_note

    if next_notes == current_notes:
        return support_request

    support_request.internal_notes = next_notes
    support_request.save(update_fields=["internal_notes", "updated_at"])

    log_audit(
        action_type=AuditLog.ActionType.SUPPORT_REQUEST_NOTE_UPDATED,
        instance=support_request,
        performed_by=performed_by,
        metadata={
            "event": "SUPPORT_REQUEST_NOTE_UPDATED",
            "mode": normalized_mode,
            "previous_length": len(current_notes),
            "next_length": len(next_notes),
            "note_excerpt": cleaned_note[:200],
        },
    )

    return support_request
