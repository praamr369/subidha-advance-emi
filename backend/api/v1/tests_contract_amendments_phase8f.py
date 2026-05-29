from datetime import date
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from subscriptions.models import (
    ContractAmendment, Customer, PlanType, Product, Subscription, SubscriptionStatus
)

class ContractAmendmentPhase8fApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        User = get_user_model()
        self.admin = User.objects.create_user(username="phase8f_admin", password="password", role="ADMIN", phone="9800000801")
        self.customer_user = User.objects.create_user(username="phase8f_customer", password="password", role="CUSTOMER", phone="9800000802")
        
        self.customer = Customer.objects.create(user=self.customer_user, name="Phase 8F Customer", phone="9800000800")
        self.product = Product.objects.create(product_code="PH8F-PROD", name="Phase 8F Product", base_price=Decimal("10000.00"), is_active=True)
        
        self.subscription = Subscription.objects.create(
            customer=self.customer,
            product=self.product,
            plan_type=PlanType.RENT,
            tenure_months=10,
            start_date=date(2026, 1, 1),
            total_amount=Decimal("10000.00"),
            monthly_amount=Decimal("1000.00"),
            status=SubscriptionStatus.ACTIVE,
        )

    def test_deposit_security_amendment_is_classified_as_preview(self):
        amendment = ContractAmendment.objects.create(
            rent_lease_contract=self.subscription,
            contract_type="RENT_LEASE",
            customer=self.customer,
            requested_by=self.customer_user,
            requested_role="CUSTOMER",
            amendment_type="DEPOSIT_ADJUSTMENT",
            reason="Want refund.",
            requested_values={"deposit_amount": "5000.00"}
        )
        
        self.client.force_authenticate(self.admin)
        response = self.client.get(f"/api/v1/admin/contract-amendments/{amendment.id}/")
        
        self.assertEqual(response.status_code, 200)
        capability = response.data["workflow_capability"]
        self.assertEqual(capability["category"], "DEPOSIT_SECURITY_PREVIEW")
        self.assertFalse(capability["can_execute_directly"])
        self.assertTrue(capability.get("requires_preview", False))
        self.assertIn("Execution is not enabled yet.", capability["blocked_reason"])

    def test_preview_returns_correct_values_and_is_blocked(self):
        amendment = ContractAmendment.objects.create(
            rent_lease_contract=self.subscription,
            contract_type="RENT_LEASE",
            customer=self.customer,
            requested_by=self.customer_user,
            requested_role="CUSTOMER",
            amendment_type="DEPOSIT_ADJUSTMENT",
            reason="Want refund.",
            requested_values={"deposit_amount": "5000.00"}
        )
        
        self.client.force_authenticate(self.admin)
        response = self.client.get(f"/api/v1/admin/contract-amendments/{amendment.id}/deposit-security-preview/")
        
        self.assertEqual(response.status_code, 200, response.data)
        preview = response.data
        self.assertEqual(preview["requested_deposit_amount"], "5000.00")
        self.assertFalse(preview["execution_supported"])
        self.assertIn("Execution is not enabled yet.", preview["blocker_reasons"][0])

    def test_preview_blocks_terminal_subscription(self):
        self.subscription.status = SubscriptionStatus.CANCELLED
        self.subscription.save()

        amendment = ContractAmendment.objects.create(
            rent_lease_contract=self.subscription,
            contract_type="RENT_LEASE",
            customer=self.customer,
            requested_by=self.customer_user,
            requested_role="CUSTOMER",
            amendment_type="DEPOSIT_ADJUSTMENT",
            reason="Want refund.",
            requested_values={"deposit_amount": "5000.00"}
        )
        
        self.client.force_authenticate(self.admin)
        response = self.client.get(f"/api/v1/admin/contract-amendments/{amendment.id}/deposit-security-preview/")
        
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn("blocked for terminal contract status", str(response.data["detail"]).lower())

    def test_legacy_apply_rejects_deposit_adjustment(self):
        amendment = ContractAmendment.objects.create(
            rent_lease_contract=self.subscription,
            contract_type="RENT_LEASE",
            customer=self.customer,
            requested_by=self.customer_user,
            requested_role="CUSTOMER",
            amendment_type="DEPOSIT_ADJUSTMENT",
            reason="Want refund.",
            status="APPROVED",
            requested_values={"deposit_amount": "5000.00"}
        )

        self.client.force_authenticate(self.admin)
        response = self.client.post(f"/api/v1/admin/contract-amendments/{amendment.id}/implement/")
        
        self.assertEqual(response.status_code, 400)
        self.assertIn("remain blocked", str(response.data["detail"]).lower())
