from decimal import Decimal

from rest_framework import status
from rest_framework.test import APITestCase

from products_pim.models import PimProduct, ProductCategory
from tests.helpers import create_admin_user

URL = "/api/v1/pim/products/"


class PimTreePagingTests(APITestCase):
    """The admin PIM tree pages through blueprints and loads their variant SKUs per page."""

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=create_admin_user(username="tree_admin", phone="9364000881"))
        self.category = ProductCategory.objects.create(name="Beds Tree", slug="beds-tree")
        self.bed = self._pim("TR-BED", "Alpha Bed", published=True)
        self.king = self._pim("TR-BED-K", "Alpha Bed King", parent=self.bed)
        self.queen = self._pim("TR-BED-Q", "Alpha Bed Queen", parent=self.bed)
        self.sofa = self._pim("TR-SOFA", "Beta Sofa")

    def _pim(self, code, name, *, parent=None, published=False):
        return PimProduct.objects.create(
            code=code, name=name, category=self.category, parent=parent,
            base_price=Decimal("1000"), is_published=published,
        )

    def _codes(self, response):
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        rows = response.data.get("results", response.data)
        return [r["code"] for r in rows]

    def test_roots_only_lists_blueprints_without_their_skus(self):
        codes = self._codes(self.client.get(URL, {"roots_only": "true", "category": self.category.id}))

        self.assertEqual(sorted(codes), ["TR-BED", "TR-SOFA"])

    def test_blueprints_page_through(self):
        first = self.client.get(URL, {"roots_only": "true", "category": self.category.id, "page_size": 1})
        second = self.client.get(
            URL, {"roots_only": "true", "category": self.category.id, "page_size": 1, "page": 2}
        )

        self.assertEqual(first.data["count"], 2)
        self.assertEqual(len(first.data["results"]), 1)
        self.assertNotEqual(self._codes(first), self._codes(second))

    def test_sku_search_finds_its_blueprint_once(self):
        codes = self._codes(self.client.get(URL, {"roots_only": "true", "search": "TR-BED-K"}))

        self.assertEqual(codes, ["TR-BED"])

    def test_name_search_matching_several_skus_does_not_duplicate(self):
        codes = self._codes(self.client.get(URL, {"roots_only": "true", "search": "Alpha Bed"}))

        self.assertEqual(codes, ["TR-BED"])

    def test_parent_filter_returns_skus_of_the_page(self):
        codes = self._codes(self.client.get(URL, {"parent": f"{self.bed.id},{self.sofa.id}"}))

        self.assertEqual(sorted(codes), ["TR-BED-K", "TR-BED-Q"])

    def test_plain_list_is_unchanged(self):
        codes = self._codes(self.client.get(URL, {"category": self.category.id, "page_size": 50}))

        self.assertEqual(len(codes), 4)

    def test_tree_summary_counts(self):
        response = self.client.get(f"{URL}tree_summary/", {"category": self.category.id})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data, {"blueprints": 2, "published": 1, "draft": 1, "variant_skus": 2}
        )

    def test_tree_summary_follows_search(self):
        response = self.client.get(f"{URL}tree_summary/", {"search": "Beta"})

        self.assertEqual(response.data["blueprints"], 1)
        self.assertEqual(response.data["variant_skus"], 0)
