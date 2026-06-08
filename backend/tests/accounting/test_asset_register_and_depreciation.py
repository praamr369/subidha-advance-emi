from datetime import date
from decimal import Decimal

from django.test import TestCase

from accounting.models import Asset, AssetCategory, DepreciationRun, DepreciationRunStatus
from accounting.services.depreciation_service import post_depreciation_run, run_depreciation
from tests.helpers import create_admin_user, ensure_test_accounting_posting_prerequisites


class AssetRegisterAndDepreciationTests(TestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="asset_depr_admin", phone="9381200001")
        ensure_test_accounting_posting_prerequisites(date(2026, 4, 30), performed_by=self.admin)
        self.category = AssetCategory.objects.create(
            code="FURN-SET",
            name="Furniture Set",
            method="SLM",
            useful_life_months=60,
            default_salvage=Decimal("500.00"),
        )
        self.asset = Asset.objects.create(
            category=self.category,
            description="Showroom sofa",
            acquisition_date=date(2026, 3, 31),
            in_service_date=date(2026, 3, 31),
            cost_amount=Decimal("30000.00"),
            salvage_value=Decimal("500.00"),
        )

    def test_run_and_post_depreciation_creates_balanced_journals(self):
        run_obj = DepreciationRun.objects.create(
            period_start=date(2026, 4, 1),
            period_end=date(2026, 4, 30),
            created_by=self.admin,
        )

        run_obj, updated = run_depreciation(run_id=run_obj.id, performed_by=self.admin)
        run_obj.refresh_from_db()
        self.assertTrue(updated)
        self.assertEqual(run_obj.status, DepreciationRunStatus.RUNNING)
        self.assertEqual(run_obj.lines.count(), 1)

        run_obj, posted = post_depreciation_run(run_id=run_obj.id, posted_by=self.admin)
        self.assertTrue(posted)
        self.assertEqual(run_obj.status, DepreciationRunStatus.POSTED)
        line = run_obj.lines.get()
        self.assertIsNotNone(line.journal_entry_id)
        self.assertEqual(
            sum(item.debit_amount for item in line.journal_entry.lines.all()),
            sum(item.credit_amount for item in line.journal_entry.lines.all()),
        )
        self.asset.refresh_from_db()
        self.assertGreater(self.asset.accumulated_depreciation, Decimal("0.00"))
