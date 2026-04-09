from datetime import date, timedelta
from decimal import Decimal

from rest_framework import status
from rest_framework.test import APITestCase

from subscriptions.models import DeliveryStatus, FulfillmentStatus
from subscriptions.services.payment_service import record_emi_payment
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_customer_profile,
    create_delivery,
    create_emi,
    create_lucky_id,
    create_product,
    create_subscription,
)


class BillingSyncEndpointTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(
            username="billing_sync_api_admin",
            phone="9387000020",
        )
        self.client.force_authenticate(user=self.admin)
        self.customer = create_customer_profile(
            name="Billing Sync API Customer",
            phone="7387000020",
        )
        product = create_product(
            name="Billing Sync API Product",
            product_code="BILL-SYNC-API-001",
            base_price=Decimal("2400.00"),
        )
        batch = create_batch(
            batch_code="BILLSYNCAPI2026",
            duration_months=2,
            total_slots=100,
            draw_day=5,
            start_date=date(2026, 4, 1),
        )
        lucky_id = create_lucky_id(batch=batch, lucky_number=21)
        today = batch.start_date
        self.subscription = create_subscription(
            customer=self.customer,
            product=product,
            batch=batch,
            lucky_id=lucky_id,
            total_amount=Decimal("2400.00"),
            monthly_amount=Decimal("1200.00"),
            tenure_months=2,
            start_date=today,
        )
        self.emi = create_emi(
            subscription=self.subscription,
            month_no=1,
            amount=Decimal("1200.00"),
            due_date=today + timedelta(days=5),
        )
        create_emi(
            subscription=self.subscription,
            month_no=2,
            amount=Decimal("1200.00"),
            due_date=today + timedelta(days=35),
        )
        create_delivery(
            subscription=self.subscription,
            status=DeliveryStatus.DELIVERED,
            created_by=self.admin,
            updated_by=self.admin,
        )
        self.subscription.fulfillment_status = FulfillmentStatus.DELIVERED
        self.subscription.save(update_fields=["fulfillment_status"])
        payment_result = record_emi_payment(
            emi_id=self.emi.id,
            amount=Decimal("1200.00"),
            collected_by=self.admin,
            method="CASH",
            reference_no="SYNC-ENDPOINT-001",
            payment_date=today + timedelta(days=1),
        )
        self.payment = payment_result["payment"]

    def test_admin_can_sync_payment_and_list_profiles(self):
        response = self.client.post(
            f"/api/v1/billing/payments/{self.payment.id}/sync/",
            {},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["billing_profile"]["subscription"], self.subscription.id)

        profiles = self.client.get(f"/api/v1/billing/profiles/?subscription={self.subscription.id}")
        self.assertEqual(profiles.status_code, status.HTTP_200_OK, profiles.data)
        self.assertEqual(profiles.data["count"], 1)

        profile_id = profiles.data["results"][0]["id"]
        refresh = self.client.post(f"/api/v1/billing/profiles/{profile_id}/sync/", {}, format="json")
        self.assertEqual(refresh.status_code, status.HTTP_200_OK, refresh.data)
        self.assertEqual(refresh.data["billing_profile"]["activation_state"], "ACTIVE")
