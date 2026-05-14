"""Regression: PostgreSQL rejects FOR UPDATE on nullable outer joins.

Service code locks only base rows via select_for_update(of=("self",)), then loads
optional FKs in separate queries. These tests assert flows still succeed on SQLite
and exercise nullable relations used in production (PostgreSQL).
"""

from datetime import date
from decimal import Decimal

from django.test import TestCase

from accounting.models import ChartOfAccount, ChartOfAccountType, DocumentSequence, FinanceAccount, FinanceAccountKind
from billing.models import BillingChannel, BillingDocumentStatus, BillingInvoice, BillingInvoiceLine, BillingSourceType
from billing.services.billing_service import approve_billing_invoice, create_direct_sale, post_billing_invoice
from billing.services.direct_sale_collection_service import collect_direct_sale_payment
from inventory.models import InventoryItem
from tests.helpers import create_admin_user, create_customer_profile, create_product


class BillingInvoiceLockingRegressionTests(TestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="lock_inv_admin", phone="9389000001")
        self.customer = create_customer_profile(name="Lock Inv Customer", phone="7389000001")
        self.product = create_product(name="Lock Inv Product", product_code="LOCK-INV-01", base_price=Decimal("5000.00"))
        self.inventory_item = InventoryItem.objects.create(
            product=self.product,
            sku="LOCK-INV-SKU",
            opening_stock_qty=Decimal("3.000"),
            reorder_level_qty=Decimal("1.000"),
            standard_unit_cost=Decimal("3000.00"),
        )
        self.cash_chart = ChartOfAccount.objects.create(
            code="LOCK-CASH",
            name="Lock Cash",
            account_type=ChartOfAccountType.ASSET,
        )
        self.cash_account = FinanceAccount.objects.create(
            name="Lock Counter",
            kind=FinanceAccountKind.CASH,
            chart_account=self.cash_chart,
            opening_balance=Decimal("0.00"),
        )
        self.sequence = DocumentSequence.objects.create(
            series_code="BILL_INV",
            financial_year="2026-27",
            prefix="INV-2026-27",
            next_number=1,
        )

    def _create_draft_invoice(self, *, subscription=None, direct_sale=None):
        inv = BillingInvoice.objects.create(
            invoice_date=date(2026, 4, 20),
            financial_year="2026-27",
            doc_series=self.sequence,
            customer=self.customer if subscription is None else self.customer,
            subscription=subscription,
            direct_sale=direct_sale,
            billing_channel=BillingChannel.RETAIL,
            source_type=BillingSourceType.MANUAL,
            tax_mode="NON_GST",
            finance_account=self.cash_account,
            subtotal=Decimal("5000.00"),
            discount_total=Decimal("0.00"),
            taxable_total=Decimal("5000.00"),
            tax_total=Decimal("0.00"),
            grand_total=Decimal("5000.00"),
            received_total=Decimal("0.00"),
            balance_total=Decimal("5000.00"),
            customer_name_snapshot=self.customer.name,
            customer_phone_snapshot=self.customer.phone,
        )
        BillingInvoiceLine.objects.create(
            invoice=inv,
            product=self.product,
            inventory_item=self.inventory_item,
            description="Locking regression line",
            quantity=Decimal("1.000"),
            unit_price=Decimal("5000.00"),
            discount_amount=Decimal("0.00"),
            taxable_value=Decimal("5000.00"),
            gst_rate=None,
            cgst_amount=Decimal("0.00"),
            sgst_amount=Decimal("0.00"),
            igst_amount=Decimal("0.00"),
            line_total=Decimal("5000.00"),
            hsn_sac_code="",
        )
        return inv

    def test_approve_invoice_with_null_subscription_does_not_error(self):
        invoice = self._create_draft_invoice(subscription=None)
        approved, updated = approve_billing_invoice(invoice_id=invoice.id, approved_by=self.admin)
        self.assertTrue(updated)
        self.assertEqual(approved.status, BillingDocumentStatus.APPROVED)
        again, again_updated = approve_billing_invoice(invoice_id=invoice.id, approved_by=self.admin)
        self.assertFalse(again_updated)
        self.assertEqual(again.status, BillingDocumentStatus.APPROVED)

    def test_approve_non_approvable_status_raises_value_error(self):
        invoice = self._create_draft_invoice(subscription=None)
        invoice.status = BillingDocumentStatus.CANCELLED
        invoice.save(update_fields=["status", "updated_at"])
        with self.assertRaisesMessage(ValueError, "Cancelled or void invoices cannot be approved."):
            approve_billing_invoice(invoice_id=invoice.id, approved_by=self.admin)

    def test_post_invoice_after_self_only_lock_loads_nullable_fks(self):
        invoice = self._create_draft_invoice(subscription=None)
        approve_billing_invoice(invoice_id=invoice.id, approved_by=self.admin)
        posted, updated = post_billing_invoice(invoice_id=invoice.id, posted_by=self.admin)
        self.assertTrue(updated)
        self.assertEqual(posted.status, BillingDocumentStatus.POSTED)


