from datetime import date
from decimal import Decimal

from django.db import connection
from django.test import TestCase

from accounting.models import (
    AccountingPeriodStatus,
    ChartOfAccount,
    ChartOfAccountType,
    FinanceAccount,
    FinanceAccountKind,
    JournalEntry,
    JournalEntryStatus,
    RentLeaseAccountingAccountMapping,
)
from subscriptions.models import (
    Customer,
    PlanType,
    Product,
    RentLeaseBillingDemand,
    RentLeaseDemandStatus,
    RentLeaseDemandType,
    Subscription,
    SubscriptionStatus,
)
from subscriptions.services.rent_lease_accounting_posting_service import (
    execute_rent_lease_monthly_posting,
    get_rent_lease_accounting_readiness,
    preview_rent_lease_monthly_posting,
)
from subscriptions.services.rent_lease_posting_bridge_config_service import (
    ENABLE_RENT_LEASE_POSTING_CONFIRMATION,
    enable_rent_lease_posting_bridge,
)
from tests.helpers import (
    create_admin_user,
    create_customer_user,
    ensure_journal_numbering_profile_for_date,
    ensure_open_accounting_period_for_date,
)


class AccountingBridgePhaseDTests(TestCase):
    posting_date = date(2026, 6, 15)

    def setUp(self):
        self.admin = create_admin_user(username="phase_d_admin", phone="9850009901")
        customer_user = create_customer_user(username="phase_d_customer", phone="9850009902")
        self.customer = Customer.objects.create(user=customer_user, name="Phase D Customer", phone="9850009902")
        self.financial_year, self.period = ensure_open_accounting_period_for_date(
            self.posting_date,
            performed_by=self.admin,
        )
        ensure_journal_numbering_profile_for_date(self.posting_date, performed_by=self.admin)
        self._setup_mapping()
        self.demand = self._create_demand()

    def _setup_mapping(self):
        self.settlement_coa = ChartOfAccount.objects.create(
            code="PHD-CASH",
            name="Phase D Cash",
            account_type=ChartOfAccountType.ASSET,
            is_active=True,
        )
        self.rent_income = ChartOfAccount.objects.create(
            code="PHD-RENT",
            name="Phase D Rent Income",
            account_type=ChartOfAccountType.INCOME,
            is_active=True,
        )
        self.deposit_liability = ChartOfAccount.objects.create(
            code="PHD-DEP",
            name="Phase D Deposit Liability",
            account_type=ChartOfAccountType.LIABILITY,
            is_active=True,
        )
        self.deposit_refund = ChartOfAccount.objects.create(
            code="PHD-REF",
            name="Phase D Deposit Refund Asset",
            account_type=ChartOfAccountType.ASSET,
            is_active=True,
        )
        self.damage_income = ChartOfAccount.objects.create(
            code="PHD-DMG",
            name="Phase D Damage Recovery",
            account_type=ChartOfAccountType.INCOME,
            is_active=True,
        )
        self.finance_account = FinanceAccount.objects.create(
            name="Phase D Cash Counter",
            kind=FinanceAccountKind.CASH,
            chart_account=self.settlement_coa,
            is_real_settlement_account=True,
            is_active=True,
        )
        mapping = RentLeaseAccountingAccountMapping.objects.create(
            monthly_income_account=self.rent_income,
            deposit_liability_account=self.deposit_liability,
            deposit_refund_account=self.deposit_refund,
            damage_recovery_income_account=self.damage_income,
            settlement_finance_account=self.finance_account,
            is_active=True,
        )
        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE accounting_rent_lease_account_mappings
                SET rent_income_account_id = %s,
                    lease_income_account_id = %s,
                    customer_advance_liability_account_id = %s
                WHERE id = %s
                """,
                [self.rent_income.id, self.rent_income.id, self.deposit_liability.id, mapping.id],
            )

    def _create_demand(self):
        product = Product.objects.create(
            product_code="PHD-RENT-PROD",
            name="Phase D Rent Product",
            base_price=Decimal("12000.00"),
            is_active=True,
            is_rent_enabled=True,
        )
        subscription = Subscription.objects.create(
            customer=self.customer,
            product=product,
            plan_type=PlanType.RENT,
            tenure_months=12,
            start_date=date(2026, 6, 1),
            total_amount=Decimal("12000.00"),
            monthly_amount=Decimal("1000.00"),
            status=SubscriptionStatus.ACTIVE,
        )
        return RentLeaseBillingDemand.objects.create(
            subscription=subscription,
            demand_type=RentLeaseDemandType.RENT_MONTHLY,
            status=RentLeaseDemandStatus.PAID,
            billing_period_start=date(2026, 6, 1),
            billing_period_end=date(2026, 6, 30),
            due_date=self.posting_date,
            amount=Decimal("1000.00"),
            collected_amount=Decimal("1000.00"),
            reference_key="PHD-RENT-JUN-2026",
        )

    def _operational_posting_count(self):
        with connection.cursor() as cursor:
            cursor.execute("SELECT COUNT(*) FROM accounting_operational_accounting_postings")
            return cursor.fetchone()[0]

    def _enable_bridge(self):
        enable_rent_lease_posting_bridge(
            self.admin,
            reason="Phase D test enablement.",
            confirmation=ENABLE_RENT_LEASE_POSTING_CONFIRMATION,
        )

    def test_readiness_reports_missing_active_financial_year_without_journal_mutation(self):
        self.financial_year.is_active = False
        self.financial_year.save(update_fields=["is_active", "updated_at"])

        before_journals = JournalEntry.objects.count()
        before_postings = self._operational_posting_count()
        readiness = get_rent_lease_accounting_readiness(auto_create=False)

        self.assertFalse(readiness["financial_year_ready"])
        self.assertFalse(readiness["posting_controls_ready"])
        self.assertIn("financial year", " ".join(readiness["blockers"]).lower())
        self.assertEqual(JournalEntry.objects.count(), before_journals)
        self.assertEqual(self._operational_posting_count(), before_postings)

    def test_readiness_reports_missing_accounting_period(self):
        self.period.delete()

        readiness = get_rent_lease_accounting_readiness(auto_create=False)

        self.assertFalse(readiness["accounting_period_ready"])
        self.assertFalse(readiness["posting_controls_ready"])
        self.assertIn("period", " ".join(readiness["blockers"]).lower())

    def test_preview_blocked_for_locked_period_and_does_not_create_journal_or_posting_row(self):
        self.period.status = AccountingPeriodStatus.LOCKED
        self.period.is_locked = True
        self.period.save(update_fields=["status", "is_locked", "updated_at"])

        before_journals = JournalEntry.objects.count()
        before_postings = self._operational_posting_count()
        preview = preview_rent_lease_monthly_posting(self.demand.id, actor=self.admin)

        self.assertFalse(preview["postable"])
        self.assertEqual(preview["accounting_period_status"], AccountingPeriodStatus.LOCKED)
        self.assertIn("locked", preview["blocked_reason"].lower())
        self.assertEqual(JournalEntry.objects.count(), before_journals)
        self.assertEqual(self._operational_posting_count(), before_postings)

    def test_preview_blocked_for_closed_period_and_does_not_create_journal(self):
        self.period.status = AccountingPeriodStatus.CLOSED
        self.period.is_locked = True
        self.period.save(update_fields=["status", "is_locked", "updated_at"])

        before_journals = JournalEntry.objects.count()
        preview = preview_rent_lease_monthly_posting(self.demand.id, actor=self.admin)

        self.assertFalse(preview["postable"])
        self.assertEqual(preview["accounting_period_status"], AccountingPeriodStatus.CLOSED)
        self.assertIn("closed", preview["blocked_reason"].lower())
        self.assertEqual(JournalEntry.objects.count(), before_journals)

    def test_execute_posts_through_controlled_journal_service_with_period_context(self):
        self._enable_bridge()

        result = execute_rent_lease_monthly_posting(self.demand.id, actor=self.admin)
        journal = JournalEntry.objects.get(pk=result["journal_entry_id"])

        self.assertEqual(result["status"], "POSTED")
        self.assertEqual(journal.status, JournalEntryStatus.POSTED)
        self.assertEqual(journal.entry_date, self.posting_date)
        self.assertEqual(journal.financial_year_id, self.financial_year.id)
        self.assertEqual(journal.accounting_period_id, self.period.id)
        self.assertTrue(journal.entry_no.startswith("JV/"))

    def test_execute_is_idempotent_and_preserves_existing_journal_number(self):
        self._enable_bridge()

        first = execute_rent_lease_monthly_posting(self.demand.id, actor=self.admin)
        journal = JournalEntry.objects.get(pk=first["journal_entry_id"])
        original_entry_no = journal.entry_no
        second = execute_rent_lease_monthly_posting(self.demand.id, actor=self.admin)
        journal.refresh_from_db()

        self.assertEqual(second["status"], "POSTED")
        self.assertEqual(second["journal_entry_id"], journal.id)
        self.assertEqual(journal.entry_no, original_entry_no)
        self.assertEqual(
            JournalEntry.objects.filter(
                source_model="RentLeaseBillingDemand",
                source_id=str(self.demand.id),
                source_type="RENT_MONTHLY_COLLECTION",
            ).exclude(status=JournalEntryStatus.VOID).count(),
            1,
        )
