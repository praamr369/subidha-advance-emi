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
from subscriptions.services.product_recontract_preview_service import create_product_recontract_preview_snapshot


class ContractRecontractCustomerConsentTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        User = get_user_model()
        self.admin = User.objects.create_user(username="phase6b_admin", password="x", role="ADMIN", phone="9821000100")
        self.customer_user = User.objects.create_user(username="phase6b_customer", password="x", role="CUSTOMER", phone="9821000101")
        self.other_customer_user = User.objects.create_user(username="phase6b_other_customer", password="x", role="CUSTOMER", phone="9821000102")
        self.partner_user = User.objects.create_user(username="phase6b_partner", password="x", role="PARTNER", phone="9821000103")
        self.cashier = User.objects.create_user(username="phase6b_cashier", password="x", role="CASHIER", phone="9821000104")
        self.vendor = User.objects.create_user(username="phase6b_vendor", password="x", role="VENDOR", phone="9821000105")

        self.customer = Customer.objects.create(user=self.customer_user, name="Phase6B Customer", phone="9821000101")
        self.other_customer = Customer.objects.create(user=self.other_customer_user, name="Other Customer", phone="9821000102")
        self.product = Product.objects.create(product_code="P6B-OLD", name="Original Product", base_price=Decimal("20000.00"), is_active=True)
        self.target = Product.objects.create(product_code="P6B-NEW", name="Replacement Product", base_price=Decimal("25000.00"), is_active=True)
        self.batch = Batch.objects.create(batch_code="P6B-BATCH", total_slots=100, duration_months=10, draw_day=5, start_date=date(2026, 1, 1), status=BatchStatus.OPEN)
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
                reference_no=f"P6B-PAY-{index}",
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
            reason="Customer consent recontract preview.",
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

    def post_consent(self, amendment=None, payload=None):
        amendment = amendment or self.amendment
        payload = payload or {"decision": "ACCEPTED", "note": "I agree to the preview."}
        return self.client.post(f"/api/v1/customer/contract-amendments/{amendment.id}/product-recontract/consent/", payload, format="json")

    def test_customer_can_view_latest_saved_preview_summary_for_own_amendment(self):
        self.save_preview()
        self.client.force_authenticate(self.customer_user)

        response = self.client.get(f"/api/v1/customer/contract-amendments/{self.amendment.id}/")

        self.assertEqual(response.status_code, 200, response.data)
        summary = response.data["latest_product_recontract_preview"]
        self.assertEqual(summary["old_product_name"], "Original Product")
        self.assertEqual(summary["new_product_name"], "Replacement Product")
        self.assertEqual(summary["old_contract_total"], "20000.00")
        self.assertEqual(summary["new_contract_total"], "25000.00")
        self.assertEqual(summary["price_difference"], "5000.00")
        self.assertEqual(summary["amount_already_paid"], "4000.00")
        self.assertEqual(summary["proposed_new_remaining_balance"], "21000.00")
        self.assertEqual(summary["current_monthly_amount"], "2000.00")
        self.assertEqual(summary["proposed_monthly_amount"], "2500.00")
        self.assertEqual(summary["impact_type"], "UPGRADE_EXTRA_PAYABLE")
        self.assertEqual(summary["customer_consent_status"], "PENDING")
        self.assertFalse(summary["source_record_mutation"])

    def test_customer_can_accept_preview_and_metadata_is_stored_without_source_mutation(self):
        event = self.save_preview()
        counts = self.counts()
        self.client.force_authenticate(self.customer_user)

        response = self.post_consent(payload={"decision": "ACCEPTED", "note": "Accepted by customer."})

        self.assertEqual(response.status_code, 200, response.data)
        event.refresh_from_db()
        self.assertEqual(event.customer_consent_status, "ACCEPTED")
        self.assertEqual(event.customer_consent_note, "Accepted by customer.")
        self.assertEqual(event.customer_consented_by_id, self.customer_user.id)
        self.assertIsNotNone(event.customer_consented_at)
        self.assertEqual(event.customer_consent_snapshot["decision"], "ACCEPTED")
        self.assertEqual(event.customer_consent_snapshot["source_record_mutation"], False)
        self.assertTrue(AuditLog.objects.filter(metadata__event="CONTRACT_RECONTRACT_CUSTOMER_CONSENT_RECORDED", metadata__source_record_mutation=False).exists())
        self.assert_source_records_unchanged(counts)

    def test_customer_can_reject_preview(self):
        event = self.save_preview()
        self.client.force_authenticate(self.customer_user)

        response = self.post_consent(payload={"decision": "REJECTED", "note": "Do not proceed."})

        self.assertEqual(response.status_code, 200, response.data)
        event.refresh_from_db()
        self.assertEqual(event.customer_consent_status, "REJECTED")
        self.assertEqual(event.customer_consent_note, "Do not proceed.")

    def test_second_consent_attempt_is_rejected(self):
        self.save_preview()
        self.client.force_authenticate(self.customer_user)
        first = self.post_consent(payload={"decision": "ACCEPTED"})
        second = self.post_consent(payload={"decision": "REJECTED"})

        self.assertEqual(first.status_code, 200, first.data)
        self.assertEqual(second.status_code, 400, second.data)
        self.assertIn("already", str(second.data).lower())

    def test_customer_cannot_consent_to_another_customers_amendment(self):
        self.save_preview()
        self.client.force_authenticate(self.other_customer_user)

        response = self.post_consent()

        self.assertEqual(response.status_code, 404, response.data)

    def test_non_customer_roles_cannot_consent(self):
        self.save_preview()
        for user in [self.partner_user, self.admin, self.cashier, self.vendor]:
            with self.subTest(role=user.role):
                self.client.force_authenticate(user)
                response = self.post_consent()
                self.assertEqual(response.status_code, 403, response.data)

    def test_consent_rejected_if_no_saved_preview_exists(self):
        self.client.force_authenticate(self.customer_user)

        response = self.post_consent()

        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn("no saved", str(response.data).lower())

    def test_consent_rejected_if_latest_preview_is_superseded_or_cancelled(self):
        for event_status in ["SUPERSEDED", "CANCELLED"]:
            with self.subTest(event_status=event_status):
                ContractRecontractEvent.objects.all().delete()
                event = self.save_preview()
                event.status = event_status
                event.save(update_fields=["status", "updated_at"])
                self.client.force_authenticate(self.customer_user)

                response = self.post_consent()

                self.assertEqual(response.status_code, 400, response.data)
                self.assertIn("previewed", str(response.data).lower())

    def test_consent_does_not_mutate_financial_or_source_records(self):
        self.save_preview()
        counts = self.counts()
        self.client.force_authenticate(self.customer_user)

        response = self.post_consent(payload={"decision": "ACCEPTED", "note": "Source records must remain unchanged."})

        self.assertEqual(response.status_code, 200, response.data)
        self.assert_source_records_unchanged(counts)
