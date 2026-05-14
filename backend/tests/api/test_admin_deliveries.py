from datetime import date
from decimal import Decimal

from rest_framework import status
from rest_framework.test import APITestCase

from subscriptions.models import AuditLog, DeliveryStatus, FulfillmentStatus, SubscriptionDelivery
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_cashier_user,
    create_customer_profile,
    create_delivery,
    create_lucky_id,
    create_partner_user,
    create_product,
    create_subscription,
)


class AdminDeliveryApiTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(
            username="admin_delivery_api",
            phone="9321000001",
        )
        self.cashier = create_cashier_user(
            username="cashier_delivery_api",
            phone="9321000002",
        )
        self.partner = create_partner_user(
            username="partner_delivery_api",
            phone="9321000003",
        )
        self.partner.commission_rate = Decimal("5.00")
        self.partner.save(update_fields=["commission_rate"])
        self.customer = create_customer_profile(
            name="Delivery Admin Customer",
            phone="7321000001",
        )
        self.product = create_product(
            name="Delivery Admin Product",
            product_code="DLV-API-001",
            base_price=Decimal("2500.00"),
        )
        self.batch = create_batch(
            batch_code="DLVAPI2026",
            duration_months=3,
            total_slots=100,
            draw_day=5,
            start_date=date(2026, 3, 1),
        )
        self.lucky_id = create_lucky_id(batch=self.batch, lucky_number=11)
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

    def test_admin_can_create_and_list_deliveries(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.post(
            "/api/v1/admin/deliveries/",
            {
                "subscription": self.subscription.id,
                "status": "SCHEDULED",
                "scheduled_date": "2026-03-18",
                "receiver_name": "Receiver A",
                "receiver_phone": "7321000001",
                "delivery_address_snapshot": "Dhaka Warehouse Road",
                "notes": "Pack carefully",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data["status"], DeliveryStatus.SCHEDULED)
        self.assertEqual(response.data["subscription_id"], self.subscription.id)

        list_response = self.client.get("/api/v1/admin/deliveries/")
        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        self.assertEqual(list_response.data["count"], 1)
        self.assertEqual(list_response.data["summary"]["scheduled"], 1)

        self.subscription.refresh_from_db()
        self.assertEqual(self.subscription.fulfillment_status, FulfillmentStatus.PENDING)

    def test_admin_can_transition_delivery_and_subscription_detail_exposes_summary(self):
        self.client.force_authenticate(user=self.admin)
        delivery = create_delivery(
            subscription=self.subscription,
            status=DeliveryStatus.SCHEDULED,
            delivery_reference="DLV-DETAIL-001",
            scheduled_date=date(2026, 3, 20),
            created_by=self.admin,
            updated_by=self.admin,
        )

        dispatch_response = self.client.post(
            f"/api/v1/admin/deliveries/{delivery.id}/transition/",
            {"status": "DISPATCHED"},
            format="json",
        )
        self.assertEqual(dispatch_response.status_code, status.HTTP_200_OK, dispatch_response.data)

        out_response = self.client.post(
            f"/api/v1/admin/deliveries/{delivery.id}/transition/",
            {"status": "OUT_FOR_DELIVERY"},
            format="json",
        )
        self.assertEqual(out_response.status_code, status.HTTP_200_OK, out_response.data)

        delivered_response = self.client.post(
            f"/api/v1/admin/deliveries/{delivery.id}/mark-delivered/",
            {
                "receiver_name": "Receiver A",
                "receiver_phone": "7321000001",
                "notes": "Delivered to customer",
            },
            format="json",
        )
        self.assertEqual(delivered_response.status_code, status.HTTP_200_OK, delivered_response.data)
        self.assertEqual(delivered_response.data["status"], DeliveryStatus.DELIVERED)

        detail_response = self.client.get(f"/api/v1/admin/subscriptions/{self.subscription.id}/")
        self.assertEqual(detail_response.status_code, status.HTTP_200_OK)
        self.assertEqual(detail_response.data["delivery_summary"]["status"], DeliveryStatus.DELIVERED)
        self.assertEqual(detail_response.data["delivery_summary"]["delivery_reference"], "DLV-DETAIL-001")
        self.assertEqual(len(detail_response.data["deliveries"]), 1)

        self.subscription.refresh_from_db()
        self.assertEqual(self.subscription.fulfillment_status, FulfillmentStatus.DELIVERED)
        self.assertTrue(
            AuditLog.objects.filter(
                action_type=AuditLog.ActionType.DELIVERY_COMPLETED,
                model_name="SubscriptionDelivery",
                object_id=delivery.id,
            ).exists()
        )

    def test_admin_delivery_endpoints_block_non_admin_roles(self):
        self.client.force_authenticate(user=self.cashier)
        response = self.client.get("/api/v1/admin/deliveries/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.client.force_authenticate(user=self.partner)
        response = self.client.get("/api/v1/admin/deliveries/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_delivery_summary_filters_by_subscription_and_bucket(self):
        self.client.force_authenticate(user=self.admin)
        create_delivery(
            subscription=self.subscription,
            status=DeliveryStatus.DELIVERED,
            delivery_reference="DLV-SUM-001",
            created_by=self.admin,
            updated_by=self.admin,
        )

        other_lucky_id = create_lucky_id(batch=self.batch, lucky_number=12)
        other_subscription = create_subscription(
            customer=self.customer,
            product=self.product,
            batch=self.batch,
            lucky_id=other_lucky_id,
            partner=self.partner,
            total_amount=Decimal("2500.00"),
            monthly_amount=Decimal("833.33"),
            tenure_months=3,
        )
        create_delivery(
            subscription=other_subscription,
            status=DeliveryStatus.PENDING,
            delivery_reference="DLV-SUM-002",
            created_by=self.admin,
            updated_by=self.admin,
        )

        response = self.client.get(
            f"/api/v1/admin/deliveries/?subscription={self.subscription.id}&bucket=DELIVERED"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["summary"]["delivered"], 1)
        self.assertEqual(response.data["results"][0]["delivery_reference"], "DLV-SUM-001")
