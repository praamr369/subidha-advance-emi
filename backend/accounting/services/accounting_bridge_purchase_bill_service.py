from __future__ import annotations

from collections import Counter
from datetime import date
from decimal import Decimal
from typing import Any

from django.db import transaction

from accounting.models import AccountingBridgePosting, ChartOfAccount, FinanceAccount, JournalEntry
from accounting.services import accounting_bridge_candidate_service as base
from accounting.services.document_sequence_service import DocumentNumberingSetupError, DocumentType, preview_document_number, validate_document_numbering_ready
from accounting.services.bridge_posting_service import post_bridge_entry
from inventory.models import PurchaseBill, PurchaseBillStatus, PurchaseTaxMode
from reconciliation.models import ReconciliationItemStatus

PURCHASE_BILL_SOURCE_MODEL = "PurchaseBill"
PURCHASE_BILL_EVENT_KEYS = {"purchase_bill_accrual", "vendor_payable_invoice", "input_tax_credit", "purchase_expense_accrual"}
PURCHASE_BILL_PURPOSE_BY_EVENT = {
    "purchase_bill_accrual": "PURCHASE_BILL_ACCRUAL",
    "vendor_payable_invoice": "VENDOR_PAYABLE_INVOICE",
    "input_tax_credit": "INPUT_TAX_CREDIT",
    "purchase_expense_accrual": "PURCHASE_EXPENSE_ACCRUAL",
}
PURCHASE_BILL_LABEL_BY_EVENT = {
    "purchase_bill_accrual": "Purchase bill accrual",
    "vendor_payable_invoice": "Vendor payable invoice",
    "input_tax_credit": "Input tax credit",
    "purchase_expense_accrual": "Purchase expense accrual",
}
SKIPPED_PURCHASE_BILL_EVENT_KEY = "purchase_bill_skipped_not_applicable"
UNSUPPORTED_PURCHASE_BILL_EVENT_KEY = "unsupported_purchase_bill"
PURCHASE_BILL_SAFETY_TEXT = "Preview is read-only. Posting creates accounting entries only after explicit admin confirmation. It does not edit purchase or inventory records."

BridgeCandidateFilters = base.BridgeCandidateFilters
verify_bridge_reconciliation_item = base.verify_bridge_reconciliation_item


def _purchase_bill_reference(row: PurchaseBill) -> str:
    return row.bill_no or f"PB-{row.id}"


def _vendor_name(row: PurchaseBill) -> str:
    return getattr(row.vendor, "name", None) or getattr(row.vendor, "display_name", None) or getattr(row.vendor, "vendor_name", None) or str(row.vendor)


def _purchase_expense_account() -> ChartOfAccount | None:
    return base._posting_profile_account("PURCHASE_EXPENSE") or base._posting_profile_account("PURCHASE_CLEARING") or base._posting_profile_account("INVENTORY_CLEARING")


def _vendor_payable_account() -> ChartOfAccount | None:
    return base._posting_profile_account("VENDOR_PAYABLE") or base._posting_profile_account("ACCOUNTS_PAYABLE")


def _input_gst_account() -> ChartOfAccount | None:
    return base._posting_profile_account("INPUT_GST")


def _classify_purchase_bill_event(row: PurchaseBill) -> tuple[str, str, str | None]:
    if row.status in {PurchaseBillStatus.DRAFT, PurchaseBillStatus.CANCELLED}:
        return SKIPPED_PURCHASE_BILL_EVENT_KEY, "Purchase bill skipped", "Draft/cancelled purchase bills are skipped from controlled bridge posting."
    if row.status == PurchaseBillStatus.POSTED and not AccountingBridgePosting.objects.filter(source_model=PURCHASE_BILL_SOURCE_MODEL, source_id=str(row.id)).exists():
        return SKIPPED_PURCHASE_BILL_EVENT_KEY, "Purchase bill skipped", "Legacy posted purchase bills are not F6 bridge-postable because the legacy path may already have updated stock/status/journal state."
    if row.status not in {PurchaseBillStatus.APPROVED, PurchaseBillStatus.POSTED}:
        return UNSUPPORTED_PURCHASE_BILL_EVENT_KEY, "Unsupported purchase bill", "PurchaseBill status cannot be safely classified for bridge posting."
    # The model has inventory-linked lines but no expense-type discriminator. F6 posts only payable/accrual side.
    return "purchase_bill_accrual", PURCHASE_BILL_LABEL_BY_EVENT["purchase_bill_accrual"], None


