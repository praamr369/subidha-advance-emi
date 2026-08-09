"""
Inventory signals for syncing services between Product and ServiceCatalogItem models.
"""

from django.db.models.signals import post_save
from django.dispatch import receiver


@receiver(post_save, sender='products_core.Product')
def sync_service_product_to_catalog(sender, instance, created, update_fields, **kwargs):
    """
    When a Product with item_type=SERVICE is created or updated,
    automatically create or update the corresponding ServiceCatalogItem.

    This ensures services created from the Products admin page appear in the Service Catalog.
    """
    # Import here to avoid circular imports
    from inventory.models import ServiceCatalogItem, ServiceCatalogItemStatus, ServiceType

    # Only process SERVICE type products
    if instance.item_type != 'SERVICE':
        return

    # Map product category to service category
    service_category = instance.category or instance.category_master.name if instance.category_master else "Uncategorized"

    # Map GST rate to tax_rate_percent (GST rate is already a percentage)
    tax_rate = instance.gst_rate or 18.00

    # Get or create ServiceCatalogItem
    catalog_item, item_created = ServiceCatalogItem.objects.get_or_create(
        code=instance.product_code,
        defaults={
            'name': instance.name,
            'description': instance.description,
            'category': service_category,
            'service_type': ServiceType.OTHER,  # Default service type
            'standard_price': instance.base_price,
            'tax_rate_percent': tax_rate,
            'status': ServiceCatalogItemStatus.ACTIVE if instance.is_active else ServiceCatalogItemStatus.INACTIVE,
            'hsn_sac_code': instance.hsn_sac_code,
        }
    )

    # If item already exists, update it
    if not item_created:
        catalog_item.name = instance.name
        catalog_item.description = instance.description
        catalog_item.category = service_category
        catalog_item.standard_price = instance.base_price
        catalog_item.tax_rate_percent = tax_rate
        catalog_item.status = ServiceCatalogItemStatus.ACTIVE if instance.is_active else ServiceCatalogItemStatus.INACTIVE
        catalog_item.hsn_sac_code = instance.hsn_sac_code
        catalog_item.save()


def ready():
    """
    Called when the app is ready. We import signals here to ensure they're registered.
    """
    pass
