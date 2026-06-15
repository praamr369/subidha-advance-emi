from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from accounting.models import AccountingBridgePosting, AccountingPeriod, AccountingPostingProfile, ChartOfAccount, FinanceAccount, JournalEntry, JournalEntryStatus
from accounting.services.accounting_bridge_readiness_service import build_accounting_bridge_posting_period_readiness
from accounting.services.accounting_postability_service import evaluate_accounting_postability
from accounting.services.bridge_posting_service import post_bridge_entry
from accounting.services.bridge_run_service import _resolve_collection_finance_account
from accounting.services.document_sequence_service import DocumentNumberingSetupError, DocumentType, preview_document_number, validate_document_numbering_ready
from accounting.services.journal_posting_service import _log_accounting_event
from accounting.services.period_service import resolve_accounting_period
from billing.models import BillingCreditNote, BillingDebitNote, BillingDocumentStatus, BillingInvoice, BillingInvoiceType, BillingSourceType, DirectSaleReturn, DirectSaleReturnStatus, ReceiptDocument, ReceiptType
from reconciliation.models import ReconciliationEvidence, ReconciliationItem, ReconciliationItemStatus, ReconciliationRun, ReconciliationRunStatus, ReconciliationSeverity
from reconciliation.services.run_numbering import next_reconciliation_run_no
from subscriptions.models import Commission, CommissionPayoutBatch, CommissionPayoutLine, CommissionStatus, Payment, PlanType, RentLeaseBillingDemand, RentLeaseDemandStatus, RentLeaseDemandType

PAYMENT_COLLECTION_EVENT_KEY = "subscription_emi_payment"
PAYMENT_COLLECTION_PURPOSE = "PAYMENT_COLLECTION"
SAFETY_TEXT = "Preview is read-only. Posting creates accounting entries only after explicit admin confirmation."
COA_SETUP_HREF = "/admin/accounting/chart-of-accounts"
FINANCE_ACCOUNTS_HREF = "/admin/settings/business-setup/finance-accounts"
MAPPING_AUDIT_HREF = "/admin/accounting/setup/mapping-audit"
ACCOUNTING_PERIODS_HREF = "/admin/accounting/periods"
JOURNALS_HREF = "/admin/accounting/journals"
RECONCILIATION_RUNS_HREF = "/admin/reconciliation/runs"
BRIDGE_POSTING_HREF = "/admin/accounting/bridge-reconciliation"
DOCUMENT_NUMBERING_HREF = "/admin/settings/business-setup/document-numbering"

COMMISSION_SOURCE_MODEL = "Commission"
COMMISSION_EVENT_KEY = "commission_accrual"
COMMISSION_EVENT_KEYS = {"commission_accrual", "partner_commission_accrual", "sales_commission_accrual"}
COMMISSION_PURPOSE_BY_EVENT = {key: key.upper() for key in COMMISSION_EVENT_KEYS}
COMMISSION_LABEL_BY_EVENT = {
    "commission_accrual": "Commission accrual",
    "partner_commission_accrual": "Partner commission accrual",
    "sales_commission_accrual": "Sales commission accrual",
}
SKIPPED_COMMISSION_EVENT_KEY = "commission_skipped_not_applicable"
UNSUPPORTED_COMMISSION_EVENT_KEY = "unsupported_commission"
COMMISSION_SAFETY_TEXT = "Preview is read-only. Posting creates accounting entries only after explicit admin confirmation. It does not edit commission or payout records."
COMMISSION_PAYOUT_SOURCE_MODEL = "CommissionPayoutBatch"
COMMISSION_PAYOUT_EVENT_KEYS = {"commission_payout", "commission_settlement", "partner_commission_payout", "commission_payable_settlement"}
COMMISSION_PAYOUT_EVENT_KEY = "partner_commission_payout"
COMMISSION_PAYOUT_PURPOSE_BY_EVENT = {key: key.upper() for key in COMMISSION_PAYOUT_EVENT_KEYS}
COMMISSION_PAYOUT_LABEL_BY_EVENT = {
    "commission_payout": "Commission payout",
    "commission_settlement": "Commission settlement",
    "partner_commission_payout": "Partner commission payout",
    "commission_payable_settlement": "Commission payable settlement",
}
SKIPPED_COMMISSION_PAYOUT_EVENT_KEY = "commission_payout_skipped_not_applicable"
UNSUPPORTED_COMMISSION_PAYOUT_EVENT_KEY = "unsupported_commission_payout"
COMMISSION_PAYOUT_SAFETY_TEXT = (
    "Preview is read-only. Posting creates accounting entries only after explicit admin confirmation. "
    "It does not edit commission, payout, partner, or payment records."
)

RECEIPT_SOURCE_MODEL = "ReceiptDocument"
RECEIPT_EVENT_KEYS = {"direct_sale_receipt", "customer_advance", "customer_refund", "refund_customer_credit"}
RECEIPT_PURPOSE_BY_EVENT = {"direct_sale_receipt": "DIRECT_SALE_RECEIPT", "customer_advance": "CUSTOMER_ADVANCE", "customer_refund": "CUSTOMER_REFUND", "refund_customer_credit": "REFUND_CUSTOMER_CREDIT"}
RECEIPT_LABEL_BY_EVENT = {"direct_sale_receipt": "Direct sale receipt", "customer_advance": "Customer advance / unapplied receipt", "customer_refund": "Customer refund", "refund_customer_credit": "Refund / customer credit"}
SKIPPED_RECEIPT_EVENT_KEY = "receipt_skipped_not_applicable"
UNSUPPORTED_RECEIPT_EVENT_KEY = "unsupported_receipt"

BILLING_INVOICE_SOURCE_MODEL = "BillingInvoice"
BILLING_INVOICE_EVENT_KEYS = {"direct_sale_invoice", "direct_sale_outstanding"}
BILLING_INVOICE_PURPOSE_BY_EVENT = {"direct_sale_invoice": "DIRECT_SALE_INVOICE", "direct_sale_outstanding": "DIRECT_SALE_OUTSTANDING"}
BILLING_INVOICE_LABEL_BY_EVENT = {"direct_sale_invoice": "Direct sale invoice", "direct_sale_outstanding": "Direct sale outstanding"}
SKIPPED_INVOICE_EVENT_KEY = "invoice_skipped_not_applicable"
UNSUPPORTED_INVOICE_EVENT_KEY = "unsupported_invoice"

CREDIT_NOTE_SOURCE_MODEL = "BillingCreditNote"
DIRECT_SALE_RETURN_SOURCE_MODEL = "DirectSaleReturn"
CREDIT_RETURN_EVENT_KEYS = {"credit_note_issue", "sales_return", "customer_credit_adjustment", "direct_sale_return"}
CREDIT_RETURN_PURPOSE_BY_EVENT = {"credit_note_issue": "CREDIT_NOTE_ISSUE", "sales_return": "SALES_RETURN", "customer_credit_adjustment": "CUSTOMER_CREDIT_ADJUSTMENT", "direct_sale_return": "DIRECT_SALE_RETURN"}
CREDIT_RETURN_LABEL_BY_EVENT = {"credit_note_issue": "Credit note issue", "sales_return": "Sales return", "customer_credit_adjustment": "Customer credit adjustment", "direct_sale_return": "Direct sale return"}
SKIPPED_CREDIT_RETURN_EVENT_KEY = "credit_return_skipped_not_applicable"
UNSUPPORTED_CREDIT_RETURN_EVENT_KEY = "unsupported_credit_return"
NO_SAFE_RETURN_DATE_BLOCKER = "DirectSaleReturn has no approved_at, return_date, or created_at value; bridge posting date cannot be resolved safely."

DEBIT_NOTE_SOURCE_MODEL = "BillingDebitNote"
DEBIT_NOTE_EVENT_KEYS = {"debit_note_issue", "customer_debit_adjustment", "damage_recovery", "additional_receivable_adjustment"}
DEBIT_NOTE_PURPOSE_BY_EVENT = {"debit_note_issue": "DEBIT_NOTE_ISSUE", "customer_debit_adjustment": "CUSTOMER_DEBIT_ADJUSTMENT", "damage_recovery": "DAMAGE_RECOVERY", "additional_receivable_adjustment": "ADDITIONAL_RECEIVABLE_ADJUSTMENT"}
DEBIT_NOTE_LABEL_BY_EVENT = {"debit_note_issue": "Debit note issue", "customer_debit_adjustment": "Customer debit adjustment", "damage_recovery": "Damage recovery", "additional_receivable_adjustment": "Additional receivable adjustment"}
SKIPPED_DEBIT_NOTE_EVENT_KEY = "debit_note_skipped_not_applicable"
UNSUPPORTED_DEBIT_NOTE_EVENT_KEY = "unsupported_debit_note"

RENT_LEASE_DEMAND_SOURCE_MODEL = "RentLeaseBillingDemand"
RENT_LEASE_REVENUE_EVENT_KEYS = {"rent_monthly_revenue", "lease_monthly_revenue", "rent_invoice_revenue", "lease_invoice_revenue", "rent_lease_invoice_revenue"}
RENT_LEASE_REVENUE_PURPOSE_BY_EVENT = {key: key.upper() for key in RENT_LEASE_REVENUE_EVENT_KEYS}
RENT_LEASE_REVENUE_LABEL_BY_EVENT = {
    "rent_monthly_revenue": "Rent monthly revenue",
    "lease_monthly_revenue": "Lease monthly revenue",
    "rent_invoice_revenue": "Rent invoice revenue",
    "lease_invoice_revenue": "Lease invoice revenue",
    "rent_lease_invoice_revenue": "Rent/lease invoice revenue",
}
SKIPPED_RENT_LEASE_REVENUE_EVENT_KEY = "rent_lease_revenue_skipped_not_applicable"
UNSUPPORTED_RENT_LEASE_REVENUE_EVENT_KEY = "unsupported_rent_lease_revenue"
RENT_LEASE_REVENUE_SAFETY_TEXT = (
    "Preview is read-only. Posting creates accounting entries only after explicit admin confirmation. "
    "It does not edit invoice, contract, payment, receipt, or security deposit records."
)


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


def _as_date(value: Any) -> date | None:
    if isinstance(value, datetime):
        return timezone.localdate(value) if timezone.is_aware(value) else value.date()
    if isinstance(value, date):
        return value
    return None


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
    return None if account is None else {"id": account.id, "code": account.code, "name": account.name}


def _finance_account_payload(account: FinanceAccount | None) -> dict[str, Any] | None:
    return None if account is None else {"id": account.id, "name": account.name, "kind": account.kind, "is_active": account.is_active, "chart_account": _account_payload(account.chart_account)}


def _journal_payload(journal: JournalEntry | None) -> dict[str, Any] | None:
    if journal is None:
        return None
    return {"id": journal.id, "entry_no": journal.entry_no, "entry_date": journal.entry_date.isoformat() if journal.entry_date else None, "status": journal.status, "source_model": journal.source_model, "source_id": journal.source_id, "voucher_type": journal.voucher_type, "accounting_period": journal.accounting_period_id, "accounting_period_code": getattr(journal.accounting_period, "code", None), "financial_year": journal.financial_year_id, "financial_year_code": getattr(journal.financial_year, "code", None)}


def _bridge_query_href(*, source_model: str | None = None, event_key: str | None = None, status: str | None = None) -> str:
    params = []
    if source_model:
        params.append(("source_model", source_model))
    if event_key:
        params.append(("event_key", event_key))
    if status:
        params.append(("status", status))
    if not params:
        return BRIDGE_POSTING_HREF
    from urllib.parse import urlencode
    return f"{BRIDGE_POSTING_HREF}?{urlencode(params)}"


def _action_link(key: str, label: str, href: str, *, reason: str | None = None, disabled: bool = False) -> dict[str, Any]:
    return {"key": key, "label": label, "href": href, "reason": reason, "disabled": disabled}


def _candidate_action_links(
    *,
    source_model: str,
    event_key: str,
    postability: dict[str, Any],
    journal: JournalEntry | None,
    reconciliation_item: ReconciliationItem | None,
    finance_account: FinanceAccount | None,
) -> list[dict[str, Any]]:
    status = str(postability.get("status") or "")
    blocker_code = str(postability.get("blocker_code") or "")
    blocker_reason = postability.get("blocker_reason")
    links: list[dict[str, Any]] = []
    mapping_blocked = status == "BLOCKED_BY_MAPPING" or "MAPPING" in blocker_code or "COA" in blocker_code
    finance_blocked = status == "BLOCKED_BY_FINANCE_ACCOUNT" or "FINANCE_ACCOUNT" in blocker_code or finance_account is None or bool(finance_account and not finance_account.is_active)
    if mapping_blocked:
        links.append(_action_link("chart_of_accounts", "Chart of Accounts", COA_SETUP_HREF, reason=blocker_reason))
    if finance_blocked:
        links.append(_action_link("finance_accounts", "Finance Accounts", FINANCE_ACCOUNTS_HREF, reason=blocker_reason))
    if status == "BLOCKED_BY_MAPPING":
        links.append(_action_link("mapping_audit", "Mapping Audit", MAPPING_AUDIT_HREF, reason=blocker_reason))
    if status == "BLOCKED_BY_PERIOD":
        links.append(_action_link("accounting_periods", "Accounting Periods", ACCOUNTING_PERIODS_HREF, reason=blocker_reason))
    if status == "BLOCKED_BY_NUMBERING":
        links.append(_action_link("journal_numbering", "Journal Numbering", DOCUMENT_NUMBERING_HREF, reason=blocker_reason))
    if journal:
        links.append(_action_link("journal_entries", "View Journal", f"{JOURNALS_HREF}/{journal.id}"))
    if journal or reconciliation_item or status in {"POSTED", "RECONCILED"}:
        links.append(_action_link("reconciliation", "Reconciliation", RECONCILIATION_RUNS_HREF))
    links.append(_action_link("bridge_posting", "Open Posting", _bridge_query_href(source_model=source_model, event_key=event_key, status=status if status else None)))
    return links


def _line_payload(*, account: ChartOfAccount, description: str, debit: Any = "0.00", credit: Any = "0.00") -> dict[str, Any]:
    return {"chart_account": _account_payload(account), "description": description, "debit_amount": f"{_money(debit):.2f}", "credit_amount": f"{_money(credit):.2f}"}


def _chart_by_system_code(system_code: str) -> ChartOfAccount | None:
    return ChartOfAccount.objects.filter(system_code=system_code, is_active=True).order_by("id").first()


def _posting_profile_account(key: str) -> ChartOfAccount | None:
    profile = AccountingPostingProfile.objects.select_related("chart_account").filter(key=key, is_active=True, chart_account__is_active=True).order_by("id").first()
    return profile.chart_account if profile and profile.chart_account else _chart_by_system_code(key)


def _customer_receivable_account() -> ChartOfAccount | None:
    return _posting_profile_account("CUSTOMER_RECEIVABLE")


def _customer_advance_account() -> ChartOfAccount | None:
    return _posting_profile_account("CUSTOMER_ADVANCE_UNEARNED_REVENUE")


def _commission_expense_account() -> ChartOfAccount | None:
    return _posting_profile_account("COMMISSION_EXPENSE") or _posting_profile_account("PARTNER_COMMISSION_EXPENSE")


def _commission_payable_account() -> ChartOfAccount | None:
    return _posting_profile_account("COMMISSION_PAYABLE") or _posting_profile_account("PARTNER_COMMISSION_PAYABLE")


