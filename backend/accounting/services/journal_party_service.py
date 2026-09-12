"""Resolve a journal entry's party (customer or vendor) from its source record.

Journal entries carry no party column — only ``source_model`` + ``source_id``.
This maps the known source models to the customer or vendor they belong to, so
the journal voucher page can show that party's money position (customer
per-product posture, or vendor payables). Unknown / party-less sources (e.g.
opening stock, manual entries) resolve to nothing.
"""
from __future__ import annotations

from functools import lru_cache
from typing import Any

from django.apps import apps

# source_model name -> attribute on that model holding the customer id.
CUSTOMER_SOURCE_ATTRS: dict[str, str] = {
    "Customer": "id",
    "Subscription": "customer_id",
    "CustomerOpeningOutstanding": "customer_id",
    "RentLeaseDepositTransaction": "customer_id",
    "RentLeaseCollection": "customer_id",
    "Payment": "customer_id",
    "DirectSale": "customer_id",
    "BillingInvoice": "customer_id",
    "ReceiptDocument": "customer_id",
}

# source_model name -> attribute on that model holding the vendor id.
VENDOR_SOURCE_ATTRS: dict[str, str] = {
    "Vendor": "id",
    "VendorBill": "vendor_id",
    "VendorPayment": "vendor_id",
    "PurchaseBill": "vendor_id",
    "VendorLedgerEntry": "vendor_id",
    "VendorSettlement": "vendor_id",
}


@lru_cache(maxsize=None)
def _model_by_name(name: str):
    for model in apps.get_models():
        if model.__name__ == name:
            return model
    return None


def _lookup(source_model: str, source_pk: int, attr: str):
    model = _model_by_name(source_model)
    if model is None:
        return None
    field_name = "pk" if attr == "id" else attr
    return model.objects.filter(pk=source_pk).values_list(field_name, flat=True).first()


def resolve_journal_party(entry: Any) -> dict[str, Any]:
    source_model = (getattr(entry, "source_model", "") or "").strip()
    raw_id = str(getattr(entry, "source_id", "") or "").strip()
    result = {"source_model": source_model or None, "customer_id": None, "vendor_id": None}
    if not source_model or not raw_id.isdigit():
        return result
    source_pk = int(raw_id)
    if source_model in CUSTOMER_SOURCE_ATTRS:
        result["customer_id"] = _lookup(source_model, source_pk, CUSTOMER_SOURCE_ATTRS[source_model])
    elif source_model in VENDOR_SOURCE_ATTRS:
        result["vendor_id"] = _lookup(source_model, source_pk, VENDOR_SOURCE_ATTRS[source_model])
    return result
