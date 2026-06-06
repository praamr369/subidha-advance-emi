from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date
from typing import Any

from django.db import transaction
from django.db.models import Count, QuerySet
from django.utils import timezone

from accounting.models import AccountingPeriod, AccountingPeriodStatus, DocumentSequence, FinancialYear


class DocumentNumberingSetupError(ValueError):
    pass


class DocumentType:
    DIRECT_SALE = "DIRECT_SALE"
    TAX_INVOICE = "TAX_INVOICE"
    RENT_INVOICE = "RENT_INVOICE"
    LEASE_INVOICE = "LEASE_INVOICE"
    EMI_RECEIPT = "EMI_RECEIPT"
    DIRECT_SALE_RECEIPT = "DIRECT_SALE_RECEIPT"
    SECURITY_DEPOSIT_RECEIPT = "SECURITY_DEPOSIT_RECEIPT"
    JOURNAL_ENTRY = "JOURNAL_ENTRY"
    CREDIT_NOTE = "CREDIT_NOTE"
    DEBIT_NOTE = "DEBIT_NOTE"
    DELIVERY_DOCUMENT = "DELIVERY_DOCUMENT"


class ResetPolicy:
    NEVER = "NEVER"
    YEARLY = "YEARLY"
    MONTHLY = "MONTHLY"


@dataclass(frozen=True)
class DocumentTypeProfile:
    document_type: str
    key: str
    label: str
    series_code: str
    prefix: str
    pattern: str
    doc_kind: str
    workflow_group: str
    required_for_go_live: bool = True
    description: str = ""


DOCUMENT_TYPE_PROFILES: tuple[DocumentTypeProfile, ...] = (
    DocumentTypeProfile(DocumentType.DIRECT_SALE, "DIRECT_SALE_INVOICE", "Direct Sale", "DIRSALE", "SALE", "SALE/FY{FY}/{number}", "sale", "direct_sale", True, "Retail direct-sale document numbers."),
    DocumentTypeProfile(DocumentType.TAX_INVOICE, "BILLING_INVOICE", "Tax Invoice", "BILL_INV", "INV", "INV/FY{FY}/{number}", "invoice", "billing", True, "Customer billing and tax invoice numbers."),
    DocumentTypeProfile(DocumentType.RENT_INVOICE, "RENT_INVOICE", "Rent Invoice", "RENT_INV", "RNT", "RNT/FY{FY}/{number}", "invoice", "rent_lease", False, "Future rent invoice numbering."),
    DocumentTypeProfile(DocumentType.LEASE_INVOICE, "LEASE_INVOICE", "Lease Invoice", "LEASE_INV", "LSE", "LSE/FY{FY}/{number}", "invoice", "rent_lease", False, "Future lease invoice numbering."),
    DocumentTypeProfile(DocumentType.EMI_RECEIPT, "EMI_RECEIPT", "EMI Receipt", "EMI_RECEIPT", "EMI", "EMI/FY{FY}/{number}", "receipt", "emi", True, "Payment receipts for EMI/subscription collections."),
    DocumentTypeProfile(DocumentType.DIRECT_SALE_RECEIPT, "BILLING_RECEIPT", "Direct Sale Receipt", "BILL_RCT", "RCP", "RCP/FY{FY}/{number}", "receipt", "direct_sale", True, "Receipts for retail direct-sale collections."),
    DocumentTypeProfile(DocumentType.SECURITY_DEPOSIT_RECEIPT, "SECURITY_DEPOSIT_RECEIPT", "Security Deposit Receipt", "DEP_RCT", "DEP", "DEP/FY{FY}/{number}", "receipt", "rent_lease", False, "Future rent/lease security deposit receipts."),
    DocumentTypeProfile(DocumentType.JOURNAL_ENTRY, "JOURNAL_ENTRY", "Journal Entry", "JOURNAL", "JV", "JV/FY{FY}/{number}", "journal", "accounting", True, "Accounting journal voucher numbers."),
    DocumentTypeProfile(DocumentType.CREDIT_NOTE, "CREDIT_NOTE", "Credit Note", "BILL_CN", "CN", "CN/FY{FY}/{number}", "note", "billing", True, "Billing and tax credit note numbers."),
    DocumentTypeProfile(DocumentType.DEBIT_NOTE, "DEBIT_NOTE", "Debit Note", "BILL_DN", "DN", "DN/FY{FY}/{number}", "note", "billing", True, "Billing and tax debit note numbers."),
)

