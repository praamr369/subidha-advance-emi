from __future__ import annotations

from django.db import transaction

from catalog.models import AttributeDefinition


@transaction.atomic
def save_attribute_definition(*, definition: AttributeDefinition, validated_data: dict) -> AttributeDefinition:
    """Persist a definition after serializer/model validation without product side effects."""
    for field, value in validated_data.items():
        setattr(definition, field, value)
    definition.save()
    return definition
