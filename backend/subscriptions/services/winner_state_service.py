from __future__ import annotations

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Q

from subscriptions.models import (
    AuditLog,
    BusinessEventType,
    LuckyId,
    EmiStatus,
    FinancialLedger,
    LedgerDirection,
    LedgerEntryType,
    LuckyDraw,
    LuckyIdStatus,
    MONEY_ZERO,
    PlanType,
    Subscription,
    SubscriptionStatus,
    q2,
)
from subscriptions.services.business_event_service import append_business_event
from subscriptions.services.audit_service import log_audit
from subscriptions.services.subscription_status_service import (
    resolve_expected_subscription_status,
)


WAIVER_SCOPE_FUTURE_ONLY = "FUTURE_EMI_ONLY"
WINNER_WAIVER_SOURCES = {
    "lucky_draw_reveal",
    "manual_execute_winner",
    "winner_state_repair",
}


def winner_history_q(prefix: str = "") -> Q:
    normalized_prefix = f"{prefix}__" if prefix else ""
    return (
        Q(**{f"{normalized_prefix}winner_month__isnull": False})
        | Q(**{f"{normalized_prefix}status": SubscriptionStatus.WON})
        | Q(**{f"{normalized_prefix}lucky_id__status": LuckyIdStatus.WON})
    )


def _subscription_ref(subscription: Subscription) -> str:
    return (
        getattr(subscription, "subscription_number", None)
        or getattr(subscription, "contract_reference", None)
        or f"SUB-{subscription.id}"
    )


def get_revealed_winning_draw(subscription: Subscription) -> LuckyDraw | None:
    if not subscription.batch_id:
        return None

    prefetched = getattr(subscription, "_prefetched_objects_cache", {})
    prefetched_draws = prefetched.get("winning_draws") or []
    matching_prefetched = [
        draw
        for draw in prefetched_draws
        if draw.is_revealed
        and (
            draw.winner_subscription_id == subscription.id
            or (
                subscription.lucky_id_id
                and draw.winner_lucky_id_id == subscription.lucky_id_id
            )
        )
    ]
    if matching_prefetched:
        matching_prefetched.sort(
            key=lambda draw: (draw.draw_month or 0, draw.id or 0),
            reverse=True,
        )
        return matching_prefetched[0]

    filters = Q(winner_subscription_id=subscription.id)
    if subscription.lucky_id_id:
        filters |= Q(winner_lucky_id_id=subscription.lucky_id_id)

    return (
        LuckyDraw.objects.filter(batch_id=subscription.batch_id, is_revealed=True)
        .filter(filters)
        .order_by("-draw_month", "-id")
        .first()
    )


def _ordered_emis(subscription: Subscription):
    prefetched = getattr(subscription, "_prefetched_objects_cache", {})
    if "emis" in prefetched:
        return sorted(
            prefetched["emis"],
            key=lambda emi: (emi.month_no or 0, emi.id or 0),
        )

    return list(subscription.emis.all().order_by("month_no", "id"))


def _emi_ledger_entries(emi):
    prefetched = getattr(emi, "_prefetched_objects_cache", {})
    if "ledger_entries" in prefetched:
        return list(prefetched["ledger_entries"])
    return list(emi.ledger_entries.all().order_by("created_at", "id"))