DOCUMENT_PROFILES_BY_TYPE = {profile.document_type: profile for profile in DOCUMENT_TYPE_PROFILES}
DOCUMENT_PROFILES_BY_KEY = {profile.key: profile for profile in DOCUMENT_TYPE_PROFILES}
DOCUMENT_TYPE_BY_SERIES_CODE = {
    "DIRSALE": DocumentType.DIRECT_SALE,
    "DIRECT_SALE": DocumentType.DIRECT_SALE,
    "BILL_INV": DocumentType.TAX_INVOICE,
    "DIRECT_SALE_INVOICE": DocumentType.TAX_INVOICE,
    "BILL_RCT": DocumentType.DIRECT_SALE_RECEIPT,
    "EMI_RECEIPT": DocumentType.EMI_RECEIPT,
    "BILL_CN": DocumentType.CREDIT_NOTE,
    "GST_CN": DocumentType.CREDIT_NOTE,
    "BILL_DN": DocumentType.DEBIT_NOTE,
    "GST_DN": DocumentType.DEBIT_NOTE,
    "JOURNAL": DocumentType.JOURNAL_ENTRY,
}

NUMBER_TOKEN_PATTERN = re.compile(r"\{number(?::(?P<padding>\d{1,2}))?\}", re.IGNORECASE)


def legacy_financial_year_code(reference_date: date) -> str:
    if reference_date.month >= 4:
        start_year = reference_date.year
        end_year = reference_date.year + 1
    else:
        start_year = reference_date.year - 1
        end_year = reference_date.year
    return f"{start_year}-{str(end_year)[-2:]}"


def _legacy_code_for_financial_year(financial_year: FinancialYear) -> str:
    code = (financial_year.code or "").strip().upper()
    return code[2:] if code.startswith("FY") else code


def _active_financial_year() -> FinancialYear:
    financial_year = FinancialYear.objects.filter(is_active=True).order_by("-start_date", "-id").first()
    if financial_year is None:
        raise DocumentNumberingSetupError("No active financial year is configured. Activate a financial year before issuing documents.")
    return financial_year


def resolve_financial_year_for_document_date(document_date: date) -> FinancialYear:
    day = document_date or timezone.localdate()
    active = _active_financial_year()
    resolved = FinancialYear.objects.filter(start_date__lte=day, end_date__gte=day).order_by("-is_active", "-start_date", "-id").first()
    if resolved is None:
        raise DocumentNumberingSetupError("Document date is outside every configured financial year.")
    if resolved.pk != active.pk:
        raise DocumentNumberingSetupError("Document date is outside the active financial year.")
    return resolved


def current_period_for_date(document_date: date) -> AccountingPeriod | None:
    return AccountingPeriod.objects.filter(start_date__lte=document_date, end_date__gte=document_date).order_by("start_date", "id").first()


