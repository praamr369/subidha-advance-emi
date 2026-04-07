from datetime import date
from decimal import Decimal

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from subscriptions.models import (
    PaymentReconciliation,
    PaymentReconciliationEvent,
    ReconciliationEventType,
    ReconciliationStatus,
)
from subscriptions.services.payment_service import record_emi_payment
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_customer_profile,
    create_customer_user,
    create_emi,
    create_lucky_id,
    create_partner_user,
    create_product,
    create_subscription,
)


class AdminReconciliationApiTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(
            username="admin_reconciliation_ops",
            phone="9315000001",
        )
        self.customer_user = create_customer_user(
            username="reconciliation_customer_user",
            phone="7315000001",
        )
        self.client.force_authenticate(user=self.admin)

        self.partner = create_partner_user(
            username="reconciliation_partner",
            phone="9315000002",
        )
        self.customer = create_customer_profile(
            name="Reconciliation Customer",
            phone="7315000002",
        )
        self.product = create_product(
            name="Reconciliation Product",
            product_code="RECON-API-001",
            base_price=Decimal("1900.00"),
        )
        self.batch = create_batch(
            batch_code="RECONAPR2026",
            duration_months=1,
            total_slots=100,
            draw_day=5,
            start_date=date(2026, 3, 1),
        )

        self.lucky_id_primary = create_lucky_id(batch=self.batch, lucky_number=61)
        self.lucky_id_secondary = create_lucky_id(batch=self.batch, lucky_number=62)

        self.subscription_primary = create_subscription(
            customer=self.customer,
            product=self.product,
            batch=self.batch,
            lucky_id=self.lucky_id_primary,
            partner=self.partner,
            total_amount=Decimal("1000.00"),
            monthly_amount=Decimal("1000.00"),
            tenure_months=1,
        )
        self.subscription_secondary = create_subscription(
            customer=self.customer,
            product=self.product,
            batch=self.batch,
            lucky_id=self.lucky_id_secondary,
            partner=self.partner,
            total_amount=Decimal("900.00"),
            monthly_amount=Decimal("900.00"),
            tenure_months=1,
        )

        self.emi_primary = create_emi(
            subscription=self.subscription_primary,
            month_no=1,
            amount=Decimal("1000.00"),
            due_date=date(2026, 3, 8),
        )
        self.emi_secondary = create_emi(
            subscription=self.subscription_secondary,
            month_no=1,
            amount=Decimal("900.00"),
            due_date=date(2026, 3, 9),
        )

        self.payment_primary = record_emi_payment(
            emi_id=self.emi_primary.id,
            amount=Decimal("1000.00"),
            collected_by=self.admin,
            method="CASH",
            reference_no="RECON-PAY-001",
        )["payment"]
        self.payment_secondary = record_emi_payment(
            emi_id=self.emi_secondary.id,
            amount=Decimal("900.00"),
            collected_by=self.admin,
            method="CASH",
            reference_no="RECON-PAY-002",
        )["payment"]

        self.reconciliation_primary = PaymentReconciliation.objects.create(
            payment=self.payment_primary,
            matched_emi=self.emi_primary,
            status=ReconciliationStatus.PENDING,
            expected_amount=Decimal("1000.00"),
            paid_amount=Decimal("1000.00"),
            variance_amount=Decimal("0.00"),
            notes="Seeded pending review",
        )
        PaymentReconciliationEvent.objects.create(
            reconciliation=self.reconciliation_primary,
            event_type=ReconciliationEventType.CREATED,
            old_status="",
            new_status=ReconciliationStatus.PENDING,
            message="Created from seeded fixture.",
            actor=self.admin,
        )

        self.reconciliation_secondary = PaymentReconciliation.objects.create(
            payment=self.payment_secondary,
            matched_emi=self.emi_secondary,
            status=ReconciliationStatus.MISMATCH,
            expected_amount=Decimal("850.00"),
            paid_amount=Decimal("900.00"),
            variance_amount=Decimal("50.00"),
            is_flagged=True,
            is_locked=True,
            notes="Seeded mismatch review",
            reconciled_by=self.admin,
            reconciled_at=timezone.now(),
        )
        PaymentReconciliationEvent.objects.create(
            reconciliation=self.reconciliation_secondary,
            event_type=ReconciliationEventType.LOCKED,
            old_status=ReconciliationStatus.MISMATCH,
            new_status=ReconciliationStatus.MISMATCH,
            message="Fixture lock",
            actor=self.admin,
        )

    def _results(self, response):
        payload = response.data
        if isinstance(payload, list):
            return payload
        return payload.get("results", [])

    def test_admin_reconciliation_list_supports_filters(self):
        response = self.client.get("/api/v1/admin/reconciliations/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["count"], 2)

        status_response = self.client.get(
            "/api/v1/admin/reconciliations/?status=MISMATCH"
        )
        self.assertEqual(status_response.status_code, status.HTTP_200_OK)
        self.assertEqual(status_response.data["count"], 1)
        self.assertEqual(
            self._results(status_response)[0]["id"],
            self.reconciliation_secondary.id,
        )

        flagged_response = self.client.get(
            "/api/v1/admin/reconciliations/?flagged=true"
        )
        self.assertEqual(flagged_response.status_code, status.HTTP_200_OK)
        self.assertEqual(flagged_response.data["count"], 1)
        self.assertEqual(
            self._results(flagged_response)[0]["id"],
            self.reconciliation_secondary.id,
        )

        locked_response = self.client.get(
            "/api/v1/admin/reconciliations/?locked=true"
        )
        self.assertEqual(locked_response.status_code, status.HTTP_200_OK)
        self.assertEqual(locked_response.data["count"], 1)
        self.assertEqual(
            self._results(locked_response)[0]["id"],
            self.reconciliation_secondary.id,
        )

        payment_response = self.client.get(
            f"/api/v1/admin/reconciliations/?payment={self.payment_primary.id}"
        )
        self.assertEqual(payment_response.status_code, status.HTTP_200_OK)
        self.assertEqual(payment_response.data["count"], 1)
        self.assertEqual(
            self._results(payment_response)[0]["payment_id"],
            self.payment_primary.id,
        )

        subscription_response = self.client.get(
            f"/api/v1/admin/reconciliations/?subscription={self.subscription_secondary.id}"
        )
        self.assertEqual(subscription_response.status_code, status.HTTP_200_OK)
        self.assertEqual(subscription_response.data["count"], 1)
        self.assertEqual(
            self._results(subscription_response)[0]["subscription_id"],
            self.subscription_secondary.id,
        )

        search_response = self.client.get("/api/v1/admin/reconciliations/?q=RECON-PAY-002")
        self.assertEqual(search_response.status_code, status.HTTP_200_OK)
        self.assertEqual(search_response.data["count"], 1)
        self.assertEqual(
            self._results(search_response)[0]["payment_reference_no"],
            "RECON-PAY-002",
        )

    def test_admin_reconciliation_detail_returns_event_history(self):
        response = self.client.get(
            f"/api/v1/admin/reconciliations/{self.reconciliation_primary.id}/"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["id"], self.reconciliation_primary.id)
        self.assertEqual(response.data["payment_id"], self.payment_primary.id)
        self.assertEqual(response.data["subscription_id"], self.subscription_primary.id)
        self.assertEqual(response.data["payment_reference_no"], "RECON-PAY-001")
        self.assertEqual(len(response.data["events"]), 1)
        self.assertEqual(
            response.data["events"][0]["event_type"],
            ReconciliationEventType.CREATED,
        )

    def test_admin_reconciliation_flag_marks_record_and_creates_event(self):
        response = self.client.post(
            f"/api/v1/admin/reconciliations/{self.reconciliation_primary.id}/flag/",
            {"reason": "Variance requires manual review"},
            format="json",
        )

        self.reconciliation_primary.refresh_from_db()

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(self.reconciliation_primary.status, ReconciliationStatus.FLAGGED)
        self.assertTrue(self.reconciliation_primary.is_flagged)
        self.assertIn("Variance requires manual review", self.reconciliation_primary.notes)
        self.assertTrue(
            PaymentReconciliationEvent.objects.filter(
                reconciliation=self.reconciliation_primary,
                event_type=ReconciliationEventType.FLAGGED,
            ).exists()
        )

    def test_admin_reconciliation_note_appends_note_and_creates_event(self):
        response = self.client.post(
            f"/api/v1/admin/reconciliations/{self.reconciliation_primary.id}/note/",
            {"note": "Operator verified deposit slip"},
            format="json",
        )

        self.reconciliation_primary.refresh_from_db()

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertIn("Operator verified deposit slip", self.reconciliation_primary.notes)
        self.assertTrue(
            PaymentReconciliationEvent.objects.filter(
                reconciliation=self.reconciliation_primary,
                event_type=ReconciliationEventType.NOTE_ADDED,
            ).exists()
        )

    def test_admin_reconciliation_lock_and_unlock_update_state(self):
        lock_response = self.client.post(
            f"/api/v1/admin/reconciliations/{self.reconciliation_primary.id}/lock/",
            {"reason": "Reviewed and locked"},
            format="json",
        )

        self.reconciliation_primary.refresh_from_db()
        self.assertEqual(lock_response.status_code, status.HTTP_200_OK, lock_response.data)
        self.assertTrue(self.reconciliation_primary.is_locked)

        unlock_response = self.client.post(
            f"/api/v1/admin/reconciliations/{self.reconciliation_primary.id}/unlock/",
            {"reason": "Reopened for investigation"},
            format="json",
        )

        self.reconciliation_primary.refresh_from_db()
        self.assertEqual(
            unlock_response.status_code, status.HTTP_200_OK, unlock_response.data
        )
        self.assertFalse(self.reconciliation_primary.is_locked)
        self.assertTrue(
            PaymentReconciliationEvent.objects.filter(
                reconciliation=self.reconciliation_primary,
                event_type=ReconciliationEventType.LOCKED,
            ).exists()
        )
        self.assertTrue(
            PaymentReconciliationEvent.objects.filter(
                reconciliation=self.reconciliation_primary,
                event_type=ReconciliationEventType.UNLOCKED,
            ).exists()
        )

    def test_admin_reconciliation_requires_admin_permissions(self):
        self.client.force_authenticate(user=self.customer_user)

        list_response = self.client.get("/api/v1/admin/reconciliations/")
        self.assertEqual(list_response.status_code, status.HTTP_403_FORBIDDEN)

        detail_response = self.client.get(
            f"/api/v1/admin/reconciliations/{self.reconciliation_primary.id}/"
        )
        self.assertEqual(detail_response.status_code, status.HTTP_403_FORBIDDEN)

        flag_response = self.client.post(
            f"/api/v1/admin/reconciliations/{self.reconciliation_primary.id}/flag/",
            {"reason": "should fail"},
            format="json",
        )
        self.assertEqual(flag_response.status_code, status.HTTP_403_FORBIDDEN)

    def test_reconciliation_attention_compatibility_endpoint_matches_canonical(self):
        canonical_response = self.client.get(
            "/api/v1/admin/subscriptions/reconciliation-attention/"
        )
        compatibility_response = self.client.get(
            "/api/v1/admin/reports/reconciliation-attention/"
        )

        self.assertEqual(canonical_response.status_code, status.HTTP_200_OK)
        self.assertEqual(compatibility_response.status_code, status.HTTP_200_OK)
        self.assertEqual(canonical_response.data, compatibility_response.data)
