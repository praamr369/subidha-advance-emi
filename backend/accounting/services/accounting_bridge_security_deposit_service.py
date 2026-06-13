from __future__ import annotations

from collections import Counter
from datetime import date
from decimal import Decimal

from django.db import transaction

from accounting.models import AccountingBridgePosting
from accounting.services import accounting_bridge_candidate_service as base
from accounting.services import accounting_bridge_rent_lease_collection_service as previous
from accounting.services.bridge_posting_service import post_bridge_entry
from accounting.services.document_sequence_service import DocumentNumberingSetupError, DocumentType, preview_document_number, validate_document_numbering_ready
from subscriptions.models import (
    PlanType,
    RentLeaseDepositTransaction,
    RentLeaseDepositTransactionStatus,
    RentLeaseDepositTransactionType,
)

BridgeCandidateFilters = previous.BridgeCandidateFilters
verify_bridge_reconciliation_item = previous.verify_bridge_reconciliation_item

SOURCE_MODEL = "RentLeaseDepositTransaction"
EVENT_KEY = "security_deposit_receipt"
RENT_EVENT_KEY = "rent_security_deposit_receipt"
LEASE_EVENT_KEY = "lease_security_deposit_receipt"
EVENT_KEYS = {EVENT_KEY, RENT_EVENT_KEY, LEASE_EVENT_KEY}
PURPOSE_BY_EVENT = {key: key.upper() for key in EVENT_KEYS}
LABEL_BY_EVENT = {
    EVENT_KEY: "Security Deposit",
    RENT_EVENT_KEY: "Security Deposit",
    LEASE_EVENT_KEY: "Security Deposit",
}
DEFERRED_REFUND_EVENT_KEY = "deposit_refund_deferred"
UNSUPPORTED_EVENT_KEY = "unsupported_security_deposit"
SKIPPED_EVENT_KEY = "security_deposit_skipped_not_applicable"
SAFETY_TEXT = (
    "Preview is read-only. Posting creates accounting entries only after explicit admin confirmation. "
    "It does not edit deposit, contract, customer, collection, demand, or finance-account records."
)


def _ref(row: RentLeaseDepositTransaction) -> str:
    return row.transaction_number or row.external_reference_no or f"RLDT-{row.id}"


def _event_for_plan(row: RentLeaseDepositTransaction) -> str:
    if row.plan_type == PlanType.RENT:
        return RENT_EVENT_KEY
    if row.plan_type == PlanType.LEASE:
        return LEASE_EVENT_KEY
    return EVENT_KEY


def _has_complete_receipt_evidence(row: RentLeaseDepositTransaction) -> bool:
    return bool(
        base._money(row.amount) > Decimal("0.00")
        and row.finance_account_id
        and row.payment_method
        and row.transaction_date
        and row.customer_id
        and row.subscription_id
        and row.plan_type in {PlanType.RENT, PlanType.LEASE}
        and row.status == RentLeaseDepositTransactionStatus.ACTIVE
    )


def _classify(row: RentLeaseDepositTransaction):
    status = (row.status or "").strip().upper()
    tx_type = (row.transaction_type or "").strip().upper()
    if status in {RentLeaseDepositTransactionStatus.VOIDED, RentLeaseDepositTransactionStatus.REVERSED, "VOID", "CANCELLED", "CANCELED"}:
        return SKIPPED_EVENT_KEY, "Security deposit skipped", "Voided, cancelled, or reversed deposit transactions are not bridge-postable.", False
    if tx_type == RentLeaseDepositTransactionType.DEPOSIT_REFUND or tx_type == RentLeaseDepositTransactionType.REFUNDED:
        return DEFERRED_REFUND_EVENT_KEY, "Security deposit refund deferred", "Deposit refund posting is deferred to F18 and is not postable in F17.", False
    if tx_type == RentLeaseDepositTransactionType.DEPOSIT_ADJUSTMENT:
        return UNSUPPORTED_EVENT_KEY, "Unsupported security deposit", "Deposit adjustment rows are not supported by the F17 receipt bridge.", False
    if tx_type == RentLeaseDepositTransactionType.DEPOSIT_RECEIPT:
        return _event_for_plan(row), LABEL_BY_EVENT.get(_event_for_plan(row), "Security Deposit"), None, False
    if tx_type == RentLeaseDepositTransactionType.COLLECTED and _has_complete_receipt_evidence(row):
        return _event_for_plan(row), LABEL_BY_EVENT.get(_event_for_plan(row), "Security Deposit"), None, False
    if tx_type == RentLeaseDepositTransactionType.COLLECTED:
        return UNSUPPORTED_EVENT_KEY, "Unsupported security deposit", "Legacy COLLECTED deposit row lacks complete F16 receipt evidence.", False
    return UNSUPPORTED_EVENT_KEY, "Unsupported security deposit", "Only concrete deposit receipt source rows are supported in F17.", False


