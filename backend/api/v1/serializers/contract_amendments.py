from rest_framework import serializers

from subscriptions.models import (
    ContractAmendment,
    ContractRecontractEvent,
    ContractRecontractFinancialImpactPreview,
    ContractRecontractScheduleLine,
    Subscription,
)
from subscriptions.models_contract_amendment import PHASE1_AMENDMENT_TYPES, PHASE1_STATUSES
from subscriptions.services.contract_amendment_service import phase3_implementation_metadata
from subscriptions.services.product_recontract_preview_service import latest_product_recontract_preview_summary


class ContractAmendmentSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    customer_phone = serializers.CharField(source="customer.phone", read_only=True)
    subscription_number = serializers.CharField(source="subscription.subscription_number", read_only=True)
    rent_lease_contract_number = serializers.CharField(source="rent_lease_contract.subscription_number", read_only=True)
    requested_by_username = serializers.CharField(source="requested_by.username", read_only=True)
    approved_by_username = serializers.CharField(source="approved_by.username", read_only=True)
    implemented_by_username = serializers.CharField(source="implemented_by.username", read_only=True)
    is_implementable = serializers.SerializerMethodField()
    implementation_block_reason = serializers.SerializerMethodField()
    implementable_fields = serializers.SerializerMethodField()
    latest_product_recontract_preview = serializers.SerializerMethodField()

    class Meta:
        model = ContractAmendment
        fields = [
            "id",
            "amendment_no",
            "contract_type",
            "subscription",
            "subscription_number",
            "rent_lease_contract",
            "rent_lease_contract_number",
            "customer",
            "customer_name",
            "customer_phone",
            "partner",
            "requested_by",
            "requested_by_username",
            "requested_role",
            "amendment_type",
            "status",
            "old_values",
            "requested_values",
            "approved_values",
            "implemented_values",
            "previous_values",
            "new_values",
            "reason",
            "admin_note",
            "rejection_reason",
            "financial_impact_amount",
            "requires_emi_recalculation",
            "requires_inventory_review",
            "requires_lucky_id_review",
            "requires_accounting_review",
            "requires_rent_lease_review",
            "effective_date",
            "approved_by",
            "approved_by_username",
            "approved_at",
            "implemented_by",
            "implemented_by_username",
            "implemented_at",
            "is_implementable",
            "implementation_block_reason",
            "implementable_fields",
            "latest_product_recontract_preview",
            "applied_at",
            "metadata",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_is_implementable(self, obj):
        return phase3_implementation_metadata(obj)["is_implementable"]

    def get_implementation_block_reason(self, obj):
        return phase3_implementation_metadata(obj)["implementation_block_reason"]

    def get_implementable_fields(self, obj):
        return phase3_implementation_metadata(obj)["implementable_fields"]

    def get_latest_product_recontract_preview(self, obj):
        if obj.amendment_type != "PRODUCT_CHANGE":
            return None
        return latest_product_recontract_preview_summary(obj)


class ContractAmendmentCreateSerializer(serializers.Serializer):
    contract_type = serializers.ChoiceField(choices=["EMI_SUBSCRIPTION", "RENT_LEASE"])
    subscription = serializers.PrimaryKeyRelatedField(queryset=Subscription.objects.all(), required=False, allow_null=True)
    rent_lease_contract = serializers.PrimaryKeyRelatedField(queryset=Subscription.objects.all(), required=False, allow_null=True)
    amendment_type = serializers.ChoiceField(choices=sorted(PHASE1_AMENDMENT_TYPES))
    requested_values = serializers.JSONField(required=False, default=dict)
    reason = serializers.CharField(allow_blank=False, trim_whitespace=True)
    effective_date = serializers.DateField(required=False, allow_null=True)
    metadata = serializers.JSONField(required=False, default=dict)

    def validate(self, attrs):
        attrs = super().validate(attrs)
        has_subscription = bool(attrs.get("subscription"))
        has_rent_lease = bool(attrs.get("rent_lease_contract"))
        if has_subscription == has_rent_lease:
            raise serializers.ValidationError({"source": "Exactly one contract source is required."})
        if attrs["contract_type"] == "EMI_SUBSCRIPTION" and not has_subscription:
            raise serializers.ValidationError({"subscription": "EMI subscription source is required."})
        if attrs["contract_type"] == "RENT_LEASE" and not has_rent_lease:
            raise serializers.ValidationError({"rent_lease_contract": "Rent/lease contract source is required."})
        return attrs


class ContractAmendmentReviewSerializer(serializers.Serializer):
    admin_note = serializers.CharField(required=False, allow_blank=True, trim_whitespace=True)


class ContractAmendmentApproveSerializer(serializers.Serializer):
    approved_values = serializers.JSONField(required=False)
    admin_note = serializers.CharField(required=False, allow_blank=True, trim_whitespace=True)


class ContractAmendmentRejectSerializer(serializers.Serializer):
    rejection_reason = serializers.CharField(allow_blank=False, trim_whitespace=True)
    admin_note = serializers.CharField(required=False, allow_blank=True, trim_whitespace=True)


class ContractAmendmentStatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=sorted(PHASE1_STATUSES), required=False)


