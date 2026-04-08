from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from accounting.models import (
    AccountingBridgePosting,
    ChartOfAccount,
    ChartOfAccountType,
)
from accounting.services.bridge_posting_service import post_bridge_entry
from tests.helpers import create_admin_user
from accounting.models import Vendor


class AccountingBridgeIdempotencyTests(TestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(
            username="accounting_bridge_admin",
            phone="9340000005",
        )
        self.asset_account = ChartOfAccount.objects.create(
            code="ACC-ASSET-004",
            name="Bridge Asset",
            account_type=ChartOfAccountType.ASSET,
        )
        self.income_account = ChartOfAccount.objects.create(
            code="ACC-INCOME-004",
            name="Bridge Income",
            account_type=ChartOfAccountType.INCOME,
        )
        self.vendor = Vendor.objects.create(name="Bridge Source Vendor")

    def test_bridge_posting_is_idempotent_by_source_and_purpose(self):
        first_journal, created = post_bridge_entry(
            source_instance=self.vendor,
            purpose="OPENING_BALANCE",
            entry_date=timezone.localdate(),
            memo="Opening balance bridge",
            posted_by=self.admin,
            lines=[
                {
                    "chart_account": self.asset_account,
                    "debit_amount": Decimal("500.00"),
                    "credit_amount": Decimal("0.00"),
                },
                {
                    "chart_account": self.income_account,
                    "debit_amount": Decimal("0.00"),
                    "credit_amount": Decimal("500.00"),
                },
            ],
        )
        second_journal, created_again = post_bridge_entry(
            source_instance=self.vendor,
            purpose="OPENING_BALANCE",
            entry_date=timezone.localdate(),
            memo="Opening balance bridge retry",
            posted_by=self.admin,
            lines=[
                {
                    "chart_account": self.asset_account,
                    "debit_amount": Decimal("500.00"),
                    "credit_amount": Decimal("0.00"),
                },
                {
                    "chart_account": self.income_account,
                    "debit_amount": Decimal("0.00"),
                    "credit_amount": Decimal("500.00"),
                },
            ],
        )

        self.assertTrue(created)
        self.assertFalse(created_again)
        self.assertEqual(first_journal.id, second_journal.id)
        self.assertEqual(
            AccountingBridgePosting.objects.filter(
                source_model="Vendor",
                source_id=str(self.vendor.id),
                purpose="OPENING_BALANCE",
            ).count(),
            1,
        )
