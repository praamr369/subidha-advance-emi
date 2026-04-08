from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from accounting.models import TaxDocumentStatus, TaxInvoice
from accounting.services.gst_document_posting_service import approve_tax_invoice, ensure_document_sequence, post_tax_invoice
from accounting.services.gst_lifecycle_service import cancel_tax_invoice
from tests.helpers import create_admin_user


class GstCancelReversalTests(TestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="gst_cancel_admin", phone="9363400001")
        self.invoice = TaxInvoice.objects.create(
            invoice_date=timezone.localdate(),
            doc_series=ensure_document_sequence(
                series_code="GST_INV",
                financial_year="2026-27",
                prefix="GSTINV",
            ),
            supplier_name="Subidha Furniture",
            supplier_state_code="18",
            recipient_name="GST Cancel Customer",
            place_of_supply_state_code="18",
            subtotal_taxable=Decimal("100.00"),
            cgst_amount=Decimal("9.00"),
            sgst_amount=Decimal("9.00"),
            igst_amount=Decimal("0.00"),
            total_amount=Decimal("118.00"),
        )

    def test_cancel_posted_tax_invoice_creates_reversal_journal(self):
        approve_tax_invoice(tax_invoice_id=self.invoice.id, approved_by=self.admin)
        invoice, _ = post_tax_invoice(tax_invoice_id=self.invoice.id, posted_by=self.admin)
        invoice, cancelled = cancel_tax_invoice(
            tax_invoice_id=invoice.id,
            performed_by=self.admin,
            reason="Incorrect buyer GSTIN",
        )

        self.assertTrue(cancelled)
        self.assertEqual(invoice.status, TaxDocumentStatus.CANCELLED)
        self.assertIsNotNone(invoice.reversal_journal_entry_id)
        self.assertEqual(
            sum(item.debit_amount for item in invoice.reversal_journal_entry.lines.all()),
            sum(item.credit_amount for item in invoice.reversal_journal_entry.lines.all()),
        )

