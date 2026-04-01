from decimal import Decimal
from datetime import date

from rest_framework import status
from rest_framework.test import APITestCase

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


class AdminCommissionSummaryTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(
            username="admin_summary_test",
            phone="9104000001",
        )

        self.partner = create_partner_user(
            username="partner_summary_test",
            phone="9104000002",
        )
        self.partner.commission_rate = Decimal("10.00")
        self.partner.save(update_fields=["commission_rate"])

        self.customer = create_customer_profile(
            name="Summary Customer",
            phone="7410000001",
        )

        self.product = create_product(
            name="Summary Product",
            product_code="SUM-001",
            base_price=Decimal("1000.00"),
        )

        self.batch = create_batch(
            batch_code="SUMMARYBATCH01",
            duration_months=10,
            total_slots=100,
            draw_day=5,
            start_date=date(2026, 3, 1),
        )

        # pending
        lucky_1 = create_lucky_id(batch=self.batch, lucky_number=31)
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
        record_emi_payment(
            emi_id=emi_1.id,
            amount=Decimal("100.00"),
            collected_by=self.admin,
            method="CASH",
            reference_no="SUM-001",
        )

        # settled
        lucky_2 = create_lucky_id(batch=self.batch, lucky_number=32)
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
            reference_no="SUM-002",
        )["payment"]
        settle_commission(
            commission_id=p2.commission.id,
            settled_by=self.admin,
        )

        # reversed
        lucky_3 = create_lucky_id(batch=self.batch, lucky_number=33)
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
            reference_no="SUM-003",
        )["payment"]
        reverse_payment_for_admin(
            payment_id=p3.id,
            reversed_by=self.admin,
            reason="summary reversal",
        )

        self.url = "/api/v1/admin/commissions/summary/"

    def test_admin_can_view_summary(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["summary"]["pending_count"], 1)
        self.assertEqual(response.data["summary"]["settled_count"], 1)
        self.assertEqual(response.data["summary"]["reversed_count"], 1)
        self.assertEqual(response.data["summary"]["pending_commission"], "10.00")
        self.assertEqual(response.data["summary"]["settled_commission"], "10.00")
        self.assertEqual(response.data["summary"]["reversed_commission"], "10.00")
        self.assertEqual(response.data["summary"]["total_commission"], "20.00")
        self.assertEqual(len(response.data["per_partner"]), 1)

    def test_partner_cannot_access_summary(self):
        self.client.force_authenticate(user=self.partner)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_summary_honors_partner_filter(self):
        other_partner = create_partner_user(
            username="partner_summary_other",
            phone="9104000012",
        )
        other_partner.commission_rate = Decimal("5.00")
        other_partner.save(update_fields=["commission_rate"])

        lucky_other = create_lucky_id(batch=self.batch, lucky_number=34)
        sub_other = create_subscription(
            customer=self.customer,
            product=self.product,
            partner=other_partner,
            batch=self.batch,
            lucky_id=lucky_other,
            total_amount=Decimal("1000.00"),
            monthly_amount=Decimal("100.00"),
            tenure_months=10,
        )
        emi_other = create_emi(
            subscription=sub_other,
            month_no=1,
            amount=Decimal("100.00"),
            due_date=date(2026, 3, 13),
        )
        record_emi_payment(
            emi_id=emi_other.id,
            amount=Decimal("100.00"),
            collected_by=self.admin,
            method="CASH",
            reference_no="SUM-004",
        )

        self.client.force_authenticate(user=self.admin)

        response = self.client.get(self.url, {"partner": self.partner.id})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["summary"]["pending_count"], 1)
        self.assertEqual(response.data["summary"]["settled_count"], 1)
        self.assertEqual(response.data["summary"]["reversed_count"], 1)
        self.assertEqual(response.data["summary"]["total_commission"], "20.00")
        self.assertEqual(len(response.data["per_partner"]), 1)
        self.assertEqual(response.data["per_partner"][0]["partner_id"], self.partner.id)
