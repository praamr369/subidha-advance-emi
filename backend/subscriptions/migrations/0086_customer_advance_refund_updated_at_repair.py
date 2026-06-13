from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("subscriptions", "0085_customer_advance_refund_db_alignment"),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
            ALTER TABLE customer_advance_refunds
            ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone;

            UPDATE customer_advance_refunds
            SET updated_at = COALESCE(updated_at, created_at, NOW())
            WHERE updated_at IS NULL;

            ALTER TABLE customer_advance_refunds
            ALTER COLUMN updated_at SET NOT NULL;
            """,
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]