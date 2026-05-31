from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Any

from django.db import transaction
from django.db.models import Max
from django.utils import timezone

from subscriptions.models import AuditLog
from subscriptions.models_business_setup import (
    BusinessComplianceDocument,
    BusinessComplianceDocumentType,
    BusinessComplianceDocumentVerificationStatus,
    BusinessComplianceDocumentVisibility,
    BusinessProfile,
    PolicyPage,
    PolicyStatus,
    PublicBusinessProfile,
)
from subscriptions.services.audit_service import log_audit
from subscriptions.services.default_policy_templates import get_default_policy_templates
from subscriptions.services.policy_coverage_catalog import (
    INTERNAL,
    PUBLIC,
    get_policy_coverage_specs,
    get_policy_spec_by_slug,
    group_specs,
    public_policy_slugs,
)


_POLICY_EDITABLE_FIELDS = {
    "slug",
    "category",
    "title",
    "summary",
    "content",
    "effective_date",
    "last_reviewed_at",
    "status",
}

_POLICY_LOCKED_PUBLISHED_FIELDS = {
    "slug",
    "category",
    "title",
    "summary",
    "content",
    "effective_date",
}


@dataclass
class PolicyPlaceholderContext:
    website_url: str
    business_phone: str
    business_email: str
    business_address: str
    gst_status_text: str
    udyam_status_text: str


def _clean_text(value: str | None) -> str:
    return (value or "").strip()


def policy_visibility_for_slug(slug: str) -> str:
    spec = get_policy_spec_by_slug(slug)
    return spec.visibility if spec else PUBLIC


def policy_governance_category_for_slug(slug: str, fallback: str | None = None) -> str:
    spec = get_policy_spec_by_slug(slug)
    return spec.category if spec else (fallback or "GENERAL")


def policy_coverage_group_for_slug(slug: str) -> str:
    spec = get_policy_spec_by_slug(slug)
    return spec.group if spec else "Public Legal"


def policy_is_public_visible(policy: PolicyPage) -> bool:
    return bool(policy.status == PolicyStatus.PUBLISHED and policy_visibility_for_slug(policy.slug) == PUBLIC)


def policy_is_internal_only(policy: PolicyPage) -> bool:
    return policy_visibility_for_slug(policy.slug) == INTERNAL


def _build_business_address(profile: BusinessProfile | None, public_profile: PublicBusinessProfile | None) -> str:
    public_address = _clean_text(getattr(public_profile, "address_text", ""))
    if public_address:
        return public_address

    if not profile:
        return "Asansol, West Bengal, India"

    parts = [
        _clean_text(profile.address_line_1),
        _clean_text(profile.address_line_2),
        _clean_text(profile.landmark),
        _clean_text(profile.city),
        _clean_text(profile.district),
        _clean_text(profile.state),
        _clean_text(profile.postal_code),
        _clean_text(profile.country),
    ]
    compact = ", ".join(part for part in parts if part)
    return compact or "Asansol, West Bengal, India"


def _resolve_public_status_text(*, has_verified_document: bool, fallback: str) -> str:
    if has_verified_document:
        return "Provided on verified business records. Public details are shared only through approved channels."
    return fallback


