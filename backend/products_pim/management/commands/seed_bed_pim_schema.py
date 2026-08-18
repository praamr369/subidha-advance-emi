"""
Management command: seed_bed_pim_schema
========================================
Sets up the complete enterprise-grade PIM attribute schema for wooden beds
(Shakuntala, Lotus, and any future models) under Furniture > Bed.

Run once on a fresh DB or re-run safely (idempotent — uses get_or_create).

Usage:
    python manage.py seed_bed_pim_schema
    python manage.py seed_bed_pim_schema --dry-run
"""

from decimal import Decimal
from django.core.management.base import BaseCommand
from django.db import transaction
from products_pim.models import (
    ProductCategory,
    ProductSubcategory,
    CategoryAttribute,
    AttributeOption,
)


# ---------------------------------------------------------------------------
# Schema definition
# ---------------------------------------------------------------------------

# Each entry: (name, slug, data_type, is_required, is_variant_defining, display_order, subcategory_only, options)
# options: list of (value, display_name, extra_cost, display_order)
#
# subcategory_only=True  → attached to Furniture>Bed subcategory only
# subcategory_only=False → attached to Furniture category (visible on all furniture)
#
# Variant-defining attributes create separate SKUs.
# Non-variant attributes are metadata/spec shared across a SKU's variants.
# Add-on attributes have extra_cost > 0 on one or more options.

