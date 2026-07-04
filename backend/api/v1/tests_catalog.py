from __future__ import annotations

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.utils.crypto import get_random_string
from rest_framework.test import APIClient

from accounts.models import UserRole
from subscriptions.models import Customer, PlanType, Product

User = get_user_model()


def _make_user(role, phone):
    return User.objects.create_user(
        username=f"user_{get_random_string(8)}",
        password="testpass123",
        role=role,
        phone=phone,
    )


def _make_product(code, **flags):
    defaults = {
        "name": f"Product {code}",
        "base_price": Decimal("10000"),
        "category": "Sofa",
        "is_active": True,
        "is_emi_enabled": True,
        "is_rent_enabled": False,
        "is_lease_enabled": False,
        "is_direct_sale_enabled": True,
    }
    defaults.update(flags)
    # Keep plan_type_default consistent with the enabled mode flags so the
    # Product model's own validation accepts the row.
    if defaults["is_emi_enabled"]:
        defaults.setdefault("plan_type_default", PlanType.EMI)
    elif defaults["is_rent_enabled"]:
        defaults.setdefault("plan_type_default", PlanType.RENT)
    elif defaults["is_lease_enabled"]:
        defaults.setdefault("plan_type_default", PlanType.LEASE)
    else:
        defaults["is_emi_enabled"] = True
        defaults.setdefault("plan_type_default", PlanType.EMI)
    return Product.objects.create(product_code=code, **defaults)


class CatalogBrowseTests(TestCase):
    def setUp(self):
        self.customer_user = _make_user(UserRole.CUSTOMER, "7300000001")
        Customer.objects.create(user=self.customer_user, name="Cust", phone="7300000001")
        self.partner_user = _make_user(UserRole.PARTNER, "7300000002")
        self.vendor_user = _make_user(UserRole.VENDOR, "7300000003")

        _make_product("T-EMI", category="Sofa", is_emi_enabled=True, is_direct_sale_enabled=False)
        _make_product(
            "T-RENT",
            category="Office",
            is_emi_enabled=False,
            is_rent_enabled=True,
            is_lease_enabled=True,
            is_direct_sale_enabled=True,
        )
        _make_product(
            "T-SALE",
            category="Kitchen",
            is_emi_enabled=False,
            is_lease_enabled=True,
            is_direct_sale_enabled=True,
        )
        # Inactive product must never surface in the approved catalog.
        _make_product("T-INACTIVE", category="Sofa", is_active=False)
        # Discontinued product must be excluded too.
        _make_product("T-DISC", category="Sofa", lifecycle_status="DISCONTINUED")

    def _client(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        return client

    def test_customer_catalog_lists_only_approved_products(self):
        resp = self._client(self.customer_user).get("/api/v1/customer/catalog/")
        self.assertEqual(resp.status_code, 200)
        codes = {row["product_code"] for row in resp.data["results"]}
        self.assertEqual(codes, {"T-EMI", "T-RENT", "T-SALE"})

    def test_purpose_filter_emi(self):
        resp = self._client(self.customer_user).get("/api/v1/customer/catalog/?purpose=emi")
        codes = {row["product_code"] for row in resp.data["results"]}
        self.assertEqual(codes, {"T-EMI"})

    def test_purpose_filter_rent(self):
        resp = self._client(self.customer_user).get("/api/v1/customer/catalog/?purpose=rent")
        codes = {row["product_code"] for row in resp.data["results"]}
        self.assertEqual(codes, {"T-RENT"})

    def test_purchase_request_purpose_covers_all_products(self):
        resp = self._client(self.customer_user).get(
            "/api/v1/customer/catalog/?purpose=purchase_request"
        )
        codes = {row["product_code"] for row in resp.data["results"]}
        self.assertEqual(codes, {"T-EMI", "T-RENT", "T-SALE"})

    def test_category_filter(self):
        resp = self._client(self.customer_user).get("/api/v1/customer/catalog/?category=Kitchen")
        codes = {row["product_code"] for row in resp.data["results"]}
        self.assertEqual(codes, {"T-SALE"})

    def test_search_filter(self):
        resp = self._client(self.customer_user).get("/api/v1/customer/catalog/?search=T-RENT")
        codes = {row["product_code"] for row in resp.data["results"]}
        self.assertEqual(codes, {"T-RENT"})

    def test_facets_expose_categories_and_purposes(self):
        resp = self._client(self.customer_user).get("/api/v1/customer/catalog/facets/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["total"], 3)
        categories = {row["name"] for row in resp.data["categories"]}
        self.assertEqual(categories, {"Sofa", "Office", "Kitchen"})
        purposes = {row["key"]: row["count"] for row in resp.data["purposes"]}
        self.assertEqual(purposes["emi"], 1)
        self.assertEqual(purposes["rent"], 1)
        self.assertEqual(purposes["purchase_request"], 3)

    def test_partner_and_vendor_can_read_catalog(self):
        for user in (self.partner_user, self.vendor_user):
            role = user.role
            resp = self._client(user).get(
                f"/api/v1/{'partner' if role == UserRole.PARTNER else 'vendor'}/catalog/"
            )
            self.assertEqual(resp.status_code, 200, msg=role)
            self.assertEqual(len(resp.data["results"]), 3)

    def test_customer_cannot_read_partner_catalog(self):
        resp = self._client(self.customer_user).get("/api/v1/partner/catalog/")
        self.assertEqual(resp.status_code, 403)

    @override_settings(DEBUG=True)
    def test_seed_catalog_demo_command_is_idempotent(self):
        call_command("seed_catalog_demo", "--confirm")
        first = Product.objects.filter(product_code__startswith="CAT-").count()
        self.assertGreaterEqual(first, 10)
        # Re-run must update in place, not duplicate.
        call_command("seed_catalog_demo", "--confirm")
        second = Product.objects.filter(product_code__startswith="CAT-").count()
        self.assertEqual(first, second)
        # Every seeded product is visible in the approved catalog.
        resp = self._client(self.customer_user).get("/api/v1/customer/catalog/?page_size=100")
        seeded = [r for r in resp.data["results"] if r["product_code"].startswith("CAT-")]
        self.assertEqual(len(seeded), first)

    def test_purposes_serialized_per_product(self):
        resp = self._client(self.customer_user).get("/api/v1/customer/catalog/?category=Office")
        row = resp.data["results"][0]
        keys = {p["key"] for p in row["purposes"]}
        self.assertEqual(keys, {"rent", "lease", "direct_sale", "purchase_request"})
