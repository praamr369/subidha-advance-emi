from __future__ import annotations

from datetime import date
from typing import Any, Callable

from django.db import transaction
from django.db.models import Model

from accounting.models import AccountingBridgePosting
from accounting.services import accounting_bridge_candidate_service as base
from accounting.services import accounting_bridge_customer_advance_refund_service as extended
from accounting.services import accounting_bridge_staff_advance_service as staff_advance_bridge
from billing.models import BillingCreditNote, BillingDebitNote, BillingInvoice, DirectSaleReturn, ReceiptDocument
from subscriptions.models import Commission, CommissionPayoutBatch, CommissionPayoutLine, Payment, RentLeaseBillingDemand

CandidateFactory = Callable[[Model], dict[str, Any]]

BASE_SOURCE_FACTORIES: dict[str, tuple[type[Model], CandidateFactory]] = {
    "commissionpayoutbatch": (CommissionPayoutBatch, base.commission_payout_candidate),
    "commission": (Commission, base.commission_candidate),
    "payment": (Payment, base.payment_candidate),
    "receiptdocument": (ReceiptDocument, base.receipt_candidate),
    "billinginvoice": (BillingInvoice, base.billing_invoice_candidate),
    "rentleasebillingdemand": (RentLeaseBillingDemand, base.rent_lease_revenue_candidate),
    "billingcreditnote": (BillingCreditNote, base.billing_credit_note_candidate),
    "billingdebitnote": (BillingDebitNote, base.billing_debit_note_candidate),
    "directsalereturn": (DirectSaleReturn, base.direct_sale_return_candidate),
}

SUPPORTED_EVENTS = {
    base.COMMISSION_PAYOUT_SOURCE_MODEL: base.COMMISSION_PAYOUT_EVENT_KEYS,
    base.COMMISSION_SOURCE_MODEL: base.COMMISSION_EVENT_KEYS,
    "Payment": {base.PAYMENT_COLLECTION_EVENT_KEY},
    base.RECEIPT_SOURCE_MODEL: base.RECEIPT_EVENT_KEYS,
    base.BILLING_INVOICE_SOURCE_MODEL: base.BILLING_INVOICE_EVENT_KEYS,
    base.RENT_LEASE_DEMAND_SOURCE_MODEL: base.RENT_LEASE_REVENUE_EVENT_KEYS,
    base.CREDIT_NOTE_SOURCE_MODEL: {"credit_note_issue", "sales_return", "customer_credit_adjustment"},
    base.DIRECT_SALE_RETURN_SOURCE_MODEL: {"direct_sale_return"},
    base.DEBIT_NOTE_SOURCE_MODEL: base.DEBIT_NOTE_EVENT_KEYS,
}


def _source_kind(candidate_id: str) -> str:
    source_kind, _source_pk, _event_key = base._parse_candidate_id(candidate_id)
    return source_kind


def _is_staff_advance(candidate_id: str) -> bool:
    return staff_advance_bridge.is_staff_advance_candidate(candidate_id)


def _locked_base_candidate(candidate_id: str) -> tuple[dict[str, Any], Model]:
    source_kind, source_pk, event_key = base._parse_candidate_id(candidate_id)
    source = BASE_SOURCE_FACTORIES.get(source_kind)
    if source is None:
        raise ValueError("Bridge candidate is not a base accounting bridge source.")
    model, factory = source
    row = model.objects.select_for_update().get(pk=source_pk)
    candidate = factory(row)
    if candidate["event_key"] != event_key:
        raise ValueError("Bridge candidate event no longer matches current source state.")
    return candidate, row


def preview_bridge_candidate(candidate_id: str) -> dict[str, Any]:
    if _is_staff_advance(candidate_id):
        return staff_advance_bridge.preview_bridge_candidate(candidate_id)
    return extended.preview_bridge_candidate(candidate_id)


