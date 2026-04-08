from datetime import date
from decimal import Decimal

from django.test import TestCase

from accounting.models import ChartOfAccount, ChartOfAccountType, FinanceAccount, FinanceAccountKind, DocumentSequence
from accounting.services.books_service import build_cash_book, build_daily_billing_book
from billing.models import BillingInvoice, BillingInvoiceLine
from billing.services.billing_service import approve_billing_invoice, post_billing_invoice
from inventory.models import InventoryItem
from tests.helpers import create_admin_user, create_customer_profile, create_product


class BooksDailyCashbookTests(TestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="books_admin", phone="9381400001")
        self.customer = create_customer_profile(name="Books Customer", phone="7381400001")
        product = create_product(name="Books Product", product_code="BOOK-001", base_price=Decimal("1500.00"))
        inventory_item = InventoryItem.objects.create(
            product=product,
            sku="BOOK-SKU-001",
            opening_stock_qty=Decimal("10.000"),
            reorder_level_qty=Decimal("1.000"),
            standard_unit_cost=Decimal("900.00"),
        )
        chart_account = ChartOfAccount.objects.create(
            code="BOOK-CASH-001",
            name="Books Cash",
            account_type=ChartOfAccountType.ASSET,
        )
        self.finance_account = FinanceAccount.objects.create(
            name="Books Cash Counter",
            kind=FinanceAccountKind.CASH,
            chart_account=chart_account,
            opening_balance=Decimal("0.00"),
        )
        sequence = DocumentSequence.objects.create(
            series_code="BILL_INV",
            financial_year="2026-27",
            prefix="INV-2026-27",
            next_number=1,
        )
        invoice = BillingInvoice.objects.create(
            invoice_date=date(2026, 4, 22),
            financial_year="2026-27",
            doc_series=sequence,
            customer=self.customer,
            billing_channel="RETAIL",
            tax_mode="NON_GST",
            finance_account=self.finance_account,
            subtotal=Decimal("1500.00"),
            discount_total=Decimal("0.00"),
            taxable_total=Decimal("1500.00"),
            tax_total=Decimal("0.00"),
            grand_total=Decimal("1500.00"),
            received_total=Decimal("1500.00"),
            balance_total=Decimal("0.00"),
            customer_name_snapshot=self.customer.name,
            customer_phone_snapshot=self.customer.phone,
        )
        BillingInvoiceLine.objects.create(
            invoice=invoice,
            product=product,
            inventory_item=inventory_item,
            description="Books line",
            quantity=Decimal("1.000"),
            unit_price=Decimal("1500.00"),
            discount_amount=Decimal("0.00"),
            taxable_value=Decimal("1500.00"),
            cgst_amount=Decimal("0.00"),
            sgst_amount=Decimal("0.00"),
            igst_amount=Decimal("0.00"),
            line_total=Decimal("1500.00"),
        )
        approve_billing_invoice(invoice_id=invoice.id, approved_by=self.admin)
        post_billing_invoice(invoice_id=invoice.id, posted_by=self.admin)

    def test_daily_book_and_cash_book_read_from_posted_data(self):
        sales_book = build_daily_billing_book(start_date=date(2026, 4, 1), end_date=date(2026, 4, 30))
        cash_book = build_cash_book(
            start_date=date(2026, 4, 1),
            end_date=date(2026, 4, 30),
            finance_account_id=self.finance_account.id,
        )

        self.assertEqual(len(sales_book["rows"]), 1)
        self.assertEqual(sales_book["rows"][0]["grand_total"], "1500.00")
        self.assertGreaterEqual(len(cash_book["rows"]), 1)
        self.assertEqual(cash_book["rows"][0]["finance_account_id"], self.finance_account.id)

