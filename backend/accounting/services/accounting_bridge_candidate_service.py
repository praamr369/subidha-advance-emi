from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Any

from django.db import transaction
from django.db.models import Max, Q
from django.utils import timezone

from accounting.models import (
    AccountingBridgePosting,
    AccountingPeriod,
    AccountingPeriodStatus,
    ChartOfAccount,
    FinanceAccount,
    JournalEntry,
    JournalEntryLine,
    JournalEntryStatus,
)
from accounting.services.accounting_bridge_readiness_service import (
    build_accounting_bridge_posting_period_readiness,
)
from accounting.services.accounting_postability_service import evaluate_accounting_postability
from accounting.services.bridge_posting_service import post_bridge_entry
from accounting.services.bridge_run_service import _resolve_collection_finance_account
from accounting.services.document_sequence_service import (
    DocumentNumberingSetupError,
    DocumentType,
    preview_document_number,
    validate_document_numbering_ready,
)
from accounting.services.journal_posting_service import _log_accounting_event
from accounting.services.period_service import resolve_accounting_period
from reconciliation.models import (
    ReconciliationEvidence,
    ReconciliationItem,
    ReconciliationItemStatus,
    ReconciliationRun,
    ReconciliationRunStatus,
    ReconciliationSeverity,
)
from subscriptions.models import Payment


PAYMENT_COLLECTION_EVENT_KEY = "subscription_emi_payment"
PAYMENT_COLLECTION_PURPOSE = "PAYMENT_COLLECTION"
SAFETY_TEXT = "Preview is read-only. Posting creates accounting entries only after explicit admin confirmation."


@dataclass(frozen=True)
class BridgeCandidateFilters:
    date_from: date | None = None
    date_to: date | None = None
    financial_year: str | None = None
    accounting_period: str | None = None
    status: str | None = None
    source_model: str | None = None
    event_key: str | None = None
    module: str | None = None


def _money(value: Any) -> Decimal:
    return Decimal(str(value or "0.00")).quantize(Decimal("0.01"))


def _candidate_id(*, source_model: str, source_pk: int | str, event_key: str) -> str:
    return f"{source_model.lower()}:{source_pk}:{event_key}"


def _parse_candidate_id(candidate_id: str) -> tuple[str, str, str]:
    parts = (candidate_id or "").strip().split(":")
    if len(parts) != 3:
        raise ValueError("Invalid bridge candidate id.")
    return parts[0], parts[1], parts[2]


def _period_payload(period: AccountingPeriod | None) -> dict[str, Any] | None:
    if period is None:
        return None
    return {
        "id": period.id,
        "code": period.code,
        "name": period.name or period.label,
        "status": period.status,
        "financial_year": period.financial_year_id,
        "financial_year_code": getattr(period.financial_year, "code", None),
    }


def _account_payload(account: ChartOfAccount | None) -> dict[str, Any] | None:
    if account is None:
        return None
    return {"id": account.id, "code": account.code, "name": account.name}


def _finance_account_payload(account: FinanceAccount | None) -> dict[str, Any] | None:
    if account is None:
        return None
    return {
        "id": account.id,
        "name": account.name,
        "kind": account.kind,
        "chart_account": _account_payload(account.chart_account),
    }


def _journal_payload(journal: JournalEntry | None) -> dict[str, Any] | None:
    if journal is None:
        return None
    return {
        "id": journal.id,
        "entry_no": journal.entry_no,
        "entry_date": journal.entry_date.isoformat() if journal.entry_date else None,
        "status": journal.status,
        "source_model": journal.source_model,
        "source_id": journal.source_id,
        "voucher_type": journal.voucher_type,
        "accounting_period": journal.accounting_period_id,
        "accounting_period_code": getattr(journal.accounting_period, "code", None),
        "financial_year": journal.financial_year_id,
        "financial_year_code": getattr(journal.financial_year, "code", None),
    }


def _line_payload(*, account: ChartOfAccount, description: str, debit: Any = "0.00", credit: Any = "0.00") -> dict[str, Any]:
    debit_amount = _money(debit)
    credit_amount = _money(credit)
    return {
        "chart_account": _account_payload(account),
        "description": description,
        "debit_amount": f"{debit_amount:.2f}",
        "credit_amount": f"{credit_amount:.2f}",
    }


