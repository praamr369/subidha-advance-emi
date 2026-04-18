from __future__ import annotations

from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.utils import timezone

from accounts.models import User, UserRole
from crm.services.party_service import sync_party_for_customer, sync_party_for_lead
from subscriptions.models import (
    AuditLog,
    Customer,
    Product,
    PublicLead,
    PublicLeadStatus,
    Subscription,
)
from subscriptions.services.audit_service import log_audit


INTERNAL_ASSIGNABLE_ROLES = {
    UserRole.ADMIN,
    UserRole.CASHIER,
    UserRole.PARTNER,
}


ALLOWED_STATUS_TRANSITIONS: dict[str, set[str]] = {
    PublicLeadStatus.NEW: {
        PublicLeadStatus.NEW,
        PublicLeadStatus.IN_PROGRESS,
        PublicLeadStatus.CONTACTED,
        PublicLeadStatus.CONVERTED,
        PublicLeadStatus.CLOSED,
    },
    PublicLeadStatus.IN_PROGRESS: {
        PublicLeadStatus.IN_PROGRESS,
        PublicLeadStatus.CONTACTED,
        PublicLeadStatus.CONVERTED,
        PublicLeadStatus.CLOSED,
    },
    PublicLeadStatus.CONTACTED: {
        PublicLeadStatus.CONTACTED,
        PublicLeadStatus.IN_PROGRESS,
        PublicLeadStatus.CONVERTED,
        PublicLeadStatus.CLOSED,
    },
    PublicLeadStatus.CONVERTED: {
        PublicLeadStatus.CONVERTED,
    },
    PublicLeadStatus.CLOSED: {
        PublicLeadStatus.CLOSED,
    },
}


def _normalize_notes(value: str | None) -> str:
    return (value or "").strip()


def _normalize_decimal(value) -> Decimal | None:
    if value in (None, ""):
        return None

    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        raise ValueError("Preferred EMI amount must be a valid decimal value.")


def _resolve_interested_product(product: Product | None, raw_value: str | None) -> str:
    normalized = (raw_value or "").strip()
    if normalized:
        return normalized
    if product is None:
        return ""
    return f"{product.name} ({product.product_code})".strip()


@transaction.atomic
def create_public_lead(
    *,
    name: str,
    phone: str,
    email: str = "",
    city: str = "",
    interested_product: str = "",
    preferred_emi_amount=None,
    notes: str = "",
    product: Product | None = None,
):
    lead = PublicLead.objects.create(
        name=(name or "").strip(),
        phone=(phone or "").strip(),
        email=(email or "").strip(),
        city=(city or "").strip(),
        product=product,
        interested_product=_resolve_interested_product(product, interested_product),
        preferred_emi_amount=_normalize_decimal(preferred_emi_amount),
        notes=_normalize_notes(notes),
        status=PublicLeadStatus.NEW,
        source="PUBLIC_SITE",
    )

    log_audit(
        action_type=AuditLog.ActionType.LEAD_CREATED,
        instance=lead,
        metadata={
            "event": "PUBLIC_LEAD_CREATED",
            "source": lead.source,
            "product_id": lead.product_id,
            "interested_product": lead.interested_product,
        },
    )
    sync_party_for_lead(lead)

    return lead


def _validate_transition(current_status: str, next_status: str):
    if next_status not in PublicLeadStatus.values:
        raise ValueError("Unsupported lead status.")

    allowed_targets = ALLOWED_STATUS_TRANSITIONS.get(current_status, {current_status})
    if next_status not in allowed_targets:
        raise ValueError(
            f"Cannot change lead status from {current_status} to {next_status}."
        )


