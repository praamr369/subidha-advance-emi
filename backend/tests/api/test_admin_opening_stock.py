from __future__ import annotations

import io
from datetime import date
from decimal import Decimal

from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework import status
from rest_framework.test import APITestCase

from inventory.models import (
    InventoryItem,
    OpeningStockEntry,
    OpeningStockEntryStatus,
    StockAdjustmentStatus,
    StockLedger,
    StockLocation,
    StockMovementType,
)
from tests.helpers import (
    create_admin_user,
    create_cashier_user,
    create_partner_user,
    create_product,
)


class AdminOpeningStockApiTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="opening_stock_admin", phone="9388001001")
        self.client.force_authenticate(self.admin)
        self.product = create_product(
            name="Opening Item",
            product_code="OS-ITEM-001",
            base_price=Decimal("99999.00"),
        )
        self.location = StockLocation.objects.create(
            code="OS-LOC-001",
            name="Opening Test Location",
            location_type="STORE",
            is_active=True,
        )
        self.item = InventoryItem.objects.create(
            product=self.product,
            sku="OS-SKU-001",
            opening_stock_qty=Decimal("0.000"),
            default_stock_location=self.location,
            standard_unit_cost=Decimal("100.00"),
            stock_tracking_enabled=True,
        )

    def test_manual_create_and_post_creates_ledger(self):
        eff = date(2026, 5, 3)
        create_resp = self.client.post(
            "/api/v1/admin/inventory/opening-stock/",
            {
                "inventory_item": self.item.id,
                "stock_location": self.location.id,
                "quantity": "4.000",
                "effective_date": eff.isoformat(),
                "note": "initial",
            },
            format="json",
        )
        self.assertEqual(create_resp.status_code, status.HTTP_201_CREATED, create_resp.data)
        entry_id = create_resp.data["id"]

        post_resp = self.client.post(
            f"/api/v1/admin/inventory/opening-stock/{entry_id}/post/",
            {},
            format="json",
        )
        self.assertEqual(post_resp.status_code, status.HTTP_200_OK, post_resp.data)
        self.assertTrue(post_resp.data["updated"])
        entry = OpeningStockEntry.objects.get(pk=entry_id)
        self.assertEqual(entry.status, OpeningStockEntryStatus.POSTED)
        self.assertEqual(
            StockLedger.objects.filter(
                reference_model="OpeningStockEntry",
                reference_id=str(entry_id),
                movement_type=StockMovementType.OPENING_BALANCE_IN,
            ).count(),
            1,
        )

    def test_post_idempotent_second_call(self):
        eff = date(2026, 5, 4)
        e = OpeningStockEntry.objects.create(
            inventory_item=self.item,
            stock_location=self.location,
            quantity=Decimal("2.000"),
            unit_cost_snapshot=Decimal("50.00"),
            effective_date=eff,
            note="x",
            status=OpeningStockEntryStatus.DRAFT,
            source="MANUAL",
            created_by=self.admin,
        )
        r1 = self.client.post(f"/api/v1/admin/inventory/opening-stock/{e.id}/post/", {}, format="json")
        self.assertEqual(r1.status_code, status.HTTP_200_OK, r1.data)
        self.assertTrue(r1.data["updated"])
        r2 = self.client.post(f"/api/v1/admin/inventory/opening-stock/{e.id}/post/", {}, format="json")
        self.assertEqual(r2.status_code, status.HTTP_200_OK, r2.data)
        self.assertFalse(r2.data["updated"])
        self.assertEqual(
            StockLedger.objects.filter(
                reference_model="OpeningStockEntry",
                reference_id=str(e.id),
            ).count(),
            1,
        )

    def test_post_rejects_missing_unit_cost(self):
        self.item.standard_unit_cost = None
        self.item.save(update_fields=["standard_unit_cost", "updated_at"])
        eff = date(2026, 5, 5)
        e = OpeningStockEntry.objects.create(
            inventory_item=self.item,
            stock_location=self.location,
            quantity=Decimal("1.000"),
            unit_cost_snapshot=None,
            effective_date=eff,
            note="needs cost",
            status=OpeningStockEntryStatus.DRAFT,
            source="MANUAL",
            created_by=self.admin,
        )
        resp = self.client.post(f"/api/v1/admin/inventory/opening-stock/{e.id}/post/", {}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST, resp.data)
        self.assertIn("detail", resp.data)

    def test_posted_row_cannot_patch(self):
        eff = date(2026, 5, 6)
        e = OpeningStockEntry.objects.create(
            inventory_item=self.item,
            stock_location=self.location,
            quantity=Decimal("1.000"),
            unit_cost_snapshot=Decimal("10.00"),
            effective_date=eff,
            note="posted",
            status=OpeningStockEntryStatus.POSTED,
            source="MANUAL",
            created_by=self.admin,
            posted_by=self.admin,
        )
        resp = self.client.patch(
            f"/api/v1/admin/inventory/opening-stock/{e.id}/",
            {"quantity": "2.000"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST, resp.data)

    def test_correction_creates_adjustment_draft(self):
        eff = date(2026, 5, 7)
        e = OpeningStockEntry.objects.create(
            inventory_item=self.item,
            stock_location=self.location,
            quantity=Decimal("5.000"),
            unit_cost_snapshot=Decimal("20.00"),
            effective_date=eff,
            note="posted opening",
            status=OpeningStockEntryStatus.POSTED,
            source="MANUAL",
            created_by=self.admin,
            posted_by=self.admin,
        )
        resp = self.client.post(
            f"/api/v1/admin/inventory/opening-stock/{e.id}/correction/",
            {"reason": "Count fix", "quantity_delta": "-1.000"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        e.refresh_from_db()
        self.assertIsNotNone(e.correction_adjustment_id)
        self.assertEqual(e.correction_adjustment.status, StockAdjustmentStatus.DRAFT)

    def test_csv_preview_returns_batch_key(self):
        csv_body = (
            "sku,warehouse_code,quantity,unit_cost,effective_date,update_mode,note\n"
            "OS-SKU-001,OS-LOC-001,3.000,100.00,2026-05-08,draft_update,note\n"
        )
        upload = SimpleUploadedFile("open.csv", csv_body.encode("utf-8"), content_type="text/csv")
        resp = self.client.post(
            "/api/v1/admin/inventory/opening-stock/import/preview/",
            {"file": upload, "default_effective_date": "2026-05-08"},
            format="multipart",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        self.assertIn("batch_key", resp.data)
        self.assertGreaterEqual(resp.data["ready_rows"], 1)

    def test_partner_blocked(self):
        partner = create_partner_user(username="opening_partner_blk", phone="9388001002")
        self.client.force_authenticate(partner)
        resp = self.client.get("/api/v1/admin/inventory/opening-stock/")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_cashier_blocked(self):
        cashier = create_cashier_user(username="opening_cashier_blk", phone="9388001003")
        self.client.force_authenticate(cashier)
        resp = self.client.get("/api/v1/admin/inventory/opening-stock/")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_posted_cost_uses_explicit_snapshot_not_product_base_price(self):
        self.item.standard_unit_cost = None
        self.item.save(update_fields=["standard_unit_cost", "updated_at"])
        eff = date(2026, 5, 10)
        create_resp = self.client.post(
            "/api/v1/admin/inventory/opening-stock/",
            {
                "inventory_item": self.item.id,
                "stock_location": self.location.id,
                "quantity": "2.000",
                "unit_cost_snapshot": "77.50",
                "effective_date": eff.isoformat(),
                "note": "explicit cost",
            },
            format="json",
        )
        self.assertEqual(create_resp.status_code, status.HTTP_201_CREATED, create_resp.data)
        entry_id = create_resp.data["id"]
        post_resp = self.client.post(
            f"/api/v1/admin/inventory/opening-stock/{entry_id}/post/",
            {},
            format="json",
        )
        self.assertEqual(post_resp.status_code, status.HTTP_200_OK, post_resp.data)
        entry = OpeningStockEntry.objects.get(pk=entry_id)
        self.assertEqual(entry.unit_cost_snapshot, Decimal("77.50"))
        self.assertNotEqual(entry.unit_cost_snapshot, self.product.base_price)

    def test_bulk_csv_dry_run_does_not_persist_entries(self):
        before = OpeningStockEntry.objects.count()
        csv_body = (
            "sku,warehouse_code,quantity,unit_cost,effective_date,update_mode,note\n"
            "OS-SKU-001,OS-LOC-001,1.000,88.00,2026-05-11,draft_update,n\n"
        )
        upload = SimpleUploadedFile("bulk.csv", csv_body.encode("utf-8"), content_type="text/csv")
        resp = self.client.post(
            "/api/v1/admin/inventory/opening-stock/import/apply/",
            {"file": upload, "dry_run": "true"},
            format="multipart",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        self.assertTrue(resp.data.get("dry_run"))
        self.assertEqual(OpeningStockEntry.objects.count(), before)

    def test_bulk_csv_apply_creates_draft_entry(self):
        csv_body = (
            "sku,warehouse_code,quantity,unit_cost,effective_date,update_mode,note\n"
            "OS-SKU-001,OS-LOC-001,2.000,90.00,2026-05-12,draft_update,n\n"
        )
        upload = SimpleUploadedFile("bulk2.csv", csv_body.encode("utf-8"), content_type="text/csv")
        resp = self.client.post(
            "/api/v1/admin/inventory/opening-stock/import/apply/",
            {"file": upload, "dry_run": "false"},
            format="multipart",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        self.assertGreaterEqual(resp.data.get("created", 0), 1)
        exists = OpeningStockEntry.objects.filter(
            inventory_item=self.item,
            stock_location=self.location,
            effective_date=date(2026, 5, 12),
            status=OpeningStockEntryStatus.DRAFT,
            source="CSV_IMPORT",
        ).exists()
        self.assertTrue(exists)