def _sales_return_account() -> ChartOfAccount | None:
    return _posting_profile_account("SALES_RETURNS") or _customer_receivable_account()


def _sales_revenue_account() -> ChartOfAccount | None:
    return _posting_profile_account("DIRECT_SALE_INCOME") or _posting_profile_account("SALES_REVENUE")


def _damage_recovery_income_account() -> ChartOfAccount | None:
    return _posting_profile_account("DAMAGE_RECOVERY_INCOME") or _posting_profile_account("DAMAGE_RECOVERY") or _sales_revenue_account()


def _adjustment_income_account() -> ChartOfAccount | None:
    return _posting_profile_account("ADJUSTMENT_INCOME") or _posting_profile_account("CUSTOMER_DEBIT_ADJUSTMENT") or _sales_revenue_account()


def _output_gst_account() -> ChartOfAccount | None:
    return _posting_profile_account("OUTPUT_GST")


def _rent_revenue_account() -> ChartOfAccount | None:
    return _posting_profile_account("RENT_INCOME") or _posting_profile_account("RENT_REVENUE")


def _lease_revenue_account() -> ChartOfAccount | None:
    return _posting_profile_account("LEASE_INCOME") or _posting_profile_account("LEASE_REVENUE")


def _source_reference(payment: Payment) -> str:
    return payment.reference_no or f"PAY-{payment.id}"


def _receipt_reference(receipt: ReceiptDocument) -> str:
    return receipt.receipt_no or receipt.source_reference or f"RCT-{receipt.id}"


def _invoice_reference(invoice: BillingInvoice) -> str:
    return invoice.document_no or invoice.source_reference or f"INV-{invoice.id}"


def _credit_note_reference(note: BillingCreditNote) -> str:
    return note.note_no or f"CN-{note.id}"


def _debit_note_reference(note: BillingDebitNote) -> str:
    return note.note_no or f"DN-{note.id}"


def _rent_lease_reference(demand: RentLeaseBillingDemand) -> str:
    return demand.reference_key or f"RLD-{demand.id}"


def _commission_reference(commission: Commission) -> str:
    if commission.payment_id and getattr(commission.payment, "reference_no", None):
        return f"COMM-{commission.id}-{commission.payment.reference_no}"
    return f"COMM-{commission.id}"


def _commission_payout_reference(batch: CommissionPayoutBatch) -> str:
    return batch.reference_no or batch.batch_code or f"CPB-{batch.id}"


def _return_reference(row: DirectSaleReturn) -> str:
    return row.return_no or f"RET-{row.id}"


def _commission_date(commission: Commission) -> date | None:
    payment_date = getattr(getattr(commission, "payment", None), "payment_date", None)
    if isinstance(payment_date, date):
        return payment_date
    return _as_date(getattr(commission, "created_at", None))


def _partner_display(commission: Commission) -> str:
    partner = commission.partner
    full_name = ""
    if hasattr(partner, "get_full_name"):
        full_name = partner.get_full_name()
    return full_name or getattr(partner, "name", None) or getattr(partner, "username", None) or f"Partner #{commission.partner_id}"


def _user_display(user) -> str:
    if user is None:
        return ""
    full_name = user.get_full_name() if hasattr(user, "get_full_name") else ""
    return full_name or getattr(user, "name", None) or getattr(user, "username", None) or f"User #{getattr(user, 'id', '')}"


def _commission_payout_partner(batch: CommissionPayoutBatch):
    line = next(iter(list(batch.lines.all()[:1])), None)
    return getattr(line, "partner", None)


def _commission_payout_line_count(batch: CommissionPayoutBatch) -> int:
    prefetched = getattr(batch, "_prefetched_objects_cache", {}).get("lines")
    return len(prefetched) if prefetched is not None else batch.lines.count()


def _customer_display(commission: Commission) -> str | None:
    if commission.subscription_id and getattr(commission.subscription, "customer", None):
        return commission.subscription.customer.name
    if commission.payment_id and getattr(commission.payment, "customer", None):
        return commission.payment.customer.name
    return None


def _commission_snapshot(commission: Commission) -> dict[str, Any]:
    return {
        "partner_id": commission.partner_id,
        "subscription_id": commission.subscription_id,
        "payment_id": commission.payment_id,
        "emi_id": commission.emi_id,
        "commission_rate": commission.commission_rate,
        "commission_amount": commission.commission_amount,
        "status": commission.status,
        "settlement_date": commission.settlement_date,
        "reversal_reason": commission.reversal_reason,
        "metadata": commission.metadata,
    }


def _commission_payout_snapshot(batch: CommissionPayoutBatch) -> dict[str, Any]:
    return {
        "batch_code": batch.batch_code,
        "payout_date": batch.payout_date,
        "finance_account_id": batch.finance_account_id,
        "reference_no": batch.reference_no,
        "processed_by_id": batch.processed_by_id,
        "status": batch.status,
        "notes": batch.notes,
        "total_amount": batch.total_amount,
    }


def _commission_payout_lines_snapshot(batch: CommissionPayoutBatch) -> list[tuple[int, int, int, Decimal]]:
    return list(batch.lines.order_by("id").values_list("id", "commission_id", "partner_id", "amount"))


def _rent_lease_demand_snapshot(demand: RentLeaseBillingDemand) -> dict[str, Any]:
    return {
        "subscription_id": demand.subscription_id,
        "demand_type": demand.demand_type,
        "status": demand.status,
        "billing_period_start": demand.billing_period_start,
        "billing_period_end": demand.billing_period_end,
        "due_date": demand.due_date,
        "amount": demand.amount,
        "collected_amount": demand.collected_amount,
        "held_amount": demand.held_amount,
        "refundable_amount": demand.refundable_amount,
        "deducted_amount": demand.deducted_amount,
        "reference_key": demand.reference_key,
        "metadata": demand.metadata,
        "tax_profile_snapshot": demand.tax_profile_snapshot,
    }


def _direct_sale_return_operational_date(row: DirectSaleReturn) -> tuple[date | None, str | None]:
    if row.status == DirectSaleReturnStatus.APPROVED:
        approved_date = _as_date(row.approved_at)
        if approved_date is not None:
            return approved_date, None
    return_date = _as_date(getattr(row, "return_date", None))
    if return_date is not None:
        return return_date, None
    created_date = _as_date(getattr(row, "created_at", None))
    if created_date is not None:
        return created_date, None
    return None, NO_SAFE_RETURN_DATE_BLOCKER


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
    finance_account, reason, _ids = _resolve_payment_finance_account(payment)
    if reason:
        warnings.append(f"Finance account is not ready for {payment.method or 'CASH'} collection: {reason}.")
    clearing_account = _customer_receivable_account()
    if clearing_account is None:
        warnings.append("CUSTOMER_RECEIVABLE chart account is missing or inactive.")
    if finance_account is None or clearing_account is None:
        return [], warnings, finance_account
    return [{"chart_account": finance_account.chart_account, "description": f"{(payment.method or 'CASH').strip().upper()} collection", "debit_amount": payment.amount, "credit_amount": Decimal("0.00")}, {"chart_account": clearing_account, "description": "Customer receivable clearing", "debit_amount": Decimal("0.00"), "credit_amount": payment.amount}], warnings, finance_account


def _classify_receipt_event(receipt: ReceiptDocument) -> tuple[str, str, str | None]:
    status = (receipt.status or "").strip().upper()
    if status in {BillingDocumentStatus.CANCELLED, BillingDocumentStatus.VOID}:
        return SKIPPED_RECEIPT_EVENT_KEY, "Receipt skipped", "Voided/cancelled receipts are skipped in Phase F2; reversal events are out of scope."
    if receipt.payment_id or receipt.receipt_type == ReceiptType.EMI_PAYMENT_RECEIPT:
        return SKIPPED_RECEIPT_EVENT_KEY, "Receipt skipped", "EMI payment receipts are accounted through the concrete Payment bridge candidate."
    source_type = (receipt.source_type or "").strip().upper()
    if receipt.receipt_type == ReceiptType.RETAIL_RECEIPT and (receipt.direct_sale_id or source_type == BillingSourceType.DIRECT_SALE or getattr(receipt.billing_invoice, "direct_sale_id", None)):
        return "direct_sale_receipt", RECEIPT_LABEL_BY_EVENT["direct_sale_receipt"], None
    if receipt.receipt_type == ReceiptType.RETAIL_RECEIPT and not receipt.direct_sale_id and not receipt.billing_invoice_id and source_type in {BillingSourceType.MANUAL, "OTHER", ""}:
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
        return [], [*warnings, "Receipt amount must be greater than zero."], finance_account
    if event_key == "direct_sale_receipt":
        credit_account = _customer_receivable_account()
        if credit_account is None:
            return [], [*warnings, "CUSTOMER_RECEIVABLE chart account is missing or inactive."], finance_account
        return [{"chart_account": finance_account.chart_account, "description": "Receipt collection", "debit_amount": amount, "credit_amount": Decimal("0.00")}, {"chart_account": credit_account, "description": "Customer receivable clearing", "debit_amount": Decimal("0.00"), "credit_amount": amount}], warnings, finance_account
    if event_key == "customer_advance":
        credit_account = _customer_advance_account()
        if credit_account is None:
            return [], [*warnings, "CUSTOMER_ADVANCE_UNEARNED_REVENUE chart account is missing or inactive."], finance_account
        return [{"chart_account": finance_account.chart_account, "description": "Customer advance collection", "debit_amount": amount, "credit_amount": Decimal("0.00")}, {"chart_account": credit_account, "description": "Customer advance liability", "debit_amount": Decimal("0.00"), "credit_amount": amount}], warnings, finance_account
    if event_key == "customer_refund":
        debit_account = _customer_advance_account() or _customer_receivable_account()
        if debit_account is None:
            return [], [*warnings, "Customer advance / receivable account is missing or inactive."], finance_account
        return [{"chart_account": debit_account, "description": "Customer refund settlement", "debit_amount": amount, "credit_amount": Decimal("0.00")}, {"chart_account": finance_account.chart_account, "description": "Refund paid", "debit_amount": Decimal("0.00"), "credit_amount": amount}], warnings, finance_account
    if event_key == "refund_customer_credit":
        debit_account = _sales_return_account()
        if debit_account is None:
            return [], [*warnings, "Sales return / customer receivable account is missing or inactive."], finance_account
        return [{"chart_account": debit_account, "description": "Refund / customer credit adjustment", "debit_amount": amount, "credit_amount": Decimal("0.00")}, {"chart_account": finance_account.chart_account, "description": "Refund / credit paid", "debit_amount": Decimal("0.00"), "credit_amount": amount}], warnings, finance_account
    return [], [*warnings, "Unsupported ReceiptDocument event for Phase F2."], finance_account


def _classify_invoice_event(invoice: BillingInvoice) -> tuple[str, str, str | None]:
    status = (invoice.status or "").strip().upper()
    if status in {BillingDocumentStatus.DRAFT, BillingDocumentStatus.CANCELLED, BillingDocumentStatus.VOID}:
        return SKIPPED_INVOICE_EVENT_KEY, "Invoice skipped", "Draft, cancelled, or voided invoices are skipped and are not bridge-postable."
    if invoice.document_type != BillingInvoiceType.INVOICE:
        return UNSUPPORTED_INVOICE_EVENT_KEY, "Unsupported invoice", "Only BillingInvoice document_type=INVOICE is supported in Phase F3."
    if invoice.source_type == BillingSourceType.SUBSCRIPTION or invoice.subscription_id:
        return UNSUPPORTED_INVOICE_EVENT_KEY, "Unsupported invoice", "Rent/lease/subscription invoice posting is deferred; deposit/liability rules are out of Phase F3 scope."
    if invoice.source_type == BillingSourceType.DIRECT_SALE or invoice.direct_sale_id:
        return "direct_sale_invoice", BILLING_INVOICE_LABEL_BY_EVENT["direct_sale_invoice"], None
    if invoice.source_type == BillingSourceType.MANUAL and _money(invoice.balance_total) > Decimal("0.00"):
        return "direct_sale_outstanding", BILLING_INVOICE_LABEL_BY_EVENT["direct_sale_outstanding"], None
    return UNSUPPORTED_INVOICE_EVENT_KEY, "Unsupported invoice", "BillingInvoice source_type cannot be classified safely for Phase F3 bridge posting."


def _invoice_lines(invoice: BillingInvoice, event_key: str) -> tuple[list[dict[str, Any]], list[str], None]:
    warnings: list[str] = []
    if event_key not in BILLING_INVOICE_EVENT_KEYS:
        return [], ["Unsupported BillingInvoice event for Phase F3."], None
    amount = _money(invoice.grand_total)
    tax = _money(invoice.tax_total)
    taxable = _money(invoice.taxable_total) or amount - tax
    if amount <= Decimal("0.00"):
        warnings.append("BillingInvoice grand_total must be greater than zero.")
    if taxable <= Decimal("0.00"):
        warnings.append("BillingInvoice taxable amount cannot be resolved safely.")
    receivable = _customer_receivable_account()
    revenue = _sales_revenue_account()
    gst = _output_gst_account() if tax > Decimal("0.00") else None
    if receivable is None:
        warnings.append("CUSTOMER_RECEIVABLE posting profile/chart account is missing or inactive.")
    if revenue is None:
        warnings.append("DIRECT_SALE_INCOME / SALES_REVENUE posting profile/chart account is missing or inactive.")
    if tax > Decimal("0.00") and gst is None:
        warnings.append("OUTPUT_GST posting profile/chart account is missing or inactive for taxable invoice.")
    if warnings:
        return [], warnings, None
    lines = [{"chart_account": receivable, "description": f"Invoice receivable {_invoice_reference(invoice)}", "debit_amount": amount, "credit_amount": Decimal("0.00")}, {"chart_account": revenue, "description": f"Invoice revenue {_invoice_reference(invoice)}", "debit_amount": Decimal("0.00"), "credit_amount": taxable}]
    if tax > Decimal("0.00"):
        lines.append({"chart_account": gst, "description": f"Output GST {_invoice_reference(invoice)}", "debit_amount": Decimal("0.00"), "credit_amount": tax})
    return lines, warnings, None


def _rent_lease_tax_amount(demand: RentLeaseBillingDemand) -> Decimal:
    snapshot = demand.tax_profile_snapshot or {}
    metadata = demand.metadata or {}
    for key in ("tax_amount", "tax_total", "gst_amount", "output_tax_amount"):
        if key in snapshot:
            return _money(snapshot.get(key))
        if key in metadata:
            return _money(metadata.get(key))
    return Decimal("0.00")


def _classify_rent_lease_revenue_event(demand: RentLeaseBillingDemand) -> tuple[str, str, str | None]:
    if demand.demand_type == RentLeaseDemandType.SECURITY_DEPOSIT:
        return SKIPPED_RENT_LEASE_REVENUE_EVENT_KEY, "Rent/lease revenue skipped", "Security deposit demand is outside Phase F14 revenue recognition."
    if demand.status in {RentLeaseDemandStatus.CANCELLED, RentLeaseDemandStatus.WAIVED}:
        return SKIPPED_RENT_LEASE_REVENUE_EVENT_KEY, "Rent/lease revenue skipped", "Cancelled or waived rent/lease demands are not revenue-recognition candidates."
    if demand.demand_type == RentLeaseDemandType.RENT_MONTHLY and getattr(demand.subscription, "plan_type", None) == PlanType.RENT:
        return "rent_monthly_revenue", RENT_LEASE_REVENUE_LABEL_BY_EVENT["rent_monthly_revenue"], None
    if demand.demand_type == RentLeaseDemandType.LEASE_MONTHLY and getattr(demand.subscription, "plan_type", None) == PlanType.LEASE:
        return "lease_monthly_revenue", RENT_LEASE_REVENUE_LABEL_BY_EVENT["lease_monthly_revenue"], None
    return UNSUPPORTED_RENT_LEASE_REVENUE_EVENT_KEY, "Unsupported rent/lease revenue", "Rent/lease demand type and subscription plan_type cannot be safely classified."