class ProductRecontractCustomerConsentSerializer(serializers.Serializer):
    decision = serializers.ChoiceField(choices=["ACCEPTED", "REJECTED"])
    note = serializers.CharField(required=False, allow_blank=True, trim_whitespace=True)


class ProductRecontractAdminDecisionSerializer(serializers.Serializer):
    decision = serializers.ChoiceField(choices=["APPROVED", "REJECTED"])
    note = serializers.CharField(required=False, allow_blank=True, trim_whitespace=True)


class ProductRecontractPreviewRequestSerializer(serializers.Serializer):
    preview_tenure_months = serializers.IntegerField(required=False, min_value=1)
    effective_date = serializers.DateField(required=False, allow_null=True)


class ProductRecontractPreviewSerializer(serializers.Serializer):
    preview_status = serializers.CharField()
    impact_type = serializers.CharField()
    blocked_reason = serializers.CharField(allow_blank=True, required=False)
    source_record_mutation = serializers.BooleanField()
    subscription_id = serializers.IntegerField(required=False)
    subscription_number = serializers.CharField(allow_blank=True, required=False, allow_null=True)
    old_product_id = serializers.IntegerField(required=False, allow_null=True)
    old_product_name = serializers.CharField(allow_blank=True, required=False)
    old_product_code = serializers.CharField(allow_blank=True, required=False)
    new_product_id = serializers.IntegerField(required=False, allow_null=True)
    new_product_name = serializers.CharField(allow_blank=True, required=False)
    new_product_code = serializers.CharField(allow_blank=True, required=False)
    old_contract_total = serializers.CharField(required=False)
    new_contract_total = serializers.CharField(required=False)
    price_difference = serializers.CharField(required=False)
    amount_already_paid = serializers.CharField(required=False)
    old_remaining_balance = serializers.CharField(required=False)
    proposed_new_remaining_balance = serializers.CharField(required=False)
    current_tenure_months = serializers.IntegerField(required=False)
    preview_tenure_months = serializers.IntegerField(required=False)
    current_monthly_amount = serializers.CharField(required=False)
    proposed_monthly_amount = serializers.CharField(required=False)
    pending_emi_count = serializers.IntegerField(required=False)
    effective_date_preview = serializers.CharField(required=False)
    warnings = serializers.ListField(child=serializers.CharField())


