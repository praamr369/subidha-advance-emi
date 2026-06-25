"""WaiverClassificationEngine — determines accounting treatment for a Lucky Plan waiver.

This is a pure-logic decision service. It does NOT post journals, create receipts,
mutate EMI schedules, write invoices, or alter any financial record. It only reads
state and returns the correct accounting mode, document type, and audit reason.

Spec: docs/legal/subidha-contracts-backend-frontend-settings.md §5 & §7.3
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

# ---------------------------------------------------------------------------
# Enumeration constants
# ---------------------------------------------------------------------------

WaiverAccountingMode = Literal[
    "PRE_SUPPLY_CONTRACT_ADJUSTMENT",
    "PRE_GST_COMMERCIAL_CREDIT",
    "POST_SUPPLY_GST_CREDIT_NOTE",
    "POST_SUPPLY_COMMERCIAL_CREDIT_ONLY",
    "PROMOTIONAL_EXPENSE",
    "REFUND_VOUCHER",
    "HYBRID_CA_RULE",
    "REVIEW_REQUIRED",
]

WaiverDocument = Literal[
    "NONE",
    "COMMERCIAL_WAIVER_NOTE",
    "COMMERCIAL_CREDIT_NOTE",
    "RECEIPT_VOUCHER",
    "REFUND_VOUCHER",
    "TAX_INVOICE",
    "GST_CREDIT_NOTE",
]

DeliveryStatus = Literal["NOT_DELIVERED", "DELIVERED", "PARTIAL", "RETURNED", "CANCELLED"]
InvoiceStatus = Literal["NOT_ISSUED", "RECEIPT_VOUCHER_ONLY", "PARTIAL", "ISSUED", "CANCELLED"]
GstStatus = Literal["UNREGISTERED", "APPLIED", "GST_REGULAR", "GST_COMPOSITION", "CANCELLED"]


@dataclass
class WaiverClassificationInput:
    gst_status: str = "UNREGISTERED"
    delivery_status: str = "NOT_DELIVERED"
    invoice_status: str = "NOT_ISSUED"
    waiver_amount: float = 0.0
    waiver_month: str = ""
    contract_id: int | None = None
    customer_id: int | None = None


@dataclass
class WaiverClassificationResult:
    waiver_allowed: bool = True
    waiver_accounting_mode: str = "REVIEW_REQUIRED"
    document_to_generate: str = "COMMERCIAL_WAIVER_NOTE"
    gst_reduction_allowed: bool = False
    ledger_posting_template: str = ""
    audit_reason: str = ""
    blockers: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    scenario: str = ""


# ---------------------------------------------------------------------------
# GST registered check
# ---------------------------------------------------------------------------

_GST_REGISTERED_MODES = {"GST_REGULAR", "GST_COMPOSITION"}


def _is_registered(gst_status: str) -> bool:
    return gst_status.upper() in _GST_REGISTERED_MODES


# ---------------------------------------------------------------------------
# Main classification engine
# ---------------------------------------------------------------------------

def classify_waiver(inp: WaiverClassificationInput) -> WaiverClassificationResult:
    """
    Determines accounting mode, document type, and GST treatment for a waiver.

    Scenarios match docs/legal/subidha-contracts-backend-frontend-settings.md §5.1–5.4:
      A: UNREGISTERED, NOT_DELIVERED, NOT_ISSUED  → PRE_SUPPLY_CONTRACT_ADJUSTMENT
      B: UNREGISTERED, DELIVERED, ISSUED (non-GST bill)  → PRE_GST_COMMERCIAL_CREDIT
      C: REGISTERED, NOT_DELIVERED, RECEIPT_VOUCHER_ONLY  → PRE_SUPPLY_CONTRACT_ADJUSTMENT
      D: REGISTERED, DELIVERED, ISSUED (tax invoice)  → POST_SUPPLY_GST_CREDIT_NOTE (CA review required)
      E: Any, CANCELLED, Any  → REFUND_VOUCHER
      F: Partial/pending states  → HYBRID_CA_RULE
    """
    result = WaiverClassificationResult()
    gst = inp.gst_status.upper()
    delivery = inp.delivery_status.upper()
    invoice = inp.invoice_status.upper()
    registered = _is_registered(gst)

    # Cancellation always leads to refund flow
    if delivery == "CANCELLED":
        result.waiver_accounting_mode = "REFUND_VOUCHER"
        result.document_to_generate = "REFUND_VOUCHER"
        result.gst_reduction_allowed = False
        result.scenario = "E"
        result.audit_reason = "Contract cancelled before delivery — full refund voucher."
        result.ledger_posting_template = "Dr CustomerAdvance Cr Bank/Cash"
        return result

    # Scenario A: Unregistered, product not yet delivered, no invoice
    if not registered and delivery in ("NOT_DELIVERED", "PARTIAL") and invoice in ("NOT_ISSUED", "RECEIPT_VOUCHER_ONLY"):
        result.waiver_accounting_mode = "PRE_SUPPLY_CONTRACT_ADJUSTMENT"
        result.document_to_generate = "COMMERCIAL_WAIVER_NOTE"
        result.gst_reduction_allowed = False
        result.scenario = "A"
        result.audit_reason = (
            "Business is unregistered and product not yet delivered: "
            "waiver treated as pre-supply contract adjustment, no GST credit note required."
        )
        result.ledger_posting_template = (
            "No GST credit note. Reduce future receivable / adjust instalment schedule."
        )
        result.warnings.append(
            "Ensure CA confirms this pre-supply treatment is appropriate before issuing the waiver note."
        )
        return result

    # Scenario B: Unregistered, delivered, non-GST sale bill already issued
    if not registered and delivery == "DELIVERED" and invoice in ("ISSUED", "PARTIAL"):
        result.waiver_accounting_mode = "PRE_GST_COMMERCIAL_CREDIT"
        result.document_to_generate = "COMMERCIAL_CREDIT_NOTE"
        result.gst_reduction_allowed = False
        result.scenario = "B"
        result.audit_reason = (
            "Business is unregistered, product delivered, non-GST sale bill issued: "
            "waiver treated as commercial credit note reducing customer receivable."
        )
        result.ledger_posting_template = (
            "Dr Promotional Waiver / Sales Discount\n    Cr Customer Receivable"
        )
        return result

    # Scenario C: GST registered, NOT delivered, only receipt voucher
    if registered and delivery in ("NOT_DELIVERED", "PARTIAL") and invoice in ("NOT_ISSUED", "RECEIPT_VOUCHER_ONLY"):
        result.waiver_accounting_mode = "PRE_SUPPLY_CONTRACT_ADJUSTMENT"
        result.document_to_generate = "RECEIPT_VOUCHER"
        result.gst_reduction_allowed = False
        result.scenario = "C"
        result.audit_reason = (
            "Business is GST registered but product not yet delivered: "
            "pre-supply adjustment via receipt/refund voucher as per CA-approved handling."
        )
        result.ledger_posting_template = (
            "Dr Customer Advance / Contract Liability\n    Cr Refund Payable/Bank"
        )
        result.warnings.append(
            "Confirm with CA whether refund voucher is required under CGST §31 for this advance receipt."
        )
        return result

    # Scenario D: GST registered, delivered, tax invoice issued — CA review required
    if registered and delivery == "DELIVERED" and invoice == "ISSUED":
        result.waiver_accounting_mode = "POST_SUPPLY_GST_CREDIT_NOTE"
        result.document_to_generate = "GST_CREDIT_NOTE"
        result.gst_reduction_allowed = True
        result.scenario = "D"
        result.audit_reason = (
            "Business is GST registered, product delivered, tax invoice already issued: "
            "post-supply treatment requires CA approval — may use GST credit note (CGST §34) "
            "or commercial credit note without GST output reduction."
        )
        result.ledger_posting_template = (
            "CA-approved only:\n"
            "  Option 1 (GST §34): Dr Promotional Waiver  Cr AR + GST Output Reversal\n"
            "  Option 2 (Commercial only): Dr Promotional Waiver  Cr Customer Receivable"
        )
        result.blockers.append(
            "Post-supply GST credit note requires CA review and explicit approval before generation. "
            "Use commercial credit note if GST reduction is not CA-approved."
        )
        return result

    # Scenario F: All other partial/mixed states — require CA + hybrid treatment
    result.waiver_accounting_mode = "HYBRID_CA_RULE"
    result.document_to_generate = "COMMERCIAL_WAIVER_NOTE"
    result.gst_reduction_allowed = False
    result.scenario = "F"
    result.audit_reason = (
        f"Hybrid state: gst_status={gst}, delivery={delivery}, invoice={invoice}. "
        "Requires CA review to determine correct accounting mode."
    )
    result.blockers.append(
        "Waiver accounting mode could not be automatically determined for this combination of "
        "GST status, delivery status, and invoice status. Please request CA guidance."
    )
    return result


# ---------------------------------------------------------------------------
# Convenience: classify from raw dict (for API views / serializers)
# ---------------------------------------------------------------------------

def classify_waiver_from_dict(data: dict) -> dict:
    inp = WaiverClassificationInput(
        gst_status=str(data.get("gst_status", "UNREGISTERED")),
        delivery_status=str(data.get("delivery_status", "NOT_DELIVERED")),
        invoice_status=str(data.get("invoice_status", "NOT_ISSUED")),
        waiver_amount=float(data.get("waiver_amount") or 0),
        waiver_month=str(data.get("waiver_month", "")),
        contract_id=data.get("contract_id"),
        customer_id=data.get("customer_id"),
    )
    result = classify_waiver(inp)
    return {
        "waiver_allowed": result.waiver_allowed,
        "waiver_accounting_mode": result.waiver_accounting_mode,
        "document_to_generate": result.document_to_generate,
        "gst_reduction_allowed": result.gst_reduction_allowed,
        "ledger_posting_template": result.ledger_posting_template,
        "audit_reason": result.audit_reason,
        "blockers": result.blockers,
        "warnings": result.warnings,
        "scenario": result.scenario,
    }


# ---------------------------------------------------------------------------
# Matrix: all 6 scenarios for admin display
# ---------------------------------------------------------------------------

WAIVER_CLASSIFICATION_MATRIX = [
    {
        "scenario": "A",
        "gst_status": "UNREGISTERED",
        "delivery_status": "NOT_DELIVERED",
        "invoice_status": "NOT_ISSUED",
        "waiver_accounting_mode": "PRE_SUPPLY_CONTRACT_ADJUSTMENT",
        "document": "COMMERCIAL_WAIVER_NOTE",
        "gst_credit_note": False,
        "description": "Unregistered, not delivered, no invoice — contract adjustment only.",
    },
    {
        "scenario": "B",
        "gst_status": "UNREGISTERED",
        "delivery_status": "DELIVERED",
        "invoice_status": "ISSUED",
        "waiver_accounting_mode": "PRE_GST_COMMERCIAL_CREDIT",
        "document": "COMMERCIAL_CREDIT_NOTE",
        "gst_credit_note": False,
        "description": "Unregistered, delivered, non-GST bill issued — commercial credit note.",
    },
    {
        "scenario": "C",
        "gst_status": "GST_REGULAR",
        "delivery_status": "NOT_DELIVERED",
        "invoice_status": "RECEIPT_VOUCHER_ONLY",
        "waiver_accounting_mode": "PRE_SUPPLY_CONTRACT_ADJUSTMENT",
        "document": "RECEIPT_VOUCHER",
        "gst_credit_note": False,
        "description": "Registered, not delivered, only receipt voucher — pre-supply adjustment.",
    },
    {
        "scenario": "D",
        "gst_status": "GST_REGULAR",
        "delivery_status": "DELIVERED",
        "invoice_status": "ISSUED",
        "waiver_accounting_mode": "POST_SUPPLY_GST_CREDIT_NOTE",
        "document": "GST_CREDIT_NOTE",
        "gst_credit_note": True,
        "description": "Registered, delivered, tax invoice issued — CA review required for GST credit note.",
    },
    {
        "scenario": "E",
        "gst_status": "ANY",
        "delivery_status": "CANCELLED",
        "invoice_status": "ANY",
        "waiver_accounting_mode": "REFUND_VOUCHER",
        "document": "REFUND_VOUCHER",
        "gst_credit_note": False,
        "description": "Contract cancelled before delivery — full refund within 7 working days.",
    },
    {
        "scenario": "F",
        "gst_status": "ANY",
        "delivery_status": "ANY",
        "invoice_status": "ANY",
        "waiver_accounting_mode": "HYBRID_CA_RULE",
        "document": "COMMERCIAL_WAIVER_NOTE",
        "gst_credit_note": False,
        "description": "Partial/mixed state — CA review required before treatment is applied.",
    },
]
