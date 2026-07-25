from __future__ import annotations

from decimal import Decimal, InvalidOperation

from django.core.exceptions import ValidationError

from catalog.models import AttributeDefinition, AttributeInputType, CatalogCategory


def validate_product_base_specs(*, category: CatalogCategory | None, values: object) -> dict:
    """Validate product-level specification values against active PIM definitions.

    Variant-only attributes deliberately remain outside this product-master slice;
    their values belong to the forthcoming ProductVariant model.
    """
    if not isinstance(values, dict):
        raise ValidationError({"base_specs": "Base specifications must be a JSON object."})
    if category is None:
        # The catalog.CatalogCategory spec system is legacy and unused (0 rows) —
        # structured product attributes now live in products_pim (the product's
        # linked PIM record and its attribute editor). When no catalog category is
        # set, treat product base_specs as a free-form JSON blob instead of
        # blocking the save on a dead category table.
        return values

    definitions = {
        definition.code: definition
        for definition in AttributeDefinition.objects.filter(category=category, is_active=True, is_spec_attribute=True)
    }
    errors: dict[str, str] = {}
    for code, definition in definitions.items():
        value = values.get(code)
        if definition.is_required and value in (None, "", []):
            errors[code] = f"{definition.name} is required."
            continue
        if value in (None, "", []):
            continue
        if definition.input_type == AttributeInputType.SELECT and (not isinstance(value, str) or value not in definition.options):
            errors[code] = f"{definition.name} must be one of the configured options."
        elif definition.input_type == AttributeInputType.MULTI_SELECT and (
            not isinstance(value, list) or not value or any(not isinstance(item, str) or item not in definition.options for item in value)
        ):
            errors[code] = f"{definition.name} must contain configured options only."
        elif definition.input_type == AttributeInputType.NUMBER:
            try:
                number = Decimal(str(value))
                if definition.min_value is not None and number < definition.min_value:
                    errors[code] = f"{definition.name} must be at least {definition.min_value}."
                elif definition.max_value is not None and number > definition.max_value:
                    errors[code] = f"{definition.name} must be at most {definition.max_value}."
            except (InvalidOperation, ValueError):
                errors[code] = f"{definition.name} must be a number."
        elif definition.input_type == AttributeInputType.TEXT and not isinstance(value, str):
            errors[code] = f"{definition.name} must be text."
        elif definition.input_type == AttributeInputType.BOOLEAN and not isinstance(value, bool):
            errors[code] = f"{definition.name} must be true or false."

    unknown = set(values) - set(definitions)
    if unknown:
        errors["base_specs"] = "Unknown or variant-only attributes: " + ", ".join(sorted(unknown)) + "."
    if errors:
        raise ValidationError({"base_specs": errors})
    return values
