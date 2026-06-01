from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date
from typing import Iterable

from django.db import transaction
from django.db.models import Count, Max, QuerySet
from django.utils import timezone

from accounting.models import DocumentSequence
from accounting.services.gst_document_posting_service import financial_year_for
from billing.models import BillingInvoice, ReceiptDocument
from subscriptions.models import AuditLog
from subscriptions.services.audit_service import log_audit

PREFIX_PATTERN = re.compile(r"^[A-Z0-9][A-Z0-9/-]{1,30}$")


@dataclass(frozen=True)
class NumberingSpec:
    key: str
    label: str
    series_code: str
    default_prefix_template: str
    doc_kind: str
    workflow_group: str
    required_for_go_live: bool = True
    description: str = ""


NUMBERING_SPECS: tuple[NumberingSpec, ...] = (
    NumberingSpec(
        key="BILLING_INVOICE",
        label="Billing Invoice",
        series_code="BILL_INV",
        default_prefix_template="INV-{fy}",
        doc_kind="invoice",
        workflow_group="billing",
        description="Standard customer invoices and EMI/rent/lease demand documents.",
    ),
    NumberingSpec(
        key="BILLING_RECEIPT",
        label="Billing Receipt",
        series_code="BILL_RCT",
        default_prefix_template="RCT-{fy}",
        doc_kind="receipt",
        workflow_group="billing",
        description="General billing receipts linked to invoices or collections.",
    ),
    NumberingSpec(
        key="DIRECT_SALE_INVOICE",
        label="Direct Sale Invoice",
        series_code="DIRECT_SALE_INVOICE",
        default_prefix_template="DSI-{fy}",
        doc_kind="invoice",
        workflow_group="direct_sale",
        description="Direct-sale invoice documents generated from retail sale workflows.",
    ),
    NumberingSpec(
        key="EMI_RECEIPT",
        label="EMI Receipt",
        series_code="EMI_RECEIPT",
        default_prefix_template="EMI-RCT-{fy}",
        doc_kind="receipt",
        workflow_group="emi",
        description="Payment receipts for EMI/subscription collections.",
    ),
    NumberingSpec(
        key="RENT_LEASE_INVOICE",
        label="Rent/Lease Invoice",
        series_code="RENT_LEASE_INVOICE",
        default_prefix_template="RL-INV-{fy}",
        doc_kind="invoice",
        workflow_group="rent_lease",
        required_for_go_live=False,
        description="Rent/lease invoice numbering for future live rental and leasing workflows.",
    ),
)

NUMBERING_KEYS = {spec.key for spec in NUMBERING_SPECS}
NUMBERING_BY_KEY = {spec.key: spec for spec in NUMBERING_SPECS}


def _active_sequence_for(*, spec: NumberingSpec, fy: str) -> DocumentSequence | None:
    return (
        DocumentSequence.objects.filter(series_code=spec.series_code, financial_year=fy, is_active=True)
        .order_by("-id")
        .first()
    )


def _prefix_for(*, spec: NumberingSpec, fy: str, prefix: str | None = None) -> str:
    return ((prefix or "").strip().upper() or spec.default_prefix_template.format(fy=fy)).strip().upper()


def _preview_number(*, prefix: str, next_number: int, padding: int) -> str:
    return f"{prefix}-{str(next_number).zfill(padding)}"


def _issued_queryset_for_spec(*, spec: NumberingSpec, sequence: DocumentSequence | None = None) -> QuerySet:
    if spec.doc_kind == "invoice":
        queryset = BillingInvoice.objects.exclude(document_no__isnull=True).exclude(document_no="")
    else:
        queryset = ReceiptDocument.objects.exclude(receipt_no__isnull=True).exclude(receipt_no="")
    if sequence is not None:
        queryset = queryset.filter(doc_series_id=sequence.id)
    return queryset


def _issued_field_for_spec(spec: NumberingSpec) -> str:
    return "document_no" if spec.doc_kind == "invoice" else "receipt_no"


def _issued_duplicate_count(*, field_name: str, queryset: QuerySet) -> int:
    return queryset.values(field_name).annotate(total=Count("id")).filter(total__gt=1).count()


def _extract_issued_numeric_suffix(value: str | None, *, prefix: str) -> int | None:
    text = (value or "").strip().upper()
    if not text:
        return None
    expected = f"{prefix.strip().upper()}-"
    if not text.startswith(expected):
        return None
    suffix = text[len(expected) :]
    if not suffix.isdigit():
        return None
    return int(suffix)