class ContractRecontractEventSerializer(serializers.ModelSerializer):
    amendment_id = serializers.IntegerField(read_only=True)
    old_product_name = serializers.CharField(source="old_product.name", read_only=True, allow_null=True)
    new_product_name = serializers.CharField(source="new_product.name", read_only=True, allow_null=True)
    old_product_code = serializers.CharField(source="old_product.product_code", read_only=True, allow_null=True)
    new_product_code = serializers.CharField(source="new_product.product_code", read_only=True, allow_null=True)
    created_by_display = serializers.CharField(source="created_by.username", read_only=True, allow_null=True)
    customer_consented_by_display = serializers.CharField(source="customer_consented_by.username", read_only=True, allow_null=True)
    admin_approved_by_display = serializers.CharField(source="admin_approved_by.username", read_only=True, allow_null=True)
    schedule_preview_lines = serializers.SerializerMethodField()
    latest_financial_impact_preview = serializers.SerializerMethodField()
    executed = serializers.SerializerMethodField()
    executed_at = serializers.SerializerMethodField()
    executed_by = serializers.SerializerMethodField()
    execution_status = serializers.SerializerMethodField()
    execution_snapshot = serializers.SerializerMethodField()
    accounting_bridge_posting_id = serializers.SerializerMethodField()
    journal_entry_id = serializers.SerializerMethodField()
    reconciliation_item_id = serializers.SerializerMethodField()
    reconciliation_run_id = serializers.SerializerMethodField()
    reconciliation_evidence_ids = serializers.SerializerMethodField()
    schedule_line_ids = serializers.SerializerMethodField()

    def _execution_metadata(self, obj):
        return obj.metadata if isinstance(obj.metadata, dict) else {}

    def get_schedule_preview_lines(self, obj):
        lines = getattr(obj, "schedule_preview_lines", None)
        if lines is None:
            return []
        return ContractRecontractScheduleLineSerializer(lines.all().order_by("line_no", "id"), many=True).data

    def get_latest_financial_impact_preview(self, obj):
        latest = obj.financial_impact_previews.order_by("-created_at", "-id").first()
        if not latest:
            return None
        return ContractRecontractFinancialImpactPreviewSerializer(latest).data

    def get_executed(self, obj):
        metadata = self._execution_metadata(obj)
        return bool(metadata.get("execution_performed") is True or metadata.get("execution_status") == "EXECUTED")

    def get_executed_at(self, obj):
        return self._execution_metadata(obj).get("executed_at")

    def get_executed_by(self, obj):
        return self._execution_metadata(obj).get("executed_by")

    def get_execution_status(self, obj):
        return self._execution_metadata(obj).get("execution_status") or "NOT_EXECUTED"

    def get_execution_snapshot(self, obj):
        metadata = self._execution_metadata(obj)
        return {
            "before_subscription": metadata.get("before_subscription") or {},
            "after_subscription": metadata.get("after_subscription") or {},
            "before_pending_emis": metadata.get("before_pending_emis") or [],
            "after_pending_emis": metadata.get("after_pending_emis") or [],
            "updated_pending_emi_lines": metadata.get("updated_pending_emi_lines") or [],
            "protected_emi_ids": metadata.get("protected_emi_ids") or [],
            "snapshot_policy": metadata.get("snapshot_policy") or "",
            "product_snapshot_updated": bool(metadata.get("product_snapshot_updated")),
            "pricing_snapshot_updated": bool(metadata.get("pricing_snapshot_updated")),
            "preservation_flags": {
                "payments_mutated": bool(metadata.get("payments_mutated")),
                "receipts_mutated": bool(metadata.get("receipts_mutated")),
                "accounting_mutated_by_execution": bool(metadata.get("accounting_mutated_by_execution")),
                "reconciliation_mutated_by_execution": bool(metadata.get("reconciliation_mutated_by_execution")),
                "settlement_mutated": bool(metadata.get("settlement_mutated")),
                "day_close_mutated": bool(metadata.get("day_close_mutated")),
                "lucky_id_mutated": bool(metadata.get("lucky_id_mutated")),
                "batch_mutated": bool(metadata.get("batch_mutated")),
                "waiver_mutated": bool(metadata.get("waiver_mutated")),
                "lucky_draw_mutated": bool(metadata.get("lucky_draw_mutated")),
                "inventory_mutated": bool(metadata.get("inventory_mutated")),
                "delivery_mutated": bool(metadata.get("delivery_mutated")),
                "commission_mutated": bool(metadata.get("commission_mutated")),
                "payout_mutated": bool(metadata.get("payout_mutated")),
                "rent_lease_demand_mutated": bool(metadata.get("rent_lease_demand_mutated")),
                "deposit_mutated": bool(metadata.get("deposit_mutated")),
            },
        }

    def get_accounting_bridge_posting_id(self, obj):
        return self._execution_metadata(obj).get("accounting_bridge_posting_id")

    def get_journal_entry_id(self, obj):
        return self._execution_metadata(obj).get("journal_entry_id")

    def get_reconciliation_item_id(self, obj):
        return self._execution_metadata(obj).get("reconciliation_item_id")

    def get_reconciliation_run_id(self, obj):
        return self._execution_metadata(obj).get("reconciliation_run_id")

    def get_reconciliation_evidence_ids(self, obj):
        return self._execution_metadata(obj).get("reconciliation_evidence_ids") or []

    def get_schedule_line_ids(self, obj):
        return self._execution_metadata(obj).get("schedule_line_ids") or []

    class Meta:
        model = ContractRecontractEvent
        fields = [
            "id",
            "amendment_id",
            "status",
            "impact_type",
            "old_product",
            "old_product_name",
            "old_product_code",
            "new_product",
            "new_product_name",
            "new_product_code",
            "old_contract_total",
            "new_contract_total",
            "price_difference",
            "amount_already_paid",
            "old_remaining_balance",
            "new_remaining_balance",
            "current_tenure_months",
            "preview_tenure_months",
            "current_monthly_amount",
            "proposed_monthly_amount",
            "pending_emi_count",
            "effective_date_preview",
            "source_record_mutation",
            "warnings",
            "blocked_reason",
            "preview_snapshot",
            "created_at",
            "updated_at",
            "created_by_display",
            "customer_consent_status",
            "customer_consented_by",
            "customer_consented_by_display",
            "customer_consented_at",
            "customer_consent_note",
            "customer_consent_snapshot",
            "admin_approval_status",
            "admin_approved_by",
            "admin_approved_by_display",
            "admin_approved_at",
            "admin_approval_note",
            "admin_approval_snapshot",
            "schedule_preview_lines",
            "latest_financial_impact_preview",
            "executed",
            "executed_at",
            "executed_by",
            "execution_status",
            "execution_snapshot",
            "accounting_bridge_posting_id",
            "journal_entry_id",
            "reconciliation_item_id",
            "reconciliation_run_id",
            "reconciliation_evidence_ids",
            "schedule_line_ids",
            "metadata",
        ]
        read_only_fields = fields


class ContractRecontractScheduleLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = ContractRecontractScheduleLine
        fields = [
            "id",
            "event",
            "line_no",
            "original_emi",
            "original_due_date",
            "original_amount",
            "proposed_due_date",
            "proposed_amount",
            "proposed_principal_component",
            "proposed_status",
            "adjustment_type",
            "source_record_mutation",
            "metadata",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class ContractRecontractFinancialImpactPreviewSerializer(serializers.ModelSerializer):
    class Meta:
        model = ContractRecontractFinancialImpactPreview
        fields = [
            "id",
            "event",
            "impact_type",
            "accounting_preview_status",
            "reconciliation_preview_status",
            "price_difference",
            "additional_receivable_amount",
            "credit_or_reduction_amount",
            "projected_customer_balance",
            "projected_future_emi_total",
            "journal_preview",
            "reconciliation_preview",
            "warnings",
            "blocked_reason",
            "source_record_mutation",
            "created_by",
            "metadata",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields
