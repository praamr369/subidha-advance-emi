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

        # Ensure all active PIM products and variant SKUs have operational products and inventory profiles
        try:
            from products_pim.models import PimProduct, ProductVariant
            from products_pim.services.sync_service import PIMSyncService

            pim_products = PimProduct.objects.filter(is_active=True)
            for pim in pim_products:
                if not pim.source_product or not hasattr(pim.source_product, "inventory_profile") or not pim.source_product.inventory_profile:
                    if not dry_run:
                        try:
                            PIMSyncService.sync_pim_product_to_operational_product(pim)
                        except Exception as exc:
                            self.stdout.write(self.style.WARNING(f"Could not sync PIM product {pim.code}: {exc}"))
                    else:
                        self.stdout.write(f"  would sync PIM product code={pim.code}")

            variants = ProductVariant.objects.filter(is_active=True)
            for var in variants:
                if not var.operational_product or not hasattr(var.operational_product, "inventory_profile") or not var.operational_product.inventory_profile:
                    if not dry_run:
                        try:
                            PIMSyncService.sync_variant_to_operational_product(var)
                        except Exception as exc:
                            self.stdout.write(self.style.WARNING(f"Could not sync variant {var.sku}: {exc}"))
                    else:
                        self.stdout.write(f"  would sync variant sku={var.sku}")
        except Exception as exc:
            self.stdout.write(self.style.WARNING(f"PIM sync check encountered an issue: {exc}"))

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