BED_ATTRIBUTES = [
    # ── VARIANT-DEFINING (each combo → distinct SKU with its own price) ───────
    {
        "name": "Bed Model",
        "slug": "bed-model",
        "data_type": "CHOICE",
        "is_required": True,
        "is_variant_defining": True,
        "display_order": 1,
        "subcategory_only": True,
        "options": [
            ("Shakuntala",   "Shakuntala", 0, 1),
            ("Lotus",        "Lotus",      0, 2),
            ("Lotus Deluxe", "Lotus Deluxe", 0, 3),
            ("Classic",      "Classic",    0, 4),
            ("Royal",        "Royal",      0, 5),
        ],
    },
    {
        "name": "Bed Size",
        "slug": "bed-size",
        "data_type": "CHOICE",
        "is_required": True,
        "is_variant_defining": True,
        "display_order": 2,
        "subcategory_only": True,
        "options": [
            ("Single (3x6)",       "Single (3×6 ft)",       0, 1),
            ("Double (4.5x6.5)",   "Double (4.5×6.5 ft)",   0, 2),
            ("Queen (5x7)",        "Queen (5×7 ft)",         0, 3),
            ("King (6x7)",         "King (6×7 ft)",          0, 4),
            ("Diwan (3x6.5)",      "Diwan (3×6.5 ft)",       0, 5),
        ],
    },
    {
        "name": "Primary Wood Species",
        "slug": "primary-wood-species",
        "data_type": "CHOICE",
        "is_required": True,
        "is_variant_defining": True,
        "display_order": 3,
        "subcategory_only": True,
        "options": [
            ("Sagwan (Teak)",  "Sagwan (Teak)",         0, 1),
            ("Sonajhuri",      "Sonajhuri",              0, 2),
            ("Sheesham",       "Sheesham (Rosewood)",    0, 3),
            ("Gamhar",         "Gamhar",                 0, 4),
            ("Sal",            "Sal (Shorea Robusta)",   0, 5),
            ("Sisu",           "Sisu",                   0, 6),
        ],
    },

    # ── STRUCTURAL COMPONENTS (specs — non-variant) ────────────────────────
    {
        "name": "Headboard Thickness",
        "slug": "headboard-thickness",
        "data_type": "CHOICE",
        "is_required": False,
        "is_variant_defining": False,
        "display_order": 10,
        "subcategory_only": True,
        "options": [
            ('1"',    '1 inch',          0, 1),
            ('1.5"',  '1.5 inch',        0, 2),
            ('2"',    '2 inch',          0, 3),
            ('2.5"',  '2.5 inch',        0, 4),
            ('3"',    '3 inch (Carved)', 0, 5),
        ],
    },
    {
        "name": "Headboard Design",
        "slug": "headboard-design",
        "data_type": "CHOICE",
        "is_required": False,
        "is_variant_defining": False,
        "display_order": 11,
        "subcategory_only": True,
        "options": [
            ("Simple / Plain",  "Simple / Plain",    0, 1),
            ("Panel",           "Panel Design",      0, 2),
            ("Carved",          "Hand-Carved",       0, 3),
            ("Designer CNC",    "Designer CNC Cut",  0, 4),
            ("Upholstered",     "Upholstered Pad",   0, 5),
        ],
    },
    {
        "name": "Side Rail Material",
        "slug": "side-rail-material",
        "data_type": "CHOICE",
        "is_required": False,
        "is_variant_defining": False,
        "display_order": 12,
        "subcategory_only": True,
        "options": [
            ("Sagwan (Teak)",     "Sagwan (Teak)",           0, 1),
            ("Sonajhuri",         "Sonajhuri",               0, 2),
            ("Sheesham",          "Sheesham",                0, 3),
            ("Sal",               "Sal Wood",                0, 4),
            ("Commercial Ply",    "Commercial Ply (18mm)",   0, 5),
            ("BWR Ply",           "BWR Ply (18mm)",          0, 6),
            ("MDF",               "MDF (18mm)",              0, 7),
            ("Particle Board",    "Particle Board (18mm)",   0, 8),
        ],
    },
    {
        "name": "Base / Dasa Material",
        "slug": "base-dasa-material",
        "data_type": "CHOICE",
        "is_required": False,
        "is_variant_defining": False,
        "display_order": 13,
        "subcategory_only": True,
        "options": [
            ("Sal Wood Dasa",          "Sal Wood (Traditional Dasa)",  0, 1),
            ("Iron Angle Dasa",        "Iron Angle (Dasa)",             0, 2),
            ("MS Square Pipe Dasa",    "MS Square Pipe (Dasa)",         0, 3),
            ("Stainless Steel Dasa",   "Stainless Steel (Dasa)",        0, 4),
            ("Bamboo Dasa",            "Bamboo Slat (Dasa)",            0, 5),
        ],
    },
    {
        "name": "Panel Board Type",
        "slug": "panel-board-type",
        "data_type": "CHOICE",
        "is_required": False,
        "is_variant_defining": False,
        "display_order": 14,
        "subcategory_only": True,
        "options": [
            ("Commercial Ply 18mm",  "Commercial Ply (18mm)",  0, 1),
            ("Commercial Ply 12mm",  "Commercial Ply (12mm)",  0, 2),
            ("BWR Ply 18mm",         "BWR Ply (18mm)",         0, 3),
            ("MDF 18mm",             "MDF (18mm)",             0, 4),
            ("MDF 12mm",             "MDF (12mm)",             0, 5),
            ("Particle Board 18mm",  "Particle Board (18mm)",  0, 6),
            ("Particle Board 12mm",  "Particle Board (12mm)",  0, 7),
        ],
    },
    {
        "name": "Footboard",
        "slug": "footboard",
        "data_type": "BOOLEAN",
        "is_required": False,
        "is_variant_defining": False,
        "display_order": 15,
        "subcategory_only": True,
        "options": [],
    },

    # ── ADD-ON SERVICES (extra_cost > 0 options) ──────────────────────────
    {
        "name": "Polish / Finish",
        "slug": "polish-finish",
        "data_type": "CHOICE",
        "is_required": False,
        "is_variant_defining": False,
        "display_order": 20,
        "subcategory_only": True,
        "options": [
            # (value, display_name, extra_cost, display_order)
            ("Natural / Unpolished",    "Natural / Unpolished",                  0,    1),
            ("Wax Polish",              "Wax Polish",                            0,    2),
            ("Hand Polish (Oil)",       "Hand Polish — Linseed Oil",             0,    3),
            ("Hand Polish (Spirit)",    "Hand Polish — Spirit / NC",          1500,    4),
            ("Machine Polish (NC)",     "Machine Polish — NC Lacquer",        2500,    5),
            ("Machine Polish (PU)",     "Machine Polish — PU Coat",           3500,    6),
            ("Machine Polish (Duco)",   "Machine Polish — Duco / Car Paint",  5000,    7),
            ("Laminate Wrap",           "Laminate Wrap",                      2000,    8),
        ],
    },
    {
        "name": "Hydraulic Storage Lift",
        "slug": "hydraulic-storage-lift",
        "data_type": "CHOICE",
        "is_required": False,
        "is_variant_defining": False,
        "display_order": 21,
        "subcategory_only": True,
        "options": [
            ("No Lift",                    "No Hydraulic Lift",                      0,    1),
            ("Single Lift — Iron",         "Single Lift — Iron Piston",           3500,    2),
            ("Single Lift — Steel",        "Single Lift — SS Piston",             5000,    3),
            ("Single Lift — Heavy Duty",   "Single Lift — Heavy Duty SS",         6500,    4),
            ("Double Lift — Iron",         "Double Lift — Iron Piston",           6000,    5),
            ("Double Lift — Steel",        "Double Lift — SS Piston",             8000,    6),
            ("Double Lift — Heavy Duty",   "Double Lift — Heavy Duty SS",        10000,    7),
        ],
    },
    {
        "name": "Storage Type",
        "slug": "storage-type",
        "data_type": "CHOICE",
        "is_required": False,
        "is_variant_defining": False,
        "display_order": 22,
        "subcategory_only": True,
        "options": [
            ("No Storage",          "No Storage",                        0, 1),
            ("Box Storage",         "Box Storage (under-bed drawer)",    0, 2),
            ("Hydraulic — Single",  "Hydraulic Single Lift",             0, 3),
            ("Hydraulic — Double",  "Hydraulic Double Lift",             0, 4),
        ],
    },
    {
        "name": "Storage Base Material",
        "slug": "storage-base-material",
        "data_type": "CHOICE",
        "is_required": False,
        "is_variant_defining": False,
        "display_order": 23,
        "subcategory_only": True,
        "options": [
            ("Commercial Ply 18mm",  "Commercial Ply (18mm) — Storage Box",  0, 1),
            ("BWR Ply 18mm",         "BWR Ply (18mm) — Storage Box",         0, 2),
            ("MDF 18mm",             "MDF (18mm) — Storage Box",             0, 3),
            ("Particle Board 18mm",  "Particle Board (18mm) — Storage Box",  0, 4),
        ],
    },

    # ── DIMENSIONS / SPECS ────────────────────────────────────────────────
    {
        "name": "Mattress Dimensions",
        "slug": "mattress-dimensions",
        "data_type": "TEXT",
        "is_required": False,
        "is_variant_defining": False,
        "display_order": 30,
        "subcategory_only": True,
        "options": [],
    },
    {
        "name": "Bed Height (inches)",
        "slug": "bed-height-inches",
        "data_type": "NUMBER",
        "is_required": False,
        "is_variant_defining": False,
        "display_order": 31,
        "subcategory_only": True,
        "options": [],
    },
    {
        "name": "Weight Capacity (kg)",
        "slug": "weight-capacity-kg",
        "data_type": "NUMBER",
        "is_required": False,
        "is_variant_defining": False,
        "display_order": 32,
        "subcategory_only": True,
        "options": [],
    },
]


