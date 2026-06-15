from django.db import migrations


def _align_customer_advance_refund_updated_at(apps, schema_editor):
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
        # SQLite does not support ADD COLUMN IF NOT EXISTS. The column is
        # already defined by the ORM model (auto_now=True on updated_at),
        # so this migration is a no-op on SQLite — the column exists from
        # the initial CREATE TABLE.
        pass
    else:
        raise RuntimeError(
            f"subscriptions.0085 does not support database vendor '{vendor}'."
        )


class Migration(migrations.Migration):

    dependencies = [
        ("subscriptions", "0084_customer_advance_refund_source_contract"),
    ]

    operations = [
        migrations.RunPython(
            _align_customer_advance_refund_updated_at,
            reverse_code=migrations.RunPython.noop,
        ),
    ]