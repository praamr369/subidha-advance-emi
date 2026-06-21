from __future__ import annotations

import logging

from django.db import transaction
from django.utils import timezone

from brochures.models import BrochureEnquiry
from brochures.services.brochure_enquiry_duplicate_service import (
    normalize_phone_for_comparison,
)
from crm.models import (
    Lead,
    LeadPlanType,
    LeadStage,
    PartyInteraction,
    PartyInteractionStatus,
    PartyInteractionType,
    PartyKind,
    PartyLink,
    PartyLinkRole,
    PartyMaster,
)

logger = logging.getLogger(__name__)


PLAN_MAP = {
    BrochureEnquiry.PreferredPlan.RENT: LeadPlanType.RENT,
    BrochureEnquiry.PreferredPlan.LEASE: LeadPlanType.LEASE,
    BrochureEnquiry.PreferredPlan.LUCKY_EMI: LeadPlanType.LUCKY_PLAN,
    BrochureEnquiry.PreferredPlan.DIRECT_SALE: LeadPlanType.DIRECT_SALE,
    BrochureEnquiry.PreferredPlan.NOT_SURE: LeadPlanType.LUCKY_PLAN,
}


def _interaction_note(enquiry: BrochureEnquiry) -> str:
    product_names = ", ".join(
        product.brochure_product_name
        for product in enquiry.products.all()
        if product.brochure_product_name
    ) or "No product selected"
    return (
        f"Brochure enquiry {enquiry.enquiry_no}; brochure "
        f"{enquiry.brochure.brochure_no}; plan {enquiry.preferred_plan}; "
        f"products: {product_names}; location: {enquiry.location or 'not provided'}. "
        f"{enquiry.message}".strip()
    )


def link_brochure_enquiry_to_crm(enquiry: BrochureEnquiry) -> BrochureEnquiry:
    if enquiry.crm_party_id and enquiry.crm_interaction_id and enquiry.crm_lead_id:
        if enquiry.crm_link_status != BrochureEnquiry.CrmLinkStatus.LINKED:
            BrochureEnquiry.objects.filter(pk=enquiry.pk).update(
                crm_link_status=BrochureEnquiry.CrmLinkStatus.LINKED,
                crm_link_message="CRM party, lead, and interaction are linked.",
                crm_linked_at=enquiry.crm_linked_at or timezone.now(),
                crm_sync_warning="",
            )
        return enquiry

    try:
        with transaction.atomic():
            normalized_phone = enquiry.phone_normalized or normalize_phone_for_comparison(
                enquiry.phone
            )
            phone_candidates = [enquiry.phone]
            digits = normalized_phone.removeprefix("+91")
            if digits:
                phone_candidates.extend([normalized_phone, digits])
            party = (
                PartyMaster.objects.filter(primary_phone__in=phone_candidates)
                .order_by("id")
                .first()
            )
            if party is None:
                party = PartyMaster.objects.create(
                    display_name=enquiry.customer_name,
                    party_kind=PartyKind.PERSON,
                    primary_phone=normalized_phone or enquiry.phone,
                    primary_email=enquiry.email,
                    city=enquiry.location[:100],
                    notes_summary="Lead captured from a public brochure.",
                )

            PartyLink.objects.get_or_create(
                role_type=PartyLinkRole.LEAD,
                source_app_label="brochures",
                source_model="BrochureEnquiry",
                source_pk=enquiry.id,
                defaults={
                    "party": party,
                    "source_reference": enquiry.enquiry_no,
                    "is_primary": True,
                    "metadata": {
                        "source": "BROCHURE",
                        "brochure_id": enquiry.brochure_id,
                    },
                },
            )

            first_product = enquiry.products.exclude(product=None).first()
            lead = enquiry.crm_lead
            if lead is None:
                duplicate_lead = None
                if enquiry.duplicate_of_id:
                    duplicate_lead = (
                        BrochureEnquiry.objects.filter(
                            pk=enquiry.duplicate_of_id,
                            crm_lead__stage__in=[
                                LeadStage.NEW,
                                LeadStage.CONTACTED,
                                LeadStage.INTERESTED,
                            ],
                        )
                        .values_list("crm_lead_id", flat=True)
                        .first()
                    )
                lead = Lead.objects.filter(pk=duplicate_lead).first()
                if lead is None:
                    lead = Lead.objects.create(
                        name=enquiry.customer_name,
                        phone=normalized_phone or enquiry.phone,
                        email=enquiry.email,
                        address=enquiry.address_text,
                        source="BROCHURE",
                        interested_product=first_product.product if first_product else None,
                        interested_plan_type=PLAN_MAP[enquiry.preferred_plan],
                        stage=LeadStage.NEW,
                        assigned_to=enquiry.assigned_to,
                    )

            interaction = enquiry.crm_interaction
            if interaction is None:
                interaction, _ = PartyInteraction.objects.get_or_create(
                    related_source_model="BrochureEnquiry",
                    related_source_pk=enquiry.id,
                    defaults={
                        "party": party,
                        "interaction_type": PartyInteractionType.CONTACT_NOTE,
                        "status": PartyInteractionStatus.OPEN,
                        "subject": f"Brochure enquiry {enquiry.enquiry_no}",
                        "note": _interaction_note(enquiry),
                    },
                )

            enquiry.crm_party = party
            enquiry.crm_interaction = interaction
            enquiry.crm_lead = lead
            enquiry.crm_sync_warning = (
                "Customer selected NOT_SURE; CRM lead uses Lucky Plan as its "
                "temporary generic plan while the brochure enquiry retains NOT_SURE."
                if enquiry.preferred_plan == BrochureEnquiry.PreferredPlan.NOT_SURE
                else ""
            )
            enquiry.crm_link_status = BrochureEnquiry.CrmLinkStatus.LINKED
            enquiry.crm_link_message = (
                "CRM party, lead, and interaction are linked."
                + (
                    " A recent matching brochure enquiry reused its active CRM lead."
                    if enquiry.duplicate_of_id
                    and enquiry.duplicate_of.crm_lead_id == lead.id
                    else ""
                )
            )
            enquiry.crm_linked_at = timezone.now()
            enquiry.save(
                update_fields=[
                    "crm_party",
                    "crm_interaction",
                    "crm_lead",
                    "crm_sync_warning",
                    "crm_link_status",
                    "crm_link_message",
                    "crm_linked_at",
                    "updated_at",
                ]
            )
    except Exception as exc:  # CRM must never block safe public lead capture.
        warning = f"CRM sync deferred: {exc}"[:1000]
        logger.exception("Brochure enquiry CRM sync failed for %s", enquiry.enquiry_no)
        linked_count = sum(
            bool(value)
            for value in (
                enquiry.crm_party_id,
                enquiry.crm_interaction_id,
                enquiry.crm_lead_id,
            )
        )
        link_status = (
            BrochureEnquiry.CrmLinkStatus.PARTIAL
            if linked_count
            else BrochureEnquiry.CrmLinkStatus.FAILED
        )
        BrochureEnquiry.objects.filter(pk=enquiry.pk).update(
            crm_sync_warning=warning,
            crm_link_status=link_status,
            crm_link_message=warning,
        )
        enquiry.crm_sync_warning = warning
        enquiry.crm_link_status = link_status
        enquiry.crm_link_message = warning
    return enquiry
