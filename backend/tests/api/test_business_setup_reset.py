from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import ChartOfAccount, ChartOfAccountType, FinanceAccount, FinanceAccountCoaMapping
from branch_control.models import Branch
from subscriptions.models import Customer, Product, Subscription
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_customer_profile,
    create_lucky_id,
    create_product,
    create_subscription,
)


class BusinessSetupResetApiTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="subidhafurniture", phone="919000000001")
        self.other_admin = create_admin_user(username="otheradmin", phone="919000000002")
        self.client.force_authenticate(self.admin)

    def _seed_operational_data(self):
        product = create_product(product_code="RST-001")
        customer = create_customer_profile(
            user=None,
            name="Reset Customer",
            phone="919000000010",
        )
        batch = create_batch(batch_code="RSTBATCH01")
        lucky = create_lucky_id(batch=batch, lucky_number=7)
        create_subscription(customer=customer, product=product, batch=batch, lucky_id=lucky)

        chart = ChartOfAccount.objects.create(
            code="RST-COA-001",
            name="Reset COA",
            account_type=ChartOfAccountType.ASSET,
            is_active=True,
            allow_manual_posting=True,
        )
        branch = Branch.objects.order_by("id").first()
        finance = FinanceAccount.objects.create(
            name="Reset Cash",
            branch=branch,
            kind="CASH",
            chart_account=chart,
            opening_balance=Decimal("0.00"),
            is_active=True,
        )
        FinanceAccountCoaMapping.objects.create(
            finance_account=finance,
            chart_account=chart,
            purpose="CASH_COLLECTION",
            is_default=True,
            is_active=True,
            created_by=self.admin,
            updated_by=self.admin,
        )

    def test_reset_preview_returns_200_and_does_not_mutate_counts(self):
        self._seed_operational_data()
        before = {
            "products": Product.objects.count(),
            "customers": Customer.objects.count(),
            "subscriptions": Subscription.objects.count(),
            "mappings": FinanceAccountCoaMapping.objects.count(),
            "users": get_user_model().objects.count(),
        }
        response = self.client.get(
            "/api/v1/admin/business-setup/reset-preview/?preserve_username=subidhafurniture"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["mode"], "read_only_preview")
        plan = response.data["reset_plan"]
        self.assertTrue(plan["preserved_users"])
        self.assertIn("warnings", response.data)
        labels = {item["label"] for item in plan["targets"]["models"]}
        self.assertIn("accounting.FinanceAccountCoaMapping", labels)

        after = {
            "products": Product.objects.count(),
            "customers": Customer.objects.count(),
            "subscriptions": Subscription.objects.count(),
            "mappings": FinanceAccountCoaMapping.objects.count(),
            "users": get_user_model().objects.count(),
        }
        self.assertEqual(before, after)

    def test_reset_post_without_confirm_returns_400(self):
        payload = {
            "preserve_username": "subidhafurniture",
            "delete_non_preserved_users": True,
            "clear_auth_artifacts": True,
            "dry_run": False,
        }
        response = self.client.post("/api/v1/admin/business-setup/reset/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("confirm", response.data)

    def test_reset_post_with_confirm_false_returns_400(self):
        payload = {
            "confirm": False,
            "preserve_username": "subidhafurniture",
            "delete_non_preserved_users": True,
            "clear_auth_artifacts": True,
            "dry_run": False,
        }
        response = self.client.post("/api/v1/admin/business-setup/reset/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("confirm", response.data)

    def test_reset_post_with_confirm_executes_and_preserves_admin(self):
        self._seed_operational_data()
        payload = {
            "confirm": True,
            "preserve_username": "subidhafurniture",
            "delete_non_preserved_users": True,
            "clear_auth_artifacts": True,
            "dry_run": False,
        }
        response = self.client.post("/api/v1/admin/business-setup/reset/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["mode"], "executed")
        self.assertIn("deleted_counts", response.data)
        self.assertIn("post_reset_checklist", response.data)
        self.assertIn("next_setup_steps", response.data)
        self.assertIn("chart of accounts mapping", response.data["next_setup_steps"])

        User = get_user_model()
        self.assertTrue(User.objects.filter(username="subidhafurniture").exists())
        self.assertFalse(User.objects.filter(username="otheradmin").exists())
        self.assertEqual(Product.objects.count(), 0)
        self.assertEqual(Customer.objects.count(), 0)
        self.assertEqual(Subscription.objects.count(), 0)
        self.assertEqual(FinanceAccountCoaMapping.objects.count(), 0)

