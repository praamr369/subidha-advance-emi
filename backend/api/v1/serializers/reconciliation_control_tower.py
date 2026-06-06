from __future__ import annotations

from rest_framework import serializers

from reconciliation.models import (
    ReconciliationEvidence,
    ReconciliationItem,
    ReconciliationResolution,
    ReconciliationRun,
    ReconciliationResolutionAction,
)


class ReconciliationRunSerializer(serializers.ModelSerializer):
    started_by_username = serializers.CharField(source="started_by.username", read_only=True)
    financial_year = serializers.SerializerMethodField()
    accounting_period = serializers.SerializerMethodField()

    class Meta:
        model = ReconciliationRun
        fields = [
            "id",
            "run_no",
            "scope",
            "module",
            "branch",
            "date_from",
            "date_to",
            "financial_year",
            "accounting_period",
            "status",
            "started_by",
            "started_by_username",
            "started_at",
            "finished_at",
            "total_checked",
            "total_matched",
            "total_exceptions",
            "high_risk_count",
            "metadata",
        ]

    def get_financial_year(self, obj):
        return (obj.metadata or {}).get("financial_year")

    def get_accounting_period(self, obj):
        return (obj.metadata or {}).get("accounting_period")


class ReconciliationEvidenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReconciliationEvidence
        fields = ["id", "evidence_type", "content_type", "object_id", "label", "amount", "quantity", "status", "metadata", "created_at"]


class ReconciliationResolutionSerializer(serializers.ModelSerializer):
    resolved_by_username = serializers.CharField(source="resolved_by.username", read_only=True)

    class Meta:
        model = ReconciliationResolution
        fields = ["id", "action", "note", "before_status", "after_status", "resolved_by", "resolved_by_username", "created_at", "metadata"]


class ReconciliationItemSerializer(serializers.ModelSerializer):
    run_no = serializers.IntegerField(source="run.run_no", read_only=True)
    action_href = serializers.SerializerMethodField()

    class Meta:
        model = ReconciliationItem
        fields = [
            "id",
            "run",
            "run_no",
            "module",
            "source_type",
            "source_id",
            "source_label",
            "expected_amount",
            "actual_amount",
            "amount_delta",
            "expected_quantity",
            "actual_quantity",
            "quantity_delta",
            "severity",
            "status",
            "exception_code",
            "exception_message",
            "recommended_action",
            "action_href",
            "assigned_to",
            "resolved_by",
            "resolved_at",
            "metadata",
            "created_at",
            "updated_at",
        ]

    def get_action_href(self, obj):
        metadata = obj.metadata or {}
        if metadata.get("action_href"):
            return metadata["action_href"]
        code = (obj.exception_code or "").upper()
        if "MAPPING" in code or "BRIDGE" in code or "JOURNAL" in code:
            return "/admin/accounting/bridge-reconciliation"
        if "PERIOD" in code:
            return "/admin/accounting/periods"
        return "/admin/reconciliation/runs"


class ReconciliationItemDetailSerializer(ReconciliationItemSerializer):
    evidence = ReconciliationEvidenceSerializer(many=True, read_only=True)
    resolutions = ReconciliationResolutionSerializer(many=True, read_only=True)

    class Meta(ReconciliationItemSerializer.Meta):
        fields = ReconciliationItemSerializer.Meta.fields + ["evidence", "resolutions"]


class ReconciliationRunCreateSerializer(serializers.Serializer):
    scope = serializers.CharField(required=False, allow_blank=False, max_length=80, default="PHASE_F")
    module = serializers.CharField(required=False, allow_blank=False, max_length=80, default="CONTROL_TOWER")
    branch_id = serializers.IntegerField(required=False, allow_null=True)
    date_from = serializers.DateField(required=False, allow_null=True)
    date_to = serializers.DateField(required=False, allow_null=True)
    financial_year = serializers.CharField(required=False, allow_blank=True, max_length=40)
    accounting_period = serializers.CharField(required=False, allow_blank=True, max_length=40)

    def validate(self, attrs):
        date_from = attrs.get("date_from")
        date_to = attrs.get("date_to")
        if date_from and date_to and date_from > date_to:
            raise serializers.ValidationError("date_from must be <= date_to.")
        attrs["financial_year"] = (attrs.get("financial_year") or "").strip()
        attrs["accounting_period"] = (attrs.get("accounting_period") or "").strip()
        return attrs


class ReconciliationModuleSummarySerializer(serializers.Serializer):
    module = serializers.CharField()
    open_count = serializers.IntegerField()
    high_risk_count = serializers.IntegerField()
    exception_codes = serializers.ListField(child=serializers.DictField(), required=False)


class ReconciliationResolveSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=ReconciliationResolutionAction.choices)
    note = serializers.CharField(required=True, allow_blank=False, max_length=2000, trim_whitespace=True)


class ReconciliationReopenSerializer(serializers.Serializer):
    note = serializers.CharField(required=True, allow_blank=False, max_length=2000, trim_whitespace=True)
