from django.core.management.base import BaseCommand
from django.db.models import Q
from django.utils.text import slugify
from products_pim.models import ProductCategory, ProductSubcategory, PimProduct
from products_core.models import ProductCategoryMaster, ProductSubcategoryMaster, Product


CATEGORIES_TAXONOMY = [
    {
        "name": "Furniture",
        "slug": "furniture",
        "icon": "🛋️",
        "product_type": "FINISHED_GOOD",
        "item_type": "FINISHED_GOOD",
        "display_order": 10,
        "subcategories": [
            "Alna",
            "Bed",
            "Bedside Tool",
            "Cabinet",
            "Center Table",
            "Chair",
            "Dinning Table",
            "Dressing Table",
            "Easy Chair",
            "Mattress",
            "Office Table",
            "Showcase",
            "Sofa",
            "Sofa Cum Bed",
            "TV Unit",
            "Wardrobe",
        ],
    },
    {
        "name": "Home Appliances",
        "slug": "home-appliances",
        "icon": "📺",
        "product_type": "FINISHED_GOOD",
        "item_type": "FINISHED_GOOD",
        "display_order": 20,
        "subcategories": [
            "Televisions",
            "Washing Machines",
            "Air Conditioners",
            "Refrigerators",
            "Coolers",
        ],
    },
    {
        "name": "Kitchen Appliances",
        "slug": "kitchen-appliances",
        "icon": "🍳",
        "product_type": "FINISHED_GOOD",
        "item_type": "FINISHED_GOOD",
        "display_order": 30,
        "subcategories": [
            "Microwaves & Ovens",
            "Mixer Grinders & Blenders",
            "Water Purifiers",
            "Chimneys & Cooktops",
            "Dishwashers",
        ],
    },
    {
        "name": "Accessories & Hardware",
        "slug": "accessories-hardware",
        "icon": "🔩",
        "product_type": "ACCESSORY",
        "item_type": "ACCESSORY",
        "display_order": 40,
        "subcategories": [
            "Plywood & Boards",
            "Bed Hardware & Side Rails",
            "Legs, Caps & Buffers",
            "Fasteners, Nuts & Bolts",
            "Handles, Locks & Hinges",
            "Foam, Cushions & Fabric",
            "Mirrors & Glass Tops",
        ],
    },
    {
        "name": "Raw Materials & Lumber",
        "slug": "raw-materials-lumber",
        "icon": "🪵",
        "product_type": "RAW_MATERIAL",
        "item_type": "RAW_MATERIAL",
        "display_order": 50,
        "subcategories": [
            "Steel Pipes & Tubes",
            "Timber & Wood Planks",
            "Sheet Metal & Mesh",
            "Paints, Powder & Polish",
            "Adhesives & Chemicals",
        ],
    },
    {
        "name": "Services & Labor",
        "slug": "services-labor",
        "icon": "🛠️",
        "product_type": "SERVICE",
        "item_type": "SERVICE",
        "display_order": 60,
        "subcategories": [
            "Installation & Assembly",
            "Transport & Delivery",
            "Maintenance & Repair",
        ],
    },
    {
        "name": "Unclassified",
        "slug": "unclassified",
        "icon": "📦",
        "product_type": "ALL",
        "item_type": "FINISHED_GOOD",
        "display_order": 999,
        "subcategories": [],
    },
]


