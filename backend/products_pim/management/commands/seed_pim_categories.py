from django.core.management.base import BaseCommand
from products_pim.models import ProductCategory, ProductSubcategory, CategoryAttribute, AttributeOption, AttributeDataType


SEED_DATA = {
    "Furniture": {
        "slug": "furniture",
        "icon": "🛋️",
        "subcategories": {
            "Beds": {
                "slug": "beds",
                "attributes": [
                    {"name": "Size", "slug": "size", "type": "CHOICE", "required": True,
                     "options": ["Single (3x6)", "Double (4.5x6.5)", "Queen (6x6.5)", "King (6x7)"]},
                    {"name": "Material", "slug": "material", "type": "CHOICE", "required": True,
                     "options": ["Teak", "Sheesham", "Oak", "MDF", "Metal", "Engineered Wood"]},
                    {"name": "Storage", "slug": "storage", "type": "CHOICE",
                     "options": ["With Storage", "Without Storage"]},
                    {"name": "Bed Type", "slug": "bed_type", "type": "CHOICE",
                     "options": ["Regular", "Hydraulic/Storage", "Sofa Cum Bed", "Foldable", "Box Storage"]},
                    {"name": "Headboard", "slug": "headboard", "type": "BOOLEAN"},
                    {"name": "Color / Finish", "slug": "color", "type": "TEXT", "variant_defining": True},
                    {"name": "Weight Capacity (kg)", "slug": "weight_capacity", "type": "NUMBER"},
                ],
            },
            "Wardrobes": {
                "slug": "wardrobes",
                "attributes": [
                    {"name": "Number of Doors", "slug": "doors", "type": "CHOICE", "required": True,
                     "options": ["2 Door", "3 Door", "4 Door", "5 Door", "6 Door"]},
                    {"name": "Material", "slug": "material", "type": "CHOICE", "required": True,
                     "options": ["Teak", "Sheesham", "Oak", "MDF", "Engineered Wood"]},
                    {"name": "Width (inches)", "slug": "width", "type": "NUMBER"},
                    {"name": "Depth (inches)", "slug": "depth", "type": "NUMBER"},
                    {"name": "With Mirror", "slug": "with_mirror", "type": "BOOLEAN"},
                    {"name": "Color / Finish", "slug": "color", "type": "TEXT", "variant_defining": True},
                ],
            },
            "Dining Sets": {
                "slug": "dining_sets",
                "attributes": [
                    {"name": "Seating Capacity", "slug": "seating", "type": "CHOICE", "required": True,
                     "options": ["4 Seater", "6 Seater", "8 Seater", "10 Seater", "12 Seater"]},
                    {"name": "Table Material", "slug": "table_material", "type": "CHOICE",
                     "options": ["Solid Wood", "Plywood", "Glass Top", "Marble Top", "MDF"]},
                    {"name": "Shape", "slug": "shape", "type": "CHOICE",
                     "options": ["Rectangular", "Round", "Oval", "Square"]},
                    {"name": "Chairs Included", "slug": "chairs_count", "type": "NUMBER"},
                    {"name": "Cushions Included", "slug": "cushions", "type": "BOOLEAN"},
                    {"name": "Color / Finish", "slug": "color", "type": "TEXT", "variant_defining": True},
                ],
            },
            "Sofas": {
                "slug": "sofas",
                "attributes": [
                    {"name": "Seating", "slug": "seating", "type": "CHOICE", "required": True,
                     "options": ["1 Seater", "2 Seater", "3 Seater", "L-Shape", "U-Shape", "Sectional"]},
                    {"name": "Material", "slug": "material", "type": "CHOICE",
                     "options": ["Fabric", "Leather", "Faux Leather", "Velvet", "Rexine"]},
                    {"name": "Frame Material", "slug": "frame", "type": "CHOICE",
                     "options": ["Solid Wood", "Steel", "Engineered Wood"]},
                    {"name": "Sofa Cum Bed", "slug": "sofa_cum_bed", "type": "BOOLEAN"},
                    {"name": "Color", "slug": "color", "type": "TEXT", "variant_defining": True},
                ],
            },
        },
    },
    "Electronics": {
        "slug": "electronics",
        "icon": "📺",
        "subcategories": {
            "Televisions": {
                "slug": "televisions",
                "attributes": [
                    {"name": "Screen Size (inches)", "slug": "screen_size", "type": "CHOICE", "required": True,
                     "options": ["24", "32", "40", "43", "50", "55", "65", "75", "85"]},
                    {"name": "Resolution", "slug": "resolution", "type": "CHOICE", "required": True,
                     "options": ["HD (720p)", "Full HD (1080p)", "4K Ultra HD", "8K"]},
                    {"name": "Display Type", "slug": "display_type", "type": "CHOICE",
                     "options": ["LED", "OLED", "QLED", "AMOLED", "IPS"]},
                    {"name": "Refresh Rate (Hz)", "slug": "refresh_rate", "type": "NUMBER"},
                    {"name": "Smart TV", "slug": "smart_tv", "type": "BOOLEAN"},
                    {"name": "OS", "slug": "os", "type": "CHOICE",
                     "options": ["Android TV", "Tizen", "WebOS", "Fire OS", "Google TV"]},
                    {"name": "Color", "slug": "color", "type": "TEXT", "variant_defining": True},
                    {"name": "Warranty (years)", "slug": "warranty", "type": "NUMBER"},
                ],
            },
            "Washing Machines": {
                "slug": "washing_machines",
                "attributes": [
                    {"name": "Capacity (kg)", "slug": "capacity_kg", "type": "CHOICE", "required": True,
                     "options": ["6", "6.5", "7", "7.5", "8", "8.5", "9", "9.5", "10", "11", "12"]},
                    {"name": "Type", "slug": "type", "type": "CHOICE", "required": True,
                     "options": ["Front Load", "Top Load", "Semi Automatic"]},
                    {"name": "Energy Star Rating", "slug": "star_rating", "type": "CHOICE",
                     "options": ["1 Star", "2 Star", "3 Star", "4 Star", "5 Star"]},
                    {"name": "Wash Programs", "slug": "wash_programs", "type": "NUMBER"},
                    {"name": "RPM (Spin Speed)", "slug": "rpm", "type": "NUMBER"},
                    {"name": "Inverter Motor", "slug": "inverter", "type": "BOOLEAN"},
                    {"name": "Color", "slug": "color", "type": "TEXT", "variant_defining": True},
                    {"name": "Warranty (years)", "slug": "warranty", "type": "NUMBER"},
                ],
            },
            "Refrigerators": {
                "slug": "refrigerators",
                "attributes": [
                    {"name": "Capacity (Liters)", "slug": "capacity_liters", "type": "CHOICE", "required": True,
                     "options": ["150", "200", "230", "250", "280", "300", "330", "350", "400", "450", "500", "550", "600", "650", "700"]},
                    {"name": "Type", "slug": "type", "type": "CHOICE", "required": True,
                     "options": ["Single Door", "Double Door (Top Freezer)", "Double Door (Bottom Freezer)",
                                 "French Door", "Side-by-Side", "Triple Door"]},
                    {"name": "Energy Star Rating", "slug": "star_rating", "type": "CHOICE",
                     "options": ["1 Star", "2 Star", "3 Star", "4 Star", "5 Star"]},
                    {"name": "Compressor", "slug": "compressor", "type": "CHOICE",
                     "options": ["Digital Inverter", "Fixed Speed", "Smart Inverter", "Linear Compressor"]},
                    {"name": "Frost Free", "slug": "frost_free", "type": "BOOLEAN"},
                    {"name": "Color", "slug": "color", "type": "TEXT", "variant_defining": True},
                    {"name": "Compressor Warranty (years)", "slug": "warranty", "type": "NUMBER"},
                ],
            },
            "Air Conditioners": {
                "slug": "air_conditioners",
                "attributes": [
                    {"name": "Capacity (Ton)", "slug": "capacity_ton", "type": "CHOICE", "required": True,
                     "options": ["0.75", "1", "1.2", "1.5", "2", "2.5", "3"]},
                    {"name": "Type", "slug": "type", "type": "CHOICE", "required": True,
                     "options": ["Window", "Split", "Cassette", "Ductable", "Portable"]},
                    {"name": "Energy Star Rating", "slug": "star_rating", "type": "CHOICE",
                     "options": ["2 Star", "3 Star", "4 Star", "5 Star"]},
                    {"name": "Inverter AC", "slug": "inverter", "type": "BOOLEAN"},
                    {"name": "Cooling Area (sqft)", "slug": "cooling_area", "type": "NUMBER"},
                    {"name": "ISEER Rating", "slug": "iseer", "type": "DECIMAL"},
                    {"name": "Color", "slug": "color", "type": "TEXT", "variant_defining": True},
                    {"name": "Warranty (years)", "slug": "warranty", "type": "NUMBER"},
                ],
            },
            "Microwave Ovens": {
                "slug": "microwave_ovens",
                "attributes": [
                    {"name": "Capacity (Liters)", "slug": "capacity", "type": "CHOICE", "required": True,
                     "options": ["17", "20", "21", "23", "25", "28", "30", "32"]},
                    {"name": "Type", "slug": "type", "type": "CHOICE", "required": True,
                     "options": ["Solo", "Grill", "Convection", "OTG"]},
                    {"name": "Power (Watts)", "slug": "power_watts", "type": "NUMBER"},
                    {"name": "Color", "slug": "color", "type": "TEXT", "variant_defining": True},
                    {"name": "Warranty (years)", "slug": "warranty", "type": "NUMBER"},
                ],
            },
        },
    },
    "Kitchen Appliances": {
        "slug": "kitchen_appliances",
        "icon": "🍳",
        "subcategories": {
            "Pressure Cookers": {
                "slug": "pressure_cookers",
                "attributes": [
                    {"name": "Capacity (Liters)", "slug": "capacity", "type": "CHOICE", "required": True,
                     "options": ["1.5", "2", "3", "4", "5", "6", "7", "8", "10"]},
                    {"name": "Material", "slug": "material", "type": "CHOICE", "required": True,
                     "options": ["Aluminum", "Stainless Steel", "Hard Anodized"]},
                    {"name": "Type", "slug": "type", "type": "CHOICE",
                     "options": ["Stovetop", "Electric Automatic", "Inner Lid", "Outer Lid"]},
                    {"name": "Induction Compatible", "slug": "induction", "type": "BOOLEAN"},
                ],
            },
            "Mixer Grinders": {
                "slug": "mixer_grinders",
                "attributes": [
                    {"name": "Power (Watts)", "slug": "power", "type": "CHOICE", "required": True,
                     "options": ["500W", "550W", "600W", "750W", "1000W"]},
                    {"name": "Jars", "slug": "jars", "type": "NUMBER"},
                    {"name": "Speed Settings", "slug": "speeds", "type": "NUMBER"},
                    {"name": "Color", "slug": "color", "type": "TEXT", "variant_defining": True},
                    {"name": "Warranty (years)", "slug": "warranty", "type": "NUMBER"},
                ],
            },
            "Water Purifiers": {
                "slug": "water_purifiers",
                "attributes": [
                    {"name": "Purification Technology", "slug": "technology", "type": "CHOICE", "required": True,
                     "options": ["RO", "UV", "RO+UV", "RO+UV+UF", "Gravity"]},
                    {"name": "Storage Capacity (Liters)", "slug": "storage", "type": "NUMBER"},
                    {"name": "Purification Rate (LPH)", "slug": "purification_rate", "type": "NUMBER"},
                    {"name": "Wall Mountable", "slug": "wall_mount", "type": "BOOLEAN"},
                    {"name": "Color", "slug": "color", "type": "TEXT", "variant_defining": True},
                    {"name": "Warranty (years)", "slug": "warranty", "type": "NUMBER"},
                ],
            },
        },
    },
    "Two Wheelers": {
        "slug": "two_wheelers",
        "icon": "🛵",
        "subcategories": {
            "Motorcycles": {
                "slug": "motorcycles",
                "attributes": [
                    {"name": "Engine Displacement (cc)", "slug": "engine_cc", "type": "CHOICE", "required": True,
                     "options": ["100cc", "110cc", "125cc", "150cc", "160cc", "200cc", "250cc", "300cc+"]},
                    {"name": "Fuel Type", "slug": "fuel", "type": "CHOICE", "required": True,
                     "options": ["Petrol", "Electric"]},
                    {"name": "Mileage (kmpl)", "slug": "mileage", "type": "DECIMAL"},
                    {"name": "ABS", "slug": "abs", "type": "BOOLEAN"},
                    {"name": "Color", "slug": "color", "type": "TEXT", "variant_defining": True},
                ],
            },
            "Scooters": {
                "slug": "scooters",
                "attributes": [
                    {"name": "Engine Displacement (cc)", "slug": "engine_cc", "type": "CHOICE",
                     "options": ["100cc", "110cc", "125cc", "150cc", "160cc"]},
                    {"name": "Fuel Type", "slug": "fuel", "type": "CHOICE", "required": True,
                     "options": ["Petrol", "Electric"]},
                    {"name": "Mileage / Range (km)", "slug": "mileage", "type": "DECIMAL"},
                    {"name": "Under-seat Storage (Liters)", "slug": "storage", "type": "NUMBER"},
                    {"name": "Color", "slug": "color", "type": "TEXT", "variant_defining": True},
                ],
            },
        },
    },
    "Mobile & Tablets": {
        "slug": "mobile_tablets",
        "icon": "📱",
        "subcategories": {
            "Smartphones": {
                "slug": "smartphones",
                "attributes": [
                    {"name": "Brand", "slug": "brand", "type": "TEXT", "required": True},
                    {"name": "RAM", "slug": "ram", "type": "CHOICE", "required": True,
                     "options": ["2GB", "3GB", "4GB", "6GB", "8GB", "12GB", "16GB"]},
                    {"name": "Storage", "slug": "storage", "type": "CHOICE", "required": True,
                     "options": ["16GB", "32GB", "64GB", "128GB", "256GB", "512GB", "1TB"],
                     "variant_defining": True},
                    {"name": "Battery (mAh)", "slug": "battery", "type": "NUMBER"},
                    {"name": "Display Size (inches)", "slug": "display", "type": "DECIMAL"},
                    {"name": "5G", "slug": "5g", "type": "BOOLEAN"},
                    {"name": "Color", "slug": "color", "type": "TEXT", "variant_defining": True},
                    {"name": "Warranty (years)", "slug": "warranty", "type": "NUMBER"},
                ],
            },
            "Tablets": {
                "slug": "tablets",
                "attributes": [
                    {"name": "RAM", "slug": "ram", "type": "CHOICE",
                     "options": ["2GB", "3GB", "4GB", "6GB", "8GB", "12GB"]},
                    {"name": "Storage", "slug": "storage", "type": "CHOICE",
                     "options": ["32GB", "64GB", "128GB", "256GB", "512GB"],
                     "variant_defining": True},
                    {"name": "Display Size (inches)", "slug": "display", "type": "DECIMAL"},
                    {"name": "SIM Support", "slug": "sim", "type": "BOOLEAN"},
                    {"name": "Color", "slug": "color", "type": "TEXT", "variant_defining": True},
                ],
            },
        },
    },
}

