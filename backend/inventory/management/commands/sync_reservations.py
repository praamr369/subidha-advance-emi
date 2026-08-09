"""
Management command to sync stock reservations from various source modules
(Subscriptions, DirectSales, Deliveries) to the StockReservation model.
"""

from django.core.management.base import BaseCommand
from django.db import transaction
from inventory.models import StockReservation, StockReservationStatus, Warehouse
from products_core.models import Product


class Command(BaseCommand):
    help = "Sync stock reservations from Subscriptions, DirectSales, and Deliveries"

    def add_arguments(self, parser):
        parser.add_argument(
            '--source',
            type=str,
            choices=['subscriptions', 'direct_sales', 'deliveries', 'all'],
            default='all',
            help='Which source to sync from (default: all)'
        )
        parser.add_argument(
            '--delete-orphans',
            action='store_true',
            help='Delete reservations for deleted source records',
        )

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS("Starting reservation synchronization..."))
        self.stdout.write()

        source = options.get('source', 'all')
        total_synced = 0

        # Get first active warehouse
        warehouse = Warehouse.objects.filter(is_active=True).first()
        if not warehouse:
            warehouse = Warehouse.objects.first()

        if not warehouse:
            self.stdout.write(self.style.ERROR("No warehouse found!"))
            return

        with transaction.atomic():
            # Sync Subscriptions
            if source in ['subscriptions', 'all']:
                self.stdout.write("Syncing Subscriptions...")
                from subscriptions.models import Subscription

                subscriptions = Subscription.objects.all()
                created_count = 0

                for subscription in subscriptions:
                    if not hasattr(subscription, 'product_id') or not subscription.product_id:
                        continue

                    try:
                        product = Product.objects.get(pk=subscription.product_id)
                        quantity = getattr(subscription, 'quantity', 1)

                        reservation, created = StockReservation.objects.get_or_create(
                            source_module='SUBSCRIPTION',
                            source_object_id=str(subscription.id),
                            defaults={
                                'product': product,
                                'warehouse': warehouse,
                                'quantity': quantity,
                                'status': StockReservationStatus.ACTIVE,
                                'created_by': subscription.created_by if hasattr(subscription, 'created_by') else None,
                                'note': f'Reserved for Subscription #{subscription.id}'
                            }
                        )

                        if created:
                            created_count += 1

                    except Exception as e:
                        self.stdout.write(
                            self.style.WARNING(f"  Warning syncing subscription {subscription.id}: {str(e)}")
                        )

                total_synced += created_count
                self.stdout.write(f"  [OK] Created {created_count} reservations from subscriptions")
                self.stdout.write()

            # Sync Direct Sales
            if source in ['direct_sales', 'all']:
                self.stdout.write("Syncing Direct Sales...")
                try:
                    from billing.models import DirectSale, DirectSaleLine

                    direct_sales = DirectSale.objects.all()
                    created_count = 0

                    for sale in direct_sales:
                        try:
                            lines = DirectSaleLine.objects.filter(direct_sale=sale)

                            for line in lines:
                                if not hasattr(line, 'inventory_item') or not line.inventory_item:
                                    continue

                                quantity = getattr(line, 'quantity', 1)

                                reservation, created = StockReservation.objects.get_or_create(
                                    source_module='DIRECT_SALE',
                                    source_object_id=str(sale.id),
                                    product=line.inventory_item.product,
                                    defaults={
                                        'warehouse': warehouse,
                                        'quantity': quantity,
                                        'status': StockReservationStatus.ACTIVE,
                                        'created_by': sale.created_by if hasattr(sale, 'created_by') else None,
                                        'note': f'Reserved for Direct Sale #{sale.id}'
                                    }
                                )

                                if created:
                                    created_count += 1

                        except Exception as e:
                            self.stdout.write(
                                self.style.WARNING(f"  Warning syncing direct sale {sale.id}: {str(e)}")
                            )

                    total_synced += created_count
                    self.stdout.write(f"  [OK] Created {created_count} reservations from direct sales")
                except ImportError:
                    self.stdout.write(self.style.WARNING("  DirectSale module not found"))

                self.stdout.write()

            # Sync Deliveries
            if source in ['deliveries', 'all']:
                self.stdout.write("Syncing Deliveries...")
                try:
                    from deliveries.models import Delivery, DeliveryLine

                    deliveries = Delivery.objects.all()
                    created_count = 0

                    for delivery in deliveries:
                        try:
                            lines = DeliveryLine.objects.filter(delivery=delivery)

                            for line in lines:
                                if not hasattr(line, 'inventory_item') or not line.inventory_item:
                                    continue

                                quantity = getattr(line, 'quantity', 1)

                                reservation, created = StockReservation.objects.get_or_create(
                                    source_module='DELIVERY',
                                    source_object_id=str(delivery.id),
                                    product=line.inventory_item.product,
                                    defaults={
                                        'warehouse': warehouse,
                                        'quantity': quantity,
                                        'status': StockReservationStatus.ACTIVE,
                                        'created_by': delivery.created_by if hasattr(delivery, 'created_by') else None,
                                        'note': f'Reserved for Delivery #{delivery.id}'
                                    }
                                )

                                if created:
                                    created_count += 1

                        except Exception as e:
                            self.stdout.write(
                                self.style.WARNING(f"  Warning syncing delivery {delivery.id}: {str(e)}")
                            )

                    total_synced += created_count
                    self.stdout.write(f"  [OK] Created {created_count} reservations from deliveries")
                except ImportError:
                    self.stdout.write(self.style.WARNING("  Delivery module not found"))

                self.stdout.write()

        self.stdout.write(self.style.SUCCESS(f"Total reservations synced: {total_synced}"))
        self.stdout.write(self.style.SUCCESS("Reservation synchronization complete!"))
