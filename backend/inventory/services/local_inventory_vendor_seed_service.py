from __future__ import annotations

from decimal import Decimal

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from accounting.models import (
    Vendor,
    VendorAddress,
    VendorCategory,
    VendorLedgerEntry,
    VendorProduct,
    VendorServiceArea,
)
from accounting.services.vendor_ledger_service import get_vendor_outstanding
from inventory.models import (
    InventoryItem,
    InventoryItemType,
    OpeningStockEntry,
    OpeningStockEntryStatus,
    StockLocation,
    StockLocationType,
)
from inventory.services.opening_stock_entry_service import (
    create_opening_stock_entry,
    ensure_opening_stock_batch,
    post_opening_stock_entry,
    update_opening_stock_entry_draft,
)
from products.services.catalog_master_service import ensure_inventory_profile_for_product
from subscriptions.models import (
    PlanType,
    Product,
    ProductCategoryMaster,
    ProductSubcategoryMaster,
    ProductUnitOfMeasureMaster,
)

MIN_ITEM_COUNT = 50
MAX_ITEM_COUNT = 100
DEFAULT_ITEM_COUNT = 72
MIN_VENDOR_COUNT = 5
MAX_VENDOR_COUNT = 10
DEFAULT_VENDOR_COUNT = 8

SEED_BATCH_KEY = "SANDBOX-INVENTORY-VENDOR-SEED"
PRODUCT_CODE_PREFIX = "DEMO-INV"
VENDOR_CODE_PREFIX = "DEMO-VND"

CATEGORY_SPECS: tuple[tuple[str, str, tuple[str, ...]], ...] = (
    ("BEDS", "Beds", ("Single Bed", "Double Bed", "Queen Bed", "King Bed", "Hydraulic Bed", "Storage Bed")),
    ("WARDROBES", "Wardrobes", ("2 Door Wardrobe", "3 Door Wardrobe", "Sliding Wardrobe", "Mirror Wardrobe", "Steel Wardrobe", "Kids Wardrobe")),
    ("SOFAS", "Sofas", ("1 Seater Sofa", "2 Seater Sofa", "3 Seater Sofa", "L Sofa", "Sofa Cum Bed", "Recliner Sofa")),
    ("TABLES", "Tables", ("Center Table", "Dining Table", "Study Table", "Office Table", "Dressing Table", "Side Table")),
    ("CHAIRS", "Chairs", ("Office Chair", "Visitor Chair", "Dining Chair", "Plastic Chair", "Executive Chair", "Rocking Chair")),
    ("MATTRESSES", "Mattresses", ("Foam Mattress", "Coir Mattress", "Spring Mattress", "Orthopedic Mattress", "Pillow Set", "Mattress Protector")),
    ("STORAGE", "Storage", ("Shoe Rack", "Book Shelf", "Cabinet", "TV Unit", "Chest Drawer", "Kitchen Rack")),
    ("KITCHEN", "Kitchen Appliances", ("Mixer Grinder", "Induction Cooktop", "Electric Kettle", "Microwave Oven", "OTG Oven", "Chimney")),
    ("APPLIANCES", "Home Appliances", ("Refrigerator", "Washing Machine", "Air Conditioner", "Geyser", "Water Purifier", "Cooler")),
    ("ELECTRONICS", "Electronics", ("LED TV", "Sound Bar", "Home Theatre", "Ceiling Fan", "Table Fan", "Stabilizer")),
    ("DECOR", "Decor", ("Mandir", "Wall Shelf", "Mirror", "Lamp", "Curtain Rod", "Decor Stand")),
    ("OFFICE", "Office Furniture", ("Computer Table", "File Cabinet", "Workstation", "Reception Desk", "Conference Table", "Ergonomic Chair")),
)

