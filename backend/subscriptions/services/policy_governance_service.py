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
from subscriptions.models_policy_governance import PolicyGovernanceMetadata, PolicyVisibility
from subscriptions.services.audit_service import log_audit
from subscriptions.services.default_policy_templates import get_default_policy_templates
from subscriptions.services.policy_coverage_catalog import (
    INTERNAL,
    PUBLIC,
    get_policy_coverage_specs,
    get_policy_spec_by_slug,
    group_specs,
)

POLICY_STATUS_DRAFT = "DRAFT"
POLICY_STATUS_UNDER_REVIEW = "UNDER_REVIEW"
POLICY_STATUS_APPROVED = "APPROVED"
POLICY_STATUS_PUBLISHED = "PUBLISHED"
POLICY_STATUS_ARCHIVED = "ARCHIVED"
_POLICY_LIFECYCLE_STATUSES = {
    POLICY_STATUS_DRAFT,
    POLICY_STATUS_UNDER_REVIEW,
    POLICY_STATUS_APPROVED,
    POLICY_STATUS_PUBLISHED,
    POLICY_STATUS_ARCHIVED,
}

_POLICY_EDITABLE_FIELDS = {"slug", "category", "title", "summary", "content", "effective_date", "last_reviewed_at"}
_POLICY_LOCKED_PUBLISHED_FIELDS = {"slug", "category", "title", "summary", "content", "effective_date"}
_METADATA_FIELDS = {
    "visibility",
    "governance_category",
    "coverage_group",
    "requires_legal_review",
    "requires_admin_acceptance",
    "owner",
    "reviewer",
    "review_due_date",
    "source_template_key",
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


def _now():
    return timezone.now()


def _status_update(policy: PolicyPage, **fields) -> PolicyPage:
    fields["updated_at"] = _now()
    PolicyPage.objects.filter(pk=policy.pk).update(**fields)
    policy.refresh_from_db()
    return policy


def _log_policy_event(policy: PolicyPage, *, event: str, performed_by=None, **metadata) -> None:
    log_audit(
        action_type=AuditLog.ActionType.PUBLIC_SITE_UPDATED,
        instance=policy,
        performed_by=performed_by,
        metadata={
            "event": event,
            "policy_id": policy.id,
            "slug": policy.slug,
            "version": policy.version,
            "status": policy.status,
            **metadata,
        },
    )


def _catalog_defaults_for_policy(policy: PolicyPage) -> dict[str, Any]:
    spec = get_policy_spec_by_slug(policy.slug)
    if spec:
        return {
            "visibility": spec.visibility,
            "governance_category": spec.category,
            "coverage_group": spec.group,
            "requires_legal_review": spec.requires_legal_review,
            "requires_admin_acceptance": spec.requires_admin_acceptance,
            "source_template_key": spec.slug,
        }
    return {
        "visibility": PUBLIC,
        "governance_category": policy.category or "GENERAL",
        "coverage_group": "Public Legal",
        "requires_legal_review": True,
        "requires_admin_acceptance": False,
        "source_template_key": "",
    }


def hydrate_policy_governance_metadata(policy: PolicyPage) -> PolicyGovernanceMetadata:
    defaults = _catalog_defaults_for_policy(policy)
    metadata, _ = PolicyGovernanceMetadata.objects.get_or_create(policy=policy, defaults=defaults)
    return metadata


@transaction.atomic
def sync_policy_governance_metadata_from_catalog(policy: PolicyPage, performed_by=None) -> PolicyPage:
    metadata = hydrate_policy_governance_metadata(policy)
    before = {
        "visibility": metadata.visibility,
        "governance_category": metadata.governance_category,
        "coverage_group": metadata.coverage_group,
        "requires_legal_review": metadata.requires_legal_review,
        "requires_admin_acceptance": metadata.requires_admin_acceptance,
        "source_template_key": metadata.source_template_key,
    }
    defaults = _catalog_defaults_for_policy(policy)
    for key, value in defaults.items():
        setattr(metadata, key, value)
    metadata.save()
    after = {key: getattr(metadata, key) for key in before.keys()}
    _log_policy_event(policy, event="POLICY_GOVERNANCE_METADATA_SYNCED", performed_by=performed_by, before=before, after=after)
    return policy


def policy_visibility_for_slug(slug: str) -> str:
    spec = get_policy_spec_by_slug(slug)
    return spec.visibility if spec else PUBLIC


def stored_policy_visibility(policy: PolicyPage) -> str:
    return hydrate_policy_governance_metadata(policy).visibility or policy_visibility_for_slug(policy.slug)


def policy_governance_category_for_slug(slug: str, fallback: str | None = None) -> str:
    spec = get_policy_spec_by_slug(slug)
    return spec.category if spec else (fallback or "GENERAL")


def policy_coverage_group_for_slug(slug: str) -> str:
    spec = get_policy_spec_by_slug(slug)
    return spec.group if spec else "Public Legal"


def policy_is_public_visible(policy: PolicyPage) -> bool:
    return bool(policy.status == POLICY_STATUS_PUBLISHED and stored_policy_visibility(policy) == PUBLIC)


def policy_is_internal_only(policy: PolicyPage) -> bool:
    return stored_policy_visibility(policy) == INTERNAL


def policy_internal_ready(policy: PolicyPage) -> bool:
    metadata = hydrate_policy_governance_metadata(policy)
    return bool(metadata.visibility == INTERNAL and (policy.status in {POLICY_STATUS_APPROVED, POLICY_STATUS_PUBLISHED} or metadata.internal_acceptance_at))


def lifecycle_actions_for_policy(policy: PolicyPage) -> dict[str, bool]:
    metadata = hydrate_policy_governance_metadata(policy)
    is_public = metadata.visibility == PUBLIC
    is_internal = metadata.visibility == INTERNAL
    return {
        "can_edit": policy.status in {POLICY_STATUS_DRAFT, POLICY_STATUS_UNDER_REVIEW},
        "can_submit_review": policy.status == POLICY_STATUS_DRAFT,
        "can_approve": policy.status == POLICY_STATUS_UNDER_REVIEW,
        "can_reject": policy.status == POLICY_STATUS_UNDER_REVIEW,
        "can_publish": is_public and policy.status in {POLICY_STATUS_DRAFT, POLICY_STATUS_APPROVED},
        "can_accept_internal": is_internal and policy.status in {POLICY_STATUS_DRAFT, POLICY_STATUS_UNDER_REVIEW, POLICY_STATUS_APPROVED, POLICY_STATUS_PUBLISHED},
        "can_archive": policy.status in {POLICY_STATUS_APPROVED, POLICY_STATUS_PUBLISHED},
        "can_create_draft": policy.status in {POLICY_STATUS_APPROVED, POLICY_STATUS_PUBLISHED, POLICY_STATUS_ARCHIVED},
        "can_sync_metadata": True,
    }


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
    phone = _clean_text(getattr(public_profile, "support_phone", "")) or _clean_text(getattr(business_profile, "primary_phone", "")) or "Not provided"
    email = _clean_text(getattr(public_profile, "support_email", "")) or _clean_text(getattr(business_profile, "primary_email", "")) or "Not provided"
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


def _metadata_from_template(template: dict[str, Any], policy: PolicyPage) -> dict[str, Any]:
    spec = get_policy_spec_by_slug(template.get("slug") or policy.slug)
    if spec:
        return _catalog_defaults_for_policy(policy)
    return {
        "visibility": template.get("visibility") or PUBLIC,
        "governance_category": template.get("governance_category") or template.get("category") or policy.category,
        "coverage_group": template.get("coverage_group") or "Public Legal",
        "requires_legal_review": template.get("requires_legal_review", True),
        "requires_admin_acceptance": template.get("requires_admin_acceptance", False),
        "source_template_key": template.get("slug") or policy.slug,
    }


@transaction.atomic
def seed_default_policy_pages(*, performed_by=None, overwrite_existing_drafts: bool = False) -> dict[str, int]:
    created = 0
    updated = 0
    skipped = 0
    for template in get_default_policy_templates():
        slug = template["slug"]
        existing = PolicyPage.objects.filter(slug=slug).order_by("-version", "-id")
        if not existing.exists():
            policy = PolicyPage.objects.create(
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
            metadata_defaults = _metadata_from_template(template, policy)
            PolicyGovernanceMetadata.objects.update_or_create(policy=policy, defaults=metadata_defaults)
            created += 1
            continue
        latest = existing.first()
        hydrate_policy_governance_metadata(latest)
        if not overwrite_existing_drafts:
            skipped += 1
            continue
        draft = existing.filter(status=POLICY_STATUS_DRAFT).order_by("-version", "-id").first()
        if draft is None:
            skipped += 1
            continue
        draft.category = template["category"]
        draft.title = template["title"]
        draft.summary = template.get("summary", "")
        draft.content = template.get("content", "")
        draft.updated_by = performed_by
        draft.save()
        PolicyGovernanceMetadata.objects.update_or_create(policy=draft, defaults=_metadata_from_template(template, draft))
        updated += 1
    marker = PolicyPage.objects.order_by("-id").first()
    if marker is not None:
        _log_policy_event(marker, event="POLICY_SEED_DEFAULTS", performed_by=performed_by, created=created, updated=updated, skipped=skipped)
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
        status=POLICY_STATUS_DRAFT,
        effective_date=payload.get("effective_date"),
        last_reviewed_at=payload.get("last_reviewed_at"),
        created_by=performed_by,
        updated_by=performed_by,
    )
    metadata = hydrate_policy_governance_metadata(policy)
    for key in _METADATA_FIELDS:
        if key in payload:
            setattr(metadata, key, payload[key])
    metadata.owner = metadata.owner or performed_by
    metadata.save()
    _log_policy_event(policy, event="POLICY_CREATED", performed_by=performed_by)
    return policy


@transaction.atomic
def update_policy_page(*, policy: PolicyPage, payload: dict[str, Any], performed_by=None) -> PolicyPage:
    updates = {key: value for key, value in payload.items() if key in _POLICY_EDITABLE_FIELDS}
    if policy.status == POLICY_STATUS_PUBLISHED and any(key in updates for key in _POLICY_LOCKED_PUBLISHED_FIELDS):
        raise ValueError("Published policies are locked. Create a draft version before editing legal content.")
    if policy.status in {POLICY_STATUS_APPROVED, POLICY_STATUS_ARCHIVED} and any(key in updates for key in _POLICY_LOCKED_PUBLISHED_FIELDS):
        raise ValueError("Approved/archived policies are locked. Create a draft version before editing legal content.")
    if policy.status == POLICY_STATUS_UNDER_REVIEW and any(key in updates for key in {"slug", "category"}):
        raise ValueError("Policies under review cannot change slug or category.")
    for key, value in updates.items():
        setattr(policy, key, value)
    policy.updated_by = performed_by
    policy.save()
    metadata = hydrate_policy_governance_metadata(policy)
    metadata_changed: list[str] = []
    spec = get_policy_spec_by_slug(policy.slug)
    for key in _METADATA_FIELDS:
        if key not in payload:
            continue
        if key == "visibility" and spec and spec.visibility == INTERNAL and payload[key] != INTERNAL:
            raise ValueError("Catalog internal policies cannot be changed to PUBLIC through PATCH.")
        setattr(metadata, key, payload[key])
        metadata_changed.append(key)
    if metadata_changed:
        metadata.save()
    _log_policy_event(policy, event="POLICY_UPDATED", performed_by=performed_by, fields=sorted(list(updates.keys())), metadata_fields=metadata_changed)
    return policy


@transaction.atomic
def submit_policy_for_review(policy: PolicyPage, performed_by=None) -> PolicyPage:
    if policy.status != POLICY_STATUS_DRAFT:
        raise ValueError("Only draft policies can be submitted for review.")
    metadata = hydrate_policy_governance_metadata(policy)
    now = _now()
    metadata.reviewer = performed_by
    metadata.submitted_for_review_at = now
    metadata.rejection_reason = ""
    metadata.save()
    policy = _status_update(policy, status=POLICY_STATUS_UNDER_REVIEW, updated_by=performed_by)
    _log_policy_event(policy, event="POLICY_SUBMITTED_FOR_REVIEW", performed_by=performed_by)
    return policy


@transaction.atomic
def approve_policy(policy: PolicyPage, performed_by=None) -> PolicyPage:
    if policy.status != POLICY_STATUS_UNDER_REVIEW:
        raise ValueError("Only policies under review can be approved.")
    metadata = hydrate_policy_governance_metadata(policy)
    now = _now()
    metadata.approved_by = performed_by
    metadata.approved_at = now
    metadata.rejection_reason = ""
    metadata.save()
    policy = _status_update(policy, status=POLICY_STATUS_APPROVED, last_reviewed_at=now, updated_by=performed_by)
    _log_policy_event(policy, event="POLICY_APPROVED", performed_by=performed_by)
    return policy


@transaction.atomic
def reject_policy(policy: PolicyPage, performed_by=None, reason: str = "") -> PolicyPage:
    reason = _clean_text(reason)
    if not reason:
        raise ValueError("Reject reason is required.")
    if policy.status != POLICY_STATUS_UNDER_REVIEW:
        raise ValueError("Only policies under review can be rejected.")
    metadata = hydrate_policy_governance_metadata(policy)
    metadata.rejection_reason = reason
    metadata.reviewer = performed_by
    metadata.save()
    policy = _status_update(policy, status=POLICY_STATUS_DRAFT, updated_by=performed_by)
    _log_policy_event(policy, event="POLICY_REJECTED", performed_by=performed_by, reason=reason)
    return policy


@transaction.atomic
def accept_internal_policy(policy: PolicyPage, performed_by=None) -> PolicyPage:
    metadata = hydrate_policy_governance_metadata(policy)
    if metadata.visibility != INTERNAL:
        raise ValueError("Only internal governance policies can be internally accepted.")
    now = _now()
    metadata.internal_acceptance_at = now
    metadata.internal_accepted_by = performed_by
    if policy.status in {POLICY_STATUS_DRAFT, POLICY_STATUS_UNDER_REVIEW}:
        metadata.approved_by = performed_by
        metadata.approved_at = now
        metadata.save()
        policy = _status_update(policy, status=POLICY_STATUS_APPROVED, last_reviewed_at=now, updated_by=performed_by)
    else:
        metadata.save()
    _log_policy_event(policy, event="POLICY_INTERNAL_ACCEPTED", performed_by=performed_by)
    return policy


@transaction.atomic
def create_draft_from_policy(*, policy: PolicyPage, performed_by=None) -> PolicyPage:
    source_metadata = hydrate_policy_governance_metadata(policy)
    draft = PolicyPage.objects.create(
        slug=policy.slug,
        version=_next_policy_version(policy.slug),
        category=policy.category,
        title=policy.title,
        summary=policy.summary,
        content=policy.content,
        status=PolicyStatus.DRAFT,
        effective_date=policy.effective_date,
        created_by=performed_by,
        updated_by=performed_by,
    )
    PolicyGovernanceMetadata.objects.create(
        policy=draft,
        visibility=source_metadata.visibility,
        governance_category=source_metadata.governance_category,
        coverage_group=source_metadata.coverage_group,
        requires_legal_review=source_metadata.requires_legal_review,
        requires_admin_acceptance=source_metadata.requires_admin_acceptance,
        owner=source_metadata.owner,
        reviewer=None,
        source_template_key=source_metadata.source_template_key,
        review_due_date=source_metadata.review_due_date,
    )
    _log_policy_event(draft, event="POLICY_DRAFT_CREATED", performed_by=performed_by, source_policy_id=policy.id)
    return draft


@transaction.atomic
def publish_policy_page(*, policy: PolicyPage, performed_by=None, effective_date: date | None = None, review_now: bool = True) -> PolicyPage:
    metadata = hydrate_policy_governance_metadata(policy)
    if metadata.visibility != PUBLIC:
        raise ValueError("Internal policies cannot be published to public policy pages. Accept them internally instead.")
    now = _now()
    if policy.status == POLICY_STATUS_DRAFT:
        if not review_now:
            raise ValueError("Draft policies must be reviewed before publishing.")
        metadata.approved_by = performed_by
        metadata.approved_at = now
        metadata.reviewer = performed_by
        metadata.submitted_for_review_at = metadata.submitted_for_review_at or now
    elif policy.status != POLICY_STATUS_APPROVED:
        raise ValueError("Only approved public policies can be published.")
    siblings = PolicyPage.objects.select_for_update(of=("self",)).filter(slug=policy.slug)
    old_published = siblings.filter(status=POLICY_STATUS_PUBLISHED).exclude(pk=policy.pk)
    for sibling in old_published:
        sibling_meta = hydrate_policy_governance_metadata(sibling)
        sibling_meta.archived_by = performed_by
        sibling_meta.archived_at = now
        sibling_meta.archive_reason = "Archived automatically by newer published version."
        sibling_meta.save()
    old_published.update(status=POLICY_STATUS_ARCHIVED, updated_by=performed_by, published_at=None)
    metadata.save()
    policy = _status_update(
        policy,
        status=POLICY_STATUS_PUBLISHED,
        published_by=performed_by,
        published_at=now,
        effective_date=effective_date or policy.effective_date or timezone.localdate(),
        last_reviewed_at=now if review_now or not policy.last_reviewed_at else policy.last_reviewed_at,
        updated_by=performed_by,
    )
    _log_policy_event(policy, event="POLICY_PUBLISHED", performed_by=performed_by, effective_date=str(policy.effective_date), review_now=review_now)
    return policy


@transaction.atomic
def archive_policy_page(*, policy: PolicyPage, performed_by=None, reason: str = "") -> PolicyPage:
    reason = _clean_text(reason) or "Archived by admin."
    metadata = hydrate_policy_governance_metadata(policy)
    now = _now()
    metadata.archived_by = performed_by
    metadata.archived_at = now
    metadata.archive_reason = reason
    metadata.save()
    policy = _status_update(policy, status=POLICY_STATUS_ARCHIVED, published_at=None, updated_by=performed_by)
    _log_policy_event(policy, event="POLICY_ARCHIVED", performed_by=performed_by, reason=reason)
    return policy


def get_latest_policy_by_slug(slug: str) -> PolicyPage | None:
    return PolicyPage.objects.filter(slug=slug.strip().lower()).order_by("-version", "-id").first()


def get_public_published_policy(slug: str) -> PolicyPage | None:
    cleaned = slug.strip().lower()
    policies = PolicyPage.objects.filter(slug=cleaned, status=POLICY_STATUS_PUBLISHED).order_by("-published_at", "-version", "-id")
    for policy in policies:
        if stored_policy_visibility(policy) == PUBLIC:
            return policy
    return None


def list_public_published_policies() -> list[PolicyPage]:
    rows = PolicyPage.objects.filter(status=POLICY_STATUS_PUBLISHED).order_by("category", "slug", "-version")
    return [policy for policy in rows if stored_policy_visibility(policy) == PUBLIC]


def _metadata_mismatches(policy: PolicyPage | None, spec) -> list[str]:
    if policy is None:
        return []
    metadata = hydrate_policy_governance_metadata(policy)
    mismatches = []
    if metadata.visibility != spec.visibility:
        mismatches.append("visibility")
    if metadata.governance_category != spec.category:
        mismatches.append("governance_category")
    if metadata.coverage_group != spec.group:
        mismatches.append("coverage_group")
    if metadata.requires_admin_acceptance != spec.requires_admin_acceptance:
        mismatches.append("requires_admin_acceptance")
    return mismatches


def build_policy_coverage_matrix() -> dict[str, Any]:
    latest_by_slug: dict[str, PolicyPage] = {}
    for row in PolicyPage.objects.order_by("slug", "-version", "-id"):
        latest_by_slug.setdefault(row.slug, row)
    rows: list[dict[str, Any]] = []
    for spec in get_policy_coverage_specs():
        policy = latest_by_slug.get(spec.slug)
        status = policy.status if policy else "MISSING"
        metadata = hydrate_policy_governance_metadata(policy) if policy else None
        stored_visibility = metadata.visibility if metadata else spec.visibility
        stored_category = metadata.governance_category if metadata else spec.compatible_category
        stored_group = metadata.coverage_group if metadata else spec.group
        mismatches = _metadata_mismatches(policy, spec)
        public_ready = bool(policy and stored_visibility == PUBLIC and policy.status == POLICY_STATUS_PUBLISHED)
        internal_ready = bool(policy and stored_visibility == INTERNAL and (policy.status in {POLICY_STATUS_APPROVED, POLICY_STATUS_PUBLISHED} or metadata.internal_acceptance_at))
        dangerous_mismatch = "visibility" in mismatches
        if policy is None:
            blocker = "Policy template is missing."
            action = "Seed default templates, then review and publish/approve as required."
        elif mismatches and dangerous_mismatch:
            blocker = "Stored governance metadata does not match catalog visibility."
            action = "Sync governance metadata from catalog before relying on readiness."
        elif stored_visibility == PUBLIC and policy.status != POLICY_STATUS_PUBLISHED:
            blocker = "Public policy exists but is not published."
            action = "Review legal text, approve it, then publish."
        elif stored_visibility == INTERNAL and not internal_ready:
            blocker = "Internal governance policy is not approved or accepted."
            action = "Review internally and use Accept Internal Policy."
        elif mismatches:
            blocker = ""
            action = "Sync governance metadata from catalog."
        else:
            blocker = ""
            action = "No immediate action."
        rows.append(
            {
                "required_policy_key": spec.slug,
                "label": spec.label,
                "coverage_group": stored_group,
                "catalog_coverage_group": spec.group,
                "category": spec.category,
                "stored_category": stored_category,
                "visibility": stored_visibility,
                "catalog_visibility": spec.visibility,
                "status": status,
                "policy_id": policy.id if policy else None,
                "slug": spec.slug,
                "public_ready": public_ready,
                "internal_ready": internal_ready,
                "blocker_reason": blocker,
                "recommended_action": action,
                "requires_legal_review": metadata.requires_legal_review if metadata else spec.requires_legal_review,
                "requires_admin_acceptance": metadata.requires_admin_acceptance if metadata else spec.requires_admin_acceptance,
                "metadata_synced": not mismatches,
                "metadata_mismatches": mismatches,
                "review_due_date": metadata.review_due_date if metadata else None,
            }
        )
    grouped = [{"group": group, "items": [row for row in rows if row["coverage_group"] == group or row["catalog_coverage_group"] == group]} for group in group_specs().keys()]
    summary = {
        "required_count": len(rows),
        "missing_count": sum(1 for row in rows if row["status"] == "MISSING"),
        "public_required_count": sum(1 for row in rows if row["visibility"] == PUBLIC),
        "public_published_count": sum(1 for row in rows if row["public_ready"]),
        "public_draft_count": sum(1 for row in rows if row["visibility"] == PUBLIC and row["status"] == POLICY_STATUS_DRAFT),
        "public_under_review_count": sum(1 for row in rows if row["visibility"] == PUBLIC and row["status"] == POLICY_STATUS_UNDER_REVIEW),
        "public_approved_count": sum(1 for row in rows if row["visibility"] == PUBLIC and row["status"] == POLICY_STATUS_APPROVED),
        "internal_required_count": sum(1 for row in rows if row["visibility"] == INTERNAL),
        "internal_ready_count": sum(1 for row in rows if row["internal_ready"]),
        "internal_draft_count": sum(1 for row in rows if row["visibility"] == INTERNAL and row["status"] == POLICY_STATUS_DRAFT),
        "internal_under_review_count": sum(1 for row in rows if row["visibility"] == INTERNAL and row["status"] == POLICY_STATUS_UNDER_REVIEW),
        "metadata_mismatch_count": sum(1 for row in rows if not row["metadata_synced"]),
    }
    return {"summary": summary, "groups": grouped, "results": rows}


def get_public_business_compliance_summary() -> dict[str, Any]:
    context = get_policy_placeholder_context()
    public_docs = BusinessComplianceDocument.objects.filter(is_active=True, public_visibility=BusinessComplianceDocumentVisibility.PUBLIC_SUMMARY_ONLY, verification_status=BusinessComplianceDocumentVerificationStatus.VERIFIED).order_by("document_type", "-created_at", "-id")
    documents = [{"document_type": row.document_type, "title": row.title or row.get_document_type_display(), "verification_status": row.verification_status, "public_summary": row.public_summary, "verified_at": row.verified_at} for row in public_docs]
    return {"business_name": "Subidha Furniture", "business_location": "Asansol, West Bengal, India", "website_url": context.website_url, "business_phone": context.business_phone, "business_email": context.business_email, "business_address": context.business_address, "gst_status_text": context.gst_status_text, "udyam_status_text": context.udyam_status_text, "public_documents": documents, "private_document_disclaimer": "Private compliance documents are not publicly downloadable by default. Only approved public-safe summaries are shown."}
