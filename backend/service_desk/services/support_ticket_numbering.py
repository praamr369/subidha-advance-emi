from __future__ import annotations

from django.db import IntegrityError, transaction
from django.utils import timezone

from accounting.models import DocumentSequence
from accounting.services.gst_document_posting_service import financial_year_for


@transaction.atomic
def issue_next_support_ticket_no() -> str:
    """
    Allocate the next ticket number using DocumentSequence, format TKT-{FY}-{NNNNN}.
    One sequence row per Indian financial year (series_code SUPPORT_TKT_{FY}).
    """
    fy = financial_year_for(timezone.localdate())
    series_code = f"SUPPORT_TKT_{fy.replace('-', '_')}"
    prefix = f"TKT-{fy}"

    seq = (
        DocumentSequence.objects.select_for_update()
        .filter(series_code=series_code)
        .first()
    )
    if seq is None:
        try:
            DocumentSequence.objects.create(
                series_code=series_code,
                financial_year=fy,
                prefix=prefix,
                padding=5,
                next_number=1,
                is_active=True,
            )
        except IntegrityError:
            pass
        seq = (
            DocumentSequence.objects.select_for_update()
            .filter(series_code=series_code)
            .first()
        )
    if seq is None:
        raise RuntimeError("Unable to allocate support ticket sequence.")

    if (seq.prefix or "") != prefix or (seq.financial_year or "") != fy:
        seq.prefix = prefix
        seq.financial_year = fy
        seq.save(update_fields=["prefix", "financial_year", "updated_at"])

    number = seq.next_number
    seq.next_number = number + 1
    seq.last_issued_at = timezone.now()
    seq.save(update_fields=["next_number", "last_issued_at", "updated_at"])
    padded = str(number).zfill(seq.padding)
    use_prefix = seq.prefix or seq.series_code
    return f"{use_prefix}-{padded}"
