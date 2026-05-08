from __future__ import annotations

from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone

from accounting.models import DocumentSequence, Vendor, VendorQuote, VendorQuoteRequest
from accounting.services.gst_document_posting_service import financial_year_for, ensure_document_sequence

VENDOR_QUOTE_REQUEST_SERIES = "VENDOR_QUOTE_REQUEST"


@transaction.atomic
def allocate_vendor_quote_request_number(*, reference_date=None) -> str:
    """Next vendor quote request number using DocumentSequence (RFQ numbering only — not an accounting voucher)."""
    day = reference_date or timezone.localdate()
    fy = financial_year_for(day)
    seq = ensure_document_sequence(
        series_code=VENDOR_QUOTE_REQUEST_SERIES,
        financial_year=fy,
        prefix="VQR",
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


def distinct_vendor_ids(vendor_ids: list[int]) -> list[int]:
    seen: set[int] = set()
    out: list[int] = []
    for vid in vendor_ids:
        if vid not in seen:
            seen.add(vid)
            out.append(vid)
    return out


def _sync_quote_request_aggregate_status(req: VendorQuoteRequest) -> None:
    """Advance aggregate RFQ status when vendors reply (never overrides CLOSED/CANCELLED/DRAFT)."""
    if req.status in ("CLOSED", "CANCELLED", "DRAFT"):
        return
    annotated = VendorQuote.objects.filter(quote_request=req).aggregate(
        quoted_cnt=Count("id", filter=Q(status="QUOTED")),
        open_cnt=Count("id", filter=Q(status="REQUESTED")),
        total_cnt=Count("id"),
    )
    total = annotated["total_cnt"] or 0
    quoted = annotated["quoted_cnt"] or 0
    open_stubs = annotated["open_cnt"] or 0
    if total == 0 or quoted == 0:
        return
    if open_stubs > 0:
        next_status = "PARTIALLY_QUOTED"
    else:
        next_status = "QUOTING"
    if next_status != req.status:
        VendorQuoteRequest.objects.filter(pk=req.pk).update(status=next_status)


@transaction.atomic
def create_vendor_quote_request(
    *,
    base_fields: dict,
    vendor_ids: list[int],
    send_to_vendors: bool,
    created_by,
) -> VendorQuoteRequest:
    """Create VendorQuote stubs without posting procurement, stock, billing, or payments."""
    request_no = allocate_vendor_quote_request_number()
    vid_list = distinct_vendor_ids([int(v) for v in vendor_ids])
    if not vid_list:
        raise ValueError("vendor_ids cannot be empty")

    resolved_ids = Vendor.objects.filter(id__in=vid_list, status="ACTIVE", is_active=True).values_list("id", flat=True)
    resolved_set = set(resolved_ids)
    missing = [v for v in vid_list if v not in resolved_set]
    if missing:
        raise ValueError(f"Unknown or inactive vendor id(s): {missing}")

    rfq_status = "SENT" if send_to_vendors else "DRAFT"

    req = VendorQuoteRequest.objects.create(
        request_no=request_no,
        status=rfq_status,
        created_by=created_by,
        **base_fields,
    )
    stubs = [VendorQuote(quote_request=req, vendor_id=vid, status="REQUESTED") for vid in vid_list]
    VendorQuote.objects.bulk_create(stubs)

    req.refresh_from_db()
    _sync_quote_request_aggregate_status(req)
    return VendorQuoteRequest.objects.prefetch_related("quotes").get(pk=req.pk)


@transaction.atomic
def accept_vendor_quote(*, quote_pk: int, accepted_by):
    selected = VendorQuote.objects.select_related("quote_request").select_for_update().get(pk=quote_pk)

    rq = VendorQuoteRequest.objects.select_for_update().get(pk=selected.quote_request_id)
    if rq.status in ("CANCELLED", "CLOSED"):
        raise ValueError("Quote request is not open.")

    if selected.status != "QUOTED":
        raise ValueError("Only submitted (QUOTED) vendor quotes may be accepted.")

    VendorQuote.objects.filter(quote_request=rq).exclude(pk=selected.pk).filter(status__in=["REQUESTED", "QUOTED"]).update(status="REJECTED")

    selected.status = "ACCEPTED"
    selected.save(update_fields=["status", "updated_at"])

    rq.status = "CLOSED"
    rq.save(update_fields=["status", "updated_at"])
    selected.refresh_from_db()
    rq.refresh_from_db()
    return selected


@transaction.atomic
def reject_vendor_quote(*, quote_pk: int, rejected_by=None):
    quote = VendorQuote.objects.select_related("quote_request").select_for_update().get(pk=quote_pk)

    rq = VendorQuoteRequest.objects.select_for_update().get(pk=quote.quote_request_id)
    if rq.status in ("CLOSED", "CANCELLED"):
        raise ValueError("Quote request is closed.")

    if quote.status != "QUOTED":
        raise ValueError("Only QUOTED quotes may be rejected via this endpoint.")

    quote.status = "REJECTED"
    quote.save(update_fields=["status", "updated_at"])
    quote.refresh_from_db()
    rq_after = VendorQuoteRequest.objects.get(pk=rq.pk)
    _sync_quote_request_aggregate_status(rq_after)
    return quote


@transaction.atomic
def mark_vendor_quote_submitted(*, vendor_quote: VendorQuote, payload: dict, submitted_by) -> VendorQuote:
    """Persist vendor-authored quote figures (caller checks permissions and request openness)."""
    if vendor_quote.status not in ("REQUESTED", "QUOTED"):
        raise ValueError("This quote row can no longer be edited.")

    for field in (
        "quoted_price",
        "available_quantity",
        "lead_time_days",
        "warranty_months",
        "delivery_available",
        "delivery_charge",
        "quality_note",
        "valid_until",
    ):
        if field in payload and payload[field] is not None:
            setattr(vendor_quote, field, payload[field])

    vendor_quote.status = "QUOTED"
    vendor_quote.submitted_by = submitted_by
    vendor_quote.submitted_at = timezone.now()
    vendor_quote.save()

    rq = vendor_quote.quote_request
    rq.refresh_from_db()
    _sync_quote_request_aggregate_status(rq)
    return vendor_quote


def vendor_quote_request_visible_to_vendor(queryset, vendor: Vendor):
    return queryset.filter(quotes__vendor=vendor).exclude(status__in=["DRAFT", "CANCELLED"]).distinct()
