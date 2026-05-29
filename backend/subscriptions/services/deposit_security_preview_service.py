from django.core.exceptions import ValidationError
from subscriptions.models import ContractAmendment, SubscriptionStatus

def preview_deposit_security_amendment(amendment: ContractAmendment) -> dict:
    source = amendment.source_contract()
    if not source:
        raise ValidationError({"detail": "Source contract is required for deposit/security preview."})
    
    terminal_statuses = {SubscriptionStatus.CANCELLED, "CLOSED", "COMPLETED", "DEFAULTED", "RETURNED", "TERMINATED", "REVERSED"}
    if source.status in terminal_statuses:
        raise ValidationError({"detail": f"Amendment is blocked for terminal contract status '{source.status}'."})

    requested_values = amendment.requested_values or amendment.new_values or {}

    current_deposit = getattr(source, 'security_deposit', '0.00')
    current_deposit_amount = str(current_deposit) if current_deposit is not None else "0.00"
    
    requested_deposit_amount = requested_values.get("security_deposit") or requested_values.get("deposit_amount") or requested_values.get("amount")

    if requested_deposit_amount is not None:
        try:
            float(requested_deposit_amount)
        except ValueError:
            raise ValidationError({"detail": "Requested deposit amount is invalid."})

    deposit_status = getattr(source, 'deposit_status', "Not exposed")
    received_amount = getattr(source, 'deposit_received_amount', "Not exposed")
    refunded_amount = getattr(source, 'deposit_refunded_amount', "Not exposed")
    deducted_amount = getattr(source, 'deposit_deducted_amount', "Not exposed")

    liability_impact = "Modifies core security deposit liability balance."
    refund_deduction_risk = "May create mismatches if deposit is already received, refunded, or deducted."
    accounting_impact = "Requires general ledger re-posting for deposit liability."
    reconciliation_impact = "Requires reconciliation bridge update."
    
    possession_risk = "None"
    if getattr(source, 'status', None) in {SubscriptionStatus.HANDED_OVER, SubscriptionStatus.DELIVERY_PENDING}:
        possession_risk = "Deposit changes after possession/delivery process may violate handover prerequisites."

    blocked_reason = "Execution is not enabled yet. Deposit/security amendments require a dedicated liability, refund/deduction, accounting, and reconciliation workflow."

    return {
        "amendment_id": amendment.pk,
        "amendment_type": amendment.amendment_type,
        "amendment_status": amendment.status,
        "current_contract_id": source.pk,
        "current_contract_reference": getattr(source, 'contract_reference', None) or source.subscription_number,
        "customer_id": source.customer_id,
        "customer_name": source.customer.name if source.customer else None,
        "current_deposit_amount": current_deposit_amount,
        "requested_deposit_amount": requested_deposit_amount,
        "current_deposit_status": str(deposit_status),
        "deposit_received_amount": str(received_amount),
        "deposit_refunded_amount": str(refunded_amount),
        "deposit_deducted_amount": str(deducted_amount),
        "liability_impact_category": liability_impact,
        "refund_deduction_risk": refund_deduction_risk,
        "accounting_impact_category": accounting_impact,
        "reconciliation_impact_category": reconciliation_impact,
        "possession_handover_risk": possession_risk,
        "execution_supported": False,
        "blocker_reasons": [blocked_reason]
    }
