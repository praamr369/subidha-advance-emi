from decimal import Decimal
from datetime import date

from rest_framework import status
from rest_framework.test import APITestCase

from subscriptions.models import CommissionStatus
from subscriptions.services.commission_payout_service import (
    create_commission_payout_batch,
    finalize_commission_payout_batch,
)
from subscriptions.services.payment_service import record_emi_payment
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


class AdminPayoutBatchExportTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(
            username="admin_export_test",
            phone="9106000001",
        )

        self.partner = create_partner_user(
            username="partner_export_test",
            phone="9106000002",
        )
        self.partner.commission_rate = Decimal("10.00")
        self.partner.save(update_fields=["commission_rate"])

        self.customer = create_customer_profile(
            name="Export Customer",
            phone="7412000001",
        )

        self.product = create_product(
            name="Export Product",
            product_code="EXP-001",
            base_price=Decimal("1000.00"),
        )

        self.batch = create_batch(
            batch_code="EXPORTBATCH01",
            duration_months=10,
            total_slots=100,
            draw_day=5,
            start_date=date(2026, 3, 1),
        )

        # eligible commission 1
        lucky_1 = create_lucky_id(batch=self.batch, lucky_number=51)
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
            reference_no="EXP-001",
        )["payment"]

        # eligible commission 2
        lucky_2 = create_lucky_id(batch=self.batch, lucky_number=52)
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
            reference_no="EXP-002",
        )["payment"]

        payout_result = create_commission_payout_batch(
            commission_ids=[p1.commission.id, p2.commission.id],
            processed_by=self.admin,
            notes="export test batch",
        )
        self.payout_batch = payout_result["batch"]
        finalize_commission_payout_batch(batch_id=self.payout_batch.id, processed_by=self.admin)

        self.url = f"/api/v1/admin/commission-payout-batches/{self.payout_batch.id}/export/"

    def test_admin_can_export_batch_csv(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response["Content-Type"], "text/csv")
        self.assertIn(self.payout_batch.batch_code, response["Content-Disposition"])

        content = response.content.decode("utf-8")
        lines = [line for line in content.splitlines() if line.strip()]

        # header + 2 data rows
        self.assertEqual(len(lines), 3)
        self.assertIn("batch_code,payout_date,batch_status", lines[0])
        self.assertIn(str(self.payout_batch.batch_code), content)
        self.assertIn("partner_export_test", content)
        self.assertIn(CommissionStatus.SETTLED, content)

    def test_partner_cannot_export_batch_csv(self):
        self.client.force_authenticate(user=self.partner)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_export_missing_batch_returns_404(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.get("/api/v1/admin/commission-payout-batches/999999/export/")

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
