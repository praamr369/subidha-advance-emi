from django.db import migrations, models


def _has_column(schema_editor, table_name: str, column_name: str) -> bool:
    with schema_editor.connection.cursor() as cursor:
        description = schema_editor.connection.introspection.get_table_description(cursor, table_name)
    return any(col.name == column_name for col in description)


def ensure_payment_exception_acknowledged_column(apps, schema_editor):
    table_name = "service_desk_cases"
    column_name = "payment_exception_acknowledged"
    vendor = schema_editor.connection.vendor
    with schema_editor.connection.cursor() as cursor:
        if not _has_column(schema_editor, table_name, column_name):
            cursor.execute(
                f"ALTER TABLE {table_name} "
                "ADD COLUMN payment_exception_acknowledged boolean NOT NULL DEFAULT FALSE"
            )
        elif vendor == "postgresql":
            cursor.execute(
                f"UPDATE {table_name} "
                "SET payment_exception_acknowledged = FALSE "
                "WHERE payment_exception_acknowledged IS NULL"
            )
            cursor.execute(
                f"ALTER TABLE {table_name} "
                "ALTER COLUMN payment_exception_acknowledged SET DEFAULT FALSE"
            )
            cursor.execute(
                f"ALTER TABLE {table_name} "
                "ALTER COLUMN payment_exception_acknowledged SET NOT NULL"
            )
        # On SQLite the column already exists as NOT NULL DEFAULT FALSE from
        # the model definition — no ALTER COLUMN support needed.
        if vendor == "postgresql":
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS service_desk_cases_payment_exception_acknowledged_idx "
                f"ON {table_name} (payment_exception_acknowledged)"
            )
        else:
            # SQLite CREATE INDEX IF NOT EXISTS is supported — use it
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS service_desk_cases_payment_exception_acknowledged_idx "
                f"ON {table_name} (payment_exception_acknowledged)"
            )


def noop_reverse(apps, schema_editor):
    return


class Migration(migrations.Migration):
    dependencies = [
        ("service_desk", "0005_repair_payment_exception_approved_column"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunPython(
                    ensure_payment_exception_acknowledged_column,
                    reverse_code=noop_reverse,
                ),
            ],
            state_operations=[
                migrations.AddField(
                    model_name="servicedeskcase",
                    name="payment_exception_acknowledged",
                    field=models.BooleanField(db_index=True, default=False),
                ),
            ],
        ),
    ]