def _purchase_bill_lines(row: PurchaseBill, event_key: str) -> tuple[list[dict[str, Any]], list[str], FinanceAccount | None]:
    warnings: list[str] = []
    if event_key not in PURCHASE_BILL_EVENT_KEYS:
        return [], ["Unsupported PurchaseBill event for Phase F6."], None
    amount = base._money(row.grand_total)
    taxable = base._money(row.subtotal)
    tax = base._money(row.tax_total)
    if amount <= Decimal("0.00"):
        warnings.append("PurchaseBill grand_total must be greater than zero.")
    if taxable <= Decimal("0.00"):
        warnings.append("PurchaseBill subtotal/taxable amount cannot be resolved safely.")
    debit_account = _purchase_expense_account()
    payable_account = _vendor_payable_account()
    input_gst_account = _input_gst_account() if tax > Decimal("0.00") else None
    if debit_account is None:
        warnings.append("PURCHASE_EXPENSE / PURCHASE_CLEARING / INVENTORY_CLEARING posting profile/chart account is missing or inactive.")
    if payable_account is None:
        warnings.append("VENDOR_PAYABLE / ACCOUNTS_PAYABLE posting profile/chart account is missing or inactive.")
    if tax > Decimal("0.00") and input_gst_account is None:
        warnings.append("INPUT_GST posting profile/chart account is missing or inactive for taxable purchase bill.")
    if warnings:
        return [], warnings, None
    lines = [
        {"chart_account": debit_account, "description": f"Purchase accrual {_purchase_bill_reference(row)}", "debit_amount": taxable, "credit_amount": Decimal("0.00")},
    ]
    if tax > Decimal("0.00"):
        lines.append({"chart_account": input_gst_account, "description": f"Input GST {_purchase_bill_reference(row)}", "debit_amount": tax, "credit_amount": Decimal("0.00")})
    lines.append({"chart_account": payable_account, "description": f"Vendor payable {_purchase_bill_reference(row)}", "debit_amount": Decimal("0.00"), "credit_amount": amount})
    return lines, warnings, None


def _purchase_bridge_for(row: PurchaseBill, event_key: str):
    return base._existing_bridge_for(source_model=PURCHASE_BILL_SOURCE_MODEL, source_id=str(row.id), purpose=PURCHASE_BILL_PURPOSE_BY_EVENT.get(event_key, event_key.upper()))


def purchase_bill_candidate(row: PurchaseBill) -> dict[str, Any]:
    event_key, event_label, reason = _classify_purchase_bill_event(row)
    purpose = PURCHASE_BILL_PURPOSE_BY_EVENT.get(event_key, event_key.upper())
    bridge = _purchase_bridge_for(row, event_key)
    journal = bridge.journal_entry if bridge else None
    item = base._latest_posting_reconciliation_item(source_model=PURCHASE_BILL_SOURCE_MODEL, source_id=str(row.id)) if journal else base._latest_reconciliation_item(source_model=PURCHASE_BILL_SOURCE_MODEL, source_id=str(row.id))
    period = getattr(journal, "accounting_period", None) or base._source_period(row.bill_date)
    lines, warnings, finance_account = _purchase_bill_lines(row, event_key) if event_key in PURCHASE_BILL_EVENT_KEYS else ([], [reason] if reason else [], None)
    raw = "SKIPPED_NOT_APPLICABLE" if event_key == SKIPPED_PURCHASE_BILL_EVENT_KEY else "UNSUPPORTED_SOURCE" if event_key == UNSUPPORTED_PURCHASE_BILL_EVENT_KEY else "READY" if lines else "NOT_CONFIGURED"
    postability = base._candidate_status_payload(event_key=event_key, event_label=event_label, module="inventory", source_model=PURCHASE_BILL_SOURCE_MODEL, raw_status=raw, lines=lines, line_warnings=warnings, period=period, source_date=row.bill_date, journal=journal, reconciliation_item=item, source_workflow_exists=event_key in PURCHASE_BILL_EVENT_KEYS, classification_reason=reason)
    payload = base._candidate_payload(candidate_id=base._candidate_id(source_model=PURCHASE_BILL_SOURCE_MODEL, source_pk=row.id, event_key=event_key), event_key=event_key, event_label=event_label, module="inventory", source_model=PURCHASE_BILL_SOURCE_MODEL, source_pk=row.id, source_display=f"Purchase bill {_purchase_bill_reference(row)}", source_reference=_purchase_bill_reference(row), source_date=row.bill_date, amount=row.grand_total, taxable_amount=row.subtotal, tax_amount=row.tax_total, lines=lines, finance_account=finance_account, period=period, postability=postability, journal=journal, reconciliation_item=item, idempotency_key=f"bridge:{purpose}:PurchaseBill:{row.id}:{row.bill_date.isoformat()}:{base._money(row.grand_total):.2f}", source_status=row.status, source_type=row.tax_mode)
    payload.update({"purchase_bill_number": row.bill_no, "purchase_bill_status": row.status, "vendor_name": _vendor_name(row), "vendor_id": row.vendor_id, "source_module": "inventory"})
    return payload


