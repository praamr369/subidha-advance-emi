"""Keep every operational product paired with a linked PIM editing record."""
from __future__ import annotations

import logging

from django.db.models.signals import post_save
from django.dispatch import receiver

logger = logging.getLogger(__name__)


@receiver(post_save, sender="products_core.Product", dispatch_uid="pim_ensure_link")
def ensure_pim_link_on_product_save(sender, instance, created, **kwargs):
    """Auto-create/link a PimProduct whenever a product is created, so new products
    are immediately editable with full PIM attributes/variants. Best-effort — a PIM
    linking hiccup must never block saving the operational product.
    """
    if not created:
        return
    try:
        from products_pim.services import ensure_pim_product_for_product

        ensure_pim_product_for_product(instance)
    except Exception:  # pragma: no cover - defensive
        logger.exception("Failed to ensure PIM link for product %s", getattr(instance, "id", None))
