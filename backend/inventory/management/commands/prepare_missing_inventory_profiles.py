from django.core.management.base import BaseCommand
from django.db import transaction

from inventory.models import InventoryItem
from inventory.services.inventory_profile_service import prepare_inventory_profile_for_product
from subscriptions.models import Product


class Command(BaseCommand):
    help = (
        "Create a stock-tracked InventoryItem profile for every active Product that "
        "doesn't have one yet, using the existing prepare_inventory_profile_for_product "
        "service (idempotent, audited, does not touch stock quantities or ledgers). "
        "Opening stock quantities stay at zero and must be entered separately via the "
        "Opening Stock workflow — this command only unblocks tracking, it never invents "
        "on-hand counts."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report what would be created without writing anything.",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        missing_product_ids = list(
            Product.objects.filter(is_active=True, inventory_profile__isnull=True).values_list(
                "id", flat=True
            )
        )

        if not missing_product_ids:
            self.stdout.write(self.style.SUCCESS("Every active product already has an inventory profile."))
            return

        self.stdout.write(f"{len(missing_product_ids)} active product(s) missing an inventory profile.")

        if dry_run:
            for product_id in missing_product_ids:
                self.stdout.write(f"  would prepare product_id={product_id}")
            self.stdout.write(self.style.WARNING("Dry run — no changes made."))
            return

        created_count = 0
        with transaction.atomic():
            for product_id in missing_product_ids:
                _item, created = prepare_inventory_profile_for_product(
                    product_id=product_id, actor=None, stock_tracking_enabled=True
                )
                if created:
                    created_count += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Prepared {created_count} inventory profile(s). "
                f"Total InventoryItem rows now: {InventoryItem.objects.count()}."
            )
        )
        self.stdout.write(
            "Next step: post real on-hand counts via Admin -> Inventory -> Opening Stock."
        )
