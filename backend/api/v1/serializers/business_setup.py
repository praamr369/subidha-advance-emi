from pathlib import Path

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from subscriptions.models_business_setup import BusinessProfile
from subscriptions.models_document_print_settings import (
    DOCUMENT_PRINT_LOGO_EXTENSIONS,
    DOCUMENT_PRINT_LOGO_MAX_BYTES,
    DocumentPrintSettings,
)


class BusinessSetupModelSerializer(serializers.ModelSerializer):
    def _raise_drf_validation_error(self, error: DjangoValidationError):
        if hasattr(error, "message_dict"):
            raise serializers.ValidationError(error.message_dict)
        if hasattr(error, "messages"):
            raise serializers.ValidationError({"non_field_errors": error.messages})
        raise serializers.ValidationError({"non_field_errors": [str(error)]})

    def _validate_instance(self, instance):
        try:
            instance.full_clean()
        except DjangoValidationError as error:
            self._raise_drf_validation_error(error)

    def create(self, validated_data):
        instance = self.Meta.model(**validated_data)
        self._validate_instance(instance)
        instance.save()
        return instance

    def update(self, instance, validated_data):
        for attribute, value in validated_data.items():
            setattr(instance, attribute, value)
        self._validate_instance(instance)
        instance.save()
        return instance


class BusinessProfileSerializer(BusinessSetupModelSerializer):
    class Meta:
        model = BusinessProfile
        fields = "__all__"
        read_only_fields = ("id", "created_at", "updated_at")


class DocumentPrintSettingsSerializer(BusinessSetupModelSerializer):
    business_logo_url = serializers.SerializerMethodField()
    clear_logo = serializers.BooleanField(write_only=True, required=False, default=False)

    class Meta:
        model = DocumentPrintSettings
        fields = "__all__"
        read_only_fields = ("id", "created_at", "updated_at", "business_logo_url")
        extra_kwargs = {"business_logo": {"required": False, "allow_null": True}}

    def get_business_logo_url(self, instance):
        logo = getattr(instance, "business_logo", None)
        if not logo:
            return ""
        try:
            url = logo.url
        except ValueError:
            return ""
        request = self.context.get("request")
        return request.build_absolute_uri(url) if request else url

    def validate_business_logo(self, value):
        if not value:
            return value
        extension = Path(getattr(value, "name", "") or "").suffix.lower()
        if extension not in DOCUMENT_PRINT_LOGO_EXTENSIONS:
            raise serializers.ValidationError("Logo must be JPG, JPEG, PNG, WEBP, or GIF.")
        content_type = (getattr(value, "content_type", "") or "").lower()
        if content_type and not content_type.startswith("image/"):
            raise serializers.ValidationError("Logo upload must be an image file.")
        size = getattr(value, "size", 0) or 0
        if size > DOCUMENT_PRINT_LOGO_MAX_BYTES:
            raise serializers.ValidationError("Logo must be 2 MB or smaller.")
        return value

    def update(self, instance, validated_data):
        clear_logo = bool(validated_data.pop("clear_logo", False))
        if clear_logo and instance.business_logo:
            instance.business_logo.delete(save=False)
            instance.business_logo = None
        return super().update(instance, validated_data)


class SetupChecklistSerializer(serializers.Serializer):
    is_ready_for_go_live = serializers.BooleanField()
    percent_complete = serializers.IntegerField()
    items = serializers.ListField(child=serializers.DictField())
    counts = serializers.DictField(required=False)


class DocumentNumberingSequenceSerializer(serializers.Serializer):
    key = serializers.CharField()
    name = serializers.CharField()
    series_code = serializers.CharField()
    financial_year = serializers.CharField()
    configured = serializers.BooleanField()
    prefix = serializers.CharField()
    next_number = serializers.IntegerField()
    padding = serializers.IntegerField()
    next_number_preview = serializers.CharField(allow_null=True)
    last_issued_number = serializers.CharField(allow_null=True)
    status = serializers.CharField()


class DocumentNumberingStateSerializer(serializers.Serializer):
    financial_year = serializers.CharField()
    sequences = DocumentNumberingSequenceSerializer(many=True)
    checks = serializers.DictField()
    duplicate_issues = serializers.DictField()


