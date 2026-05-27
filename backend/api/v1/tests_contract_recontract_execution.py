from datetime import date, timedelta
from decimal import Decimal

from django.apps import apps
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from accounting.models import JournalEntry
from reconciliation.models import ReconciliationEvidence, ReconciliationItem, ReconciliationRun
from subscriptions.models import (
    Batch,
    BatchStatus,
    ContractAmendment,
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
    create_product_recontract_financial_impact_preview,
    create_product_recontract_preview_snapshot,
    create_product_recontract_schedule_preview,
    record_product_recontract_admin_approval,
    record_product_recontract_customer_consent,
)


class ContractRecontractExecutionTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        User = get_user_model()
        self.admin = User.objects.create_user(username="phase6f_admin", password="x", role="ADMIN", phone="9850000100")
        self.customer_user = User.objects.create_user(username="phase6f_customer", password="x", role="CUSTOMER", phone="9850000101")
        self.partner_user = User.objects.create_user(username="phase6f_partner", password="x", role="PARTNER", phone="9850000102")

        self.customer = Customer.objects.create(user=self.customer_user, name="Phase6F Customer", phone="9850000101")
        self.product = Product.objects.create(product_code="P6F-OLD", name="Old", base_price=Decimal("20000.00"), is_active=True)
        self.target = Product.objects.create(product_code="P6F-NEW", name="New", base_price=Decimal("24000.00"), is_active=True)
        self.batch = Batch.objects.create(batch_code="P6F-BATCH", total_slots=100, duration_months=10, draw_day=5, start_date=date(2026, 1, 1), status=BatchStatus.OPEN)
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
                reference_no=f"P6F-PAY-{idx}",
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
            reason="Phase 6F execute.",
            approved_by=self.admin,
        )

    def _prepare(self, with_financial_preview=True):
        create_product_recontract_preview_snapshot(amendment=self.amendment, requested_by=self.admin)
        record_product_recontract_customer_consent(amendment=self.amendment, customer_user=self.customer_user, decision="ACCEPTED", note="ok")
        record_product_recontract_admin_approval(amendment=self.amendment, admin_user=self.admin, decision="APPROVED", note="ok")
        create_product_recontract_schedule_preview(amendment=self.amendment, requested_by=self.admin)
        if with_financial_preview:
            create_product_recontract_financial_impact_preview(amendment=self.amendment, requested_by=self.admin)

    def _counts(self):
        receipt_model = apps.get_model("billing", "ReceiptDocument", require_ready=False)
        return {
            "payments": Payment.objects.count(),
            "receipts": receipt_model.objects.count(),
            "paid_emis": Emi.objects.filter(subscription=self.subscription, status=EmiStatus.PAID).count(),
            "journals": JournalEntry.objects.count(),
            "reconciliation_runs": ReconciliationRun.objects.count(),
            "reconciliation_items": ReconciliationItem.objects.count(),
            "reconciliation_evidence": ReconciliationEvidence.objects.count(),
        }

    def _subscription_state(self):
        self.subscription.refresh_from_db()
        return {
            "product_id": self.subscription.product_id,
            "total_amount": self.subscription.total_amount,
            "monthly_amount": self.subscription.monthly_amount,
            "emi_rows": list(
                Emi.objects.filter(subscription=self.subscription)
                .order_by("month_no")
                .values_list("id", "month_no", "due_date", "amount", "status")
            ),
            "payment_rows": list(
                Payment.objects.filter(subscription=self.subscription)
                .order_by("id")
                .values_list("id", "emi_id", "amount", "reference_no")
            ),
        }

    def test_execute_rejects_before_financial_preview(self):
        self._prepare(with_financial_preview=False)
        before = self._counts()
        before_state = self._subscription_state()
        self.client.force_authenticate(self.admin)
        response = self.client.post(f"/api/v1/admin/contract-amendments/{self.amendment.id}/product-recontract/execute/", {}, format="json")
        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(before, self._counts())
        self.assertEqual(before_state, self._subscription_state())

    def test_execute_is_blocked_after_all_gates_without_source_mutation(self):
        self._prepare(with_financial_preview=True)
        before = self._counts()
        before_state = self._subscription_state()
        self.client.force_authenticate(self.admin)
        response = self.client.post(f"/api/v1/admin/contract-amendments/{self.amendment.id}/product-recontract/execute/", {}, format="json")
        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(
            response.data["detail"],
            "Product recontract execution requires accounting and reconciliation posting integration and is not enabled yet.",
        )

        self.subscription.refresh_from_db()
        self.amendment.refresh_from_db()
        self.assertEqual(self.amendment.status, "APPROVED")
        self.assertEqual(before, self._counts())
        self.assertEqual(before_state, self._subscription_state())

    def test_non_admin_cannot_execute(self):
        self._prepare(with_financial_preview=True)
        before = self._counts()
        before_state = self._subscription_state()
        self.client.force_authenticate(self.partner_user)
        response = self.client.post(f"/api/v1/admin/contract-amendments/{self.amendment.id}/product-recontract/execute/", {}, format="json")
        self.assertEqual(response.status_code, 403, response.data)
        self.assertEqual(before, self._counts())
        self.assertEqual(before_state, self._subscription_state())