@transaction.atomic
def update_public_lead_status(
    *,
    lead: PublicLead,
    next_status: str,
    performed_by=None,
):
    current_status = lead.status
    next_status = (next_status or "").strip().upper()

    _validate_transition(current_status, next_status)

    if current_status == next_status:
        return lead

    if next_status == PublicLeadStatus.CONVERTED:
        has_conversion_link = bool(
            lead.converted_customer_id
            or lead.converted_subscription_id
            or lead.converted_direct_sale_id
        )
        if not has_conversion_link:
            raise ValueError(
                "Use the lead conversion workflow to link the real customer, subscription, or direct sale before marking this lead converted."
            )

    update_fields = ["status"]
    lead.status = next_status

    now = timezone.now()
    if next_status in {PublicLeadStatus.CONTACTED, PublicLeadStatus.CONVERTED}:
        if lead.contacted_at is None:
            lead.contacted_at = now
            update_fields.append("contacted_at")

    if next_status == PublicLeadStatus.CONVERTED and lead.converted_at is None:
        lead.converted_at = now
        update_fields.append("converted_at")
        if lead.converted_by_id is None and performed_by is not None:
            lead.converted_by = performed_by
            update_fields.append("converted_by")

    if next_status == PublicLeadStatus.CLOSED and lead.closed_at is None:
        lead.closed_at = now
        update_fields.append("closed_at")

    lead.save(update_fields=update_fields)

    log_audit(
        action_type=AuditLog.ActionType.LEAD_STATUS_UPDATED,
        instance=lead,
        performed_by=performed_by,
        metadata={
            "event": "LEAD_STATUS_UPDATED",
            "old_status": current_status,
            "new_status": next_status,
        },
    )
    sync_party_for_lead(lead, performed_by=performed_by)

    return lead


@transaction.atomic
def complete_public_lead_conversion(
    *,
    lead: PublicLead,
    customer: Customer | None,
    subscription: Subscription | None,
    direct_sale=None,
    performed_by=None,
):
    if customer is None and subscription is None and direct_sale is None:
        raise ValueError(
            "Select the created customer, subscription, or direct sale before completing lead conversion."
        )

    resolved_customer = customer
    if subscription is not None:
        subscription_customer = subscription.customer
        if resolved_customer is None:
            resolved_customer = subscription_customer
        elif subscription.customer_id != resolved_customer.id:
            raise ValueError(
                "Selected subscription does not belong to the selected customer."
            )

    if direct_sale is not None and direct_sale.customer_id:
        direct_sale_customer = direct_sale.customer
        if resolved_customer is None:
            resolved_customer = direct_sale_customer
        elif direct_sale.customer_id != resolved_customer.id:
            raise ValueError(
                "Selected direct sale does not belong to the selected customer."
            )

    previous_status = lead.status
    previous_customer = lead.converted_customer
    previous_subscription = lead.converted_subscription
    previous_direct_sale = lead.converted_direct_sale
    update_fields: list[str] = []
    lead_party = sync_party_for_lead(lead, performed_by=performed_by)

    if resolved_customer is not None and lead.converted_customer_id != resolved_customer.id:
        lead.converted_customer = resolved_customer
        update_fields.append("converted_customer")
        sync_party_for_customer(
            resolved_customer,
            party=lead_party,
            performed_by=performed_by,
        )

    if subscription is not None and lead.converted_subscription_id != subscription.id:
        lead.converted_subscription = subscription
        update_fields.append("converted_subscription")

    if direct_sale is not None and lead.converted_direct_sale_id != direct_sale.id:
        lead.converted_direct_sale = direct_sale
        update_fields.append("converted_direct_sale")

    now = timezone.now()
    if lead.status != PublicLeadStatus.CONVERTED:
        lead.status = PublicLeadStatus.CONVERTED
        update_fields.append("status")

    if lead.contacted_at is None:
        lead.contacted_at = now
        update_fields.append("contacted_at")

    if lead.converted_at is None:
        lead.converted_at = now
        update_fields.append("converted_at")

    if lead.converted_by_id is None and performed_by is not None:
        lead.converted_by = performed_by
        update_fields.append("converted_by")

    if not update_fields:
        return lead

    lead.save(update_fields=update_fields)

    if previous_customer != lead.converted_customer:
        log_audit(
            action_type=AuditLog.ActionType.LEAD_CUSTOMER_LINKED,
            instance=lead,
            performed_by=performed_by,
            metadata={
                "event": "LEAD_CUSTOMER_LINKED",
                "previous_customer_id": previous_customer.id if previous_customer else None,
                "next_customer_id": lead.converted_customer_id,
                "next_customer_name": lead.converted_customer.name if lead.converted_customer else None,
            },
        )

    if previous_subscription != lead.converted_subscription:
        log_audit(
            action_type=AuditLog.ActionType.LEAD_SUBSCRIPTION_LINKED,
            instance=lead,
            performed_by=performed_by,
            metadata={
                "event": "LEAD_SUBSCRIPTION_LINKED",
                "previous_subscription_id": previous_subscription.id if previous_subscription else None,
                "next_subscription_id": lead.converted_subscription_id,
                "next_contract_reference": (
                    lead.converted_subscription.contract_reference
                    if lead.converted_subscription
                    else None
                ),
            },
        )

    if previous_direct_sale != lead.converted_direct_sale:
        log_audit(
            action_type=AuditLog.ActionType.LEAD_DIRECT_SALE_LINKED,
            instance=lead,
            performed_by=performed_by,
            metadata={
                "event": "LEAD_DIRECT_SALE_LINKED",
                "previous_direct_sale_id": previous_direct_sale.id if previous_direct_sale else None,
                "next_direct_sale_id": lead.converted_direct_sale_id,
            },
        )

    if previous_status != PublicLeadStatus.CONVERTED:
        log_audit(
            action_type=AuditLog.ActionType.LEAD_CONVERTED,
            instance=lead,
            performed_by=performed_by,
            metadata={
                "event": "LEAD_CONVERTED",
                "previous_status": previous_status,
                "converted_customer_id": lead.converted_customer_id,
                "converted_subscription_id": lead.converted_subscription_id,
                "converted_direct_sale_id": lead.converted_direct_sale_id,
                "converted_by_id": lead.converted_by_id,
            },
        )

    sync_party_for_lead(lead, performed_by=performed_by)

    return lead


