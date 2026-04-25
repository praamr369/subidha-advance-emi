"""
Phase 2 Inventory & Product Tests

Covers:
1. StockMovementService: reserve, release, delivery_out
2. reserved_qty / available_qty on InventoryItem
3. Delivery blocking check
4. Product lifecycle_status validation (DISCONTINUED blocks subscription create)
5. Product plan-type eligibility enforcement (EMI/Rent/Lease/DirectSale flags)
6. Purchase suggestion engine
7. Demand summary API
8. Purchase suggestion API
9. Product stock-status API
"""

from decimal import Decimal

from django.test import TestCase
from django.utils.crypto import get_random_string
from rest_framework.test import APIClient

from accounts.models import User, UserRole
from inventory.models import InventoryItem, StockLedger, StockMovementType
from inventory.services.stock_movement_service import (
    check_stock_for_delivery,
    post_movement,
    release_stock_reservation,
    reserve_stock_for_subscription,
    post_delivery_out,
)
from inventory.services.demand_service import get_purchase_suggestions, get_shortage_for_product
from subscriptions.models import Customer, DeliveryStatus, Product


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_admin(phone=None):
    username = f"adm_{get_random_string(8)}"
    phone = phone or f"+91{get_random_string(10, '1234567890')}"
    return User.objects.create_user(
        username=username, password="test", role=UserRole.ADMIN, phone=phone
    )


def make_product(name=None, code=None):
    code = code or f"P-{get_random_string(6).upper()}"
    return Product.objects.create(
        product_code=code,
        name=name or f"Product {code}",
        base_price=Decimal("10000.00"),
        is_emi_enabled=True,
        is_rent_enabled=False,
        is_lease_enabled=False,
        is_direct_sale_enabled=True,
        lifecycle_status="ACTIVE",
    )


def make_inventory_item(product, opening_stock=Decimal("10.000")):
    return InventoryItem.objects.create(
        product=product,
        opening_stock_qty=opening_stock,
        reorder_level_qty=Decimal("3.000"),
    )


def make_customer():
    phone = f"+91{get_random_string(10, '1234567890')}"
    user = User.objects.create_user(
        username=f"cust_{get_random_string(8)}",
        password="test",
        role=UserRole.CUSTOMER,
        phone=phone,
    )
    return Customer.objects.create(user=user, name="Test Customer", phone=phone)


# ---------------------------------------------------------------------------
# 1. Stock movement service – reserve / release / delivery
# ---------------------------------------------------------------------------

class StockReservationTests(TestCase):
    def setUp(self):
        self.product = make_product()
        self.item = make_inventory_item(self.product, opening_stock=Decimal("10.000"))

    def test_physical_stock_equals_opening_before_any_movement(self):
        assert self.item.current_stock_quantity() == Decimal("10.000")

    def test_reserved_qty_starts_at_zero(self):
        assert self.item.reserved_qty() == Decimal("0.000")

    def test_available_qty_equals_physical_before_reserve(self):
        assert self.item.available_qty() == Decimal("10.000")

    def test_reserve_reduces_available_not_physical(self):
        reserve_stock_for_subscription(
            inventory_item=self.item,
            quantity=Decimal("2.000"),
            subscription_id=1,
        )
        self.item.refresh_from_db()
        assert self.item.current_stock_quantity() == Decimal("10.000")
        assert self.item.reserved_qty() == Decimal("2.000")
        assert self.item.available_qty() == Decimal("8.000")

    def test_release_restores_available(self):
        reserve_stock_for_subscription(
            inventory_item=self.item,
            quantity=Decimal("2.000"),
            subscription_id=1,
        )
        release_stock_reservation(
            inventory_item=self.item,
            quantity=Decimal("2.000"),
            subscription_id=1,
        )
        self.item.refresh_from_db()
        assert self.item.reserved_qty() == Decimal("0.000")
        assert self.item.available_qty() == Decimal("10.000")

    def test_reserve_raises_when_insufficient_stock(self):
        with self.assertRaises(ValueError):
            reserve_stock_for_subscription(
                inventory_item=self.item,
                quantity=Decimal("15.000"),
                subscription_id=1,
            )

    def test_post_delivery_out_reduces_physical_and_releases_reservation(self):
        reserve_stock_for_subscription(
            inventory_item=self.item,
            quantity=Decimal("1.000"),
            subscription_id=42,
        )
        entries = post_delivery_out(
            inventory_item=self.item,
            quantity=Decimal("1.000"),
            delivery_id=99,
            subscription_id=42,
        )
        self.item.refresh_from_db()
        assert self.item.current_stock_quantity() == Decimal("9.000")
        assert self.item.reserved_qty() == Decimal("0.000")
        assert len(entries) == 2
        types = {e.movement_type for e in entries}
        assert StockMovementType.DELIVERY_OUT in types
        assert StockMovementType.SALE_RELEASE in types

    def test_soft_hold_excluded_from_physical_stock(self):
        """SALE_RESERVE and SALE_RELEASE do not change current_stock_quantity."""
        reserve_stock_for_subscription(
            inventory_item=self.item,
            quantity=Decimal("5.000"),
            subscription_id=10,
        )
        assert self.item.current_stock_quantity() == Decimal("10.000")


