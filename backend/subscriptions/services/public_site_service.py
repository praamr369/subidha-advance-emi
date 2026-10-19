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
            "event": "PUBLIC_SITE_PROFILE_UPDATED",
            "public_business_profile_id": profile.id,
            "fields": sorted(list(payload.keys())),
        },
    )

    return profile


def get_active_public_announcements():
    from django.db.models import Q
    from django.utils import timezone
    from subscriptions.models_business_setup import PublicAnnouncementBanner

    now = timezone.now()
    return (
        PublicAnnouncementBanner.objects.filter(is_active=True)
        .filter(Q(start_date__isnull=True) | Q(start_date__lte=now))
        .filter(Q(end_date__isnull=True) | Q(end_date__gte=now))
        .order_by("-priority", "-created_at")
    )


def list_admin_public_announcements():
    from subscriptions.models_business_setup import PublicAnnouncementBanner

    return PublicAnnouncementBanner.objects.all().order_by("-priority", "-created_at")


@transaction.atomic
def create_public_announcement(*, data: dict, performed_by=None):
    from subscriptions.models_business_setup import PublicAnnouncementBanner

    payload = dict(data)
    banner = PublicAnnouncementBanner(**payload)
    banner.save()

    log_audit(
        action_type=AuditLog.ActionType.PUBLIC_SITE_UPDATED,
        instance=banner,
        performed_by=performed_by,
        metadata={
            "event": "PUBLIC_ANNOUNCEMENT_CREATED",
            "announcement_id": banner.id,
            "title": banner.title,
            "banner_type": banner.banner_type,
        },
    )
    return banner


@transaction.atomic
def update_public_announcement(*, instance, data: dict, performed_by=None):
    payload = dict(data)
    for key, value in payload.items():
        setattr(instance, key, value)
    instance.save()

    log_audit(
        action_type=AuditLog.ActionType.PUBLIC_SITE_UPDATED,
        instance=instance,
        performed_by=performed_by,
        metadata={
            "event": "PUBLIC_ANNOUNCEMENT_UPDATED",
            "announcement_id": instance.id,
            "fields": sorted(list(payload.keys())),
        },
    )
    return instance


@transaction.atomic
def delete_public_announcement(*, instance, performed_by=None):
    banner_id = instance.id
    title = instance.title
    log_audit(
        action_type=AuditLog.ActionType.PUBLIC_SITE_UPDATED,
        instance=instance,
        performed_by=performed_by,
        metadata={
            "event": "PUBLIC_ANNOUNCEMENT_DELETED",
            "announcement_id": banner_id,
            "title": title,
        },
    )
    instance.delete()

