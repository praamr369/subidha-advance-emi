from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone

from accounting.models import JournalEntry, JournalEntryStatus, TaxDocumentStatus, TaxInvoice
from accounting.services.gst_document_posting_service import (
    approve_tax_invoice,
    ensure_document_sequence,
    post_tax_invoice,
)
from tests.helpers import create_admin_user
from tests.accounting.helpers import seed_bridge_ready_environment


class GstInvoicePostingTests(TestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(
            username="gst_invoice_admin",
            phone="9364000005",
        )
        seed_bridge_ready_environment(timezone.localdate(), performed_by=self.admin)
        self.invoice = TaxInvoice.objects.create(
            invoice_date=timezone.localdate(),
            doc_series=ensure_document_sequence(
                series_code="GST_INV",
                financial_year="2026-27",
                prefix="GSTINV",
            ),
            supplier_name="Subidha Furniture",
            supplier_state_code="18",
            recipient_name="GST Customer",
            place_of_supply_state_code="18",
            subtotal_taxable=Decimal("100.00"),
            cgst_amount=Decimal("9.00"),
            sgst_amount=Decimal("9.00"),
            igst_amount=Decimal("0.00"),
            total_amount=Decimal("118.00"),
        )

    def test_tax_invoice_posting_creates_balanced_journal(self):
        approve_tax_invoice(tax_invoice_id=self.invoice.id, approved_by=self.admin)
        posted_invoice, updated = post_tax_invoice(
            tax_invoice_id=self.invoice.id,
            posted_by=self.admin,
        )
        journal = posted_invoice.posted_journal_entry

        self.assertTrue(updated)
        self.assertEqual(posted_invoice.status, TaxDocumentStatus.POSTED)
        self.assertEqual(journal.status, JournalEntryStatus.POSTED)
        self.assertEqual(journal.lines.count(), 3)
        self.assertEqual(
            sum(line.debit_amount for line in journal.lines.all()),
            sum(line.credit_amount for line in journal.lines.all()),
        )

    def test_tax_invoice_posting_is_atomic_on_failure(self):
        approve_tax_invoice(tax_invoice_id=self.invoice.id, approved_by=self.admin)
        before_count = JournalEntry.objects.count()

        with patch(
            "accounting.services.gst_document_posting_service.post_bridge_entry",
            side_effect=RuntimeError("posting failed"),
        ):
            with self.assertRaisesMessage(RuntimeError, "posting failed"):
                post_tax_invoice(
                    tax_invoice_id=self.invoice.id,
                    posted_by=self.admin,
                )

        self.invoice.refresh_from_db()
        self.assertEqual(JournalEntry.objects.count(), before_count)
        self.assertEqual(self.invoice.status, TaxDocumentStatus.APPROVED)
        self.assertIsNone(self.invoice.posted_journal_entry_id)
