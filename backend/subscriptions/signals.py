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

@receiver(post_save, sender='subscriptions.OnlineRequest')
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

    # Get or create PublicLead
    lead = instance.source_public_lead
    if not lead:
        lead, _ = PublicLead.objects.get_or_create(
            name=instance.customer.name if instance.customer else 'Unknown',
            defaults={
                'phone': instance.customer.phone if instance.customer else '',
                'email': instance.customer.email if hasattr(instance.customer, 'email') else '',
            }
        )

    # Get or create CRMPipeline
    pipeline, created_pipeline = CRMPipeline.objects.get_or_create(
        online_request=instance,
        defaults={
            'lead': lead,
            'current_stage': stage,
            'request_type': instance.request_type,
            'quoted_amount': float(instance.total_amount or 0),
            'probability': 50,
            'expected_close_date': instance.expected_close_date,
        }
    )

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