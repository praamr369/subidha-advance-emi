"""Two customer-portal read screens: security deposits and handover receipts.

Both models have existed for a long time; only the customer-facing HTTP layer
was missing, so the pages rendered empty. Read-only by construction — a
customer views their deposit history and their handover records, and changes
neither.

Every query is scoped to the requesting customer. That scoping IS the access
control here: there is no object-level permission check beyond it, so the
filter must never be conditional on anything the caller supplies.
"""
from __future__ import annotations

from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from api.v1.permissions import IsCustomer
from api.v1.views.customer_finance import (
    _customer_missing_response,
    _customer_or_404,
)


@api_view(["GET"])
@permission_classes([IsCustomer])
def customer_deposits_view(request):
    """Security deposit movements for this customer.

    Shows every transaction rather than a single balance: a deposit that was
    paid, partly forfeited and partly returned is three facts, and collapsing
    them into one number is exactly what a customer disputes at the counter.
    """
    from decimal import Decimal
    from payments.models import RentLeaseDepositTransaction
    from subscriptions.models import Subscription

    customer = _customer_or_404(request)
    if customer is None:
        return _customer_missing_response()

    rows = list(
        RentLeaseDepositTransaction.objects.select_related("subscription", "subscription__product")
        .filter(customer=customer)
        .order_by("-transaction_date", "-id")
    )

    results = []
    seen_sub_ids = set()

    for row in rows:
        sub = row.subscription
        sub_id = row.subscription_id
        if sub_id:
            seen_sub_ids.add(sub_id)
        prod_name = getattr(getattr(sub, "product", None), "name", "") or "Rental Subscription"
        amt = float(row.amount or 0)
        ttype = (row.transaction_type or "").upper()
        if ttype in ("COLLECTED", "DEPOSIT_RECEIPT"):
            deposit_status = "PAID"
            paid_amt = amt
        elif ttype in ("DEPOSIT_REFUND", "REFUNDED"):
            deposit_status = "REFUNDED"
            paid_amt = amt
        elif ttype in ("FORFEITED", "DEDUCTION"):
            deposit_status = "FORFEITED"
            paid_amt = 0.0
        else:
            deposit_status = "PENDING"
            paid_amt = 0.0

        results.append(
            {
                "id": row.pk,
                "transaction_number": row.transaction_number,
                "subscription_id": sub_id,
                "subscription_number": getattr(sub, "subscription_number", "") or (f"SUB-{sub_id}" if sub_id else ""),
                "product_name": prod_name,
                "transaction_type": row.transaction_type,
                "amount": row.amount,
                "deposit_amount": amt,
                "paid_amount": paid_amt,
                "status": deposit_status,
                "paid_at": row.transaction_date.isoformat() if row.transaction_date and deposit_status in ("PAID", "REFUNDED") else None,
                "refunded_at": row.transaction_date.isoformat() if row.transaction_date and deposit_status == "REFUNDED" else None,
                "transaction_date": row.transaction_date,
                "payment_method": row.payment_method,
                "reference_no": row.external_reference_no or "",
                "notes": row.external_reference_no or "",
            }
        )

    # For any RENT/LEASE contract without an existing deposit transaction, include pending record
    pending_subs = (
        Subscription.objects.select_related("product", "rent_profile", "lease_profile")
        .prefetch_related("contract_items", "rent_lease_demands")
        .filter(customer=customer, plan_type__in=["RENT", "LEASE"])
        .exclude(id__in=seen_sub_ids)
    )
    for sub in pending_subs:
        dep_amt = Decimal("0.00")
        if hasattr(sub, "rent_profile") and sub.rent_profile:
            dep_amt = sub.rent_profile.security_deposit_amount or Decimal("0.00")
        elif hasattr(sub, "lease_profile") and sub.lease_profile:
            dep_amt = sub.lease_profile.security_deposit_amount or Decimal("0.00")
        if dep_amt <= Decimal("0.00"):
            items = getattr(sub, "contract_items", None)
            if items:
                dep_amt = sum((it.security_deposit_amount or Decimal("0.00")) for it in items.all())
                if dep_amt <= Decimal("0.00"):
                    base_total = sum((it.total_base_price or Decimal("0.00")) for it in items.all())
                    if base_total > Decimal("0.00"):
                        dep_amt = (base_total * Decimal("0.20")).quantize(Decimal("0.01"))
        if dep_amt <= Decimal("0.00"):
            if sub.product and getattr(sub.product, "base_price", None):
                dep_amt = (Decimal(str(sub.product.base_price)) * Decimal("0.20")).quantize(Decimal("0.01"))
            elif sub.monthly_amount:
                dep_amt = (Decimal(str(sub.monthly_amount)) * Decimal("4.00")).quantize(Decimal("0.01"))

        if dep_amt > Decimal("0.00"):
            demand = sub.rent_lease_demands.filter(demand_type="SECURITY_DEPOSIT").first() if hasattr(sub, "rent_lease_demands") else None
            paid_amount = float(demand.collected_amount) if demand else 0.0
            status_val = demand.status if demand else "PENDING"
            if paid_amount > 0 and paid_amount < float(dep_amt):
                status_val = "PARTIAL"
            elif paid_amount >= float(dep_amt):
                status_val = "PAID"

            results.append(
                {
                    "id": f"sub-pending-{sub.id}",
                    "transaction_number": f"DEP-REQ-{sub.id}",
                    "subscription_id": sub.id,
                    "subscription_number": sub.subscription_number or f"SUB-{sub.id}",
                    "product_name": getattr(sub.product, "name", "") or "Rental Subscription",
                    "transaction_type": "DEMAND_PENDING",
                    "amount": str(dep_amt),
                    "deposit_amount": float(dep_amt),
                    "paid_amount": paid_amount,
                    "status": status_val,
                    "paid_at": sub.start_date.isoformat() if status_val in ("PAID", "PARTIAL") and sub.start_date else None,
                    "refunded_at": None,
                    "transaction_date": sub.start_date,
                    "payment_method": "",
                    "reference_no": "",
                    "notes": f"{status_val} contract deposit",
                }
            )

    return Response(
        {
            "count": len(results),
            "results": results,
        }
    )


@api_view(["GET"])
@permission_classes([IsCustomer])
def customer_handover_receipts_view(request):
    """Items handed over to this customer, and whether they went back.

    Includes returned items deliberately: a handover receipt is evidence of
    what was received and when, and it stays relevant after the item is
    returned — which is precisely when a dispute about its condition happens.
    """
    from deliveries.models import ProductPossession

    customer = _customer_or_404(request)
    if customer is None:
        return _customer_missing_response()

    rows = (
        ProductPossession.objects.select_related("subscription", "product")
        .filter(customer=customer)
        .order_by("-handover_date", "-id")
    )
    return Response(
        {
            "count": rows.count(),
            "results": [
                {
                    "id": row.pk,
                    "subscription_id": row.subscription_id,
                    "subscription_number": getattr(
                        row.subscription, "subscription_number", ""
                    )
                    or "",
                    "product_name": getattr(row.product, "name", "") or "",
                    "serial_number": row.serial_number or "",
                    "status": row.status,
                    "handover_date": row.handover_date,
                    "expected_return_date": row.expected_return_date,
                    "actual_return_date": row.actual_return_date,
                    "handover_condition_notes": row.handover_condition_notes or "",
                    # The return condition is withheld until the item is
                    # actually back. Showing a half-written inspection note
                    # would read to the customer as a finding already made.
                    "return_condition_notes": (
                        row.return_condition_notes or ""
                        if row.actual_return_date
                        else ""
                    ),
                }
                for row in rows
            ],
        }
    )