def get_policy_placeholder_context() -> PolicyPlaceholderContext:
    business_profile = BusinessProfile.objects.filter(is_active=True).order_by("-created_at", "-id").first()
    public_profile = PublicBusinessProfile.objects.filter(is_active=True).order_by("-created_at", "-id").first()

    website = _clean_text(getattr(business_profile, "website_url", "")) or "subidhafurnitureasansol.com"
    phone = (
        _clean_text(getattr(public_profile, "support_phone", ""))
        or _clean_text(getattr(business_profile, "primary_phone", ""))
        or "Not provided"
    )
    email = (
        _clean_text(getattr(public_profile, "support_email", ""))
        or _clean_text(getattr(business_profile, "primary_email", ""))
        or "Not provided"
    )
    address = _build_business_address(business_profile, public_profile)

    gst_verified_doc = BusinessComplianceDocument.objects.filter(
        document_type=BusinessComplianceDocumentType.GST_CERTIFICATE,
        verification_status=BusinessComplianceDocumentVerificationStatus.VERIFIED,
        is_active=True,
    ).exists()
    udyam_verified_doc = BusinessComplianceDocument.objects.filter(
        document_type=BusinessComplianceDocumentType.UDYAM_CERTIFICATE,
        verification_status=BusinessComplianceDocumentVerificationStatus.VERIFIED,
        is_active=True,
    ).exists()

    gst_fallback = "Not provided / will be updated after registration."
    if _clean_text(getattr(business_profile, "gstin", "")):
        gst_fallback = "GST registration is available. Number is not publicly listed on this page."

    return PolicyPlaceholderContext(
        website_url=website,
        business_phone=phone,
        business_email=email,
        business_address=address,
        gst_status_text=_resolve_public_status_text(has_verified_document=gst_verified_doc, fallback=gst_fallback),
        udyam_status_text=_resolve_public_status_text(has_verified_document=udyam_verified_doc, fallback="Not provided / will be updated after registration."),
    )


def render_policy_content(content: str, context: PolicyPlaceholderContext | None = None) -> str:
    context = context or get_policy_placeholder_context()
    rendered = content or ""
    replacements = {
        "[WEBSITE_URL]": context.website_url,
        "[BUSINESS_PHONE]": context.business_phone,
        "[BUSINESS_EMAIL]": context.business_email,
        "[BUSINESS_ADDRESS]": context.business_address,
        "[GST_STATUS_PUBLIC_TEXT]": context.gst_status_text,
        "[UDYAM_STATUS_PUBLIC_TEXT]": context.udyam_status_text,
    }
    for key, value in replacements.items():
        rendered = rendered.replace(key, value)
    return rendered


@transaction.atomic
def seed_default_policy_pages(*, performed_by=None, overwrite_existing_drafts: bool = False) -> dict[str, int]:
    created = 0
    updated = 0
    skipped = 0

    for template in get_default_policy_templates():
        slug = template["slug"]
        existing = PolicyPage.objects.filter(slug=slug).order_by("-version", "-id")

        if not existing.exists():
            PolicyPage.objects.create(
                slug=slug,
                version=1,
                category=template["category"],
                title=template["title"],
                summary=template.get("summary", ""),
                content=template.get("content", ""),
                status=PolicyStatus.DRAFT,
                created_by=performed_by,
                updated_by=performed_by,
            )
            created += 1
            continue

        if not overwrite_existing_drafts:
            skipped += 1
            continue

        draft = existing.filter(status=PolicyStatus.DRAFT).order_by("-version", "-id").first()
        if draft is None:
            skipped += 1
            continue

        draft.category = template["category"]
        draft.title = template["title"]
        draft.summary = template.get("summary", "")
        draft.content = template.get("content", "")
        draft.updated_by = performed_by
        draft.save()
        updated += 1

    marker = PolicyPage.objects.order_by("-id").first()
    if marker is not None:
        log_audit(
            action_type=AuditLog.ActionType.PUBLIC_SITE_UPDATED,
            instance=marker,
            performed_by=performed_by,
            metadata={"event": "POLICY_SEED_DEFAULTS", "created": created, "updated": updated, "skipped": skipped},
        )
    return {"created": created, "updated": updated, "skipped": skipped}


def _next_policy_version(slug: str) -> int:
    current = PolicyPage.objects.filter(slug=slug).aggregate(max_version=Max("version")).get("max_version")
    return int(current or 0) + 1


@transaction.atomic
def create_policy_page(*, payload: dict[str, Any], performed_by=None) -> PolicyPage:
    slug = _clean_text(payload.get("slug", "")).lower()
    if not slug:
        raise ValueError("Policy slug is required.")
    if PolicyPage.objects.filter(slug=slug).exists():
        raise ValueError("Policy slug already exists. Create a draft version from an existing policy.")
    policy = PolicyPage.objects.create(
        slug=slug,
        version=1,
        category=payload.get("category") or "GENERAL",
        title=payload.get("title") or slug.replace("-", " ").title(),
        summary=payload.get("summary") or "",
        content=payload.get("content") or "",
        status=payload.get("status") or PolicyStatus.DRAFT,
        effective_date=payload.get("effective_date"),
        last_reviewed_at=payload.get("last_reviewed_at"),
        created_by=performed_by,
        updated_by=performed_by,
    )
    log_audit(action_type=AuditLog.ActionType.PUBLIC_SITE_UPDATED, instance=policy, performed_by=performed_by, metadata={"event": "POLICY_CREATED", "policy_id": policy.id, "slug": policy.slug, "version": policy.version, "status": policy.status})
    return policy


