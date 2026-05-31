from __future__ import annotations

from rest_framework import serializers

from subscriptions.models_business_setup import (
    BusinessComplianceDocument,
    PolicyPage,
    PolicyStatus,
)
from subscriptions.services.business_compliance_governance_service import (
    compliance_status_for_document,
    is_publicly_downloadable,
)
from subscriptions.services.business_compliance_review_actions import (
    get_review_state,
    has_real_evidence,
    public_summary_approved,
)
from subscriptions.services.policy_governance_service import (
    policy_coverage_group_for_slug,
    policy_governance_category_for_slug,
    policy_is_internal_only,
    policy_is_public_visible,
    policy_visibility_for_slug,
    render_policy_content,
)


class PolicyPageAdminSerializer(serializers.ModelSerializer):
    created_by_username = serializers.CharField(source="created_by.username", read_only=True)
    updated_by_username = serializers.CharField(source="updated_by.username", read_only=True)
    published_by_username = serializers.CharField(source="published_by.username", read_only=True)
    visibility = serializers.SerializerMethodField()
    governance_category = serializers.SerializerMethodField()
    coverage_group = serializers.SerializerMethodField()
    public_visible = serializers.SerializerMethodField()
    internal_only = serializers.SerializerMethodField()
    public_ready = serializers.SerializerMethodField()
    internal_ready = serializers.SerializerMethodField()
    requires_legal_review = serializers.SerializerMethodField()
    review_due_date = serializers.SerializerMethodField()
    last_published_at = serializers.DateTimeField(source="published_at", read_only=True)

    class Meta:
        model = PolicyPage
        fields = (
            "id",
            "slug",
            "version",
            "category",
            "governance_category",
            "coverage_group",
            "visibility",
            "public_visible",
            "internal_only",
            "public_ready",
            "internal_ready",
            "requires_legal_review",
            "review_due_date",
            "title",
            "summary",
            "content",
            "status",
            "effective_date",
            "last_reviewed_at",
            "published_at",
            "last_published_at",
            "published_by",
            "published_by_username",
            "created_by",
            "created_by_username",
            "updated_by",
            "updated_by_username",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "version",
            "published_at",
            "last_published_at",
            "published_by",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
            "visibility",
            "governance_category",
            "coverage_group",
            "public_visible",
            "internal_only",
            "public_ready",
            "internal_ready",
            "requires_legal_review",
            "review_due_date",
        )

    def get_visibility(self, obj: PolicyPage) -> str:
        return policy_visibility_for_slug(obj.slug)

    def get_governance_category(self, obj: PolicyPage) -> str:
        return policy_governance_category_for_slug(obj.slug, obj.category)

    def get_coverage_group(self, obj: PolicyPage) -> str:
        return policy_coverage_group_for_slug(obj.slug)

    def get_public_visible(self, obj: PolicyPage) -> bool:
        return policy_is_public_visible(obj)

    def get_internal_only(self, obj: PolicyPage) -> bool:
        return policy_is_internal_only(obj)

    def get_public_ready(self, obj: PolicyPage) -> bool:
        return policy_is_public_visible(obj)

    def get_internal_ready(self, obj: PolicyPage) -> bool:
        return bool(policy_is_internal_only(obj) and obj.status == PolicyStatus.PUBLISHED)

    def get_requires_legal_review(self, obj: PolicyPage) -> bool:
        return True

    def get_review_due_date(self, obj: PolicyPage):
        return None

    def validate_slug(self, value: str) -> str:
        cleaned = (value or "").strip().lower()
        if not cleaned:
            raise serializers.ValidationError("Slug is required.")
        return cleaned

    def validate_status(self, value: str) -> str:
        if value == PolicyStatus.PUBLISHED:
            raise serializers.ValidationError(
                "Set publish status via publish endpoint to ensure review workflow."
            )
        return value


class PolicyPagePublicSerializer(serializers.ModelSerializer):
    rendered_content = serializers.SerializerMethodField()

    class Meta:
        model = PolicyPage
        fields = (
            "slug",
            "version",
            "category",
            "title",
            "summary",
            "content",
            "rendered_content",
            "effective_date",
            "published_at",
            "updated_at",
        )

    def get_rendered_content(self, obj: PolicyPage) -> str:
        return render_policy_content(obj.content)


class PolicyPagePublicListSerializer(serializers.ModelSerializer):
    class Meta:
        model = PolicyPage
        fields = (
            "slug",
            "version",
            "category",
            "title",
            "summary",
            "effective_date",
            "published_at",
            "updated_at",
        )


class PolicyPublishActionSerializer(serializers.Serializer):
    effective_date = serializers.DateField(required=False)
    review_now = serializers.BooleanField(required=False, default=True)


class PolicySeedActionSerializer(serializers.Serializer):
    overwrite_existing_drafts = serializers.BooleanField(required=False, default=False)