def _purchase_queryset(filters: BridgeCandidateFilters):
    qs = PurchaseBill.objects.select_related("vendor", "branch", "stock_location", "finance_account", "finance_account__chart_account")
    return base._date_filter_qs(qs, filters, date_field="bill_date")


def list_bridge_candidates(filters: BridgeCandidateFilters | None = None) -> list[dict[str, Any]]:
    active_filters = filters or BridgeCandidateFilters()
    requested_model = (active_filters.source_model or "").strip()
    rows: list[dict[str, Any]] = []
    if requested_model != PURCHASE_BILL_SOURCE_MODEL:
        rows.extend(base.list_bridge_candidates(active_filters))
    if requested_model in {"", PURCHASE_BILL_SOURCE_MODEL} and (not active_filters.module or active_filters.module in {"inventory", "purchase"}):
        qs = _purchase_queryset(active_filters)
        rows.extend(purchase_bill_candidate(item) for item in qs.order_by("-bill_date", "-id")[:500])
    if active_filters.event_key:
        rows = [row for row in rows if row["event_key"] == active_filters.event_key]
    if active_filters.status:
        rows = [row for row in rows if row["status"] == active_filters.status or row.get("reconciliation_state") == active_filters.status]
    rows.sort(key=lambda row: (row.get("source_date") or "", str(row.get("source_id") or "")), reverse=True)
    return rows


def get_bridge_candidate(candidate_id: str, *, for_update: bool = False) -> dict[str, Any]:
    source_kind, source_pk, event_key = base._parse_candidate_id(candidate_id)
    if source_kind != "purchasebill":
        return base.get_bridge_candidate(candidate_id, for_update=for_update)
    qs = PurchaseBill.objects.select_related("vendor", "branch", "stock_location", "finance_account", "finance_account__chart_account")
    if for_update:
        qs = qs.select_for_update()
    candidate = purchase_bill_candidate(qs.get(pk=source_pk))
    if candidate["event_key"] != event_key:
        raise ValueError("PurchaseBill candidate event no longer matches current source state.")
    return candidate


def _lines_for_candidate(candidate: dict[str, Any]):
    if candidate["source_model"] != PURCHASE_BILL_SOURCE_MODEL:
        return base._lines_for_candidate(candidate)
    row = PurchaseBill.objects.select_related("vendor", "finance_account", "finance_account__chart_account").get(pk=candidate["source_id"])
    return _purchase_bill_lines(row, candidate["event_key"])


