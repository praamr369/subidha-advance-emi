"""One-pass PIM taxonomy importer.

Creates the full category → subcategory → attribute tree (with CHOICE options),
assigns every operational product to its subcategory, and parses attribute values
out of each product's name + description into real, editable PIM attributes.

Idempotent — safe to re-run. Values already edited by a human are not overwritten
unless --force is passed.

Usage:
    python manage.py import_pim_taxonomy            # dry run summary
    python manage.py import_pim_taxonomy --commit   # apply
    python manage.py import_pim_taxonomy --commit --force  # also overwrite values
"""
from __future__ import annotations

import re
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils.text import slugify

from products_pim.models import (
    AttributeOption,
    CategoryAttribute,
    PimProduct,
    ProductCategory,
    ProductSubcategory,
)
from products_pim.services import ensure_pim_product_for_product

# ── Shared option pools ───────────────────────────────────────────────
FURNITURE_MATERIALS = [
    "Sagwan", "Sonajhuri", "Plyboard & Laminates", "MDF", "Particle Board",
    "Stainless Steel", "Sheet", "Fibre", "Steel",
]
BRANDS = [
    "Godrej", "LG", "Samsung", "Whirlpool", "Blue Star", "Havells", "Bajaj",
    "Crompton", "Orient", "Sony", "MI", "Realme", "Philips", "Ahuja", "Motorola",
    "Zebronics", "Symphony", "V Guard", "Kent", "Pigeon", "Genus", "Luminous",
    "RR", "Roxy", "GM", "Edifier", "MarQ", "Borosil", "Midea", "Haier", "Milton",
    "Kenstar", "Kutchina", "Laopala", "Hindware",
]

# ── Taxonomy: category -> {icon, attributes(category-level), subcategories} ──
# Attribute tuple: (name, data_type, options_or_None)
TAXONOMY = {
    "Furniture": {
        "icon": "🪑",
        "attributes": [
            ("Material", "CHOICE", FURNITURE_MATERIALS),
            ("Dimensions", "TEXT", None),
            ("Finish", "CHOICE", ["Hand Polished", "Powder Coated", "Printed", "Unpolished"]),
        ],
        "subcategories": {
            "Bed": [
                ("Storage", "BOOLEAN", None),
                ("Base Material", "CHOICE", ["Sal Wood", "Iron", "Stainless Steel"]),
                ("Board Type", "CHOICE", ["Commercial Ply", "MDF", "Particle Board"]),
                ("Board Thickness", "CHOICE", ["18mm", "12mm", "16mm", "18mm / 12mm"]),
                ("Bed Type", "CHOICE", ["Wooden Bed", "MDF Bed", "Particle Board Bed", "Steel Bed", "Hybrid Steel Bed"]),
                ("Foldable", "BOOLEAN", None),
            ],
            "Bedside Tool": [("Storage", "BOOLEAN", None)],
            "Mattress": [
                ("Mattress Type", "CHOICE", ["Foam", "L&S Bondaid"]),
                ("Thickness", "CHOICE", ['4"', '6"']),
            ],
            "Wardrobe": [("Doors (Palla)", "CHOICE", ["2 Palla", "3 Palla"]), ("Storage", "BOOLEAN", None)],
            "Dressing Table": [("Storage", "BOOLEAN", None)],
            "Sofa": [("Seater", "CHOICE", ["1 Seater", "2 Seater", "3 Seater"])],
            "Sofa Cum Bed": [("Seater", "CHOICE", ["1 Seater", "2 Seater", "3 Seater"]), ("Storage", "BOOLEAN", None)],
            "Center Table": [],
            "Dinning Table": [("Seater", "CHOICE", ["4 Seater", "6 Seater"])],
            "Office Table": [],
            "Alna": [("Storage", "BOOLEAN", None)],
            "Showcase": [],
            "Chair": [("Chair Type", "CHOICE", ["Ergonomic", "Standard", "Foam"])],
            "Easy Chair": [],
            "Cabinet": [("Storage", "BOOLEAN", None)],
            "TV Unit": [],
        },
    },
    "Home Appliances": {
        "icon": "📺",
        "attributes": [("Brand", "CHOICE", BRANDS)],
        "subcategories": {
            "Refrigerator": [
                ("Capacity (Ltr)", "NUMBER", None),
                ("Door Type", "CHOICE", ["Single Door", "Double Door"]),
                ("Star Rating", "CHOICE", ["3 Star", "4 Star", "5 Star"]),
            ],
            "Air Conditioner": [
                ("Capacity", "CHOICE", ["1 Ton", "1.5 Ton", "2 Ton"]),
                ("Type", "CHOICE", ["Split", "Window"]),
                ("Star Rating", "CHOICE", ["3 Star", "4 Star", "5 Star"]),
            ],
            "Air Cooler": [("Capacity (Ltr)", "NUMBER", None), ("Type", "CHOICE", ["Desert", "Personal", "Tower"])],
            "Television": [
                ("Screen Size", "CHOICE", ['32"', '43"', '50"', '55"']),
                ("Resolution", "CHOICE", ["HD Ready", "4K UHD", "Full HD"]),
                ("Smart TV", "BOOLEAN", None),
            ],
            "Sound System": [("Power (W)", "NUMBER", None), ("Model", "TEXT", None)],
            "Water Geyser": [("Capacity (Ltr)", "NUMBER", None), ("Type", "CHOICE", ["Instant", "Storage"])],
            "Heater": [("Power (W)", "NUMBER", None), ("Type", "CHOICE", ["Quartz", "Blower"])],
            "Induction": [("Power (W)", "NUMBER", None), ("Type", "CHOICE", ["Radiant", "Induction"])],
            "Washing Machine": [
                ("Capacity (Kg)", "NUMBER", None),
                ("Type", "CHOICE", ["Semi Automatic", "Fully Automatic"]),
            ],
            "Fan": [("Size (mm)", "NUMBER", None), ("Type", "CHOICE", ["Ceiling", "Wall", "Pedestal", "Table", "Exhaust"])],
            "Inviter": [("Capacity (VA)", "NUMBER", None), ("Battery Type", "CHOICE", ["Li ion", "Tubular"])],
        },
    },
    "Kitchen Appliances": {
        "icon": "🍳",
        "attributes": [("Brand", "CHOICE", BRANDS)],
        "subcategories": {
            "OTG or Microwave Ovens": [("Capacity (Ltr)", "NUMBER", None), ("Type", "CHOICE", ["OTG", "Microwave Ovens"])],
            "Electric Kettle & Cooker": [
                ("Capacity (Ltr)", "NUMBER", None),
                ("Type", "CHOICE", ["Travel Kettle", "Rice Cooker Electric"]),
            ],
            "Kitchen Chimney": [],
            "Mixer Grinder": [("Power (W)", "NUMBER", None)],
            "Juicer": [("Power (W)", "NUMBER", None)],
            "Dinner Set": [("Size", "CHOICE", ["Small", "Medium", "Large", "Coffee Set"]), ("Pieces", "NUMBER", None)],
            "Kitchen Rack": [("Dimensions", "TEXT", None)],
        },
    },
}

