from decimal import Decimal

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import AccountingBridgePosting, AccountingPeriodStatus, DocumentSequence, JournalEntry, JournalEntryStatus
from accounting.services.accounting_bridge_reconciliation_read_service import BridgeReconciliationFilters, build_accounting_bridge_reconciliation
from accounting.services.document_sequence_service import DocumentType
from accounting.services.setup_defaults_service import apply_accounting_setup_defaults
from reconciliation.models import ReconciliationItem, ReconciliationItemStatus, ReconciliationRun, ReconciliationRunStatus
from reconciliation.services.accounting_bridge_reconciliation import run_accounting_bridge_checks
from reconciliation.services.run_numbering import next_reconciliation_run_no
from subscriptions.models import Payment, PaymentMethod
from tests.helpers import (
    create_admin_user,
    create_cashier_user,
    create_customer_profile,
    create_customer_user,
    create_emi,
    create_lucky_id,
    create_product,
    create_subscription,
    create_batch,
    ensure_default_payment_collection_accounts,
    ensure_test_accounting_posting_prerequisites,
)


class AccountingBridgeCandidatePostingPhaseFTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="phase_f_bridge_admin", phone="9304600101")
        self.customer_user = create_customer_user(username="phase_f_bridge_customer", phone="9304600102")
        self.cashier = create_cashier_user(username="phase_f_bridge_cashier", phone="9304600103")
        self.client.force_authenticate(user=self.admin)
        self.prereqs = ensure_test_accounting_posting_prerequisites(timezone.localdate(), performed_by=self.admin)
        apply_accounting_setup_defaults(performed_by=self.admin)
        self.finance_account = ensure_default_payment_collection_accounts()["CASH"]
        customer = create_customer_profile(user=self.customer_user, phone="9304600102")
        product = create_product(product_code="PHASE-F-BRIDGE")
        batch = create_batch(batch_code="PHASE-F-BRIDGE")
        lucky_id = create_lucky_id(batch=batch, lucky_number=44)
        subscription = create_subscription(customer=customer, product=product, batch=batch, lucky_id=lucky_id)
        emi = create_emi(subscription=subscription, due_date=timezone.localdate())
        self.payment = Payment.objects.create(
            customer=customer,
            subscription=subscription,
            emi=emi,
            amount=Decimal("1000.00"),
            method=PaymentMethod.CASH,
            reference_no="PHASE-F-PAY-001",
            payment_date=timezone.localdate(),
            finance_account=self.finance_account,
            collected_by=self.admin,
        )
        self.candidate_id = f"payment:{self.payment.id}:subscription_emi_payment"

    def test_preview_is_read_only_and_does_not_consume_numbering(self):
        payment_before = Payment.objects.get(pk=self.payment.pk)
        emi_before_status = self.payment.emi.status
        before = {
            "journals": JournalEntry.objects.count(),
            "bridge": AccountingBridgePosting.objects.count(),
            "items": ReconciliationItem.objects.count(),
            "next_number": DocumentSequence.objects.get(pk=self.prereqs["journal_numbering_profile"].pk).next_number,
        }
        response = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{self.candidate_id}/preview/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertTrue(response.data["is_balanced"])
        self.assertTrue(response.data["can_post"])
        self.assertEqual(response.data["source"]["model"], "Payment")
        self.assertEqual(response.data["source"]["pk"], self.payment.id)
        self.assertEqual(response.data["source"]["reference_number"], "PHASE-F-PAY-001")
        self.assertEqual(response.data["idempotency_key"], response.data["candidate"]["idempotency_key"])
        self.assertTrue(response.data["journal_number_preview"])
        self.assertEqual(len(response.data["debit_lines"]), 1)
        self.assertEqual(len(response.data["credit_lines"]), 1)
        self.assertEqual(response.data["total_debit"], "1000.00")
        self.assertEqual(response.data["total_credit"], "1000.00")
        after = {
            "journals": JournalEntry.objects.count(),
            "bridge": AccountingBridgePosting.objects.count(),
            "items": ReconciliationItem.objects.count(),
            "next_number": DocumentSequence.objects.get(pk=self.prereqs["journal_numbering_profile"].pk).next_number,
        }
        self.assertEqual(after, before)
        self.payment.refresh_from_db()
        self.payment.emi.refresh_from_db()
        self.assertEqual(self.payment.amount, payment_before.amount)
        self.assertEqual(self.payment.method, payment_before.method)
        self.assertEqual(self.payment.emi.status, emi_before_status)

    def test_concrete_candidate_semantics_and_abstract_rows_are_not_postable(self):
        first = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{self.candidate_id}/preview/").data
        second = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{self.candidate_id}/preview/").data
        self.assertEqual(first["idempotency_key"], second["idempotency_key"])

        response = self.client.get("/api/v1/admin/accounting/bridge-reconciliation/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        candidate = next(row for row in response.data["results"] if row.get("bridge_candidate_id") == self.candidate_id)
        self.assertEqual(candidate["source_model"], "Payment")
        self.assertEqual(candidate["source_pk"], self.payment.id)
        self.assertEqual(candidate["event_key"], "subscription_emi_payment")
        self.assertEqual(candidate["idempotency_key"], first["idempotency_key"])
        abstract_rows = [row for row in response.data["results"] if row["row_type"] == "readiness_event"]
        self.assertTrue(abstract_rows)
        self.assertTrue(all(row["can_post"] is False for row in abstract_rows))

    def test_explicit_post_creates_one_journal_and_pending_reconciliation_item(self):
        next_before = DocumentSequence.objects.get(pk=self.prereqs["journal_numbering_profile"].pk).next_number
        preview = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{self.candidate_id}/preview/").data
        response = self.client.post(
            f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{self.candidate_id}/post/",
            {"idempotency_key": preview["idempotency_key"], "confirm": True, "posting_note": "Phase F test"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertTrue(response.data["posted"])
        self.assertEqual(AccountingBridgePosting.objects.filter(source_model="Payment", source_id=str(self.payment.id), purpose="PAYMENT_COLLECTION").count(), 1)
        journal = JournalEntry.objects.get(pk=response.data["journal_entry"]["id"])
        self.assertEqual(journal.status, JournalEntryStatus.POSTED)
        self.assertEqual(journal.source_model, "Payment")
        self.assertEqual(journal.source_id, str(self.payment.id))
        self.assertEqual(journal.voucher_type, "PAYMENT_COLLECTION")
        totals = {
            "debit": sum((line.debit_amount for line in journal.lines.all()), Decimal("0.00")),
            "credit": sum((line.credit_amount for line in journal.lines.all()), Decimal("0.00")),
        }
        self.assertEqual(totals["debit"], Decimal("1000.00"))
        self.assertEqual(totals["credit"], Decimal("1000.00"))
        self.assertEqual(DocumentSequence.objects.get(pk=self.prereqs["journal_numbering_profile"].pk).next_number, next_before + 1)
        item = ReconciliationItem.objects.get(source_type="Payment", source_id=str(self.payment.id), exception_code="POSTED_UNVERIFIED")
        self.assertEqual(item.status, ReconciliationItemStatus.NEEDS_REVIEW)
        self.payment.refresh_from_db()
        self.assertEqual(self.payment.amount, Decimal("1000.00"))

    def test_duplicate_post_same_key_is_idempotent(self):
        preview = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{self.candidate_id}/preview/").data
        payload = {"idempotency_key": preview["idempotency_key"], "confirm": True}
        first = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{self.candidate_id}/post/", payload, format="json")
        second = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{self.candidate_id}/post/", payload, format="json")
        self.assertEqual(first.status_code, status.HTTP_200_OK, first.data)
        self.assertEqual(second.status_code, status.HTTP_200_OK, second.data)
        self.assertFalse(second.data["posted"])
        self.assertEqual(JournalEntry.objects.filter(source_model="Payment", source_id=str(self.payment.id), voucher_type="PAYMENT_COLLECTION").count(), 1)
        self.assertEqual(DocumentSequence.objects.get(pk=self.prereqs["journal_numbering_profile"].pk).next_number, self.prereqs["journal_numbering_profile"].next_number + 1)

    def test_duplicate_post_different_key_rejects(self):
        preview = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{self.candidate_id}/preview/").data
        self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{self.candidate_id}/post/", {"idempotency_key": preview["idempotency_key"], "confirm": True}, format="json")
        response = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{self.candidate_id}/post/", {"idempotency_key": "different-key", "confirm": True}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(JournalEntry.objects.filter(source_model="Payment", source_id=str(self.payment.id), voucher_type="PAYMENT_COLLECTION").count(), 1)

    def test_already_posted_payment_is_not_ready_unposted_again(self):
        preview = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{self.candidate_id}/preview/").data
        self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{self.candidate_id}/post/", {"idempotency_key": preview["idempotency_key"], "confirm": True}, format="json")
        response = self.client.get("/api/v1/admin/accounting/bridge-reconciliation/")
        candidate = next(row for row in response.data["results"] if row.get("bridge_candidate_id") == self.candidate_id)
        self.assertEqual(candidate["status"], "POSTED")
        self.assertFalse(candidate["can_post"])

    def test_post_rejects_locked_closed_missing_period_numbering_and_mapping_blockers(self):
        preview = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{self.candidate_id}/preview/").data

        self.prereqs["accounting_period"].status = AccountingPeriodStatus.LOCKED
        self.prereqs["accounting_period"].save(update_fields=["status", "updated_at"])
        locked = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{self.candidate_id}/post/", {"idempotency_key": preview["idempotency_key"], "confirm": True}, format="json")
        self.assertEqual(locked.status_code, status.HTTP_400_BAD_REQUEST)

        self.prereqs["accounting_period"].status = AccountingPeriodStatus.CLOSED
        self.prereqs["accounting_period"].save(update_fields=["status", "updated_at"])
        closed = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{self.candidate_id}/post/", {"idempotency_key": preview["idempotency_key"], "confirm": True}, format="json")
        self.assertEqual(closed.status_code, status.HTTP_400_BAD_REQUEST)

        self.prereqs["accounting_period"].status = AccountingPeriodStatus.OPEN
        self.prereqs["accounting_period"].save(update_fields=["status", "updated_at"])
        DocumentSequence.objects.filter(document_type=DocumentType.JOURNAL_ENTRY).update(is_active=False)
        missing_numbering = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{self.candidate_id}/post/", {"idempotency_key": preview["idempotency_key"], "confirm": True}, format="json")
        self.assertEqual(missing_numbering.status_code, status.HTTP_400_BAD_REQUEST)

        self.prereqs["journal_numbering_profile"].is_active = True
        self.prereqs["journal_numbering_profile"].save(update_fields=["is_active", "updated_at"])
        self.finance_account.chart_account.is_active = False
        self.finance_account.chart_account.save(update_fields=["is_active", "updated_at"])
        missing_mapping = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{self.candidate_id}/post/", {"idempotency_key": preview["idempotency_key"], "confirm": True}, format="json")
        self.assertEqual(missing_mapping.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(JournalEntry.objects.filter(source_model="Payment", source_id=str(self.payment.id), voucher_type="PAYMENT_COLLECTION").count(), 0)

    def test_post_rejects_missing_accounting_period(self):
        preview = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{self.candidate_id}/preview/").data
        self.prereqs["accounting_period"].delete()
        response = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{self.candidate_id}/post/", {"idempotency_key": preview["idempotency_key"], "confirm": True}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(JournalEntry.objects.filter(source_model="Payment", source_id=str(self.payment.id), voucher_type="PAYMENT_COLLECTION").count(), 0)

    def test_cashier_cannot_post_bridge_candidate(self):
        preview = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{self.candidate_id}/preview/").data
        self.client.force_authenticate(user=self.cashier)
        response = self.client.post(
            f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{self.candidate_id}/post/",
            {"idempotency_key": preview["idempotency_key"], "confirm": True},
            format="json",
        )
        self.assertIn(response.status_code, {status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN})

    def test_verify_clean_posted_item(self):
        preview = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{self.candidate_id}/preview/").data
        post_response = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{self.candidate_id}/post/", {"idempotency_key": preview["idempotency_key"], "confirm": True}, format="json")
        item_id = post_response.data["reconciliation_item"]["id"]
        response = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/items/{item_id}/verify/", {"note": "Checked", "run_id": 77}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        item = ReconciliationItem.objects.get(pk=item_id)
        self.assertEqual(item.status, ReconciliationItemStatus.MATCHED)
        self.assertEqual(item.resolved_by_id, self.admin.id)
        self.assertIsNotNone(item.resolved_at)
        self.assertEqual(item.metadata["verification_note"], "Checked")
        self.assertEqual(item.metadata["verification_run_id"], 77)

    def test_reconciliation_run_reports_unposted_posted_duplicate_and_amount_mismatch_payment(self):
        run = ReconciliationRun.objects.create(
            run_no=next_reconciliation_run_no(),
            scope="PHASE_F_TEST",
            module="ACCOUNTING_BRIDGE",
            date_from=self.payment.payment_date,
            date_to=self.payment.payment_date,
            status=ReconciliationRunStatus.RUNNING,
            started_by=self.admin,
        )
        totals = run_accounting_bridge_checks(run=run, totals={"checked": 0, "matched": 0, "exceptions": 0, "high_risk": 0})
        self.assertGreaterEqual(totals["exceptions"], 1)
        unposted = ReconciliationItem.objects.get(run=run, source_type="Payment", source_id=str(self.payment.id), exception_code="PAYMENT_MISSING_ACCOUNTING_BRIDGE_POSTING")
        self.assertEqual(unposted.metadata["bridge_status"], "NOT_POSTED")

        preview = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{self.candidate_id}/preview/").data
        post_response = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{self.candidate_id}/post/", {"idempotency_key": preview["idempotency_key"], "confirm": True}, format="json")
        journal = JournalEntry.objects.get(pk=post_response.data["journal_entry"]["id"])
        run2 = ReconciliationRun.objects.create(
            run_no=next_reconciliation_run_no(),
            scope="PHASE_F_TEST",
            module="ACCOUNTING_BRIDGE",
            date_from=self.payment.payment_date,
            date_to=self.payment.payment_date,
            status=ReconciliationRunStatus.RUNNING,
            started_by=self.admin,
        )
        run_accounting_bridge_checks(run=run2, totals={"checked": 0, "matched": 0, "exceptions": 0, "high_risk": 0})
        self.assertTrue(ReconciliationItem.objects.filter(run=run2, source_type="Payment", source_id=str(self.payment.id), exception_code="POSTED_UNVERIFIED").exists())

        first_debit = journal.lines.filter(debit_amount__gt=0).first()
        first_debit.debit_amount = Decimal("999.00")
        first_debit.save(update_fields=["debit_amount", "updated_at"])
        run3 = ReconciliationRun.objects.create(
            run_no=next_reconciliation_run_no(),
            scope="PHASE_F_TEST",
            module="ACCOUNTING_BRIDGE",
            date_from=self.payment.payment_date,
            date_to=self.payment.payment_date,
            status=ReconciliationRunStatus.RUNNING,
            started_by=self.admin,
        )
        run_accounting_bridge_checks(run=run3, totals={"checked": 0, "matched": 0, "exceptions": 0, "high_risk": 0})
        self.assertTrue(ReconciliationItem.objects.filter(run=run3, source_type="Payment", source_id=str(self.payment.id), status=ReconciliationItemStatus.AMOUNT_MISMATCH).exists())

    def test_reconciliation_read_model_keeps_posted_unverified_pending(self):
        preview = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{self.candidate_id}/preview/").data
        self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{self.candidate_id}/post/", {"idempotency_key": preview["idempotency_key"], "confirm": True}, format="json")
        payload = build_accounting_bridge_reconciliation(BridgeReconciliationFilters(source_model="Payment"))
        posted_rows = [row for row in payload["results"] if row.get("source_id") == str(self.payment.id) and row.get("status") == "POSTED"]
        self.assertTrue(posted_rows)
        self.assertGreaterEqual(payload["summary"]["posted_unreconciled_count"], 1)
