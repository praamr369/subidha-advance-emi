from datetime import date
from decimal import Decimal

from rest_framework import status
from rest_framework.test import APITestCase

from subscriptions.models import PlanType, Subscription
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_cashier_user,
    create_customer_profile,
    create_delivery,
    create_lucky_id,
    create_product,
    create_subscription,
)


class AdminDeliverySourcesApiTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="admin_delivery_sources", phone="9331000001")
        self.cashier = create_cashier_user(username="cashier_delivery_sources", phone="9331000002")
        self.customer = create_customer_profile(name="Delivery Source Customer", phone="7331000001")
        self.product = create_product(name="Delivery Source Product", product_code="DLV-SRC-001", base_price=Decimal("1500.00"))
        self.batch = create_batch(batch_code="DLVSRC2026", duration_months=3, start_date=date(2026, 4, 1))
        self.lucky_id = create_lucky_id(batch=self.batch, lucky_number=9)

        self.emi_subscription = create_subscription(
            customer=self.customer,
            product=self.product,
            batch=self.batch,
            lucky_id=self.lucky_id,
            total_amount=Decimal("1500.00"),
            monthly_amount=Decimal("500.00"),
            tenure_months=3,
            start_date=date(2026, 4, 1),
        )
        self.rent_subscription = Subscription.objects.create(
            customer=self.customer,
            product=self.product,
            partner=None,
            batch=None,
            lucky_id=None,
            plan_type=PlanType.RENT,
            tenure_months=6,
            start_date=date(2026, 4, 1),
            total_amount=Decimal("6000.00"),
            monthly_amount=Decimal("1000.00"),
            status="ACTIVE",
            contract_reference="RENT-REF-001",
        )

    def test_sources_block_non_admin(self):
        self.client.force_authenticate(user=self.cashier)
        response = self.client.get("/api/v1/admin/deliveries/sources/subscriptions/?q=7331")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_search_sources_and_filter_by_plan_type(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.get("/api/v1/admin/deliveries/sources/subscriptions/?q=7331000001")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        ids = {row["id"] for row in response.data["results"]}
        self.assertIn(self.emi_subscription.id, ids)
        self.assertIn(self.rent_subscription.id, ids)

        rent_only = self.client.get("/api/v1/admin/deliveries/sources/subscriptions/?q=7331000001&plan_type=RENT")
        self.assertEqual(rent_only.status_code, status.HTTP_200_OK, rent_only.data)
        rent_ids = {row["id"] for row in rent_only.data["results"]}
        self.assertIn(self.rent_subscription.id, rent_ids)
        self.assertNotIn(self.emi_subscription.id, rent_ids)

    def test_prefill_returns_defaults_and_delivery_summary(self):
        self.client.force_authenticate(user=self.admin)
        delivery = create_delivery(
            subscription=self.emi_subscription,
            status="SCHEDULED",
            delivery_reference="DLV-SRC-001",
            scheduled_date=date(2026, 4, 10),
            created_by=self.admin,
            updated_by=self.admin,
        )

        response = self.client.get(
            f"/api/v1/admin/deliveries/sources/subscriptions/{self.emi_subscription.id}/prefill/"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["source"]["id"], self.emi_subscription.id)
        self.assertEqual(response.data["defaults"]["receiver_phone"], self.customer.phone)
        self.assertIn("delivery_address_snapshot", response.data["defaults"])
        self.assertEqual(response.data["source"]["delivery_summary"]["delivery_reference"], delivery.delivery_reference)