def preview_bridge_candidate(candidate_id: str) -> dict[str, Any]:
    candidate = get_bridge_candidate(candidate_id)
    if candidate.get("source_model") != PURCHASE_BILL_SOURCE_MODEL:
        return base.preview_bridge_candidate(candidate_id)
    lines, warnings, _finance_account = _lines_for_candidate(candidate)
    blockers = []
    if not candidate["can_post"]:
        blockers.append(candidate["blocker_reason"] or "Candidate is not postable.")
    try:
        sequence = validate_document_numbering_ready(DocumentType.JOURNAL_ENTRY, date.fromisoformat(candidate["source_date"]))
        journal_number_preview = preview_document_number(sequence=sequence)
    except DocumentNumberingSetupError as exc:
        journal_number_preview = None
        blockers.append(str(exc))
    total_debit, total_credit = base._line_totals(lines)
    tax_lines = [base._line_payload(account=line["chart_account"], description=line.get("description", ""), debit=line.get("debit_amount"), credit=line.get("credit_amount")) for line in lines if getattr(line.get("chart_account"), "system_code", "") == "INPUT_GST"]
    return {"candidate": candidate, "candidate_id": candidate_id, "source": {"model": PURCHASE_BILL_SOURCE_MODEL, "pk": candidate["source_id"], "display": candidate["source_display"], "reference_number": candidate["source_reference_number"], "date": candidate["source_date"], "amount": candidate["amount"], "source_status": candidate.get("source_status"), "source_type": candidate.get("source_type"), "purchase_bill_number": candidate.get("purchase_bill_number"), "vendor_name": candidate.get("vendor_name"), "taxable_amount": candidate.get("taxable_amount"), "tax_amount": candidate.get("tax_amount")}, "journal_date": candidate["source_date"], "accounting_period": candidate["accounting_period"], "journal_number_preview": journal_number_preview, "debit_lines": [base._line_payload(account=line["chart_account"], description=line.get("description", ""), debit=line.get("debit_amount")) for line in lines if base._money(line.get("debit_amount")) > 0], "credit_lines": [base._line_payload(account=line["chart_account"], description=line.get("description", ""), credit=line.get("credit_amount")) for line in lines if base._money(line.get("credit_amount")) > 0], "lines": base._preview_lines(lines), "total_debit": f"{total_debit:.2f}", "total_credit": f"{total_credit:.2f}", "is_balanced": bool(lines and total_debit == total_credit), "tax_lines": tax_lines, "finance_account_line": candidate.get("finance_account"), "warnings": warnings, "blockers": list(dict.fromkeys([item for item in blockers if item])), "can_post": bool(candidate["can_post"] and lines and total_debit == total_credit and not blockers), "idempotency_key": candidate["idempotency_key"], "safety_text": PURCHASE_BILL_SAFETY_TEXT}


@transaction.atomic
def post_bridge_candidate(*, candidate_id: str, idempotency_key: str, confirmed: bool, posting_note: str = "", actor) -> dict[str, Any]:
    candidate = get_bridge_candidate(candidate_id, for_update=True)
    if candidate.get("source_model") != PURCHASE_BILL_SOURCE_MODEL:
        return base.post_bridge_candidate(candidate_id=candidate_id, idempotency_key=idempotency_key, confirmed=confirmed, posting_note=posting_note, actor=actor)
    if not confirmed:
        raise ValueError("Explicit confirmation is required before posting.")
    key = (idempotency_key or "").strip()
    if not key:
        raise ValueError("idempotency_key is required.")
    if candidate["event_key"] not in PURCHASE_BILL_EVENT_KEYS:
        raise ValueError("Unsupported bridge candidate source.")
    purpose = PURCHASE_BILL_PURPOSE_BY_EVENT[candidate["event_key"]]
    existing = AccountingBridgePosting.objects.select_for_update().filter(source_model=PURCHASE_BILL_SOURCE_MODEL, source_id=candidate["source_id"], purpose=purpose).select_related("journal_entry").first()
    if existing is not None:
        existing_key = ((existing.trace_metadata or {}).get("idempotency_key") or "").strip()
        if existing_key and existing_key == key:
            return {"posted": False, "already_posted": True, "journal_entry": base._journal_payload(existing.journal_entry), "reconciliation_item": base._reconciliation_payload(base._latest_posting_reconciliation_item(source_model=PURCHASE_BILL_SOURCE_MODEL, source_id=candidate["source_id"])), "next_action": "Run reconciliation checks and verify the pending bridge item."}
        raise ValueError("This source item has already been posted with a different or legacy idempotency key.")
    if candidate["idempotency_key"] != key:
        raise ValueError("idempotency_key does not match the current source candidate.")
    preview = preview_bridge_candidate(candidate_id)
    if not preview["can_post"]:
        raise ValueError("; ".join(preview["blockers"]) or "Candidate is not postable.")
    row = PurchaseBill.objects.select_for_update().get(pk=candidate["source_id"])
    before = {"bill_no": row.bill_no, "status": row.status, "subtotal": row.subtotal, "tax_total": row.tax_total, "grand_total": row.grand_total, "posted_journal_entry_id": row.posted_journal_entry_id}
    lines, _warnings, finance_account = _lines_for_candidate(candidate)
    total_debit, total_credit = base._line_totals(lines)
    if not lines or total_debit != total_credit:
        raise ValueError("Bridge posting preview is not balanced.")
    journal, created = post_bridge_entry(source_instance=row, purpose=purpose, entry_date=row.bill_date, memo=f"Bridge posting PurchaseBill {row.id} {candidate['event_key']}", lines=lines, voucher_type=purpose, source_type="PURCHASE_BILL", source_reference=row.bill_no, source_document_no=row.bill_no, source_event_date=row.bill_date, trace_metadata={"event_key": candidate["event_key"], "idempotency_key": key, "posting_note": posting_note, "source_model": PURCHASE_BILL_SOURCE_MODEL, "source_id": candidate["source_id"], "vendor_id": row.vendor_id, "vendor_name": _vendor_name(row), "finance_account_id": getattr(finance_account, "id", None), "stock_location_id": row.stock_location_id, "amount": candidate["amount"], "taxable_amount": candidate.get("taxable_amount"), "tax_amount": candidate.get("tax_amount"), "inventory_mutation": False, "stock_ledger_mutation": False}, posted_by=actor)
    row.refresh_from_db()
    after = {"bill_no": row.bill_no, "status": row.status, "subtotal": row.subtotal, "tax_total": row.tax_total, "grand_total": row.grand_total, "posted_journal_entry_id": row.posted_journal_entry_id}
    if after != before:
        raise ValueError("PurchaseBill source mutation detected; bridge posting rolled back.")
    item = base._latest_posting_reconciliation_item(source_model=PURCHASE_BILL_SOURCE_MODEL, source_id=candidate["source_id"])
    if created and not (item and item.exception_code == "POSTED_UNVERIFIED"):
        item = base._create_pending_reconciliation_item(journal=journal, source_model=PURCHASE_BILL_SOURCE_MODEL, source_id=candidate["source_id"], source_label=row.bill_no, amount=base._money(candidate["amount"]), candidate_id=candidate_id, actor=actor, note=posting_note)
    base._log_candidate_post(journal=journal, actor=actor, candidate_id=candidate_id, source_model=PURCHASE_BILL_SOURCE_MODEL, source_id=int(candidate["source_id"]), event_key=candidate["event_key"], amount=base._money(candidate["amount"]), candidate_key=key, reconciliation_item=item)
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
                blockers[candidate_id] = preview["blockers"]
        except Exception as exc:
            blockers[candidate_id] = [str(exc)]
    return {"selected_count": len(candidate_ids), "previewable_count": len(previews), "postable_count": sum(1 for item in previews if item["can_post"]), "blocked_count": len(blockers), "total_debit": f"{total_debit:.2f}", "total_credit": f"{total_credit:.2f}", "previews": previews, "blockers": blockers}


