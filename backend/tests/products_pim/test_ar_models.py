import json
import shutil
import struct
import tempfile
from decimal import Decimal

from django.core.files.storage import default_storage
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from products.services.catalog_browse_service import serialize_catalog_product_detail
from products_pim.models import (
    AttributeDataType,
    CategoryAttribute,
    MediaKind,
    MediaScope,
    PimProduct,
    ProductAttribute,
    ProductCategory,
    ProductMediaItem,
)
from products_pim.services.ar_service import PROXY_DIR, build_box_glb, suggest_ar_size
from tests.helpers import create_admin_user, create_product

MEDIA_URL = "/api/v1/pim/media/"
PRODUCTS_URL = "/api/v1/pim/products/"
PUBLIC_URL = "/api/v1/public/products/"

GLB = b"glTF\x02\x00\x00\x00" + b"\x00" * 24
USDZ = b"PK\x03\x04" + b"\x00" * 24
GIF = (
    b"GIF89a\x01\x00\x01\x00\x80\x00\x00\x00\x00\x00\xff\xff\xff!"
    b"\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;"
)

class TempMediaMixin:
    """Each test class gets its own MEDIA_ROOT, removed when the class finishes.

    Class-scoped on purpose: the parallel test runner keeps a class inside one
    worker but spreads a module's classes across workers, so a module-level
    directory removed in tearDownModule vanished under another worker mid-save.
    """

    @classmethod
    def setUpClass(cls):
        cls._media_root = tempfile.mkdtemp(prefix="ar-test-media-")
        cls._media_override = override_settings(MEDIA_ROOT=cls._media_root)
        cls._media_override.enable()
        super().setUpClass()

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        cls._media_override.disable()
        shutil.rmtree(cls._media_root, ignore_errors=True)


def _file(name, content, content_type="application/octet-stream"):
    return SimpleUploadedFile(name, content, content_type=content_type)


def _gltf_json(glb_bytes):
    """The JSON chunk of a .glb, after checking the binary header."""
    magic, version, length = struct.unpack_from("<4sII", glb_bytes, 0)
    assert magic == b"glTF" and version == 2 and length == len(glb_bytes)
    chunk_len, chunk_type = struct.unpack_from("<II", glb_bytes, 12)
    assert chunk_type == 0x4E4F534A
    return json.loads(glb_bytes[20:20 + chunk_len])


def _box_extent(gltf):
    """(x, y, z) max over every POSITION accessor."""
    maxes = [gltf["accessors"][p["attributes"]["POSITION"]]["max"] for p in gltf["meshes"][0]["primitives"]]
    return tuple(max(m[i] for m in maxes) for i in range(3))