class Command(BaseCommand):
    help = "Seed distinct categories & subcategories for Finished Goods, Accessories, Raw Materials, and Services."

    def handle(self, *args, **options):
        self.stdout.write("Starting Category & Subcategory taxonomy seeding...")

        pim_subcat_map = {}
        core_subcat_map = {}

        for entry in CATEGORIES_TAXONOMY:
            cat_name = entry["name"]
            cat_slug = entry["slug"]
            cat_icon = entry["icon"]
            prod_type = entry["product_type"]
            item_type = entry["item_type"]
            order = entry["display_order"]
            subs = entry["subcategories"]

            # 1. PIM ProductCategory
            pim_cat, created = ProductCategory.objects.get_or_create(
                slug=cat_slug,
                defaults={
                    "name": cat_name,
                    "icon": cat_icon,
                    "product_type": prod_type,
                    "display_order": order,
                    "is_active": True,
                },
            )
            if not created:
                updates = []
                if pim_cat.name != cat_name and pim_cat.slug != "unclassified":
                    pim_cat.name = cat_name
                    updates.append("name")
                if pim_cat.product_type != prod_type:
                    pim_cat.product_type = prod_type
                    updates.append("product_type")
                if pim_cat.icon != cat_icon:
                    pim_cat.icon = cat_icon
                    updates.append("icon")
                if pim_cat.display_order != order:
                    pim_cat.display_order = order
                    updates.append("display_order")
                if updates:
                    pim_cat.save(update_fields=updates)

            # 2. Core ProductCategoryMaster
            core_cat, c_created = ProductCategoryMaster.objects.get_or_create(
                name=cat_name,
                defaults={
                    "slug": cat_slug,
                    "item_type": item_type,
                    "is_active": True,
                    "sort_order": order,
                },
            )
            if not c_created:
                c_updates = []
                if core_cat.item_type != item_type:
                    core_cat.item_type = item_type
                    c_updates.append("item_type")
                if core_cat.sort_order != order:
                    core_cat.sort_order = order
                    c_updates.append("sort_order")
                if c_updates:
                    core_cat.save(update_fields=c_updates)

            # 3. Subcategories
            for idx, sub_name in enumerate(subs, 1):
                sub_slug = slugify(sub_name) or f"sub-{idx}"

                # PIM Subcategory
                pim_sub, _ = ProductSubcategory.objects.get_or_create(
                    category=pim_cat,
                    name=sub_name,
                    defaults={
                        "slug": sub_slug,
                        "display_order": idx * 10,
                        "is_active": True,
                    },
                )
                pim_subcat_map[(cat_name, sub_name)] = pim_sub

                # Core SubcategoryMaster
                core_sub, _ = ProductSubcategoryMaster.objects.get_or_create(
                    category=core_cat,
                    name=sub_name,
                    defaults={
                        "is_active": True,
                    },
                )
                core_subcat_map[(cat_name, sub_name)] = core_sub

            self.stdout.write(f"✓ Category ready: {cat_name} ({prod_type}) with {len(subs)} subcategories.")

        # 4. Realign existing accessory products
        acc_cat = ProductCategory.objects.filter(slug="accessories-hardware").first()
        core_acc_cat = ProductCategoryMaster.objects.filter(name="Accessories & Hardware").first()

        ply_sub = ProductSubcategory.objects.filter(category=acc_cat, name="Plywood & Boards").first()
        core_ply_sub = ProductSubcategoryMaster.objects.filter(category=core_acc_cat, name="Plywood & Boards").first()

        rail_sub = ProductSubcategory.objects.filter(category=acc_cat, name="Bed Hardware & Side Rails").first()
        core_rail_sub = ProductSubcategoryMaster.objects.filter(category=core_acc_cat, name="Bed Hardware & Side Rails").first()

        # Update Commercial Plyboard items
        ply_pim = PimProduct.objects.filter(
            Q(name__icontains="Plyboard") | Q(name__icontains="Plywood") | Q(code__icontains="COMM-PLYB")
        )
        for p in ply_pim:
            p.category = acc_cat
            p.subcategory = ply_sub
            p.product_type = "ACCESSORY"
            p.save(update_fields=["category", "subcategory", "product_type"])
            self.stdout.write(f"  → Updated PIM accessory: {p.code} {p.name} -> Plywood & Boards")

        ply_core = Product.objects.filter(
            Q(name__icontains="Plyboard") | Q(name__icontains="Plywood") | Q(product_code__icontains="COMM-PLYB")
        )
        for p in ply_core:
            p.category = acc_cat.name
            p.subcategory = ply_sub.name if ply_sub else "Plywood & Boards"
            p.category_master = core_acc_cat
            p.subcategory_master = core_ply_sub
            p.item_type = "ACCESSORY"
            p.save(update_fields=["category", "subcategory", "category_master", "subcategory_master", "item_type"])
            self.stdout.write(f"  → Updated Core accessory: {p.product_code} {p.name} -> Plywood & Boards")

        # Update Side Rail items (both normal and hybrid)
        rail_pim = PimProduct.objects.filter(
            Q(name__icontains="Side Rail") | Q(code__icontains="SIDERAI")
        )
        for p in rail_pim:
            p.category = acc_cat
            p.subcategory = rail_sub
            p.product_type = "ACCESSORY"
            p.save(update_fields=["category", "subcategory", "product_type"])
            self.stdout.write(f"  → Updated PIM accessory: {p.code} {p.name} -> Bed Hardware & Side Rails")

        rail_core = Product.objects.filter(
            Q(name__icontains="Side Rail") | Q(product_code__icontains="SIDERAI")
        )
        for p in rail_core:
            p.category = acc_cat.name
            p.subcategory = rail_sub.name if rail_sub else "Bed Hardware & Side Rails"
            p.category_master = core_acc_cat
            p.subcategory_master = core_rail_sub
            p.item_type = "ACCESSORY"
            p.save(update_fields=["category", "subcategory", "category_master", "subcategory_master", "item_type"])
            self.stdout.write(f"  → Updated Core accessory: {p.product_code} {p.name} -> Bed Hardware & Side Rails")

        # Also reclassify any existing PIM products where product_type == "ACCESSORY" but category is not ACCESSORY
        mismatched_accs = PimProduct.objects.filter(product_type="ACCESSORY").exclude(category__product_type="ACCESSORY")
        for p in mismatched_accs:
            p.category = acc_cat
            # Infer subcategory from name
            p_name = p.name.lower()
            if any(w in p_name for w in ("plywood", "plyboard", "board")):
                p.subcategory = ply_sub
            elif any(w in p_name for w in ("rail", "side rail", "hardware")):
                p.subcategory = rail_sub
            p.save(update_fields=["category", "subcategory"])
            self.stdout.write(f"  → Reassigned {p.code} {p.name} to Accessories & Hardware ({getattr(p.subcategory, 'name', 'None')})")

        # Reclassify mismatched Raw Materials
        raw_cat = ProductCategory.objects.filter(slug="raw-materials-lumber").first()
        if raw_cat:
            mismatched_raw = PimProduct.objects.filter(product_type="RAW_MATERIAL").exclude(category__product_type="RAW_MATERIAL")
            for p in mismatched_raw:
                p.category = raw_cat
                p.save(update_fields=["category"])

        # Reclassify mismatched Services
        svc_cat = ProductCategory.objects.filter(slug="services-labor").first()
        if svc_cat:
            mismatched_svc = PimProduct.objects.filter(product_type="SERVICE").exclude(category__product_type="SERVICE")
            for p in mismatched_svc:
                p.category = svc_cat
                p.save(update_fields=["category"])

        # 5. Seed AccessoryVariantGroups and link InventoryItems
        from inventory.models import AccessoryVariantGroup, InventoryItem, InventoryItemType
        ply_group, _ = AccessoryVariantGroup.objects.get_or_create(
            code="AVG-PLYWOOD",
            defaults={
                "name": "Commercial Plyboards",
                "category": "Accessories & Hardware",
                "subcategory": "Plywood & Boards",
                "description": "Commercial plyboard sizing variants (78*36, 78*48, etc.)",
                "is_required": False,
                "is_active": True,
            },
        )
        rail_group, _ = AccessoryVariantGroup.objects.get_or_create(
            code="AVG-BED-SIDERAI",
            defaults={
                "name": "Bed Side Rails",
                "category": "Accessories & Hardware",
                "subcategory": "Bed Hardware & Side Rails",
                "description": "Bed side rail variants (Steel Normal, Hybrid, etc.)",
                "is_required": False,
                "is_active": True,
            },
        )

        # Wire inventory items into variant groups
        ply_invs = InventoryItem.objects.filter(
            Q(product__name__icontains="Plyboard") | Q(product__name__icontains="Plywood") | Q(sku__icontains="COMM-PLYB"),
            stock_item_type=InventoryItemType.ACCESSORY,
        )
        for it in ply_invs:
            if it.variant_group_id != ply_group.id:
                it.variant_group = ply_group
                it.save(update_fields=["variant_group"])
                self.stdout.write(f"  → Linked InventoryItem {it.sku} to {ply_group.name}")

        rail_invs = InventoryItem.objects.filter(
            Q(product__name__icontains="Side Rail") | Q(sku__icontains="SIDERAI"),
            stock_item_type=InventoryItemType.ACCESSORY,
        )
        for it in rail_invs:
            if it.variant_group_id != rail_group.id:
                it.variant_group = rail_group
                it.save(update_fields=["variant_group"])
                self.stdout.write(f"  → Linked InventoryItem {it.sku} to {rail_group.name}")

        self.stdout.write(self.style.SUCCESS("Successfully seeded categories, subcategories, variant groups, and realigned products!"))
