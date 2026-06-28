from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any

from django.db import transaction

from accounting.models import AccountingBridgePosting, StaffAdvance, StaffAdvanceStatus
from accounting.services import accounting_bridge_candidate_service as base
from accounting.services.document_sequence_service import (
    DocumentNumberingSetupError,
    DocumentType,
    preview_document_number,
    validate_document_numbering_ready,
)

SOURCE_MODEL = "StaffAdvance"
EVENT_KEY = "staff_advance"
PURPOSE = "STAFF_ADVANCE"
SAFETY_TEXT = (
    "Preview is read-only. Posting creates accounting entries only after explicit admin confirmation. "
    "It does not edit salary sheets, salary payments, employee master data, or recovery rows."
)
POSTABLE_STATUSES = {
    StaffAdvanceStatus.APPROVED,
    StaffAdvanceStatus.DISBURSED,
    StaffAdvanceStatus.PARTIALLY_RECOVERED,
    StaffAdvanceStatus.RECOVERED,
}
SKIPPED_EVENT_KEY = "staff_advance_skipped_not_applicable"
UNSUPPORTED_EVENT_KEY = "unsupported_staff_advance"


def _ref(row: StaffAdvance) -> str:
    return row.reference_no or f"STAFF-ADV-{row.id}"


def _source_date(row: StaffAdvance) -> date | None:
    return base._as_date(row.disbursed_at) or row.request_date


def _employee_display(row: StaffAdvance) -> str:
    return getattr(row.employee, "name", None) or getattr(row.employee, "employee_code", None) or f"Staff #{row.employee_id}"


def _classify(row: StaffAdvance) -> tuple[str, str, str | None]:
    if row.status in {StaffAdvanceStatus.DRAFT, StaffAdvanceStatus.CANCELLED}:
        return SKIPPED_EVENT_KEY, "Staff advance skipped", "Draft/cancelled staff advances are not bridge-postable."
    if row.status not in POSTABLE_STATUSES:
        return UNSUPPORTED_EVENT_KEY, "Unsupported staff advance", "StaffAdvance status is not supported for bridge posting."
    if base._money(row.amount) <= Decimal("0.00"):
        return UNSUPPORTED_EVENT_KEY, "Unsupported staff advance", "StaffAdvance amount must be greater than zero."
    return EVENT_KEY, "Staff advance", None


def _finance_account_blocker(row: StaffAdvance) -> str | None:
    account = row.finance_account
    if account is None:
        return "Finance account is missing for this staff advance."
    if not account.is_active:
        return "Finance account is inactive for this staff advance."
    if not account.chart_account_id or not account.chart_account.is_active:
        return "Finance account is not mapped to an active chart account for this staff advance."
    return None


def _staff_advance_asset_account():
    return (
        base._posting_profile_account("STAFF_ADVANCE_ASSET")
        or base._chart_by_system_code("STAFF_ADVANCE_ASSET")
    )


def _lines(row: StaffAdvance, event_key: str):
    warnings: list[str] = []
    finance_account = row.finance_account
    if event_key != EVENT_KEY:
        return [], ["Staff advance source is not applicable for posting."], finance_account
    amount = base._money(row.amount)
    if amount <= Decimal("0.00"):
        warnings.append("StaffAdvance amount must be greater than zero.")
    source_date = _source_date(row)
    if source_date is None:
        warnings.append("StaffAdvance request/disbursement date is required.")
    finance_blocker = _finance_account_blocker(row)
    if finance_blocker:
        warnings.append(finance_blocker)
    asset_account = _staff_advance_asset_account()
    if asset_account is None:
        warnings.append("STAFF_ADVANCE_ASSET posting profile/chart account is missing or inactive.")
    if warnings:
        return [], warnings, finance_account
    reference = _ref(row)
    return [
        {
            "chart_account": asset_account,
            "description": f"Staff advance receivable {reference}",
            "debit_amount": amount,
            "credit_amount": Decimal("0.00"),
        },
        {
            "chart_account": finance_account.chart_account,
            "description": f"Staff advance paid from finance account {reference}",
            "debit_amount": Decimal("0.00"),
            "credit_amount": amount,
        },
    ], warnings, finance_account


