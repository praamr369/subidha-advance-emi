from django.db import migrations


def _repair_customer_advance_refund_updated_at(apps, schema_editor):
    vendor = schema_editor.connection.vendor
    if vendor == "postgresql":
        schema_editor.execute("""
            ALTER TABLE customer_advance_refunds
            ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone;

            UPDATE customer_advance_refunds
            SET updated_at = COALESCE(updated_at, created_at, NOW())
            WHERE updated_at IS NULL;

            ALTER TABLE customer_advance_refunds
            ALTER COLUMN updated_at SET NOT NULL;
        """)
    elif vendor == "sqlite":
        # SQLite: updated_at is already part of the ORM model (auto_now=True).
        # The column exists from the initial CREATE TABLE — this repair is a no-op.
        pass
    else:
        raise RuntimeError(
            f"subscriptions.0086 does not support database vendor '{vendor}'."
        )


class Migration(migrations.Migration):

    dependencies = [
        ("subscriptions", "0085_customer_advance_refund_db_alignment"),
    ]

    operations = [
        migrations.RunPython(
            _repair_customer_advance_refund_updated_at,
            reverse_code=migrations.RunPython.noop,
        ),
    ]