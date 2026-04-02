from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from services.subscriptions.create_subscription import create_subscription
from subscriptions.models import Batch, Customer, KycStatus, Product, SubscriptionStatus


class SecondWaveRegisterPaginationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        User = get_user_model()

        self.admin = User.objects.create_user(
            username="admin_register_pagination",
            password="pass1234",
            role="ADMIN",
            phone="9700000000",
        )
        self.partner = User.objects.create_user(
            username="partner_register_pagination",
            password="pass1234",
            role="PARTNER",
            phone="9700000001",
        )

        self.customer_users = [
            User.objects.create_user(
                username=f"customer_register_{index}",
                password="pass1234",
                role="CUSTOMER",
                phone=f"970000010{index}",
            )
            for index in range(3)
        ]

        self.customers = [
            Customer.objects.create(
                user=self.customer_users[0],
                name="Partner Customer Alpha",
                phone="9700000100",
                kyc_status=KycStatus.PENDING,
            ),
            Customer.objects.create(
                user=self.customer_users[1],
                name="Partner Customer Beta",
                phone="9700000101",
                kyc_status=KycStatus.VERIFIED,
            ),
            Customer.objects.create(
                user=self.customer_users[2],
                name="Partner Customer Gamma",
                phone="9700000102",
                kyc_status=KycStatus.REJECTED,
            ),
        ]

        self.product = Product.objects.create(
            product_code="REG-PAG-01",
            name="Register Pagination Product",
            base_price=Decimal("1000.00"),
            category="Furniture",
            subcategory="Chair",
        )

        self.batches = [
            Batch.objects.create(
                batch_code=f"REG-PAG-B{index + 1:02d}",
                total_slots=100,
                duration_months=10,
                draw_day=5,
                start_date=date(2026, 1, index + 1),
                status="OPEN",
            )
            for index in range(5)
        ]

        self.subscriptions = [
            create_subscription(
                customer=self.customers[0],
                product=self.product,
                batch=self.batches[0],
                lucky_number=1,
                tenure_months=10,
                partner=self.partner,
                start_date=date(2026, 1, 1),
                performed_by=self.admin,
            ),
            create_subscription(
                customer=self.customers[0],
                product=self.product,
                batch=self.batches[1],
                lucky_number=2,
                tenure_months=10,
                partner=self.partner,
                start_date=date(2026, 1, 2),
                performed_by=self.admin,
            ),
            create_subscription(
                customer=self.customers[0],
                product=self.product,
                batch=self.batches[2],
                lucky_number=3,
                tenure_months=10,
                partner=self.partner,
                start_date=date(2026, 1, 3),
                performed_by=self.admin,
            ),
            create_subscription(
                customer=self.customers[1],
                product=self.product,
                batch=self.batches[3],
                lucky_number=4,
                tenure_months=10,
                partner=self.partner,
                start_date=date(2026, 1, 4),
                performed_by=self.admin,
            ),
            create_subscription(
                customer=self.customers[2],
                product=self.product,
                batch=self.batches[4],
                lucky_number=5,
                tenure_months=10,
                partner=self.partner,
                start_date=date(2026, 1, 5),
                performed_by=self.admin,
            ),
        ]

        self.subscriptions[1].status = SubscriptionStatus.COMPLETED
        self.subscriptions[1].save(update_fields=["status"])

        self.customer_alpha_user = self.customer_users[0]

    def test_admin_subscription_list_returns_paginated_count_and_results(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get("/api/v1/admin/subscriptions/?page=1&page_size=2")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 5)
        self.assertEqual(len(response.data["results"]), 2)
        self.assertEqual(response.data["page"], 1)
        self.assertEqual(response.data["page_size"], 2)
        self.assertEqual(response.data["num_pages"], 3)
        self.assertTrue(response.data["has_next"])
        self.assertFalse(response.data["has_previous"])

    def test_admin_subscription_pagination_respects_search_filtering(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get(
            "/api/v1/admin/subscriptions/?q=Partner%20Customer%20Alpha&page=1&page_size=1"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 3)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(response.data["page"], 1)
        self.assertEqual(response.data["num_pages"], 3)

    def test_admin_subscription_empty_page_returns_empty_results_without_breaking_count(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get("/api/v1/admin/subscriptions/?page=99&page_size=2")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 5)
        self.assertEqual(response.data["results"], [])
        self.assertEqual(response.data["num_pages"], 3)

    def test_partner_subscription_list_returns_paginated_count_and_results(self):
        self.client.force_authenticate(self.partner)
        response = self.client.get("/api/v1/partner/subscriptions/?page=1&page_size=2")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 5)
        self.assertEqual(len(response.data["results"]), 2)
        self.assertEqual(response.data["page"], 1)
        self.assertEqual(response.data["page_size"], 2)
        self.assertEqual(response.data["num_pages"], 3)

    def test_partner_subscription_pagination_respects_search_filtering(self):
        self.client.force_authenticate(self.partner)
        response = self.client.get(
            "/api/v1/partner/subscriptions/?q=Partner%20Customer%20Alpha&page=1&page_size=1"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 3)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(response.data["num_pages"], 3)

    def test_partner_customer_list_returns_paginated_count_and_results(self):
        self.client.force_authenticate(self.partner)
        response = self.client.get("/api/v1/partner/customers/?page=1&page_size=2")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 3)
        self.assertEqual(len(response.data["results"]), 2)
        self.assertEqual(response.data["page"], 1)
        self.assertEqual(response.data["num_pages"], 2)

    def test_partner_customer_pagination_respects_filtering(self):
        self.client.force_authenticate(self.partner)
        response = self.client.get(
            "/api/v1/partner/customers/?q=Partner%20Customer%20Alpha&kyc_status=PENDING&page=1&page_size=1"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(response.data["results"][0]["name"], "Partner Customer Alpha")

    def test_customer_subscription_list_returns_paginated_count_and_results(self):
        self.client.force_authenticate(self.customer_alpha_user)
        response = self.client.get("/api/v1/customer/subscriptions/?page=1&page_size=2")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 3)
        self.assertEqual(len(response.data["results"]), 2)
        self.assertEqual(response.data["page"], 1)
        self.assertEqual(response.data["page_size"], 2)
        self.assertEqual(response.data["num_pages"], 2)
        self.assertTrue(response.data["has_next"])

    def test_customer_subscription_pagination_respects_filtering(self):
        self.client.force_authenticate(self.customer_alpha_user)
        response = self.client.get(
            "/api/v1/customer/subscriptions/?status=ACTIVE&page=1&page_size=1"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 2)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(response.data["num_pages"], 2)

    def test_customer_subscription_empty_page_returns_empty_results_without_breaking_count(self):
        self.client.force_authenticate(self.customer_alpha_user)
        response = self.client.get("/api/v1/customer/subscriptions/?page=99&page_size=2")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 3)
        self.assertEqual(response.data["results"], [])
        self.assertEqual(response.data["num_pages"], 2)
