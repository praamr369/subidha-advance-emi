"""
PIM → Manufacturing BOM Bridge Service
=======================================
Auto-generates a ManufacturingBom from a PimProduct variant's attribute values.

Logic:
- Reads VariantAttributeValue slugs for: primary-wood-species, headboard-thickness,
  side-rail-material, base-dasa-material, panel-board-type, storage-type,
  hydraulic-storage-lift, polish-finish
- Maps each to the corresponding raw-material / accessory / service InventoryItem or
  ServiceCatalogItem (seeded by seed_bed_raw_materials management command)
- Creates/updates a ManufacturingBom with BOM lines for each material
- Returns a summary dict

Usage:
    from products_pim.services.bom_bridge_service import auto_bom_for_variant
    result = auto_bom_for_variant(pim_product)   # pim_product is a child (variant) PimProduct
"""

from __future__ import annotations
from decimal import Decimal
from typing import Optional

QUANTITY_ZERO = Decimal("0.000")

# ---------------------------------------------------------------------------
# Attribute slug → raw-material product_code mapping
# ---------------------------------------------------------------------------

# Wood species slug value → RM board prefix code
WOOD_SPECIES_MAP = {
    "Sagwan (Teak)":         "SGW",
    "Sonajhuri":             "SNJ",
    "Sheesham (Rosewood)":   "SHS",
    "Gamhar":                "GMR",
    "Sal (Shorea Robusta)":  "SAL",
    "Sisu":                  "SIS",
}

# Headboard thickness slug value → RM thickness suffix
THICKNESS_MAP = {
    '1"':   "1IN",
    '1.5"': "1HIN",
    '2"':   "2IN",
    '2.5"': "25IN",
    '3"':   "3IN",
}

# Side rail size from storage type
STORAGE_RAIL_MAP = {
    # Storage beds use 15" double-open rails
    "Hydraulic — Single":   "RM-SR15",
    "Hydraulic — Double":   "RM-SR15",
    "Box Storage":          "RM-SR15",
    # Non-storage: default to 8" support rails (operator can override)
    "No Storage":           "RM-SR08",
}

# Dasa / base material
DASA_MAP = {
    "Sal Wood Dasa":       "RM-SAL-DASA-32",
    "Iron Angle Dasa":     "RM-IRON-DASA-32",
    "MS Square Pipe Dasa": "RM-MS-DASA-32",
    "Stainless Steel Dasa": "RM-SS-DASA-32",
    "Bamboo Slat (Dasa)":  "RM-BAMBOO-DASA",
}

# Upper base ply
PLY_MAP = {
    "Commercial Ply 18mm":  "RM-COMPL-18MM",
    "Commercial Ply 12mm":  "RM-COMPL-12MM",
    "BWR Ply 18mm":         "RM-BWRPL-18MM",
    "BWR Ply 12mm":         "RM-BWRPL-12MM",
    # Panel board type (headboard / footboard casing)
    "MDF 18mm":             None,   # no raw-material seeded for MDF yet
    "MDF 12mm":             None,
    "Particle Board 18mm":  None,
    "Particle Board 12mm":  None,
}

# Hydraulic pistons (Accessory)
HYDRAULIC_MAP = {
    "Single Lift — Iron":        "HYD-SINGLE-IRON",
    "Single Lift — SS Piston":   "HYD-SINGLE-SS",
    "Single Lift — Heavy Duty SS": "HYD-SINGLE-HD",
    "Double Lift — Iron Piston": "HYD-DOUBLE-IRON",
    "Double Lift — SS Piston":   "HYD-DOUBLE-SS",
    "Double Lift — Heavy Duty SS": "HYD-DOUBLE-HD",
}

# Polish / finish → ServiceCatalogItem code
POLISH_SERVICE_MAP = {
    "Natural / Unpolished":   None,
    "Wax Polish":             "SVC-POLISH-WAX",
    "Hand Polish (Oil)":      None,
    "Hand Polish (Spirit)":   "SVC-POLISH-HAND",
    "Machine Polish (NC)":    "SVC-POLISH-NC",
    "Machine Polish (PU)":    "SVC-POLISH-PU",
    "Machine Polish (Duco)":  "SVC-POLISH-DUCO",
    "Laminate Wrap":          "SVC-LAMI-WRAP",
}

# Bed size → approximate board lengths (running feet) needed for headboard + footboard
BED_SIZE_BOARD_RFT = {
    "Single (3x6)":      8.0,   # ~3 ft wide × 2 panels, both HB + FB
    "Double (4.5x6.5)":  10.0,
    "Queen (5x7)":       12.0,
    "King (6x7)":        14.0,
    "Diwan (3x6.5)":     8.0,
}

# Bed size → dasa running feet (perimeter of base frame)
BED_SIZE_DASA_RFT = {
    "Single (3x6)":      18.0,
    "Double (4.5x6.5)":  22.0,
    "Queen (5x7)":       24.0,
    "King (6x7)":        26.0,
    "Diwan (3x6.5)":     19.0,
}

