from datetime import date
from decimal import Decimal

from django.test import TestCase
from django.utils.crypto import get_random_string

from subscriptions.models import (
    EmiStatus,
    FinancialLedger,
    LedgerEntryType,
    Payment,
    PlanType,
    RentLeaseBillingDemand,
    RentLeaseDemandType,
    RentLeaseDepositTransactionType,
    SubscriptionStatus,
)
from subscriptions.services.lucky_draw_service import (
    create_lucky_draw_commit,
    reveal_and_execute_draw,
)
from subscriptions.services.payment_service import record_emi_payment
from subscriptions.services.rent_lease_billing_service import (
    collect_security_deposit,
    generate_monthly_demands_for_subscription,
)
from subscriptions.services.rent_lease_contract_service import (
    create_lease_contract,
    create_rent_contract,
)
from services.subscriptions.create_subscription import create_subscription as create_emi_subscription
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_customer_profile,
    create_customer_user,
    create_finance_account,
    create_product,
)


def _token() -> str:
    return get_random_string(8, allowed_chars="0123456789abcdef")


def _admin():
    return create_admin_user(username=f"wf_rl_admin_{_token()}", phone=f"92{_token()[:8]}")


def _customer(name="Rent Lease Workflow Customer"):
    token = _token()
    user = create_customer_user(
        username=f"wf_rl_customer_{token}",
        phone=f"93{token[:8]}",
        email=f"wf-rl-{token}@example.test",
    )
    return create_customer_profile(user=user, name=name, phone=user.phone, email=user.email)


def _product(*, prefix, price, rent=False, lease=False):
    token = _token().upper()
    product = create_product(
        name=f"{prefix} Product {token}",
        product_code=f"{prefix}-{token}",
        base_price=Decimal(str(price)),
    )
    updates = []
    if rent:
        product.is_rent_enabled = True
        updates.append("is_rent_enabled")
    if lease:
        product.is_lease_enabled = True
        updates.append("is_lease_enabled")
    if updates:
        product.save(update_fields=updates)
    return product


def _lucky_plan_subscription(*, admin):
    batch = create_batch(
        batch_code=f"WF-DRAW-{_token().upper()}",
        duration_months=15,
        total_slots=100,
        draw_day=15,
        start_date=date(2026, 1, 1),
        status="OPEN",
    )
    return create_emi_subscription(
        customer=_customer("Draw Workflow Customer"),
        product=_product(prefix="WF-DRAW-P", price=Decimal("15000.00")),
        batch=batch,
        lucky_number=11,
        tenure_months=15,
        start_date=date(2026, 1, 1),
        performed_by=admin,
    )


