"""P1 tests: security-deposit damage deduction on the canonical accounting bridge.

Damage deduction now posts through ``post_bridge_entry`` /
``AccountingBridgePosting`` (purpose ``SECURITY_DEPOSIT_DAMAGE_DEDUCTION``,
``source_model="RentLeaseDepositTransaction"``) instead of the legacy
direct-journal sync. Accounting is unchanged: Dr Security Deposit Liability /
Cr Damage Recovery Income. Posting is gated behind the rent/lease posting-bridge
approval, so it is DEFERRED (no journal) by default.
"""
from __future__ import annotations

from decimal import Decimal
from io import StringIO

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from accounting.models import AccountingBridgePosting, JournalEntry
from subscriptions.models import (
    Product,
    RentLeaseDepositTransaction,
    RentLeaseDepositTransactionType,
)
from subscriptions.services.rent_lease_accounting_bridge_service import (
    PURPOSE_SECURITY_DEPOSIT_DAMAGE_DEDUCTION,
    post_security_deposit_damage_deduction,
)
from subscriptions.services.rent_lease_billing_service import (
    collect_security_deposit,
    record_damage_deduction,
)
from subscriptions.services.rent_lease_contract_service import create_rent_contract
from subscriptions.services.rent_lease_finance_sync_service import (
    sync_damage_deduction_income,
)
from tests.accounting.helpers import (
    create_locked_accounting_period,
    seed_bridge_ready_environment,
)
from tests.helpers import create_admin_user, create_customer_profile, create_product


def _rent_product(code="RENT-DMG-1"):
    product = create_product(name="Rentable Bed", product_code=code)
    Product.objects.filter(pk=product.pk).update(is_rent_enabled=True)
    product.refresh_from_db()
    return product


def _enable_bridge():
    from subscriptions.services.rent_lease_posting_bridge_config_service import (
        get_rent_lease_posting_bridge_config,
    )

    config = get_rent_lease_posting_bridge_config()
    config.is_enabled = True
    config.save()


