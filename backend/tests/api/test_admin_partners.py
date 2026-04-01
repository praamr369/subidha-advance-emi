from datetime import date
from decimal import Decimal

from rest_framework import status
from rest_framework.test import APITestCase

from subscriptions.services.payment_service import record_emi_payment, reverse_payment_for_admin
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


class AdminPartnerRegisterTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(
            username="admin_partner_register",
            phone="9301000001",
        )
        self.partner = create_partner_user(
            username="partner_register_primary",
            phone="9301000002",
        )
        self.partner.commission_rate = Decimal("10.00")
        self.partner.save(update_fields=["commission_rate"])

        self.customer = create_customer_profile(
            name="Partner Register Customer",
            phone="7301000001",
        )
        self.product = create_product(
            name="Partner Register Product",
            product_code="PARTNER-REG-001",
            base_price=Decimal("1200.00"),
        )
        self.batch = create_batch(
            batch_code="PARTNERREG2026",
            duration_months=12,
            total_slots=100,
            draw_day=5,
            start_date=date(2026, 3, 1),
        )

        lucky_1 = create_lucky_id(batch=self.batch, lucky_number=71)
        lucky_2 = create_lucky_id(batch=self.batch, lucky_number=72)
        lucky_3 = create_lucky_id(batch=self.batch, lucky_number=73)

        sub_1 = create_subscription(
            customer=self.customer,
            product=self.product,
            batch=self.batch,
            lucky_id=lucky_1,
            partner=self.partner,
            total_amount=Decimal("1200.00"),
            monthly_amount=Decimal("100.00"),
            tenure_months=12,
        )
        sub_2 = create_subscription(
            customer=self.customer,
            product=self.product,
            batch=self.batch,
            lucky_id=lucky_2,
            partner=self.partner,
            total_amount=Decimal("1440.00"),
            monthly_amount=Decimal("120.00"),
            tenure_months=12,
        )
        sub_3 = create_subscription(
            customer=self.customer,
            product=self.product,
            batch=self.batch,
            lucky_id=lucky_3,
            partner=self.partner,
            total_amount=Decimal("1800.00"),
            monthly_amount=Decimal("150.00"),
            tenure_months=12,
        )

        emi_1 = create_emi(
            subscription=sub_1,
            month_no=1,
            amount=Decimal("100.00"),
            due_date=date(2026, 3, 10),
        )
        emi_2 = create_emi(
            subscription=sub_2,
            month_no=1,
            amount=Decimal("120.00"),
            due_date=date(2026, 3, 11),
        )
        emi_3 = create_emi(
            subscription=sub_3,
            month_no=1,
            amount=Decimal("150.00"),
            due_date=date(2026, 3, 12),
        )

        record_emi_payment(
            emi_id=emi_1.id,
            amount=Decimal("100.00"),
            collected_by=self.admin,
            method="CASH",
            reference_no="PARTNER-REG-001",
        )
        record_emi_payment(
            emi_id=emi_2.id,
            amount=Decimal("120.00"),
            collected_by=self.admin,
            method="CASH",
            reference_no="PARTNER-REG-002",
        )
        reversed_payment = record_emi_payment(
            emi_id=emi_3.id,
            amount=Decimal("150.00"),
            collected_by=self.admin,
            method="CASH",
            reference_no="PARTNER-REG-003",
        )["payment"]
        reverse_payment_for_admin(
            payment_id=reversed_payment.id,
            reversed_by=self.admin,
            reason="register reversal",
        )

    def test_admin_partner_list_uses_non_reversed_commission_truth(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.get("/api/v1/admin/partners/")

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
            msg=f"Unexpected admin partners response: {response.status_code} {response.data}",
        )
        self.assertEqual(response.data["count"], 1)

        partner_row = response.data["results"][0]
        self.assertEqual(partner_row["id"], self.partner.id)
        self.assertEqual(partner_row["referred_customers"], 1)
        self.assertEqual(partner_row["active_subscriptions"], 1)
        self.assertEqual(partner_row["total_monthly_book"], "370")
        self.assertEqual(partner_row["total_contract_value"], "4440")
        self.assertEqual(partner_row["total_commission"], "22")