# Bed size → upper ply sq.ft
BED_SIZE_PLY_SQFT = {
    "Single (3x6)":      18.0,
    "Double (4.5x6.5)":  30.0,
    "Queen (5x7)":       35.0,
    "King (6x7)":        42.0,
    "Diwan (3x6.5)":     20.0,
}

# Side rail pcs per bed (2 rails per side = 4 rails total; storage beds may use 2 long ones)
BED_SIZE_RAIL_PCS = {
    "Single (3x6)":     4,
    "Double (4.5x6.5)": 4,
    "Queen (5x7)":      4,
    "King (6x7)":       6,   # extra centre support
    "Diwan (3x6.5)":    4,
}

DEFAULT_HARDWARE = [
    ("HW-SCREW-50MM",  2),   # 2 packs per bed
    ("HW-SCREW-75MM",  1),
    ("HW-LBRACKET",    2),
    ("HW-NUTBOLT-SET", 1),
    ("HW-DOWEL-8MM",   1),
]


def _read_attr(attr_values: dict, slug: str) -> Optional[str]:
    """Return value_text for the given attribute slug, or None."""
    return attr_values.get(slug)


def auto_bom_for_variant(pim_product) -> dict:
    """
    Create or update a ManufacturingBom for a variant PimProduct.
    Returns {"created": bool, "bom_no": str, "lines": int, "warnings": [str]}
    """
    from products_core.models import Product as CoreProduct
    from inventory.models import InventoryItem, InventoryItemType, ServiceCatalogItem
    from manufacturing.models import ManufacturingBom, ManufacturingBomLine, ManufacturingBomStatus
    from products_pim.models import VariantAttributeValue

    warnings: list[str] = []

    # ── 1. Find the finished-good InventoryItem for this variant ─────────────
    # Variant PimProduct code == ProductVariant.sku == CoreProduct.product_code
    core_product = CoreProduct.objects.filter(product_code=pim_product.code).first()
    if not core_product:
        return {"error": f"No operational Product found for code {pim_product.code}"}

    try:
        fg_item = core_product.inventory_profile
    except InventoryItem.DoesNotExist:
        return {"error": f"No InventoryItem found for product {pim_product.code}"}

    if fg_item.stock_item_type == InventoryItemType.RAW_MATERIAL:
        return {"error": "Cannot create BOM for a RAW_MATERIAL inventory item."}

    # ── 2. Read variant attribute values ──────────────────────────────────────
    # Attributes come from VariantAttributeValue on the ProductVariant
    from products_pim.models import ProductVariant
    variant_record = ProductVariant.objects.filter(sku=pim_product.code).prefetch_related(
        "attribute_values__attribute"
    ).first()

    av: dict[str, str] = {}
    if variant_record:
        for vav in variant_record.attribute_values.all():
            av[vav.attribute.slug] = vav.value_text

    # Also check PimProduct's own ProductAttribute records (base attrs)
    for pa in pim_product.attributes.select_related("attribute").all():
        slug = pa.attribute.slug
        if slug not in av:
            av[slug] = pa.value_text

    # If no variant attrs found, check parent's attributes
    if pim_product.parent_id:
        for pa in pim_product.parent.attributes.select_related("attribute").all():
            slug = pa.attribute.slug
            if slug not in av:
                av[slug] = pa.value_text

    # ── 3. Build BOM line items ───────────────────────────────────────────────
    bed_size = av.get("bed-size", "")
    wood_species = av.get("primary-wood-species", "")
    headboard_thickness = av.get("headboard-thickness", "")
    storage_type = av.get("storage-type", "No Storage")
    panel_board = av.get("panel-board-type", "")
    base_dasa = av.get("base-dasa-material", "Sal Wood Dasa")
    hydraulic = av.get("hydraulic-storage-lift", "No Lift")
    polish = av.get("polish-finish", "")

    lines_to_create: list[dict] = []  # {"product_code": str, "qty": float, "note": str}

    # a) Wood boards for headboard + footboard
    sp_code = WOOD_SPECIES_MAP.get(wood_species)
    th_code = THICKNESS_MAP.get(headboard_thickness)
    if sp_code and th_code:
        rm_code = f"RM-BD-{sp_code}-{th_code}"
        rft = BED_SIZE_BOARD_RFT.get(bed_size, 10.0)
        lines_to_create.append({"product_code": rm_code, "qty": rft, "note": f"HB+FB boards {wood_species} {headboard_thickness}"})
    else:
        if not sp_code:
            warnings.append(f"Wood species '{wood_species}' not mapped; no board BOM line created")
        if not th_code and headboard_thickness:
            warnings.append(f"Thickness '{headboard_thickness}' not mapped; no board BOM line created")

    # b) Side rails
    rail_code = STORAGE_RAIL_MAP.get(storage_type, "RM-SR08")
    rail_pcs = BED_SIZE_RAIL_PCS.get(bed_size, 4)
    if rail_code:
        lines_to_create.append({"product_code": rail_code, "qty": rail_pcs, "note": f"Side rails ({storage_type})"})

    # c) Dasa / base frame
    dasa_code = DASA_MAP.get(base_dasa)
    if dasa_code:
        dasa_rft = BED_SIZE_DASA_RFT.get(bed_size, 22.0)
        lines_to_create.append({"product_code": dasa_code, "qty": dasa_rft, "note": "Dasa/base frame"})
    else:
        warnings.append(f"Dasa material '{base_dasa}' not mapped")

    # d) Upper ply
    ply_code = PLY_MAP.get(panel_board)
    if ply_code:
        sqft = BED_SIZE_PLY_SQFT.get(bed_size, 30.0)
        lines_to_create.append({"product_code": ply_code, "qty": sqft, "note": f"Upper base ply {panel_board}"})
    elif panel_board:
        warnings.append(f"Panel board '{panel_board}' has no mapped raw-material InventoryItem yet")

    # e) Hydraulic pistons (accessory)
    hyd_code = HYDRAULIC_MAP.get(hydraulic)
    if hyd_code:
        lines_to_create.append({"product_code": hyd_code, "qty": 1.0, "note": f"Hydraulic: {hydraulic}"})

    # f) Default hardware
    for hw_code, qty in DEFAULT_HARDWARE:
        lines_to_create.append({"product_code": hw_code, "qty": qty, "note": "Hardware / fasteners"})

    # ── 4. Resolve InventoryItems for BOM lines ───────────────────────────────
    resolved_lines: list[dict] = []
    for line in lines_to_create:
        try:
            prod = CoreProduct.objects.get(product_code=line["product_code"])
            inv = prod.inventory_profile
            if not inv.stock_tracking_enabled:
                warnings.append(f"{line['product_code']}: not stock-tracked, skipped")
                continue
            resolved_lines.append({"inventory_item": inv, "qty": Decimal(str(line["qty"])), "note": line["note"]})
        except (CoreProduct.DoesNotExist, InventoryItem.DoesNotExist):
            warnings.append(f"Raw material {line['product_code']} not found in inventory — run seed_bed_raw_materials first")

    # ── 5. Create or update BOM ───────────────────────────────────────────────
    existing_boms = ManufacturingBom.objects.filter(
        finished_good_inventory_item=fg_item,
        status=ManufacturingBomStatus.DRAFT,
    ).order_by("-revision_no")

    if existing_boms.exists():
        bom = existing_boms.first()
        bom_created = False
        # Clear existing lines (rebuild fresh)
        bom.lines.all().delete()
    else:
        # Find next revision number
        last_rev = ManufacturingBom.objects.filter(
            finished_good_inventory_item=fg_item
        ).order_by("-revision_no").values_list("revision_no", flat=True).first() or 0
        bom = ManufacturingBom.objects.create(
            finished_good_inventory_item=fg_item,
            revision_no=last_rev + 1,
            status=ManufacturingBomStatus.DRAFT,
            is_default=True,
            notes=f"Auto-generated from PIM variant: {pim_product.code}",
        )
        bom_created = True

    # ── 6. Write BOM lines ────────────────────────────────────────────────────
    for i, line in enumerate(resolved_lines, start=1):
        ManufacturingBomLine.objects.create(
            bom=bom,
            inventory_item=line["inventory_item"],
            quantity_per_unit=line["qty"],
            wastage_percent=Decimal("3.00"),
            sort_order=i,
            notes=line["note"],
        )

    # ── 7. Link polish service ────────────────────────────────────────────────
    from inventory.models import FinishedGoodServiceLink, FGServiceChargeMode
    polish_svc_code = POLISH_SERVICE_MAP.get(polish)
    if polish_svc_code:
        try:
            svc = ServiceCatalogItem.objects.get(code=polish_svc_code)
            FinishedGoodServiceLink.objects.get_or_create(
                finished_good=fg_item,
                service=svc,
                defaults={
                    "charge_mode": FGServiceChargeMode.CHARGEABLE if svc.standard_price > 0 else FGServiceChargeMode.FREE,
                    "sale_price": svc.standard_price,
                    "is_default_included": True,
                    "sort_order": 10,
                    "notes": f"Polish add-on from PIM: {polish}",
                },
            )
        except ServiceCatalogItem.DoesNotExist:
            warnings.append(f"Polish service {polish_svc_code} not found — run seed_bed_raw_materials first")

    # Always link installation service
    try:
        install_svc = ServiceCatalogItem.objects.get(code="SVC-INSTALL")
        FinishedGoodServiceLink.objects.get_or_create(
            finished_good=fg_item,
            service=install_svc,
            defaults={"charge_mode": FGServiceChargeMode.FREE, "is_default_included": True, "sort_order": 1},
        )
    except ServiceCatalogItem.DoesNotExist:
        warnings.append("Installation service SVC-INSTALL not found")

    return {
        "created": bom_created,
        "bom_no": bom.bom_no,
        "bom_id": bom.pk,
        "lines": len(resolved_lines),
        "warnings": warnings,
        "variant_attrs": av,
    }
