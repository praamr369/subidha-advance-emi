from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from accounting.models import ChartOfAccount, ChartOfAccountType, DocumentSequence, FinanceAccount, FinanceAccountKind
from billing.models import BillingInvoice, BillingInvoiceLine
from billing.services.billing_service import approve_billing_invoice, post_billing_invoice
from reminders.models import ReminderStatus, ReminderType
from reminders.services.reminder_send_run_service import run_payment_reminders
from subscriptions.models import EmiStatus
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_customer_profile,
    create_emi,
    create_lucky_id,
    create_product,
    create_subscription,
)


class PaymentRemindersRetailAndEmiTests(TestCase):
    def setUp(self):
        super().setUp()
        self.today = timezone.localdate()
        self.admin = create_admin_user(username="reminder_run_admin", phone="9386300001")
        self.customer = create_customer_profile(name="Reminder Run Customer", phone="7386300001")
        cash_chart = ChartOfAccount.objects.create(
            code="REM-CASH-001",
            name="Reminder Cash",
            account_type=ChartOfAccountType.ASSET,
        )
        finance_account = FinanceAccount.objects.create(
            name="Reminder Cash Counter",
            kind=FinanceAccountKind.CASH,
            chart_account=cash_chart,
            opening_balance=Decimal("0.00"),
        )
        sequence = DocumentSequence.objects.create(
            series_code="REM-BILL-INV",
            financial_year="2026-27",
            prefix="INV-2026-27",
            next_number=1,
        )
        invoice = BillingInvoice.objects.create(
            invoice_date=self.today - timedelta(days=3),
            financial_year="2026-27",
            doc_series=sequence,
            customer=self.customer,
            billing_channel="RETAIL",
            tax_mode="NON_GST",
            finance_account=finance_account,
            subtotal=Decimal("600.00"),
            discount_total=Decimal("0.00"),
            taxable_total=Decimal("600.00"),
            tax_total=Decimal("0.00"),
            grand_total=Decimal("600.00"),
            received_total=Decimal("0.00"),
            balance_total=Decimal("600.00"),
            customer_name_snapshot=self.customer.name,
            customer_phone_snapshot=self.customer.phone,
        )
        BillingInvoiceLine.objects.create(
            invoice=invoice,
            description="Reminder invoice line",
            quantity=Decimal("1.000"),
            unit_price=Decimal("600.00"),
            discount_amount=Decimal("0.00"),
            taxable_value=Decimal("600.00"),
            cgst_amount=Decimal("0.00"),
            sgst_amount=Decimal("0.00"),
            igst_amount=Decimal("0.00"),
            line_total=Decimal("600.00"),
        )
        invoice, _ = approve_billing_invoice(invoice_id=invoice.id, approved_by=self.admin)
        post_billing_invoice(invoice_id=invoice.id, posted_by=self.admin)

        product = create_product(name="Reminder EMI Product", product_code="REM-EMI-001", base_price=Decimal("1800.00"))
        batch = create_batch(
            batch_code="REMEMI2026",
            duration_months=3,
            total_slots=100,
            draw_day=5,
            start_date=self.today - timedelta(days=60),
        )
        lucky_id = create_lucky_id(batch=batch, lucky_number=41)
        subscription = create_subscription(
            customer=self.customer,
            product=product,
            batch=batch,
            lucky_id=lucky_id,
            total_amount=Decimal("1800.00"),
            monthly_amount=Decimal("600.00"),
            tenure_months=3,
            start_date=self.today - timedelta(days=60),
        )
        self.emi = create_emi(
            subscription=subscription,
            month_no=1,
            amount=Decimal("600.00"),
            due_date=self.today - timedelta(days=4),
            status=EmiStatus.PENDING,
        )

    def test_run_creates_and_sends_retail_and_emi_reminders_idempotently(self):
        first_run = run_payment_reminders(
            due_date_on_or_before=self.today,
            send_now=True,
            performed_by=self.admin,
        )
        self.assertEqual(first_run["created_count"], 2)
        self.assertEqual(first_run["sent_count"], 2)

        reminder_types = set(
            type_code
            for type_code in self.customer.payment_reminders.values_list("reminder_type", flat=True)
        )
        self.assertEqual(reminder_types, {ReminderType.RETAIL_DUE, ReminderType.EMI_OVERDUE})
        self.assertEqual(
            self.customer.payment_reminders.filter(status=ReminderStatus.SENT).count(),
            2,
        )

        second_run = run_payment_reminders(
            due_date_on_or_before=self.today,
            send_now=True,
            performed_by=self.admin,
        )
        self.assertEqual(second_run["created_count"], 0)
        self.assertGreaterEqual(second_run["skipped_count"], 2)
