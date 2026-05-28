from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from subscriptions.models import (
    Batch,
    BatchStatus,
    ContractAmendment,
    Customer,
    LuckyId,
    PlanType,
    Product,
    Subscription,
    SubscriptionStatus,
)


class AdminContractAmendmentCustomerFilterTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        User = get_user_model()
        self.admin = User.objects.create_user(
            username="amend_filter_admin",
            password="pass1234",
            role="ADMIN",
            phone="9800010100",
        )
        self.cashier = User.objects.create_user(
            username="amend_filter_cashier",
            password="pass1234",
            role="CASHIER",
            phone="9800010101",
        )
        self.customer_user = User.objects.create_user(
            username="amend_filter_customer",
            password="pass1234",
            role="CUSTOMER",
            phone="9800010102",
        )
        self.other_customer_user = User.objects.create_user(
            username="amend_filter_other_customer",
            password="pass1234",
            role="CUSTOMER",
            phone="9800010103",
        )
        self.customer = Customer.objects.create(
            user=self.customer_user,
            name="Filter Customer",
            phone="9800010102",
        )
        self.other_customer = Customer.objects.create(
            user=self.other_customer_user,
            name="Other Filter Customer",
            phone="9800010103",
        )
        self.product = Product.objects.create(
            product_code="FILTER-PROD-1",
            name="Filter Product",
            base_price=Decimal("20000.00"),
            is_active=True,
        )
        self.batch = Batch.objects.create(
            batch_code="FILTER-BATCH-1",
            total_slots=100,
            duration_months=10,
            draw_day=5,
            start_date=date(2026, 1, 1),
            status=BatchStatus.OPEN,
        )
        self.lucky_id = LuckyId.objects.filter(batch=self.batch, lucky_number=1).first() or LuckyId.objects.create(
            batch=self.batch,
            lucky_number=1,
        )
        self.other_lucky_id = LuckyId.objects.filter(batch=self.batch, lucky_number=2).first() or LuckyId.objects.create(
            batch=self.batch,
            lucky_number=2,
        )
        self.subscription = Subscription.objects.create(
            customer=self.customer,
            product=self.product,
            batch=self.batch,
            lucky_id=self.lucky_id,
            plan_type=PlanType.EMI,
            tenure_months=10,
            start_date=date(2026, 1, 1),
            total_amount=Decimal("20000.00"),
            monthly_amount=Decimal("2000.00"),
            status=SubscriptionStatus.ACTIVE,
        )
        self.other_subscription = Subscription.objects.create(
            customer=self.other_customer,
            product=self.product,
            batch=self.batch,
            lucky_id=self.other_lucky_id,
            plan_type=PlanType.EMI,
            tenure_months=10,
            start_date=date(2026, 1, 1),
            total_amount=Decimal("20000.00"),
            monthly_amount=Decimal("2000.00"),
            status=SubscriptionStatus.ACTIVE,
        )
        self.customer_amendment = ContractAmendment.objects.create(
            subscription=self.subscription,
            contract_type="EMI_SUBSCRIPTION",
            customer=self.customer,
            requested_by=self.customer_user,
            requested_role="CUSTOMER",
            amendment_type="ADDRESS_CHANGE",
            reason="Customer 360 filter row.",
        )
        self.other_amendment = ContractAmendment.objects.create(
            subscription=self.other_subscription,
            contract_type="EMI_SUBSCRIPTION",
            customer=self.other_customer,
            requested_by=self.other_customer_user,
            requested_role="CUSTOMER",
            amendment_type="CONTACT_CORRECTION",
            reason="Other customer filter row.",
        )

    def test_admin_amendment_list_filters_by_customer_without_mutation(self):
        before_statuses = list(
            ContractAmendment.objects.order_by("id").values_list("id", "status")
        )
        self.client.force_authenticate(self.admin)

        response = self.client.get(
            f"/api/v1/admin/contract-amendments/?customer={self.customer.id}"
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual([row["id"] for row in response.data], [self.customer_amendment.id])
        self.assertEqual(
            list(ContractAmendment.objects.order_by("id").values_list("id", "status")),
            before_statuses,
        )

    def test_admin_amendment_list_filters_by_customer_search_value(self):
        self.client.force_authenticate(self.admin)

        response = self.client.get("/api/v1/admin/contract-amendments/?customer=9800010102")

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual([row["id"] for row in response.data], [self.customer_amendment.id])

    def test_non_admin_cannot_access_customer_filter(self):
        self.client.force_authenticate(self.cashier)

        response = self.client.get(
            f"/api/v1/admin/contract-amendments/?customer={self.customer.id}"
        )

        self.assertEqual(response.status_code, 403)
