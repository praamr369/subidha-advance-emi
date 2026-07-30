"""Bridge posting approval governance (reusable service).

Approvals gate which accounting-bridge events may post journals automatically.
This module centralises setting/clearing approvals and the deposit-specific
convenience of approving all security-deposit events and retro-posting any
already-recorded-but-unposted deposit receipts/refunds.
"""
from __future__ import annotations

from typing import Iterable

from django.db import transaction
from django.utils import timezone

from accounting.models import BridgePostingApproval


def set_bridge_posting_approval(*, event_key: str, approved: bool, actor=None, reason: str = "") -> BridgePostingApproval:
    """Approve or revoke a single bridge posting event (idempotent)."""
    obj, _ = BridgePostingApproval.objects.get_or_create(event_key=event_key)
    if approved:
        obj.is_approved = True
        obj.approved_by = actor
        obj.approved_at = timezone.now()
        obj.revoked_by = None
        obj.revoked_at = None
    else:
        obj.is_approved = False
        obj.revoked_by = actor
        obj.revoked_at = timezone.now()
    obj.reason = reason or obj.reason
    obj.save()
    return obj


def set_bridge_posting_approvals(*, event_keys: Iterable[str], approved: bool, actor=None, reason: str = "") -> list[str]:
    """Approve/revoke several events; returns the list of affected event keys."""
    affected: list[str] = []
    for event_key in event_keys:
        set_bridge_posting_approval(event_key=event_key, approved=approved, actor=actor, reason=reason)
        affected.append(event_key)
    return affected


def _deposit_event_keys() -> list[str]:
    from accounting.services.accounting_bridge_security_deposit_service import EVENT_KEYS

    return sorted(EVENT_KEYS)


@transaction.atomic
def approve_deposit_posting_events(*, actor=None, reason: str = "Solopreneur: security deposits post to ledger automatically.") -> dict:
    """Approve every security-deposit receipt/refund event for auto-posting."""
    keys = _deposit_event_keys()
    set_bridge_posting_approvals(event_keys=keys, approved=True, actor=actor, reason=reason)
    return {"approved_event_keys": keys}


def retro_post_deposit_transactions(*, actor=None) -> dict:
    """Post any recorded-but-unposted deposit receipts/refunds now that their
    events are approved. Best-effort per row; returns a summary."""
    from subscriptions.models import RentLeaseDepositTransaction, RentLeaseDepositTransactionType
    from accounting.services.accounting_bridge_security_deposit_service import auto_post_deposit_transaction

    rows = RentLeaseDepositTransaction.objects.filter(
        transaction_type__in=[
            RentLeaseDepositTransactionType.DEPOSIT_RECEIPT,
            RentLeaseDepositTransactionType.DEPOSIT_REFUND,
        ]
    ).order_by("id")
    from accounting.services.accounting_bridge_security_deposit_service import candidate_for

    posted: list[int] = []
    already: list[int] = []
    skipped: list[dict] = []
    for row in rows:
        # Already-posted rows are a success, not a skip.
        try:
            if candidate_for(row).get("status") == "POSTED":
                already.append(row.id)
                continue
        except Exception:
            pass
        result = auto_post_deposit_transaction(row, actor=actor)
        if result.get("posted") or result.get("already_posted"):
            posted.append(row.id)
        else:
            skipped.append({"id": row.id, "reason": result.get("reason"), "blocker": result.get("blocker")})
    return {
        "posted_transaction_ids": posted,
        "posted_count": len(posted),
        "already_posted_ids": already,
        "already_posted_count": len(already),
        "skipped": skipped,
    }