def render_document_number(
    pattern: str,
    prefix: str,
    suffix: str,
    financial_year: FinancialYear | str | None,
    branch: Any,
    doc_code: str,
    next_number: int,
    padding: int,
) -> str:
    if isinstance(financial_year, FinancialYear):
        fy = _legacy_code_for_financial_year(financial_year)
        yyyy = str(financial_year.start_date.year)
        yy = yyyy[-2:]
    else:
        fy = str(financial_year or "").removeprefix("FY")
        yyyy = fy[:4] if len(fy) >= 4 else ""
        yy = yyyy[-2:] if yyyy else ""
    padded = str(next_number).zfill(padding)
    branch_code = (getattr(branch, "code", "") or getattr(branch, "name", "") or "").strip().upper()
    template = (pattern or "").strip()
    if not template:
        template = "{PREFIX}-{number}"
    rendered = template.replace("{PREFIX}", (prefix or "").strip().upper())
    rendered = rendered.replace("{FY}", fy)
    rendered = rendered.replace("{YYYY}", yyyy)
    rendered = rendered.replace("{YY}", yy)
    rendered = rendered.replace("{BRANCH}", branch_code)
    rendered = rendered.replace("{DOC}", (doc_code or "").strip().upper())

    def _replace_number(match):
        token_padding = int(match.group("padding") or padding)
        return str(next_number).zfill(token_padding)

    rendered = NUMBER_TOKEN_PATTERN.sub(_replace_number, rendered)
    rendered = rendered.replace("{number}", padded)
    if suffix:
        rendered = f"{rendered}{suffix}"
    return rendered.strip().upper()


def preview_document_number(*, sequence: DocumentSequence | None = None, document_type: str | None = None, document_date: date | None = None, prefix: str | None = None, pattern: str | None = None, suffix: str | None = None, next_number: int | None = None, padding: int | None = None, branch=None) -> str:
    if sequence is not None:
        financial_year = sequence.financial_year_ref or sequence.financial_year
        profile = DOCUMENT_PROFILES_BY_TYPE.get(sequence.document_type)
        return render_document_number(
            pattern or sequence.pattern,
            prefix if prefix is not None else sequence.prefix,
            suffix if suffix is not None else sequence.suffix,
            financial_year,
            branch,
            profile.prefix if profile else sequence.series_code,
            next_number if next_number is not None else sequence.next_number,
            padding if padding is not None else sequence.padding,
        )
    if not document_type:
        raise DocumentNumberingSetupError("document_type is required for preview.")
    profile = DOCUMENT_PROFILES_BY_TYPE[document_type]
    financial_year = resolve_financial_year_for_document_date(document_date or timezone.localdate())
    return render_document_number(
        pattern or profile.pattern,
        prefix or profile.prefix,
        suffix or "",
        financial_year,
        branch,
        profile.prefix,
        next_number or 1,
        padding or 5,
    )


def _sequence_queryset_for_type(*, document_type: str, financial_year: FinancialYear):
    legacy_fy = _legacy_code_for_financial_year(financial_year)
    return DocumentSequence.objects.filter(document_type=document_type, financial_year=legacy_fy, is_active=True)


def get_or_create_sequence_for_document_type(document_type: str, document_date: date, branch=None) -> DocumentSequence:
    profile = DOCUMENT_PROFILES_BY_TYPE.get(document_type)
    if profile is None:
        raise DocumentNumberingSetupError(f"Unsupported document type {document_type}.")
    financial_year = resolve_financial_year_for_document_date(document_date)
    legacy_fy = _legacy_code_for_financial_year(financial_year)
    sequence = _sequence_queryset_for_type(document_type=document_type, financial_year=financial_year).order_by("-id").first()
    if sequence is not None:
        return sequence
    return DocumentSequence.objects.create(
        series_code=profile.series_code,
        document_type=profile.document_type,
        financial_year=legacy_fy,
        financial_year_ref=financial_year,
        prefix=profile.prefix,
        pattern=profile.pattern,
        reset_policy=ResetPolicy.YEARLY,
        padding=5,
        next_number=1,
        is_active=True,
        is_system_seeded=True,
    )


def validate_document_numbering_ready(document_type: str, document_date: date, branch=None) -> DocumentSequence:
    financial_year = resolve_financial_year_for_document_date(document_date)
    period = current_period_for_date(document_date)
    if period is None:
        raise DocumentNumberingSetupError("No accounting period is configured for the document date.")
    if period.status in {AccountingPeriodStatus.LOCKED, AccountingPeriodStatus.CLOSED} or period.is_locked:
        raise DocumentNumberingSetupError("The accounting period for the document date is locked or closed.")
    sequence = _sequence_queryset_for_type(document_type=document_type, financial_year=financial_year).order_by("-id").first()
    if sequence is None:
        raise DocumentNumberingSetupError(
            f"No {document_type} numbering profile is configured for financial year {financial_year.code}."
        )
    return sequence


