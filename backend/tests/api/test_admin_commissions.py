from decimal import Decimal
from datetime import date

from rest_framework import status
from rest_framework.test import APITestCase

from subscriptions.models import CommissionStatus
from subscriptions.services.payment_service import (
    record_emi_payment,
    reverse_payment_for_admin,
)
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_customer_profile,
    create_emi,
    create_lucky_id,
    create_partner_user,
    create_product,
    create_subscription,
)


class AdminCommissionApiTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(
            username="admin_commission_api",
            phone="9102000001",
        )

        self.partner = create_partner_user(
            username="partner_commission_api",
            phone="9102000002",
        )
        self.partner.commission_rate = Decimal("10.00")
        self.partner.save(update_fields=["commission_rate"])

        self.customer = create_customer_profile(
            name="API Settlement Customer",
            phone="7409000001",
        )

        self.product = create_product(
            name="API Settlement Product",
            product_code="API-SET-001",
            base_price=Decimal("1000.00"),
        )

        self.batch = create_batch(
            batch_code="APISETBATCH01",
            duration_months=10,
            total_slots=100,
            draw_day=5,
            start_date=date(2026, 3, 1),
        )

        self.lucky_id = create_lucky_id(batch=self.batch, lucky_number=22)

        self.subscription = create_subscription(
            customer=self.customer,
            product=self.product,
            partner=self.partner,
            batch=self.batch,
            lucky_id=self.lucky_id,
            total_amount=Decimal("1000.00"),
            monthly_amount=Decimal("100.00"),
            tenure_months=10,
        )

        self.emi = create_emi(
            subscription=self.subscription,
            month_no=1,
            amount=Decimal("100.00"),
            due_date=date(2026, 3, 10),
        )

        payment_result = record_emi_payment(
            emi_id=self.emi.id,
            amount=Decimal("100.00"),
            collected_by=self.admin,
            method="CASH",
            reference_no="SET-API-001",
        )
        self.payment = payment_result["payment"]
        self.commission = self.payment.commission

        self.url = f"/api/v1/admin/commissions/{self.commission.id}/settle/"

    def test_admin_can_settle_commission(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.post(self.url, {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["updated"])
        self.assertEqual(
            response.data["commission"]["status"],
            CommissionStatus.SETTLED,
        )

    def test_non_admin_cannot_settle(self):
        self.client.force_authenticate(user=self.partner)

        response = self.client.post(self.url, {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_cannot_settle_reversed_commission(self):
        reverse_payment_for_admin(
            payment_id=self.payment.id,
            reversed_by=self.admin,
            reason="api reverse before settle",
        )

        self.client.force_authenticate(user=self.admin)
        response = self.client.post(self.url, {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data["detail"],
            "Reversed commission cannot be settled.",
        )