from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from django.db.models import Q
from django.utils import timezone

from accounting.models import (
    FinanceAccountCoaMapping,
    FinanceAccountMappingPurpose,
    ProductTaxProfile,
)
from billing.models import DirectSale, DirectSaleStatus
from inventory.models import (
    InventoryItem,
    OpeningStockEntry,
    OpeningStockEntryStatus,
    PurchaseBill,
    PurchaseBillStatus,
    PurchaseNeed,
    PurchaseNeedStatus,
    StockLedger,
    StockLocation,
    StockLocationType,
    StockMovementType,
)
from subscriptions.models import (
    ContractReturnConditionStatus,
    DeliveryStatus,
    FulfillmentStatus,
    LeaseSubscriptionProfile,
    PlanType,
    Product,
    RentSubscriptionProfile,
    Subscription,
    SubscriptionDelivery,
    SubscriptionStatus,
)


QUANTITY_ZERO = Decimal("0.000")
READY = "READY"
WARNING = "WARNING"
BLOCKED = "BLOCKED"


@dataclass(frozen=True)
class Check:
    key: str
    label: str
    status: str
    detail: str
    count: int | None
    action_label: str
    action_href: str


def _issue(
    issues: list[dict[str, Any]],
    *,
    severity: str,
    section: str,
    title: str,
    detail: str,
    object_type: str = "",
    object_id: str = "",
    action_label: str,
    action_href: str,
) -> None:
    issues.append(
        {
            "severity": severity,
            "section": section,
            "title": title,
            "detail": detail,
            "object_type": object_type,
            "object_id": object_id,
            "action_label": action_label,
            "action_href": action_href,
        }
    )


def _check(
    checks: list[Check],
    *,
    key: str,
    label: str,
    status: str,
    detail: str,
    count: int | None,
    action_label: str,
    action_href: str,
) -> None:
    checks.append(
        Check(
            key=key,
            label=label,
            status=status,
            detail=detail,
            count=count,
            action_label=action_label,
            action_href=action_href,
        )
    )


def _section(key: str, label: str, checks: list[Check]) -> dict[str, Any]:
    blockers = sum(1 for row in checks if row.status == BLOCKED)
    warnings = sum(1 for row in checks if row.status == WARNING)
    status = BLOCKED if blockers else WARNING if warnings else READY
    return {
        "key": key,
        "label": label,
        "status": status,
        "blockers": blockers,
        "warnings": warnings,
        "checks": [row.__dict__ for row in checks],
    }


def _open_stock_need_queryset():
    return PurchaseNeed.objects.filter(
        status__in=[
            PurchaseNeedStatus.OPEN,
            PurchaseNeedStatus.IN_REVIEW,
            PurchaseNeedStatus.ORDERED,
            PurchaseNeedStatus.PARTIALLY_FULFILLED,
        ]
    )


def _blank_reference_queryset():
    return StockLedger.objects.filter(Q(reference_model__isnull=True) | Q(reference_model="") | Q(reference_id__isnull=True) | Q(reference_id=""))


def _stock_ledger_reference_ids(*, reference_model: str, movement_types: list[str]) -> set[int]:
    ids: set[int] = set()
    refs = StockLedger.objects.filter(
        reference_model=reference_model,
        movement_type__in=movement_types,
    ).values_list("reference_id", flat=True)
    for raw in refs.iterator(chunk_size=500):
        value = (raw or "").strip()
        if value.isdigit():
            ids.add(int(value))
    return ids