def _raw_status(*, event_key: str, lines: list[dict[str, Any]], warnings: list[str]) -> str:
    if event_key == SKIPPED_EVENT_KEY:
        return "SKIPPED_NOT_APPLICABLE"
    if event_key == UNSUPPORTED_EVENT_KEY:
        return "UNSUPPORTED_SOURCE"
    if lines:
        return "READY"
    first_warning = (warnings[0] if warnings else "").lower()
    if "finance account" in first_warning:
        return "BLOCKED_BY_FINANCE_ACCOUNT"
    if "date" in first_warning:
        return "BLOCKED_BY_PERIOD"
    return "BLOCKED_BY_MAPPING"


def _source_snapshot(row: StaffAdvance) -> dict[str, Any]:
    return {
        "employee_id": row.employee_id,
        "request_date": row.request_date,
        "amount": row.amount,
        "recovered_amount": row.recovered_amount,
        "status": row.status,
        "finance_account_id": row.finance_account_id,
        "reference_no": row.reference_no,
        "approved_by_id": row.approved_by_id,
        "approved_at": row.approved_at,
        "disbursed_at": row.disbursed_at,
        "posted_journal_entry_id": row.posted_journal_entry_id,
    }


def _qs():
    return StaffAdvance.objects.select_related(
        "employee",
        "finance_account",
        "finance_account__chart_account",
        "posted_journal_entry",
        "posted_journal_entry__accounting_period",
        "posted_journal_entry__financial_year",
    )


def candidate_for(row: StaffAdvance) -> dict[str, Any]:
    event_key, event_label, reason = _classify(row)
    purpose = PURPOSE if event_key == EVENT_KEY else event_key.upper()
    bridge = AccountingBridgePosting.objects.filter(
        source_model=SOURCE_MODEL,
        source_id=str(row.id),
        purpose=purpose,
    ).select_related("journal_entry", "journal_entry__accounting_period", "journal_entry__financial_year").first()
    journal = bridge.journal_entry if bridge else row.posted_journal_entry
    item = base._latest_posting_reconciliation_item(source_model=SOURCE_MODEL, source_id=str(row.id)) if journal else base._latest_reconciliation_item(source_model=SOURCE_MODEL, source_id=str(row.id))
    source_date = _source_date(row)
    period = getattr(journal, "accounting_period", None) or base._source_period(source_date)
    lines, warnings, finance_account = _lines(row, event_key) if event_key == EVENT_KEY else ([], [reason] if reason else [], row.finance_account)
    raw = _raw_status(event_key=event_key, lines=lines, warnings=warnings)
    postability = base._candidate_status_payload(
        event_key=event_key,
        event_label=event_label,
        module="accounting",
        source_model=SOURCE_MODEL,
        raw_status=raw,
        lines=lines,
        line_warnings=warnings,
        period=period,
        source_date=source_date,
        journal=journal,
        reconciliation_item=item,
        source_workflow_exists=event_key == EVENT_KEY,
        classification_reason=reason,
    )
    source_date_key = source_date.isoformat() if source_date else "NO_SAFE_DATE"
    reference = _ref(row)
    payload = base._candidate_payload(
        candidate_id=base._candidate_id(source_model=SOURCE_MODEL, source_pk=row.id, event_key=event_key),
        event_key=event_key,
        event_label=event_label,
        module="accounting",
        source_model=SOURCE_MODEL,
        source_pk=row.id,
        source_display=f"Staff advance {reference}",
        source_reference=reference,
        source_date=source_date,
        amount=row.amount,
        lines=lines,
        finance_account=finance_account,
        period=period,
        postability=postability,
        journal=journal,
        reconciliation_item=item,
        idempotency_key=f"bridge:{PURPOSE}:StaffAdvance:{row.id}:{source_date_key}:{base._money(row.amount):.2f}:{reference}",
        source_status=row.status,
        source_type="STAFF_ADVANCE",
    )
    if payload.get("reconciliation_state") == "POSTED_UNVERIFIED":
        payload["status"] = "POSTED_UNVERIFIED"
        payload["canonical_status"] = "POSTED_UNVERIFIED"
    payload.update(
        {
            "staff_advance_id": row.id,
            "employee_id": row.employee_id,
            "employee_code": getattr(row.employee, "employee_code", None),
            "employee_name": _employee_display(row),
            "advance_reference": reference,
            "reference_no": row.reference_no,
            "request_date": row.request_date.isoformat() if row.request_date else None,
            "disbursed_at": row.disbursed_at.isoformat() if row.disbursed_at else None,
            "recovered_amount": f"{base._money(row.recovered_amount):.2f}",
            "outstanding_amount": f"{base._money(row.outstanding_amount):.2f}",
            "finance_account_id": row.finance_account_id,
            "finance_account_name": getattr(row.finance_account, "name", None),
            "finance_account_active": getattr(row.finance_account, "is_active", None),
            "reason": row.reason,
        }
    )
    return payload


