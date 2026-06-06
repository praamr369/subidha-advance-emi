from __future__ import annotations

from typing import Any

from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounting.models import DocumentSequence, JournalEntry
from accounting.services.accounting_bridge_readiness_service import build_accounting_bridge_period_readiness
from accounting.services.accounting_mapping_remediation_service import (
    apply_mapping,
    build_mapping_remediation_summary,
    create_missing_mapped_account,
    seed_supported_defaults,
)
from accounting.services.accounting_postability_service import evaluate_accounting_postability
from accounting.services.returns_damage_credit_bridge_readiness_service import build_accounting_bridge_readiness_with_returns_damage_credit
from api.v1.permissions import IsAdmin

REQUIRED_EVENTS = {
    "direct_sale_invoice": ("Direct sale invoice", "Sales / Billing", "BillingInvoice"),
    "direct_sale_receipt": ("Direct sale receipt", "Sales / Billing", "ReceiptDocument"),
    "tax_invoice": ("Tax invoice", "Sales / Billing", "TaxInvoice"),
    "credit_note": ("Credit note", "Sales / Billing", "BillingCreditNote"),
    "debit_note": ("Debit note", "Sales / Billing", "BillingDebitNote"),
    "advance_emi_collection": ("Advance EMI collection", "Subscription EMI", "Payment"),
    "subscription_emi_payment": ("Subscription EMI payment", "Subscription EMI", "Payment"),
    "subscription_emi_waiver_loss": ("Subscription EMI waiver loss", "Subscription EMI", "AuditLog"),
    "customer_advance": ("Customer advance", "Subscription EMI", "ReceiptDocument"),
    "cancellation_deduction": ("Cancellation deduction", "Subscription EMI", "OperationalCancellation"),
    "rent_monthly_collection": ("Rent monthly collection", "Rent / Lease", "Subscription"),
    "lease_monthly_collection": ("Lease monthly collection", "Rent / Lease", "Subscription"),
    "rent_security_deposit": ("Rent security deposit", "Rent / Lease", "Subscription"),
    "lease_security_deposit": ("Lease security deposit", "Rent / Lease", "Subscription"),
    "security_deposit_refund": ("Security deposit refund", "Rent / Lease", "Subscription"),
    "damage_recovery": ("Damage recovery", "Rent / Lease", "Subscription"),
    "rent_lease_adjustment": ("Rent/lease adjustment", "Rent / Lease", "RentLeaseAdjustment"),
    "commission_accrual": ("Commission accrual", "Commission / Payout", "Commission"),
    "commission_approval": ("Commission approval", "Commission / Payout", "Commission"),
    "commission_payout": ("Commission payout", "Commission / Payout", "CommissionPayoutBatch"),
    "payout_batch_payment": ("Payout batch payment", "Commission / Payout", "CommissionPayoutBatch"),
    "purchase_inventory_receive": ("Purchase inventory receive", "Inventory", "StockLedger"),
    "inventory_delivery_out": ("Inventory delivery out", "Inventory", "StockLedger"),
    "stock_adjustment_gain": ("Stock adjustment gain", "Inventory", "StockLedger"),
    "stock_adjustment_loss": ("Stock adjustment loss", "Inventory", "StockLedger"),
    "customer_return_receive": ("Customer return receive", "Inventory", "ServiceDeskCase"),
    "vendor_return_out": ("Vendor return out", "Inventory", "StockLedger"),
    "production_material_consume": ("Production material consume", "Manufacturing", "ProductionJob"),
    "production_output_receive": ("Production output receive", "Manufacturing", "ProductionJob"),
    "manufacturing_wastage": ("Manufacturing wastage", "Manufacturing", "ProductionJob"),
    "manufacturing_scrap_recovery": ("Manufacturing scrap recovery", "Manufacturing", "ProductionJob"),
    "cashier_collection": ("Cashier collection", "Payments / Settlement", "SettlementAllocation"),
    "bank_deposit": ("Bank deposit", "Payments / Settlement", "MoneyMovement"),
    "settlement_allocation": ("Settlement allocation", "Payments / Settlement", "SettlementAllocation"),
    "payment_reversal": ("Payment reversal", "Payments / Settlement", "Payment"),
    "receipt_void": ("Receipt void", "Payments / Settlement", "ReceiptDocument"),
    "staff_advance": ("Staff advance", "Unsupported / Future", "StaffAdvance"),
}

