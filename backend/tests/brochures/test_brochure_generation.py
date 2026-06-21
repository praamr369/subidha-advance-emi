from decimal import Decimal
from tempfile import TemporaryDirectory
from unittest.mock import patch

from django.apps import apps
from django.test import override_settings
from rest_framework.test import APITestCase

from brochures.models import BrochureDocument, ProductBrochureSettings
from subscriptions.models import Product
from tests.helpers import (
    create_admin_user,
    create_cashier_user,
    create_customer_user,
    create_user,
)

SIDE_EFFECT_MODEL_CANDIDATES = {
    "billing_invoices": (("billing", "BillingInvoice"),),
    "receipts": (
        ("billing", "ReceiptDocument"),
        ("billing", "BillingReceiptDocument"),
    ),
    "payments": (("subscriptions", "Payment"),),
    "subscriptions": (("subscriptions", "Subscription"),),
    "emis": (("subscriptions", "Emi"), ("subscriptions", "EMI")),
    "journal_entries": (("accounting", "JournalEntry"),),
    "journal_lines": (
        ("accounting", "JournalEntryLine"),
        ("accounting", "JournalLine"),
    ),
    "stock_ledger": (
        ("inventory", "StockLedger"),
        ("inventory", "StockMovement"),
    ),
    "direct_sales": (("billing", "DirectSale"),),
    "direct_sale_returns": (("billing", "DirectSaleReturn"),),
    "billing_credit_notes": (("billing", "BillingCreditNote"),),
}

PUBLIC_FORBIDDEN_KEY_FRAGMENTS = {
    "account_id",
    "chart_account",
    "cost",
    "customer",
    "email",
    "finance_account",
    "journal",
    "ledger_id",
    "phone",
    "purchase",
    "supplier",
    "user",
    "vendor",
}


def _resolve_model(candidates):
    for app_label, model_name in candidates:
        try:
            return apps.get_model(app_label, model_name)
        except LookupError:
            continue
    return None


def _side_effect_counts():
    counts = {}
    for label, candidates in SIDE_EFFECT_MODEL_CANDIDATES.items():
        model = _resolve_model(candidates)
        counts[label] = model.objects.count() if model is not None else None
    return counts


def _collect_keys(value):
    keys = set()
    if isinstance(value, dict):
        for key, child in value.items():
            keys.add(str(key).lower())
            keys.update(_collect_keys(child))
    elif isinstance(value, (list, tuple)):
        for child in value:
            keys.update(_collect_keys(child))
    return keys