def list_bridge_candidates(filters: base.BridgeCandidateFilters | None = None) -> list[dict[str, Any]]:
    active_filters = filters or base.BridgeCandidateFilters()
    requested_model = (active_filters.source_model or "").strip()
    if requested_model not in {"", SOURCE_MODEL}:
        return []
    if active_filters.module and active_filters.module not in {"accounting", "Payroll", "payroll", "HR & Payroll"}:
        return []
    qs = base._date_filter_qs(_qs(), active_filters, date_field="request_date")
    rows = [candidate_for(item) for item in qs.order_by("-request_date", "-id")[:500]]
    if active_filters.event_key:
        rows = [row for row in rows if row["event_key"] == active_filters.event_key]
    if active_filters.status:
        rows = [row for row in rows if row["status"] == active_filters.status or row.get("reconciliation_state") == active_filters.status]
    rows.sort(key=lambda row: (row.get("source_date") or "", str(row.get("source_id") or "")), reverse=True)
    return rows


def is_staff_advance_candidate(candidate_id: str) -> bool:
    try:
        source_kind, _source_pk, _event_key = base._parse_candidate_id(candidate_id)
    except ValueError:
        return False
    return source_kind == "staffadvance"


def get_bridge_candidate(candidate_id: str, *, for_update: bool = False) -> dict[str, Any]:
    source_kind, source_pk, event_key = base._parse_candidate_id(candidate_id)
    if source_kind != "staffadvance":
        raise ValueError("Bridge candidate is not a StaffAdvance source.")
    qs = _qs().select_for_update() if for_update else _qs()
    candidate = candidate_for(qs.get(pk=source_pk))
    if candidate["event_key"] != event_key:
        raise ValueError("StaffAdvance candidate event no longer matches current source state.")
    return candidate


def _lines_for_candidate(candidate: dict[str, Any]):
    if candidate.get("source_model") != SOURCE_MODEL:
        return [], ["Unsupported source model."], None
    row = _qs().get(pk=candidate["source_id"])
    return _lines(row, candidate["event_key"])


def preview_bridge_candidate(candidate_id: str) -> dict[str, Any]:
    candidate = get_bridge_candidate(candidate_id)
    lines, warnings, _finance_account = _lines_for_candidate(candidate)
    blockers = []
    if not candidate["can_post"]:
        blockers.append(candidate["blocker_reason"] or "Candidate is not postable.")
    journal_date = date.fromisoformat(candidate["source_date"]) if candidate.get("source_date") else None
    journal_number_preview = None
    if journal_date is not None:
        try:
            sequence = validate_document_numbering_ready(DocumentType.JOURNAL_ENTRY, journal_date)
            journal_number_preview = preview_document_number(sequence=sequence)
        except DocumentNumberingSetupError as exc:
            blockers.append(str(exc))
    total_debit, total_credit = base._line_totals(lines)
    source = {
        "model": SOURCE_MODEL,
        "pk": candidate.get("source_pk") or candidate["source_id"],
        "display": candidate["source_display"],
        "reference_number": candidate["source_reference_number"],
        "date": candidate.get("source_date"),
        "amount": candidate["amount"],
        "employee_name": candidate.get("employee_name"),
        "employee_code": candidate.get("employee_code"),
        "finance_account_name": candidate.get("finance_account_name"),
        "staff_advance_status": candidate.get("source_status"),
    }
    return {
        "candidate": candidate,
        "candidate_id": candidate_id,
        "source": source,
        "staff_advance_identity": source,
        "journal_date": journal_date.isoformat() if journal_date else None,
        "accounting_period": candidate["accounting_period"],
        "journal_number_preview": journal_number_preview,
        "debit_lines": [base._line_payload(account=line["chart_account"], description=line.get("description", ""), debit=line.get("debit_amount")) for line in lines if base._money(line.get("debit_amount")) > 0],
        "credit_lines": [base._line_payload(account=line["chart_account"], description=line.get("description", ""), credit=line.get("credit_amount")) for line in lines if base._money(line.get("credit_amount")) > 0],
        "lines": base._preview_lines(lines),
        "total_debit": f"{total_debit:.2f}",
        "total_credit": f"{total_credit:.2f}",
        "is_balanced": bool(lines and total_debit == total_credit),
        "tax_lines": [],
        "finance_account_line": candidate.get("finance_account"),
        "warnings": warnings,
        "blockers": list(dict.fromkeys([item for item in blockers if item])),
        "can_post": bool(candidate["can_post"] and lines and total_debit == total_credit and not blockers),
        "idempotency_key": candidate["idempotency_key"],
        "safety_text": SAFETY_TEXT,
    }


