from __future__ import annotations

from datetime import date
from decimal import Decimal

from accounting.services.tax_profile_service import (
    build_party_tax_snapshot,
    build_product_tax_snapshot,
    build_tax_profile_snapshot,
)


def build_non_gst_snapshot(
    *,
    document_type: str,
    document_date: date | None = None,
    party_type: str | None = None,
    party_id: int | None = None,
    product_id: int | None = None,
) -> dict:
    profile_snapshot = build_tax_profile_snapshot(on_date=document_date)
    profile_snapshot.update(
        {
            "document_type": document_type,
            "invoice_kind": "COMMERCIAL_INVOICE",
            "receipt_kind": "NON_GST_RECEIPT",
            "tax_invoice_allowed": False,
            "cgst_amount": "0.00",
            "sgst_amount": "0.00",
            "igst_amount": "0.00",
            "tax_total": "0.00",
        }
    )
    if party_type and party_id:
        profile_snapshot["party_snapshot"] = build_party_tax_snapshot(party_type=party_type, party_id=party_id)
    if product_id:
        profile_snapshot["product_snapshot"] = build_product_tax_snapshot(product_id=product_id)
    return profile_snapshot


def force_zero_tax_fields(*, instance) -> None:
    if hasattr(instance, "tax_total"):
        instance.tax_total = Decimal("0.00")
    if hasattr(instance, "cgst_amount"):
        instance.cgst_amount = Decimal("0.00")
    if hasattr(instance, "sgst_amount"):
        instance.sgst_amount = Decimal("0.00")
    if hasattr(instance, "igst_amount"):
        instance.igst_amount = Decimal("0.00")
