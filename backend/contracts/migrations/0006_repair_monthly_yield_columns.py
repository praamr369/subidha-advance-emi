"""Repair columns that may be missing when 0005 was recorded on a stale DB endpoint.

The production service uses PgBouncer.  A previous manual migration was run
against the direct PostgreSQL endpoint, leaving the production schema behind
while Django recorded contracts.0005 as applied.  This migration is
idempotent so healthy environments remain unchanged.
"""

from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [("contracts", "0005_leasesubscriptionprofile_monthly_yield_percent_and_more")]

    operations = [
        migrations.RunSQL(
            sql=(
                "ALTER TABLE rent_subscription_profiles "
                "ADD COLUMN IF NOT EXISTS monthly_yield_percent numeric(5, 2) "
                "NOT NULL DEFAULT 5.00;"
            ),
            reverse_sql=migrations.RunSQL.noop,
        ),
        migrations.RunSQL(
            sql=(
                "ALTER TABLE lease_subscription_profiles "
                "ADD COLUMN IF NOT EXISTS monthly_yield_percent numeric(5, 2) "
                "NOT NULL DEFAULT 5.00;"
            ),
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