ALIASES = {
    "rent_monthly_collection": "rent_lease_monthly_collection",
    "lease_monthly_collection": "rent_lease_monthly_collection",
    "rent_security_deposit": "security_deposit_collection",
    "lease_security_deposit": "security_deposit_collection",
    "purchase_inventory_receive": "inventory_purchase_receive",
    "commission_approval": "commission_accrual",
    "payout_batch_payment": "commission_payout",
    "production_material_consume": "manufacturing_consumption",
    "production_output_receive": "manufacturing_output",
}


class MappingAuditActionSerializer(serializers.Serializer):
    event_key = serializers.CharField(required=True)
    action = serializers.ChoiceField(choices=("create_account", "apply_mapping", "reactivate_mapping", "open_manual_required"), required=True)
    purpose = serializers.CharField(required=False, allow_blank=True)


def _bridge_events_by_key() -> dict[str, dict[str, Any]]:
    payload = build_accounting_bridge_readiness_with_returns_damage_credit()
    rows = {str(row.get("event_key") or "").strip(): row for row in payload.get("events") or []}
    for alias, source in ALIASES.items():
        if source in rows and alias not in rows:
            rows[alias] = {**rows[source], "event_key": alias, "label": REQUIRED_EVENTS[alias][0]}
    return rows


def _remediation_rows_by_key() -> dict[str, dict[str, Any]]:
    payload = build_mapping_remediation_summary()
    rows = {str(row.get("event_key") or row.get("event_type") or "").strip(): row for row in payload.get("rows") or []}
    for alias, source in ALIASES.items():
        if source in rows and alias not in rows:
            rows[alias] = {**rows[source], "event_key": alias, "event_type": alias}
    return rows


def _missing_fields(postability: dict[str, Any], bridge: dict[str, Any] | None) -> list[str]:
    missing: list[str] = []
    debit_requirements = (bridge or {}).get("debit_requirements") or []
    credit_requirements = (bridge or {}).get("credit_requirements") or []
    if not postability.get("mapping_ready"):
        if not debit_requirements:
            missing.append("debit_account")
        if not credit_requirements:
            missing.append("credit_account")
    if not postability.get("finance_account_ready"):
        missing.append("finance_account")
    if not postability.get("active_financial_year_ready"):
        missing.append("active_financial_year")
    if not postability.get("accounting_period_ready"):
        missing.append("accounting_period")
    if not postability.get("journal_numbering_ready"):
        missing.append("journal_numbering")
    if not postability.get("approval_ready"):
        missing.append("posting_approval")
    return missing


def _blocker_category(status_value: str, blocker_code: str | None) -> str:
    if blocker_code == "UNSUPPORTED_SOURCE" or status_value == "UNSUPPORTED_SOURCE":
        return "unsupported_source"
    if status_value == "BLOCKED_BY_MAPPING":
        return "mapping"
    if status_value == "BLOCKED_BY_PERIOD":
        return "period"
    if status_value == "BLOCKED_BY_NUMBERING":
        return "numbering"
    if status_value == "BLOCKED_BY_APPROVAL":
        return "approval"
    if status_value in {"READY", "POSTABLE", "READY_UNPOSTED", "POSTED", "RECONCILED"}:
        return "ready"
    return "setup"


def _severity(status_value: str, blocker_code: str | None) -> str:
    if status_value in {"READY", "POSTABLE", "READY_UNPOSTED", "POSTED", "RECONCILED"}:
        return "READY"
    if blocker_code == "UNSUPPORTED_SOURCE" or status_value == "UNSUPPORTED_SOURCE":
        return "UNSUPPORTED"
    if status_value in {"BLOCKED_BY_MAPPING", "BLOCKED_BY_PERIOD", "BLOCKED_BY_NUMBERING", "BLOCKED_BY_APPROVAL"}:
        return "BLOCKED"
    return "WARNING"


