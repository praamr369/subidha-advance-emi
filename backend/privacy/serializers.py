"""Serializers for the DPDP 2023 privacy surface.

The privacy app has carried models since 2026-07-10 but never had an HTTP
layer. The customer-facing pages were written against a guessed contract the
next day and have been 404ing ever since. These serializers follow the models,
not the frontend's guesses — where the two disagree the model wins, because it
is the thing that actually stores the data.
"""
from __future__ import annotations

from rest_framework import serializers

from privacy.models import (
    ConsentStatus,
    ConsentType,
    CookieConsent,
    CustomerConsent,
    DataAccessLog,
    DataAccessRequest,
    DataRequestType,
    DPOGrievance,
    PrivacyPreference,
)


class CustomerConsentSerializer(serializers.ModelSerializer):
    consent_type_display = serializers.CharField(
        source="get_consent_type_display", read_only=True
    )
    is_active = serializers.SerializerMethodField()

    class Meta:
        model = CustomerConsent
        fields = (
            "id",
            "consent_type",
            "consent_type_display",
            "status",
            "is_active",
            "purpose_text",
            "notice_version",
            "language_code",
            "given_at",
            "withdrawn_at",
            "expires_at",
            "given_via",
        )
        read_only_fields = fields

    def get_is_active(self, obj) -> bool:
        return obj.status == ConsentStatus.GIVEN


class ConsentGrantSerializer(serializers.Serializer):
    consent_type = serializers.ChoiceField(choices=ConsentType.choices)
    purpose_text = serializers.CharField(required=False, allow_blank=True, default="")
    notice_version = serializers.CharField(required=False, allow_blank=True, default="")
    language_code = serializers.CharField(required=False, allow_blank=True, default="en")


class ConsentWithdrawSerializer(serializers.Serializer):
    """Withdraw by type. The by-id route takes the id from the URL instead."""

    consent_type = serializers.ChoiceField(choices=ConsentType.choices)


class CookieConsentSerializer(serializers.ModelSerializer):
    class Meta:
        model = CookieConsent
        fields = (
            "id",
            "essential_allowed",
            "analytics_allowed",
            "marketing_allowed",
            "third_party_allowed",
            "consent_given_at",
            "expires_at",
        )
        read_only_fields = ("id", "consent_given_at", "expires_at")


class CookieConsentWriteSerializer(serializers.Serializer):
    # essential_allowed is deliberately absent: essential cookies are not
    # consent-based under DPDP, and offering a toggle that cannot be honoured
    # would be a dark pattern.
    analytics_allowed = serializers.BooleanField(default=False)
    marketing_allowed = serializers.BooleanField(default=False)
    third_party_allowed = serializers.BooleanField(default=False)


class DataAccessRequestSerializer(serializers.ModelSerializer):
    request_type_display = serializers.CharField(
        source="get_request_type_display", read_only=True
    )
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = DataAccessRequest
        fields = (
            "id",
            "request_type",
            "request_type_display",
            "status",
            "status_display",
            "description",
            "requested_at",
            "due_date",
            "acknowledged_at",
            "completed_at",
            "response_format",
            "response_notes",
        )
        read_only_fields = fields


class DataAccessRequestCreateSerializer(serializers.Serializer):
    request_type = serializers.ChoiceField(choices=DataRequestType.choices)
    description = serializers.CharField(allow_blank=True, default="")
    response_format = serializers.CharField(required=False, allow_blank=True, default="")


class PrivacyPreferenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = PrivacyPreference
        fields = (
            "email_marketing",
            "sms_marketing",
            "push_notifications",
            "product_recommendations",
            "behavioral_tracking",
            "analytics_tracking",
            "profiling",
            "third_party_sharing",
            "do_not_sell",
            "limit_retention",
            "data_portability",
        )


class DPOGrievanceSerializer(serializers.ModelSerializer):
    grievance_type_display = serializers.CharField(
        source="get_grievance_type_display", read_only=True
    )
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = DPOGrievance
        fields = (
            "id",
            "grievance_type",
            "grievance_type_display",
            "title",
            "description",
            "status",
            "status_display",
            "filed_at",
            "acknowledged_at",
            "stage_1_due",
            "stage_2_due",
            "resolved_at",
            "resolution_notes",
        )
        read_only_fields = fields


class DPOGrievanceCreateSerializer(serializers.Serializer):
    grievance_type = serializers.CharField()
    title = serializers.CharField(max_length=255)
    description = serializers.CharField()


class DataAccessLogSerializer(serializers.ModelSerializer):
    """What the customer sees of their own access trail.

    Deliberately omits the staff user and IP address. This endpoint tells a
    customer *that* their data was accessed and why — naming the individual
    employee to the customer is a different disclosure decision, and the admin
    trail already records it.
    """

    access_reason_display = serializers.CharField(
        source="get_access_reason_display", read_only=True
    )

    class Meta:
        model = DataAccessLog
        fields = (
            "id",
            "data_categories",
            "access_reason",
            "access_reason_display",
            "accessed_at",
        )
        read_only_fields = fields
