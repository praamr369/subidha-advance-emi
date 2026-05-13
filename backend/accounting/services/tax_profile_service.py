from __future__ import annotations

from datetime import date
from decimal import Decimal

from django.db import models, transaction
from django.utils import timezone

from accounting.models import (
    BusinessTaxProfile,
    BusinessTaxRegistrationMode,
    ComplianceAlertThreshold,
    PartyTaxProfile,
    ProductTaxProfile,
)

MONEY_ZERO = Decimal("0.00")

DEFAULT_THRESHOLD_KEYS: tuple[tuple[str, str, Decimal], ...] = (
    ("AGGREGATE_TURNOVER", "Aggregate turnover alert threshold", Decimal("4000000.00")),
    ("DIRECT_SALE_TURNOVER", "Direct-sale turnover alert threshold", Decimal("2000000.00")),
    ("RENT_TURNOVER", "Rent turnover alert threshold", Decimal("1000000.00")),
    ("LEASE_TURNOVER", "Lease turnover alert threshold", Decimal("1000000.00")),
    ("SERVICE_TURNOVER", "Delivery/service turnover alert threshold", Decimal("500000.00")),
    ("SUPPLIER_GST_COST", "Supplier GST cost alert threshold", Decimal("250000.00")),
)


@transaction.atomic
def get_or_create_default_business_tax_profile() -> BusinessTaxProfile:
    active = BusinessTaxProfile.objects.select_for_update().filter(is_active=True).first()
    if active is not None:
        return active
    return BusinessTaxProfile.objects.create(
        mode=BusinessTaxRegistrationMode.GST_UNREGISTERED,
        legal_name="Subidha Furniture",
        effective_from=timezone.localdate(),
        is_active=True,
    )


def get_active_business_tax_profile(*, on_date: date | None = None) -> BusinessTaxProfile:
    reference_date = on_date or timezone.localdate()
    profile = (
        BusinessTaxProfile.objects.filter(
            effective_from__lte=reference_date,
        )
        .filter(is_active=True)
        .order_by("-effective_from", "-id")
        .first()
    )
    if profile is not None:
        return profile
    return get_or_create_default_business_tax_profile()


def build_tax_profile_snapshot(*, on_date: date | None = None) -> dict:
    profile = get_active_business_tax_profile(on_date=on_date)
    mode = (profile.mode or BusinessTaxRegistrationMode.GST_UNREGISTERED).strip().upper()
    is_gst_registered = mode in {
        BusinessTaxRegistrationMode.GST_REGULAR,
        BusinessTaxRegistrationMode.GST_COMPOSITION,
    }
    return {
        "profile_id": profile.id,
        "mode": mode,
        "effective_from": profile.effective_from.isoformat() if profile.effective_from else None,
        "effective_to": profile.effective_to.isoformat() if profile.effective_to else None,
        "is_active": bool(profile.is_active),
        "is_gst_registered": is_gst_registered,
        "seller_gstin": profile.gstin if is_gst_registered else "",
        "seller_pan": profile.pan,
        "seller_state_code": profile.state_code,
        "seller_state_name": profile.state_name,
        "itc_claimable": is_gst_registered,
        "cgst_rate": "0.00" if not is_gst_registered else None,
        "sgst_rate": "0.00" if not is_gst_registered else None,
        "igst_rate": "0.00" if not is_gst_registered else None,
    }


def get_active_product_tax_profile(*, product_id: int, on_date: date | None = None) -> ProductTaxProfile | None:
    reference_date = on_date or timezone.localdate()
    return (
        ProductTaxProfile.objects.filter(product_id=product_id, is_active=True, effective_from__lte=reference_date)
        .filter(models.Q(effective_to__isnull=True) | models.Q(effective_to__gte=reference_date))
        .order_by("-effective_from", "-id")
        .first()
    )


def build_product_tax_snapshot(*, product_id: int | None, on_date: date | None = None) -> dict:
    if not product_id:
        return {}
    profile = (
        ProductTaxProfile.objects.filter(product_id=product_id, is_active=True)
        .order_by("-effective_from", "-id")
        .first()
    )
    if profile is None:
        return {}
    return {
        "product_id": profile.product_id,
        "product_tax_profile_id": profile.id,
        "hsn_code": profile.hsn_code,
        "tax_category": profile.tax_category,
        "gst_rate": f"{Decimal(str(profile.gst_rate or MONEY_ZERO)).quantize(Decimal('0.01')):.2f}",
        "effective_from": profile.effective_from.isoformat() if profile.effective_from else None,
        "effective_to": profile.effective_to.isoformat() if profile.effective_to else None,
        "is_active": bool(profile.is_active),
    }


def build_party_tax_snapshot(*, party_type: str | None, party_id: int | None) -> dict:
    if not party_type or not party_id:
        return {}
    profile = (
        PartyTaxProfile.objects.filter(
            party_type=(party_type or "").strip().upper(),
            party_id=int(party_id),
            is_active=True,
        )
        .order_by("-id")
        .first()
    )
    if profile is None:
        return {}
    return {
        "party_tax_profile_id": profile.id,
        "party_type": profile.party_type,
        "party_id": profile.party_id,
        "tax_type": profile.tax_type,
        "legal_name": profile.legal_name,
        "gstin": profile.gstin,
        "pan": profile.pan,
        "state_code": profile.state_code,
        "state_name": profile.state_name,
    }


def ensure_default_compliance_thresholds() -> None:
    for key, label, threshold in DEFAULT_THRESHOLD_KEYS:
        ComplianceAlertThreshold.objects.get_or_create(
            key=key,
            defaults={
                "label": label,
                "threshold_amount": threshold,
                "is_active": True,
            },
        )