def _rent_lease_revenue_lines(demand: RentLeaseBillingDemand, event_key: str) -> tuple[list[dict[str, Any]], list[str], None]:
    warnings: list[str] = []
    if event_key not in RENT_LEASE_REVENUE_EVENT_KEYS:
        return [], ["Unsupported RentLeaseBillingDemand revenue event for Phase F14."], None
    amount = _money(demand.amount)
    tax = _rent_lease_tax_amount(demand)
    taxable = amount - tax
    if amount <= Decimal("0.00"):
        warnings.append("RentLeaseBillingDemand amount must be greater than zero.")
    if tax < Decimal("0.00") or taxable <= Decimal("0.00"):
        warnings.append("RentLeaseBillingDemand taxable amount cannot be resolved safely.")
    receivable = _customer_receivable_account()
    revenue = _rent_revenue_account() if event_key.startswith("rent_") else _lease_revenue_account()
    gst = _output_gst_account() if tax > Decimal("0.00") else None
    if receivable is None:
        warnings.append("CUSTOMER_RECEIVABLE posting profile/chart account is missing or inactive.")
    if revenue is None and event_key.startswith("rent_"):
        warnings.append("RENT_INCOME / RENT_REVENUE posting profile/chart account is missing or inactive.")
    if revenue is None and event_key.startswith("lease_"):
        warnings.append("LEASE_INCOME / LEASE_REVENUE posting profile/chart account is missing or inactive.")
    if tax > Decimal("0.00") and gst is None:
        warnings.append("OUTPUT_GST posting profile/chart account is missing or inactive for taxable rent/lease demand.")
    if warnings:
        return [], warnings, None
    reference = _rent_lease_reference(demand)
    label = "Rent" if event_key.startswith("rent_") else "Lease"
    lines = [
        {"chart_account": receivable, "description": f"{label} receivable {reference}", "debit_amount": amount, "credit_amount": Decimal("0.00")},
        {"chart_account": revenue, "description": f"{label} revenue {reference}", "debit_amount": Decimal("0.00"), "credit_amount": taxable},
    ]
    if tax > Decimal("0.00"):
        lines.append({"chart_account": gst, "description": f"Output GST {reference}", "debit_amount": Decimal("0.00"), "credit_amount": tax})
    return lines, warnings, None


def _classify_credit_note_event(note: BillingCreditNote) -> tuple[str, str, str | None]:
    if note.status in {BillingDocumentStatus.DRAFT, BillingDocumentStatus.CANCELLED, BillingDocumentStatus.VOID}:
        return SKIPPED_CREDIT_RETURN_EVENT_KEY, "Credit note skipped", "Draft/cancelled/void credit notes are skipped from controlled bridge posting."
    if note.status not in {BillingDocumentStatus.APPROVED, BillingDocumentStatus.POSTED}:
        return UNSUPPORTED_CREDIT_RETURN_EVENT_KEY, "Unsupported credit note", "Credit note status cannot be safely classified for posting."
    try:
        if getattr(note, "direct_sale_return", None) is not None or note.stock_effect:
            return "sales_return", CREDIT_RETURN_LABEL_BY_EVENT["sales_return"], None
    except Exception:
        if note.stock_effect:
            return "sales_return", CREDIT_RETURN_LABEL_BY_EVENT["sales_return"], None
    return "credit_note_issue", CREDIT_RETURN_LABEL_BY_EVENT["credit_note_issue"], None


def _credit_note_lines(note: BillingCreditNote, event_key: str) -> tuple[list[dict[str, Any]], list[str], None]:
    warnings: list[str] = []
    returns = _sales_return_account()
    receivable = _customer_receivable_account()
    tax = _money(note.tax_adjustment)
    gst = _output_gst_account() if tax > Decimal("0.00") else None
    taxable = _money(note.taxable_adjustment)
    total = _money(note.total_adjustment)
    if total <= Decimal("0.00"):
        warnings.append("Credit note total adjustment must be greater than zero.")
    if returns is None:
        warnings.append("SALES_RETURNS posting profile/chart account is missing or inactive.")
    if receivable is None:
        warnings.append("CUSTOMER_RECEIVABLE posting profile/chart account is missing or inactive.")
    if tax > Decimal("0.00") and gst is None:
        warnings.append("OUTPUT_GST posting profile/chart account is missing or inactive for tax reversal.")
    if warnings:
        return [], warnings, None
    lines = [{"chart_account": returns, "description": f"Credit note adjustment {_credit_note_reference(note)}", "debit_amount": taxable, "credit_amount": Decimal("0.00")}]
    if tax > Decimal("0.00"):
        lines.append({"chart_account": gst, "description": f"Output GST reversal {_credit_note_reference(note)}", "debit_amount": tax, "credit_amount": Decimal("0.00")})
    lines.append({"chart_account": receivable, "description": f"Customer receivable reduction {_credit_note_reference(note)}", "debit_amount": Decimal("0.00"), "credit_amount": total})
    return lines, warnings, None


def _classify_debit_note_event(note: BillingDebitNote) -> tuple[str, str, str | None]:
    if note.status in {BillingDocumentStatus.DRAFT, BillingDocumentStatus.CANCELLED, BillingDocumentStatus.VOID}:
        return SKIPPED_DEBIT_NOTE_EVENT_KEY, "Debit note skipped", "Draft/cancelled/void debit notes are skipped from controlled bridge posting."
    if note.status not in {BillingDocumentStatus.APPROVED, BillingDocumentStatus.POSTED}:
        return UNSUPPORTED_DEBIT_NOTE_EVENT_KEY, "Unsupported debit note", "Debit note status cannot be safely classified for posting."
    reason = (note.reason or "").strip().lower()
    if "damage" in reason or "recovery" in reason:
        return "damage_recovery", DEBIT_NOTE_LABEL_BY_EVENT["damage_recovery"], None
    if "adjust" in reason or "customer debit" in reason:
        return "customer_debit_adjustment", DEBIT_NOTE_LABEL_BY_EVENT["customer_debit_adjustment"], None
    if "additional" in reason or "extra" in reason:
        return "additional_receivable_adjustment", DEBIT_NOTE_LABEL_BY_EVENT["additional_receivable_adjustment"], None
    return "debit_note_issue", DEBIT_NOTE_LABEL_BY_EVENT["debit_note_issue"], None


def _debit_note_income_account(event_key: str) -> ChartOfAccount | None:
    if event_key == "damage_recovery":
        return _damage_recovery_income_account()
    if event_key in {"customer_debit_adjustment", "additional_receivable_adjustment"}:
        return _adjustment_income_account()
    return _sales_revenue_account()


def _debit_note_lines(note: BillingDebitNote, event_key: str) -> tuple[list[dict[str, Any]], list[str], None]:
    warnings: list[str] = []
    receivable = _customer_receivable_account()
    income = _debit_note_income_account(event_key)
    tax = _money(note.tax_adjustment)
    gst = _output_gst_account() if tax > Decimal("0.00") else None
    taxable = _money(note.taxable_adjustment)
    total = _money(note.total_adjustment)
    if event_key not in DEBIT_NOTE_EVENT_KEYS:
        warnings.append("Unsupported BillingDebitNote event for Phase F5.")
    if total <= Decimal("0.00"):
        warnings.append("Debit note total adjustment must be greater than zero.")
    if taxable <= Decimal("0.00"):
        warnings.append("Debit note taxable adjustment cannot be resolved safely.")
    if receivable is None:
        warnings.append("CUSTOMER_RECEIVABLE posting profile/chart account is missing or inactive.")
    if income is None:
        warnings.append("Sales revenue / adjustment income posting profile/chart account is missing or inactive.")
    if tax > Decimal("0.00") and gst is None:
        warnings.append("OUTPUT_GST posting profile/chart account is missing or inactive for debit note tax posting.")
    if warnings:
        return [], warnings, None
    lines = [{"chart_account": receivable, "description": f"Debit note receivable {_debit_note_reference(note)}", "debit_amount": total, "credit_amount": Decimal("0.00")}, {"chart_account": income, "description": f"Debit note income {_debit_note_reference(note)}", "debit_amount": Decimal("0.00"), "credit_amount": taxable}]
    if tax > Decimal("0.00"):
        lines.append({"chart_account": gst, "description": f"Output GST {_debit_note_reference(note)}", "debit_amount": Decimal("0.00"), "credit_amount": tax})
    return lines, warnings, None


def _classify_commission_event(commission: Commission) -> tuple[str, str, str | None, bool]:
    status = (commission.status or "").strip().upper()
    if status == CommissionStatus.REVERSED:
        return SKIPPED_COMMISSION_EVENT_KEY, "Commission skipped", "Reversed commissions have no accrual posting impact in Phase F10.", False
    if status == CommissionStatus.SETTLED:
        return SKIPPED_COMMISSION_EVENT_KEY, "Commission skipped", "Settled legacy commissions are treated as already paid/settled and are not accrual-posted in Phase F10.", False
    if status != CommissionStatus.PENDING:
        return UNSUPPORTED_COMMISSION_EVENT_KEY, "Unsupported commission", "Commission status cannot be safely classified for accrual posting.", False
    amount = _money(commission.commission_amount)
    if amount <= Decimal("0.00"):
        return UNSUPPORTED_COMMISSION_EVENT_KEY, "Unsupported commission", "Commission amount must be greater than zero for accrual posting.", False
    return COMMISSION_EVENT_KEY, COMMISSION_LABEL_BY_EVENT[COMMISSION_EVENT_KEY], None, False


def _commission_lines(commission: Commission, event_key: str) -> tuple[list[dict[str, Any]], list[str], None]:
    warnings: list[str] = []
    if event_key not in COMMISSION_EVENT_KEYS:
        return [], ["Unsupported Commission accrual event for Phase F10."], None
    amount = _money(commission.commission_amount)
    if amount <= Decimal("0.00"):
        warnings.append("Commission amount must be greater than zero.")
    expense = _commission_expense_account()
    payable = _commission_payable_account()
    if expense is None:
        warnings.append("COMMISSION_EXPENSE posting profile/chart account is missing or inactive.")
    if payable is None:
        warnings.append("COMMISSION_PAYABLE posting profile/chart account is missing or inactive.")
    if warnings:
        return [], warnings, None
    reference = _commission_reference(commission)
    return [
        {"chart_account": expense, "description": f"Commission expense {reference}", "debit_amount": amount, "credit_amount": Decimal("0.00")},
        {"chart_account": payable, "description": f"Commission payable {reference}", "debit_amount": Decimal("0.00"), "credit_amount": amount},
    ], warnings, None


def _classify_commission_payout_event(batch: CommissionPayoutBatch) -> tuple[str, str, str | None, bool]:
    status = (batch.status or "").strip().upper()
    if status == CommissionPayoutBatch.Status.CANCELLED:
        return SKIPPED_COMMISSION_PAYOUT_EVENT_KEY, "Commission payout skipped", "Cancelled payout batches have no payout settlement posting impact.", False
    if status == CommissionPayoutBatch.Status.DRAFT:
        return COMMISSION_PAYOUT_EVENT_KEY, COMMISSION_PAYOUT_LABEL_BY_EVENT[COMMISSION_PAYOUT_EVENT_KEY], "Payout batch must be finalized before settlement posting.", True
    if status != CommissionPayoutBatch.Status.FINALIZED:
        return UNSUPPORTED_COMMISSION_PAYOUT_EVENT_KEY, "Unsupported commission payout", "Commission payout batch status cannot be safely classified for payout settlement posting.", False
    amount = _money(batch.total_amount)
    if amount <= Decimal("0.00"):
        return UNSUPPORTED_COMMISSION_PAYOUT_EVENT_KEY, "Unsupported commission payout", "Commission payout batch total_amount must be greater than zero.", False
    if not batch.finance_account_id:
        return COMMISSION_PAYOUT_EVENT_KEY, COMMISSION_PAYOUT_LABEL_BY_EVENT[COMMISSION_PAYOUT_EVENT_KEY], "Commission payout batch has no finance account/payment source.", False
    return COMMISSION_PAYOUT_EVENT_KEY, COMMISSION_PAYOUT_LABEL_BY_EVENT[COMMISSION_PAYOUT_EVENT_KEY], None, False


def _commission_payout_lines(batch: CommissionPayoutBatch, event_key: str) -> tuple[list[dict[str, Any]], list[str], FinanceAccount | None]:
    warnings: list[str] = []
    if event_key not in COMMISSION_PAYOUT_EVENT_KEYS:
        return [], ["Unsupported CommissionPayoutBatch settlement event for Phase F11."], None
    amount = _money(batch.total_amount)
    if amount <= Decimal("0.00"):
        warnings.append("Commission payout batch total_amount must be greater than zero.")
    payable = _commission_payable_account()
    if payable is None:
        warnings.append("COMMISSION_PAYABLE posting profile/chart account is missing or inactive.")
    finance_account = batch.finance_account
    if finance_account is None:
        warnings.append("Commission payout batch finance account/payment source is missing.")
    elif not finance_account.is_active:
        warnings.append("Commission payout batch finance account is inactive.")
    elif not finance_account.chart_account_id or not finance_account.chart_account.is_active:
        warnings.append("Commission payout batch finance account is not mapped to an active chart account.")
    if warnings:
        return [], warnings, finance_account
    reference = _commission_payout_reference(batch)
    return [
        {"chart_account": payable, "description": f"Commission payable settlement {reference}", "debit_amount": amount, "credit_amount": Decimal("0.00")},
        {"chart_account": finance_account.chart_account, "description": f"Commission payout paid from {finance_account.name} {reference}", "debit_amount": Decimal("0.00"), "credit_amount": amount},
    ], warnings, finance_account


def _classify_return_event(row: DirectSaleReturn) -> tuple[str, str, str | None]:
    if row.status == DirectSaleReturnStatus.CANCELLED:
        return SKIPPED_CREDIT_RETURN_EVENT_KEY, "Return skipped", "Cancelled direct-sale returns are skipped from controlled bridge posting."
    if row.status != DirectSaleReturnStatus.APPROVED:
        return "direct_sale_return", CREDIT_RETURN_LABEL_BY_EVENT["direct_sale_return"], "Controlled approval is required before posting this return."
    return "direct_sale_return", CREDIT_RETURN_LABEL_BY_EVENT["direct_sale_return"], None