class DocumentNumberingUpdateSerializer(serializers.Serializer):
    key = serializers.CharField()
    prefix = serializers.CharField(required=False, allow_blank=True)
    next_number = serializers.IntegerField(required=False, min_value=1)
    padding = serializers.IntegerField(required=False, min_value=1, max_value=12)

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if not any(field in attrs for field in ("prefix", "next_number", "padding")):
            raise serializers.ValidationError(
                {"detail": "At least one field must be provided: prefix, next_number, or padding."}
            )
        return attrs


class BusinessResetRequestSerializer(serializers.Serializer):
    confirm = serializers.BooleanField()
    preserve_username = serializers.CharField()
    delete_non_preserved_users = serializers.BooleanField(default=True)
    clear_auth_artifacts = serializers.BooleanField(default=True)
    dry_run = serializers.BooleanField(default=False)

    def validate_preserve_username(self, value: str) -> str:
        cleaned = (value or "").strip()
        if not cleaned:
            raise serializers.ValidationError("Preserve username is required.")
        return cleaned

    def validate(self, attrs):
        attrs = super().validate(attrs)
        raw_confirm = getattr(self, "initial_data", {}).get("confirm", serializers.empty)
        if not isinstance(raw_confirm, bool):
            raise serializers.ValidationError({"confirm": "confirm must be a JSON boolean true."})
        if not attrs.get("confirm", False):
            raise serializers.ValidationError({"confirm": "confirm must be true to execute business reset."})
        return attrs


class BusinessResetResponseSerializer(serializers.Serializer):
    mode = serializers.CharField()
    confirmation_required = serializers.CharField()
    options = serializers.DictField()
    preserved_users = serializers.ListField(child=serializers.DictField())
    deletable_user_count = serializers.IntegerField()
    targets = serializers.DictField()
    auth_artifacts = serializers.DictField()
    deleted_counts = serializers.DictField(required=False)
    post_reset_checklist = serializers.DictField(required=False)
    next_setup_steps = serializers.ListField(child=serializers.CharField(), required=False)


class ResetScopePreviewRequestSerializer(serializers.Serializer):
    scopes = serializers.ListField(child=serializers.CharField(max_length=80), min_length=1)
    preserve_username = serializers.CharField()
    preserve_user_ids = serializers.ListField(child=serializers.IntegerField(min_value=1), required=False, default=list)


class ModularResetExecuteRequestSerializer(serializers.Serializer):
    scopes = serializers.ListField(child=serializers.CharField(max_length=80), min_length=1)
    preserve_username = serializers.CharField()
    confirmation_phrase = serializers.CharField()
    backup_job_id = serializers.IntegerField(required=False)


class BackupJobCreateSerializer(serializers.Serializer):
    job_type = serializers.ChoiceField(choices=["FULL_DATABASE_LOGICAL", "SELECTED_SCOPES_EXPORT"])
    scopes = serializers.ListField(child=serializers.CharField(max_length=80), min_length=1)


class RestorePreviewRequestSerializer(serializers.Serializer):
    restore_type = serializers.ChoiceField(
        choices=[
            "FULL_BACKUP_RESTORE_PREVIEW",
            "SELECTED_SCOPE_RESTORE_PREVIEW",
            "SETUP_SNAPSHOT_RESTORE_PREVIEW",
            "LOCAL_SANDBOX_RESTORE_PREVIEW",
        ],
        required=False,
        default="FULL_BACKUP_RESTORE_PREVIEW",
    )
    backup_job_id = serializers.IntegerField(min_value=1, required=False)
    scopes = serializers.ListField(child=serializers.CharField(max_length=80), required=False, default=list)
    snapshot_payload = serializers.JSONField(required=False)
    preserve_admin_username = serializers.CharField(required=False, allow_blank=True)


class RestoreExecuteRequestSerializer(serializers.Serializer):
    restore_job_id = serializers.IntegerField(min_value=1)
    confirmation_phrase = serializers.CharField()


class SetupSnapshotImportSerializer(serializers.Serializer):
    payload = serializers.JSONField()
    dry_run = serializers.BooleanField(default=True)
    confirm = serializers.BooleanField(default=False)


class LocalSandboxSeedSerializer(serializers.Serializer):
    confirm = serializers.BooleanField(default=False)


class LocalSandboxResetSerializer(serializers.Serializer):
    scopes = serializers.ListField(child=serializers.CharField(max_length=64), min_length=1)
    preserve_admin_username = serializers.CharField()
    preserve_setup = serializers.BooleanField(default=True)
    confirm_phrase = serializers.CharField()
    dry_run = serializers.BooleanField(default=True)
    sandbox_only = serializers.BooleanField(default=True)
