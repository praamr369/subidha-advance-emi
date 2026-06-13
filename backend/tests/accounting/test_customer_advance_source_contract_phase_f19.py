from datetime import date
from decimal import Decimal

from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import AccountingBridgePosting, ChartOfAccount, ChartOfAccountType, FinanceAccount, FinanceAccountKind, JournalEntry
from accounting.services.accounting_bridge_candidate_service import receipt_candidate
from accounting.services.accounting_bridge_customer_advance_guard_service import (
    ADVANCE_ALLOCATION_SKIP_REASON,
    BridgeCandidateFilters,
    list_bridge_candidates,
    post_bridge_candidate,
    preview_bridge_candidate,
)
from billing.models import BillingDocumentStatus, BillingSourceType, ReceiptDocument, ReceiptType
from reconciliation.models import ReconciliationItem
from subscriptions.models import CustomerAdvance, CustomerAdvanceAllocation, Payment
from subscriptions.services.customer_advance_service import CustomerAdvanceService
from subscriptions.services.payment_allocation_service import PaymentAllocationService
from tests.helpers import create_admin_user, create_batch, create_customer_profile, create_emi, create_lucky_id, create_product, create_subscription


class CustomerAdvanceSourceContractPhaseF19Tests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="phase_f19_admin", phone="9305190001")
        self.client.force_authenticate(user=self.admin)
        self.customer = create_customer_profile(name="F19 Customer", phone="7305190001")
        self.product = create_product(name="F19 Product", product_code="F19-PROD", base_price=Decimal("2400.00"))
        self.batch = create_batch(batch_code="F19BATCH", duration_months=3, total_slots=100)
        self.lucky_id = create_lucky_id(batch=self.batch, lucky_number=19)
        self.subscription = create_subscription(customer=self.customer, product=self.product, batch=self.batch, lucky_id=self.lucky_id, total_amount=Decimal("2400.00"), monthly_amount=Decimal("800.00"), tenure_months=3)
        self.emi = create_emi(subscription=self.subscription, month_no=1, amount=Decimal("800.00"), due_date=date(2026, 5, 20))
        self.finance_account = FinanceAccount.objects.create(name="F19 Cash", kind=FinanceAccountKind.CASH, chart_account=ChartOfAccount.objects.create(code="F19-CASH", name="F19 Cash Account", account_type=ChartOfAccountType.ASSET), opening_balance=Decimal("0.00"))

    def _counts(self):
        return {"journal": JournalEntry.objects.count(), "bridge": AccountingBridgePosting.objects.count(), "reconciliation": ReconciliationItem.objects.count()}

    def test_customer_advance_receipt_is_concrete_source_and_does_not_post(self):
        before = self._counts()
        advance = CustomerAdvanceService.collect_unapplied_advance(customer_id=self.customer.id, amount=Decimal("500.00"), collected_by=self.admin, finance_account_id=self.finance_account.id, method="CASH", reference_no="F19-ADV-001", payment_date=date(2026, 5, 21), idempotency_key="f19-advance-001")
        self.assertEqual(CustomerAdvance.objects.count(), 1)
        self.assertEqual(advance.customer_id, self.customer.id)
        self.assertEqual(advance.finance_account_id, self.finance_account.id)
        self.assertEqual(advance.method, "CASH")
        self.assertEqual(advance.payment_date, date(2026, 5, 21))
        self.assertEqual(advance.reference_no, "F19-ADV-001")
        self.assertEqual(advance.allocation_metadata["source_idempotency_key"], "f19-advance-001")
        self.assertTrue(advance.allocation_metadata["accounting_bridge_posting_deferred"])
        self.assertEqual(self._counts(), before)

    def test_api_accepts_customer_advance_idempotency_key(self):
        before = self._counts()
        payload = {
            "customer_id": self.customer.id,
            "amount": "450.00",
            "method": "UPI",
            "finance_account_id": self.finance_account.id,
            "reference_no": "F19-API-ADV-001",
            "payment_date": "2026-05-21",
            "idempotency_key": "f19-api-key-001",
        }
        first = self.client.post("/api/v1/cashier/collect-advance/", payload, format="json")
        self.assertEqual(first.status_code, status.HTTP_201_CREATED, first.data)
        second = self.client.post("/api/v1/cashier/collect-advance/", payload, format="json")
        self.assertEqual(second.status_code, status.HTTP_201_CREATED, second.data)
        self.assertEqual(first.data["data"]["customer_advance_id"], second.data["data"]["customer_advance_id"])
        advance = CustomerAdvance.objects.get(pk=first.data["data"]["customer_advance_id"])
        self.assertEqual(advance.allocation_metadata["source_idempotency_key"], "f19-api-key-001")
        self.assertTrue(first.data["data"]["source_metadata"]["accounting_bridge_posting_deferred"])
        self.assertEqual(self._counts(), before)

    def test_api_rejects_customer_advance_idempotency_mismatch(self):
        payload = {
            "customer_id": self.customer.id,
            "amount": "450.00",
            "method": "CASH",
            "finance_account_id": self.finance_account.id,
            "reference_no": "F19-API-MISMATCH",
            "payment_date": "2026-05-21",
            "idempotency_key": "f19-api-mismatch-key",
        }
        self.assertEqual(self.client.post("/api/v1/cashier/collect-advance/", payload, format="json").status_code, status.HTTP_201_CREATED)
        mismatch = {**payload, "amount": "451.00"}
        response = self.client.post("/api/v1/cashier/collect-advance/", mismatch, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
        self.assertIn("already exists with different source evidence", response.data["detail"])

    def test_customer_advance_receipt_idempotency_and_mismatch_protection(self):
        first = CustomerAdvanceService.collect_unapplied_advance(customer_id=self.customer.id, amount=Decimal("500.00"), collected_by=self.admin, finance_account_id=self.finance_account.id, method="CASH", reference_no="F19-ADV-IDEMP", payment_date=date(2026, 5, 21), idempotency_key="f19-idempotent")
        second = CustomerAdvanceService.collect_unapplied_advance(customer_id=self.customer.id, amount=Decimal("500.00"), collected_by=self.admin, finance_account_id=self.finance_account.id, method="CASH", reference_no="F19-ADV-IDEMP", payment_date=date(2026, 5, 21), idempotency_key="f19-idempotent")
        self.assertEqual(first.id, second.id)
        with self.assertRaises(ValueError):
            CustomerAdvanceService.collect_unapplied_advance(customer_id=self.customer.id, amount=Decimal("501.00"), collected_by=self.admin, finance_account_id=self.finance_account.id, method="CASH", reference_no="F19-ADV-IDEMP", payment_date=date(2026, 5, 21), idempotency_key="f19-idempotent")

    def test_customer_advance_application_source_exists_and_does_not_post(self):
        advance = CustomerAdvanceService.collect_unapplied_advance(customer_id=self.customer.id, amount=Decimal("500.00"), collected_by=self.admin, finance_account_id=self.finance_account.id, method="CASH", reference_no="F19-ADV-APP", payment_date=date(2026, 5, 21), idempotency_key="f19-app-source")
        before = self._counts()
        result = PaymentAllocationService.allocate_customer_advance(customer_advance_id=advance.id, emi_id=self.emi.id, amount=Decimal("500.00"), allocated_by=self.admin, reference_no="F19-ALLOC-001", allocation_date=date(2026, 5, 22))
        allocation = result["allocation"]
        payment = result["payment"]
        self.assertIsInstance(allocation, CustomerAdvanceAllocation)
        self.assertEqual(allocation.advance_id, advance.id)
        self.assertEqual(allocation.payment_id, payment.id)
        self.assertEqual(allocation.subscription_id, self.subscription.id)
        self.assertEqual(allocation.emi_id, self.emi.id)
        self.assertEqual(payment.allocation_metadata["collection_mode"], "ADVANCE_ALLOCATION")
        self.assertTrue(payment.allocation_metadata["accounting_bridge_posting_deferred"])
        self.assertEqual(self._counts(), before)
        replay = PaymentAllocationService.allocate_customer_advance(customer_advance_id=advance.id, emi_id=self.emi.id, amount=Decimal("500.00"), allocated_by=self.admin, reference_no="F19-ALLOC-001", allocation_date=date(2026, 5, 22))
        self.assertTrue(replay["idempotent_replay"])
        self.assertEqual(replay["payment"].id, payment.id)
        with self.assertRaises(ValueError):
            PaymentAllocationService.allocate_customer_advance(customer_advance_id=advance.id, emi_id=self.emi.id, amount=Decimal("1.00"), allocated_by=self.admin, reference_no="F19-ALLOC-001", allocation_date=date(2026, 5, 22))

    def test_f1_payment_bridge_excludes_advance_allocation_payment(self):
        advance = CustomerAdvanceService.collect_unapplied_advance(customer_id=self.customer.id, amount=Decimal("500.00"), collected_by=self.admin, finance_account_id=self.finance_account.id, method="CASH", reference_no="F19-ADV-BRIDGE", payment_date=date(2026, 5, 21), idempotency_key="f19-bridge-source")
        result = PaymentAllocationService.allocate_customer_advance(customer_advance_id=advance.id, emi_id=self.emi.id, amount=Decimal("500.00"), allocated_by=self.admin, reference_no="F19-ALLOC-BRIDGE", allocation_date=date(2026, 5, 22))
        payment = result["payment"]
        rows = list_bridge_candidates(BridgeCandidateFilters(source_model="Payment"))
        row = next(item for item in rows if str(item.get("source_id")) == str(payment.id))
        self.assertEqual(row["event_key"], "payment_skipped_not_applicable")
        self.assertEqual(row["status"], "SKIPPED_NOT_APPLICABLE")
        self.assertFalse(row["can_preview"])
        self.assertFalse(row["can_post"])
        f1_candidate_id = f"payment:{payment.id}:subscription_emi_payment"
        with self.assertRaisesMessage(ValueError, ADVANCE_ALLOCATION_SKIP_REASON):
            preview_bridge_candidate(f1_candidate_id)
        with self.assertRaisesMessage(ValueError, ADVANCE_ALLOCATION_SKIP_REASON):
            post_bridge_candidate(candidate_id=f1_candidate_id, idempotency_key="blocked", confirmed=True, actor=self.admin)
        self.assertFalse(AccountingBridgePosting.objects.filter(source_model="Payment", source_id=str(payment.id), purpose="PAYMENT_COLLECTION").exists())

    def test_normal_emi_payment_bridge_candidate_remains_f1_payment(self):
        payment = Payment.objects.create(customer=self.customer, subscription=self.subscription, emi=self.emi, amount=Decimal("100.00"), finance_account=self.finance_account, method="CASH", reference_no="F19-NORMAL-EMI-PAY", payment_date=date(2026, 5, 23), collected_by=self.admin)
        rows = list_bridge_candidates(BridgeCandidateFilters(source_model="Payment"))
        row = next(item for item in rows if str(item.get("source_id")) == str(payment.id))
        self.assertEqual(row["event_key"], "subscription_emi_payment")
        self.assertNotEqual(row["status"], "SKIPPED_NOT_APPLICABLE")

    def test_receiptdocument_f2_customer_advance_classification_is_separate(self):
        manual = ReceiptDocument.objects.create(receipt_no="F19-RCT-ADV", receipt_type=ReceiptType.RETAIL_RECEIPT, status=BillingDocumentStatus.APPROVED, receipt_date=date(2026, 5, 21), finance_account=self.finance_account, customer=self.customer, source_type=BillingSourceType.MANUAL, amount=Decimal("300.00"))
        row = receipt_candidate(manual)
        self.assertEqual(row["source_model"], "ReceiptDocument")
        self.assertEqual(row["event_key"], "customer_advance")

        direct_sale = ReceiptDocument.objects.create(receipt_no="F19-RCT-DS", receipt_type=ReceiptType.RETAIL_RECEIPT, status=BillingDocumentStatus.APPROVED, receipt_date=date(2026, 5, 21), finance_account=self.finance_account, customer=self.customer, source_type=BillingSourceType.DIRECT_SALE, amount=Decimal("300.00"))
        self.assertEqual(receipt_candidate(direct_sale)["event_key"], "direct_sale_receipt")

        payment = Payment.objects.create(customer=self.customer, subscription=self.subscription, emi=self.emi, amount=Decimal("100.00"), finance_account=self.finance_account, method="CASH", reference_no="F19-EMI-PAY", payment_date=date(2026, 5, 21), collected_by=self.admin)
        emi_receipt = ReceiptDocument.objects.create(receipt_no="F19-RCT-EMI", receipt_type=ReceiptType.EMI_PAYMENT_RECEIPT, status=BillingDocumentStatus.APPROVED, receipt_date=date(2026, 5, 21), finance_account=self.finance_account, customer=self.customer, subscription=self.subscription, payment=payment, source_type=BillingSourceType.PAYMENT, amount=Decimal("100.00"))
        self.assertNotEqual(receipt_candidate(emi_receipt)["event_key"], "customer_advance")

    def test_security_deposit_and_rent_collection_not_customer_advance_sources(self):
        self.assertFalse(AccountingBridgePosting.objects.filter(source_model__in=["RentLeaseDepositTransaction", "RentLeaseCollection"], purpose__icontains="CUSTOMER_ADVANCE").exists())
        self.assertFalse(CustomerAdvance.objects.filter(allocation_metadata__collection_mode__in=["SECURITY_DEPOSIT", "RENT_LEASE_COLLECTION"]).exists())