def _issued_queryset_for_document_type(document_type: str) -> tuple[QuerySet | None, str]:
    from billing.models import BillingCreditNote, BillingDebitNote, BillingInvoice, DirectSale, ReceiptDocument
    from accounting.models import JournalEntry

    if document_type == DocumentType.DIRECT_SALE:
        return DirectSale.objects.exclude(sale_no__isnull=True).exclude(sale_no=""), "sale_no"
    if document_type in {DocumentType.TAX_INVOICE, DocumentType.RENT_INVOICE, DocumentType.LEASE_INVOICE}:
        return BillingInvoice.objects.exclude(document_no__isnull=True).exclude(document_no=""), "document_no"
    if document_type in {DocumentType.EMI_RECEIPT, DocumentType.DIRECT_SALE_RECEIPT, DocumentType.SECURITY_DEPOSIT_RECEIPT}:
        return ReceiptDocument.objects.exclude(receipt_no__isnull=True).exclude(receipt_no=""), "receipt_no"
    if document_type == DocumentType.CREDIT_NOTE:
        return BillingCreditNote.objects.exclude(note_no__isnull=True).exclude(note_no=""), "note_no"
    if document_type == DocumentType.DEBIT_NOTE:
        return BillingDebitNote.objects.exclude(note_no__isnull=True).exclude(note_no=""), "note_no"
    if document_type == DocumentType.JOURNAL_ENTRY:
        return JournalEntry.objects.exclude(entry_no__isnull=True).exclude(entry_no=""), "entry_no"
    return None, ""


def _number_collides(*, document_type: str, number: str) -> bool:
    queryset, field_name = _issued_queryset_for_document_type(document_type)
    if queryset is None or not field_name:
        return False
    return queryset.filter(**{field_name: number}).exists()


@transaction.atomic
def allocate_document_number(document_type: str, document_date: date, branch=None) -> str:
    sequence = validate_document_numbering_ready(document_type, document_date, branch=branch)
    locked_sequence = DocumentSequence.objects.select_for_update().get(pk=sequence.pk)
    number = preview_document_number(sequence=locked_sequence, branch=branch)
    if _number_collides(document_type=document_type, number=number):
        raise DocumentNumberingSetupError(f"Document number {number} already exists. Increase next number before issuing documents.")
    locked_sequence.next_number += 1
    locked_sequence.last_issued_at = timezone.now()
    locked_sequence.save(update_fields=["next_number", "last_issued_at", "updated_at"])
    return number


def _duplicate_count_for_document_type(document_type: str) -> int:
    queryset, field_name = _issued_queryset_for_document_type(document_type)
    if queryset is None or not field_name:
        return 0
    return queryset.values(field_name).annotate(total=Count("id")).filter(total__gt=1).count()


