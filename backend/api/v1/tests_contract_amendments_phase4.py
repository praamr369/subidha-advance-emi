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
            "reason": "Approved product reference correction.",
            "approved_by": self.admin,
        }
        payload.update(overrides)
        return ContractAmendment.objects.create(**payload)

    def _counts(self):
        receipt_model = apps.get_model("billing", "ReceiptDocument", require_ready=False)
        return {
            "payments": Payment.objects.count(),
            "emis": Emi.objects.count(),
            "receipts": receipt_model.objects.count(),
        }

    def assert_subscription_unchanged_except_product(self, *, expected_product_id=None, snapshot=None):
        self.subscription.refresh_from_db()
        if expected_product_id is not None:
            self.assertEqual(self.subscription.product_id, expected_product_id)
        self.assertEqual(self.subscription.total_amount, Decimal("20000.00"))
        self.assertEqual(self.subscription.monthly_amount, Decimal("2000.00"))
        self.assertEqual(self.subscription.tenure_months, 10)
        self.assertEqual(self.subscription.batch_id, self.batch.id)
        self.assertEqual(self.subscription.lucky_id_id, self.lucky_id.id)
        if snapshot:
            self.assertEqual(self._counts(), snapshot)

    def test_approved_product_reference_correction_updates_only_subscription_product(self):
        target_product = self.replacement_product()
        counts = self._counts()
        amendment = self.approved_product_amendment(target_product)

        self.client.force_authenticate(self.admin)
        response = self.client.post(f"/api/v1/admin/contract-amendments/{amendment.id}/implement/", {}, format="json")

        self.assertEqual(response.status_code, 200, response.data)
        self.assert_subscription_unchanged_except_product(expected_product_id=target_product.id, snapshot=counts)
        self.assertEqual(response.data["implemented_values"]["phase"], "PHASE_4_PRODUCT_REFERENCE_CORRECTION")
        self.assertEqual(response.data["implemented_values"]["semantics"], "PRODUCT_REFERENCE_CORRECTION_SAME_PRICE_ONLY")
        self.assertEqual(response.data["implemented_values"]["before"]["old_product_id"], self.product.id)
        self.assertEqual(response.data["implemented_values"]["after"]["new_product_id"], target_product.id)
        self.assertTrue(response.data["implemented_values"]["financial_invariants"]["total_amount_unchanged"])
        self.assertTrue(response.data["implemented_values"]["financial_invariants"]["monthly_amount_unchanged"])
        self.assertTrue(response.data["implemented_values"]["financial_invariants"]["tenure_months_unchanged"])
        self.assertTrue(AuditLog.objects.filter(action_type=AuditLog.ActionType.CONTRACT_AMENDMENT_IMPLEMENTED, metadata__phase="PHASE_4_PRODUCT_REFERENCE_CORRECTION").exists())

        second = self.client.post(f"/api/v1/admin/contract-amendments/{amendment.id}/implement/", {}, format="json")
        self.assertEqual(second.status_code, 400)
        self.assertIn("already implemented", str(second.data).lower())

    def test_legacy_apply_route_does_not_500_on_nullable_rent_lease_join(self):
        target_product = self.replacement_product("P4-LEGACY")
        amendment = self.approved_product_amendment(target_product)
        self.assertIsNone(amendment.rent_lease_contract_id)

        self.client.force_authenticate(self.admin)
        response = self.client.post(f"/api/v1/admin/contracts/amendments/{amendment.id}/apply/", {}, format="json")

        self.assertNotEqual(response.status_code, 500)
        self.assertIn(response.status_code, {200, 400})

    def test_product_reference_correction_guards_reject_unsafe_requests(self):
        target_product = self.replacement_product()
        cases = [
            ({"status": "REQUESTED"}, "approved"),
            ({"approved_values": {}}, "approved_product_id"),
            ({"approved_values": {"approved_product_id": self.replacement_product("P4-INACTIVE", is_active=False).id}}, "inactive"),
            ({"approved_values": {"approved_product_id": self.replacement_product("P4-PRICE", price=Decimal("25000.00")).id}}, "financial product change requires contract repricing preview and reconciliation"),
            ({"approved_values": {"approved_product_id": target_product.id, "new_total_amount": "1.00", "price_difference": "1.00", "extra_amount": "1.00", "refund_amount": "1.00", "adjustment_amount": "1.00", "recalculation": True, "payment_adjustment": "x", "accounting_adjustment": "x", "reconciliation_adjustment": "x", "tenure_months": 99}}, "cannot include"),
        ]
        for index, (overrides, expected) in enumerate(cases):
            with self.subTest(expected=expected):
                amendment = self.approved_product_amendment(self.replacement_product(f"P4-CASE-{index}"), **overrides)
                self.client.force_authenticate(self.admin)
                response = self.client.post(f"/api/v1/admin/contract-amendments/{amendment.id}/implement/", {}, format="json")
                self.assertEqual(response.status_code, 400, response.data)
                self.assertIn(expected, str(response.data).lower())
                self.assert_subscription_unchanged_except_product(expected_product_id=self.product.id)

    def test_terminal_subscription_product_reference_correction_is_rejected(self):
        target_product = self.replacement_product("P4-TERM")
        Subscription.objects.filter(pk=self.subscription.pk).update(status=SubscriptionStatus.CANCELLED)
        amendment = self.approved_product_amendment(target_product)
        self.client.force_authenticate(self.admin)
        response = self.client.post(f"/api/v1/admin/contract-amendments/{amendment.id}/implement/", {}, format="json")
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn("terminal", str(response.data).lower())

    def test_non_admin_roles_cannot_call_product_reference_correction_implement(self):
        target_product = self.replacement_product("P4-ROLE")
        amendment = self.approved_product_amendment(target_product)
        for user in [self.customer_user, self.partner_user, self.cashier, self.vendor]:
            with self.subTest(role=user.role):
                self.client.force_authenticate(user)
                response = self.client.post(f"/api/v1/admin/contract-amendments/{amendment.id}/implement/", {}, format="json")
                self.assertEqual(response.status_code, 403)
        self.assert_subscription_unchanged_except_product(expected_product_id=self.product.id)

    def test_recontract_preview_upgrade_returns_extra_payable_without_mutation(self):
        target_product = self.replacement_product("P4-UPGRADE", price=Decimal("25000.00"))
        amendment = self.approved_product_amendment(target_product, status="REQUESTED")
        counts = self._counts()

        self.client.force_authenticate(self.admin)
        response = self.client.post(f"/api/v1/admin/contract-amendments/{amendment.id}/product-recontract-preview/", {}, format="json")

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["preview_status"], "READY")
        self.assertEqual(response.data["impact_type"], "UPGRADE_EXTRA_PAYABLE")
        self.assertEqual(response.data["old_contract_total"], "20000.00")
        self.assertEqual(response.data["new_contract_total"], "25000.00")
        self.assertEqual(response.data["price_difference"], "5000.00")
        self.assertEqual(response.data["proposed_monthly_amount"], "2500.00")
        self.assertFalse(response.data["source_record_mutation"])
        self.assert_subscription_unchanged_except_product(expected_product_id=self.product.id, snapshot=counts)

    def test_recontract_preview_downgrade_returns_credit_required_without_mutation(self):
        target_product = self.replacement_product("P4-DOWNGRADE", price=Decimal("15000.00"))
        amendment = self.approved_product_amendment(target_product)
        counts = self._counts()

        self.client.force_authenticate(self.admin)
        response = self.client.post(f"/api/v1/admin/contract-amendments/{amendment.id}/product-recontract-preview/", {}, format="json")

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["impact_type"], "DOWNGRADE_CREDIT_REQUIRED")
        self.assertEqual(response.data["price_difference"], "-5000.00")
        self.assertEqual(response.data["proposed_new_remaining_balance"], "15000.00")
        self.assert_subscription_unchanged_except_product(expected_product_id=self.product.id, snapshot=counts)

    def test_recontract_preview_same_price_returns_reference_correction_impact(self):
        target_product = self.replacement_product("P4-SAME")
        amendment = self.approved_product_amendment(target_product)

        self.client.force_authenticate(self.admin)
        response = self.client.post(f"/api/v1/admin/contract-amendments/{amendment.id}/product-recontract-preview/", {}, format="json")

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["impact_type"], "SAME_PRICE_REFERENCE_CORRECTION")
        self.assertEqual(response.data["price_difference"], "0.00")
        self.assert_subscription_unchanged_except_product(expected_product_id=self.product.id)

    def test_non_admin_roles_cannot_preview_product_recontract(self):
        target_product = self.replacement_product("P4-PREVIEW-ROLE", price=Decimal("25000.00"))
        amendment = self.approved_product_amendment(target_product)
        for user in [self.customer_user, self.partner_user, self.cashier, self.vendor]:
            with self.subTest(role=user.role):
                self.client.force_authenticate(user)
                response = self.client.post(f"/api/v1/admin/contract-amendments/{amendment.id}/product-recontract-preview/", {}, format="json")
                self.assertEqual(response.status_code, 403)

    def test_preview_rejects_unsupported_amendment_type_and_missing_target(self):
        unsupported = ContractAmendment.objects.create(
            subscription=self.subscription,
            contract_type="EMI_SUBSCRIPTION",
            customer=self.customer,
            requested_by=self.customer_user,
            requested_role="CUSTOMER",
            amendment_type="CONTACT_CORRECTION",
            status="APPROVED",
            approved_values={"phone": "9810000999"},
            reason="Not product change.",
            approved_by=self.admin,
        )
        missing_target = ContractAmendment.objects.create(
            subscription=self.subscription,
            contract_type="EMI_SUBSCRIPTION",
            customer=self.customer,
            requested_by=self.customer_user,
            requested_role="CUSTOMER",
            amendment_type="PRODUCT_CHANGE",
            status="APPROVED",
            approved_values={},
            reason="Missing target.",
            approved_by=self.admin,
        )

        self.client.force_authenticate(self.admin)
        unsupported_response = self.client.post(f"/api/v1/admin/contract-amendments/{unsupported.id}/product-recontract-preview/", {}, format="json")
        missing_response = self.client.post(f"/api/v1/admin/contract-amendments/{missing_target.id}/product-recontract-preview/", {}, format="json")

        self.assertEqual(unsupported_response.status_code, 400, unsupported_response.data)
        self.assertIn("product_change", str(unsupported_response.data).lower())
        self.assertEqual(missing_response.status_code, 400, missing_response.data)
        self.assertIn("approved_product_id", str(missing_response.data).lower())
