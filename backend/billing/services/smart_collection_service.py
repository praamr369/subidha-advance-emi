from __future__ import annotations

import logging
from decimal import Decimal
from typing import Any

from django.db import transaction
from django.core.exceptions import ValidationError
from django.utils import timezone

from billing.models import DirectSale, SmartCollectionRun
from subscriptions.models import CustomerAdvance, Emi, Customer, Payment
from subscriptions.services.payment_service import record_emi_payment
from billing.services.direct_sale_collection_service import collect_direct_sale_payment
from subscriptions.services.payment_allocation_service import PaymentAllocationService, _emi_outstanding_amount
from subscriptions.services.customer_advance_service import CustomerAdvanceService

logger = logging.getLogger(__name__)


def plan_smart_collection(
    *,
    customer_id: int,
    amount: Decimal,
    use_existing_advance: bool = True,
) -> dict:
    """Pure read-only planner. No writes, no locks beyond snapshot reads.
    Returns the allocation plan the UI previews."""
    
    amount = Decimal(str(amount))
    if amount <= Decimal("0.00"):
        raise ValidationError({"amount": "Amount must be greater than zero."})
        
    try:
        customer = Customer.objects.get(id=customer_id)
    except Customer.DoesNotExist:
        raise ValidationError({"customer_id": "Customer does not exist."})
    
    pool_cash = amount
    pool_advance = Decimal("0.00")
    
    opening_advance = Decimal("0.00")
    advance = CustomerAdvance.objects.filter(customer_id=customer_id).first()
    
    if advance:
        opening_advance = advance.unapplied_balance
        if use_existing_advance:
            pool_advance = advance.unapplied_balance
            
    allocations = []
    skipped = []
    
    # Get all unpaid EMIs
    unpaid_emis = list(Emi.objects.filter(
        subscription__customer_id=customer_id,
        is_paid=False
    ).order_by('due_date', 'month_no', 'subscription_id'))
    
    opening_emi_outstanding = sum([_emi_outstanding_amount(e) for e in unpaid_emis])
    
    # STEP 0 — existing advance consumes EMIs first
    remaining_unpaid_emis = []
    
    for emi in unpaid_emis:
        emi_due = _emi_outstanding_amount(emi)
        if emi_due <= Decimal("0.00"):
            continue
            
        if use_existing_advance and pool_advance >= emi_due:
            allocations.append({
                "step": "ADVANCE_TO_EMI",
                "emi_id": emi.id,
                "subscription_number": emi.subscription.subscription_number,
                "month_no": emi.month_no,
                "amount": str(emi_due)
            })
            pool_advance -= emi_due
        else:
            remaining_unpaid_emis.append(emi)
            
    # STEP 1 — cash to remaining oldest unpaid EMIs (SKIP-PARTIAL rule)
    for emi in remaining_unpaid_emis:
        emi_due = _emi_outstanding_amount(emi)
        if emi_due <= Decimal("0.00"):
            continue
            
        if pool_cash >= emi_due:
            allocations.append({
                "step": "CASH_TO_EMI",
                "emi_id": emi.id,
                "subscription_number": emi.subscription.subscription_number,
                "month_no": emi.month_no,
                "amount": str(emi_due)
            })
            pool_cash -= emi_due
        else:
            # skip partial EMI entirely; money flows to next bucket
            skipped.append({
                "reason": "PARTIAL_EMI_SKIPPED",
                "emi_id": emi.id,
                "emi_amount": str(emi_due),
                "available": str(pool_cash)
            })
            
    # STEP 2 — cash to oldest pending Direct Sales
    pending_sales = list(DirectSale.objects.filter(
        customer_id=customer_id,
        balance_total__gt=0,
        status="INVOICED"
    ).order_by('sale_date', 'id'))
    
    opening_ds_outstanding = sum([s.balance_total for s in pending_sales])
    
    for sale in pending_sales:
        if pool_cash <= Decimal("0.00"):
            break
            
        pay = min(pool_cash, sale.balance_total)
        if pay > Decimal("0.00"):
            allocations.append({
                "step": "CASH_TO_DIRECT_SALE",
                "direct_sale_id": sale.id,
                "sale_no": sale.sale_no,
                "amount": str(pay)
            })
            pool_cash -= pay
            
    # STEP 3 — remainder to Customer Advance
    if pool_cash > Decimal("0.00"):
        allocations.append({
            "step": "CASH_TO_ADVANCE",
            "amount": str(pool_cash)
        })
        
    # closing advance calculation (unallocated cash goes to advance)
    if use_existing_advance:
        closing_advance = pool_advance + pool_cash
    else:
        closing_advance = opening_advance + pool_cash
        
    return {
        "customer": {
            "id": customer.id,
            "name": customer.full_name,
            "phone": customer.phone
        },
        "input": {
            "amount": str(amount),
            "use_existing_advance": use_existing_advance
        },
        "opening": {
            "advance_balance": str(opening_advance),
            "emi_outstanding_total": str(opening_emi_outstanding),
            "direct_sale_outstanding_total": str(opening_ds_outstanding)
        },
        "allocations": allocations,
        "skipped": skipped,
        "closing": {
            "advance_balance": str(closing_advance),
            "cash_unallocated": "0.00"
        },
        "dry_run": True,
        "idempotent_replay": False
    }


