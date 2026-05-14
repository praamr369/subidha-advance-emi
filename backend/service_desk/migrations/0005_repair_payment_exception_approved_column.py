from django.db import migrations


def _has_column(schema_editor, table_name: str, column_name: str) -> bool:
    with schema_editor.connection.cursor() as cursor:
        description = schema_editor.connection.introspection.get_table_description(cursor, table_name)
    return any(col.name == column_name for col in description)


def ensure_payment_exception_approved_column(apps, schema_editor):
    table_name = "service_desk_cases"
    column_name = "payment_exception_approved"
    if _has_column(schema_editor, table_name, column_name):
        return

    with schema_editor.connection.cursor() as cursor:
        cursor.execute(
            f"ALTER TABLE {table_name} "
            "ADD COLUMN payment_exception_approved boolean NOT NULL DEFAULT FALSE"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS service_desk_cases_payment_exception_approved_idx "
            f"ON {table_name} (payment_exception_approved)"
        )


def backfill_payment_exception_approved_from_timestamp(apps, schema_editor):
    ServiceDeskCase = apps.get_model("service_desk", "ServiceDeskCase")
    ServiceDeskCase.objects.filter(
        payment_exception_approved=False,
        payment_exception_approved_at__isnull=False,
    ).update(payment_exception_approved=True)


def noop_reverse(apps, schema_editor):
    return


class Migration(migrations.Migration):
    dependencies = [
        ("service_desk", "0004_servicedeskcase_payment_exception_fields"),
    ]

    operations = [
        migrations.RunPython(ensure_payment_exception_approved_column, reverse_code=noop_reverse),
        migrations.RunPython(backfill_payment_exception_approved_from_timestamp, reverse_code=noop_reverse),
    ]
