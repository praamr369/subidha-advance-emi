from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any

from django.db import transaction

from accounting.models import AccountingBridgePosting
from accounting.services import accounting_bridge_candidate_service as base
from accounting.services import accounting_bridge_customer_advance_application_service as previous
from accounting.services.bridge_posting_service import post_bridge_entry
from accounting.services.document_sequence_service import DocumentNumberingSetupError, DocumentType, preview_document_number, validate_document_numbering_ready
from subscriptions.models_customer_advance_refund import CustomerAdvanceRefund, CustomerAdvanceRefundStatus

BridgeCandidateFilters = previous.BridgeCandidateFilters
verify_bridge_reconciliation_item = previous.verify_bridge_reconciliation_item

SOURCE_MODEL = "CustomerAdvanceRefund"
EVENT_KEY = "customer_advance_refund"
PURPOSE = "CUSTOMER_ADVANCE_REFUND"
UNSUPPORTED_EVENT_KEY = "unsupported_customer_advance_refund"
SKIPPED_EVENT_KEY = "customer_advance_refund_skipped_not_applicable"
SAFETY_TEXT = (
    "Preview is read-only. Posting creates accounting entries only after explicit admin confirmation. "
    "It does not edit customer advance refund, source advance, allocation, payment, receipt, customer, contract, or finance-account records."
)
F23_PHASE = "F23_CUSTOMER_ADVANCE_REFUND"


def _ref(row: CustomerAdvanceRefund) -> str:
    return row.refund_reference_no or f"CAR-{row.id}"


def _metadata(row: CustomerAdvanceRefund) -> dict[str, Any]:
    return row.metadata_snapshot if isinstance(row.metadata_snapshot, dict) else {}


def _user_display(user) -> str | None:
    if user is None:
        return None
    full_name = user.get_full_name() if hasattr(user, "get_full_name") else ""
    return full_name or getattr(user, "username", None) or f"User #{getattr(user, 'id', '')}"


def _classify(row: CustomerAdvanceRefund) -> tuple[str, str, str | None]:
    if row.status in {CustomerAdvanceRefundStatus.VOIDED, CustomerAdvanceRefundStatus.REVERSED}:
        return SKIPPED_EVENT_KEY, "Customer advance refund skipped", "Voided/reversed customer advance refunds have no F23 posting impact."
    if row.status != CustomerAdvanceRefundStatus.ACTIVE:
        return UNSUPPORTED_EVENT_KEY, "Unsupported customer advance refund", "CustomerAdvanceRefund status cannot be safely classified for F23."
    if base._money(row.amount) <= Decimal("0.00"):
        return UNSUPPORTED_EVENT_KEY, "Unsupported customer advance refund", "CustomerAdvanceRefund amount must be greater than zero."
    if not row.advance_id:
        return UNSUPPORTED_EVENT_KEY, "Unsupported customer advance refund", "CustomerAdvanceRefund must link to source CustomerAdvance receipt evidence."
    if not row.customer_id:
        return UNSUPPORTED_EVENT_KEY, "Unsupported customer advance refund", "CustomerAdvanceRefund customer evidence is missing."
    if row.advance_id and row.customer_id and row.advance.customer_id != row.customer_id:
        return UNSUPPORTED_EVENT_KEY, "Unsupported customer advance refund", "CustomerAdvanceRefund customer does not match the source CustomerAdvance customer."
    metadata = _metadata(row)
    if metadata:
        if metadata.get("source_contract_phase") not in {None, "", "F22"}:
            return UNSUPPORTED_EVENT_KEY, "Unsupported customer advance refund", "CustomerAdvanceRefund metadata does not mark this row as F22 source evidence."
        if metadata.get("future_bridge_phase") not in {None, "", F23_PHASE, "CUSTOMER_ADVANCE_REFUND"}:
            return UNSUPPORTED_EVENT_KEY, "Unsupported customer advance refund", "CustomerAdvanceRefund metadata does not defer this row to F23 refund bridge."
        if metadata.get("event_key") not in {None, "", EVENT_KEY}:
            return UNSUPPORTED_EVENT_KEY, "Unsupported customer advance refund", "CustomerAdvanceRefund metadata event key is not customer_advance_refund."
    return EVENT_KEY, "Customer advance refund", None


