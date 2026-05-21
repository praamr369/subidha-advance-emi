from __future__ import annotations

from datetime import date
from decimal import Decimal

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import AccountingBridgePosting, JournalEntry, JournalEntryGroup, JournalEntryStatus, JournalEntryType
from billing.models import BillingDocumentStatus, ReceiptDocument, ReceiptType
from branch_control.models import Branch
from reconciliation.models import ReconciliationItem, ReconciliationResolution, ReconciliationRun
from subscriptions.models import EmiStatus, Payment
from tests.helpers import (
    create_admin_user,
    create_cashier_user,
    create_customer_profile,
    create_customer_user,
    create_emi,
    create_partner_user,
    create_product,
    create_subscription,
    create_batch,
    create_lucky_id,
)


class AdminReconciliationControlTowerPhaseFTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="admin_phase_f", phone="9010000001")
        self.partner = create_partner_user(username="partner_phase_f", phone="9010000002")
        self.cashier = create_cashier_user(username="cashier_phase_f", phone="9010000003")
        self.customer_user = create_customer_user(username="customer_phase_f", phone="9010000004")

        self.branch = Branch.objects.order_by("id").first()

        self.customer = create_customer_profile(user=self.customer_user, name="PhaseF Customer", phone="9010000100")
        self.product = create_product(name="PhaseF Product", product_code="PHF-001", base_price=Decimal("1000.00"))
        self.batch = create_batch(batch_code="PHFAPR2026", duration_months=1, total_slots=100, draw_day=5, start_date=date(2026, 3, 1))
        self.lucky_id = create_lucky_id(batch=self.batch, lucky_number=1)
        self.subscription = create_subscription(
            customer=self.customer,
            product=self.product,
            batch=self.batch,
            lucky_id=self.lucky_id,
            total_amount=Decimal("1000.00"),
            monthly_amount=Decimal("1000.00"),
            tenure_months=1,
        )
        self.emi = create_emi(subscription=self.subscription, month_no=1, amount=Decimal("1000.00"), due_date=date(2026, 3, 8))

    def test_admin_only_runs_endpoint(self):
        endpoint = "/api/v1/admin/reconciliation/runs/"

        for user in (self.partner, self.cashier, self.customer_user):
            self.client.force_authenticate(user=user)
            resp = self.client.post(endpoint, data={"date_from": "2026-03-01", "date_to": "2026-03-31"}, format="json")
            self.assertIn(resp.status_code, {status.HTTP_403_FORBIDDEN, status.HTTP_401_UNAUTHORIZED})

        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(endpoint, data={"date_from": "2026-03-01", "date_to": "2026-03-31"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

    def test_resolve_requires_note(self):
        self.client.force_authenticate(user=self.admin)
        run = ReconciliationRun.objects.create(
            run_no=1,
            scope="PHASE_F",
            module="CONTROL_TOWER",
            branch=self.branch,
            status="COMPLETED",
            started_by=self.admin,
        )
        item = ReconciliationItem.objects.create(
            run=run,
            module="EMI_PHASE_F",
            source_type="Payment",
            source_id="1",
            source_label="PAY-1",
            exception_code="TEST",
            status="NEEDS_REVIEW",
            severity="MEDIUM",
        )

        resp = self.client.post(f"/api/v1/admin/reconciliation/items/{item.id}/resolve/", data={"action": "MARK_REVIEWED", "note": ""}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_resolve_creates_resolution_and_does_not_mutate_sources(self):
        self.client.force_authenticate(user=self.admin)

        payment = Payment.objects.create(
            customer=self.customer,
            subscription=self.subscription,
            emi=self.emi,
            amount=Decimal("1000.00"),
            method="CASH",
            reference_no="PHF-PAY-001",
            payment_date=date(2026, 3, 8),
            branch=self.branch,
        )
        journal = JournalEntry.objects.create(
            entry_date=date(2026, 3, 8),
            entry_type=JournalEntryType.SYSTEM_BRIDGE,
            status=JournalEntryStatus.DRAFT,
            memo="Test",
            source_model="Payment",
            source_id=str(payment.id),
        )

        run = ReconciliationRun.objects.create(
            run_no=2,
            scope="PHASE_F",
            module="CONTROL_TOWER",
            branch=self.branch,
            status="COMPLETED",
            started_by=self.admin,
        )
        item = ReconciliationItem.objects.create(
            run=run,
            module="ACCOUNTING_BRIDGE_PHASE_F",
            source_type="Payment",
            source_id=str(payment.id),
            source_label="PHF-PAY-001",
            exception_code="PAYMENT_MISSING_RECEIPT_DOCUMENT",
            status="NEEDS_REVIEW",
            severity="HIGH",
        )

        resp = self.client.post(
            f"/api/v1/admin/reconciliation/items/{item.id}/resolve/",
            data={"action": "MARK_REVIEWED", "note": "Reviewed; will investigate."},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertTrue(ReconciliationResolution.objects.filter(item=item).exists())

        payment.refresh_from_db()
        journal.refresh_from_db()
        self.assertEqual(payment.amount, Decimal("1000.00"))
        self.assertEqual(payment.emi_id, self.emi.id)
        self.assertEqual(journal.source_model, "Payment")
        self.assertEqual(journal.source_id, str(payment.id))

    def test_phase_f_run_creates_expected_items(self):
        self.client.force_authenticate(user=self.admin)

        # Payment linked to PENDING EMI -> STATUS_MISMATCH
        payment_pending = Payment.objects.create(
            customer=self.customer,
            subscription=self.subscription,
            emi=self.emi,
            amount=Decimal("1000.00"),
            method="CASH",
            reference_no="PHF-PAY-PEND",
            payment_date=date(2026, 3, 8),
            branch=self.branch,
        )

        # Receipt with invalid EMI payment receipt constraints: missing payment link
        ReceiptDocument.objects.create(
            receipt_no="PHF-RCT-001",
            receipt_type=ReceiptType.EMI_PAYMENT_RECEIPT,
            status=BillingDocumentStatus.DRAFT,
            receipt_date=date(2026, 3, 8),
            branch=self.branch,
            customer=self.customer,
            subscription=self.subscription,
            payment=None,
            amount=Decimal("1000.00"),
        )

        # Payment without accounting bridge posting for PAYMENT_COLLECTION
        Payment.objects.create(
            customer=self.customer,
            subscription=self.subscription,
            emi=self.emi,
            amount=Decimal("1000.00"),
            method="CASH",
            reference_no="PHF-PAY-NOBRIDGE",
            payment_date=date(2026, 3, 9),
            branch=self.branch,
        )

        # Unbalanced journal group
        JournalEntryGroup.objects.create(
            source_module="tests.reconciliation",
            source_object_id="1",
            transaction_date=date(2026, 3, 10),
            narration="Unbalanced",
            total_debit=Decimal("100.00"),
            total_credit=Decimal("90.00"),
            created_by=self.admin,
        )

        # Bridge posting with a journal that lacks source_model/source_id
        payment_for_bridge = Payment.objects.create(
            customer=self.customer,
            subscription=self.subscription,
            emi=self.emi,
            amount=Decimal("1000.00"),
            method="CASH",
            reference_no="PHF-PAY-BRIDGE-BADJRN",
            payment_date=date(2026, 3, 11),
            branch=self.branch,
        )
        bad_journal = JournalEntry.objects.create(
            entry_date=date(2026, 3, 11),
            entry_type=JournalEntryType.SYSTEM_BRIDGE,
            status=JournalEntryStatus.DRAFT,
            memo="Bad bridge journal",
            source_model=None,
            source_id=None,
        )
        AccountingBridgePosting.objects.create(
            source_model="Payment",
            source_id=str(payment_for_bridge.id),
            purpose="PAYMENT_COLLECTION",
            voucher_type="PAYMENT_COLLECTION",
            source_type="SUBSCRIPTION_PAYMENT",
            source_reference=payment_for_bridge.reference_no,
            source_document_no=payment_for_bridge.reference_no,
            source_event_date=payment_for_bridge.payment_date,
            trace_metadata={"payment_id": payment_for_bridge.id},
            journal_entry=bad_journal,
        )

        resp = self.client.post(
            "/api/v1/admin/reconciliation/runs/",
            data={"date_from": "2026-03-01", "date_to": "2026-03-31", "branch_id": self.branch.id if self.branch else None},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        run_id = resp.data["id"]

        items_resp = self.client.get(f"/api/v1/admin/reconciliation/items/?run={run_id}")
        self.assertEqual(items_resp.status_code, status.HTTP_200_OK)
        exception_codes = {row["exception_code"] for row in items_resp.data.get("results", [])}

        self.assertIn("PAYMENT_MISSING_RECEIPT_DOCUMENT", exception_codes)
        self.assertIn("RECEIPT_DOCUMENT_PAYMENT_LINK_INVALID", exception_codes)
        self.assertIn("PAYMENT_EMI_STATUS_MISMATCH_PENDING", exception_codes)
        self.assertIn("PAYMENT_MISSING_ACCOUNTING_BRIDGE_POSTING", exception_codes)
        self.assertIn("JOURNAL_GROUP_UNBALANCED", exception_codes)
        self.assertIn("BRIDGE_JOURNAL_MISSING_SOURCE_REFERENCE", exception_codes)
