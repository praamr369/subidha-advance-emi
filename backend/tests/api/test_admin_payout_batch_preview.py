from decimal import Decimal
from datetime import date

from rest_framework import status
from rest_framework.test import APITestCase

from subscriptions.services.commission_payout_service import create_commission_payout_batch
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


class AdminPayoutBatchPreviewTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(
            username="admin_payout_preview",
            phone="9111000001",
        )
        self.partner = create_partner_user(
            username="partner_payout_preview",
            phone="9111000002",
        )
        self.partner.commission_rate = Decimal("10.00")
        self.partner.save(update_fields=["commission_rate"])

        self.customer = create_customer_profile(
            name="Preview Customer",
            phone="7420000001",
        )
        self.product = create_product(
            name="Preview Product",
            product_code="PBP-001",
            base_price=Decimal("1000.00"),
        )
        self.batch = create_batch(
            batch_code="PAYOUTPREVIEW01",
            duration_months=10,
            total_slots=100,
            draw_day=5,
            start_date=date(2026, 3, 1),
        )

        self.pending_commission = self._create_commission(81, "PBP-001")
        settled_commission = self._create_commission(82, "PBP-002")
        settled_commission.status = "SETTLED"
        settled_commission.settlement_date = date(2026, 3, 15)
        settled_commission.save(update_fields=["status", "settlement_date", "updated_at"])

        assigned_commission = self._create_commission(83, "PBP-003")
        create_commission_payout_batch(
            commission_ids=[assigned_commission.id],
            processed_by=self.admin,
        )

        reversed_commission = self._create_commission(84, "PBP-004")
        reverse_payment_for_admin(
            payment_id=reversed_commission.payment_id,
            reversed_by=self.admin,
            reason="preview reverse",
        )

        self.url = "/api/v1/admin/commission-payout-batches/preview/"

    def _create_commission(self, lucky_number: int, reference_no: str):
        lucky_id = create_lucky_id(batch=self.batch, lucky_number=lucky_number)
        subscription = create_subscription(
            customer=self.customer,
            product=self.product,
            partner=self.partner,
            batch=self.batch,
            lucky_id=lucky_id,
            total_amount=Decimal("1000.00"),
            monthly_amount=Decimal("100.00"),
            tenure_months=10,
        )
        emi = create_emi(
            subscription=subscription,
            month_no=1,
            amount=Decimal("100.00"),
            due_date=date(2026, 3, 10),
        )
        payment = record_emi_payment(
            emi_id=emi.id,
            amount=Decimal("100.00"),
            collected_by=self.admin,
            method="CASH",
            reference_no=reference_no,
        )["payment"]
        return payment.commission

    def test_preview_returns_only_batch_eligible_rows(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["summary"]["eligible_count"], 1)
        self.assertEqual(response.data["summary"]["pending_count"], 1)
        self.assertEqual(response.data["summary"]["settled_count"], 0)
        result_ids = {row["id"] for row in response.data["results"]}
        self.assertSetEqual(result_ids, {self.pending_commission.id})

    def test_partner_cannot_access_preview(self):
        self.client.force_authenticate(user=self.partner)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