def _remediation_route(category: str, postability: dict[str, Any]) -> str:
    if category == "numbering":
        return "/admin/settings/business-setup/document-numbering"
    if category == "period":
        return "/admin/accounting/periods"
    if category == "approval":
        return "/admin/accounting/bridges"
    if category == "unsupported_source":
        return "/admin/accounting/setup/mapping-audit"
    return postability.get("setup_href") or "/admin/accounting/setup"


def _remediation_label(category: str) -> str:
    return {
        "mapping": "Open accounting setup",
        "period": "Open periods",
        "numbering": "Open document numbering",
        "approval": "Open bridge approval",
        "unsupported_source": "Keep unsupported",
        "ready": "Ready",
    }.get(category, "Open setup")


def _audit_row(event_key: str, period: dict[str, Any], bridge: dict[str, Any] | None, remediation: dict[str, Any] | None) -> dict[str, Any]:
    label, module, source_model = REQUIRED_EVENTS[event_key]
    postability = evaluate_accounting_postability(
        event_key=event_key,
        event_label=label,
        module=module,
        source_model=source_model,
        bridge_row=bridge,
        period_readiness=period,
        source_workflow_exists=event_key != "staff_advance" and bridge is not None,
    )
    mapping_status = "READY" if postability["mapping_ready"] else "BLOCKED_BY_MAPPING"
    status_value = str(postability["status"])
    category = _blocker_category(status_value, postability.get("blocker_code"))
    severity = _severity(status_value, postability.get("blocker_code"))
    return {
        **postability,
        "label": label,
        "posting_enabled": False,
        "posting_mode": (bridge or {}).get("posting_mode") or "AUDIT_DEFERRED",
        "debit_purpose": ((bridge or {}).get("debit_requirements") or [None])[0],
        "credit_purpose": ((bridge or {}).get("credit_requirements") or [None])[0],
        "debit_account_code": ((bridge or {}).get("debit_requirements") or [None])[0],
        "credit_account_code": ((bridge or {}).get("credit_requirements") or [None])[0],
        "debit_account_type": None,
        "credit_account_type": None,
        "debit_mapping_status": mapping_status,
        "credit_mapping_status": mapping_status,
        "finance_account_status": "READY" if postability["finance_account_ready"] else "BLOCKED_BY_MAPPING",
        "period_readiness": "READY" if postability["accounting_period_ready"] else "BLOCKED_BY_PERIOD",
        "numbering_readiness": "READY" if postability["journal_numbering_ready"] else "BLOCKED_BY_NUMBERING",
        "bridge_status": (bridge or {}).get("status"),
        "can_seed": event_key != "staff_advance" and postability["status"] in {"BLOCKED_BY_MAPPING", "BLOCKED_BY_PERIOD", "BLOCKED_BY_NUMBERING"},
        "can_apply_mapping": bool((remediation or {}).get("can_apply_mapping") or (remediation or {}).get("can_map_account")),
        "can_post": False,
        "severity": severity,
        "blocker_category": category,
        "remediation_label": _remediation_label(category),
        "remediation_route": _remediation_route(category, postability),
        "missing_fields": _missing_fields(postability, bridge),
        "is_close_blocker": severity in {"BLOCKED", "UNSUPPORTED"},
        "is_posting_blocker": status_value not in {"READY", "POSTABLE", "READY_UNPOSTED", "POSTED", "RECONCILED"},
        "details": {"bridge": bridge or {}, "remediation": remediation or {}, "postability": postability},
    }


