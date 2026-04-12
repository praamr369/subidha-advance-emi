from __future__ import annotations

from rest_framework import serializers

from api.v1.serializers.support_requests import AdminSupportRequestReadSerializer
from branch_control.services.context_service import (
    resolve_service_case_branch,
    resolve_support_request_branch,
    serialize_branch,
)
from billing.models import DirectSale
from service_desk.models import (
    ServiceDeskCase,
    ServiceDeskCaseLine,
    ServiceDeskCaseStatus,
)
from service_desk.services.case_service import (
    complete_service_case_delivery_return,
    create_service_desk_case,
    link_replacement_direct_sale,
    post_credit_note_for_service_case,
    post_debit_note_for_service_case,
    request_service_case_delivery_return,
    transition_service_desk_case_status,
    update_service_desk_case,
)


class ServiceDeskCaseLineSerializer(serializers.ModelSerializer):
    product_code = serializers.CharField(source="product.product_code", read_only=True)
    inventory_item_sku = serializers.CharField(source="inventory_item.sku", read_only=True)

    class Meta:
        model = ServiceDeskCaseLine
        fields = [
            "id",
            "product",
            "product_code",
            "inventory_item",
            "inventory_item_sku",
            "description",
            "quantity",
            "disposition",
            "taxable_amount",
            "tax_amount",
            "line_total",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class ServiceDeskCaseSerializer(serializers.ModelSerializer):
    lines = ServiceDeskCaseLineSerializer(many=True, required=False)
    branch_id = serializers.SerializerMethodField()
    branch_code = serializers.SerializerMethodField()
    branch_name = serializers.SerializerMethodField()
    party_no = serializers.CharField(source="party.party_no", read_only=True)
    party_display_name = serializers.CharField(source="party.display_name", read_only=True)
    direct_sale_no = serializers.CharField(source="direct_sale.sale_no", read_only=True)
    billing_invoice_no = serializers.CharField(source="billing_invoice.document_no", read_only=True)
    delivery_reference = serializers.CharField(source="delivery.delivery_reference", read_only=True)
    support_request_status = serializers.CharField(source="support_request.status", read_only=True)
    credit_note_no = serializers.CharField(source="credit_note.note_no", read_only=True)
    debit_note_no = serializers.CharField(source="debit_note.note_no", read_only=True)
    replacement_direct_sale_no = serializers.CharField(
        source="replacement_direct_sale.sale_no",
        read_only=True,
    )
    assigned_to_username = serializers.CharField(source="assigned_to.username", read_only=True)
    authorized_by_username = serializers.CharField(source="authorized_by.username", read_only=True)
    resolved_by_username = serializers.CharField(source="resolved_by.username", read_only=True)
    closed_by_username = serializers.CharField(source="closed_by.username", read_only=True)

    class Meta:
        model = ServiceDeskCase
        fields = [
            "id",
            "case_no",
            "case_type",
            "status",
            "priority",
            "party",
            "branch_id",
            "branch_code",
            "branch_name",
            "party_no",
            "party_display_name",
            "support_request",
            "support_request_status",
            "direct_sale",
            "direct_sale_no",
            "subscription",
            "delivery",
            "delivery_reference",
            "billing_invoice",
            "billing_invoice_no",
            "credit_note",
            "credit_note_no",
            "debit_note",
            "debit_note_no",
            "replacement_direct_sale",
            "replacement_direct_sale_no",
            "product",
            "inventory_item",
            "warranty_status",
            "finance_status",
            "stock_status",
            "credit_note_required",
            "debit_note_required",
            "stock_resolution_required",
            "issue_summary",
            "issue_details",
            "reporter_name_snapshot",
            "reporter_phone_snapshot",
            "taxable_total",
            "tax_total",
            "total_amount",
            "internal_notes",
            "resolution_summary",
            "service_due_at",
            "authorized_at",
            "resolved_at",
            "closed_at",
            "assigned_to",
            "assigned_to_username",
            "authorized_by",
            "authorized_by_username",
            "resolved_by",
            "resolved_by_username",
            "closed_by",
            "closed_by_username",
            "lines",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "case_no",
            "status",
            "party_no",
            "party_display_name",
            "support_request_status",
            "direct_sale_no",
            "delivery_reference",
            "billing_invoice_no",
            "credit_note",
            "credit_note_no",
            "debit_note",
            "debit_note_no",
            "replacement_direct_sale",
            "replacement_direct_sale_no",
            "finance_status",
            "stock_status",
            "taxable_total",
            "tax_total",
            "total_amount",
            "authorized_at",
            "resolved_at",
            "closed_at",
            "authorized_by",
            "authorized_by_username",
            "resolved_by",
            "resolved_by_username",
            "closed_by",
            "closed_by_username",
            "created_at",
            "updated_at",
        ]

    def validate(self, attrs):
        attrs = super().validate(attrs)
        instance = getattr(self, "instance", None)
        if instance and instance.status in {
            ServiceDeskCaseStatus.CLOSED,
            ServiceDeskCaseStatus.CANCELLED,
        }:
            raise serializers.ValidationError("Closed or cancelled service desk cases cannot be edited.")
        return attrs

    def _branch_payload(self, obj):
        return serialize_branch(resolve_service_case_branch(obj))

    def get_branch_id(self, obj):
        return self._branch_payload(obj)["branch_id"]

    def get_branch_code(self, obj):
        return self._branch_payload(obj)["branch_code"]

    def get_branch_name(self, obj):
        return self._branch_payload(obj)["branch_name"]

    def create(self, validated_data):
        return create_service_desk_case(
            payload=validated_data,
            created_by=self.context["request"].user,
        )

    def update(self, instance, validated_data):
        return update_service_desk_case(
            case_id=instance.id,
            payload=validated_data,
            updated_by=self.context["request"].user,
        )


class ServiceDeskCaseStatusUpdateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=ServiceDeskCaseStatus.choices)
    resolution_summary = serializers.CharField(required=False, allow_blank=True)

    def save(self, **kwargs):
        case = self.context["case"]
        updated_case, _ = transition_service_desk_case_status(
            case_id=case.id,
            next_status=self.validated_data["status"],
            resolution_summary=self.validated_data.get("resolution_summary", ""),
            performed_by=self.context["request"].user,
        )
        return updated_case


