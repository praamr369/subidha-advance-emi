from datetime import date
from decimal import Decimal

from rest_framework import status
from rest_framework.test import APITestCase

from subscriptions.services.lucky_draw_service import (
    create_lucky_draw_commit,
    reveal_and_execute_draw,
)
from subscriptions.services.payment_service import record_emi_payment
from subscriptions.models import DeliveryStatus
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_customer_profile,
    create_customer_user,
    create_delivery,
    create_emi,
    create_lucky_id,
    create_partner_user,
    create_product,
    create_subscription,
)


class CustomerDeliveryApiTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(
            username="customer_delivery_admin",
            phone="9331000000",
        )
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

    def _create_customer_winner_subscription(
        self,
        *,
        batch_code: str,
        lucky_number: int,
        settled: bool,
    ):
        winner_batch = create_batch(
            batch_code=batch_code,
            duration_months=3,
            total_slots=100,
            draw_day=5,
            start_date=date(2026, 4, 1),
        )
        winner_lucky_id = create_lucky_id(batch=winner_batch, lucky_number=lucky_number)
        winner_subscription = create_subscription(
            customer=self.customer,
            product=self.product,
            batch=winner_batch,
            lucky_id=winner_lucky_id,
            partner=self.partner,
            total_amount=Decimal("3000.00"),
            monthly_amount=Decimal("1000.00"),
            tenure_months=3,
            start_date=date(2026, 4, 1),
        )
        emi_1 = create_emi(
            subscription=winner_subscription,
            month_no=1,
            amount=Decimal("1000.00"),
            due_date=date(2026, 4, 10),
        )
        create_emi(
            subscription=winner_subscription,
            month_no=2,
            amount=Decimal("1000.00"),
            due_date=date(2026, 5, 10),
        )
        create_emi(
            subscription=winner_subscription,
            month_no=3,
            amount=Decimal("1000.00"),
            due_date=date(2026, 6, 10),
        )

        if settled:
            record_emi_payment(
                emi_id=emi_1.id,
                amount=Decimal("1000.00"),
                collected_by=self.admin,
                method="CASH",
                reference_no=f"{batch_code}-PAY-001",
            )

        draw, secret_seed = create_lucky_draw_commit(batch=winner_batch)
        reveal_and_execute_draw(
            draw_id=draw.id,
            revealed_seed=secret_seed,
            performed_by=self.admin,
        )
        winner_subscription.refresh_from_db()

        return winner_subscription

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

    def test_customer_subscription_detail_exposes_unsettled_winner_history(self):
        winner_subscription = self._create_customer_winner_subscription(
            batch_code="CUSWINUNSETTLED2026",
            lucky_number=41,
            settled=False,
        )
        self.client.force_authenticate(user=self.customer_user)

        response = self.client.get(
            f"/api/v1/customer/subscriptions/{winner_subscription.id}/"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["status"], "WON")
        self.assertEqual(response.data["winner_status"], "WON")
        self.assertEqual(response.data["winner_summary"]["winner_month"], 1)
        self.assertEqual(response.data["winner_summary"]["waiver_scope"], "FUTURE_EMI_ONLY")
        self.assertEqual(response.data["winner_summary"]["waived_emi_count"], 2)
        self.assertEqual(response.data["financial_summary"]["outstanding_amount"], "1000.00")

    def test_customer_subscription_detail_exposes_completed_winner_history(self):
        winner_subscription = self._create_customer_winner_subscription(
            batch_code="CUSWINSETTLED2026",
            lucky_number=42,
            settled=True,
        )
        self.client.force_authenticate(user=self.customer_user)

        response = self.client.get(
            f"/api/v1/customer/subscriptions/{winner_subscription.id}/"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["status"], "COMPLETED")
        self.assertEqual(response.data["winner_status"], "WON")
        self.assertEqual(response.data["winner_summary"]["winner_month"], 1)
        self.assertEqual(response.data["winner_summary"]["waived_emi_count"], 2)
        self.assertEqual(response.data["winner_summary"]["waived_amount"], "2000.00")
        self.assertEqual(response.data["financial_summary"]["outstanding_amount"], "0.00")

    def test_customer_profile_counts_completed_winner_in_won_subscriptions(self):
        self._create_customer_winner_subscription(
            batch_code="CUSPROFILEWIN2026",
            lucky_number=43,
            settled=True,
        )
        self.client.force_authenticate(user=self.customer_user)

        response = self.client.get("/api/v1/customer/profile/")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["summary"]["won_subscriptions"], 1)
        self.assertEqual(response.data["summary"]["completed_subscriptions"], 1)
