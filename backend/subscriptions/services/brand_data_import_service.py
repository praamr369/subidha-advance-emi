from __future__ import annotations

import os
from typing import Iterable

from django.db import transaction

from subscriptions.models import AuditLog
from subscriptions.models_business_setup import (
    BrandDataSource,
    BrandImportBatch,
    BrandImportedItem,
    BrandProfileSnapshot,
    BusinessMediaAsset,
    PublicBusinessProfile,
    PublicContentBlock,
    SocialLink,
)
from subscriptions.services.audit_service import log_audit


MANUAL_PUBLIC_FIELDS = {
    "brand_name": "display_name",
    "tagline": "tagline",
    "description": "hero_subtitle",
    "phone": "support_phone",
    "whatsapp": "whatsapp_phone",
    "email": "support_email",
    "address": "address_text",
    "google_maps_url": "map_url",
    "opening_hours": "business_hours",
    "facebook_url": "facebook_url",
    "youtube_url": "youtube_url",
    "instagram_url": "instagram_url",
    "logo_url": "public_logo_url",
}


def _ensure_admin(actor) -> None:
    role = (getattr(actor, "role", "") or "").strip().upper()
    if role != "ADMIN" and not getattr(actor, "is_superuser", False):
        raise PermissionError("Only admin can manage brand imports.")


def _provider_configured(provider: str) -> bool:
    if provider == BrandDataSource.Provider.GOOGLE_BUSINESS:
        return all(
            [
                os.getenv("GOOGLE_BUSINESS_PROFILE_CLIENT_ID"),
                os.getenv("GOOGLE_BUSINESS_PROFILE_CLIENT_SECRET"),
                os.getenv("GOOGLE_BUSINESS_PROFILE_ACCOUNT_ID"),
                os.getenv("GOOGLE_BUSINESS_PROFILE_LOCATION_ID"),
            ]
        )
    if provider == BrandDataSource.Provider.YOUTUBE:
        return bool(os.getenv("YOUTUBE_API_KEY") and os.getenv("YOUTUBE_CHANNEL_ID"))
    return True


def ensure_sources_seeded() -> None:
    defaults = [
        (BrandDataSource.Provider.MANUAL, "Manual structured import"),
        (BrandDataSource.Provider.GOOGLE_BUSINESS, "Google Business Profile"),
        (BrandDataSource.Provider.YOUTUBE, "YouTube Channel"),
        (BrandDataSource.Provider.FACEBOOK, "Facebook"),
        (BrandDataSource.Provider.JUSTDIAL, "Justdial"),
    ]
    for provider, name in defaults:
        BrandDataSource.objects.get_or_create(
            provider=provider,
            defaults={
                "name": name,
                "is_configured": _provider_configured(provider),
                "configuration_hint": "Configure provider credentials in backend environment.",
            },
        )


def list_sources() -> dict:
    ensure_sources_seeded()
    rows = []
    for source in BrandDataSource.objects.filter(is_active=True).order_by("provider"):
        configured = _provider_configured(source.provider)
        if source.is_configured != configured:
            source.is_configured = configured
            source.save(update_fields=["is_configured", "updated_at"])
        rows.append(
            {
                "id": source.id,
                "provider": source.provider,
                "name": source.name,
                "is_configured": configured,
                "status_label": "Configured" if configured else "Not configured",
                "configuration_hint": source.configuration_hint,
            }
        )
    return {"count": len(rows), "results": rows}


@transaction.atomic
def create_manual_preview(*, actor, payload: dict) -> dict:
    _ensure_admin(actor)
    ensure_sources_seeded()
    source = BrandDataSource.objects.get(provider=BrandDataSource.Provider.MANUAL)
    batch = BrandImportBatch.objects.create(
        source=source,
        imported_by=actor,
        payload_snapshot=payload,
        status=BrandImportBatch.Status.PREVIEW,
    )
    items = []
    for key, value in payload.items():
        if value in (None, "", [], {}):
            continue
        item_type = BrandImportedItem.ItemType.BRAND_IDENTITY
        if key in {"phone", "whatsapp", "email", "address", "city", "state", "pincode", "google_maps_url", "opening_hours"}:
            item_type = BrandImportedItem.ItemType.CONTACT_LOCATION
        elif key.endswith("_url") and key not in {"logo_url"}:
            item_type = BrandImportedItem.ItemType.SOCIAL_LINK
        elif key in {"logo_url", "storefront_image_urls"}:
            item_type = BrandImportedItem.ItemType.MEDIA_ASSET
        elif key in {"selected_review_quotes"}:
            item_type = BrandImportedItem.ItemType.PUBLIC_CONTENT
        item = BrandImportedItem.objects.create(
            batch=batch,
            item_type=item_type,
            field_key=key,
            value={"value": value},
        )
        items.append({"id": item.id, "field_key": key, "item_type": item_type, "approval_status": item.approval_status, "value": item.value})
    log_audit(
        action_type=AuditLog.ActionType.PUBLIC_SITE_UPDATED,
        instance=batch,
        performed_by=actor,
        metadata={"event": "BRAND_IMPORT_PREVIEW_CREATED", "batch_id": batch.id, "item_count": len(items)},
    )
    return {"batch_id": batch.id, "status": batch.status, "item_count": len(items), "items": items}


