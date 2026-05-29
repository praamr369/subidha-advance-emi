from datetime import date
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from subscriptions.models import (
    Batch, BatchStatus, ContractAmendment, Customer,
    LuckyId, PlanType, Product, Subscription, SubscriptionStatus
)

class ContractAmendmentPhase8dApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        User = get_user_model()
        self.admin = User.objects.create_user(username="phase8d_admin", password="password", role="ADMIN", phone="9800000801")
        self.customer_user = User.objects.create_user(username="phase8d_customer", password="password", role="CUSTOMER", phone="9800000802")
        
        self.customer = Customer.objects.create(user=self.customer_user, name="Phase 8D Customer", phone="9800000800")
        self.product = Product.objects.create(product_code="PH8D-PROD", name="Phase 8D Product", base_price=Decimal("10000.00"), is_active=True)
        
        self.batch = Batch.objects.create(
            batch_code="PH8D-BATCH", total_slots=100, duration_months=10, 
            draw_day=1, start_date=date(2026, 1, 1), status=BatchStatus.OPEN
        )
        
        self.lucky_id = LuckyId.objects.filter(batch=self.batch, lucky_number=1).first()
        if not self.lucky_id:
            self.lucky_id = LuckyId.objects.create(batch=self.batch, lucky_number=1)
            
        self.target_lucky_id = LuckyId.objects.filter(batch=self.batch, lucky_number=2).first()
        if not self.target_lucky_id:
            self.target_lucky_id = LuckyId.objects.create(batch=self.batch, lucky_number=2)
            
        self.unavailable_lucky_id = LuckyId.objects.filter(batch=self.batch, lucky_number=3).first()
        if not self.unavailable_lucky_id:
            self.unavailable_lucky_id = LuckyId.objects.create(batch=self.batch, lucky_number=3)

        self.subscription = Subscription.objects.create(
            customer=self.customer,
            product=self.product,
            batch=self.batch,
            lucky_id=self.lucky_id,
            plan_type=PlanType.EMI,
            tenure_months=10,
            start_date=date(2026, 1, 1),
            total_amount=Decimal("10000.00"),
            monthly_amount=Decimal("1000.00"),
            status=SubscriptionStatus.ACTIVE,
        )

        self.unavailable_subscription = Subscription.objects.create(
            customer=self.customer,
            product=self.product,
            batch=self.batch,
            lucky_id=self.unavailable_lucky_id,
            plan_type=PlanType.EMI,
            tenure_months=10,
            start_date=date(2026, 1, 1),
            total_amount=Decimal("10000.00"),
            monthly_amount=Decimal("1000.00"),
            status=SubscriptionStatus.ACTIVE,
        )

    def test_lucky_id_batch_amendment_is_classified_as_preview(self):
        amendment = ContractAmendment.objects.create(
            subscription=self.subscription,
            contract_type="EMI_SUBSCRIPTION",
            customer=self.customer,
            requested_by=self.customer_user,
            requested_role="CUSTOMER",
            amendment_type="LUCKY_ID_CHANGE",
            reason="Want another lucky ID.",
            requested_values={"lucky_number": 2}
        )
        
        self.client.force_authenticate(self.admin)
        response = self.client.get(f"/api/v1/admin/contract-amendments/{amendment.id}/")
        
        self.assertEqual(response.status_code, 200)
        capability = response.data["workflow_capability"]
        self.assertEqual(capability["category"], "LUCKY_ID_BATCH_PREVIEW")
        self.assertFalse(capability["can_execute_directly"])
        self.assertTrue(capability.get("requires_preview", False))

    def test_preview_returns_correct_ids_and_detects_availability(self):
        amendment = ContractAmendment.objects.create(
            subscription=self.subscription,
            contract_type="EMI_SUBSCRIPTION",
            customer=self.customer,
            requested_by=self.customer_user,
            requested_role="CUSTOMER",
            amendment_type="LUCKY_ID_CHANGE",
            reason="Want another lucky ID.",
            requested_values={"lucky_number": 2}
        )
        
        self.client.force_authenticate(self.admin)
        response = self.client.get(f"/api/v1/admin/contract-amendments/{amendment.id}/lucky-batch-preview/")
        
        self.assertEqual(response.status_code, 200, response.data)
        preview = response.data
        self.assertEqual(preview["current_batch_id"], self.batch.id)
        self.assertEqual(preview["current_lucky_number"], 1)
        self.assertEqual(preview["requested_lucky_number"], 2)
        self.assertEqual(preview["availability_status"], "AVAILABLE")
        self.assertFalse(preview["execution_supported"])

    def test_preview_detects_conflict(self):
        amendment = ContractAmendment.objects.create(
            subscription=self.subscription,
            contract_type="EMI_SUBSCRIPTION",
            customer=self.customer,
            requested_by=self.customer_user,
            requested_role="CUSTOMER",
            amendment_type="LUCKY_ID_CHANGE",
            reason="Want another lucky ID.",
            requested_values={"lucky_id": self.unavailable_lucky_id.id}
        )
        
        self.client.force_authenticate(self.admin)
        response = self.client.get(f"/api/v1/admin/contract-amendments/{amendment.id}/lucky-batch-preview/")
        
        self.assertEqual(response.status_code, 200, response.data)
        preview = response.data
        self.assertEqual(preview["availability_status"], "UNAVAILABLE")
        self.assertTrue(str(self.unavailable_subscription.id) in preview["ownership_conflict_status"])

    def test_preview_detects_missing_requested_lucky_id(self):
        amendment = ContractAmendment.objects.create(
            subscription=self.subscription,
            contract_type="EMI_SUBSCRIPTION",
            customer=self.customer,
            requested_by=self.customer_user,
            requested_role="CUSTOMER",
            amendment_type="LUCKY_ID_CHANGE",
            reason="Want another lucky ID.",
            requested_values={"lucky_number": 999}
        )
        
        self.client.force_authenticate(self.admin)
        response = self.client.get(f"/api/v1/admin/contract-amendments/{amendment.id}/lucky-batch-preview/")
        
        self.assertEqual(response.status_code, 200, response.data)
        preview = response.data
        self.assertEqual(preview["requested_lucky_number"], 999)
        self.assertIsNone(preview["requested_lucky_id"])
        self.assertIn("No valid requested batch or lucky ID found", preview["lifecycle_blocker_reason"])

    def test_preview_blocks_terminal_subscription(self):
        self.subscription.status = SubscriptionStatus.CANCELLED
        self.subscription.save()

        amendment = ContractAmendment.objects.create(
            subscription=self.subscription,
            contract_type="EMI_SUBSCRIPTION",
            customer=self.customer,
            requested_by=self.customer_user,
            requested_role="CUSTOMER",
            amendment_type="LUCKY_ID_CHANGE",
            reason="Want another lucky ID.",
            requested_values={"lucky_number": 2}
        )
        
        self.client.force_authenticate(self.admin)
        response = self.client.get(f"/api/v1/admin/contract-amendments/{amendment.id}/lucky-batch-preview/")
        
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn("blocked for terminal subscription status", str(response.data["detail"]).lower())
