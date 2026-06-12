from datetime import date
from decimal import Decimal

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import AccountingBridgePosting, ChartOfAccount, DocumentSequence, JournalEntry
from billing.models import BillingChannel, BillingDocumentStatus, BillingInvoice, BillingInvoiceType, BillingSourceType
from reconciliation.models import ReconciliationItem, ReconciliationItemStatus, ReconciliationRun, ReconciliationRunStatus
from reconciliation.services.accounting_bridge_reconciliation import run_accounting_bridge_checks
from reconciliation.services.run_numbering import next_reconciliation_run_no
from subscriptions.models import PlanType, RentLeaseBillingDemand, RentLeaseDemandStatus, RentLeaseDemandType, Subscription, SubscriptionStatus
from tests.accounting.helpers import seed_bridge_ready_environment
from tests.helpers import create_admin_user, create_cashier_user, create_customer_profile, create_customer_user, create_product


class AccountingBridgeRentLeaseRevenuePhaseF14Tests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="phase_f14_admin", phone="9304914001")
        self.cashier = create_cashier_user(username="phase_f14_cashier", phone="9304914002")
        self.customer_user = create_customer_user(username="phase_f14_customer", phone="9304914003")
        self.customer = create_customer_profile(user=self.customer_user, name="F14 Customer", phone="9304914003")
        self.product = create_product(name="F14 Sofa", product_code="F14-SOFA", base_price=Decimal("24000.00"))
        self.product.is_rent_enabled = True
        self.product.is_lease_enabled = True
        self.product.save(update_fields=["is_rent_enabled", "is_lease_enabled"])
        self.today = timezone.localdate()
        self.env = seed_bridge_ready_environment(self.today, performed_by=self.admin)
        self.client.force_authenticate(user=self.admin)
        self.invoice_sequence = DocumentSequence.objects.create(series_code="F14_BILL_INV", financial_year=str(self.env["financial_year"].code).replace("FY", ""), financial_year_ref=self.env["financial_year"], prefix="F14-INV", next_number=1)

    def _subscription(self, *, plan_type=PlanType.RENT, suffix="R"):
        return Subscription.objects.create(
            customer=self.customer,
            product=self.product,
            plan_type=plan_type,
            tenure_months=12,
            start_date=self.today,
            total_amount=Decimal("24000.00"),
            monthly_amount=Decimal("2000.00"),
            status=SubscriptionStatus.ACTIVE,
            subscription_number=f"F14-{suffix}-{self.today:%Y%m%d}",
            waived_amount=Decimal("0.00"),
        )

    def _demand(self, *, plan_type=PlanType.RENT, demand_type=None, status_value=RentLeaseDemandStatus.PENDING, amount=Decimal("2000.00"), tax_amount=Decimal("0.00"), suffix="001"):
        subscription = self._subscription(plan_type=plan_type, suffix=f"{plan_type}-{suffix}")
        demand_type = demand_type or (RentLeaseDemandType.RENT_MONTHLY if plan_type == PlanType.RENT else RentLeaseDemandType.LEASE_MONTHLY)
        snapshot = {"tax_amount": str(tax_amount)} if tax_amount else {}
        return RentLeaseBillingDemand.objects.create(
            subscription=subscription,
            demand_type=demand_type,
            status=status_value,
            billing_period_start=date(self.today.year, self.today.month, 1),
            billing_period_end=date(self.today.year, self.today.month, 28),
            due_date=self.today,
            amount=amount,
            collected_amount=Decimal("0.00"),
            reference_key=f"RL-F14-{plan_type}-{suffix}",
            tax_profile_snapshot=snapshot,
        )

    def _invoice(self):
        return BillingInvoice.objects.create(
            document_no="F14-DS-INV",
            invoice_date=self.today,
            financial_year=str(self.env["financial_year"].code).replace("FY", ""),
            document_type=BillingInvoiceType.INVOICE,
            doc_series=self.invoice_sequence,
            customer=self.customer,
            billing_channel=BillingChannel.RETAIL,
            source_type=BillingSourceType.DIRECT_SALE,
            source_reference="F14-DS-INV",
            tax_mode="NON_GST",
            status=BillingDocumentStatus.APPROVED,
            subtotal=Decimal("1000.00"),
            taxable_total=Decimal("1000.00"),
            tax_total=Decimal("0.00"),
            grand_total=Decimal("1000.00"),
            balance_total=Decimal("1000.00"),
            customer_name_snapshot=self.customer.name,
            customer_phone_snapshot=self.customer.phone,
        )

    def _candidate_id(self, demand, event_key=None):
        event_key = event_key or ("rent_monthly_revenue" if demand.demand_type == RentLeaseDemandType.RENT_MONTHLY else "lease_monthly_revenue")
        return f"rentleasebillingdemand:{demand.id}:{event_key}"

    def _snapshot(self, demand):
        demand.refresh_from_db()
        return {
            "status": demand.status,
            "amount": demand.amount,
            "collected_amount": demand.collected_amount,
            "held_amount": demand.held_amount,
            "refundable_amount": demand.refundable_amount,
            "deducted_amount": demand.deducted_amount,
            "metadata": demand.metadata,
            "tax_profile_snapshot": demand.tax_profile_snapshot,
        }

    def test_concrete_rent_and_lease_candidate_generation(self):
        rent = self._demand(plan_type=PlanType.RENT, suffix="RENT")
        lease = self._demand(plan_type=PlanType.LEASE, suffix="LEASE")
        response = self.client.get("/api/v1/admin/accounting/bridge-reconciliation/?source_model=RentLeaseBillingDemand")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        rows = {row["source_pk"]: row for row in response.data["results"] if row.get("source_model") == "RentLeaseBillingDemand" and row.get("source_pk")}
        self.assertEqual(rows[rent.id]["event_key"], "rent_monthly_revenue")
        self.assertEqual(rows[lease.id]["event_key"], "lease_monthly_revenue")
        self.assertEqual(rows[rent.id]["status"], "READY_UNPOSTED")
        self.assertEqual(rows[lease.id]["plan_type"], "LEASE")
        self.assertTrue(rows[rent.id]["can_post"])

    def test_direct_sale_billinginvoice_behavior_remains_unchanged(self):
        invoice = self._invoice()
        response = self.client.get("/api/v1/admin/accounting/bridge-reconciliation/?source_model=BillingInvoice")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        row = next(item for item in response.data["results"] if item.get("source_pk") == invoice.id)
        self.assertEqual(row["event_key"], "direct_sale_invoice")
        self.assertEqual(row["source_model"], "BillingInvoice")

    def test_ambiguous_cancelled_and_security_deposit_demands_are_not_postable(self):
        ambiguous = self._demand(plan_type=PlanType.RENT, demand_type=RentLeaseDemandType.LEASE_MONTHLY, suffix="AMB")
        cancelled = self._demand(plan_type=PlanType.RENT, status_value=RentLeaseDemandStatus.CANCELLED, suffix="CAN")
        deposit_subscription = self._subscription(plan_type=PlanType.RENT, suffix="DEP")
        deposit = RentLeaseBillingDemand.objects.create(
            subscription=deposit_subscription,
            demand_type=RentLeaseDemandType.SECURITY_DEPOSIT,
            status=RentLeaseDemandStatus.PENDING,
            due_date=self.today,
            amount=Decimal("5000.00"),
            reference_key="RL-F14-RENT-DEP",
        )
        response = self.client.get("/api/v1/admin/accounting/bridge-reconciliation/?source_model=RentLeaseBillingDemand")
        rows = {row["source_pk"]: row for row in response.data["results"] if row.get("source_model") == "RentLeaseBillingDemand" and row.get("source_pk")}
        self.assertEqual(rows[ambiguous.id]["status"], "UNSUPPORTED_SOURCE")
        self.assertEqual(rows[cancelled.id]["status"], "SKIPPED_NOT_APPLICABLE")
        self.assertEqual(rows[deposit.id]["status"], "SKIPPED_NOT_APPLICABLE")
        self.assertFalse(rows[ambiguous.id]["can_post"])

    def test_preview_is_read_only_balanced_and_does_not_consume_numbering(self):
        demand = self._demand(plan_type=PlanType.RENT, tax_amount=Decimal("180.00"), suffix="TAX")
        before = {
            "demand": self._snapshot(demand),
            "journals": JournalEntry.objects.count(),
            "bridges": AccountingBridgePosting.objects.count(),
            "items": ReconciliationItem.objects.count(),
            "next_number": DocumentSequence.objects.get(pk=self.env["journal_numbering_profile"].pk).next_number,
        }
        response = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{self._candidate_id(demand)}/preview/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["source"]["model"], "RentLeaseBillingDemand")
        self.assertEqual(response.data["total_debit"], "2000.00")
        self.assertEqual(response.data["total_credit"], "2000.00")
        self.assertTrue(response.data["is_balanced"])
        self.assertTrue(response.data["tax_lines"])
        self.assertIn("does not edit invoice, contract, payment, receipt, or security deposit records", response.data["safety_text"])
        after = {
            "demand": self._snapshot(demand),
            "journals": JournalEntry.objects.count(),
            "bridges": AccountingBridgePosting.objects.count(),
            "items": ReconciliationItem.objects.count(),
            "next_number": DocumentSequence.objects.get(pk=self.env["journal_numbering_profile"].pk).next_number,
        }
        self.assertEqual(after, before)

    def test_missing_tax_mapping_blocks_only_when_tax_exists(self):
        no_tax = self._demand(plan_type=PlanType.RENT, suffix="NOTAX")
        taxable = self._demand(plan_type=PlanType.LEASE, tax_amount=Decimal("180.00"), suffix="TAXMAP")
        ChartOfAccount.objects.filter(system_code="OUTPUT_GST").update(is_active=False)
        no_tax_preview = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{self._candidate_id(no_tax)}/preview/")
        taxable_preview = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{self._candidate_id(taxable)}/preview/")
        self.assertTrue(no_tax_preview.data["can_post"], no_tax_preview.data)
        self.assertFalse(taxable_preview.data["can_post"])
        self.assertTrue(any("OUTPUT_GST" in blocker for blocker in taxable_preview.data["blockers"]))

    def test_post_idempotent_pending_verify_and_no_source_mutation(self):
        demand = self._demand(plan_type=PlanType.LEASE, suffix="POST")
        before = self._snapshot(demand)
        candidate_id = self._candidate_id(demand)
        preview = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/preview/").data
        first = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", {"idempotency_key": preview["idempotency_key"], "confirm": True}, format="json")
        second = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", {"idempotency_key": preview["idempotency_key"], "confirm": True}, format="json")
        duplicate = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", {"idempotency_key": "different-key", "confirm": True}, format="json")
        self.assertEqual(first.status_code, status.HTTP_200_OK, first.data)
        self.assertTrue(first.data["posted"])
        self.assertFalse(second.data["posted"])
        self.assertEqual(duplicate.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(AccountingBridgePosting.objects.filter(source_model="RentLeaseBillingDemand", source_id=str(demand.id), purpose="LEASE_MONTHLY_REVENUE").count(), 1)
        item = ReconciliationItem.objects.get(source_type="RentLeaseBillingDemand", source_id=str(demand.id), exception_code="POSTED_UNVERIFIED")
        self.assertEqual(item.status, ReconciliationItemStatus.NEEDS_REVIEW)
        self.assertEqual(self._snapshot(demand), before)
        verify = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/items/{item.id}/verify/", {"note": "verified"}, format="json")
        self.assertEqual(verify.status_code, status.HTTP_200_OK, verify.data)
        item.refresh_from_db()
        self.assertEqual(item.status, ReconciliationItemStatus.MATCHED)

    def test_non_admin_rejected_and_reconciliation_run_detects_unposted_and_posted(self):
        demand = self._demand(plan_type=PlanType.RENT, suffix="RUN")
        candidate_id = self._candidate_id(demand)
        preview = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/preview/").data
        self.client.force_authenticate(user=self.cashier)
        non_admin = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", {"idempotency_key": preview["idempotency_key"], "confirm": True}, format="json")
        self.assertIn(non_admin.status_code, {status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN})
        self.client.force_authenticate(user=self.admin)
        run = ReconciliationRun.objects.create(run_no=next_reconciliation_run_no(), scope="PHASE_F14_TEST", module="ACCOUNTING_BRIDGE", date_from=demand.due_date, date_to=demand.due_date, status=ReconciliationRunStatus.RUNNING, started_by=self.admin)
        run_accounting_bridge_checks(run=run, totals={"checked": 0, "matched": 0, "exceptions": 0, "high_risk": 0})
        self.assertTrue(ReconciliationItem.objects.filter(run=run, source_type="RentLeaseBillingDemand", source_id=str(demand.id), exception_code="RENT_LEASE_REVENUE_MISSING_ACCOUNTING_BRIDGE_POSTING").exists())
        post = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", {"idempotency_key": preview["idempotency_key"], "confirm": True}, format="json")
        self.assertEqual(post.status_code, status.HTTP_200_OK, post.data)
        run2 = ReconciliationRun.objects.create(run_no=next_reconciliation_run_no(), scope="PHASE_F14_TEST", module="ACCOUNTING_BRIDGE", date_from=demand.due_date, date_to=demand.due_date, status=ReconciliationRunStatus.RUNNING, started_by=self.admin)
        run_accounting_bridge_checks(run=run2, totals={"checked": 0, "matched": 0, "exceptions": 0, "high_risk": 0})
        self.assertTrue(ReconciliationItem.objects.filter(run=run2, source_type="RentLeaseBillingDemand", source_id=str(demand.id), exception_code="POSTED_UNVERIFIED").exists())
