"""
Seed opening stock test data across showroom + warehouse locations.

Usage (local/dev only):
  python manage.py seed_stock_test_data --confirm
  python manage.py seed_stock_test_data --confirm --qty-per-location 30
"""
from __future__ import annotations

import random
from decimal import Decimal

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from inventory.models import (
    InventoryItem,
    InventoryItemType,
    OpeningStockEntrySource,
    StockLocation,
    StockLocationType,
)
from inventory.services.opening_stock_entry_service import (
    create_opening_stock_entry,
    post_opening_stock_entry,
)
from subscriptions.models import Product


QUANTITY_ZERO = Decimal("0.000")
MONEY_ZERO = Decimal("0.00")


def _assert_local_only() -> None:
    env = (getattr(settings, "ENVIRONMENT_NAME", "") or "").lower()
    if not (settings.DEBUG or env in {"development", "test", "local"}):
        raise CommandError("seed_stock_test_data is disabled outside local/test environments.")


LOCATIONS_SPEC = [
    # (code, name, type)  — names must be globally unique in StockLocation
    ("MAIN", "Main Showroom", StockLocationType.SHOWROOM),          # existing
    ("GODOWN", "Main Godown", StockLocationType.WAREHOUSE),         # existing
    ("LOC-SHOWROOM-B1", "Branch Showroom 1", StockLocationType.SHOWROOM),
    ("LOC-WAREHOUSE-CENTRAL", "Central Warehouse", StockLocationType.WAREHOUSE),
    ("LOC-STORE-BACK", "Back Store Room", StockLocationType.STORE),
]


class Command(BaseCommand):
    help = "Seed 50-100 test opening stock entries across showroom + warehouse locations (local/dev only)."

    def add_arguments(self, parser):
        parser.add_argument("--confirm", action="store_true", help="Required to actually run.")
        parser.add_argument("--qty-per-location", type=int, default=15,
                            help="Max qty range per product per location (actual is random 5..N).")
        parser.add_argument("--dry-run", action="store_true", help="Print plan without writing anything.")

    @transaction.atomic
    def handle(self, *args, **options):
        _assert_local_only()
        if not options["confirm"] and not options["dry_run"]:
            raise CommandError("Pass --confirm (or --dry-run) to run this command.")

        dry = options["dry_run"]
        max_qty = options["qty_per_location"]
        today = timezone.localdate()

        # ── 1. Ensure locations exist ──────────────────────────────────────
        locations: list[StockLocation] = []
        for code, name, loc_type in LOCATIONS_SPEC:
            if dry:
                self.stdout.write(f"[DRY] location {code} ({loc_type})")
                continue
            loc, created = StockLocation.objects.get_or_create(
                code=code,
                defaults={"name": name, "location_type": loc_type, "is_active": True},
            )
            locations.append(loc)
            if created:
                self.stdout.write(self.style.SUCCESS(f"  Created location: {name} [{loc_type}]"))
            else:
                self.stdout.write(f"  Location exists: {name}")

        if dry:
            self.stdout.write("[DRY] Would create 5 locations and seed stock. Re-run without --dry-run.")
            return

        # ── 2. Fetch all active products ───────────────────────────────────
        products = list(Product.objects.filter(is_active=True).order_by("id"))
        if not products:
            raise CommandError("No active products found. Create products first.")

        self.stdout.write(f"\nFound {len(products)} active products.")

        # ── 3. Ensure InventoryItem exists for each product ────────────────
        items: list[InventoryItem] = []
        showroom_loc = next((l for l in locations if l.location_type == StockLocationType.SHOWROOM), locations[0])

        for product in products:
            item, created = InventoryItem.objects.get_or_create(
                product=product,
                defaults={
                    "inventory_code": f"INV-{product.id:04d}",
                    "sku": f"SKU-{product.id:04d}",
                    "unit_of_measure": "PCS",
                    "stock_item_type": InventoryItemType.FINISHED_GOOD,
                    "stock_tracking_enabled": True,
                    "delivery_stock_bridge_enabled": True,
                    "default_stock_location": showroom_loc,
                    "preferred_stock_location": showroom_loc,
                    "standard_unit_cost": (
                        Decimal(str(product.base_price)) * Decimal("0.6")
                    ).quantize(Decimal("0.01")),
                },
            )
            items.append(item)
            if created:
                self.stdout.write(self.style.SUCCESS(f"  Created InventoryItem for: {product.name}"))

        # ── 4. Seed stock entries ──────────────────────────────────────────
        # Distribute: showrooms get display qty (5-15), warehouse gets bulk (20-50)
        entry_count = 0
        posted_count = 0
        errors = []

        random.seed(42)  # reproducible

        for item in items:
            for loc in locations:
                if loc.location_type in (StockLocationType.SHOWROOM, StockLocationType.STORE):
                    qty = random.randint(5, max(5, min(max_qty, 15)))
                else:
                    qty = random.randint(20, max(20, min(max_qty * 3, 50)))

                try:
                    entry = create_opening_stock_entry(
                        inventory_item_id=item.id,
                        stock_location_id=loc.id,
                        quantity=qty,
                        effective_date=today,
                        note=f"Test seed - {loc.name}",
                        source=OpeningStockEntrySource.MANUAL,
                        batch=None,
                    )
                    entry_count += 1

                    # Auto-post immediately
                    _, was_posted = post_opening_stock_entry(entry_id=entry.id)
                    if was_posted:
                        posted_count += 1

                except Exception as exc:
                    errors.append(f"{item.inventory_code or item.id} @ {loc.code}: {exc}")

        # ── 6. Summary ─────────────────────────────────────────────────────
        self.stdout.write("\n" + "-" * 60)
        self.stdout.write(self.style.SUCCESS(
            f"Done! {entry_count} entries created, {posted_count} posted."
        ))
        self.stdout.write(
            f"  Locations: {len(locations)}  |  Products: {len(products)}  |  Items: {len(items)}"
        )
        if errors:
            self.stdout.write(self.style.WARNING(f"\n{len(errors)} errors:"))
            for e in errors[:10]:
                self.stdout.write(f"  ! {e}")
        else:
            self.stdout.write(self.style.SUCCESS("  No errors."))
        self.stdout.write("-" * 60)
