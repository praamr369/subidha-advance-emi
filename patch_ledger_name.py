import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings.development')
django.setup()

file_path = "backend/inventory/services/stock_ledger_service.py"
with open(file_path, "r") as f:
    content = f.read()

helper = """
def _get_full_product_name(product) -> str:
    if not product: return ""
    name = product.name
    if hasattr(product, "pim_variant") and product.pim_variant:
        attrs = []
        for attr_val in product.pim_variant.attribute_values.all():
            if attr_val.attribute.data_type == "BOOLEAN":
                val = "Yes" if attr_val.value_boolean else "No"
            elif attr_val.attribute.data_type in ("NUMBER", "DECIMAL"):
                val = float(attr_val.value_number) if attr_val.value_number is not None else None
            else:
                val = attr_val.value_text
            if val:
                attrs.append(str(val))
        if attrs:
            return f"{name} ({', '.join(attrs)})"
    return name
"""

if "_get_full_product_name" not in content:
    content = content.replace("from inventory.models import (", helper + "\nfrom inventory.models import (")
    content = content.replace("product.name if product else", "_get_full_product_name(product) if product else")

with open(file_path, "w") as f:
    f.write(content)
