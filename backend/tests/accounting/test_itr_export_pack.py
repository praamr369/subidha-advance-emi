import os
import zipfile
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from accounting.models import ChartOfAccount, ChartOfAccountType, JournalEntryType
from accounting.services.export_pack_service import (
    create_itr_export_pack_job,
    generate_itr_export_pack,
)
from accounting.services.journal_posting_service import create_journal_entry, post_journal_entry
from tests.helpers import create_admin_user, ensure_journal_numbering_profile_for_date


class ItrExportPackTests(TestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(
            username="itr_export_admin",
            phone="9364000007",
        )
        self.asset_account = ChartOfAccount.objects.create(
            code="ITR-ASSET-001",
            name="Cash",
            account_type=ChartOfAccountType.ASSET,
        )
        self.equity_account = ChartOfAccount.objects.create(
            code="ITR-EQ-001",
            name="Capital",
            account_type=ChartOfAccountType.EQUITY,
        )
        ensure_journal_numbering_profile_for_date(timezone.localdate(), performed_by=self.admin)
        journal = create_journal_entry(
            entry_date=timezone.localdate(),
            entry_type=JournalEntryType.MANUAL,
            memo="Opening capital",
            lines=[
                {
                    "chart_account": self.asset_account,
                    "debit_amount": Decimal("250.00"),
                    "credit_amount": Decimal("0.00"),
                },
                {
                    "chart_account": self.equity_account,
                    "debit_amount": Decimal("0.00"),
                    "credit_amount": Decimal("250.00"),
                },
            ],
        )
        post_journal_entry(journal_entry_id=journal.id, posted_by=self.admin)

    def test_itr_export_pack_generates_downloadable_zip(self):
        job = create_itr_export_pack_job(
            financial_year="2026-27",
            start_date=timezone.localdate(),
            end_date=timezone.localdate(),
            created_by=self.admin,
        )
        generated_job = generate_itr_export_pack(job_id=job.id)

        self.assertEqual(generated_job.status, "DONE")
        self.assertTrue(os.path.exists(generated_job.file_path))

        with zipfile.ZipFile(generated_job.file_path, "r") as archive:
            names = set(archive.namelist())

        self.assertIn("trial_balance.json", names)
        self.assertIn("profit_loss.json", names)
        self.assertIn("balance_sheet.json", names)
