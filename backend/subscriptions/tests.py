from datetime import date
from decimal import Decimal
from io import StringIO

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase

from api.v1.serializers import subscription
from services.draws.run_monthly_draw import run_monthly_draw
from services.payments.allocate_payment import allocate_payment
from services.payments.record_payment import record_payment
from services.reconciliation.check_emi_integrity import check_emi_integrity
from services.reconciliation.check_subscription_integrity import check_subscription_integrity
from services.subscriptions.create_subscription import create_subscription
from subscriptions.models import Batch, BatchStatus, Customer, EmiStatus, FinancialLedger, Payment, PlanType, Product
from subscriptions.services.lucky_draw_service import create_lucky_draw_commit


class FinancialFlowTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.customer_user = User.objects.create_user(
            username="cust_fin", password="pass1234", role="CUSTOMER", phone="9800000011"
        )
        self.partner_user = User.objects.create_user(
            username="partner_fin", password="pass1234", role="PARTNER", phone="9800000012"
        )

        self.customer = Customer.objects.create(
            user=self.customer_user,
            name="Customer Fin",
            phone="9800000011",
        )
        self.product = Product.objects.create(
            product_code="PRD-FIN",
            name="Sofa",
            base_price=Decimal("1000.00"),
        )
        self.batch = Batch.objects.create(
            batch_code="BATCHFIN01",
            total_slots=100,
            duration_months=10,
            draw_day=5,
            start_date=date(2026, 1, 1),
            status=BatchStatus.OPEN,
        )

    def _create_subscription(self):
        return create_subscription(
            customer=self.customer,
            product=self.product,
            batch=self.batch,
            lucky_number=1,
            tenure_months=10,
            partner=self.partner_user,
            start_date=date(2026, 1, 1),
            performed_by=self.partner_user,
        )

    def test_subscription_total_matches_sum_of_emis(self):
        subscription = self._create_subscription()
        summary = check_subscription_integrity(subscription=subscription)

        self.assertTrue(summary["total_matches_emi_sum"])
        self.assertTrue(summary["is_consistent"])

        emi_total = sum((emi.amount for emi in subscription.emis.all()), start=Decimal("0.00"))
        self.assertEqual(subscription.total_amount, emi_total)

    def test_emi_amount_matches_paid_waived_outstanding(self):
        subscription = self._create_subscription()
        emi = subscription.emis.get(month_no=1)

        payment = record_payment(
            emi_id=emi.id,
            amount=Decimal("100.00"),
            method="CASH",
            payment_date=date(2026, 2, 1),
            reference_no="PAY-FIN-001",
            collected_by=self.partner_user,
        )
        allocate_payment(payment=payment)

        emi.refresh_from_db()
        emi_paid = sum((p.amount for p in emi.payments.all()), start=Decimal("0.00"))
        emi_waived = emi.amount if emi.status == EmiStatus.WAIVED else Decimal("0.00")
        emi_outstanding = emi.amount - emi_paid - emi_waived

        self.assertEqual(emi.amount, emi_paid + emi_waived + emi_outstanding)

    def test_subscription_snapshots_are_auto_populated(self):
        subscription = self._create_subscription()

        self.assertIsNotNone(subscription.product_snapshot)
        self.assertIsNotNone(subscription.pricing_snapshot)
        self.assertEqual(subscription.pricing_snapshot.get("plan_type"), PlanType.EMI)
        self.assertEqual(subscription.product_snapshot.get("product_id"), self.product.id)

    def test_payment_and_ledger_plan_type_hint_defaults_to_subscription_plan(self):
        subscription = self._create_subscription()
        emi = subscription.emis.get(month_no=1)

        payment = record_payment(
            emi_id=emi.id,
            amount=Decimal("100.00"),
            method="CASH",
            payment_date=date(2026, 2, 1),
            reference_no="PAY-FIN-PTYPE",
            collected_by=self.partner_user,
        )

        payment.refresh_from_db()
        self.assertEqual(payment.plan_type_hint, PlanType.EMI)

        ledger = FinancialLedger.objects.get(payment=payment)
        self.assertEqual(ledger.plan_type_hint, PlanType.EMI)

    def test_payment_amount_matches_allocations(self):
        subscription = self._create_subscription()
        emi = subscription.emis.get(month_no=1)

        payment = record_payment(
            emi_id=emi.id,
            amount=Decimal("100.00"),
            method="CASH",
            payment_date=date(2026, 2, 1),
            reference_no="PAY-FIN-002",
            collected_by=self.partner_user,
        )

        allocation = allocate_payment(payment=payment)
        self.assertTrue(allocation["is_consistent"])
        self.assertEqual(
            Decimal(allocation["payment_amount"]),
            Decimal(allocation["allocation_total"]),
        )

        emi_integrity = check_emi_integrity(emi=emi)
        self.assertTrue(emi_integrity["is_payment_consistent"])

    def test_winner_waiver_affects_only_future_emis(self):
        subscription = self._create_subscription()

        self.batch.status = BatchStatus.FULL
        self.batch.save(update_fields=["status"])

        draw, committed_seed = create_lucky_draw_commit(batch=self.batch)

        run_monthly_draw(
            draw_id=draw.id,
            revealed_seed=committed_seed,
            performed_by=self.partner_user,
        )

        subscription.refresh_from_db()
        past_or_current = subscription.emis.filter(month_no__lte=draw.draw_month)
        future = subscription.emis.filter(month_no__gt=draw.draw_month)

        self.assertFalse(past_or_current.filter(status=EmiStatus.WAIVED).exists())
        self.assertFalse(future.exclude(status=EmiStatus.WAIVED).exists())