class RentLeaseProductionWorkflowTests(TestCase):
    def setUp(self):
        self.admin = _admin()
        self.customer = _customer()

    def test_rent_contract_uses_deposit_and_monthly_demand_without_lucky_draw_data(self):
        product = _product(prefix="WF-RENT", price=Decimal("24000.00"), rent=True)
        subscription = create_rent_contract(
            customer=self.customer,
            product=product,
            tenure_months=6,
            start_date=date(2026, 1, 1),
            security_deposit_percent=Decimal("25.00"),
            performed_by=self.admin,
        )
        generate_monthly_demands_for_subscription(subscription=subscription, performed_by=self.admin)
        collect_security_deposit(
            subscription=subscription,
            amount=Decimal("6000.00"),
            performed_by=self.admin,
            reference_no=f"WF-RENT-DEP-{_token()}",
        )

        subscription.refresh_from_db()
        self.assertEqual(subscription.plan_type, PlanType.RENT)
        self.assertIsNone(subscription.batch_id)
        self.assertIsNone(subscription.lucky_id_id)
        self.assertFalse(subscription.emis.exists())
        self.assertTrue(
            RentLeaseBillingDemand.objects.filter(
                subscription=subscription,
                demand_type=RentLeaseDemandType.SECURITY_DEPOSIT,
                collected_amount=Decimal("6000.00"),
            ).exists()
        )
        self.assertTrue(
            RentLeaseBillingDemand.objects.filter(
                subscription=subscription,
                demand_type=RentLeaseDemandType.RENT_MONTHLY,
            ).exists()
        )
        self.assertTrue(
            subscription.deposit_transactions.filter(
                transaction_type=RentLeaseDepositTransactionType.COLLECTION,
                amount=Decimal("6000.00"),
            ).exists()
        )

    def test_lease_contract_uses_deposit_and_monthly_demand_without_lucky_draw_data(self):
        product = _product(prefix="WF-LEASE", price=Decimal("36000.00"), lease=True)
        subscription = create_lease_contract(
            customer=self.customer,
            product=product,
            tenure_months=9,
            start_date=date(2026, 1, 1),
            security_deposit_percent=Decimal("20.00"),
            performed_by=self.admin,
        )
        generate_monthly_demands_for_subscription(subscription=subscription, performed_by=self.admin)
        collect_security_deposit(
            subscription=subscription,
            amount=Decimal("7200.00"),
            performed_by=self.admin,
            reference_no=f"WF-LEASE-DEP-{_token()}",
        )

        subscription.refresh_from_db()
        self.assertEqual(subscription.plan_type, PlanType.LEASE)
        self.assertIsNone(subscription.batch_id)
        self.assertIsNone(subscription.lucky_id_id)
        self.assertFalse(subscription.emis.exists())
        self.assertTrue(
            RentLeaseBillingDemand.objects.filter(
                subscription=subscription,
                demand_type=RentLeaseDemandType.SECURITY_DEPOSIT,
                collected_amount=Decimal("7200.00"),
            ).exists()
        )
        self.assertTrue(
            RentLeaseBillingDemand.objects.filter(
                subscription=subscription,
                demand_type=RentLeaseDemandType.LEASE_MONTHLY,
            ).exists()
        )


class LuckyDrawWinnerProductionWorkflowTests(TestCase):
    def test_winner_waives_only_future_unpaid_emis_and_does_not_create_cash_for_waiver(self):
        admin = _admin()
        finance_account = create_finance_account(
            code=f"WF-DRAW-CASH-{_token().upper()}",
            name=f"Workflow Draw Cash {_token()}",
            kind="CASH",
        )
        subscription = _lucky_plan_subscription(admin=admin)
        paid_emi = subscription.emis.get(month_no=1)
        record_emi_payment(
            emi_id=paid_emi.id,
            amount=paid_emi.amount,
            collected_by=admin,
            method="CASH",
            reference_no=f"WF-DRAW-PAID-{_token()}",
            finance_account_id=finance_account.id,
        )
        payments_before_draw = Payment.objects.count()
        payment_ledgers_before_draw = FinancialLedger.objects.filter(
            entry_type=LedgerEntryType.EMI_PAYMENT
        ).count()

        draw, secret_seed = create_lucky_draw_commit(batch=subscription.batch)
        result = reveal_and_execute_draw(draw_id=draw.id, revealed_seed=secret_seed)
        subscription.refresh_from_db()
        paid_emi.refresh_from_db()

        self.assertEqual(result["winner_subscription_id"], subscription.id)
        self.assertEqual(subscription.status, SubscriptionStatus.WON)
        self.assertIsNotNone(subscription.winner_month)
        self.assertEqual(paid_emi.status, EmiStatus.PAID)
        self.assertGreater(subscription.emis.filter(status=EmiStatus.WAIVED).count(), 0)
        self.assertFalse(subscription.emis.filter(month_no=1, status=EmiStatus.WAIVED).exists())
        self.assertEqual(Payment.objects.count(), payments_before_draw)
        self.assertEqual(
            FinancialLedger.objects.filter(entry_type=LedgerEntryType.EMI_PAYMENT).count(),
            payment_ledgers_before_draw,
        )
        self.assertTrue(
            FinancialLedger.objects.filter(
                emi__subscription=subscription,
                entry_type=LedgerEntryType.EMI_WAIVER,
            ).exists()
        )