class DamageDeductionBridgeTests(TestCase):
    def setUp(self):
        super().setUp()
        self.today = timezone.localdate()
        self.admin = create_admin_user(username="dmg_admin", phone="9910000001")
        self.env = seed_bridge_ready_environment(self.today, performed_by=self.admin)
        self.customer = create_customer_profile(name="Dmg Cust", phone="7910000001")
        self.product = _rent_product()
        self.sub = create_rent_contract(
            customer=self.customer,
            product=self.product,
            tenure_months=12,
            security_deposit_percent=Decimal("20.00"),
            performed_by=self.admin,
            start_date=self.today,
        )
        # Collect a deposit so there is a refundable balance to deduct from.
        self.demand = collect_security_deposit(
            subscription=self.sub, amount=Decimal("3000.00"), performed_by=self.admin
        )

    def _deduction_tx(self, amount="1000.00"):
        return RentLeaseDepositTransaction.objects.create(
            subscription=self.sub,
            demand=self.demand,
            transaction_type=RentLeaseDepositTransactionType.DEDUCTION,
            amount=Decimal(amount),
            reason="Scratch on surface",
            performed_by=self.admin,
        )

    # --- gating ----------------------------------------------------------
    def test_deferred_when_bridge_not_enabled(self):
        tx = self._deduction_tx()
        before = JournalEntry.objects.count()
        result = post_security_deposit_damage_deduction(tx, performed_by=self.admin)
        self.assertEqual(result["status"], "DEFERRED")
        self.assertEqual(JournalEntry.objects.count(), before)
        self.assertFalse(
            AccountingBridgePosting.objects.filter(
                source_model="RentLeaseDepositTransaction",
                source_id=str(tx.id),
                purpose=PURPOSE_SECURITY_DEPOSIT_DAMAGE_DEDUCTION,
            ).exists()
        )

    def test_skipped_for_non_deduction_transaction(self):
        collected = self.sub.deposit_transactions.filter(
            transaction_type=RentLeaseDepositTransactionType.COLLECTED
        ).first()
        result = post_security_deposit_damage_deduction(collected, performed_by=self.admin)
        self.assertEqual(result["status"], "SKIPPED")

    # --- happy path + accounting -----------------------------------------
    def test_posts_to_canonical_bridge_when_enabled(self):
        _enable_bridge()
        tx = self._deduction_tx("1000.00")
        result = post_security_deposit_damage_deduction(tx, performed_by=self.admin)
        self.assertEqual(result["status"], "POSTED")

        bridge = AccountingBridgePosting.objects.get(
            source_model="RentLeaseDepositTransaction",
            source_id=str(tx.id),
            purpose=PURPOSE_SECURITY_DEPOSIT_DAMAGE_DEDUCTION,
        )
        journal = bridge.journal_entry
        lines = list(journal.lines.all())
        debit = next(l for l in lines if l.debit_amount and l.debit_amount > 0)
        credit = next(l for l in lines if l.credit_amount and l.credit_amount > 0)
        # Dr Security Deposit Liability / Cr Damage Recovery Income
        self.assertEqual(debit.chart_account.system_code, "SECURITY_DEPOSIT_LIABILITY")
        self.assertEqual(credit.chart_account.system_code, "DAMAGE_RECOVERY")
        self.assertEqual(debit.debit_amount, Decimal("1000.00"))
        self.assertEqual(credit.credit_amount, Decimal("1000.00"))

    def test_trace_metadata_present(self):
        _enable_bridge()
        tx = self._deduction_tx("750.00")
        post_security_deposit_damage_deduction(tx, performed_by=self.admin)
        bridge = AccountingBridgePosting.objects.get(
            source_model="RentLeaseDepositTransaction",
            source_id=str(tx.id),
            purpose=PURPOSE_SECURITY_DEPOSIT_DAMAGE_DEDUCTION,
        )
        meta = bridge.trace_metadata
        self.assertEqual(meta["deposit_transaction_id"], tx.id)
        self.assertEqual(meta["subscription_id"], self.sub.id)
        self.assertEqual(meta["customer_id"], self.customer.id)
        self.assertEqual(meta["plan_type"], self.sub.plan_type)
        self.assertEqual(meta["amount"], "750.00")
        self.assertEqual(bridge.voucher_type, "RENT_LEASE")

    def test_idempotent_no_duplicate_journal(self):
        _enable_bridge()
        tx = self._deduction_tx("500.00")
        first = post_security_deposit_damage_deduction(tx, performed_by=self.admin)
        journals_after_first = JournalEntry.objects.count()
        second = post_security_deposit_damage_deduction(tx, performed_by=self.admin)
        self.assertEqual(first["status"], "POSTED")
        self.assertEqual(second["status"], "ALREADY_POSTED")
        self.assertEqual(JournalEntry.objects.count(), journals_after_first)
        self.assertEqual(
            AccountingBridgePosting.objects.filter(
                source_model="RentLeaseDepositTransaction",
                source_id=str(tx.id),
                purpose=PURPOSE_SECURITY_DEPOSIT_DAMAGE_DEDUCTION,
            ).count(),
            1,
        )

    # --- controlled BLOCKED (no 500) -------------------------------------
    def test_blocked_when_accounting_period_locked(self):
        _enable_bridge()
        create_locked_accounting_period(self.today, performed_by=self.admin)
        tx = self._deduction_tx("400.00")
        before = JournalEntry.objects.count()
        result = post_security_deposit_damage_deduction(tx, performed_by=self.admin)
        self.assertEqual(result["status"], "BLOCKED")
        self.assertEqual(JournalEntry.objects.count(), before)

    # --- wiring + compatibility wrapper ----------------------------------
    def test_record_damage_deduction_deferred_by_default(self):
        before = JournalEntry.objects.count()
        record_damage_deduction(
            subscription=self.sub,
            amount=Decimal("600.00"),
            reason="Stain",
            performed_by=self.admin,
        )
        # Default config disabled -> no journal, but the deduction is recorded.
        self.assertEqual(JournalEntry.objects.count(), before)
        self.assertTrue(
            self.sub.deposit_transactions.filter(
                transaction_type=RentLeaseDepositTransactionType.DEDUCTION,
                amount=Decimal("600.00"),
            ).exists()
        )

    def test_record_damage_deduction_posts_when_enabled(self):
        _enable_bridge()
        record_damage_deduction(
            subscription=self.sub,
            amount=Decimal("800.00"),
            reason="Crack",
            performed_by=self.admin,
        )
        deduction = self.sub.deposit_transactions.get(
            transaction_type=RentLeaseDepositTransactionType.DEDUCTION,
            amount=Decimal("800.00"),
        )
        self.assertTrue(
            AccountingBridgePosting.objects.filter(
                source_model="RentLeaseDepositTransaction",
                source_id=str(deduction.id),
                purpose=PURPOSE_SECURITY_DEPOSIT_DAMAGE_DEDUCTION,
            ).exists()
        )

    def test_legacy_sync_wrapper_delegates_to_canonical(self):
        _enable_bridge()
        tx = self._deduction_tx("250.00")
        result = sync_damage_deduction_income(
            subscription=self.sub, amount=Decimal("250.00"), performed_by=self.admin
        )
        self.assertEqual(result["status"], "POSTED")
        self.assertEqual(result["source_model"], "RentLeaseDepositTransaction")
        self.assertTrue(
            AccountingBridgePosting.objects.filter(
                source_model="RentLeaseDepositTransaction",
                source_id=str(tx.id),
                purpose=PURPOSE_SECURITY_DEPOSIT_DAMAGE_DEDUCTION,
            ).exists()
        )