def _sequence_row(profile: DocumentTypeProfile, *, financial_year: FinancialYear | None, reference_date: date) -> dict:
    legacy_fy = _legacy_code_for_financial_year(financial_year) if financial_year else legacy_financial_year_code(reference_date)
    sequence = (
        DocumentSequence.objects.filter(document_type=profile.document_type, financial_year=legacy_fy, is_active=True)
        .order_by("-id")
        .first()
    )
    inactive_duplicate_count = DocumentSequence.objects.filter(document_type=profile.document_type, financial_year=legacy_fy, is_active=False).count()
    configured = sequence is not None
    prefix = sequence.prefix if sequence else profile.prefix
    pattern = sequence.pattern if sequence and sequence.pattern else profile.pattern
    suffix = sequence.suffix if sequence else ""
    padding = sequence.padding if sequence else 5
    next_number = sequence.next_number if sequence else 1
    preview = preview_document_number(
        sequence=sequence,
        document_type=profile.document_type if sequence is None and financial_year else None,
        document_date=reference_date,
        prefix=prefix,
        pattern=pattern,
        suffix=suffix,
        next_number=next_number,
        padding=padding,
    ) if financial_year else None
    duplicate_count = _duplicate_count_for_document_type(profile.document_type)
    blockers: list[str] = []
    warnings: list[str] = []
    status = "ready" if configured and duplicate_count == 0 else "needs_setup"
    if not configured and profile.required_for_go_live:
        blockers.append("Required numbering profile is not configured for the active financial year.")
    if duplicate_count:
        status = "duplicate_risk"
        blockers.append("Duplicate issued numbers exist for this document type. Review historical data before issuing more documents.")
    if inactive_duplicate_count:
        warnings.append("Inactive duplicate numbering profiles exist for this document type and financial year.")
    if configured:
        warnings.append("Changes apply only to future documents. Existing issued numbers are never renumbered.")
    return {
        "key": profile.key,
        "name": profile.label,
        "series_code": sequence.series_code if sequence else profile.series_code,
        "document_type": profile.document_type,
        "financial_year": legacy_fy,
        "active_financial_year_code": financial_year.code if financial_year else "",
        "financial_year_ref": financial_year.id if financial_year else None,
        "financial_year_name": financial_year.name if financial_year else "",
        "financial_year_date_range": {
            "start_date": financial_year.start_date.isoformat() if financial_year else "",
            "end_date": financial_year.end_date.isoformat() if financial_year else "",
        },
        "workflow_group": profile.workflow_group,
        "doc_kind": profile.doc_kind,
        "description": profile.description,
        "required_for_go_live": profile.required_for_go_live,
        "configured": configured,
        "prefix": prefix,
        "pattern": pattern,
        "suffix": suffix,
        "reset_policy": sequence.reset_policy if sequence else ResetPolicy.YEARLY,
        "next_number": next_number,
        "padding": padding,
        "preview_number": preview,
        "next_number_preview": preview,
        "last_issued_number": None,
        "issued_count": 0,
        "max_issued_number": 0,
        "min_safe_next_number": 1,
        "duplicate_count": duplicate_count,
        "inactive_duplicate_count": inactive_duplicate_count,
        "setup_blockers": blockers,
        "status": status,
        "warnings": warnings,
        "blockers": blockers,
        "can_edit_prefix": True,
        "can_edit_next_number": True,
        "can_seed_default": not configured,
        "default_prefix": profile.prefix,
        "default_pattern": profile.pattern,
        "default_padding": 5,
    }


