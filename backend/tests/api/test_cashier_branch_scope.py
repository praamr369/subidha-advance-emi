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
from billing.models import BillingInvoice
from billing.services.billing_service import (
    approve_billing_invoice,
    create_direct_sale,
    post_billing_invoice,
)
from branch_control.models import Branch, CashCounter
from inventory.models import InventoryItem
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

        self.branch_one_direct_sale = self._create_branch_direct_sale(
            branch=self.branch_one,
            counter=self.counter_one,
            finance_account=self.cash_account_one,
            customer_phone="73992010001",
            suffix=1,
        )
        self.branch_two_direct_sale = self._create_branch_direct_sale(
            branch=self.branch_two,
            counter=self.counter_two,
            finance_account=self.cash_account_two,
            customer_phone="73992010002",
            suffix=2,
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

    def _create_branch_direct_sale(
        self,
        *,
        branch: Branch,
        counter: CashCounter,
        finance_account: FinanceAccount,
        customer_phone: str,
        suffix: int,
    ):
        customer = create_customer_profile(
            user=create_customer_user(
                username=f"{branch.code.lower()}_retail_{suffix}",
                phone=customer_phone,
            ),
            name=f"{branch.code} Retail Customer {suffix}",
            phone=customer_phone,
        )
        product = create_product(
            name=f"{branch.code} Direct Product {suffix}",
            product_code=f"{branch.code}-DIR-{suffix:03d}",
            base_price=Decimal("700.00"),
        )
        inventory_item = InventoryItem.objects.create(
            product=product,
            sku=f"{branch.code}-DIRSKU-{suffix:03d}",
            opening_stock_qty=Decimal("5.000"),
            reorder_level_qty=Decimal("1.000"),
            standard_unit_cost=Decimal("450.00"),
        )
        sale = create_direct_sale(
            payload={
                "sale_date": date(2026, 4, 18),
                "customer": customer,
                "branch": branch,
                "cash_counter": counter,
                "tax_mode": "NON_GST",
                "finance_account": finance_account,
                "delivery_required": False,
                "received_total": Decimal("200.00"),
                "customer_name_snapshot": customer.name,
                "customer_phone_snapshot": customer.phone,
                "notes": f"{branch.code} retail receivable",
                "lines": [
                    {
                        "product": product,
                        "inventory_item": inventory_item,
                        "description": "Retail branch direct-sale line",
                        "quantity": Decimal("1.000"),
                        "unit_price": Decimal("700.00"),
                        "discount_amount": Decimal("0.00"),
                        "taxable_value": Decimal("700.00"),
                        "gst_rate": None,
                        "cgst_amount": Decimal("0.00"),
                        "sgst_amount": Decimal("0.00"),
                        "igst_amount": Decimal("0.00"),
                        "line_total": Decimal("700.00"),
                        "hsn_sac_code": "",
                    }
                ],
            },
            created_by=self.admin,
        )
        invoice = BillingInvoice.objects.get(direct_sale=sale)
        approve_billing_invoice(invoice_id=invoice.id, approved_by=self.admin)
        post_billing_invoice(invoice_id=invoice.id, posted_by=self.admin)
        return sale

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

    def test_cashier_finance_accounts_only_return_assigned_branch_rows(self):
        self.client.force_authenticate(user=self.cashier)

        response = self.client.get("/api/v1/cashier/finance-accounts/?is_active=1&page_size=100")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertTrue(response.data["count"] >= 1)
        result_ids = {row["id"] for row in response.data["results"]}
        branch_ids = {row["branch"] for row in response.data["results"]}
        self.assertIn(self.cash_account_one.id, result_ids)
        self.assertNotIn(self.cash_account_two.id, result_ids)
        self.assertEqual(branch_ids, {self.branch_one.id})

    def test_cashier_collection_defaults_to_assigned_branch_and_counter(self):
        self.client.force_authenticate(user=self.cashier)

        response = self.client.post(
            "/api/v1/cashier/collect-payment/",
            {
                "emi_id": self.branch_one_pending_emi.id,
                "amount": "100.00",
                "method": "CASH",
                "finance_account_id": self.cash_account_one.id,
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

    def test_cashier_pending_direct_sales_only_returns_assigned_branch_rows(self):
        self.client.force_authenticate(user=self.cashier)

        allowed = self.client.get(
            f"/api/v1/cashier/pending-direct-sales/?phone={self.branch_one_direct_sale.customer_phone_snapshot}"
        )
        denied = self.client.get(
            f"/api/v1/cashier/pending-direct-sales/?phone={self.branch_two_direct_sale.customer_phone_snapshot}"
        )

        self.assertEqual(allowed.status_code, status.HTTP_200_OK, allowed.data)
        self.assertEqual(allowed.data["total_outstanding_sales"], 1)
        self.assertEqual(allowed.data["direct_sales"][0]["branch_id"], self.branch_one.id)
        self.assertEqual(denied.status_code, status.HTTP_404_NOT_FOUND, denied.data)

    def test_cashier_direct_sale_collection_defaults_to_assigned_branch_and_counter(self):
        self.client.force_authenticate(user=self.cashier)

        response = self.client.post(
            "/api/v1/cashier/collect-direct-sale/",
            {
                "direct_sale_id": self.branch_one_direct_sale.id,
                "amount": "500.00",
                "reference_no": "BR1-DIR-COLL-001",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data["receipt"]["branch_id"], self.branch_one.id)
        self.assertEqual(response.data["receipt"]["cash_counter_id"], self.counter_one.id)
        self.assertEqual(
            response.data["receipt"]["finance_account_id"],
            self.cash_account_one.id,
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
                "finance_account_id": self.cash_account_one.id,
                "reference_no": "UNASSIGNED-CASHIER-001",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
        self.assertEqual(response.data["detail"], "User is not assigned to any branch.")
