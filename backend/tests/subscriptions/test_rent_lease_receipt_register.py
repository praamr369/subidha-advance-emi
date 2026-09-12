"""Rent/lease receipt register.

Rent/lease collections never become ReceiptDocument or Payment rows, so the
receipt register and payments register read them from
``/admin/subscriptions/rent-lease-receipts/``. The subscription detail's
``rent_lease_collections`` must return exactly the same rows.
"""
from datetime import date
from decimal import Decimal

from rest_framework import status
from rest_framework.test import APITestCase

from contracts.services.rent_lease_billing_service import generate_monthly_demands_for_subscription
from contracts.services.rent_lease_contract_service import create_rent_contract
from payments.models import RentLeaseCollection
from subscriptions.models import RentLeaseBillingDemand, RentLeaseDemandType
from tests.helpers import (
    create_admin_user,
    create_customer_profile,
    create_customer_user,
    create_payment_collection_finance_account,
    create_product,
)

REGISTER_URL = "/api/v1/admin/subscriptions/rent-lease-receipts/"


class RentLeaseReceiptRegisterTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="register_admin", phone="9103000001")
        self.client.force_authenticate(user=self.admin)
        # create_customer_profile defaults every user to "customer_test", so give
        # each customer its own user.
        self.customer = create_customer_profile(
            user=create_customer_user(username="register_rent_customer", phone="9103000002"),
            name="Register Rent Customer",
            phone="9103000002",
        )
        self.other_customer = create_customer_profile(
            user=create_customer_user(username="register_other_customer", phone="9103000003"),
            name="Register Other Customer",
            phone="9103000003",
        )
        product = create_product(
            name="Register Rent Wardrobe",
            product_code="REGISTER-RENT",
            base_price=Decimal("12000.00"),
        )
        product.is_rent_enabled = True
        product.save(update_fields=["is_rent_enabled"])
        self.subscription = create_rent_contract(
            customer=self.customer,
            product=product,
            tenure_months=6,
            start_date=date(2026, 6, 1),
            security_deposit_percent=Decimal("20.00"),
            performed_by=self.admin,
        )
        generate_monthly_demands_for_subscription(
            subscription=self.subscription,
            through_date=date(2026, 6, 1),
            performed_by=self.admin,
        )
        self.first_month = (
            RentLeaseBillingDemand.objects.filter(
                subscription=self.subscription, demand_type=RentLeaseDemandType.RENT_MONTHLY
            )
            .order_by("due_date")
            .first()
        )
        finance_account = create_payment_collection_finance_account(
            code="REGISTER-CASH", name="Register Cash Desk", kind="CASH"
        )
        self.collection = RentLeaseCollection.objects.create(
            demand=self.first_month,
            subscription=self.subscription,
            customer=self.customer,
            plan_type="RENT",
            amount=self.first_month.amount,
            payment_date=date(2026, 6, 1),
            payment_method="CASH",
            finance_account=finance_account,
            created_by=self.admin,
        )

    def test_register_lists_rent_collection_with_contract_and_customer(self):
        response = self.client.get(f"{REGISTER_URL}?subscription={self.subscription.id}")

        self.assertEqual(response.status_code, status.HTTP_200_OK, msg=str(response.data))
        self.assertEqual(response.data["count"], 1)
        row = response.data["results"][0]
        self.assertEqual(row["key"], f"collection-{self.collection.id}")
        self.assertEqual(row["kind"], "RENT_MONTHLY")
        self.assertEqual(Decimal(row["amount"]), self.first_month.amount)
        self.assertEqual(row["payment_date"], "2026-06-01")
        self.assertEqual(row["demand_due_date"], self.first_month.due_date.isoformat())
        self.assertEqual(row["subscription_id"], self.subscription.id)
        self.assertEqual(row["customer_name"], "Register Rent Customer")
        self.assertEqual(row["collected_by_username"], "register_admin")

    def test_customer_filter_narrows_register(self):
        own = self.client.get(f"{REGISTER_URL}?customer={self.customer.id}")
        other = self.client.get(f"{REGISTER_URL}?customer={self.other_customer.id}")

        self.assertEqual(own.status_code, status.HTTP_200_OK, msg=str(own.data))
        self.assertEqual(own.data["count"], 1)
        self.assertEqual(other.status_code, status.HTTP_200_OK, msg=str(other.data))
        self.assertEqual(other.data["count"], 0)

    def test_subscription_detail_returns_same_rows_as_register(self):
        register = self.client.get(f"{REGISTER_URL}?subscription={self.subscription.id}")
        detail = self.client.get(f"/api/v1/admin/subscriptions/{self.subscription.id}/")

        self.assertEqual(detail.status_code, status.HTTP_200_OK, msg=str(detail.data))
        self.assertEqual(detail.data["rent_lease_collections"], register.data["results"])
