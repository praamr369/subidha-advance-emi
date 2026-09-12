"""Rent/lease receipt rows — the money rent/lease contracts actually received.

Rent/lease collections and security-deposit receipts never create ReceiptDocument
or Payment rows (those are retail / Advance EMI only), so a receipt register or a
payment panel that only reads those tables silently shows no rent/lease money.
This builds one row shape from the authoritative source rows instead:
``RentLeaseCollection`` (monthly rent/lease) and ``RentLeaseDepositTransaction``
(deposit receipts and refunds).
"""
from __future__ import annotations

from typing import Any

from payments.models import RentLeaseCollection
from subscriptions.models import RentLeaseDepositTransaction

DEPOSIT_RECEIPT_TYPES = ("DEPOSIT_RECEIPT", "DEPOSIT_REFUND")


def _iso(value) -> str | None:
    return value.isoformat() if value else None


def build_rent_lease_receipt_rows(
    *,
    subscription_ids=None,
    customer_id=None,
    limit: int | None = None,
) -> list[dict[str, Any]]:
    collections = RentLeaseCollection.objects.select_related(
        "demand", "created_by", "subscription", "customer"
    )
    deposits = RentLeaseDepositTransaction.objects.filter(
        transaction_type__in=DEPOSIT_RECEIPT_TYPES
    ).select_related("created_by", "subscription", "customer")
    if subscription_ids is not None:
        collections = collections.filter(subscription_id__in=subscription_ids)
        deposits = deposits.filter(subscription_id__in=subscription_ids)
    if customer_id is not None:
        collections = collections.filter(customer_id=customer_id)
        deposits = deposits.filter(customer_id=customer_id)
    if limit:
        collections = collections.order_by("-payment_date", "-id")[:limit]
        deposits = deposits.order_by("-transaction_date", "-id")[:limit]

    rows: list[dict[str, Any]] = []
    for row in collections:
        rows.append(
            {
                "key": f"collection-{row.id}",
                "kind": "RENT_MONTHLY" if row.plan_type == "RENT" else "LEASE_MONTHLY",
                "number": row.collection_number,
                "amount": str(row.amount),
                "payment_date": _iso(row.payment_date),
                "payment_method": row.payment_method,
                "status": row.status,
                "reference_no": row.external_reference_no,
                "demand_due_date": _iso(row.demand.due_date) if row.demand_id else None,
                "collected_by_username": getattr(row.created_by, "username", "") or "",
                "subscription_id": row.subscription_id,
                "subscription_number": getattr(row.subscription, "subscription_number", "") or "",
                "customer_id": row.customer_id,
                "customer_name": getattr(row.customer, "name", "") or "",
            }
        )
    for row in deposits:
        rows.append(
            {
                "key": f"deposit-{row.id}",
                "kind": row.transaction_type,
                "number": row.transaction_number,
                "amount": str(row.amount),
                "payment_date": _iso(row.transaction_date),
                "payment_method": row.payment_method or "",
                "status": row.status,
                "reference_no": row.external_reference_no,
                "demand_due_date": None,
                "collected_by_username": getattr(row.created_by, "username", "") or "",
                "subscription_id": row.subscription_id,
                "subscription_number": getattr(row.subscription, "subscription_number", "") or "",
                "customer_id": row.customer_id,
                "customer_name": getattr(row.customer, "name", "") or "",
            }
        )
    rows.sort(key=lambda item: (item["payment_date"] or "", item["key"]), reverse=True)
    return rows[:limit] if limit else rows
