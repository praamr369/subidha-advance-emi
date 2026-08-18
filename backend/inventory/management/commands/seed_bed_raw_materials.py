"""
Management command: seed_bed_raw_materials
==========================================
Seeds all raw-material InventoryItems and ServiceCatalogItems needed for
wooden-bed manufacturing (Shakuntala / Lotus and any future models).

Run idempotently:
    python manage.py seed_bed_raw_materials
    python manage.py seed_bed_raw_materials --dry-run

Creates:
  RAW_MATERIAL InventoryItems
    • Wood boards by species + thickness (headboard / footboard)
    • Side rails: 6", 8", 10" (support) and 15" (storage)
    • Dasa base frames: Sal 3/2" and Iron 3/2"
    • Ply sheets: Commercial and BWR in 18mm / 12mm
    • Hardware: screws, L-brackets, nut-bolt sets

  ACCESSORY InventoryItems
    • Hydraulic piston sets (single/double, iron/SS/heavy-duty)

  ServiceCatalogItems (type = POLISH or INSTALLATION)
    • Hand Polish (Spirit/NC)         ₹1,500
    • Machine Polish NC Lacquer       ₹2,500
    • Machine Polish PU Coat          ₹3,500
    • Machine Polish Duco / Car Paint ₹5,000
    • Laminate Wrap                   ₹2,000
    • Wax Polish                         ₹0 (included)
    • Installation Service               ₹0 (included)
    • Delivery & Setup                   ₹0 (included)
"""

from decimal import Decimal
from django.core.management.base import BaseCommand
from django.db import transaction
from products_core.models import Product
from inventory.models import InventoryItem, InventoryItemType, ServiceCatalogItem, ServiceType


# ---------------------------------------------------------------------------
# Schema definition helpers
# ---------------------------------------------------------------------------

# Raw materials: (product_code, name, unit, item_type, standard_cost, reorder_level)
WOOD_SPECIES = [
    ("SGW", "Sagwan (Teak)"),
    ("SNJ", "Sonajhuri"),
    ("SHS", "Sheesham (Rosewood)"),
    ("GMR", "Gamhar"),
    ("SAL", "Sal"),
    ("SIS", "Sisu"),
]

BOARD_THICKNESSES = [
    ("1IN",   '1"',    "1 inch"),
    ("1HIN",  '1.5"',  "1.5 inch"),
    ("2IN",   '2"',    "2 inch"),
    ("25IN",  '2.5"',  "2.5 inch"),
    ("3IN",   '3"',    "3 inch (Carved)"),
]

SIDE_RAIL_SIZES = [
    ("SR06", '6"',   "6 inch Side Rail (Non-storage support)",   6,   120),
    ("SR08", '8"',   "8 inch Side Rail (Non-storage support)",   8,    80),
    ("SR10", '10"',  "10 inch Side Rail (Non-storage support)",  10,   60),
    ("SR15", '15"',  "15 inch Double-Open Rail (Storage bed)",   15,  100),
]

PLY_TYPES = [
    ("COMPL", "Commercial Ply", "COMM"),
    ("BWRPL", "BWR Ply (Waterproof)", "BWR"),
]
PLY_THICKNESSES = [
    ("18MM", "18mm", 18, 180),
    ("12MM", "12mm", 12, 140),
]

DASA_MATERIALS = [
    ("SAL-DASA-32",  "Sal Wood Dasa 3/2\"",   "RFT",  "SAL",  80,   5),
    ("IRON-DASA-32", "Iron Angle Dasa 3/2\"",  "RFT",  "IRON", 55,   8),
    ("MS-DASA-32",   "MS Square Pipe Dasa 3/2\"", "RFT", "MS", 65,   6),
    ("SS-DASA-32",   "SS Dasa 3/2\"",          "RFT",  "SS",   120,  4),
    ("BAMBOO-DASA",  "Bamboo Slat Dasa",        "RFT",  "BMBOO", 40, 10),
]