def build_mapping_audit_payload(*, read_only: bool = True) -> dict[str, Any]:
    period = build_accounting_bridge_period_readiness()
    bridge_rows = _bridge_events_by_key()
    remediation_rows = _remediation_rows_by_key()
    rows = [_audit_row(key, period, bridge_rows.get(key), remediation_rows.get(key)) for key in REQUIRED_EVENTS]
    ready = [row for row in rows if row["status"] in {"READY", "POSTABLE"}]
    missing = [row for row in rows if row["status"] == "BLOCKED_BY_MAPPING"]
    conflicts = [row for row in rows if row["blocker_code"] in {"CONFLICT", "WRONG_ACCOUNT_TYPE", "DUPLICATE_ACTIVE_MAPPING"}]
    unsupported = [row for row in rows if row["status"] == "UNSUPPORTED_SOURCE"]
    blocked_period = [row for row in rows if row["status"] == "BLOCKED_BY_PERIOD"]
    blocked_numbering = [row for row in rows if row["status"] == "BLOCKED_BY_NUMBERING"]
    blocked_approval = [row for row in rows if row["status"] == "BLOCKED_BY_APPROVAL"]
    return {
        "generated_at": period.get("reference_date"),
        "read_only": read_only,
        "journal_entries_created": 0,
        "document_sequences_allocated": 0,
        "period_readiness": period,
        "year_end_impact": "BLOCKED" if len(ready) != len(rows) else "READY",
        "bridge_impact": "BLOCKED" if len(ready) != len(rows) else "READY",
        "summary": {
            "total_events": len(rows),
            "ready": len([row for row in rows if row["status"] == "READY"]),
            "postable": len([row for row in rows if row["status"] == "POSTABLE"]),
            "ready_unposted": len([row for row in rows if row["status"] == "READY_UNPOSTED"]),
            "posted": len([row for row in rows if row["status"] == "POSTED"]),
            "reconciled": len([row for row in rows if row["status"] == "RECONCILED"]),
            "missing_mapping": len(missing),
            "conflicts": len(conflicts),
            "unsupported": len(unsupported),
            "blocked_by_mapping": len(missing),
            "blocked_by_period": len(blocked_period),
            "blocked_by_numbering": len(blocked_numbering),
            "blocked_by_approval": len(blocked_approval),
        },
        "events": rows,
        "ready_mappings": ready,
        "missing_mappings": missing,
        "conflicts": conflicts,
        "unsupported_events": unsupported,
        "setup_blockers": [row for row in rows if row["status"] not in {"READY", "POSTABLE", "POSTED", "RECONCILED"}],
    }


class AccountingMappingAuditView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        return Response(build_mapping_audit_payload(read_only=True), status=status.HTTP_200_OK)


class AccountingMappingAuditSeedDefaultsView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request):
        journal_before = JournalEntry.objects.count()
        sequence_before = DocumentSequence.objects.count()
        before = build_mapping_audit_payload(read_only=True)
        result = seed_supported_defaults(actor=request.user)
        after = build_mapping_audit_payload(read_only=False)
        return Response({"before": before, "after": after, "remediation": result, "journal_entries_created": JournalEntry.objects.count() - journal_before, "document_sequences_allocated": DocumentSequence.objects.count() - sequence_before}, status=status.HTTP_200_OK)


class AccountingMappingAuditFixEventView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request):
        serializer = MappingAuditActionSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        event_key = serializer.validated_data["event_key"]
        action = serializer.validated_data["action"]
        if event_key == "staff_advance":
            return Response({"detail": "StaffAdvance workflow is unsupported and cannot be auto-fixed."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            if action == "create_account":
                result = create_missing_mapped_account(event_type=event_key, actor=request.user)
            elif action in {"apply_mapping", "reactivate_mapping"}:
                result = apply_mapping(event_type=event_key, actor=request.user)
            else:
                result = {"detail": "Manual review required; no mutation performed."}
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"result": result, "audit": build_mapping_audit_payload(read_only=False)}, status=status.HTTP_200_OK)


class AccountingMappingAuditValidateView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request):
        return Response(build_mapping_audit_payload(read_only=True), status=status.HTTP_200_OK)
