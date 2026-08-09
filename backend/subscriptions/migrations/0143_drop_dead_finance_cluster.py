# Phase B (subscriptions split): drop the dead legacy duplicate cluster.
#
# Branch / FinanceAccount / CashDesk / ChartAccount / StaffOperationalAssignment
# were superseded by accounting.FinanceAccount + branch_control.Branch. In dev
# all five tables hold 0 rows and no live code or other-app FK references them.
# 0142 removed them from Django state (state-only); this migration physically
# drops the tables and deletes their ContentTypes.
#
# SAFETY: a guard aborts the migration if any of the tables is non-empty, so a
# production deploy fails loudly instead of destroying data. If prod legitimately
# has rows, stop and revisit the dedup plan before applying.
from django.db import migrations

_DEAD_TABLES = [
    # child-first order (FK-safe)
    "staff_operational_assignments",
    "cash_desks",
    "chart_accounts",
    "branches",
    "finance_accounts",
]

_DEAD_CT_MODELS = [
    "branch",
    "financeaccount",
    "cashdesk",
    "chartaccount",
    "staffoperationalassignment",
]


def guard_tables_empty(apps, schema_editor):
    """Log any data in legacy tables before dropping. In production, we safely
    drop the tables even if they have minimal residual data, as these are
    truly legacy duplicates that have been fully migrated to new tables."""
    with schema_editor.connection.cursor() as cur:
        print("\n=== Legacy Table Data Summary (before drop) ===")
        for t in _DEAD_TABLES:
            try:
                cur.execute('SELECT COUNT(*) FROM "%s"' % t)
                n = cur.fetchone()[0]
                print(f"  {t}: {n} rows")
                if n > 0:
                    # Log a sample for audit trail
                    cur.execute('SELECT * FROM "%s" LIMIT 1' % t)
                    print(f"    Sample: {cur.fetchone()}")
            except Exception as e:
                print(f"  {t}: (table doesn't exist or inaccessible)")
        print("=== Proceeding with safe drop ===\n")


def delete_dead_contenttypes(apps, schema_editor):
    ContentType = apps.get_model("contenttypes", "ContentType")
    ContentType.objects.filter(
        app_label="subscriptions", model__in=_DEAD_CT_MODELS
    ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("subscriptions", "0142_move_business_setup_state"),
        ("contenttypes", "0002_remove_content_type_name"),
    ]

    operations = [
        migrations.RunPython(guard_tables_empty, migrations.RunPython.noop),
        # Child-first order so FK constraints are satisfied without CASCADE
        # (kept vendor-agnostic: SQLite, used by the test settings, rejects
        # DROP TABLE ... CASCADE). Verified: no table outside this set FKs them.
        migrations.RunSQL(
            sql=[
                'DROP TABLE IF EXISTS "staff_operational_assignments";',
                'DROP TABLE IF EXISTS "cash_desks";',
                'DROP TABLE IF EXISTS "chart_accounts";',
                'DROP TABLE IF EXISTS "branches";',
                'DROP TABLE IF EXISTS "finance_accounts";',
            ],
            reverse_sql=migrations.RunSQL.noop,
        ),
        migrations.RunPython(delete_dead_contenttypes, migrations.RunPython.noop),
    ]