# Units for NUMBER attributes → regex capturing the number before the unit.
_NUMBER_UNITS = {
    "Capacity (Ltr)": r"([\d.]+)\s*ltr",
    "Capacity (Kg)": r"([\d.]+)\s*kg",
    "Capacity (VA)": r"([\d.]+)\s*va",
    "Size (mm)": r"([\d.]+)\s*mm",
    "Power (W)": r"([\d.]+)\s*(?:w|watt)",
    "Pieces": r"([\d.]+)\s*pc",
}


def _first_number(pattern: str, text: str):
    m = re.search(pattern, text, re.IGNORECASE)
    if not m:
        return None
    try:
        return Decimal(m.group(1))
    except Exception:
        return None


def _match_option(options, text: str):
    """Return the option that appears in text (longest match wins)."""
    lowered = text.lower()
    best = None
    for opt in sorted(options, key=len, reverse=True):
        if opt.lower() in lowered:
            best = opt
            break
    return best


def _parse_value(attr_name, data_type, options, name, description):
    """Best-effort extraction of a value for one attribute from name + description."""
    haystack = f"{name} {description}"
    if data_type == "NUMBER":
        pat = _NUMBER_UNITS.get(attr_name)
        return ("number", _first_number(pat, haystack)) if pat else ("number", None)
    if data_type == "BOOLEAN":
        low = name.lower()
        if attr_name == "Storage":
            if "without storage" in low:
                return ("bool", False)
            if "storage" in low:
                return ("bool", True)
            return ("bool", None)
        if attr_name == "Foldable":
            return ("bool", "foldable" in low)
        if attr_name == "Smart TV":
            return ("bool", "smart" in low)
        return ("bool", None)
    if data_type == "CHOICE" and options:
        # Brand: match against the leading brand token first.
        matched = _match_option(options, name) or _match_option(options, description)
        return ("text", matched)
    if data_type == "TEXT":
        if attr_name == "Dimensions":
            m = re.search(r"(\d+(?:\.\d+)?\s*(?:ft|inch|mm|\"|x|×|\*)[\dftinchmm.×x*\" ]*)", name, re.IGNORECASE)
            return ("text", m.group(1).strip() if m else None)
        if attr_name == "Model":
            return ("text", None)  # too free-form to guess reliably
        return ("text", None)
    return (None, None)


