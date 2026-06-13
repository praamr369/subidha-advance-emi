from __future__ import annotations

from dataclasses import replace
from typing import Any

from accounting.services import accounting_bridge_candidate_service as candidate_base
from accounting.services import accounting_bridge_security_deposit_service as previous
from subscriptions.models import Payment

BridgeCandidateFilters = previous.BridgeCandidateFilters
verify_bridge_reconciliation_item = previous.verify_bridge_reconciliation_item
summarize_candidate_statuses = previous.summarize_candidate_statuses

ADVANCE_ALLOCATION_COLLECTION_MODE = "ADVANCE_ALLOCATION"
SKIPPED_PAYMENT_EVENT_KEY = "payment_skipped_not_applicable"
ADVANCE_ALLOCATION_SKIP_REASON = "Customer advance application payments are handled by F21, not F1 payment collection."


def _is_advance_allocation_payment_id(source_id: str | int | None) -> bool:
    if source_id in (None, ""):
        return False
    try:
        payment_id = int(source_id)
    except (TypeError, ValueError):
        return False
    metadata = (
        Payment.objects.filter(pk=payment_id)
        .values_list("allocation_metadata", flat=True)
        .first()
    )
    return isinstance(metadata, dict) and metadata.get("collection_mode") == ADVANCE_ALLOCATION_COLLECTION_MODE


def _skipped_payment_candidate_id(source_id: str | int | None) -> str:
    return candidate_base._candidate_id(
        source_model="Payment",
        source_pk=source_id or "",
        event_key=SKIPPED_PAYMENT_EVENT_KEY,
    )


def _mark_advance_allocation_payment_skipped(row: dict[str, Any]) -> dict[str, Any]:
    if row.get("source_model") != "Payment":
        return row
    source_id = row.get("source_id") or row.get("source_pk")
    if not _is_advance_allocation_payment_id(source_id):
        return row
    candidate_id = _skipped_payment_candidate_id(source_id)
    skipped = {
        **row,
        "id": candidate_id,
        "bridge_candidate_id": candidate_id,
        "event_key": SKIPPED_PAYMENT_EVENT_KEY,
        "event_label": "Payment skipped",
        "label": "Payment skipped",
        "status": "SKIPPED_NOT_APPLICABLE",
        "canonical_status": "SKIPPED_NOT_APPLICABLE",
        "can_preview": False,
        "can_post": False,
        "can_reconcile": False,
        "is_postable": False,
        "preview_action_href": None,
        "post_action_href": None,
        "blocker_code": "SKIPPED_NOT_APPLICABLE",
        "blocker_reason": ADVANCE_ALLOCATION_SKIP_REASON,
        "recommended_action": ADVANCE_ALLOCATION_SKIP_REASON,
        "operator_action": ADVANCE_ALLOCATION_SKIP_REASON,
        "exception_reasons": [ADVANCE_ALLOCATION_SKIP_REASON],
        "action_links": [],
        "source_type": "CUSTOMER_ADVANCE_APPLICATION",
    }
    return skipped


def _unguarded_filters(filters: BridgeCandidateFilters | None) -> BridgeCandidateFilters | None:
    if filters is None:
        return None
    return replace(filters, event_key=None, status=None)


def _apply_requested_filters(rows: list[dict[str, Any]], filters: BridgeCandidateFilters | None) -> list[dict[str, Any]]:
    if filters is None:
        return rows
    filtered = rows
    if filters.event_key:
        filtered = [row for row in filtered if row.get("event_key") == filters.event_key]
    if filters.status:
        filtered = [
            row
            for row in filtered
            if row.get("status") == filters.status
            or row.get("reconciliation_state") == filters.status
        ]
    return filtered


def list_bridge_candidates(filters: BridgeCandidateFilters | None = None) -> list[dict[str, Any]]:
    rows = previous.list_bridge_candidates(_unguarded_filters(filters))
    guarded = [_mark_advance_allocation_payment_skipped(row) for row in rows]
    guarded = _apply_requested_filters(guarded, filters)
    guarded.sort(key=lambda row: (row.get("source_date") or "", str(row.get("source_id") or "")), reverse=True)
    return guarded


