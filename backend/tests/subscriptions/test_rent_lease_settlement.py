"""One-step rent/lease settlement: deposit refund + close/cancel, nothing left owed."""
from datetime import date
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.test import TestCase

from accounting.models import ChartOfAccount, ChartOfAccountType, FinanceAccount, FinanceAccountKind
from contracts.services.rent_lease_billing_service import ensure_security_deposit_demand
from contracts.services.rent_lease_contract_service import create_rent_contract
from contracts.services.rent_lease_settlement_service import (
    build_settlement_preview,
    settle_rent_lease_contract,
)
from payments.models import RentLeaseBillingDemand, RentLeaseDepositTransaction
from subscriptions.models import (
    RentLeaseDemandStatus,
    RentLeaseDemandType,
    RentLeaseDepositTransactionType,
    Subscription,
    SubscriptionStatus,
)
from subscriptions.services.subscription_financial_service import build_subscription_financial_snapshot
from tests.helpers import create_admin_user, create_customer_profile, create_product

DEPOSIT = Decimal("3700.00")


class RentLeaseSettlementTests(TestCase):
    def setUp(self):
        self.admin = create_admin_user(username="settle_admin", phone="9105100001")
        customer = create_customer_profile(name="Settle Customer", phone="9105100002")
        product = create_product(name="Settle Bed", product_code="SETTLE-BED", base_price=Decimal("12000.00"))
        type(product).objects.filter(pk=product.pk).update(is_rent_enabled=True)
        product.refresh_from_db()
        self.subscription = create_rent_contract(
            customer=customer,
            product=product,
            tenure_months=6,
            start_date=date(2026, 6, 1),
            security_deposit_percent=Decimal("20.00"),
            performed_by=self.admin,
        )
        RentLeaseBillingDemand.objects.filter(
            subscription=self.subscription, demand_type=RentLeaseDemandType.RENT_MONTHLY
        ).delete()
        demand = ensure_security_deposit_demand(subscription=self.subscription, performed_by=self.admin)
        type(demand).objects.filter(pk=demand.pk).update(
            amount=DEPOSIT, collected_amount=DEPOSIT, held_amount=DEPOSIT, refundable_amount=DEPOSIT
        )
        chart = ChartOfAccount.objects.create(
            code="TEST-SETTLE-CASH",
            name="Settle Cash",
            account_type=ChartOfAccountType.ASSET,
            is_active=True,
            allow_manual_posting=True,
        )
        self.cash = FinanceAccount.objects.create(
            name="Settle Cash Desk", kind=FinanceAccountKind.CASH, is_active=True, chart_account=chart
        )

    def _status(self, value):
        Subscription.objects.filter(pk=self.subscription.pk).update(status=value)
        self.subscription.refresh_from_db()

    def _rent(self, start, *, collected="0.00", status=RentLeaseDemandStatus.PENDING):
        return RentLeaseBillingDemand.objects.create(
            subscription=self.subscription,
            demand_type=RentLeaseDemandType.RENT_MONTHLY,
            status=status,
            billing_period_start=start,
            billing_period_end=start,
            due_date=start,
            amount=Decimal("2000.00"),
            collected_amount=Decimal(collected),
            reference_key=f"SETTLE-{start.isoformat()}",
        )

    def _settle(self, action, **extra):
        return settle_rent_lease_contract(
            subscription_id=self.subscription.pk,
            action=action,
            performed_by=self.admin,
            finance_account_id=self.cash.pk,
            **extra,
        )

    def test_goods_with_customer_blocks_settlement(self):
        self._status(SubscriptionStatus.HANDED_OVER)

        preview = build_settlement_preview(self.subscription)

        self.assertEqual(preview["allowed_actions"], [])
        self.assertTrue(preview["blockers"])
        with self.assertRaises(ValidationError):
            self._settle("CLOSE")

    def test_returned_contract_refunds_deposit_and_closes_with_nothing_owed(self):
        self._status(SubscriptionStatus.RETURNED)
        self._rent(date(2026, 6, 1), collected="2000.00", status=RentLeaseDemandStatus.PAID)
        earned = self._rent(date(2026, 7, 1), collected="500.00", status=RentLeaseDemandStatus.PARTIAL)

        # Earned rent is not silently dropped.
        with self.assertRaises(ValidationError):
            self._settle("CLOSE")

        result = self._settle("CLOSE", waive_unpaid_rent=True)

        self.assertEqual(result["status"], SubscriptionStatus.CLOSED)
        self.assertEqual(result["deposit_refunded"], "3700.00")
        self.assertEqual(result["waived_rent_amount"], "1500.00")
        earned.refresh_from_db()
        self.assertEqual(earned.status, RentLeaseDemandStatus.WAIVED)
        refund = RentLeaseDepositTransaction.objects.get(
            subscription=self.subscription, transaction_type=RentLeaseDepositTransactionType.DEPOSIT_REFUND
        )
        self.assertEqual(refund.amount, DEPOSIT)
        snapshot = build_subscription_financial_snapshot(Subscription.objects.get(pk=self.subscription.pk))
        self.assertEqual(snapshot["outstanding_amount"], "0.00")

    def test_deduction_reduces_the_refund(self):
        self._status(SubscriptionStatus.RETURNED)

        result = self._settle("CLOSE", deduction_amount="700.00", deduction_reason="Torn fabric")

        self.assertEqual(result["deposit_deducted"], "700.00")
        self.assertEqual(result["deposit_refunded"], "3000.00")

    def test_cancel_before_delivery_cancels_every_unpaid_month(self):
        self._status(SubscriptionStatus.ACTIVE)
        months = [self._rent(date(2026, 6, 1)), self._rent(date(2026, 7, 1))]

        with self.assertRaises(ValidationError):
            self._settle("CANCEL")  # reason required
        result = self._settle("CANCEL", reason="Customer changed mind")

        self.assertEqual(result["status"], SubscriptionStatus.CANCELLED)
        self.assertEqual(result["deposit_refunded"], "3700.00")
        for month in months:
            month.refresh_from_db()
            self.assertEqual(month.status, RentLeaseDemandStatus.CANCELLED)
        snapshot = build_subscription_financial_snapshot(Subscription.objects.get(pk=self.subscription.pk))
        self.assertEqual(snapshot["outstanding_amount"], "0.00")

    def test_refund_needs_a_paying_account(self):
        self._status(SubscriptionStatus.RETURNED)

        with self.assertRaises(ValidationError):
            settle_rent_lease_contract(
                subscription_id=self.subscription.pk, action="CLOSE", performed_by=self.admin
            )
        self.subscription.refresh_from_db()
        self.assertEqual(self.subscription.status, SubscriptionStatus.RETURNED)