def _source_reference(payment: Payment) -> str:
    return payment.reference_no or f"PAY-{payment.id}"


def _customer_receivable_account() -> ChartOfAccount | None:
    return ChartOfAccount.objects.filter(system_code="CUSTOMER_RECEIVABLE", is_active=True).order_by("id").first()


def _resolve_payment_finance_account(payment: Payment) -> tuple[FinanceAccount | None, str | None, list[int]]:
    if payment.finance_account_id:
        account = payment.finance_account
        if not account.is_active:
            return None, "FINANCE_ACCOUNT_INACTIVE", [account.id]
        if not account.chart_account_id or not account.chart_account.is_active:
            return None, "FINANCE_ACCOUNT_COA_INACTIVE", [account.id]
        return account, None, [account.id]
    return _resolve_collection_finance_account(method=payment.method or "")


def _payment_lines(payment: Payment) -> tuple[list[dict[str, Any]], list[str], FinanceAccount | None]:
    warnings: list[str] = []
    finance_account, reason, candidate_ids = _resolve_payment_finance_account(payment)
    if reason:
        warnings.append(f"Finance account is not ready for {payment.method or 'CASH'} collection: {reason}.")
    clearing_account = _customer_receivable_account()
    if clearing_account is None:
        warnings.append("CUSTOMER_RECEIVABLE chart account is missing or inactive.")
    if finance_account is None or clearing_account is None:
        return [], warnings, finance_account
    return [
        {
            "chart_account": finance_account.chart_account,
            "description": f"{(payment.method or 'CASH').strip().upper()} collection",
            "debit_amount": payment.amount,
            "credit_amount": Decimal("0.00"),
        },
        {
            "chart_account": clearing_account,
            "description": "Customer receivable clearing",
            "debit_amount": Decimal("0.00"),
            "credit_amount": payment.amount,
        },
    ], warnings, finance_account


def _preview_lines(lines: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        _line_payload(
            account=line["chart_account"],
            description=line.get("description", ""),
            debit=line.get("debit_amount"),
            credit=line.get("credit_amount"),
        )
        for line in lines
    ]


def _line_totals(lines: list[dict[str, Any]]) -> tuple[Decimal, Decimal]:
    total_debit = sum((_money(line.get("debit_amount")) for line in lines), Decimal("0.00"))
    total_credit = sum((_money(line.get("credit_amount")) for line in lines), Decimal("0.00"))
    return total_debit, total_credit


def _source_period(source_date: date) -> AccountingPeriod | None:
    try:
        return resolve_accounting_period(source_date)
    except ValueError:
        return None


def _period_filter_qs(queryset, filters: BridgeCandidateFilters):
    if filters.date_from:
        queryset = queryset.filter(payment_date__gte=filters.date_from)
    if filters.date_to:
        queryset = queryset.filter(payment_date__lte=filters.date_to)
    if filters.accounting_period:
        period_lookup = Q(code__iexact=filters.accounting_period)
        if str(filters.accounting_period).isdigit():
            period_lookup |= Q(pk=int(filters.accounting_period))
        period = AccountingPeriod.objects.filter(period_lookup).first()
        if period is None:
            return queryset.none()
        queryset = queryset.filter(payment_date__gte=period.start_date, payment_date__lte=period.end_date)
    elif filters.financial_year:
        from accounting.models import FinancialYear

        year_lookup = Q(code__iexact=filters.financial_year)
        if str(filters.financial_year).isdigit():
            year_lookup |= Q(pk=int(filters.financial_year))
        year = FinancialYear.objects.filter(year_lookup).first()
        if year is None:
            return queryset.none()
        queryset = queryset.filter(payment_date__gte=year.start_date, payment_date__lte=year.end_date)
    return queryset


def _latest_reconciliation_item(*, source_model: str, source_id: str) -> ReconciliationItem | None:
    return ReconciliationItem.objects.filter(
        module="ACCOUNTING_BRIDGE_PHASE_F",
        source_type=source_model,
        source_id=source_id,
    ).order_by("-created_at", "-id").first()