def _liability_account():
    return base._posting_profile_account("SECURITY_DEPOSIT_LIABILITY")


def _finance_account_blocker(row: RentLeaseDepositTransaction, finance_account) -> str | None:
    if finance_account is None:
        return "Finance account is missing for this security deposit receipt."
    if not finance_account.is_active:
        return "Finance account is inactive for this security deposit receipt."
    if not finance_account.chart_account_id or not finance_account.chart_account.is_active:
        return "Finance account is not mapped to an active chart account for this security deposit receipt."
    return None


def _lines(row: RentLeaseDepositTransaction, event_key: str):
    warnings: list[str] = []
    if event_key not in EVENT_KEYS:
        return [], ["Unsupported security deposit receipt event."], row.finance_account
    amount = base._money(row.amount)
    if amount <= Decimal("0.00"):
        warnings.append("Security deposit receipt amount must be greater than zero.")
    if row.plan_type not in {PlanType.RENT, PlanType.LEASE}:
        warnings.append("Security deposit receipt plan_type must be RENT or LEASE.")
    if not row.transaction_date:
        warnings.append("Security deposit receipt transaction_date is required.")
    if not row.customer_id or not row.subscription_id:
        warnings.append("Security deposit receipt requires customer and subscription evidence.")
    finance_account = row.finance_account
    finance_blocker = _finance_account_blocker(row, finance_account)
    if finance_blocker:
        warnings.append(finance_blocker)
    liability = _liability_account()
    if liability is None:
        warnings.append("SECURITY_DEPOSIT_LIABILITY posting profile/chart account is missing or inactive.")
    if warnings:
        return [], warnings, finance_account
    reference = _ref(row)
    return [
        {"chart_account": finance_account.chart_account, "description": f"Security deposit receipt {reference}", "debit_amount": amount, "credit_amount": Decimal("0.00")},
        {"chart_account": liability, "description": f"Security deposit liability {reference}", "debit_amount": Decimal("0.00"), "credit_amount": amount},
    ], warnings, finance_account


def _normalize_postability(row: RentLeaseDepositTransaction, postability: dict, finance_account) -> dict:
    if postability.get("status") in {"POSTED", "RECONCILED", "SKIPPED_NOT_APPLICABLE", "UNSUPPORTED_SOURCE"}:
        return postability
    reason = _finance_account_blocker(row, finance_account)
    if reason is None:
        return postability
    return {
        **postability,
        "status": "BLOCKED_BY_FINANCE_ACCOUNT",
        "canonical_status": "BLOCKED_BY_FINANCE_ACCOUNT",
        "can_post": False,
        "can_preview": False,
        "blocker_code": "FINANCE_ACCOUNT_NOT_READY",
        "blocker_reason": reason,
        "recommended_action": "Open Finance Accounts and activate/map the concrete deposit receipt finance account before posting.",
        "setup_href": "/admin/settings/business-setup/finance-accounts",
    }


def _source_snapshot(row: RentLeaseDepositTransaction):
    return {
        "transaction_number": row.transaction_number,
        "external_reference_no": row.external_reference_no,
        "subscription_id": row.subscription_id,
        "demand_id": row.demand_id,
        "inspection_id": row.inspection_id,
        "customer_id": row.customer_id,
        "plan_type": row.plan_type,
        "transaction_type": row.transaction_type,
        "amount": row.amount,
        "transaction_date": row.transaction_date,
        "payment_method": row.payment_method,
        "finance_account_id": row.finance_account_id,
        "status": row.status,
        "idempotency_key": row.idempotency_key,
        "reason": row.reason,
        "voided_at": row.voided_at,
        "void_reason": row.void_reason,
        "reversal_reference": row.reversal_reference,
        "metadata": row.metadata,
    }


