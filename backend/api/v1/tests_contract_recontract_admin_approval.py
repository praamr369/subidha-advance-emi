from datetime import date, timedelta
from decimal import Decimal

from django.apps import apps
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from subscriptions.models import (
    AuditLog,
    Batch,
    BatchStatus,
    ContractAmendment,
    ContractRecontractEvent,
    Customer,
    Emi,
    EmiStatus,
    FinancialLedger,
    LedgerDirection,
    LedgerEntryType,
    LuckyId,
    Payment,
    PaymentMethod,
    PlanType,
    Product,
    Subscription,
    SubscriptionStatus,
)
from subscriptions.services.product_recontract_preview_service import (
    create_product_recontract_preview_snapshot,
    record_product_recontract_customer_consent,
)


class ContractRecontractAdminApprovalTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        User = get_user_model()
        self.admin = User.objects.create_user(username="phase6c_admin", password="x", role="ADMIN", phone="9822000100")
        self.customer_user = User.objects.create_user(username="phase6c_customer", password="x", role="CUSTOMER", phone="9822000101")
        self.partner_user = User.objects.create_user(username="phase6c_partner", password="x", role="PARTNER", phone="9822000102")
        self.cashier = User.objects.create_user(username="phase6c_cashier", password="x", role="CASHIER", phone="9822000103")
        self.vendor = User.objects.create_user(username="phase6c_vendor", password="x", role="VENDOR", phone="9822000104")

        self.customer = Customer.objects.create(user=self.customer_user, name="Phase6C Customer", phone="9822000101")
        self.product = Product.objects.create(product_code="P6C-OLD", name="Original Product", base_price=Decimal("20000.00"), is_active=True)
        self.target = Product.objects.create(product_code="P6C-NEW", name="Replacement Product", base_price=Decimal("25000.00"), is_active=True)
        self.batch = Batch.objects.create(batch_code="P6C-BATCH", total_slots=100, duration_months=10, draw_day=5, start_date=date(2026, 1, 1), status=BatchStatus.OPEN)
        self.lucky_id = LuckyId.objects.filter(batch=self.batch, lucky_number=1).first() or LuckyId.objects.create(batch=self.batch, lucky_number=1)
        self.subscription = Subscription.objects.create(
            customer=self.customer,
            product=self.product,
            partner=self.partner_user,
            batch=self.batch,
            lucky_id=self.lucky_id,
            plan_type=PlanType.EMI,
            tenure_months=10,
            start_date=date(2026, 1, 1),
            total_amount=Decimal("20000.00"),
            monthly_amount=Decimal("2000.00"),
            status=SubscriptionStatus.ACTIVE,
        )
        self.emis = [
            Emi.objects.create(
                subscription=self.subscription,
                month_no=month,
                due_date=date(2026, 1, 1) + timedelta(days=30 * (month - 1)),
                amount=Decimal("2000.00"),
                status=EmiStatus.PAID if month <= 2 else EmiStatus.PENDING,
            )
            for month in range(1, 11)
        ]
        for index, emi in enumerate(self.emis[:2], start=1):
            payment = Payment.objects.create(
                customer=self.customer,
                subscription=self.subscription,
                emi=emi,
                amount=Decimal("2000.00"),
                method=PaymentMethod.CASH,
                reference_no=f"P6C-PAY-{index}",
                payment_date=date(2026, 1, index),
                collected_by=self.admin,
            )
            FinancialLedger.objects.create(
                payment=payment,
                emi=emi,
                amount=Decimal("2000.00"),
                entry_type=LedgerEntryType.EMI_PAYMENT,
                entry_direction=LedgerDirection.CREDIT,
            )
        self.amendment = ContractAmendment.objects.create(
            subscription=self.subscription,
            contract_type="EMI_SUBSCRIPTION",
            customer=self.customer,
            partner=self.partner_user,
            requested_by=self.customer_user,
            requested_role="CUSTOMER",
            amendment_type="PRODUCT_CHANGE",
            status="APPROVED",
            requested_values={"approved_product_id": self.target.id},
            approved_values={"approved_product_id": self.target.id, "approved_product_name": self.target.name},
            reason="Admin decision recontract preview.",
            approved_by=self.admin,
        )

    def counts(self):
        receipt_model = apps.get_model("billing", "ReceiptDocument", require_ready=False)
        journal_model = apps.get_model("accounting", "JournalEntry", require_ready=False)
        reconciliation_model = apps.get_model("reconciliation", "ReconciliationItem", require_ready=False)
        return {
            "emis": Emi.objects.count(),
            "payments": Payment.objects.count(),
            "receipts": receipt_model.objects.count(),
            "journals": journal_model.objects.count(),
            "reconciliation_items": reconciliation_model.objects.count(),
        }

    def assert_source_records_unchanged(self, counts):
        self.subscription.refresh_from_db()
        self.assertEqual(self.subscription.product_id, self.product.id)
        self.assertEqual(self.subscription.total_amount, Decimal("20000.00"))
        self.assertEqual(self.subscription.monthly_amount, Decimal("2000.00"))
        self.assertEqual(self.subscription.tenure_months, 10)
        self.assertEqual(self.counts(), counts)

    def save_preview(self):
        return create_product_recontract_preview_snapshot(amendment=self.amendment, requested_by=self.admin)

    def accept_preview(self):
        event = self.save_preview()
        return record_product_recontract_customer_consent(
            amendment=self.amendment,
            customer_user=self.customer_user,
            decision="ACCEPTED",
            note="Customer accepted.",
        ) or event

    def reject_preview_by_customer(self):
        event = self.save_preview()
        return record_product_recontract_customer_consent(
            amendment=self.amendment,
            customer_user=self.customer_user,
            decision="REJECTED",
            note="Customer rejected.",
        ) or event

    def post_decision(self, amendment=None, payload=None):
        amendment = amendment or self.amendment
        payload = payload or {"decision": "APPROVED", "note": "Approved for future execution phase."}
        return self.client.post(f"/api/v1/admin/contract-amendments/{amendment.id}/product-recontract/admin-decision/", payload, format="json")

    def test_admin_can_approve_customer_accepted_preview(self):
        event = self.accept_preview()
        counts = self.counts()
        self.client.force_authenticate(self.admin)

        response = self.post_decision(payload={"decision": "APPROVED", "note": "Proceed later."})

        self.assertEqual(response.status_code, 200, response.data)
        event.refresh_from_db()
        self.assertEqual(event.admin_approval_status, "APPROVED")
        self.assertEqual(event.admin_approval_note, "Proceed later.")
        self.assertEqual(event.admin_approved_by_id, self.admin.id)
        self.assertIsNotNone(event.admin_approved_at)
        self.assertEqual(event.admin_approval_snapshot["decision"], "APPROVED")
        self.assertFalse(event.admin_approval_snapshot["source_record_mutation"])
        self.assertFalse(event.admin_approval_snapshot["execution_performed"])
        self.assertEqual(response.data["customer_consent_status"], "ACCEPTED")
        self.assertEqual(response.data["admin_approval_status"], "APPROVED")
        self.assertTrue(AuditLog.objects.filter(metadata__event="CONTRACT_RECONTRACT_ADMIN_DECISION_RECORDED", metadata__source_record_mutation=False).exists())
        self.assert_source_records_unchanged(counts)

    def test_admin_can_reject_customer_accepted_preview(self):
        event = self.accept_preview()
        counts = self.counts()
        self.client.force_authenticate(self.admin)

        response = self.post_decision(payload={"decision": "REJECTED", "note": "Do not proceed."})

        self.assertEqual(response.status_code, 200, response.data)
        event.refresh_from_db()
        self.assertEqual(event.admin_approval_status, "REJECTED")
        self.assertEqual(event.admin_approval_note, "Do not proceed.")
        self.assertEqual(event.admin_approved_by_id, self.admin.id)
        self.assertIsNotNone(event.admin_approved_at)
        self.assertEqual(event.admin_approval_snapshot["decision"], "REJECTED")
        self.assertFalse(event.admin_approval_snapshot["source_record_mutation"])
        self.assertFalse(event.admin_approval_snapshot["execution_performed"])
        self.assert_source_records_unchanged(counts)

    def test_admin_cannot_approve_without_saved_preview(self):
        self.client.force_authenticate(self.admin)

        response = self.post_decision()

        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn("no saved", str(response.data).lower())

    def test_admin_cannot_approve_when_customer_consent_is_pending(self):
        self.save_preview()
        self.client.force_authenticate(self.admin)

        response = self.post_decision()

        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn("accepted", str(response.data).lower())

    def test_admin_cannot_approve_when_customer_rejected(self):
        self.reject_preview_by_customer()
        self.client.force_authenticate(self.admin)

        response = self.post_decision()

        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn("rejected", str(response.data).lower())

    def test_admin_cannot_approve_superseded_or_cancelled_preview(self):
        for event_status in ["SUPERSEDED", "CANCELLED"]:
            with self.subTest(event_status=event_status):
                ContractRecontractEvent.objects.all().delete()
                event = self.accept_preview()
                event.status = event_status
                event.save(update_fields=["status", "updated_at"])
                self.client.force_authenticate(self.admin)

                response = self.post_decision()

                self.assertEqual(response.status_code, 400, response.data)
                self.assertIn("previewed", str(response.data).lower())

    def test_second_admin_decision_attempt_is_rejected(self):
        self.accept_preview()
        self.client.force_authenticate(self.admin)
        first = self.post_decision(payload={"decision": "APPROVED"})
        second = self.post_decision(payload={"decision": "REJECTED"})

        self.assertEqual(first.status_code, 200, first.data)
        self.assertEqual(second.status_code, 400, second.data)
        self.assertIn("already", str(second.data).lower())

    def test_non_admin_roles_cannot_call_admin_decision_endpoint(self):
        self.accept_preview()
        for user in [self.customer_user, self.partner_user, self.cashier, self.vendor]:
            with self.subTest(role=user.role):
                self.client.force_authenticate(user)
                response = self.post_decision()
                self.assertEqual(response.status_code, 403, response.data)

    def test_admin_approval_does_not_mutate_financial_or_source_records(self):
        self.accept_preview()
        counts = self.counts()
        self.client.force_authenticate(self.admin)

        response = self.post_decision(payload={"decision": "APPROVED", "note": "Decision only."})

        self.assertEqual(response.status_code, 200, response.data)
        self.assert_source_records_unchanged(counts)
