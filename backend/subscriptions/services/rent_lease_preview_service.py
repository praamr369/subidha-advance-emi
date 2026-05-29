from django.core.exceptions import ValidationError
from subscriptions.models import ContractAmendment, SubscriptionStatus

def preview_rent_lease_amendment(amendment: ContractAmendment) -> dict:
    source = amendment.source_contract()
    if not source:
        raise ValidationError({"detail": "Source rent/lease contract is required for preview."})
    
    if source.status in {SubscriptionStatus.CANCELLED, "CLOSED", "COMPLETED", "DEFAULTED", "RETURNED", "TERMINATED", "REVERSED"}:
        raise ValidationError({"detail": f"Amendment is blocked for terminal contract status '{source.status}'."})

    requested_values = amendment.requested_values or amendment.new_values or {}

    current_product = source.product
    requested_product_id = requested_values.get("product_id") or requested_values.get("product")
    
    current_monthly_amount = str(source.monthly_amount)
    requested_monthly_amount = requested_values.get("monthly_amount") or requested_values.get("rent_amount") or requested_values.get("lease_amount")
    
    current_tenure = source.tenure_months
    requested_tenure = requested_values.get("tenure_months") or requested_values.get("lease_term")

    # Assuming deposit is tracked somehow, but according to models we might just use total_amount or have no deposit directly.
    # We will safely pull it if it exists.
    current_deposit_amount = str(getattr(source, 'security_deposit', '0.00'))
    requested_deposit_amount = requested_values.get("security_deposit") or requested_values.get("deposit_amount")

    demand_schedule_impact = "Significant impact on future monthly demands."
    if requested_tenure and requested_tenure != current_tenure:
        demand_schedule_impact = "Tenure change will alter the number of demands generated."
    
    accounting_impact = "Requires general ledger re-posting for rent/lease revenue."
    reconciliation_impact = "Requires reconciliation bridge update."
    
    blocked_reason = "Execution is not enabled yet. Rent/lease amendments require a dedicated demand, deposit, accounting, and reconciliation workflow."

    return {
        "amendment_id": amendment.pk,
        "amendment_type": amendment.amendment_type,
        "amendment_status": amendment.status,
        "current_contract_id": source.pk,
        "current_contract_reference": source.contract_reference or source.subscription_number,
        "customer_id": source.customer_id,
        "customer_name": source.customer.name if source.customer else None,
        "current_product": current_product.name if current_product else None,
        "requested_product_id": requested_product_id,
        "current_monthly_amount": current_monthly_amount,
        "requested_monthly_amount": requested_monthly_amount,
        "current_tenure_months": current_tenure,
        "requested_tenure_months": requested_tenure,
        "current_start_date": str(source.start_date) if source.start_date else None,
        "current_end_date": str(source.end_date) if hasattr(source, "end_date") and source.end_date else None,
        "current_deposit_amount": current_deposit_amount,
        "requested_deposit_amount": requested_deposit_amount,
        "deposit_liability_risk": "High risk of security deposit mismatch.",
        "demand_schedule_impact_summary": demand_schedule_impact,
        "paid_demand_count": "Unknown",
        "pending_demand_count": "Unknown",
        "accounting_impact_category": accounting_impact,
        "reconciliation_impact_category": reconciliation_impact,
        "delivery_possession_risk": "Handover state may not align with updated terms.",
        "execution_supported": False,
        "blocker_reasons": [blocked_reason]
    }
