import shutil
import tempfile
from decimal import Decimal
from io import StringIO
from pathlib import Path

from django.core.management import call_command
from django.test import TestCase, override_settings

from products_pim.models import (
    MediaKind,
    MediaScope,
    PimProduct,
    ProductCategory,
    ProductMediaItem,
    ProductVariant,
)

# 1x1 GIF — smallest thing Django will accept as a real uploaded file.
PIXEL = (
    b"GIF89a\x01\x00\x01\x00\x80\x00\x00\x00\x00\x00\xff\xff\xff!"
    b"\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;"
)


class ImportProductImagesTests(TestCase):
    def setUp(self):
        super().setUp()
        self.media_root = tempfile.mkdtemp(prefix="testmedia-")
        self.src = Path(tempfile.mkdtemp(prefix="testphotos-"))
        self.addCleanup(shutil.rmtree, self.media_root, ignore_errors=True)
        self.addCleanup(shutil.rmtree, self.src, ignore_errors=True)

        self.category = ProductCategory.objects.create(name="Beds", slug="beds")
        self.pim = PimProduct.objects.create(
            code="BED-001", name="Sagwan Bed", category=self.category, base_price=Decimal("20000"),
        )
        self.other = PimProduct.objects.create(
            code="SOFA-001", name="Corner Sofa", category=self.category, base_price=Decimal("30000"),
        )
        self.variant = ProductVariant.objects.create(
            product=self.pim, sku="BED-001-KING", price=Decimal("22000"),
        )

    def _file(self, relpath: str, data: bytes = PIXEL) -> Path:
        p = self.src / relpath
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)
        return p

    def _run(self, *args) -> str:
        out = StringIO()
        with override_settings(MEDIA_ROOT=self.media_root):
            call_command("import_product_images", str(self.src), *args, stdout=out, stderr=out)
        return out.getvalue()

    # ── safety ───────────────────────────────────────────────────────────────

    def test_dry_run_is_the_default_and_writes_nothing(self):
        self._file("BED-001.jpg")

        output = self._run()

        self.assertEqual(ProductMediaItem.objects.count(), 0)
        self.assertIn("Would import", output)
        self.assertIn("--commit", output)

    def test_commit_attaches_the_image_to_the_right_product(self):
        self._file("BED-001.jpg")

        self._run("--commit")

        item = ProductMediaItem.objects.get()
        self.assertEqual(item.product, self.pim)
        self.assertEqual(item.kind, MediaKind.IMAGE)
        self.assertIn("BED-001", item.file.name)

    def test_rerunning_does_not_duplicate(self):
        self._file("BED-001.jpg")

        self._run("--commit")
        output = self._run("--commit")

        self.assertEqual(ProductMediaItem.objects.count(), 1)
        self.assertIn("already imported", output)

    # ── matching ─────────────────────────────────────────────────────────────

    def test_numbered_suffixes_order_the_gallery_and_keep_the_code(self):
        self._file("BED-001.jpg")
        self._file("BED-001_2.jpg")
        self._file("BED-001-3.jpg")

        self._run("--commit")

        items = ProductMediaItem.objects.filter(product=self.pim).order_by("display_order")
        self.assertEqual(items.count(), 3)
        self.assertEqual([i.display_order for i in items], [0, 1, 2])

    def test_folder_per_product_layout(self):
        self._file("SOFA-001/front.jpg")
        self._file("SOFA-001/back.jpg")

        self._run("--commit")

        self.assertEqual(ProductMediaItem.objects.filter(product=self.other).count(), 2)

    def test_variant_sku_matches_and_scopes_the_media_to_that_variant(self):
        self._file("BED-001-KING.jpg")

        self._run("--commit")

        item = ProductMediaItem.objects.get()
        self.assertEqual(item.product, self.pim)
        self.assertEqual(item.variant, self.variant)
        self.assertEqual(item.scope, MediaScope.VARIANT)

    def test_matching_is_case_insensitive(self):
        self._file("bed-001.JPG")

        self._run("--commit")

        self.assertEqual(ProductMediaItem.objects.get().product, self.pim)

    def test_unmatched_files_are_reported_and_not_imported(self):
        self._file("NOT-A-PRODUCT.jpg")

        output = self._run("--commit")

        self.assertEqual(ProductMediaItem.objects.count(), 0)
        self.assertIn("No product matched", output)
        self.assertIn("NOT-A-PRODUCT.jpg", output)

    # ── filtering ────────────────────────────────────────────────────────────

    def test_non_media_files_are_ignored_and_video_needs_opting_in(self):
        self._file("BED-001.txt")
        self._file("BED-001.mp4")

        self._run("--commit")
        self.assertEqual(ProductMediaItem.objects.count(), 0)

        self._run("--commit", "--include-video")
        item = ProductMediaItem.objects.get()
        self.assertEqual(item.kind, MediaKind.VIDEO)

    def test_empty_files_are_skipped(self):
        self._file("BED-001.jpg", data=b"")

        output = self._run("--commit")

        self.assertEqual(ProductMediaItem.objects.count(), 0)
        self.assertIn("empty file", output)

    def test_limit_caps_the_number_of_files(self):
        for i in range(1, 5):
            self._file(f"BED-001_{i}.jpg")

        self._run("--commit", "--limit", "2")

        self.assertEqual(ProductMediaItem.objects.count(), 2)

    # ── hero ─────────────────────────────────────────────────────────────────

    def test_set_hero_marks_only_the_first_image_per_product(self):
        self._file("BED-001.jpg")
        self._file("BED-001_2.jpg")
        self._file("SOFA-001.jpg")

        self._run("--commit", "--set-hero")

        self.assertEqual(ProductMediaItem.objects.filter(product=self.pim, is_hero=True).count(), 1)
        self.assertEqual(ProductMediaItem.objects.filter(product=self.other, is_hero=True).count(), 1)

    def test_existing_hero_is_not_replaced(self):
        self._file("BED-001.jpg")
        self._run("--commit", "--set-hero")
        first = ProductMediaItem.objects.get(product=self.pim, is_hero=True)

        self._file("BED-001_2.jpg")
        self._run("--commit", "--set-hero")

        heroes = ProductMediaItem.objects.filter(product=self.pim, is_hero=True)
        self.assertEqual(heroes.count(), 1)
        self.assertEqual(heroes.first().pk, first.pk)

    def test_missing_source_folder_fails_clearly(self):
        from django.core.management.base import CommandError

        with self.assertRaises(CommandError):
            call_command("import_product_images", str(self.src / "nope"), stdout=StringIO())