def _linked_snapshot(row: RentLeaseDepositTransaction):
    payload = {
        "subscription_status": row.subscription.status,
        "subscription_total": row.subscription.total_amount,
        "customer_name": row.customer.name if row.customer_id else None,
        "finance_account_active": row.finance_account.is_active if row.finance_account_id else None,
        "finance_account_chart": row.finance_account.chart_account_id if row.finance_account_id else None,
    }
    if row.demand_id:
        payload.update(
            {
                "demand_status": row.demand.status,
                "demand_collected": row.demand.collected_amount,
                "demand_held": row.demand.held_amount,
                "demand_refundable": row.demand.refundable_amount,
            }
        )
    return payload


def _qs():
    return RentLeaseDepositTransaction.objects.select_related(
        "subscription",
        "subscription__customer",
        "customer",
        "demand",
        "finance_account",
        "finance_account__chart_account",
    )


def candidate_for(row: RentLeaseDepositTransaction) -> dict:
    event_key, event_label, reason, approval_required = _classify(row)
    purpose = PURPOSE_BY_EVENT.get(event_key, event_key.upper())
    bridge = AccountingBridgePosting.objects.filter(source_model=SOURCE_MODEL, source_id=str(row.id), purpose=purpose).select_related("journal_entry", "journal_entry__accounting_period", "journal_entry__financial_year").first()
    journal = bridge.journal_entry if bridge else None
    item = base._latest_posting_reconciliation_item(source_model=SOURCE_MODEL, source_id=str(row.id)) if journal else base._latest_reconciliation_item(source_model=SOURCE_MODEL, source_id=str(row.id))
    period = getattr(journal, "accounting_period", None) or base._source_period(row.transaction_date)
    lines, warnings, finance_account = _lines(row, event_key) if event_key in EVENT_KEYS else ([], [reason] if reason else [], row.finance_account)
    raw = "SKIPPED_NOT_APPLICABLE" if event_key == SKIPPED_EVENT_KEY or event_key == DEFERRED_REFUND_EVENT_KEY else "UNSUPPORTED_SOURCE" if event_key == UNSUPPORTED_EVENT_KEY else "READY" if lines else "NOT_CONFIGURED"
    source_workflow_exists = event_key in EVENT_KEYS or event_key in {SKIPPED_EVENT_KEY, DEFERRED_REFUND_EVENT_KEY, UNSUPPORTED_EVENT_KEY}
    postability = base._candidate_status_payload(event_key=event_key, event_label=event_label, module="subscriptions", source_model=SOURCE_MODEL, raw_status=raw, lines=lines, line_warnings=warnings, period=period, source_date=row.transaction_date, journal=journal, reconciliation_item=item, source_workflow_exists=source_workflow_exists, classification_reason=reason, approval_required=approval_required)
    postability = _normalize_postability(row, postability, finance_account)
    reference = _ref(row)
    source_date_key = row.transaction_date.isoformat() if row.transaction_date else "NO_SAFE_DATE"
    payload = base._candidate_payload(
        candidate_id=base._candidate_id(source_model=SOURCE_MODEL, source_pk=row.id, event_key=event_key),
        event_key=event_key,
        event_label=event_label,
        module="subscriptions",
        source_model=SOURCE_MODEL,
        source_pk=row.id,
        source_display=f"Security deposit {reference}",
        source_reference=reference,
        source_date=row.transaction_date,
        amount=row.amount,
        lines=lines,
        finance_account=finance_account,
        period=period,
        postability=postability,
        journal=journal,
        reconciliation_item=item,
        idempotency_key=f"bridge:{purpose}:RentLeaseDepositTransaction:{row.id}:{source_date_key}:{base._money(row.amount):.2f}",
        source_status=row.status,
        source_type="SECURITY_DEPOSIT",
    )
    subscription = row.subscription
    demand_reference = getattr(row.demand, "reference_key", None) if row.demand_id else None
    payload.update(
        {
            "deposit_transaction_id": row.id,
            "deposit_transaction_number": row.transaction_number,
            "deposit_reference": reference,
            "external_reference_no": row.external_reference_no,
            "transaction_type": row.transaction_type,
            "transaction_status": row.status,
            "transaction_date": row.transaction_date.isoformat() if row.transaction_date else None,
            "payment_method": row.payment_method,
            "plan_type": row.plan_type,
            "customer_id": row.customer_id,
            "customer_name": getattr(row.customer, "name", None),
            "subscription_id": row.subscription_id,
            "contract_reference": getattr(subscription, "subscription_number", None),
            "rent_lease_demand_id": row.demand_id,
            "rent_lease_reference": demand_reference,
            "demand_reference": demand_reference,
            "finance_account_id": row.finance_account_id,
        }
    )
    return payload


