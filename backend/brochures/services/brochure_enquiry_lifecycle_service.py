from __future__ import annotations

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from brochures.models import BrochureEnquiry, BrochureEnquiryStatusHistory


ALLOWED_TRANSITIONS = {
    BrochureEnquiry.Status.NEW: {
        BrochureEnquiry.Status.CONTACTED,
        BrochureEnquiry.Status.CLOSED,
        BrochureEnquiry.Status.LOST,
    },
    BrochureEnquiry.Status.CONTACTED: {
        BrochureEnquiry.Status.QUOTED,
        BrochureEnquiry.Status.CLOSED,
        BrochureEnquiry.Status.LOST,
    },
    BrochureEnquiry.Status.QUOTED: {
        BrochureEnquiry.Status.CONVERTED,
        BrochureEnquiry.Status.CLOSED,
        BrochureEnquiry.Status.LOST,
    },
    BrochureEnquiry.Status.CONVERTED: set(),
    BrochureEnquiry.Status.CLOSED: set(),
    BrochureEnquiry.Status.LOST: set(),
}


def record_enquiry_history(
    enquiry: BrochureEnquiry,
    *,
    event_type: str,
    from_status: str = "",
    to_status: str | None = None,
    note: str = "",
    changed_by=None,
):
    return BrochureEnquiryStatusHistory.objects.create(
        enquiry=enquiry,
        event_type=event_type,
        from_status=from_status,
        to_status=to_status or enquiry.status,
        note=(note or "").strip(),
        changed_by=changed_by,
    )


def record_initial_enquiry_history(enquiry: BrochureEnquiry):
    return record_enquiry_history(
        enquiry,
        event_type=BrochureEnquiryStatusHistory.EventType.CREATED,
        to_status=enquiry.status,
        note="Public brochure enquiry created.",
    )


def validate_status_transition(from_status: str, to_status: str):
    if from_status == to_status:
        return
    if to_status not in ALLOWED_TRANSITIONS.get(from_status, set()):
        raise ValidationError(
            {
                "status": (
                    f"Invalid enquiry transition from {from_status} to {to_status}. "
                    "Terminal enquiries cannot be reopened."
                )
            }
        )


@transaction.atomic
def update_enquiry_follow_up(
    enquiry: BrochureEnquiry,
    *,
    changes: dict,
    changed_by=None,
    history_note: str = "",
) -> BrochureEnquiry:
    locked = BrochureEnquiry.objects.select_for_update().get(pk=enquiry.pk)
    old_status = locked.status
    old_assigned_to_id = locked.assigned_to_id
    old_priority = locked.priority
    old_follow_up_at = locked.follow_up_at

    next_status = changes.get("status", locked.status)
    validate_status_transition(locked.status, next_status)
    for field, value in changes.items():
        setattr(locked, field, value)
    locked.save()

    if old_status != locked.status:
        record_enquiry_history(
            locked,
            event_type=BrochureEnquiryStatusHistory.EventType.STATUS,
            from_status=old_status,
            note=history_note or f"Status changed to {locked.status}.",
            changed_by=changed_by,
        )
    if old_assigned_to_id != locked.assigned_to_id:
        record_enquiry_history(
            locked,
            event_type=BrochureEnquiryStatusHistory.EventType.ASSIGNMENT,
            from_status=old_status,
            note=(
                f"Assignment changed from user {old_assigned_to_id or 'unassigned'} "
                f"to {locked.assigned_to_id or 'unassigned'}."
            ),
            changed_by=changed_by,
        )
    if old_priority != locked.priority:
        record_enquiry_history(
            locked,
            event_type=BrochureEnquiryStatusHistory.EventType.PRIORITY,
            from_status=old_status,
            note=f"Priority changed from {old_priority} to {locked.priority}.",
            changed_by=changed_by,
        )
    if old_follow_up_at != locked.follow_up_at:
        record_enquiry_history(
            locked,
            event_type=BrochureEnquiryStatusHistory.EventType.FOLLOW_UP,
            from_status=old_status,
            note=f"Follow-up changed from {old_follow_up_at or 'unset'} to {locked.follow_up_at or 'unset'}.",
            changed_by=changed_by,
        )
    return locked


def mark_enquiry_contacted(enquiry: BrochureEnquiry, *, changed_by=None, note=""):
    previous_status = enquiry.status
    updated = update_enquiry_follow_up(
        enquiry,
        changes={
            "status": BrochureEnquiry.Status.CONTACTED,
            "last_contacted_at": timezone.now(),
        },
        changed_by=changed_by,
        history_note=note or "Customer contact recorded.",
    )
    if previous_status == BrochureEnquiry.Status.CONTACTED:
        record_enquiry_history(
            updated,
            event_type=BrochureEnquiryStatusHistory.EventType.STATUS,
            from_status=previous_status,
            note=note or "Additional customer contact recorded.",
            changed_by=changed_by,
        )
    return updated
