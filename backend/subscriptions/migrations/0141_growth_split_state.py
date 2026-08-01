# Phase A (subscriptions split): move the growth-offer / growth-request models
# to the new `growth` app. State-only — the growth_* tables are untouched
# (see growth/migrations/0001_growth_split_state.py for the matching CreateModel
# state ops). Also repoints the ContentType rows subscriptions -> growth so no
# stale/dead content types accumulate (Phase 0 rule).
from django.db import migrations

_MOVED_MODELS = [
    "plantemplate",
    "offerpackage",
    "offerpackageline",
    "customergrowthrequest",
    "growthrequestline",
    "growthrequestdecision",
]


def repoint_contenttypes(apps, schema_editor):
    """Move the moved models' ContentTypes from subscriptions -> growth.

    Merge-aware so it is robust whether migrations run in a single ``migrate``
    invocation (no growth CT exists yet -> repoint in place, preserving the id
    and any references) or across separate invocations (Django's post_migrate
    already created a fresh growth CT -> drop the now-stale subscriptions one).

    NB for later phases: if a moved model has rows referencing its content_type
    (GenericForeignKey / audit), remap those references from the stale CT id to
    the growth CT id *before* deleting. The growth models carry no such refs.
    """
    ContentType = apps.get_model("contenttypes", "ContentType")
    for model in _MOVED_MODELS:
        old = ContentType.objects.filter(app_label="subscriptions", model=model).first()
        if old is None:
            continue
        if ContentType.objects.filter(app_label="growth", model=model).exists():
            old.delete()  # cascades any orphaned auth_permission rows
        else:
            old.app_label = "growth"
            old.save(update_fields=["app_label"])


def unrepoint_contenttypes(apps, schema_editor):
    ContentType = apps.get_model("contenttypes", "ContentType")
    ContentType.objects.filter(app_label="growth", model__in=_MOVED_MODELS).update(
        app_label="subscriptions"
    )


class Migration(migrations.Migration):

    dependencies = [
        ("subscriptions", "0140_remove_stale_moved_contenttypes"),
        ("growth", "0001_growth_split_state"),
        ("contenttypes", "0002_remove_content_type_name"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[],
            state_operations=[
                migrations.RemoveField(
                    model_name="growthrequestdecision",
                    name="growth_request",
                ),
                migrations.RemoveField(
                    model_name="growthrequestline",
                    name="growth_request",
                ),
                migrations.RemoveField(
                    model_name="growthrequestdecision",
                    name="decided_by",
                ),
                migrations.RemoveField(
                    model_name="growthrequestline",
                    name="product",
                ),
                migrations.RemoveField(
                    model_name="offerpackage",
                    name="created_by",
                ),
                migrations.RemoveField(
                    model_name="offerpackage",
                    name="plan_template",
                ),
                migrations.RemoveField(
                    model_name="offerpackage",
                    name="updated_by",
                ),
                migrations.RemoveField(
                    model_name="offerpackageline",
                    name="offer_package",
                ),
                migrations.RemoveField(
                    model_name="offerpackageline",
                    name="product",
                ),
                migrations.RemoveField(
                    model_name="plantemplate",
                    name="created_by",
                ),
                migrations.RemoveField(
                    model_name="plantemplate",
                    name="updated_by",
                ),
                migrations.DeleteModel(
                    name="CustomerGrowthRequest",
                ),
                migrations.DeleteModel(
                    name="GrowthRequestDecision",
                ),
                migrations.DeleteModel(
                    name="GrowthRequestLine",
                ),
                migrations.DeleteModel(
                    name="OfferPackage",
                ),
                migrations.DeleteModel(
                    name="OfferPackageLine",
                ),
                migrations.DeleteModel(
                    name="PlanTemplate",
                ),
            ],
        ),
        migrations.RunPython(repoint_contenttypes, unrepoint_contenttypes),
    ]