def get_subscription_winner_evidence(subscription: Subscription) -> dict:
    winning_draw = get_revealed_winning_draw(subscription)
    winner_month = subscription.winner_month or getattr(winning_draw, "draw_month", None)
    emis = _ordered_emis(subscription)

    winner_waiver_entries = []
    waived_future_rows = []
    for emi in emis:
        if winner_month is not None and emi.status == EmiStatus.WAIVED and emi.month_no > winner_month:
            waived_future_rows.append(emi)

        for entry in _emi_ledger_entries(emi):
            if entry.entry_type != LedgerEntryType.EMI_WAIVER:
                continue
            context = entry.allocation_context or {}
            if (
                context.get("waiver_scope") == WAIVER_SCOPE_FUTURE_ONLY
                or context.get("source") in WINNER_WAIVER_SOURCES
                or context.get("draw_id")
                or context.get("winner_month")
            ):
                winner_waiver_entries.append(entry)

    stored_waived_amount = q2(subscription.waived_amount or MONEY_ZERO)
    lucky_status = getattr(subscription.lucky_id, "status", None)

    is_winner = bool(
        winning_draw
        or (
            winner_month is not None
            and (
                bool(waived_future_rows)
                or bool(winner_waiver_entries)
                or stored_waived_amount > MONEY_ZERO
                or subscription.status == SubscriptionStatus.WON
                or lucky_status == LuckyIdStatus.WON
            )
        )
    )

    computed_waived_amount = q2(subscription.total_waived_emi_amount())
    expected_subscription_status = resolve_expected_subscription_status(
        current_status=subscription.status,
        emi_statuses=(emi.status for emi in emis),
        is_winner=is_winner,
    )

    return {
        "is_winner": is_winner,
        "winning_draw": winning_draw,
        "winner_month": winner_month,
        "waived_future_rows": waived_future_rows,
        "winner_waiver_entries": winner_waiver_entries,
        "computed_waived_amount": computed_waived_amount,
        "subscription_status": subscription.status,
        "lucky_id_status": lucky_status,
        "expected_subscription_status": expected_subscription_status,
        "needs_subscription_status_sync": subscription.status != expected_subscription_status,
        "needs_lucky_id_status_sync": (
            is_winner
            and subscription.lucky_id_id is not None
            and lucky_status != LuckyIdStatus.WON
        ),
    }


def _lock_subscription_only(subscription_id: int) -> Subscription:
    return Subscription.objects.select_for_update().get(pk=subscription_id)


def _lock_lucky_id_if_present(subscription: Subscription):
    if not subscription.lucky_id_id:
        return None
    lucky_id = LuckyId.objects.select_for_update().get(pk=subscription.lucky_id_id)
    subscription.lucky_id = lucky_id
    return lucky_id


