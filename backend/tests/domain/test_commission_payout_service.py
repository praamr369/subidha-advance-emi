from decimal import Decimal
from datetime import date

from django.test import TestCase

from subscriptions.models import (
    AuditLog,
    Commission,
    CommissionPayoutBatch,
    CommissionPayoutLine,
    CommissionStatus,
)
from subscriptions.services.commission_payout_service import (
    cancel_commission_payout_batch,
    create_commission_payout_batch,
    finalize_commission_payout_batch,
)
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
    create_finance_account,
    create_lucky_id,
    create_partner_user,
    create_product,
    create_subscription,
)


class CommissionPayoutBatchDomainTests(TestCase):
    def setUp(self):
        self.admin = create_admin_user(
            username="payout_batch_admin",
            phone="9110000001",
        )
        self.partner = create_partner_user(
            username="payout_batch_partner",
            phone="9110000002",
        )
        self.partner.commission_rate = Decimal("10.00")
        self.partner.save(update_fields=["commission_rate"])
        self.other_partner = create_partner_user(
            username="payout_batch_other_partner",
            phone="9110000003",
        )
        self.other_partner.commission_rate = Decimal("12.50")
        self.other_partner.save(update_fields=["commission_rate"])

        self.customer = create_customer_profile(
            name="Payout Batch Customer",
            phone="7419000001",
        )
        self.product = create_product(
            name="Payout Batch Product",
            product_code="PB-001",
            base_price=Decimal("1000.00"),
        )
        self.batch = create_batch(
            batch_code="PAYOUTBATCH01",
            duration_months=10,
            total_slots=100,
            draw_day=5,
            start_date=date(2026, 3, 1),
        )
        self.finance_account = create_finance_account(
            code="TEST-PAYOUT-001",
            name="Payout Batch Cash",
        )

    def _create_commission(
        self,
        *,
        lucky_number: int,
        reference_no: str,
        partner=None,
    ):
        lucky_id = create_lucky_id(batch=self.batch, lucky_number=lucky_number)
        subscription = create_subscription(
            customer=self.customer,
            product=self.product,
            partner=partner or self.partner,
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
            finance_account_id=self.finance_account.id,
            reference_no=reference_no,
        )["payment"]
        return payment.commission

    def test_create_batch_rejects_non_pending_commissions(self):
        pending_commission = self._create_commission(
            lucky_number=71,
            reference_no="PAYOUT-DOM-001",
        )
        settled_commission = self._create_commission(
            lucky_number=72,
            reference_no="PAYOUT-DOM-002",
        )
        settle_commission(
            commission_id=settled_commission.id,
            settled_by=self.admin,
            settlement_date=date(2026, 3, 15),
        )

        with self.assertRaisesMessage(
            ValueError,
            "Only pending commissions can be added to payout batch.",
        ):
            create_commission_payout_batch(
                commission_ids=[pending_commission.id, settled_commission.id],
                processed_by=self.admin,
            )

    def test_create_batch_rejects_reversed_payment_commissions(self):
        pending_commission = self._create_commission(
            lucky_number=73,
            reference_no="PAYOUT-DOM-003",
        )
        reversed_commission = self._create_commission(
            lucky_number=74,
            reference_no="PAYOUT-DOM-004",
        )
        reverse_payment_for_admin(
            payment_id=reversed_commission.payment_id,
            reversed_by=self.admin,
            reason="reverse before payout",
        )

        with self.assertRaisesMessage(
            ValueError,
            "Commission(s) linked to missing/reversed payments cannot be added to payout batch",
        ):
            create_commission_payout_batch(
                commission_ids=[pending_commission.id, reversed_commission.id],
                processed_by=self.admin,
            )

    def test_create_batch_rejects_mixed_partner_commissions(self):
        first_commission = self._create_commission(
            lucky_number=75,
            reference_no="PAYOUT-DOM-005",
            partner=self.partner,
        )
        second_commission = self._create_commission(
            lucky_number=76,
            reference_no="PAYOUT-DOM-006",
            partner=self.other_partner,
        )

        with self.assertRaisesMessage(
            ValueError,
            "All commissions in a payout batch must belong to the same partner.",
        ):
            create_commission_payout_batch(
                commission_ids=[first_commission.id, second_commission.id],
                processed_by=self.admin,
            )

    def test_batch_totals_finalization_and_audit_are_correct(self):
        first_commission = self._create_commission(
            lucky_number=77,
            reference_no="PAYOUT-DOM-007",
        )
        second_commission = self._create_commission(
            lucky_number=78,
            reference_no="PAYOUT-DOM-008",
        )
        original_amount = str(first_commission.commission_amount)

        result = create_commission_payout_batch(
            commission_ids=[first_commission.id, second_commission.id],
            processed_by=self.admin,
            payout_date=date(2026, 3, 20),
        )

        batch = result["batch"]
        self.assertEqual(batch.status, CommissionPayoutBatch.Status.DRAFT)
        self.assertEqual(result["line_count"], 2)
        self.assertEqual(str(result["total_amount"]), "20.00")

        finalize_result = finalize_commission_payout_batch(
            batch_id=batch.id,
            processed_by=self.admin,
        )
        self.assertTrue(finalize_result["updated"])
        self.assertEqual(finalize_result["settled_count"], 2)

        first_commission.refresh_from_db()
        second_commission.refresh_from_db()
        batch.refresh_from_db()

        self.assertEqual(batch.status, CommissionPayoutBatch.Status.FINALIZED)
        self.assertEqual(first_commission.status, CommissionStatus.SETTLED)
        self.assertEqual(second_commission.status, CommissionStatus.SETTLED)
        self.assertEqual(str(first_commission.settlement_date), "2026-03-20")
        self.assertEqual(str(first_commission.commission_amount), original_amount)

        created_log = AuditLog.objects.get(
            action_type=AuditLog.ActionType.COMMISSION_PAYOUT_BATCH_CREATED,
            object_id=batch.id,
        )
        self.assertEqual(created_log.metadata["actor_id"], self.admin.id)
        self.assertEqual(created_log.metadata["batch_id"], batch.id)
        self.assertEqual(
            created_log.metadata["commission_ids"],
            [first_commission.id, second_commission.id],
        )

        finalized_log = AuditLog.objects.get(
            action_type=AuditLog.ActionType.COMMISSION_PAYOUT_BATCH_FINALIZED,
            object_id=batch.id,
        )
        self.assertEqual(finalized_log.metadata["actor_id"], self.admin.id)
        self.assertEqual(finalized_log.metadata["batch_id"], batch.id)
        self.assertEqual(
            finalized_log.metadata["commission_ids"],
            [first_commission.id, second_commission.id],
        )

        settled_audits = AuditLog.objects.filter(
            action_type=AuditLog.ActionType.COMMISSION_SETTLED,
            object_id__in=[first_commission.id, second_commission.id],
        )
        self.assertEqual(settled_audits.count(), 2)
        for audit in settled_audits:
            self.assertEqual(audit.metadata["actor_id"], self.admin.id)
            self.assertEqual(audit.metadata["payout_batch_id"], batch.id)

    def test_duplicate_inclusion_is_rejected_and_cancel_releases_commission(self):
        commission = self._create_commission(
            lucky_number=79,
            reference_no="PAYOUT-DOM-009",
        )

        first_batch = create_commission_payout_batch(
            commission_ids=[commission.id],
            processed_by=self.admin,
        )["batch"]

        with self.assertRaisesMessage(
            ValueError,
            "Commission(s) already assigned to a payout batch",
        ):
            create_commission_payout_batch(
                commission_ids=[commission.id],
                processed_by=self.admin,
            )

        cancel_result = cancel_commission_payout_batch(
            batch_id=first_batch.id,
            processed_by=self.admin,
            reason="operator correction",
        )
        self.assertTrue(cancel_result["updated"])
        first_batch.refresh_from_db()
        self.assertEqual(first_batch.status, CommissionPayoutBatch.Status.CANCELLED)
        self.assertFalse(
            CommissionPayoutLine.objects.filter(
                payout_batch_id=first_batch.id,
                commission_id=commission.id,
            ).exists()
        )
        self.assertFalse(
            Commission.objects.filter(id=commission.id, payout_line__isnull=False).exists()
        )

        rebatch = create_commission_payout_batch(
            commission_ids=[commission.id],
            processed_by=self.admin,
        )["batch"]

        self.assertNotEqual(first_batch.id, rebatch.id)
        self.assertEqual(
            Commission.objects.get(id=commission.id).payout_line.payout_batch_id,
            rebatch.id,
        )

        cancelled_log = AuditLog.objects.get(
            action_type=AuditLog.ActionType.COMMISSION_PAYOUT_BATCH_CANCELLED,
            object_id=first_batch.id,
        )
        self.assertEqual(cancelled_log.metadata["actor_id"], self.admin.id)
        self.assertEqual(cancelled_log.metadata["batch_id"], first_batch.id)
        self.assertEqual(cancelled_log.metadata["commission_ids"], [commission.id])

    def test_duplicate_ids_in_request_are_rejected(self):
        commission = self._create_commission(
            lucky_number=80,
            reference_no="PAYOUT-DOM-010",
        )

        with self.assertRaisesMessage(
            ValueError,
            "commission_ids cannot contain duplicates.",
        ):
            create_commission_payout_batch(
                commission_ids=[commission.id, commission.id],
                processed_by=self.admin,
            )
