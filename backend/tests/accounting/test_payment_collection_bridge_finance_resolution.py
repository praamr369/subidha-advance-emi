from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from accounting.models import AccountingBridgePosting, FinanceAccount, FinanceAccountKind
from accounting.services.bridge_run_service import run_bridge_postings
from subscriptions.models import Payment
from subscriptions.services.payment_service import record_emi_payment, reverse_payment_for_admin
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_customer_profile,
    create_emi,
    create_lucky_id,
    create_product,
    create_subscription,
)
from tests.accounting.helpers import seed_bridge_ready_environment


class PaymentCollectionBridgeFinanceResolutionTests(TestCase):
    def setUp(self):
        super().setUp()
        self.today = timezone.localdate()
        self.admin = create_admin_user(username="bridge_fin_admin", phone="9364100001")
        environment = seed_bridge_ready_environment(self.today, performed_by=self.admin)
        self.finance_account = environment["finance_account"]
        customer = create_customer_profile(name="Bridge Finance Customer", phone="7364100001")
        product = create_product(name="Bridge Finance Product", product_code="BR-FIN-01", base_price=Decimal("1000.00"))
        batch = create_batch(
            batch_code="BRFIN2026",
            duration_months=1,
            total_slots=100,
            draw_day=5,
            start_date=self.today - timedelta(days=15),
        )
        lucky_id = create_lucky_id(batch=batch, lucky_number=11)
        subscription = create_subscription(
            customer=customer,
            product=product,
            batch=batch,
            lucky_id=lucky_id,
            total_amount=Decimal("1000.00"),
            monthly_amount=Decimal("1000.00"),
            tenure_months=1,
            start_date=self.today - timedelta(days=15),
        )
        emi = create_emi(
            subscription=subscription,
            month_no=1,
            amount=Decimal("1000.00"),
            due_date=self.today - timedelta(days=2),
        )
        self.emi = emi
        self.subscription = subscription
        self.payment = Payment.objects.create(
            customer=customer,
            subscription=subscription,
            emi=emi,
            amount=Decimal("1000.00"),
            method="CASH",
            reference_no="BR-FIN-PAY-001",
            payment_date=self.today - timedelta(days=1),
            collected_by=self.admin,
            finance_account=self.finance_account,
        )

    def test_payment_collection_uses_finance_account_chart_not_legacy_brg_accounts(self):
        FinanceAccount.objects.filter(
            kind=FinanceAccountKind.CASH,
            is_real_settlement_account=True,
        ).exclude(pk=self.finance_account.pk).update(is_active=False)
        result = run_bridge_postings(
            start_date=self.today - timedelta(days=7),
            end_date=self.today,
            purposes=["PAYMENT_COLLECTION"],
            dry_run=False,
            performed_by=self.admin,
        )
        self.assertEqual(result["results"][0]["created_count"], 1)
        bridge = AccountingBridgePosting.objects.get(
            source_model="Payment",
            source_id=str(self.payment.id),
            purpose="PAYMENT_COLLECTION",
        )
        codes = set(bridge.journal_entry.lines.values_list("chart_account__code", flat=True))
        self.assertTrue(any(code.startswith("TEST-DEFAULT-CASH") for code in codes))
        self.assertFalse(any(code.startswith("BRG-") for code in codes))
        self.assertIn("EMI-2100", codes)

    def test_payment_collection_skips_when_missing_finance_account(self):
        self.payment.finance_account = None
        self.payment.save(update_fields=["finance_account"])
        FinanceAccount.objects.filter(kind=FinanceAccountKind.CASH, is_real_settlement_account=True).update(is_active=False)
        result = run_bridge_postings(
            start_date=self.today - timedelta(days=7),
            end_date=self.today,
            purposes=["PAYMENT_COLLECTION"],
            dry_run=False,
            performed_by=self.admin,
        )
        self.assertEqual(result["results"][0]["created_count"], 0)
        self.assertEqual(result["results"][0]["skipped_count"], 1)
        self.assertEqual(result["results"][0]["skipped"][0]["reason"], "MISSING_FINANCE_ACCOUNT")

    def test_payment_collection_skips_when_ambiguous_finance_account(self):
        self.payment.finance_account = None
        self.payment.save(update_fields=["finance_account"])
        # Create a second active CASH settlement finance account to force ambiguity.
        FinanceAccount.objects.create(
            name="Bridge Fin Extra Cash",
            kind=FinanceAccountKind.CASH,
            chart_account=FinanceAccount.objects.filter(kind=FinanceAccountKind.CASH).first().chart_account,
            opening_balance=Decimal("0.00"),
            is_active=True,
            is_real_settlement_account=True,
        )
        result = run_bridge_postings(
            start_date=self.today - timedelta(days=7),
            end_date=self.today,
            purposes=["PAYMENT_COLLECTION"],
            dry_run=False,
            performed_by=self.admin,
        )
        self.assertEqual(result["results"][0]["created_count"], 0)
        self.assertEqual(result["results"][0]["skipped_count"], 1)
        self.assertEqual(result["results"][0]["skipped"][0]["reason"], "AMBIGUOUS_FINANCE_ACCOUNT")

    def test_payment_reversal_inverts_legacy_brg_collection_bridge(self):
        """
        Legacy compatibility: if a historical PAYMENT_COLLECTION bridge posted via BRG-* accounts,
        the reversal bridge should still reverse the originally posted accounts.
        """

        # Create a legacy BRG-style bridge journal by running the bridge with a forced ambiguity skip workaround:
        # Use PAYMENT_COLLECTION as posted already (simulate legacy) by directly swapping trace metadata and lines.
        # We keep this minimal: create a bridge posting using the service, then mutate its journal lines
        # to BRG-* accounts and ensure reversal uses those lines.
        from accounting.models import ChartOfAccount, ChartOfAccountType, JournalEntryLine
        from accounting.services.gst_document_posting_service import _ensure_system_account

        payment = record_emi_payment(
            emi_id=self.emi.id,
            amount=Decimal("1000.00"),
            collected_by=self.admin,
            method="CASH",
            reference_no="BR-FIN-PAY-REV-001",
            payment_date=self.today - timedelta(days=1),
        )["payment"]

        # Ensure the payment collection bridge exists (service posts it during payment recording in current flows).
        bridge = AccountingBridgePosting.objects.get(
            source_model="Payment",
            source_id=str(payment.id),
            purpose="PAYMENT_COLLECTION",
        )
        journal = bridge.journal_entry

        # Replace lines with legacy BRG-* accounts.
        brg_cash = _ensure_system_account(
            system_code="BRIDGE_CASH_COLLECTION",
            code="BRG-1000",
            name="Bridge Cash Collections",
            account_type=ChartOfAccountType.ASSET,
        )
        brg_clear = _ensure_system_account(
            system_code="SUBSCRIPTION_COLLECTION_CLEARING",
            code="BRG-2000",
            name="Subscription Collection Clearing",
            account_type=ChartOfAccountType.LIABILITY,
        )
        journal.lines.all().delete()
        JournalEntryLine.objects.create(
            journal_entry=journal,
            chart_account=brg_cash,
            debit_amount=Decimal("1000.00"),
            credit_amount=Decimal("0.00"),
            description="Legacy cash debit",
        )
        JournalEntryLine.objects.create(
            journal_entry=journal,
            chart_account=brg_clear,
            debit_amount=Decimal("0.00"),
            credit_amount=Decimal("1000.00"),
            description="Legacy clearing credit",
        )

        # Reverse the payment (creates reversal allocation metadata), then run reversal bridge.
        reverse_payment_for_admin(payment_id=payment.id, reversed_by=self.admin, reason="legacy reversal test")
        run_bridge_postings(
            start_date=self.today - timedelta(days=7),
            end_date=self.today,
            purposes=["PAYMENT_REVERSAL"],
            dry_run=False,
            performed_by=self.admin,
        )
        reversal_bridge = AccountingBridgePosting.objects.get(
            source_model="Payment",
            source_id=str(payment.id),
            purpose="PAYMENT_REVERSAL",
        )
        reversal_codes = set(reversal_bridge.journal_entry.lines.values_list("chart_account__code", flat=True))
        self.assertIn("BRG-1000", reversal_codes)
        self.assertIn("BRG-2000", reversal_codes)
