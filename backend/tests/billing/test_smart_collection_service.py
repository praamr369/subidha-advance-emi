from decimal import Decimal
import uuid
from datetime import date

from django.test import TestCase
from django.utils import timezone

from billing.models import DirectSale, SmartCollectionRun, BillingInvoice
from subscriptions.models import CustomerAdvance, Emi, Payment
from billing.services.smart_collection_service import plan_smart_collection, execute_smart_collection
from tests.helpers import (
    create_admin_user,
    create_customer_profile,
    create_product,
    create_subscription,
    create_emi,
    create_finance_account,
    create_payment_collection_finance_account,
    create_batch,
    create_lucky_id,
    ensure_test_accounting_posting_prerequisites,
)
from accounting.models import DocumentSequence, JournalEntry
from accounting.services.document_sequence_service import (
    DocumentType,
    get_or_create_sequence_for_document_type,
    validate_document_numbering_ready,
)


class SmartCollectionServiceTests(TestCase):
    def setUp(self):
        self.admin = create_admin_user()
        prereqs = ensure_test_accounting_posting_prerequisites(performed_by=self.admin)
        fy = prereqs["financial_year"]
        # ensure_test_accounting_posting_prerequisites upserts numbering
        # PROFILES (spec metadata) but the concrete DocumentSequence row
        # is created lazily by get_or_create_sequence_for_document_type
        # (validate_document_numbering_ready only READS an existing one).
        # Force sequence creation so the setUp can attach it to the seed
        # DirectSale below without a DoesNotExist trap.
        doc_series = get_or_create_sequence_for_document_type(
            DocumentType.DIRECT_SALE, timezone.localdate()
        )
        
        self.customer = create_customer_profile(name="Amrita", phone="7407533262")
        self.product = create_product(base_price=Decimal("15000.00"))
        self.batch = create_batch()
        self.lucky_id = create_lucky_id(batch=self.batch, lucky_number=4)
        
        self.subscription = create_subscription(
            customer=self.customer,
            product=self.product,
            batch=self.batch,
            lucky_id=self.lucky_id,
            total_amount=Decimal("15000.00"),
            monthly_amount=Decimal("1500.00"),
        )
        
        self.emi1 = create_emi(subscription=self.subscription, month_no=1, amount=Decimal("1500.00"), due_date=date(2026, 1, 1))
        self.emi2 = create_emi(subscription=self.subscription, month_no=2, amount=Decimal("1500.00"), due_date=date(2026, 2, 1))
        self.emi3 = create_emi(subscription=self.subscription, month_no=3, amount=Decimal("1500.00"), due_date=date(2026, 3, 1))
        
        self.direct_sale = DirectSale.objects.create(
            financial_year=fy.code,
            doc_series=doc_series,
            customer=self.customer,
            sale_date=timezone.localdate(),
            grand_total=Decimal("3500.00"),
            balance_total=Decimal("3500.00"),
            received_total=Decimal("0.00"),
            status="INVOICED"
        )
        
        je = JournalEntry.objects.create(
            entry_type="SYSTEM_BRIDGE",
            status="POSTED",
            entry_date=timezone.localdate(),
            financial_year=fy,
            posted_at=timezone.now(),
        )
        self.billing_invoice = BillingInvoice.objects.create(
            document_no=f"INV-{fy.code}-SC",
            invoice_date=timezone.localdate(),
            financial_year=fy.code,
            doc_series=doc_series,
            customer=self.customer,
            direct_sale=self.direct_sale,
            status="POSTED",
            grand_total=Decimal("3500.00"),
            balance_total=Decimal("3500.00"),
            received_total=Decimal("0.00"),
            billing_channel="RETAIL",
            source_type="DIRECT_SALE",
            posted_journal_entry=je,
        )
        
        # Collection tests need a finance account WITH the collection-purpose
        # COA mapping wired up, or record_emi_payment /
        # execute_smart_collection 400s with
        # FinanceAccountPostingReadinessError.
        self.finance_account = create_payment_collection_finance_account(
            code="SC-TEST-01", name="SC Test Bank"
        )
        
    def test_exact_match(self):
        # 3 EMIs (4500) + 1 Sale (3500) = 8000
        plan = plan_smart_collection(customer_id=self.customer.id, amount=Decimal("8000.00"), use_existing_advance=False)
        self.assertEqual(len(plan["allocations"]), 4)
        self.assertEqual(plan["closing"]["advance_balance"], "0.00")
        
        idem = uuid.uuid4().hex
        res = execute_smart_collection(
            customer_id=self.customer.id,
            amount=Decimal("8000.00"),
            payment_method="CASH",
            finance_account_id=self.finance_account.id,
            collected_by=self.admin,
            use_existing_advance=False,
            idempotency_key=idem
        )
        self.assertEqual(len(res["allocations"]), 4)
        self.emi1.refresh_from_db()
        self.emi2.refresh_from_db()
        self.emi3.refresh_from_db()
        self.assertEqual(self.emi1.status, "PAID")
        self.assertEqual(self.emi2.status, "PAID")
        self.assertEqual(self.emi3.status, "PAID")
        self.direct_sale.refresh_from_db()
        self.assertEqual(self.direct_sale.balance_total, Decimal("0.00"))

    def test_underpayment_skips_partial_emi(self):
        # 1000 cash. EMI is 1500. Cannot pay EMI. Skips EMI, pays 1000 to DirectSale
        plan = plan_smart_collection(customer_id=self.customer.id, amount=Decimal("1000.00"), use_existing_advance=False)
        self.assertEqual(len(plan["skipped"]), 3)
        self.assertEqual(len(plan["allocations"]), 1)
        self.assertEqual(plan["allocations"][0]["step"], "CASH_TO_DIRECT_SALE")
        self.assertEqual(plan["allocations"][0]["amount"], "1000.00")
        
    def test_partial_direct_sale_allowed(self):
        # Pay 2000. 1500 to EMI1, 500 to DirectSale
        plan = plan_smart_collection(customer_id=self.customer.id, amount=Decimal("2000.00"), use_existing_advance=False)
        self.assertEqual(plan["allocations"][0]["step"], "CASH_TO_EMI")
        self.assertEqual(plan["allocations"][0]["emi_id"], self.emi1.id)
        self.assertEqual(plan["allocations"][1]["step"], "CASH_TO_DIRECT_SALE")
        self.assertEqual(plan["allocations"][1]["amount"], "500.00")
        
    def test_overpayment_to_advance(self):
        # Pay 10000. (8000 total dues). 2000 should go to advance.
        idem = uuid.uuid4().hex
        res = execute_smart_collection(
            customer_id=self.customer.id,
            amount=Decimal("10000.00"),
            payment_method="CASH",
            finance_account_id=self.finance_account.id,
            collected_by=self.admin,
            use_existing_advance=False,
            idempotency_key=idem
        )
        self.assertEqual(res["allocations"][-1]["step"], "CASH_TO_ADVANCE")
        self.assertEqual(res["allocations"][-1]["amount"], "2000.00")
        
        adv = CustomerAdvance.objects.get(customer=self.customer)
        self.assertEqual(adv.unapplied_amount, Decimal("2000.00"))
        
    def test_existing_advance_consumed_first(self):
        # Create advance
        CustomerAdvance.objects.create(
            customer=self.customer,
            amount=Decimal("1500.00"),
            unapplied_amount=Decimal("1500.00"),
            finance_account=self.finance_account,
            method="CASH",
            payment_date=timezone.localdate()
        )
        
        # Pay 1500 cash. Toggle ON. Advance pays EMI1. Cash pays EMI2.
        plan = plan_smart_collection(customer_id=self.customer.id, amount=Decimal("1500.00"), use_existing_advance=True)
        self.assertEqual(plan["allocations"][0]["step"], "ADVANCE_TO_EMI")
        self.assertEqual(plan["allocations"][0]["emi_id"], self.emi1.id)
        self.assertEqual(plan["allocations"][1]["step"], "CASH_TO_EMI")
        self.assertEqual(plan["allocations"][1]["emi_id"], self.emi2.id)

    def test_idempotent_replay(self):
        idem = uuid.uuid4().hex
        res1 = execute_smart_collection(
            customer_id=self.customer.id, amount=Decimal("1500.00"), payment_method="CASH",
            finance_account_id=self.finance_account.id, collected_by=self.admin, idempotency_key=idem
        )
        self.assertFalse(res1.get("idempotent_replay"))
        
        res2 = execute_smart_collection(
            customer_id=self.customer.id, amount=Decimal("1500.00"), payment_method="CASH",
            finance_account_id=self.finance_account.id, collected_by=self.admin, idempotency_key=idem
        )
        self.assertTrue(res2.get("idempotent_replay"))
        self.assertEqual(Payment.objects.count(), 1)