class ReconcileFinancialsCommandTests(FinancialFlowTests):
    def test_reconcile_financials_reports_inconsistencies(self):
        subscription = self._create_subscription()

        self.batch.status = BatchStatus.FULL
        self.batch.save(update_fields=["status"])

        draw, _ = create_lucky_draw_commit(batch=self.batch)

        subscription.total_amount = Decimal("999.00")
        subscription.save(update_fields=["total_amount"])

        out = StringIO()
        call_command("reconcile_financials", stdout=out)
        output = out.getvalue()

        self.assertIn(f"Subscription ID: {subscription.id}", output)
        self.assertIn("Consistent: false", output)
        self.assertIn("Inconsistencies:", output)

    def test_reconcile_financials_only_inconsistent_filter(self):
        inconsistent = self._create_subscription()
        inconsistent.total_amount = Decimal("123.00")
        inconsistent.save(update_fields=["total_amount"])

        clean = create_subscription(
            customer=self.customer,
            product=self.product,
            batch=self.batch,
            lucky_number=2,
            tenure_months=10,
            partner=self.partner_user,
            start_date=date(2026, 1, 1),
            performed_by=self.partner_user,
        )

        out = StringIO()
        call_command("reconcile_financials", "--only-inconsistent", stdout=out)
        output = out.getvalue()

        self.assertIn(f"Subscription ID: {inconsistent.id}", output)
        self.assertNotIn(f"Subscription ID: {clean.id}", output)

    def test_reconcile_financials_subscription_and_batch_filters(self):
        matching = self._create_subscription()

        other_batch = Batch.objects.create(
            batch_code="BATCHFIN02",
            total_slots=100,
            duration_months=10,
            draw_day=6,
            start_date=date(2026, 2, 1),
            status=BatchStatus.OPEN,
        )
        create_subscription(
            customer=self.customer,
            product=self.product,
            batch=other_batch,
            lucky_number=1,
            tenure_months=10,
            partner=self.partner_user,
            start_date=date(2026, 2, 1),
            performed_by=self.partner_user,
        )

        out_by_subscription = StringIO()
        call_command(
            "reconcile_financials",
            "--subscription-id",
            str(matching.id),
            stdout=out_by_subscription,
        )
        self.assertIn(f"Subscription ID: {matching.id}", out_by_subscription.getvalue())

        out_by_batch = StringIO()
        call_command(
            "reconcile_financials",
            "--batch-id",
            str(other_batch.id),
            stdout=out_by_batch,
        )
        self.assertIn("Subscription ID:", out_by_batch.getvalue())
        self.assertNotIn(
            f"Subscription ID: {matching.id}",
            out_by_batch.getvalue(),
        )