def _candidate_is_advance_allocation_payment(candidate_id: str) -> bool:
    try:
        source_kind, source_pk, event_key = candidate_base._parse_candidate_id(candidate_id)
    except ValueError:
        return False
    return source_kind == "payment" and event_key in {candidate_base.PAYMENT_COLLECTION_EVENT_KEY, SKIPPED_PAYMENT_EVENT_KEY} and _is_advance_allocation_payment_id(source_pk)


def get_bridge_candidate(candidate_id: str, *, for_update: bool = False) -> dict[str, Any]:
    if _candidate_is_advance_allocation_payment(candidate_id):
        raise ValueError(ADVANCE_ALLOCATION_SKIP_REASON)
    return previous.get_bridge_candidate(candidate_id, for_update=for_update)


def preview_bridge_candidate(candidate_id: str) -> dict[str, Any]:
    if _candidate_is_advance_allocation_payment(candidate_id):
        raise ValueError(ADVANCE_ALLOCATION_SKIP_REASON)
    return previous.preview_bridge_candidate(candidate_id)


def post_bridge_candidate(*, candidate_id: str, idempotency_key: str, confirmed: bool, posting_note: str = "", actor) -> dict[str, Any]:
    if _candidate_is_advance_allocation_payment(candidate_id):
        raise ValueError(ADVANCE_ALLOCATION_SKIP_REASON)
    return previous.post_bridge_candidate(
        candidate_id=candidate_id,
        idempotency_key=idempotency_key,
        confirmed=confirmed,
        posting_note=posting_note,
        actor=actor,
    )


def batch_preview_bridge_candidates(candidate_ids: list[str]) -> dict[str, Any]:
    previews = []
    blockers: dict[str, list[str]] = {}
    total_debit = candidate_base.Decimal("0.00")
    total_credit = candidate_base.Decimal("0.00")
    for candidate_id in candidate_ids:
        try:
            preview = preview_bridge_candidate(candidate_id)
            previews.append(preview)
            total_debit += candidate_base._money(preview.get("total_debit"))
            total_credit += candidate_base._money(preview.get("total_credit"))
            if not preview.get("can_post"):
                blockers[candidate_id] = preview.get("blockers") or ["Candidate is not postable."]
        except Exception as exc:
            blockers[candidate_id] = [str(exc)]
    return {
        "selected_count": len(candidate_ids),
        "postable_count": sum(1 for item in previews if item.get("can_post")),
        "blocked_count": len(blockers),
        "total_debit": f"{total_debit:.2f}",
        "total_credit": f"{total_credit:.2f}",
        "is_balanced": total_debit == total_credit,
        "previews": previews,
        "blockers": blockers,
    }


def batch_post_bridge_candidates(*, candidate_ids: list[str], idempotency_keys: dict[str, str], confirmed: bool, posting_note: str = "", actor) -> dict[str, Any]:
    posted = []
    already_posted = []
    errors: dict[str, list[str]] = {}
    for candidate_id in candidate_ids:
        try:
            result = post_bridge_candidate(
                candidate_id=candidate_id,
                idempotency_key=idempotency_keys.get(candidate_id, ""),
                confirmed=confirmed,
                posting_note=posting_note,
                actor=actor,
            )
            payload = {"candidate_id": candidate_id, **result}
            if result.get("already_posted"):
                already_posted.append(payload)
            else:
                posted.append(payload)
        except Exception as exc:
            errors[candidate_id] = [str(exc)]
    return {
        "selected_count": len(candidate_ids),
        "posted_count": len(posted),
        "already_posted_count": len(already_posted),
        "skipped_already_posted_count": len(already_posted),
        "blocked_count": len(errors),
        "created_journal_ids": [item["journal_entry"]["id"] for item in posted if item.get("journal_entry")],
        "reconciliation_pending_count": sum(1 for item in posted if item.get("reconciliation_item")),
        "posted": posted,
        "already_posted": already_posted,
        "errors": errors,
    }
