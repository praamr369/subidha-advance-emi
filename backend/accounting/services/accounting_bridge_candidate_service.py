from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Any

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from accounting.models import AccountingBridgePosting, AccountingPeriod, ChartOfAccount, FinanceAccount, JournalEntry, JournalEntryStatus
from accounting.services.accounting_bridge_readiness_service import build_accounting_bridge_posting_period_readiness
from accounting.services.accounting_postability_service import evaluate_accounting_postability
from accounting.services.bridge_posting_service import post_bridge_entry
from accounting.services.bridge_run_service import _resolve_collection_finance_account
from accounting.services.document_sequence_service import DocumentNumberingSetupError, DocumentType, preview_document_number, validate_document_numbering_ready
from accounting.services.journal_posting_service import _log_accounting_event
from accounting.services.period_service import resolve_accounting_period
from billing.models import BillingDocumentStatus, BillingSourceType, ReceiptDocument, ReceiptType
from reconciliation.models import ReconciliationEvidence, ReconciliationItem, ReconciliationItemStatus, ReconciliationRun, ReconciliationRunStatus, ReconciliationSeverity
from reconciliation.services.run_numbering import next_reconciliation_run_no
from subscriptions.models import Payment

PAYMENT_COLLECTION_EVENT_KEY = "subscription_emi_payment"
PAYMENT_COLLECTION_PURPOSE = "PAYMENT_COLLECTION"
SAFETY_TEXT = "Preview is read-only. Posting creates accounting entries only after explicit admin confirmation."

RECEIPT_SOURCE_MODEL = "ReceiptDocument"
RECEIPT_EVENT_KEYS = {"direct_sale_receipt", "customer_advance", "customer_refund", "refund_customer_credit"}
RECEIPT_PURPOSE_BY_EVENT = {
    "direct_sale_receipt": "DIRECT_SALE_RECEIPT",
    "customer_advance": "CUSTOMER_ADVANCE",
    "customer_refund": "CUSTOMER_REFUND",
    "refund_customer_credit": "REFUND_CUSTOMER_CREDIT",
}
RECEIPT_LABEL_BY_EVENT = {
    "direct_sale_receipt": "Direct sale receipt",
    "customer_advance": "Customer advance / unapplied receipt",
    "customer_refund": "Customer refund",
    "refund_customer_credit": "Refund / customer credit",
}
SKIPPED_RECEIPT_EVENT_KEY = "receipt_skipped_not_applicable"
UNSUPPORTED_RECEIPT_EVENT_KEY = "unsupported_receipt"


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
    return {"id": period.id, "code": period.code, "name": period.name or period.label, "status": period.status, "financial_year": period.financial_year_id, "financial_year_code": getattr(period.financial_year, "code", None)}


def _account_payload(account: ChartOfAccount | None) -> dict[str, Any] | None:
    if account is None:
        return None
    return {"id": account.id, "code": account.code, "name": account.name}


def _finance_account_payload(account: FinanceAccount | None) -> dict[str, Any] | None:
    if account is None:
        return None
    return {"id": account.id, "name": account.name, "kind": account.kind, "chart_account": _account_payload(account.chart_account)}


def _journal_payload(journal: JournalEntry | None) -> dict[str, Any] | None:
    if journal is None:
        return None
    return {"id": journal.id, "entry_no": journal.entry_no, "entry_date": journal.entry_date.isoformat() if journal.entry_date else None, "status": journal.status, "source_model": journal.source_model, "source_id": journal.source_id, "voucher_type": journal.voucher_type, "accounting_period": journal.accounting_period_id, "accounting_period_code": getattr(journal.accounting_period, "code", None), "financial_year": journal.financial_year_id, "financial_year_code": getattr(journal.financial_year, "code", None)}


def _line_payload(*, account: ChartOfAccount, description: str, debit: Any = "0.00", credit: Any = "0.00") -> dict[str, Any]:
    debit_amount = _money(debit)
    credit_amount = _money(credit)
    return {"chart_account": _account_payload(account), "description": description, "debit_amount": f"{debit_amount:.2f}", "credit_amount": f"{credit_amount:.2f}"}


def _chart_by_system_code(system_code: str) -> ChartOfAccount | None:
    return ChartOfAccount.objects.filter(system_code=system_code, is_active=True).order_by("id").first()


def _customer_receivable_account() -> ChartOfAccount | None:
    return _chart_by_system_code("CUSTOMER_RECEIVABLE")


def _customer_advance_account() -> ChartOfAccount | None:
    return _chart_by_system_code("CUSTOMER_ADVANCE_UNEARNED_REVENUE")


def _sales_return_account() -> ChartOfAccount | None:
    return _chart_by_system_code("SALES_RETURNS") or _customer_receivable_account()


def _source_reference(payment: Payment) -> str:
    return payment.reference_no or f"PAY-{payment.id}"


def _receipt_reference(receipt: ReceiptDocument) -> str:
    return receipt.receipt_no or receipt.source_reference or f"RCT-{receipt.id}"


def _resolve_payment_finance_account(payment: Payment) -> tuple[FinanceAccount | None, str | None, list[int]]:
    if payment.finance_account_id:
        account = payment.finance_account
        if not account.is_active:
            return None, "FINANCE_ACCOUNT_INACTIVE", [account.id]
        if not account.chart_account_id or not account.chart_account.is_active:
            return None, "FINANCE_ACCOUNT_COA_INACTIVE", [account.id]
        return account, None, [account.id]
    return _resolve_collection_finance_account(method=payment.method or "")


def _resolve_receipt_finance_account(receipt: ReceiptDocument) -> tuple[FinanceAccount | None, str | None]:
    if not receipt.finance_account_id:
        return None, "RECEIPT_FINANCE_ACCOUNT_MISSING"
    account = receipt.finance_account
    if not account.is_active:
        return None, "FINANCE_ACCOUNT_INACTIVE"
    if not account.chart_account_id or not account.chart_account.is_active:
        return None, "FINANCE_ACCOUNT_COA_INACTIVE"
    return account, None


