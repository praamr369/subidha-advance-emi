# Create the physical tables for LuckyDrawBatch / LuckyIDDraw.
#
# lucky_plan/0001 declared these models state-only (SeparateDatabaseAndState,
# db_table pinned to subscriptions_luckydrawbatch / subscriptions_luckyiddraw),
# assuming an original subscriptions migration had created the tables. It never
# did — the CREATE was lost in the split, so both tables are absent from every
# database and any query raised "no such table". This builds them from the
# current model state. Idempotent: skips a table that already exists.
from django.db import migrations


# LuckyDrawBatch first (LuckyIDDraw.batch references it).
_MODELS_IN_ORDER = ["LuckyDrawBatch", "LuckyIDDraw"]


def create_missing_tables(apps, schema_editor):
    existing = set(schema_editor.connection.introspection.table_names())
    for name in _MODELS_IN_ORDER:
        model = apps.get_model("lucky_plan", name)
        if model._meta.db_table not in existing:
            schema_editor.create_model(model)


def drop_tables(apps, schema_editor):
    for name in reversed(_MODELS_IN_ORDER):
        model = apps.get_model("lucky_plan", name)
        schema_editor.delete_model(model)


class Migration(migrations.Migration):

    dependencies = [
        ("lucky_plan", "0002_initial"),
        # LuckyIDDraw FKs customers.Customer; ensure that table exists first.
        ("customers", "0005_pin_partner_kyc_request_table"),
    ]

    operations = [
        migrations.RunPython(create_missing_tables, drop_tables),
    ]
