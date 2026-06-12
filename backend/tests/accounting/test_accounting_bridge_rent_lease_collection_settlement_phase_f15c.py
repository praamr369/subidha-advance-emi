from datetime import date
from decimal import Decimal

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import AccountingBridgePosting, DocumentSequence, JournalEntry, JournalEntryStatus, JournalEntryType
from reconciliation.models import ReconciliationItem, ReconciliationItemStatus, ReconciliationRun, ReconciliationRunStatus
from reconciliation.services.accounting_bridge_reconciliation import run_accounting_bridge_checks
from reconciliation.services.run_numbering import next_reconciliation_run_no
from subscriptions.models import PlanType, RentLeaseBillingDemand, RentLeaseDemandStatus, RentLeaseDemandType, Subscription, SubscriptionStatus
from subscriptions.models_rent_lease_collection import RentLeaseCollection, RentLeaseCollectionStatus
from subscriptions.services.rent_lease_collection_workflow_service import collect_rent_lease_monthly_demand
from tests.accounting.helpers import seed_bridge_ready_environment
from tests.helpers import create_admin_user, create_cashier_user, create_customer_profile, create_customer_user, create_product


class AccountingBridgeRentLeaseCollectionSettlementPhaseF15CTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="phase_f15c_admin", phone="9305150001")
        self.cashier = create_cashier_user(username="phase_f15c_cashier", phone="9305150002")
        self.customer_user = create_customer_user(username="phase_f15c_customer", phone="9305150003")
        self.customer = create_customer_profile(user=self.customer_user, name="F15C Customer", phone="9305150003")
        self.product = create_product(name="F15C Sofa", product_code="F15C-SOFA", base_price=Decimal("24000.00"))
        self.product.is_rent_enabled = True
        self.product.is_lease_enabled = True
        self.product.save(update_fields=["is_rent_enabled", "is_lease_enabled"])
        self.today = timezone.localdate()
        self.env = seed_bridge_ready_environment(self.today, performed_by=self.admin)
        self.finance_account = self.env["finance_account"]
        self.client.force_authenticate(user=self.admin)

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
            subscription_number=f"F15C-{suffix}-{self.today:%Y%m%d}",
            waived_amount=Decimal("0.00"),
        )

    def _demand(self, subscription, *, suffix="001"):
        demand_type = RentLeaseDemandType.RENT_MONTHLY if subscription.plan_type == PlanType.RENT else RentLeaseDemandType.LEASE_MONTHLY
        return RentLeaseBillingDemand.objects.create(
            subscription=subscription,
            demand_type=demand_type,
            status=RentLeaseDemandStatus.PENDING,
            billing_period_start=date(self.today.year, self.today.month, 1),
            billing_period_end=date(self.today.year, self.today.month, 28),
            due_date=self.today,
            amount=Decimal("2000.00"),
            collected_amount=Decimal("0.00"),
            reference_key=f"RL-F15C-{subscription.plan_type}-{suffix}",
        )

    def _collection(self, *, plan_type=PlanType.RENT, amount=Decimal("1000.00"), suffix="001"):
        subscription = self._subscription(plan_type=plan_type, suffix=f"{plan_type}-{suffix}")
        demand = self._demand(subscription, suffix=suffix)
        collect_rent_lease_monthly_demand(
            subscription=subscription,
            demand_id=demand.id,
            amount=amount,
            performed_by=self.admin,
            reference_no=f"F15C-{plan_type}-{suffix}",
            finance_account_id=self.finance_account.id,
            payment_method="CASH",
            payment_date=self.today,
            idempotency_key=f"f15c-{plan_type}-{suffix}",
        )
        return RentLeaseCollection.objects.select_related("demand", "subscription", "customer", "finance_account").get(external_reference_no=f"F15C-{plan_type}-{suffix}")

    def _candidate_id(self, collection):
        event_key = "rent_payment_settlement" if collection.plan_type == PlanType.RENT else "lease_payment_settlement"
        return f"rentleasecollection:{collection.id}:{event_key}"

    def _collection_snapshot(self, collection):
        collection.refresh_from_db()
        collection.demand.refresh_from_db()
        collection.subscription.refresh_from_db()
        collection.customer.refresh_from_db()
        collection.finance_account.refresh_from_db()
        return {
            "collection": {"amount": collection.amount, "status": collection.status, "payment_date": collection.payment_date, "payment_method": collection.payment_method, "finance_account_id": collection.finance_account_id},
            "demand": {"status": collection.demand.status, "collected_amount": collection.demand.collected_amount},
            "subscription": {"status": collection.subscription.status, "monthly_amount": collection.subscription.monthly_amount},
            "customer": {"name": collection.customer.name, "phone": collection.customer.phone},
            "finance_account": {"is_active": collection.finance_account.is_active, "chart_account_id": collection.finance_account.chart_account_id},
        }

    def _post_collection(self, collection):
        candidate_id = self._candidate_id(collection)
        preview = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/preview/").data
        response = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", {"idempotency_key": preview["idempotency_key"], "confirm": True}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        return response.data

    def _run_checks(self):
        run = ReconciliationRun.objects.create(run_no=next_reconciliation_run_no(), scope="PHASE_F15C_TEST", module="ACCOUNTING_BRIDGE", date_from=self.today, date_to=self.today, status=ReconciliationRunStatus.RUNNING, started_by=self.admin)
        totals = {"checked": 0, "matched": 0, "exceptions": 0, "high_risk": 0}
        run_accounting_bridge_checks(run=run, totals=totals)
        return run

    def test_concrete_rent_and_lease_candidate_generation(self):
        rent = self._collection(plan_type=PlanType.RENT, suffix="RENT")
        lease = self._collection(plan_type=PlanType.LEASE, suffix="LEASE")
        response = self.client.get("/api/v1/admin/accounting/bridge-reconciliation/?source_model=RentLeaseCollection")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        rows = {int(row["source_pk"]): row for row in response.data["results"]}
        self.assertEqual(rows[rent.id]["event_key"], "rent_payment_settlement")
        self.assertEqual(rows[lease.id]["event_key"], "lease_payment_settlement")
        self.assertEqual(rows[rent.id]["status"], "READY_UNPOSTED")
        self.assertTrue(rows[rent.id]["can_post"])
        self.assertEqual(rows[lease.id]["source_model"], "RentLeaseCollection")
        self.assertEqual(rows[rent.id]["collection_number"], rent.collection_number)
        self.assertEqual(rows[rent.id]["external_reference_no"], rent.external_reference_no)
        self.assertEqual(rows[rent.id]["customer_name"], self.customer.name)
        self.assertEqual(rows[rent.id]["finance_account_name"], self.finance_account.name)
        self.assertTrue(any(link["key"] == "bridge_posting" for link in rows[rent.id]["action_links"]))

    def test_preview_is_read_only_and_balanced(self):
        collection = self._collection(plan_type=PlanType.RENT, suffix="PREVIEW")
        before = {"snapshot": self._collection_snapshot(collection), "journals": JournalEntry.objects.count(), "bridges": AccountingBridgePosting.objects.count(), "items": ReconciliationItem.objects.count(), "next_number": DocumentSequence.objects.get(pk=self.env["journal_numbering_profile"].pk).next_number}
        response = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{self._candidate_id(collection)}/preview/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["source"]["model"], "RentLeaseCollection")
        self.assertEqual(response.data["source"]["collection_number"], collection.collection_number)
        self.assertEqual(response.data["source"]["external_reference_no"], collection.external_reference_no)
        self.assertEqual(response.data["total_debit"], "1000.00")
        self.assertEqual(response.data["total_credit"], "1000.00")
        self.assertTrue(response.data["is_balanced"])
        self.assertFalse(response.data.get("tax_lines"))
        self.assertIn("read-only", response.data["safety_text"])
        after = {"snapshot": self._collection_snapshot(collection), "journals": JournalEntry.objects.count(), "bridges": AccountingBridgePosting.objects.count(), "items": ReconciliationItem.objects.count(), "next_number": DocumentSequence.objects.get(pk=self.env["journal_numbering_profile"].pk).next_number}
        self.assertEqual(after, before)

    def test_post_idempotent_pending_verify_and_no_source_mutation(self):
        collection = self._collection(plan_type=PlanType.LEASE, suffix="POST")
        before = self._collection_snapshot(collection)
        candidate_id = self._candidate_id(collection)
        preview = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/preview/").data
        first = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", {"idempotency_key": preview["idempotency_key"], "confirm": True}, format="json")
        second = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", {"idempotency_key": preview["idempotency_key"], "confirm": True}, format="json")
        duplicate = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", {"idempotency_key": "different-key", "confirm": True}, format="json")
        self.assertEqual(first.status_code, status.HTTP_200_OK, first.data)
        self.assertTrue(first.data["posted"])
        self.assertFalse(second.data["posted"])
        self.assertEqual(duplicate.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(AccountingBridgePosting.objects.filter(source_model="RentLeaseCollection", source_id=str(collection.id), purpose="LEASE_PAYMENT_SETTLEMENT").count(), 1)
        item = ReconciliationItem.objects.get(source_type="RentLeaseCollection", source_id=str(collection.id), exception_code="POSTED_UNVERIFIED")
        self.assertEqual(item.status, ReconciliationItemStatus.NEEDS_REVIEW)
        self.assertEqual(self._collection_snapshot(collection), before)
        verify = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/items/{item.id}/verify/", {"note": "verified"}, format="json")
        self.assertEqual(verify.status_code, status.HTTP_200_OK, verify.data)
        item.refresh_from_db()
        self.assertEqual(item.status, ReconciliationItemStatus.MATCHED)

    def test_blockers_action_links_and_non_admin(self):
        collection = self._collection(plan_type=PlanType.RENT, suffix="BLOCK")
        self.finance_account.is_active = False
        self.finance_account.save(update_fields=["is_active"])
        response = self.client.get("/api/v1/admin/accounting/bridge-reconciliation/?source_model=RentLeaseCollection")
        row = next(item for item in response.data["results"] if int(item["source_pk"]) == collection.id)
        self.assertEqual(row["status"], "BLOCKED_BY_FINANCE_ACCOUNT")
        self.assertFalse(row["can_post"])
        link_keys = {link["key"] for link in row["action_links"]}
        self.assertIn("finance_accounts", link_keys)
        self.assertIn("bridge_posting", link_keys)
        self.client.force_authenticate(user=self.cashier)
        post = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{self._candidate_id(collection)}/post/", {"idempotency_key": row["idempotency_key"], "confirm": True}, format="json")
        self.assertIn(post.status_code, {status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN})

    def test_voided_collection_is_not_postable_and_f14_rows_still_exist(self):
        collection = self._collection(plan_type=PlanType.RENT, suffix="VOID")
        collection.status = RentLeaseCollectionStatus.VOIDED
        collection.voided_at = timezone.now()
        collection.voided_by = self.admin
        collection.void_reason = "test"
        collection.save()
        response = self.client.get("/api/v1/admin/accounting/bridge-reconciliation/?source_model=RentLeaseCollection")
        row = next(item for item in response.data["results"] if int(item["source_pk"]) == collection.id)
        self.assertEqual(row["status"], "SKIPPED_NOT_APPLICABLE")
        self.assertFalse(row["can_post"])
        f14_response = self.client.get("/api/v1/admin/accounting/bridge-reconciliation/?source_model=RentLeaseBillingDemand")
        self.assertEqual(f14_response.status_code, status.HTTP_200_OK, f14_response.data)

    def test_reconciliation_run_reports_missing_and_posted_unverified_separately_from_f14(self):
        collection = self._collection(plan_type=PlanType.RENT, suffix="RUNMISS")
        run = self._run_checks()
        self.assertTrue(ReconciliationItem.objects.filter(run=run, source_type="RentLeaseCollection", source_id=str(collection.id), exception_code="RENT_LEASE_COLLECTION_MISSING_ACCOUNTING_BRIDGE_POSTING").exists())
        self.assertFalse(ReconciliationItem.objects.filter(run=run, source_type="RentLeaseBillingDemand", source_id=str(collection.id), exception_code="RENT_LEASE_COLLECTION_MISSING_ACCOUNTING_BRIDGE_POSTING").exists())
        self._post_collection(collection)
        run2 = self._run_checks()
        self.assertTrue(ReconciliationItem.objects.filter(run=run2, source_type="RentLeaseCollection", source_id=str(collection.id), exception_code="RENT_LEASE_COLLECTION_POSTED_UNVERIFIED").exists())

    def test_reconciliation_run_reports_amount_mismatch_duplicate_source_link_and_unbalanced(self):
        amount_collection = self._collection(plan_type=PlanType.RENT, suffix="AMOUNT")
        self._post_collection(amount_collection)
        amount_journal = AccountingBridgePosting.objects.get(source_model="RentLeaseCollection", source_id=str(amount_collection.id)).journal_entry
        for line in amount_journal.lines.all():
            line.__class__.objects.filter(pk=line.pk).update(debit_amount=Decimal("900.00") if line.debit_amount else Decimal("0.00"), credit_amount=Decimal("900.00") if line.credit_amount else Decimal("0.00"))
        amount_run = self._run_checks()
        self.assertTrue(ReconciliationItem.objects.filter(run=amount_run, source_type="RentLeaseCollection", source_id=str(amount_collection.id), exception_code="RENT_LEASE_COLLECTION_AMOUNT_MISMATCH").exists())

        broken_collection = self._collection(plan_type=PlanType.RENT, suffix="LINK")
        self._post_collection(broken_collection)
        broken_journal = AccountingBridgePosting.objects.get(source_model="RentLeaseCollection", source_id=str(broken_collection.id)).journal_entry
        JournalEntry.objects.filter(pk=broken_journal.pk).update(source_id="broken-source")
        link_run = self._run_checks()
        self.assertTrue(ReconciliationItem.objects.filter(run=link_run, exception_code="RENT_LEASE_COLLECTION_SOURCE_LINK_MISSING").exists())

        unbalanced_collection = self._collection(plan_type=PlanType.RENT, suffix="UNBAL")
        self._post_collection(unbalanced_collection)
        unbalanced_journal = AccountingBridgePosting.objects.get(source_model="RentLeaseCollection", source_id=str(unbalanced_collection.id)).journal_entry
        credit_line = unbalanced_journal.lines.filter(credit_amount__gt=0).first()
        credit_line.__class__.objects.filter(pk=credit_line.pk).update(credit_amount=Decimal("999.00"))
        unbalanced_run = self._run_checks()
        self.assertTrue(ReconciliationItem.objects.filter(run=unbalanced_run, source_type="RentLeaseCollection", source_id=str(unbalanced_collection.id), exception_code="RENT_LEASE_COLLECTION_JOURNAL_UNBALANCED").exists())

        duplicate_collection = self._collection(plan_type=PlanType.LEASE, suffix="DUP")
        self._post_collection(duplicate_collection)
        original = AccountingBridgePosting.objects.get(source_model="RentLeaseCollection", source_id=str(duplicate_collection.id)).journal_entry
        JournalEntry.objects.create(entry_date=original.entry_date, entry_type=JournalEntryType.SYSTEM_BRIDGE, status=JournalEntryStatus.POSTED, memo="duplicate test", source_model="RentLeaseCollection", source_id=str(duplicate_collection.id), voucher_type=original.voucher_type, source_type=original.source_type, source_reference=original.source_reference, financial_year=original.financial_year, accounting_period=original.accounting_period, posted_by=self.admin, posted_at=timezone.now())
        duplicate_run = self._run_checks()
        self.assertTrue(ReconciliationItem.objects.filter(run=duplicate_run, source_type="RentLeaseCollection", source_id=str(duplicate_collection.id), exception_code="RENT_LEASE_COLLECTION_DUPLICATE_ACCOUNTING_BRIDGE_POSTING").exists())

    def test_reconciliation_run_reports_inactive_finance_account_diagnostic(self):
        collection = self._collection(plan_type=PlanType.RENT, suffix="FINBLOCK")
        self.finance_account.is_active = False
        self.finance_account.save(update_fields=["is_active"])
        run = self._run_checks()
        self.assertTrue(ReconciliationItem.objects.filter(run=run, source_type="RentLeaseCollection", source_id=str(collection.id), exception_code="RENT_LEASE_COLLECTION_FINANCE_ACCOUNT_INACTIVE").exists())