def _finance_account_blocker(row: CustomerAdvanceRefund) -> str | None:
    finance_account = row.finance_account
    if finance_account is None:
        return "Finance account is missing for this customer advance refund."
    if not finance_account.is_active:
        return "Finance account is inactive for this customer advance refund."
    if not finance_account.chart_account_id or not finance_account.chart_account.is_active:
        return "Finance account is not mapped to an active chart account for this customer advance refund."
    return None


def _lines(row: CustomerAdvanceRefund, event_key: str):
    warnings: list[str] = []
    if event_key != EVENT_KEY:
        return [], ["Unsupported customer advance refund event."], getattr(row, "finance_account", None)
    amount = base._money(row.amount)
    if amount <= Decimal("0.00"):
        warnings.append("CustomerAdvanceRefund amount must be greater than zero.")
    if not row.advance_id:
        warnings.append("CustomerAdvance link is missing.")
    if not row.customer_id:
        warnings.append("Customer evidence is missing.")
    if not row.refund_date:
        warnings.append("Refund date is required.")
    if not row.payment_method:
        warnings.append("Refund payment method is required.")
    finance_account = row.finance_account
    finance_blocker = _finance_account_blocker(row)
    if finance_blocker:
        warnings.append(finance_blocker)
    liability = base._customer_advance_account()
    if liability is None:
        warnings.append("CUSTOMER_ADVANCE_UNEARNED_REVENUE posting profile/chart account is missing or inactive.")
    if warnings:
        return [], warnings, finance_account
    reference = _ref(row)
    return [
        {"chart_account": liability, "description": f"Customer advance refund {reference}", "debit_amount": amount, "credit_amount": Decimal("0.00")},
        {"chart_account": finance_account.chart_account, "description": f"Refund paid from finance account {reference}", "debit_amount": Decimal("0.00"), "credit_amount": amount},
    ], warnings, finance_account


def _source_snapshot(row: CustomerAdvanceRefund) -> dict[str, Any]:
    return {
        "customer_id": row.customer_id,
        "advance_id": row.advance_id,
        "finance_account_id": row.finance_account_id,
        "refund_reference_no": row.refund_reference_no,
        "idempotency_key": row.idempotency_key,
        "amount": row.amount,
        "refund_date": row.refund_date,
        "payment_method": row.payment_method,
        "status": row.status,
        "voided_by_id": row.voided_by_id,
        "voided_at": row.voided_at,
        "void_reason": row.void_reason,
        "reversal_reference": row.reversal_reference,
        "notes": row.notes,
        "metadata_snapshot": row.metadata_snapshot,
        "created_by_id": row.created_by_id,
    }


def _linked_snapshot(row: CustomerAdvanceRefund) -> dict[str, Any]:
    advance = row.advance
    return {
        "advance_amount": advance.amount,
        "advance_unapplied_amount": advance.unapplied_amount,
        "advance_status": advance.status,
        "advance_metadata": advance.allocation_metadata,
        "customer_name": row.customer.name if row.customer_id else None,
        "customer_phone": row.customer.phone if row.customer_id else None,
        "finance_account_active": row.finance_account.is_active if row.finance_account_id else None,
        "finance_account_chart": row.finance_account.chart_account_id if row.finance_account_id else None,
    }


def _qs():
    return CustomerAdvanceRefund.objects.select_related(
        "customer",
        "advance",
        "advance__customer",
        "advance__finance_account",
        "advance__finance_account__chart_account",
        "finance_account",
        "finance_account__chart_account",
        "created_by",
    )


