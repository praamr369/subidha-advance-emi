from decimal import Decimal

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import AccountingBridgePosting, AccountingPeriodStatus, AccountingPostingProfile, DocumentSequence, JournalEntry
from accounting.services.document_sequence_service import DocumentType
from reconciliation.models import ReconciliationItem, ReconciliationItemStatus, ReconciliationRun, ReconciliationRunStatus
from reconciliation.services.accounting_bridge_reconciliation import run_accounting_bridge_checks
from reconciliation.services.run_numbering import next_reconciliation_run_no
from subscriptions.models import Commission, CommissionPayoutLine, CommissionStatus
from tests.accounting.helpers import seed_bridge_ready_environment
from tests.helpers import create_admin_user, create_cashier_user, create_partner_user


class AccountingBridgeCommissionAccrualPhaseF10Tests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="phase_f10_commission_admin", phone="9304901001")
        self.cashier = create_cashier_user(username="phase_f10_commission_cashier", phone="9304901002")
        self.partner = create_partner_user(username="phase_f10_partner", phone="9304901003")
        self.client.force_authenticate(user=self.admin)
        self.today = timezone.localdate()
        self.env = seed_bridge_ready_environment(self.today, performed_by=self.admin)

    def _commission(self, *, amount=Decimal("125.00"), status_value=CommissionStatus.PENDING):
        return Commission.objects.create(
            partner=self.partner,
            commission_rate=Decimal("5.00"),
            commission_amount=amount,
            status=status_value,
            metadata={"phase": "F10"},
        )

    def _candidate_id(self, commission, event_key="commission_accrual"):
        return f"commission:{commission.id}:{event_key}"

    def _snapshot(self, commission):
        commission.refresh_from_db()
        return {
            "partner_id": commission.partner_id,
            "subscription_id": commission.subscription_id,
            "payment_id": commission.payment_id,
            "emi_id": commission.emi_id,
            "commission_rate": commission.commission_rate,
            "commission_amount": commission.commission_amount,
            "status": commission.status,
            "settlement_date": commission.settlement_date,
            "reversal_reason": commission.reversal_reason,
            "metadata": commission.metadata,
            "payout_lines": CommissionPayoutLine.objects.filter(commission=commission).count(),
        }

    def test_candidate_generation_for_concrete_commission(self):
        commission = self._commission()
        response = self.client.get("/api/v1/admin/accounting/bridge-reconciliation/?source_model=Commission")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        row = next(item for item in response.data["results"] if item.get("source_pk") == commission.id)
        self.assertEqual(row["source_model"], "Commission")
        self.assertEqual(row["event_key"], "commission_accrual")
        self.assertEqual(row["status"], "READY_UNPOSTED")
        self.assertEqual(row["commission_reference"], f"COMM-{commission.id}")
        self.assertEqual(row["partner_name"], self.partner.get_full_name())
        self.assertEqual(row["commission_status"], CommissionStatus.PENDING)
        self.assertEqual(row["amount"], "125.00")
        self.assertTrue(row["can_preview"])
        self.assertTrue(row["can_post"])
        self.assertEqual(response.data["summary"]["commission_ready_unposted_count"], 1)

    def test_settled_reversed_and_zero_commissions_are_not_postable(self):
        settled = self._commission(status_value=CommissionStatus.SETTLED)
        reversed_row = self._commission(status_value=CommissionStatus.REVERSED)
        zero = self._commission(amount=Decimal("0.00"))
        response = self.client.get("/api/v1/admin/accounting/bridge-reconciliation/?source_model=Commission")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        rows = {item["source_pk"]: item for item in response.data["results"] if item.get("source_model") == "Commission" and item.get("source_pk")}
        self.assertEqual(rows[settled.id]["status"], "SKIPPED_NOT_APPLICABLE")
        self.assertEqual(rows[reversed_row.id]["status"], "SKIPPED_NOT_APPLICABLE")
        self.assertEqual(rows[zero.id]["status"], "UNSUPPORTED_SOURCE")
        self.assertFalse(rows[settled.id]["can_post"])
        self.assertFalse(rows[zero.id]["can_post"])

    def test_preview_is_read_only_and_balanced_without_number_consumption(self):
        commission = self._commission()
        before = {
            "source": self._snapshot(commission),
            "journals": JournalEntry.objects.count(),
            "bridge": AccountingBridgePosting.objects.count(),
            "items": ReconciliationItem.objects.count(),
            "next_number": DocumentSequence.objects.get(pk=self.env["journal_numbering_profile"].pk).next_number,
        }
        response = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{self._candidate_id(commission)}/preview/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["source"]["model"], "Commission")
        self.assertEqual(response.data["source"]["partner_name"], self.partner.get_full_name())
        self.assertEqual(response.data["total_debit"], "125.00")
        self.assertEqual(response.data["total_credit"], "125.00")
        self.assertTrue(response.data["is_balanced"])
        self.assertIn("does not edit commission or payout records", response.data["safety_text"])
        self.assertEqual(response.data["debit_lines"][0]["chart_account"]["name"], "Partner Commission Expense")
        self.assertEqual(response.data["credit_lines"][0]["chart_account"]["name"], "Partner Commission Payable")
        after = {
            "source": self._snapshot(commission),
            "journals": JournalEntry.objects.count(),
            "bridge": AccountingBridgePosting.objects.count(),
            "items": ReconciliationItem.objects.count(),
            "next_number": DocumentSequence.objects.get(pk=self.env["journal_numbering_profile"].pk).next_number,
        }
        self.assertEqual(after, before)

    def test_post_creates_journal_bridge_pending_item_and_does_not_mutate_source_or_payout(self):
        commission = self._commission()
        before_source = self._snapshot(commission)
        candidate_id = self._candidate_id(commission)
        preview = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/preview/").data
        next_before = DocumentSequence.objects.get(pk=self.env["journal_numbering_profile"].pk).next_number
        response = self.client.post(
            f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/",
            {"idempotency_key": preview["idempotency_key"], "confirm": True, "posting_note": "F10 commission accrual test"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertTrue(response.data["posted"])
        self.assertEqual(AccountingBridgePosting.objects.filter(source_model="Commission", source_id=str(commission.id), purpose="COMMISSION_ACCRUAL").count(), 1)
        journal = JournalEntry.objects.get(pk=response.data["journal_entry"]["id"])
        self.assertEqual(journal.source_model, "Commission")
        self.assertEqual(journal.source_id, str(commission.id))
        self.assertEqual(journal.voucher_type, "COMMISSION_ACCRUAL")
        self.assertEqual(DocumentSequence.objects.get(pk=self.env["journal_numbering_profile"].pk).next_number, next_before + 1)
        item = ReconciliationItem.objects.get(source_type="Commission", source_id=str(commission.id), exception_code="POSTED_UNVERIFIED")
        self.assertEqual(item.status, ReconciliationItemStatus.NEEDS_REVIEW)
        self.assertEqual(self._snapshot(commission), before_source)
        self.assertEqual(CommissionPayoutLine.objects.filter(commission=commission).count(), 0)

    def test_idempotency_duplicate_key_missing_setup_blockers_and_non_admin(self):
        commission = self._commission()
        candidate_id = self._candidate_id(commission)
        preview = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/preview/").data
        payload = {"idempotency_key": preview["idempotency_key"], "confirm": True}
        first = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", payload, format="json")
        second = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", payload, format="json")
        duplicate = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", {"idempotency_key": "different-key", "confirm": True}, format="json")
        self.assertEqual(first.status_code, status.HTTP_200_OK, first.data)
        self.assertEqual(second.status_code, status.HTTP_200_OK, second.data)
        self.assertFalse(second.data["posted"])
        self.assertEqual(duplicate.status_code, status.HTTP_400_BAD_REQUEST)

        blocked = self._commission(amount=Decimal("75.00"))
        blocked_id = self._candidate_id(blocked)
        AccountingPostingProfile.objects.filter(key="COMMISSION_EXPENSE").update(is_active=False)
        missing_mapping = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{blocked_id}/post/", {"idempotency_key": "x", "confirm": True}, format="json")
        self.assertEqual(missing_mapping.status_code, status.HTTP_400_BAD_REQUEST)

        AccountingPostingProfile.objects.filter(key="COMMISSION_EXPENSE").update(is_active=True)
        self.env["accounting_period"].status = AccountingPeriodStatus.LOCKED
        self.env["accounting_period"].is_locked = True
        self.env["accounting_period"].save(update_fields=["status", "is_locked", "updated_at"])
        locked_preview = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{blocked_id}/preview/").data
        locked = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{blocked_id}/post/", {"idempotency_key": locked_preview["idempotency_key"], "confirm": True}, format="json")
        self.assertEqual(locked.status_code, status.HTTP_400_BAD_REQUEST)

        self.env["accounting_period"].status = AccountingPeriodStatus.OPEN
        self.env["accounting_period"].is_locked = False
        self.env["accounting_period"].save(update_fields=["status", "is_locked", "updated_at"])
        DocumentSequence.objects.filter(document_type=DocumentType.JOURNAL_ENTRY).update(is_active=False)
        missing_numbering = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{blocked_id}/post/", {"idempotency_key": locked_preview["idempotency_key"], "confirm": True}, format="json")
        self.assertEqual(missing_numbering.status_code, status.HTTP_400_BAD_REQUEST)

        self.client.force_authenticate(user=self.cashier)
        non_admin = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", payload, format="json")
        self.assertIn(non_admin.status_code, {status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN})

    def test_batch_post_verify_and_reconciliation_run_diagnostics(self):
        commission = self._commission(amount=Decimal("90.00"))
        run = ReconciliationRun.objects.create(run_no=next_reconciliation_run_no(), scope="PHASE_F10_TEST", module="ACCOUNTING_BRIDGE", date_from=self.today, date_to=self.today, status=ReconciliationRunStatus.RUNNING, started_by=self.admin)
        run_accounting_bridge_checks(run=run, totals={"checked": 0, "matched": 0, "exceptions": 0, "high_risk": 0})
        missing_item = ReconciliationItem.objects.get(run=run, source_type="Commission", source_id=str(commission.id), exception_code="COMMISSION_MISSING_ACCOUNTING_BRIDGE_POSTING")
        missing_item.status = ReconciliationItemStatus.RESOLVED
        missing_item.save(update_fields=["status", "updated_at"])

        candidate_id = self._candidate_id(commission)
        batch_preview = self.client.post("/api/v1/admin/accounting/bridge-reconciliation/batch-preview/", {"candidate_ids": [candidate_id]}, format="json")
        self.assertEqual(batch_preview.status_code, status.HTTP_200_OK, batch_preview.data)
        key = batch_preview.data["previews"][0]["idempotency_key"]
        before_source = self._snapshot(commission)
        batch_post = self.client.post("/api/v1/admin/accounting/bridge-reconciliation/batch-post/", {"candidate_ids": [candidate_id], "idempotency_keys": {candidate_id: key}, "confirm": True}, format="json")
        self.assertEqual(batch_post.status_code, status.HTTP_200_OK, batch_post.data)
        item_id = batch_post.data["posted"][0]["reconciliation_item"]["id"]
        self.assertEqual(self._snapshot(commission), before_source)

        verify = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/items/{item_id}/verify/", {"note": "verified"}, format="json")
        self.assertEqual(verify.status_code, status.HTTP_200_OK, verify.data)
        self.assertEqual(ReconciliationItem.objects.get(pk=item_id).status, ReconciliationItemStatus.MATCHED)
        self.assertEqual(self._snapshot(commission), before_source)

        run2 = ReconciliationRun.objects.create(run_no=next_reconciliation_run_no(), scope="PHASE_F10_TEST_POSTED", module="ACCOUNTING_BRIDGE", date_from=self.today, date_to=self.today, status=ReconciliationRunStatus.RUNNING, started_by=self.admin)
        run_accounting_bridge_checks(run=run2, totals={"checked": 0, "matched": 0, "exceptions": 0, "high_risk": 0})
        self.assertTrue(ReconciliationItem.objects.filter(run=run2, source_type="Commission", source_id=str(commission.id), exception_code="POSTED_UNVERIFIED").exists())
