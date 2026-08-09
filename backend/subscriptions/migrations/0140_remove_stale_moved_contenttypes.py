"""Phase 0 (subscriptions split): remove stale ContentTypes left behind by the
state-only model moves (contracts/payments/customers/deliveries/commissions/
lucky_plan/crm).

Migration 0139 removed 72 models from the `subscriptions` app *state* while
keeping their tables (pinned via db_table in the new apps). Django never prunes
the old `django_content_type` rows, so 72 dead CTs (model_class() is None) and
their ~288 auto-created `auth_permission` rows were orphaned. Audit confirmed:
no GenericForeignKey / audit-log / admin-log rows and no group permission grants
reference them, so deletion is safe. This is data-only: no DDL, schema invariant
unchanged.
"""
from django.db import migrations


def remove_stale_subscription_contenttypes(apps, schema_editor):
    ContentType = apps.get_model("contenttypes", "ContentType")
    live = {m._meta.model_name for m in apps.get_app_config("subscriptions").get_models()}
    stale = ContentType.objects.filter(app_label="subscriptions").exclude(model__in=live)
    # .delete() cascades the orphaned auth_permission rows.
    stale.delete()


class Migration(migrations.Migration):

    dependencies = [
        ("subscriptions", "0139_remove_address_customer_and_more"),
        ("contenttypes", "0002_remove_content_type_name"),
    ]

    operations = [
        migrations.RunPython(
            remove_stale_subscription_contenttypes,
            migrations.RunPython.noop,
        ),
    ]
