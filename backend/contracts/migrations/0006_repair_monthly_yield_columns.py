"""Repair columns that may be missing when 0005 was recorded on a stale DB endpoint.

The production service uses PgBouncer.  A previous manual migration was run
against the direct PostgreSQL endpoint, leaving the production schema behind
while Django recorded contracts.0005 as applied.  This migration is
idempotent so healthy environments remain unchanged.
"""

from django.db import migrations


def add_missing_yield_columns(apps, schema_editor):
    connection = schema_editor.connection
    existing_tables = set(connection.introspection.table_names())

    for model_name, table_name in (
        ("RentSubscriptionProfile", "rent_subscription_profiles"),
        ("LeaseSubscriptionProfile", "lease_subscription_profiles"),
    ):
        if table_name not in existing_tables:
            continue
        model = apps.get_model("contracts", model_name)
        columns = {
            column.name
            for column in connection.introspection.get_table_description(
                connection.cursor(), table_name
            )
        }
        if "monthly_yield_percent" not in columns:
            schema_editor.add_field(
                model, model._meta.get_field("monthly_yield_percent")
            )


class Migration(migrations.Migration):
    dependencies = [("contracts", "0005_leasesubscriptionprofile_monthly_yield_percent_and_more")]

    operations = [
        migrations.RunPython(add_missing_yield_columns, migrations.RunPython.noop),
    ]
