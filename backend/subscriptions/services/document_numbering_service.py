from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Iterable

from django.db.models import Count, Max, QuerySet
from django.utils import timezone

from accounting.models import DocumentSequence
from accounting.services.gst_document_posting_service import financial_year_for
from billing.models import BillingInvoice, ReceiptDocument
from subscriptions.models import AuditLog
from subscriptions.services.audit_service import log_audit


@dataclass(frozen=True)
class NumberingSpec:
    key: str
    label: str
    series_code: str
    default_prefix_template: str
    doc_kind: str


NUMBERING_SPECS: tuple[NumberingSpec, ...] = (
    NumberingSpec(
        key="BILLING_INVOICE",
        label="Billing Invoice",
        series_code="BILL_INV",
        default_prefix_template="INV-{fy}",
        doc_kind="invoice",
    ),
    NumberingSpec(
        key="BILLING_RECEIPT",
        label="Billing Receipt",
        series_code="BILL_RCT",
        default_prefix_template="RCT-{fy}",
        doc_kind="receipt",
    ),
    NumberingSpec(
        key="DIRECT_SALE_INVOICE",
        label="Direct Sale Invoice",
        series_code="DIRECT_SALE_INVOICE",
        default_prefix_template="DSI-{fy}",
        doc_kind="invoice",
    ),
    NumberingSpec(
        key="EMI_RECEIPT",
        label="EMI Receipt",
        series_code="EMI_RECEIPT",
        default_prefix_template="EMI-RCT-{fy}",
        doc_kind="receipt",
    ),
    NumberingSpec(
        key="RENT_LEASE_INVOICE",
        label="Rent/Lease Invoice",
        series_code="RENT_LEASE_INVOICE",
        default_prefix_template="RL-INV-{fy}",
        doc_kind="invoice",
    ),
)

NUMBERING_KEYS = {spec.key for spec in NUMBERING_SPECS}
NUMBERING_BY_KEY = {spec.key: spec for spec in NUMBERING_SPECS}


def _active_sequence_for(*, spec: NumberingSpec, fy: str) -> DocumentSequence | None:
    return (
        DocumentSequence.objects.filter(
            series_code=spec.series_code,
            financial_year=fy,
            is_active=True,
        )
        .order_by("-id")
        .first()
    )


def _preview_number(*, sequence: DocumentSequence) -> str:
    prefix = sequence.prefix or sequence.series_code
    return f"{prefix}-{str(sequence.next_number).zfill(sequence.padding)}"


def _issued_duplicate_count(*, field_name: str, queryset: QuerySet) -> int:
    aggregates = (
        queryset.exclude(**{f"{field_name}__isnull": True})
        .exclude(**{field_name: ""})
        .values(field_name)
        .annotate(total=Count("id"))
        .filter(total__gt=1)
    )
    return aggregates.count()


def get_document_numbering_state(*, reference_date: date | None = None) -> dict:
    day = reference_date or timezone.localdate()
    fy = financial_year_for(day)

    invoice_duplicates = _issued_duplicate_count(
        field_name="document_no",
        queryset=BillingInvoice.objects.all(),
    )
    receipt_duplicates = _issued_duplicate_count(
        field_name="receipt_no",
        queryset=ReceiptDocument.objects.all(),
    )
    duplicate_issues = invoice_duplicates + receipt_duplicates

    invoice_last_issued = (
        BillingInvoice.objects.exclude(document_no__isnull=True)
        .exclude(document_no="")
        .aggregate(last_issued=Max("document_no"))
    ).get("last_issued")
    receipt_last_issued = (
        ReceiptDocument.objects.exclude(receipt_no__isnull=True)
        .exclude(receipt_no="")
        .aggregate(last_issued=Max("receipt_no"))
    ).get("last_issued")

    rows = []
    for spec in NUMBERING_SPECS:
        sequence = _active_sequence_for(spec=spec, fy=fy)
        configured = sequence is not None
        preview = _preview_number(sequence=sequence) if sequence else None
        row = {
            "key": spec.key,
            "name": spec.label,
            "series_code": spec.series_code,
            "financial_year": fy,
            "configured": configured,
            "prefix": sequence.prefix if sequence else spec.default_prefix_template.format(fy=fy),
            "padding": sequence.padding if sequence else 5,
            "next_number": sequence.next_number if sequence else 1,
            "next_number_preview": preview,
            "last_issued_number": invoice_last_issued if spec.doc_kind == "invoice" else receipt_last_issued,
            "status": (
                "duplicate_risk"
                if (spec.doc_kind == "invoice" and invoice_duplicates > 0)
                or (spec.doc_kind == "receipt" and receipt_duplicates > 0)
                else "ready"
                if configured and preview
                else "needs_setup"
            ),
        }
        rows.append(row)

    return {
        "financial_year": fy,
        "sequences": rows,
        "checks": {
            "invoice_numbering_configured": any(row["key"] == "BILLING_INVOICE" and row["configured"] for row in rows),
            "receipt_numbering_configured": any(row["key"] == "BILLING_RECEIPT" and row["configured"] for row in rows),
            "direct_sale_invoice_numbering_configured": any(
                row["key"] == "DIRECT_SALE_INVOICE" and row["configured"] for row in rows
            ),
            "no_duplicate_issued_numbers": duplicate_issues == 0,
            "next_number_preview_available": all(row["next_number_preview"] for row in rows if row["configured"]),
        },
        "duplicate_issues": {
            "invoice_number_duplicates": invoice_duplicates,
            "receipt_number_duplicates": receipt_duplicates,
        },
    }


