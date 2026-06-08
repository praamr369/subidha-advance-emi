from datetime import date
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from accounting.models import AccountingPeriod, AccountingPeriodStatus, DocumentSequence, FinancialYear, TaxInvoice
from accounting.services.document_sequence_service import (
    DocumentNumberingSetupError,
    DocumentType,
    allocate_document_number,
    preview_document_number,
    render_document_number,
    upsert_numbering_profile,
)
from accounting.services.gst_document_posting_service import approve_tax_invoice, ensure_document_sequence
from accounting.services.setup_defaults_service import apply_accounting_setup_defaults
from billing.models import DirectSale
from tests.helpers import create_admin_user


class DocumentNumberingFinancialYearTests(TestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="doc_numbering_fy_admin", phone="9381200099")

    def _activate_fy(self, *, code="FY2026-27", start=date(2026, 4, 1), end=date(2027, 3, 31)):
        return FinancialYear.objects.create(
            code=code,
            name=code,
            start_date=start,
            end_date=end,
            is_active=True,
            activated_by=self.admin,
        )

    def _open_period(self, financial_year, *, start=date(2026, 4, 1), end=date(2026, 4, 30)):
        return AccountingPeriod.objects.create(
            code=f"{financial_year.code}-P01",
            label="April",
            name="April",
            financial_year=financial_year,
            start_date=start,
            end_date=end,
            status=AccountingPeriodStatus.OPEN,
        )

    def test_fy_yyyy_and_yy_tokens_preview(self):
        financial_year = self._activate_fy()

        rendered = render_document_number(
            "INV/FY{FY}/{YYYY}/{YY}/{number}",
            "INV",
            "",
            financial_year,
            None,
            "INV",
            7,
            5,
        )

        self.assertEqual(rendered, "INV/FY2026-27/2026/26/00007")

    def test_yearly_reset_creates_separate_sequence_per_financial_year(self):
        first_fy = self._activate_fy()
        first = upsert_numbering_profile(
            document_type=DocumentType.DIRECT_SALE,
            reference_date=date(2026, 4, 15),
            next_number=8,
        )
        first_fy.is_active = False
        first_fy.save(update_fields=["is_active", "updated_at"])
        self._activate_fy(code="FY2027-28", start=date(2027, 4, 1), end=date(2028, 3, 31))

        second = upsert_numbering_profile(
            document_type=DocumentType.DIRECT_SALE,
            reference_date=date(2027, 4, 15),
            next_number=1,
        )

        self.assertNotEqual(first.id, second.id)
        self.assertEqual(first.financial_year, "2026-27")
        self.assertEqual(second.financial_year, "2027-28")

    def test_missing_active_financial_year_returns_setup_error(self):
        with self.assertRaisesMessage(DocumentNumberingSetupError, "No active financial year is configured"):
            preview_document_number(document_type=DocumentType.DIRECT_SALE, document_date=date(2026, 4, 15))

    def test_missing_numbering_profile_returns_setup_error(self):
        fy = self._activate_fy()
        self._open_period(fy)

        with self.assertRaisesMessage(DocumentNumberingSetupError, "No DIRECT_SALE numbering profile is configured"):
            allocate_document_number(DocumentType.DIRECT_SALE, date(2026, 4, 15))

    def test_safe_defaults_create_missing_journal_entry_profile(self):
        fy = self._activate_fy()
        self._open_period(fy)

        payload = apply_accounting_setup_defaults(performed_by=self.admin)

        sequence = DocumentSequence.objects.get(document_type=DocumentType.JOURNAL_ENTRY, financial_year_ref=fy, is_active=True)
        self.assertEqual(sequence.next_number, 1)
        self.assertTrue(payload["document_numbering"]["journal_entry"]["created"])

    def test_safe_defaults_do_not_overwrite_existing_journal_entry_profile(self):
        fy = self._activate_fy()
        self._open_period(fy)
        sequence = upsert_numbering_profile(
            document_type=DocumentType.JOURNAL_ENTRY,
            prefix="CUSTOMJV",
            next_number=42,
            reference_date=date(2026, 4, 15),
            performed_by=self.admin,
        )

        apply_accounting_setup_defaults(performed_by=self.admin)
        sequence.refresh_from_db()

        self.assertEqual(sequence.prefix, "CUSTOMJV")
        self.assertEqual(sequence.next_number, 42)

    def test_duplicate_number_is_blocked_before_issue(self):
        fy = self._activate_fy()
        self._open_period(fy)
        sequence = upsert_numbering_profile(
            document_type=DocumentType.DIRECT_SALE,
            reference_date=date(2026, 4, 15),
            next_number=1,
        )
        DirectSale.objects.create(
            sale_no="SALE/FY2026-27/00001",
            sale_date=date(2026, 4, 15),
            financial_year="2026-27",
            doc_series=sequence,
            customer_name_snapshot="Walk-in Customer",
            grand_total=Decimal("0.00"),
            received_total=Decimal("0.00"),
            balance_total=Decimal("0.00"),
        )

        with self.assertRaisesMessage(DocumentNumberingSetupError, "already exists"):
            allocate_document_number(DocumentType.DIRECT_SALE, date(2026, 4, 15))

        sequence.refresh_from_db()
        self.assertEqual(sequence.next_number, 1)

    def test_existing_tax_invoice_number_is_not_changed_on_idempotent_approval(self):
        invoice = TaxInvoice.objects.create(
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

        approve_tax_invoice(tax_invoice_id=invoice.id, approved_by=self.admin)
        invoice.refresh_from_db()
        issued_number = invoice.invoice_no
        approve_tax_invoice(tax_invoice_id=invoice.id, approved_by=self.admin)
        invoice.refresh_from_db()

        self.assertEqual(invoice.invoice_no, issued_number)
        self.assertEqual(DocumentSequence.objects.get(pk=invoice.doc_series_id).next_number, 2)