def _existing_bridge(payment: Payment) -> AccountingBridgePosting | None:
    return (
        AccountingBridgePosting.objects.filter(
            source_model="Payment",
            source_id=str(payment.id),
            purpose=PAYMENT_COLLECTION_PURPOSE,
        )
        .select_related("journal_entry", "journal_entry__accounting_period", "journal_entry__financial_year")
        .first()
    )


def payment_candidate(payment: Payment) -> dict[str, Any]:
    bridge = _existing_bridge(payment)
    journal = bridge.journal_entry if bridge else None
    reconciliation_item = _latest_reconciliation_item(source_model="Payment", source_id=str(payment.id))
    period = getattr(journal, "accounting_period", None) or _source_period(payment.payment_date)
    period_readiness = build_accounting_bridge_posting_period_readiness(
        reference_date=payment.payment_date,
        financial_year=getattr(period, "financial_year", None),
        period=period,
    )
    lines, line_warnings, finance_account = _payment_lines(payment)
    bridge_row = {"event_key": PAYMENT_COLLECTION_EVENT_KEY, "status": "READY" if lines else "NOT_CONFIGURED", "label": "Subscription EMI payment"}
    postability = evaluate_accounting_postability(
        event_key=PAYMENT_COLLECTION_EVENT_KEY,
        event_label="Subscription EMI payment",
        module="subscriptions",
        source_model="Payment",
        bridge_row=bridge_row,
        period_readiness=period_readiness,
        source_workflow_exists=True,
        posted=bool(journal),
        reconciled=bool(reconciliation_item and reconciliation_item.status == ReconciliationItemStatus.MATCHED),
        as_source_row=not bool(journal),
    )
    if line_warnings and postability["status"] == "READY_UNPOSTED":
        postability = {
            **postability,
            "status": "BLOCKED_BY_MAPPING",
            "can_post": False,
            "can_preview": False,
            "blocker_code": "MAPPING_NOT_READY",
            "blocker_reason": line_warnings[0],
            "recommended_action": "Fix finance account and customer receivable mapping before posting.",
        }
    total_debit, total_credit = _line_totals(lines)
    candidate_id = _candidate_id(source_model="Payment", source_pk=payment.id, event_key=PAYMENT_COLLECTION_EVENT_KEY)
    return {
        "id": candidate_id,
        "bridge_candidate_id": candidate_id,
        "row_type": "bridge_candidate",
        "event_key": PAYMENT_COLLECTION_EVENT_KEY,
        "event_label": "Subscription EMI payment",
        "label": "Subscription EMI payment",
        "module": "subscriptions",
        "source_module": "subscriptions",
        "source_model": "Payment",
        "source_pk": payment.id,
        "source_id": str(payment.id),
        "source_type": "Payment",
        "source_display": f"Payment {_source_reference(payment)}",
        "source_reference_number": _source_reference(payment),
        "source_reference": _source_reference(payment),
        "source_date": payment.payment_date.isoformat(),
        "accounting_period_id": getattr(period, "id", None),
        "accounting_period_code": getattr(period, "code", None),
        "accounting_period": _period_payload(period),
        "financial_year": getattr(getattr(period, "financial_year", None), "code", None),
        "financial_year_id": getattr(period, "financial_year_id", None),
        "amount": f"{_money(payment.amount):.2f}",
        "debit_account_preview": [_line_payload(account=line["chart_account"], description=line.get("description", ""), debit=line.get("debit_amount")) for line in lines if _money(line.get("debit_amount")) > 0],
        "credit_account_preview": [_line_payload(account=line["chart_account"], description=line.get("description", ""), credit=line.get("credit_amount")) for line in lines if _money(line.get("credit_amount")) > 0],
        "finance_account": _finance_account_payload(finance_account),
        "canonical_status": postability["status"],
        "status": postability["status"],
        "can_preview": postability["can_preview"],
        "can_post": postability["can_post"],
        "can_reconcile": postability["can_reconcile"],
        "blocker_code": postability["blocker_code"],
        "blocker_reason": postability["blocker_reason"],
        "approval_required": False,
        "unsupported_source": False,
        "existing_journal_entry_id": getattr(journal, "id", None),
        "existing_money_movement_id": None,
        "existing_reconciliation_item_id": getattr(reconciliation_item, "id", None),
        "journal_entry": _journal_payload(journal),
        "settlement_linked": False,
        "reconciliation_linked": reconciliation_item is not None,
        "reconciliation_items": [
            {
                "id": reconciliation_item.id,
                "status": reconciliation_item.status,
                "severity": reconciliation_item.severity,
                "exception_code": reconciliation_item.exception_code,
                "exception_message": reconciliation_item.exception_message,
            }
        ]
        if reconciliation_item
        else [],
        "idempotency_key": f"bridge:{PAYMENT_COLLECTION_PURPOSE}:Payment:{payment.id}:{payment.payment_date.isoformat()}:{_money(payment.amount):.2f}",
        "total_debit": f"{total_debit:.2f}",
        "total_credit": f"{total_credit:.2f}",
        "is_balanced": bool(lines and total_debit == total_credit),
        "exception_reasons": [postability["blocker_reason"]] if postability.get("blocker_code") else [],
        "operator_action": postability["recommended_action"],
        "recommended_action": postability["recommended_action"],
        "action_href": "/admin/accounting/bridge-reconciliation",
        "setup_href": postability["setup_href"],
        "preview_action_href": "/admin/accounting/bridge-reconciliation",
        "post_action_href": "/admin/accounting/bridge-reconciliation" if postability["can_post"] else None,
        "source_action_href": None,
        "is_postable": postability["can_post"],
        "is_acknowledgeable": False,
    }


