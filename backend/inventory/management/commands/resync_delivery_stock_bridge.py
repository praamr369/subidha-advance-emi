from django.core.management.base import BaseCommand

from subscriptions.models import SubscriptionDelivery, DeliveryStatus
from inventory.services.delivery_bridge_service import sync_delivery_inventory_bridge


class Command(BaseCommand):
    help = "Resync stock ledger entries for delivered or returned subscription deliveries (idempotent)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--reference",
            type=str,
            help="Delivery reference string (e.g. DLV-20261028-ONZCG7)",
        )
        parser.add_argument(
            "--delivery-id",
            type=int,
            help="Delivery ID (primary key)",
        )
        parser.add_argument(
            "--all",
            action="store_true",
            help="Resync all deliveries in DELIVERED or RETURNED status.",
        )

    def handle(self, *args, **options):
        ref = options.get("reference")
        delivery_id = options.get("delivery_id")
        sync_all = options.get("all")

        if not ref and not delivery_id and not sync_all:
            self.stdout.write(self.style.ERROR("Please specify --reference, --delivery-id, or --all."))
            return

        queryset = SubscriptionDelivery.objects.filter(
            status__in=[DeliveryStatus.DELIVERED, DeliveryStatus.RETURNED]
        )
        if ref:
            queryset = queryset.filter(delivery_reference=ref)
        elif delivery_id:
            queryset = queryset.filter(id=delivery_id)

        count = queryset.count()
        if count == 0:
            self.stdout.write(self.style.WARNING("No matching delivered/returned deliveries found."))
            return

        self.stdout.write(f"Syncing stock bridge for {count} delivery(ies)...")
        total_created = 0
        for delivery in queryset:
            res = sync_delivery_inventory_bridge(delivery=delivery)
            created_count = res.get("entries_created", 0)
            total_created += created_count
            self.stdout.write(
                f"  Delivery #{delivery.id} ({delivery.delivery_reference}): "
                f"created/updated {created_count} entries (skipped: {res.get('skipped', False)})"
            )

        self.stdout.write(
            self.style.SUCCESS(
                f"Completed. Created/updated {total_created} stock ledger entry(ies) across {count} delivery(ies)."
            )
        )

