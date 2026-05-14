from decimal import Decimal

from rest_framework import status
from rest_framework.test import APITestCase

from subscriptions.models_business_setup import PublicBusinessProfile
from tests.helpers import (
    create_admin_user,
    create_cashier_user,
    create_partner_user,
    create_product,
    create_user,
)


class Phase8CmsPublicContentControlTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="phase8_admin", phone="9801000011")
        self.customer = create_user(
            username="phase8_customer",
            password="CustomerPass123!",
            role="CUSTOMER",
            phone="9801000012",
            first_name="Phase8",
        )
        self.partner = create_partner_user(username="phase8_partner", phone="9801000013")
        self.cashier = create_cashier_user(username="phase8_cashier", phone="9801000014")
        self.vendor = create_user(
            username="phase8_vendor",
            password="VendorPass123!",
            role="VENDOR",
            phone="9801000015",
            first_name="Vendor",
        )

    def test_public_products_does_not_expose_internal_financial_or_stock_fields(self):
        create_product(name="Phase8 Public Product", product_code="PH8-PROD-001")

        response = self.client.get("/api/v1/public/products/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

        row = response.data["results"][0]
        allowed = {
            "id",
            "product_code",
            "name",
            "base_price",
            "category",
            "subcategory",
            "image",
            "description",
        }
        self.assertEqual(set(row.keys()), allowed)

        forbidden_fields = {
            "cost_price",
            "opening_stock",
            "current_stock",
            "reorder_level",
            "is_emi_enabled",
            "is_rent_enabled",
            "is_lease_enabled",
            "created_at",
            "updated_at",
        }
        for key in forbidden_fields:
            self.assertNotIn(key, row)

    def test_admin_public_profile_updates_do_not_mutate_product_price_or_stock_truth(self):
        product = create_product(
            name="Immutable Price Product",
            product_code="PH8-PROD-002",
            base_price=Decimal("12345.00"),
        )

        self.client.force_authenticate(self.admin)
        response = self.client.patch(
            "/api/v1/admin/public-site/profile/",
            {
                "display_name": "Subidha Public",
                "tagline": "Phase8 Content Only",
                "hero_title": "Public Hero",
                "is_active": True,
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

        product.refresh_from_db()
        self.assertEqual(product.base_price, Decimal("12345.00"))

    def test_admin_public_profile_is_admin_only_for_all_non_admin_roles(self):
        for user in (self.customer, self.partner, self.cashier, self.vendor):
            self.client.force_authenticate(user)
            response = self.client.patch(
                "/api/v1/admin/public-site/profile/",
                {"display_name": "Blocked", "is_active": True},
                format="json",
            )
            self.assertEqual(
                response.status_code,
                status.HTTP_403_FORBIDDEN,
                f"role={user.role} should be forbidden",
            )

    def test_public_pages_endpoints_do_not_require_auth(self):
        PublicBusinessProfile.objects.create(
            display_name="Subidha Furniture",
            is_active=True,
        )
        create_product(name="Public Access Product", product_code="PH8-PROD-003")

        endpoints = [
            "/api/v1/public/stats/",
            "/api/v1/public/business-profile/",
            "/api/v1/public/products/",
            "/api/v1/public/latest-winner/",
            "/api/v1/public/winners/",
            "/api/v1/public/winner-history/",
            "/api/v1/public/health/",
            "/api/v1/public/readiness/",
        ]

        for url in endpoints:
            response = self.client.get(url)
            self.assertEqual(response.status_code, status.HTTP_200_OK, f"url={url} {response.data}")