HARDWARE = [
    ("HW-SCREW-50MM",  "Wood Screws 50mm (Pack/100)",     "PACK",  35,   20),
    ("HW-SCREW-75MM",  "Wood Screws 75mm (Pack/50)",      "PACK",  40,   20),
    ("HW-LBRACKET",    "L-Bracket 3\" (Pack/10)",         "PACK",  60,   15),
    ("HW-NUTBOLT-SET", "Nut-Bolt Set M8 (Pack/20)",       "PACK",  80,   10),
    ("HW-DOWEL-8MM",   "Wooden Dowel 8mm (Pack/50)",      "PACK",  45,   15),
    ("HW-SAND-180",    "Sand Paper 180 grit (Sheet)",     "SHT",    5,   50),
    ("HW-SAND-240",    "Sand Paper 240 grit (Sheet)",     "SHT",    6,   50),
    ("HW-SAND-400",    "Sand Paper 400 grit (Sheet)",     "SHT",    8,   30),
]

HYDRAULIC_PISTONS = [
    ("HYD-SINGLE-IRON",  "Hydraulic Piston Single — Iron",       "SET",  "ACCESSORY",  1800, 10),
    ("HYD-SINGLE-SS",    "Hydraulic Piston Single — SS",         "SET",  "ACCESSORY",  2800, 8),
    ("HYD-SINGLE-HD",    "Hydraulic Piston Single — Heavy Duty SS", "SET", "ACCESSORY", 3800, 5),
    ("HYD-DOUBLE-IRON",  "Hydraulic Piston Double — Iron",       "SET",  "ACCESSORY",  3200, 8),
    ("HYD-DOUBLE-SS",    "Hydraulic Piston Double — SS",         "SET",  "ACCESSORY",  4500, 6),
    ("HYD-DOUBLE-HD",    "Hydraulic Piston Double — Heavy Duty SS", "SET", "ACCESSORY", 5500, 4),
]

SERVICES = [
    # (code, name, category, service_type, standard_price, description)
    ("SVC-POLISH-WAX",   "Wax Polish",                      "Polish / Finishing", "POLISH",       0,   "Basic wax hand polish, included in base price"),
    ("SVC-POLISH-OIL",   "Hand Polish — Linseed Oil",       "Polish / Finishing", "POLISH",       0,   "Hand-applied linseed oil finish"),
    ("SVC-POLISH-HAND",  "Hand Polish — Spirit / NC",       "Polish / Finishing", "POLISH",    1500,   "Hand-applied spirit / NC lacquer finish"),
    ("SVC-POLISH-NC",    "Machine Polish — NC Lacquer",     "Polish / Finishing", "POLISH",    2500,   "Machine-applied NC lacquer spray finish"),
    ("SVC-POLISH-PU",    "Machine Polish — PU Coat",        "Polish / Finishing", "POLISH",    3500,   "Machine-applied 2K PU coat finish (water & scratch resistant)"),
    ("SVC-POLISH-DUCO",  "Machine Polish — Duco / Car Paint", "Polish / Finishing", "POLISH",  5000,  "Duco / automotive paint finish"),
    ("SVC-LAMI-WRAP",    "Laminate Wrap",                   "Polish / Finishing", "POLISH",    2000,   "Decorative laminate sheet wrapping"),
    ("SVC-INSTALL",      "Installation & Setup",            "Installation",       "INSTALLATION", 0,  "Standard bed installation and assembly at customer site"),
    ("SVC-DELIVERY",     "Delivery & Setup",                "Installation",       "INSTALLATION", 0,  "Delivery + basic setup included"),
    ("SVC-HYD-INSTALL",  "Hydraulic Lift Installation",     "Installation",       "INSTALLATION", 500, "Hydraulic storage lift piston installation and calibration"),
]


def _get_or_create_product(code, name, category, unit, cost, dry_run, item_type="RAW_MATERIAL"):
    if dry_run:
        return None, True
    prod, created = Product.objects.get_or_create(
        product_code=code,
        defaults={
            "name": name,
            "category": category,
            "unit_of_measure": unit,
            "base_price": Decimal(str(cost)),
            "is_active": True,
            "item_type": item_type,
        },
    )
    if not created:
        prod.name = name
        prod.category = category
        prod.unit_of_measure = unit
        prod.item_type = item_type
        prod.save(update_fields=["name", "category", "unit_of_measure", "item_type"])
    return prod, created


