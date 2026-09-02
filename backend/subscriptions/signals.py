# subscriptions/signals.py

from django.db.models.signals import post_save
from django.dispatch import receiver
from django.db import transaction

from subscriptions.models import (
    Batch,
    LuckyDraw,
    LuckyId,
    LuckyIdStatus,
)

from subscriptions.services.cache_service import (
    invalidate_public_stats,
    invalidate_all_dashboards,
)


# =====================================================
# 0️⃣ BUSINESS PROFILE → REFRESH POLICY PLACEHOLDER CACHE
# =====================================================

@receiver(post_save, sender='business_setup.BusinessProfile')
def refresh_policy_placeholder_cache_on_profile_save(sender, instance, **kwargs):
    """
    When the business profile is updated (name, phone, email, address, etc.),
    invalidate the render_policy_content context cache so all policy API
    responses automatically reflect the new business data on the next request.
    No policy content in the DB is mutated — resolution is always at serve time.
    """
    from django.core.cache import cache
    cache.delete("policy_placeholder_context")

# =====================================================
# 1️⃣ BATCH → CREATE LUCKY IDS (SAFE INITIALIZATION)
# =====================================================

@receiver(post_save, sender=Batch)
def create_lucky_ids_on_batch_create(sender, instance, created, **kwargs):
    """
    SAFE bootstrap logic.
    No financial mutation.
    Only generates 00–99 Lucky IDs once.
    """

    if not created:
        return

    if instance.lucky_ids.exists():
        return

    if instance.total_slots != 100:
        raise ValueError("Each batch must contain exactly 100 Lucky IDs.")

    lucky_ids = [
        LuckyId(
            batch=instance,
            lucky_number=number,
            status=LuckyIdStatus.AVAILABLE,
        )
        for number in range(100)
    ]

    with transaction.atomic():
        LuckyId.objects.bulk_create(lucky_ids)

    invalidate_public_stats()
    invalidate_all_dashboards()


# =====================================================
# 2️⃣ LUCKY DRAW → CACHE REFRESH ONLY
# =====================================================

@receiver(post_save, sender=LuckyDraw)
def lucky_draw_cache_refresh(sender, instance, **kwargs):
    """
    LuckyDraw business logic lives inside lucky_draw_service.
    Signal only refreshes cache.
    """
    invalidate_public_stats()
    invalidate_all_dashboards()


# =====================================================
# 3️⃣ ONLINE REQUEST → AUTO-SYNC TO CRM PIPELINE
# =====================================================

@receiver(post_save, sender='crm.OnlineRequest')
def sync_online_request_to_pipeline(sender, instance, created, **kwargs):
    """
    Automatically create/update CRMPipeline when OnlineRequest is saved.
    Keeps pipeline stage in sync with approval_status.
    """
    from subscriptions.models_crm_pipeline import CRMPipeline
    from subscriptions.models import PublicLead

    # Map approval_status to pipeline stage
    stage_mapping = {
        'DRAFT': 'LEAD',
        'QUOTED': 'QUOTED',
        'APPROVED': 'APPROVED',
        'CONVERTED': 'CONVERTED',
        'REJECTED': 'LOST',
        'LOST': 'LOST',
    }

    stage = stage_mapping.get(instance.approval_status, 'LEAD')

    # Get or create PublicLead. Match on phone first: name alone is not unique,
    # and get_or_create on it raises MultipleObjectsReturned once two leads
    # share a name.
    lead = instance.source_public_lead
    if not lead:
        customer_phone = instance.customer.phone if instance.customer else ''
        customer_name = instance.customer.name if instance.customer else 'Unknown'
        lead = PublicLead.objects.filter(phone=customer_phone).first() if customer_phone else None
        if not lead:
            lead = PublicLead.objects.create(
                name=customer_name,
                phone=customer_phone,
                email=instance.customer.email if hasattr(instance.customer, 'email') else '',
            )

    # Get or create CRMPipeline. CRMPipeline.lead is one-to-one, so the pipeline
    # is keyed on the lead and re-pointed at the latest online request; keying on
    # online_request instead violates the lead uniqueness on a second enquiry.
    pipeline, created_pipeline = CRMPipeline.objects.get_or_create(
        lead=lead,
        defaults={
            'online_request': instance,
            'current_stage': stage,
            'request_type': instance.request_type,
            'quoted_amount': float(instance.total_amount or 0),
            'probability': 50,
            'expected_close_date': instance.expected_close_date,
        }
    )
    pipeline.online_request = instance

    # Update pipeline with latest data
    pipeline.current_stage = stage
    pipeline.request_type = instance.request_type
    pipeline.quoted_amount = float(instance.total_amount or 0)
    pipeline.expected_close_date = instance.expected_close_date
    pipeline.approved_by = instance.approved_by
    pipeline.approved_at = instance.approved_at
    pipeline.notes = instance.conversion_notes

    # Map approved entity type
    if instance.approved_entity_type:
        pipeline.converted_to = instance.approved_entity_type

    # Set revenue if converted
    if instance.approved_direct_sale:
        pipeline.revenue = float(instance.approved_direct_sale.grand_total or 0)
        pipeline.converted_entity_id = instance.approved_direct_sale.id
    elif instance.approved_subscription:
        pipeline.revenue = float(instance.approved_subscription.total_amount or 0)
        pipeline.converted_entity_id = instance.approved_subscription.id

    pipeline.save()