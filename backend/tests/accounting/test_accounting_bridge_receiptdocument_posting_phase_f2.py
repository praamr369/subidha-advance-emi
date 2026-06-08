from decimal import Decimal

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import AccountingBridgePosting, AccountingPeriodStatus, DocumentSequence, JournalEntry
from accounting.services.document_sequence_service import DocumentType
from billing.models import BillingDocumentStatus, BillingSourceType, ReceiptDocument, ReceiptType
from reconciliation.models import ReconciliationItem, ReconciliationItemStatus
from tests.accounting.helpers import seed_bridge_ready_environment
from tests.helpers import create_admin_user, create_cashier_user


class AccountingBridgeReceiptDocumentPostingPhaseF2Tests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="phase_f2_receipt_admin", phone="9304800101")
        self.cashier = create_cashier_user(username="phase_f2_receipt_cashier", phone="9304800102")
        self.client.force_authenticate(user=self.admin)
        self.today = timezone.localdate()
        self.env = seed_bridge_ready_environment(self.today, performed_by=self.admin)
        self.finance_account = self.env["finance_account"]

    def _receipt(self, *, receipt_no="F2-RCT-001", source_type=BillingSourceType.DIRECT_SALE, amount=Decimal("800.00"), status_value=BillingDocumentStatus.APPROVED):
        return ReceiptDocument.objects.create(
            receipt_no=receipt_no,
            receipt_type=ReceiptType.RETAIL_RECEIPT,
            status=status_value,
            receipt_date=self.today,
            source_type=source_type,
            source_reference=receipt_no,
            amount=amount,
            finance_account=self.finance_account,
        )

    def _candidate_id(self, receipt, event_key):
        return f"receiptdocument:{receipt.id}:{event_key}"

    def _snapshot(self, receipt):
        receipt.refresh_from_db()
        return {
            "receipt_no": receipt.receipt_no,
            "receipt_type": receipt.receipt_type,
            "status": receipt.status,
            "amount": receipt.amount,
            "finance_account_id": receipt.finance_account_id,
            "posted_journal_entry_id": receipt.posted_journal_entry_id,
            "source_type": receipt.source_type,
            "source_reference": receipt.source_reference,
        }

    def test_candidate_generation_for_concrete_receiptdocument(self):
        receipt = self._receipt(receipt_no="F2-RCT-GEN")
        response = self.client.get("/api/v1/admin/accounting/bridge-reconciliation/?source_model=ReceiptDocument")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        row = next(item for item in response.data["results"] if item.get("source_pk") == receipt.id)
        self.assertEqual(row["source_model"], "ReceiptDocument")
        self.assertEqual(row["event_key"], "direct_sale_receipt")
        self.assertEqual(row["status"], "READY_UNPOSTED")
        self.assertTrue(row["can_preview"])
        self.assertTrue(row["can_post"])

    def test_preview_is_read_only_and_does_not_consume_numbering(self):
        receipt = self._receipt(receipt_no="F2-RCT-PREV")
        candidate_id = self._candidate_id(receipt, "direct_sale_receipt")
        before = {
            "receipt": self._snapshot(receipt),
            "journals": JournalEntry.objects.count(),
            "bridge": AccountingBridgePosting.objects.count(),
            "items": ReconciliationItem.objects.count(),
            "next_number": DocumentSequence.objects.get(pk=self.env["journal_numbering_profile"].pk).next_number,
        }
        response = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/preview/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["source"]["model"], "ReceiptDocument")
        self.assertEqual(response.data["source"]["pk"], receipt.id)
        self.assertEqual(response.data["total_debit"], "800.00")
        self.assertEqual(response.data["total_credit"], "800.00")
        self.assertTrue(response.data["is_balanced"])
        after = {
            "receipt": self._snapshot(receipt),
            "journals": JournalEntry.objects.count(),
            "bridge": AccountingBridgePosting.objects.count(),
            "items": ReconciliationItem.objects.count(),
            "next_number": DocumentSequence.objects.get(pk=self.env["journal_numbering_profile"].pk).next_number,
        }
        self.assertEqual(after, before)

    def test_customer_advance_preview_is_balanced(self):
        receipt = self._receipt(receipt_no="F2-RCT-ADV", source_type=BillingSourceType.MANUAL, amount=Decimal("500.00"))
        response = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{self._candidate_id(receipt, 'customer_advance')}/preview/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["candidate"]["event_key"], "customer_advance")
        self.assertEqual(response.data["total_debit"], "500.00")
        self.assertEqual(response.data["total_credit"], "500.00")
        self.assertTrue(response.data["can_post"])

    def test_direct_sale_receipt_post_creates_journal_bridge_and_pending_item(self):
        receipt = self._receipt(receipt_no="F2-RCT-POST")
        candidate_id = self._candidate_id(receipt, "direct_sale_receipt")
        before_receipt = self._snapshot(receipt)
        preview = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/preview/").data
        next_before = DocumentSequence.objects.get(pk=self.env["journal_numbering_profile"].pk).next_number
        response = self.client.post(
            f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/",
            {"idempotency_key": preview["idempotency_key"], "confirm": True, "posting_note": "F2 receipt test"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertTrue(response.data["posted"])
        self.assertEqual(AccountingBridgePosting.objects.filter(source_model="ReceiptDocument", source_id=str(receipt.id), purpose="DIRECT_SALE_RECEIPT").count(), 1)
        journal = JournalEntry.objects.get(pk=response.data["journal_entry"]["id"])
        self.assertEqual(journal.source_model, "ReceiptDocument")
        self.assertEqual(journal.source_id, str(receipt.id))
        self.assertEqual((journal.trace_metadata or {}).get("event_key"), None)
        bridge = AccountingBridgePosting.objects.get(source_model="ReceiptDocument", source_id=str(receipt.id), purpose="DIRECT_SALE_RECEIPT")
        self.assertEqual((bridge.trace_metadata or {}).get("event_key"), "direct_sale_receipt")
        self.assertEqual(DocumentSequence.objects.get(pk=self.env["journal_numbering_profile"].pk).next_number, next_before + 1)
        item = ReconciliationItem.objects.get(source_type="ReceiptDocument", source_id=str(receipt.id), exception_code="POSTED_UNVERIFIED")
        self.assertEqual(item.status, ReconciliationItemStatus.NEEDS_REVIEW)
        self.assertEqual(self._snapshot(receipt), before_receipt)

    def test_customer_advance_post_creates_one_journal(self):
        receipt = self._receipt(receipt_no="F2-RCT-ADVPOST", source_type=BillingSourceType.MANUAL, amount=Decimal("700.00"))
        candidate_id = self._candidate_id(receipt, "customer_advance")
        preview = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/preview/").data
        response = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", {"idempotency_key": preview["idempotency_key"], "confirm": True}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(JournalEntry.objects.filter(source_model="ReceiptDocument", source_id=str(receipt.id), voucher_type="CUSTOMER_ADVANCE").count(), 1)

    def test_same_idempotency_key_is_idempotent_and_different_key_rejects(self):
        receipt = self._receipt(receipt_no="F2-RCT-IDEMP")
        candidate_id = self._candidate_id(receipt, "direct_sale_receipt")
        preview = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/preview/").data
        payload = {"idempotency_key": preview["idempotency_key"], "confirm": True}
        first = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", payload, format="json")
        second = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", payload, format="json")
        self.assertEqual(first.status_code, status.HTTP_200_OK, first.data)
        self.assertEqual(second.status_code, status.HTTP_200_OK, second.data)
        self.assertFalse(second.data["posted"])
        duplicate = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", {"idempotency_key": "different-key", "confirm": True}, format="json")
        self.assertEqual(duplicate.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(JournalEntry.objects.filter(source_model="ReceiptDocument", source_id=str(receipt.id)).count(), 1)

    def test_verify_clean_posted_receipt_item_marks_reconciled(self):
        receipt = self._receipt(receipt_no="F2-RCT-VERIFY")
        candidate_id = self._candidate_id(receipt, "direct_sale_receipt")
        preview = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/preview/").data
        post_response = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", {"idempotency_key": preview["idempotency_key"], "confirm": True}, format="json")
        item_id = post_response.data["reconciliation_item"]["id"]
        response = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/items/{item_id}/verify/", {"note": "verified"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        item = ReconciliationItem.objects.get(pk=item_id)
        self.assertEqual(item.status, ReconciliationItemStatus.MATCHED)
        row = self.client.get("/api/v1/admin/accounting/bridge-reconciliation/?source_model=ReceiptDocument").data["results"]
        matched = next(item for item in row if item.get("source_pk") == receipt.id)
        self.assertEqual(matched["status"], "RECONCILED")

    def test_non_admin_cannot_post_receipt_candidate(self):
        receipt = self._receipt(receipt_no="F2-RCT-NONADMIN")
        candidate_id = self._candidate_id(receipt, "direct_sale_receipt")
        preview = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/preview/").data
        self.client.force_authenticate(user=self.cashier)
        response = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", {"idempotency_key": preview["idempotency_key"], "confirm": True}, format="json")
        self.assertIn(response.status_code, {status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN})

    def test_locked_period_missing_numbering_and_unsupported_receipt_reject(self):
        receipt = self._receipt(receipt_no="F2-RCT-BLOCK")
        candidate_id = self._candidate_id(receipt, "direct_sale_receipt")
        preview = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/preview/").data
        self.env["accounting_period"].status = AccountingPeriodStatus.LOCKED
        self.env["accounting_period"].is_locked = True
        self.env["accounting_period"].save(update_fields=["status", "is_locked", "updated_at"])
        locked = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", {"idempotency_key": preview["idempotency_key"], "confirm": True}, format="json")
        self.assertEqual(locked.status_code, status.HTTP_400_BAD_REQUEST)
        self.env["accounting_period"].status = AccountingPeriodStatus.OPEN
        self.env["accounting_period"].is_locked = False
        self.env["accounting_period"].save(update_fields=["status", "is_locked", "updated_at"])
        DocumentSequence.objects.filter(document_type=DocumentType.JOURNAL_ENTRY).update(is_active=False)
        missing_numbering = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", {"idempotency_key": preview["idempotency_key"], "confirm": True}, format="json")
        self.assertEqual(missing_numbering.status_code, status.HTTP_400_BAD_REQUEST)
        unsupported = self._receipt(receipt_no="F2-RCT-UNSUP", source_type=BillingSourceType.DELIVERY)
        unsupported_id = self._candidate_id(unsupported, "unsupported_receipt")
        unsupported_post = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{unsupported_id}/post/", {"idempotency_key": "x", "confirm": True}, format="json")
        self.assertEqual(unsupported_post.status_code, status.HTTP_400_BAD_REQUEST)

    def test_batch_preview_and_post_receipts_are_explicit(self):
        first = self._receipt(receipt_no="F2-RCT-BATCH1")
        second = self._receipt(receipt_no="F2-RCT-BATCH2", source_type=BillingSourceType.MANUAL)
        ids = [self._candidate_id(first, "direct_sale_receipt"), self._candidate_id(second, "customer_advance")]
        preview = self.client.post("/api/v1/admin/accounting/bridge-reconciliation/batch-preview/", {"candidate_ids": ids}, format="json")
        self.assertEqual(preview.status_code, status.HTTP_200_OK, preview.data)
        self.assertEqual(preview.data["postable_count"], 2)
        keys = {item["candidate_id"]: item["idempotency_key"] for item in preview.data["previews"]}
        post = self.client.post("/api/v1/admin/accounting/bridge-reconciliation/batch-post/", {"candidate_ids": ids, "idempotency_keys": keys, "confirm": True}, format="json")
        self.assertEqual(post.status_code, status.HTTP_200_OK, post.data)
        self.assertEqual(post.data["posted_count"], 2)
        duplicate = self.client.post("/api/v1/admin/accounting/bridge-reconciliation/batch-post/", {"candidate_ids": ids, "idempotency_keys": keys, "confirm": True}, format="json")
        self.assertEqual(duplicate.status_code, status.HTTP_200_OK, duplicate.data)
        self.assertEqual(duplicate.data["already_posted_count"], 2)
        self.assertEqual(JournalEntry.objects.filter(source_model="ReceiptDocument").count(), 2)
