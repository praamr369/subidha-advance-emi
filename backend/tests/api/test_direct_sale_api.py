from datetime import date
from decimal import Decimal

from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import ChartOfAccount, ChartOfAccountType, FinanceAccount, FinanceAccountKind
from inventory.models import InventoryItem
from tests.helpers import create_admin_user, create_customer_profile, create_product


class DirectSaleApiTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(
            username="direct_sale_api_admin",
            phone="9388000011",
        )
        self.client.force_authenticate(user=self.admin)
        self.customer = create_customer_profile(
            name="Direct Sale API Customer",
            phone="7388000011",
        )
        self.product = create_product(
            name="API Direct Sale Product",
            product_code="DIR-SALE-API-001",
            base_price=Decimal("9500.00"),
        )
        self.inventory_item = InventoryItem.objects.create(
            product=self.product,
            sku="DIR-SALE-API-SKU-001",
            opening_stock_qty=Decimal("7.000"),
            reorder_level_qty=Decimal("1.000"),
            standard_unit_cost=Decimal("6500.00"),
        )
        cash_chart = ChartOfAccount.objects.create(
            code="DIRSALE-API-CASH-001",
            name="Direct Sale API Cash",
            account_type=ChartOfAccountType.ASSET,
        )
        self.cash_account = FinanceAccount.objects.create(
            name="API Retail Counter",
            kind=FinanceAccountKind.CASH,
            chart_account=cash_chart,
            opening_balance=Decimal("0.00"),
        )

    def test_admin_can_create_confirm_and_filter_direct_sale_documents(self):
        response = self.client.post(
            "/api/v1/billing/direct-sales/",
            {
                "sale_date": date(2026, 4, 16),
                "customer": self.customer.id,
                "tax_mode": "NON_GST",
                "finance_account": self.cash_account.id,
                "delivery_required": False,
                "customer_name_snapshot": self.customer.name,
                "customer_phone_snapshot": self.customer.phone,
                "subtotal": "9500.00",
                "discount_total": "0.00",
                "taxable_total": "9500.00",
                "tax_total": "0.00",
                "grand_total": "9500.00",
                "received_total": "5000.00",
                "balance_total": "4500.00",
                "notes": "API direct retail sale",
                "lines": [
                    {
                        "product": self.product.id,
                        "inventory_item": self.inventory_item.id,
                        "description": "API retail line",
                        "quantity": "1.000",
                        "unit_price": "9500.00",
                        "discount_amount": "0.00",
                        "taxable_value": "9500.00",
                        "gst_rate": None,
                        "cgst_amount": "0.00",
                        "sgst_amount": "0.00",
                        "igst_amount": "0.00",
                        "line_total": "9500.00",
                        "hsn_sac_code": "",
                    }
                ],
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        direct_sale_id = response.data["id"]
        billing_invoice_id = response.data["billing_invoice_id"]
        self.assertTrue(billing_invoice_id)

        confirm = self.client.post(
            f"/api/v1/billing/direct-sales/{direct_sale_id}/confirm/",
            {},
            format="json",
        )
        self.assertEqual(confirm.status_code, status.HTTP_200_OK, confirm.data)
        self.assertEqual(confirm.data["direct_sale"]["status"], "CONFIRMED")

        invoice_list = self.client.get(
            f"/api/v1/billing/invoices/?direct_sale={direct_sale_id}"
        )
        self.assertEqual(invoice_list.status_code, status.HTTP_200_OK, invoice_list.data)
        self.assertEqual(invoice_list.data["count"], 1)
        self.assertEqual(invoice_list.data["results"][0]["source_type"], "DIRECT_SALE")
        self.assertEqual(invoice_list.data["results"][0]["direct_sale"], direct_sale_id)