def build_document_numbering_readiness(reference_date: date | None = None) -> dict:
    day = reference_date or timezone.localdate()
    try:
        financial_year = _active_financial_year()
        active_blockers: list[str] = []
    except DocumentNumberingSetupError as exc:
        financial_year = None
        active_blockers = [str(exc)]
    period = current_period_for_date(day)
    period_payload = None
    if period is not None:
        period_payload = {
            "id": period.id,
            "code": period.code,
            "name": period.name or period.label,
            "start_date": period.start_date.isoformat(),
            "end_date": period.end_date.isoformat(),
            "status": period.status,
            "is_locked": period.is_locked,
        }
        if period.status in {AccountingPeriodStatus.LOCKED, AccountingPeriodStatus.CLOSED} or period.is_locked:
            active_blockers.append("The current accounting period is locked or closed.")
    else:
        active_blockers.append("No accounting period is configured for the reference date.")
    rows = [_sequence_row(profile, financial_year=financial_year, reference_date=day) for profile in DOCUMENT_TYPE_PROFILES]
    missing = [row["document_type"] for row in rows if row["required_for_go_live"] and not row["configured"]]
    duplicate_total = sum(int(row["duplicate_count"] or 0) for row in rows)
    return {
        "financial_year": _legacy_code_for_financial_year(financial_year) if financial_year else legacy_financial_year_code(day),
        "active_financial_year": {
            "id": financial_year.id,
            "code": financial_year.code,
            "name": financial_year.name,
            "start_date": financial_year.start_date.isoformat(),
            "end_date": financial_year.end_date.isoformat(),
        } if financial_year else None,
        "active_financial_year_code": financial_year.code if financial_year else "",
        "active_financial_year_date_range": {
            "start_date": financial_year.start_date.isoformat() if financial_year else "",
            "end_date": financial_year.end_date.isoformat() if financial_year else "",
        },
        "current_period": period_payload,
        "sequences": rows,
        "missing_required_profiles": missing,
        "inactive_duplicate_profiles": {row["document_type"]: row["inactive_duplicate_count"] for row in rows if row["inactive_duplicate_count"]},
        "duplicate_issued_number_warnings": {row["document_type"]: row["duplicate_count"] for row in rows if row["duplicate_count"]},
        "setup_blockers": active_blockers + [blocker for row in rows for blocker in row["blockers"]],
        "checks": {
            "active_financial_year_configured": financial_year is not None,
            "current_period_configured": period is not None,
            "current_period_open": bool(period and not period.is_locked and period.status == AccountingPeriodStatus.OPEN),
            "invoice_numbering_configured": any(row["document_type"] == DocumentType.TAX_INVOICE and row["configured"] for row in rows),
            "receipt_numbering_configured": any(row["document_type"] == DocumentType.DIRECT_SALE_RECEIPT and row["configured"] for row in rows),
            "direct_sale_invoice_numbering_configured": any(row["document_type"] == DocumentType.DIRECT_SALE and row["configured"] for row in rows),
            "required_numbering_configured": not missing,
            "required_numbering_ready": not missing and duplicate_total == 0 and not active_blockers,
            "no_duplicate_issued_numbers": duplicate_total == 0,
            "next_number_preview_available": all(row["next_number_preview"] for row in rows if row["configured"]),
        },
        "summary": {
            "total_count": len(rows),
            "required_count": sum(1 for row in rows if row["required_for_go_live"]),
            "ready_count": sum(1 for row in rows if row["status"] == "ready"),
            "needs_setup_count": sum(1 for row in rows if row["status"] == "needs_setup"),
            "blocked_count": sum(1 for row in rows if row["status"] in {"blocked", "duplicate_risk"}),
            "duplicate_issue_count": duplicate_total,
            "issued_document_count": sum(int(row["issued_count"] or 0) for row in rows),
        },
        "duplicate_issues": {
            "document_number_duplicates": duplicate_total,
        },
        "operator_rules": [
            "Numbering is scoped to the active financial year.",
            "New documents resolve the financial year from their document or posting date.",
            "Existing issued invoices, receipts, journals, notes, and delivery documents are never renumbered.",
            "Locked or closed accounting periods are shown as setup blockers for operators.",
        ],
    }


@transaction.atomic
def upsert_numbering_profile(*, document_type: str, prefix: str = "", pattern: str = "", suffix: str = "", reset_policy: str = ResetPolicy.YEARLY, next_number: int = 1, padding: int = 5, is_active: bool = True, performed_by=None, reference_date: date | None = None) -> DocumentSequence:
    profile = DOCUMENT_PROFILES_BY_TYPE.get(document_type)
    if profile is None:
        raise DocumentNumberingSetupError("Unsupported document type.")
    financial_year = resolve_financial_year_for_document_date(reference_date or timezone.localdate())
    legacy_fy = _legacy_code_for_financial_year(financial_year)
    sequence = DocumentSequence.objects.select_for_update().filter(document_type=document_type, financial_year=legacy_fy, is_active=True).order_by("-id").first()
    if sequence is None:
        sequence = DocumentSequence(series_code=profile.series_code, document_type=document_type, financial_year=legacy_fy, financial_year_ref=financial_year)
    sequence.prefix = (prefix or profile.prefix).strip().upper()
    sequence.pattern = (pattern or profile.pattern).strip()
    sequence.suffix = (suffix or "").strip().upper()
    sequence.reset_policy = (reset_policy or ResetPolicy.YEARLY).strip().upper()
    sequence.next_number = max(1, int(next_number))
    sequence.padding = min(12, max(1, int(padding)))
    sequence.is_active = bool(is_active)
    sequence.save()
    return sequence
