"""
Shared base models and helper functions for the SUBIDHA CORE domain.

Contains:
- TimeStampedModel (abstract base)
- MONEY_ZERO, HUNDRED constants
- q2() decimal rounding helper
- File upload path generators
- _default_branch() helper

All domain-split apps should import from here instead of
subscriptions.models to avoid circular dependencies.
"""

import hashlib
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from uuid import uuid4

from django.conf import settings
from django.db import models
from django.utils import timezone
from django.utils.text import slugify


MONEY_ZERO = Decimal("0.00")
HUNDRED = Decimal("100.00")


def _default_branch():
    try:
        from branch_control.services.branch_service import default_branch_for_model

        return default_branch_for_model()
    except Exception:
        return None


class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        abstract = True


def q2(value: Decimal) -> Decimal:
    return (value or MONEY_ZERO).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


# ---------------------------------------------------------------------------
# File upload path generators
# ---------------------------------------------------------------------------

def _normalize_product_image_identity(value: str | None, *, fallback: str) -> str:
    normalized = slugify((value or "").strip())
    return normalized or fallback


def product_video_upload_to(instance, filename: str) -> str:
    extension = Path(filename or "").suffix.lower()
    if not extension:
        extension = ".mp4"

    product_code = (getattr(instance, "product_code", "") or "").strip()
    if product_code:
        identity_seed = product_code
    else:
        identity_seed = str(uuid.uuid4())

    hash_key = hashlib.md5(identity_seed.encode("utf-8")).hexdigest()[:8]
    return f"products/{hash_key}/video_{hash_key}{extension}"


def product_image_upload_to(instance, filename: str) -> str:
    extension = Path(filename or "").suffix.lower()
    if not extension:
        extension = ".img"

    product_code = (getattr(instance, "product_code", "") or "").strip()
    if product_code:
        identity_seed = product_code
        fallback_identity = "product"
    else:
        product_pk = getattr(instance, "pk", None)
        identity_seed = f"product-{product_pk}" if product_pk else "product"
        fallback_identity = identity_seed

    identity = _normalize_product_image_identity(
        identity_seed,
        fallback=fallback_identity,
    )
    token = uuid4().hex[:10]
    return f"products/{identity}/{identity}-{token}{extension}"


def subscription_document_upload_to(instance, filename: str) -> str:
    extension = Path(filename or "").suffix.lower()
    if not extension:
        extension = ".bin"

    subscription_id = getattr(instance, "subscription_id", None)
    doc_type = (getattr(instance, "document_type", "") or "DOC").strip().lower()
    token = uuid4().hex[:12]
    identity = f"sub-{subscription_id}" if subscription_id else "subscription"
    return f"subscriptions/{identity}/{doc_type}-{token}{extension}"


def customer_photo_upload_to(instance, filename: str) -> str:
    extension = Path(filename or "").suffix.lower()
    if not extension:
        extension = ".jpg"
    customer_id = getattr(instance, "id", None) or getattr(instance, "pk", None)
    token = uuid4().hex[:10]
    identity = f"cust-{customer_id}" if customer_id else "customer"
    return f"customers/photos/{identity}/{token}{extension}"


def customer_kyc_doc_upload_to(instance, filename: str) -> str:
    extension = Path(filename or "").suffix.lower()
    if not extension:
        extension = ".bin"
    customer_id = getattr(instance, "customer_id", None)
    doc_type = (getattr(instance, "document_type", "") or "KYC").strip().lower()
    token = uuid4().hex[:12]
    identity = f"cust-{customer_id}" if customer_id else "customer"
    return f"customers/kyc/{identity}/{doc_type}-{token}{extension}"
