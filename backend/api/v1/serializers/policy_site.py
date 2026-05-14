from __future__ import annotations

from rest_framework import serializers

from subscriptions.models_business_setup import (
    BusinessComplianceDocument,
    PolicyPage,
    PolicyStatus,
)
from subscriptions.services.policy_governance_service import render_policy_content


class PolicyPageAdminSerializer(serializers.ModelSerializer):
    created_by_username = serializers.CharField(source="created_by.username", read_only=True)
    updated_by_username = serializers.CharField(source="updated_by.username", read_only=True)
    published_by_username = serializers.CharField(source="published_by.username", read_only=True)

    class Meta:
        model = PolicyPage
        fields = (
            "id",
            "slug",
            "version",
            "category",
            "title",
            "summary",
            "content",
            "status",
            "effective_date",
            "last_reviewed_at",
            "published_at",
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
            "published_by",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
        )

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


class BusinessComplianceDocumentAdminSerializer(serializers.ModelSerializer):
    uploaded_by_username = serializers.CharField(source="uploaded_by.username", read_only=True)
    reviewed_by_username = serializers.CharField(source="reviewed_by.username", read_only=True)

    class Meta:
        model = BusinessComplianceDocument
        fields = (
            "id",
            "document_type",
            "title",
            "file",
            "public_visibility",
            "verification_status",
            "public_summary",
            "notes",
            "uploaded_by",
            "uploaded_by_username",
            "reviewed_by",
            "reviewed_by_username",
            "verified_at",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "uploaded_by",
            "reviewed_by",
            "verified_at",
            "created_at",
            "updated_at",
        )


class BusinessComplianceDocumentPublicSerializer(serializers.ModelSerializer):
    class Meta:
        model = BusinessComplianceDocument
        fields = (
            "document_type",
            "title",
            "verification_status",
            "public_summary",
            "verified_at",
        )