VENDOR_SPECS: tuple[dict[str, object], ...] = (
    {
        "code": "DEMO-VND-001",
        "name": "Bengal Woodcraft Suppliers",
        "phone": "9800001001",
        "email": "woodcraft@example.test",
        "category_codes": ("BEDS", "WARDROBES", "TABLES"),
        "opening": Decimal("42500.00"),
    },
    {
        "code": "DEMO-VND-002",
        "name": "Asansol Sofa Works",
        "phone": "9800001002",
        "email": "sofa@example.test",
        "category_codes": ("SOFAS", "CHAIRS"),
        "opening": Decimal("31800.00"),
    },
    {
        "code": "DEMO-VND-003",
        "name": "Eastern Mattress Agency",
        "phone": "9800001003",
        "email": "mattress@example.test",
        "category_codes": ("MATTRESSES",),
        "opening": Decimal("18750.00"),
    },
    {
        "code": "DEMO-VND-004",
        "name": "Railpar Steel Furniture",
        "phone": "9800001004",
        "email": "steel@example.test",
        "category_codes": ("WARDROBES", "STORAGE", "OFFICE"),
        "opening": Decimal("52200.00"),
    },
    {
        "code": "DEMO-VND-005",
        "name": "Kalyanpur Appliance Traders",
        "phone": "9800001005",
        "email": "appliance@example.test",
        "category_codes": ("APPLIANCES", "ELECTRONICS"),
        "opening": Decimal("76300.00"),
    },
    {
        "code": "DEMO-VND-006",
        "name": "Subhash Kitchen Gallery",
        "phone": "9800001006",
        "email": "kitchen@example.test",
        "category_codes": ("KITCHEN", "STORAGE"),
        "opening": Decimal("14400.00"),
    },
    {
        "code": "DEMO-VND-007",
        "name": "Modern Office Systems",
        "phone": "9800001007",
        "email": "office@example.test",
        "category_codes": ("OFFICE", "CHAIRS", "TABLES"),
        "opening": Decimal("29150.00"),
    },
    {
        "code": "DEMO-VND-008",
        "name": "Decor House Asansol",
        "phone": "9800001008",
        "email": "decor@example.test",
        "category_codes": ("DECOR", "STORAGE"),
        "opening": Decimal("9800.00"),
    },
    {
        "code": "DEMO-VND-009",
        "name": "Burdwan Electronics Wholesale",
        "phone": "9800001009",
        "email": "electronics@example.test",
        "category_codes": ("ELECTRONICS", "APPLIANCES"),
        "opening": Decimal("61500.00"),
    },
    {
        "code": "DEMO-VND-010",
        "name": "Raniganj Furniture Depot",
        "phone": "9800001010",
        "email": "depot@example.test",
        "category_codes": ("BEDS", "SOFAS", "WARDROBES", "TABLES"),
        "opening": Decimal("38250.00"),
    },
)


def _assert_local_only() -> None:
    env = (getattr(settings, "ENVIRONMENT_NAME", "") or "").strip().lower()
    if not (settings.DEBUG or env in {"development", "test", "local"}):
        raise ValueError("Inventory/vendor sandbox seed is disabled outside local/test environments.")


def _validate_count(value: int, *, minimum: int, maximum: int, label: str) -> int:
    resolved = int(value)
    if resolved < minimum or resolved > maximum:
        raise ValueError(f"{label} must be between {minimum} and {maximum}.")
    return resolved


def _money(value) -> Decimal:
    return Decimal(str(value or "0.00")).quantize(Decimal("0.01"))


def _quantity(value) -> Decimal:
    return Decimal(str(value or "0")).quantize(Decimal("0.001"))


def _ensure_stock_location() -> StockLocation:
    location, _ = StockLocation.objects.update_or_create(
        code="DEMO-SHOWROOM",
        defaults={
            "name": "Demo Showroom Opening Stock",
            "location_type": StockLocationType.SHOWROOM,
            "is_active": True,
            "notes": "Local/test inventory vendor sandbox seed location.",
        },
    )
    return location


