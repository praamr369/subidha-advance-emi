from datetime import date, timedelta
from decimal import Decimal

from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import (
    ChartOfAccount,
    ChartOfAccountType,
    FinanceAccount,
    FinanceAccountKind,
)
from branch_control.models import Branch, CashCounter
from subscriptions.services.payment_service import record_emi_payment
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_cashier_user,
    create_customer_profile,
    create_customer_user,
    create_emi,
    create_lucky_id,
    create_product,
    create_subscription,
)


class CashierBranchScopeTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(
            username="branch_scope_admin",
            phone="9389200001",
        )
        self.cashier = create_cashier_user(
            username="branch_scope_cashier",
            phone="9389200002",
        )
        self.branch_two_cashier = create_cashier_user(
            username="branch_scope_cashier_two",
            phone="9389200003",
        )
        self.branch_one = Branch.objects.filter(is_primary=True).get()
        self.branch_one.code = "BR-ONE"
        self.branch_one.name = "Branch One"
        self.branch_one.status = "ACTIVE"
        self.branch_one.save(update_fields=["code", "name", "status", "updated_at"])
        self.branch_two = Branch.objects.create(
            code="BR-TWO",
            name="Branch Two",
            status="ACTIVE",
            is_primary=False,
        )
        self.cash_account_one = FinanceAccount.objects.create(
            name="Branch One Cash",
            branch=self.branch_one,
            kind=FinanceAccountKind.CASH,
            chart_account=ChartOfAccount.objects.create(
                code="BR1-CASH-001",
                name="Branch One Cash Book",
                account_type=ChartOfAccountType.ASSET,
            ),
            opening_balance=Decimal("0.00"),
        )
        self.cash_account_two = FinanceAccount.objects.create(
            name="Branch Two Cash",
            branch=self.branch_two,
            kind=FinanceAccountKind.CASH,
            chart_account=ChartOfAccount.objects.create(
                code="BR2-CASH-001",
                name="Branch Two Cash Book",
                account_type=ChartOfAccountType.ASSET,
            ),
            opening_balance=Decimal("0.00"),
        )
        self.counter_one = CashCounter.objects.create(
            code="CTR-BR1-01",
            name="Branch One Desk",
            branch=self.branch_one,
            finance_account=self.cash_account_one,
            assigned_user=self.cashier,
            is_active=True,
        )
        self.counter_two = CashCounter.objects.create(
            code="CTR-BR2-01",
            name="Branch Two Desk",
            branch=self.branch_two,
            finance_account=self.cash_account_two,
            assigned_user=self.branch_two_cashier,
            is_active=True,
        )

        today = date(2026, 4, 10)
        self.branch_one_subscription, self.branch_one_paid_emi, self.branch_one_pending_emi = (
            self._create_branch_subscription(
                branch=self.branch_one,
                batch_code="BRSCOPE1",
                lucky_number=1,
                due_date=today - timedelta(days=1),
                future_due_date=today + timedelta(days=30),
            )
        )
        self.branch_two_subscription, self.branch_two_paid_emi, _ = (
            self._create_branch_subscription(
                branch=self.branch_two,
                batch_code="BRSCOPE2",
                lucky_number=2,
                due_date=today - timedelta(days=1),
                future_due_date=today + timedelta(days=30),
            )
        )

        record_emi_payment(
            emi_id=self.branch_one_paid_emi.id,
            amount=Decimal("100.00"),
            collected_by=self.cashier,
            method="CASH",
            reference_no="BR1-PAY-001",
            payment_date=today,
            branch_id=self.branch_one.id,
            cash_counter_id=self.counter_one.id,
        )
        record_emi_payment(
            emi_id=self.branch_two_paid_emi.id,
            amount=Decimal("100.00"),
            collected_by=self.branch_two_cashier,
            method="CASH",
            reference_no="BR2-PAY-001",
            payment_date=today,
            branch_id=self.branch_two.id,
            cash_counter_id=self.counter_two.id,
        )

    def _create_branch_subscription(
        self,
        *,
        branch: Branch,
        batch_code: str,
        lucky_number: int,
        due_date: date,
        future_due_date: date,
    ):
        customer = create_customer_profile(
            user=create_customer_user(
                username=f"{branch.code.lower()}_customer_{lucky_number}",
                phone=f"73992{lucky_number:05d}",
            ),
            name=f"{branch.code} Customer {lucky_number}",
            phone=f"73992{lucky_number:05d}",
        )
        product = create_product(
            name=f"{branch.code} Product {lucky_number}",
            product_code=f"{branch.code}-PRD-{lucky_number:03d}",
            base_price=Decimal("1200.00"),
        )
        batch = create_batch(
            batch_code=batch_code,
            total_slots=100,
            duration_months=12,
        )
        lucky_id = create_lucky_id(batch=batch, lucky_number=lucky_number)
        subscription = create_subscription(
            customer=customer,
            product=product,
            batch=batch,
            lucky_id=lucky_id,
            total_amount=Decimal("1200.00"),
            monthly_amount=Decimal("100.00"),
            tenure_months=12,
        )
        subscription.branch = branch
        subscription.save(update_fields=["branch"])
        paid_emi = create_emi(
            subscription=subscription,
            month_no=1,
            amount=Decimal("100.00"),
            due_date=due_date,
        )
        pending_emi = create_emi(
            subscription=subscription,
            month_no=2,
            amount=Decimal("100.00"),
            due_date=future_due_date,
        )
        return subscription, paid_emi, pending_emi

    def test_cashier_payment_history_only_returns_assigned_branch_rows(self):
        self.client.force_authenticate(user=self.cashier)

        response = self.client.get("/api/v1/cashier/payments/")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["branch_id"], self.branch_one.id)
        self.assertEqual(
            response.data["results"][0]["cash_counter_id"],
            self.counter_one.id,
        )

    def test_cashier_collection_defaults_to_assigned_branch_and_counter(self):
        self.client.force_authenticate(user=self.cashier)

        response = self.client.post(
            "/api/v1/cashier/collect-payment/",
            {
                "emi_id": self.branch_one_pending_emi.id,
                "amount": "100.00",
                "method": "CASH",
                "reference_no": "BR1-CASHIER-002",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data["payment"]["branch_id"], self.branch_one.id)
        self.assertEqual(
            response.data["payment"]["cash_counter_id"],
            self.counter_one.id,
        )

    def test_unassigned_cashier_is_blocked_from_multi_branch_collection(self):
        unassigned_cashier = create_cashier_user(
            username="branch_scope_unassigned",
            phone="9389200099",
        )
        self.client.force_authenticate(user=unassigned_cashier)

        history = self.client.get("/api/v1/cashier/payments/")
        self.assertEqual(history.status_code, status.HTTP_200_OK, history.data)
        self.assertEqual(history.data["count"], 0)

        response = self.client.post(
            "/api/v1/cashier/collect-payment/",
            {
                "emi_id": self.branch_one_pending_emi.id,
                "amount": "100.00",
                "method": "CASH",
                "reference_no": "UNASSIGNED-CASHIER-001",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
        self.assertEqual(response.data["detail"], "User is not assigned to any branch.")
