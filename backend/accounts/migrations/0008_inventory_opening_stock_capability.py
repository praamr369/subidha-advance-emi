from django.db import migrations


def forwards(apps, schema_editor):
    Capability = apps.get_model("accounts", "Capability")
    Capability.objects.update_or_create(
        code="inventory.opening_stock",
        defaults={
            "label": "Inventory opening stock",
            "description": "Manage draft/post opening stock workflow and CSV imports.",
            "is_active": True,
        },
    )


def backwards(apps, schema_editor):
    Capability = apps.get_model("accounts", "Capability")
    Capability.objects.filter(code="inventory.opening_stock").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0007_capability_matrix"),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
