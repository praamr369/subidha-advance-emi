from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from accounting.models import AccountingBridgePosting, ChartOfAccount, ChartOfAccountType, FinanceAccount, FinanceAccountKind
from billing.models import ReceiptType
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


class EmiReceiptGenerationBridgeTests(TestCase):
    def setUp(self):
        super().setUp()
        today = timezone.localdate()
        self.admin = create_admin_user(username="emi_bridge_admin", phone="9386200001")
        self.customer = create_customer_profile(name="EMI Bridge Customer", phone="7386200001")
        product = create_product(name="EMI Bridge Product", product_code="EMI-BRIDGE-001", base_price=Decimal("2400.00"))
        batch = create_batch(
            batch_code="EMIBRIDGE2026",
            duration_months=3,
            total_slots=100,
            draw_day=5,
            start_date=today - timedelta(days=45),
        )
        lucky_id = create_lucky_id(batch=batch, lucky_number=18)
        subscription = create_subscription(
            customer=self.customer,
            product=product,
            batch=batch,
            lucky_id=lucky_id,
            total_amount=Decimal("2400.00"),
            monthly_amount=Decimal("800.00"),
            tenure_months=3,
            start_date=today - timedelta(days=45),
        )
        emi = create_emi(
            subscription=subscription,
            month_no=1,
            amount=Decimal("800.00"),
            due_date=today - timedelta(days=2),
        )
        self.payment = record_emi_payment(
            emi_id=emi.id,
            amount=Decimal("800.00"),
            collected_by=self.admin,
            method="CASH",
            reference_no="EMI-BRIDGE-PAY-001",
            payment_date=today,
        )["payment"]
        cash_chart = ChartOfAccount.objects.create(
            code="EMIBRIDGE-CASH-001",
            name="EMI Bridge Cash",
            account_type=ChartOfAccountType.ASSET,
        )
        self.cash_account = FinanceAccount.objects.create(
            name="EMI Bridge Counter",
            kind=FinanceAccountKind.CASH,
            chart_account=cash_chart,
            opening_balance=Decimal("0.00"),
        )

    def test_generate_emi_payment_receipt_posts_once_per_payment(self):
        receipt, created = generate_emi_payment_receipt(
            payment_id=self.payment.id,
            finance_account_id=self.cash_account.id,
            performed_by=self.admin,
        )
        self.assertTrue(created)
        self.assertEqual(receipt.receipt_type, ReceiptType.EMI_PAYMENT_RECEIPT)
        self.assertTrue(
            AccountingBridgePosting.objects.filter(
                source_model="ReceiptDocument",
                source_id=str(receipt.id),
                purpose=ReceiptType.EMI_PAYMENT_RECEIPT,
            ).exists()
        )

        second_receipt, created_again = generate_emi_payment_receipt(
            payment_id=self.payment.id,
            finance_account_id=self.cash_account.id,
            performed_by=self.admin,
        )
        self.assertFalse(created_again)
        self.assertEqual(second_receipt.id, receipt.id)
        self.assertEqual(
            AccountingBridgePosting.objects.filter(
                source_model="ReceiptDocument",
                source_id=str(receipt.id),
                purpose=ReceiptType.EMI_PAYMENT_RECEIPT,
            ).count(),
            1,
        )