@transaction.atomic
def apply_winner_state(
    *,
    subscription: Subscription,
    winner_month: int,
    performed_by=None,
    draw: LuckyDraw | None = None,
    source: str,
    emit_waiver_audit: bool = True,
    require_paid_until_winner_month: bool = False,
):
    subscription = _lock_subscription_only(subscription.pk)
    lucky_id = _lock_lucky_id_if_present(subscription)

    if (
        draw
        and draw.is_revealed
        and draw.winner_subscription_id
        and draw.winner_subscription_id == subscription.id
    ):
        emis = list(subscription.emis.order_by("month_no", "id"))
        computed_waived_amount = q2(subscription.total_waived_emi_amount())
        return {
            "subscription": subscription,
            "winner_month": subscription.winner_month or winner_month,
            "waived_emi_count": draw.waived_emi_count or 0,
            "waived_amount": computed_waived_amount,
            "newly_waived_amount": MONEY_ZERO,
            "lucky_id": lucky_id or subscription.lucky_id,
        }

    if subscription.plan_type != PlanType.EMI:
        raise ValidationError("Winner state is only supported for EMI subscriptions.")

    if not subscription.lucky_id_id:
        raise ValidationError("Winning subscription must have a linked Lucky ID.")

    if winner_month < 1 or winner_month > subscription.tenure_months:
        raise ValidationError("Invalid winner month.")

    emis = list(
        subscription.emis.select_for_update().order_by("month_no", "id")
    )

    unpaid_before_winner = any(
        emi.month_no <= winner_month and emi.status == EmiStatus.PENDING
        for emi in emis
    )
    if require_paid_until_winner_month and unpaid_before_winner:
        raise ValidationError(
            "All EMIs up to winning month must be paid before declaring winner."
        )

    future_pending_emis = [
        emi
        for emi in emis
        if emi.month_no > winner_month and emi.status == EmiStatus.PENDING
    ]

    newly_waived_amount = MONEY_ZERO
    for emi in future_pending_emis:
        emi.status = EmiStatus.WAIVED
        emi.save(update_fields=["status"])

        FinancialLedger.objects.create(
            payment=None,
            emi=emi,
            amount=emi.amount,
            entry_type=LedgerEntryType.EMI_WAIVER,
            entry_direction=LedgerDirection.CREDIT,
            allocation_context={
                "source": source,
                "draw_id": getattr(draw, "id", None),
                "batch_id": subscription.batch_id,
                "batch_code": getattr(subscription.batch, "batch_code", None),
                "draw_month": getattr(draw, "draw_month", None),
                "winner_month": winner_month,
                "winner_subscription_id": subscription.id,
                "winner_subscription_number": _subscription_ref(subscription),
                "winner_lucky_id": subscription.lucky_id_id,
                "winner_lucky_number": getattr(subscription.lucky_id, "lucky_number", None),
                "waiver_scope": WAIVER_SCOPE_FUTURE_ONLY,
            },
        )
        newly_waived_amount = q2(newly_waived_amount + emi.amount)

    update_fields = []
    expected_subscription_status = resolve_expected_subscription_status(
        current_status=subscription.status,
        emi_statuses=(emi.status for emi in emis),
        is_winner=True,
    )
    if subscription.status != expected_subscription_status:
        subscription.status = expected_subscription_status
        update_fields.append("status")
    if subscription.winner_month != winner_month:
        subscription.winner_month = winner_month
        update_fields.append("winner_month")

    computed_waived_amount = q2(subscription.total_waived_emi_amount())
    if q2(subscription.waived_amount) != computed_waived_amount:
        subscription.waived_amount = computed_waived_amount
        update_fields.append("waived_amount")

    if update_fields:
        subscription.save(update_fields=update_fields)

    lucky_id = lucky_id or getattr(subscription, "lucky_id", None)
    if lucky_id and lucky_id.status != LuckyIdStatus.WON:
        lucky_id.status = LuckyIdStatus.WON
        lucky_id.save(update_fields=["status"])

    if emit_waiver_audit:
        log_audit(
            action_type=AuditLog.ActionType.WINNER_WAIVER_APPLIED,
            instance=subscription,
            performed_by=performed_by,
            metadata={
                "source": source,
                "draw_id": getattr(draw, "id", None),
                "batch_id": subscription.batch_id,
                "draw_month": getattr(draw, "draw_month", None),
                "winner_month": winner_month,
                "waived_emi_count": len(future_pending_emis),
                "waived_amount": str(q2(computed_waived_amount)),
                "newly_waived_amount": str(newly_waived_amount),
                "waiver_scope": WAIVER_SCOPE_FUTURE_ONLY,
                "winner_lucky_id": subscription.lucky_id_id,
                "winner_lucky_number": getattr(subscription.lucky_id, "lucky_number", None),
            },
        )
    append_business_event(
        event_type=BusinessEventType.WAIVER_APPLIED,
        source_module="subscriptions.services.winner_state_service.apply_winner_state",
        actor_user=performed_by,
        customer=subscription.customer,
        subscription=subscription,
        batch=subscription.batch,
        lucky_id=subscription.lucky_id,
        payload={
            "source": source,
            "draw_id": getattr(draw, "id", None),
            "winner_month": winner_month,
            "waived_emi_count": len(future_pending_emis),
            "waived_amount": str(q2(computed_waived_amount)),
            "newly_waived_amount": str(q2(newly_waived_amount)),
        },
    )

    return {
        "subscription": subscription,
        "winner_month": winner_month,
        "waived_emi_count": len(future_pending_emis),
        "waived_amount": q2(computed_waived_amount),
        "newly_waived_amount": q2(newly_waived_amount),
        "lucky_id": subscription.lucky_id,
    }