def _max_issued_for_prefix(*, spec: NumberingSpec, prefix: str) -> int:
    field_name = _issued_field_for_spec(spec)
    maximum = 0
    for value in _issued_queryset_for_spec(spec=spec).values_list(field_name, flat=True):
        suffix = _extract_issued_numeric_suffix(value, prefix=prefix)
        if suffix is not None and suffix > maximum:
            maximum = suffix
    return maximum


def _last_issued_for_sequence(*, spec: NumberingSpec, sequence: DocumentSequence | None) -> str | None:
    if sequence is None:
        return None
    field_name = _issued_field_for_spec(spec)
    return _issued_queryset_for_spec(spec=spec, sequence=sequence).aggregate(last_issued=Max(field_name)).get("last_issued")


def _issued_count_for_sequence(*, spec: NumberingSpec, sequence: DocumentSequence | None) -> int:
    if sequence is None:
        return 0
    return _issued_queryset_for_spec(spec=spec, sequence=sequence).count()


def _validate_prefix(prefix: str) -> str:
    cleaned = (prefix or "").strip().upper()
    if not cleaned:
        raise ValueError("prefix is required.")
    if not PREFIX_PATTERN.match(cleaned):
        raise ValueError("prefix must be 2-31 chars and use only A-Z, 0-9, slash, or hyphen.")
    return cleaned


def _validate_duplicate_risk(*, spec: NumberingSpec, prefix: str, padding: int, next_number: int) -> None:
    proposed_number = _preview_number(prefix=prefix, next_number=next_number, padding=padding)
    field_name = _issued_field_for_spec(spec)
    if _issued_queryset_for_spec(spec=spec).filter(**{field_name: proposed_number}).exists():
        raise ValueError(f"{spec.label} numbering would collide with existing issued number {proposed_number}.")


def _sequence_row(*, spec: NumberingSpec, fy: str) -> dict:
    sequence = _active_sequence_for(spec=spec, fy=fy)
    configured = sequence is not None
    prefix = _prefix_for(spec=spec, fy=fy, prefix=sequence.prefix if sequence else None)
    padding = sequence.padding if sequence else 5
    next_number = sequence.next_number if sequence else 1
    preview = _preview_number(prefix=prefix, next_number=next_number, padding=padding) if configured else None
    issued_count = _issued_count_for_sequence(spec=spec, sequence=sequence)
    last_issued = _last_issued_for_sequence(spec=spec, sequence=sequence)
    max_issued = _max_issued_for_prefix(spec=spec, prefix=prefix)
    min_safe_next = max_issued + 1
    field_name = _issued_field_for_spec(spec)
    duplicate_count = _issued_duplicate_count(field_name=field_name, queryset=_issued_queryset_for_spec(spec=spec, sequence=sequence)) if sequence else 0
    status = "needs_setup"
    warnings: list[str] = []
    blockers: list[str] = []
    if duplicate_count > 0:
        status = "duplicate_risk"
        blockers.append("Duplicate issued numbers exist for this sequence. Review before live billing.")
    elif configured and next_number < min_safe_next:
        status = "blocked"
        blockers.append(f"Next number must be at least {min_safe_next} because issued numbers already exist for this prefix.")
    elif configured and preview:
        status = "ready"
    elif spec.required_for_go_live:
        blockers.append("Required numbering row is not configured.")
    else:
        warnings.append("Optional/future workflow numbering is not configured yet.")
    if configured and issued_count > 0:
        warnings.append("Existing documents already use this sequence. Prefix and next number changes affect future documents only.")
    return {
        "key": spec.key,
        "name": spec.label,
        "series_code": spec.series_code,
        "financial_year": fy,
        "workflow_group": spec.workflow_group,
        "doc_kind": spec.doc_kind,
        "description": spec.description,
        "required_for_go_live": spec.required_for_go_live,
        "configured": configured,
        "prefix": prefix,
        "next_number": next_number,
        "padding": padding,
        "next_number_preview": preview,
        "last_issued_number": last_issued,
        "issued_count": issued_count,
        "max_issued_number": max_issued,
        "min_safe_next_number": min_safe_next,
        "duplicate_count": duplicate_count,
        "status": status,
        "warnings": warnings,
        "blockers": blockers,
        "can_edit_prefix": issued_count == 0,
        "can_edit_next_number": True,
        "can_seed_default": not configured,
        "default_prefix": spec.default_prefix_template.format(fy=fy),
        "default_padding": 5,
    }


