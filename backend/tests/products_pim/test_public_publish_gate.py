from decimal import Decimal

from rest_framework import status
from rest_framework.test import APITestCase

from products_pim.models import PimProduct
from tests.helpers import create_product

LIST_URL = "/api/v1/public/products/"


class PublicPublishGateTests(APITestCase):
    """
    The public catalogue must honour PimProduct.is_published.

    This filter was described in the view's own comment but never implemented,
    so unpublishing a product in the PIM left it visible on the public site —
    and reachable by direct URL. These pin the rule in both places.
    """

    def setUp(self):
        super().setUp()
        self.published = self._product("GATE-PUB", "Published Item", published=True)
        self.hidden = self._product("GATE-HID", "Unpublished Item", published=False)

    def _product(self, code, name, *, published):
        # The PIM record is created by the post_save signal; the helper's
        # `published` flag drives is_published on it.
        return create_product(
            name=name, product_code=code, base_price=Decimal("5000.00"), published=published
        )

    def _listed_codes(self):
        response = self.client.get(LIST_URL, {"page_size": 200})
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        results = response.data.get("results", response.data)
        return {r["product_code"] for r in results}

    # ── listing ──────────────────────────────────────────────────────────────

    def test_published_product_is_listed(self):
        self.assertIn("GATE-PUB", self._listed_codes())

    def test_unpublished_product_is_not_listed(self):
        self.assertNotIn("GATE-HID", self._listed_codes())

    def test_unpublishing_removes_it_from_the_catalogue(self):
        self.assertIn("GATE-PUB", self._listed_codes())

        PimProduct.objects.filter(code="GATE-PUB").update(is_published=False)

        self.assertNotIn("GATE-PUB", self._listed_codes())

    def test_publishing_adds_it_back(self):
        PimProduct.objects.filter(code="GATE-HID").update(is_published=True)

        self.assertIn("GATE-HID", self._listed_codes())

    def test_search_does_not_bypass_the_gate(self):
        response = self.client.get(LIST_URL, {"search": "Unpublished"})

        results = response.data.get("results", response.data)
        self.assertNotIn("GATE-HID", {r["product_code"] for r in results})

    def test_product_without_any_pim_record_stays_visible(self):
        """Operational-only products have no PIM record and are shown as-is."""
        product = create_product(
            name="No Pim Item", product_code="GATE-NOPIM", base_price=Decimal("900.00")
        )
        PimProduct.objects.filter(source_product=product).delete()

        self.assertIn("GATE-NOPIM", self._listed_codes())

    # ── detail ───────────────────────────────────────────────────────────────

    def test_unpublished_product_is_not_reachable_by_direct_url(self):
        """Gating only the listing would leave the detail page as a side door."""
        response = self.client.get(f"{LIST_URL}GATE-HID/")

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_published_product_detail_is_reachable(self):
        response = self.client.get(f"{LIST_URL}GATE-PUB/")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["product_code"], "GATE-PUB")

    # ── blueprint + variant publish qualification ─────────────────────────────

    def test_blueprint_with_published_variant_is_listed_and_reachable(self):
        """A blueprint whose base PIM is draft (e.g. BAHU-BED) must be public
        if any of its child variants (e.g. BAHU-BED-MET-K(FX7F) are published."""
        from products_pim.models import ProductVariant

        blueprint = self._product("BLUE-BED", "Blue Bed Blueprint", published=False)
        base_pim = blueprint.pim.first()
        self.assertFalse(base_pim.is_published)

        # Create child PIM product for variant marked published
        PimProduct.objects.create(
            code="BLUE-BED-KING",
            name="Blue Bed - King",
            category=base_pim.category,
            parent=base_pim,
            is_published=True,
            base_price=Decimal("15000.00"),
        )
        ProductVariant.objects.create(
            product=base_pim,
            sku="BLUE-BED-KING",
            price=Decimal("15000.00"),
        )

        # 1. Blueprint must be in public listing
        self.assertIn("BLUE-BED", self._listed_codes())

        # 2. Blueprint must be reachable by base code (QR code destination)
        resp = self.client.get(f"{LIST_URL}BLUE-BED/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        self.assertEqual(resp.data["product_code"], "BLUE-BED")

        # 3. Reachable by variant SKU directly
        resp_var = self.client.get(f"{LIST_URL}BLUE-BED-KING/")
        self.assertEqual(resp_var.status_code, status.HTTP_200_OK, resp_var.data)

    def test_blueprint_with_only_draft_variants_remains_hidden(self):
        """A blueprint with only draft variants must stay 404 and unlisted."""
        from products_pim.models import ProductVariant

        blueprint = self._product("DRAFT-BED", "Draft Bed Blueprint", published=False)
        base_pim = blueprint.pim.first()

        PimProduct.objects.create(
            code="DRAFT-BED-KING",
            name="Draft Bed - King",
            category=base_pim.category,
            parent=base_pim,
            is_published=False,
            base_price=Decimal("15000.00"),
        )
        ProductVariant.objects.create(
            product=base_pim,
            sku="DRAFT-BED-KING",
            price=Decimal("15000.00"),
        )

        self.assertNotIn("DRAFT-BED", self._listed_codes())

        resp = self.client.get(f"{LIST_URL}DRAFT-BED/")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

        resp_var = self.client.get(f"{LIST_URL}DRAFT-BED-KING/")
        self.assertEqual(resp_var.status_code, status.HTTP_404_NOT_FOUND)
