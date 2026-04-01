from decimal import Decimal
from datetime import date

from rest_framework import status
from rest_framework.test import APITestCase

from subscriptions.models import CommissionStatus
from subscriptions.services.commission_service import settle_commission
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


class AdminCommissionListTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(
            username="admin_list_test",
            phone="9103000001",
        )

        self.partner = create_partner_user(
            username="partner_list_test",
            phone="9103000002",
        )
        self.partner.commission_rate = Decimal("10.00")
        self.partner.save(update_fields=["commission_rate"])

        self.customer = create_customer_profile(
            name="List Customer",
            phone="7401000001",
        )

        self.product = create_product(
            name="List Product",
            product_code="LIST-001",
            base_price=Decimal("1000.00"),
        )

        self.batch = create_batch(
            batch_code="LISTBATCH01",
            duration_months=10,
            total_slots=100,
            draw_day=5,
            start_date=date(2026, 3, 1),
        )

        # ---------- Pending commission fixture ----------
        lucky_1 = create_lucky_id(batch=self.batch, lucky_number=10)
        sub_1 = create_subscription(
            customer=self.customer,
            product=self.product,
            partner=self.partner,
            batch=self.batch,
            lucky_id=lucky_1,
            total_amount=Decimal("1000.00"),
            monthly_amount=Decimal("100.00"),
            tenure_months=10,
        )
        emi_1 = create_emi(
            subscription=sub_1,
            month_no=1,
            amount=Decimal("100.00"),
            due_date=date(2026, 3, 10),
        )
        p1 = record_emi_payment(
            emi_id=emi_1.id,
            amount=Decimal("100.00"),
            collected_by=self.admin,
            method="CASH",
            reference_no="LIST-001",
        )["payment"]
        self.pending_commission = p1.commission

        # ---------- Settled commission fixture ----------
        lucky_2 = create_lucky_id(batch=self.batch, lucky_number=11)
        sub_2 = create_subscription(
            customer=self.customer,
            product=self.product,
            partner=self.partner,
            batch=self.batch,
            lucky_id=lucky_2,
            total_amount=Decimal("1000.00"),
            monthly_amount=Decimal("100.00"),
            tenure_months=10,
        )
        emi_2 = create_emi(
            subscription=sub_2,
            month_no=1,
            amount=Decimal("100.00"),
            due_date=date(2026, 3, 11),
        )
        p2 = record_emi_payment(
            emi_id=emi_2.id,
            amount=Decimal("100.00"),
            collected_by=self.admin,
            method="CASH",
            reference_no="LIST-002",
        )["payment"]
        self.settled_commission = p2.commission
        settle_commission(
            commission_id=self.settled_commission.id,
            settled_by=self.admin,
        )

        # ---------- Reversed commission fixture ----------
        lucky_3 = create_lucky_id(batch=self.batch, lucky_number=12)
        sub_3 = create_subscription(
            customer=self.customer,
            product=self.product,
            partner=self.partner,
            batch=self.batch,
            lucky_id=lucky_3,
            total_amount=Decimal("1000.00"),
            monthly_amount=Decimal("100.00"),
            tenure_months=10,
        )
        emi_3 = create_emi(
            subscription=sub_3,
            month_no=1,
            amount=Decimal("100.00"),
            due_date=date(2026, 3, 12),
        )
        p3 = record_emi_payment(
            emi_id=emi_3.id,
            amount=Decimal("100.00"),
            collected_by=self.admin,
            method="CASH",
            reference_no="LIST-003",
        )["payment"]
        reverse_payment_for_admin(
            payment_id=p3.id,
            reversed_by=self.admin,
            reason="test reversal",
        )
        self.reversed_commission = p3.commission
        self.reversed_commission.refresh_from_db()

        self.url = "/api/v1/admin/commissions/"

    def test_admin_can_list_commissions(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 3)

    def test_partner_cannot_access(self):
        self.client.force_authenticate(user=self.partner)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_filter_by_status(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.get(self.url, {"status": "PENDING"})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(
            response.data["results"][0]["status"],
            CommissionStatus.PENDING,
        )

    def test_filter_settled(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.get(self.url, {"status": "SETTLED"})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(
            response.data["results"][0]["status"],
            CommissionStatus.SETTLED,
        )

    def test_filter_reversed(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.get(self.url, {"status": "REVERSED"})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(
            response.data["results"][0]["status"],
            CommissionStatus.REVERSED,
        )

    def test_filter_by_partner(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.get(self.url, {"partner": self.partner.id})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 3)

    def test_pagination(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.get(self.url, {"limit": 2, "offset": 0})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["results"]), 2)

    def test_limit_all_returns_full_filtered_set(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.get(self.url, {"partner": self.partner.id, "limit": "all"})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 3)
        self.assertEqual(response.data["limit"], 3)
        self.assertEqual(len(response.data["results"]), 3)