def list_bridge_candidates(filters: BridgeCandidateFilters | None = None) -> list[dict[str, Any]]:
    active_filters = filters or BridgeCandidateFilters()
    if active_filters.source_model and active_filters.source_model != "Payment":
        return []
    if active_filters.event_key and active_filters.event_key != PAYMENT_COLLECTION_EVENT_KEY:
        return []
    if active_filters.module and active_filters.module != "subscriptions":
        return []
    queryset = Payment.objects.select_related("finance_account", "finance_account__chart_account", "customer", "subscription").all()
    queryset = _period_filter_qs(queryset, active_filters)
    rows = [payment_candidate(payment) for payment in queryset.order_by("-payment_date", "-id")[:500]]
    if active_filters.status:
        rows = [row for row in rows if row["status"] == active_filters.status]
    return rows


def get_bridge_candidate(candidate_id: str, *, for_update: bool = False) -> dict[str, Any]:
    source_kind, source_pk, event_key = _parse_candidate_id(candidate_id)
    if source_kind != "payment" or event_key != PAYMENT_COLLECTION_EVENT_KEY:
        raise ValueError("Unsupported bridge candidate source.")
    queryset = Payment.objects.select_related("finance_account", "finance_account__chart_account", "customer", "subscription")
    if for_update:
        queryset = queryset.select_for_update()
    payment = queryset.get(pk=source_pk)
    return payment_candidate(payment)


def preview_bridge_candidate(candidate_id: str) -> dict[str, Any]:
    source_kind, source_pk, event_key = _parse_candidate_id(candidate_id)
    if source_kind != "payment" or event_key != PAYMENT_COLLECTION_EVENT_KEY:
        raise ValueError("Unsupported bridge candidate source.")
    payment = Payment.objects.select_related("finance_account", "finance_account__chart_account", "customer", "subscription").get(pk=source_pk)
    candidate = payment_candidate(payment)
    lines, warnings, _finance_account = _payment_lines(payment)
    blockers = []
    if not candidate["can_post"]:
        blockers.append(candidate["blocker_reason"] or "Candidate is not postable.")
    try:
        sequence = validate_document_numbering_ready(DocumentType.JOURNAL_ENTRY, payment.payment_date)
        journal_number_preview = preview_document_number(sequence=sequence)
    except DocumentNumberingSetupError as exc:
        journal_number_preview = None
        blockers.append(str(exc))
    total_debit, total_credit = _line_totals(lines)
    return {
        "candidate": candidate,
        "candidate_id": candidate_id,
        "source": {
            "model": "Payment",
            "pk": payment.id,
            "display": candidate["source_display"],
            "reference_number": candidate["source_reference_number"],
            "date": candidate["source_date"],
            "amount": candidate["amount"],
        },
        "journal_date": payment.payment_date.isoformat(),
        "accounting_period": candidate["accounting_period"],
        "journal_number_preview": journal_number_preview,
        "debit_lines": [_line_payload(account=line["chart_account"], description=line.get("description", ""), debit=line.get("debit_amount")) for line in lines if _money(line.get("debit_amount")) > 0],
        "credit_lines": [_line_payload(account=line["chart_account"], description=line.get("description", ""), credit=line.get("credit_amount")) for line in lines if _money(line.get("credit_amount")) > 0],
        "lines": _preview_lines(lines),
        "total_debit": f"{total_debit:.2f}",
        "total_credit": f"{total_credit:.2f}",
        "is_balanced": bool(lines and total_debit == total_credit),
        "tax_lines": [],
        "finance_account_line": candidate["finance_account"],
        "warnings": warnings,
        "blockers": list(dict.fromkeys(blockers)),
        "can_post": bool(candidate["can_post"] and lines and total_debit == total_credit and not blockers),
        "idempotency_key": candidate["idempotency_key"],
        "safety_text": SAFETY_TEXT,
    }


