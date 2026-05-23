from datetime import date
from decimal import Decimal

from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from accounting.models import ChartOfAccount, ChartOfAccountType, FinanceAccount, FinanceAccountKind
from billing.models import BillingDocumentStatus, BillingSourceType, ReceiptDocument, ReceiptType
from branch_control.models import Branch, CashCounter
from reconciliation.models import FinancialSourceLifecycleEvent, ReconciliationItem
from reconciliation.services.financial_source_lifecycle_event_service import create_lifecycle_event
from settlements.models import CashierDayClose, SettlementAllocation
from settlements.services.cashier_day_close_service import compute_system_cash_total
from subscriptions.models import OperationalCancellation, Payment, PaymentMethod
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_cashier_user,
    create_customer_profile,
    create_lucky_id,
    create_product,
    create_subscription,
)


class CashierDayCloseLifecycleValidityTest(TestCase):
    def setUp(self):
        self.cashier = create_cashier_user(username="cdc_lifecycle_cashier", phone="9001000101")
        self.admin = create_admin_user(username="cdc_lifecycle_admin", phone="9001000102")

        self.branch = Branch.objects.create(code="CDC-LC-BR1", name="Lifecycle Main Branch", status="ACTIVE")
        self.branch2 = Branch.objects.create(code="CDC-LC-BR2", name="Lifecycle Second Branch", status="ACTIVE")

        chart_account = ChartOfAccount.objects.create(
            code="CDC-LC-1010",
            name="Lifecycle Cash",
            account_type=ChartOfAccountType.ASSET,
            is_active=True,
            allow_manual_posting=True,
        )
        self.finance_account = FinanceAccount.objects.create(
            branch=self.branch,
            chart_account=chart_account,
            name="Lifecycle Cash Counter 1",
            kind=FinanceAccountKind.CASH,
            is_real_settlement_account=True,
            is_active=True,
        )
        chart_account2 = ChartOfAccount.objects.create(
            code="CDC-LC-1011",
            name="Lifecycle Cash 2",
            account_type=ChartOfAccountType.ASSET,
            is_active=True,
            allow_manual_posting=True,
        )
        self.finance_account2 = FinanceAccount.objects.create(
            branch=self.branch2,
            chart_account=chart_account2,
            name="Lifecycle Cash Counter 2",
            kind=FinanceAccountKind.CASH,
            is_real_settlement_account=True,
            is_active=True,
        )

        self.cash_counter = CashCounter.objects.create(
            branch=self.branch,
            finance_account=self.finance_account,
            code="CDC-LC-CC1",
            name="Lifecycle Counter 1",
            is_active=True,
        )
        self.cash_counter2 = CashCounter.objects.create(
            branch=self.branch2,
            finance_account=self.finance_account2,
            code="CDC-LC-CC2",
            name="Lifecycle Counter 2",
            is_active=True,
        )

        self.customer = create_customer_profile(phone="9001000199")
        self.product = create_product(product_code="TP-CDC-LC-001")
        self.batch = create_batch(batch_code="BATCH-CDC-LC-001")
        self.lucky_id = create_lucky_id(batch=self.batch, lucky_number=51)
        self.subscription = create_subscription(
            customer=self.customer,
            product=self.product,
            batch=self.batch,
            lucky_id=self.lucky_id,
        )

    def _create_payment(
        self,
        *,
        amount: str,
        method: str = PaymentMethod.CASH,
        payment_date=date(2026, 5, 22),
        branch=None,
        cash_counter=None,
        finance_account=None,
    ) -> Payment:
        return Payment.objects.create(
            customer=self.customer,
            subscription=self.subscription,
            amount=Decimal(amount),
            method=method,
            payment_date=payment_date,
            collected_by=self.cashier,
            branch=branch if branch is not None else self.branch,
            cash_counter=cash_counter if cash_counter is not None else self.cash_counter,
            finance_account=finance_account if finance_account is not None else self.finance_account,
        )

    def test_day_close_valid_cash_payment_still_included(self):
        self._create_payment(amount="125.00")

        total = compute_system_cash_total(cashier_id=self.cashier.id, business_date="2026-05-22")

        self.assertEqual(total, Decimal("125.00"))

    def test_day_close_existing_operational_cancellation_still_excluded(self):
        payment = self._create_payment(amount="125.00")
        OperationalCancellation.objects.create(
            source_type=OperationalCancellation.SourceType.EMI_PAYMENT,
            source_id=payment.id,
            cancellation_type=OperationalCancellation.CancellationType.PAYMENT_REVERSAL,
            reason="Existing cancellation evidence",
            cancelled_by=self.admin,
            requested_by=self.admin,
            approved_by=self.admin,
            customer=self.customer,
            amount_snapshot=payment.amount,
        )

        total = compute_system_cash_total(cashier_id=self.cashier.id, business_date="2026-05-22")

        self.assertEqual(total, Decimal("0.00"))

    def test_day_close_lifecycle_payment_invalidation_excluded(self):
        payment = self._create_payment(amount="125.00")
        create_lifecycle_event(
            source_type=FinancialSourceLifecycleEvent.SourceType.EMI_PAYMENT,
            source_id=payment.id,
            event_type=FinancialSourceLifecycleEvent.EventType.REVERSED,
            event_status=FinancialSourceLifecycleEvent.EventStatus.ACTIVE,
            reason="Lifecycle reversal evidence",
            amount=payment.amount,
            created_by=self.admin,
            related_payment=payment,
        )

        total = compute_system_cash_total(cashier_id=self.cashier.id, business_date="2026-05-22")

        self.assertEqual(total, Decimal("0.00"))

    def test_day_close_non_cash_payment_still_excluded(self):
        self._create_payment(amount="125.00", method=PaymentMethod.UPI)

        total = compute_system_cash_total(cashier_id=self.cashier.id, business_date="2026-05-22")

        self.assertEqual(total, Decimal("0.00"))

    def test_day_close_branch_counter_and_finance_account_filters_still_work(self):
        self._create_payment(amount="125.00")
        self._create_payment(
            amount="225.00",
            branch=self.branch2,
            cash_counter=self.cash_counter2,
            finance_account=self.finance_account2,
        )

        total = compute_system_cash_total(
            cashier_id=self.cashier.id,
            business_date="2026-05-22",
            branch_id=self.branch.id,
            cash_counter_id=self.cash_counter.id,
            finance_account_id=self.finance_account.id,
        )

        self.assertEqual(total, Decimal("125.00"))

    def test_day_close_excludes_direct_sale_receipts_without_source_link(self):
        ReceiptDocument.objects.create(
            receipt_no="CDC-LC-DSR-001",
            receipt_type=ReceiptType.RETAIL_RECEIPT,
            status=BillingDocumentStatus.DRAFT,
            receipt_date=date(2026, 5, 22),
            branch=self.branch,
            cash_counter=self.cash_counter,
            finance_account=self.finance_account,
            customer=self.customer,
            source_type=BillingSourceType.DIRECT_SALE,
            source_reference="DIRECT-SALE-CASH-RECEIPT",
            amount=Decimal("999.00"),
        )

        total = compute_system_cash_total(cashier_id=self.cashier.id, business_date="2026-05-22")

        self.assertEqual(total, Decimal("0.00"))

    def test_day_close_preview_does_not_create_allocation_reconciliation_or_lifecycle_event(self):
        self._create_payment(amount="125.00")
        allocation_count_before = SettlementAllocation.objects.count()
        reconciliation_count_before = ReconciliationItem.objects.count()
        lifecycle_count_before = FinancialSourceLifecycleEvent.objects.count()

        client = APIClient()
        client.force_authenticate(user=self.cashier)
        response = client.get(
            f"/api/v1/cashier/day-close/preview/?business_date=2026-05-22&branch_id={self.branch.id}&cash_counter_id={self.cash_counter.id}&finance_account_id={self.finance_account.id}"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["system_cash_total"], "125.00")
        self.assertEqual(SettlementAllocation.objects.count(), allocation_count_before)
        self.assertEqual(ReconciliationItem.objects.count(), reconciliation_count_before)
        self.assertEqual(FinancialSourceLifecycleEvent.objects.count(), lifecycle_count_before)

    def test_day_close_create_does_not_create_allocation_reconciliation_or_lifecycle_event(self):
        payment = self._create_payment(amount="125.00")
        payment_snapshot = {
            "amount": payment.amount,
            "method": payment.method,
            "payment_date": payment.payment_date,
            "branch_id": payment.branch_id,
            "cash_counter_id": payment.cash_counter_id,
            "finance_account_id": payment.finance_account_id,
        }
        allocation_count_before = SettlementAllocation.objects.count()
        reconciliation_count_before = ReconciliationItem.objects.count()
        lifecycle_count_before = FinancialSourceLifecycleEvent.objects.count()

        client = APIClient()
        client.force_authenticate(user=self.cashier)
        response = client.post(
            "/api/v1/cashier/day-close/",
            {
                "business_date": "2026-05-22",
                "counted_cash": "125.00",
                "branch": self.branch.id,
                "cash_counter": self.cash_counter.id,
                "finance_account": self.finance_account.id,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(CashierDayClose.objects.count(), 1)
        self.assertEqual(SettlementAllocation.objects.count(), allocation_count_before)
        self.assertEqual(ReconciliationItem.objects.count(), reconciliation_count_before)
        self.assertEqual(FinancialSourceLifecycleEvent.objects.count(), lifecycle_count_before)

        payment.refresh_from_db()
        self.assertEqual(payment.amount, payment_snapshot["amount"])
        self.assertEqual(payment.method, payment_snapshot["method"])
        self.assertEqual(payment.payment_date, payment_snapshot["payment_date"])
        self.assertEqual(payment.branch_id, payment_snapshot["branch_id"])
        self.assertEqual(payment.cash_counter_id, payment_snapshot["cash_counter_id"])
        self.assertEqual(payment.finance_account_id, payment_snapshot["finance_account_id"])
