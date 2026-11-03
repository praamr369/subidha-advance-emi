from __future__ import annotations

from datetime import date
from decimal import Decimal

from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from accounting.services.solopreneur_finance_service import run_solopreneur_daily_close
from accounts.models import User, UserRole
from inventory.models import InventoryItem, StockLedger, StockMovementType
from inventory.services.stock_on_hand_service import build_stock_on_hand_summary, get_stock_on_hand_items
from subscriptions.models import AuditLog, Product
from tests.helpers import create_admin_user, create_user


class SolopreneurCloseIntegrationTests(TestCase):
    def setUp(self):
        self.admin = create_admin_user(username="solopreneur_admin", phone="9876543210")
        self.staff = create_user(username="solopreneur_staff", role=UserRole.STAFF, phone="9876543211")
        self.client = APIClient()

    def test_ledger_health_endpoint_permissions(self):
        # Unauthenticated rejected
        resp = self.client.get("/api/v1/admin/accounting/ledger-health/")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

        # Staff rejected
        self.client.force_authenticate(user=self.staff)
        resp = self.client.get("/api/v1/admin/accounting/ledger-health/")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

        # Admin allowed
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get("/api/v1/admin/accounting/ledger-health/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()
        self.assertIn("is_balanced", data)
        self.assertIn("total_debit", data)
        self.assertIn("total_credit", data)
        self.assertIn("difference", data)
        self.assertIn("checks", data)

    def test_ledger_health_cache_and_refresh_param(self):
        self.client.force_authenticate(user=self.admin)
        # Normal request
        resp1 = self.client.get("/api/v1/admin/accounting/ledger-health/")
        self.assertEqual(resp1.status_code, status.HTTP_200_OK)

        # Force refresh bypasses cache
        resp2 = self.client.get("/api/v1/admin/accounting/ledger-health/?refresh=1")
        self.assertEqual(resp2.status_code, status.HTTP_200_OK)
        self.assertEqual(resp1.json()["is_balanced"], resp2.json()["is_balanced"])

    def test_daily_close_endpoint_dry_run(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(
            "/api/v1/admin/accounting/solopreneur-close/",
            {"dry_run": True},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()
        self.assertIn(data["status"], ["SUCCESS", "PARTIAL_SUCCESS"])
        self.assertIn("processed", data)
        self.assertIn("details", data)
        # Verify payout_batches is registered in bridges
        self.assertIn("payout_batches", data["details"])

    def test_daily_close_service_creates_audit_log(self):
        initial_count = AuditLog.objects.filter(action_type="SOLOPRENEUR_DAILY_CLOSE").count()
        result = run_solopreneur_daily_close(performed_by=self.admin, dry_run=False)
        self.assertIn(result["status"], ["SUCCESS", "PARTIAL_SUCCESS"])
        new_count = AuditLog.objects.filter(action_type="SOLOPRENEUR_DAILY_CLOSE").count()
        self.assertEqual(new_count, initial_count + 1)
        latest = AuditLog.objects.filter(action_type="SOLOPRENEUR_DAILY_CLOSE").latest("id")
        self.assertIn("payout_batches", latest.metadata.get("results", {}))

    def test_stock_on_hand_atp_independent_across_items(self):
        prod1 = Product.objects.create(name="Sofa 3-Seater", product_code="SOFA-001", base_price=Decimal("15000.00"))
        prod2 = Product.objects.create(name="Dining Table", product_code="TABLE-001", base_price=Decimal("12000.00"))

        item1 = InventoryItem.objects.create(
            product=prod1,
            sku="SOFA-001-SKU",
            inventory_code="SOFA-001-INV",
            opening_stock_qty=Decimal("10.000"),
            standard_unit_cost=Decimal("8000.00"),
            is_active=True,
        )
        item2 = InventoryItem.objects.create(
            product=prod2,
            sku="TABLE-001-SKU",
            inventory_code="TABLE-001-INV",
            opening_stock_qty=Decimal("2.000"),
            standard_unit_cost=Decimal("6000.00"),
            is_active=True,
        )

        # Soft-reserve 5 units of Table (over-reserved since physical is 2)
        StockLedger.objects.create(
            inventory_item=item2,
            movement_type=StockMovementType.SALE_RESERVE,
            movement_date=date.today(),
            quantity_in=Decimal("5.000"),
            quantity_out=Decimal("0.000"),
            reference_model="Test",
            reference_id="1",
        )

        # Build summary
        summary = build_stock_on_hand_summary()
        summary_stats = summary["summary"]

        # Item 1 has 10 physical, 0 reserved -> available = 10
        # Item 2 has 2 physical, 5 reserved -> available = 0
        # Over-reservation of Item 2 must NOT reduce available stock of Item 1!
        # Total available must be 10 (not 12 - 5 = 7)
        self.assertEqual(Decimal(summary_stats["total_physical_qty"]), Decimal("12.000"))
        self.assertEqual(Decimal(summary_stats["total_reserved_qty"]), Decimal("5.000"))
        self.assertEqual(Decimal(summary_stats["total_available_qty"]), Decimal("10.000"))