def execute_smart_collection(
    *,
    customer_id: int,
    amount: Decimal,
    payment_method: str,
    finance_account_id: int,
    collected_by,
    use_existing_advance: bool = True,
    idempotency_key: str,
    branch_id: int | None = None,
    cash_counter_id: int | None = None,
    reference_no: str | None = None,
    notes: str | None = None,
) -> dict:
    """Re-plans under select_for_update, then posts each allocation via the
    existing services inside ONE transaction.atomic block."""
    
    if not idempotency_key:
        raise ValidationError({"idempotency_key": "Idempotency key is required."})
        
    amount = Decimal(str(amount))
    if amount <= Decimal("0.00"):
        raise ValidationError({"amount": "Amount must be greater than zero."})
        
    # Check idempotent replay
    existing_run = SmartCollectionRun.objects.filter(idempotency_key=idempotency_key).first()
    if existing_run:
        result = existing_run.result_json
        result["idempotent_replay"] = True
        return result

    if not finance_account_id:
        raise ValidationError({"finance_account_id": "Finance account ID is required for execution."})
        
    with transaction.atomic():
        # Re-plan under snapshot isolation implicitly, we rely on the locking of the underlying services
        # We will lock the CustomerAdvance, Emi, and DirectSale records that we touch.
        
        # Actually, let's lock them in advance if we can, or just let the services do it.
        # But we need an accurate plan before calling services.
        # Lock EMIs and Sales
        list(Emi.objects.select_for_update().filter(subscription__customer_id=customer_id, is_paid=False))
        list(DirectSale.objects.select_for_update().filter(customer_id=customer_id, status="INVOICED", balance_total__gt=0))
        CustomerAdvance.objects.select_for_update().filter(customer_id=customer_id)
        
        # Now re-run plan safely
        plan = plan_smart_collection(
            customer_id=customer_id,
            amount=amount,
            use_existing_advance=use_existing_advance
        )
        
        # Warn if nothing to allocate and all goes to advance? (No strict need to abort, allowed).
        
        payment_ids = []
        receipt_ids = []
        advance_id = None
        
        receipt_no = f"SC-{timezone.localdate().year}-{idempotency_key[:8].upper()}"
        
        for allocation in plan["allocations"]:
            step = allocation["step"]
            alloc_amount = Decimal(allocation["amount"])
            
            if step == "ADVANCE_TO_EMI":
                PaymentAllocationService.allocate_customer_advance(
                    customer_id=customer_id,
                    emi_id=allocation["emi_id"],
                    amount=alloc_amount,
                    allocated_by=collected_by
                )
                
            elif step == "CASH_TO_EMI":
                emi_id = allocation["emi_id"]
                emi_key = f"{idempotency_key}:emi:{emi_id}"
                payment = record_emi_payment(
                    emi_id=emi_id,
                    amount=alloc_amount,
                    payment_method=payment_method,
                    collected_by=collected_by,
                    idempotency_key=emi_key,
                    finance_account_id=finance_account_id,
                    branch_id=branch_id,
                    cash_counter_id=cash_counter_id,
                    reference_no=reference_no,
                    notes=notes
                )
                payment_ids.append(payment.id)
                
            elif step == "CASH_TO_DIRECT_SALE":
                sale_id = allocation["direct_sale_id"]
                ds_key = f"{idempotency_key}:ds:{sale_id}"
                receipt = collect_direct_sale_payment(
                    direct_sale_id=sale_id,
                    amount=alloc_amount,
                    payment_method=payment_method,
                    collected_by=collected_by,
                    finance_account_id=finance_account_id,
                    branch_id=branch_id,
                    cash_counter_id=cash_counter_id,
                    reference_no=reference_no or ds_key,
                    notes=notes
                )
                receipt_ids.append(receipt.id)
                
            elif step == "CASH_TO_ADVANCE":
                advance = CustomerAdvanceService.collect_unapplied_advance(
                    customer_id=customer_id,
                    amount=alloc_amount,
                    payment_method=payment_method,
                    finance_account_id=finance_account_id,
                    collected_by=collected_by,
                    reference_no=reference_no,
                    notes=notes
                )
                advance_id = advance.id
                
        plan["dry_run"] = False
        plan["receipt"] = {
            "receipt_no": receipt_no,
            "receipt_date": str(timezone.localdate()),
            "payment_ids": payment_ids,
            "receipt_ids": receipt_ids,
            "advance_id": advance_id
        }
        
        # Save idempotency record
        SmartCollectionRun.objects.create(
            idempotency_key=idempotency_key,
            customer_id=customer_id,
            amount=amount,
            status="SUCCESS",
            result_json=plan,
            created_by=collected_by
        )
        
    return plan