class Command(BaseCommand):
    help = "Create PIM taxonomy and parse product attributes in one pass (idempotent)."

    def add_arguments(self, parser):
        parser.add_argument("--commit", action="store_true", help="Apply changes (default: dry run).")
        parser.add_argument("--force", action="store_true", help="Overwrite existing attribute values.")

    def handle(self, *args, **opts):
        commit = opts["commit"]
        force = opts["force"]

        with transaction.atomic():
            cat_objs, subcat_objs, attr_objs = self._build_taxonomy()
            stats = self._assign_products(cat_objs, subcat_objs, attr_objs, force)
            if not commit:
                transaction.set_rollback(True)

        mode = "APPLIED" if commit else "DRY RUN (nothing saved — pass --commit)"
        self.stdout.write(self.style.SUCCESS(f"\n=== {mode} ==="))
        self.stdout.write(f"Categories:        {stats['categories']}")
        self.stdout.write(f"Subcategories:     {stats['subcategories']}")
        self.stdout.write(f"Attributes:        {stats['attributes']} (with {stats['options']} options)")
        self.stdout.write(f"Products assigned: {stats['assigned']} / {stats['products']}")
        self.stdout.write(f"Attribute values:  {stats['values']} parsed & set")
        self.stdout.write(f"Unmatched subcats: {stats['unmatched']}")

    # ── taxonomy creation ─────────────────────────────────────────────
    def _build_taxonomy(self):
        cat_objs, subcat_objs, attr_objs = {}, {}, {}
        counts = {"categories": 0, "subcategories": 0, "attributes": 0, "options": 0}
        for order, (cat_name, cat_def) in enumerate(TAXONOMY.items(), start=1):
            cat, _ = ProductCategory.objects.get_or_create(
                slug=slugify(cat_name),
                defaults={"name": cat_name, "icon": cat_def["icon"], "display_order": order},
            )
            cat_objs[cat_name] = cat
            counts["categories"] += 1
            # category-level attributes (subcategory = None → apply to all)
            for a_order, (an, at, opts) in enumerate(cat_def["attributes"], start=1):
                attr = self._ensure_attribute(cat, None, an, at, opts, a_order)
                attr_objs[(cat_name, None, an)] = attr
                counts["attributes"] += 1
                counts["options"] += len(opts or [])
            for s_order, (sub_name, sub_attrs) in enumerate(cat_def["subcategories"].items(), start=1):
                sub, _ = ProductSubcategory.objects.get_or_create(
                    category=cat, slug=slugify(sub_name),
                    defaults={"name": sub_name, "display_order": s_order},
                )
                subcat_objs[(cat_name, sub_name)] = sub
                counts["subcategories"] += 1
                for a_order, (an, at, opts) in enumerate(sub_attrs, start=1):
                    attr = self._ensure_attribute(cat, sub, an, at, opts, a_order + 10)
                    attr_objs[(cat_name, sub_name, an)] = attr
                    counts["attributes"] += 1
                    counts["options"] += len(opts or [])
        self._counts = counts
        return cat_objs, subcat_objs, attr_objs

    def _ensure_attribute(self, category, subcategory, name, data_type, options, order):
        attr, _ = CategoryAttribute.objects.get_or_create(
            category=category, subcategory=subcategory, name=name,
            defaults={"data_type": data_type, "display_order": order},
        )
        # keep data_type in sync if the taxonomy changed
        if attr.data_type != data_type:
            attr.data_type = data_type
            attr.save(update_fields=["data_type"])
        for o_order, value in enumerate(options or [], start=1):
            AttributeOption.objects.get_or_create(
                attribute=attr, value=value,
                defaults={"display_name": value, "display_order": o_order},
            )
        return attr

    # ── product assignment + value parsing ────────────────────────────
    def _assign_products(self, cat_objs, subcat_objs, attr_objs, force):
        from products_pim.models import ProductAttribute

        stats = {**self._counts, "products": 0, "assigned": 0, "values": 0, "unmatched": 0}
        subcat_by_lower = {(c.lower(), s.lower()): obj for (c, s), obj in subcat_objs.items()}

        from subscriptions.models import Product

        for product in Product.objects.exclude(product_code="").iterator():
            stats["products"] += 1
            pim = ensure_pim_product_for_product(product)
            if pim is None:
                continue
            cat_text = (product.category or "").strip()
            sub_text = (product.subcategory or "").strip()
            sub_obj = subcat_by_lower.get((cat_text.lower(), sub_text.lower()))
            if sub_obj is None:
                stats["unmatched"] += 1
                continue
            # assign category + subcategory
            if pim.category_id != sub_obj.category_id or pim.subcategory_id != sub_obj.id:
                pim.category = sub_obj.category
                pim.subcategory = sub_obj
                pim.save(update_fields=["category", "subcategory"])
            stats["assigned"] += 1

            # applicable attributes = category-level + this subcategory's
            applicable = [
                obj for (c, s, _an), obj in attr_objs.items()
                if c == cat_text and (s is None or s == sub_text)
            ]
            for attr in applicable:
                options = list(attr.options.values_list("value", flat=True))
                kind, value = _parse_value(attr.name, attr.data_type, options, product.name, product.description or "")
                if value is None:
                    continue
                existing = ProductAttribute.objects.filter(product=pim, attribute=attr).first()
                if existing and not force and (existing.value_text or existing.value_number is not None or existing.value_boolean is not None):
                    continue
                defaults = {"value_text": "", "value_number": None, "value_boolean": None}
                if kind == "number":
                    defaults["value_number"] = value
                elif kind == "bool":
                    defaults["value_boolean"] = value
                else:
                    defaults["value_text"] = value
                ProductAttribute.objects.update_or_create(product=pim, attribute=attr, defaults=defaults)
                stats["values"] += 1
        return stats