def _extract_issued_numeric_suffix(value: str | None, *, prefix: str) -> int | None:
    text = (value or "").strip()
    if not text:
        return None
    expected = f"{prefix}-"
    if not text.startswith(expected):
        return None
    suffix = text[len(expected) :]
    if not suffix.isdigit():
        return None
    return int(suffix)


def _max_issued_for_sequence(*, spec: NumberingSpec, sequence: DocumentSequence) -> int:
    prefix = sequence.prefix or sequence.series_code
    field_name = "document_no" if spec.doc_kind == "invoice" else "receipt_no"
    queryset = BillingInvoice.objects.all() if spec.doc_kind == "invoice" else ReceiptDocument.objects.all()
    maximum = 0
    for value in queryset.values_list(field_name, flat=True):
        suffix = _extract_issued_numeric_suffix(value, prefix=prefix)
        if suffix is not None and suffix > maximum:
            maximum = suffix
    return maximum


def _validate_duplicate_risk(
    *,
    spec: NumberingSpec,
    sequence: DocumentSequence,
    prefix: str,
    padding: int,
    next_number: int,
) -> None:
    prefix = prefix.strip()
    proposed_number = f"{prefix or sequence.series_code}-{str(next_number).zfill(padding)}"
    if spec.doc_kind == "invoice":
        exists = BillingInvoice.objects.filter(document_no=proposed_number).exists()
    else:
        exists = ReceiptDocument.objects.filter(receipt_no=proposed_number).exists()
    if exists:
        raise ValueError(
            f"{spec.label} numbering would collide with existing issued number {proposed_number}."
        )


def upsert_document_numbering(
    *,
    key: str,
    prefix: str,
    padding: int,
    next_number: int,
    performed_by=None,
    reference_date: date | None = None,
) -> DocumentSequence:
    if key not in NUMBERING_KEYS:
        raise ValueError("Unsupported numbering key.")
    if padding < 1 or padding > 12:
        raise ValueError("padding must be between 1 and 12.")
    if next_number < 1:
        raise ValueError("next_number must be greater than zero.")

    spec = NUMBERING_BY_KEY[key]
    day = reference_date or timezone.localdate()
    fy = financial_year_for(day)
    cleaned_prefix = (prefix or "").strip().upper() or spec.default_prefix_template.format(fy=fy)
    sequence = _active_sequence_for(spec=spec, fy=fy)
    if sequence is None:
        sequence = DocumentSequence(
            series_code=spec.series_code,
            financial_year=fy,
            is_active=True,
        )

    max_issued = _max_issued_for_sequence(spec=spec, sequence=sequence)
    if next_number <= max_issued:
        raise ValueError(
            f"next_number cannot be set below already issued maximum {max_issued} for {spec.label}."
        )
    _validate_duplicate_risk(
        spec=spec,
        sequence=sequence,
        prefix=cleaned_prefix,
        padding=padding,
        next_number=next_number,
    )

    before = {
        "prefix": sequence.prefix,
        "padding": sequence.padding,
        "next_number": sequence.next_number,
    }
    sequence.prefix = cleaned_prefix
    sequence.padding = padding
    sequence.next_number = next_number
    sequence.is_active = True
    sequence.save()

    if performed_by is not None:
        log_audit(
            action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
            instance=sequence,
            performed_by=performed_by,
            metadata={
                "event": "DOCUMENT_NUMBERING_UPDATED",
                "numbering_key": key,
                "series_code": spec.series_code,
                "financial_year": fy,
                "before": before,
                "after": {
                    "prefix": sequence.prefix,
                    "padding": sequence.padding,
                    "next_number": sequence.next_number,
                },
            },
        )
    return sequence


def required_numbering_keys_for_checklist() -> Iterable[str]:
    return ("BILLING_INVOICE", "BILLING_RECEIPT", "DIRECT_SALE_INVOICE")