def provider_preview_stub(*, provider: str) -> dict:
    ensure_sources_seeded()
    if not _provider_configured(provider):
        return {
            "code": "PROVIDER_NOT_CONFIGURED",
            "detail": f"{provider} credentials are not configured.",
            "next_actions": ["Set provider environment variables", "Restart backend service", "Retry preview"],
        }
    return {"code": "PROVIDER_READY", "detail": f"{provider} integration is provider-ready but preview ingestion is not enabled yet."}


@transaction.atomic
def apply_approved_items(*, actor, item_ids: Iterable[int]) -> dict:
    _ensure_admin(actor)
    item_ids = [int(i) for i in item_ids]
    if not item_ids:
        raise ValueError("approved_item_ids is required.")
    items = list(BrandImportedItem.objects.select_for_update(of=("self",)).filter(id__in=item_ids))
    if len(items) != len(item_ids):
        raise ValueError("One or more approved item IDs were not found.")
    for item in items:
        if item.approval_status != BrandImportedItem.ApprovalStatus.APPROVED:
            raise ValueError(f"Item {item.id} is not approved.")

    profile = PublicBusinessProfile.objects.filter(is_active=True).order_by("-id").first() or PublicBusinessProfile(is_active=True)
    touched_public_fields = []

    for item in items:
        key = item.field_key
        value = (item.value or {}).get("value")
        if key in MANUAL_PUBLIC_FIELDS:
            setattr(profile, MANUAL_PUBLIC_FIELDS[key], value or "")
            touched_public_fields.append(MANUAL_PUBLIC_FIELDS[key])
        elif key in {"facebook_url", "youtube_url", "instagram_url", "justdial_url", "website_url"} and value:
            SocialLink.objects.update_or_create(
                platform=key.replace("_url", "").upper()[:30],
                defaults={"label": key.replace("_url", "").replace("_", " ").title(), "url": value, "is_active": True, "is_public": True},
            )
        elif key == "logo_url" and value:
            BusinessMediaAsset.objects.create(asset_type=BusinessMediaAsset.AssetType.LOGO, title="Brand logo", media_url=value, is_active=True, is_public=True)
        elif key == "storefront_image_urls" and isinstance(value, list):
            for url in value:
                if url:
                    BusinessMediaAsset.objects.create(asset_type=BusinessMediaAsset.AssetType.STOREFRONT, title="Storefront image", media_url=str(url), is_active=True, is_public=True)
        elif key == "selected_review_quotes" and isinstance(value, list):
            PublicContentBlock.objects.update_or_create(
                key="selected_review_quotes",
                defaults={"title": "Selected review quotes", "content": "\n".join(str(v) for v in value if v), "is_active": True, "is_public": True},
            )
            log_audit(action_type=AuditLog.ActionType.PUBLIC_SITE_UPDATED, instance=profile, performed_by=actor, metadata={"event": "PUBLIC_CONTENT_BLOCK_UPDATED", "block_key": "selected_review_quotes"})

        item.approval_status = BrandImportedItem.ApprovalStatus.APPLIED
        item.save(update_fields=["approval_status", "updated_at"])

    if touched_public_fields:
        profile.save()

    snapshot = BrandProfileSnapshot.objects.create(
        source_batch=items[0].batch if items else None,
        profile_payload={"public_profile_fields": touched_public_fields, "applied_item_ids": item_ids},
        applied_by=actor,
        is_active=True,
    )
    BrandProfileSnapshot.objects.exclude(pk=snapshot.pk).update(is_active=False)
    log_audit(action_type=AuditLog.ActionType.PUBLIC_SITE_UPDATED, instance=snapshot, performed_by=actor, metadata={"event": "BRAND_PROFILE_APPLIED", "snapshot_id": snapshot.id, "item_ids": item_ids})
    return {"applied": True, "snapshot_id": snapshot.id, "applied_item_ids": item_ids, "updated_public_fields": touched_public_fields}


