from __future__ import annotations

import re
from datetime import timedelta

from django.utils import timezone

from brochures.models import BrochureEnquiry


def normalize_phone_for_comparison(value: str | None) -> str:
    raw = str(value or "").strip()
    has_plus = raw.startswith("+")
    digits = re.sub(r"\D", "", raw)
    if not digits:
        return ""
    if len(digits) == 10:
        return f"+91{digits}"
    if len(digits) == 12 and digits.startswith("91"):
        return f"+{digits}"
    return f"+{digits}" if has_plus else digits


def mark_possible_duplicate(enquiry: BrochureEnquiry) -> BrochureEnquiry:
    product_ids = set(
        enquiry.products.exclude(product_id=None).values_list("product_id", flat=True)
    )
    if not enquiry.phone_normalized or not product_ids:
        return enquiry

    cutoff = timezone.now() - timedelta(hours=24)
    candidates = (
        BrochureEnquiry.objects.filter(
            phone_normalized=enquiry.phone_normalized,
            brochure=enquiry.brochure,
            status__in=[
                BrochureEnquiry.Status.NEW,
                BrochureEnquiry.Status.CONTACTED,
            ],
            created_at__gte=cutoff,
            products__product_id__in=product_ids,
        )
        .exclude(pk=enquiry.pk)
        .distinct()
        .order_by("-created_at", "-id")
    )
    duplicate = candidates.first()
    if duplicate is None:
        return enquiry

    reason = (
        "Same normalized phone, brochure, and overlapping product interest "
        "was submitted within 24 hours."
    )
    BrochureEnquiry.objects.filter(pk=enquiry.pk).update(
        is_possible_duplicate=True,
        duplicate_of=duplicate,
        duplicate_reason=reason,
    )
    enquiry.is_possible_duplicate = True
    enquiry.duplicate_of = duplicate
    enquiry.duplicate_reason = reason
    return enquiry