def get_document_numbering_state(*, reference_date: date | None = None) -> dict:
    day = reference_date or timezone.localdate()
    fy = financial_year_for(day)
    rows = [_sequence_row(spec=spec, fy=fy) for spec in NUMBERING_SPECS]
    required_rows = [row for row in rows if row["required_for_go_live"]]
    ready_required = [row for row in required_rows if row["status"] == "ready"]
    duplicate_total = sum(int(row["duplicate_count"] or 0) for row in rows)
    return {
        "financial_year": fy,
        "sequences": rows,
        "checks": {
            "invoice_numbering_configured": any(row["key"] == "BILLING_INVOICE" and row["configured"] for row in rows),
            "receipt_numbering_configured": any(row["key"] == "BILLING_RECEIPT" and row["configured"] for row in rows),
            "direct_sale_invoice_numbering_configured": any(row["key"] == "DIRECT_SALE_INVOICE" and row["configured"] for row in rows),
            "required_numbering_configured": all(row["configured"] for row in required_rows),
            "required_numbering_ready": len(ready_required) == len(required_rows),
            "no_duplicate_issued_numbers": duplicate_total == 0,
            "next_number_preview_available": all(row["next_number_preview"] for row in rows if row["configured"]),
        },
        "summary": {
            "total_count": len(rows),
            "required_count": len(required_rows),
            "ready_count": sum(1 for row in rows if row["status"] == "ready"),
            "needs_setup_count": sum(1 for row in rows if row["status"] == "needs_setup"),
            "blocked_count": sum(1 for row in rows if row["status"] in {"blocked", "duplicate_risk"}),
            "duplicate_issue_count": duplicate_total,
            "issued_document_count": sum(int(row["issued_count"] or 0) for row in rows),
            "ready_required_count": len(ready_required),
        },
        "duplicate_issues": {
            "invoice_number_duplicates": sum(int(row["duplicate_count"] or 0) for row in rows if row["doc_kind"] == "invoice"),
            "receipt_number_duplicates": sum(int(row["duplicate_count"] or 0) for row in rows if row["doc_kind"] == "receipt"),
        },
        "operator_rules": [
            "Numbering changes affect future documents only.",
            "Existing issued invoices and receipts are never renumbered from this setup page.",
            "Do not reduce next number below the already issued maximum for the same prefix.",
            "Prefix should remain stable after live billing starts unless an admin intentionally starts a new series.",
        ],
    }


@transaction.atomic
def upsert_document_numbering(*, key: str, prefix: str, padding: int, next_number: int, performed_by=None, reference_date: date | None = None) -> DocumentSequence:
    if key not in NUMBERING_KEYS:
        raise ValueError("Unsupported numbering key.")
    if padding < 1 or padding > 12:
        raise ValueError("padding must be between 1 and 12.")
    if next_number < 1:
        raise ValueError("next_number must be greater than zero.")
    spec = NUMBERING_BY_KEY[key]
    fy = financial_year_for(reference_date or timezone.localdate())
    cleaned_prefix = _validate_prefix(_prefix_for(spec=spec, fy=fy, prefix=prefix))
    sequence = _active_sequence_for(spec=spec, fy=fy)
    if sequence is None:
        sequence = DocumentSequence(series_code=spec.series_code, financial_year=fy, is_active=True)
    max_issued = _max_issued_for_prefix(spec=spec, prefix=cleaned_prefix)
    if next_number <= max_issued:
        raise ValueError(f"next_number cannot be set below already issued maximum {max_issued} for {spec.label}.")
    _validate_duplicate_risk(spec=spec, prefix=cleaned_prefix, padding=padding, next_number=next_number)
    before = {"prefix": sequence.prefix, "padding": sequence.padding, "next_number": sequence.next_number, "is_active": sequence.is_active}
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
                "after": {"prefix": sequence.prefix, "padding": sequence.padding, "next_number": sequence.next_number, "is_active": sequence.is_active},
            },
        )
    return sequence


@transaction.atomic
def seed_default_document_numbering(*, performed_by=None, reference_date: date | None = None) -> dict:
    fy = financial_year_for(reference_date or timezone.localdate())
    created: list[dict] = []
    skipped: list[dict] = []
    for spec in NUMBERING_SPECS:
        existing = _active_sequence_for(spec=spec, fy=fy)
        if existing is not None:
            skipped.append({"key": spec.key, "series_code": spec.series_code, "reason": "already_configured"})
            continue
        sequence = upsert_document_numbering(
            key=spec.key,
            prefix=spec.default_prefix_template.format(fy=fy),
            padding=5,
            next_number=1,
            performed_by=performed_by,
            reference_date=reference_date,
        )
        created.append({"key": spec.key, "series_code": spec.series_code, "id": sequence.id})
    return {"financial_year": fy, "created_count": len(created), "skipped_count": len(skipped), "created": created, "skipped": skipped}


def required_numbering_keys_for_checklist() -> Iterable[str]:
    return tuple(spec.key for spec in NUMBERING_SPECS if spec.required_for_go_live)