def _payment_lines(payment: Payment) -> tuple[list[dict[str, Any]], list[str], FinanceAccount | None]:
    warnings: list[str] = []
    finance_account, reason, _candidate_ids = _resolve_payment_finance_account(payment)
    if reason:
        warnings.append(f"Finance account is not ready for {payment.method or 'CASH'} collection: {reason}.")
    clearing_account = _customer_receivable_account()
    if clearing_account is None:
        warnings.append("CUSTOMER_RECEIVABLE chart account is missing or inactive.")
    if finance_account is None or clearing_account is None:
        return [], warnings, finance_account
    return [
        {"chart_account": finance_account.chart_account, "description": f"{(payment.method or 'CASH').strip().upper()} collection", "debit_amount": payment.amount, "credit_amount": Decimal("0.00")},
        {"chart_account": clearing_account, "description": "Customer receivable clearing", "debit_amount": Decimal("0.00"), "credit_amount": payment.amount},
    ], warnings, finance_account


def _classify_receipt_event(receipt: ReceiptDocument) -> tuple[str, str, str | None]:
    status = (receipt.status or "").strip().upper()
    if status in {BillingDocumentStatus.CANCELLED, BillingDocumentStatus.VOID}:
        return SKIPPED_RECEIPT_EVENT_KEY, "Receipt skipped", "Voided/cancelled receipts are skipped in Phase F2; reversal events are out of scope."
    if receipt.payment_id or receipt.receipt_type == ReceiptType.EMI_PAYMENT_RECEIPT:
        return SKIPPED_RECEIPT_EVENT_KEY, "Receipt skipped", "EMI payment receipts are accounted through the concrete Payment bridge candidate."
    source_type = (receipt.source_type or "").strip().upper()
    if receipt.receipt_type == ReceiptType.RETAIL_RECEIPT and (receipt.direct_sale_id or source_type == BillingSourceType.DIRECT_SALE or getattr(receipt.billing_invoice, "direct_sale_id", None)):
        return "direct_sale_receipt", RECEIPT_LABEL_BY_EVENT["direct_sale_receipt"], None
    if receipt.receipt_type == ReceiptType.RETAIL_RECEIPT and not receipt.direct_sale_id and not receipt.billing_invoice_id:
        if source_type in {BillingSourceType.MANUAL, "OTHER", ""}:
            return "customer_advance", RECEIPT_LABEL_BY_EVENT["customer_advance"], None
    if source_type == BillingSourceType.NOTE_ADJUSTMENT:
        return "refund_customer_credit", RECEIPT_LABEL_BY_EVENT["refund_customer_credit"], None
    return UNSUPPORTED_RECEIPT_EVENT_KEY, "Unsupported receipt", "ReceiptDocument does not match a supported Phase F2 receipt bridge event."


def _receipt_lines(receipt: ReceiptDocument, event_key: str) -> tuple[list[dict[str, Any]], list[str], FinanceAccount | None]:
    warnings: list[str] = []
    finance_account, reason = _resolve_receipt_finance_account(receipt)
    if reason:
        warnings.append(f"Receipt finance account is not ready: {reason}.")
    if finance_account is None:
        return [], warnings, finance_account
    amount = _money(receipt.amount)
    if amount <= Decimal("0.00"):
        warnings.append("Receipt amount must be greater than zero.")
        return [], warnings, finance_account
    if event_key == "direct_sale_receipt":
        credit_account = _customer_receivable_account()
        if credit_account is None:
            warnings.append("CUSTOMER_RECEIVABLE chart account is missing or inactive.")
            return [], warnings, finance_account
        return [{"chart_account": finance_account.chart_account, "description": "Receipt collection", "debit_amount": amount, "credit_amount": Decimal("0.00")}, {"chart_account": credit_account, "description": "Customer receivable clearing", "debit_amount": Decimal("0.00"), "credit_amount": amount}], warnings, finance_account
    if event_key == "customer_advance":
        credit_account = _customer_advance_account()
        if credit_account is None:
            warnings.append("CUSTOMER_ADVANCE_UNEARNED_REVENUE chart account is missing or inactive.")
            return [], warnings, finance_account
        return [{"chart_account": finance_account.chart_account, "description": "Customer advance collection", "debit_amount": amount, "credit_amount": Decimal("0.00")}, {"chart_account": credit_account, "description": "Customer advance liability", "debit_amount": Decimal("0.00"), "credit_amount": amount}], warnings, finance_account
    if event_key == "customer_refund":
        debit_account = _customer_advance_account() or _customer_receivable_account()
        if debit_account is None:
            warnings.append("Customer advance / receivable account is missing or inactive.")
            return [], warnings, finance_account
        return [{"chart_account": debit_account, "description": "Customer refund settlement", "debit_amount": amount, "credit_amount": Decimal("0.00")}, {"chart_account": finance_account.chart_account, "description": "Refund paid", "debit_amount": Decimal("0.00"), "credit_amount": amount}], warnings, finance_account
    if event_key == "refund_customer_credit":
        debit_account = _sales_return_account()
        if debit_account is None:
            warnings.append("Sales return / customer receivable account is missing or inactive.")
            return [], warnings, finance_account
        return [{"chart_account": debit_account, "description": "Refund / customer credit adjustment", "debit_amount": amount, "credit_amount": Decimal("0.00")}, {"chart_account": finance_account.chart_account, "description": "Refund / credit paid", "debit_amount": Decimal("0.00"), "credit_amount": amount}], warnings, finance_account
    warnings.append("Unsupported ReceiptDocument event for Phase F2.")
    return [], warnings, finance_account