def batch_preview_bridge_candidates(candidate_ids: list[str]) -> dict[str, Any]:
    previews = []
    blockers: dict[str, list[str]] = {}
    total_debit = base._money("0.00")
    total_credit = base._money("0.00")
    for candidate_id in candidate_ids:
        try:
            preview = preview_bridge_candidate(candidate_id)
            previews.append(preview)
            total_debit += base._money(preview["total_debit"])
            total_credit += base._money(preview["total_credit"])
            if not preview.get("can_post"):
                blockers[candidate_id] = preview.get("blockers") or ["Candidate is not postable."]
        except Exception as exc:
            blockers[candidate_id] = [str(exc)]
    return {
        "selected_count": len(candidate_ids),
        "postable_count": sum(1 for item in previews if item.get("can_post")),
        "blocked_count": len(blockers),
        "total_debit": f"{total_debit:.2f}",
        "total_credit": f"{total_credit:.2f}",
        "is_balanced": total_debit == total_credit,
        "previews": previews,
        "blockers": blockers,
    }


@transaction.atomic
def _post_base_candidate(*, candidate_id: str, idempotency_key: str, confirmed: bool, posting_note: str, actor) -> dict[str, Any]:
    if not confirmed:
        raise ValueError("Explicit confirmation is required before posting.")
    candidate_key = (idempotency_key or "").strip()
    if not candidate_key:
        raise ValueError("idempotency_key is required.")

    candidate, source_instance = _locked_base_candidate(candidate_id)
    if candidate["event_key"] not in SUPPORTED_EVENTS.get(candidate["source_model"], set()):
        raise ValueError("Unsupported bridge candidate source.")

    purpose = base._purpose_for_event(candidate["source_model"], candidate["event_key"])
    existing = (
        AccountingBridgePosting.objects.select_for_update()
        .filter(source_model=candidate["source_model"], source_id=candidate["source_id"], purpose=purpose)
        .select_related("journal_entry")
        .first()
    )
    if existing is not None:
        existing_key = ((existing.trace_metadata or {}).get("idempotency_key") or "").strip()
        if existing_key and existing_key == candidate_key:
            return {
                "posted": False,
                "already_posted": True,
                "journal_entry": base._journal_payload(existing.journal_entry),
                "reconciliation_item": base._reconciliation_payload(
                    base._latest_posting_reconciliation_item(
                        source_model=candidate["source_model"], source_id=candidate["source_id"]
                    )
                ),
                "next_action": "Run reconciliation checks and verify the pending bridge item.",
            }
        raise ValueError("This source item has already been posted with a different or legacy idempotency key.")

    if candidate["idempotency_key"] != candidate_key:
        raise ValueError("idempotency_key does not match the current source candidate.")

    preview = base.preview_bridge_candidate(candidate_id)
    if not preview["can_post"]:
        raise ValueError("; ".join(preview["blockers"]) or "Candidate is not postable.")

    lines, _warnings, finance_account = base._lines_for_candidate(candidate)
    total_debit, total_credit = base._line_totals(lines)
    if not lines or total_debit != total_credit:
        raise ValueError("Bridge posting preview is not balanced.")

    commission_before = (
        base._commission_snapshot(source_instance)
        if candidate["source_model"] == base.COMMISSION_SOURCE_MODEL
        else None
    )
    payout_line_count_before = (
        CommissionPayoutLine.objects.filter(commission_id=source_instance.id).count()
        if candidate["source_model"] == base.COMMISSION_SOURCE_MODEL
        else 0
    )
    payout_before = (
        base._commission_payout_snapshot(source_instance)
        if candidate["source_model"] == base.COMMISSION_PAYOUT_SOURCE_MODEL
        else None
    )
    payout_lines_before = (
        base._commission_payout_lines_snapshot(source_instance)
        if candidate["source_model"] == base.COMMISSION_PAYOUT_SOURCE_MODEL
        else None
    )
    payout_commissions_before = {}
    if candidate["source_model"] == base.COMMISSION_PAYOUT_SOURCE_MODEL:
        commission_ids = [commission_id for _line_id, commission_id, _partner_id, _amount in payout_lines_before or []]
        payout_commissions_before = {
            row.id: base._commission_snapshot(row)
            for row in Commission.objects.select_for_update().filter(id__in=commission_ids).order_by("id")
        }
    rent_lease_before = (
        base._rent_lease_demand_snapshot(source_instance)
        if candidate["source_model"] == base.RENT_LEASE_DEMAND_SOURCE_MODEL
        else None
    )

    entry_date = date.fromisoformat(candidate["source_date"])
    journal, created = base.post_bridge_entry(
        source_instance=source_instance,
        purpose=purpose,
        entry_date=entry_date,
        memo=f"Bridge posting {candidate['source_model']} {candidate['source_id']} {candidate['event_key']}",
        lines=lines,
        voucher_type=purpose,
        source_type=candidate.get("source_type") or candidate["source_model"].upper(),
        source_reference=candidate["source_reference"],
        source_document_no=candidate["source_reference"],
        source_event_date=entry_date,
        trace_metadata={
            "event_key": candidate["event_key"],
            "idempotency_key": candidate_key,
            "posting_note": posting_note,
            "source_model": candidate["source_model"],
            "source_id": candidate["source_id"],
            "finance_account_id": getattr(finance_account, "id", None),
            "amount": candidate["amount"],
            "taxable_amount": candidate.get("taxable_amount"),
            "tax_amount": candidate.get("tax_amount"),
            "commission_mutation": False if candidate["source_model"] in {base.COMMISSION_SOURCE_MODEL, base.COMMISSION_PAYOUT_SOURCE_MODEL} else None,
            "commission_payout_mutation": False if candidate["source_model"] in {base.COMMISSION_SOURCE_MODEL, base.COMMISSION_PAYOUT_SOURCE_MODEL} else None,
            "rent_lease_demand_mutation": False if candidate["source_model"] == base.RENT_LEASE_DEMAND_SOURCE_MODEL else None,
            "contract_mutation": False if candidate["source_model"] == base.RENT_LEASE_DEMAND_SOURCE_MODEL else None,
            "payment_receipt_deposit_mutation": False if candidate["source_model"] == base.RENT_LEASE_DEMAND_SOURCE_MODEL else None,
            "rent_lease_revenue_posting": candidate["source_model"] == base.RENT_LEASE_DEMAND_SOURCE_MODEL,
            "plan_type": candidate.get("plan_type"),
            "billing_period": candidate.get("billing_period"),
            "payout_batch_id": candidate.get("payout_batch_id"),
            "payout_batch_code": candidate.get("payout_batch_code"),
            "related_commission_count": candidate.get("related_commission_count"),
        },
        posted_by=actor,
    )

    item = base._latest_posting_reconciliation_item(source_model=candidate["source_model"], source_id=candidate["source_id"])
    if created and not (item and item.exception_code == "POSTED_UNVERIFIED"):
        item = base._create_pending_reconciliation_item(
            journal=journal,
            source_model=candidate["source_model"],
            source_id=candidate["source_id"],
            source_label=candidate["source_reference"],
            amount=base._money(candidate["amount"]),
            candidate_id=candidate_id,
            actor=actor,
            note=posting_note,
        )

    if candidate["source_model"] == base.COMMISSION_SOURCE_MODEL:
        source_instance.refresh_from_db()
        if base._commission_snapshot(source_instance) != commission_before:
            raise ValueError("Commission source mutation detected; bridge posting rolled back.")
        payout_line_count_after = CommissionPayoutLine.objects.filter(commission_id=source_instance.id).count()
        if payout_line_count_after != payout_line_count_before:
            raise ValueError("Commission payout mutation detected; bridge posting rolled back.")
    if candidate["source_model"] == base.COMMISSION_PAYOUT_SOURCE_MODEL:
        source_instance.refresh_from_db()
        if base._commission_payout_snapshot(source_instance) != payout_before:
            raise ValueError("Commission payout source mutation detected; bridge posting rolled back.")
        if base._commission_payout_lines_snapshot(source_instance) != payout_lines_before:
            raise ValueError("Commission payout line mutation detected; bridge posting rolled back.")
        for row in Commission.objects.filter(id__in=payout_commissions_before.keys()).order_by("id"):
            if base._commission_snapshot(row) != payout_commissions_before[row.id]:
                raise ValueError("Commission source mutation detected; bridge posting rolled back.")
    if candidate["source_model"] == base.RENT_LEASE_DEMAND_SOURCE_MODEL:
        source_instance.refresh_from_db()
        if base._rent_lease_demand_snapshot(source_instance) != rent_lease_before:
            raise ValueError("Rent/lease demand source mutation detected; bridge posting rolled back.")

    base._log_candidate_post(
        journal=journal,
        actor=actor,
        candidate_id=candidate_id,
        source_model=candidate["source_model"],
        source_id=int(candidate["source_id"]),
        event_key=candidate["event_key"],
        amount=base._money(candidate["amount"]),
        candidate_key=candidate_key,
        reconciliation_item=item,
    )
    return {
        "posted": created,
        "already_posted": not created,
        "journal_entry": base._journal_payload(journal),
        "reconciliation_item": base._reconciliation_payload(item),
        "next_action": "Run reconciliation checks and verify the pending bridge item.",
    }


