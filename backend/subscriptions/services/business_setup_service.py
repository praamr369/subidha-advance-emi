from __future__ import annotations

from django.db import transaction

from subscriptions.models_business_setup import BusinessProfile, Branch, CashDesk, FinanceAccount, StaffOperationalAssignment


def get_active_business_profile():
    return BusinessProfile.objects.filter(is_active=True).order_by("-created_at", "-id").first()


@transaction.atomic
def upsert_business_profile(*, data: dict, instance: BusinessProfile | None = None) -> BusinessProfile:
    payload = dict(data)
    payload.setdefault("is_active", True)

    if instance is None:
        profile = BusinessProfile(**payload)
    else:
        for key, value in payload.items():
            setattr(instance, key, value)
        profile = instance

    profile.save()

    if profile.is_active:
        BusinessProfile.objects.filter(is_active=True).exclude(pk=profile.pk).update(is_active=False)

    return profile


def get_reset_preview():
    return {
        "business_profiles": BusinessProfile.objects.count(),
        "branches": Branch.objects.count(),
        "finance_accounts": FinanceAccount.objects.count(),
        "cash_desks": CashDesk.objects.count(),
        "staff_operational_assignments": StaffOperationalAssignment.objects.count(),
    }
