from rest_framework import serializers

from catalog.models import AttributeDefinition, AttributeInputType, CatalogCategory
from catalog.services.attribute_definition_service import save_attribute_definition
from catalog.services.category_service import save_category


class CatalogCategorySerializer(serializers.ModelSerializer):
    children_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = CatalogCategory
        fields = ["id", "name", "slug", "parent", "path", "is_active", "sort_order", "children_count", "created_at", "updated_at"]
        read_only_fields = ["id", "path", "children_count", "created_at", "updated_at"]
        extra_kwargs = {"slug": {"required": False}}

    def create(self, validated_data):
        return save_category(category=CatalogCategory(), validated_data=validated_data)

    def update(self, instance, validated_data):
        return save_category(category=instance, validated_data=validated_data)


class AttributeDefinitionSerializer(serializers.ModelSerializer):
    class Meta:
        model = AttributeDefinition
        fields = [
            "id", "category", "name", "code", "input_type", "options", "unit",
            "is_variant_attribute", "is_spec_attribute", "is_required", "sort_order",
            "min_value", "max_value", "sku_code_map", "is_active", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate(self, attrs):
        input_type = attrs.get("input_type", getattr(self.instance, "input_type", None))
        options = attrs.get("options", getattr(self.instance, "options", []))
        sku_code_map = attrs.get("sku_code_map", getattr(self.instance, "sku_code_map", {}))
        if input_type in {AttributeInputType.SELECT, AttributeInputType.MULTI_SELECT} and not options:
            raise serializers.ValidationError({"options": "Select attributes require at least one option."})
        if not isinstance(options, list) or any(not isinstance(value, str) or not value.strip() for value in options):
            raise serializers.ValidationError({"options": "Options must be an array of non-empty strings."})
        if len({value.strip() for value in options}) != len(options):
            raise serializers.ValidationError({"options": "Options must not contain duplicates."})
        if not isinstance(sku_code_map, dict) or any(not isinstance(key, str) or not isinstance(value, str) or not value.strip() for key, value in sku_code_map.items()):
            raise serializers.ValidationError({"sku_code_map": "SKU code map must map strings to non-empty codes."})
        if input_type not in {AttributeInputType.SELECT, AttributeInputType.MULTI_SELECT} and sku_code_map:
            raise serializers.ValidationError({"sku_code_map": "SKU code mapping is supported only for select attributes."})
        if any(key not in options for key in sku_code_map):
            raise serializers.ValidationError({"sku_code_map": "SKU code map keys must match configured options."})
        return attrs

    def create(self, validated_data):
        return save_attribute_definition(definition=AttributeDefinition(), validated_data=validated_data)

    def update(self, instance, validated_data):
        return save_attribute_definition(definition=instance, validated_data=validated_data)
