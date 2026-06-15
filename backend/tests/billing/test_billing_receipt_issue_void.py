from datetime import date
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from accounting.models import ChartOfAccount, ChartOfAccountType, FinanceAccount, FinanceAccountCoaMapping, FinanceAccountKind, FinanceAccountMappingPurpose
from billing.models import BillingDocumentStatus, ReceiptType
from billing.services.billing_service import create_manual_receipt, void_receipt_document
from core.services.operational_visibility import is_receipt_active_collection
from tests.helpers import create_admin_user, create_customer_profile, ensure_document_numbering_profile_for_date, ensure_test_accounting_posting_prerequisites

_RECEIPT_DATE = date(2026, 4, 8)


class BillingReceiptIssueVoidTests(TestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="receipt_void_admin", phone="9386100001")
        ensure_test_accounting_posting_prerequisites(_RECEIPT_DATE, performed_by=self.admin)
        _today = timezone.localdate()
        if _today != _RECEIPT_DATE:
            ensure_test_accounting_posting_prerequisites(_today, performed_by=self.admin)
        for doc_type in ("DIRECT_SALE_RECEIPT", "JOURNAL_ENTRY"):
            ensure_document_numbering_profile_for_date(doc_type, _RECEIPT_DATE, performed_by=self.admin)
            if _today != _RECEIPT_DATE:
                ensure_document_numbering_profile_for_date(doc_type, _today, performed_by=self.admin)
        self.customer = create_customer_profile(name="Receipt Customer", phone="7386100001")
        cash_chart = ChartOfAccount.objects.create(
            code="RCT-CASH-001",
            name="Receipt Cash",
            account_type=ChartOfAccountType.ASSET,
        )
        self.cash_account = FinanceAccount.objects.create(
            name="Receipt Counter",
            kind=FinanceAccountKind.CASH,
            chart_account=cash_chart,
            opening_balance=Decimal("0.00"),
        )
        FinanceAccountCoaMapping.objects.create(
            finance_account=self.cash_account,
            chart_account=cash_chart,
            purpose=FinanceAccountMappingPurpose.CASH_COLLECTION,
            is_active=True,
        )

    def test_manual_receipt_issue_and_void_create_balanced_reversal(self):
        receipt = create_manual_receipt(
            receipt_date=date(2026, 4, 8),
            finance_account_id=self.cash_account.id,
            amount=Decimal("550.00"),
            receipt_type=ReceiptType.RETAIL_RECEIPT,
            customer_id=self.customer.id,
            notes="Retail collection",
            created_by=self.admin,
        )
        self.assertEqual(receipt.status, BillingDocumentStatus.POSTED)
        self.assertIsNotNone(receipt.posted_journal_entry_id)
        self.assertTrue(is_receipt_active_collection(receipt))

        receipt, updated = void_receipt_document(
            receipt_id=receipt.id,
            performed_by=self.admin,
            reason="Receipt entered against the wrong counter.",
        )
        self.assertTrue(updated)
        self.assertEqual(receipt.status, BillingDocumentStatus.VOID)
        self.assertIn("Void reason:", receipt.notes)
        self.assertFalse(is_receipt_active_collection(receipt))

        receipt, updated_again = void_receipt_document(
            receipt_id=receipt.id,
            performed_by=self.admin,
            reason="Repeated void call stays idempotent.",
        )
        self.assertFalse(updated_again)
        self.assertEqual(receipt.status, BillingDocumentStatus.VOID)