def _return_lines(row: DirectSaleReturn, event_key: str) -> tuple[list[dict[str, Any]], list[str], None]:
    warnings: list[str] = []
    returns = _sales_return_account()
    receivable = _customer_receivable_account()
    tax = _money(row.tax_total)
    gst = _output_gst_account() if tax > Decimal("0.00") else None
    taxable = _money(row.subtotal)
    total = _money(row.grand_total)
    if total <= Decimal("0.00"):
        warnings.append("DirectSaleReturn grand_total must be greater than zero.")
    if returns is None:
        warnings.append("SALES_RETURNS posting profile/chart account is missing or inactive.")
    if receivable is None:
        warnings.append("CUSTOMER_RECEIVABLE posting profile/chart account is missing or inactive.")
    if tax > Decimal("0.00") and gst is None:
        warnings.append("OUTPUT_GST posting profile/chart account is missing or inactive for return tax reversal.")
    if warnings:
        return [], warnings, None
    lines = [{"chart_account": returns, "description": f"Direct sale return {_return_reference(row)}", "debit_amount": taxable, "credit_amount": Decimal("0.00")}]
    if tax > Decimal("0.00"):
        lines.append({"chart_account": gst, "description": f"Output GST reversal {_return_reference(row)}", "debit_amount": tax, "credit_amount": Decimal("0.00")})
    lines.append({"chart_account": receivable, "description": f"Customer receivable reduction {_return_reference(row)}", "debit_amount": Decimal("0.00"), "credit_amount": total})
    return lines, warnings, None