class Command(BaseCommand):
    help = "Seed complete enterprise-grade PIM attribute schema for Furniture > Bed (Shakuntala, Lotus, etc.)"

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true", help="Print what would be created without saving")

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN — nothing will be saved.\n"))

        with transaction.atomic():
            # ── locate Furniture category ─────────────────────────────────
            furniture = ProductCategory.objects.filter(name="Furniture").first()
            if not furniture:
                self.stdout.write(self.style.ERROR("'Furniture' category not found. Run seed_pim_categories first."))
                return
            self.stdout.write(f"Category: {furniture.name} [id={furniture.id}]")

            # ── locate or create Bed subcategory ─────────────────────────
            bed_subcat, created = ProductSubcategory.objects.get_or_create(
                category=furniture,
                name="Bed",
                defaults={"slug": "bed", "display_order": 1, "is_active": True},
            )
            action = "Created" if created else "Found"
            self.stdout.write(f"{action} subcategory: Bed [id={bed_subcat.id}]")

            # ── seed attributes ───────────────────────────────────────────
            created_attrs = 0
            created_opts = 0

            for spec in BED_ATTRIBUTES:
                kwargs = {
                    "category": furniture,
                    "name": spec["name"],
                    "data_type": spec["data_type"],
                    "is_required": spec["is_required"],
                    "is_variant_defining": spec["is_variant_defining"],
                    "display_order": spec["display_order"],
                    "is_active": True,
                }
                if spec["subcategory_only"]:
                    kwargs["subcategory"] = bed_subcat
                else:
                    kwargs["subcategory"] = None

                if dry_run:
                    self.stdout.write(f"  [DRY] Attribute: {spec['name']} ({spec['data_type']}) variant={spec['is_variant_defining']} subcat={spec['subcategory_only']}")
                    for opt in spec["options"]:
                        extra = f" +₹{opt[2]:,}" if opt[2] else ""
                        self.stdout.write(f"         Option: {opt[0]}{extra}")
                    continue

                attr, attr_created = CategoryAttribute.objects.get_or_create(
                    category=furniture,
                    name=spec["name"],
                    subcategory=kwargs.get("subcategory"),
                    defaults={k: v for k, v in kwargs.items() if k not in ("category", "name", "subcategory")},
                )
                if attr_created:
                    created_attrs += 1
                else:
                    # Update fields in case spec changed
                    for field in ("data_type", "is_required", "is_variant_defining", "display_order", "is_active"):
                        setattr(attr, field, kwargs[field])
                    attr.save(update_fields=["data_type", "is_required", "is_variant_defining", "display_order", "is_active"])

                self.stdout.write(
                    f"  {'Created' if attr_created else '~ Updated'} attribute: {attr.name} [id={attr.id}]"
                    f" {'(variant-defining)' if attr.is_variant_defining else ''}"
                )

                for value, display_name, extra_cost, order in spec["options"]:
                    opt, opt_created = AttributeOption.objects.get_or_create(
                        attribute=attr,
                        value=value,
                        defaults={
                            "display_name": display_name,
                            "extra_cost": Decimal(str(extra_cost)),
                            "display_order": order,
                            "is_active": True,
                        },
                    )
                    if opt_created:
                        created_opts += 1
                    else:
                        # Always refresh extra_cost and display_name in case it changed
                        opt.display_name = display_name
                        opt.extra_cost = Decimal(str(extra_cost))
                        opt.display_order = order
                        opt.save(update_fields=["display_name", "extra_cost", "display_order"])
                    flag = "+₹{:,}".format(extra_cost) if extra_cost else ""
                    self.stdout.write(f"    {'+ ' if opt_created else '  '}{value} {flag}")

            if not dry_run:
                self.stdout.write(self.style.SUCCESS(
                    f"\nDone. Created {created_attrs} attributes, {created_opts} options."
                ))
                self.stdout.write(
                    "\nNext steps for the operator:\n"
                    "  1. Go to /admin/pim/products and create a new Blueprint.\n"
                    "  2. Category = Furniture, Subcategory = Bed.\n"
                    "  3. Lock non-variant attributes (Polish, Storage, etc.) on the blueprint.\n"
                    "  4. Add SKU variants: Bed Model × Size × Primary Wood Species → price each.\n"
                    "  5. Publish the blueprint to make all variants live.\n"
                )
