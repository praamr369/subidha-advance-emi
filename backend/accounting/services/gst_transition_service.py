from __future__ import annotations

from datetime import timedelta

from django.db import transaction

from accounting.models import BusinessTaxProfile, BusinessTaxRegistrationMode


@transaction.atomic
def activate_business_tax_profile(
    *,
    mode: str,
    effective_from,
    gstin: str = "",
    legal_name: str = "",
    pan: str = "",
    state_code: str = "",
    state_name: str = "",
    notes: str = "",
) -> BusinessTaxProfile:
    next_mode = (mode or "").strip().upper()
    if next_mode not in {
        BusinessTaxRegistrationMode.GST_UNREGISTERED,
        BusinessTaxRegistrationMode.GST_REGULAR,
        BusinessTaxRegistrationMode.GST_COMPOSITION,
    }:
        raise ValueError("Invalid tax registration mode.")

    if next_mode in {
        BusinessTaxRegistrationMode.GST_REGULAR,
        BusinessTaxRegistrationMode.GST_COMPOSITION,
    }:
        if not (gstin or "").strip():
            raise ValueError("GSTIN is required for GST_REGULAR/GST_COMPOSITION activation.")
        if not effective_from:
            raise ValueError("effective_from is required for GST activation.")

    current = BusinessTaxProfile.objects.select_for_update().filter(is_active=True).first()
    if current is not None:
        current.is_active = False
        if current.effective_from and effective_from and effective_from > current.effective_from:
            current.effective_to = effective_from - timedelta(days=1)
        current.save(update_fields=["is_active", "effective_to", "updated_at"])

    return BusinessTaxProfile.objects.create(
        mode=next_mode,
        effective_from=effective_from,
        legal_name=(legal_name or "").strip(),
        gstin=(gstin or "").strip().upper(),
        pan=(pan or "").strip().upper(),
        state_code=(state_code or "").strip().upper(),
        state_name=(state_name or "").strip(),
        notes=(notes or "").strip(),
        is_active=True,
    )
