import io
import zipfile
from datetime import date
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounting.models import ChartOfAccount, ChartOfAccountType, JournalEntryType, TaxInvoice
from accounting.services.export_pack_service import generate_ca_month_end_pack
from accounting.services.journal_posting_service import create_journal_entry, post_journal_entry
from tests.helpers import create_admin_user, ensure_journal_numbering_profile_for_date


class CaMonthlyExportPackTests(TestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(
            username="ca_export_admin",
            phone="9364000088",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin)

        self.asset_account = ChartOfAccount.objects.create(
            code="CA-EXP-001",
            name="Bank Account",
            account_type=ChartOfAccountType.ASSET,
        )
        self.equity_account = ChartOfAccount.objects.create(
            code="CA-EXP-002",
            name="Capital Account",
            account_type=ChartOfAccountType.EQUITY,
        )
        ensure_journal_numbering_profile_for_date(timezone.localdate(), performed_by=self.admin)
        journal = create_journal_entry(
            entry_date=timezone.localdate(),
            entry_type=JournalEntryType.MANUAL,
            memo="Opening cash bank balance",
            lines=[
                {
                    "chart_account": self.asset_account,
                    "debit_amount": Decimal("1000.00"),
                    "credit_amount": Decimal("0.00"),
                },
                {
                    "chart_account": self.equity_account,
                    "debit_amount": Decimal("0.00"),
                    "credit_amount": Decimal("1000.00"),
                },
            ],
        )
        post_journal_entry(journal_entry_id=journal.id, posted_by=self.admin)

    def test_generate_ca_month_end_pack_structure(self):
        today = timezone.localdate()
        filename, zip_bytes = generate_ca_month_end_pack(year=today.year, month=today.month, created_by=self.admin)

        self.assertTrue(filename.endswith(".zip"))
        self.assertIn(f"{today.year}_{today.month:02d}", filename)

        with zipfile.ZipFile(io.BytesIO(zip_bytes), "r") as archive:
            names = set(archive.namelist())

        tag = f"{today.year}_{today.month:02d}"
        self.assertIn(f"GSTR1_Sales_{tag}.csv", names)
        self.assertIn(f"GSTR2_Purchases_{tag}.csv", names)
        self.assertIn(f"Cash_Bank_Book_{tag}.csv", names)
        self.assertIn(f"Trial_Balance_{tag}.csv", names)
        self.assertIn("README.txt", names)

    def test_ca_monthly_pack_endpoint(self):
        today = timezone.localdate()
        # Test standard accounting route
        response = self.client.get(
            f"/api/v1/accounting/exports/ca-monthly-pack/?year={today.year}&month={today.month}"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/zip")
        self.assertIn("attachment; filename=", response["Content-Disposition"])

        # Test admin namespace route
        admin_response = self.client.get(
            f"/api/v1/admin/accounting/exports/ca-monthly-pack/?year={today.year}&month={today.month}"
        )
        self.assertEqual(admin_response.status_code, 200)
        self.assertEqual(admin_response["Content-Type"], "application/zip")

        # Validate that the downloaded response content is indeed a valid zip
        with zipfile.ZipFile(io.BytesIO(response.content), "r") as archive:
            names = set(archive.namelist())
        self.assertIn("README.txt", names)
