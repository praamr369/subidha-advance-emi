from datetime import date
from decimal import Decimal

from django.apps import apps
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from subscriptions.models import (
    AuditLog,
    Batch,
    BatchStatus,
    ContractAmendment,
    Customer,
    Emi,
    LuckyId,
    Payment,
    PlanType,
    Product,
    Subscription,
    SubscriptionStatus,
)


class ContractAmendmentPhase4ProductChangeTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        User = get_user_model()
        self.admin = User.objects.create_user(username="phase4_admin", password="x", role="ADMIN", phone="9810000100")
        self.customer_user = User.objects.create_user(username="phase4_customer", password="x", role="CUSTOMER", phone="9810000101")
        self.partner_user = User.objects.create_user(username="phase4_partner", password="x", role="PARTNER", phone="9810000102")
        self.cashier = User.objects.create_user(username="phase4_cashier", password="x", role="CASHIER", phone="9810000103")
        self.vendor = User.objects.create_user(username="phase4_vendor", password="x", role="VENDOR", phone="9810000104")

        self.customer = Customer.objects.create(user=self.customer_user, name="Phase4 Customer", phone="9810000101")
        self.product = Product.objects.create(product_code="P4-PROD-1", name="Original Product", base_price=Decimal("20000.00"), is_active=True)
        self.batch = Batch.objects.create(batch_code="P4-BATCH-1", total_slots=100, duration_months=10, draw_day=5, start_date=date(2026, 1, 1), status=BatchStatus.OPEN)
        self.lucky_id = LuckyId.objects.filter(batch=self.batch, lucky_number=1).first() or LuckyId.objects.create(batch=self.batch, lucky_number=1)
        self.subscription = Subscription.objects.create(
            customer=self.customer,
            product=self.product,
            partner=self.partner_user,
            batch=self.batch,
            lucky_id=self.lucky_id,
            plan_type=PlanType.EMI,
            tenure_months=10,
            start_date=date(2026, 1, 1),
            total_amount=Decimal("20000.00"),
            monthly_amount=Decimal("2000.00"),
            status=SubscriptionStatus.ACTIVE,
        )

    def replacement_product(self, code="P4-PROD-2", price=Decimal("20000.00"), **overrides):
        payload = {"product_code": code, "name": code, "base_price": price, "is_active": True}
        payload.update(overrides)
        return Product.objects.create(**payload)

    def approved_product_amendment(self, target_product, **overrides):
        payload = {
            "subscription": self.subscription,
            "contract_type": "EMI_SUBSCRIPTION",
            "customer": self.customer,
            "partner": self.partner_user,
            "requested_by": self.customer_user,
            "requested_role": "CUSTOMER",
            "amendment_type": "PRODUCT_CHANGE",
            "status": "APPROVED",
            "requested_values": {"approved_product_id": target_product.id},
            "approved_values": {"approved_product_id": target_product.id, "approved_product_name": target_product.name},
            "reason": "Approved product reference change.",
            "approved_by": self.admin,
        }
        payload.update(overrides)
        return ContractAmendment.objects.create(**payload)

    def test_approved_product_change_updates_only_subscription_product(self):
        target_product = self.replacement_product()
        original_total = self.subscription.total_amount
        original_monthly = self.subscription.monthly_amount
        original_tenure = self.subscription.tenure_months
        original_batch_id = self.subscription.batch_id
        original_lucky_id = self.subscription.lucky_id_id
        payment_count = Payment.objects.count()
        emi_count = Emi.objects.count()
        receipt_model = apps.get_model("billing", "ReceiptDocument", require_ready=False)
        receipt_count = receipt_model.objects.count()
        amendment = self.approved_product_amendment(target_product)

        self.client.force_authenticate(self.admin)
        response = self.client.post(f"/api/v1/admin/contract-amendments/{amendment.id}/implement/", {}, format="json")

        self.assertEqual(response.status_code, 200, response.data)
        self.subscription.refresh_from_db()
        self.assertEqual(self.subscription.product_id, target_product.id)
        self.assertEqual(self.subscription.total_amount, original_total)
        self.assertEqual(self.subscription.monthly_amount, original_monthly)
        self.assertEqual(self.subscription.tenure_months, original_tenure)
        self.assertEqual(self.subscription.batch_id, original_batch_id)
        self.assertEqual(self.subscription.lucky_id_id, original_lucky_id)
        self.assertEqual(Payment.objects.count(), payment_count)
        self.assertEqual(Emi.objects.count(), emi_count)
        self.assertEqual(receipt_model.objects.count(), receipt_count)
        self.assertEqual(response.data["implemented_values"]["phase"], "PHASE_4_PRODUCT_REFERENCE_CHANGE")
        self.assertEqual(response.data["implemented_values"]["before"]["old_product_id"], self.product.id)
        self.assertEqual(response.data["implemented_values"]["after"]["new_product_id"], target_product.id)
        self.assertTrue(response.data["implemented_values"]["financial_invariants"]["total_amount_unchanged"])
        self.assertTrue(response.data["implemented_values"]["financial_invariants"]["monthly_amount_unchanged"])
        self.assertTrue(response.data["implemented_values"]["financial_invariants"]["tenure_months_unchanged"])
        self.assertTrue(AuditLog.objects.filter(action_type=AuditLog.ActionType.CONTRACT_AMENDMENT_IMPLEMENTED, metadata__phase="PHASE_4_PRODUCT_REFERENCE_CHANGE").exists())

        second = self.client.post(f"/api/v1/admin/contract-amendments/{amendment.id}/implement/", {}, format="json")
        self.assertEqual(second.status_code, 400)
        self.assertIn("already implemented", str(second.data).lower())

    def test_product_change_guards_reject_unsafe_requests(self):
        target_product = self.replacement_product()
        cases = [
            ({"status": "REQUESTED"}, "approved"),
            ({"approved_values": {}}, "approved_product_id"),
            ({"approved_values": {"approved_product_id": self.replacement_product("P4-INACTIVE", is_active=False).id}}, "inactive"),
            ({"approved_values": {"approved_product_id": self.replacement_product("P4-PRICE", price=Decimal("25000.00")).id}}, "recalculation"),
            ({"approved_values": {"approved_product_id": target_product.id, "total_amount": "1.00", "tenure_months": 99, "lucky_id": 1, "batch": 1, "payment": "x", "deposit": "x", "accounting": "x"}}, "cannot include"),
        ]
        for index, (overrides, expected) in enumerate(cases):
            with self.subTest(expected=expected):
                amendment = self.approved_product_amendment(self.replacement_product(f"P4-CASE-{index}"), **overrides)
                self.client.force_authenticate(self.admin)
                response = self.client.post(f"/api/v1/admin/contract-amendments/{amendment.id}/implement/", {}, format="json")
                self.assertEqual(response.status_code, 400, response.data)
                self.assertIn(expected, str(response.data).lower())
                self.subscription.refresh_from_db()
                self.assertEqual(self.subscription.product_id, self.product.id)

    def test_terminal_subscription_product_change_is_rejected(self):
        target_product = self.replacement_product("P4-TERM")
        Subscription.objects.filter(pk=self.subscription.pk).update(status=SubscriptionStatus.CANCELLED)
        amendment = self.approved_product_amendment(target_product)
        self.client.force_authenticate(self.admin)
        response = self.client.post(f"/api/v1/admin/contract-amendments/{amendment.id}/implement/", {}, format="json")
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn("terminal", str(response.data).lower())

    def test_non_admin_roles_cannot_call_product_change_implement(self):
        target_product = self.replacement_product("P4-ROLE")
        amendment = self.approved_product_amendment(target_product)
        for user in [self.customer_user, self.partner_user, self.cashier, self.vendor]:
            with self.subTest(role=user.role):
                self.client.force_authenticate(user)
                response = self.client.post(f"/api/v1/admin/contract-amendments/{amendment.id}/implement/", {}, format="json")
                self.assertEqual(response.status_code, 403)
        self.subscription.refresh_from_db()
        self.assertEqual(self.subscription.product_id, self.product.id)