@transaction.atomic
def set_item_approval(*, actor, item_id: int, action: str, note: str = "") -> dict:
    _ensure_admin(actor)
    item = BrandImportedItem.objects.select_for_update(of=("self",)).get(pk=item_id)
    if action == "approve":
        item.approval_status = BrandImportedItem.ApprovalStatus.APPROVED
        item.approved_by = actor
        log_event = "IMPORTED_ITEM_APPROVED"
    elif action == "reject":
        item.approval_status = BrandImportedItem.ApprovalStatus.REJECTED
        item.rejected_by = actor
        log_event = "IMPORTED_ITEM_REJECTED"
    else:
        raise ValueError("Unsupported action.")
    item.review_note = (note or "").strip()
    item.save(update_fields=["approval_status", "approved_by", "rejected_by", "review_note", "updated_at"])
    log_audit(action_type=AuditLog.ActionType.PUBLIC_SITE_UPDATED, instance=item, performed_by=actor, metadata={"event": log_event, "item_id": item.id, "batch_id": item.batch_id, "note": item.review_note})
    return {"item_id": item.id, "approval_status": item.approval_status}


SOCIAL_LINK_PLATFORMS = {
    "facebook_url": "FACEBOOK",
    "instagram_url": "INSTAGRAM",
    "youtube_url": "YOUTUBE",
    "justdial_url": "JUSTDIAL",
    "website_url": "WEBSITE",
    "whatsapp_url": "WHATSAPP",
}


def get_public_profile() -> dict:
    profile = PublicBusinessProfile.objects.filter(is_active=True).order_by("-id").first()
    social_links = {link.platform: link.url for link in SocialLink.objects.filter(is_active=True)}
    return {
        "display_name": profile.display_name if profile else "",
        "tagline": profile.tagline if profile else "",
        "hero_subtitle": profile.hero_subtitle if profile else "",
        "support_phone": profile.support_phone if profile else "",
        "whatsapp_phone": profile.whatsapp_phone if profile else "",
        "support_email": profile.support_email if profile else "",
        "address_text": profile.address_text if profile else "",
        "business_hours": profile.business_hours if profile else "",
        "map_url": profile.map_url if profile else "",
        "public_logo_url": profile.public_logo_url if profile else "",
        "social_links": {
            "facebook_url": social_links.get("FACEBOOK", profile.facebook_url if profile else ""),
            "instagram_url": social_links.get("INSTAGRAM", profile.instagram_url if profile else ""),
            "youtube_url": social_links.get("YOUTUBE", profile.youtube_url if profile else ""),
            "justdial_url": social_links.get("JUSTDIAL", ""),
            "website_url": social_links.get("WEBSITE", ""),
            "whatsapp_url": social_links.get("WHATSAPP", ""),
        },
    }


@transaction.atomic
def upsert_public_profile(*, actor, data: dict) -> dict:
    _ensure_admin(actor)
    profile = PublicBusinessProfile.objects.filter(is_active=True).order_by("-id").first()
    if profile is None:
        profile = PublicBusinessProfile(is_active=True)

    profile_fields = [
        "display_name", "tagline", "hero_subtitle", "support_phone",
        "whatsapp_phone", "support_email", "address_text", "business_hours",
        "map_url", "public_logo_url",
    ]
    for field in profile_fields:
        if field in data:
            setattr(profile, field, (data[field] or "").strip())

    profile.save()

    for url_key, platform in SOCIAL_LINK_PLATFORMS.items():
        if url_key not in data:
            continue
        url = (data[url_key] or "").strip()
        if url:
            SocialLink.objects.update_or_create(
                platform=platform,
                defaults={
                    "label": platform.capitalize(),
                    "url": url,
                    "is_active": True,
                    "is_public": True,
                },
            )
        else:
            SocialLink.objects.filter(platform=platform).update(is_active=False)

    log_audit(
        action_type=AuditLog.ActionType.PUBLIC_SITE_UPDATED,
        instance=profile,
        performed_by=actor,
        metadata={"event": "BRAND_PROFILE_DIRECT_SAVED", "fields": list(data.keys())},
    )
    return get_public_profile()


def audit_feed(*, limit: int = 100) -> dict:
    rows = (
        AuditLog.objects.filter(
            action_type=AuditLog.ActionType.PUBLIC_SITE_UPDATED,
            metadata__event__in=[
                "BRAND_IMPORT_PREVIEW_CREATED",
                "IMPORTED_ITEM_APPROVED",
                "IMPORTED_ITEM_REJECTED",
                "BRAND_PROFILE_APPLIED",
                "PUBLIC_CONTENT_BLOCK_UPDATED",
            ],
        )
        .order_by("-created_at")[:limit]
    )
    return {
        "count": len(rows),
        "results": [
            {
                "id": row.id,
                "event": (row.metadata or {}).get("event"),
                "model_name": row.model_name,
                "object_id": row.object_id,
                "created_at": row.created_at,
                "performed_by_id": row.performed_by_id,
                "metadata": row.metadata,
            }
            for row in rows
        ],
    }