def candidate_for(row: CustomerAdvanceRefund) -> dict[str, Any]:
    event_key, event_label, reason = _classify(row)
    purpose = PURPOSE if event_key == EVENT_KEY else event_key.upper()
    bridge = AccountingBridgePosting.objects.filter(source_model=SOURCE_MODEL, source_id=str(row.id), purpose=purpose).select_related("journal_entry", "journal_entry__accounting_period", "journal_entry__financial_year").first()
    journal = bridge.journal_entry if bridge else None
    item = base._latest_posting_reconciliation_item(source_model=SOURCE_MODEL, source_id=str(row.id)) if journal else base._latest_reconciliation_item(source_model=SOURCE_MODEL, source_id=str(row.id))
    period = getattr(journal, "accounting_period", None) or base._source_period(row.refund_date)
    lines, warnings, finance_account = _lines(row, event_key) if event_key == EVENT_KEY else ([], [reason] if reason else [], row.finance_account)
    raw = "SKIPPED_NOT_APPLICABLE" if event_key == SKIPPED_EVENT_KEY else "UNSUPPORTED_SOURCE" if event_key == UNSUPPORTED_EVENT_KEY else "READY" if lines else "NOT_CONFIGURED"
    postability = base._candidate_status_payload(event_key=event_key, event_label=event_label, module="subscriptions", source_model=SOURCE_MODEL, raw_status=raw, lines=lines, line_warnings=warnings, period=period, source_date=row.refund_date, journal=journal, reconciliation_item=item, source_workflow_exists=event_key == EVENT_KEY, classification_reason=reason)
    source_date_key = row.refund_date.isoformat() if row.refund_date else "NO_SAFE_DATE"
    metadata = _metadata(row)
    source_idempotency_key = row.idempotency_key or metadata.get("idempotency_key") or row.refund_reference_no or row.id
    reference = _ref(row)
    payload = base._candidate_payload(
        candidate_id=base._candidate_id(source_model=SOURCE_MODEL, source_pk=row.id, event_key=event_key),
        event_key=event_key,
        event_label=event_label,
        module="subscriptions",
        source_model=SOURCE_MODEL,
        source_pk=row.id,
        source_display=f"Customer advance refund {reference}",
        source_reference=reference,
        source_date=row.refund_date,
        amount=row.amount,
        lines=lines,
        finance_account=finance_account,
        period=period,
        postability=postability,
        journal=journal,
        reconciliation_item=item,
        idempotency_key=f"bridge:{PURPOSE}:CustomerAdvanceRefund:{row.id}:{source_date_key}:{base._money(row.amount):.2f}:{source_idempotency_key}",
        source_status=row.status,
        source_type="CUSTOMER_ADVANCE_REFUND",
    )
    if payload.get("reconciliation_state") == "POSTED_UNVERIFIED":
        payload["status"] = "POSTED_UNVERIFIED"
        payload["canonical_status"] = "POSTED_UNVERIFIED"
    payload.update(
        {
            "customer_advance_refund_id": row.id,
            "refund_id": row.id,
            "refund_reference": reference,
            "refund_reference_no": row.refund_reference_no,
            "refund_date": row.refund_date.isoformat() if row.refund_date else None,
            "payment_method": row.payment_method,
            "method": row.payment_method,
            "refund_status": row.status,
            "customer_id": row.customer_id,
            "customer_name": getattr(row.customer, "name", None),
            "customer_advance_id": row.advance_id,
            "advance_reference": getattr(row.advance, "reference_no", None) or f"CA-{row.advance_id}",
            "advance_status": getattr(row.advance, "status", None),
            "advance_unapplied_amount": f"{base._money(getattr(row.advance, 'unapplied_amount', Decimal('0.00'))):.2f}",
            "finance_account_id": row.finance_account_id,
            "finance_account_name": getattr(row.finance_account, "name", None),
            "finance_account_active": getattr(row.finance_account, "is_active", None),
            "source_metadata": metadata,
            "metadata_snapshot": metadata,
            "created_by_id": row.created_by_id,
            "created_by_name": _user_display(row.created_by),
            "accounting_bridge_posting_deferred": metadata.get("accounting_bridge_posting_deferred"),
            "future_bridge_phase": metadata.get("future_bridge_phase"),
        }
    )
    return payload