def _preview_lines(lines: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [_line_payload(account=line["chart_account"], description=line.get("description", ""), debit=line.get("debit_amount"), credit=line.get("credit_amount")) for line in lines]


def _line_totals(lines: list[dict[str, Any]]) -> tuple[Decimal, Decimal]:
    total_debit = sum((_money(line.get("debit_amount")) for line in lines), Decimal("0.00"))
    total_credit = sum((_money(line.get("credit_amount")) for line in lines), Decimal("0.00"))
    return total_debit, total_credit


def _source_period(source_date: date) -> AccountingPeriod | None:
    try:
        return resolve_accounting_period(source_date)
    except ValueError:
        return None


def _date_filter_qs(queryset, filters: BridgeCandidateFilters, *, date_field: str):
    if filters.date_from:
        queryset = queryset.filter(**{f"{date_field}__gte": filters.date_from})
    if filters.date_to:
        queryset = queryset.filter(**{f"{date_field}__lte": filters.date_to})
    if filters.accounting_period:
        period_lookup = Q(code__iexact=filters.accounting_period)
        if str(filters.accounting_period).isdigit():
            period_lookup |= Q(pk=int(filters.accounting_period))
        period = AccountingPeriod.objects.filter(period_lookup).first()
        if period is None:
            return queryset.none()
        queryset = queryset.filter(**{f"{date_field}__gte": period.start_date, f"{date_field}__lte": period.end_date})
    elif filters.financial_year:
        from accounting.models import FinancialYear
        year_lookup = Q(code__iexact=filters.financial_year)
        if str(filters.financial_year).isdigit():
            year_lookup |= Q(pk=int(filters.financial_year))
        year = FinancialYear.objects.filter(year_lookup).first()
        if year is None:
            return queryset.none()
        queryset = queryset.filter(**{f"{date_field}__gte": year.start_date, f"{date_field}__lte": year.end_date})
    return queryset


def _reconciliation_qs(*, source_model: str, source_id: str):
    return ReconciliationItem.objects.filter(module="ACCOUNTING_BRIDGE_PHASE_F", source_type=source_model, source_id=source_id).order_by("-created_at", "-id")


def _latest_reconciliation_item(*, source_model: str, source_id: str) -> ReconciliationItem | None:
    return _reconciliation_qs(source_model=source_model, source_id=source_id).first()


def _latest_posting_reconciliation_item(*, source_model: str, source_id: str) -> ReconciliationItem | None:
    qs = _reconciliation_qs(source_model=source_model, source_id=source_id)
    preferred = qs.filter(Q(exception_code="POSTED_UNVERIFIED") | Q(status=ReconciliationItemStatus.MATCHED)).first()
    return preferred or qs.first()


def _existing_bridge_for(*, source_model: str, source_id: str, purpose: str) -> AccountingBridgePosting | None:
    return AccountingBridgePosting.objects.filter(source_model=source_model, source_id=source_id, purpose=purpose).select_related("journal_entry", "journal_entry__accounting_period", "journal_entry__financial_year").first()


def _existing_bridge(payment: Payment) -> AccountingBridgePosting | None:
    return _existing_bridge_for(source_model="Payment", source_id=str(payment.id), purpose=PAYMENT_COLLECTION_PURPOSE)


def payment_candidate(payment: Payment) -> dict[str, Any]:
    bridge = _existing_bridge(payment)
    journal = bridge.journal_entry if bridge else None
    reconciliation_item = _latest_posting_reconciliation_item(source_model="Payment", source_id=str(payment.id)) if journal else _latest_reconciliation_item(source_model="Payment", source_id=str(payment.id))
    period = getattr(journal, "accounting_period", None) or _source_period(payment.payment_date)
    period_readiness = build_accounting_bridge_posting_period_readiness(reference_date=payment.payment_date, financial_year=getattr(period, "financial_year", None), period=period)
    lines, line_warnings, finance_account = _payment_lines(payment)
    bridge_row = {"event_key": PAYMENT_COLLECTION_EVENT_KEY, "status": "READY" if lines else "NOT_CONFIGURED", "label": "Subscription EMI payment"}
    postability = evaluate_accounting_postability(event_key=PAYMENT_COLLECTION_EVENT_KEY, event_label="Subscription EMI payment", module="subscriptions", source_model="Payment", bridge_row=bridge_row, period_readiness=period_readiness, source_workflow_exists=True, posted=bool(journal), reconciled=bool(reconciliation_item and reconciliation_item.status == ReconciliationItemStatus.MATCHED), as_source_row=not bool(journal))
    if line_warnings and postability["status"] == "READY_UNPOSTED":
        postability = {**postability, "status": "BLOCKED_BY_MAPPING", "can_post": False, "can_preview": False, "blocker_code": "MAPPING_NOT_READY", "blocker_reason": line_warnings[0], "recommended_action": "Fix finance account and customer receivable mapping before posting."}
    candidate_id = _candidate_id(source_model="Payment", source_pk=payment.id, event_key=PAYMENT_COLLECTION_EVENT_KEY)
    return _candidate_payload(candidate_id=candidate_id, event_key=PAYMENT_COLLECTION_EVENT_KEY, event_label="Subscription EMI payment", module="subscriptions", source_model="Payment", source_pk=payment.id, source_display=f"Payment {_source_reference(payment)}", source_reference=_source_reference(payment), source_date=payment.payment_date, amount=payment.amount, lines=lines, finance_account=finance_account, period=period, postability=postability, journal=journal, reconciliation_item=reconciliation_item, idempotency_key=f"bridge:{PAYMENT_COLLECTION_PURPOSE}:Payment:{payment.id}:{payment.payment_date.isoformat()}:{_money(payment.amount):.2f}")


def receipt_candidate(receipt: ReceiptDocument) -> dict[str, Any]:
    event_key, event_label, classification_reason = _classify_receipt_event(receipt)
    purpose = RECEIPT_PURPOSE_BY_EVENT.get(event_key, event_key.upper())
    bridge = _existing_bridge_for(source_model=RECEIPT_SOURCE_MODEL, source_id=str(receipt.id), purpose=purpose)
    journal = bridge.journal_entry if bridge else None
    reconciliation_item = _latest_posting_reconciliation_item(source_model=RECEIPT_SOURCE_MODEL, source_id=str(receipt.id)) if journal else _latest_reconciliation_item(source_model=RECEIPT_SOURCE_MODEL, source_id=str(receipt.id))
    period = getattr(journal, "accounting_period", None) or _source_period(receipt.receipt_date)
    period_readiness = build_accounting_bridge_posting_period_readiness(reference_date=receipt.receipt_date, financial_year=getattr(period, "financial_year", None), period=period)
    lines, line_warnings, finance_account = _receipt_lines(receipt, event_key) if event_key in RECEIPT_EVENT_KEYS else ([], [classification_reason] if classification_reason else [], None)
    raw_status = "READY" if lines else "NOT_CONFIGURED"
    if event_key == SKIPPED_RECEIPT_EVENT_KEY:
        raw_status = "SKIPPED_NOT_APPLICABLE"
    elif event_key == UNSUPPORTED_RECEIPT_EVENT_KEY:
        raw_status = "UNSUPPORTED_SOURCE"
    bridge_row = {"event_key": event_key, "status": raw_status, "label": event_label, "blocking_reasons": [item for item in [classification_reason, *line_warnings] if item]}
    postability = evaluate_accounting_postability(event_key=event_key, event_label=event_label, module="billing", source_model=RECEIPT_SOURCE_MODEL, bridge_row=bridge_row, period_readiness=period_readiness, source_workflow_exists=event_key in RECEIPT_EVENT_KEYS, posted=bool(journal), reconciled=bool(reconciliation_item and reconciliation_item.status == ReconciliationItemStatus.MATCHED), as_source_row=not bool(journal))
    if event_key == SKIPPED_RECEIPT_EVENT_KEY:
        postability = {**postability, "status": "SKIPPED_NOT_APPLICABLE", "canonical_status": "SKIPPED_NOT_APPLICABLE", "can_post": False, "can_preview": False, "blocker_code": "SKIPPED_NOT_APPLICABLE", "blocker_reason": classification_reason or "Receipt is not applicable for bridge posting.", "recommended_action": "No bridge posting action is required for this receipt."}
    elif line_warnings and postability["status"] == "READY_UNPOSTED":
        postability = {**postability, "status": "BLOCKED_BY_MAPPING", "canonical_status": "BLOCKED_BY_MAPPING", "can_post": False, "can_preview": False, "blocker_code": "MAPPING_NOT_READY", "blocker_reason": line_warnings[0], "recommended_action": "Fix receipt finance account and debit/credit mapping before posting."}
    total_debit, total_credit = _line_totals(lines)
    candidate_id = _candidate_id(source_model=RECEIPT_SOURCE_MODEL, source_pk=receipt.id, event_key=event_key)
    payload = _candidate_payload(candidate_id=candidate_id, event_key=event_key, event_label=event_label, module="billing", source_model=RECEIPT_SOURCE_MODEL, source_pk=receipt.id, source_display=f"Receipt {_receipt_reference(receipt)}", source_reference=_receipt_reference(receipt), source_date=receipt.receipt_date, amount=receipt.amount, lines=lines, finance_account=finance_account, period=period, postability=postability, journal=journal, reconciliation_item=reconciliation_item, idempotency_key=f"bridge:{purpose}:ReceiptDocument:{receipt.id}:{receipt.receipt_date.isoformat()}:{_money(receipt.amount):.2f}")
    payload.update({"receipt_type": receipt.receipt_type, "receipt_status": receipt.status, "unsupported_source": event_key == UNSUPPORTED_RECEIPT_EVENT_KEY, "approval_required": False, "total_debit": f"{total_debit:.2f}", "total_credit": f"{total_credit:.2f}", "is_balanced": bool(lines and total_debit == total_credit)})
    return payload


def _candidate_payload(*, candidate_id: str, event_key: str, event_label: str, module: str, source_model: str, source_pk: int, source_display: str, source_reference: str, source_date: date, amount: Any, lines: list[dict[str, Any]], finance_account: FinanceAccount | None, period: AccountingPeriod | None, postability: dict[str, Any], journal: JournalEntry | None, reconciliation_item: ReconciliationItem | None, idempotency_key: str) -> dict[str, Any]:
    total_debit, total_credit = _line_totals(lines)
    purpose = RECEIPT_PURPOSE_BY_EVENT.get(event_key, PAYMENT_COLLECTION_PURPOSE if source_model == "Payment" else event_key.upper())
    existing_bridge = _existing_bridge_for(source_model=source_model, source_id=str(source_pk), purpose=purpose)
    posted_unverified = bool(journal and reconciliation_item and reconciliation_item.exception_code == "POSTED_UNVERIFIED" and reconciliation_item.status == ReconciliationItemStatus.NEEDS_REVIEW)
    return {"id": candidate_id, "bridge_candidate_id": candidate_id, "row_type": "bridge_candidate", "event_key": event_key, "event_label": event_label, "label": event_label, "module": module, "source_module": module, "source_model": source_model, "source_pk": source_pk, "source_id": str(source_pk), "source_type": source_model, "source_display": source_display, "source_reference_number": source_reference, "source_reference": source_reference, "source_date": source_date.isoformat(), "accounting_period_id": getattr(period, "id", None), "accounting_period_code": getattr(period, "code", None), "accounting_period": _period_payload(period), "financial_year": getattr(getattr(period, "financial_year", None), "code", None), "financial_year_id": getattr(period, "financial_year_id", None), "amount": f"{_money(amount):.2f}", "debit_account_preview": [_line_payload(account=line["chart_account"], description=line.get("description", ""), debit=line.get("debit_amount")) for line in lines if _money(line.get("debit_amount")) > 0], "credit_account_preview": [_line_payload(account=line["chart_account"], description=line.get("description", ""), credit=line.get("credit_amount")) for line in lines if _money(line.get("credit_amount")) > 0], "finance_account": _finance_account_payload(finance_account), "canonical_status": postability["status"], "status": postability["status"], "reconciliation_state": "RECONCILED" if reconciliation_item and reconciliation_item.status == ReconciliationItemStatus.MATCHED else ("POSTED_UNVERIFIED" if posted_unverified else None), "posted_unverified": posted_unverified, "can_preview": postability["can_preview"], "can_post": postability["can_post"], "can_reconcile": postability["can_reconcile"], "blocker_code": postability["blocker_code"], "blocker_reason": postability["blocker_reason"], "approval_required": False, "unsupported_source": postability["status"] == "UNSUPPORTED_SOURCE", "existing_journal_entry_id": getattr(journal, "id", None), "existing_accounting_bridge_posting_id": getattr(existing_bridge, "id", None), "existing_money_movement_id": None, "existing_reconciliation_item_id": getattr(reconciliation_item, "id", None), "journal_entry": _journal_payload(journal), "settlement_linked": False, "reconciliation_linked": reconciliation_item is not None, "reconciliation_items": [{"id": reconciliation_item.id, "status": reconciliation_item.status, "severity": reconciliation_item.severity, "exception_code": reconciliation_item.exception_code, "exception_message": reconciliation_item.exception_message}] if reconciliation_item else [], "idempotency_key": idempotency_key, "total_debit": f"{total_debit:.2f}", "total_credit": f"{total_credit:.2f}", "is_balanced": bool(lines and total_debit == total_credit), "exception_reasons": [postability["blocker_reason"]] if postability.get("blocker_code") else [], "operator_action": postability["recommended_action"], "recommended_action": postability["recommended_action"], "action_href": "/admin/accounting/bridge-reconciliation", "setup_href": postability["setup_href"], "preview_action_href": "/admin/accounting/bridge-reconciliation" if postability["can_preview"] else None, "post_action_href": "/admin/accounting/bridge-reconciliation" if postability["can_post"] else None, "source_action_href": None, "is_postable": postability["can_post"], "is_acknowledgeable": False}


def list_bridge_candidates(filters: BridgeCandidateFilters | None = None) -> list[dict[str, Any]]:
    active_filters = filters or BridgeCandidateFilters()
    requested_model = (active_filters.source_model or "").strip()
    rows: list[dict[str, Any]] = []
    if requested_model in {"", "Payment"} and (not active_filters.event_key or active_filters.event_key == PAYMENT_COLLECTION_EVENT_KEY) and (not active_filters.module or active_filters.module == "subscriptions"):
        queryset = Payment.objects.select_related("finance_account", "finance_account__chart_account", "customer", "subscription").all()
        queryset = _date_filter_qs(queryset, active_filters, date_field="payment_date")
        rows.extend(payment_candidate(payment) for payment in queryset.order_by("-payment_date", "-id")[:500])
    if requested_model in {"", RECEIPT_SOURCE_MODEL} and (not active_filters.module or active_filters.module == "billing"):
        queryset = ReceiptDocument.objects.select_related("finance_account", "finance_account__chart_account", "billing_invoice", "direct_sale", "customer", "subscription", "payment").all()
        queryset = _date_filter_qs(queryset, active_filters, date_field="receipt_date")
        receipt_rows = [receipt_candidate(receipt) for receipt in queryset.order_by("-receipt_date", "-id")[:500]]
        if active_filters.event_key:
            receipt_rows = [row for row in receipt_rows if row["event_key"] == active_filters.event_key]
        rows.extend(receipt_rows)
    rows.sort(key=lambda row: (row.get("source_date") or "", str(row.get("source_id") or "")), reverse=True)
    if active_filters.status:
        rows = [row for row in rows if row["status"] == active_filters.status or row.get("reconciliation_state") == active_filters.status]
    return rows


def get_bridge_candidate(candidate_id: str, *, for_update: bool = False) -> dict[str, Any]:
    source_kind, source_pk, event_key = _parse_candidate_id(candidate_id)
    if source_kind == "payment" and event_key == PAYMENT_COLLECTION_EVENT_KEY:
        queryset = Payment.objects.select_related("finance_account", "finance_account__chart_account", "customer", "subscription")
        if for_update:
            queryset = queryset.select_for_update()
        return payment_candidate(queryset.get(pk=source_pk))
    if source_kind == "receiptdocument":
        queryset = ReceiptDocument.objects.select_related("finance_account", "finance_account__chart_account", "billing_invoice", "direct_sale", "customer", "subscription", "payment")
        if for_update:
            queryset = queryset.select_for_update()
        receipt = queryset.get(pk=source_pk)
        candidate = receipt_candidate(receipt)
        if candidate["event_key"] != event_key:
            raise ValueError("ReceiptDocument candidate event no longer matches current source state.")
        return candidate
    raise ValueError("Unsupported bridge candidate source.")


def preview_bridge_candidate(candidate_id: str) -> dict[str, Any]:
    source_kind, source_pk, event_key = _parse_candidate_id(candidate_id)
    if source_kind == "payment" and event_key == PAYMENT_COLLECTION_EVENT_KEY:
        source = Payment.objects.select_related("finance_account", "finance_account__chart_account", "customer", "subscription").get(pk=source_pk)
        candidate = payment_candidate(source)
        lines, warnings, _finance_account = _payment_lines(source)
        journal_date = source.payment_date
        source_model = "Payment"
    elif source_kind == "receiptdocument":
        source = ReceiptDocument.objects.select_related("finance_account", "finance_account__chart_account", "billing_invoice", "direct_sale", "customer", "subscription", "payment").get(pk=source_pk)
        candidate = receipt_candidate(source)
        if candidate["event_key"] != event_key:
            raise ValueError("ReceiptDocument candidate event no longer matches current source state.")
        lines, warnings, _finance_account = _receipt_lines(source, event_key) if event_key in RECEIPT_EVENT_KEYS else ([], [candidate.get("blocker_reason") or "Unsupported ReceiptDocument event."], None)
        journal_date = source.receipt_date
        source_model = RECEIPT_SOURCE_MODEL
    else:
        raise ValueError("Unsupported bridge candidate source.")
    blockers = []
    if not candidate["can_post"]:
        blockers.append(candidate["blocker_reason"] or "Candidate is not postable.")
    try:
        sequence = validate_document_numbering_ready(DocumentType.JOURNAL_ENTRY, journal_date)
        journal_number_preview = preview_document_number(sequence=sequence)
    except DocumentNumberingSetupError as exc:
        journal_number_preview = None
        blockers.append(str(exc))
    total_debit, total_credit = _line_totals(lines)
    return {"candidate": candidate, "candidate_id": candidate_id, "source": {"model": source_model, "pk": source.id, "display": candidate["source_display"], "reference_number": candidate["source_reference_number"], "date": candidate["source_date"], "amount": candidate["amount"]}, "journal_date": journal_date.isoformat(), "accounting_period": candidate["accounting_period"], "journal_number_preview": journal_number_preview, "debit_lines": [_line_payload(account=line["chart_account"], description=line.get("description", ""), debit=line.get("debit_amount")) for line in lines if _money(line.get("debit_amount")) > 0], "credit_lines": [_line_payload(account=line["chart_account"], description=line.get("description", ""), credit=line.get("credit_amount")) for line in lines if _money(line.get("credit_amount")) > 0], "lines": _preview_lines(lines), "total_debit": f"{total_debit:.2f}", "total_credit": f"{total_credit:.2f}", "is_balanced": bool(lines and total_debit == total_credit), "tax_lines": [], "finance_account_line": candidate["finance_account"], "warnings": warnings, "blockers": list(dict.fromkeys([item for item in blockers if item])), "can_post": bool(candidate["can_post"] and lines and total_debit == total_credit and not blockers), "idempotency_key": candidate["idempotency_key"], "safety_text": SAFETY_TEXT}


def _create_pending_reconciliation_item(*, journal: JournalEntry, source_model: str, source_id: str, source_label: str, amount: Decimal, candidate_id: str, actor, note: str = "") -> ReconciliationItem:
    run = ReconciliationRun.objects.create(run_no=next_reconciliation_run_no(), scope="BRIDGE_POSTING", module="ACCOUNTING_BRIDGE", date_from=journal.entry_date, date_to=journal.entry_date, status=ReconciliationRunStatus.COMPLETED, started_by=actor, started_at=timezone.now(), finished_at=timezone.now(), total_checked=1, total_matched=0, total_exceptions=1, high_risk_count=0, metadata={"phase": "F", "phase_slice": "F2" if source_model == RECEIPT_SOURCE_MODEL else "F", "system_created_after_bridge_post": True, "verification_required": True, "posting_note": note})
    item = ReconciliationItem.objects.create(run=run, module="ACCOUNTING_BRIDGE_PHASE_F", source_type=source_model, source_id=source_id, source_label=source_label, expected_amount=amount, actual_amount=amount, amount_delta=Decimal("0.00"), severity=ReconciliationSeverity.MEDIUM, status=ReconciliationItemStatus.NEEDS_REVIEW, exception_code="POSTED_UNVERIFIED", exception_message="Bridge journal was posted and is waiting for explicit reconciliation verification.", recommended_action="Run reconciliation checks, then verify this bridge item if no hard exception is reported.", metadata={"journal_entry_id": journal.id, "journal_entry_no": journal.entry_no, "bridge_candidate_id": candidate_id, "action_href": "/admin/accounting/bridge-reconciliation"})
    ReconciliationEvidence.objects.create(item=item, evidence_type=source_model, object_id=source_id, label=source_label, amount=amount, status="SOURCE")
    ReconciliationEvidence.objects.create(item=item, evidence_type="JournalEntry", object_id=str(journal.id), label=journal.entry_no, amount=amount, status=journal.status)
    return item


@transaction.atomic
def post_bridge_candidate(*, candidate_id: str, idempotency_key: str, confirmed: bool, posting_note: str = "", actor) -> dict[str, Any]:
    if not confirmed:
        raise ValueError("Explicit confirmation is required before posting.")
    candidate_key = (idempotency_key or "").strip()
    if not candidate_key:
        raise ValueError("idempotency_key is required.")
    source_kind, source_pk, event_key = _parse_candidate_id(candidate_id)
    if source_kind == "payment" and event_key == PAYMENT_COLLECTION_EVENT_KEY:
        return _post_payment_candidate(source_pk=source_pk, candidate_id=candidate_id, candidate_key=candidate_key, posting_note=posting_note, actor=actor)
    if source_kind == "receiptdocument" and event_key in RECEIPT_EVENT_KEYS:
        return _post_receipt_candidate(source_pk=source_pk, event_key=event_key, candidate_id=candidate_id, candidate_key=candidate_key, posting_note=posting_note, actor=actor)
    raise ValueError("Unsupported bridge candidate source.")


def _existing_key_or_error(existing: AccountingBridgePosting, candidate_key: str, message: str):
    existing_key = ((existing.trace_metadata or {}).get("idempotency_key") or "").strip()
    if existing_key and existing_key == candidate_key:
        return {"posted": False, "already_posted": True, "journal_entry": _journal_payload(existing.journal_entry), "next_action": "Run reconciliation checks and verify the pending bridge item."}
    raise ValueError(message)


def _post_payment_candidate(*, source_pk: str, candidate_id: str, candidate_key: str, posting_note: str, actor) -> dict[str, Any]:
    payment = Payment.objects.select_for_update().select_related("finance_account", "finance_account__chart_account", "customer", "subscription").get(pk=source_pk)
    existing = AccountingBridgePosting.objects.select_for_update().filter(source_model="Payment", source_id=str(payment.id), purpose=PAYMENT_COLLECTION_PURPOSE).select_related("journal_entry").first()
    if existing is not None:
        return _existing_key_or_error(existing, candidate_key, "This source item has already been posted with a different or legacy idempotency key.")
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
    journal, created = post_bridge_entry(source_instance=payment, purpose=PAYMENT_COLLECTION_PURPOSE, entry_date=payment.payment_date, memo=f"Bridge payment collection {payment.id}", lines=lines, voucher_type=PAYMENT_COLLECTION_PURPOSE, source_type="PAYMENT", source_reference=_source_reference(payment), trace_metadata={"event_key": PAYMENT_COLLECTION_EVENT_KEY, "idempotency_key": candidate_key, "posting_note": posting_note, "payment_id": payment.id, "subscription_id": payment.subscription_id, "emi_id": payment.emi_id, "method": (payment.method or "").strip().upper() or "CASH", "finance_account_id": getattr(finance_account, "id", None), "amount": f"{_money(payment.amount):.2f}"}, posted_by=actor)
    reconciliation_item = _latest_posting_reconciliation_item(source_model="Payment", source_id=str(payment.id))
    if created and not (reconciliation_item and reconciliation_item.exception_code == "POSTED_UNVERIFIED"):
        reconciliation_item = _create_pending_reconciliation_item(journal=journal, source_model="Payment", source_id=str(payment.id), source_label=_source_reference(payment), amount=payment.amount, candidate_id=candidate_id, actor=actor, note=posting_note)
    _log_candidate_post(journal=journal, actor=actor, candidate_id=candidate_id, source_model="Payment", source_id=payment.id, event_key=PAYMENT_COLLECTION_EVENT_KEY, amount=payment.amount, candidate_key=candidate_key, reconciliation_item=reconciliation_item)
    return _post_result(created=created, journal=journal, reconciliation_item=reconciliation_item)


def _post_receipt_candidate(*, source_pk: str, event_key: str, candidate_id: str, candidate_key: str, posting_note: str, actor) -> dict[str, Any]:
    receipt = ReceiptDocument.objects.select_for_update().select_related("finance_account", "finance_account__chart_account", "billing_invoice", "direct_sale", "customer", "subscription", "payment").get(pk=source_pk)
    candidate = receipt_candidate(receipt)
    if candidate["event_key"] != event_key:
        raise ValueError("ReceiptDocument candidate event no longer matches current source state.")
    purpose = RECEIPT_PURPOSE_BY_EVENT[event_key]
    existing = AccountingBridgePosting.objects.select_for_update().filter(source_model=RECEIPT_SOURCE_MODEL, source_id=str(receipt.id), purpose=purpose).select_related("journal_entry").first()
    if existing is not None:
        return _existing_key_or_error(existing, candidate_key, "This ReceiptDocument event has already been posted with a different or legacy idempotency key.")
    if candidate["idempotency_key"] != candidate_key:
        raise ValueError("idempotency_key does not match the current source candidate.")
    preview = preview_bridge_candidate(candidate_id)
    if not preview["can_post"]:
        raise ValueError("; ".join(preview["blockers"]) or "Candidate is not postable.")
    lines, _warnings, finance_account = _receipt_lines(receipt, event_key)
    total_debit, total_credit = _line_totals(lines)
    if not lines or total_debit != total_credit:
        raise ValueError("Bridge posting preview is not balanced.")
    journal, created = post_bridge_entry(source_instance=receipt, purpose=purpose, entry_date=receipt.receipt_date, memo=f"Bridge receipt posting {receipt.id} {event_key}", lines=lines, voucher_type=purpose, source_type="RECEIPT", source_reference=_receipt_reference(receipt), trace_metadata={"event_key": event_key, "idempotency_key": candidate_key, "posting_note": posting_note, "receipt_document_id": receipt.id, "receipt_type": receipt.receipt_type, "source_type": receipt.source_type, "finance_account_id": getattr(finance_account, "id", None), "amount": f"{_money(receipt.amount):.2f}"}, posted_by=actor)
    reconciliation_item = _latest_posting_reconciliation_item(source_model=RECEIPT_SOURCE_MODEL, source_id=str(receipt.id))
    if created and not (reconciliation_item and reconciliation_item.exception_code == "POSTED_UNVERIFIED"):
        reconciliation_item = _create_pending_reconciliation_item(journal=journal, source_model=RECEIPT_SOURCE_MODEL, source_id=str(receipt.id), source_label=_receipt_reference(receipt), amount=receipt.amount, candidate_id=candidate_id, actor=actor, note=posting_note)
    _log_candidate_post(journal=journal, actor=actor, candidate_id=candidate_id, source_model=RECEIPT_SOURCE_MODEL, source_id=receipt.id, event_key=event_key, amount=receipt.amount, candidate_key=candidate_key, reconciliation_item=reconciliation_item)
    return _post_result(created=created, journal=journal, reconciliation_item=reconciliation_item)


def _log_candidate_post(*, journal: JournalEntry, actor, candidate_id: str, source_model: str, source_id: int, event_key: str, amount: Decimal, candidate_key: str, reconciliation_item: ReconciliationItem | None):
    _log_accounting_event(event="ACCOUNTING_BRIDGE_CANDIDATE_POSTED", instance=journal, performed_by=actor, metadata={"candidate_id": candidate_id, "source_model": source_model, "source_id": source_id, "event_key": event_key, "journal_entry_id": journal.id, "period_id": journal.accounting_period_id, "amount": f"{_money(amount):.2f}", "idempotency_key": candidate_key, "reconciliation_item_id": getattr(reconciliation_item, "id", None)})


def _post_result(*, created: bool, journal: JournalEntry, reconciliation_item: ReconciliationItem | None) -> dict[str, Any]:
    return {"posted": created, "already_posted": not created, "journal_entry": _journal_payload(journal), "reconciliation_item": {"id": reconciliation_item.id, "status": reconciliation_item.status, "exception_code": reconciliation_item.exception_code} if reconciliation_item else None, "next_action": "Run reconciliation checks and verify the pending bridge item."}


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
    return {"selected_count": len(candidate_ids), "previewable_count": len(previews), "postable_count": sum(1 for item in previews if item["can_post"]), "blocked_count": len(blockers), "total_debit": f"{total_debit:.2f}", "total_credit": f"{total_credit:.2f}", "previews": previews, "blockers": blockers}


def batch_post_bridge_candidates(*, candidate_ids: list[str], idempotency_keys: dict[str, str], confirmed: bool, posting_note: str = "", actor) -> dict[str, Any]:
    posted = []
    already_posted = []
    errors: dict[str, list[str]] = {}
    for candidate_id in candidate_ids:
        try:
            result = post_bridge_candidate(candidate_id=candidate_id, idempotency_key=idempotency_keys.get(candidate_id, ""), confirmed=confirmed, posting_note=posting_note, actor=actor)
            if result["posted"]:
                posted.append(result)
            else:
                already_posted.append(result)
        except Exception as exc:
            errors[candidate_id] = [str(exc)]
    created_journal_ids = [item["journal_entry"]["id"] for item in posted if item.get("journal_entry")]
    return {"selected_count": len(candidate_ids), "posted_count": len(posted), "already_posted_count": len(already_posted), "skipped_already_posted_count": len(already_posted), "blocked_count": len(errors), "created_journal_ids": created_journal_ids, "reconciliation_pending_count": sum(1 for item in posted if item.get("reconciliation_item")), "posted": posted, "already_posted": already_posted, "errors": errors}


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
    open_exceptions = ReconciliationItem.objects.filter(source_type=item.source_type, source_id=item.source_id).exclude(pk=item.pk).exclude(exception_code="POSTED_UNVERIFIED").exclude(status__in=[ReconciliationItemStatus.MATCHED, ReconciliationItemStatus.RESOLVED, ReconciliationItemStatus.FALSE_POSITIVE, ReconciliationItemStatus.WAIVED_BY_APPROVAL])
    if open_exceptions.exists():
        raise ValueError("Cannot verify while hard reconciliation exceptions remain for this source.")
    item.status = ReconciliationItemStatus.MATCHED
    item.exception_code = ""
    item.exception_message = ""
    item.resolved_by = actor
    item.resolved_at = timezone.now()
    item.metadata = {**(item.metadata or {}), "verified_by": getattr(actor, "id", None), "verified_at": item.resolved_at.isoformat(), "verification_note": note, "verification_run_id": run_id}
    item.save(update_fields=["status", "exception_code", "exception_message", "resolved_by", "resolved_at", "metadata", "updated_at"])
    _log_accounting_event(event="ACCOUNTING_BRIDGE_RECONCILIATION_VERIFIED", instance=item, performed_by=actor, metadata={"reconciliation_item_id": item.id, "source_type": item.source_type, "source_id": item.source_id, "journal_entry_id": journal.id, "run_id": run_id})
    return {"id": item.id, "status": item.status, "verified": True, "verified_at": item.resolved_at.isoformat()}


def summarize_candidate_statuses(rows: list[dict[str, Any]]) -> dict[str, int]:
    counts = Counter(row.get("status") or "INFO" for row in rows)
    receipt_counts = Counter(row.get("status") or "INFO" for row in rows if row.get("source_model") == RECEIPT_SOURCE_MODEL)
    payment_counts = Counter(row.get("status") or "INFO" for row in rows if row.get("source_model") == "Payment")
    receipt_posted_unverified = sum(1 for row in rows if row.get("source_model") == RECEIPT_SOURCE_MODEL and row.get("reconciliation_state") == "POSTED_UNVERIFIED")
    payment_posted_unverified = sum(1 for row in rows if row.get("source_model") == "Payment" and row.get("reconciliation_state") == "POSTED_UNVERIFIED")
    return {"candidate_count": len(rows), "ready_unposted_count": counts.get("READY_UNPOSTED", 0), "posted_count": counts.get("POSTED", 0), "reconciled_count": counts.get("RECONCILED", 0), "blocked_by_mapping_count": counts.get("BLOCKED_BY_MAPPING", 0), "blocked_by_period_count": counts.get("BLOCKED_BY_PERIOD", 0), "blocked_by_numbering_count": counts.get("BLOCKED_BY_NUMBERING", 0), "blocked_by_approval_count": counts.get("BLOCKED_BY_APPROVAL", 0), "unsupported_count": counts.get("UNSUPPORTED_SOURCE", 0), "receipt_ready_unposted_count": receipt_counts.get("READY_UNPOSTED", 0), "receipt_posted_count": receipt_counts.get("POSTED", 0), "receipt_posted_unverified_count": receipt_posted_unverified, "receipt_reconciled_count": receipt_counts.get("RECONCILED", 0), "payment_ready_unposted_count": payment_counts.get("READY_UNPOSTED", 0), "payment_posted_count": payment_counts.get("POSTED", 0), "payment_posted_unverified_count": payment_posted_unverified, "payment_reconciled_count": payment_counts.get("RECONCILED", 0)}
