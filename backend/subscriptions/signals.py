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