def list_bridge_candidates(filters: BridgeCandidateFilters | None = None) -> list[dict[str, Any]]:
    active_filters = filters or BridgeCandidateFilters()
    requested_model = (active_filters.source_model or "").strip()
    rows: list[dict[str, Any]] = []
    if requested_model != SOURCE_MODEL:
        rows.extend(previous.list_bridge_candidates(active_filters))
    if requested_model in {"", SOURCE_MODEL} and (not active_filters.module or active_filters.module == "subscriptions"):
        qs = base._date_filter_qs(_qs(), active_filters, date_field="refund_date")
        rows.extend(candidate_for(item) for item in qs.order_by("-refund_date", "-id")[:500])
    if active_filters.event_key:
        rows = [row for row in rows if row["event_key"] == active_filters.event_key]
    if active_filters.status:
        rows = [row for row in rows if row["status"] == active_filters.status or row.get("reconciliation_state") == active_filters.status]
    rows.sort(key=lambda row: (row.get("source_date") or "", str(row.get("source_id") or "")), reverse=True)
    return rows


def get_bridge_candidate(candidate_id: str, *, for_update: bool = False) -> dict[str, Any]:
    source_kind, source_pk, event_key = base._parse_candidate_id(candidate_id)
    if source_kind != "customeradvancerefund":
        return previous.get_bridge_candidate(candidate_id, for_update=for_update)
    qs = _qs().select_for_update() if for_update else _qs()
    candidate = candidate_for(qs.get(pk=source_pk))
    if candidate["event_key"] != event_key:
        raise ValueError("CustomerAdvanceRefund candidate event no longer matches current source state.")
    return candidate


def _lines_for_candidate(candidate: dict[str, Any]):
    if candidate.get("source_model") != SOURCE_MODEL:
        return previous._lines_for_candidate(candidate) if hasattr(previous, "_lines_for_candidate") else ([], ["Unsupported source model."], None)
    row = _qs().get(pk=candidate["source_id"])
    return _lines(row, candidate["event_key"])


