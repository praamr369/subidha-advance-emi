from datetime import date
from decimal import Decimal

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from accounting.models import (
    ChartOfAccount,
    ChartOfAccountType,
    FinanceAccount,
    FinanceAccountKind,
    JournalEntry,
    JournalEntryLine,
    JournalEntryStatus,
    JournalEntryType,
)
from accounting.services.books_service import build_cash_book
from accounting.services.reporting_service import build_finance_book
from contracts.services.rent_lease_collection_workflow_service import collect_rent_lease_monthly_demand
from payments.models import RentLeaseCollection
from subscriptions.models import (
    PlanType,
    RentLeaseBillingDemand,
    RentLeaseCollectionStatus,
    RentLeaseDemandStatus,
    RentLeaseDemandType,
    Subscription,
    SubscriptionStatus,
)
from tests.accounting.helpers import seed_bridge_ready_environment
from tests.helpers import (
    create_admin_user,
    create_customer_profile,
    create_product,
)


class UpiAndCashCollectionRoutingTests(TestCase):
    def setUp(self):
        super().setUp()
        self.today = timezone.localdate()
        self.admin = create_admin_user(username="upi_cash_admin", phone="9305160001")
        self.env = seed_bridge_ready_environment(self.today, performed_by=self.admin)
        self.cash_account = self.env["cash_account"]
        self.upi_account = self.env["finance_accounts"]["UPI"]
        self.bank_account = self.env["finance_accounts"]["BANK"]

        self.customer = create_customer_profile(name="Routing Customer", phone="9305160002")
        self.product = create_product(name="Routing Sofa", product_code="RT-SOFA", base_price=Decimal("20000.00"))
        self.product.is_rent_enabled = True
        self.product.save(update_fields=["is_rent_enabled"])

    def _create_subscription_and_demand(self, suffix="01"):
        subscription = Subscription.objects.create(
            customer=self.customer,
            product=self.product,
            plan_type=PlanType.RENT,
            tenure_months=6,
            start_date=self.today,
            total_amount=Decimal("12000.00"),
            monthly_amount=Decimal("2000.00"),
            status=SubscriptionStatus.ACTIVE,
            subscription_number=f"RENT-ROUTE-{suffix}",
            waived_amount=Decimal("0.00"),
        )
        demand = RentLeaseBillingDemand.objects.create(
            subscription=subscription,
            demand_type=RentLeaseDemandType.RENT_MONTHLY,
            status=RentLeaseDemandStatus.PENDING,
            billing_period_start=date(self.today.year, self.today.month, 1),
            billing_period_end=date(self.today.year, self.today.month, 28),
            due_date=self.today,
            amount=Decimal("2000.00"),
            collected_amount=Decimal("0.00"),
            reference_key=f"DEMAND-ROUTE-{suffix}",
        )
        return subscription, demand

    def test_upi_rent_collection_routes_to_bank_book_and_excludes_from_cash_book(self):
        sub, demand = self._create_subscription_and_demand("UPI")

        # Intentionally pass cash_account.id with payment_method="UPI".
        # The service must guard and auto-correct to the Bank/UPI finance account!
        collect_rent_lease_monthly_demand(
            subscription=sub,
            demand_id=demand.id,
            amount=Decimal("2000.00"),
            performed_by=self.admin,
            reference_no="UPI-REF-12345",
            finance_account_id=self.cash_account.id,
            payment_method="UPI",
            payment_date=self.today,
            idempotency_key="idemp-upi-001",
        )

        collection = RentLeaseCollection.objects.get(external_reference_no="UPI-REF-12345")
        self.assertIn(collection.finance_account.kind, {FinanceAccountKind.BANK, FinanceAccountKind.UPI})

        # Check posted journal entry
        journal = JournalEntry.objects.filter(
            source_model="Subscription",
            source_id=str(sub.id),
        ).exclude(status=JournalEntryStatus.VOID).first()
        self.assertIsNotNone(journal)

        debit_line = journal.lines.filter(debit_amount__gt=Decimal("0.00")).first()
        self.assertIsNotNone(debit_line)
        # Debit line must NOT be the cash chart account
        self.assertNotEqual(debit_line.chart_account_id, self.cash_account.chart_account_id)
        # Debit line must be the UPI or Bank chart account
        self.assertIn(debit_line.chart_account_id, {self.upi_account.chart_account_id, self.bank_account.chart_account_id})

        # Check Cash Book - MUST BE EMPTY or NOT have this entry
        cash_book = build_cash_book(start_date=self.today, end_date=self.today)
        cash_entry_nos = [r["entry_no"] for r in cash_book["rows"]]
        self.assertNotIn(journal.entry_no, cash_entry_nos)

        # Check Bank Book - MUST CONTAIN this entry
        bank_book = build_finance_book(kinds=["BANK", "UPI"], start_date=self.today, end_date=self.today)
        bank_entry_nos = [r["entry_no"] for r in bank_book["rows"]]
        self.assertIn(journal.entry_no, bank_entry_nos)

    def test_cash_rent_collection_routes_to_cash_desk_and_appears_in_cash_book(self):
        sub, demand = self._create_subscription_and_demand("CASH")

        collect_rent_lease_monthly_demand(
            subscription=sub,
            demand_id=demand.id,
            amount=Decimal("2000.00"),
            performed_by=self.admin,
            reference_no="CASH-REF-54321",
            finance_account_id=self.cash_account.id,
            payment_method="CASH",
            payment_date=self.today,
            idempotency_key="idemp-cash-001",
        )

        collection = RentLeaseCollection.objects.get(external_reference_no="CASH-REF-54321")
        self.assertEqual(collection.finance_account.kind, FinanceAccountKind.CASH)

        journal = JournalEntry.objects.filter(
            source_model="Subscription",
            source_id=str(sub.id),
        ).exclude(status=JournalEntryStatus.VOID).first()
        self.assertIsNotNone(journal)

        debit_line = journal.lines.filter(debit_amount__gt=Decimal("0.00")).first()
        self.assertEqual(debit_line.chart_account_id, self.cash_account.chart_account_id)

        # Check Cash Book - MUST CONTAIN this entry
        cash_book = build_cash_book(start_date=self.today, end_date=self.today)
        cash_entry_nos = [r["entry_no"] for r in cash_book["rows"]]
        self.assertIn(journal.entry_no, cash_entry_nos)

        # Check Bank Book - MUST NOT CONTAIN this entry
        bank_book = build_finance_book(kinds=["BANK", "UPI"], start_date=self.today, end_date=self.today)
        bank_entry_nos = [r["entry_no"] for r in bank_book["rows"]]
        self.assertNotIn(journal.entry_no, bank_entry_nos)

    def test_realign_command_reclassifies_misclassified_entry(self):
        sub, demand = self._create_subscription_and_demand("MISCLASS")

        # Simulate a legacy misclassified collection and journal
        collection = RentLeaseCollection.objects.create(
            subscription=sub,
            demand=demand,
            customer=self.customer,
            plan_type=PlanType.RENT,
            collection_number="RLC-TEST-MISCLASS",
            amount=Decimal("1500.00"),
            payment_date=self.today,
            payment_method="UPI",
            finance_account=self.cash_account,  # Erroneously linked to cash desk
            external_reference_no="REF-MISCLASS-999",
            status=RentLeaseCollectionStatus.ACTIVE,
        )

        period = self.env["accounting_period"]
        journal = JournalEntry.objects.create(
            entry_no="JV/FY2026-27/99999",
            entry_date=self.today,
            entry_type=JournalEntryType.SYSTEM_BRIDGE,
            accounting_period=period,
            financial_year=self.env["financial_year"],
            source_model="Subscription",
            source_id=str(sub.id),
            source_reference=f"COLLECTION:{collection.id}:TEST",
            source_type="RENT_LEASE_MONTHLY_PAYMENT",
            status=JournalEntryStatus.POSTED,
            posted_at=timezone.now(),
            memo=f"Rent/lease monthly collection for {sub.subscription_number}",
        )
        income_account, _ = ChartOfAccount.objects.get_or_create(
            code="TEST-RENT-INC",
            defaults={"name": "Test Rent Income", "account_type": ChartOfAccountType.INCOME, "is_active": True},
        )
        JournalEntryLine.objects.create(
            journal_entry=journal,
            chart_account=self.cash_account.chart_account,  # Erroneously debited to Cash
            debit_amount=Decimal("1500.00"),
            credit_amount=Decimal("0.00"),
            description="Debit cash desk",
        )
        JournalEntryLine.objects.create(
            journal_entry=journal,
            chart_account=income_account,  # Credit income
            debit_amount=Decimal("0.00"),
            credit_amount=Decimal("1500.00"),
            description="Credit income",
        )

        # Before realignment, it appears in Cash Book
        cash_book = build_cash_book(start_date=self.today, end_date=self.today)
        cash_entry_nos = [r["entry_no"] for r in cash_book["rows"]]
        self.assertIn("JV/FY2026-27/99999", cash_entry_nos)

        # Execute realignment management command with --apply
        call_command("realign_upi_cash_collections", entry_no="JV/FY2026-27/99999", apply=True)

        # After realignment, it must NOT appear in Cash Book
        cash_book_after = build_cash_book(start_date=self.today, end_date=self.today)
        cash_entry_nos_after = [r["entry_no"] for r in cash_book_after["rows"]]
        self.assertNotIn("JV/FY2026-27/99999", cash_entry_nos_after)

        # And must appear in Bank / UPI Book
        bank_book_after = build_finance_book(kinds=["BANK", "UPI"], start_date=self.today, end_date=self.today)
        bank_entry_nos_after = [r["entry_no"] for r in bank_book_after["rows"]]
        self.assertIn("JV/FY2026-27/99999", bank_entry_nos_after)

    def test_customer_advance_upi_collection_routes_to_bank_account(self):
        from payments.services.customer_advance_service import CustomerAdvanceService

        advance = CustomerAdvanceService.collect_unapplied_advance(
            customer_id=self.customer.id,
            amount=Decimal("3000.00"),
            method="UPI",
            finance_account_id=self.cash_account.id,  # Intentionally pass cash account
            collected_by=self.admin,
            reference_no="ADV-UPI-001",
            payment_date=self.today,
        )
        self.assertIn(advance.finance_account.kind, {FinanceAccountKind.BANK, FinanceAccountKind.UPI})

    def test_collection_router_upi_auto_corrects_and_routes_to_bank(self):
        from services.collection_router import route_collection

        sub, demand = self._create_subscription_and_demand("ROUTER-UPI")
        result = route_collection(
            source_type="RENT",
            source_id=sub.id,
            amount=Decimal("2000.00"),
            payment_method="UPI",
            finance_account_id=self.cash_account.id,  # Intentionally pass cash account
            collected_by=self.admin,
            reference_no="ROUTER-UPI-001",
            payment_date=self.today,
            idempotency_key="idemp-router-upi-001",
        )
        collection = RentLeaseCollection.objects.get(external_reference_no="ROUTER-UPI-001")
        self.assertIn(collection.finance_account.kind, {FinanceAccountKind.BANK, FinanceAccountKind.UPI})

    def test_accounting_bridge_rent_lease_collection_auto_resolves_channel(self):
        from accounting.services.accounting_bridge_rent_lease_collection_service import _lines

        sub, demand = self._create_subscription_and_demand("BRIDGE-UPI")
        collection = RentLeaseCollection.objects.create(
            subscription=sub,
            demand=demand,
            customer=self.customer,
            plan_type=PlanType.RENT,
            collection_number="RLC-TEST-BRIDGE-UPI",
            amount=Decimal("1200.00"),
            payment_date=self.today,
            payment_method="UPI",
            finance_account=self.cash_account,  # Linked to cash account
            external_reference_no="REF-BRIDGE-UPI-001",
            status=RentLeaseCollectionStatus.ACTIVE,
        )

        lines, warnings, resolved_fa = _lines(collection, "rent_payment_settlement")
        self.assertEqual(len(warnings), 0)
        self.assertIn(resolved_fa.kind, {FinanceAccountKind.BANK, FinanceAccountKind.UPI})
        self.assertIn(lines[0]["chart_account"].id, {self.upi_account.chart_account_id, self.bank_account.chart_account_id})
        self.assertNotEqual(lines[0]["chart_account"].id, self.cash_account.chart_account_id)

