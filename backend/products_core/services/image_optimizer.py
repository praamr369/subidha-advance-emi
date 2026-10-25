"""Image optimization service for products and catalog assets.

Automatically resizes oversized images and converts them to efficient WebP format
to save 90-95% disk space and bandwidth on product uploads.
"""
from __future__ import annotations

import io
import logging
from pathlib import Path
from typing import Any

from django.core.files.base import ContentFile
from django.core.files.uploadedfile import UploadedFile
from PIL import Image, ImageOps

logger = logging.getLogger(__name__)

DEFAULT_MAX_DIMENSION = 1200
DEFAULT_WEBP_QUALITY = 80


def optimize_image_file(
    image_file: Any,
    filename: str = "",
    max_dimension: int = DEFAULT_MAX_DIMENSION,
    quality: int = DEFAULT_WEBP_QUALITY,
) -> tuple[ContentFile, str] | None:
    """Optimize an image file to WebP format with max dimension bounds.

    Returns a tuple of (ContentFile, new_filename) or None if optimization
    was skipped or failed.
    """
    if not image_file:
        return None

    original_name = getattr(image_file, "name", filename) or filename or "image.jpg"
    stem = Path(original_name).stem or "image"
    new_filename = f"{stem}.webp"

    try:
        # Seek to start if file-like
        if hasattr(image_file, "seek"):
            image_file.seek(0)

        with Image.open(image_file) as img:
            # Handle EXIF orientation (e.g. mobile phone photos)
            img = ImageOps.exif_transpose(img)

            # Convert color space for WebP
            # WebP supports RGB and RGBA. If CMYK, P, or other mode, convert to RGB or RGBA.
            if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
                target_mode = "RGBA"
            else:
                target_mode = "RGB"

            if img.mode != target_mode:
                img = img.convert(target_mode)

            # Resize if dimensions exceed max_dimension
            width, height = img.size
            if max(width, height) > max_dimension:
                # Use Resampling.LANCZOS (Pillow >= 9.1.0)
                resample = getattr(getattr(Image, "Resampling", Image), "LANCZOS", Image.LANCZOS)
                img.thumbnail((max_dimension, max_dimension), resample=resample)

            # Encode to WebP buffer
            buffer = io.BytesIO()
            img.save(
                buffer,
                format="WEBP",
                quality=quality,
                method=4,
                optimize=True,
            )
            buffer.seek(0)
            return ContentFile(buffer.getvalue(), name=new_filename), new_filename

    except Exception as exc:
        logger.warning(
            "Failed to optimize image %s to WebP (preserving original): %s",
            original_name,
            exc,
        )
        return None


def optimize_image_field(
    instance: Any,
    field_name: str,
    max_dimension: int = DEFAULT_MAX_DIMENSION,
    quality: int = DEFAULT_WEBP_QUALITY,
) -> bool:
    """Optimize a model's ImageField if a new uncommitted file was assigned.

    Modifies the field in-place before instance.save().
    Returns True if an optimization was performed, False otherwise.
    """
    field_file = getattr(instance, field_name, None)
    if not field_file:
        return False

    # Guard: only optimize newly assigned files (uncommitted).
    # Already-committed files loaded from database/storage have _committed=True.
    if getattr(field_file, "_committed", True):
        return False

    file_obj = getattr(field_file, "file", None)
    if not file_obj:
        return False

    # Check if already optimized in this instance lifecycle
    cache_key = f"_{field_name}_optimized"
    if getattr(instance, cache_key, False):
        return False

    result = optimize_image_file(
        file_obj,
        filename=field_file.name,
        max_dimension=max_dimension,
        quality=quality,
    )
    if result is None:
        return False

    optimized_content, new_filename = result
    # Replace file with optimized WebP content
    field_file.file = optimized_content
    field_file.name = new_filename
    field_file._committed = False
    setattr(instance, cache_key, True)
    return True
