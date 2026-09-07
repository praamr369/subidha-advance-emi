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
    from payments.models import RentLeaseDepositTransaction

    customer = _customer_or_404(request)
    if customer is None:
        return _customer_missing_response()

    rows = (
        RentLeaseDepositTransaction.objects.select_related("subscription")
        .filter(customer=customer)
        .order_by("-transaction_date", "-id")
    )
    return Response(
        {
            "count": rows.count(),
            "results": [
                {
                    "id": row.pk,
                    "transaction_number": row.transaction_number,
                    "subscription_id": row.subscription_id,
                    "subscription_number": getattr(
                        row.subscription, "subscription_number", ""
                    )
                    or "",
                    "transaction_type": row.transaction_type,
                    "amount": row.amount,
                    "transaction_date": row.transaction_date,
                    "payment_method": row.payment_method,
                    # The customer's own reference, not the internal one — this
                    # is the number they would quote when querying a payment.
                    "reference_no": row.external_reference_no or "",
                }
                for row in rows
            ],
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
