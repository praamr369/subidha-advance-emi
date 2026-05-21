from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from reconciliation.models import (
    ReconciliationItem,
    ReconciliationItemStatus,
    ReconciliationResolution,
    ReconciliationResolutionAction,
)


@transaction.atomic
def resolve_item(
    *,
    item_id: int,
    action: str,
    note: str,
    actor,
    new_status: str | None = None,
    metadata: dict | None = None,
) -> ReconciliationItem:
    normalized_note = (note or "").strip()
    if not normalized_note:
        raise ValueError("note is required.")

    item = ReconciliationItem.objects.select_for_update().get(pk=item_id)
    before_status = item.status

    resolved_status = new_status or _status_for_action(action)
    item.status = resolved_status
    item.resolved_by = actor
    item.resolved_at = timezone.now()
    item.save(update_fields=["status", "resolved_by", "resolved_at", "updated_at"])

    ReconciliationResolution.objects.create(
        item=item,
        action=action,
        note=normalized_note,
        before_status=before_status,
        after_status=item.status,
        resolved_by=actor,
        metadata=metadata or {},
    )
    return item


@transaction.atomic
def reopen_item(*, item_id: int, note: str, actor, metadata: dict | None = None) -> ReconciliationItem:
    normalized_note = (note or "").strip()
    if not normalized_note:
        raise ValueError("note is required.")

    item = ReconciliationItem.objects.select_for_update().get(pk=item_id)
    before_status = item.status

    item.status = ReconciliationItemStatus.NEEDS_REVIEW
    item.resolved_by = None
    item.resolved_at = None
    item.save(update_fields=["status", "resolved_by", "resolved_at", "updated_at"])

    ReconciliationResolution.objects.create(
        item=item,
        action=ReconciliationResolutionAction.REOPEN,
        note=normalized_note,
        before_status=before_status,
        after_status=item.status,
        resolved_by=actor,
        metadata=metadata or {},
    )
    return item


def _status_for_action(action: str) -> str:
    if action == ReconciliationResolutionAction.MARK_FALSE_POSITIVE:
        return ReconciliationItemStatus.FALSE_POSITIVE
    if action in {
        ReconciliationResolutionAction.MARK_REVIEWED,
        ReconciliationResolutionAction.CLOSE,
    }:
        return ReconciliationItemStatus.RESOLVED
    return ReconciliationItemStatus.RESOLVED