def validate_assignable_user(user: User | None):
    if user is None:
        return

    if not user.is_active:
        raise ValueError("Lead assignee must be an active internal user.")

    if user.role not in INTERNAL_ASSIGNABLE_ROLES:
        raise ValueError("Lead assignee must be an internal managed user.")


@transaction.atomic
def assign_public_lead(
    *,
    lead: PublicLead,
    assignee: User | None,
    performed_by=None,
):
    validate_assignable_user(assignee)

    previous_assignee = lead.assigned_to
    previous_assignee_id = lead.assigned_to_id
    next_assignee_id = assignee.id if assignee else None

    if previous_assignee_id == next_assignee_id:
        return lead

    lead.assigned_to = assignee
    lead.assigned_at = timezone.now() if assignee else None
    lead.save(update_fields=["assigned_to", "assigned_at"])

    log_audit(
        action_type=AuditLog.ActionType.LEAD_ASSIGNED,
        instance=lead,
        performed_by=performed_by,
        metadata={
            "event": "LEAD_ASSIGNED",
            "previous_assignee_id": previous_assignee.id if previous_assignee else None,
            "previous_assignee_username": previous_assignee.username if previous_assignee else None,
            "next_assignee_id": assignee.id if assignee else None,
            "next_assignee_username": assignee.username if assignee else None,
        },
    )

    return lead


@transaction.atomic
def update_public_lead_notes(
    *,
    lead: PublicLead,
    note: str,
    mode: str,
    performed_by=None,
):
    cleaned_note = _normalize_notes(note)
    if not cleaned_note:
        raise ValueError("Lead note cannot be empty.")

    normalized_mode = (mode or "append").strip().lower()
    if normalized_mode not in {"append", "replace"}:
        raise ValueError("Lead note mode must be either append or replace.")

    current_notes = lead.admin_notes or ""
    if normalized_mode == "append" and current_notes.strip():
        next_notes = f"{current_notes.rstrip()}\n\n{cleaned_note}"
    else:
        next_notes = cleaned_note

    if next_notes == current_notes:
        return lead

    lead.admin_notes = next_notes
    lead.save(update_fields=["admin_notes"])

    log_audit(
        action_type=AuditLog.ActionType.LEAD_NOTE_UPDATED,
        instance=lead,
        performed_by=performed_by,
        metadata={
            "event": "LEAD_NOTE_UPDATED",
            "mode": normalized_mode,
            "previous_length": len(current_notes),
            "next_length": len(next_notes),
            "note_excerpt": cleaned_note[:200],
        },
    )

    return lead