class ReconcileCommandTests(TestCase):
    def setUp(self):
        super().setUp()
        self.today = timezone.localdate()
        self.admin = create_admin_user(username="dmg_cmd_admin", phone="9920000001")
        self.env = seed_bridge_ready_environment(self.today, performed_by=self.admin)
        self.customer = create_customer_profile(name="Cmd Cust", phone="7920000001")
        self.product = _rent_product(code="RENT-DMG-CMD")
        self.sub = create_rent_contract(
            customer=self.customer,
            product=self.product,
            tenure_months=12,
            security_deposit_percent=Decimal("20.00"),
            performed_by=self.admin,
            start_date=self.today,
        )
        self.demand = collect_security_deposit(
            subscription=self.sub, amount=Decimal("3000.00"), performed_by=self.admin
        )
        self.tx = RentLeaseDepositTransaction.objects.create(
            subscription=self.sub,
            demand=self.demand,
            transaction_type=RentLeaseDepositTransactionType.DEDUCTION,
            amount=Decimal("1000.00"),
            reason="Damage",
            performed_by=self.admin,
        )

    def test_dry_run_does_not_post(self):
        _enable_bridge()
        out = StringIO()
        before = AccountingBridgePosting.objects.count()
        call_command("reconcile_rent_lease_accounting_bridge", stdout=out)
        self.assertEqual(AccountingBridgePosting.objects.count(), before)
        self.assertIn("eligible", out.getvalue())
        self.assertIn("DRY RUN", out.getvalue())

    def test_execute_posts_eligible(self):
        _enable_bridge()
        out = StringIO()
        call_command(
            "reconcile_rent_lease_accounting_bridge", "--execute", stdout=out
        )
        self.assertTrue(
            AccountingBridgePosting.objects.filter(
                source_model="RentLeaseDepositTransaction",
                source_id=str(self.tx.id),
                purpose=PURPOSE_SECURITY_DEPOSIT_DAMAGE_DEDUCTION,
            ).exists()
        )

    def test_execute_deferred_when_bridge_disabled(self):
        # Bridge not enabled -> command runs cleanly, posts nothing (deferred).
        out = StringIO()
        call_command(
            "reconcile_rent_lease_accounting_bridge", "--execute", stdout=out
        )
        self.assertFalse(
            AccountingBridgePosting.objects.filter(
                source_model="RentLeaseDepositTransaction",
                source_id=str(self.tx.id),
                purpose=PURPOSE_SECURITY_DEPOSIT_DAMAGE_DEDUCTION,
            ).exists()
        )