def list_bridge_candidates(filters: BridgeCandidateFilters | None = None) -> list[dict]:
    active_filters = filters or BridgeCandidateFilters()
    requested_model = (active_filters.source_model or "").strip()
    rows: list[dict] = []
    if requested_model != SOURCE_MODEL:
        rows.extend(previous.list_bridge_candidates(active_filters))
    if requested_model in {"", SOURCE_MODEL} and (not active_filters.module or active_filters.module == "subscriptions"):
        qs = base._date_filter_qs(_qs(), active_filters, date_field="transaction_date")
        rows.extend(candidate_for(item) for item in qs.order_by("-transaction_date", "-id")[:500])
    if active_filters.event_key:
        rows = [row for row in rows if row["event_key"] == active_filters.event_key]
    if active_filters.status:
        rows = [row for row in rows if row["status"] == active_filters.status or row.get("reconciliation_state") == active_filters.status]
    rows.sort(key=lambda row: (row.get("source_date") or "", str(row.get("source_id") or "")), reverse=True)
    return rows


def get_bridge_candidate(candidate_id: str, *, for_update: bool = False) -> dict:
    source_kind, source_pk, event_key = base._parse_candidate_id(candidate_id)
    if source_kind != "rentleasedeposittransaction":
        return previous.get_bridge_candidate(candidate_id, for_update=for_update)
    qs = _qs().select_for_update() if for_update else _qs()
    candidate = candidate_for(qs.get(pk=source_pk))
    if candidate["event_key"] != event_key:
        raise ValueError("RentLeaseDepositTransaction candidate event no longer matches current source state.")
    return candidate


def _lines_for_candidate(candidate: dict):
    if candidate.get("source_model") != SOURCE_MODEL:
        return previous._lines_for_candidate(candidate)
    row = _qs().get(pk=candidate["source_id"])
    return _lines(row, candidate["event_key"])


