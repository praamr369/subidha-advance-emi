import sys

with open('backend/catalog/serializers.py', 'r') as f:
    content = f.read()

content = content.replace(
    '        fields = ["id", "name", "slug", "parent", "path", "is_active", "sort_order", "children_count", "created_at", "updated_at"]',
    '        fields = ["id", "name", "slug", "parent", "path", "is_active", "sort_order", "google_taxonomy_id", "children_count", "created_at", "updated_at"]'
)

content = content.replace(
    '            "min_value", "max_value", "sku_code_map", "is_active", "created_at", "updated_at",',
    '            "min_value", "max_value", "regex_validation", "sku_code_map", "is_active", "created_at", "updated_at",'
)

with open('backend/catalog/serializers.py', 'w') as f:
    f.write(content)
