from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from crm.models import (
    PartyInteraction,
    PartyInteractionStatus,
    PartyLinkRole,
    PartyInteractionType,
    PartyMaster,
)
from reminders.models import ReminderChannel, ReminderType
from reminders.services.reminder_service import create_payment_reminder
from subscriptions.models import Customer
from subscriptions.models import AuditLog
from subscriptions.services.audit_service import log_audit


def _default_subject(*, interaction_type: str) -> str:
    if interaction_type == PartyInteractionType.FOLLOW_UP:
        return "Follow-up"
    if interaction_type == PartyInteractionType.CONTACT_NOTE:
        return "Contact note"
    if interaction_type == PartyInteractionType.HANDOFF:
        return "Handoff"
    return "General note"


def _default_contact(party: PartyMaster) -> str:
    return party.primary_phone or party.primary_email or ""


def _target_customer_for_party(party: PartyMaster) -> Customer | None:
    customer_link = party.links.filter(
        role_type=PartyLinkRole.CUSTOMER,
        source_model="Customer",
    ).order_by("id").first()
    if customer_link is None:
        return None
    return Customer.objects.filter(pk=customer_link.source_pk).first()


@transaction.atomic
def create_party_interaction(
    *,
    party: PartyMaster,
    interaction_type: str,
    note: str,
    subject: str = "",
    status: str = PartyInteractionStatus.OPEN,
    happened_at=None,
    next_follow_up_at=None,
    related_source_model: str = "",
    related_source_pk: int | None = None,
    create_follow_up_reminder: bool = False,
    reminder_channel: str = ReminderChannel.INTERNAL,
    performed_by=None,
) -> PartyInteraction:
    normalized_type = (interaction_type or PartyInteractionType.GENERAL).strip().upper()
    normalized_status = (status or PartyInteractionStatus.OPEN).strip().upper()
    occurred_at = happened_at or timezone.now()
    completed_at = None
    if normalized_status in {PartyInteractionStatus.DONE, PartyInteractionStatus.CANCELLED}:
        completed_at = occurred_at

    interaction = PartyInteraction.objects.create(
        party=party,
        interaction_type=normalized_type,
        status=normalized_status,
        subject=(subject or "").strip() or _default_subject(interaction_type=normalized_type),
        note=(note or "").strip(),
        happened_at=occurred_at,
        next_follow_up_at=next_follow_up_at,
        completed_at=completed_at,
        created_by=performed_by,
        related_source_model=(related_source_model or "").strip(),
        related_source_pk=related_source_pk,
    )

    if create_follow_up_reminder and next_follow_up_at is not None:
        reminder = create_payment_reminder(
            performed_by=performed_by,
            channel=(reminder_channel or ReminderChannel.INTERNAL).strip().upper(),
            reminder_type=ReminderType.FOLLOWUP,
            target_customer=_target_customer_for_party(party),
            due_date=next_follow_up_at.date(),
            amount_due=Decimal("0.00"),
            customer_contact=_default_contact(party),
            notes=f"{interaction.subject}\n\n{interaction.note}".strip(),
        )
        interaction.reminder = reminder
        interaction.save(update_fields=["reminder", "updated_at"])

    log_audit(
        action_type=AuditLog.ActionType.CRM_INTERACTION_CREATED,
        instance=interaction,
        performed_by=performed_by,
        metadata={
            "event": "CRM_INTERACTION_CREATED",
            "party_id": party.id,
            "interaction_type": interaction.interaction_type,
            "status": interaction.status,
            "next_follow_up_at": interaction.next_follow_up_at.isoformat() if interaction.next_follow_up_at else None,
            "reminder_id": interaction.reminder_id,
        },
    )
    return interaction


@transaction.atomic
def update_party_interaction_status(
    *,
    interaction: PartyInteraction,
    status: str,
    performed_by=None,
) -> PartyInteraction:
    next_status = (status or "").strip().upper()
    if next_status not in PartyInteractionStatus.values:
        raise ValueError("Unsupported interaction status.")
    if interaction.status == next_status:
        return interaction

    interaction.status = next_status
    interaction.completed_at = (
        timezone.now()
        if next_status in {PartyInteractionStatus.DONE, PartyInteractionStatus.CANCELLED}
        else None
    )
    interaction.save(update_fields=["status", "completed_at", "updated_at"])
    log_audit(
        action_type=AuditLog.ActionType.CRM_INTERACTION_UPDATED,
        instance=interaction,
        performed_by=performed_by,
        metadata={
            "event": "CRM_INTERACTION_STATUS_UPDATED",
            "status": interaction.status,
            "completed_at": interaction.completed_at.isoformat() if interaction.completed_at else None,
        },
    )
    return interaction