class BrochureGenerationTests(APITestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.media_dir = TemporaryDirectory()
        cls.media_override = override_settings(
            MEDIA_ROOT=cls.media_dir.name,
            ALLOWED_HOSTS=["testserver"],
        )
        cls.media_override.enable()

    @classmethod
    def tearDownClass(cls):
        cls.media_override.disable()
        cls.media_dir.cleanup()
        super().tearDownClass()

    def setUp(self):
        self.admin = create_admin_user(
            username="brochure_admin",
            phone="9200000101",
        )
        self.client.force_authenticate(self.admin)

    def create_product(self, *, code, name, **overrides):
        brochure_settings = overrides.pop("brochure_settings", {})
        payload = {
            "product_code": code,
            "name": name,
            "base_price": Decimal("25000.00"),
            "category": "Living Room",
            "description": "Customer-facing furniture description.",
            "is_active": True,
            "is_emi_enabled": True,
            "is_rent_enabled": False,
            "is_lease_enabled": False,
            "is_direct_sale_enabled": True,
            "lifecycle_status": "ACTIVE",
        }
        payload.update(overrides)
        product = Product.objects.create(**payload)
        ProductBrochureSettings.objects.create(
            product=product,
            **brochure_settings,
        )
        return product

    def test_brochure_generation_excludes_hidden_products(self):
        visible = self.create_product(code="BRO-VIS", name="Visible Sofa")
        hidden = self.create_product(
            code="BRO-HID",
            name="Hidden Sofa",
            brochure_settings={"visible_on_public_catalog": False},
        )

        response = self.client.get(
            "/api/v1/admin/brochures/products/?brochure_type=DIRECT_SALE"
        )

        self.assertEqual(response.status_code, 200)
        ids = {row["id"] for row in response.data["results"]}
        self.assertIn(visible.id, ids)
        self.assertNotIn(hidden.id, ids)

    def test_brochure_generation_excludes_products_without_settings(self):
        configured = self.create_product(code="BRO-OPT-IN", name="Configured Sofa")
        unconfigured = Product.objects.create(
            product_code="BRO-NO-SETTINGS",
            name="Unconfigured Sofa",
            base_price=Decimal("26000.00"),
            category="Living Room",
            is_active=True,
            is_emi_enabled=True,
            is_direct_sale_enabled=True,
        )

        response = self.client.get(
            "/api/v1/admin/brochures/products/?brochure_type=DIRECT_SALE"
        )

        self.assertEqual(response.status_code, 200)
        ids = {row["id"] for row in response.data["results"]}
        self.assertIn(configured.id, ids)
        self.assertNotIn(unconfigured.id, ids)

    def test_rent_brochure_includes_rent_visible_product_with_monthly_rent(self):
        product = self.create_product(
            code="BRO-RENT",
            name="Rent Sofa",
            is_rent_enabled=True,
        )
        settings_row = product.brochure_settings
        settings_row.monthly_rent = Decimal("1800.00")
        settings_row.save(
            update_fields=["monthly_rent", "updated_at"],
        )

        response = self.client.get(
            "/api/v1/admin/brochures/products/?brochure_type=RENT"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["results"][0]["monthly_rent"], "1800.00")

    def test_lease_brochure_includes_lease_price_and_security_deposit(self):
        product = self.create_product(
            code="BRO-LEASE",
            name="Lease Bed",
            is_lease_enabled=True,
        )
        settings_row = product.brochure_settings
        settings_row.lease_monthly_amount = Decimal("2400.00")
        settings_row.security_deposit = Decimal("5000.00")
        settings_row.save(
            update_fields=[
                "lease_monthly_amount",
                "security_deposit",
                "updated_at",
            ],
        )

        response = self.client.get(
            "/api/v1/admin/brochures/products/?brochure_type=LEASE"
        )

        self.assertEqual(response.status_code, 200)
        row = response.data["results"][0]
        self.assertEqual(row["lease_monthly_amount"], "2400.00")
        self.assertEqual(row["security_deposit"], "5000.00")

    def test_direct_sale_brochure_does_not_expose_internal_cost(self):
        self.create_product(code="BRO-SALE", name="Sale Dining Table")

        response = self.client.get(
            "/api/v1/admin/brochures/products/?brochure_type=DIRECT_SALE"
        )

        self.assertEqual(response.status_code, 200)
        row = response.data["results"][0]
        self.assertEqual(row["sale_price"], "25000.00")
        self.assertNotIn("standard_unit_cost", row)
        self.assertNotIn("purchase_unit_cost", row)
        self.assertNotIn("manufacturing_cost", row)

    @patch(
        "brochures.views.build_brochure_pdf",
        return_value=b"%PDF-1.4\nbrochure-test\n%%EOF",
    )
    def test_generated_brochure_stores_snapshot_and_public_endpoint(self, _pdf):
        product = self.create_product(code="BRO-SNAP", name="Snapshot Sofa")

        response = self.client.post(
            "/api/v1/admin/brochures/generate/",
            {
                "brochure_type": "DIRECT_SALE",
                "title": "Current Sale Catalog",
                "category": None,
                "product_ids": [],
                "expires_at": None,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        document = BrochureDocument.objects.get(pk=response.data["id"])
        self.assertEqual(document.product_snapshot[0]["id"], product.id)
        self.assertEqual(document.product_snapshot[0]["sale_price"], "25000.00")
        self.assertTrue(response.data["pdf_url"])
        self.assertTrue(response.data["public_url"])
        self.assertIn(response.data["public_url"], response.data["whatsapp_message"])

        self.client.force_authenticate(user=None)
        public_response = self.client.get(
            f"/api/v1/public/brochures/{document.public_token}/"
        )
        self.assertEqual(public_response.status_code, 200)
        self.assertEqual(public_response.data["brochure_no"], document.brochure_no)
        self.assertEqual(public_response.data["product_count"], 1)
        self.assertTrue(public_response.data["pdf_url"])
        self.assertTrue(
            public_response.data["pdf_url"].startswith(
                "http://testserver/media/brochures/"
            )
        )

        public_keys = _collect_keys(public_response.data)
        leaked_keys = {
            key
            for key in public_keys
            if any(fragment in key for fragment in PUBLIC_FORBIDDEN_KEY_FRAGMENTS)
        }
        self.assertEqual(leaked_keys, set())
        self.assertEqual(
            set(public_response.data["products"][0]),
            {
                "id",
                "product_code",
                "name",
                "category",
                "short_description",
                "public_badge",
                "sale_price",
                "monthly_rent",
                "lease_monthly_amount",
                "security_deposit",
                "availability_label",
                "public_product_url",
                "featured",
                "sort_order",
            },
        )

    @patch(
        "brochures.views.build_brochure_pdf",
        return_value=b"%PDF-1.4\nbrochure-test\n%%EOF",
    )
    def test_generation_is_read_only_for_finance_contracts_and_stock(self, _pdf):
        self.create_product(code="BRO-SAFE", name="Read-only Sofa")
        before = _side_effect_counts()

        response = self.client.post(
            "/api/v1/admin/brochures/generate/",
            {
                "brochure_type": "DIRECT_SALE",
                "title": "Safe Catalog",
                "product_ids": [],
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        after = _side_effect_counts()
        self.assertEqual(after, before)

    def test_admin_endpoints_require_an_allowed_authenticated_role(self):
        self.create_product(code="BRO-PERM", name="Permission Sofa")
        self.client.force_authenticate(user=None)
        unauthenticated = self.client.get(
            "/api/v1/admin/brochures/products/?brochure_type=DIRECT_SALE"
        )
        self.assertEqual(unauthenticated.status_code, 401)

        customer = create_customer_user(
            username="brochure_customer",
            phone="9200000103",
        )
        self.client.force_authenticate(customer)
        customer_response = self.client.get(
            "/api/v1/admin/brochures/products/?brochure_type=DIRECT_SALE"
        )
        self.assertEqual(customer_response.status_code, 403)

        staff = create_user(
            username="brochure_staff",
            phone="9200000104",
            role="STAFF",
            is_staff=True,
        )
        self.client.force_authenticate(staff)
        staff_response = self.client.get(
            "/api/v1/admin/brochures/products/?brochure_type=DIRECT_SALE"
        )
        self.assertEqual(staff_response.status_code, 200)

    def test_cashier_can_access_brochure_products(self):
        self.create_product(code="BRO-CASH", name="Cashier Catalog Product")
        cashier = create_cashier_user(
            username="brochure_cashier",
            phone="9200000102",
        )
        self.client.force_authenticate(cashier)

        response = self.client.get(
            "/api/v1/admin/brochures/products/?brochure_type=DIRECT_SALE"
        )

        self.assertEqual(response.status_code, 200)

    def test_settings_list_returns_products_missing_settings(self):
        configured = self.create_product(code="BRO-SET", name="Configured Product")
        missing = Product.objects.create(
            product_code="BRO-MISSING",
            name="Missing Settings Product",
            base_price=Decimal("15000.00"),
            category="Bedroom",
            is_active=True,
            is_emi_enabled=True,
            is_direct_sale_enabled=True,
        )

        response = self.client.get(
            "/api/v1/admin/brochures/product-settings/?missing_settings=true"
        )

        self.assertEqual(response.status_code, 200)
        ids = {row["product_id"] for row in response.data["results"]}
        self.assertIn(missing.id, ids)
        self.assertNotIn(configured.id, ids)
        row = next(
            row for row in response.data["results"] if row["product_id"] == missing.id
        )
        self.assertFalse(row["has_settings"])

    def test_patch_creates_settings_without_auto_publishing_other_catalogs(self):
        product = Product.objects.create(
            product_code="BRO-PATCH",
            name="Patch Rent Product",
            base_price=Decimal("18000.00"),
            category="Bedroom",
            is_active=True,
            is_emi_enabled=True,
            is_rent_enabled=True,
            is_direct_sale_enabled=True,
        )

        response = self.client.patch(
            f"/api/v1/admin/brochures/product-settings/{product.id}/",
            {
                "visible_on_public_catalog": True,
                "visible_on_rent_catalog": True,
                "monthly_rent": "1200.00",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        settings_row = ProductBrochureSettings.objects.get(product=product)
        self.assertTrue(settings_row.visible_on_public_catalog)
        self.assertTrue(settings_row.visible_on_rent_catalog)
        self.assertFalse(settings_row.visible_on_lease_catalog)
        self.assertFalse(settings_row.visible_on_lucky_emi_catalog)
        self.assertFalse(settings_row.visible_on_sale_catalog)
        self.assertEqual(settings_row.monthly_rent, Decimal("1200.00"))

    def test_patch_rejects_negative_monthly_rent(self):
        product = self.create_product(code="BRO-NEG", name="Negative Price Product")

        response = self.client.patch(
            f"/api/v1/admin/brochures/product-settings/{product.id}/",
            {"monthly_rent": "-1.00"},
            format="json",
        )

        self.assertEqual(response.status_code, 400)

    def test_patch_returns_advisory_warning_for_visible_rent_without_price(self):
        product = Product.objects.create(
            product_code="BRO-WARN",
            name="Warning Rent Product",
            base_price=Decimal("19000.00"),
            category="Living Room",
            is_active=True,
            is_emi_enabled=True,
            is_rent_enabled=True,
            is_direct_sale_enabled=True,
        )

        response = self.client.patch(
            f"/api/v1/admin/brochures/product-settings/{product.id}/",
            {
                "visible_on_public_catalog": True,
                "visible_on_rent_catalog": True,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn(
            "Rent catalog is visible but monthly rent is missing.",
            response.data["warnings"],
        )
        self.assertTrue(
            ProductBrochureSettings.objects.filter(product=product).exists()
        )

    def test_patch_rejects_unknown_fields_and_exposes_only_safe_fields(self):
        product = self.create_product(code="BRO-ALLOW", name="Allowed Fields Product")
        original_name = product.name

        rejected = self.client.patch(
            f"/api/v1/admin/brochures/product-settings/{product.id}/",
            {"name": "Unsafe Rename", "purchase_unit_cost": "1.00"},
            format="json",
        )
        self.assertEqual(rejected.status_code, 400)
        product.refresh_from_db()
        self.assertEqual(product.name, original_name)

        response = self.client.patch(
            f"/api/v1/admin/brochures/product-settings/{product.id}/",
            {"public_badge": "Popular", "brochure_sort_order": 5},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        keys = _collect_keys(response.data)
        leaked_keys = {
            key
            for key in keys
            if any(fragment in key for fragment in PUBLIC_FORBIDDEN_KEY_FRAGMENTS)
        }
        self.assertEqual(leaked_keys, set())
        self.assertEqual(response.data["row"]["public_badge"], "Popular")
        self.assertEqual(response.data["row"]["brochure_sort_order"], 5)

    def test_bulk_update_creates_and_updates_multiple_settings(self):
        first = Product.objects.create(
            product_code="BRO-BULK-1",
            name="Bulk Product One",
            base_price=Decimal("20000.00"),
            category="Living Room",
            is_active=True,
            is_emi_enabled=True,
            is_rent_enabled=True,
            is_direct_sale_enabled=True,
        )
        second = self.create_product(code="BRO-BULK-2", name="Bulk Product Two")

        response = self.client.post(
            "/api/v1/admin/brochures/product-settings/bulk-update/",
            {
                "product_ids": [first.id, second.id],
                "updates": {
                    "visible_on_public_catalog": True,
                    "visible_on_rent_catalog": True,
                    "monthly_rent": "1400.00",
                    "security_deposit": "3500.00",
                },
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["updated_count"], 2)
        self.assertEqual(response.data["skipped_count"], 0)
        for product in (first, second):
            settings_row = ProductBrochureSettings.objects.get(product=product)
            self.assertTrue(settings_row.visible_on_public_catalog)
            self.assertTrue(settings_row.visible_on_rent_catalog)
            self.assertEqual(settings_row.monthly_rent, Decimal("1400.00"))
            self.assertEqual(settings_row.security_deposit, Decimal("3500.00"))

    def test_bulk_update_rejects_unknown_fields(self):
        product = self.create_product(code="BRO-BULK-BAD", name="Bulk Unsafe Product")

        response = self.client.post(
            "/api/v1/admin/brochures/product-settings/bulk-update/",
            {
                "product_ids": [product.id],
                "updates": {"vendor_id": 99},
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)

    def test_settings_endpoints_block_public_and_customer_access(self):
        self.client.force_authenticate(user=None)
        public_response = self.client.get("/api/v1/admin/brochures/product-settings/")
        self.assertEqual(public_response.status_code, 401)

        customer = create_customer_user(
            username="brochure_settings_customer",
            phone="9200000105",
        )
        self.client.force_authenticate(customer)
        customer_response = self.client.get("/api/v1/admin/brochures/product-settings/")
        self.assertEqual(customer_response.status_code, 403)

    def test_product_becomes_rent_brochure_eligible_after_settings_patch(self):
        product = Product.objects.create(
            product_code="BRO-RENT-PUBLISH",
            name="Rent Publish Product",
            base_price=Decimal("22000.00"),
            category="Living Room",
            is_active=True,
            is_emi_enabled=True,
            is_rent_enabled=True,
            is_direct_sale_enabled=True,
        )
        before = self.client.get("/api/v1/admin/brochures/products/?brochure_type=RENT")
        self.assertNotIn(product.id, {row["id"] for row in before.data["results"]})

        patch_response = self.client.patch(
            f"/api/v1/admin/brochures/product-settings/{product.id}/",
            {
                "visible_on_public_catalog": True,
                "visible_on_rent_catalog": True,
                "monthly_rent": "1600.00",
                "security_deposit": "4000.00",
            },
            format="json",
        )
        self.assertEqual(patch_response.status_code, 200)

        after = self.client.get("/api/v1/admin/brochures/products/?brochure_type=RENT")
        self.assertIn(product.id, {row["id"] for row in after.data["results"]})
