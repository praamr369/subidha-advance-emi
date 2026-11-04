from decimal import Decimal

from rest_framework import status
from rest_framework.test import APITestCase

from products_pim.models import PimProduct
from tests.helpers import create_product, create_admin_user

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
        """A draft blueprint is NOT listed in the public catalogue, but is reachable
        by QR code destination URL when it has published variants."""
        from products_pim.models import ProductVariant

        blueprint = self._product("BLUE-BED", "Blue Bed Blueprint", published=False)
        base_pim = blueprint.pim.first()
        self.assertFalse(base_pim.is_published)

        # Create child operational product and PIM product for variant marked published
        var_prod = self._product("BLUE-BED-KING", "Blue Bed - King", published=True)
        var_pim = var_prod.pim.first()
        var_pim.parent = base_pim
        var_pim.save(update_fields=["parent"])

        ProductVariant.objects.create(
            product=base_pim,
            operational_product=var_prod,
            sku="BLUE-BED-KING",
            price=Decimal("15000.00"),
            is_active=True,
        )

        # 1. Draft blueprint must NOT be in public listing (no dummy ₹0 card)
        self.assertNotIn("BLUE-BED", self._listed_codes())

        # 2. Published variant MUST be in public listing
        self.assertIn("BLUE-BED-KING", self._listed_codes())

        # 3. Blueprint is reachable by base code (QR code destination)
        resp = self.client.get(f"{LIST_URL}BLUE-BED/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        self.assertEqual(resp.data["product_code"], "BLUE-BED")

        # 4. Reachable by variant SKU directly
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

    def test_variant_publish_control_allows_draft_base_with_published_variant(self):
        """Admin can publish a single variant while keeping base blueprint in draft."""
        from products_pim.models import ProductVariant

        admin = create_admin_user(username="pub_admin", phone="9364000123")
        self.client.force_authenticate(user=admin)

        blueprint = self._product("SOLO-BED", "Solo Bed Blueprint", published=False)
        base_pim = blueprint.pim.first()
        self.assertFalse(base_pim.is_published)

        var_king = PimProduct.objects.create(
            code="SOLO-BED-KING",
            name="Solo Bed - King",
            category=base_pim.category,
            parent=base_pim,
            is_published=False,
            base_price=Decimal("15000.00"),
        )
        ProductVariant.objects.create(
            product=base_pim,
            sku="SOLO-BED-KING",
            price=Decimal("15000.00"),
        )
        var_queen = PimProduct.objects.create(
            code="SOLO-BED-QUEEN",
            name="Solo Bed - Queen",
            category=base_pim.category,
            parent=base_pim,
            is_published=False,
            base_price=Decimal("12000.00"),
        )
        ProductVariant.objects.create(
            product=base_pim,
            sku="SOLO-BED-QUEEN",
            price=Decimal("12000.00"),
        )

        # PATCH publish control: base_published=False, King=True, Queen=False
        url = f"/api/v1/pim/products/{base_pim.id}/variants_publish_control/"
        resp = self.client.patch(
            url,
            {
                "base_published": False,
                "variants": [
                    {"id": var_king.id, "is_published": True},
                    {"id": var_queen.id, "is_published": False},
                ],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        self.assertFalse(resp.data["base"]["is_published"])

        base_pim.refresh_from_db()
        var_king.refresh_from_db()
        var_queen.refresh_from_db()

        self.assertFalse(base_pim.is_published, "Base blueprint must remain in draft")
        self.assertTrue(var_king.is_published, "King variant must be published")
        self.assertFalse(var_queen.is_published, "Queen variant must remain in draft")

    def test_bulk_publish_only_selected_variant_preserves_draft_base_and_siblings(self):
        """Bulk publish with a specific variant ID publishes ONLY that variant."""
        from products_pim.models import ProductVariant

        admin = create_admin_user(username="bulk_pub_admin", phone="9364000124")
        self.client.force_authenticate(user=admin)

        blueprint = self._product("BULK-BED", "Bulk Bed Blueprint", published=False)
        base_pim = blueprint.pim.first()

        var_king = PimProduct.objects.create(
            code="BULK-BED-KING",
            name="Bulk Bed - King",
            category=base_pim.category,
            parent=base_pim,
            is_published=False,
            base_price=Decimal("16000.00"),
        )
        ProductVariant.objects.create(product=base_pim, sku="BULK-BED-KING", price=Decimal("16000.00"))
        var_queen = PimProduct.objects.create(
            code="BULK-BED-QUEEN",
            name="Bulk Bed - Queen",
            category=base_pim.category,
            parent=base_pim,
            is_published=False,
            base_price=Decimal("13000.00"),
        )
        ProductVariant.objects.create(product=base_pim, sku="BULK-BED-QUEEN", price=Decimal("13000.00"))

        # Bulk publish ONLY the King variant
        resp = self.client.post(
            "/api/v1/pim/products/bulk-publish/",
            {"product_ids": [var_king.id], "published": True},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        self.assertEqual(resp.data["affected_products"], 1)

        base_pim.refresh_from_db()
        var_king.refresh_from_db()
        var_queen.refresh_from_db()

        self.assertFalse(base_pim.is_published, "Base blueprint must stay draft")
        self.assertTrue(var_king.is_published, "Selected King variant must be published")
        self.assertFalse(var_queen.is_published, "Unselected Queen variant must stay draft")

    def test_variant_publish_activates_product_variant_and_filters_public_detail(self):
        """Publishing a variant activates its ProductVariant and only shows published variants publicly."""
        from products_pim.models import ProductVariant

        admin = create_admin_user(username="detail_pub_admin", phone="9364000125")
        self.client.force_authenticate(user=admin)

        blueprint = self._product("DETAIL-BED", "Detail Bed Blueprint", published=False)
        base_pim = blueprint.pim.first()

        var_king_prod = create_product(name="Detail Bed - King", product_code="DETAIL-BED-KING", published=False)
        var_king = PimProduct.objects.filter(source_product=var_king_prod).first()
        var_king.parent = base_pim
        var_king.is_published = False
        var_king.save(update_fields=["parent", "is_published"])

        pv_king = ProductVariant.objects.create(
            product=base_pim,
            operational_product=var_king_prod,
            sku="DETAIL-BED-KING",
            price=Decimal("17000.00"),
            is_active=False,
        )

        var_queen_prod = create_product(name="Detail Bed - Queen", product_code="DETAIL-BED-QUEEN", published=False)
        var_queen = PimProduct.objects.filter(source_product=var_queen_prod).first()
        var_queen.parent = base_pim
        var_queen.is_published = False
        var_queen.save(update_fields=["parent", "is_published"])

        pv_queen = ProductVariant.objects.create(
            product=base_pim,
            operational_product=var_queen_prod,
            sku="DETAIL-BED-QUEEN",
            price=Decimal("14000.00"),
            is_active=True,
        )

        # Publish King variant via variants_publish_control
        resp = self.client.patch(
            f"/api/v1/pim/products/{base_pim.id}/variants_publish_control/",
            {
                "base_published": False,
                "variants": [
                    {"id": var_king.id, "is_published": True},
                    {"id": var_queen.id, "is_published": False},
                ],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        pv_king.refresh_from_db()
        self.assertTrue(pv_king.is_active, "ProductVariant must be activated when variant is published")

        # In the public catalogue listing:
        self.client.force_authenticate(user=None)
        listed = self._listed_codes()
        self.assertNotIn("DETAIL-BED", listed, "Draft blueprint must NOT appear in public catalogue listing")
        self.assertIn("DETAIL-BED-KING", listed, "Published King variant MUST appear in public catalogue listing")
        self.assertNotIn("DETAIL-BED-QUEEN", listed, "Draft Queen variant must NOT appear in public catalogue listing")

        # Now test public unauthenticated detail access on base blueprint
        resp_detail = self.client.get(f"{LIST_URL}DETAIL-BED/")
        self.assertEqual(resp_detail.status_code, status.HTTP_200_OK)

        pim_variant_skus = {v["sku"] for v in resp_detail.data.get("pim_variants", [])}
        self.assertIn("DETAIL-BED-KING", pim_variant_skus, "Published variant must be listed under blueprint")
        self.assertNotIn("DETAIL-BED-QUEEN", pim_variant_skus, "Draft variant must NOT be listed under blueprint")

        # Reachable by published variant directly
        resp_king = self.client.get(f"{LIST_URL}DETAIL-BED-KING/")
        self.assertEqual(resp_king.status_code, status.HTTP_200_OK)

        # Unreachable by draft variant directly (stays 404)
        resp_queen = self.client.get(f"{LIST_URL}DETAIL-BED-QUEEN/")
        self.assertEqual(resp_queen.status_code, status.HTTP_404_NOT_FOUND)
