from __future__ import annotations

from decimal import Decimal

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from subscriptions.models import PlanType, Product


def _default_plan_type(emi: bool, rent: bool, lease: bool) -> tuple[str, bool]:
    """Pick a valid default plan type. Returns (plan_type, force_emi).

    The Product model only allows EMI/RENT/LEASE as a default plan type and
    requires the matching mode flag to be enabled. A pure direct-sale product
    has no valid plan type, so we fall back to enabling EMI for it.
    """
    if emi:
        return PlanType.EMI, False
    if rent:
        return PlanType.RENT, False
    if lease:
        return PlanType.LEASE, False
    return PlanType.EMI, True


def _assert_local_only() -> None:
    env = (getattr(settings, "ENVIRONMENT_NAME", "") or "").lower()
    if not (settings.DEBUG or env in {"development", "test", "local"}):
        raise CommandError("seed_catalog_demo is disabled outside local/test environments.")


# (code, name, category, subcategory, price, uom, emi, rent, lease, direct_sale)
DEMO_PRODUCTS: tuple[tuple, ...] = (
    # Furniture — EMI + direct sale (flagship EMI catalog)
    ("CAT-SOFA-3S", "Milano 3-Seater Fabric Sofa", "Sofa", "Fabric", "42000", "PCS", True, False, False, True),
    ("CAT-SOFA-RCL", "Recliner Leather Sofa", "Sofa", "Leather", "68000", "PCS", True, True, False, True),
    ("CAT-BED-KNG", "King Size Storage Bed", "Bed", "Storage", "38000", "PCS", True, False, False, True),
    ("CAT-BED-QSM", "Queen Size Wooden Bed", "Bed", "Wooden", "29000", "PCS", True, False, False, True),
    ("CAT-DIN-6ST", "6-Seater Dining Set", "Dining", "Sets", "45000", "SET", True, False, True, True),
    ("CAT-WRD-4DR", "4-Door Wardrobe", "Wardrobe", "Sliding", "52000", "PCS", True, False, False, True),
    # Appliances — direct sale + EMI
    ("CAT-TV-55UHD", "55\" 4K Smart LED TV", "Electronics", "Television", "58000", "PCS", True, False, False, True),
    ("CAT-REF-260", "260L Frost-Free Refrigerator", "Electronics", "Refrigerator", "31000", "PCS", True, False, False, True),
    ("CAT-WM-7KG", "7kg Front-Load Washing Machine", "Electronics", "Washing Machine", "34000", "PCS", True, False, False, True),
    # Rent / lease focused catalog (furniture rental / leasing future line)
    ("CAT-RENT-DSK", "Ergonomic Office Desk", "Office", "Desk", "12000", "PCS", False, True, True, True),
    ("CAT-RENT-CHR", "Mesh Office Chair", "Office", "Chair", "8500", "PCS", False, True, True, True),
    ("CAT-LEASE-AC", "1.5 Ton Split AC", "Electronics", "Air Conditioner", "40000", "PCS", True, True, True, True),
    # Kitchen — direct sale only (purchase request path)
    ("CAT-KIT-MOD", "Modular Kitchen Cabinet Unit", "Kitchen", "Modular", "95000", "SET", False, False, True, True),
    ("CAT-KIT-CHM", "Auto-Clean Chimney", "Kitchen", "Appliance", "18000", "PCS", True, False, False, True),
)


class Command(BaseCommand):
    help = (
        "Seed a demo product catalog spanning multiple categories and business "
        "purposes (EMI / Rent / Lease / Direct Sale) so the customer, partner, "
        "and vendor catalog dashboards have representative data. Idempotent — "
        "re-running updates existing rows by product_code. Local/test only."
    )

    def add_arguments(self, parser):
        parser.add_argument("--confirm", action="store_true")

    @transaction.atomic
    def handle(self, *args, **options):
        _assert_local_only()
        if not options["confirm"]:
            raise CommandError("Pass --confirm to seed the demo catalog.")

        created = 0
        updated = 0
        for (
            code,
            name,
            category,
            subcategory,
            price,
            uom,
            emi,
            rent,
            lease,
            direct_sale,
        ) in DEMO_PRODUCTS:
            plan_type, force_emi = _default_plan_type(emi, rent, lease)
            defaults = {
                "name": name,
                "base_price": Decimal(price),
                "category": category,
                "subcategory": subcategory,
                "unit_of_measure": uom,
                "is_active": True,
                "is_emi_enabled": emi or force_emi,
                "is_rent_enabled": rent,
                "is_lease_enabled": lease,
                "is_direct_sale_enabled": direct_sale,
                "plan_type_default": plan_type,
                "lifecycle_status": "ACTIVE",
            }
            product = Product.objects.filter(product_code=code).first()
            if product is None:
                Product.objects.create(product_code=code, **defaults)
                created += 1
            else:
                for field, value in defaults.items():
                    setattr(product, field, value)
                product.save()
                updated += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Demo catalog seeded: {created} created, {updated} updated, "
                f"{len(DEMO_PRODUCTS)} total across "
                f"{len({row[2] for row in DEMO_PRODUCTS})} categories."
            )
        )
