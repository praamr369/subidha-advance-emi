from datetime import date, timedelta
from decimal import Decimal

from django.apps import apps
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounting.models import (
    AccountingBridgePosting,
    AccountingPostingProfile,
    ChartOfAccount,
    ChartOfAccountType,
    JournalEntry,
    JournalEntryLine,
    JournalEntryStatus,
)
from reconciliation.models import ReconciliationEvidence, ReconciliationItem, ReconciliationRun
from subscriptions.models import (
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
    create_product_recontract_financial_impact_preview,
    create_product_recontract_preview_snapshot,
    create_product_recontract_schedule_preview,
    record_product_recontract_admin_approval,
    record_product_recontract_customer_consent,
)
from tests.helpers import ensure_open_accounting_period_for_date


class ContractRecontractAccountingPostingTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        User = get_user_model()
        self.admin = User.objects.create_user(username="phase6f2_admin", password="x", role="ADMIN", phone="9860000100")
        self.customer_user = User.objects.create_user(username="phase6f2_customer", password="x", role="CUSTOMER", phone="9860000101")
        self.partner_user = User.objects.create_user(username="phase6f2_partner", password="x", role="PARTNER", phone="9860000102")
        self.cashier = User.objects.create_user(username="phase6f2_cashier", password="x", role="CASHIER", phone="9860000103")
        self.vendor = User.objects.create_user(username="phase6f2_vendor", password="x", role="VENDOR", phone="9860000104")

        self.customer = Customer.objects.create(user=self.customer_user, name="Phase6F2 Customer", phone="9860000101")
        self.product = Product.objects.create(product_code="P6F2-OLD", name="Old", base_price=Decimal("20000.00"), is_active=True)
        self.upgrade_target = Product.objects.create(product_code="P6F2-UP", name="Upgrade", base_price=Decimal("25000.00"), is_active=True)
        self.downgrade_target = Product.objects.create(product_code="P6F2-DN", name="Downgrade", base_price=Decimal("18000.00"), is_active=True)
        self.overpaid_downgrade_target = Product.objects.create(product_code="P6F2-ODN", name="Overpaid Downgrade", base_price=Decimal("3000.00"), is_active=True)
        self.batch = Batch.objects.create(batch_code="P6F2-BATCH", total_slots=100, duration_months=10, draw_day=5, start_date=date(2026, 1, 1), status=BatchStatus.OPEN)
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
                reference_no=f"P6F2-PAY-{idx}",
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
        ensure_open_accounting_period_for_date(timezone.localdate(), performed_by=self.admin)

    def _ensure_posting_profiles(self):
        self.receivable_account = ChartOfAccount.objects.create(
            code="P6F2-AR",
            name="Product Recontract Customer Receivable",
            account_type=ChartOfAccountType.ASSET,
            system_code="P6F2_CUSTOMER_RECEIVABLE",
            is_active=True,
        )
        self.revenue_adjustment_account = ChartOfAccount.objects.create(
            code="P6F2-REV",
            name="Product Recontract Revenue Adjustment",
            account_type=ChartOfAccountType.INCOME,
            system_code="P6F2_PRODUCT_RECONTRACT_REVENUE_ADJUSTMENT",
            is_active=True,
        )
        self.customer_credit_account = ChartOfAccount.objects.create(
            code="P6F2-CRD",
            name="Product Recontract Customer Credit Liability",
            account_type=ChartOfAccountType.LIABILITY,
            system_code="P6F2_CUSTOMER_CREDIT_LIABILITY",
            is_active=True,
        )
        AccountingPostingProfile.objects.update_or_create(
            key="CUSTOMER_RECEIVABLE",
            defaults={"label": "Customer Receivable", "chart_account": self.receivable_account, "is_active": True},
        )
        AccountingPostingProfile.objects.update_or_create(
            key="EMI_INCOME",
            defaults={"label": "Product Recontract Revenue Adjustment", "chart_account": self.revenue_adjustment_account, "is_active": True},
        )
        AccountingPostingProfile.objects.update_or_create(
            key="CUSTOMER_ADVANCE_UNEARNED_REVENUE",
            defaults={"label": "Customer Credit Liability", "chart_account": self.customer_credit_account, "is_active": True},
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
            reason="Phase 6F.2 accounting posting.",
            approved_by=self.admin,
        )

    def _prime(self, amendment, consent="ACCEPTED", admin_decision="APPROVED", with_schedule=True, with_financial_preview=True):
        create_product_recontract_preview_snapshot(amendment=amendment, requested_by=self.admin)
        if consent:
            record_product_recontract_customer_consent(amendment=amendment, customer_user=self.customer_user, decision=consent, note="ok")
        if admin_decision and consent == "ACCEPTED":
            record_product_recontract_admin_approval(amendment=amendment, admin_user=self.admin, decision=admin_decision, note="ok")
        if with_schedule and consent == "ACCEPTED" and admin_decision == "APPROVED":
            create_product_recontract_schedule_preview(amendment=amendment, requested_by=self.admin)
        if with_financial_preview and with_schedule and consent == "ACCEPTED" and admin_decision == "APPROVED":
            create_product_recontract_financial_impact_preview(amendment=amendment, requested_by=self.admin)

    def _post(self, amendment, user):
        self.client.force_authenticate(user)
        return self.client.post(
            f"/api/v1/admin/contract-amendments/{amendment.id}/product-recontract/accounting-posting/",
            {},
            format="json",
        )

    def _source_state(self):
        self.subscription.refresh_from_db()
        return {
            "product_id": self.subscription.product_id,
            "total_amount": self.subscription.total_amount,
            "monthly_amount": self.subscription.monthly_amount,
            "tenure_months": self.subscription.tenure_months,
            "emis": list(
                Emi.objects.filter(subscription=self.subscription)
                .order_by("month_no")
                .values_list("id", "month_no", "due_date", "amount", "status")
            ),
            "payments": list(
                Payment.objects.filter(subscription=self.subscription)
                .order_by("id")
                .values_list("id", "emi_id", "amount", "reference_no")
            ),
        }

    def _non_accounting_counts(self):
        receipt_model = apps.get_model("billing", "ReceiptDocument", require_ready=False)
        return {
            "emis": Emi.objects.filter(subscription=self.subscription).count(),
            "payments": Payment.objects.filter(subscription=self.subscription).count(),
            "receipts": receipt_model.objects.count(),
            "reconciliation_runs": ReconciliationRun.objects.count(),
            "reconciliation_items": ReconciliationItem.objects.count(),
            "reconciliation_evidence": ReconciliationEvidence.objects.count(),
        }

    def _accounting_counts(self):
        return {
            "journals": JournalEntry.objects.count(),
            "bridges": AccountingBridgePosting.objects.count(),
        }

    def _assert_source_preserved(self, before_state, before_counts):
        self.assertEqual(before_state, self._source_state())
        self.assertEqual(before_counts, self._non_accounting_counts())

    def _posted_journal_lines(self):
        bridge = AccountingBridgePosting.objects.get(purpose="CONTRACT_RECONTRACT_ACCOUNTING_ADJUSTMENT")
        return list(
            JournalEntryLine.objects.filter(journal_entry=bridge.journal_entry)
            .select_related("chart_account")
            .order_by("id")
        )

    def test_admin_can_create_accounting_posting_evidence_after_all_gates(self):
        self._ensure_posting_profiles()
        amendment = self._amendment(self.upgrade_target)
        self._prime(amendment)
        before_state = self._source_state()
        before_non_accounting = self._non_accounting_counts()
        before_accounting = self._accounting_counts()

        response = self._post(amendment, self.admin)

        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["impact_type"], "UPGRADE_EXTRA_PAYABLE")
        self.assertEqual(response.data["amount"], "5000.00")
        self.assertEqual(response.data["posting_status"], "POSTED")
        self.assertFalse(response.data["source_record_mutation"])
        self.assertFalse(response.data["payment_created"])
        self.assertFalse(response.data["receipt_created"])
        self.assertFalse(response.data["settlement_created"])
        self.assertFalse(response.data["reconciliation_created"])
        self.assertEqual(self._accounting_counts()["journals"], before_accounting["journals"] + 1)
        self.assertEqual(self._accounting_counts()["bridges"], before_accounting["bridges"] + 1)
        bridge = AccountingBridgePosting.objects.get(pk=response.data["posting_record_id"])
        self.assertEqual(bridge.source_model, "ContractRecontractEvent")
        self.assertEqual(bridge.purpose, "CONTRACT_RECONTRACT_ACCOUNTING_ADJUSTMENT")
        self.assertEqual(bridge.journal_entry.status, JournalEntryStatus.POSTED)
        event = ContractRecontractEvent.objects.get(pk=response.data["event_id"])
        self.assertEqual(event.metadata["accounting_posting_status"], "POSTED")
        self.assertEqual(event.metadata["accounting_posting_bridge_id"], bridge.id)
        self.assertFalse(event.metadata["source_record_mutation"])
        self.assertFalse(event.metadata["execution_performed"])
        self._assert_source_preserved(before_state, before_non_accounting)

    def test_upgrade_creates_correct_debit_credit_evidence(self):
        self._ensure_posting_profiles()
        amendment = self._amendment(self.upgrade_target)
        self._prime(amendment)

        response = self._post(amendment, self.admin)

        self.assertEqual(response.status_code, 201, response.data)
        lines = self._posted_journal_lines()
        self.assertEqual(len(lines), 2)
        debit = next(line for line in lines if line.debit_amount > Decimal("0.00"))
        credit = next(line for line in lines if line.credit_amount > Decimal("0.00"))
        self.assertEqual(debit.chart_account_id, self.receivable_account.id)
        self.assertEqual(debit.debit_amount, Decimal("5000.00"))
        self.assertEqual(credit.chart_account_id, self.revenue_adjustment_account.id)
        self.assertEqual(credit.credit_amount, Decimal("5000.00"))

    def test_downgrade_reduces_receivable_without_refund_or_receipt(self):
        self._ensure_posting_profiles()
        amendment = self._amendment(self.downgrade_target)
        self._prime(amendment)
        before_state = self._source_state()
        before_non_accounting = self._non_accounting_counts()

        response = self._post(amendment, self.admin)

        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["impact_type"], "DOWNGRADE_CREDIT_REQUIRED")
        self.assertEqual(response.data["amount"], "2000.00")
        self.assertEqual(response.data["amounts"]["receivable_reduction_amount"], "2000.00")
        self.assertEqual(response.data["amounts"]["customer_credit_amount"], "0.00")
        lines = self._posted_journal_lines()
        self.assertEqual(len(lines), 2)
        self.assertTrue(any(line.chart_account_id == self.revenue_adjustment_account.id and line.debit_amount == Decimal("2000.00") for line in lines))
        self.assertTrue(any(line.chart_account_id == self.receivable_account.id and line.credit_amount == Decimal("2000.00") for line in lines))
        self._assert_source_preserved(before_state, before_non_accounting)

    def test_overpaid_downgrade_creates_customer_credit_liability_evidence_only(self):
        self._ensure_posting_profiles()
        amendment = self._amendment(self.overpaid_downgrade_target)
        self._prime(amendment)

        response = self._post(amendment, self.admin)

        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["amount"], "17000.00")
        self.assertEqual(response.data["amounts"]["receivable_reduction_amount"], "16000.00")
        self.assertEqual(response.data["amounts"]["customer_credit_amount"], "1000.00")
        self.assertFalse(response.data["amounts"]["refund_created"])
        lines = self._posted_journal_lines()
        self.assertEqual(len(lines), 3)
        self.assertTrue(any(line.chart_account_id == self.customer_credit_account.id and line.credit_amount == Decimal("1000.00") for line in lines))

    def test_second_posting_call_is_rejected_without_duplicate_journal(self):
        self._ensure_posting_profiles()
        amendment = self._amendment(self.upgrade_target)
        self._prime(amendment)
        first = self._post(amendment, self.admin)
        self.assertEqual(first.status_code, 201, first.data)
        after_first = self._accounting_counts()

        second = self._post(amendment, self.admin)

        self.assertEqual(second.status_code, 400, second.data)
        self.assertIn("already exists", str(second.data["detail"]))
        self.assertEqual(after_first, self._accounting_counts())

    def test_cannot_post_before_customer_consent(self):
        self._ensure_posting_profiles()
        amendment = self._amendment(self.upgrade_target)
        self._prime(amendment, consent=None, admin_decision=None, with_schedule=False, with_financial_preview=False)
        before = self._accounting_counts()

        response = self._post(amendment, self.admin)

        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn("customer consent", str(response.data).lower())
        self.assertEqual(before, self._accounting_counts())

    def test_cannot_post_before_admin_approval(self):
        self._ensure_posting_profiles()
        amendment = self._amendment(self.upgrade_target)
        self._prime(amendment, consent="ACCEPTED", admin_decision=None, with_schedule=False, with_financial_preview=False)
        before = self._accounting_counts()

        response = self._post(amendment, self.admin)

        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn("admin approval", str(response.data).lower())
        self.assertEqual(before, self._accounting_counts())

    def test_cannot_post_before_financial_impact_preview(self):
        self._ensure_posting_profiles()
        amendment = self._amendment(self.upgrade_target)
        self._prime(amendment, with_financial_preview=False)
        before = self._accounting_counts()

        response = self._post(amendment, self.admin)

        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn("financial impact preview", str(response.data).lower())
        self.assertEqual(before, self._accounting_counts())

    def test_missing_posting_profile_blocks_with_controlled_error(self):
        self._ensure_posting_profiles()
        AccountingPostingProfile.objects.filter(key="EMI_INCOME").delete()
        amendment = self._amendment(self.upgrade_target)
        self._prime(amendment)
        before = self._accounting_counts()

        response = self._post(amendment, self.admin)

        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn("posting profile", str(response.data).lower())
        self.assertEqual(before, self._accounting_counts())

    def test_inactive_chart_account_blocks_with_controlled_error(self):
        self._ensure_posting_profiles()
        self.revenue_adjustment_account.is_active = False
        self.revenue_adjustment_account.save(update_fields=["is_active", "updated_at"])
        amendment = self._amendment(self.upgrade_target)
        self._prime(amendment)
        before = self._accounting_counts()

        response = self._post(amendment, self.admin)

        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn("inactive", str(response.data).lower())
        self.assertEqual(before, self._accounting_counts())

    def test_non_admin_cannot_post(self):
        self._ensure_posting_profiles()
        amendment = self._amendment(self.upgrade_target)
        self._prime(amendment)
        for user in [self.customer_user, self.partner_user, self.cashier, self.vendor]:
            response = self._post(amendment, user)
            self.assertEqual(response.status_code, 403, response.data)

    def test_execution_endpoint_remains_blocked_after_accounting_posting(self):
        self._ensure_posting_profiles()
        amendment = self._amendment(self.upgrade_target)
        self._prime(amendment)
        posted = self._post(amendment, self.admin)
        self.assertEqual(posted.status_code, 201, posted.data)
        before_state = self._source_state()
        before_non_accounting = self._non_accounting_counts()

        self.client.force_authenticate(self.admin)
        response = self.client.post(
            f"/api/v1/admin/contract-amendments/{amendment.id}/product-recontract/execute/",
            {},
            format="json",
        )

        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn("reconciliation bridge evidence", str(response.data["detail"]).lower())
        self._assert_source_preserved(before_state, before_non_accounting)
