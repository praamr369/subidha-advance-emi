from __future__ import annotations

from decimal import Decimal

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from branch_control.models import Branch
from inventory.models import InventoryItem, InventoryItemType, StockLedger, StockLocation, StockMovementType
from tests.helpers import create_admin_user, create_product

ACTIVE = InventoryItem.StockTrackingStatus.STOCK_ACTIVE
NO_STOCK = InventoryItem.StockTrackingStatus.PREPARED_NO_STOCK
ARCHIVED = InventoryItem.StockTrackingStatus.ARCHIVED


class StockTrackingStatusSyncTests(APITestCase):
    """The Finished Goods badge must follow real stock, not a stale column."""

    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="sts_admin", phone="9011000901")
        self.location = StockLocation.objects.create(
            code="STS-LOC-001",
            name="STS Store",
            branch=Branch.objects.order_by("id").first(),
            location_type="STORE",
            is_active=True,
        )
        self._ref = 0

    def _item(self, code: str, *, tracking_status=NO_STOCK) -> InventoryItem:
        product = create_product(name=f"STS {code}", product_code=code, base_price=Decimal("1000.00"))
        return InventoryItem.objects.create(
            product=product,
            stock_tracking_enabled=True,
            stock_item_type=InventoryItemType.FINISHED_GOOD,
            opening_stock_qty=Decimal("0.000"),
            default_stock_location=self.location,
            stock_tracking_status=tracking_status,
            is_active=True,
        )

    def _move(self, item: InventoryItem, movement_type: str, *, qty_in="0", qty_out="0") -> None:
        self._ref += 1
        StockLedger.objects.create(
            inventory_item=item,
            movement_type=movement_type,
            movement_date=timezone.localdate(),
            stock_location=self.location,
            quantity_in=Decimal(qty_in),
            quantity_out=Decimal(qty_out),
            reference_model="TEST",
            reference_id=str(self._ref),
        )

    def _api_row(self, item: InventoryItem) -> dict:
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get("/api/v1/admin/inventory/finished-goods/", {"page_size": 100})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        return next(r for r in resp.data["results"] if r["id"] == item.id)

    def test_stock_in_and_out_flips_stored_status(self):
        item = self._item("STS-A")
        self._move(item, StockMovementType.PURCHASE_IN, qty_in="1")
        item.refresh_from_db()
        self.assertEqual(item.stock_tracking_status, ACTIVE)

        self._move(item, StockMovementType.SALE_OUT, qty_out="1")
        item.refresh_from_db()
        self.assertEqual(item.stock_tracking_status, NO_STOCK)

    def test_register_shows_live_status_even_if_column_is_stale(self):
        item = self._item("STS-B")
        self._move(item, StockMovementType.PURCHASE_IN, qty_in="1")
        InventoryItem.objects.filter(pk=item.pk).update(stock_tracking_status=NO_STOCK)

        row = self._api_row(item)
        self.assertEqual(row["stock_tracking_status"], ACTIVE)
        self.assertEqual(Decimal(row["physical_qty"]), Decimal("1"))

    def test_manual_lifecycle_state_is_not_overridden(self):
        item = self._item("STS-C", tracking_status=ARCHIVED)
        self._move(item, StockMovementType.PURCHASE_IN, qty_in="2")
        item.refresh_from_db()
        self.assertEqual(item.stock_tracking_status, ARCHIVED)
        self.assertEqual(self._api_row(item)["stock_tracking_status"], ARCHIVED)