@transaction.atomic
def post_bridge_candidate(*, candidate_id: str, idempotency_key: str, confirmed: bool, posting_note: str = "", actor) -> dict[str, Any]:
    candidate = get_bridge_candidate(candidate_id, for_update=True)
    if not confirmed:
        raise ValueError("Explicit confirmation is required before posting.")
    key = (idempotency_key or "").strip()
    if not key:
        raise ValueError("idempotency_key is required.")
    if candidate["event_key"] != EVENT_KEY:
        raise ValueError("Unsupported StaffAdvance bridge candidate source.")
    existing = AccountingBridgePosting.objects.select_for_update().filter(source_model=SOURCE_MODEL, source_id=candidate["source_id"], purpose=PURPOSE).select_related("journal_entry").first()
    if existing is not None:
        existing_key = ((existing.trace_metadata or {}).get("idempotency_key") or "").strip()
        if existing_key and existing_key == key:
            return {"posted": False, "already_posted": True, "journal_entry": base._journal_payload(existing.journal_entry), "reconciliation_item": base._reconciliation_payload(base._latest_posting_reconciliation_item(source_model=SOURCE_MODEL, source_id=candidate["source_id"])), "next_action": "Run reconciliation checks and verify the pending bridge item."}
        raise ValueError("This source item has already been posted with a different or legacy idempotency key.")
    if candidate["idempotency_key"] != key:
        raise ValueError("idempotency_key does not match the current source candidate.")
    preview = preview_bridge_candidate(candidate_id)
    if not preview["can_post"]:
        raise ValueError("; ".join(preview["blockers"]) or "Candidate is not postable.")
    row = _qs().select_for_update().get(pk=candidate["source_id"])
    source_before = _source_snapshot(row)
    lines, _warnings, finance_account = _lines_for_candidate(candidate)
    total_debit, total_credit = base._line_totals(lines)
    if not lines or total_debit != total_credit:
        raise ValueError("Bridge posting preview is not balanced.")
    source_date = _source_date(row)
    if source_date is None:
        raise ValueError("Staff advance posting date is missing.")
    journal, created = base.post_bridge_entry(
        source_instance=row,
        purpose=PURPOSE,
        entry_date=source_date,
        memo=f"Bridge posting StaffAdvance {row.id} {EVENT_KEY}",
        lines=lines,
        voucher_type=PURPOSE,
        source_type="STAFF_ADVANCE",
        source_reference=_ref(row),
        source_document_no=_ref(row),
        source_event_date=source_date,
        trace_metadata={
            "event_key": EVENT_KEY,
            "idempotency_key": key,
            "posting_note": posting_note,
            "source_model": SOURCE_MODEL,
            "source_id": candidate["source_id"],
            "staff_advance_id": row.id,
            "employee_id": row.employee_id,
            "finance_account_id": getattr(finance_account, "id", None),
            "amount": candidate["amount"],
            "staff_advance_source_mutation": False,
            "salary_sheet_mutation": False,
            "salary_payment_mutation": False,
            "staff_advance_recovery_mutation": False,
        },
        posted_by=actor,
    )
    row.refresh_from_db()
    after_snapshot = _source_snapshot(row)
    if {k: v for k, v in after_snapshot.items() if k != "posted_journal_entry_id"} != {k: v for k, v in source_before.items() if k != "posted_journal_entry_id"}:
        raise ValueError("StaffAdvance source mutation detected; bridge posting rolled back.")
    if created and row.posted_journal_entry_id is None:
        StaffAdvance.objects.filter(pk=row.pk, posted_journal_entry__isnull=True).update(posted_journal_entry=journal)
    item = base._latest_posting_reconciliation_item(source_model=SOURCE_MODEL, source_id=candidate["source_id"])
    if created and not (item and item.exception_code == "POSTED_UNVERIFIED"):
        item = base._create_pending_reconciliation_item(journal=journal, source_model=SOURCE_MODEL, source_id=candidate["source_id"], source_label=_ref(row), amount=base._money(candidate["amount"]), candidate_id=candidate_id, actor=actor, note=posting_note)
    base._log_candidate_post(journal=journal, actor=actor, candidate_id=candidate_id, source_model=SOURCE_MODEL, source_id=int(candidate["source_id"]), event_key=EVENT_KEY, amount=base._money(candidate["amount"]), candidate_key=key, reconciliation_item=item)
    return {"posted": created, "already_posted": not created, "journal_entry": base._journal_payload(journal), "reconciliation_item": base._reconciliation_payload(item), "next_action": "Run reconciliation checks and verify the pending bridge item."}