@transaction.atomic
def sync_winner_state(
    *,
    subscription: Subscription,
    performed_by=None,
    source: str = "winner_state_repair",
    emit_audit: bool = True,
    commit: bool = True,
):
    subscription = _lock_subscription_only(subscription.pk)
    _lock_lucky_id_if_present(subscription)

    evidence = get_subscription_winner_evidence(subscription)
    if not evidence["is_winner"]:
        return {
            "subscription_id": subscription.id,
            "changed": False,
            "skipped": True,
            "reason": "no_winner_evidence",
            "winner_month": evidence["winner_month"],
        }

    if subscription.status == SubscriptionStatus.DEFAULTED:
        return {
            "subscription_id": subscription.id,
            "changed": False,
            "skipped": True,
            "reason": "defaulted_subscription",
            "winner_month": evidence["winner_month"],
        }

    old_subscription_status = subscription.status
    old_winner_month = subscription.winner_month
    old_waived_amount = q2(subscription.waived_amount or MONEY_ZERO)
    old_lucky_status = getattr(subscription.lucky_id, "status", None)

    update_fields = []
    expected_subscription_status = evidence["expected_subscription_status"]
    if subscription.status != expected_subscription_status:
        subscription.status = expected_subscription_status
        update_fields.append("status")

    winner_month = evidence["winner_month"]
    if winner_month is not None and subscription.winner_month != winner_month:
        subscription.winner_month = winner_month
        update_fields.append("winner_month")

    computed_waived_amount = evidence["computed_waived_amount"]
    if old_waived_amount != computed_waived_amount:
        subscription.waived_amount = computed_waived_amount
        update_fields.append("waived_amount")

    if update_fields and commit:
        subscription.save(update_fields=update_fields)

    lucky_changed = False
    if subscription.lucky_id_id and old_lucky_status != LuckyIdStatus.WON:
        subscription.lucky_id.status = LuckyIdStatus.WON
        if commit:
            subscription.lucky_id.save(update_fields=["status"])
        lucky_changed = True

    changed = bool(update_fields or lucky_changed)
    if emit_audit and commit and changed:
        winner_draw = evidence["winning_draw"]
        metadata = {
            "source": source,
            "subscription_id": subscription.id,
            "subscription_number": _subscription_ref(subscription),
            "winner_month": winner_month,
            "old_subscription_status": old_subscription_status,
            "new_subscription_status": subscription.status,
            "old_winner_month": old_winner_month,
            "new_winner_month": subscription.winner_month,
            "old_waived_amount": str(old_waived_amount),
            "new_waived_amount": str(computed_waived_amount),
            "old_lucky_id_status": old_lucky_status,
            "new_lucky_id_status": getattr(subscription.lucky_id, "status", None),
            "draw_id": getattr(winner_draw, "id", None),
            "draw_month": getattr(winner_draw, "draw_month", None),
            "winner_lucky_id": subscription.lucky_id_id,
            "winner_lucky_number": getattr(subscription.lucky_id, "lucky_number", None),
        }
        log_audit(
            action_type=AuditLog.ActionType.WINNER_STATE_SYNCED,
            instance=subscription,
            performed_by=performed_by,
            metadata=metadata,
        )
        if subscription.lucky_id_id and lucky_changed:
            log_audit(
                action_type=AuditLog.ActionType.WINNER_STATE_SYNCED,
                instance=subscription.lucky_id,
                performed_by=performed_by,
                metadata=metadata,
            )

    return {
        "subscription_id": subscription.id,
        "changed": changed,
        "skipped": False,
        "winner_month": winner_month,
        "old_subscription_status": old_subscription_status,
        "new_subscription_status": subscription.status,
        "old_lucky_id_status": old_lucky_status,
        "new_lucky_id_status": getattr(subscription.lucky_id, "status", None),
    }
