from datetime import date, timedelta
from decimal import Decimal

from django.apps import apps
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from accounting.models import FinanceAccount
from subscriptions.models import (
    Batch,
    BatchStatus,
    ContractAmendment,
    ContractRecontractEvent,
    ContractRecontractFinancialImpactPreview,
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
    create_product_recontract_schedule_preview,
    record_product_recontract_admin_approval,
    record_product_recontract_customer_consent,
)


class ContractRecontractFinancialImpactPreviewTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        User = get_user_model()
        self.admin = User.objects.create_user(username="phase6e_admin", password="x", role="ADMIN", phone="9840000100")
        self.customer_user = User.objects.create_user(username="phase6e_customer", password="x", role="CUSTOMER", phone="9840000101")
        self.partner_user = User.objects.create_user(username="phase6e_partner", password="x", role="PARTNER", phone="9840000102")
        self.cashier = User.objects.create_user(username="phase6e_cashier", password="x", role="CASHIER", phone="9840000103")
        self.vendor = User.objects.create_user(username="phase6e_vendor", password="x", role="VENDOR", phone="9840000104")

        self.customer = Customer.objects.create(user=self.customer_user, name="Phase6E Customer", phone="9840000101")
        self.product = Product.objects.create(product_code="P6E-OLD", name="Old", base_price=Decimal("20000.00"), is_active=True)
        self.upgrade_target = Product.objects.create(product_code="P6E-UP", name="Upgrade", base_price=Decimal("25000.00"), is_active=True)
        self.downgrade_target = Product.objects.create(product_code="P6E-DN", name="Downgrade", base_price=Decimal("18000.00"), is_active=True)
        self.same_target = Product.objects.create(product_code="P6E-SM", name="Same", base_price=Decimal("20000.00"), is_active=True)
        self.batch = Batch.objects.create(batch_code="P6E-BATCH", total_slots=100, duration_months=10, draw_day=5, start_date=date(2026, 1, 1), status=BatchStatus.OPEN)
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
                reference_no=f"P6E-PAY-{idx}",
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

    def _amendment(self, target_product):
        return ContractAmendment.objects.create(
            subscription=self.subscription,
            contract_type="EMI_SUBSCRIPTION",
            customer=self.customer,
            partner=self.partner_user,
            requested_by=self.customer_user,
            requested_role="CUSTOMER",
            amendment_type="PRODUCT_CHANGE",
            status="APPROVED",
            requested_values={"approved_product_id": target_product.id},
            approved_values={"approved_product_id": target_product.id},
            reason="Phase 6E financial impact preview.",
            approved_by=self.admin,
        )

    def _counts(self):
        receipt_model = apps.get_model("billing", "ReceiptDocument", require_ready=False)
        journal_model = apps.get_model("accounting", "JournalEntry", require_ready=False)
        reconciliation_model = apps.get_model("reconciliation", "ReconciliationItem", require_ready=False)
        return {
            "journal_entries": journal_model.objects.count(),
            "reconciliation_items": reconciliation_model.objects.count(),
            "payments": Payment.objects.count(),
            "receipts": receipt_model.objects.count(),
            "finance_accounts": FinanceAccount.objects.count(),
            "finance_opening_total": sum((row.opening_balance for row in FinanceAccount.objects.all()), Decimal("0.00")),
            "emis": Emi.objects.count(),
        }

    def _prime(self, amendment, consent="ACCEPTED", admin_decision="APPROVED", with_schedule=True):
        create_product_recontract_preview_snapshot(amendment=amendment, requested_by=self.admin)
        if consent:
            record_product_recontract_customer_consent(amendment=amendment, customer_user=self.customer_user, decision=consent, note="ok")
        if admin_decision and consent == "ACCEPTED":
            record_product_recontract_admin_approval(amendment=amendment, admin_user=self.admin, decision=admin_decision, note="ok")
        if with_schedule and consent == "ACCEPTED" and admin_decision == "APPROVED":
            create_product_recontract_schedule_preview(amendment=amendment, requested_by=self.admin)

    def _post(self, amendment, user):
        self.client.force_authenticate(user)
        return self.client.post(f"/api/v1/admin/contract-amendments/{amendment.id}/product-recontract/financial-impact-preview/", {}, format="json")

    def _assert_no_source_mutation(self, before):
        self.subscription.refresh_from_db()
        self.assertEqual(self.subscription.product_id, self.product.id)
        self.assertEqual(self.subscription.total_amount, Decimal("20000.00"))
        self.assertEqual(self.subscription.monthly_amount, Decimal("2000.00"))
        self.assertEqual(self.subscription.tenure_months, 10)
        self.assertEqual(self._counts(), before)
        self.assertEqual(Emi.objects.filter(subscription=self.subscription).count(), 10)

    def test_admin_can_generate_upgrade_financial_impact_preview(self):
        amendment = self._amendment(self.upgrade_target)
        self._prime(amendment)
        before = self._counts()

        response = self._post(amendment, self.admin)

        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["impact_type"], "UPGRADE_EXTRA_PAYABLE")
        self.assertEqual(response.data["additional_receivable_amount"], "5000.00")
        self.assertEqual(response.data["credit_or_reduction_amount"], "0.00")
        self.assertFalse(response.data["source_record_mutation"])
        self.assertTrue(ContractRecontractFinancialImpactPreview.objects.filter(event__amendment=amendment).exists())
        self._assert_no_source_mutation(before)

    def test_admin_can_generate_downgrade_financial_impact_preview(self):
        amendment = self._amendment(self.downgrade_target)
        self._prime(amendment)

        response = self._post(amendment, self.admin)

        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["impact_type"], "DOWNGRADE_CREDIT_REQUIRED")
        self.assertEqual(response.data["additional_receivable_amount"], "0.00")
        self.assertEqual(response.data["credit_or_reduction_amount"], "2000.00")

    def test_same_price_correction_has_no_monetary_impact(self):
        amendment = self._amendment(self.same_target)
        self._prime(amendment)

        response = self._post(amendment, self.admin)

        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["impact_type"], "SAME_PRICE_REFERENCE_CORRECTION")
        self.assertEqual(response.data["additional_receivable_amount"], "0.00")
        self.assertEqual(response.data["credit_or_reduction_amount"], "0.00")

    def test_cannot_generate_before_schedule_preview_exists(self):
        amendment = self._amendment(self.upgrade_target)
        self._prime(amendment, with_schedule=False)

        response = self._post(amendment, self.admin)

        self.assertEqual(response.status_code, 400, response.data)

    def test_cannot_generate_before_customer_consent(self):
        amendment = self._amendment(self.upgrade_target)
        self._prime(amendment, consent=None, admin_decision=None, with_schedule=False)

        response = self._post(amendment, self.admin)

        self.assertEqual(response.status_code, 400, response.data)

    def test_cannot_generate_before_admin_approval(self):
        amendment = self._amendment(self.upgrade_target)
        self._prime(amendment, consent="ACCEPTED", admin_decision=None, with_schedule=False)

        response = self._post(amendment, self.admin)

        self.assertEqual(response.status_code, 400, response.data)

    def test_customer_partner_cashier_vendor_cannot_generate(self):
        amendment = self._amendment(self.upgrade_target)
        self._prime(amendment)
        for user in [self.customer_user, self.partner_user, self.cashier, self.vendor]:
            response = self._post(amendment, user)
            self.assertEqual(response.status_code, 403, response.data)

    def test_get_preview_list_admin_only(self):
        amendment = self._amendment(self.upgrade_target)
        self._prime(amendment)
        created = self._post(amendment, self.admin)
        self.assertEqual(created.status_code, 201, created.data)

        self.client.force_authenticate(self.admin)
        response = self.client.get(
            f"/api/v1/admin/contract-amendments/{amendment.id}/product-recontract/financial-impact-preview/"
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertGreaterEqual(len(response.data), 1)

    def test_supersedes_previous_preview_for_same_event(self):
        amendment = self._amendment(self.upgrade_target)
        self._prime(amendment)

        first = self._post(amendment, self.admin)
        second = self._post(amendment, self.admin)

        self.assertEqual(first.status_code, 201, first.data)
        self.assertEqual(second.status_code, 201, second.data)
        event = ContractRecontractEvent.objects.filter(amendment=amendment).order_by("-id").first()
        self.assertIsNotNone(event)
        statuses = list(event.financial_impact_previews.values_list("accounting_preview_status", flat=True))
        self.assertIn("SUPERSEDED", statuses)
        self.assertIn("PREVIEWED", statuses)