@transaction.atomic
def update_policy_page(*, policy: PolicyPage, payload: dict[str, Any], performed_by=None) -> PolicyPage:
    updates = {key: value for key, value in payload.items() if key in _POLICY_EDITABLE_FIELDS}
    if policy.status == PolicyStatus.PUBLISHED and any(key in updates for key in _POLICY_LOCKED_PUBLISHED_FIELDS):
        raise ValueError("Published policies are locked. Create a draft version before editing legal content.")
    for key, value in updates.items():
        setattr(policy, key, value)
    policy.updated_by = performed_by
    policy.save()
    log_audit(action_type=AuditLog.ActionType.PUBLIC_SITE_UPDATED, instance=policy, performed_by=performed_by, metadata={"event": "POLICY_UPDATED", "policy_id": policy.id, "slug": policy.slug, "version": policy.version, "status": policy.status, "fields": sorted(list(updates.keys()))})
    return policy


@transaction.atomic
def create_draft_from_policy(*, policy: PolicyPage, performed_by=None) -> PolicyPage:
    draft = PolicyPage.objects.create(slug=policy.slug, version=_next_policy_version(policy.slug), category=policy.category, title=policy.title, summary=policy.summary, content=policy.content, status=PolicyStatus.DRAFT, effective_date=policy.effective_date, created_by=performed_by, updated_by=performed_by)
    log_audit(action_type=AuditLog.ActionType.PUBLIC_SITE_UPDATED, instance=draft, performed_by=performed_by, metadata={"event": "POLICY_DRAFT_CREATED", "policy_id": draft.id, "source_policy_id": policy.id, "slug": draft.slug, "version": draft.version})
    return draft


@transaction.atomic
def publish_policy_page(*, policy: PolicyPage, performed_by=None, effective_date: date | None = None, review_now: bool = True) -> PolicyPage:
    siblings = PolicyPage.objects.select_for_update(of=("self",)).filter(slug=policy.slug)
    siblings.filter(status=PolicyStatus.PUBLISHED).exclude(pk=policy.pk).update(status=PolicyStatus.ARCHIVED, updated_by=performed_by)
    policy.status = PolicyStatus.PUBLISHED
    policy.published_by = performed_by
    policy.published_at = timezone.now()
    policy.effective_date = effective_date or policy.effective_date or timezone.localdate()
    if review_now and not policy.last_reviewed_at:
        policy.last_reviewed_at = timezone.now()
    policy.updated_by = performed_by
    policy.save()
    log_audit(action_type=AuditLog.ActionType.PUBLIC_SITE_UPDATED, instance=policy, performed_by=performed_by, metadata={"event": "POLICY_PUBLISHED", "policy_id": policy.id, "slug": policy.slug, "version": policy.version, "effective_date": str(policy.effective_date)})
    return policy


@transaction.atomic
def archive_policy_page(*, policy: PolicyPage, performed_by=None) -> PolicyPage:
    policy.status = PolicyStatus.ARCHIVED
    policy.updated_by = performed_by
    policy.save()
    log_audit(action_type=AuditLog.ActionType.PUBLIC_SITE_UPDATED, instance=policy, performed_by=performed_by, metadata={"event": "POLICY_ARCHIVED", "policy_id": policy.id, "slug": policy.slug, "version": policy.version})
    return policy


def get_latest_policy_by_slug(slug: str) -> PolicyPage | None:
    return PolicyPage.objects.filter(slug=slug).order_by("-version", "-id").first()


def get_public_published_policy(slug: str) -> PolicyPage | None:
    cleaned = slug.strip().lower()
    if cleaned not in public_policy_slugs():
        return None
    return PolicyPage.objects.filter(slug=cleaned, status=PolicyStatus.PUBLISHED).order_by("-published_at", "-version", "-id").first()


