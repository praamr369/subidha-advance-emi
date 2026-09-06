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
    BreachSeverity,
    ConsentStatus,
    ConsentType,
    CookieConsent,
    CustomerConsent,
    DataAccessLog,
    DataAccessRequest,
    DataBreachLog,
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


# ---------------------------------------------------------------------------
# Admin / back-office
#
# The customer half of this app shipped first; staff had no screen to answer
# anything a customer filed. These serialize the same records for the people
# who have to act on them, which means they expose the fields the customer
# serializers deliberately withhold — who it belongs to, and who acted.
# ---------------------------------------------------------------------------


class AdminDPOGrievanceSerializer(serializers.ModelSerializer):
    """A grievance as the DPO sees it: with the customer attached.

    The customer-facing DPOGrievanceSerializer omits the customer (they know
    who they are) and the assignee. Both matter here — a queue you cannot
    attribute is not a queue.
    """

    grievance_type_display = serializers.CharField(
        source="get_grievance_type_display", read_only=True
    )
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    customer_phone = serializers.CharField(source="customer.phone", read_only=True)
    assigned_to_dpo_name = serializers.SerializerMethodField()
    is_overdue = serializers.SerializerMethodField()

    class Meta:
        model = DPOGrievance
        fields = (
            "id",
            "customer",
            "customer_name",
            "customer_phone",
            "grievance_type",
            "grievance_type_display",
            "title",
            "description",
            "status",
            "status_display",
            "filed_at",
            "acknowledged_at",
            "stage_1_due",
            "stage_1_completed_at",
            "stage_2_due",
            "stage_2_completed_at",
            "assigned_to_dpo",
            "assigned_to_dpo_name",
            "resolved_at",
            "resolution_notes",
            "is_overdue",
        )
        read_only_fields = fields

    def get_assigned_to_dpo_name(self, obj) -> str:
        user = obj.assigned_to_dpo
        if user is None:
            return ""
        return user.get_full_name() or user.get_username()

    def get_is_overdue(self, obj) -> bool:
        """Past the statutory stage-1 deadline and still not resolved.

        Resolved grievances are never overdue, however late they were — the
        deadline is for acting, and the record of lateness is the gap between
        filed_at and resolved_at, not a flag that stays lit forever.
        """
        from django.utils import timezone

        if obj.status in ("RESOLVED",):
            return False
        return bool(obj.stage_1_due and obj.stage_1_due < timezone.now())


class GrievanceResolveSerializer(serializers.Serializer):
    resolution_notes = serializers.CharField()


class AdminDataBreachSerializer(serializers.ModelSerializer):
    severity_display = serializers.CharField(
        source="get_severity_display", read_only=True
    )
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    # The frontend was written against this name; the model calls it
    # affected_customer_count. Alias rather than rename — the model name is the
    # accurate one and other code reads it.
    affected_records = serializers.IntegerField(
        source="affected_customer_count", read_only=True
    )
    description = serializers.CharField(source="breach_description", read_only=True)

    class Meta:
        model = DataBreachLog
        fields = (
            "id",
            "title",
            "description",
            "breach_description",
            "severity",
            "severity_display",
            "status",
            "status_display",
            "data_types_affected",
            "affected_customer_count",
            "affected_records",
            "discovered_at",
            "reported_at",
            "contained_at",
            "board_notified_at",
            "notified_at",
            "closed_at",
            "authority_notified",
            "root_cause",
            "remediation_steps",
        )
        read_only_fields = fields


class AdminDataBreachCreateSerializer(serializers.Serializer):
    """Accepts the shape the admin page sends.

    `title` and `affected_records` are the frontend's names; `severity` is
    required because a breach whose severity nobody stated cannot be triaged,
    and defaulting it would silently downgrade a critical one.
    """

    title = serializers.CharField(max_length=255)
    severity = serializers.ChoiceField(choices=BreachSeverity.choices)
    description = serializers.CharField()
    affected_records = serializers.IntegerField(min_value=0)
    data_types_affected = serializers.ListField(
        child=serializers.CharField(), required=False, default=list
    )
    discovered_at = serializers.DateTimeField(required=False)
