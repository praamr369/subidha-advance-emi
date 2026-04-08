from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from accounting.models import ChartOfAccount, ChartOfAccountType, FinanceAccount, FinanceAccountKind
from billing.models import BillingDocumentStatus, ReceiptType
from billing.services.billing_service import generate_emi_payment_receipt
from subscriptions.services.payment_service import record_emi_payment
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_customer_profile,
    create_emi,
    create_lucky_id,
    create_product,
    create_subscription,
)


class BillingEmiReceiptGenerationTests(TestCase):
    def setUp(self):
        super().setUp()
        self.today = timezone.localdate()
        self.admin = create_admin_user(
            username="emi_receipt_admin",
            phone="9383000001",
        )
        self.customer = create_customer_profile(
            name="EMI Receipt Customer",
            phone="7383000001",
        )
        product = create_product(
            name="EMI Receipt Product",
            product_code="EMI-RCT-001",
            base_price=Decimal("3000.00"),
        )
        batch = create_batch(
            batch_code="EMIRCT2026",
            duration_months=3,
            total_slots=100,
            draw_day=5,
            start_date=self.today - timedelta(days=30),
        )
        lucky_id = create_lucky_id(batch=batch, lucky_number=8)
        subscription = create_subscription(
            customer=self.customer,
            product=product,
            batch=batch,
            lucky_id=lucky_id,
            total_amount=Decimal("3000.00"),
            monthly_amount=Decimal("1000.00"),
            tenure_months=3,
            start_date=self.today - timedelta(days=30),
        )
        emi = create_emi(
            subscription=subscription,
            month_no=1,
            amount=Decimal("1000.00"),
            due_date=self.today - timedelta(days=1),
        )
        payment_result = record_emi_payment(
            emi_id=emi.id,
            amount=Decimal("1000.00"),
            collected_by=self.admin,
            method="CASH",
            reference_no="EMI-RECEIPT-001",
            payment_date=self.today,
        )
        self.payment = payment_result["payment"]
        cash_chart = ChartOfAccount.objects.create(
            code="EMI-CASH-001",
            name="EMI Cash",
            account_type=ChartOfAccountType.ASSET,
        )
        self.cash_account = FinanceAccount.objects.create(
            name="EMI Counter Cash",
            kind=FinanceAccountKind.CASH,
            chart_account=cash_chart,
            opening_balance=Decimal("0.00"),
        )

    def test_emi_payment_receipt_generation_is_idempotent(self):
        receipt, created = generate_emi_payment_receipt(
            payment_id=self.payment.id,
            finance_account_id=self.cash_account.id,
            performed_by=self.admin,
        )
        self.assertTrue(created)
        self.assertEqual(receipt.receipt_type, ReceiptType.EMI_PAYMENT_RECEIPT)
        self.assertEqual(receipt.status, BillingDocumentStatus.POSTED)
        self.assertIsNotNone(receipt.posted_journal_entry_id)

        second_receipt, created_again = generate_emi_payment_receipt(
            payment_id=self.payment.id,
            finance_account_id=self.cash_account.id,
            performed_by=self.admin,
        )
        self.assertFalse(created_again)
        self.assertEqual(receipt.id, second_receipt.id)