def get_inventory_readiness_snapshot() -> dict[str, Any]:
    """
    Read-only operational readiness for inventory-backed selling/delivery flows.
    This function must only read persisted state. It never posts stock, accounting,
    delivery, reconciliation, or financial workflow mutations.
    """
    issues: list[dict[str, Any]] = []
    sections: list[dict[str, Any]] = []
    warnings: list[dict[str, str]] = []
    recommended_actions: list[str] = []

    try:
        product_count = Product.objects.count()
        active_product_count = Product.objects.filter(is_active=True).count()
    except Exception:
        return {
            "module_not_configured": True,
            "overall_status": BLOCKED,
            "summary": {"blockers": 1, "warnings": 0, "ready_checks": 0, "total_checks": 1},
            "last_checked_at": timezone.now().isoformat(),
            "sections": [],
            "issues": [
                {
                    "severity": "BLOCKER",
                    "section": "product_master",
                    "title": "Product master unavailable",
                    "detail": "Product master is not available in this deployment.",
                    "object_type": "",
                    "object_id": "",
                    "action_label": "Open setup",
                    "action_href": "/admin/settings/business-setup",
                }
            ],
            "operator_shortcuts": [],
            "inventory_ready": False,
            "global_inventory_ready": False,
            "product_count": 0,
            "active_product_count": 0,
            "stock_item_count": 0,
            "active_tracked_stock_items": 0,
            "stock_needs_open": 0,
            "open_operational_stock_needs": 0,
            "stock_movements_count": 0,
            "opening_stock_posted_count": 0,
            "opening_stock_draft_count": 0,
            "opening_stock_ready": False,
            "warnings": [{"code": "MODULE_NOT_AVAILABLE", "message": "Product master is not available in this deployment."}],
            "recommended_actions": ["Verify subscriptions app migrations and database connectivity."],
        }

    active_products = Product.objects.filter(is_active=True)
    stock_item_count = InventoryItem.objects.count()
    active_stock_items = InventoryItem.objects.filter(is_active=True, stock_tracking_enabled=True)
    active_tracked_stock_items = active_stock_items.count()
    stock_movements_count = StockLedger.objects.count()
    opening_stock_posted_count = OpeningStockEntry.objects.filter(status=OpeningStockEntryStatus.POSTED).count()
    opening_stock_draft_count = OpeningStockEntry.objects.filter(status=OpeningStockEntryStatus.DRAFT).count()
    opening_stock_ready = opening_stock_posted_count > 0 or stock_movements_count > 0
    stock_needs_open = _open_stock_need_queryset().count()

    checks: list[Check] = []
    _check(
        checks,
        key="products_exist",
        label="Total products exist",
        status=READY if product_count > 0 else BLOCKED,
        detail=f"{product_count} product row(s) exist in product master.",
        count=product_count,
        action_label="Open products",
        action_href="/admin/products",
    )
    if product_count == 0:
        _issue(issues, severity="BLOCKER", section="product_master", title="No products configured", detail="Inventory readiness cannot be established until product master contains products.", action_label="Open products", action_href="/admin/products")

    _check(
        checks,
        key="active_products_exist",
        label="Active products exist",
        status=READY if active_product_count > 0 else BLOCKED,
        detail=f"{active_product_count} active product row(s) are available for operations.",
        count=active_product_count,
        action_label="Open products",
        action_href="/admin/products",
    )
    if active_product_count == 0:
        _issue(issues, severity="BLOCKER", section="product_master", title="No active products", detail="At least one active product is required for sale, subscription, or delivery workflows.", action_label="Open products", action_href="/admin/products")

    missing_sku = active_products.filter(Q(sku__isnull=True) | Q(sku="")).count()
    _check(checks, key="active_products_missing_sku", label="Active products missing SKU", status=WARNING if missing_sku else READY, detail=f"{missing_sku} active product row(s) have no SKU.", count=missing_sku, action_label="Open products", action_href="/admin/products")
    if missing_sku:
        _issue(issues, severity="WARNING", section="product_master", title="Active products missing SKU", detail="Missing SKUs weaken inventory and procurement traceability.", action_label="Open products", action_href="/admin/products")

    invalid_price = active_products.filter(Q(base_price__isnull=True) | Q(base_price__lte=0)).count()
    _check(checks, key="missing_invalid_base_price", label="Missing or invalid base price", status=BLOCKED if invalid_price else READY, detail=f"{invalid_price} active product row(s) have missing or non-positive base price.", count=invalid_price, action_label="Open products", action_href="/admin/products")
    if invalid_price:
        _issue(issues, severity="BLOCKER", section="product_master", title="Invalid product base price", detail="Base price is the total contract price and must remain positive.", action_label="Open products", action_href="/admin/products")

    no_mode = active_products.filter(is_emi_enabled=False, is_rent_enabled=False, is_lease_enabled=False, is_direct_sale_enabled=False).count()
    _check(checks, key="active_products_no_workflow_mode", label="Active products with no enabled workflow mode", status=BLOCKED if no_mode else READY, detail=f"{no_mode} active product row(s) have EMI, direct sale, rent, and lease all disabled.", count=no_mode, action_label="Open products", action_href="/admin/products")

    rent_lease_not_ready = active_products.filter(Q(is_rent_enabled=True, is_rent_ready=False) | Q(is_lease_enabled=True, is_lease_ready=False)).count()
    _check(checks, key="rent_lease_enabled_not_ready", label="Rent/lease enabled but not ready", status=WARNING if rent_lease_not_ready else READY, detail=f"{rent_lease_not_ready} active product row(s) have rent/lease enabled without readiness flags.", count=rent_lease_not_ready, action_label="Open products", action_href="/admin/products")

    active_subscription_statuses = [SubscriptionStatus.ACTIVE, SubscriptionStatus.WON, SubscriptionStatus.PAYMENT_PENDING, SubscriptionStatus.DELIVERY_PENDING, SubscriptionStatus.HANDED_OVER, SubscriptionStatus.RETURN_PENDING]
    inactive_sub_products = Product.objects.filter(is_active=False, subscriptions__status__in=active_subscription_statuses).distinct().count()
    active_direct_sale_statuses = [DirectSaleStatus.DRAFT, DirectSaleStatus.CONFIRMED, DirectSaleStatus.INVOICED, DirectSaleStatus.DELIVERED]
    inactive_sale_products = Product.objects.filter(is_active=False, direct_sale_lines__direct_sale__status__in=active_direct_sale_statuses).distinct().count()
    inactive_referenced = inactive_sub_products + inactive_sale_products
    _check(checks, key="inactive_products_referenced_by_active_rows", label="Inactive products referenced by active operations", status=WARNING if inactive_referenced else READY, detail=f"{inactive_referenced} inactive product reference group(s) are tied to active subscriptions or direct sales.", count=inactive_referenced, action_label="Open products", action_href="/admin/products")

    tax_profile_products = ProductTaxProfile.objects.filter(product_id__in=active_products.values("id"), is_active=True).exclude(hsn_code="").values("product_id").distinct()
    missing_tax_profile = active_products.exclude(id__in=tax_profile_products).count()
    _check(checks, key="active_products_missing_tax_profile_hsn", label="Active products missing active tax profile / HSN", status=WARNING if missing_tax_profile else READY, detail=f"{missing_tax_profile} active product row(s) are missing an active ProductTaxProfile with HSN.", count=missing_tax_profile, action_label="Open accounting setup", action_href="/admin/accounting/setup")
    sections.append(_section("product_master", "Product master", checks))

    checks = []
    active_locations = StockLocation.objects.filter(is_active=True).count()
    saleable_locations = StockLocation.objects.filter(is_active=True, location_type__in=[StockLocationType.STORE, StockLocationType.WAREHOUSE, StockLocationType.SHOWROOM]).count()
    missing_default_location = active_stock_items.filter(default_stock_location__isnull=True, preferred_stock_location__isnull=True).count()
    null_location_ledger = StockLedger.objects.filter(stock_location__isnull=True).count()
    inactive_location_ledger = StockLedger.objects.filter(stock_location__is_active=False).count()
    _check(checks, key="active_stock_location_exists", label="Active stock location exists", status=READY if active_locations else BLOCKED, detail=f"{active_locations} active stock location(s) exist.", count=active_locations, action_label="Open locations", action_href="/admin/inventory/locations")
    _check(checks, key="saleable_stock_location_exists", label="Saleable location exists", status=READY if saleable_locations else BLOCKED, detail=f"{saleable_locations} active location(s) use current saleable location types.", count=saleable_locations, action_label="Open locations", action_href="/admin/inventory/locations")
    _check(checks, key="tracked_items_missing_location", label="Tracked items missing default/preferred location", status=WARNING if missing_default_location else READY, detail=f"{missing_default_location} active tracked inventory item(s) have no default or preferred location.", count=missing_default_location, action_label="Open inventory profiles", action_href="/admin/inventory/profiles")
    _check(checks, key="ledger_null_location", label="Ledger rows with no location", status=WARNING if null_location_ledger else READY, detail=f"{null_location_ledger} stock ledger row(s) have null location. The model allows this, but it weakens location reconciliation.", count=null_location_ledger, action_label="Open stock ledger", action_href="/admin/inventory/ledger")
    _check(checks, key="ledger_inactive_location", label="Ledger rows pointing to inactive locations", status=WARNING if inactive_location_ledger else READY, detail=f"{inactive_location_ledger} stock ledger row(s) point to inactive locations.", count=inactive_location_ledger, action_label="Open stock ledger", action_href="/admin/inventory/ledger")
    if active_locations == 0:
        _issue(issues, severity="BLOCKER", section="stock_locations", title="No active stock location", detail="Inventory movement and delivery readiness require an active stock location.", action_label="Open locations", action_href="/admin/inventory/locations")
    if inactive_location_ledger:
        _issue(issues, severity="WARNING", section="stock_locations", title="Ledger uses inactive locations", detail="Historical ledger rows point to inactive locations; review before relying on location-level reconciliation.", action_label="Open stock ledger", action_href="/admin/inventory/ledger")
    sections.append(_section("stock_locations", "Stock locations", checks))

    checks = []
    negative_physical = 0
    over_reserved = 0
    products_without_stock: list[dict[str, Any]] = []
    low_stock_items: list[dict[str, Any]] = []
    for item in active_stock_items.select_related("product").iterator(chunk_size=500):
        physical = item.current_stock_quantity()
        reserved = item.reserved_qty()
        available = item.available_qty()
        if physical < QUANTITY_ZERO:
            negative_physical += 1
        if reserved > physical:
            over_reserved += 1
        if available <= QUANTITY_ZERO:
            products_without_stock.append({"product_id": item.product_id, "inventory_item_id": item.id})
        threshold = item.reorder_level_qty or QUANTITY_ZERO
        if threshold > QUANTITY_ZERO and available <= threshold:
            low_stock_items.append({"product_id": item.product_id, "available": f"{available:.3f}", "reorder_level": f"{threshold:.3f}"})

    blank_references = _blank_reference_queryset().count()
    movement_labels = [{"value": value, "label": label} for value, label in StockMovementType.choices]
    _check(checks, key="negative_physical_stock", label="No negative physical stock", status=BLOCKED if negative_physical else READY, detail=f"{negative_physical} active tracked item(s) calculate negative physical stock.", count=negative_physical, action_label="Open stock ledger", action_href="/admin/inventory/ledger")
    _check(checks, key="over_reserved_stock", label="No over-reserved stock", status=BLOCKED if over_reserved else READY, detail=f"{over_reserved} active tracked item(s) reserve more than physical stock.", count=over_reserved, action_label="Open stock ledger", action_href="/admin/inventory/ledger")
    _check(checks, key="opening_or_movement_path_exists", label="Opening stock or movement path exists", status=READY if opening_stock_ready else WARNING, detail=f"{opening_stock_posted_count} posted opening entry row(s), {stock_movements_count} stock ledger movement row(s).", count=opening_stock_posted_count + stock_movements_count, action_label="Open opening stock", action_href="/admin/inventory/opening-stock")
    _check(checks, key="open_purchase_needs", label="Open PurchaseNeed rows", status=WARNING if stock_needs_open else READY, detail=f"{stock_needs_open} operational stock need row(s) are open, in review, ordered, or partially fulfilled.", count=stock_needs_open, action_label="Open stock needs", action_href="/admin/inventory/stock-needs")
    _check(checks, key="stock_movement_type_labels", label="Stock movement labels available", status=READY, detail=f"{len(movement_labels)} StockMovementType label(s) are exposed for operators.", count=len(movement_labels), action_label="Open stock ledger", action_href="/admin/inventory/ledger")
    _check(checks, key="weak_stock_ledger_references", label="Blank source references", status=WARNING if blank_references else READY, detail=f"{blank_references} stock ledger row(s) have blank reference_model or reference_id.", count=blank_references, action_label="Open stock ledger", action_href="/admin/inventory/ledger")
    if negative_physical:
        _issue(issues, severity="BLOCKER", section="stock_ledger", title="Negative physical stock", detail="At least one active tracked item calculates negative physical stock from persisted ledger rows.", action_label="Open stock ledger", action_href="/admin/inventory/ledger")
    if over_reserved:
        _issue(issues, severity="BLOCKER", section="stock_ledger", title="Over-reserved stock", detail="At least one active tracked item has reservations above physical stock.", action_label="Open stock ledger", action_href="/admin/inventory/ledger")
    if blank_references:
        _issue(issues, severity="WARNING", section="stock_ledger", title="Weak stock ledger source references", detail="Blank source references weaken auditability and reconciliation.", action_label="Open stock ledger", action_href="/admin/inventory/ledger")
    if stock_needs_open:
        _issue(issues, severity="WARNING", section="stock_ledger", title="Open stock needs", detail="Open stock needs can block specific delivery or sale flows even when global ATP appears ready.", action_label="Open stock needs", action_href="/admin/inventory/stock-needs")
    stock_ledger_section = _section("stock_ledger", "Stock ledger", checks)
    stock_ledger_section["movement_type_labels"] = movement_labels
    sections.append(stock_ledger_section)

    checks = []
    direct_sales_pending_delivery = DirectSale.objects.filter(delivery_required=True).exclude(status__in=[DirectSaleStatus.DELIVERED, DirectSaleStatus.CANCELLED, DirectSaleStatus.CANCELLED_PRE_INVOICE, DirectSaleStatus.CANCELLED_AFTER_DELIVERY, DirectSaleStatus.REVERSED_POST_INVOICE, DirectSaleStatus.RETURNED, DirectSaleStatus.EXCHANGED_CLOSED, DirectSaleStatus.ARCHIVED]).count()
    active_subscription_delivery_pending = Subscription.objects.filter(status__in=active_subscription_statuses).exclude(fulfillment_status=FulfillmentStatus.DELIVERED).count()
    blocked_deliveries = SubscriptionDelivery.objects.filter(status=DeliveryStatus.BLOCKED_STOCK_UNAVAILABLE).count()
    delivered_stock_out_ids = _stock_ledger_reference_ids(
        reference_model="SubscriptionDelivery",
        movement_types=[StockMovementType.EMI_DELIVERY_OUT, StockMovementType.DELIVERY_OUT],
    )
    delivered_without_stock_out = SubscriptionDelivery.objects.filter(status=DeliveryStatus.DELIVERED).exclude(id__in=delivered_stock_out_ids).count()
    _check(checks, key="direct_sales_delivery_pending", label="Direct sales requiring delivery but not delivered", status=WARNING if direct_sales_pending_delivery else READY, detail=f"{direct_sales_pending_delivery} direct sale row(s) require delivery and are not delivered or terminal.", count=direct_sales_pending_delivery, action_label="Open direct sale workspace", action_href="/admin/billing/direct-sale")
    _check(checks, key="active_subscription_delivery_pending", label="Active subscription handover/delivery pending", status=WARNING if active_subscription_delivery_pending else READY, detail=f"{active_subscription_delivery_pending} active subscription row(s) are not marked delivered in fulfillment status.", count=active_subscription_delivery_pending, action_label="Open deliveries", action_href="/admin/deliveries")
    _check(checks, key="subscription_delivery_blocked_by_stock", label="SubscriptionDelivery blocked by stock", status=BLOCKED if blocked_deliveries else READY, detail=f"{blocked_deliveries} subscription delivery row(s) are blocked because stock is unavailable.", count=blocked_deliveries, action_label="Open deliveries", action_href="/admin/deliveries")
    _check(checks, key="delivered_without_stock_movement", label="Delivered rows missing delivery-out movement", status=WARNING if delivered_without_stock_out else READY, detail=f"{delivered_without_stock_out} delivered SubscriptionDelivery row(s) have no matching delivery-out stock movement reference.", count=delivered_without_stock_out, action_label="Open deliveries", action_href="/admin/deliveries")
    if blocked_deliveries:
        _issue(issues, severity="BLOCKER", section="reservation_delivery", title="Delivery blocked by stock", detail="At least one subscription delivery is explicitly blocked by stock availability.", action_label="Open deliveries", action_href="/admin/deliveries")
    sections.append(_section("reservation_delivery", "Reservation and delivery", checks))

    checks = []
    delivery_return_requested = SubscriptionDelivery.objects.filter(status=DeliveryStatus.RETURN_REQUESTED).count()
    delivery_returned = SubscriptionDelivery.objects.filter(status=DeliveryStatus.RETURNED).count()
    rent_lease_return_pending = Subscription.objects.filter(Q(status=SubscriptionStatus.RETURN_PENDING) | Q(fulfillment_status__in=[FulfillmentStatus.RETURN_REQUESTED, FulfillmentStatus.RETURNED]), plan_type__in=[PlanType.RENT, PlanType.LEASE]).count()
    rent_profiles_not_assessed = RentSubscriptionProfile.objects.filter(subscription__status=SubscriptionStatus.RETURN_PENDING, return_condition_status=ContractReturnConditionStatus.NOT_ASSESSED).count()
    lease_profiles_not_assessed = LeaseSubscriptionProfile.objects.filter(subscription__status=SubscriptionStatus.RETURN_PENDING, return_condition_status=ContractReturnConditionStatus.NOT_ASSESSED).count()
    hold_damage_movements = StockLedger.objects.filter(movement_type__in=[StockMovementType.DAMAGE, StockMovementType.QUALITY_HOLD, StockMovementType.MAINTENANCE_HOLD]).count()
    direct_sale_returned_terminal = DirectSale.objects.filter(status__in=[DirectSaleStatus.RETURNED, DirectSaleStatus.CANCELLED_AFTER_DELIVERY, DirectSaleStatus.REVERSED_POST_INVOICE]).count()
    _check(checks, key="subscription_delivery_returns", label="SubscriptionDelivery returns", status=WARNING if delivery_return_requested else READY, detail=f"{delivery_return_requested} return-requested and {delivery_returned} returned subscription delivery row(s).", count=delivery_return_requested + delivery_returned, action_label="Open deliveries", action_href="/admin/deliveries")
    _check(checks, key="rent_lease_return_pending", label="Rent/lease return workflow active", status=WARNING if rent_lease_return_pending else READY, detail=f"{rent_lease_return_pending} rent/lease subscription row(s) are in return-oriented states.", count=rent_lease_return_pending, action_label="Open rent/lease", action_href="/admin/rent-lease")
    _check(checks, key="return_condition_not_assessed", label="Return condition not assessed", status=WARNING if rent_profiles_not_assessed + lease_profiles_not_assessed else READY, detail=f"{rent_profiles_not_assessed + lease_profiles_not_assessed} rent/lease profile row(s) are return-pending with NOT_ASSESSED condition.", count=rent_profiles_not_assessed + lease_profiles_not_assessed, action_label="Open rent/lease", action_href="/admin/rent-lease")
    _check(checks, key="damage_quality_maintenance_holds", label="Damage / quality / maintenance movements", status=WARNING if hold_damage_movements else READY, detail=f"{hold_damage_movements} stock movement row(s) are damage, quality hold, or maintenance hold.", count=hold_damage_movements, action_label="Open stock ledger", action_href="/admin/inventory/ledger")
    _check(checks, key="direct_sale_returned_reversed", label="Direct-sale returned/reversed terminal rows", status=WARNING if direct_sale_returned_terminal else READY, detail=f"{direct_sale_returned_terminal} direct sale row(s) are returned, cancelled after delivery, or reversed post invoice.", count=direct_sale_returned_terminal, action_label="Open direct sale workspace", action_href="/admin/billing/direct-sale")
    sections.append(_section("returns_damage", "Returns and damage", checks))

    checks = []
    inventory_asset_mappings = FinanceAccountCoaMapping.objects.filter(purpose=FinanceAccountMappingPurpose.INVENTORY_ASSET, is_active=True).count()
    draft_purchase_bills = PurchaseBill.objects.filter(status=PurchaseBillStatus.DRAFT).count()
    approved_purchase_bills = PurchaseBill.objects.filter(status=PurchaseBillStatus.APPROVED).count()
    posted_missing_journal = PurchaseBill.objects.filter(status=PurchaseBillStatus.POSTED, posted_journal_entry__isnull=True).count()
    _check(checks, key="inventory_asset_mapping", label="Inventory asset COA mapping", status=READY if inventory_asset_mappings else WARNING, detail=f"{inventory_asset_mappings} active inventory asset mapping row(s) exist.", count=inventory_asset_mappings, action_label="Open accounting setup", action_href="/admin/accounting/setup")
    _check(checks, key="purchase_bills_draft_approved", label="Draft/approved purchase bills", status=WARNING if draft_purchase_bills + approved_purchase_bills else READY, detail=f"{draft_purchase_bills} draft and {approved_purchase_bills} approved purchase bill row(s) are not posted.", count=draft_purchase_bills + approved_purchase_bills, action_label="Open purchase bills", action_href="/admin/purchases/bills")
    _check(checks, key="posted_purchase_bills_missing_journal", label="Posted purchase bills missing journal entry", status=BLOCKED if posted_missing_journal else READY, detail=f"{posted_missing_journal} posted purchase bill row(s) are missing posted_journal_entry.", count=posted_missing_journal, action_label="Open accounting control", action_href="/admin/accounting/control-center")
    if posted_missing_journal:
        _issue(issues, severity="BLOCKER", section="finance_mapping", title="Posted purchase bill missing journal", detail="Posted purchase bills should retain their journal entry link for accounting auditability.", action_label="Open accounting control", action_href="/admin/accounting/control-center")
    sections.append(_section("finance_mapping", "Finance mapping", checks))

    checks = []
    stock_delivery_mismatch = delivered_without_stock_out
    _check(checks, key="weak_source_references", label="Stock ledger missing weak source references", status=WARNING if blank_references else READY, detail=f"{blank_references} stock ledger row(s) have blank source references.", count=blank_references, action_label="Open stock ledger", action_href="/admin/inventory/ledger")
    _check(checks, key="stock_delivery_mismatch", label="Stock vs delivery mismatch count", status=WARNING if stock_delivery_mismatch else READY, detail=f"{stock_delivery_mismatch} delivered SubscriptionDelivery row(s) have no safe matching delivery-out stock reference.", count=stock_delivery_mismatch, action_label="Open payment reconciliation", action_href="/admin/payments/reconciliation")
    _check(checks, key="open_stock_needs_reconciliation", label="Open stock needs reconciliation warnings", status=WARNING if stock_needs_open else READY, detail=f"{stock_needs_open} open operational stock need row(s) require follow-up.", count=stock_needs_open, action_label="Open stock needs", action_href="/admin/inventory/stock-needs")
    sections.append(_section("reconciliation", "Reconciliation", checks))

    for section in sections:
        for row in section["checks"]:
            if row["status"] == WARNING:
                warnings.append({"code": row["key"].upper(), "message": row["detail"]})
                if row["action_label"]:
                    recommended_actions.append(row["action_label"])

    summary = {
        "blockers": sum(section["blockers"] for section in sections),
        "warnings": sum(section["warnings"] for section in sections),
        "ready_checks": sum(1 for section in sections for row in section["checks"] if row["status"] == READY),
        "total_checks": sum(len(section["checks"]) for section in sections),
    }
    overall_status = BLOCKED if summary["blockers"] else WARNING if summary["warnings"] else READY
    inventory_ready = overall_status == READY

    return {
        "module_not_configured": False,
        "overall_status": overall_status,
        "summary": summary,
        "last_checked_at": timezone.now().isoformat(),
        "sections": sections,
        "issues": issues,
        "operator_shortcuts": [
            {"label": "Inventory workspace", "href": "/admin/inventory", "description": "Review inventory navigation and operational entry points."},
            {"label": "Inventory profiles", "href": "/admin/inventory/profiles", "description": "Maintain stock tracking profiles, SKUs, and default locations."},
            {"label": "Stock ledger", "href": "/admin/inventory/ledger", "description": "Inspect persisted stock movements and source references."},
            {"label": "Opening stock", "href": "/admin/inventory/opening-stock", "description": "Post or review opening stock entries."},
            {"label": "Stock needs", "href": "/admin/inventory/stock-needs", "description": "Review open operational stock requirements."},
            {"label": "Deliveries", "href": "/admin/deliveries", "description": "Review subscription handover and delivery cases."},
            {"label": "Direct sale workspace", "href": "/admin/billing/direct-sale", "description": "Review direct-sale delivery and reversal cases."},
            {"label": "Accounting setup", "href": "/admin/accounting/setup", "description": "Review inventory asset and purchase posting mappings."},
            {"label": "Purchase bills", "href": "/admin/purchases/bills", "description": "Review draft, approved, and posted purchase bills."},
            {"label": "Payment reconciliation", "href": "/admin/payments/reconciliation", "description": "Review operational reconciliation queues."},
        ],
        "inventory_ready": inventory_ready,
        "global_inventory_ready": inventory_ready,
        "product_count": product_count,
        "active_product_count": active_product_count,
        "stock_item_count": stock_item_count,
        "active_tracked_stock_items": active_tracked_stock_items,
        "products_without_stock": products_without_stock[:200],
        "products_without_stock_count": len(products_without_stock),
        "low_stock_items": low_stock_items[:200],
        "low_stock_items_count": len(low_stock_items),
        "stock_needs_open": stock_needs_open,
        "open_operational_stock_needs": stock_needs_open,
        "stock_movements_count": stock_movements_count,
        "opening_stock_posted_count": opening_stock_posted_count,
        "opening_stock_draft_count": opening_stock_draft_count,
        "opening_stock_ready": opening_stock_ready,
        "warnings": warnings,
        "recommended_actions": list(dict.fromkeys(recommended_actions)),
    }
