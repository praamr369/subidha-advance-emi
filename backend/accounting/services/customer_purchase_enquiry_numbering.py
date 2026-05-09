from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from accounting.models import DocumentSequence
from accounting.services.gst_document_posting_service import ensure_document_sequence, financial_year_for

CUSTOMER_PURCHASE_ENQUIRY_SERIES = "CUSTOMER_PURCHASE_ENQUIRY"


@transaction.atomic
def allocate_customer_purchase_enquiry_number(*, reference_date=None) -> str:
    """Allocate enquiry_no / OPE-* numbers — informational only, not an accounting voucher."""
    day = reference_date or timezone.localdate()
    fy = financial_year_for(day)
    seq = ensure_document_sequence(
        series_code=CUSTOMER_PURCHASE_ENQUIRY_SERIES,
        financial_year=fy,
        prefix="OPE",
        padding=6,
    )
    locked_sequence = DocumentSequence.objects.select_for_update().get(pk=seq.pk)
    number = locked_sequence.next_number
    locked_sequence.next_number = number + 1
    locked_sequence.last_issued_at = timezone.now()
    locked_sequence.save(update_fields=["next_number", "last_issued_at", "updated_at"])
    padded = str(number).zfill(locked_sequence.padding)
    prefix = locked_sequence.prefix if locked_sequence.prefix else locked_sequence.series_code
    return f"{prefix}-{padded}"


PO_FROM_ONLINE_ENQUIRY_SERIES = "PO_FROM_ONLINE_ENQUIRY"


@transaction.atomic
def allocate_purchase_order_no_for_enquiry_draft(*, reference_date=None) -> str:
    """Draft PO numbers for admin-confirmed enquiry fulfilment — still DRAFT status until operational posting."""
    day = reference_date or timezone.localdate()
    fy = financial_year_for(day)
    seq = ensure_document_sequence(
        series_code=PO_FROM_ONLINE_ENQUIRY_SERIES,
        financial_year=fy,
        prefix="PO-OPE",
        padding=6,
    )
    locked_sequence = DocumentSequence.objects.select_for_update().get(pk=seq.pk)
    number = locked_sequence.next_number
    locked_sequence.next_number = number + 1
    locked_sequence.last_issued_at = timezone.now()
    locked_sequence.save(update_fields=["next_number", "last_issued_at", "updated_at"])
    padded = str(number).zfill(locked_sequence.padding)
    prefix = locked_sequence.prefix if locked_sequence.prefix else locked_sequence.series_code
    return f"{prefix}-{padded}"