def _get_or_create_inventory(product, item_type, unit, cost, reorder, dry_run):
    if dry_run or product is None:
        return None, True
    inv, created = InventoryItem.objects.get_or_create(
        product=product,
        defaults={
            "inventory_code": product.product_code,
            "sku": product.product_code,
            "unit_of_measure": unit,
            "stock_item_type": item_type,
            "stock_tracking_enabled": True,
            "reorder_level_qty": Decimal(str(reorder)),
            "standard_unit_cost": Decimal(str(cost)),
            "stock_tracking_status": InventoryItem.StockTrackingStatus.PREPARED_NO_STOCK,
        },
    )
    if not created:
        inv.stock_item_type = item_type
        inv.unit_of_measure = unit
        inv.standard_unit_cost = Decimal(str(cost))
        inv.reorder_level_qty = Decimal(str(reorder))
        inv.save(update_fields=["stock_item_type", "unit_of_measure", "standard_unit_cost", "reorder_level_qty"])
    return inv, created


class Command(BaseCommand):
    help = "Seed raw materials, accessories and services for wooden-bed manufacturing"

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true", help="Preview without saving")

    def handle(self, *args, **options):
        dry = options["dry_run"]
        if dry:
            self.stdout.write(self.style.WARNING("DRY RUN — nothing will be saved\n"))

        rm_created = rm_updated = svc_created = svc_updated = 0

        with transaction.atomic():

            # ── 1. Wood boards (headboard / footboard planks) ─────────────────
            self.stdout.write("\n[1] Wood Board Raw Materials")
            for sp_code, sp_name in WOOD_SPECIES:
                for th_code, th_disp, th_label in BOARD_THICKNESSES:
                    code = f"RM-BD-{sp_code}-{th_code}"
                    name = f"{sp_name} Board {th_disp} (Headboard/Footboard)"
                    cost = {"SGW": 220, "SNJ": 100, "SHS": 180, "GMR": 90, "SAL": 110, "SIS": 130}.get(sp_code, 100)
                    thick_mul = {"1IN": 0.8, "1HIN": 1.0, "2IN": 1.25, "25IN": 1.5, "3IN": 1.8}.get(th_code, 1.0)
                    unit_cost = int(cost * thick_mul)
                    if dry:
                        self.stdout.write(f"  [DRY] {code}: {name}  @ ₹{unit_cost}/RFT")
                        continue
                    prod, c = _get_or_create_product(code, name, "Furniture - Raw Material", "RFT", unit_cost, dry)
                    _get_or_create_inventory(prod, InventoryItemType.RAW_MATERIAL, "RFT", unit_cost, 20, dry)
                    if c:
                        rm_created += 1
                        self.stdout.write(f"  + {code}: {name}")
                    else:
                        rm_updated += 1
                        self.stdout.write(f"  ~ {code}: {name}")

            # ── 2. Side Rails ─────────────────────────────────────────────────
            self.stdout.write("\n[2] Side Rails")
            for code, size_disp, name, cost, reorder in SIDE_RAIL_SIZES:
                full_code = f"RM-{code}"
                if dry:
                    self.stdout.write(f"  [DRY] {full_code}: {name}  @ ₹{cost}/PCS")
                    continue
                prod, c = _get_or_create_product(full_code, name, "Furniture - Raw Material", "PCS", cost, dry)
                _get_or_create_inventory(prod, InventoryItemType.RAW_MATERIAL, "PCS", cost, reorder, dry)
                if c:
                    rm_created += 1; self.stdout.write(f"  + {full_code}: {name}")
                else:
                    rm_updated += 1; self.stdout.write(f"  ~ {full_code}: {name}")

            # ── 3. Dasa / Base Frame ──────────────────────────────────────────
            self.stdout.write("\n[3] Dasa / Base Frame Materials")
            for code, name, unit, mat, cost, reorder in DASA_MATERIALS:
                if dry:
                    self.stdout.write(f"  [DRY] RM-{code}: {name}  @ ₹{cost}/{unit}")
                    continue
                full_code = f"RM-{code}"
                prod, c = _get_or_create_product(full_code, name, "Furniture - Raw Material", unit, cost, dry)
                _get_or_create_inventory(prod, InventoryItemType.RAW_MATERIAL, unit, cost, reorder, dry)
                if c:
                    rm_created += 1; self.stdout.write(f"  + {full_code}: {name}")
                else:
                    rm_updated += 1; self.stdout.write(f"  ~ {full_code}: {name}")

            # ── 4. Ply Sheets (upper base) ────────────────────────────────────
            self.stdout.write("\n[4] Ply Sheets (upper base)")
            for pl_code, pl_name, pl_abbr in PLY_TYPES:
                for th_code, th_label, th_cost_base, cost in PLY_THICKNESSES:
                    cost_val = cost * (1.3 if pl_abbr == "BWR" else 1.0)
                    code = f"RM-{pl_code}-{th_code}"
                    name = f"{pl_name} {th_label}"
                    if dry:
                        self.stdout.write(f"  [DRY] {code}: {name}  @ ₹{cost_val:.0f}/SQFT")
                        continue
                    prod, c = _get_or_create_product(code, name, "Furniture - Raw Material", "SQFT", cost_val, dry)
                    _get_or_create_inventory(prod, InventoryItemType.RAW_MATERIAL, "SQFT", cost_val, 30, dry)
                    if c:
                        rm_created += 1; self.stdout.write(f"  + {code}: {name}")
                    else:
                        rm_updated += 1; self.stdout.write(f"  ~ {code}: {name}")

            # ── 5. Hardware ───────────────────────────────────────────────────
            self.stdout.write("\n[5] Hardware & Fasteners")
            for code, name, unit, cost, reorder in HARDWARE:
                if dry:
                    self.stdout.write(f"  [DRY] {code}: {name}")
                    continue
                prod, c = _get_or_create_product(code, name, "Furniture - Hardware", unit, cost, dry)
                _get_or_create_inventory(prod, InventoryItemType.RAW_MATERIAL, unit, cost, reorder, dry)
                if c:
                    rm_created += 1; self.stdout.write(f"  + {code}: {name}")
                else:
                    rm_updated += 1; self.stdout.write(f"  ~ {code}: {name}")

            # ── 6. Hydraulic Piston Accessories ───────────────────────────────
            self.stdout.write("\n[6] Hydraulic Piston Accessories")
            for code, name, unit, item_type, cost, reorder in HYDRAULIC_PISTONS:
                if dry:
                    self.stdout.write(f"  [DRY] {code}: {name}  @ ₹{cost}")
                    continue
                prod, c = _get_or_create_product(code, name, "Furniture - Accessories", unit, cost, dry, item_type="ACCESSORY")
                _get_or_create_inventory(prod, InventoryItemType.ACCESSORY, unit, cost, reorder, dry)
                if c:
                    rm_created += 1; self.stdout.write(f"  + {code}: {name}")
                else:
                    rm_updated += 1; self.stdout.write(f"  ~ {code}: {name}")

            # ── 7. Service Catalog Items ───────────────────────────────────────
            self.stdout.write("\n[7] Service Catalog Items (Polish / Installation)")
            for code, name, category, svc_type, price, desc in SERVICES:
                if dry:
                    price_str = f"₹{price:,}" if price else "Included (₹0)"
                    self.stdout.write(f"  [DRY] {code}: {name}  {price_str}")
                    continue
                # Ensure a Product record exists for the service (makes it visible in product register)
                _get_or_create_product(code, name, category, "SVC", price, dry, item_type="SERVICE")
                svc, created = ServiceCatalogItem.objects.get_or_create(
                    code=code,
                    defaults={
                        "name": name,
                        "category": category,
                        "service_type": svc_type,
                        "standard_price": Decimal(str(price)),
                        "description": desc,
                        "status": "ACTIVE",
                    },
                )
                if not created:
                    svc.name = name
                    svc.category = category
                    svc.service_type = svc_type
                    svc.standard_price = Decimal(str(price))
                    svc.description = desc
                    svc.save(update_fields=["name", "category", "service_type", "standard_price", "description"])
                if created:
                    svc_created += 1; self.stdout.write(f"  + {code}: {name}")
                else:
                    svc_updated += 1; self.stdout.write(f"  ~ {code}: {name}")

        if not dry:
            self.stdout.write(self.style.SUCCESS(
                f"\nDone. Raw materials/accessories: {rm_created} created, {rm_updated} updated. "
                f"Services: {svc_created} created, {svc_updated} updated."
            ))
            self.stdout.write(
                "\nNext steps:\n"
                "  1. Go to /admin/inventory/ to set opening stock for raw materials.\n"
                "  2. Go to /admin/manufacturing/ to create BOMs for each bed variant,\n"
                "     selecting these raw materials as BOM lines.\n"
                "  3. Polish services (SVC-POLISH-*) can be linked to finished-good\n"
                "     bed variants via FinishedGoodServiceLink in the admin.\n"
            )