def _ensure_category_masters() -> dict[str, dict[str, object]]:
    category_map: dict[str, dict[str, object]] = {}
    for category_code, category_name, subcategories in CATEGORY_SPECS:
        category, _ = ProductCategoryMaster.objects.get_or_create(
            name=category_name,
            defaults={
                "description": f"Sandbox category for {category_name}.",
                "is_active": True,
            },
        )
        subcategory_objects = []
        for subcategory_name in subcategories:
            subcategory, _ = ProductSubcategoryMaster.objects.get_or_create(
                category=category,
                name=subcategory_name,
                defaults={
                    "description": f"Sandbox subcategory for {subcategory_name}.",
                    "is_active": True,
                },
            )
            subcategory_objects.append(subcategory)
        category_map[category_code] = {
            "category": category,
            "subcategories": subcategory_objects,
        }
    return category_map


def _ensure_uom() -> ProductUnitOfMeasureMaster:
    uom, _ = ProductUnitOfMeasureMaster.objects.get_or_create(
        code="PCS",
        defaults={
            "name": "Pieces",
            "description": "Default stock unit for sandbox inventory seed.",
            "is_active": True,
        },
    )
    return uom


def _build_item_plan(item_count: int) -> list[tuple[str, ProductCategoryMaster, ProductSubcategoryMaster]]:
    category_map = _ensure_category_masters()
    plan: list[tuple[str, ProductCategoryMaster, ProductSubcategoryMaster]] = []
    category_codes = [spec[0] for spec in CATEGORY_SPECS]

    index = 0
    while len(plan) < item_count:
        category_code = category_codes[index % len(category_codes)]
        category_payload = category_map[category_code]
        subcategories = category_payload["subcategories"]
        subcategory = subcategories[(index // len(category_codes)) % len(subcategories)]
        plan.append(
            (
                f"{subcategory.name} Demo {len(plan) + 1:03d}",
                category_payload["category"],
                subcategory,
            )
        )
        index += 1

    return plan


def _upsert_product_and_inventory_item(
    *,
    row_number: int,
    name: str,
    category: ProductCategoryMaster,
    subcategory: ProductSubcategoryMaster,
    uom: ProductUnitOfMeasureMaster,
    stock_location: StockLocation,
) -> tuple[InventoryItem, bool, bool]:
    product_code = f"{PRODUCT_CODE_PREFIX}-{row_number:03d}"
    sku = f"{PRODUCT_CODE_PREFIX}-SKU-{row_number:03d}"
    unit_cost = _money(Decimal("850.00") + (Decimal(row_number % 17) * Decimal("175.00")))
    base_price = _money(unit_cost * Decimal("1.65"))

    product_defaults = {
        "name": name,
        "base_price": base_price,
        "category_master": category,
        "subcategory_master": subcategory,
        "category": category.name,
        "subcategory": subcategory.name,
        "sku": sku,
        "unit_of_measure_master": uom,
        "unit_of_measure": uom.code,
        "description": "Local/test demo catalog item with inventory opening stock.",
        "hsn_sac_code": "9403",
        "gst_rate": Decimal("18.00"),
        "is_active": True,
        "plan_type_default": PlanType.EMI,
        "is_emi_enabled": True,
        "is_rent_enabled": row_number % 4 == 0,
        "is_lease_enabled": row_number % 6 == 0,
        "is_direct_sale_enabled": True,
        "lifecycle_status": "ACTIVE",
    }

    product, product_created = Product.objects.update_or_create(
        product_code=product_code,
        defaults=product_defaults,
    )

    inventory_item, inventory_created = ensure_inventory_profile_for_product(
        product,
        default_stock_location=stock_location,
        stock_tracking_enabled=True,
    )

    inventory_item.inventory_code = f"INV-{product_code}"
    inventory_item.sku = sku
    inventory_item.unit_of_measure = uom.code
    inventory_item.default_stock_location = stock_location
    inventory_item.preferred_stock_location = stock_location
    inventory_item.stock_tracking_enabled = True
    inventory_item.stock_item_type = InventoryItemType.FINISHED_GOOD
    inventory_item.delivery_stock_bridge_enabled = True
    inventory_item.opening_stock_qty = Decimal("0.000")
    inventory_item.reorder_level_qty = _quantity(Decimal("2") + Decimal(row_number % 4))
    inventory_item.standard_unit_cost = unit_cost
    inventory_item.purchase_unit_cost = unit_cost
    inventory_item.stock_tracking_status = InventoryItem.StockTrackingStatus.PREPARED_NO_STOCK
    inventory_item.is_active = True
    inventory_item.save()

    return inventory_item, product_created, inventory_created


def _ensure_opening_stock(
    *,
    row_number: int,
    inventory_item: InventoryItem,
    stock_location: StockLocation,
    batch,
    performed_by,
) -> bool:
    entry = OpeningStockEntry.objects.filter(batch=batch, csv_row_number=row_number).first()
    quantity = _quantity(Decimal("3") + Decimal(row_number % 10))
    unit_cost = _money(inventory_item.standard_unit_cost)

    if entry is None:
        entry = create_opening_stock_entry(
            inventory_item_id=inventory_item.id,
            stock_location_id=stock_location.id,
            quantity=quantity,
            effective_date=timezone.localdate(),
            unit_cost_snapshot=unit_cost,
            note=f"Sandbox opening stock row {row_number}",
            created_by=performed_by,
            batch=batch,
            csv_row_number=row_number,
        )
    elif entry.status == OpeningStockEntryStatus.DRAFT:
        entry = update_opening_stock_entry_draft(
            entry_id=entry.id,
            performed_by=performed_by,
            inventory_item_id=inventory_item.id,
            stock_location_id=stock_location.id,
            quantity=quantity,
            effective_date=timezone.localdate(),
            unit_cost_snapshot=unit_cost,
            note=f"Sandbox opening stock row {row_number}",
        )

    if entry.status == OpeningStockEntryStatus.POSTED:
        if inventory_item.stock_tracking_status != InventoryItem.StockTrackingStatus.STOCK_ACTIVE:
            inventory_item.stock_tracking_status = InventoryItem.StockTrackingStatus.STOCK_ACTIVE
            inventory_item.save(update_fields=["stock_tracking_status", "updated_at"])
        return False

    _, posted = post_opening_stock_entry(entry_id=entry.id, posted_by=performed_by)
    if posted:
        inventory_item.stock_tracking_status = InventoryItem.StockTrackingStatus.STOCK_ACTIVE
        inventory_item.save(update_fields=["stock_tracking_status", "updated_at"])
    return posted


def _ensure_vendor_categories() -> dict[str, VendorCategory]:
    result: dict[str, VendorCategory] = {}
    for category_code, category_name, _ in CATEGORY_SPECS:
        code = f"V-{category_code}"
        vendor_category = (
            VendorCategory.objects.filter(code=code).first()
            or VendorCategory.objects.filter(name__iexact=category_name).first()
        )
        if vendor_category is None:
            vendor_category = VendorCategory.objects.create(
                code=code,
                name=category_name,
                description=f"Sandbox vendor category for {category_name}.",
                is_active=True,
            )
        else:
            updates = []
            if vendor_category.code != code:
                vendor_category.code = code
                updates.append("code")
            if vendor_category.description != f"Sandbox vendor category for {category_name}.":
                vendor_category.description = f"Sandbox vendor category for {category_name}."
                updates.append("description")
            if not vendor_category.is_active:
                vendor_category.is_active = True
                updates.append("is_active")
            if updates:
                vendor_category.save(update_fields=[*updates, "updated_at"])
        result[category_code] = vendor_category
    return result


def _upsert_vendor(spec: dict[str, object], *, vendor_categories: dict[str, VendorCategory]) -> tuple[Vendor, bool]:
    vendor = Vendor.objects.filter(vendor_code=spec["code"]).first()
    created = vendor is None
    defaults = {
        "name": spec["name"],
        "display_name": spec["name"],
        "legal_name": spec["name"],
        "phone": spec["phone"],
        "whatsapp": spec["phone"],
        "email": spec["email"],
        "address": "Asansol, Paschim Bardhaman, West Bengal",
        "state_code": "19",
        "state_name": "West Bengal",
        "contact_person": "Demo Contact",
        "payment_terms": "Opening balance payable; 30 days credit.",
        "credit_period_days": 30,
        "quality_score": Decimal("4.20"),
        "delivery_score": Decimal("4.00"),
        "warranty_score": Decimal("3.80"),
        "price_score": Decimal("4.10"),
        "rating": Decimal("4.00"),
        "status": "ACTIVE",
        "is_active": True,
        "notes": "Local/test vendor created by inventory vendor sandbox seed.",
    }
    if created:
        vendor = Vendor.objects.create(vendor_code=spec["code"], **defaults)
    else:
        for field, value in defaults.items():
            setattr(vendor, field, value)
        vendor.save()

    selected_categories = [
        vendor_categories[code]
        for code in spec["category_codes"]
        if code in vendor_categories
    ]
    if selected_categories:
        vendor.categories.set(selected_categories)

    VendorAddress.objects.update_or_create(
        vendor=vendor,
        address_type="OFFICE",
        is_primary=True,
        defaults={
            "address_line1": "Demo Vendor Office",
            "address_line2": "Sandbox Seed Data",
            "city": "Asansol",
            "district": "Paschim Bardhaman",
            "state": "West Bengal",
            "pincode": "713301",
        },
    )
    VendorServiceArea.objects.update_or_create(
        vendor=vendor,
        state="West Bengal",
        district="Paschim Bardhaman",
        city="Asansol",
        pincode="713301",
        defaults={
            "radius_km": Decimal("25.00"),
            "is_active": True,
        },
    )
    return vendor, created


def _ensure_vendor_opening_balance(*, vendor: Vendor, amount: Decimal, performed_by) -> bool:
    source_reference = f"{SEED_BATCH_KEY}:{vendor.vendor_code}"
    existing = VendorLedgerEntry.objects.filter(
        vendor=vendor,
        entry_type="OPENING_BALANCE",
        source_type="SANDBOX_SEED",
        source_reference=source_reference,
    ).first()
    if existing is not None:
        return False

    previous = (
        VendorLedgerEntry.objects.filter(vendor=vendor)
        .order_by("-posted_at", "-id")
        .values_list("balance_after", flat=True)
        .first()
        or Decimal("0.00")
    )
    opening_amount = _money(amount)
    VendorLedgerEntry.objects.create(
        vendor=vendor,
        entry_type="OPENING_BALANCE",
        source_type="SANDBOX_SEED",
        source_reference=source_reference,
        debit=opening_amount,
        credit=Decimal("0.00"),
        balance_after=_money(previous + opening_amount),
        created_by=performed_by,
        notes="Opening vendor payable created by local/test sandbox seed.",
    )
    return True


def _ensure_vendor_products(*, vendor: Vendor, products: list[Product]) -> int:
    created_count = 0
    if not products:
        return created_count

    product_window = products[: min(12, len(products))]
    for index, product in enumerate(product_window, start=1):
        vendor_sku = f"{vendor.vendor_code}-SKU-{index:03d}"
        existing = VendorProduct.objects.filter(vendor=vendor, vendor_sku=vendor_sku).first()
        defaults = {
            "internal_product": product,
            "product_name": product.name,
            "category_text": product.category,
            "material": "Mixed furniture/appliance demo material",
            "size_description": "Standard demo size",
            "warranty_months": 12,
            "base_quote_price": _money(product.base_price * Decimal("0.72")),
            "min_order_qty": Decimal("1.000"),
            "lead_time_days": 7 + (index % 6),
            "active": True,
            "notes": "Local/test vendor catalog mapping.",
        }
        if existing is None:
            VendorProduct.objects.create(vendor=vendor, vendor_sku=vendor_sku, **defaults)
            created_count += 1
        else:
            for field, value in defaults.items():
                setattr(existing, field, value)
            existing.save()
    return created_count


@transaction.atomic
def seed_inventory_vendor_sandbox(
    *,
    performed_by,
    item_count: int = DEFAULT_ITEM_COUNT,
    vendor_count: int = DEFAULT_VENDOR_COUNT,
) -> dict:
    """Seed local/test inventory and vendor demo data.

    The seed is idempotent:
    - products and inventory profiles are upserted by stable DEMO codes;
    - opening stock rows are keyed by one OpeningStockBatch + csv_row_number;
    - vendor opening outstanding entries are keyed by source reference.
    """

    _assert_local_only()
    item_count = _validate_count(item_count, minimum=MIN_ITEM_COUNT, maximum=MAX_ITEM_COUNT, label="item_count")
    vendor_count = _validate_count(vendor_count, minimum=MIN_VENDOR_COUNT, maximum=MAX_VENDOR_COUNT, label="vendor_count")

    stock_location = _ensure_stock_location()
    uom = _ensure_uom()
    item_plan = _build_item_plan(item_count)
    batch = ensure_opening_stock_batch(
        batch_key=SEED_BATCH_KEY,
        original_filename="local_inventory_vendor_sandbox_seed",
        created_by=performed_by,
    )

    product_created_count = 0
    inventory_created_count = 0
    opening_posted_count = 0
    inventory_items: list[InventoryItem] = []

    for row_number, (name, category, subcategory) in enumerate(item_plan, start=1):
        inventory_item, product_created, inventory_created = _upsert_product_and_inventory_item(
            row_number=row_number,
            name=name,
            category=category,
            subcategory=subcategory,
            uom=uom,
            stock_location=stock_location,
        )
        inventory_items.append(inventory_item)
        product_created_count += int(product_created)
        inventory_created_count += int(inventory_created)
        opening_posted_count += int(
            _ensure_opening_stock(
                row_number=row_number,
                inventory_item=inventory_item,
                stock_location=stock_location,
                batch=batch,
                performed_by=performed_by,
            )
        )

    products = list(Product.objects.filter(product_code__startswith=f"{PRODUCT_CODE_PREFIX}-").order_by("product_code"))
    vendor_categories = _ensure_vendor_categories()

    vendor_created_count = 0
    opening_outstanding_created_count = 0
    vendor_product_created_count = 0
    seeded_vendor_ids: list[int] = []

    for spec in VENDOR_SPECS[:vendor_count]:
        vendor, created = _upsert_vendor(spec, vendor_categories=vendor_categories)
        seeded_vendor_ids.append(vendor.id)
        vendor_created_count += int(created)
        opening_outstanding_created_count += int(
            _ensure_vendor_opening_balance(
                vendor=vendor,
                amount=spec["opening"],
                performed_by=performed_by,
            )
        )
        vendor_product_created_count += _ensure_vendor_products(vendor=vendor, products=products)

    vendor_outstanding_total = Decimal("0.00")
    for vendor in Vendor.objects.filter(id__in=seeded_vendor_ids):
        vendor_outstanding_total += _money(get_vendor_outstanding(vendor)["outstanding"])

    return {
        "seeded": True,
        "batch_key": SEED_BATCH_KEY,
        "stock_location_code": stock_location.code,
        "item_count": item_count,
        "vendor_count": vendor_count,
        "products_total": Product.objects.filter(product_code__startswith=f"{PRODUCT_CODE_PREFIX}-").count(),
        "products_created": product_created_count,
        "inventory_items_total": InventoryItem.objects.filter(product__product_code__startswith=f"{PRODUCT_CODE_PREFIX}-").count(),
        "inventory_items_created": inventory_created_count,
        "opening_stock_entries_total": OpeningStockEntry.objects.filter(batch=batch).count(),
        "opening_stock_entries_posted_now": opening_posted_count,
        "vendors_total": Vendor.objects.filter(vendor_code__startswith=f"{VENDOR_CODE_PREFIX}-").count(),
        "vendors_created": vendor_created_count,
        "vendor_opening_outstanding_created": opening_outstanding_created_count,
        "vendor_products_created": vendor_product_created_count,
        "vendor_outstanding_total": str(_money(vendor_outstanding_total)),
    }
