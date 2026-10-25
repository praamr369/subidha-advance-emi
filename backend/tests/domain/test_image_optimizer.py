"""Unit tests for the image optimization service."""
import io
from decimal import Decimal
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from PIL import Image

from products_core.models import Product
from products_core.services.image_optimizer import optimize_image_file, optimize_image_field


class ImageOptimizerTests(TestCase):
    def _create_test_image(self, width: int, height: int, format: str = "JPEG", color: str = "blue") -> io.BytesIO:
        img = Image.new("RGB", (width, height), color=color)
        buf = io.BytesIO()
        img.save(buf, format=format)
        buf.seek(0)
        return buf

    def test_optimize_image_file_resizes_oversized_image(self):
        # Create 2000x1500 JPEG
        buf = self._create_test_image(2000, 1500, format="JPEG")
        uploaded = SimpleUploadedFile("sofa_large.jpg", buf.getvalue(), content_type="image/jpeg")

        result = optimize_image_file(uploaded, max_dimension=1200, quality=80)
        self.assertIsNotNone(result)
        content_file, new_name = result

        self.assertTrue(new_name.endswith(".webp"))
        # Check output dimensions with PIL
        with Image.open(content_file) as out_img:
            self.assertEqual(out_img.format, "WEBP")
            self.assertLessEqual(max(out_img.width, out_img.height), 1200)
            # Aspect ratio preserved (2000:1500 = 4:3 => 1200:900)
            self.assertEqual(out_img.width, 1200)
            self.assertEqual(out_img.height, 900)

    def test_optimize_image_file_converts_png_with_transparency_to_webp(self):
        # Create RGBA PNG
        img = Image.new("RGBA", (400, 300), color=(255, 0, 0, 128))
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)
        uploaded = SimpleUploadedFile("chair_trans.png", buf.getvalue(), content_type="image/png")

        result = optimize_image_file(uploaded, max_dimension=1200)
        self.assertIsNotNone(result)
        content_file, new_name = result

        self.assertTrue(new_name.endswith(".webp"))
        with Image.open(content_file) as out_img:
            self.assertEqual(out_img.format, "WEBP")
            self.assertEqual(out_img.mode, "RGBA")
            self.assertEqual(out_img.size, (400, 300))

    def test_product_save_auto_converts_uploaded_image_to_webp(self):
        buf = self._create_test_image(1600, 1200, format="JPEG")
        uploaded = SimpleUploadedFile("raw_phone_photo.jpg", buf.getvalue(), content_type="image/jpeg")

        product = Product.objects.create(
            product_code="TEST-OPT-01",
            name="Optimized Sofa Test",
            base_price=Decimal("15000.00"),
            image=uploaded,
        )

        self.assertTrue(product.image.name.lower().endswith(".webp"))
        # Verify file on disk is valid WebP
        with product.image.open("rb") as f:
            with Image.open(f) as saved_img:
                self.assertEqual(saved_img.format, "WEBP")
                self.assertLessEqual(max(saved_img.width, saved_img.height), 1200)