class ArModelUploadTests(TempMediaMixin, APITestCase):
    """Admin upload of 3D models into the PIM media gallery."""

    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="ar_admin", phone="9364000871")
        self.client.force_authenticate(user=self.admin)
        category = ProductCategory.objects.create(name="Sofas", slug="sofas-ar")
        self.product = PimProduct.objects.create(
            code="AR-SOFA", name="Three Seater", category=category, base_price=Decimal("25000"),
        )

    def _upload(self, name, content, kind=MediaKind.MODEL_3D, **extra):
        return self.client.post(
            MEDIA_URL,
            {"product": self.product.id, "kind": kind, "scope": MediaScope.ALL_VARIANTS,
             "file": f"https://cdn.example.com/{name}", **extra},
            format="json",
        )

    def test_valid_glb_is_accepted(self):
        response = self._upload("sofa.glb", GLB)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data["kind"], MediaKind.MODEL_3D)
        self.assertIsNone(response.data["ios_file"])



    def test_wrong_extension_is_rejected(self):
        response = self._upload("sofa.gltf", GLB)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_glb_and_usdz_upload_together(self):
        response = self._upload("sofa.glb", GLB, ios_file="https://cdn.example.com/sofa.usdz")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertTrue(response.data["ios_file_url"])

    def test_usdz_can_be_attached_later(self):
        item_id = self._upload("sofa.glb", GLB).data["id"]

        response = self.client.patch(
            f"{MEDIA_URL}{item_id}/", {"ios_file": "https://cdn.example.com/sofa.usdz"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertTrue(ProductMediaItem.objects.get(pk=item_id).ios_file)



    def test_usdz_is_refused_on_photos(self):
        response = self._upload(
            "sofa.gif", GIF, kind=MediaKind.IMAGE, ios_file="https://cdn.example.com/sofa.usdz"
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_primary_model_does_not_unstar_the_hero_photo(self):
        photo = ProductMediaItem.objects.create(
            product=self.product, kind=MediaKind.IMAGE, is_hero=True, file="https://cdn.example.com/p.gif",
        )
        model_id = self._upload("sofa.glb", GLB).data["id"]

        response = self.client.post(f"{MEDIA_URL}{model_id}/set_hero/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        photo.refresh_from_db()
        self.assertTrue(photo.is_hero)
        self.assertTrue(ProductMediaItem.objects.get(pk=model_id).is_hero)


class PublicArModelTests(TempMediaMixin, APITestCase):
    """The public product page's `ar_model`: uploaded model, else auto size preview."""

    def setUp(self):
        super().setUp()
        self.product = create_product(
            name="AR Bed", product_code="AR-BED", base_price=Decimal("30000.00"), published=True
        )
        self.pim = PimProduct.objects.get(code="AR-BED")

    def _model(self, name, **fields):
        return ProductMediaItem.objects.create(
            product=self.pim, kind=MediaKind.MODEL_3D, file=f"https://cdn.example.com/{name}", **fields
        )

    def _size(self, width, depth, height=None):
        PimProduct.objects.filter(pk=self.pim.pk).update(ar_width_cm=width, ar_depth_cm=depth, ar_height_cm=height)

    def _detail(self):
        response = self.client.get(f"{PUBLIC_URL}AR-BED/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        return response.data

    def _preview_files(self):
        try:
            return [f for f in default_storage.listdir(PROXY_DIR)[1] if f.startswith(f"{self.pim.pk}-")]
        except FileNotFoundError:
            return []

    def test_null_without_a_model_or_size(self):
        self.assertIsNone(self._detail()["ar_model"])

    def test_uploaded_model_is_exposed(self):
        self._model("bed.glb", title="Bed")

        ar = self._detail()["ar_model"]

        self.assertEqual(ar["kind"], "MODEL")
        self.assertTrue(ar["src"].endswith(".glb"))
        self.assertIsNone(ar["ios_src"])
        self.assertEqual(ar["title"], "Bed")

    def test_primary_model_wins(self):
        self._model("first.glb", display_order=0)
        self._model("primary.glb", display_order=5, is_hero=True)

        self.assertIn("primary", self._detail()["ar_model"]["src"])

    def test_models_stay_out_of_the_photo_gallery(self):
        self._model("bed.glb")

        data = self._detail()

        self.assertEqual(data["gallery_images"], [])
        self.assertEqual(data["gallery_videos"], [])
        self.assertIsNone(data["image"])

    def test_sized_product_gets_a_true_size_preview(self):
        self._size(Decimal("200"), Decimal("90"), Decimal("85"))

        ar = self._detail()["ar_model"]

        self.assertEqual(ar["kind"], "SIZE_PREVIEW")
        self.assertEqual(ar["size_cm"], {"width": 200.0, "depth": 90.0, "height": 85.0})
        (stored,) = self._preview_files()
        with default_storage.open(f"{PROXY_DIR}/{stored}", "rb") as fh:
            extent = _box_extent(_gltf_json(fh.read()))
        # Half-width, full height, half-depth, in metres.
        for got, want in zip(extent, (1.0, 0.85, 0.45)):
            self.assertAlmostEqual(got, want, places=4)

    def test_no_height_shows_a_floor_footprint(self):
        self._size(Decimal("183"), Decimal("213"))

        self._detail()

        (stored,) = self._preview_files()
        with default_storage.open(f"{PROXY_DIR}/{stored}", "rb") as fh:
            _x, y, _z = _box_extent(_gltf_json(fh.read()))
        self.assertAlmostEqual(y, 0.02, places=4)

    def test_preview_is_cached_and_replaced_when_the_size_changes(self):
        self._size(Decimal("200"), Decimal("90"), Decimal("85"))
        self._detail()
        self._detail()
        self.assertEqual(len(self._preview_files()), 1)

        self._size(Decimal("180"), Decimal("90"), Decimal("85"))
        self._detail()

        files = self._preview_files()
        self.assertEqual(len(files), 1, "the stale preview should be removed")

    def test_uploaded_model_beats_the_size_preview(self):
        self._size(Decimal("200"), Decimal("90"), Decimal("85"))
        self._model("bed.glb")

        ar = self._detail()["ar_model"]

        self.assertEqual(ar["kind"], "MODEL")
        self.assertEqual(ar["size_cm"]["width"], 200.0)

    def test_listing_carries_the_model_too(self):
        self._model("bed.glb")

        results = self.client.get(PUBLIC_URL, {"page_size": 200}).data
        rows = results.get("results", results)

        row = next(r for r in rows if r["product_code"] == "AR-BED")
        self.assertIsNotNone(row["ar_model"])

    def test_customer_portal_detail_carries_the_model(self):
        self._size(Decimal("200"), Decimal("90"), Decimal("85"))

        payload = serialize_catalog_product_detail(self.product)

        self.assertEqual(payload["ar_model"]["kind"], "SIZE_PREVIEW")


class BoxGlbTests(APITestCase):
    def test_textured_box_is_valid_gltf(self):
        from PIL import Image
        import io

        buf = io.BytesIO()
        Image.new("RGB", (8, 8), (200, 100, 50)).save(buf, "JPEG")
        gltf = _gltf_json(build_box_glb(2.0, 0.9, 0.85, buf.getvalue()))

        self.assertEqual(len(gltf["meshes"][0]["primitives"]), 2)
        self.assertEqual(gltf["images"][0]["mimeType"], "image/jpeg")
        photo = gltf["meshes"][0]["primitives"][1]
        self.assertIn("TEXCOORD_0", photo["attributes"])


class SuggestArSizeTests(APITestCase):
    """Sizes read from attributes — suggestions for an admin to confirm."""

    def setUp(self):
        super().setUp()
        self.category = ProductCategory.objects.create(name="Furniture AR", slug="furniture-ar")
        self.pim = PimProduct.objects.create(code="AR-SUG", name="Bed", category=self.category)

    def _attr(self, name, data_type, **value):
        attribute = CategoryAttribute.objects.create(category=self.category, name=name, data_type=data_type)
        ProductAttribute.objects.create(product=self.pim, attribute=attribute, **value)

    def test_bed_size_in_feet(self):
        self._attr("Size", AttributeDataType.CHOICE, value_text="King (6x7)")

        s = suggest_ar_size(self.pim)

        self.assertEqual((s["width_cm"], s["depth_cm"], s["height_cm"]), (182.9, 213.4, None))
        self.assertIn("King (6x7)", s["source"])

    def test_named_inch_measurements(self):
        self._attr("Width (inches)", AttributeDataType.NUMBER, value_number=Decimal("40"))
        self._attr("Depth (inches)", AttributeDataType.NUMBER, value_number=Decimal("20"))
        self._attr("Bed Height (inches)", AttributeDataType.NUMBER, value_number=Decimal("30"))

        s = suggest_ar_size(self.pim)

        self.assertEqual((s["width_cm"], s["depth_cm"], s["height_cm"]), (101.6, 50.8, 76.2))

    def test_dimension_text_with_unit(self):
        self._attr("Dimensions", AttributeDataType.TEXT, value_text="180 x 200 x 45 cm")

        s = suggest_ar_size(self.pim)

        self.assertEqual((s["width_cm"], s["depth_cm"], s["height_cm"]), (180.0, 200.0, 45.0))

    def test_screen_size_is_not_a_footprint(self):
        self._attr("Screen Size", AttributeDataType.CHOICE, value_text='55"')

        self.assertIsNone(suggest_ar_size(self.pim))

    def test_nothing_to_read(self):
        self._attr("Colour", AttributeDataType.TEXT, value_text="Walnut")

        self.assertIsNone(suggest_ar_size(self.pim))


class ArAdminActionTests(TempMediaMixin, APITestCase):
    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=create_admin_user(username="ar_admin2", phone="9364000872"))
        self.category = ProductCategory.objects.create(name="Beds AR", slug="beds-ar")
        self.size_attr = CategoryAttribute.objects.create(
            category=self.category, name="Size", data_type=AttributeDataType.CHOICE
        )

    def _pim(self, code, size_text=None, **fields):
        pim = PimProduct.objects.create(code=code, name=code, category=self.category, is_published=True, **fields)
        if size_text:
            ProductAttribute.objects.create(product=pim, attribute=self.size_attr, value_text=size_text)
        return pim

    def test_suggestion_endpoint(self):
        pim = self._pim("AR-Q", "Queen (5x7)")

        response = self.client.get(f"{PRODUCTS_URL}{pim.id}/ar_size_suggestion/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["suggestion"]["width_cm"], 152.4)

    def test_fill_only_touches_blank_sizes(self):
        blank = self._pim("AR-BLANK", "Single (3x6)")
        manual = self._pim("AR-MANUAL", "King (6x7)", ar_width_cm=Decimal("190"), ar_depth_cm=Decimal("220"))
        self._pim("AR-NODATA")

        response = self.client.post(f"{PRODUCTS_URL}fill_ar_sizes/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["filled"], 1)
        blank.refresh_from_db()
        manual.refresh_from_db()
        self.assertEqual(blank.ar_width_cm, Decimal("91.4"))
        self.assertEqual(manual.ar_width_cm, Decimal("190.0"), "a saved size must never be overwritten")

    def test_coverage_counts(self):
        with_model = self._pim("AR-M")
        ProductMediaItem.objects.create(product=with_model, kind=MediaKind.MODEL_3D, file="https://cdn.example.com/m.glb")
        self._pim("AR-S", ar_width_cm=Decimal("100"), ar_depth_cm=Decimal("50"))
        self._pim("AR-N")

        d = self.client.get(f"{PRODUCTS_URL}ar_coverage/").data

        self.assertEqual((d["total"], d["with_model"], d["size_preview_only"], d["not_ready"]), (3, 1, 1, 1))
        self.assertEqual([p["code"] for p in d["missing"]], ["AR-N"])

    def test_customers_cannot_fill_sizes(self):
        from tests.helpers import create_customer_user

        self.client.force_authenticate(user=create_customer_user(username="ar_cust", phone="9844440871"))

        response = self.client.post(f"{PRODUCTS_URL}fill_ar_sizes/")

        self.assertIn(response.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))
