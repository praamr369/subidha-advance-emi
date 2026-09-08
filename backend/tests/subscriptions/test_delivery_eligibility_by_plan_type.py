"""Delivery eligibility is plan-specific.

Advance EMI (Lucky Plan) releases the asset once the plan is substantially
pre-paid or the customer wins the draw. RENT and LEASE hand the asset over at
the START of the term against a collected security deposit — they raise no EMI
rows at all, so applying the EMI threshold to them blocks every rent contract
forever.

These tests pin that split so the rent/lease gate cannot silently regress back
to the EMI rule.
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal

from django.test import TestCase

from contracts.services.rent_lease_contract_service import (
    create_lease_contract,
    create_rent_contract,
)
from deliveries.services.delivery_service import check_delivery_eligibility
from payments.models import RentLeaseBillingDemand
from subscriptions.enums import RentLeaseDemandType
from subscriptions.models import Product
from tests.helpers import (
    create_admin_user,
    create_customer_profile,
    create_product,
)


def _rentable_product(code="DEG-RENT-1"):
    product = create_product(name="Delivery Gate Bed", product_code=code)
    Product.objects.filter(pk=product.pk).update(
        is_rent_enabled=True,
        is_lease_enabled=True,
    )
    product.refresh_from_db()
    return product


class RentLeaseDeliveryEligibilityTests(TestCase):
    def setUp(self):
        self.admin = create_admin_user()
        self.customer = create_customer_profile()
        self.product = _rentable_product()

    def _rent_contract(self):
        return create_rent_contract(
            customer=self.customer,
            product=self.product,
            tenure_months=12,
            security_deposit_percent=Decimal("20.00"),
            performed_by=self.admin,
            save_as_draft=True,
        )

    def _deposit_demand(self, subscription, *, amount, collected):
        return RentLeaseBillingDemand.objects.create(
            subscription=subscription,
            demand_type=RentLeaseDemandType.SECURITY_DEPOSIT,
            due_date=date(2026, 1, 1),
            amount=Decimal(amount),
            collected_amount=Decimal(collected),
            reference_key=f"TEST-DEP-{subscription.id}",
        )

    def test_rent_uses_deposit_gate_not_emi_gate(self):
        subscription = self._rent_contract()
        result = check_delivery_eligibility(subscription)
        self.assertEqual(result.gate, "SECURITY_DEPOSIT")

    def test_rent_without_deposit_demand_is_not_eligible(self):
        subscription = self._rent_contract()
        RentLeaseBillingDemand.objects.filter(subscription=subscription).delete()
        result = check_delivery_eligibility(subscription)
        self.assertFalse(result.eligible)
        self.assertIn("No security deposit demand", result.reason)

    def test_rent_with_uncollected_deposit_is_not_eligible(self):
        subscription = self._rent_contract()
        RentLeaseBillingDemand.objects.filter(subscription=subscription).delete()
        self._deposit_demand(subscription, amount="4200.00", collected="0.00")
        result = check_delivery_eligibility(subscription)
        self.assertFalse(result.eligible)
        self.assertIn("not collected", result.reason)

    def test_rent_with_part_collected_deposit_is_not_eligible(self):
        subscription = self._rent_contract()
        RentLeaseBillingDemand.objects.filter(subscription=subscription).delete()
        self._deposit_demand(subscription, amount="4200.00", collected="1000.00")
        result = check_delivery_eligibility(subscription)
        self.assertFalse(result.eligible)
        self.assertIn("part-collected", result.reason)

    def test_rent_with_fully_collected_deposit_is_eligible(self):
        """The regression this suite exists for: a paid deposit releases delivery
        even though the contract has zero EMI rows."""
        subscription = self._rent_contract()
        RentLeaseBillingDemand.objects.filter(subscription=subscription).delete()
        self._deposit_demand(subscription, amount="4200.00", collected="4200.00")
        result = check_delivery_eligibility(subscription)
        self.assertTrue(result.eligible)
        self.assertEqual(result.total_emi_count, 0)
        self.assertEqual(result.deposit_collected, Decimal("4200.00"))
        self.assertIn("Security deposit collected", result.reason)

    def test_lease_uses_the_same_deposit_gate(self):
        subscription = create_lease_contract(
            customer=self.customer,
            product=self.product,
            tenure_months=12,
            security_deposit_percent=Decimal("25.00"),
            performed_by=self.admin,
            save_as_draft=True,
        )
        RentLeaseBillingDemand.objects.filter(subscription=subscription).delete()
        self._deposit_demand(subscription, amount="5250.00", collected="5250.00")
        result = check_delivery_eligibility(subscription)
        self.assertEqual(result.gate, "SECURITY_DEPOSIT")
        self.assertTrue(result.eligible)
