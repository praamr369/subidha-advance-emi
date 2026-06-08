from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from accounting.models import AccountingBridgePosting, ChartOfAccount, ChartOfAccountType, FinanceAccount, FinanceAccountKind
from accounting.services.bridge_run_service import run_bridge_postings, run_emi_payment_bridges
from billing.models import ReceiptDocument, ReceiptType
from subscriptions.services.payment_service import record_emi_payment
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_customer_profile,
    create_emi,
    create_lucky_id,
    create_product,
    create_subscription,
    ensure_document_numbering_profile_for_date,
)
from tests.accounting.helpers import seed_bridge_ready_environment


class BridgeRunServiceIdempotentTests(TestCase):
    def setUp(self):
        super().setUp()
        self.today = timezone.localdate()
        self.admin = create_admin_user(
            username="bridge_run_admin",
            phone="9364000008",
        )
        seed_bridge_ready_environment(self.today, performed_by=self.admin)
        ensure_document_numbering_profile_for_date("DIRECT_SALE_RECEIPT", self.today, performed_by=self.admin)
        customer = create_customer_profile(
            name="Bridge Run Customer",
            phone="7364000001",
        )
        product = create_product(
            name="Bridge Product",
            product_code="BRIDGE-001",
            base_price=Decimal("1000.00"),
        )
        batch = create_batch(
            batch_code="BRIDGE2026",
            duration_months=1,
            total_slots=100,
            draw_day=5,
            start_date=self.today - timedelta(days=10),
        )
        lucky_id = create_lucky_id(batch=batch, lucky_number=41)
        subscription = create_subscription(
            customer=customer,
            product=product,
            batch=batch,
            lucky_id=lucky_id,
            total_amount=Decimal("1000.00"),
            monthly_amount=Decimal("1000.00"),
            tenure_months=1,
            start_date=self.today - timedelta(days=10),
        )
        emi = create_emi(
            subscription=subscription,
            month_no=1,
            amount=Decimal("1000.00"),
            due_date=self.today - timedelta(days=3),
        )
        self.payment = record_emi_payment(
            emi_id=emi.id,
            amount=Decimal("1000.00"),
            collected_by=self.admin,
            method="CASH",
            reference_no="BRIDGE-RUN-PAY-001",
            payment_date=self.today - timedelta(days=2),
        )

    def test_bridge_run_dry_run_and_live_run_are_idempotent(self):
        dry_run = run_bridge_postings(
            start_date=self.today - timedelta(days=7),
            end_date=self.today,
            dry_run=True,
            performed_by=self.admin,
        )
        first_live_run = run_bridge_postings(
            start_date=self.today - timedelta(days=7),
            end_date=self.today,
            dry_run=False,
            performed_by=self.admin,
        )
        second_live_run = run_bridge_postings(
            start_date=self.today - timedelta(days=7),
            end_date=self.today,
            dry_run=False,
            performed_by=self.admin,
        )

        self.assertEqual(dry_run["results"][0]["created_count"], 0)
        self.assertEqual(first_live_run["results"][0]["created_count"], 0)
        self.assertEqual(first_live_run["results"][0]["existing_count"], 1)
        self.assertEqual(second_live_run["results"][0]["created_count"], 0)
        self.assertEqual(second_live_run["results"][0]["existing_count"], 1)
        self.assertEqual(
            AccountingBridgePosting.objects.filter(
                source_model="Payment",
                source_id=str(self.payment["payment"].id),
                purpose="PAYMENT_COLLECTION",
            ).count(),
            1,
        )

    def test_emi_payment_bridge_creates_single_receipt_document(self):
        cash_chart = ChartOfAccount.objects.create(
            code="BRIDGE-EMI-CASH-001",
            name="Bridge EMI Cash",
            account_type=ChartOfAccountType.ASSET,
        )
        FinanceAccount.objects.create(
            name="Bridge EMI Cash Counter",
            kind=FinanceAccountKind.CASH,
            chart_account=cash_chart,
            opening_balance=Decimal("0.00"),
        )

        first_run = run_emi_payment_bridges(
            start_date=self.today - timedelta(days=7),
            end_date=self.today,
            dry_run=False,
            performed_by=self.admin,
        )
        second_run = run_emi_payment_bridges(
            start_date=self.today - timedelta(days=7),
            end_date=self.today,
            dry_run=False,
            performed_by=self.admin,
        )

        self.assertEqual(first_run["created_count"], 1)
        self.assertEqual(first_run["existing_count"], 0)
        self.assertEqual(second_run["created_count"], 0)
        self.assertEqual(second_run["existing_count"], 1)
        receipt = ReceiptDocument.objects.get(payment_id=self.payment["payment"].id)
        self.assertEqual(receipt.receipt_type, ReceiptType.EMI_PAYMENT_RECEIPT)
