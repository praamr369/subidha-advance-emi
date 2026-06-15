from datetime import date
from decimal import Decimal

from django.test import TestCase

from accounting.models import AccountingPeriod, AccountingPeriodStatus, ChartOfAccount, ChartOfAccountType, DocumentSequence, FinanceAccount, FinanceAccountCoaMapping, FinanceAccountKind, FinanceAccountMappingPurpose, FinancialYear
from billing.models import BillingDocumentStatus, BillingInvoice, BillingInvoiceLine, ReceiptDocument, ReceiptType
from billing.services.billing_service import approve_billing_invoice, post_billing_invoice
from inventory.models import InventoryItem, StockLedger, StockMovementType
from tests.helpers import create_admin_user, create_customer_profile, create_product


class BillingInvoicePostingTests(TestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(
            username="billing_invoice_admin",
            phone="9382000001",
        )
        self.customer = create_customer_profile(
            name="Retail Billing Customer",
            phone="7382000001",
        )
        self.product = create_product(
            name="Retail Billing Product",
            product_code="BILL-INV-001",
            base_price=Decimal("1200.00"),
        )
        self.inventory_item = InventoryItem.objects.create(
            product=self.product,
            sku="INV-SKU-001",
            opening_stock_qty=Decimal("10.000"),
            reorder_level_qty=Decimal("2.000"),
            standard_unit_cost=Decimal("800.00"),
        )
        self.cash_chart = ChartOfAccount.objects.create(
            code="BILL-CASH-001",
            name="Billing Cash",
            account_type=ChartOfAccountType.ASSET,
        )
        self.cash_account = FinanceAccount.objects.create(
            name="Main Cash Counter",
            kind=FinanceAccountKind.CASH,
            chart_account=self.cash_chart,
            opening_balance=Decimal("0.00"),
        )
        FinanceAccountCoaMapping.objects.create(
            finance_account=self.cash_account,
            chart_account=self.cash_chart,
            purpose=FinanceAccountMappingPurpose.CASH_COLLECTION,
            is_active=True,
        )
        self.financial_year = FinancialYear.objects.create(
            code="FY2026-27",
            name="FY 2026-27",
            start_date=date(2026, 4, 1),
            end_date=date(2027, 3, 31),
            is_active=True,
            activated_by=self.admin,
        )
        self.sequence = DocumentSequence.objects.create(
            series_code="BILL_INV",
            document_type="TAX_INVOICE",
            financial_year="2026-27",
            financial_year_ref=self.financial_year,
            prefix="INV-2026-27",
            next_number=1,
        )
        self.receipt_sequence = DocumentSequence.objects.create(
            series_code="BILL_RCT",
            document_type="DIRECT_SALE_RECEIPT",
            financial_year="2026-27",
            financial_year_ref=self.financial_year,
            prefix="RCP",
            pattern="RCP/FY{FY}/{number}",
            next_number=1,
        )
        DocumentSequence.objects.create(
            series_code="JE-2026-27",
            document_type="JOURNAL_ENTRY",
            financial_year="2026-27",
            financial_year_ref=self.financial_year,
            prefix="JE",
            pattern="JE/{FY}/{number}",
            next_number=1,
        )

    def test_posting_invoice_creates_receipt_and_stock_ledger(self):
        AccountingPeriod.objects.create(
            code="FY2026-27-APR",
            label="April 2026",
            name="April 2026",
            financial_year=self.financial_year,
            start_date=date(2026, 4, 1),
            end_date=date(2026, 4, 30),
            status=AccountingPeriodStatus.OPEN,
        )
        invoice = BillingInvoice.objects.create(
            invoice_date=date(2026, 4, 12),
            financial_year="2026-27",
            doc_series=self.sequence,
            customer=self.customer,
            billing_channel="RETAIL",
            tax_mode="NON_GST",
            finance_account=self.cash_account,
            subtotal=Decimal("1200.00"),
            discount_total=Decimal("0.00"),
            taxable_total=Decimal("1200.00"),
            tax_total=Decimal("0.00"),
            grand_total=Decimal("1200.00"),
            received_total=Decimal("1200.00"),
            balance_total=Decimal("0.00"),
            customer_name_snapshot=self.customer.name,
            customer_phone_snapshot=self.customer.phone,
        )
        BillingInvoiceLine.objects.create(
            invoice=invoice,
            product=self.product,
            inventory_item=self.inventory_item,
            description="Retail billing line",
            quantity=Decimal("1.000"),
            unit_price=Decimal("1200.00"),
            discount_amount=Decimal("0.00"),
            taxable_value=Decimal("1200.00"),
            cgst_amount=Decimal("0.00"),
            sgst_amount=Decimal("0.00"),
            igst_amount=Decimal("0.00"),
            line_total=Decimal("1200.00"),
        )

        approve_billing_invoice(invoice_id=invoice.id, approved_by=self.admin)
        invoice.refresh_from_db()
        self.assertEqual(invoice.status, BillingDocumentStatus.APPROVED)

        posted_invoice, updated = post_billing_invoice(invoice_id=invoice.id, posted_by=self.admin)
        self.assertTrue(updated)
        self.assertEqual(posted_invoice.status, BillingDocumentStatus.POSTED)
        self.assertIsNotNone(posted_invoice.posted_journal_entry_id)

        self.assertTrue(
            StockLedger.objects.filter(
                inventory_item=self.inventory_item,
                movement_type=StockMovementType.SALE_OUT,
                reference_model="BillingInvoiceLine",
            ).exists()
        )
        receipt = ReceiptDocument.objects.get(billing_invoice=invoice)
        self.assertEqual(receipt.receipt_type, ReceiptType.RETAIL_RECEIPT)
        self.assertEqual(receipt.status, BillingDocumentStatus.POSTED)

    def test_locked_period_blocks_invoice_posting_without_partial_writes(self):
        AccountingPeriod.objects.create(
            code="FY2026-27",
            label="2026-27",
            name="2026-27",
            financial_year=self.financial_year,
            start_date=date(2026, 4, 1),
            end_date=date(2027, 3, 31),
            status=AccountingPeriodStatus.LOCKED,
            locked_by=self.admin,
        )
        invoice = BillingInvoice.objects.create(
            invoice_date=date(2026, 4, 13),
            financial_year="2026-27",
            doc_series=self.sequence,
            customer=self.customer,
            billing_channel="RETAIL",
            tax_mode="NON_GST",
            finance_account=self.cash_account,
            subtotal=Decimal("1200.00"),
            discount_total=Decimal("0.00"),
            taxable_total=Decimal("1200.00"),
            tax_total=Decimal("0.00"),
            grand_total=Decimal("1200.00"),
            received_total=Decimal("1200.00"),
            balance_total=Decimal("0.00"),
            customer_name_snapshot=self.customer.name,
            customer_phone_snapshot=self.customer.phone,
        )
        BillingInvoiceLine.objects.create(
            invoice=invoice,
            product=self.product,
            inventory_item=self.inventory_item,
            description="Locked-period retail billing line",
            quantity=Decimal("1.000"),
            unit_price=Decimal("1200.00"),
            discount_amount=Decimal("0.00"),
            taxable_value=Decimal("1200.00"),
            cgst_amount=Decimal("0.00"),
            sgst_amount=Decimal("0.00"),
            igst_amount=Decimal("0.00"),
            line_total=Decimal("1200.00"),
        )

        approve_billing_invoice(invoice_id=invoice.id, approved_by=self.admin)

        with self.assertRaisesMessage(ValueError, "Accounting period FY2026-27 is locked."):
            post_billing_invoice(invoice_id=invoice.id, posted_by=self.admin)

        invoice.refresh_from_db()
        self.assertEqual(invoice.status, BillingDocumentStatus.APPROVED)
        self.assertIsNone(invoice.posted_journal_entry_id)
        self.assertFalse(ReceiptDocument.objects.filter(billing_invoice=invoice).exists())
        self.assertFalse(
            StockLedger.objects.filter(
                inventory_item=self.inventory_item,
                movement_type=StockMovementType.SALE_OUT,
                reference_model="BillingInvoiceLine",
            ).exists()
        )