class ComplianceReasonActionSerializer(serializers.Serializer):
    reason = serializers.CharField(required=True, allow_blank=False, trim_whitespace=True)


class ComplianceApproveActionSerializer(serializers.Serializer):
    public_summary_approved = serializers.BooleanField(required=False, default=False)


class BusinessComplianceDocumentAdminSerializer(serializers.ModelSerializer):
    uploaded_by_username = serializers.CharField(source="uploaded_by.username", read_only=True)
    reviewed_by_username = serializers.CharField(source="reviewed_by.username", read_only=True)
    public_summary_approved_by_username = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()
    review_status = serializers.SerializerMethodField()
    visibility = serializers.CharField(source="public_visibility", read_only=True)
    internal_notes = serializers.CharField(source="notes", read_only=True)
    reviewed_at = serializers.SerializerMethodField()
    rejected_reason = serializers.SerializerMethodField()
    expires_at = serializers.SerializerMethodField()
    source_template_key = serializers.SerializerMethodField()
    evidence_uploaded_at = serializers.SerializerMethodField()
    approved_public_summary = serializers.SerializerMethodField()
    public_summary_approved_at = serializers.SerializerMethodField()
    last_action_reason = serializers.SerializerMethodField()
    is_publicly_downloadable = serializers.SerializerMethodField()
    has_file = serializers.SerializerMethodField()
    public_summary_ready = serializers.SerializerMethodField()

    class Meta:
        model = BusinessComplianceDocument
        fields = (
            "id",
            "document_type",
            "title",
            "file",
            "public_visibility",
            "visibility",
            "verification_status",
            "status",
            "review_status",
            "public_summary",
            "notes",
            "internal_notes",
            "uploaded_by",
            "uploaded_by_username",
            "reviewed_by",
            "reviewed_by_username",
            "verified_at",
            "reviewed_at",
            "rejected_reason",
            "expires_at",
            "source_template_key",
            "evidence_uploaded_at",
            "approved_public_summary",
            "public_summary_approved_at",
            "public_summary_approved_by_username",
            "last_action_reason",
            "is_publicly_downloadable",
            "has_file",
            "public_summary_ready",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "uploaded_by",
            "reviewed_by",
            "verified_at",
            "reviewed_at",
            "rejected_reason",
            "source_template_key",
            "evidence_uploaded_at",
            "approved_public_summary",
            "public_summary_approved_at",
            "public_summary_approved_by_username",
            "last_action_reason",
            "is_publicly_downloadable",
            "has_file",
            "public_summary_ready",
            "created_at",
            "updated_at",
        )

    def get_status(self, obj: BusinessComplianceDocument) -> str:
        return compliance_status_for_document(obj)

    def get_review_status(self, obj: BusinessComplianceDocument) -> str:
        return get_review_state(obj).review_status

    def get_reviewed_at(self, obj: BusinessComplianceDocument):
        return get_review_state(obj).reviewed_at

    def get_rejected_reason(self, obj: BusinessComplianceDocument) -> str:
        return get_review_state(obj).rejected_reason

    def get_expires_at(self, obj: BusinessComplianceDocument):
        return get_review_state(obj).expires_at

    def get_source_template_key(self, obj: BusinessComplianceDocument) -> str:
        return get_review_state(obj).source_template_key

    def get_evidence_uploaded_at(self, obj: BusinessComplianceDocument):
        return get_review_state(obj).evidence_uploaded_at

    def get_approved_public_summary(self, obj: BusinessComplianceDocument) -> bool:
        return get_review_state(obj).approved_public_summary

    def get_public_summary_approved_at(self, obj: BusinessComplianceDocument):
        return get_review_state(obj).public_summary_approved_at

    def get_public_summary_approved_by_username(self, obj: BusinessComplianceDocument) -> str:
        user = get_review_state(obj).public_summary_approved_by
        return getattr(user, "username", "") if user else ""

    def get_last_action_reason(self, obj: BusinessComplianceDocument) -> str:
        return get_review_state(obj).last_action_reason

    def get_is_publicly_downloadable(self, obj: BusinessComplianceDocument) -> bool:
        return is_publicly_downloadable(obj)

    def get_has_file(self, obj: BusinessComplianceDocument) -> bool:
        return has_real_evidence(obj)

    def get_public_summary_ready(self, obj: BusinessComplianceDocument) -> bool:
        return public_summary_approved(obj)


class BusinessComplianceDocumentPublicSerializer(serializers.ModelSerializer):
    is_publicly_downloadable = serializers.SerializerMethodField()

    class Meta:
        model = BusinessComplianceDocument
        fields = (
            "document_type",
            "title",
            "verification_status",
            "public_summary",
            "verified_at",
            "is_publicly_downloadable",
        )

    def get_is_publicly_downloadable(self, obj: BusinessComplianceDocument) -> bool:
        return False