def _next_run_no() -> int:
    return (ReconciliationRun.objects.aggregate(mx=Max("run_no"))["mx"] or 0) + 1


def _create_pending_reconciliation_item(*, journal: JournalEntry, payment: Payment, actor, note: str = "") -> ReconciliationItem:
    run = ReconciliationRun.objects.create(
        run_no=_next_run_no(),
        scope="BRIDGE_POSTING",
        module="ACCOUNTING_BRIDGE",
        date_from=payment.payment_date,
        date_to=payment.payment_date,
        status=ReconciliationRunStatus.COMPLETED,
        started_by=actor,
        started_at=timezone.now(),
        finished_at=timezone.now(),
        total_checked=1,
        total_matched=0,
        total_exceptions=1,
        high_risk_count=0,
        metadata={
            "phase": "F",
            "system_created_after_bridge_post": True,
            "verification_required": True,
            "posting_note": note,
        },
    )
    item = ReconciliationItem.objects.create(
        run=run,
        module="ACCOUNTING_BRIDGE_PHASE_F",
        source_type="Payment",
        source_id=str(payment.id),
        source_label=_source_reference(payment),
        expected_amount=payment.amount,
        actual_amount=payment.amount,
        amount_delta=Decimal("0.00"),
        severity=ReconciliationSeverity.MEDIUM,
        status=ReconciliationItemStatus.NEEDS_REVIEW,
        exception_code="POSTED_UNVERIFIED",
        exception_message="Bridge journal was posted and is waiting for explicit reconciliation verification.",
        recommended_action="Run reconciliation checks, then verify this bridge item if no hard exception is reported.",
        metadata={
            "journal_entry_id": journal.id,
            "journal_entry_no": journal.entry_no,
            "bridge_candidate_id": _candidate_id(source_model="Payment", source_pk=payment.id, event_key=PAYMENT_COLLECTION_EVENT_KEY),
            "action_href": "/admin/accounting/bridge-reconciliation",
        },
    )
    ReconciliationEvidence.objects.create(
        item=item,
        evidence_type="Payment",
        object_id=str(payment.id),
        label=_source_reference(payment),
        amount=payment.amount,
        status="SOURCE",
    )
    ReconciliationEvidence.objects.create(
        item=item,
        evidence_type="JournalEntry",
        object_id=str(journal.id),
        label=journal.entry_no,
        amount=payment.amount,
        status=journal.status,
    )
    return item


