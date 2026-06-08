from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from accounting.models import (
    ChartOfAccount,
    ChartOfAccountType,
    ExpenseVoucher,
    ExpenseVoucherStatus,
    FinanceAccount,
    FinanceAccountKind,
)
from accounting.services.expense_posting_service import (
    approve_expense_voucher,
    post_expense_voucher,
)
from subscriptions.models import AuditLog
from tests.helpers import create_admin_user
from tests.accounting.helpers import seed_bridge_ready_environment


class AccountingExpensePostingTests(TestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(
            username="accounting_expense_admin",
            phone="9340000002",
        )
        seed_bridge_ready_environment(performed_by=self.admin)
        self.cash_chart = ChartOfAccount.objects.create(
            code="ACC-CASH-002",
            name="Expense Cash",
            account_type=ChartOfAccountType.ASSET,
        )
        self.expense_chart = ChartOfAccount.objects.create(
            code="ACC-EXP-002",
            name="Office Expense",
            account_type=ChartOfAccountType.EXPENSE,
        )
        self.finance_account = FinanceAccount.objects.create(
            name="Cash Counter",
            kind=FinanceAccountKind.CASH,
            chart_account=self.cash_chart,
            opening_balance=Decimal("0.00"),
        )
        self.expense = ExpenseVoucher.objects.create(
            expense_date=timezone.localdate(),
            expense_account=self.expense_chart,
            gross_amount=Decimal("120.00"),
            tax_amount=Decimal("0.00"),
            net_amount=Decimal("120.00"),
            payment_mode="CASH",
            finance_account=self.finance_account,
            notes="Stationery",
        )

    def test_expense_voucher_requires_approval_before_posting(self):
        with self.assertRaisesMessage(
            ValueError,
            "Expense voucher must be approved before posting.",
        ):
            post_expense_voucher(
                expense_voucher_id=self.expense.id,
                posted_by=self.admin,
            )

    def test_expense_voucher_approval_and_posting_create_auditable_journal(self):
        approved_voucher, approved = approve_expense_voucher(
            expense_voucher_id=self.expense.id,
            approved_by=self.admin,
        )
        self.assertTrue(approved)
        self.assertEqual(approved_voucher.status, ExpenseVoucherStatus.APPROVED)

        posted_voucher, posted = post_expense_voucher(
            expense_voucher_id=self.expense.id,
            posted_by=self.admin,
        )
        posted_voucher.refresh_from_db()

        self.assertTrue(posted)
        self.assertEqual(posted_voucher.status, ExpenseVoucherStatus.POSTED)
        self.assertIsNotNone(posted_voucher.posted_journal_entry_id)
        self.assertEqual(posted_voucher.posted_journal_entry.lines.count(), 2)

        audit_events = list(
            AuditLog.objects.filter(
                model_name="ExpenseVoucher",
                object_id=posted_voucher.id,
            ).values_list("metadata", flat=True)
        )
        self.assertTrue(
            any(event.get("event") == "ACCOUNTING_EXPENSE_APPROVED" for event in audit_events)
        )
        self.assertTrue(
            any(event.get("event") == "ACCOUNTING_EXPENSE_POSTED" for event in audit_events)
        )
