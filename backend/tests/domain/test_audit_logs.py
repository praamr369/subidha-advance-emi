from decimal import Decimal
from datetime import date

from django.test import TestCase

from subscriptions.models import AuditLog
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


class AuditLogTests(TestCase):
    def setUp(self):
        self.admin = create_admin_user(username="audit_admin", phone="9000000501")
        self.partner = create_partner_user(username="audit_partner", phone="9000000502")

        self.customer = create_customer_profile(
            name="Audit Customer",
            phone="7407533499",
        )
        self.product = create_product(
            name="Audit Product",
            product_code="AUDIT-001",
            base_price=Decimal("3000.00"),
        )
        self.batch = create_batch(
            batch_code="AUDIT2026",
            duration_months=3,
            total_slots=100,
            draw_day=5,
            start_date=date(2026, 3, 1),
        )
        self.lucky_id = create_lucky_id(batch=self.batch, lucky_number=31)

        self.subscription = create_subscription(
            customer=self.customer,
            product=self.product,
            batch=self.batch,
            lucky_id=self.lucky_id,
            partner=self.partner,
            total_amount=Decimal("3000.00"),
            monthly_amount=Decimal("1000.00"),
            tenure_months=3,
        )

        self.emi_1 = create_emi(
            subscription=self.subscription,
            month_no=1,
            amount=Decimal("1000.00"),
            due_date=date(2026, 3, 7),
        )
        self.emi_2 = create_emi(
            subscription=self.subscription,
            month_no=2,
            amount=Decimal("1000.00"),
            due_date=date(2026, 4, 7),
        )

    def _audit_logs_for_object(self, object_id):
        return AuditLog.objects.filter(object_id=object_id).order_by("created_at", "id")

    def _audit_log_actions(self, object_id):
        return list(
            self._audit_logs_for_object(object_id).values_list("action_type", flat=True)
        )

    def test_payment_collection_creates_audit_log(self):
        result = record_emi_payment(
            emi_id=self.emi_1.id,
            amount=Decimal("1000.00"),
            collected_by=self.admin,
            method="CASH",
            reference_no="AUDIT-PAY-001",
        )
        payment = result["payment"]

        logs = self._audit_logs_for_object(payment.id)

        self.assertEqual(
            logs.count(),
            1,
            msg=f"Expected 1 audit log for payment collection, found {logs.count()}",
        )

        log = logs.first()
        self.assertEqual(log.action_type, AuditLog.ActionType.EMI_PAID)
        self.assertEqual(log.model_name, "payment")
        self.assertEqual(log.object_id, payment.id)
        self.assertEqual(getattr(log, "performed_by_id", None), self.admin.id)

        metadata = getattr(log, "metadata", {}) or {}
        self.assertEqual(metadata.get("payment_id"), payment.id)
        self.assertEqual(metadata.get("subscription_id"), self.subscription.id)
        self.assertEqual(metadata.get("emi_id"), self.emi_1.id)
        self.assertEqual(metadata.get("amount"), "1000.00")
        self.assertEqual(metadata.get("method"), "CASH")
        self.assertEqual(metadata.get("reference_no"), "AUDIT-PAY-001")

    def test_payment_reversal_creates_audit_log(self):
        result = record_emi_payment(
            emi_id=self.emi_1.id,
            amount=Decimal("1000.00"),
            collected_by=self.admin,
            method="CASH",
            reference_no="AUDIT-PAY-002",
        )
        payment = result["payment"]

        reverse_payment_for_admin(
            payment_id=payment.id,
            reversed_by=self.admin,
            reason="audit reversal test",
        )

        logs = self._audit_logs_for_object(payment.id)
        actions = self._audit_log_actions(payment.id)

        self.assertIn(
            AuditLog.ActionType.EMI_PAID,
            actions,
            msg=f"Expected EMI_PAID in audit actions, got {actions}",
        )
        self.assertIn(
            AuditLog.ActionType.PAYMENT_RECONCILED,
            actions,
            msg=f"Expected PAYMENT_RECONCILED in audit actions, got {actions}",
        )

        reversal_log = logs.filter(
            action_type=AuditLog.ActionType.PAYMENT_RECONCILED
        ).first()
        self.assertIsNotNone(reversal_log, "Expected reversal audit log to exist.")

        metadata = getattr(reversal_log, "metadata", {}) or {}
        self.assertEqual(metadata.get("payment_id"), payment.id)
        self.assertEqual(metadata.get("subscription_id"), self.subscription.id)
        self.assertEqual(metadata.get("emi_id"), self.emi_1.id)
        self.assertEqual(metadata.get("amount"), "1000.00")
        self.assertEqual(metadata.get("reason"), "audit reversal test")

    def test_duplicate_reference_safe_return_does_not_create_duplicate_audit_logs(self):
        first = record_emi_payment(
            emi_id=self.emi_1.id,
            amount=Decimal("1000.00"),
            collected_by=self.admin,
            method="CASH",
            reference_no="AUDIT-PAY-003",
        )
        payment = first["payment"]

        second = record_emi_payment(
            emi_id=self.emi_1.id,
            amount=Decimal("1000.00"),
            collected_by=self.admin,
            method="CASH",
            reference_no="AUDIT-PAY-003",
        )

        self.assertFalse(second["created"])
        self.assertEqual(second["payment"].id, payment.id)

        logs = self._audit_logs_for_object(payment.id)
        actions = self._audit_log_actions(payment.id)

        self.assertEqual(
            logs.count(),
            1,
            msg=f"Expected exactly 1 audit log after duplicate-safe return, got {logs.count()} actions={actions}",
        )
        self.assertEqual(actions, [AuditLog.ActionType.EMI_PAID])

    def test_second_reversal_attempt_does_not_create_extra_audit_log(self):
        result = record_emi_payment(
            emi_id=self.emi_1.id,
            amount=Decimal("1000.00"),
            collected_by=self.admin,
            method="CASH",
            reference_no="AUDIT-PAY-004",
        )
        payment = result["payment"]

        reverse_payment_for_admin(
            payment_id=payment.id,
            reversed_by=self.admin,
            reason="first reversal",
        )

        with self.assertRaisesMessage(ValueError, "Payment is already reversed."):
            reverse_payment_for_admin(
                payment_id=payment.id,
                reversed_by=self.admin,
                reason="second reversal",
            )

        logs = self._audit_logs_for_object(payment.id)
        actions = self._audit_log_actions(payment.id)

        self.assertEqual(
            logs.count(),
            2,
            msg=f"Expected exactly 2 audit logs after failed second reversal, got {logs.count()} actions={actions}",
        )
        self.assertEqual(actions.count(AuditLog.ActionType.EMI_PAID), 1)
        self.assertEqual(actions.count(AuditLog.ActionType.PAYMENT_RECONCILED), 1)

    def test_verify_payment_audit_log_only_if_verify_flow_is_used(self):
        result = record_emi_payment(
            emi_id=self.emi_1.id,
            amount=Decimal("1000.00"),
            collected_by=self.admin,
            method="CASH",
            reference_no="AUDIT-PAY-005",
        )
        payment = result["payment"]

        actions = self._audit_log_actions(payment.id)

        self.assertIn(AuditLog.ActionType.EMI_PAID, actions)

    def test_audit_logs_are_isolated_per_payment(self):
        first = record_emi_payment(
            emi_id=self.emi_1.id,
            amount=Decimal("1000.00"),
            collected_by=self.admin,
            method="CASH",
            reference_no="AUDIT-PAY-006",
        )
        second = record_emi_payment(
            emi_id=self.emi_2.id,
            amount=Decimal("1000.00"),
            collected_by=self.admin,
            method="CASH",
            reference_no="AUDIT-PAY-007",
        )

        first_logs = self._audit_logs_for_object(first["payment"].id)
        second_logs = self._audit_logs_for_object(second["payment"].id)

        self.assertEqual(first_logs.count(), 1)
        self.assertEqual(second_logs.count(), 1)

        first_metadata = getattr(first_logs.first(), "metadata", {}) or {}
        second_metadata = getattr(second_logs.first(), "metadata", {}) or {}

        self.assertEqual(first_metadata.get("payment_id"), first["payment"].id)
        self.assertEqual(second_metadata.get("payment_id"), second["payment"].id)
        self.assertNotEqual(first["payment"].id, second["payment"].id)