def _preview_lines(lines: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [_line_payload(account=line["chart_account"], description=line.get("description", ""), debit=line.get("debit_amount"), credit=line.get("credit_amount")) for line in lines]


def _line_totals(lines: list[dict[str, Any]]) -> tuple[Decimal, Decimal]:
    return sum((_money(line.get("debit_amount")) for line in lines), Decimal("0.00")), sum((_money(line.get("credit_amount")) for line in lines), Decimal("0.00"))


def _source_period(source_date: date | None) -> AccountingPeriod | None:
    if source_date is None:
        return None
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


def _row_matches_date_filters(row: dict[str, Any], filters: BridgeCandidateFilters) -> bool:
    source_date_text = row.get("source_date")
    if not source_date_text:
        return not (filters.date_from or filters.date_to or filters.accounting_period or filters.financial_year)
    source_date = date.fromisoformat(source_date_text)
    if filters.date_from and source_date < filters.date_from:
        return False
    if filters.date_to and source_date > filters.date_to:
        return False
    if filters.accounting_period:
        period_lookup = Q(code__iexact=filters.accounting_period)
        if str(filters.accounting_period).isdigit():
            period_lookup |= Q(pk=int(filters.accounting_period))
        period = AccountingPeriod.objects.filter(period_lookup).first()
        return bool(period and period.start_date <= source_date <= period.end_date)
    if filters.financial_year:
        from accounting.models import FinancialYear
        year_lookup = Q(code__iexact=filters.financial_year)
        if str(filters.financial_year).isdigit():
            year_lookup |= Q(pk=int(filters.financial_year))
        year = FinancialYear.objects.filter(year_lookup).first()
        return bool(year and year.start_date <= source_date <= year.end_date)
    return True


def _reconciliation_qs(*, source_model: str, source_id: str):
    return ReconciliationItem.objects.filter(module="ACCOUNTING_BRIDGE_PHASE_F", source_type=source_model, source_id=source_id).order_by("-created_at", "-id")


def _latest_reconciliation_item(*, source_model: str, source_id: str) -> ReconciliationItem | None:
    return _reconciliation_qs(source_model=source_model, source_id=source_id).first()


def _latest_posting_reconciliation_item(*, source_model: str, source_id: str) -> ReconciliationItem | None:
    qs = _reconciliation_qs(source_model=source_model, source_id=source_id)
    return qs.filter(Q(exception_code="POSTED_UNVERIFIED") | Q(status=ReconciliationItemStatus.MATCHED)).first() or qs.first()


def _existing_bridge_for(*, source_model: str, source_id: str, purpose: str) -> AccountingBridgePosting | None:
    return AccountingBridgePosting.objects.filter(source_model=source_model, source_id=source_id, purpose=purpose).select_related("journal_entry", "journal_entry__accounting_period", "journal_entry__financial_year").first()


def _candidate_status_payload(*, event_key: str, event_label: str, module: str, source_model: str, raw_status: str, lines: list[dict[str, Any]], line_warnings: list[str], period: AccountingPeriod | None, source_date: date | None, journal: JournalEntry | None, reconciliation_item: ReconciliationItem | None, source_workflow_exists: bool, classification_reason: str | None = None, approval_required: bool = False) -> dict[str, Any]:
    if source_date is None:
        return {"status": "BLOCKED_BY_PERIOD", "canonical_status": "BLOCKED_BY_PERIOD", "can_post": False, "can_preview": False, "can_reconcile": False, "blocker_code": "SOURCE_DATE_MISSING", "blocker_reason": classification_reason or NO_SAFE_RETURN_DATE_BLOCKER, "recommended_action": "Fix the source workflow date before bridge posting.", "setup_href": "/admin/accounting/periods"}
    period_readiness = build_accounting_bridge_posting_period_readiness(reference_date=source_date, financial_year=getattr(period, "financial_year", None), period=period)
    bridge_row = {"event_key": event_key, "status": raw_status, "label": event_label, "blocking_reasons": [item for item in [classification_reason, *line_warnings] if item]}
    postability = evaluate_accounting_postability(event_key=event_key, event_label=event_label, module=module, source_model=source_model, bridge_row=bridge_row, period_readiness=period_readiness, source_workflow_exists=source_workflow_exists, posted=bool(journal), reconciled=bool(reconciliation_item and reconciliation_item.status == ReconciliationItemStatus.MATCHED), approval_required=approval_required, as_source_row=not bool(journal))
    if raw_status == "SKIPPED_NOT_APPLICABLE":
        return {**postability, "status": "SKIPPED_NOT_APPLICABLE", "canonical_status": "SKIPPED_NOT_APPLICABLE", "can_post": False, "can_preview": False, "blocker_code": "SKIPPED_NOT_APPLICABLE", "blocker_reason": classification_reason or "Source item is not applicable for bridge posting.", "recommended_action": "No bridge posting action is required for this source item."}
    if approval_required and not journal:
        return {**postability, "status": "BLOCKED_BY_APPROVAL", "canonical_status": "BLOCKED_BY_APPROVAL", "can_post": False, "can_preview": False, "blocker_code": "APPROVAL_REQUIRED", "blocker_reason": classification_reason or "Controlled approval is required before bridge posting.", "recommended_action": "Open approval workflow before posting."}
    if line_warnings and postability["status"] == "READY_UNPOSTED":
        first_warning = line_warnings[0]
        finance_account_blocked = "finance account" in first_warning.lower() or "FINANCE_ACCOUNT" in first_warning
        if finance_account_blocked:
            return {**postability, "status": "BLOCKED_BY_FINANCE_ACCOUNT", "canonical_status": "BLOCKED_BY_FINANCE_ACCOUNT", "can_post": False, "can_preview": False, "blocker_code": "FINANCE_ACCOUNT_NOT_READY", "blocker_reason": first_warning, "recommended_action": "Open Finance Accounts and activate/map the concrete payment account before posting."}
        return {**postability, "status": "BLOCKED_BY_MAPPING", "canonical_status": "BLOCKED_BY_MAPPING", "can_post": False, "can_preview": False, "blocker_code": "MAPPING_NOT_READY", "blocker_reason": first_warning, "recommended_action": "Fix required posting accounts before posting."}
    return postability


def _purpose_for_event(source_model: str, event_key: str) -> str:
    if source_model == COMMISSION_PAYOUT_SOURCE_MODEL:
        return COMMISSION_PAYOUT_PURPOSE_BY_EVENT.get(event_key, event_key.upper())
    if source_model == COMMISSION_SOURCE_MODEL:
        return COMMISSION_PURPOSE_BY_EVENT.get(event_key, event_key.upper())
    if source_model == "Payment":
        return PAYMENT_COLLECTION_PURPOSE
    if source_model == RECEIPT_SOURCE_MODEL:
        return RECEIPT_PURPOSE_BY_EVENT.get(event_key, event_key.upper())
    if source_model == BILLING_INVOICE_SOURCE_MODEL:
        return BILLING_INVOICE_PURPOSE_BY_EVENT.get(event_key, event_key.upper())
    if source_model == RENT_LEASE_DEMAND_SOURCE_MODEL:
        return RENT_LEASE_REVENUE_PURPOSE_BY_EVENT.get(event_key, event_key.upper())
    if source_model in {CREDIT_NOTE_SOURCE_MODEL, DIRECT_SALE_RETURN_SOURCE_MODEL}:
        return CREDIT_RETURN_PURPOSE_BY_EVENT.get(event_key, event_key.upper())
    if source_model == DEBIT_NOTE_SOURCE_MODEL:
        return DEBIT_NOTE_PURPOSE_BY_EVENT.get(event_key, event_key.upper())
    return event_key.upper()


def _candidate_payload(*, candidate_id: str, event_key: str, event_label: str, module: str, source_model: str, source_pk: int, source_display: str, source_reference: str, source_date: date | None, amount: Any, lines: list[dict[str, Any]], finance_account: FinanceAccount | None, period: AccountingPeriod | None, postability: dict[str, Any], journal: JournalEntry | None, reconciliation_item: ReconciliationItem | None, idempotency_key: str, taxable_amount: Any = None, tax_amount: Any = None, source_status: str | None = None, source_type: str | None = None) -> dict[str, Any]:
    total_debit, total_credit = _line_totals(lines)
    purpose = _purpose_for_event(source_model, event_key)
    existing_bridge = _existing_bridge_for(source_model=source_model, source_id=str(source_pk), purpose=purpose)
    posted_unverified = bool(journal and reconciliation_item and reconciliation_item.exception_code == "POSTED_UNVERIFIED" and reconciliation_item.status == ReconciliationItemStatus.NEEDS_REVIEW)
    source_date_text = source_date.isoformat() if source_date else None
    action_links = _candidate_action_links(source_model=source_model, event_key=event_key, postability=postability, journal=journal, reconciliation_item=reconciliation_item, finance_account=finance_account)
    return {"id": candidate_id, "bridge_candidate_id": candidate_id, "row_type": "bridge_candidate", "event_key": event_key, "event_label": event_label, "label": event_label, "module": module, "source_module": module, "source_model": source_model, "source_pk": source_pk, "source_id": str(source_pk), "source_type": source_type or source_model, "source_display": source_display, "source_reference_number": source_reference, "source_reference": source_reference, "source_date": source_date_text, "source_status": source_status, "accounting_period_id": getattr(period, "id", None), "accounting_period_code": getattr(period, "code", None), "accounting_period": _period_payload(period), "financial_year": getattr(getattr(period, "financial_year", None), "code", None), "fiscal_year": getattr(getattr(period, "financial_year", None), "code", None), "financial_year_id": getattr(period, "financial_year_id", None), "amount": f"{_money(amount):.2f}", "taxable_amount": f"{_money(taxable_amount):.2f}" if taxable_amount is not None else None, "tax_amount": f"{_money(tax_amount):.2f}" if tax_amount is not None else None, "debit_account_preview": [_line_payload(account=line["chart_account"], description=line.get("description", ""), debit=line.get("debit_amount")) for line in lines if _money(line.get("debit_amount")) > 0], "credit_account_preview": [_line_payload(account=line["chart_account"], description=line.get("description", ""), credit=line.get("credit_amount")) for line in lines if _money(line.get("credit_amount")) > 0], "finance_account": _finance_account_payload(finance_account), "finance_account_name": getattr(finance_account, "name", None), "finance_account_active": getattr(finance_account, "is_active", None), "canonical_status": postability["status"], "status": postability["status"], "reconciliation_state": "RECONCILED" if reconciliation_item and reconciliation_item.status == ReconciliationItemStatus.MATCHED else ("POSTED_UNVERIFIED" if posted_unverified else None), "posted_unverified": posted_unverified, "can_preview": postability["can_preview"], "can_post": postability["can_post"], "can_reconcile": postability["can_reconcile"], "blocker_code": postability["blocker_code"], "blocker_reason": postability["blocker_reason"], "approval_required": postability["status"] == "BLOCKED_BY_APPROVAL", "unsupported_source": postability["status"] == "UNSUPPORTED_SOURCE", "existing_journal_entry_id": getattr(journal, "id", None), "existing_accounting_bridge_posting_id": getattr(existing_bridge, "id", None), "existing_money_movement_id": None, "existing_reconciliation_item_id": getattr(reconciliation_item, "id", None), "journal_entry": _journal_payload(journal), "settlement_linked": False, "reconciliation_linked": reconciliation_item is not None, "reconciliation_items": [{"id": reconciliation_item.id, "status": reconciliation_item.status, "severity": reconciliation_item.severity, "exception_code": reconciliation_item.exception_code, "exception_message": reconciliation_item.exception_message}] if reconciliation_item else [], "idempotency_key": idempotency_key, "total_debit": f"{total_debit:.2f}", "total_credit": f"{total_credit:.2f}", "is_balanced": bool(lines and total_debit == total_credit), "exception_reasons": [postability["blocker_reason"]] if postability.get("blocker_code") else [], "operator_action": postability["recommended_action"], "recommended_action": postability["recommended_action"], "action_links": action_links, "action_href": _bridge_query_href(source_model=source_model, event_key=event_key, status=postability["status"]), "setup_href": postability["setup_href"], "preview_action_href": _bridge_query_href(source_model=source_model, event_key=event_key) if postability["can_preview"] else None, "post_action_href": _bridge_query_href(source_model=source_model, event_key=event_key) if postability["can_post"] else None, "source_action_href": None, "is_postable": postability["can_post"], "is_acknowledgeable": False}


def payment_candidate(payment: Payment) -> dict[str, Any]:
    bridge = _existing_bridge_for(source_model="Payment", source_id=str(payment.id), purpose=PAYMENT_COLLECTION_PURPOSE)
    journal = bridge.journal_entry if bridge else None
    item = _latest_posting_reconciliation_item(source_model="Payment", source_id=str(payment.id)) if journal else _latest_reconciliation_item(source_model="Payment", source_id=str(payment.id))
    period = getattr(journal, "accounting_period", None) or _source_period(payment.payment_date)
    lines, warnings, finance_account = _payment_lines(payment)
    postability = _candidate_status_payload(event_key=PAYMENT_COLLECTION_EVENT_KEY, event_label="Subscription EMI payment", module="subscriptions", source_model="Payment", raw_status="READY" if lines else "NOT_CONFIGURED", lines=lines, line_warnings=warnings, period=period, source_date=payment.payment_date, journal=journal, reconciliation_item=item, source_workflow_exists=True)
    return _candidate_payload(candidate_id=_candidate_id(source_model="Payment", source_pk=payment.id, event_key=PAYMENT_COLLECTION_EVENT_KEY), event_key=PAYMENT_COLLECTION_EVENT_KEY, event_label="Subscription EMI payment", module="subscriptions", source_model="Payment", source_pk=payment.id, source_display=f"Payment {_source_reference(payment)}", source_reference=_source_reference(payment), source_date=payment.payment_date, amount=payment.amount, lines=lines, finance_account=finance_account, period=period, postability=postability, journal=journal, reconciliation_item=item, idempotency_key=f"bridge:{PAYMENT_COLLECTION_PURPOSE}:Payment:{payment.id}:{payment.payment_date.isoformat()}:{_money(payment.amount):.2f}")


def commission_candidate(commission: Commission) -> dict[str, Any]:
    event_key, event_label, reason, approval_required = _classify_commission_event(commission)
    purpose = _purpose_for_event(COMMISSION_SOURCE_MODEL, event_key)
    bridge = _existing_bridge_for(source_model=COMMISSION_SOURCE_MODEL, source_id=str(commission.id), purpose=purpose)
    journal = bridge.journal_entry if bridge else None
    item = _latest_posting_reconciliation_item(source_model=COMMISSION_SOURCE_MODEL, source_id=str(commission.id)) if journal else _latest_reconciliation_item(source_model=COMMISSION_SOURCE_MODEL, source_id=str(commission.id))
    source_date = _commission_date(commission)
    period = getattr(journal, "accounting_period", None) or _source_period(source_date)
    lines, warnings, finance_account = _commission_lines(commission, event_key) if event_key in COMMISSION_EVENT_KEYS else ([], [reason] if reason else [], None)
    raw = "SKIPPED_NOT_APPLICABLE" if event_key == SKIPPED_COMMISSION_EVENT_KEY else "UNSUPPORTED_SOURCE" if event_key == UNSUPPORTED_COMMISSION_EVENT_KEY else "READY" if lines else "NOT_CONFIGURED"
    postability = _candidate_status_payload(event_key=event_key, event_label=event_label, module="subscriptions", source_model=COMMISSION_SOURCE_MODEL, raw_status=raw, lines=lines, line_warnings=warnings, period=period, source_date=source_date, journal=journal, reconciliation_item=item, source_workflow_exists=event_key in COMMISSION_EVENT_KEYS, classification_reason=reason, approval_required=approval_required)
    source_date_key = source_date.isoformat() if source_date else "NO_SAFE_DATE"
    payload = _candidate_payload(candidate_id=_candidate_id(source_model=COMMISSION_SOURCE_MODEL, source_pk=commission.id, event_key=event_key), event_key=event_key, event_label=event_label, module="subscriptions", source_model=COMMISSION_SOURCE_MODEL, source_pk=commission.id, source_display=f"Commission {_commission_reference(commission)}", source_reference=_commission_reference(commission), source_date=source_date, amount=commission.commission_amount, lines=lines, finance_account=finance_account, period=period, postability=postability, journal=journal, reconciliation_item=item, idempotency_key=f"bridge:{purpose}:Commission:{commission.id}:{source_date_key}:{_money(commission.commission_amount):.2f}", source_status=commission.status, source_type="COMMISSION")
    payload.update(
        {
            "commission_reference": _commission_reference(commission),
            "commission_status": commission.status,
            "commission_rate": f"{_money(commission.commission_rate):.2f}",
            "commission_amount": f"{_money(commission.commission_amount):.2f}",
            "partner_id": commission.partner_id,
            "partner_name": _partner_display(commission),
            "customer_name": _customer_display(commission),
            "subscription_id": commission.subscription_id,
            "payment_id": commission.payment_id,
            "payment_reference": getattr(commission.payment, "reference_no", None),
            "emi_id": commission.emi_id,
            "settlement_date": commission.settlement_date.isoformat() if commission.settlement_date else None,
            "payout_line_id": getattr(getattr(commission, "payout_line", None), "id", None),
        }
    )
    return payload


def commission_payout_candidate(batch: CommissionPayoutBatch) -> dict[str, Any]:
    event_key, event_label, reason, approval_required = _classify_commission_payout_event(batch)
    purpose = _purpose_for_event(COMMISSION_PAYOUT_SOURCE_MODEL, event_key)
    bridge = _existing_bridge_for(source_model=COMMISSION_PAYOUT_SOURCE_MODEL, source_id=str(batch.id), purpose=purpose)
    journal = bridge.journal_entry if bridge else None
    item = _latest_posting_reconciliation_item(source_model=COMMISSION_PAYOUT_SOURCE_MODEL, source_id=str(batch.id)) if journal else _latest_reconciliation_item(source_model=COMMISSION_PAYOUT_SOURCE_MODEL, source_id=str(batch.id))
    source_date = batch.payout_date
    period = getattr(journal, "accounting_period", None) or _source_period(source_date)
    lines, warnings, finance_account = _commission_payout_lines(batch, event_key) if event_key in COMMISSION_PAYOUT_EVENT_KEYS else ([], [reason] if reason else [], None)
    raw = "SKIPPED_NOT_APPLICABLE" if event_key == SKIPPED_COMMISSION_PAYOUT_EVENT_KEY else "UNSUPPORTED_SOURCE" if event_key == UNSUPPORTED_COMMISSION_PAYOUT_EVENT_KEY else "READY" if lines else "NOT_CONFIGURED"
    postability = _candidate_status_payload(event_key=event_key, event_label=event_label, module="subscriptions", source_model=COMMISSION_PAYOUT_SOURCE_MODEL, raw_status=raw, lines=lines, line_warnings=warnings, period=period, source_date=source_date, journal=journal, reconciliation_item=item, source_workflow_exists=event_key in COMMISSION_PAYOUT_EVENT_KEYS, classification_reason=reason, approval_required=approval_required)
    source_date_key = source_date.isoformat() if source_date else "NO_SAFE_DATE"
    partner = _commission_payout_partner(batch)
    payload = _candidate_payload(candidate_id=_candidate_id(source_model=COMMISSION_PAYOUT_SOURCE_MODEL, source_pk=batch.id, event_key=event_key), event_key=event_key, event_label=event_label, module="subscriptions", source_model=COMMISSION_PAYOUT_SOURCE_MODEL, source_pk=batch.id, source_display=f"Payout {_commission_payout_reference(batch)}", source_reference=_commission_payout_reference(batch), source_date=source_date, amount=batch.total_amount, lines=lines, finance_account=finance_account, period=period, postability=postability, journal=journal, reconciliation_item=item, idempotency_key=f"bridge:{purpose}:CommissionPayoutBatch:{batch.id}:{source_date_key}:{_money(batch.total_amount):.2f}", source_status=batch.status, source_type="COMMISSION_PAYOUT")
    if payload.get("reconciliation_state") == "POSTED_UNVERIFIED":
        payload["status"] = "POSTED_UNVERIFIED"
        payload["canonical_status"] = "POSTED_UNVERIFIED"
    payload.update(
        {
            "payout_batch_id": batch.id,
            "payout_batch_code": batch.batch_code,
            "payout_reference": _commission_payout_reference(batch),
            "payout_date": batch.payout_date.isoformat() if batch.payout_date else None,
            "payout_status": batch.status,
            "payout_amount": f"{_money(batch.total_amount):.2f}",
            "partner_id": getattr(partner, "id", None),
            "partner_name": _user_display(partner) if partner is not None else None,
            "processed_by_id": batch.processed_by_id,
            "processed_by_name": _user_display(batch.processed_by),
            "payment_method": getattr(batch.finance_account, "kind", None),
            "finance_account_name": getattr(batch.finance_account, "name", None),
            "related_commission_count": _commission_payout_line_count(batch),
            "reference_no": batch.reference_no,
        }
    )
    return payload


def receipt_candidate(receipt: ReceiptDocument) -> dict[str, Any]:
    event_key, event_label, reason = _classify_receipt_event(receipt)
    purpose = _purpose_for_event(RECEIPT_SOURCE_MODEL, event_key)
    bridge = _existing_bridge_for(source_model=RECEIPT_SOURCE_MODEL, source_id=str(receipt.id), purpose=purpose)
    journal = bridge.journal_entry if bridge else None
    item = _latest_posting_reconciliation_item(source_model=RECEIPT_SOURCE_MODEL, source_id=str(receipt.id)) if journal else _latest_reconciliation_item(source_model=RECEIPT_SOURCE_MODEL, source_id=str(receipt.id))
    period = getattr(journal, "accounting_period", None) or _source_period(receipt.receipt_date)
    lines, warnings, finance_account = _receipt_lines(receipt, event_key) if event_key in RECEIPT_EVENT_KEYS else ([], [reason] if reason else [], None)
    raw = "SKIPPED_NOT_APPLICABLE" if event_key == SKIPPED_RECEIPT_EVENT_KEY else "UNSUPPORTED_SOURCE" if event_key == UNSUPPORTED_RECEIPT_EVENT_KEY else "READY" if lines else "NOT_CONFIGURED"
    postability = _candidate_status_payload(event_key=event_key, event_label=event_label, module="billing", source_model=RECEIPT_SOURCE_MODEL, raw_status=raw, lines=lines, line_warnings=warnings, period=period, source_date=receipt.receipt_date, journal=journal, reconciliation_item=item, source_workflow_exists=event_key in RECEIPT_EVENT_KEYS, classification_reason=reason)
    payload = _candidate_payload(candidate_id=_candidate_id(source_model=RECEIPT_SOURCE_MODEL, source_pk=receipt.id, event_key=event_key), event_key=event_key, event_label=event_label, module="billing", source_model=RECEIPT_SOURCE_MODEL, source_pk=receipt.id, source_display=f"Receipt {_receipt_reference(receipt)}", source_reference=_receipt_reference(receipt), source_date=receipt.receipt_date, amount=receipt.amount, lines=lines, finance_account=finance_account, period=period, postability=postability, journal=journal, reconciliation_item=item, idempotency_key=f"bridge:{purpose}:ReceiptDocument:{receipt.id}:{receipt.receipt_date.isoformat()}:{_money(receipt.amount):.2f}", source_status=receipt.status, source_type=receipt.source_type)
    payload.update({"receipt_type": receipt.receipt_type, "receipt_status": receipt.status})
    return payload


def billing_invoice_candidate(invoice: BillingInvoice) -> dict[str, Any]:
    event_key, event_label, reason = _classify_invoice_event(invoice)
    purpose = _purpose_for_event(BILLING_INVOICE_SOURCE_MODEL, event_key)
    bridge = _existing_bridge_for(source_model=BILLING_INVOICE_SOURCE_MODEL, source_id=str(invoice.id), purpose=purpose)
    journal = bridge.journal_entry if bridge else None
    item = _latest_posting_reconciliation_item(source_model=BILLING_INVOICE_SOURCE_MODEL, source_id=str(invoice.id)) if journal else _latest_reconciliation_item(source_model=BILLING_INVOICE_SOURCE_MODEL, source_id=str(invoice.id))
    period = getattr(journal, "accounting_period", None) or _source_period(invoice.invoice_date)
    lines, warnings, finance_account = _invoice_lines(invoice, event_key) if event_key in BILLING_INVOICE_EVENT_KEYS else ([], [reason] if reason else [], None)
    raw = "SKIPPED_NOT_APPLICABLE" if event_key == SKIPPED_INVOICE_EVENT_KEY else "UNSUPPORTED_SOURCE" if event_key == UNSUPPORTED_INVOICE_EVENT_KEY else "READY" if lines else "NOT_CONFIGURED"
    postability = _candidate_status_payload(event_key=event_key, event_label=event_label, module="billing", source_model=BILLING_INVOICE_SOURCE_MODEL, raw_status=raw, lines=lines, line_warnings=warnings, period=period, source_date=invoice.invoice_date, journal=journal, reconciliation_item=item, source_workflow_exists=event_key in BILLING_INVOICE_EVENT_KEYS, classification_reason=reason)
    payload = _candidate_payload(candidate_id=_candidate_id(source_model=BILLING_INVOICE_SOURCE_MODEL, source_pk=invoice.id, event_key=event_key), event_key=event_key, event_label=event_label, module="billing", source_model=BILLING_INVOICE_SOURCE_MODEL, source_pk=invoice.id, source_display=f"Invoice {_invoice_reference(invoice)}", source_reference=_invoice_reference(invoice), source_date=invoice.invoice_date, amount=invoice.grand_total, taxable_amount=invoice.taxable_total, tax_amount=invoice.tax_total, lines=lines, finance_account=finance_account, period=period, postability=postability, journal=journal, reconciliation_item=item, idempotency_key=f"bridge:{purpose}:BillingInvoice:{invoice.id}:{invoice.invoice_date.isoformat()}:{_money(invoice.grand_total):.2f}", source_status=invoice.status, source_type=invoice.source_type)
    payload.update({"invoice_type": invoice.document_type, "invoice_status": invoice.status, "invoice_number": invoice.document_no})
    return payload


def rent_lease_revenue_candidate(demand: RentLeaseBillingDemand) -> dict[str, Any]:
    event_key, event_label, reason = _classify_rent_lease_revenue_event(demand)
    purpose = _purpose_for_event(RENT_LEASE_DEMAND_SOURCE_MODEL, event_key)
    bridge = _existing_bridge_for(source_model=RENT_LEASE_DEMAND_SOURCE_MODEL, source_id=str(demand.id), purpose=purpose)
    journal = bridge.journal_entry if bridge else None
    item = _latest_posting_reconciliation_item(source_model=RENT_LEASE_DEMAND_SOURCE_MODEL, source_id=str(demand.id)) if journal else _latest_reconciliation_item(source_model=RENT_LEASE_DEMAND_SOURCE_MODEL, source_id=str(demand.id))
    source_date = demand.due_date
    period = getattr(journal, "accounting_period", None) or _source_period(source_date)
    lines, warnings, finance_account = _rent_lease_revenue_lines(demand, event_key) if event_key in RENT_LEASE_REVENUE_EVENT_KEYS else ([], [reason] if reason else [], None)
    raw = "SKIPPED_NOT_APPLICABLE" if event_key == SKIPPED_RENT_LEASE_REVENUE_EVENT_KEY else "UNSUPPORTED_SOURCE" if event_key == UNSUPPORTED_RENT_LEASE_REVENUE_EVENT_KEY else "READY" if lines else "NOT_CONFIGURED"
    postability = _candidate_status_payload(event_key=event_key, event_label=event_label, module="subscriptions", source_model=RENT_LEASE_DEMAND_SOURCE_MODEL, raw_status=raw, lines=lines, line_warnings=warnings, period=period, source_date=source_date, journal=journal, reconciliation_item=item, source_workflow_exists=event_key in RENT_LEASE_REVENUE_EVENT_KEYS, classification_reason=reason)
    tax = _rent_lease_tax_amount(demand)
    taxable = _money(demand.amount) - tax
    payload = _candidate_payload(candidate_id=_candidate_id(source_model=RENT_LEASE_DEMAND_SOURCE_MODEL, source_pk=demand.id, event_key=event_key), event_key=event_key, event_label=event_label, module="subscriptions", source_model=RENT_LEASE_DEMAND_SOURCE_MODEL, source_pk=demand.id, source_display=f"Rent/lease demand {_rent_lease_reference(demand)}", source_reference=_rent_lease_reference(demand), source_date=source_date, amount=demand.amount, taxable_amount=taxable, tax_amount=tax, lines=lines, finance_account=finance_account, period=period, postability=postability, journal=journal, reconciliation_item=item, idempotency_key=f"bridge:{purpose}:RentLeaseBillingDemand:{demand.id}:{source_date.isoformat()}:{_money(demand.amount):.2f}", source_status=demand.status, source_type=demand.demand_type)
    if payload.get("reconciliation_state") == "POSTED_UNVERIFIED":
        payload["status"] = "POSTED_UNVERIFIED"
        payload["canonical_status"] = "POSTED_UNVERIFIED"
    subscription = demand.subscription
    customer = getattr(subscription, "customer", None)
    payload.update(
        {
            "rent_lease_demand_id": demand.id,
            "rent_lease_reference": _rent_lease_reference(demand),
            "plan_type": getattr(subscription, "plan_type", None),
            "demand_type": demand.demand_type,
            "invoice_status": demand.status,
            "billing_period_start": demand.billing_period_start.isoformat() if demand.billing_period_start else None,
            "billing_period_end": demand.billing_period_end.isoformat() if demand.billing_period_end else None,
            "billing_period": f"{demand.billing_period_start} to {demand.billing_period_end}" if demand.billing_period_start and demand.billing_period_end else None,
            "billing_month": demand.billing_period_start.strftime("%Y-%m") if demand.billing_period_start else None,
            "due_date": demand.due_date.isoformat() if demand.due_date else None,
            "customer_id": getattr(customer, "id", None),
            "customer_name": getattr(customer, "name", None) or getattr(customer, "full_name", None) or getattr(customer, "phone", None),
            "subscription_id": demand.subscription_id,
            "contract_reference": getattr(subscription, "subscription_number", None) or getattr(subscription, "contract_reference", None),
            "collected_amount": f"{_money(demand.collected_amount):.2f}",
            "outstanding_amount": f"{_money(demand.outstanding_amount()):.2f}",
            "invoice_number": _rent_lease_reference(demand),
        }
    )
    return payload


def billing_credit_note_candidate(note: BillingCreditNote) -> dict[str, Any]:
    event_key, event_label, reason = _classify_credit_note_event(note)
    purpose = _purpose_for_event(CREDIT_NOTE_SOURCE_MODEL, event_key)
    bridge = _existing_bridge_for(source_model=CREDIT_NOTE_SOURCE_MODEL, source_id=str(note.id), purpose=purpose)
    journal = bridge.journal_entry if bridge else None
    item = _latest_posting_reconciliation_item(source_model=CREDIT_NOTE_SOURCE_MODEL, source_id=str(note.id)) if journal else _latest_reconciliation_item(source_model=CREDIT_NOTE_SOURCE_MODEL, source_id=str(note.id))
    period = getattr(journal, "accounting_period", None) or _source_period(note.note_date)
    lines, warnings, finance_account = _credit_note_lines(note, event_key) if event_key in {"credit_note_issue", "sales_return", "customer_credit_adjustment"} else ([], [reason] if reason else [], None)
    raw = "SKIPPED_NOT_APPLICABLE" if event_key == SKIPPED_CREDIT_RETURN_EVENT_KEY else "UNSUPPORTED_SOURCE" if event_key == UNSUPPORTED_CREDIT_RETURN_EVENT_KEY else "READY" if lines else "NOT_CONFIGURED"
    postability = _candidate_status_payload(event_key=event_key, event_label=event_label, module="billing", source_model=CREDIT_NOTE_SOURCE_MODEL, raw_status=raw, lines=lines, line_warnings=warnings, period=period, source_date=note.note_date, journal=journal, reconciliation_item=item, source_workflow_exists=event_key in CREDIT_RETURN_EVENT_KEYS, classification_reason=reason)
    payload = _candidate_payload(candidate_id=_candidate_id(source_model=CREDIT_NOTE_SOURCE_MODEL, source_pk=note.id, event_key=event_key), event_key=event_key, event_label=event_label, module="billing", source_model=CREDIT_NOTE_SOURCE_MODEL, source_pk=note.id, source_display=f"Credit note {_credit_note_reference(note)}", source_reference=_credit_note_reference(note), source_date=note.note_date, amount=note.total_adjustment, taxable_amount=note.taxable_adjustment, tax_amount=note.tax_adjustment, lines=lines, finance_account=finance_account, period=period, postability=postability, journal=journal, reconciliation_item=item, idempotency_key=f"bridge:{purpose}:BillingCreditNote:{note.id}:{note.note_date.isoformat()}:{_money(note.total_adjustment):.2f}", source_status=note.status, source_type="CREDIT_NOTE")
    payload.update({"credit_note_number": note.note_no, "credit_note_status": note.status})
    return payload


def billing_debit_note_candidate(note: BillingDebitNote) -> dict[str, Any]:
    event_key, event_label, reason = _classify_debit_note_event(note)
    purpose = _purpose_for_event(DEBIT_NOTE_SOURCE_MODEL, event_key)
    bridge = _existing_bridge_for(source_model=DEBIT_NOTE_SOURCE_MODEL, source_id=str(note.id), purpose=purpose)
    journal = bridge.journal_entry if bridge else None
    item = _latest_posting_reconciliation_item(source_model=DEBIT_NOTE_SOURCE_MODEL, source_id=str(note.id)) if journal else _latest_reconciliation_item(source_model=DEBIT_NOTE_SOURCE_MODEL, source_id=str(note.id))
    period = getattr(journal, "accounting_period", None) or _source_period(note.note_date)
    lines, warnings, finance_account = _debit_note_lines(note, event_key) if event_key in DEBIT_NOTE_EVENT_KEYS else ([], [reason] if reason else [], None)
    raw = "SKIPPED_NOT_APPLICABLE" if event_key == SKIPPED_DEBIT_NOTE_EVENT_KEY else "UNSUPPORTED_SOURCE" if event_key == UNSUPPORTED_DEBIT_NOTE_EVENT_KEY else "READY" if lines else "NOT_CONFIGURED"
    postability = _candidate_status_payload(event_key=event_key, event_label=event_label, module="billing", source_model=DEBIT_NOTE_SOURCE_MODEL, raw_status=raw, lines=lines, line_warnings=warnings, period=period, source_date=note.note_date, journal=journal, reconciliation_item=item, source_workflow_exists=event_key in DEBIT_NOTE_EVENT_KEYS, classification_reason=reason)
    payload = _candidate_payload(candidate_id=_candidate_id(source_model=DEBIT_NOTE_SOURCE_MODEL, source_pk=note.id, event_key=event_key), event_key=event_key, event_label=event_label, module="billing", source_model=DEBIT_NOTE_SOURCE_MODEL, source_pk=note.id, source_display=f"Debit note {_debit_note_reference(note)}", source_reference=_debit_note_reference(note), source_date=note.note_date, amount=note.total_adjustment, taxable_amount=note.taxable_adjustment, tax_amount=note.tax_adjustment, lines=lines, finance_account=finance_account, period=period, postability=postability, journal=journal, reconciliation_item=item, idempotency_key=f"bridge:{purpose}:BillingDebitNote:{note.id}:{note.note_date.isoformat()}:{_money(note.total_adjustment):.2f}", source_status=note.status, source_type="DEBIT_NOTE")
    payload.update({"debit_note_number": note.note_no, "debit_note_status": note.status})
    return payload


def direct_sale_return_candidate(row: DirectSaleReturn) -> dict[str, Any]:
    event_key, event_label, reason = _classify_return_event(row)
    source_date, date_reason = _direct_sale_return_operational_date(row)
    classification_reason = date_reason or reason
    purpose = _purpose_for_event(DIRECT_SALE_RETURN_SOURCE_MODEL, event_key)
    bridge = _existing_bridge_for(source_model=DIRECT_SALE_RETURN_SOURCE_MODEL, source_id=str(row.id), purpose=purpose)
    journal = bridge.journal_entry if bridge else None
    item = _latest_posting_reconciliation_item(source_model=DIRECT_SALE_RETURN_SOURCE_MODEL, source_id=str(row.id)) if journal else _latest_reconciliation_item(source_model=DIRECT_SALE_RETURN_SOURCE_MODEL, source_id=str(row.id))
    period = getattr(journal, "accounting_period", None) or _source_period(source_date)
    lines, warnings, finance_account = _return_lines(row, event_key) if event_key == "direct_sale_return" and source_date is not None else ([], [classification_reason] if classification_reason else [], None)
    raw = "SKIPPED_NOT_APPLICABLE" if event_key == SKIPPED_CREDIT_RETURN_EVENT_KEY else "READY" if lines else "NOT_CONFIGURED"
    postability = _candidate_status_payload(event_key=event_key, event_label=event_label, module="billing", source_model=DIRECT_SALE_RETURN_SOURCE_MODEL, raw_status=raw, lines=lines, line_warnings=warnings, period=period, source_date=source_date, journal=journal, reconciliation_item=item, source_workflow_exists=True, classification_reason=classification_reason, approval_required=row.status != DirectSaleReturnStatus.APPROVED and event_key == "direct_sale_return")
    source_date_key = source_date.isoformat() if source_date else "NO_SAFE_DATE"
    payload = _candidate_payload(candidate_id=_candidate_id(source_model=DIRECT_SALE_RETURN_SOURCE_MODEL, source_pk=row.id, event_key=event_key), event_key=event_key, event_label=event_label, module="billing", source_model=DIRECT_SALE_RETURN_SOURCE_MODEL, source_pk=row.id, source_display=f"Return {_return_reference(row)}", source_reference=_return_reference(row), source_date=source_date, amount=row.grand_total, taxable_amount=row.subtotal, tax_amount=row.tax_total, lines=lines, finance_account=finance_account, period=period, postability=postability, journal=journal, reconciliation_item=item, idempotency_key=f"bridge:{purpose}:DirectSaleReturn:{row.id}:{source_date_key}:{_money(row.grand_total):.2f}", source_status=row.status, source_type=row.return_kind)
    payload.update({"return_number": row.return_no, "return_status": row.status})
    return payload


def list_bridge_candidates(filters: BridgeCandidateFilters | None = None) -> list[dict[str, Any]]:
    active_filters = filters or BridgeCandidateFilters()
    requested_model = (active_filters.source_model or "").strip()
    rows: list[dict[str, Any]] = []
    if requested_model in {"", COMMISSION_PAYOUT_SOURCE_MODEL} and (not active_filters.module or active_filters.module == "subscriptions"):
        qs = _date_filter_qs(
            CommissionPayoutBatch.objects.select_related("finance_account", "finance_account__chart_account", "processed_by").prefetch_related("lines__partner"),
            active_filters,
            date_field="payout_date",
        )
        rows.extend(commission_payout_candidate(item) for item in qs.order_by("-payout_date", "-id")[:500])
    if requested_model in {"", COMMISSION_SOURCE_MODEL} and (not active_filters.module or active_filters.module == "subscriptions"):
        commission_rows = [
            commission_candidate(item)
            for item in Commission.objects.select_related("partner", "subscription", "subscription__customer", "payment", "payment__customer", "emi").order_by("-created_at", "-id")[:1000]
        ]
        rows.extend(row for row in commission_rows if _row_matches_date_filters(row, active_filters))
    if requested_model in {"", "Payment"} and (not active_filters.event_key or active_filters.event_key == PAYMENT_COLLECTION_EVENT_KEY) and (not active_filters.module or active_filters.module == "subscriptions"):
        qs = _date_filter_qs(Payment.objects.select_related("finance_account", "finance_account__chart_account", "customer", "subscription"), active_filters, date_field="payment_date")
        rows.extend(payment_candidate(item) for item in qs.order_by("-payment_date", "-id")[:500])
    if requested_model in {"", RECEIPT_SOURCE_MODEL} and (not active_filters.module or active_filters.module == "billing"):
        qs = _date_filter_qs(ReceiptDocument.objects.select_related("finance_account", "finance_account__chart_account", "billing_invoice", "direct_sale", "customer", "subscription", "payment"), active_filters, date_field="receipt_date")
        rows.extend(receipt_candidate(item) for item in qs.order_by("-receipt_date", "-id")[:500])
    if requested_model in {"", BILLING_INVOICE_SOURCE_MODEL} and (not active_filters.module or active_filters.module == "billing"):
        qs = _date_filter_qs(BillingInvoice.objects.select_related("finance_account", "finance_account__chart_account", "direct_sale", "customer", "subscription"), active_filters, date_field="invoice_date")
        rows.extend(billing_invoice_candidate(item) for item in qs.order_by("-invoice_date", "-id")[:500])
    if requested_model in {"", RENT_LEASE_DEMAND_SOURCE_MODEL} and (not active_filters.module or active_filters.module == "subscriptions"):
        qs = _date_filter_qs(RentLeaseBillingDemand.objects.select_related("subscription", "subscription__customer"), active_filters, date_field="due_date")
        rows.extend(rent_lease_revenue_candidate(item) for item in qs.order_by("-due_date", "-id")[:500])
    if requested_model in {"", CREDIT_NOTE_SOURCE_MODEL} and (not active_filters.module or active_filters.module == "billing"):
        qs = _date_filter_qs(BillingCreditNote.objects.select_related("original_invoice", "original_invoice__customer"), active_filters, date_field="note_date")
        rows.extend(billing_credit_note_candidate(item) for item in qs.order_by("-note_date", "-id")[:500])
    if requested_model in {"", DEBIT_NOTE_SOURCE_MODEL} and (not active_filters.module or active_filters.module == "billing"):
        qs = _date_filter_qs(BillingDebitNote.objects.select_related("original_invoice", "original_invoice__customer"), active_filters, date_field="note_date")
        rows.extend(billing_debit_note_candidate(item) for item in qs.order_by("-note_date", "-id")[:500])
    if requested_model in {"", DIRECT_SALE_RETURN_SOURCE_MODEL} and (not active_filters.module or active_filters.module == "billing"):
        return_rows = [direct_sale_return_candidate(item) for item in DirectSaleReturn.objects.select_related("direct_sale", "original_invoice", "credit_note", "customer").order_by("-created_at", "-id")[:1000]]
        rows.extend(row for row in return_rows if _row_matches_date_filters(row, active_filters))
    if active_filters.event_key:
        rows = [row for row in rows if row["event_key"] == active_filters.event_key]
    if active_filters.status:
        rows = [row for row in rows if row["status"] == active_filters.status or row.get("reconciliation_state") == active_filters.status]
    rows.sort(key=lambda row: (row.get("source_date") or "", str(row.get("source_id") or "")), reverse=True)
    return rows


def get_bridge_candidate(candidate_id: str, *, for_update: bool = False) -> dict[str, Any]:
    source_kind, source_pk, event_key = _parse_candidate_id(candidate_id)
    if source_kind == "commissionpayoutbatch":
        qs = CommissionPayoutBatch.objects.select_related("finance_account", "finance_account__chart_account", "processed_by").prefetch_related("lines__partner")
        if for_update:
            qs = qs.select_for_update()
        candidate = commission_payout_candidate(qs.get(pk=source_pk))
    elif source_kind == "commission":
        qs = Commission.objects.select_related("partner", "subscription", "subscription__customer", "payment", "payment__customer", "emi")
        if for_update:
            qs = qs.select_for_update()
        candidate = commission_candidate(qs.get(pk=source_pk))
    elif source_kind == "payment" and event_key == PAYMENT_COLLECTION_EVENT_KEY:
        qs = Payment.objects.select_related("finance_account", "finance_account__chart_account", "customer", "subscription")
        if for_update:
            qs = qs.select_for_update()
        return payment_candidate(qs.get(pk=source_pk))
    elif source_kind == "receiptdocument":
        qs = ReceiptDocument.objects.select_related("finance_account", "finance_account__chart_account", "billing_invoice", "direct_sale", "customer", "subscription", "payment")
        if for_update:
            qs = qs.select_for_update()
        candidate = receipt_candidate(qs.get(pk=source_pk))
    elif source_kind == "billinginvoice":
        qs = BillingInvoice.objects.select_related("finance_account", "finance_account__chart_account", "direct_sale", "customer", "subscription")
        if for_update:
            qs = qs.select_for_update()
        candidate = billing_invoice_candidate(qs.get(pk=source_pk))
    elif source_kind == "rentleasebillingdemand":
        qs = RentLeaseBillingDemand.objects.select_related("subscription", "subscription__customer")
        if for_update:
            qs = qs.select_for_update()
        candidate = rent_lease_revenue_candidate(qs.get(pk=source_pk))
    elif source_kind == "billingcreditnote":
        qs = BillingCreditNote.objects.select_related("original_invoice", "original_invoice__customer")
        if for_update:
            qs = qs.select_for_update()
        candidate = billing_credit_note_candidate(qs.get(pk=source_pk))
    elif source_kind == "billingdebitnote":
        qs = BillingDebitNote.objects.select_related("original_invoice", "original_invoice__customer")
        if for_update:
            qs = qs.select_for_update()
        candidate = billing_debit_note_candidate(qs.get(pk=source_pk))
    elif source_kind == "directsalereturn":
        qs = DirectSaleReturn.objects.select_related("direct_sale", "original_invoice", "credit_note", "customer")
        if for_update:
            qs = qs.select_for_update()
        candidate = direct_sale_return_candidate(qs.get(pk=source_pk))
    else:
        raise ValueError("Unsupported bridge candidate source.")
    if candidate["event_key"] != event_key:
        raise ValueError(f"{candidate.get('source_model') or 'Source'} candidate event no longer matches current source state.")
    return candidate


def _lines_for_candidate(candidate: dict[str, Any]):
    model = candidate["source_model"]
    source_id = candidate["source_id"]
    event_key = candidate["event_key"]
    if model == COMMISSION_PAYOUT_SOURCE_MODEL:
        return _commission_payout_lines(CommissionPayoutBatch.objects.select_related("finance_account", "finance_account__chart_account").get(pk=source_id), event_key)
    if model == COMMISSION_SOURCE_MODEL:
        return _commission_lines(Commission.objects.select_related("partner", "payment").get(pk=source_id), event_key)
    if model == "Payment":
        return _payment_lines(Payment.objects.select_related("finance_account", "finance_account__chart_account").get(pk=source_id))
    if model == RECEIPT_SOURCE_MODEL:
        return _receipt_lines(ReceiptDocument.objects.select_related("finance_account", "finance_account__chart_account").get(pk=source_id), event_key)
    if model == BILLING_INVOICE_SOURCE_MODEL:
        return _invoice_lines(BillingInvoice.objects.get(pk=source_id), event_key)
    if model == RENT_LEASE_DEMAND_SOURCE_MODEL:
        return _rent_lease_revenue_lines(RentLeaseBillingDemand.objects.select_related("subscription").get(pk=source_id), event_key)
    if model == CREDIT_NOTE_SOURCE_MODEL:
        return _credit_note_lines(BillingCreditNote.objects.get(pk=source_id), event_key)
    if model == DEBIT_NOTE_SOURCE_MODEL:
        return _debit_note_lines(BillingDebitNote.objects.get(pk=source_id), event_key)
    if model == DIRECT_SALE_RETURN_SOURCE_MODEL:
        return _return_lines(DirectSaleReturn.objects.get(pk=source_id), event_key)
    return [], ["Unsupported source model."], None


def preview_bridge_candidate(candidate_id: str) -> dict[str, Any]:
    candidate = get_bridge_candidate(candidate_id)
    lines, warnings, _finance_account = _lines_for_candidate(candidate) if candidate.get("source_date") else ([], [candidate.get("blocker_reason") or NO_SAFE_RETURN_DATE_BLOCKER], None)
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
    total_debit, total_credit = _line_totals(lines)
    tax_lines = [_line_payload(account=line["chart_account"], description=line.get("description", ""), debit=line.get("debit_amount"), credit=line.get("credit_amount")) for line in lines if getattr(line.get("chart_account"), "system_code", "") == "OUTPUT_GST"]
    source_payload = {"model": candidate["source_model"], "pk": candidate.get("source_pk") or candidate["source_id"], "display": candidate["source_display"], "reference_number": candidate["source_reference_number"], "date": candidate.get("source_date"), "amount": candidate["amount"], "source_status": candidate.get("source_status"), "source_type": candidate.get("source_type"), "taxable_amount": candidate.get("taxable_amount"), "tax_amount": candidate.get("tax_amount"), "debit_note_number": candidate.get("debit_note_number"), "debit_note_status": candidate.get("debit_note_status"), "commission_reference": candidate.get("commission_reference"), "partner_name": candidate.get("partner_name"), "customer_name": candidate.get("customer_name"), "subscription_id": candidate.get("subscription_id"), "contract_reference": candidate.get("contract_reference"), "payment_id": candidate.get("payment_id"), "payment_reference": candidate.get("payment_reference"), "emi_id": candidate.get("emi_id"), "commission_status": candidate.get("commission_status"), "payout_batch_id": candidate.get("payout_batch_id"), "payout_batch_code": candidate.get("payout_batch_code"), "payout_reference": candidate.get("payout_reference"), "payout_date": candidate.get("payout_date"), "payout_status": candidate.get("payout_status"), "payout_amount": candidate.get("payout_amount"), "payment_method": candidate.get("payment_method"), "finance_account_name": candidate.get("finance_account_name"), "related_commission_count": candidate.get("related_commission_count"), "rent_lease_reference": candidate.get("rent_lease_reference"), "rent_lease_demand_id": candidate.get("rent_lease_demand_id"), "plan_type": candidate.get("plan_type"), "demand_type": candidate.get("demand_type"), "billing_period": candidate.get("billing_period"), "billing_month": candidate.get("billing_month"), "billing_period_start": candidate.get("billing_period_start"), "billing_period_end": candidate.get("billing_period_end"), "due_date": candidate.get("due_date"), "collected_amount": candidate.get("collected_amount"), "outstanding_amount": candidate.get("outstanding_amount")}
    safety_text = RENT_LEASE_REVENUE_SAFETY_TEXT if candidate.get("source_model") == RENT_LEASE_DEMAND_SOURCE_MODEL else COMMISSION_PAYOUT_SAFETY_TEXT if candidate.get("source_model") == COMMISSION_PAYOUT_SOURCE_MODEL else COMMISSION_SAFETY_TEXT if candidate.get("source_model") == COMMISSION_SOURCE_MODEL else SAFETY_TEXT
    return {"candidate": candidate, "candidate_id": candidate_id, "source": source_payload, "journal_date": journal_date.isoformat() if journal_date else None, "accounting_period": candidate["accounting_period"], "journal_number_preview": journal_number_preview, "debit_lines": [_line_payload(account=line["chart_account"], description=line.get("description", ""), debit=line.get("debit_amount")) for line in lines if _money(line.get("debit_amount")) > 0], "credit_lines": [_line_payload(account=line["chart_account"], description=line.get("description", ""), credit=line.get("credit_amount")) for line in lines if _money(line.get("credit_amount")) > 0], "lines": _preview_lines(lines), "total_debit": f"{total_debit:.2f}", "total_credit": f"{total_credit:.2f}", "is_balanced": bool(lines and total_debit == total_credit), "tax_lines": tax_lines, "finance_account_line": candidate["finance_account"], "warnings": warnings, "blockers": list(dict.fromkeys([item for item in blockers if item])), "can_post": bool(candidate["can_post"] and lines and total_debit == total_credit and not blockers), "idempotency_key": candidate["idempotency_key"], "safety_text": safety_text}


def _create_pending_reconciliation_item(*, journal: JournalEntry, source_model: str, source_id: str, source_label: str, amount: Decimal, candidate_id: str, actor, note: str = "") -> ReconciliationItem:
    phase_slice = "F14" if source_model == RENT_LEASE_DEMAND_SOURCE_MODEL else "F11" if source_model == COMMISSION_PAYOUT_SOURCE_MODEL else "F10" if source_model == COMMISSION_SOURCE_MODEL else "F5" if source_model == DEBIT_NOTE_SOURCE_MODEL else "F4" if source_model in {CREDIT_NOTE_SOURCE_MODEL, DIRECT_SALE_RETURN_SOURCE_MODEL} else "F3" if source_model == BILLING_INVOICE_SOURCE_MODEL else "F2" if source_model == RECEIPT_SOURCE_MODEL else "F"
    run = ReconciliationRun.objects.create(run_no=next_reconciliation_run_no(), scope="BRIDGE_POSTING", module="ACCOUNTING_BRIDGE", date_from=journal.entry_date, date_to=journal.entry_date, status=ReconciliationRunStatus.COMPLETED, started_by=actor, started_at=timezone.now(), finished_at=timezone.now(), total_checked=1, total_matched=0, total_exceptions=1, high_risk_count=0, metadata={"phase": "F", "phase_slice": phase_slice, "system_created_after_bridge_post": True, "verification_required": True, "posting_note": note})
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
    candidate = get_bridge_candidate(candidate_id, for_update=True)
    supported = {COMMISSION_PAYOUT_SOURCE_MODEL: COMMISSION_PAYOUT_EVENT_KEYS, COMMISSION_SOURCE_MODEL: COMMISSION_EVENT_KEYS, "Payment": {PAYMENT_COLLECTION_EVENT_KEY}, RECEIPT_SOURCE_MODEL: RECEIPT_EVENT_KEYS, BILLING_INVOICE_SOURCE_MODEL: BILLING_INVOICE_EVENT_KEYS, RENT_LEASE_DEMAND_SOURCE_MODEL: RENT_LEASE_REVENUE_EVENT_KEYS, CREDIT_NOTE_SOURCE_MODEL: {"credit_note_issue", "sales_return", "customer_credit_adjustment"}, DIRECT_SALE_RETURN_SOURCE_MODEL: {"direct_sale_return"}, DEBIT_NOTE_SOURCE_MODEL: DEBIT_NOTE_EVENT_KEYS}
    if candidate["event_key"] not in supported.get(candidate["source_model"], set()):
        raise ValueError("Unsupported bridge candidate source.")
    purpose = _purpose_for_event(candidate["source_model"], candidate["event_key"])
    existing = AccountingBridgePosting.objects.select_for_update().filter(source_model=candidate["source_model"], source_id=candidate["source_id"], purpose=purpose).select_related("journal_entry").first()
    if existing is not None:
        existing_key = ((existing.trace_metadata or {}).get("idempotency_key") or "").strip()
        if existing_key and existing_key == candidate_key:
            return {"posted": False, "already_posted": True, "journal_entry": _journal_payload(existing.journal_entry), "reconciliation_item": _reconciliation_payload(_latest_posting_reconciliation_item(source_model=candidate["source_model"], source_id=candidate["source_id"])), "next_action": "Run reconciliation checks and verify the pending bridge item."}
        raise ValueError("This source item has already been posted with a different or legacy idempotency key.")
    if candidate["idempotency_key"] != candidate_key:
        raise ValueError("idempotency_key does not match the current source candidate.")
    preview = preview_bridge_candidate(candidate_id)
    if not preview["can_post"]:
        raise ValueError("; ".join(preview["blockers"]) or "Candidate is not postable.")
    lines, _warnings, finance_account = _lines_for_candidate(candidate)
    total_debit, total_credit = _line_totals(lines)
    if not lines or total_debit != total_credit:
        raise ValueError("Bridge posting preview is not balanced.")
    source_instance = _source_instance_for_candidate(candidate, for_update=True)
    commission_before = _commission_snapshot(source_instance) if candidate["source_model"] == COMMISSION_SOURCE_MODEL else None
    payout_before = _commission_payout_snapshot(source_instance) if candidate["source_model"] == COMMISSION_PAYOUT_SOURCE_MODEL else None
    payout_lines_before = _commission_payout_lines_snapshot(source_instance) if candidate["source_model"] == COMMISSION_PAYOUT_SOURCE_MODEL else None
    payout_commissions_before = {}
    if candidate["source_model"] == COMMISSION_PAYOUT_SOURCE_MODEL:
        commission_ids = [commission_id for _line_id, commission_id, _partner_id, _amount in payout_lines_before or []]
        payout_commissions_before = {
            row.id: _commission_snapshot(row)
            for row in Commission.objects.select_for_update().filter(id__in=commission_ids).order_by("id")
        }
    payout_line_count_before = 0
    if candidate["source_model"] == COMMISSION_SOURCE_MODEL:
        payout_line_count_before = CommissionPayoutLine.objects.filter(commission_id=source_instance.id).count()
    entry_date = date.fromisoformat(candidate["source_date"])
    rent_lease_before = _rent_lease_demand_snapshot(source_instance) if candidate["source_model"] == RENT_LEASE_DEMAND_SOURCE_MODEL else None
    journal, created = post_bridge_entry(source_instance=source_instance, purpose=purpose, entry_date=entry_date, memo=f"Bridge posting {candidate['source_model']} {candidate['source_id']} {candidate['event_key']}", lines=lines, voucher_type=purpose, source_type=candidate.get("source_type") or candidate["source_model"].upper(), source_reference=candidate["source_reference"], source_document_no=candidate["source_reference"], source_event_date=entry_date, trace_metadata={"event_key": candidate["event_key"], "idempotency_key": candidate_key, "posting_note": posting_note, "source_model": candidate["source_model"], "source_id": candidate["source_id"], "finance_account_id": getattr(finance_account, "id", None), "amount": candidate["amount"], "taxable_amount": candidate.get("taxable_amount"), "tax_amount": candidate.get("tax_amount"), "commission_mutation": False if candidate["source_model"] in {COMMISSION_SOURCE_MODEL, COMMISSION_PAYOUT_SOURCE_MODEL} else None, "commission_payout_mutation": False if candidate["source_model"] in {COMMISSION_SOURCE_MODEL, COMMISSION_PAYOUT_SOURCE_MODEL} else None, "rent_lease_demand_mutation": False if candidate["source_model"] == RENT_LEASE_DEMAND_SOURCE_MODEL else None, "contract_mutation": False if candidate["source_model"] == RENT_LEASE_DEMAND_SOURCE_MODEL else None, "payment_receipt_deposit_mutation": False if candidate["source_model"] == RENT_LEASE_DEMAND_SOURCE_MODEL else None, "rent_lease_revenue_posting": candidate["source_model"] == RENT_LEASE_DEMAND_SOURCE_MODEL, "plan_type": candidate.get("plan_type"), "billing_period": candidate.get("billing_period"), "payout_batch_id": candidate.get("payout_batch_id"), "payout_batch_code": candidate.get("payout_batch_code"), "related_commission_count": candidate.get("related_commission_count")}, posted_by=actor)
    item = _latest_posting_reconciliation_item(source_model=candidate["source_model"], source_id=candidate["source_id"])
    if created and not (item and item.exception_code == "POSTED_UNVERIFIED"):
        item = _create_pending_reconciliation_item(journal=journal, source_model=candidate["source_model"], source_id=candidate["source_id"], source_label=candidate["source_reference"], amount=_money(candidate["amount"]), candidate_id=candidate_id, actor=actor, note=posting_note)
    if candidate["source_model"] == COMMISSION_SOURCE_MODEL:
        source_instance.refresh_from_db()
        if _commission_snapshot(source_instance) != commission_before:
            raise ValueError("Commission source mutation detected; bridge posting rolled back.")
        payout_line_count_after = CommissionPayoutLine.objects.filter(commission_id=source_instance.id).count()
        if payout_line_count_after != payout_line_count_before:
            raise ValueError("Commission payout mutation detected; bridge posting rolled back.")
    if candidate["source_model"] == COMMISSION_PAYOUT_SOURCE_MODEL:
        source_instance.refresh_from_db()
        if _commission_payout_snapshot(source_instance) != payout_before:
            raise ValueError("Commission payout source mutation detected; bridge posting rolled back.")
        if _commission_payout_lines_snapshot(source_instance) != payout_lines_before:
            raise ValueError("Commission payout line mutation detected; bridge posting rolled back.")
        for row in Commission.objects.filter(id__in=payout_commissions_before.keys()).order_by("id"):
            if _commission_snapshot(row) != payout_commissions_before[row.id]:
                raise ValueError("Commission source mutation detected; bridge posting rolled back.")
    if candidate["source_model"] == RENT_LEASE_DEMAND_SOURCE_MODEL:
        source_instance.refresh_from_db()
        if _rent_lease_demand_snapshot(source_instance) != rent_lease_before:
            raise ValueError("Rent/lease demand source mutation detected; bridge posting rolled back.")
    _log_candidate_post(journal=journal, actor=actor, candidate_id=candidate_id, source_model=candidate["source_model"], source_id=int(candidate["source_id"]), event_key=candidate["event_key"], amount=_money(candidate["amount"]), candidate_key=candidate_key, reconciliation_item=item)
    return {"posted": created, "already_posted": not created, "journal_entry": _journal_payload(journal), "reconciliation_item": _reconciliation_payload(item), "next_action": "Run reconciliation checks and verify the pending bridge item."}


def _source_instance_for_candidate(candidate: dict[str, Any], *, for_update: bool = False):
    model = {COMMISSION_PAYOUT_SOURCE_MODEL: CommissionPayoutBatch, COMMISSION_SOURCE_MODEL: Commission, "Payment": Payment, RECEIPT_SOURCE_MODEL: ReceiptDocument, BILLING_INVOICE_SOURCE_MODEL: BillingInvoice, RENT_LEASE_DEMAND_SOURCE_MODEL: RentLeaseBillingDemand, CREDIT_NOTE_SOURCE_MODEL: BillingCreditNote, DEBIT_NOTE_SOURCE_MODEL: BillingDebitNote, DIRECT_SALE_RETURN_SOURCE_MODEL: DirectSaleReturn}[candidate["source_model"]]
    qs = model.objects
    if for_update:
        qs = qs.select_for_update()
    return qs.get(pk=candidate["source_id"])


def _reconciliation_payload(item: ReconciliationItem | None) -> dict[str, Any] | None:
    return None if item is None else {"id": item.id, "status": item.status, "exception_code": item.exception_code}


def _log_candidate_post(*, journal: JournalEntry, actor, candidate_id: str, source_model: str, source_id: int, event_key: str, amount: Decimal, candidate_key: str, reconciliation_item: ReconciliationItem | None):
    _log_accounting_event(event="ACCOUNTING_BRIDGE_CANDIDATE_POSTED", instance=journal, performed_by=actor, metadata={"candidate_id": candidate_id, "source_model": source_model, "source_id": source_id, "event_key": event_key, "journal_entry_id": journal.id, "period_id": journal.accounting_period_id, "amount": f"{_money(amount):.2f}", "idempotency_key": candidate_key, "reconciliation_item_id": getattr(reconciliation_item, "id", None)})


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
            (posted if result["posted"] else already_posted).append(result)
        except Exception as exc:
            errors[candidate_id] = [str(exc)]
    return {"selected_count": len(candidate_ids), "posted_count": len(posted), "already_posted_count": len(already_posted), "skipped_already_posted_count": len(already_posted), "blocked_count": len(errors), "created_journal_ids": [item["journal_entry"]["id"] for item in posted if item.get("journal_entry")], "reconciliation_pending_count": sum(1 for item in posted if item.get("reconciliation_item")), "posted": posted, "already_posted": already_posted, "errors": errors}


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
    models = [COMMISSION_PAYOUT_SOURCE_MODEL, COMMISSION_SOURCE_MODEL, "Payment", RECEIPT_SOURCE_MODEL, BILLING_INVOICE_SOURCE_MODEL, RENT_LEASE_DEMAND_SOURCE_MODEL, CREDIT_NOTE_SOURCE_MODEL, DIRECT_SALE_RETURN_SOURCE_MODEL, DEBIT_NOTE_SOURCE_MODEL, "CustomerAdvance", "RentLeaseDepositTransaction", "SalaryPayment", "SalarySheet"]
    candidate_rows = [row for row in rows if row.get("row_type") != "readiness_event"]
    by_model = {model: Counter(row.get("status") or "INFO" for row in candidate_rows if row.get("source_model") == model) for model in models}
    def posted_unverified(model: str) -> int:
        return sum(1 for row in candidate_rows if row.get("source_model") == model and row.get("reconciliation_state") == "POSTED_UNVERIFIED")
    credit_models = [CREDIT_NOTE_SOURCE_MODEL, DIRECT_SALE_RETURN_SOURCE_MODEL]
    summary = {"candidate_count": len(rows), "ready_unposted_count": counts.get("READY_UNPOSTED", 0), "posted_count": counts.get("POSTED", 0), "reconciled_count": counts.get("RECONCILED", 0), "blocked_by_mapping_count": counts.get("BLOCKED_BY_MAPPING", 0), "blocked_by_finance_account_count": counts.get("BLOCKED_BY_FINANCE_ACCOUNT", 0), "blocked_by_period_count": counts.get("BLOCKED_BY_PERIOD", 0), "blocked_by_numbering_count": counts.get("BLOCKED_BY_NUMBERING", 0), "blocked_by_approval_count": counts.get("BLOCKED_BY_APPROVAL", 0), "unsupported_count": counts.get("UNSUPPORTED_SOURCE", 0), "commission_ready_unposted_count": by_model[COMMISSION_SOURCE_MODEL].get("READY_UNPOSTED", 0), "commission_posted_count": by_model[COMMISSION_SOURCE_MODEL].get("POSTED", 0), "commission_posted_unverified_count": posted_unverified(COMMISSION_SOURCE_MODEL), "commission_reconciled_count": by_model[COMMISSION_SOURCE_MODEL].get("RECONCILED", 0), "commission_blocked_count": sum(v for k, v in by_model[COMMISSION_SOURCE_MODEL].items() if str(k).startswith("BLOCKED")), "commission_unsupported_count": by_model[COMMISSION_SOURCE_MODEL].get("UNSUPPORTED_SOURCE", 0), "payment_ready_unposted_count": by_model["Payment"].get("READY_UNPOSTED", 0), "payment_posted_count": by_model["Payment"].get("POSTED", 0), "payment_posted_unverified_count": posted_unverified("Payment"), "payment_reconciled_count": by_model["Payment"].get("RECONCILED", 0), "receipt_ready_unposted_count": by_model[RECEIPT_SOURCE_MODEL].get("READY_UNPOSTED", 0), "receipt_posted_count": by_model[RECEIPT_SOURCE_MODEL].get("POSTED", 0), "receipt_posted_unverified_count": posted_unverified(RECEIPT_SOURCE_MODEL), "receipt_reconciled_count": by_model[RECEIPT_SOURCE_MODEL].get("RECONCILED", 0), "billing_invoice_ready_unposted_count": by_model[BILLING_INVOICE_SOURCE_MODEL].get("READY_UNPOSTED", 0), "billing_invoice_posted_count": by_model[BILLING_INVOICE_SOURCE_MODEL].get("POSTED", 0), "billing_invoice_posted_unverified_count": posted_unverified(BILLING_INVOICE_SOURCE_MODEL), "billing_invoice_reconciled_count": by_model[BILLING_INVOICE_SOURCE_MODEL].get("RECONCILED", 0), "billing_invoice_blocked_count": sum(v for k, v in by_model[BILLING_INVOICE_SOURCE_MODEL].items() if str(k).startswith("BLOCKED")), "billing_invoice_unsupported_count": by_model[BILLING_INVOICE_SOURCE_MODEL].get("UNSUPPORTED_SOURCE", 0), "credit_return_ready_unposted_count": sum(by_model[m].get("READY_UNPOSTED", 0) for m in credit_models), "credit_return_posted_count": sum(by_model[m].get("POSTED", 0) for m in credit_models), "credit_return_posted_unverified_count": sum(posted_unverified(m) for m in credit_models), "credit_return_reconciled_count": sum(by_model[m].get("RECONCILED", 0) for m in credit_models), "credit_return_blocked_count": sum(sum(v for k, v in by_model[m].items() if str(k).startswith("BLOCKED")) for m in credit_models), "credit_return_unsupported_count": sum(by_model[m].get("UNSUPPORTED_SOURCE", 0) for m in credit_models), "debit_note_ready_unposted_count": by_model[DEBIT_NOTE_SOURCE_MODEL].get("READY_UNPOSTED", 0), "debit_note_posted_count": by_model[DEBIT_NOTE_SOURCE_MODEL].get("POSTED", 0), "debit_note_posted_unverified_count": posted_unverified(DEBIT_NOTE_SOURCE_MODEL), "debit_note_reconciled_count": by_model[DEBIT_NOTE_SOURCE_MODEL].get("RECONCILED", 0), "debit_note_blocked_count": sum(v for k, v in by_model[DEBIT_NOTE_SOURCE_MODEL].items() if str(k).startswith("BLOCKED")), "debit_note_unsupported_count": by_model[DEBIT_NOTE_SOURCE_MODEL].get("UNSUPPORTED_SOURCE", 0)}
    summary.update({"commission_payout_ready_unposted_count": by_model[COMMISSION_PAYOUT_SOURCE_MODEL].get("READY_UNPOSTED", 0), "commission_payout_posted_count": by_model[COMMISSION_PAYOUT_SOURCE_MODEL].get("POSTED", 0), "commission_payout_posted_unverified_count": posted_unverified(COMMISSION_PAYOUT_SOURCE_MODEL), "commission_payout_reconciled_count": by_model[COMMISSION_PAYOUT_SOURCE_MODEL].get("RECONCILED", 0), "commission_payout_blocked_count": sum(v for k, v in by_model[COMMISSION_PAYOUT_SOURCE_MODEL].items() if str(k).startswith("BLOCKED")), "commission_payout_unsupported_count": by_model[COMMISSION_PAYOUT_SOURCE_MODEL].get("UNSUPPORTED_SOURCE", 0)})
    summary.update({"rent_lease_revenue_ready_unposted_count": by_model[RENT_LEASE_DEMAND_SOURCE_MODEL].get("READY_UNPOSTED", 0), "rent_lease_revenue_posted_count": by_model[RENT_LEASE_DEMAND_SOURCE_MODEL].get("POSTED", 0), "rent_lease_revenue_posted_unverified_count": posted_unverified(RENT_LEASE_DEMAND_SOURCE_MODEL), "rent_lease_revenue_reconciled_count": by_model[RENT_LEASE_DEMAND_SOURCE_MODEL].get("RECONCILED", 0), "rent_lease_revenue_blocked_count": sum(v for k, v in by_model[RENT_LEASE_DEMAND_SOURCE_MODEL].items() if str(k).startswith("BLOCKED")), "rent_lease_revenue_unsupported_count": by_model[RENT_LEASE_DEMAND_SOURCE_MODEL].get("UNSUPPORTED_SOURCE", 0)})
    summary.update({"rent_lease_payment_ready_unposted_count": 0, "rent_lease_payment_posted_unverified_count": 0, "rent_lease_payment_reconciled_count": 0, "rent_lease_payment_blocked_count": 0, "rent_lease_payment_unsupported_count": 0})
    summary.update({"customer_advance_receipt_ready_unposted_count": by_model["CustomerAdvance"].get("READY_UNPOSTED", 0), "customer_advance_receipt_posted_count": by_model["CustomerAdvance"].get("POSTED", 0), "customer_advance_receipt_posted_unverified_count": posted_unverified("CustomerAdvance"), "customer_advance_receipt_reconciled_count": by_model["CustomerAdvance"].get("RECONCILED", 0), "customer_advance_receipt_blocked_count": sum(v for k, v in by_model["CustomerAdvance"].items() if str(k).startswith("BLOCKED")), "customer_advance_receipt_unsupported_count": by_model["CustomerAdvance"].get("UNSUPPORTED_SOURCE", 0)})
    _sd_receipt_event_keys = {"rent_security_deposit_receipt", "lease_security_deposit_receipt", "security_deposit_receipt"}
    _sd_refund_event_keys = {"rent_security_deposit_refund", "lease_security_deposit_refund", "security_deposit_refund"}
    summary.update({"security_deposit_receipt_ready_unposted_count": sum(1 for row in candidate_rows if row.get("source_model") == "RentLeaseDepositTransaction" and row.get("event_key") in _sd_receipt_event_keys and (row.get("status") or "") == "READY_UNPOSTED"), "security_deposit_receipt_posted_count": sum(1 for row in candidate_rows if row.get("source_model") == "RentLeaseDepositTransaction" and row.get("event_key") in _sd_receipt_event_keys and (row.get("status") or "") == "POSTED"), "security_deposit_receipt_posted_unverified_count": sum(1 for row in candidate_rows if row.get("source_model") == "RentLeaseDepositTransaction" and row.get("event_key") in _sd_receipt_event_keys and row.get("reconciliation_state") == "POSTED_UNVERIFIED"), "security_deposit_receipt_reconciled_count": sum(1 for row in candidate_rows if row.get("source_model") == "RentLeaseDepositTransaction" and row.get("event_key") in _sd_receipt_event_keys and (row.get("status") or "") == "RECONCILED"), "security_deposit_receipt_blocked_count": sum(1 for row in candidate_rows if row.get("source_model") == "RentLeaseDepositTransaction" and row.get("event_key") in _sd_receipt_event_keys and str(row.get("status") or "").startswith("BLOCKED")), "security_deposit_refund_ready_unposted_count": sum(1 for row in candidate_rows if row.get("source_model") == "RentLeaseDepositTransaction" and row.get("event_key") in _sd_refund_event_keys and (row.get("status") or "") == "READY_UNPOSTED"), "security_deposit_refund_posted_count": sum(1 for row in candidate_rows if row.get("source_model") == "RentLeaseDepositTransaction" and row.get("event_key") in _sd_refund_event_keys and (row.get("status") or "") == "POSTED"), "security_deposit_refund_posted_unverified_count": sum(1 for row in candidate_rows if row.get("source_model") == "RentLeaseDepositTransaction" and row.get("event_key") in _sd_refund_event_keys and row.get("reconciliation_state") == "POSTED_UNVERIFIED"), "security_deposit_refund_reconciled_count": sum(1 for row in candidate_rows if row.get("source_model") == "RentLeaseDepositTransaction" and row.get("event_key") in _sd_refund_event_keys and (row.get("status") or "") == "RECONCILED"), "security_deposit_refund_blocked_count": sum(1 for row in candidate_rows if row.get("source_model") == "RentLeaseDepositTransaction" and row.get("event_key") in _sd_refund_event_keys and str(row.get("status") or "").startswith("BLOCKED"))})
    summary.update({"salary_payment_ready_unposted_count": by_model["SalaryPayment"].get("READY_UNPOSTED", 0), "salary_payment_posted_count": by_model["SalaryPayment"].get("POSTED", 0), "salary_payment_posted_unverified_count": posted_unverified("SalaryPayment"), "salary_payment_reconciled_count": by_model["SalaryPayment"].get("RECONCILED", 0), "salary_payment_blocked_count": sum(v for k, v in by_model["SalaryPayment"].items() if str(k).startswith("BLOCKED")), "salary_payment_unsupported_count": by_model["SalaryPayment"].get("UNSUPPORTED_SOURCE", 0)})
    summary.update({"payroll_ready_unposted_count": by_model["SalarySheet"].get("READY_UNPOSTED", 0), "payroll_posted_count": by_model["SalarySheet"].get("POSTED", 0), "payroll_posted_unverified_count": posted_unverified("SalarySheet"), "payroll_reconciled_count": by_model["SalarySheet"].get("RECONCILED", 0), "payroll_blocked_count": sum(v for k, v in by_model["SalarySheet"].items() if str(k).startswith("BLOCKED")), "payroll_unsupported_count": by_model["SalarySheet"].get("UNSUPPORTED_SOURCE", 0)})
    return summary