def batch_preview_bridge_candidates(candidate_ids: list[str]) -> dict[str, Any]:
    previews = []
    blockers: dict[str, list[str]] = {}
    total_debit = Decimal("0.00")
    total_credit = Decimal("0.00")
    for candidate_id in candidate_ids:
        try:
            preview = preview_bridge_candidate(candidate_id)
            previews.append(preview)
            total_debit += base._money(preview["total_debit"])
            total_credit += base._money(preview["total_credit"])
            if not preview["can_post"]:
                blockers[candidate_id] = preview["blockers"] or ["Candidate is not postable."]
        except Exception as exc:
            blockers[candidate_id] = [str(exc)]
    return {"selected_count": len(candidate_ids), "postable_count": sum(1 for item in previews if item.get("can_post")), "blocked_count": len(blockers), "total_debit": f"{total_debit:.2f}", "total_credit": f"{total_credit:.2f}", "is_balanced": total_debit == total_credit, "previews": previews, "blockers": blockers}


@transaction.atomic
def batch_post_bridge_candidates(*, candidate_ids: list[str], idempotency_keys: dict[str, str], confirmed: bool, posting_note: str = "", actor) -> dict[str, Any]:
    posted = []
    already_posted = []
    errors: dict[str, list[str]] = {}
    for candidate_id in candidate_ids:
        try:
            result = post_bridge_candidate(candidate_id=candidate_id, idempotency_key=idempotency_keys.get(candidate_id, ""), confirmed=confirmed, posting_note=posting_note, actor=actor)
            payload = {"candidate_id": candidate_id, **result}
            if result.get("already_posted"):
                already_posted.append(payload)
            else:
                posted.append(payload)
        except Exception as exc:
            errors[candidate_id] = [str(exc)]
    return {"selected_count": len(candidate_ids), "posted_count": len(posted), "already_posted_count": len(already_posted), "skipped_already_posted_count": len(already_posted), "blocked_count": len(errors), "created_journal_ids": [item["journal_entry"]["id"] for item in posted if item.get("journal_entry")], "reconciliation_pending_count": sum(1 for item in posted if item.get("reconciliation_item")), "posted": posted, "already_posted": already_posted, "errors": errors}


def summarize_candidate_statuses(rows: list[dict[str, Any]]) -> dict[str, int]:
    return {
        "staff_advance_ready_unposted_count": sum(1 for row in rows if row.get("source_model") == SOURCE_MODEL and row.get("event_key") == EVENT_KEY and row.get("status") == "READY_UNPOSTED"),
        "staff_advance_posted_count": sum(1 for row in rows if row.get("source_model") == SOURCE_MODEL and row.get("event_key") == EVENT_KEY and row.get("status") == "POSTED"),
        "staff_advance_posted_unverified_count": sum(1 for row in rows if row.get("source_model") == SOURCE_MODEL and row.get("event_key") == EVENT_KEY and row.get("reconciliation_state") == "POSTED_UNVERIFIED"),
        "staff_advance_reconciled_count": sum(1 for row in rows if row.get("source_model") == SOURCE_MODEL and row.get("event_key") == EVENT_KEY and row.get("status") == "RECONCILED"),
        "staff_advance_blocked_count": sum(1 for row in rows if row.get("source_model") == SOURCE_MODEL and row.get("event_key") == EVENT_KEY and str(row.get("status") or "").startswith("BLOCKED")),
        "staff_advance_unsupported_count": sum(1 for row in rows if row.get("source_model") == SOURCE_MODEL and row.get("status") in {"UNSUPPORTED_SOURCE", "SKIPPED_NOT_APPLICABLE"}),
    }
