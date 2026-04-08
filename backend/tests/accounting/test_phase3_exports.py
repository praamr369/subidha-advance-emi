import os
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from accounting.models import TaxInvoice
from accounting.services.export_pack_service import create_gst_export_pack_job, generate_gst_export_pack
from accounting.services.gst_document_posting_service import ensure_document_sequence
from tests.helpers import create_admin_user


class Phase3ExportsTests(TestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="phase3_export_admin", phone="9363500001")
        TaxInvoice.objects.create(
            invoice_date=timezone.localdate(),
            doc_series=ensure_document_sequence(
                series_code="GST_INV",
                financial_year="2026-27",
                prefix="GSTINV",
            ),
            supplier_name="Subidha Furniture",
            supplier_state_code="18",
            recipient_name="GST Export Customer",
            place_of_supply_state_code="18",
            subtotal_taxable=Decimal("200.00"),
            cgst_amount=Decimal("18.00"),
            sgst_amount=Decimal("18.00"),
            igst_amount=Decimal("0.00"),
            total_amount=Decimal("236.00"),
        )

    def test_gst_export_pack_generation_creates_zip_file(self):
        job = create_gst_export_pack_job(financial_year="2026-27", created_by=self.admin)
        job = generate_gst_export_pack(job_id=job.id)

        self.assertEqual(job.status, "DONE")
        self.assertTrue(job.file_path)
        self.assertTrue(os.path.exists(job.file_path))