TYPE_MAP = {
    "TEXT": AttributeDataType.TEXT,
    "NUMBER": AttributeDataType.NUMBER,
    "DECIMAL": AttributeDataType.DECIMAL,
    "CHOICE": AttributeDataType.CHOICE,
    "MULTI_CHOICE": AttributeDataType.MULTI_CHOICE,
    "BOOLEAN": AttributeDataType.BOOLEAN,
    "DATE": AttributeDataType.DATE,
}


class Command(BaseCommand):
    help = "Seed PIM with pre-configured product categories and attribute templates"

    def add_arguments(self, parser):
        parser.add_argument("--clear", action="store_true", help="Clear existing data before seeding")

    def handle(self, *args, **options):
        if options["clear"]:
            self.stdout.write("Clearing existing PIM data...")
            ProductCategory.objects.all().delete()

        created_cats = 0
        created_subs = 0
        created_attrs = 0
        created_opts = 0

        for cat_name, cat_data in SEED_DATA.items():
            category, created = ProductCategory.objects.get_or_create(
                slug=cat_data["slug"],
                defaults={
                    "name": cat_name,
                    "icon": cat_data.get("icon", ""),
                    "display_order": created_cats,
                    "is_active": True,
                },
            )
            if created:
                created_cats += 1
                self.stdout.write(f"  Category: {cat_name}")

            for sub_name, sub_data in cat_data.get("subcategories", {}).items():
                subcat, sub_created = ProductSubcategory.objects.get_or_create(
                    category=category,
                    slug=sub_data["slug"],
                    defaults={"name": sub_name, "display_order": created_subs, "is_active": True},
                )
                if sub_created:
                    created_subs += 1

                for order, attr_def in enumerate(sub_data.get("attributes", [])):
                    attr, attr_created = CategoryAttribute.objects.get_or_create(
                        category=category,
                        subcategory=subcat,
                        slug=attr_def["slug"],
                        defaults={
                            "name": attr_def["name"],
                            "data_type": TYPE_MAP.get(attr_def.get("type", "TEXT"), AttributeDataType.TEXT),
                            "is_required": attr_def.get("required", False),
                            "is_variant_defining": attr_def.get("variant_defining", False),
                            "display_order": order,
                            "is_active": True,
                        },
                    )
                    if attr_created:
                        created_attrs += 1

                    for opt_order, opt_val in enumerate(attr_def.get("options", [])):
                        _, opt_created = AttributeOption.objects.get_or_create(
                            attribute=attr,
                            value=opt_val,
                            defaults={"display_name": opt_val, "display_order": opt_order},
                        )
                        if opt_created:
                            created_opts += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"\nDone! Created: {created_cats} categories, {created_subs} subcategories, "
                f"{created_attrs} attributes, {created_opts} options"
            )
        )
