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
    JournalEntryLine,
)
from reconciliation.models import (
    FinancialSourceLifecycleEvent,
    ReconciliationEvidence,
    ReconciliationItem,
    ReconciliationRun,
)
from settlements.models import (
    BankStatementLine,
    CashierDayClose,
    SettlementAllocation,
    UpiSettlementLine,
)
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


class ContractRecontractReconciliationBridgeTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        User = get_user_model()
        self.admin = User.objects.create_user(username="phase6f3_admin", password="x", role="ADMIN", phone="9870000100")
        self.customer_user = User.objects.create_user(username="phase6f3_customer", password="x", role="CUSTOMER", phone="9870000101")
        self.partner_user = User.objects.create_user(username="phase6f3_partner", password="x", role="PARTNER", phone="9870000102")
        self.cashier = User.objects.create_user(username="phase6f3_cashier", password="x", role="CASHIER", phone="9870000103")
        self.vendor = User.objects.create_user(username="phase6f3_vendor", password="x", role="VENDOR", phone="9870000104")

        self.customer = Customer.objects.create(user=self.customer_user, name="Phase6F3 Customer", phone="9870000101")
        self.product = Product.objects.create(product_code="P6F3-OLD", name="Old", base_price=Decimal("20000.00"), is_active=True)
        self.upgrade_target = Product.objects.create(product_code="P6F3-UP", name="Upgrade", base_price=Decimal("25000.00"), is_active=True)
        self.downgrade_target = Product.objects.create(product_code="P6F3-DN", name="Downgrade", base_price=Decimal("18000.00"), is_active=True)
        self.batch = Batch.objects.create(batch_code="P6F3-BATCH", total_slots=100, duration_months=10, draw_day=5, start_date=date(2026, 1, 1), status=BatchStatus.OPEN)
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
                reference_no=f"P6F3-PAY-{idx}",
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
            code="P6F3-AR",
            name="Product Recontract Customer Receivable",
            account_type=ChartOfAccountType.ASSET,
            system_code="P6F3_CUSTOMER_RECEIVABLE",
            is_active=True,
        )
        self.revenue_adjustment_account = ChartOfAccount.objects.create(
            code="P6F3-REV",
            name="Product Recontract Revenue Adjustment",
            account_type=ChartOfAccountType.INCOME,
            system_code="P6F3_PRODUCT_RECONTRACT_REVENUE_ADJUSTMENT",
            is_active=True,
        )
        self.customer_credit_account = ChartOfAccount.objects.create(
            code="P6F3-CRD",
            name="Product Recontract Customer Credit Liability",
            account_type=ChartOfAccountType.LIABILITY,
            system_code="P6F3_CUSTOMER_CREDIT_LIABILITY",
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
            reason="Phase 6F.3 reconciliation bridge.",
            approved_by=self.admin,
        )

    def _prime(self, amendment, consent="ACCEPTED", admin_decision="APPROVED", with_schedule=True, with_financial_preview=True, with_accounting=True):
        create_product_recontract_preview_snapshot(amendment=amendment, requested_by=self.admin)
        if consent:
            record_product_recontract_customer_consent(amendment=amendment, customer_user=self.customer_user, decision=consent, note="ok")
        if admin_decision and consent == "ACCEPTED":
            record_product_recontract_admin_approval(amendment=amendment, admin_user=self.admin, decision=admin_decision, note="ok")
        if with_schedule and consent == "ACCEPTED" and admin_decision == "APPROVED":
            create_product_recontract_schedule_preview(amendment=amendment, requested_by=self.admin)
        if with_financial_preview and with_schedule and consent == "ACCEPTED" and admin_decision == "APPROVED":
            create_product_recontract_financial_impact_preview(amendment=amendment, requested_by=self.admin)
        if with_accounting and with_financial_preview and with_schedule and consent == "ACCEPTED" and admin_decision == "APPROVED":
            self._ensure_posting_profiles()
            response = self._post_accounting(amendment, self.admin)
            self.assertEqual(response.status_code, 201, response.data)

    def _post_accounting(self, amendment, user):
        self.client.force_authenticate(user)
        return self.client.post(
            f"/api/v1/admin/contract-amendments/{amendment.id}/product-recontract/accounting-posting/",
            {},
            format="json",
        )

    def _post_reconciliation(self, amendment, user):
        self.client.force_authenticate(user)
        return self.client.post(
            f"/api/v1/admin/contract-amendments/{amendment.id}/product-recontract/reconciliation-bridge/",
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

    def _non_reconciliation_counts(self):
        receipt_model = apps.get_model("billing", "ReceiptDocument", require_ready=False)
        return {
            "emis": Emi.objects.filter(subscription=self.subscription).count(),
            "payments": Payment.objects.filter(subscription=self.subscription).count(),
            "receipts": receipt_model.objects.count(),
            "cashier_day_closes": CashierDayClose.objects.count(),
            "settlement_allocations": SettlementAllocation.objects.count(),
            "bank_statement_lines": BankStatementLine.objects.count(),
            "upi_settlement_lines": UpiSettlementLine.objects.count(),
        }

    def _reconciliation_counts(self):
        return {
            "runs": ReconciliationRun.objects.count(),
            "items": ReconciliationItem.objects.count(),
            "evidence": ReconciliationEvidence.objects.count(),
            "lifecycle_events": FinancialSourceLifecycleEvent.objects.count(),
        }

    def _assert_source_preserved(self, before_state, before_counts):
        self.assertEqual(before_state, self._source_state())
        self.assertEqual(before_counts, self._non_reconciliation_counts())

    def test_admin_can_create_reconciliation_evidence_after_accounting_posting_exists(self):
        amendment = self._amendment(self.upgrade_target)
        self._prime(amendment)
        before_state = self._source_state()
        before_non_reconciliation = self._non_reconciliation_counts()
        before_reconciliation = self._reconciliation_counts()

        response = self._post_reconciliation(amendment, self.admin)

        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["reconciliation_status"], "LINKED")
        self.assertEqual(response.data["expected_amount"], "5000.00")
        self.assertEqual(response.data["posted_amount"], "5000.00")
        self.assertEqual(response.data["variance_amount"], "0.00")
        self.assertFalse(response.data["source_record_mutation"])
        self.assertFalse(response.data["execution_performed"])
        self.assertFalse(response.data["payment_created"])
        self.assertFalse(response.data["receipt_created"])
        self.assertFalse(response.data["settlement_created"])
        self.assertFalse(response.data["day_close_created"])
        self.assertEqual(self._reconciliation_counts()["runs"], before_reconciliation["runs"] + 1)
        self.assertEqual(self._reconciliation_counts()["items"], before_reconciliation["items"] + 1)
        self.assertEqual(self._reconciliation_counts()["evidence"], before_reconciliation["evidence"] + 5)
        self.assertEqual(self._reconciliation_counts()["lifecycle_events"], before_reconciliation["lifecycle_events"] + 1)
        self._assert_source_preserved(before_state, before_non_reconciliation)

    def test_reconciliation_bridge_links_event_preview_accounting_bridge_and_journal(self):
        amendment = self._amendment(self.upgrade_target)
        self._prime(amendment)

        response = self._post_reconciliation(amendment, self.admin)

        self.assertEqual(response.status_code, 201, response.data)
        item = ReconciliationItem.objects.get(pk=response.data["reconciliation_item_id"])
        bridge = AccountingBridgePosting.objects.get(pk=response.data["accounting_posting"]["id"])
        event = ContractRecontractEvent.objects.get(pk=response.data["event_id"])
        self.assertEqual(item.source_type, "PRODUCT_RECONTRACT_ADJUSTMENT")
        self.assertEqual(item.source_id, str(event.id))
        self.assertEqual(item.expected_amount, Decimal("5000.00"))
        self.assertEqual(item.actual_amount, Decimal("5000.00"))
        self.assertEqual(item.amount_delta, Decimal("0.00"))
        evidence_types = set(item.evidence.values_list("evidence_type", flat=True))
        self.assertEqual(
            evidence_types,
            {
                "ContractRecontractEvent",
                "ContractRecontractFinancialImpactPreview",
                "AccountingBridgePosting",
                "JournalEntry",
                "FinancialSourceLifecycleEvent",
            },
        )
        self.assertEqual(response.data["journal_entry"]["id"], bridge.journal_entry_id)
        event.refresh_from_db()
        self.assertEqual(event.metadata["reconciliation_bridge_status"], "LINKED")
        self.assertEqual(event.metadata["reconciliation_item_id"], item.id)
        self.assertEqual(event.metadata["reconciliation_variance_amount"], "0.00")

    def test_expected_amount_equals_posted_amount_for_downgrade(self):
        amendment = self._amendment(self.downgrade_target)
        self._prime(amendment)

        response = self._post_reconciliation(amendment, self.admin)

        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["expected_amount"], "2000.00")
        self.assertEqual(response.data["posted_amount"], "2000.00")
        self.assertEqual(response.data["variance_amount"], "0.00")

    def test_variance_blocks_with_controlled_error(self):
        amendment = self._amendment(self.upgrade_target)
        self._prime(amendment)
        bridge = AccountingBridgePosting.objects.get(source_model="ContractRecontractEvent", purpose="CONTRACT_RECONTRACT_ACCOUNTING_ADJUSTMENT")
        debit_line = bridge.journal_entry.lines.filter(debit_amount__gt=Decimal("0.00")).first()
        JournalEntryLine.objects.filter(pk=debit_line.pk).update(debit_amount=Decimal("5001.00"))
        before = self._reconciliation_counts()

        response = self._post_reconciliation(amendment, self.admin)

        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn("debit/credit totals", str(response.data).lower())
        self.assertEqual(before, self._reconciliation_counts())

    def test_variance_blocks_when_balanced_amount_does_not_match_expected(self):
        amendment = self._amendment(self.upgrade_target)
        self._prime(amendment)
        bridge = AccountingBridgePosting.objects.get(source_model="ContractRecontractEvent", purpose="CONTRACT_RECONTRACT_ACCOUNTING_ADJUSTMENT")
        debit_line = bridge.journal_entry.lines.filter(debit_amount__gt=Decimal("0.00")).first()
        credit_line = bridge.journal_entry.lines.filter(credit_amount__gt=Decimal("0.00")).first()
        JournalEntryLine.objects.filter(pk=debit_line.pk).update(debit_amount=Decimal("4999.00"))
        JournalEntryLine.objects.filter(pk=credit_line.pk).update(credit_amount=Decimal("4999.00"))
        before = self._reconciliation_counts()

        response = self._post_reconciliation(amendment, self.admin)

        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn("expected amount", str(response.data).lower())
        self.assertEqual(response.data["expected_amount"], ["5000.00"])
        self.assertEqual(response.data["posted_amount"], ["4999.00"])
        self.assertEqual(response.data["variance_amount"], ["-1.00"])
        self.assertEqual(before, self._reconciliation_counts())

    def test_duplicate_reconciliation_bridge_rejected(self):
        amendment = self._amendment(self.upgrade_target)
        self._prime(amendment)
        first = self._post_reconciliation(amendment, self.admin)
        self.assertEqual(first.status_code, 201, first.data)
        after_first = self._reconciliation_counts()

        second = self._post_reconciliation(amendment, self.admin)

        self.assertEqual(second.status_code, 400, second.data)
        self.assertIn("already exists", str(second.data["detail"]))
        self.assertEqual(after_first, self._reconciliation_counts())

    def test_cannot_create_before_customer_consent(self):
        amendment = self._amendment(self.upgrade_target)
        self._prime(amendment, consent=None, admin_decision=None, with_schedule=False, with_financial_preview=False, with_accounting=False)
        before = self._reconciliation_counts()

        response = self._post_reconciliation(amendment, self.admin)

        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn("customer consent", str(response.data).lower())
        self.assertEqual(before, self._reconciliation_counts())

    def test_cannot_create_before_admin_approval(self):
        amendment = self._amendment(self.upgrade_target)
        self._prime(amendment, consent="ACCEPTED", admin_decision=None, with_schedule=False, with_financial_preview=False, with_accounting=False)
        before = self._reconciliation_counts()

        response = self._post_reconciliation(amendment, self.admin)

        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn("admin approval", str(response.data).lower())
        self.assertEqual(before, self._reconciliation_counts())

    def test_cannot_create_before_financial_impact_preview(self):
        amendment = self._amendment(self.upgrade_target)
        self._prime(amendment, with_financial_preview=False, with_accounting=False)
        before = self._reconciliation_counts()

        response = self._post_reconciliation(amendment, self.admin)

        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn("financial impact preview", str(response.data).lower())
        self.assertEqual(before, self._reconciliation_counts())

    def test_cannot_create_before_accounting_posting(self):
        amendment = self._amendment(self.upgrade_target)
        self._prime(amendment, with_accounting=False)
        before = self._reconciliation_counts()

        response = self._post_reconciliation(amendment, self.admin)

        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn("accounting bridge", str(response.data).lower())
        self.assertEqual(before, self._reconciliation_counts())

    def test_non_admin_cannot_create(self):
        amendment = self._amendment(self.upgrade_target)
        self._prime(amendment)
        for user in [self.customer_user, self.partner_user, self.cashier, self.vendor]:
            response = self._post_reconciliation(amendment, user)
            self.assertEqual(response.status_code, 403, response.data)

    def test_execution_endpoint_succeeds_after_reconciliation_bridge(self):
        amendment = self._amendment(self.upgrade_target)
        self._prime(amendment)
        bridge = self._post_reconciliation(amendment, self.admin)
        self.assertEqual(bridge.status_code, 201, bridge.data)

        self.client.force_authenticate(self.admin)
        response = self.client.post(
            f"/api/v1/admin/contract-amendments/{amendment.id}/product-recontract/execute/",
            {},
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.subscription.refresh_from_db()
        self.assertEqual(self.subscription.product_id, self.upgrade_target.id)
