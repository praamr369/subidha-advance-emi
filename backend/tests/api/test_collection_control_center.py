from decimal import Decimal

from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import ChartOfAccount, ChartOfAccountType, FinanceAccount, FinanceAccountKind
from subscriptions.models import EmiStatus, Payment
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_cashier_user,
    create_customer_profile,
    create_customer_user,
    create_emi,
    create_lucky_id,
    create_product,
    create_subscription,
)


class CollectionControlCenterApiTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="collection_admin", phone="9103000001")
        self.cashier = create_cashier_user(username="collection_cashier", phone="9103000002")
        self.customer_user = create_customer_user(username="collection_customer", phone="9103000003")

    def _create_pending_emi(self):
        customer = create_customer_profile(user=self.customer_user, phone="9103000003")
        product = create_product(product_code="CCC-001")
        batch = create_batch(batch_code="CCC2026")
        lucky = create_lucky_id(batch=batch, lucky_number=7)
        subscription = create_subscription(customer=customer, product=product, batch=batch, lucky_id=lucky)
        return create_emi(subscription=subscription, status=EmiStatus.PENDING)

    def test_admin_collection_control_center_returns_summary(self):
        self._create_pending_emi()
        self.client.force_authenticate(self.admin)
        response = self.client.get("/api/v1/admin/collections/control-center/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["read_only"])
        self.assertEqual(response.data["role"], "admin")
        self.assertIn("summary", response.data)
        self.assertIn("finance_account_readiness", response.data)
        self.assertIn("collection_lanes", response.data)
        self.assertGreaterEqual(response.data["summary"]["pending_emi_count"], 1)

    def test_cashier_collection_control_center_returns_cashier_safe_payload(self):
        self.client.force_authenticate(self.cashier)
        response = self.client.get("/api/v1/cashier/collections/control-center/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["role"], "cashier")
        self.assertIsNone(response.data["route_hints"].get("accounting_setup"))

    def test_customer_denied_for_admin_collection_control_center(self):
        self.client.force_authenticate(self.customer_user)
        response = self.client.get("/api/v1/admin/collections/control-center/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_collection_control_center_is_read_only_for_payments(self):
        self.client.force_authenticate(self.admin)
        before = Payment.objects.count()
        response = self.client.get("/api/v1/admin/collections/control-center/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        after = Payment.objects.count()
        self.assertEqual(before, after)

    def test_blocked_finance_account_appears_in_summary(self):
        group_account = ChartOfAccount.objects.create(
            code="CCC-GROUP",
            name="Blocked Collection Group",
            account_type=ChartOfAccountType.ASSET,
            is_active=True,
            allow_manual_posting=False,
        )
        FinanceAccount.objects.create(
            name="Blocked Cash Desk",
            kind=FinanceAccountKind.CASH,
            chart_account=group_account,
            opening_balance=Decimal("0.00"),
            is_active=True,
        )

        self.client.force_authenticate(self.admin)
        response = self.client.get("/api/v1/admin/collections/control-center/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        rows = response.data["finance_account_readiness"]["accounts"]
        blocked = [row for row in rows if row["name"] == "Blocked Cash Desk"]
        self.assertEqual(len(blocked), 1)
        self.assertFalse(blocked[0]["collection_ready"])
        self.assertIn("group/control account", blocked[0]["collection_blocker_reason"])
