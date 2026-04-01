from decimal import Decimal
from datetime import date

from rest_framework import status
from rest_framework.test import APITestCase

from subscriptions.models import AuditLog, CommissionPayoutBatch, CommissionStatus
from subscriptions.services.commission_payout_service import create_commission_payout_batch
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


class AdminPayoutBatchActionTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(
            username="admin_payout_action_test",
            phone="9107000001",
        )

        self.partner = create_partner_user(
            username="partner_payout_action_test",
            phone="9107000002",
        )
        self.partner.commission_rate = Decimal("10.00")
        self.partner.save(update_fields=["commission_rate"])

        self.customer = create_customer_profile(
            name="Payout Action Customer",
            phone="7413000001",
        )

        self.product = create_product(
            name="Payout Action Product",
            product_code="PACT-001",
            base_price=Decimal("1000.00"),
        )

        self.batch = create_batch(
            batch_code="PAYOUTACT01",
            duration_months=10,
            total_slots=100,
            draw_day=5,
            start_date=date(2026, 3, 1),
        )

        lucky_1 = create_lucky_id(batch=self.batch, lucky_number=61)
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
            reference_no="PACT-001",
        )["payment"]

        payout_result = create_commission_payout_batch(
            commission_ids=[p1.commission.id],
            processed_by=self.admin,
            notes="action test batch",
        )
        self.payout_batch = payout_result["batch"]

    def test_admin_can_finalize_draft_batch(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.post(
            f"/api/v1/admin/commission-payout-batches/{self.payout_batch.id}/finalize/",
            {},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["updated"])

        self.payout_batch.refresh_from_db()
        self.assertEqual(self.payout_batch.status, CommissionPayoutBatch.Status.FINALIZED)
        self.assertEqual(response.data["settled_count"], 1)
        commission = self.payout_batch.lines.select_related("commission").first().commission
        commission.refresh_from_db()
        self.assertEqual(commission.status, CommissionStatus.SETTLED)

    def test_finalize_is_idempotent_and_does_not_duplicate_audit(self):
        self.client.force_authenticate(user=self.admin)

        first_response = self.client.post(
            f"/api/v1/admin/commission-payout-batches/{self.payout_batch.id}/finalize/",
            {},
            format="json",
        )
        self.assertEqual(first_response.status_code, status.HTTP_200_OK)
        self.assertTrue(first_response.data["updated"])

        second_response = self.client.post(
            f"/api/v1/admin/commission-payout-batches/{self.payout_batch.id}/finalize/",
            {},
            format="json",
        )
        self.assertEqual(second_response.status_code, status.HTTP_200_OK)
        self.assertFalse(second_response.data["updated"])

        self.assertEqual(
            AuditLog.objects.filter(
                action_type=AuditLog.ActionType.COMMISSION_PAYOUT_BATCH_FINALIZED,
                object_id=self.payout_batch.id,
            ).count(),
            1,
        )

    def test_admin_can_cancel_draft_batch(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.post(
            f"/api/v1/admin/commission-payout-batches/{self.payout_batch.id}/cancel/",
            {"reason": "operator mistake"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["updated"])

        self.payout_batch.refresh_from_db()
        self.assertEqual(self.payout_batch.status, CommissionPayoutBatch.Status.CANCELLED)
        self.assertIn("operator mistake", self.payout_batch.notes)

    def test_cannot_cancel_finalized_batch(self):
        self.payout_batch.status = CommissionPayoutBatch.Status.FINALIZED
        self.payout_batch.save(update_fields=["status"])

        self.client.force_authenticate(user=self.admin)

        response = self.client.post(
            f"/api/v1/admin/commission-payout-batches/{self.payout_batch.id}/cancel/",
            {"reason": "too late"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "Finalized payout batch cannot be cancelled.")

    def test_partner_cannot_finalize_batch(self):
        self.client.force_authenticate(user=self.partner)

        response = self.client.post(
            f"/api/v1/admin/commission-payout-batches/{self.payout_batch.id}/finalize/",
            {},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
