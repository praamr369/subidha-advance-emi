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
)
from api.v1.serializers.contract_amendments import ContractRecontractEventSerializer
from reconciliation.models import FinancialSourceLifecycleEvent, ReconciliationEvidence, ReconciliationItem, ReconciliationRun
from settlements.models import CashierDayClose, SettlementAllocation
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
    LuckyDraw,
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
from tests.helpers import ensure_journal_numbering_profile_for_date


class ContractRecontractExecutionTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        User = get_user_model()
        self.admin = User.objects.create_user(username="phase6f4_admin", password="x", role="ADMIN", phone="9851000100")
        self.customer_user = User.objects.create_user(username="phase6f4_customer", password="x", role="CUSTOMER", phone="9851000101")
        self.partner_user = User.objects.create_user(username="phase6f4_partner", password="x", role="PARTNER", phone="9851000102")
        self.cashier = User.objects.create_user(username="phase6f4_cashier", password="x", role="CASHIER", phone="9851000103")
        self.vendor = User.objects.create_user(username="phase6f4_vendor", password="x", role="VENDOR", phone="9851000104")

        self.customer = Customer.objects.create(user=self.customer_user, name="Phase6F4 Customer", phone="9851000101")
        self.product = Product.objects.create(product_code="P6F4-OLD", name="Old", base_price=Decimal("20000.00"), is_active=True)
        self.target = Product.objects.create(product_code="P6F4-NEW", name="New", base_price=Decimal("24000.00"), is_active=True)
        self.batch = Batch.objects.create(
            batch_code="P6F4-BATCH",
            total_slots=100,
            duration_months=10,
            draw_day=5,
            start_date=date(2026, 1, 1),
            status=BatchStatus.OPEN,
        )
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
                reference_no=f"P6F4-PAY-{idx}",
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
            reason="Phase 6F.4 execute.",
            approved_by=self.admin,
        )
        ensure_journal_numbering_profile_for_date(timezone.localdate(), performed_by=self.admin)

    def _ensure_posting_profiles(self):
        receivable_account = ChartOfAccount.objects.create(
            code=f"AR-{self.subscription.id}",
            name="Recontract Customer Receivable",
            account_type=ChartOfAccountType.ASSET,
            system_code=f"P6F4_CUSTOMER_RECEIVABLE_{self.subscription.id}",
            is_active=True,
        )
        revenue_account = ChartOfAccount.objects.create(
            code=f"RV-{self.subscription.id}",
            name="Recontract Revenue Adjustment",
            account_type=ChartOfAccountType.INCOME,
            system_code=f"P6F4_REVENUE_ADJUSTMENT_{self.subscription.id}",
            is_active=True,
        )
        credit_account = ChartOfAccount.objects.create(
            code=f"CL-{self.subscription.id}",
            name="Recontract Customer Credit",
            account_type=ChartOfAccountType.LIABILITY,
            system_code=f"P6F4_CUSTOMER_CREDIT_{self.subscription.id}",
            is_active=True,
        )
        AccountingPostingProfile.objects.update_or_create(
            key="CUSTOMER_RECEIVABLE",
            defaults={"label": "Customer Receivable", "chart_account": receivable_account, "is_active": True},
        )
        AccountingPostingProfile.objects.update_or_create(
            key="EMI_INCOME",
            defaults={"label": "Product Recontract Revenue", "chart_account": revenue_account, "is_active": True},
        )
        AccountingPostingProfile.objects.update_or_create(
            key="CUSTOMER_ADVANCE_UNEARNED_REVENUE",
            defaults={"label": "Customer Credit Liability", "chart_account": credit_account, "is_active": True},
        )

    def _post(self, url, user):
        self.client.force_authenticate(user)
        return self.client.post(url, {}, format="json")

    def _accounting_url(self):
        return f"/api/v1/admin/contract-amendments/{self.amendment.id}/product-recontract/accounting-posting/"

    def _reconciliation_url(self):
        return f"/api/v1/admin/contract-amendments/{self.amendment.id}/product-recontract/reconciliation-bridge/"

    def _execute_url(self):
        return f"/api/v1/admin/contract-amendments/{self.amendment.id}/product-recontract/execute/"

    def _preview_url(self):
        return f"/api/v1/admin/contract-amendments/{self.amendment.id}/product-recontract-preview/"

    def _preview_save_url(self):
        return f"/api/v1/admin/contract-amendments/{self.amendment.id}/product-recontract-preview/save/"

    def _schedule_url(self):
        return f"/api/v1/admin/contract-amendments/{self.amendment.id}/product-recontract/schedule-preview/"

    def _financial_url(self):
        return f"/api/v1/admin/contract-amendments/{self.amendment.id}/product-recontract/financial-impact-preview/"

    def _customer_detail_url(self):
        return f"/api/v1/customer/contract-amendments/{self.amendment.id}/"

    def _customer_consent_url(self):
        return f"/api/v1/customer/contract-amendments/{self.amendment.id}/product-recontract/consent/"

    def _admin_decision_url(self):
        return f"/api/v1/admin/contract-amendments/{self.amendment.id}/product-recontract/admin-decision/"

    def _report_url(self, query=""):
        suffix = f"?{query}" if query else ""
        return f"/api/v1/admin/contract-amendments/recontract-report/{suffix}"

    def _prepare(self, with_financial_preview=True, with_accounting=True, with_reconciliation=True):
        create_product_recontract_preview_snapshot(amendment=self.amendment, requested_by=self.admin)
        record_product_recontract_customer_consent(amendment=self.amendment, customer_user=self.customer_user, decision="ACCEPTED", note="ok")
        record_product_recontract_admin_approval(amendment=self.amendment, admin_user=self.admin, decision="APPROVED", note="ok")
        create_product_recontract_schedule_preview(amendment=self.amendment, requested_by=self.admin)
        if with_financial_preview:
            create_product_recontract_financial_impact_preview(amendment=self.amendment, requested_by=self.admin)
        if with_accounting and with_financial_preview:
            self._ensure_posting_profiles()
            response = self._post(self._accounting_url(), self.admin)
            self.assertEqual(response.status_code, 201, response.data)
        if with_reconciliation and with_accounting and with_financial_preview:
            response = self._post(self._reconciliation_url(), self.admin)
            self.assertEqual(response.status_code, 201, response.data)

    def _counts(self):
        receipt_model = apps.get_model("billing", "ReceiptDocument", require_ready=False)
        commission_model = apps.get_model("subscriptions", "Commission", require_ready=False)
        payout_model = apps.get_model("subscriptions", "CommissionPayoutBatch", require_ready=False)
        return {
            "payments": Payment.objects.count(),
            "receipts": receipt_model.objects.count(),
            "journals": JournalEntry.objects.count(),
            "reconciliation_runs": ReconciliationRun.objects.count(),
            "reconciliation_items": ReconciliationItem.objects.count(),
            "reconciliation_evidence": ReconciliationEvidence.objects.count(),
            "lifecycle_events": FinancialSourceLifecycleEvent.objects.count(),
            "cashier_day_closes": CashierDayClose.objects.count(),
            "settlement_allocations": SettlementAllocation.objects.count(),
            "lucky_draws": LuckyDraw.objects.count(),
            "commissions": commission_model.objects.count(),
            "payout_batches": payout_model.objects.count(),
        }

    def _state(self):
        self.subscription.refresh_from_db()
        return {
            "subscription": {
                "product_id": self.subscription.product_id,
                "total_amount": self.subscription.total_amount,
                "monthly_amount": self.subscription.monthly_amount,
                "tenure_months": self.subscription.tenure_months,
                "batch_id": self.subscription.batch_id,
                "lucky_id": self.subscription.lucky_id_id,
                "waived_amount": self.subscription.waived_amount,
                "winner_month": self.subscription.winner_month,
                "product_snapshot": self.subscription.product_snapshot,
                "pricing_snapshot": self.subscription.pricing_snapshot,
            },
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
            "lucky_id": LuckyId.objects.get(pk=self.lucky_id.pk).status,
            "batch": Batch.objects.get(pk=self.batch.pk).status,
        }

    def _schedule_expectation(self):
        event = ContractRecontractEvent.objects.get(amendment=self.amendment, status=ContractRecontractEvent.Status.PREVIEWED)
        return {
            line.original_emi_id: (line.proposed_due_date, line.proposed_amount)
            for line in event.schedule_preview_lines.filter(proposed_status="PREVIEW_ONLY")
        }

    def test_execution_blocked_without_accounting_posting(self):
        self._prepare(with_accounting=False, with_reconciliation=False)
        before_counts = self._counts()
        before_state = self._state()

        response = self._post(self._execute_url(), self.admin)

        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn("accounting bridge", str(response.data).lower())
        self.assertEqual(before_counts, self._counts())
        self.assertEqual(before_state, self._state())

    def test_execution_blocked_without_reconciliation_bridge(self):
        self._prepare(with_accounting=True, with_reconciliation=False)
        before_counts = self._counts()
        before_state = self._state()

        response = self._post(self._execute_url(), self.admin)

        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn("reconciliation bridge", str(response.data).lower())
        self.assertEqual(before_counts, self._counts())
        self.assertEqual(before_state, self._state())

    def test_execution_succeeds_only_with_all_gates_and_updates_subscription_snapshots_and_pending_emis(self):
        self._prepare()
        before_counts = self._counts()
        before_state = self._state()
        expectation = self._schedule_expectation()
        paid_before = [row for row in before_state["emis"] if row[4] == EmiStatus.PAID]

        response = self._post(self._execute_url(), self.admin)

        self.assertEqual(response.status_code, 200, response.data)
        self.subscription.refresh_from_db()
        self.assertEqual(self.subscription.product_id, self.target.id)
        self.assertEqual(self.subscription.total_amount, Decimal("24000.00"))
        self.assertEqual(self.subscription.monthly_amount, Decimal("2400.00"))
        self.assertEqual(self.subscription.tenure_months, 10)
        self.assertEqual(self.subscription.product_snapshot["product_id"], self.target.id)
        self.assertEqual(self.subscription.product_snapshot["snapshot_source"], "CONTRACT_RECONTRACT_EXECUTED")
        self.assertEqual(self.subscription.pricing_snapshot["total_amount"], "24000.00")
        self.assertEqual(self.subscription.pricing_snapshot["monthly_amount"], "2400.00")

        for emi in Emi.objects.filter(subscription=self.subscription, status=EmiStatus.PENDING):
            expected_due, expected_amount = expectation[emi.id]
            self.assertEqual(emi.due_date, expected_due)
            self.assertEqual(emi.amount, expected_amount)

        after_state = self._state()
        paid_after = [row for row in after_state["emis"] if row[4] == EmiStatus.PAID]
        self.assertEqual(paid_before, paid_after)
        self.assertEqual(before_state["payments"], after_state["payments"])
        self.assertEqual(before_state["subscription"]["lucky_id"], after_state["subscription"]["lucky_id"])
        self.assertEqual(before_state["subscription"]["batch_id"], after_state["subscription"]["batch_id"])
        self.assertEqual(before_state["subscription"]["waived_amount"], after_state["subscription"]["waived_amount"])
        self.assertEqual(before_state["subscription"]["winner_month"], after_state["subscription"]["winner_month"])
        self.assertEqual(before_state["lucky_id"], after_state["lucky_id"])
        self.assertEqual(before_state["batch"], after_state["batch"])
        self.assertEqual(before_counts, self._counts())

        event = ContractRecontractEvent.objects.get(pk=response.data["id"])
        self.assertEqual(event.status, ContractRecontractEvent.Status.PREVIEWED)
        self.assertEqual(event.metadata["execution_status"], "EXECUTED")
        self.assertTrue(event.metadata["execution_performed"])
        self.assertEqual(event.metadata["before_subscription"]["product_id"], self.product.id)
        self.assertEqual(event.metadata["after_subscription"]["product_id"], self.target.id)
        self.assertTrue(event.metadata["product_snapshot_updated"])
        self.assertTrue(event.metadata["pricing_snapshot_updated"])
        self.assertGreater(len(event.metadata["schedule_line_ids"]), 0)
        self.assertGreater(len(event.metadata["reconciliation_evidence_ids"]), 0)
        self.assertEqual(event.metadata["payments_mutated"], False)
        self.assertEqual(event.metadata["receipts_mutated"], False)
        self.assertEqual(event.metadata["accounting_mutated_by_execution"], False)
        self.assertEqual(event.metadata["reconciliation_mutated_by_execution"], False)
        self.assertTrue(
            AuditLog.objects.filter(
                action_type=AuditLog.ActionType.CONTRACT_AMENDMENT_IMPLEMENTED,
                object_id=self.amendment.id,
                metadata__event="CONTRACT_RECONTRACT_EXECUTED",
            ).exists()
        )

    def test_serializer_exposes_execution_metadata_without_raw_metadata_parsing(self):
        self._prepare()
        response = self._post(self._execute_url(), self.admin)
        self.assertEqual(response.status_code, 200, response.data)

        self.assertTrue(response.data["executed"])
        self.assertEqual(response.data["execution_status"], "EXECUTED")
        self.assertFalse(response.data["execution_ready"])
        self.assertIn("already been executed", response.data["execution_block_reason"])
        self.assertEqual(response.data["workflow_flags"]["previewed"], True)
        self.assertEqual(response.data["workflow_flags"]["customer_consented"], True)
        self.assertEqual(response.data["workflow_flags"]["admin_approved"], True)
        self.assertEqual(response.data["workflow_flags"]["accounting_posted"], True)
        self.assertEqual(response.data["workflow_flags"]["reconciliation_linked"], True)
        self.assertEqual(response.data["workflow_flags"]["executed"], True)
        self.assertEqual(response.data["old_monthly_amount"], "2000.00")
        self.assertEqual(response.data["new_monthly_amount"], "2400.00")
        self.assertIsNotNone(response.data["executed_at"])
        self.assertEqual(response.data["executed_by"], self.admin.id)
        self.assertIsNotNone(response.data["accounting_bridge_posting_id"])
        self.assertIsNotNone(response.data["journal_entry_id"])
        self.assertIsNotNone(response.data["reconciliation_item_id"])
        self.assertIsNotNone(response.data["reconciliation_run_id"])
        self.assertGreater(len(response.data["reconciliation_evidence_ids"]), 0)
        self.assertGreater(len(response.data["schedule_line_ids"]), 0)
        self.assertEqual(response.data["execution_snapshot"]["after_subscription"]["product_id"], self.target.id)
        self.assertTrue(response.data["execution_snapshot"]["product_snapshot_updated"])
        self.assertTrue(response.data["execution_snapshot"]["pricing_snapshot_updated"])
        self.assertFalse(response.data["execution_snapshot"]["preservation_flags"]["payments_mutated"])

        event = ContractRecontractEvent.objects.get(pk=response.data["id"])
        serialized = ContractRecontractEventSerializer(event).data
        self.assertTrue(serialized["executed"])
        self.assertEqual(serialized["execution_status"], "EXECUTED")

    def test_customer_detail_payload_exposes_safe_executed_summary(self):
        self._prepare()
        response = self._post(self._execute_url(), self.admin)
        self.assertEqual(response.status_code, 200, response.data)

        self.client.force_authenticate(self.customer_user)
        detail = self.client.get(self._customer_detail_url(), format="json")

        self.assertEqual(detail.status_code, 200, detail.data)
        preview = detail.data["latest_product_recontract_preview"]
        self.assertTrue(preview["executed"])
        self.assertEqual(preview["execution_status"], "EXECUTED")
        self.assertEqual(preview["old_monthly_amount"], "2000.00")
        self.assertEqual(preview["new_monthly_amount"], "2400.00")
        self.assertIn("execution_snapshot", preview)

    def test_post_execution_preview_and_evidence_actions_are_blocked_or_read_only(self):
        self._prepare()
        execute_response = self._post(self._execute_url(), self.admin)
        self.assertEqual(execute_response.status_code, 200, execute_response.data)
        before_counts = self._counts()
        before_state = self._state()

        preview_response = self._post(self._preview_url(), self.admin)
        self.assertEqual(preview_response.status_code, 200, preview_response.data)
        self.assertEqual(preview_response.data["preview_status"], "BLOCKED")
        self.assertIn("already been executed", str(preview_response.data).lower())

        blocked_admin_urls = [
            self._preview_save_url(),
            self._schedule_url(),
            self._financial_url(),
            self._accounting_url(),
            self._reconciliation_url(),
            self._admin_decision_url(),
        ]
        for url in blocked_admin_urls:
            response = self._post(url, self.admin)
            self.assertEqual(response.status_code, 400, response.data)
            self.assertIn("executed", str(response.data).lower())

        response = self._post(self._customer_consent_url(), self.customer_user)
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn("executed", str(response.data).lower())
        self.assertEqual(before_counts, self._counts())
        self.assertEqual(before_state, self._state())

    def test_duplicate_execution_rejected(self):
        self._prepare()
        first = self._post(self._execute_url(), self.admin)
        self.assertEqual(first.status_code, 200, first.data)
        before_counts = self._counts()
        before_state = self._state()

        second = self._post(self._execute_url(), self.admin)

        self.assertEqual(second.status_code, 400, second.data)
        self.assertIn("already executed", str(second.data).lower())
        self.assertEqual(before_counts, self._counts())
        self.assertEqual(before_state, self._state())

    def test_missing_or_variance_evidence_rejected(self):
        self._prepare()
        bridge = AccountingBridgePosting.objects.get(source_model="ContractRecontractEvent", purpose="CONTRACT_RECONTRACT_ACCOUNTING_ADJUSTMENT")
        debit_line = bridge.journal_entry.lines.filter(debit_amount__gt=Decimal("0.00")).first()
        credit_line = bridge.journal_entry.lines.filter(credit_amount__gt=Decimal("0.00")).first()
        JournalEntryLine.objects.filter(pk=debit_line.pk).update(debit_amount=Decimal("3999.00"))
        JournalEntryLine.objects.filter(pk=credit_line.pk).update(credit_amount=Decimal("3999.00"))
        before_counts = self._counts()
        before_state = self._state()

        response = self._post(self._execute_url(), self.admin)

        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn("posted accounting amount", str(response.data).lower())
        self.assertEqual(before_counts, self._counts())
        self.assertEqual(before_state, self._state())

    def test_stale_or_missing_reconciliation_evidence_rejected(self):
        self._prepare()
        item = ReconciliationItem.objects.get(source_type="PRODUCT_RECONTRACT_ADJUSTMENT")
        ReconciliationEvidence.objects.filter(item=item, evidence_type="JournalEntry").delete()
        before_counts = self._counts()
        before_state = self._state()

        response = self._post(self._execute_url(), self.admin)

        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn("reconciliation evidence is incomplete", str(response.data).lower())
        self.assertEqual(before_counts, self._counts())
        self.assertEqual(before_state, self._state())

    def test_paid_waived_and_cancelled_emis_are_not_changed(self):
        Emi.objects.filter(pk=self.emis[2].pk).update(status=EmiStatus.WAIVED)
        Emi.objects.filter(pk=self.emis[3].pk).update(status=EmiStatus.CANCELLED)
        protected_before = list(
            Emi.objects.filter(subscription=self.subscription)
            .exclude(status=EmiStatus.PENDING)
            .order_by("month_no")
            .values_list("id", "month_no", "due_date", "amount", "status")
        )
        self._prepare()

        response = self._post(self._execute_url(), self.admin)

        self.assertEqual(response.status_code, 200, response.data)
        protected_after = list(
            Emi.objects.filter(subscription=self.subscription)
            .exclude(status=EmiStatus.PENDING)
            .order_by("month_no")
            .values_list("id", "month_no", "due_date", "amount", "status")
        )
        self.assertEqual(protected_before, protected_after)
        self.assertIn(self.emis[2].id, response.data["execution_snapshot"]["protected_emi_ids"])
        self.assertIn(self.emis[3].id, response.data["execution_snapshot"]["protected_emi_ids"])

    def test_non_admin_cannot_execute(self):
        self._prepare()
        before_counts = self._counts()
        before_state = self._state()
        for user in [self.customer_user, self.partner_user, self.cashier, self.vendor]:
            response = self._post(self._execute_url(), user)
            self.assertEqual(response.status_code, 403, response.data)
        self.assertEqual(before_counts, self._counts())
        self.assertEqual(before_state, self._state())

    def test_admin_recontract_report_returns_rows_and_represents_execution_state(self):
        self._prepare()
        second_target = Product.objects.create(product_code="P6F4-ALT", name="Alternate", base_price=Decimal("26000.00"), is_active=True)
        second_amendment = ContractAmendment.objects.create(
            subscription=self.subscription,
            contract_type="EMI_SUBSCRIPTION",
            customer=self.customer,
            partner=self.partner_user,
            requested_by=self.customer_user,
            requested_role="CUSTOMER",
            amendment_type="PRODUCT_CHANGE",
            status="APPROVED",
            requested_values={"approved_product_id": second_target.id},
            approved_values={"approved_product_id": second_target.id},
            reason="Phase 6H report non-executed row.",
            approved_by=self.admin,
        )
        create_product_recontract_preview_snapshot(amendment=second_amendment, requested_by=self.admin)

        execute_response = self._post(self._execute_url(), self.admin)
        self.assertEqual(execute_response.status_code, 200, execute_response.data)

        self.client.force_authenticate(self.admin)
        response = self.client.get(self._report_url(), format="json")

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(len(response.data), 2)
        rows_by_amendment = {row["amendment_id"]: row for row in response.data}
        executed_row = rows_by_amendment[self.amendment.id]
        pending_row = rows_by_amendment[second_amendment.id]

        self.assertTrue(executed_row["executed"])
        self.assertEqual(executed_row["executed_status"], "EXECUTED")
        self.assertEqual(executed_row["schedule_preview_status"], "GENERATED")
        self.assertEqual(executed_row["financial_impact_preview_status"], "PREVIEWED")
        self.assertEqual(executed_row["accounting_posting_status"], "POSTED")
        self.assertEqual(executed_row["reconciliation_bridge_status"], "LINKED")
        self.assertIsNotNone(executed_row["journal_entry_id"])
        self.assertIsNotNone(executed_row["journal_entry_no"])
        self.assertIsNotNone(executed_row["reconciliation_run_id"])
        self.assertIsNotNone(executed_row["reconciliation_item_id"])
        self.assertTrue(executed_row["addendum_print_eligible"])
        self.assertIsNotNone(executed_row["addendum_print_reference"])

        self.assertFalse(pending_row["executed"])
        self.assertEqual(pending_row["executed_status"], "NOT_EXECUTED")
        self.assertEqual(pending_row["accounting_posting_status"], "MISSING")
        self.assertEqual(pending_row["reconciliation_bridge_status"], "MISSING")
        self.assertFalse(pending_row["addendum_print_eligible"])
        self.assertIsNone(pending_row["addendum_print_reference"])

    def test_admin_recontract_report_filters(self):
        self._prepare(with_accounting=False, with_reconciliation=False)
        self.client.force_authenticate(self.admin)

        accepted = self.client.get(self._report_url("customer_consent_status=ACCEPTED"), format="json")
        self.assertEqual(accepted.status_code, 200, accepted.data)
        self.assertEqual(len(accepted.data), 1)
        self.assertEqual(accepted.data[0]["customer_consent_status"], "ACCEPTED")

        rejected = self.client.get(self._report_url("customer_consent_status=REJECTED"), format="json")
        self.assertEqual(rejected.status_code, 200, rejected.data)
        self.assertEqual(rejected.data, [])

        by_product = self.client.get(self._report_url("product=P6F4-NEW"), format="json")
        self.assertEqual(by_product.status_code, 200, by_product.data)
        self.assertEqual(len(by_product.data), 1)
        self.assertEqual(by_product.data[0]["new_product_code"], "P6F4-NEW")

        by_customer = self.client.get(self._report_url("customer=Phase6F4"), format="json")
        self.assertEqual(by_customer.status_code, 200, by_customer.data)
        self.assertEqual(len(by_customer.data), 1)
        self.assertEqual(by_customer.data[0]["customer_id"], self.customer.id)

        not_executed = self.client.get(self._report_url("executed=false"), format="json")
        self.assertEqual(not_executed.status_code, 200, not_executed.data)
        self.assertEqual(len(not_executed.data), 1)
        self.assertFalse(not_executed.data[0]["executed"])

    def test_recontract_report_is_admin_only_and_read_only(self):
        self._prepare()
        before_counts = self._counts()
        before_state = self._state()

        for user in [self.customer_user, self.partner_user, self.cashier, self.vendor]:
            self.client.force_authenticate(user)
            response = self.client.get(self._report_url(), format="json")
            self.assertEqual(response.status_code, 403, response.data)

        self.client.force_authenticate(self.admin)
        response = self.client.get(self._report_url(), format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(before_counts, self._counts())
        self.assertEqual(before_state, self._state())

    def test_execution_atomic_rolls_back_subscription_and_emi_mutations(self):
        self._prepare()
        event = ContractRecontractEvent.objects.get(amendment=self.amendment, status=ContractRecontractEvent.Status.PREVIEWED)
        original_line = event.schedule_preview_lines.filter(proposed_status="PREVIEW_ONLY").order_by("line_no").first()
        original_line.proposed_amount = Decimal("0.00")
        original_line.save(update_fields=["proposed_amount"])
        before_counts = self._counts()
        before_state = self._state()

        response = self._post(self._execute_url(), self.admin)

        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn("proposed pending emi amount", str(response.data).lower())
        self.assertEqual(before_counts, self._counts())
        self.assertEqual(before_state, self._state())