@transaction.atomic
def post_bridge_candidate(*, candidate_id: str, idempotency_key: str, confirmed: bool, posting_note: str = "", actor) -> dict[str, Any]:
    if not confirmed:
        raise ValueError("Explicit confirmation is required before posting.")
    candidate_key = (idempotency_key or "").strip()
    if not candidate_key:
        raise ValueError("idempotency_key is required.")
    source_kind, source_pk, event_key = _parse_candidate_id(candidate_id)
    if source_kind != "payment" or event_key != PAYMENT_COLLECTION_EVENT_KEY:
        raise ValueError("Unsupported bridge candidate source.")

    payment = (
        Payment.objects.select_for_update()
        .select_related("finance_account", "finance_account__chart_account", "customer", "subscription")
        .get(pk=source_pk)
    )
    existing = (
        AccountingBridgePosting.objects.select_for_update()
        .filter(source_model="Payment", source_id=str(payment.id), purpose=PAYMENT_COLLECTION_PURPOSE)
        .select_related("journal_entry")
        .first()
    )
    if existing is not None:
        existing_key = ((existing.trace_metadata or {}).get("idempotency_key") or "").strip()
        if existing_key and existing_key == candidate_key:
            return {
                "posted": False,
                "already_posted": True,
                "journal_entry": _journal_payload(existing.journal_entry),
                "next_action": "Run reconciliation checks and verify the pending bridge item.",
            }
        raise ValueError("This source item has already been posted with a different or legacy idempotency key.")

    candidate = payment_candidate(payment)
    if candidate["idempotency_key"] != candidate_key:
        raise ValueError("idempotency_key does not match the current source candidate.")
    preview = preview_bridge_candidate(candidate_id)
    if not preview["can_post"]:
        raise ValueError("; ".join(preview["blockers"]) or "Candidate is not postable.")
    lines, _warnings, finance_account = _payment_lines(payment)
    total_debit, total_credit = _line_totals(lines)
    if not lines or total_debit != total_credit:
        raise ValueError("Bridge posting preview is not balanced.")

    journal, created = post_bridge_entry(
        source_instance=payment,
        purpose=PAYMENT_COLLECTION_PURPOSE,
        entry_date=payment.payment_date,
        memo=f"Bridge payment collection {payment.id}",
        lines=lines,
        voucher_type=PAYMENT_COLLECTION_PURPOSE,
        source_type="PAYMENT",
        source_reference=_source_reference(payment),
        trace_metadata={
            "event_key": PAYMENT_COLLECTION_EVENT_KEY,
            "idempotency_key": candidate_key,
            "posting_note": posting_note,
            "payment_id": payment.id,
            "subscription_id": payment.subscription_id,
            "emi_id": payment.emi_id,
            "method": (payment.method or "").strip().upper() or "CASH",
            "finance_account_id": getattr(finance_account, "id", None),
            "amount": f"{_money(payment.amount):.2f}",
        },
        posted_by=actor,
    )
    reconciliation_item = _latest_reconciliation_item(source_model="Payment", source_id=str(payment.id))
    if created and reconciliation_item is None:
        reconciliation_item = _create_pending_reconciliation_item(journal=journal, payment=payment, actor=actor, note=posting_note)
    _log_accounting_event(
        event="ACCOUNTING_BRIDGE_CANDIDATE_POSTED",
        instance=journal,
        performed_by=actor,
        metadata={
            "candidate_id": candidate_id,
            "source_model": "Payment",
            "source_id": payment.id,
            "event_key": PAYMENT_COLLECTION_EVENT_KEY,
            "journal_entry_id": journal.id,
            "period_id": journal.accounting_period_id,
            "amount": f"{_money(payment.amount):.2f}",
            "idempotency_key": candidate_key,
            "reconciliation_item_id": getattr(reconciliation_item, "id", None),
        },
    )
    return {
        "posted": created,
        "already_posted": not created,
        "journal_entry": _journal_payload(journal),
        "reconciliation_item": {
            "id": reconciliation_item.id,
            "status": reconciliation_item.status,
            "exception_code": reconciliation_item.exception_code,
        }
        if reconciliation_item
        else None,
        "next_action": "Run reconciliation checks and verify the pending bridge item.",
    }


def batch_preview_bridge_candidates(candidate_ids: list[str]) -> dict[str, Any]:
    previews = []
    blockers: dict[str, list[str]] = {}
    total_debit = Decimal("0.00")
    total_credit = Decimal("0.00")
    for candidate_id in candidate_ids:
        try:
            preview = preview_bridge_candidate(candidate_id)
            previews.append(preview)
            total_debit += _money(preview["total_debit"])
            total_credit += _money(preview["total_credit"])
            if not preview["can_post"]:
                blockers[candidate_id] = preview["blockers"]
        except Exception as exc:
            blockers[candidate_id] = [str(exc)]
    return {
        "selected_count": len(candidate_ids),
        "postable_count": sum(1 for item in previews if item["can_post"]),
        "blocked_count": len(blockers),
        "total_debit": f"{total_debit:.2f}",
        "total_credit": f"{total_credit:.2f}",
        "previews": previews,
        "blockers": blockers,
    }


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
            if result["posted"]:
                posted.append(result)
            else:
                already_posted.append(result)
        except Exception as exc:
            errors[candidate_id] = [str(exc)]
    created_journal_ids = [item["journal_entry"]["id"] for item in posted if item.get("journal_entry")]
    return {
        "posted_count": len(posted),
        "skipped_already_posted_count": len(already_posted),
        "blocked_count": len(errors),
        "created_journal_ids": created_journal_ids,
        "reconciliation_pending_count": sum(1 for item in posted if item.get("reconciliation_item")),
        "posted": posted,
        "already_posted": already_posted,
        "errors": errors,
    }


