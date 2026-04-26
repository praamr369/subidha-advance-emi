from decimal import Decimal
import importlib.util

from django.core.exceptions import ValidationError
from django.db import models
from django.test import TestCase
from django.utils import timezone

from subscriptions.models import (
    PlanType,
    RentLeaseBillingDemand,
    RentLeaseDemandType,
    RentLeaseDepositTransactionType,
)
from subscriptions.services.contract_pdf_service import generate_contract_pdf_for_subscription
from subscriptions.services.rent_lease_billing_service import (
    collect_security_deposit,
    generate_monthly_demands_for_subscription,
    record_damage_deduction,
    record_deposit_refund,
)
from subscriptions.services.rent_lease_contract_service import (
    create_lease_contract,
    create_rent_contract,
)
from tests.helpers import create_admin_user, create_customer_profile, create_product


class RentLeaseBillingServiceTests(TestCase):
    def setUp(self):
        self.admin = create_admin_user(username="rl_admin", phone="9000010001")
        self.customer = create_customer_profile(name="Rent Lease Customer", phone="9000010002")

        self.rent_product = create_product(
            name="Rent Product",
            product_code="RL-RENT-001",
            base_price=Decimal("24000.00"),
        )
        self.rent_product.is_rent_enabled = True
        self.rent_product.save(update_fields=["is_rent_enabled"])

        self.lease_product = create_product(
            name="Lease Product",
            product_code="RL-LEASE-001",
            base_price=Decimal("36000.00"),
        )
        self.lease_product.is_lease_enabled = True
        self.lease_product.save(update_fields=["is_lease_enabled"])

    def test_rent_invoice_generation_is_idempotent(self):
        subscription = create_rent_contract(
            customer=self.customer,
            product=self.rent_product,
            tenure_months=6,
            start_date=timezone.localdate().replace(day=1),
            security_deposit_percent=Decimal("20.00"),
            performed_by=self.admin,
        )
        first = generate_monthly_demands_for_subscription(subscription=subscription, performed_by=self.admin)
        second = generate_monthly_demands_for_subscription(subscription=subscription, performed_by=self.admin)
        self.assertGreaterEqual(first["created_count"], 1)
        self.assertEqual(second["created_count"], 0)
        monthly_count = RentLeaseBillingDemand.objects.filter(
            subscription=subscription, demand_type=RentLeaseDemandType.RENT_MONTHLY
        ).count()
        self.assertEqual(monthly_count, first["created_count"])

    def test_lease_invoice_generation_is_idempotent(self):
        subscription = create_lease_contract(
            customer=self.customer,
            product=self.lease_product,
            tenure_months=8,
            start_date=timezone.localdate().replace(day=1),
            security_deposit_percent=Decimal("22.00"),
            performed_by=self.admin,
        )
        first = generate_monthly_demands_for_subscription(subscription=subscription, performed_by=self.admin)
        second = generate_monthly_demands_for_subscription(subscription=subscription, performed_by=self.admin)
        self.assertGreaterEqual(first["created_count"], 1)
        self.assertEqual(second["created_count"], 0)
        self.assertTrue(
            RentLeaseBillingDemand.objects.filter(
                subscription=subscription,
                demand_type=RentLeaseDemandType.SECURITY_DEPOSIT,
            ).exists()
        )

    def test_security_deposit_is_separate_from_monthly_income(self):
        subscription = create_rent_contract(
            customer=self.customer,
            product=self.rent_product,
            tenure_months=6,
            start_date=timezone.localdate().replace(day=1),
            security_deposit_percent=Decimal("25.00"),
            performed_by=self.admin,
        )
        generate_monthly_demands_for_subscription(subscription=subscription, performed_by=self.admin)
        collect_security_deposit(
            subscription=subscription,
            amount=Decimal("5000.00"),
            performed_by=self.admin,
            reference_no="DEP-5000",
        )
        deposit = RentLeaseBillingDemand.objects.get(
            subscription=subscription, demand_type=RentLeaseDemandType.SECURITY_DEPOSIT
        )
        monthly_total = (
            RentLeaseBillingDemand.objects.filter(
                subscription=subscription,
                demand_type=RentLeaseDemandType.RENT_MONTHLY,
            )
            .aggregate(total=models.Sum("collected_amount"))
            .get("total")
            or Decimal("0.00")
        )
        self.assertEqual(deposit.collected_amount, Decimal("5000.00"))
        self.assertEqual(monthly_total, Decimal("0.00"))

    def test_refund_cannot_exceed_refundable_deposit(self):
        subscription = create_lease_contract(
            customer=self.customer,
            product=self.lease_product,
            tenure_months=6,
            start_date=timezone.localdate().replace(day=1),
            security_deposit_percent=Decimal("20.00"),
            performed_by=self.admin,
        )
        generate_monthly_demands_for_subscription(subscription=subscription, performed_by=self.admin)
        collect_security_deposit(
            subscription=subscription,
            amount=Decimal("3000.00"),
            performed_by=self.admin,
            reference_no="DEP-3000",
        )
        with self.assertRaises(ValidationError):
            record_deposit_refund(
                subscription=subscription,
                amount=Decimal("3500.00"),
                performed_by=self.admin,
            )

    def test_deduction_requires_reason(self):
        subscription = create_rent_contract(
            customer=self.customer,
            product=self.rent_product,
            tenure_months=6,
            start_date=timezone.localdate().replace(day=1),
            security_deposit_percent=Decimal("20.00"),
            performed_by=self.admin,
        )
        generate_monthly_demands_for_subscription(subscription=subscription, performed_by=self.admin)
        collect_security_deposit(
            subscription=subscription,
            amount=Decimal("3000.00"),
            performed_by=self.admin,
            reference_no="DEP-3000-R",
        )
        with self.assertRaises(ValidationError):
            record_damage_deduction(
                subscription=subscription,
                amount=Decimal("500.00"),
                reason="",
                performed_by=self.admin,
            )

    def test_branded_pdf_version_created_for_rent_contract(self):
        subscription = create_rent_contract(
            customer=self.customer,
            product=self.rent_product,
            tenure_months=6,
            start_date=timezone.localdate().replace(day=1),
            security_deposit_percent=Decimal("20.00"),
            performed_by=self.admin,
        )
        if importlib.util.find_spec("reportlab") is None:
            self.skipTest("reportlab is not installed in this environment.")
        document = generate_contract_pdf_for_subscription(
            subscription=subscription,
            performed_by=self.admin,
        )
        self.assertEqual(subscription.plan_type, PlanType.RENT)
        self.assertEqual(document.document_version, 1)
        self.assertTrue(document.file.name)

    def test_deposit_deduction_is_auditable_transaction(self):
        subscription = create_lease_contract(
            customer=self.customer,
            product=self.lease_product,
            tenure_months=6,
            start_date=timezone.localdate().replace(day=1),
            security_deposit_percent=Decimal("20.00"),
            performed_by=self.admin,
        )
        generate_monthly_demands_for_subscription(subscription=subscription, performed_by=self.admin)
        collect_security_deposit(
            subscription=subscription,
            amount=Decimal("4000.00"),
            performed_by=self.admin,
            reference_no="DEP-4000-L",
        )
        record_damage_deduction(
            subscription=subscription,
            amount=Decimal("800.00"),
            reason="Surface damage",
            performed_by=self.admin,
        )
        self.assertTrue(
            subscription.deposit_transactions.filter(
                transaction_type=RentLeaseDepositTransactionType.DEDUCTION,
                amount=Decimal("800.00"),
            ).exists()
        )

