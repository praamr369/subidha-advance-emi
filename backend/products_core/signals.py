import logging
from django.db.models.signals import post_save
from django.dispatch import receiver
from products_core.models import ProductVariant, Product

logger = logging.getLogger(__name__)

@receiver(post_save, sender=ProductVariant)
def sync_core_variant_to_pim(sender, instance, created, **kwargs):
    """
    Unidirectional sync from Core -> PIM.
    Whenever a Core ProductVariant (SKU, price, name) changes, force overwrite the PIM variant.
    """
    from products_pim.models import ProductVariant as PimVariant
    
    if not instance.sku:
        return
        
    try:
        pim_variant = PimVariant.objects.get(sku=instance.sku)
        
        dirty = False
        calculated_price = instance.variant_price if instance.variant_price is not None else instance.product.base_price
        
        if getattr(pim_variant, 'price', None) != calculated_price:
            pim_variant.price = calculated_price
            dirty = True
            
        if dirty:
            pim_variant.save(update_fields=['price'])
            logger.info(f"Synced core variant {instance.sku} to PIM")
    except PimVariant.DoesNotExist:
        pass

@receiver(post_save, sender=Product)
def sync_core_product_to_pim_variants(sender, instance, created, **kwargs):
    """
    When the base product changes (e.g. base_price), update all child PIM variants 
    that inherit the base price.
    """
    from products_pim.models import ProductVariant as PimVariant
    
    for variant in instance.variants.filter(variant_price__isnull=True):
        if not variant.sku:
            continue
        try:
            pim_variant = PimVariant.objects.get(sku=variant.sku)
            if pim_variant.price != instance.base_price:
                pim_variant.price = instance.base_price
                pim_variant.save(update_fields=['price'])
        except PimVariant.DoesNotExist:
            pass