@transaction.atomic
def verify_bridge_reconciliation_item(*, item_id: int, actor, note: str = "", run_id: int | None = None) -> dict[str, Any]:
    item = ReconciliationItem.objects.select_for_update().get(pk=item_id)
    if item.module != "ACCOUNTING_BRIDGE_PHASE_F":
        raise ValueError("Only accounting bridge reconciliation items can be verified here.")
    if item.status == ReconciliationItemStatus.MATCHED:
        return {"id": item.id, "status": item.status, "verified": False, "detail": "Already verified."}
    if item.exception_code != "POSTED_UNVERIFIED":
        raise ValueError("Cannot verify a bridge item that has a hard reconciliation exception.")
    journal_id = (item.metadata or {}).get("journal_entry_id")
    journal = JournalEntry.objects.filter(pk=journal_id, status=JournalEntryStatus.POSTED).first()
    if journal is None:
        raise ValueError("Cannot verify an unposted or missing journal entry.")
    open_exceptions = ReconciliationItem.objects.filter(
        source_type=item.source_type,
        source_id=item.source_id,
    ).exclude(pk=item.pk).exclude(exception_code="POSTED_UNVERIFIED").exclude(status__in=[ReconciliationItemStatus.MATCHED, ReconciliationItemStatus.RESOLVED, ReconciliationItemStatus.FALSE_POSITIVE, ReconciliationItemStatus.WAIVED_BY_APPROVAL])
    if open_exceptions.exists():
        raise ValueError("Cannot verify while hard reconciliation exceptions remain for this source.")
    item.status = ReconciliationItemStatus.MATCHED
    item.exception_code = ""
    item.exception_message = ""
    item.resolved_by = actor
    item.resolved_at = timezone.now()
    item.metadata = {
        **(item.metadata or {}),
        "verified_by": getattr(actor, "id", None),
        "verified_at": item.resolved_at.isoformat(),
        "verification_note": note,
        "verification_run_id": run_id,
    }
    item.save(update_fields=["status", "exception_code", "exception_message", "resolved_by", "resolved_at", "metadata", "updated_at"])
    _log_accounting_event(
        event="ACCOUNTING_BRIDGE_RECONCILIATION_VERIFIED",
        instance=item,
        performed_by=actor,
        metadata={
            "reconciliation_item_id": item.id,
            "source_type": item.source_type,
            "source_id": item.source_id,
            "journal_entry_id": journal.id,
            "run_id": run_id,
        },
    )
    return {"id": item.id, "status": item.status, "verified": True, "verified_at": item.resolved_at.isoformat()}


def summarize_candidate_statuses(rows: list[dict[str, Any]]) -> dict[str, int]:
    counts = Counter(row.get("status") or "INFO" for row in rows)
    return {
        "candidate_count": len(rows),
        "ready_unposted_count": counts.get("READY_UNPOSTED", 0),
        "posted_count": counts.get("POSTED", 0),
        "reconciled_count": counts.get("RECONCILED", 0),
        "blocked_by_mapping_count": counts.get("BLOCKED_BY_MAPPING", 0),
        "blocked_by_period_count": counts.get("BLOCKED_BY_PERIOD", 0),
        "blocked_by_numbering_count": counts.get("BLOCKED_BY_NUMBERING", 0),
        "blocked_by_approval_count": counts.get("BLOCKED_BY_APPROVAL", 0),
        "unsupported_count": counts.get("UNSUPPORTED_SOURCE", 0),
    }