def batch_post_bridge_candidates(*, candidate_ids: list[str], idempotency_keys: dict[str, str], confirmed: bool, posting_note: str = "", actor) -> dict[str, Any]:
    posted = []
    already_posted = []
    errors: dict[str, list[str]] = {}
    for candidate_id in candidate_ids:
        try:
            result = post_bridge_candidate(candidate_id=candidate_id, idempotency_key=idempotency_keys.get(candidate_id, ""), confirmed=confirmed, posting_note=posting_note, actor=actor)
            (posted if result["posted"] else already_posted).append(result)
        except Exception as exc:
            errors[candidate_id] = [str(exc)]
    return {"selected_count": len(candidate_ids), "posted_count": len(posted), "already_posted_count": len(already_posted), "skipped_already_posted_count": len(already_posted), "blocked_count": len(errors), "created_journal_ids": [item["journal_entry"]["id"] for item in posted if item.get("journal_entry")], "reconciliation_pending_count": sum(1 for item in posted if item.get("reconciliation_item")), "posted": posted, "already_posted": already_posted, "errors": errors}


def summarize_candidate_statuses(rows: list[dict[str, Any]]) -> dict[str, int]:
    summary = dict(base.summarize_candidate_statuses(rows))
    counter = Counter(row.get("status") or "INFO" for row in rows if row.get("source_model") == PURCHASE_BILL_SOURCE_MODEL)
    posted_unverified = sum(1 for row in rows if row.get("source_model") == PURCHASE_BILL_SOURCE_MODEL and row.get("reconciliation_state") == "POSTED_UNVERIFIED")
    summary.update({"purchase_bill_ready_unposted_count": counter.get("READY_UNPOSTED", 0), "purchase_bill_posted_count": counter.get("POSTED", 0), "purchase_bill_posted_unverified_count": posted_unverified, "purchase_bill_reconciled_count": counter.get("RECONCILED", 0), "purchase_bill_blocked_count": sum(v for k, v in counter.items() if str(k).startswith("BLOCKED")), "purchase_bill_unsupported_count": counter.get("UNSUPPORTED_SOURCE", 0)})
    return summary
