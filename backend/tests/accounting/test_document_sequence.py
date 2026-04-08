from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from accounting.models import DocumentSequence, TaxInvoice
from accounting.services.gst_document_posting_service import (
    approve_tax_invoice,
    ensure_document_sequence,
)
from tests.helpers import create_admin_user


class DocumentSequenceTests(TestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(
            username="document_sequence_admin",
            phone="9364000004",
        )

    def _create_invoice(self):
        return TaxInvoice.objects.create(
            invoice_date=timezone.localdate(),
            doc_series=ensure_document_sequence(
                series_code="GST_INV",
                financial_year="2026-27",
                prefix="GSTINV",
            ),
            supplier_name="Subidha Furniture",
            supplier_state_code="18",
            recipient_name="Sequence Customer",
            place_of_supply_state_code="18",
            subtotal_taxable=Decimal("100.00"),
            cgst_amount=Decimal("9.00"),
            sgst_amount=Decimal("9.00"),
            igst_amount=Decimal("0.00"),
            total_amount=Decimal("118.00"),
        )

    def test_approvals_issue_consecutive_document_numbers(self):
        first = self._create_invoice()
        second = self._create_invoice()

        approve_tax_invoice(tax_invoice_id=first.id, approved_by=self.admin)
        approve_tax_invoice(tax_invoice_id=second.id, approved_by=self.admin)

        first.refresh_from_db()
        second.refresh_from_db()
        sequence = DocumentSequence.objects.get(series_code="GST_INV")

        self.assertEqual(first.invoice_no, "GSTINV-00001")
        self.assertEqual(second.invoice_no, "GSTINV-00002")
        self.assertEqual(sequence.next_number, 3)