def preview_bridge_candidate(candidate_id: str) -> dict[str, Any]:
    candidate = get_bridge_candidate(candidate_id)
    if candidate.get("source_model") != SOURCE_MODEL:
        return previous.preview_bridge_candidate(candidate_id)
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
        "refund_reference": candidate.get("refund_reference"),
        "customer_name": candidate.get("customer_name"),
        "advance_reference": candidate.get("advance_reference"),
        "payment_method": candidate.get("payment_method"),
        "finance_account_name": candidate.get("finance_account_name"),
        "refund_status": candidate.get("refund_status"),
        "source_metadata": candidate.get("source_metadata"),
    }
    return {
        "candidate": candidate,
        "candidate_id": candidate_id,
        "source": source,
        "advance_refund_identity": source,
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
    if candidate.get("source_model") != SOURCE_MODEL:
        return previous.post_bridge_candidate(candidate_id=candidate_id, idempotency_key=idempotency_key, confirmed=confirmed, posting_note=posting_note, actor=actor)
    if not confirmed:
        raise ValueError("Explicit confirmation is required before posting.")
    key = (idempotency_key or "").strip()
    if not key:
        raise ValueError("idempotency_key is required.")
    if candidate["event_key"] != EVENT_KEY:
        raise ValueError("Unsupported CustomerAdvanceRefund bridge candidate source.")
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
    linked_before = _linked_snapshot(row)
    lines, _warnings, finance_account = _lines_for_candidate(candidate)
    total_debit, total_credit = base._line_totals(lines)
    if not lines or total_debit != total_credit:
        raise ValueError("Bridge posting preview is not balanced.")
    journal, created = post_bridge_entry(
        source_instance=row,
        purpose=PURPOSE,
        entry_date=row.refund_date,
        memo=f"Bridge posting CustomerAdvanceRefund {row.id} {EVENT_KEY}",
        lines=lines,
        voucher_type=PURPOSE,
        source_type="CUSTOMER_ADVANCE_REFUND",
        source_reference=_ref(row),
        source_document_no=_ref(row),
        source_event_date=row.refund_date,
        trace_metadata={
            "event_key": EVENT_KEY,
            "idempotency_key": key,
            "posting_note": posting_note,
            "source_model": SOURCE_MODEL,
            "source_id": candidate["source_id"],
            "customer_advance_refund_id": row.id,
            "customer_advance_id": row.advance_id,
            "customer_id": row.customer_id,
            "payment_method": row.payment_method,
            "finance_account_id": getattr(finance_account, "id", None),
            "amount": candidate["amount"],
            "source_metadata": _metadata(row),
            "customer_advance_refund_mutation": False,
            "customer_advance_mutation": False,
            "customer_advance_allocation_mutation": False,
            "payment_mutation": False,
            "receipt_mutation": False,
            "emi_mutation": False,
            "customer_mutation": False,
            "contract_mutation": False,
            "finance_account_mutation": False,
            "advance_balance_mutation": False,
            "duplicate_f2_receiptdocument_path": False,
            "duplicate_f20_customer_advance_receipt_path": False,
            "duplicate_f21_customer_advance_application_path": False,
        },
        posted_by=actor,
    )
    row.refresh_from_db()
    row.advance.refresh_from_db()
    row.customer.refresh_from_db()
    row.finance_account.refresh_from_db()
    if _source_snapshot(row) != source_before or _linked_snapshot(row) != linked_before:
        raise ValueError("CustomerAdvanceRefund source or linked source mutation detected; bridge posting rolled back.")
    item = base._latest_posting_reconciliation_item(source_model=SOURCE_MODEL, source_id=candidate["source_id"])
    if created and not (item and item.exception_code == "POSTED_UNVERIFIED"):
        item = base._create_pending_reconciliation_item(journal=journal, source_model=SOURCE_MODEL, source_id=candidate["source_id"], source_label=_ref(row), amount=base._money(candidate["amount"]), candidate_id=candidate_id, actor=actor, note=posting_note)
    base._log_candidate_post(journal=journal, actor=actor, candidate_id=candidate_id, source_model=SOURCE_MODEL, source_id=int(candidate["source_id"]), event_key=EVENT_KEY, amount=base._money(candidate["amount"]), candidate_key=key, reconciliation_item=item)
    return {"posted": created, "already_posted": not created, "journal_entry": base._journal_payload(journal), "reconciliation_item": base._reconciliation_payload(item), "next_action": "Run reconciliation checks and verify the pending bridge item."}


def _is_own(candidate_id: str) -> bool:
    try:
        source_kind, _source_pk, _event_key = base._parse_candidate_id(candidate_id)
    except ValueError:
        return False
    return source_kind == "customeradvancerefund"


def batch_preview_bridge_candidates(candidate_ids: list[str]) -> dict[str, Any]:
    if not any(_is_own(candidate_id) for candidate_id in candidate_ids):
        return previous.batch_preview_bridge_candidates(candidate_ids)
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
    if not any(_is_own(candidate_id) for candidate_id in candidate_ids):
        return previous.batch_post_bridge_candidates(candidate_ids=candidate_ids, idempotency_keys=idempotency_keys, confirmed=confirmed, posting_note=posting_note, actor=actor)
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
    summary = previous.summarize_candidate_statuses(rows)
    summary.update(
        {
            "customer_advance_refund_ready_unposted_count": sum(1 for row in rows if row.get("source_model") == SOURCE_MODEL and row.get("event_key") == EVENT_KEY and row.get("status") == "READY_UNPOSTED"),
            "customer_advance_refund_posted_count": sum(1 for row in rows if row.get("source_model") == SOURCE_MODEL and row.get("event_key") == EVENT_KEY and row.get("status") == "POSTED"),
            "customer_advance_refund_posted_unverified_count": sum(1 for row in rows if row.get("source_model") == SOURCE_MODEL and row.get("event_key") == EVENT_KEY and row.get("reconciliation_state") == "POSTED_UNVERIFIED"),
            "customer_advance_refund_reconciled_count": sum(1 for row in rows if row.get("source_model") == SOURCE_MODEL and row.get("event_key") == EVENT_KEY and row.get("status") == "RECONCILED"),
            "customer_advance_refund_blocked_count": sum(1 for row in rows if row.get("source_model") == SOURCE_MODEL and row.get("event_key") == EVENT_KEY and str(row.get("status") or "").startswith("BLOCKED")),
            "customer_advance_refund_unsupported_count": sum(1 for row in rows if row.get("source_model") == SOURCE_MODEL and row.get("status") in {"UNSUPPORTED_SOURCE", "SKIPPED_NOT_APPLICABLE"}),
        }
    )
    return summary
