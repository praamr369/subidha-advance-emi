from datetime import date
from decimal import Decimal

from rest_framework import status
from rest_framework.test import APITestCase

from subscriptions.models import DeliveryStatus
from tests.helpers import (
    create_batch,
    create_customer_profile,
    create_customer_user,
    create_delivery,
    create_lucky_id,
    create_partner_user,
    create_product,
    create_subscription,
)


class CustomerDeliveryApiTests(APITestCase):
    def setUp(self):
        self.partner = create_partner_user(
            username="customer_delivery_partner",
            phone="9331000001",
        )
        self.partner.commission_rate = Decimal("5.00")
        self.partner.save(update_fields=["commission_rate"])

        self.customer_user = create_customer_user(
            username="customer_delivery_user",
            phone="7331000001",
        )
        self.customer = create_customer_profile(
            user=self.customer_user,
            name="Customer Delivery A",
            phone="7331000001",
        )
        self.other_customer_user = create_customer_user(
            username="customer_delivery_user_b",
            phone="7331000002",
        )
        self.other_customer = create_customer_profile(
            user=self.other_customer_user,
            name="Customer Delivery B",
            phone="7331000002",
        )

        self.product = create_product(
            name="Customer Delivery Product",
            product_code="CUS-DLV-001",
            base_price=Decimal("2500.00"),
        )
        self.batch = create_batch(
            batch_code="CUSDLV2026",
            duration_months=3,
            total_slots=100,
            draw_day=5,
            start_date=date(2026, 3, 1),
        )

        self.lucky_id = create_lucky_id(batch=self.batch, lucky_number=31)
        self.subscription = create_subscription(
            customer=self.customer,
            product=self.product,
            batch=self.batch,
            lucky_id=self.lucky_id,
            partner=self.partner,
            total_amount=Decimal("2500.00"),
            monthly_amount=Decimal("833.33"),
            tenure_months=3,
        )

        self.other_lucky_id = create_lucky_id(batch=self.batch, lucky_number=32)
        self.other_subscription = create_subscription(
            customer=self.other_customer,
            product=self.product,
            batch=self.batch,
            lucky_id=self.other_lucky_id,
            partner=self.partner,
            total_amount=Decimal("2500.00"),
            monthly_amount=Decimal("833.33"),
            tenure_months=3,
        )

        self.delivery = create_delivery(
            subscription=self.subscription,
            status=DeliveryStatus.OUT_FOR_DELIVERY,
            delivery_reference="CUS-DLV-TRACK-001",
        )
        self.other_delivery = create_delivery(
            subscription=self.other_subscription,
            status=DeliveryStatus.DELIVERED,
            delivery_reference="CUS-DLV-TRACK-002",
        )

    def test_customer_can_list_only_own_deliveries(self):
        self.client.force_authenticate(user=self.customer_user)

        response = self.client.get("/api/v1/customer/deliveries/")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["summary"]["in_transit"], 1)
        self.assertEqual(response.data["results"][0]["delivery_reference"], "CUS-DLV-TRACK-001")

    def test_customer_can_only_view_own_delivery_detail(self):
        self.client.force_authenticate(user=self.customer_user)

        allowed = self.client.get(f"/api/v1/customer/deliveries/{self.delivery.id}/")
        self.assertEqual(allowed.status_code, status.HTTP_200_OK)
        self.assertEqual(allowed.data["status"], DeliveryStatus.OUT_FOR_DELIVERY)

        denied = self.client.get(f"/api/v1/customer/deliveries/{self.other_delivery.id}/")
        self.assertEqual(denied.status_code, status.HTTP_404_NOT_FOUND)

    def test_customer_subscription_detail_exposes_delivery_summary_and_history(self):
        self.client.force_authenticate(user=self.customer_user)

        response = self.client.get(f"/api/v1/customer/subscriptions/{self.subscription.id}/")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["delivery_status"], DeliveryStatus.OUT_FOR_DELIVERY)
        self.assertEqual(response.data["delivery_summary"]["delivery_reference"], "CUS-DLV-TRACK-001")
        self.assertEqual(len(response.data["deliveries"]), 1)
