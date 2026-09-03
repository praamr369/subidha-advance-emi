from decimal import Decimal

from rest_framework import status
from rest_framework.test import APITestCase

from products_pim.models import MediaKind, PimProduct, ProductCategory, ProductMediaItem
from tests.helpers import create_admin_user, create_customer_user

URL = "/api/v1/admin/pim/photo-coverage/"

PIXEL = (
    b"GIF89a\x01\x00\x01\x00\x80\x00\x00\x00\x00\x00\xff\xff\xff!"
    b"\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;"
)


class PhotoCoverageApiTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="photo_admin", phone="9364000998")
        self.category = ProductCategory.objects.create(name="Beds", slug="beds-cov")

        self.shot = self._product("COV-SHOT", "Photographed Bed")
        self.bare = self._product("COV-BARE", "Unphotographed Bed")
        self._image(self.shot)

        self.client.force_authenticate(user=self.admin)

    def _product(self, code, name):
        return PimProduct.objects.create(
            code=code, name=name, category=self.category,
            base_price=Decimal("10000"), is_active=True, is_published=True,
        )

    def _image(self, product, kind=MediaKind.IMAGE):
        from django.core.files.uploadedfile import SimpleUploadedFile

        return ProductMediaItem.objects.create(
            product=product, kind=kind,
            file=SimpleUploadedFile(f"{product.code}.gif", PIXEL, content_type="image/gif"),
        )

    # ── access control ───────────────────────────────────────────────────────

    def test_requires_authentication(self):
        self.client.force_authenticate(user=None)
        self.assertIn(
            self.client.get(URL).status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )

    def test_is_not_open_to_customers(self):
        self.client.force_authenticate(user=create_customer_user(username="pc_cust", phone="9844444444"))
        self.assertIn(
            self.client.get(URL).status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )

    # ── counting ─────────────────────────────────────────────────────────────

    def test_counts_split_photographed_from_bare(self):
        d = self.client.get(URL).data

        self.assertEqual(d["total"], 2)
        self.assertEqual(d["with_photos"], 1)
        self.assertEqual(d["without_photos"], 1)

    def test_photo_count_is_per_product(self):
        self._image(self.shot)
        d = self.client.get(URL).data

        by_code = {p["code"]: p for p in d["products"]}
        self.assertEqual(by_code["COV-SHOT"]["photo_count"], 2)
        self.assertEqual(by_code["COV-BARE"]["photo_count"], 0)
        # Still one photographed product, not two.
        self.assertEqual(d["with_photos"], 1)

    def test_videos_do_not_count_as_photographs(self):
        self._image(self.bare, kind=MediaKind.VIDEO)
        d = self.client.get(URL).data

        self.assertEqual(d["with_photos"], 1)
        by_code = {p["code"]: p for p in d["products"]}
        self.assertEqual(by_code["COV-BARE"]["photo_count"], 0)

    def test_inactive_products_are_excluded(self):
        self._product("COV-OFF", "Retired").__class__.objects.filter(code="COV-OFF").update(
            is_active=False
        )
        d = self.client.get(URL).data

        self.assertEqual(d["total"], 2)
        self.assertNotIn("COV-OFF", {p["code"] for p in d["products"]})

    # ── filtering ────────────────────────────────────────────────────────────

    def test_missing_only_returns_products_without_photos(self):
        d = self.client.get(URL, {"missing_only": "true"}).data

        self.assertEqual({p["code"] for p in d["products"]}, {"COV-BARE"})
        self.assertTrue(all(p["photo_count"] == 0 for p in d["products"]))

    def test_search_matches_code_and_name(self):
        self.assertEqual(
            {p["code"] for p in self.client.get(URL, {"search": "COV-SHOT"}).data["products"]},
            {"COV-SHOT"},
        )
        self.assertEqual(
            {p["code"] for p in self.client.get(URL, {"search": "Unphotographed"}).data["products"]},
            {"COV-BARE"},
        )

    def test_totals_do_not_move_when_searching(self):
        """The coverage figure describes the catalogue, not the filtered page."""
        d = self.client.get(URL, {"search": "COV-SHOT"}).data

        self.assertEqual(d["total"], 2)
        self.assertEqual(d["without_photos"], 1)
        self.assertEqual(d["returned"], 1)

    def test_limit_is_capped(self):
        d = self.client.get(URL, {"limit": "99999"}).data

        self.assertLessEqual(d["returned"], 500)

    def test_bad_limit_falls_back_instead_of_erroring(self):
        response = self.client.get(URL, {"limit": "abc"})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
