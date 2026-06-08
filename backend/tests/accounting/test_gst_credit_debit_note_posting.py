from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from accounting.models import CreditNote, DebitNote, TaxDocumentStatus, TaxInvoice
from accounting.services.gst_document_posting_service import (
    approve_credit_note,
    approve_debit_note,
    approve_tax_invoice,
    ensure_document_sequence,
    post_credit_note,
    post_debit_note,
)
from tests.helpers import create_admin_user
from tests.accounting.helpers import seed_bridge_ready_environment


class GstCreditDebitNotePostingTests(TestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(
            username="gst_notes_admin",
            phone="9364000006",
        )
        seed_bridge_ready_environment(timezone.localdate(), performed_by=self.admin)
        invoice_series = ensure_document_sequence(
            series_code="GST_INV",
            financial_year="2026-27",
            prefix="GSTINV",
        )
        self.invoice = TaxInvoice.objects.create(
            invoice_date=timezone.localdate(),
            doc_series=invoice_series,
            supplier_name="Subidha Furniture",
            supplier_state_code="18",
            recipient_name="GST Note Customer",
            place_of_supply_state_code="18",
            subtotal_taxable=Decimal("500.00"),
            cgst_amount=Decimal("45.00"),
            sgst_amount=Decimal("45.00"),
            igst_amount=Decimal("0.00"),
            total_amount=Decimal("590.00"),
        )
        approve_tax_invoice(tax_invoice_id=self.invoice.id, approved_by=self.admin)
        self.credit_note = CreditNote.objects.create(
            note_date=timezone.localdate(),
            doc_series=ensure_document_sequence(
                series_code="GST_CN",
                financial_year="2026-27",
                prefix="GSTCN",
            ),
            original_invoice=self.invoice,
            reason="Rate adjustment",
            taxable_adjustment=Decimal("100.00"),
            tax_adjustment=Decimal("18.00"),
            total_adjustment=Decimal("118.00"),
        )
        self.debit_note = DebitNote.objects.create(
            note_date=timezone.localdate(),
            doc_series=ensure_document_sequence(
                series_code="GST_DN",
                financial_year="2026-27",
                prefix="GSTDN",
            ),
            original_invoice=self.invoice,
            reason="Quantity increase",
            taxable_adjustment=Decimal("50.00"),
            tax_adjustment=Decimal("9.00"),
            total_adjustment=Decimal("59.00"),
        )

    def test_credit_and_debit_notes_approve_and_post_to_balanced_journals(self):
        approve_credit_note(credit_note_id=self.credit_note.id, approved_by=self.admin)
        approve_debit_note(debit_note_id=self.debit_note.id, approved_by=self.admin)

        credit_note, credit_updated = post_credit_note(
            credit_note_id=self.credit_note.id,
            posted_by=self.admin,
        )
        debit_note, debit_updated = post_debit_note(
            debit_note_id=self.debit_note.id,
            posted_by=self.admin,
        )

        self.assertTrue(credit_updated)
        self.assertTrue(debit_updated)
        self.assertEqual(credit_note.status, TaxDocumentStatus.POSTED)
        self.assertEqual(debit_note.status, TaxDocumentStatus.POSTED)
        self.assertEqual(
            sum(line.debit_amount for line in credit_note.posted_journal_entry.lines.all()),
            sum(line.credit_amount for line in credit_note.posted_journal_entry.lines.all()),
        )
        self.assertEqual(
            sum(line.debit_amount for line in debit_note.posted_journal_entry.lines.all()),
            sum(line.credit_amount for line in debit_note.posted_journal_entry.lines.all()),
        )