class DirectSaleCollectionLockingRegressionTests(TestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="lock_ds_admin", phone="9389000002")
        self.customer = create_customer_profile(name="Lock DS Customer", phone="7389000002")
        self.product = create_product(name="Lock DS Product", product_code="LOCK-DS-01", base_price=Decimal("12000.00"))
        self.inventory_item = InventoryItem.objects.create(
            product=self.product,
            sku="LOCK-DS-SKU",
            opening_stock_qty=Decimal("4.000"),
            reorder_level_qty=Decimal("1.000"),
            standard_unit_cost=Decimal("8000.00"),
        )
        cash_chart = ChartOfAccount.objects.create(
            code="LOCK-DS-CASH",
            name="Lock DS Cash",
            account_type=ChartOfAccountType.ASSET,
        )
        self.cash_account = FinanceAccount.objects.create(
            name="Lock DS Counter",
            kind=FinanceAccountKind.CASH,
            chart_account=cash_chart,
            opening_balance=Decimal("0.00"),
        )

    def _partial_paid_sale_payload(self):
        return {
            "sale_date": date(2026, 4, 21),
            "customer": self.customer,
            "tax_mode": "NON_GST",
            "finance_account": self.cash_account,
            "delivery_required": False,
            "received_total": Decimal("2000.00"),
            "customer_name_snapshot": self.customer.name,
            "customer_phone_snapshot": self.customer.phone,
            "lines": [
                {
                    "product": self.product,
                    "inventory_item": self.inventory_item,
                    "description": "Retail line",
                    "quantity": Decimal("1.000"),
                    "unit_price": Decimal("12000.00"),
                    "discount_amount": Decimal("0.00"),
                    "taxable_value": Decimal("12000.00"),
                    "gst_rate": None,
                    "cgst_amount": Decimal("0.00"),
                    "sgst_amount": Decimal("0.00"),
                    "igst_amount": Decimal("0.00"),
                    "line_total": Decimal("12000.00"),
                    "hsn_sac_code": "",
                }
            ],
        }

    def test_partial_collection_with_customer_succeeds(self):
        sale = create_direct_sale(payload=self._partial_paid_sale_payload(), created_by=self.admin)
        invoice = BillingInvoice.objects.get(direct_sale=sale)
        approve_billing_invoice(invoice_id=invoice.id, approved_by=self.admin)
        post_billing_invoice(invoice_id=invoice.id, posted_by=self.admin)

        result = collect_direct_sale_payment(
            direct_sale_id=sale.id,
            amount=Decimal("3000.00"),
            collected_by=self.admin,
            finance_account_id=self.cash_account.id,
        )
        self.assertTrue(result["created"])
        self.product.refresh_from_db()
        self.assertEqual(Decimal(str(self.product.base_price)), Decimal("12000.00"))

    def test_collection_overpayment_rejected(self):
        sale = create_direct_sale(payload=self._partial_paid_sale_payload(), created_by=self.admin)
        invoice = BillingInvoice.objects.get(direct_sale=sale)
        approve_billing_invoice(invoice_id=invoice.id, approved_by=self.admin)
        post_billing_invoice(invoice_id=invoice.id, posted_by=self.admin)

        with self.assertRaisesMessage(ValueError, "Collection amount cannot exceed the current outstanding balance."):
            collect_direct_sale_payment(
                direct_sale_id=sale.id,
                amount=Decimal("999999.00"),
                collected_by=self.admin,
                finance_account_id=self.cash_account.id,
            )

    def test_walk_in_null_customer_partial_collection_succeeds(self):
        payload = self._partial_paid_sale_payload()
        payload["customer"] = None
        payload["customer_name_snapshot"] = "Walk-in Locking"
        payload["customer_phone_snapshot"] = "9812345678"
        sale = create_direct_sale(payload=payload, created_by=self.admin)
        self.assertIsNone(sale.customer_id)
        invoice = BillingInvoice.objects.get(direct_sale=sale)
        approve_billing_invoice(invoice_id=invoice.id, approved_by=self.admin)
        post_billing_invoice(invoice_id=invoice.id, posted_by=self.admin)
        result = collect_direct_sale_payment(
            direct_sale_id=sale.id,
            amount=Decimal("2500.00"),
            collected_by=self.admin,
            finance_account_id=self.cash_account.id,
        )
        self.assertTrue(result["created"])
        self.assertIsNone(result["direct_sale"].customer_id)

    def test_collection_when_fully_paid_rejected(self):
        payload = self._partial_paid_sale_payload()
        payload["received_total"] = Decimal("12000.00")
        sale = create_direct_sale(payload=payload, created_by=self.admin)
        invoice = BillingInvoice.objects.get(direct_sale=sale)
        approve_billing_invoice(invoice_id=invoice.id, approved_by=self.admin)
        post_billing_invoice(invoice_id=invoice.id, posted_by=self.admin)

        with self.assertRaisesMessage(ValueError, "Direct sale has no outstanding balance."):
            collect_direct_sale_payment(
                direct_sale_id=sale.id,
                amount=Decimal("1.00"),
                collected_by=self.admin,
                finance_account_id=self.cash_account.id,
            )
