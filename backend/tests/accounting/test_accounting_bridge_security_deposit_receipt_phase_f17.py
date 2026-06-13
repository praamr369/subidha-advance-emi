from datetime import date
from decimal import Decimal

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import AccountingBridgePosting, ChartOfAccount, DocumentSequence, JournalEntry, JournalEntryStatus, JournalEntryType
from reconciliation.models import ReconciliationItem, ReconciliationItemStatus, ReconciliationRun, ReconciliationRunStatus
from reconciliation.services.accounting_bridge_reconciliation import run_accounting_bridge_checks
from reconciliation.services.run_numbering import next_reconciliation_run_no
from subscriptions.models import (
    PlanType,
    RentLeaseBillingDemand,
    RentLeaseDemandType,
    RentLeaseDepositTransaction,
    RentLeaseDepositTransactionStatus,
    RentLeaseDepositTransactionType,
)
from subscriptions.models_rent_lease_collection import RentLeaseCollection
from subscriptions.services.rent_lease_billing_service import record_deposit_refund
from subscriptions.services.rent_lease_collection_workflow_service import collect_security_deposit_with_metadata
from subscriptions.services.rent_lease_contract_service import create_lease_contract, create_rent_contract
from tests.accounting.helpers import seed_bridge_ready_environment
from tests.helpers import create_admin_user, create_cashier_user, create_customer_profile, create_customer_user, create_product


