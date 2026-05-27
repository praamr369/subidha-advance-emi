from datetime import date, timedelta
from decimal import Decimal

from django.apps import apps
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from subscriptions.models import (
    Batch,
    BatchStatus,
    ContractAmendment,
    ContractRecontractEvent,
    ContractRecontractScheduleLine,
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
    record_product_recontract_admin_approval,
    record_product_recontract_customer_consent,
)


class ContractRecontractSchedulePreviewTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        User = get_user_model()
        self.admin = User.objects.create_user(username="phase6d_admin", password="x", role="ADMIN", phone="9830000100")
        self.customer_user = User.objects.create_user(username="phase6d_customer", password="x", role="CUSTOMER", phone="9830000101")
        self.partner_user = User.objects.create_user(username="phase6d_partner", password="x", role="PARTNER", phone="9830000102")
        self.cashier = User.objects.create_user(username="phase6d_cashier", password="x", role="CASHIER", phone="9830000103")
        self.vendor = User.objects.create_user(username="phase6d_vendor", password="x", role="VENDOR", phone="9830000104")

        self.customer = Customer.objects.create(user=self.customer_user, name="Phase6D Customer", phone="9830000101")
        self.product = Product.objects.create(product_code="P6D-OLD", name="Old", base_price=Decimal("20000.00"), is_active=True)
        self.target = Product.objects.create(product_code="P6D-NEW", name="New", base_price=Decimal("25000.00"), is_active=True)
        self.batch = Batch.objects.create(batch_code="P6D-BATCH", total_slots=100, duration_months=10, draw_day=5, start_date=date(2026, 1, 1), status=BatchStatus.OPEN)
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
        for idx, emi in enumerate(self.emis[:2], start=1):
            payment = Payment.objects.create(
                customer=self.customer,
                subscription=self.subscription,
                emi=emi,
                amount=Decimal("2000.00"),
                method=PaymentMethod.CASH,
                reference_no=f"P6D-PAY-{idx}",
                payment_date=date(2026, 1, idx),
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
            approved_values={"approved_product_id": self.target.id},
            reason="Phase 6D schedule preview.",
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

    def assert_no_source_mutation(self, before_counts):
        self.subscription.refresh_from_db()
        self.assertEqual(self.subscription.product_id, self.product.id)
        self.assertEqual(self.subscription.total_amount, Decimal("20000.00"))
        self.assertEqual(self.subscription.monthly_amount, Decimal("2000.00"))
        self.assertEqual(self.subscription.tenure_months, 10)
        self.assertEqual(self.counts(), before_counts)
        self.assertEqual(list(Emi.objects.filter(subscription=self.subscription).values_list("status", flat=True)).count("PAID"), 2)

    def prime_event(self, consent="ACCEPTED", approval="APPROVED"):
        create_product_recontract_preview_snapshot(amendment=self.amendment, requested_by=self.admin)
        if consent:
            record_product_recontract_customer_consent(
                amendment=self.amendment,
                customer_user=self.customer_user,
                decision=consent,
                note="consent",
            )
        if approval and consent == "ACCEPTED":
            record_product_recontract_admin_approval(
                amendment=self.amendment,
                admin_user=self.admin,
                decision=approval,
                note="approval",
            )
        return ContractRecontractEvent.objects.order_by("-id").first()

    def post_generate(self, user):
        self.client.force_authenticate(user)
        return self.client.post(f"/api/v1/admin/contract-amendments/{self.amendment.id}/product-recontract/schedule-preview/", {}, format="json")

    def test_admin_can_generate_schedule_preview_after_accept_and_approve(self):
        self.prime_event()
        before = self.counts()
        response = self.post_generate(self.admin)
        self.assertEqual(response.status_code, 201, response.data)
        self.assertTrue(response.data["metadata"].get("schedule_preview_created"))
        self.assertEqual(len(response.data["schedule_preview_lines"]), 8)
        self.assertTrue(all(not line["source_record_mutation"] for line in response.data["schedule_preview_lines"]))
        self.assert_no_source_mutation(before)

    def test_generation_rejected_before_customer_consent(self):
        create_product_recontract_preview_snapshot(amendment=self.amendment, requested_by=self.admin)
        response = self.post_generate(self.admin)
        self.assertEqual(response.status_code, 400, response.data)

    def test_generation_rejected_before_admin_approval(self):
        self.prime_event(consent="ACCEPTED", approval=None)
        response = self.post_generate(self.admin)
        self.assertEqual(response.status_code, 400, response.data)

    def test_generation_rejected_for_rejected_superseded_cancelled(self):
        for state in ["REJECTED", "SUPERSEDED", "CANCELLED"]:
            ContractRecontractScheduleLine.objects.all().delete()
            event = self.prime_event(consent="ACCEPTED", approval="REJECTED" if state == "REJECTED" else "APPROVED")
            if state in {"SUPERSEDED", "CANCELLED"}:
                event.status = state
                event.save(update_fields=["status", "updated_at"])
            response = self.post_generate(self.admin)
            self.assertEqual(response.status_code, 400, response.data)

    def test_lines_persist_and_rounding_is_deterministic(self):
        event = self.prime_event()
        event.new_remaining_balance = Decimal("21000.01")
        event.save(update_fields=["new_remaining_balance", "updated_at"])
        response = self.post_generate(self.admin)
        self.assertEqual(response.status_code, 201, response.data)
        lines = ContractRecontractScheduleLine.objects.filter(event=event, proposed_status="PREVIEW_ONLY").order_by("line_no")
        self.assertEqual(lines.count(), 8)
        total = sum((line.proposed_amount for line in lines), Decimal("0.00"))
        self.assertEqual(total, Decimal("21000.01"))

    def test_roles_cannot_generate_schedule_preview(self):
        self.prime_event()
        for user in [self.customer_user, self.partner_user, self.cashier, self.vendor]:
            response = self.post_generate(user)
            self.assertEqual(response.status_code, 403)

    def test_get_schedule_preview_lines_admin_only(self):
        self.prime_event()
        self.post_generate(self.admin)
        self.client.force_authenticate(self.admin)
        ok = self.client.get(f"/api/v1/admin/contract-amendments/{self.amendment.id}/product-recontract/schedule-preview/")
        self.assertEqual(ok.status_code, 200, ok.data)
        self.assertGreaterEqual(len(ok.data), 1)
