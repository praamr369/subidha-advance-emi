from datetime import date
from decimal import Decimal

from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import (
    ChartOfAccount,
    ChartOfAccountType,
    FinanceAccount,
    FinanceAccountKind,
    Vendor,
    VendorSettlement,
)
from accounting.services.purchase_bill_posting_service import approve_purchase_bill, post_purchase_bill_from_accounting
from accounting.services.vendor_settlement_service import post_vendor_settlement
from inventory.models import InventoryItem, InventoryItemType
from inventory.services.stock_service import upsert_purchase_bill_draft
from tests.helpers import create_admin_user, create_product


class VendorOperationalSummaryApiTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(
            username="vendor_ops_admin",
            phone="9389400001",
        )
        self.client.force_authenticate(user=self.admin)

        product = create_product(
            name="Vendor Ops Product",
            product_code="VENDOR-OPS-001",
            base_price=Decimal("1000.00"),
        )
        self.item = InventoryItem.objects.create(
            product=product,
            sku="VENDOR-OPS-SKU-001",
            stock_item_type=InventoryItemType.RAW_MATERIAL,
            opening_stock_qty=Decimal("2.000"),
            reorder_level_qty=Decimal("1.000"),
            standard_unit_cost=Decimal("700.00"),
        )
        self.vendor = Vendor.objects.create(name="Vendor Ops One", phone="8800001001")
        self.cash_account = FinanceAccount.objects.create(
            name="Vendor Ops Cash",
            kind=FinanceAccountKind.CASH,
            chart_account=ChartOfAccount.objects.create(
                code="VENDOR-OPS-CASH-001",
                name="Vendor Ops Cash Book",
                account_type=ChartOfAccountType.ASSET,
            ),
            opening_balance=Decimal("0.00"),
        )

        purchase_bill = upsert_purchase_bill_draft(
            bill_no="VENDOR-OPS-202604-001",
            bill_date=date(2026, 4, 20),
            vendor=self.vendor,
            tax_mode="GST",
            finance_account=self.cash_account,
            lines=[
                {
                    "inventory_item": self.item,
                    "description": "Vendor ops purchase line",
                    "quantity": Decimal("1.000"),
                    "unit_cost": Decimal("1000.00"),
                    "tax_amount": Decimal("180.00"),
                }
            ],
            performed_by=self.admin,
        )
        purchase_bill, _ = approve_purchase_bill(
            purchase_bill_id=purchase_bill.id,
            approved_by=self.admin,
        )
        self.purchase_bill, _ = post_purchase_bill_from_accounting(
            purchase_bill_id=purchase_bill.id,
            posted_by=self.admin,
        )

        settlement = VendorSettlement.objects.create(
            vendor=self.vendor,
            settlement_date=date(2026, 4, 21),
            amount=Decimal("500.00"),
            finance_account=self.cash_account,
            purchase_bill=self.purchase_bill,
            reference_no="VENDOR-OPS-SETTLE-001",
        )
        self.settlement, _ = post_vendor_settlement(
            vendor_settlement_id=settlement.id,
            posted_by=self.admin,
        )

    def test_vendor_operational_summary_exposes_payable_timeline(self):
        response = self.client.get(
            f"/api/v1/accounting/vendors/{self.vendor.id}/operational-summary/"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["vendor"]["id"], self.vendor.id)
        self.assertEqual(response.data["summary"]["purchase_bill_count"], 1)
        self.assertEqual(response.data["summary"]["settlement_count"], 1)
        self.assertEqual(response.data["summary"]["posted_purchase_total"], "1180.00")
        self.assertEqual(response.data["summary"]["posted_settlement_total"], "500.00")
        self.assertEqual(response.data["summary"]["outstanding_payable_total"], "680.00")
        self.assertEqual(len(response.data["purchase_bills"]["rows"]), 1)
        self.assertEqual(len(response.data["settlements"]["rows"]), 1)
        self.assertGreaterEqual(len(response.data["timeline"]), 2)