def preview_bridge_candidate(candidate_id: str) -> dict:
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
        "deposit_transaction_number": candidate.get("deposit_transaction_number"),
        "external_reference_no": candidate.get("external_reference_no"),
        "customer_name": candidate.get("customer_name"),
        "plan_type": candidate.get("plan_type"),
        "subscription_id": candidate.get("subscription_id"),
        "contract_reference": candidate.get("contract_reference"),
        "transaction_type": candidate.get("transaction_type"),
        "transaction_status": candidate.get("transaction_status"),
        "payment_method": candidate.get("payment_method"),
        "finance_account_name": candidate.get("finance_account_name"),
    }
    return {
        "candidate": candidate,
        "candidate_id": candidate_id,
        "source": source,
        "deposit_identity": source,
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
def post_bridge_candidate(*, candidate_id: str, idempotency_key: str, confirmed: bool, posting_note: str = "", actor) -> dict:
    candidate = get_bridge_candidate(candidate_id, for_update=True)
    if candidate.get("source_model") != SOURCE_MODEL:
        return previous.post_bridge_candidate(candidate_id=candidate_id, idempotency_key=idempotency_key, confirmed=confirmed, posting_note=posting_note, actor=actor)
    if not confirmed:
        raise ValueError("Explicit confirmation is required before posting.")
    key = (idempotency_key or "").strip()
    if not key:
        raise ValueError("idempotency_key is required.")
    if candidate["event_key"] not in EVENT_KEYS:
        raise ValueError("Unsupported bridge candidate source.")
    purpose = PURPOSE_BY_EVENT[candidate["event_key"]]
    existing = AccountingBridgePosting.objects.select_for_update().filter(source_model=SOURCE_MODEL, source_id=candidate["source_id"], purpose=purpose).select_related("journal_entry").first()
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
        purpose=purpose,
        entry_date=row.transaction_date,
        memo=f"Bridge posting RentLeaseDepositTransaction {row.id} {candidate['event_key']}",
        lines=lines,
        voucher_type=purpose,
        source_type="SECURITY_DEPOSIT",
        source_reference=_ref(row),
        source_document_no=_ref(row),
        source_event_date=row.transaction_date,
        trace_metadata={
            "event_key": candidate["event_key"],
            "idempotency_key": key,
            "posting_note": posting_note,
            "source_model": SOURCE_MODEL,
            "source_id": candidate["source_id"],
            "rent_lease_deposit_transaction_id": row.id,
            "deposit_transaction_number": row.transaction_number,
            "external_reference_no": row.external_reference_no,
            "demand_id": row.demand_id,
            "subscription_id": row.subscription_id,
            "customer_id": row.customer_id,
            "plan_type": row.plan_type,
            "transaction_type": row.transaction_type,
            "payment_method": row.payment_method,
            "finance_account_id": getattr(finance_account, "id", None),
            "amount": candidate["amount"],
            "source_mutation": False,
            "deposit_mutation": False,
            "contract_mutation": False,
            "customer_mutation": False,
            "collection_mutation": False,
            "demand_mutation": False,
            "finance_account_mutation": False,
            "deposit_refund_posting": False,
        },
        posted_by=actor,
    )
    row.refresh_from_db()
    row.subscription.refresh_from_db()
    if row.customer_id:
        row.customer.refresh_from_db()
    if row.demand_id:
        row.demand.refresh_from_db()
    if row.finance_account_id:
        row.finance_account.refresh_from_db()
    if _source_snapshot(row) != source_before or _linked_snapshot(row) != linked_before:
        raise ValueError("Security deposit source mutation detected; bridge posting rolled back.")
    item = base._latest_posting_reconciliation_item(source_model=SOURCE_MODEL, source_id=candidate["source_id"])
    if created and not (item and item.exception_code == "POSTED_UNVERIFIED"):
        item = base._create_pending_reconciliation_item(journal=journal, source_model=SOURCE_MODEL, source_id=candidate["source_id"], source_label=_ref(row), amount=base._money(candidate["amount"]), candidate_id=candidate_id, actor=actor, note=posting_note)
    base._log_candidate_post(journal=journal, actor=actor, candidate_id=candidate_id, source_model=SOURCE_MODEL, source_id=int(candidate["source_id"]), event_key=candidate["event_key"], amount=base._money(candidate["amount"]), candidate_key=key, reconciliation_item=item)
    return {"posted": created, "already_posted": not created, "journal_entry": base._journal_payload(journal), "reconciliation_item": base._reconciliation_payload(item), "next_action": "Run reconciliation checks and verify the pending bridge item."}


def _is_own(candidate_id: str) -> bool:
    try:
        source_kind, _source_pk, _event_key = base._parse_candidate_id(candidate_id)
    except ValueError:
        return False
    return source_kind == "rentleasedeposittransaction"


def batch_preview_bridge_candidates(candidate_ids: list[str]) -> dict:
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
def batch_post_bridge_candidates(*, candidate_ids: list[str], idempotency_keys: dict[str, str], confirmed: bool, posting_note: str = "", actor) -> dict:
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


def summarize_candidate_statuses(rows: list[dict]) -> dict[str, int]:
    summary = previous.summarize_candidate_statuses(rows)
    counts = Counter(row.get("status") or "INFO" for row in rows if row.get("source_model") == SOURCE_MODEL)
    posted_unverified = sum(1 for row in rows if row.get("source_model") == SOURCE_MODEL and row.get("reconciliation_state") == "POSTED_UNVERIFIED")
    summary.update(
        {
            "security_deposit_receipt_ready_unposted_count": counts.get("READY_UNPOSTED", 0),
            "security_deposit_receipt_posted_count": counts.get("POSTED", 0),
            "security_deposit_receipt_posted_unverified_count": posted_unverified,
            "security_deposit_receipt_reconciled_count": counts.get("RECONCILED", 0),
            "security_deposit_receipt_blocked_count": sum(v for k, v in counts.items() if str(k).startswith("BLOCKED")),
            "security_deposit_receipt_unsupported_count": counts.get("UNSUPPORTED_SOURCE", 0) + counts.get("SKIPPED_NOT_APPLICABLE", 0),
        }
    )
    return summary
