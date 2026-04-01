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


class AdminCommissionBulkSettleTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(
            username="admin_bulk_settle",
            phone="9105000001",
        )

        self.partner = create_partner_user(
            username="partner_bulk_settle",
            phone="9105000002",
        )
        self.partner.commission_rate = Decimal("10.00")
        self.partner.save(update_fields=["commission_rate"])

        self.customer = create_customer_profile(
            name="Bulk Settlement Customer",
            phone="7411000001",
        )

        self.product = create_product(
            name="Bulk Settlement Product",
            product_code="BULK-001",
            base_price=Decimal("1000.00"),
        )

        self.batch = create_batch(
            batch_code="BULKBATCH01",
            duration_months=10,
            total_slots=100,
            draw_day=5,
            start_date=date(2026, 3, 1),
        )

        # Pending commission 1
        lucky_1 = create_lucky_id(batch=self.batch, lucky_number=41)
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
            reference_no="BULK-001",
        )["payment"]
        self.pending_1 = p1.commission

        # Pending commission 2
        lucky_2 = create_lucky_id(batch=self.batch, lucky_number=42)
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
            reference_no="BULK-002",
        )["payment"]
        self.pending_2 = p2.commission

        # Already settled
        lucky_3 = create_lucky_id(batch=self.batch, lucky_number=43)
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
            reference_no="BULK-003",
        )["payment"]
        self.already_settled = p3.commission
        settle_commission(
            commission_id=self.already_settled.id,
            settled_by=self.admin,
        )

        # Reversed
        lucky_4 = create_lucky_id(batch=self.batch, lucky_number=44)
        sub_4 = create_subscription(
            customer=self.customer,
            product=self.product,
            partner=self.partner,
            batch=self.batch,
            lucky_id=lucky_4,
            total_amount=Decimal("1000.00"),
            monthly_amount=Decimal("100.00"),
            tenure_months=10,
        )
        emi_4 = create_emi(
            subscription=sub_4,
            month_no=1,
            amount=Decimal("100.00"),
            due_date=date(2026, 3, 13),
        )
        p4 = record_emi_payment(
            emi_id=emi_4.id,
            amount=Decimal("100.00"),
            collected_by=self.admin,
            method="CASH",
            reference_no="BULK-004",
        )["payment"]
        reverse_payment_for_admin(
            payment_id=p4.id,
            reversed_by=self.admin,
            reason="bulk reversed",
        )
        self.reversed_commission = p4.commission
        self.reversed_commission.refresh_from_db()

        self.url = "/api/v1/admin/commissions/bulk-settle/"

    def test_admin_can_bulk_settle(self):
        self.client.force_authenticate(user=self.admin)

        payload = {
            "commission_ids": [
                self.pending_1.id,
                self.pending_2.id,
                self.already_settled.id,
                self.reversed_commission.id,
            ]
        }

        response = self.client.post(self.url, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["requested_count"], 4)
        self.assertEqual(response.data["settled_count"], 2)
        self.assertEqual(response.data["already_settled_count"], 1)
        self.assertEqual(response.data["failed_count"], 1)

        self.pending_1.refresh_from_db()
        self.pending_2.refresh_from_db()

        self.assertEqual(self.pending_1.status, CommissionStatus.SETTLED)
        self.assertEqual(self.pending_2.status, CommissionStatus.SETTLED)

    def test_partner_cannot_bulk_settle(self):
        self.client.force_authenticate(user=self.partner)

        payload = {"commission_ids": [self.pending_1.id]}
        response = self.client.post(self.url, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)