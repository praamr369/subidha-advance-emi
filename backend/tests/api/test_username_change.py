from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.cache import cache
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import ReservedUsername, UsernameChangeAudit, UsernameChangeSource
from subscriptions.models import Customer
from subscriptions.services.payment_service import record_emi_payment
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_cashier_user,
    create_customer_profile,
    create_customer_user,
    create_emi,
    create_lucky_id,
    create_partner_user,
    create_payment_collection_finance_account,
    create_product,
    create_subscription,
)

User = get_user_model()


class UsernameChangeApiTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.admin = create_admin_user(
            username="username_admin",
            phone="9800000001",
            email="username-admin@example.com",
        )
        self.cashier = create_cashier_user(
            username="username_cashier",
            phone="9800000002",
            email="username-cashier@example.com",
        )
        self.customer_user = create_customer_user(
            username="username_customer",
            phone="9800000003",
            email="username-customer@example.com",
        )
        self.customer = create_customer_profile(
            user=self.customer_user,
            name="Username Customer",
            phone="9800000003",
        )
        self.partner_user = create_partner_user(
            username="username_partner",
            phone="9800000004",
            email="username-partner@example.com",
        )
        self.other_customer_user = create_customer_user(
            username="username_other_customer",
            phone="9800000005",
            email="username-other-customer@example.com",
        )
        self.other_customer = create_customer_profile(
            user=self.other_customer_user,
            name="Other Customer",
            phone="9800000005",
        )

        self.product = create_product(
            name="Username Test Product",
            product_code="USER-NAME-PROD-001",
            base_price=Decimal("3000.00"),
        )
        self.batch = create_batch(
            batch_code="USERNAME-BATCH-001",
            duration_months=3,
            total_slots=100,
            draw_day=5,
            start_date=date(2026, 3, 1),
        )
        self.lucky_id = create_lucky_id(batch=self.batch, lucky_number=5)
        self.subscription = create_subscription(
            customer=self.customer,
            product=self.product,
            batch=self.batch,
            lucky_id=self.lucky_id,
            partner=self.partner_user,
            total_amount=Decimal("3000.00"),
            monthly_amount=Decimal("1000.00"),
            tenure_months=3,
        )
        self.emi = create_emi(
            subscription=self.subscription,
            month_no=1,
            amount=Decimal("1000.00"),
            due_date=date(2026, 3, 10),
        )
        self.finance_account = create_payment_collection_finance_account(
            code="USERNAME-COLLECT-001",
            name="Username Test Collection Account",
        )
        record_emi_payment(
            emi_id=self.emi.id,
            amount=Decimal("1000.00"),
            collected_by=self.admin,
            finance_account_id=self.finance_account.id,
            reference_no="USERNAME-COMMISSION-001",
        )

    def test_customer_can_change_own_username_with_current_password(self):
        self.client.force_authenticate(user=self.customer_user)
        response = self.client.patch(
            "/api/v1/customer/profile/username/",
            {
                "new_username": "customer.renamed_001",
                "current_password": "CustomerPass123!",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.customer_user.refresh_from_db()
        self.assertEqual(self.customer_user.username, "customer.renamed_001")
        self.assertTrue(response.data["requires_relogin"])

    def test_customer_cannot_change_to_duplicate_username(self):
        self.client.force_authenticate(user=self.customer_user)
        response = self.client.patch(
            "/api/v1/customer/profile/username/",
            {
                "new_username": self.partner_user.username,
                "current_password": "CustomerPass123!",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "This username is already taken.")

    def test_customer_cannot_change_to_reserved_username(self):
        self.client.force_authenticate(user=self.customer_user)
        response = self.client.patch(
            "/api/v1/customer/profile/username/",
            {
                "new_username": "admin",
                "current_password": "CustomerPass123!",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "This username is reserved.")

    def test_customer_cannot_use_admin_endpoint_for_other_user(self):
        self.client.force_authenticate(user=self.customer_user)
        response = self.client.patch(
            f"/api/v1/admin/users/{self.other_customer_user.id}/username/",
            {"new_username": "newname", "reason": "test"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_partner_can_change_own_username(self):
        self.client.force_authenticate(user=self.partner_user)
        response = self.client.patch(
            "/api/v1/partner/profile/username/",
            {
                "new_username": "partner.renamed_001",
                "current_password": "PartnerPass123!",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.partner_user.refresh_from_db()
        self.assertEqual(self.partner_user.username, "partner.renamed_001")

    def test_partner_username_change_keeps_commission_ownership(self):
        original_partner_id = self.subscription.partner_id
        self.client.force_authenticate(user=self.partner_user)
        response = self.client.patch(
            "/api/v1/partner/profile/username/",
            {
                "new_username": "partner.ownership.safe",
                "current_password": "PartnerPass123!",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.subscription.refresh_from_db()
        self.assertEqual(self.subscription.partner_id, original_partner_id)

    def test_admin_can_change_customer_username_with_reason(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.patch(
            f"/api/v1/admin/users/{self.customer_user.id}/username/",
            {
                "new_username": "admin.changed.customer",
                "reason": "Customer requested username correction",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.customer_user.refresh_from_db()
        self.assertEqual(self.customer_user.username, "admin.changed.customer")

    def test_admin_can_change_partner_username_with_reason(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.patch(
            f"/api/v1/admin/users/{self.partner_user.id}/username/",
            {
                "new_username": "admin.changed.partner",
                "reason": "Partner requested login correction",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.partner_user.refresh_from_db()
        self.assertEqual(self.partner_user.username, "admin.changed.partner")

    def test_admin_cannot_change_username_without_reason(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.patch(
            f"/api/v1/admin/users/{self.customer_user.id}/username/",
            {"new_username": "admin.changed.customer"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("reason", response.data)

    def test_cashier_cannot_use_admin_username_change_endpoint(self):
        self.client.force_authenticate(user=self.cashier)
        response = self.client.patch(
            f"/api/v1/admin/users/{self.customer_user.id}/username/",
            {"new_username": "blocked.cashier", "reason": "Not allowed"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_partner_cannot_use_admin_username_change_endpoint(self):
        self.client.force_authenticate(user=self.partner_user)
        response = self.client.patch(
            f"/api/v1/admin/users/{self.customer_user.id}/username/",
            {"new_username": "blocked.partner", "reason": "Not allowed"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_username_change_creates_audit_and_reserves_old_username(self):
        self.client.force_authenticate(user=self.customer_user)
        response = self.client.patch(
            "/api/v1/customer/profile/username/",
            {
                "new_username": "customer.audit.checked",
                "current_password": "CustomerPass123!",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        audit = UsernameChangeAudit.objects.filter(user=self.customer_user).latest("id")
        self.assertEqual(audit.old_username, "username_customer")
        self.assertEqual(audit.new_username, "customer.audit.checked")
        self.assertEqual(audit.source, UsernameChangeSource.SELF)
        self.assertTrue(
            ReservedUsername.objects.filter(username="username_customer").exists()
        )

    def test_old_username_cannot_authenticate_after_change(self):
        self.client.force_authenticate(user=self.customer_user)
        self.client.patch(
            "/api/v1/customer/profile/username/",
            {
                "new_username": "customer.auth.switch",
                "current_password": "CustomerPass123!",
            },
            format="json",
        )
        self.client.force_authenticate(user=None)
        old_login = self.client.post(
            "/api/v1/auth/login/",
            {"username": "username_customer", "password": "CustomerPass123!"},
            format="json",
        )
        self.assertEqual(old_login.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_new_username_can_authenticate_after_change(self):
        self.client.force_authenticate(user=self.customer_user)
        self.client.patch(
            "/api/v1/customer/profile/username/",
            {
                "new_username": "customer.auth.success",
                "current_password": "CustomerPass123!",
            },
            format="json",
        )
        self.client.logout()
        new_login = self.client.post(
            "/api/v1/auth/login/",
            {"username": "customer.auth.success", "password": "CustomerPass123!"},
            format="json",
        )
        self.assertEqual(new_login.status_code, status.HTTP_200_OK, new_login.data)
        self.assertEqual(new_login.data["user"]["username"], "customer.auth.success")

    def test_business_records_remain_linked_by_ids_not_username(self):
        original_customer_id = self.customer.id
        original_subscription_customer_id = self.subscription.customer_id
        self.client.force_authenticate(user=self.customer_user)
        response = self.client.patch(
            "/api/v1/customer/profile/username/",
            {
                "new_username": "customer.id.stable",
                "current_password": "CustomerPass123!",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.subscription.refresh_from_db()
        refreshed_customer = Customer.objects.get(id=original_customer_id)
        self.assertEqual(refreshed_customer.id, original_customer_id)
        self.assertEqual(self.subscription.customer_id, original_subscription_customer_id)
