from decimal import Decimal

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import AccountingBridgePosting, DocumentSequence, JournalEntry, JournalEntryStatus
from accounting.services.setup_defaults_service import apply_accounting_setup_defaults
from reconciliation.models import ReconciliationItem, ReconciliationItemStatus
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
        after = {
            "journals": JournalEntry.objects.count(),
            "bridge": AccountingBridgePosting.objects.count(),
            "items": ReconciliationItem.objects.count(),
            "next_number": DocumentSequence.objects.get(pk=self.prereqs["journal_numbering_profile"].pk).next_number,
        }
        self.assertEqual(after, before)

    def test_explicit_post_creates_one_journal_and_pending_reconciliation_item(self):
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

    def test_duplicate_post_different_key_rejects(self):
        preview = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{self.candidate_id}/preview/").data
        self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{self.candidate_id}/post/", {"idempotency_key": preview["idempotency_key"], "confirm": True}, format="json")
        response = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{self.candidate_id}/post/", {"idempotency_key": "different-key", "confirm": True}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(JournalEntry.objects.filter(source_model="Payment", source_id=str(self.payment.id), voucher_type="PAYMENT_COLLECTION").count(), 1)

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
        response = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/items/{item_id}/verify/", {"note": "Checked"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        item = ReconciliationItem.objects.get(pk=item_id)
        self.assertEqual(item.status, ReconciliationItemStatus.MATCHED)
        self.assertEqual(item.resolved_by_id, self.admin.id)
