"""
Inventory signals for syncing stock reservations from various source modules.
Automatically creates/updates StockReservation records when:
- Subscriptions are created (EMI/RENT/LEASE)
- Direct sales orders are created
- Deliveries are initiated
"""

from django.db.models.signals import post_save
from django.dispatch import receiver


# Signal handlers for syncing reservations from various sources

@receiver(post_save, sender='subscriptions.Subscription')
def sync_subscription_to_reservation(sender, instance, created, update_fields, **kwargs):
    """
    When a Subscription is created, create a stock reservation for the product.
    """
    from inventory.models import StockReservation, StockReservationStatus, Warehouse
    from products_core.models import Product

    if not created:
        return

    try:
        # Get the product from subscription
        if not hasattr(instance, 'product_id') or not instance.product_id:
            return

        product = Product.objects.get(pk=instance.product_id)

        # Get default warehouse
        warehouse = Warehouse.objects.filter(is_default=True).first()
        if not warehouse:
            warehouse = Warehouse.objects.first()

        if not warehouse:
            return

        # Get quantity from subscription
        quantity = getattr(instance, 'quantity', 1)

        # Create reservation
        StockReservation.objects.create(
            product=product,
            warehouse=warehouse,
            quantity=quantity,
            status=StockReservationStatus.ACTIVE,
            source_module='SUBSCRIPTION',
            source_object_id=str(instance.id),
            created_by=instance.created_by if hasattr(instance, 'created_by') else None,
            note=f'Reserved for Subscription #{instance.id} ({instance.plan_type if hasattr(instance, "plan_type") else "Contract"})'
        )
    except Exception:
        # Silently fail if there are issues to avoid breaking subscription creation
        pass


@receiver(post_save, sender='billing.DirectSale')
def sync_direct_sale_reservation(sender, instance, created, update_fields, **kwargs):
    """
    When a DirectSale is created, create a stock reservation for each line item.
    """
    from inventory.models import StockReservation, StockReservationStatus, Warehouse

    if not created:
        return

    try:
        # Get default warehouse
        warehouse = Warehouse.objects.filter(is_default=True).first()
        if not warehouse:
            warehouse = Warehouse.objects.first()

        if not warehouse:
            return

        # Get line items if available
        if hasattr(instance, 'lines') and hasattr(instance.lines, 'all'):
            for line in instance.lines.all():
                if not hasattr(line, 'inventory_item') or not line.inventory_item:
                    continue

                quantity = getattr(line, 'quantity', 1)

                StockReservation.objects.create(
                    product=line.inventory_item.product,
                    warehouse=warehouse,
                    quantity=quantity,
                    status=StockReservationStatus.ACTIVE,
                    source_module='DIRECT_SALE',
                    source_object_id=str(instance.id),
                    created_by=instance.created_by if hasattr(instance, 'created_by') else None,
                    note=f'Reserved for Direct Sale #{instance.id}'
                )
    except Exception:
        # Silently fail if there are issues
        pass


@receiver(post_save, sender='deliveries.Delivery')
def sync_delivery_reservation(sender, instance, created, update_fields, **kwargs):
    """
    When a Delivery is created, create a stock reservation for the items.
    """
    from inventory.models import StockReservation, StockReservationStatus, Warehouse

    if not created:
        return

    try:
        # Get warehouse from delivery if available
        warehouse = Warehouse.objects.filter(is_default=True).first()
        if not warehouse:
            warehouse = Warehouse.objects.first()

        if not warehouse:
            return

        # Get line items if available
        if hasattr(instance, 'lines') and hasattr(instance.lines, 'all'):
            for line in instance.lines.all():
                if not hasattr(line, 'inventory_item') or not line.inventory_item:
                    continue

                quantity = getattr(line, 'quantity', 1)

                StockReservation.objects.create(
                    product=line.inventory_item.product,
                    warehouse=warehouse,
                    quantity=quantity,
                    status=StockReservationStatus.ACTIVE,
                    source_module='DELIVERY',
                    source_object_id=str(instance.id),
                    created_by=instance.created_by if hasattr(instance, 'created_by') else None,
                    note=f'Reserved for Delivery #{instance.id}'
                )
    except Exception:
        # Silently fail if there are issues
        pass