class ServiceDeskCaseDeliveryActionSerializer(serializers.Serializer):
    notes = serializers.CharField(required=False, allow_blank=True)


class ServiceDeskCaseReplacementSerializer(serializers.Serializer):
    replacement_direct_sale = serializers.PrimaryKeyRelatedField(queryset=DirectSale.objects.all())

    def save(self, **kwargs):
        case = self.context["case"]
        linked_case, _ = link_replacement_direct_sale(
            case_id=case.id,
            replacement_direct_sale_id=self.validated_data["replacement_direct_sale"].id,
            performed_by=self.context["request"].user,
        )
        return linked_case


class ServiceDeskComplaintRegisterSerializer(AdminSupportRequestReadSerializer):
    branch_id = serializers.SerializerMethodField()
    branch_code = serializers.SerializerMethodField()
    branch_name = serializers.SerializerMethodField()
    linked_service_case_id = serializers.SerializerMethodField()
    linked_service_case_no = serializers.SerializerMethodField()
    linked_service_case_type = serializers.SerializerMethodField()
    linked_service_case_status = serializers.SerializerMethodField()
    linked_service_case_count = serializers.SerializerMethodField()

    class Meta(AdminSupportRequestReadSerializer.Meta):
        fields = AdminSupportRequestReadSerializer.Meta.fields + (
            "branch_id",
            "branch_code",
            "branch_name",
            "linked_service_case_id",
            "linked_service_case_no",
            "linked_service_case_type",
            "linked_service_case_status",
            "linked_service_case_count",
        )

    def _cases(self, obj):
        if hasattr(obj, "_prefetched_objects_cache") and "service_desk_cases" in obj._prefetched_objects_cache:
            return obj._prefetched_objects_cache["service_desk_cases"]
        return list(obj.service_desk_cases.all())

    def _latest_case(self, obj):
        cases = self._cases(obj)
        return cases[0] if cases else None

    def _branch_payload(self, obj):
        latest = self._latest_case(obj)
        branch = resolve_service_case_branch(latest) or resolve_support_request_branch(obj)
        return serialize_branch(branch)

    def get_branch_id(self, obj):
        return self._branch_payload(obj)["branch_id"]

    def get_branch_code(self, obj):
        return self._branch_payload(obj)["branch_code"]

    def get_branch_name(self, obj):
        return self._branch_payload(obj)["branch_name"]

    def get_linked_service_case_id(self, obj):
        latest = self._latest_case(obj)
        return getattr(latest, "id", None)

    def get_linked_service_case_no(self, obj):
        latest = self._latest_case(obj)
        return getattr(latest, "case_no", None)

    def get_linked_service_case_type(self, obj):
        latest = self._latest_case(obj)
        return getattr(latest, "case_type", None)

    def get_linked_service_case_status(self, obj):
        latest = self._latest_case(obj)
        return getattr(latest, "status", None)

    def get_linked_service_case_count(self, obj):
        return len(self._cases(obj))


class ServiceDeskActionResultSerializer(serializers.Serializer):
    service_case = ServiceDeskCaseSerializer(read_only=True)
    updated = serializers.BooleanField(read_only=True)
    delivery_updated = serializers.BooleanField(read_only=True)


def run_service_case_delivery_request(case, *, notes: str, request):
    updated_case, updated = request_service_case_delivery_return(
        case_id=case.id,
        notes=notes,
        performed_by=request.user,
    )
    return {"service_case": updated_case, "updated": updated}


def run_service_case_delivery_complete(case, *, notes: str, request):
    updated_case, updated = complete_service_case_delivery_return(
        case_id=case.id,
        notes=notes,
        performed_by=request.user,
    )
    return {"service_case": updated_case, "updated": updated}


def run_service_case_credit_note_post(case, *, request):
    updated_case, note = post_credit_note_for_service_case(
        case_id=case.id,
        performed_by=request.user,
    )
    return {"service_case": updated_case, "credit_note_id": note.id}


def run_service_case_debit_note_post(case, *, request):
    updated_case, note = post_debit_note_for_service_case(
        case_id=case.id,
        performed_by=request.user,
    )
    return {"service_case": updated_case, "debit_note_id": note.id}
