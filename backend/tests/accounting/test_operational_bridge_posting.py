from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from accounting.models import (
    AccountingBridgePosting,
    ChartOfAccount,
    ChartOfAccountType,
    FinanceAccount,
    FinanceAccountKind,
)
from accounting.services.bridge_run_service import (
    run_bridge_postings,
    run_commission_settlement_bridges,
    run_emi_waiver_bridges,
    run_payout_batch_bridges,
)
from billing.services.billing_service import generate_emi_payment_receipt
from subscriptions.services.commission_payout_service import (
    create_commission_payout_batch,
    finalize_commission_payout_batch,
)
from subscriptions.services.commission_service import settle_commission
from subscriptions.services.payment_service import (
    record_emi_payment,
    reverse_payment_for_admin,
)
from subscriptions.services.winner_state_service import apply_winner_state
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_customer_profile,
    create_emi,
    create_lucky_id,
    create_partner_user,
    create_product,
    create_subscription,
)


class OperationalAccountingBridgePostingTests(TestCase):
    def setUp(self):
        super().setUp()
        self.today = timezone.localdate()
        self.admin = create_admin_user(
            username="accounting_operational_admin",
            phone="9367000001",
        )

    def _create_finance_account(self, *, code: str, name: str, kind: str):
        chart_account = ChartOfAccount.objects.create(
            code=code,
            name=name,
            account_type=ChartOfAccountType.ASSET,
        )
        return FinanceAccount.objects.create(
            name=name,
            kind=kind,
            chart_account=chart_account,
            opening_balance=Decimal("0.00"),
        )

    def _create_subscription_bundle(self, *, product_code: str, lucky_number: int, partner=None, tenure_months: int = 3):
        customer = create_customer_profile(
            name=f"Customer {product_code}",
            phone=f"7300{lucky_number:06d}"[-10:],
        )
        product = create_product(
            name=f"Product {product_code}",
            product_code=product_code,
            base_price=Decimal("2400.00"),
        )
        batch = create_batch(
            batch_code=f"BATCH-{product_code}",
            duration_months=tenure_months,
            total_slots=100,
            draw_day=5,
            start_date=self.today - timedelta(days=40),
        )
        lucky_id = create_lucky_id(batch=batch, lucky_number=lucky_number)
        subscription = create_subscription(
            customer=customer,
            product=product,
            batch=batch,
            lucky_id=lucky_id,
            partner=partner,
            total_amount=Decimal("2400.00"),
            monthly_amount=Decimal("800.00"),
            tenure_months=tenure_months,
            start_date=self.today - timedelta(days=40),
        )
        emis = [
            create_emi(
                subscription=subscription,
                month_no=index + 1,
                amount=Decimal("800.00"),
                due_date=self.today - timedelta(days=5 - index),
            )
            for index in range(tenure_months)
        ]
        return subscription, emis

    def test_payment_reversal_bridge_is_idempotent(self):
        cash_account = self._create_finance_account(
            code="OPB-CASH-001",
            name="Operational Bridge Cash",
            kind=FinanceAccountKind.CASH,
        )
        _, emis = self._create_subscription_bundle(
            product_code="OPB-PAY-001",
            lucky_number=71,
            tenure_months=1,
        )
        payment = record_emi_payment(
            emi_id=emis[0].id,
            amount=Decimal("800.00"),
            collected_by=self.admin,
            method="CASH",
            reference_no="OPB-PAYMENT-001",
            payment_date=self.today - timedelta(days=1),
        )["payment"]

        run_bridge_postings(
            start_date=self.today - timedelta(days=3),
            end_date=self.today,
            purposes=["PAYMENT_COLLECTION"],
            dry_run=False,
            performed_by=self.admin,
        )
        generate_emi_payment_receipt(
            payment_id=payment.id,
            finance_account_id=cash_account.id,
            performed_by=self.admin,
        )
        reverse_payment_for_admin(
            payment_id=payment.id,
            reversed_by=self.admin,
            reason="Operational bridge reversal",
        )

        first = run_bridge_postings(
            start_date=self.today - timedelta(days=3),
            end_date=self.today,
            purposes=["PAYMENT_REVERSAL"],
            dry_run=False,
            performed_by=self.admin,
        )
        second = run_bridge_postings(
            start_date=self.today - timedelta(days=3),
            end_date=self.today,
            purposes=["PAYMENT_REVERSAL"],
            dry_run=False,
            performed_by=self.admin,
        )

        self.assertEqual(first["results"][0]["created_count"], 1)
        self.assertEqual(second["results"][0]["existing_count"], 1)
        bridge = AccountingBridgePosting.objects.get(
            source_model="Payment",
            source_id=str(payment.id),
            purpose="PAYMENT_REVERSAL",
        )
        self.assertEqual(bridge.voucher_type, "PAYMENT_REVERSAL")
        self.assertEqual(bridge.journal_entry.lines.count(), 4)

    def test_emi_waiver_bridge_is_idempotent_from_audit_event(self):
        subscription, _ = self._create_subscription_bundle(
            product_code="OPB-WAIVE-001",
            lucky_number=72,
            tenure_months=3,
        )
        apply_winner_state(
            subscription=subscription,
            winner_month=1,
            performed_by=self.admin,
            source="accounting_bridge_test",
        )

        first = run_emi_waiver_bridges(
            start_date=self.today - timedelta(days=1),
            end_date=self.today,
            dry_run=False,
            performed_by=self.admin,
        )
        second = run_emi_waiver_bridges(
            start_date=self.today - timedelta(days=1),
            end_date=self.today,
            dry_run=False,
            performed_by=self.admin,
        )

        self.assertEqual(first["created_count"], 1)
        self.assertEqual(second["existing_count"], 1)
        bridge = AccountingBridgePosting.objects.get(purpose="EMI_WAIVER")
        self.assertEqual(bridge.source_model, "AuditLog")
        self.assertEqual(bridge.source_type, "WINNER_WAIVER")

    def test_commission_settlement_bridge_posts_once_per_settled_commission(self):
        cash_account = self._create_finance_account(
            code="OPB-COM-CASH-001",
            name="Operational Commission Cash",
            kind=FinanceAccountKind.CASH,
        )
        partner = create_partner_user(
            username="opb_partner_settle",
            phone="9367000002",
        )
        partner.commission_rate = Decimal("10.00")
        partner.save(update_fields=["commission_rate"])
        _, emis = self._create_subscription_bundle(
            product_code="OPB-COM-001",
            lucky_number=73,
            partner=partner,
            tenure_months=1,
        )
        payment = record_emi_payment(
            emi_id=emis[0].id,
            amount=Decimal("800.00"),
            collected_by=self.admin,
            method="CASH",
            finance_account_id=cash_account.id,
            reference_no="OPB-COMMISSION-001",
            payment_date=self.today,
        )["payment"]
        commission = payment.commission
        settle_commission(
            commission_id=commission.id,
            settled_by=self.admin,
            settlement_date=self.today,
        )

        first = run_commission_settlement_bridges(
            start_date=self.today - timedelta(days=1),
            end_date=self.today,
            dry_run=False,
            performed_by=self.admin,
        )
        second = run_commission_settlement_bridges(
            start_date=self.today - timedelta(days=1),
            end_date=self.today,
            dry_run=False,
            performed_by=self.admin,
        )

        self.assertEqual(first["created_count"], 1)
        self.assertEqual(second["existing_count"], 1)
        bridge = AccountingBridgePosting.objects.get(
            source_model="Commission",
            source_id=str(commission.id),
            purpose="COMMISSION_SETTLEMENT",
        )
        self.assertEqual(bridge.source_type, "COMMISSION")

    def test_payout_batch_bridge_posts_cash_side_when_finance_account_is_assigned(self):
        bank_account = self._create_finance_account(
            code="OPB-BANK-001",
            name="Operational Bridge Bank",
            kind=FinanceAccountKind.BANK,
        )
        partner = create_partner_user(
            username="opb_partner_payout",
            phone="9367000003",
        )
        partner.commission_rate = Decimal("10.00")
        partner.save(update_fields=["commission_rate"])
        _, emis = self._create_subscription_bundle(
            product_code="OPB-PAYOUT-001",
            lucky_number=74,
            partner=partner,
            tenure_months=1,
        )
        payment = record_emi_payment(
            emi_id=emis[0].id,
            amount=Decimal("800.00"),
            collected_by=self.admin,
            method="BANK",
            reference_no="OPB-PAYOUT-PAY-001",
            payment_date=self.today,
        )["payment"]
        payout_batch = create_commission_payout_batch(
            commission_ids=[payment.commission.id],
            processed_by=self.admin,
            payout_date=self.today,
        )["batch"]
        finalize_commission_payout_batch(
            batch_id=payout_batch.id,
            processed_by=self.admin,
            finance_account_id=bank_account.id,
            reference_no="PAYOUT-BANK-001",
        )
        payout_batch.refresh_from_db()

        first = run_payout_batch_bridges(
            start_date=self.today - timedelta(days=1),
            end_date=self.today,
            dry_run=False,
            performed_by=self.admin,
        )
        second = run_payout_batch_bridges(
            start_date=self.today - timedelta(days=1),
            end_date=self.today,
            dry_run=False,
            performed_by=self.admin,
        )

        self.assertEqual(payout_batch.finance_account_id, bank_account.id)
        self.assertEqual(first["created_count"], 1)
        self.assertEqual(first["settlement_created_count"], 1)
        self.assertEqual(second["existing_count"], 1)
        self.assertTrue(
            AccountingBridgePosting.objects.filter(
                source_model="CommissionPayoutBatch",
                source_id=str(payout_batch.id),
                purpose="COMMISSION_PAYOUT_BATCH",
            ).exists()
        )