class AccountingBridgeSecurityDepositReceiptPhaseF17Tests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="phase_f17_admin", phone="9305170001")
        self.cashier = create_cashier_user(username="phase_f17_cashier", phone="9305170002")
        self.customer_user = create_customer_user(username="phase_f17_customer", phone="9305170003")
        self.customer = create_customer_profile(user=self.customer_user, name="F17 Customer", phone="9305170003")
        self.product = create_product(name="F17 Sofa", product_code="F17-SOFA", base_price=Decimal("24000.00"))
        self.product.is_rent_enabled = True
        self.product.is_lease_enabled = True
        self.product.save(update_fields=["is_rent_enabled", "is_lease_enabled"])
        self.today = timezone.localdate()
        self.env = seed_bridge_ready_environment(self.today, performed_by=self.admin)
        self.finance_account = self.env["finance_account"]
        self.client.force_authenticate(user=self.admin)

    def _subscription(self, *, plan_type=PlanType.RENT):
        factory = create_rent_contract if plan_type == PlanType.RENT else create_lease_contract
        return factory(
            customer=self.customer,
            product=self.product,
            tenure_months=12,
            start_date=date(self.today.year, self.today.month, 1),
            security_deposit_percent=Decimal("20.00"),
            performed_by=self.admin,
        )

    def _deposit(self, *, plan_type=PlanType.RENT, amount=Decimal("1000.00"), suffix="001"):
        subscription = self._subscription(plan_type=plan_type)
        collect_security_deposit_with_metadata(
            subscription=subscription,
            amount=amount,
            performed_by=self.admin,
            reference_no=f"F17-{plan_type}-{suffix}",
            finance_account_id=self.finance_account.id,
            payment_method="CASH",
            payment_date=self.today,
            idempotency_key=f"f17-deposit-{plan_type}-{suffix}",
        )
        return RentLeaseDepositTransaction.objects.select_related("demand", "subscription", "customer", "finance_account", "finance_account__chart_account").get(external_reference_no=f"F17-{plan_type}-{suffix}")

    def _candidate_id(self, tx):
        event_key = "rent_security_deposit_receipt" if tx.plan_type == PlanType.RENT else "lease_security_deposit_receipt"
        return f"rentleasedeposittransaction:{tx.id}:{event_key}"

    def _snapshot(self, tx):
        tx.refresh_from_db()
        tx.subscription.refresh_from_db()
        tx.customer.refresh_from_db()
        tx.finance_account.refresh_from_db()
        if tx.demand_id:
            tx.demand.refresh_from_db()
        return {
            "deposit": {
                "amount": tx.amount,
                "status": tx.status,
                "transaction_type": tx.transaction_type,
                "transaction_date": tx.transaction_date,
                "payment_method": tx.payment_method,
                "finance_account_id": tx.finance_account_id,
            },
            "demand": {
                "status": tx.demand.status if tx.demand_id else None,
                "collected_amount": tx.demand.collected_amount if tx.demand_id else None,
                "held_amount": tx.demand.held_amount if tx.demand_id else None,
                "refundable_amount": tx.demand.refundable_amount if tx.demand_id else None,
            },
            "subscription": {"status": tx.subscription.status, "monthly_amount": tx.subscription.monthly_amount},
            "customer": {"name": tx.customer.name, "phone": tx.customer.phone},
            "finance_account": {"is_active": tx.finance_account.is_active, "chart_account_id": tx.finance_account.chart_account_id},
            "collections": RentLeaseCollection.objects.count(),
        }

    def _post_deposit(self, tx):
        candidate_id = self._candidate_id(tx)
        preview = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/preview/").data
        response = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", {"idempotency_key": preview["idempotency_key"], "confirm": True}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        return response.data

    def _run_checks(self):
        run = ReconciliationRun.objects.create(run_no=next_reconciliation_run_no(), scope="PHASE_F17_TEST", module="ACCOUNTING_BRIDGE", date_from=self.today, date_to=self.today, status=ReconciliationRunStatus.RUNNING, started_by=self.admin)
        totals = {"checked": 0, "matched": 0, "exceptions": 0, "high_risk": 0}
        run_accounting_bridge_checks(run=run, totals=totals)
        return run

    def test_concrete_rent_and_lease_deposit_receipt_candidate_generation(self):
        rent = self._deposit(plan_type=PlanType.RENT, suffix="RENT")
        lease = self._deposit(plan_type=PlanType.LEASE, suffix="LEASE")
        response = self.client.get("/api/v1/admin/accounting/bridge-reconciliation/?source_model=RentLeaseDepositTransaction")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        rows = {int(row["source_pk"]): row for row in response.data["results"]}
        self.assertEqual(rows[rent.id]["event_key"], "rent_security_deposit_receipt")
        self.assertEqual(rows[lease.id]["event_key"], "lease_security_deposit_receipt")
        self.assertEqual(rows[rent.id]["source_model"], "RentLeaseDepositTransaction")
        self.assertEqual(rows[rent.id]["status"], "READY_UNPOSTED")
        self.assertTrue(rows[rent.id]["can_post"])
        self.assertEqual(rows[rent.id]["deposit_transaction_number"], rent.transaction_number)
        self.assertEqual(rows[rent.id]["external_reference_no"], rent.external_reference_no)
        self.assertEqual(rows[rent.id]["customer_name"], self.customer.name)
        self.assertEqual(rows[rent.id]["finance_account_name"], self.finance_account.name)
        self.assertIn("security_deposit_receipt_ready_unposted_count", response.data["summary"])

    def test_preview_is_read_only_balanced_and_does_not_consume_numbering(self):
        tx = self._deposit(plan_type=PlanType.RENT, suffix="PREVIEW")
        before = {"snapshot": self._snapshot(tx), "journals": JournalEntry.objects.count(), "bridges": AccountingBridgePosting.objects.count(), "items": ReconciliationItem.objects.count(), "next_number": DocumentSequence.objects.get(pk=self.env["journal_numbering_profile"].pk).next_number}
        response = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{self._candidate_id(tx)}/preview/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["source"]["model"], "RentLeaseDepositTransaction")
        self.assertEqual(response.data["source"]["deposit_transaction_number"], tx.transaction_number)
        self.assertEqual(response.data["total_debit"], "1000.00")
        self.assertEqual(response.data["total_credit"], "1000.00")
        self.assertTrue(response.data["is_balanced"])
        self.assertFalse(response.data.get("tax_lines"))
        self.assertIn("does not edit deposit, contract, customer, collection, demand, or finance-account records", response.data["safety_text"])
        descriptions = " ".join(line["description"].lower() for line in response.data["lines"])
        self.assertNotIn("revenue", descriptions)
        self.assertNotIn("receivable", descriptions)
        after = {"snapshot": self._snapshot(tx), "journals": JournalEntry.objects.count(), "bridges": AccountingBridgePosting.objects.count(), "items": ReconciliationItem.objects.count(), "next_number": DocumentSequence.objects.get(pk=self.env["journal_numbering_profile"].pk).next_number}
        self.assertEqual(after, before)

    def test_post_idempotent_pending_verify_and_no_source_mutation(self):
        tx = self._deposit(plan_type=PlanType.LEASE, suffix="POST")
        before = self._snapshot(tx)
        candidate_id = self._candidate_id(tx)
        preview = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/preview/").data
        first = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", {"idempotency_key": preview["idempotency_key"], "confirm": True}, format="json")
        second = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", {"idempotency_key": preview["idempotency_key"], "confirm": True}, format="json")
        duplicate = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", {"idempotency_key": "different-key", "confirm": True}, format="json")
        self.assertEqual(first.status_code, status.HTTP_200_OK, first.data)
        self.assertTrue(first.data["posted"])
        self.assertFalse(second.data["posted"])
        self.assertEqual(duplicate.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(AccountingBridgePosting.objects.filter(source_model="RentLeaseDepositTransaction", source_id=str(tx.id), purpose="LEASE_SECURITY_DEPOSIT_RECEIPT").count(), 1)
        item = ReconciliationItem.objects.get(source_type="RentLeaseDepositTransaction", source_id=str(tx.id), exception_code="POSTED_UNVERIFIED")
        self.assertEqual(item.status, ReconciliationItemStatus.NEEDS_REVIEW)
        self.assertEqual(self._snapshot(tx), before)
        verify = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/items/{item.id}/verify/", {"note": "verified"}, format="json")
        self.assertEqual(verify.status_code, status.HTTP_200_OK, verify.data)
        item.refresh_from_db()
        self.assertEqual(item.status, ReconciliationItemStatus.MATCHED)

    def test_refund_void_blockers_and_non_admin_rejected(self):
        tx = self._deposit(plan_type=PlanType.RENT, suffix="BLOCK")
        subscription = tx.subscription
        record_deposit_refund(subscription=subscription, amount=Decimal("100.00"), performed_by=self.admin, reference_no="F17-REFUND", finance_account_id=self.finance_account.id, payment_method="CASH", payment_date=self.today, idempotency_key="f17-refund")
        refund = RentLeaseDepositTransaction.objects.get(transaction_type=RentLeaseDepositTransactionType.DEPOSIT_REFUND)
        tx.status = RentLeaseDepositTransactionStatus.VOIDED
        tx.voided_at = timezone.now()
        tx.voided_by = self.admin
        tx.void_reason = "test void"
        tx.save()
        response = self.client.get("/api/v1/admin/accounting/bridge-reconciliation/?source_model=RentLeaseDepositTransaction")
        rows = {int(row["source_pk"]): row for row in response.data["results"]}
        self.assertEqual(rows[tx.id]["status"], "SKIPPED_NOT_APPLICABLE")
        self.assertFalse(rows[tx.id]["can_post"])
        self.assertEqual(rows[refund.id]["status"], "SKIPPED_NOT_APPLICABLE")
        self.assertFalse(rows[refund.id]["can_post"])
        self.client.force_authenticate(user=self.cashier)
        post = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{self._candidate_id(tx)}/post/", {"idempotency_key": rows[tx.id]["idempotency_key"], "confirm": True}, format="json")
        self.assertIn(post.status_code, {status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN})

    def test_finance_mapping_numbering_and_period_blockers(self):
        tx = self._deposit(plan_type=PlanType.RENT, suffix="FIN")
        self.finance_account.is_active = False
        self.finance_account.save(update_fields=["is_active"])
        response = self.client.get("/api/v1/admin/accounting/bridge-reconciliation/?source_model=RentLeaseDepositTransaction")
        row = next(item for item in response.data["results"] if int(item["source_pk"]) == tx.id)
        self.assertEqual(row["status"], "BLOCKED_BY_FINANCE_ACCOUNT")
        self.assertFalse(row["can_post"])
        self.assertIn("finance_accounts", {link["key"] for link in row["action_links"]})
        self.finance_account.is_active = True
        self.finance_account.save(update_fields=["is_active"])
        tx2 = self._deposit(plan_type=PlanType.RENT, suffix="NUMBERING")
        DocumentSequence.objects.filter(document_type="JOURNAL_ENTRY").delete()
        response = self.client.get("/api/v1/admin/accounting/bridge-reconciliation/?source_model=RentLeaseDepositTransaction")
        row = next(item for item in response.data["results"] if int(item["source_pk"]) == tx2.id)
        self.assertEqual(row["status"], "BLOCKED_BY_NUMBERING")

    def test_missing_liability_mapping_rejected(self):
        tx = self._deposit(plan_type=PlanType.RENT, suffix="MAP")
        ChartOfAccount.objects.filter(system_code="SECURITY_DEPOSIT_LIABILITY").update(is_active=False)
        response = self.client.get("/api/v1/admin/accounting/bridge-reconciliation/?source_model=RentLeaseDepositTransaction")
        row = next(item for item in response.data["results"] if int(item["source_pk"]) == tx.id)
        self.assertEqual(row["status"], "BLOCKED_BY_MAPPING")
        self.assertFalse(row["can_post"])

    def test_batch_preview_post_and_reconciliation_diagnostics(self):
        missing_tx = self._deposit(plan_type=PlanType.RENT, suffix="RUNMISS")
        run = self._run_checks()
        self.assertTrue(ReconciliationItem.objects.filter(run=run, source_type="RentLeaseDepositTransaction", source_id=str(missing_tx.id), exception_code="SECURITY_DEPOSIT_RECEIPT_MISSING_ACCOUNTING_BRIDGE_POSTING").exists())

        batch_tx = self._deposit(plan_type=PlanType.RENT, suffix="BATCH")
        candidate_id = self._candidate_id(batch_tx)
        batch_preview = self.client.post("/api/v1/admin/accounting/bridge-reconciliation/batch-preview/", {"candidate_ids": [candidate_id]}, format="json")
        self.assertEqual(batch_preview.status_code, status.HTTP_200_OK, batch_preview.data)
        key = batch_preview.data["previews"][0]["idempotency_key"]
        batch_post = self.client.post("/api/v1/admin/accounting/bridge-reconciliation/batch-post/", {"candidate_ids": [candidate_id], "idempotency_keys": {candidate_id: key}, "confirm": True}, format="json")
        self.assertEqual(batch_post.status_code, status.HTTP_200_OK, batch_post.data)
        clean_run = self._run_checks()
        self.assertTrue(ReconciliationItem.objects.filter(run=clean_run, source_type="RentLeaseDepositTransaction", source_id=str(batch_tx.id), exception_code="SECURITY_DEPOSIT_RECEIPT_POSTED_UNVERIFIED").exists())

        amount_tx = self._deposit(plan_type=PlanType.RENT, suffix="AMOUNT")
        self._post_deposit(amount_tx)
        amount_journal = AccountingBridgePosting.objects.get(source_model="RentLeaseDepositTransaction", source_id=str(amount_tx.id)).journal_entry
        for line in amount_journal.lines.all():
            line.__class__.objects.filter(pk=line.pk).update(debit_amount=Decimal("900.00") if line.debit_amount else Decimal("0.00"), credit_amount=Decimal("900.00") if line.credit_amount else Decimal("0.00"))
        amount_run = self._run_checks()
        self.assertTrue(ReconciliationItem.objects.filter(run=amount_run, source_type="RentLeaseDepositTransaction", source_id=str(amount_tx.id), exception_code="SECURITY_DEPOSIT_RECEIPT_AMOUNT_MISMATCH").exists())

        broken_tx = self._deposit(plan_type=PlanType.RENT, suffix="LINK")
        self._post_deposit(broken_tx)
        broken_journal = AccountingBridgePosting.objects.get(source_model="RentLeaseDepositTransaction", source_id=str(broken_tx.id)).journal_entry
        JournalEntry.objects.filter(pk=broken_journal.pk).update(source_id="broken-source")
        link_run = self._run_checks()
        self.assertTrue(ReconciliationItem.objects.filter(run=link_run, exception_code="SECURITY_DEPOSIT_RECEIPT_SOURCE_LINK_MISSING").exists())

        unbalanced_tx = self._deposit(plan_type=PlanType.RENT, suffix="UNBAL")
        self._post_deposit(unbalanced_tx)
        unbalanced_journal = AccountingBridgePosting.objects.get(source_model="RentLeaseDepositTransaction", source_id=str(unbalanced_tx.id)).journal_entry
        credit_line = unbalanced_journal.lines.filter(credit_amount__gt=0).first()
        credit_line.__class__.objects.filter(pk=credit_line.pk).update(credit_amount=Decimal("999.00"))
        unbalanced_run = self._run_checks()
        self.assertTrue(ReconciliationItem.objects.filter(run=unbalanced_run, source_type="RentLeaseDepositTransaction", source_id=str(unbalanced_tx.id), exception_code="SECURITY_DEPOSIT_RECEIPT_JOURNAL_UNBALANCED").exists())

        duplicate_tx = self._deposit(plan_type=PlanType.LEASE, suffix="DUP")
        self._post_deposit(duplicate_tx)
        original = AccountingBridgePosting.objects.get(source_model="RentLeaseDepositTransaction", source_id=str(duplicate_tx.id)).journal_entry
        JournalEntry.objects.create(entry_date=original.entry_date, entry_type=JournalEntryType.SYSTEM_BRIDGE, status=JournalEntryStatus.POSTED, memo="duplicate test", source_model="RentLeaseDepositTransaction", source_id=str(duplicate_tx.id), voucher_type=original.voucher_type, source_type=original.source_type, source_reference=original.source_reference, financial_year=original.financial_year, accounting_period=original.accounting_period, posted_by=self.admin, posted_at=timezone.now())
        duplicate_run = self._run_checks()
        self.assertTrue(ReconciliationItem.objects.filter(run=duplicate_run, source_type="RentLeaseDepositTransaction", source_id=str(duplicate_tx.id), exception_code="SECURITY_DEPOSIT_RECEIPT_DUPLICATE_ACCOUNTING_BRIDGE_POSTING").exists())