def post_bridge_candidate(*, candidate_id: str, idempotency_key: str, confirmed: bool, posting_note: str = "", actor) -> dict[str, Any]:
    if _is_staff_advance(candidate_id):
        return staff_advance_bridge.post_bridge_candidate(
            candidate_id=candidate_id,
            idempotency_key=idempotency_key,
            confirmed=confirmed,
            posting_note=posting_note,
            actor=actor,
        )
    if _source_kind(candidate_id) in BASE_SOURCE_FACTORIES:
        return _post_base_candidate(
            candidate_id=candidate_id,
            idempotency_key=idempotency_key,
            confirmed=confirmed,
            posting_note=posting_note,
            actor=actor,
        )
    return extended.post_bridge_candidate(
        candidate_id=candidate_id,
        idempotency_key=idempotency_key,
        confirmed=confirmed,
        posting_note=posting_note,
        actor=actor,
    )


def batch_post_bridge_candidates(*, candidate_ids: list[str], idempotency_keys: dict[str, str], confirmed: bool, posting_note: str = "", actor) -> dict[str, Any]:
    posted = []
    already_posted = []
    errors: dict[str, list[str]] = {}
    for candidate_id in candidate_ids:
        try:
            result = post_bridge_candidate(
                candidate_id=candidate_id,
                idempotency_key=idempotency_keys.get(candidate_id, ""),
                confirmed=confirmed,
                posting_note=posting_note,
                actor=actor,
            )
            payload = {"candidate_id": candidate_id, **result}
            if result.get("already_posted"):
                already_posted.append(payload)
            else:
                posted.append(payload)
        except Exception as exc:
            errors[candidate_id] = [str(exc)]
    return {
        "selected_count": len(candidate_ids),
        "posted_count": len(posted),
        "already_posted_count": len(already_posted),
        "skipped_already_posted_count": len(already_posted),
        "blocked_count": len(errors),
        "created_journal_ids": [item["journal_entry"]["id"] for item in posted if item.get("journal_entry")],
        "reconciliation_pending_count": sum(1 for item in posted if item.get("reconciliation_item")),
        "posted": posted,
        "already_posted": already_posted,
        "errors": errors,
    }


verify_bridge_reconciliation_item = extended.verify_bridge_reconciliation_item