# ---------------------------------------------------------------------------
# 2. Delivery blocking check
# ---------------------------------------------------------------------------

class DeliveryBlockingCheckTests(TestCase):
    def setUp(self):
        self.product = make_product()
        self.item = make_inventory_item(self.product, opening_stock=Decimal("2.000"))

    def test_blocking_check_ok_when_stock_available(self):
        result = check_stock_for_delivery(
            inventory_item=self.item, quantity=Decimal("1.000")
        )
        assert result["ok"] is True

    def test_blocking_check_fails_when_no_physical_stock(self):
        empty_product = make_product(code="EMPTY-1")
        empty_item = make_inventory_item(empty_product, opening_stock=Decimal("0.000"))
        result = check_stock_for_delivery(
            inventory_item=empty_item, quantity=Decimal("1.000")
        )
        assert result["ok"] is False
        assert "physical stock" in result["reason"].lower()

    def test_blocking_check_fails_when_all_stock_reserved(self):
        reserve_stock_for_subscription(
            inventory_item=self.item,
            quantity=Decimal("2.000"),
            subscription_id=1,
        )
        result = check_stock_for_delivery(
            inventory_item=self.item, quantity=Decimal("1.000")
        )
        assert result["ok"] is False


# ---------------------------------------------------------------------------
# 3. Product lifecycle_status – DISCONTINUED blocks subscription create
# ---------------------------------------------------------------------------

class ProductLifecycleEligibilityTests(TestCase):
    def setUp(self):
        self.admin = make_admin(phone="+919800000001")
        self.customer = make_customer()

    def _create_url(self):
        return "/api/v1/admin/subscriptions/"

    def _post(self, product, plan_type="EMI"):
        client = APIClient()
        client.force_authenticate(user=self.admin)
        return client.post(self._create_url(), {
            "product": product.id,
            "customer": self.customer.id,
            "plan_type": plan_type,
            "tenure_months": 12,
            "start_date": "2026-01-01",
        }, format="json")

    def test_active_product_can_create_subscription(self):
        product = make_product()
        response = self._post(product)
        # Should not return 400 due to lifecycle
        assert response.status_code != 400 or "discontinued" not in str(response.data).lower()

    def test_discontinued_product_blocks_subscription_create(self):
        product = make_product()
        # bypass full_clean on direct save using QuerySet.update to avoid other clean() checks
        Product.objects.filter(pk=product.pk).update(lifecycle_status="DISCONTINUED")
        response = self._post(product)
        assert response.status_code == 400
        assert "discontinued" in str(response.data).lower()

    def test_emi_disabled_product_blocks_emi_subscription(self):
        product = make_product()
        # Must change plan_type_default so clean() doesn't reject the update
        Product.objects.filter(pk=product.pk).update(
            is_emi_enabled=False, is_rent_enabled=True, plan_type_default="RENT"
        )
        response = self._post(product, plan_type="EMI")
        assert response.status_code == 400
        assert "emi" in str(response.data).lower() or "eligible" in str(response.data).lower()


# ---------------------------------------------------------------------------
# 4. Purchase suggestion engine
# ---------------------------------------------------------------------------

class PurchaseSuggestionTests(TestCase):
    def setUp(self):
        self.p_low = make_product(code="LOW-1")
        self.item_low = make_inventory_item(
            self.p_low, opening_stock=Decimal("2.000")
        )
        self.item_low.reorder_level_qty = Decimal("5.000")
        self.item_low.save(update_fields=["reorder_level_qty"])

        self.p_ok = make_product(code="OK-1")
        self.item_ok = make_inventory_item(
            self.p_ok, opening_stock=Decimal("20.000")
        )
        self.item_ok.reorder_level_qty = Decimal("3.000")
        self.item_ok.save(update_fields=["reorder_level_qty"])

    def test_low_stock_product_appears_in_suggestions(self):
        suggestions = get_purchase_suggestions()
        codes = [s["product_code"] for s in suggestions]
        assert "LOW-1" in codes

    def test_above_threshold_product_not_in_suggestions(self):
        suggestions = get_purchase_suggestions()
        codes = [s["product_code"] for s in suggestions]
        assert "OK-1" not in codes

    def test_suggestion_has_required_fields(self):
        suggestions = get_purchase_suggestions(product_ids=[self.p_low.id])
        assert len(suggestions) == 1
        s = suggestions[0]
        for field in ["product_id", "product_code", "product_name", "physical_stock",
                      "reserved_stock", "available_stock", "low_stock_threshold",
                      "suggested_order_quantity", "trigger"]:
            assert field in s, f"Missing field: {field}"

    def test_trigger_is_low_stock_for_threshold_breach(self):
        suggestions = get_purchase_suggestions(product_ids=[self.p_low.id])
        assert suggestions[0]["trigger"] in ("LOW_STOCK", "BOTH")


# ---------------------------------------------------------------------------
# 5. Phase 2 API endpoints
# ---------------------------------------------------------------------------

class Phase2InventoryAPITests(TestCase):
    def setUp(self):
        self.admin = make_admin(phone="+919700000001")
        self.product = make_product(code="API-1")
        self.item = make_inventory_item(self.product, opening_stock=Decimal("5.000"))
        self.item.reorder_level_qty = Decimal("10.000")
        self.item.save(update_fields=["reorder_level_qty"])

    def test_product_stock_status_returns_200_for_admin(self):
        client = APIClient()
        client.force_authenticate(user=self.admin)
        response = client.get(f"/api/v1/inventory/products/{self.product.id}/stock-status/")
        assert response.status_code == 200
        assert "physical_stock" in response.data
        assert "reserved_stock" in response.data
        assert "available_stock" in response.data
        assert "stock_status" in response.data

    def test_product_stock_status_shows_low_stock_when_below_threshold(self):
        client = APIClient()
        client.force_authenticate(user=self.admin)
        response = client.get(f"/api/v1/inventory/products/{self.product.id}/stock-status/")
        assert response.status_code == 200
        assert response.data["stock_status"] == "LOW_STOCK"

    def test_purchase_suggestions_returns_200_for_admin(self):
        client = APIClient()
        client.force_authenticate(user=self.admin)
        response = client.get("/api/v1/inventory/purchase-suggestions/")
        assert response.status_code == 200
        assert "count" in response.data
        assert "results" in response.data

    def test_purchase_suggestions_returns_403_for_non_admin(self):
        customer_user = User.objects.create_user(
            username=f"cust_{get_random_string(6)}",
            password="x",
            role=UserRole.CUSTOMER,
            phone=f"+91{get_random_string(10, '1234567890')}",
        )
        client = APIClient()
        client.force_authenticate(user=customer_user)
        response = client.get("/api/v1/inventory/purchase-suggestions/")
        assert response.status_code == 403

    def test_demand_summary_returns_200_for_admin(self):
        client = APIClient()
        client.force_authenticate(user=self.admin)
        response = client.get(
            f"/api/v1/inventory/demand-summary/?product_id={self.product.id}"
        )
        assert response.status_code == 200
        assert "product_id" in response.data

    def test_demand_summary_returns_400_without_product_id(self):
        client = APIClient()
        client.force_authenticate(user=self.admin)
        response = client.get("/api/v1/inventory/demand-summary/")
        assert response.status_code == 400
