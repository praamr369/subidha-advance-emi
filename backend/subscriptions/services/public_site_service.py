from __future__ import annotations

from django.db import transaction

from subscriptions.models import AuditLog
from subscriptions.models_business_setup import PublicBusinessProfile
from subscriptions.services.audit_service import log_audit


def get_active_public_business_profile() -> PublicBusinessProfile | None:
    return (
        PublicBusinessProfile.objects.filter(is_active=True)
        .order_by("-created_at", "-id")
        .first()
    )


@transaction.atomic
def upsert_public_business_profile(
    *,
    data: dict,
    instance: PublicBusinessProfile | None = None,
    performed_by=None,
) -> PublicBusinessProfile:
    payload = dict(data)
    payload.setdefault("is_active", True)

    if instance is None:
        profile = PublicBusinessProfile(**payload)
    else:
        for key, value in payload.items():
            setattr(instance, key, value)
        profile = instance

    profile.save()

    if profile.is_active:
        PublicBusinessProfile.objects.filter(is_active=True).exclude(pk=profile.pk).update(
            is_active=False
        )

    log_audit(
        action_type=AuditLog.ActionType.PUBLIC_SITE_UPDATED,
        instance=profile,
        performed_by=performed_by,
        metadata={
            "event": "PUBLIC_BUSINESS_PROFILE_UPSERTED",
            "public_business_profile_id": profile.id,
            "fields": sorted(list(payload.keys())),
        },
    )

    return profile

