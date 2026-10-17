"""Contract snapshot domain service (Area A: Document Pattern with JSONB).

Provides authoritative snapshot creation, verification, and tamper-detection
without altering existing financial schemas. Stores structured document representations
in the existing JSONField columns (product_snapshot, pricing_snapshot, tax_profile_snapshot).
"""
from __future__ import annotations

import hashlib
import json
from decimal import Decimal
from typing import Any, Optional

from django.utils import timezone


def _serialize_decimal(val: Any) -> Any:
    if isinstance(val, Decimal):
        return str(val)
    return val


def compute_snapshot_hash(data: dict) -> str:
    """Compute deterministic SHA-256 hash of a snapshot dictionary."""
    normalized = json.dumps(data, sort_keys=True, default=str)
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def build_immutable_contract_snapshot(subscription) -> dict:
    """
    Construct a complete, frozen contract document snapshot for a Subscription.
    
    Captures:
    - Contract Terms (plan, tenure, amounts, start date, locked timestamps)
    - Product Document (code, name, SKU, base price, category, specs)
    - Customer Profile Document (code, name, phone, verified address, KYC status)
    - Tax & Legal Classification Document (HSN/SAC, GST rate)
    - Tamper-detection SHA-256 fingerprint
    """
    customer = getattr(subscription, "customer", None)
    product = getattr(subscription, "product", None)

    # 1. Product Document Snapshot
    product_doc = {
        "product_id": getattr(product, "id", None),
        "product_code": getattr(product, "product_code", ""),
        "name": getattr(product, "name", ""),
        "sku": getattr(product, "sku", "") or getattr(product, "product_code", ""),
        "base_price": str(getattr(product, "base_price", Decimal("0"))),
        "category": getattr(product, "category", ""),
        "subcategory": getattr(product, "subcategory", ""),
        "description": getattr(product, "description", ""),
        "base_specs": getattr(product, "base_specs", {}) or {},
        "plan_type_default": getattr(product, "plan_type_default", "EMI"),
    }

    # 2. Customer Document Snapshot
    customer_doc = {
        "customer_id": getattr(customer, "id", None),
        "customer_code": getattr(customer, "customer_code", ""),
        "name": getattr(customer, "name", ""),
        "phone": getattr(customer, "phone", ""),
        "kyc_status": getattr(customer, "kyc_status", "PENDING"),
        "city": getattr(customer, "city", ""),
        "state": getattr(customer, "state", ""),
        "pincode": getattr(customer, "pincode", ""),
    }

    # 3. Contract Financial Terms Snapshot
    terms_doc = {
        "subscription_id": getattr(subscription, "id", None),
        "subscription_number": getattr(subscription, "subscription_number", "") or "",
        "contract_reference": getattr(subscription, "contract_reference", "") or "",
        "plan_type": getattr(subscription, "plan_type", "EMI"),
        "tenure_months": getattr(subscription, "tenure_months", 0),
        "total_amount": str(getattr(subscription, "total_amount", Decimal("0"))),
        "monthly_amount": str(getattr(subscription, "monthly_amount", Decimal("0"))),
        "start_date": str(getattr(subscription, "start_date", "")),
        "terms_locked_at": (
            subscription.terms_locked_at.isoformat()
            if getattr(subscription, "terms_locked_at", None)
            else None
        ),
    }

    # 4. Tax Classification Snapshot
    tax_doc = {
        "hsn_sac_code": getattr(product, "hsn_sac_code", "") if product else "",
        "gst_rate": str(getattr(product, "gst_rate", Decimal("0"))) if product and product.gst_rate else "0.00",
    }

    document = {
        "schema_version": "1.0",
        "created_at": timezone.now().isoformat(),
        "terms": terms_doc,
        "product": product_doc,
        "customer": customer_doc,
        "tax": tax_doc,
    }
    document["document_fingerprint"] = compute_snapshot_hash(document)
    return document


def ensure_contract_snapshots(subscription, *, save: bool = True) -> bool:
    """
    Ensure a subscription has complete JSONB snapshots saved.
    Safe and idempotent — preserves existing populated snapshots.
    """
    updated = False
    if not subscription.product_snapshot and subscription.product_id:
        doc = build_immutable_contract_snapshot(subscription)
        subscription.product_snapshot = doc["product"]
        updated = True

    if not subscription.pricing_snapshot:
        subscription.pricing_snapshot = {
            "plan_type": subscription.plan_type,
            "tenure_months": subscription.tenure_months,
            "monthly_amount": str(subscription.monthly_amount),
            "total_amount": str(subscription.total_amount),
            "start_date": str(subscription.start_date),
            "frozen_at": timezone.now().isoformat(),
        }
        updated = True

    if not subscription.tax_profile_snapshot and subscription.product_id:
        product = subscription.product
        subscription.tax_profile_snapshot = {
            "hsn_sac_code": getattr(product, "hsn_sac_code", ""),
            "gst_rate": str(getattr(product, "gst_rate", "0")),
        }
        updated = True

    if updated and save and getattr(subscription, "id", None):
        subscription.save(
            update_fields=[
                "product_snapshot",
                "pricing_snapshot",
                "tax_profile_snapshot",
            ]
        )
    return updated


def get_authoritative_contract_terms(subscription) -> dict:
    """
    Defensively read authoritative terms from immutable snapshot first,
    falling back to live relational values only if snapshot is blank.
    """
    pricing = subscription.pricing_snapshot or {}
    product = subscription.product_snapshot or {}

    return {
        "plan_type": pricing.get("plan_type") or subscription.plan_type,
        "tenure_months": pricing.get("tenure_months") or subscription.tenure_months,
        "monthly_amount": Decimal(str(pricing.get("monthly_amount") or subscription.monthly_amount)),
        "total_amount": Decimal(str(pricing.get("total_amount") or subscription.total_amount)),
        "product_name": product.get("name") or (subscription.product.name if subscription.product else ""),
        "product_code": product.get("product_code") or (subscription.product.product_code if subscription.product else ""),
        "sku": product.get("sku") or (subscription.product.sku if subscription.product else ""),
        "base_specs": product.get("base_specs") or (subscription.product.base_specs if subscription.product else {}),
    }
