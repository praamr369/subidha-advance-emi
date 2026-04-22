from datetime import date
from decimal import Decimal

from django.test import TestCase

from accounting.models import ChartOfAccount, ChartOfAccountType, FinanceAccount, FinanceAccountKind
from billing.models import BillingDocumentStatus, BillingInvoice, BillingSourceType, DirectSaleStatus, ReceiptDocument
from billing.services.billing_service import (
    approve_billing_invoice,
    create_direct_sale,
    mark_direct_sale_delivered,
    post_billing_invoice,
)
from billing.services.direct_sale_collection_service import collect_direct_sale_payment
from inventory.models import InventoryItem, StockLedger, StockMovementType
from tests.helpers import create_admin_user, create_customer_profile, create_product


class DirectSaleWorkflowTests(TestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(
            username="direct_sale_admin",
            phone="9388000001",
        )
        self.customer = create_customer_profile(
            name="Direct Sale Customer",
            phone="7388000001",
        )
        self.product = create_product(
            name="Direct Sale Sofa",
            product_code="DIR-SALE-001",
            base_price=Decimal("18000.00"),
        )
        self.inventory_item = InventoryItem.objects.create(
            product=self.product,
            sku="DIR-SALE-SKU-001",
            opening_stock_qty=Decimal("5.000"),
            reorder_level_qty=Decimal("1.000"),
            standard_unit_cost=Decimal("12000.00"),
        )
        cash_chart = ChartOfAccount.objects.create(
            code="DIRSALE-CASH-001",
            name="Direct Sale Cash",
            account_type=ChartOfAccountType.ASSET,
        )
        self.cash_account = FinanceAccount.objects.create(
            name="Retail Counter Cash",
            kind=FinanceAccountKind.CASH,
            chart_account=cash_chart,
            opening_balance=Decimal("0.00"),
        )

    def _direct_sale_payload(self, *, delivery_required: bool) -> dict:
        return {
            "sale_date": date(2026, 4, 15),
            "customer": self.customer,
            "tax_mode": "NON_GST",
            "finance_account": self.cash_account,
            "delivery_required": delivery_required,
            "delivery_reference": "DS-DLV-001" if delivery_required else "",
            "received_total": Decimal("18000.00"),
            "customer_name_snapshot": self.customer.name,
            "customer_phone_snapshot": self.customer.phone,
            "notes": "Direct retail furniture sale.",
            "lines": [
                {
                    "product": self.product,
                    "inventory_item": self.inventory_item,
                    "description": "Retail sofa line",
                    "quantity": Decimal("1.000"),
                    "unit_price": Decimal("18000.00"),
                    "discount_amount": Decimal("0.00"),
                    "taxable_value": Decimal("18000.00"),
                    "gst_rate": None,
                    "cgst_amount": Decimal("0.00"),
                    "sgst_amount": Decimal("0.00"),
                    "igst_amount": Decimal("0.00"),
                    "line_total": Decimal("18000.00"),
                    "hsn_sac_code": "",
                }
            ],
        }

    def test_create_direct_sale_creates_linked_draft_invoice(self):
        sale = create_direct_sale(
            payload=self._direct_sale_payload(delivery_required=False),
            created_by=self.admin,
        )

        self.assertEqual(sale.status, DirectSaleStatus.DRAFT)
        self.assertTrue(sale.sale_no)
        self.assertEqual(sale.grand_total, Decimal("18000.00"))

        invoice = BillingInvoice.objects.get(direct_sale=sale)
        self.assertEqual(invoice.status, BillingDocumentStatus.DRAFT)
        self.assertEqual(invoice.source_type, BillingSourceType.DIRECT_SALE)
        self.assertEqual(invoice.source_reference, sale.sale_no)
        self.assertEqual(invoice.billing_channel, "RETAIL")
        self.assertEqual(invoice.lines.count(), 1)

    def test_delivery_required_direct_sale_blocks_invoice_posting_until_delivered(self):
        sale = create_direct_sale(
            payload=self._direct_sale_payload(delivery_required=True),
            created_by=self.admin,
        )
        invoice = BillingInvoice.objects.get(direct_sale=sale)

        approve_billing_invoice(invoice_id=invoice.id, approved_by=self.admin)

        with self.assertRaisesMessage(
            ValueError,
            "Direct-sale final invoices can only be posted after the sale is marked delivered.",
        ):
            post_billing_invoice(invoice_id=invoice.id, posted_by=self.admin)

        sale.refresh_from_db()
        self.assertEqual(sale.status, DirectSaleStatus.DRAFT)
        self.assertFalse(
            StockLedger.objects.filter(
                inventory_item=self.inventory_item,
                movement_type=StockMovementType.SALE_OUT,
                reference_model="BillingInvoiceLine",
            ).exists()
        )

        mark_direct_sale_delivered(
            direct_sale_id=sale.id,
            delivered_by=self.admin,
            delivery_reference="DS-DLV-001",
        )
        post_billing_invoice(invoice_id=invoice.id, posted_by=self.admin)

        sale.refresh_from_db()
        invoice.refresh_from_db()
        self.assertEqual(sale.status, DirectSaleStatus.INVOICED)
        self.assertEqual(invoice.status, BillingDocumentStatus.POSTED)
        self.assertTrue(
            StockLedger.objects.filter(
                inventory_item=self.inventory_item,
                movement_type=StockMovementType.SALE_OUT,
                reference_model="BillingInvoiceLine",
            ).exists()
        )
        self.assertTrue(ReceiptDocument.objects.filter(billing_invoice=invoice).exists())

    def test_collect_direct_sale_payment_updates_receivable_and_receipt_history(self):
        payload = self._direct_sale_payload(delivery_required=False)
        payload["received_total"] = Decimal("5000.00")
        sale = create_direct_sale(payload=payload, created_by=self.admin)
        invoice = BillingInvoice.objects.get(direct_sale=sale)

        approve_billing_invoice(invoice_id=invoice.id, approved_by=self.admin)
        post_billing_invoice(invoice_id=invoice.id, posted_by=self.admin)

        result = collect_direct_sale_payment(
            direct_sale_id=sale.id,
            amount=Decimal("4000.00"),
            collected_by=self.admin,
            finance_account_id=self.cash_account.id,
            reference_no="DIRSALE-COLLECT-001",
            notes="Second collection pass",
        )

        self.assertTrue(result["created"])
        sale.refresh_from_db()
        invoice.refresh_from_db()

        self.assertEqual(sale.received_total, Decimal("9000.00"))
        self.assertEqual(sale.balance_total, Decimal("9000.00"))
        self.assertEqual(invoice.received_total, Decimal("9000.00"))
        self.assertEqual(invoice.balance_total, Decimal("9000.00"))

        self.assertEqual(
            ReceiptDocument.objects.filter(
                direct_sale=sale,
                receipt_type="RETAIL_RECEIPT",
                status=BillingDocumentStatus.POSTED,
            ).count(),
            2,
        )
        self.assertIn("[collection-ref:DIRSALE-COLLECT-001]", result["receipt"].notes)

    def test_collect_direct_sale_payment_is_duplicate_safe_with_reference(self):
        payload = self._direct_sale_payload(delivery_required=False)
        payload["received_total"] = Decimal("8000.00")
        sale = create_direct_sale(payload=payload, created_by=self.admin)
        invoice = BillingInvoice.objects.get(direct_sale=sale)

        approve_billing_invoice(invoice_id=invoice.id, approved_by=self.admin)
        post_billing_invoice(invoice_id=invoice.id, posted_by=self.admin)

        first = collect_direct_sale_payment(
            direct_sale_id=sale.id,
            amount=Decimal("3000.00"),
            collected_by=self.admin,
            finance_account_id=self.cash_account.id,
            reference_no="DIRSALE-DUP-001",
        )
        second = collect_direct_sale_payment(
            direct_sale_id=sale.id,
            amount=Decimal("3000.00"),
            collected_by=self.admin,
            finance_account_id=self.cash_account.id,
            reference_no="DIRSALE-DUP-001",
        )

        self.assertTrue(first["created"])
        self.assertFalse(second["created"])
        self.assertEqual(first["receipt"].id, second["receipt"].id)
