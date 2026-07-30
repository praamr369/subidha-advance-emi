from rest_framework import serializers
from subscriptions.models_workbench import WorkbenchItem, WorkbenchAction


class WorkbenchActionSerializer(serializers.ModelSerializer):
    performed_by_name = serializers.CharField(source="performed_by.get_full_name", read_only=True)

    class Meta:
        model = WorkbenchAction
        fields = [
            "id",
            "action_type",
            "performed_by",
            "performed_by_name",
            "notes",
            "result_data",
            "created_at",
        ]
        read_only_fields = ["id", "created_at", "performed_by", "performed_by_name"]


class WorkbenchItemSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    product_name = serializers.CharField(source="product.name", read_only=True)
    batch_display = serializers.CharField(source="batch.name", read_only=True, required=False)
    assigned_to_name = serializers.CharField(source="assigned_to.get_full_name", read_only=True, allow_null=True)
    actions = WorkbenchActionSerializer(many=True, read_only=True)

    class Meta:
        model = WorkbenchItem
        fields = [
            "id",
            "module",
            "status",
            "customer",
            "customer_name",
            "product",
            "product_name",
            "batch",
            "batch_display",
            "title",
            "description",
            "request_data",
            "assigned_to",
            "assigned_to_name",
            "assigned_at",
            "priority",
            "due_date",
            "created_at",
            "updated_at",
            "completed_at",
            "actions",
        ]
        read_only_fields = [
            "id",
            "created_at",
            "updated_at",
            "completed_at",
            "assigned_at",
        ]
