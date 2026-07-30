"""Lead → customer reconciliation.

A CRM pipeline lead can drift out of sync with customer truth in two ways:

1. It is linked to a ``converted_customer`` but its ``stage`` was never advanced
   to CONVERTED (the FK and the stage disagree).
2. It has no ``converted_customer`` but its phone already matches a registered
   ``Customer`` — the lead was effectively converted outside the pipeline.

Reconciliation makes the pipeline consistent with existing customer data. It is
idempotent and never *creates* a customer (that is the explicit Convert action's
job) — it only links to an already-registered customer and advances the stage.

Callable manually (per lead) or automatically (bulk / scheduled command).
"""

from __future__ import annotations

from typing import Any, Optional

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from crm.models import Lead, LeadStage
from crm.services.party_service import sync_party_for_crm_lead, sync_party_for_customer
from subscriptions.models import AuditLog, Customer
from subscriptions.services.audit_service import log_audit


def find_reconcilable_leads():
    """Leads whose pipeline state disagrees with customer truth and can be
    auto-reconciled: linked-but-not-converted, or phone-matches a customer but
    not converted."""
    linked_not_converted = Q(converted_customer__isnull=False) & ~Q(stage=LeadStage.CONVERTED)
    registered_phones = set(
        Customer.objects.exclude(phone="").values_list("phone", flat=True)
    )
    candidates = (
        Lead.objects.select_related("converted_customer")
        .filter(linked_not_converted | (Q(converted_customer__isnull=True) & ~Q(stage=LeadStage.CONVERTED)))
    )
    result = []
    for lead in candidates:
        if lead.converted_customer_id is not None:
            result.append(lead)
        elif lead.phone and lead.phone in registered_phones:
            result.append(lead)
    return result


@transaction.atomic
def reconcile_lead(lead: Lead, performed_by=None) -> dict[str, Any]:
    """Reconcile a single lead. Returns a report dict describing what happened.

    ``changed`` is False when the lead is already consistent or has no existing
    customer to reconcile against (a genuine active lead)."""
    # Already consistent.
    if lead.stage == LeadStage.CONVERTED and lead.converted_customer_id is not None:
        return {"lead_id": lead.id, "changed": False, "action": "already_consistent"}

    customer: Optional[Customer] = lead.converted_customer
    action: str

    if customer is not None:
        # Case 1: linked but stage not advanced -> advance stage.
        action = "stage_advanced"
    else:
        # Case 2: no link -> try to attach an existing customer by phone.
        customer = Customer.objects.filter(phone=lead.phone).order_by("id").first() if lead.phone else None
        if customer is None:
            # Nothing to reconcile — a real, unconverted lead. Use Convert to create.
            return {"lead_id": lead.id, "changed": False, "action": "no_customer_match"}
        lead.converted_customer = customer
        action = "linked_and_converted"

    lead.stage = LeadStage.CONVERTED
    lead.stage_changed_at = timezone.now()
    lead.save(update_fields=["converted_customer", "stage", "stage_changed_at", "updated_at"])

    party = sync_party_for_crm_lead(lead, performed_by=performed_by)
    sync_party_for_customer(customer, party=party, performed_by=performed_by)

    log_audit(
        action_type=AuditLog.ActionType.CRM_INTERACTION_UPDATED,
        instance=lead,
        performed_by=performed_by,
        metadata={
            "event": "CRM_LEAD_RECONCILED",
            "action": action,
            "customer_id": customer.id,
        },
    )
    return {
        "lead_id": lead.id,
        "changed": True,
        "action": action,
        "customer_id": customer.id,
        "customer_name": customer.name,
        "stage": lead.stage,
    }


def reconcile_all_leads(performed_by=None) -> dict[str, Any]:
    """Reconcile every drifted lead. Safe to run repeatedly / on a schedule."""
    leads = find_reconcilable_leads()
    reports = [reconcile_lead(lead, performed_by=performed_by) for lead in leads]
    changed = [r for r in reports if r.get("changed")]
    return {
        "scanned": len(reports),
        "reconciled": len(changed),
        "results": reports,
    }