def list_public_published_policies() -> list[PolicyPage]:
    return list(PolicyPage.objects.filter(status=PolicyStatus.PUBLISHED, slug__in=public_policy_slugs()).order_by("category", "slug", "-version"))


def build_policy_coverage_matrix() -> dict[str, Any]:
    latest_by_slug: dict[str, PolicyPage] = {}
    for row in PolicyPage.objects.order_by("slug", "-version", "-id"):
        latest_by_slug.setdefault(row.slug, row)

    rows: list[dict[str, Any]] = []
    for spec in get_policy_coverage_specs():
        policy = latest_by_slug.get(spec.slug)
        status = policy.status if policy else "MISSING"
        public_ready = bool(policy and spec.visibility == PUBLIC and policy.status == PolicyStatus.PUBLISHED)
        internal_ready = bool(policy and spec.visibility == INTERNAL and policy.status == PolicyStatus.PUBLISHED)
        if policy is None:
            blocker = "Policy template is missing."
            action = "Seed default templates, then review and publish/approve as required."
        elif spec.visibility == PUBLIC and policy.status != PolicyStatus.PUBLISHED:
            blocker = "Public policy exists but is not published."
            action = "Review legal text and publish only after approval."
        elif spec.visibility == INTERNAL and policy.status == PolicyStatus.DRAFT:
            blocker = "Internal governance policy is still draft."
            action = "Review internally and publish/archive according to governance process."
        else:
            blocker = ""
            action = "No immediate action."
        rows.append({"required_policy_key": spec.slug, "label": spec.label, "coverage_group": spec.group, "category": spec.category, "stored_category": policy.category if policy else spec.compatible_category, "visibility": spec.visibility, "status": status, "policy_id": policy.id if policy else None, "slug": spec.slug, "public_ready": public_ready, "internal_ready": internal_ready, "blocker_reason": blocker, "recommended_action": action, "requires_legal_review": spec.requires_legal_review, "requires_admin_acceptance": spec.requires_admin_acceptance})

    grouped = [{"group": group, "items": [row for row in rows if row["coverage_group"] == group]} for group in group_specs().keys()]
    summary = {
        "required_count": len(rows),
        "missing_count": sum(1 for row in rows if row["status"] == "MISSING"),
        "public_required_count": sum(1 for row in rows if row["visibility"] == PUBLIC),
        "public_published_count": sum(1 for row in rows if row["public_ready"]),
        "public_draft_count": sum(1 for row in rows if row["visibility"] == PUBLIC and row["status"] == PolicyStatus.DRAFT),
        "internal_required_count": sum(1 for row in rows if row["visibility"] == INTERNAL),
        "internal_ready_count": sum(1 for row in rows if row["internal_ready"]),
        "internal_draft_count": sum(1 for row in rows if row["visibility"] == INTERNAL and row["status"] == PolicyStatus.DRAFT),
    }
    return {"summary": summary, "groups": grouped, "results": rows}


def get_public_business_compliance_summary() -> dict[str, Any]:
    context = get_policy_placeholder_context()
    public_docs = BusinessComplianceDocument.objects.filter(is_active=True, public_visibility=BusinessComplianceDocumentVisibility.PUBLIC_SUMMARY_ONLY, verification_status=BusinessComplianceDocumentVerificationStatus.VERIFIED).order_by("document_type", "-created_at", "-id")
    documents = [{"document_type": row.document_type, "title": row.title or row.get_document_type_display(), "verification_status": row.verification_status, "public_summary": row.public_summary, "verified_at": row.verified_at} for row in public_docs]
    return {"business_name": "Subidha Furniture", "business_location": "Asansol, West Bengal, India", "website_url": context.website_url, "business_phone": context.business_phone, "business_email": context.business_email, "business_address": context.business_address, "gst_status_text": context.gst_status_text, "udyam_status_text": context.udyam_status_text, "public_documents": documents, "private_document_disclaimer": "Private compliance documents are not publicly downloadable by default. Only approved public-safe summaries are shown."}
