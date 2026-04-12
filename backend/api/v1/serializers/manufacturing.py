from __future__ import annotations

from rest_framework import serializers

from manufacturing.models import (
    ManufacturingBom,
    ManufacturingBomLine,
    ManufacturingBomStatus,
    ProductionJob,
    ProductionMaterialIssueLine,
    ProductionReceiptLine,
    ProductionScrapLine,
)
from manufacturing.services.production_service import (
    activate_manufacturing_bom,
    cancel_production_job,
    complete_production_job,
    deactivate_manufacturing_bom,
    post_production_materials,
    post_production_output,
    release_production_job,
    upsert_manufacturing_bom_draft,
    upsert_production_job_draft,
)


class ManufacturingEmptyActionSerializer(serializers.Serializer):
    pass


class ManufacturingBomLineSerializer(serializers.ModelSerializer):
    inventory_item_sku = serializers.CharField(source="inventory_item.sku", read_only=True)
    inventory_item_product_name = serializers.CharField(source="inventory_item.product.name", read_only=True)

    class Meta:
        model = ManufacturingBomLine
        fields = [
            "id",
            "inventory_item",
            "inventory_item_sku",
            "inventory_item_product_name",
            "quantity_per_unit",
            "wastage_percent",
            "sort_order",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class ManufacturingBomSerializer(serializers.ModelSerializer):
    finished_good_sku = serializers.CharField(source="finished_good_inventory_item.sku", read_only=True)
    finished_good_product_name = serializers.CharField(
        source="finished_good_inventory_item.product.name",
        read_only=True,
    )
    activated_by_username = serializers.CharField(source="activated_by.username", read_only=True)
    lines = ManufacturingBomLineSerializer(many=True, required=False)

    class Meta:
        model = ManufacturingBom
        fields = [
            "id",
            "bom_no",
            "finished_good_inventory_item",
            "finished_good_sku",
            "finished_good_product_name",
            "revision_no",
            "status",
            "is_default",
            "effective_from",
            "effective_to",
            "notes",
            "activated_at",
            "activated_by",
            "activated_by_username",
            "lines",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "bom_no",
            "status",
            "activated_at",
            "activated_by",
            "activated_by_username",
            "created_at",
            "updated_at",
        ]

    def validate(self, attrs):
        attrs = super().validate(attrs)
        instance = getattr(self, "instance", None)
        if instance and instance.status == ManufacturingBomStatus.ACTIVE:
            raise serializers.ValidationError("Active BOMs cannot be edited directly.")
        if instance is None and not attrs.get("lines"):
            raise serializers.ValidationError({"lines": "At least one BOM line is required."})
        return attrs

    def create(self, validated_data):
        lines = validated_data.pop("lines", [])
        return upsert_manufacturing_bom_draft(
            payload={**validated_data, "lines": lines},
            performed_by=getattr(self.context.get("request"), "user", None),
        )

    def update(self, instance, validated_data):
        lines = validated_data.pop("lines", None)
        payload = dict(validated_data)
        if lines is not None:
            payload["lines"] = lines
        return upsert_manufacturing_bom_draft(
            payload=payload,
            bom_id=instance.id,
            performed_by=getattr(self.context.get("request"), "user", None),
        )


class ProductionMaterialIssueLineSerializer(serializers.ModelSerializer):
    description = serializers.CharField(required=False, allow_blank=True)
    inventory_item_sku = serializers.CharField(source="inventory_item.sku", read_only=True)
    inventory_item_product_name = serializers.CharField(source="inventory_item.product.name", read_only=True)
    posted_by_username = serializers.CharField(source="posted_by.username", read_only=True)

    class Meta:
        model = ProductionMaterialIssueLine
        fields = [
            "id",
            "bom_line",
            "inventory_item",
            "inventory_item_sku",
            "inventory_item_product_name",
            "entry_kind",
            "description",
            "planned_quantity",
            "quantity",
            "unit_cost_snapshot",
            "line_total_cost",
            "notes",
            "is_posted",
            "posted_at",
            "posted_by",
            "posted_by_username",
            "posted_journal_entry",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "is_posted",
            "posted_at",
            "posted_by",
            "posted_by_username",
            "posted_journal_entry",
            "created_at",
            "updated_at",
        ]


class ProductionReceiptLineSerializer(serializers.ModelSerializer):
    inventory_item_sku = serializers.CharField(source="inventory_item.sku", read_only=True)
    inventory_item_product_name = serializers.CharField(source="inventory_item.product.name", read_only=True)
    posted_by_username = serializers.CharField(source="posted_by.username", read_only=True)

    class Meta:
        model = ProductionReceiptLine
        fields = [
            "id",
            "inventory_item",
            "inventory_item_sku",
            "inventory_item_product_name",
            "description",
            "quantity",
            "unit_cost_snapshot",
            "line_total_cost",
            "notes",
            "is_posted",
            "posted_at",
            "posted_by",
            "posted_by_username",
            "posted_journal_entry",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class ProductionScrapLineSerializer(serializers.ModelSerializer):
    inventory_item_sku = serializers.CharField(source="inventory_item.sku", read_only=True)
    inventory_item_product_name = serializers.CharField(source="inventory_item.product.name", read_only=True)
    posted_by_username = serializers.CharField(source="posted_by.username", read_only=True)

    class Meta:
        model = ProductionScrapLine
        fields = [
            "id",
            "inventory_item",
            "inventory_item_sku",
            "inventory_item_product_name",
            "description",
            "quantity",
            "unit_cost_snapshot",
            "line_total_cost",
            "reason",
            "notes",
            "is_posted",
            "posted_at",
            "posted_by",
            "posted_by_username",
            "posted_journal_entry",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class ProductionJobSerializer(serializers.ModelSerializer):
    finished_good_sku = serializers.CharField(source="finished_good_inventory_item.sku", read_only=True)
    finished_good_product_name = serializers.CharField(
        source="finished_good_inventory_item.product.name",
        read_only=True,
    )
    stock_location_code = serializers.CharField(source="stock_location.code", read_only=True)
    stock_location_name = serializers.CharField(source="stock_location.name", read_only=True)
    bom_no = serializers.CharField(source="bom.bom_no", read_only=True)
    created_by_username = serializers.CharField(source="created_by.username", read_only=True)
    released_by_username = serializers.CharField(source="released_by.username", read_only=True)
    completed_by_username = serializers.CharField(source="completed_by.username", read_only=True)
    cancelled_by_username = serializers.CharField(source="cancelled_by.username", read_only=True)
    material_issue_lines = ProductionMaterialIssueLineSerializer(many=True, required=False)
    receipt_lines = ProductionReceiptLineSerializer(many=True, read_only=True)
    scrap_lines = ProductionScrapLineSerializer(many=True, read_only=True)

    class Meta:
        model = ProductionJob
        fields = [
            "id",
            "job_no",
            "job_date",
            "status",
            "bom",
            "bom_no",
            "finished_good_inventory_item",
            "finished_good_sku",
            "finished_good_product_name",
            "stock_location",
            "stock_location_code",
            "stock_location_name",
            "planned_output_qty",
            "completed_output_qty",
            "total_issued_cost",
            "total_received_cost",
            "total_scrap_cost",
            "wip_cost",
            "costing_status",
            "accounting_status",
            "notes",
            "posting_notes",
            "created_by",
            "created_by_username",
            "released_by",
            "released_by_username",
            "released_at",
            "started_at",
            "completed_by",
            "completed_by_username",
            "completed_at",
            "cancelled_by",
            "cancelled_by_username",
            "cancelled_at",
            "cancel_reason",
            "material_issue_lines",
            "receipt_lines",
            "scrap_lines",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "job_no",
            "status",
            "completed_output_qty",
            "total_issued_cost",
            "total_received_cost",
            "total_scrap_cost",
            "wip_cost",
            "costing_status",
            "accounting_status",
            "posting_notes",
            "created_by",
            "created_by_username",
            "released_by",
            "released_by_username",
            "released_at",
            "started_at",
            "completed_by",
            "completed_by_username",
            "completed_at",
            "cancelled_by",
            "cancelled_by_username",
            "cancelled_at",
            "cancel_reason",
            "receipt_lines",
            "scrap_lines",
            "created_at",
            "updated_at",
        ]

    def create(self, validated_data):
        material_issue_lines = validated_data.pop("material_issue_lines", None)
        payload = dict(validated_data)
        if material_issue_lines is not None:
            payload["material_issue_lines"] = material_issue_lines
        return upsert_production_job_draft(
            payload=payload,
            performed_by=getattr(self.context.get("request"), "user", None),
        )

    def update(self, instance, validated_data):
        material_issue_lines = validated_data.pop("material_issue_lines", None)
        payload = dict(validated_data)
        if material_issue_lines is not None:
            payload["material_issue_lines"] = material_issue_lines
        return upsert_production_job_draft(
            payload=payload,
            job_id=instance.id,
            performed_by=getattr(self.context.get("request"), "user", None),
        )


class ProductionMaterialBatchLineInputSerializer(serializers.Serializer):
    bom_line = serializers.PrimaryKeyRelatedField(queryset=ManufacturingBomLine.objects.all(), required=False, allow_null=True)
    inventory_item = serializers.PrimaryKeyRelatedField(queryset=ProductionMaterialIssueLine._meta.get_field("inventory_item").remote_field.model.objects.all())
    entry_kind = serializers.ChoiceField(
        choices=ProductionMaterialIssueLine._meta.get_field("entry_kind").choices,
        required=False,
    )
    description = serializers.CharField(required=False, allow_blank=True)
    planned_quantity = serializers.DecimalField(max_digits=12, decimal_places=3, required=False)
    quantity = serializers.DecimalField(max_digits=12, decimal_places=3)
    unit_cost_snapshot = serializers.DecimalField(max_digits=12, decimal_places=4, required=False)
    line_total_cost = serializers.DecimalField(max_digits=12, decimal_places=2, required=False)
    notes = serializers.CharField(required=False, allow_blank=True)


class ProductionReceiptBatchLineInputSerializer(serializers.Serializer):
    inventory_item = serializers.PrimaryKeyRelatedField(
        queryset=ProductionReceiptLine._meta.get_field("inventory_item").remote_field.model.objects.all(),
        required=False,
        allow_null=True,
    )
    description = serializers.CharField(required=False, allow_blank=True)
    quantity = serializers.DecimalField(max_digits=12, decimal_places=3)
    unit_cost_snapshot = serializers.DecimalField(max_digits=12, decimal_places=4, required=False)
    line_total_cost = serializers.DecimalField(max_digits=12, decimal_places=2, required=False)
    notes = serializers.CharField(required=False, allow_blank=True)


class ProductionScrapBatchLineInputSerializer(serializers.Serializer):
    inventory_item = serializers.PrimaryKeyRelatedField(
        queryset=ProductionScrapLine._meta.get_field("inventory_item").remote_field.model.objects.all(),
        required=False,
        allow_null=True,
    )
    description = serializers.CharField(required=False, allow_blank=True)
    quantity = serializers.DecimalField(max_digits=12, decimal_places=3)
    unit_cost_snapshot = serializers.DecimalField(max_digits=12, decimal_places=4, required=False)
    line_total_cost = serializers.DecimalField(max_digits=12, decimal_places=2, required=False)
    reason = serializers.CharField(required=False, allow_blank=True)
    notes = serializers.CharField(required=False, allow_blank=True)


class ProductionMaterialPostSerializer(serializers.Serializer):
    movement_date = serializers.DateField(required=False)
    lines = ProductionMaterialBatchLineInputSerializer(many=True, required=False)

    def save(self, **kwargs):
        job = self.context["job"]
        updated_job, _ = post_production_materials(
            job_id=job.id,
            movement_date=self.validated_data.get("movement_date"),
            lines=self.validated_data.get("lines"),
            performed_by=self.context["request"].user,
        )
        return updated_job


class ProductionOutputPostSerializer(serializers.Serializer):
    output_date = serializers.DateField(required=False)
    receipt_lines = ProductionReceiptBatchLineInputSerializer(many=True, required=False)
    scrap_lines = ProductionScrapBatchLineInputSerializer(many=True, required=False)

    def save(self, **kwargs):
        job = self.context["job"]
        updated_job, _ = post_production_output(
            job_id=job.id,
            output_date=self.validated_data.get("output_date"),
            receipt_lines=self.validated_data.get("receipt_lines"),
            scrap_lines=self.validated_data.get("scrap_lines"),
            performed_by=self.context["request"].user,
        )
        return updated_job


class ProductionCancelSerializer(serializers.Serializer):
    reason = serializers.CharField()

    def save(self, **kwargs):
        job = self.context["job"]
        updated_job, _ = cancel_production_job(
            job_id=job.id,
            reason=self.validated_data["reason"],
            performed_by=self.context["request"].user,
        )
        return updated_job


def run_bom_activate(*, bom, request):
    updated_bom, updated = activate_manufacturing_bom(bom_id=bom.id, performed_by=request.user)
    return {"bom": updated_bom, "updated": updated}


def run_bom_deactivate(*, bom, request):
    updated_bom, updated = deactivate_manufacturing_bom(bom_id=bom.id, performed_by=request.user)
    return {"bom": updated_bom, "updated": updated}


def run_job_release(*, job, request):
    updated_job, updated = release_production_job(job_id=job.id, performed_by=request.user)
    return {"job": updated_job, "updated": updated}


def run_job_complete(*, job, request):
    updated_job, updated = complete_production_job(job_id=job.id, performed_by=request.user)
    return {"job": updated_job, "updated": updated}
