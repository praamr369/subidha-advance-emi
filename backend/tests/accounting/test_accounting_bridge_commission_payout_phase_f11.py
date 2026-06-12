from decimal import Decimal

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import AccountingBridgePosting, DocumentSequence, JournalEntry
from reconciliation.models import ReconciliationItem, ReconciliationItemStatus, ReconciliationRun, ReconciliationRunStatus
from reconciliation.services.accounting_bridge_reconciliation import run_accounting_bridge_checks
from reconciliation.services.run_numbering import next_reconciliation_run_no
from subscriptions.models import Commission, CommissionPayoutBatch, CommissionPayoutLine, CommissionStatus
from tests.accounting.helpers import seed_bridge_ready_environment
from tests.helpers import create_admin_user, create_cashier_user, create_partner_user


class AccountingBridgeCommissionPayoutPhaseF11Tests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="phase_f11_payout_admin", phone="9304911001")
        self.cashier = create_cashier_user(username="phase_f11_payout_cashier", phone="9304911002")
        self.partner = create_partner_user(username="phase_f11_partner", phone="9304911003")
        self.client.force_authenticate(user=self.admin)
        self.today = timezone.localdate()
        self.env = seed_bridge_ready_environment(self.today, performed_by=self.admin)

    def _commission(self, *, amount=Decimal("125.00"), status_value=CommissionStatus.SETTLED):
        return Commission.objects.create(
            partner=self.partner,
            commission_rate=Decimal("5.00"),
            commission_amount=amount,
            status=status_value,
            settlement_date=self.today if status_value == CommissionStatus.SETTLED else None,
            metadata={"phase": "F11"},
        )

    def _payout_batch(self, *, amount=Decimal("125.00"), status_value=CommissionPayoutBatch.Status.FINALIZED, finance_account=True):
        commission = self._commission(amount=amount)
        batch = CommissionPayoutBatch.objects.create(
            batch_code=f"CPB-F11-{commission.id}",
            payout_date=self.today,
            finance_account=self.env["finance_account"] if finance_account else None,
            reference_no=f"REF-F11-{commission.id}",
            processed_by=self.admin,
            status=status_value,
            total_amount=amount,
        )
        CommissionPayoutLine.objects.create(
            payout_batch=batch,
            commission=commission,
            partner=self.partner,
            amount=amount,
        )
        return batch, commission

    def _candidate_id(self, batch, event_key="partner_commission_payout"):
        return f"commissionpayoutbatch:{batch.id}:{event_key}"

    def _snapshot(self, batch, commission):
        batch.refresh_from_db()
        commission.refresh_from_db()
        return {
            "batch": {
                "batch_code": batch.batch_code,
                "payout_date": batch.payout_date,
                "finance_account_id": batch.finance_account_id,
                "reference_no": batch.reference_no,
                "processed_by_id": batch.processed_by_id,
                "status": batch.status,
                "notes": batch.notes,
                "total_amount": batch.total_amount,
            },
            "lines": list(batch.lines.order_by("id").values_list("id", "commission_id", "partner_id", "amount")),
            "commission": {
                "partner_id": commission.partner_id,
                "commission_rate": commission.commission_rate,
                "commission_amount": commission.commission_amount,
                "status": commission.status,
                "settlement_date": commission.settlement_date,
                "metadata": commission.metadata,
            },
        }

    def test_candidate_generation_for_finalized_payout_batch(self):
        batch, _commission = self._payout_batch()
        response = self.client.get("/api/v1/admin/accounting/bridge-reconciliation/?source_model=CommissionPayoutBatch")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        row = next(item for item in response.data["results"] if item.get("source_pk") == batch.id)
        self.assertEqual(row["source_model"], "CommissionPayoutBatch")
        self.assertEqual(row["event_key"], "partner_commission_payout")
        self.assertEqual(row["status"], "READY_UNPOSTED")
        self.assertEqual(row["payout_batch_code"], batch.batch_code)
        self.assertEqual(row["payout_status"], CommissionPayoutBatch.Status.FINALIZED)
        self.assertEqual(row["payout_amount"], "125.00")
        self.assertEqual(row["related_commission_count"], 1)
        self.assertTrue(row["can_preview"])
        self.assertTrue(row["can_post"])
        self.assertEqual(response.data["summary"]["commission_payout_ready_unposted_count"], 1)

    def test_draft_cancelled_zero_and_missing_finance_account_are_not_postable(self):
        draft, _ = self._payout_batch(status_value=CommissionPayoutBatch.Status.DRAFT)
        cancelled, _ = self._payout_batch(status_value=CommissionPayoutBatch.Status.CANCELLED)
        zero, _ = self._payout_batch(amount=Decimal("0.00"))
        missing_finance, _ = self._payout_batch(finance_account=False)
        response = self.client.get("/api/v1/admin/accounting/bridge-reconciliation/?source_model=CommissionPayoutBatch")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        rows = {item["source_pk"]: item for item in response.data["results"] if item.get("source_model") == "CommissionPayoutBatch" and item.get("source_pk")}
        self.assertEqual(rows[draft.id]["status"], "BLOCKED_BY_APPROVAL")
        self.assertEqual(rows[cancelled.id]["status"], "SKIPPED_NOT_APPLICABLE")
        self.assertEqual(rows[zero.id]["status"], "UNSUPPORTED_SOURCE")
        self.assertEqual(rows[missing_finance.id]["status"], "BLOCKED_BY_MAPPING")
        self.assertFalse(rows[draft.id]["can_post"])
        self.assertFalse(rows[missing_finance.id]["can_post"])

    def test_preview_is_read_only_and_uses_payable_to_finance_account_lines(self):
        batch, commission = self._payout_batch()
        before = {
            "source": self._snapshot(batch, commission),
            "journals": JournalEntry.objects.count(),
            "bridge": AccountingBridgePosting.objects.count(),
            "items": ReconciliationItem.objects.count(),
            "next_number": DocumentSequence.objects.get(pk=self.env["journal_numbering_profile"].pk).next_number,
        }
        response = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{self._candidate_id(batch)}/preview/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["source"]["model"], "CommissionPayoutBatch")
        self.assertEqual(response.data["source"]["payout_status"], CommissionPayoutBatch.Status.FINALIZED)
        self.assertEqual(response.data["source"]["related_commission_count"], 1)
        self.assertEqual(response.data["total_debit"], "125.00")
        self.assertEqual(response.data["total_credit"], "125.00")
        self.assertTrue(response.data["is_balanced"])
        self.assertIn("does not edit commission, payout, partner, or payment records", response.data["safety_text"])
        self.assertEqual(response.data["debit_lines"][0]["chart_account"]["name"], "Partner Commission Payable")
        self.assertEqual(response.data["credit_lines"][0]["chart_account"]["name"], self.env["finance_account"].chart_account.name)
        after = {
            "source": self._snapshot(batch, commission),
            "journals": JournalEntry.objects.count(),
            "bridge": AccountingBridgePosting.objects.count(),
            "items": ReconciliationItem.objects.count(),
            "next_number": DocumentSequence.objects.get(pk=self.env["journal_numbering_profile"].pk).next_number,
        }
        self.assertEqual(after, before)

    def test_post_creates_journal_bridge_pending_item_and_does_not_mutate_payout_or_commission(self):
        batch, commission = self._payout_batch()
        before_source = self._snapshot(batch, commission)
        candidate_id = self._candidate_id(batch)
        preview = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/preview/").data
        next_before = DocumentSequence.objects.get(pk=self.env["journal_numbering_profile"].pk).next_number
        response = self.client.post(
            f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/",
            {"idempotency_key": preview["idempotency_key"], "confirm": True, "posting_note": "F11 payout settlement test"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertTrue(response.data["posted"])
        self.assertEqual(AccountingBridgePosting.objects.filter(source_model="CommissionPayoutBatch", source_id=str(batch.id), purpose="PARTNER_COMMISSION_PAYOUT").count(), 1)
        journal = JournalEntry.objects.get(pk=response.data["journal_entry"]["id"])
        self.assertEqual(journal.source_model, "CommissionPayoutBatch")
        self.assertEqual(journal.source_id, str(batch.id))
        self.assertEqual(journal.voucher_type, "PARTNER_COMMISSION_PAYOUT")
        self.assertEqual(DocumentSequence.objects.get(pk=self.env["journal_numbering_profile"].pk).next_number, next_before + 1)
        item = ReconciliationItem.objects.get(source_type="CommissionPayoutBatch", source_id=str(batch.id), exception_code="POSTED_UNVERIFIED")
        self.assertEqual(item.status, ReconciliationItemStatus.NEEDS_REVIEW)
        self.assertEqual(self._snapshot(batch, commission), before_source)

        duplicate = self.client.post(
            f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/",
            {"idempotency_key": preview["idempotency_key"], "confirm": True},
            format="json",
        )
        self.assertEqual(duplicate.status_code, status.HTTP_200_OK, duplicate.data)
        self.assertFalse(duplicate.data["posted"])

        self.client.force_authenticate(user=self.cashier)
        non_admin = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", {"idempotency_key": preview["idempotency_key"], "confirm": True}, format="json")
        self.assertIn(non_admin.status_code, {status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN})

    def test_reconciliation_run_detects_missing_and_posted_unverified_payout_batch(self):
        batch, _commission = self._payout_batch(amount=Decimal("90.00"))
        run = ReconciliationRun.objects.create(run_no=next_reconciliation_run_no(), scope="PHASE_F11_TEST", module="ACCOUNTING_BRIDGE", date_from=self.today, date_to=self.today, status=ReconciliationRunStatus.RUNNING, started_by=self.admin)
        run_accounting_bridge_checks(run=run, totals={"checked": 0, "matched": 0, "exceptions": 0, "high_risk": 0})
        missing_item = ReconciliationItem.objects.get(run=run, source_type="CommissionPayoutBatch", source_id=str(batch.id), exception_code="COMMISSION_PAYOUT_MISSING_ACCOUNTING_BRIDGE_POSTING")
        self.assertEqual(missing_item.status, ReconciliationItemStatus.MISSING_SOURCE)

        candidate_id = self._candidate_id(batch)
        preview = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/preview/").data
        post = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", {"idempotency_key": preview["idempotency_key"], "confirm": True}, format="json")
        self.assertEqual(post.status_code, status.HTTP_200_OK, post.data)

        run2 = ReconciliationRun.objects.create(run_no=next_reconciliation_run_no(), scope="PHASE_F11_TEST_POSTED", module="ACCOUNTING_BRIDGE", date_from=self.today, date_to=self.today, status=ReconciliationRunStatus.RUNNING, started_by=self.admin)
        run_accounting_bridge_checks(run=run2, totals={"checked": 0, "matched": 0, "exceptions": 0, "high_risk": 0})
        self.assertTrue(ReconciliationItem.objects.filter(run=run2, source_type="CommissionPayoutBatch", source_id=str(batch.id), exception_code="POSTED_UNVERIFIED").exists())
