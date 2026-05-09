import django.db.models.deletion
from django.db import migrations, models


def forwards_backfill_need_fields(apps, schema_editor):
    PurchaseNeed = apps.get_model("inventory", "PurchaseNeed")
    Product = apps.get_model("subscriptions", "Product")
    for pn in PurchaseNeed.objects.all().iterator():
        updates = {}
        if not pn.need_no:
            updates["need_no"] = f"PN-{pn.pk:08d}"
        if pn.product_id and not (getattr(pn, "product_name_snapshot", "") or "").strip():
            nm = Product.objects.filter(pk=pn.product_id).values_list("name", flat=True).first()
            updates["product_name_snapshot"] = (nm or "")[:255]
        if updates:
            PurchaseNeed.objects.filter(pk=pn.pk).update(**updates)


def forwards_status_reviewed_to_in_review(apps, schema_editor):
    PurchaseNeed = apps.get_model("inventory", "PurchaseNeed")
    PurchaseNeed.objects.filter(status="REVIEWED").update(status="IN_REVIEW")


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("branch_control", "0002_seed_primary_branch_and_backfill_context"),
        ("inventory", "0013_opening_stock_entries"),
        ("subscriptions", "0061_dry_run_validation_job"),
    ]

    operations = [
        migrations.AddField(
            model_name="purchaseneed",
            name="need_no",
            field=models.CharField(blank=True, db_index=True, max_length=48, null=True, unique=True),
        ),
        migrations.AddField(
            model_name="purchaseneed",
            name="product_name_snapshot",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.AddField(
            model_name="purchaseneed",
            name="branch",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="inventory_purchase_needs",
                to="branch_control.branch",
            ),
        ),
        migrations.AddField(
            model_name="purchaseneed",
            name="fulfilled_at",
            field=models.DateTimeField(blank=True, db_index=True, null=True),
        ),
        migrations.RunPython(forwards_backfill_need_fields, noop_reverse),
        migrations.AlterField(
            model_name="purchaseneed",
            name="need_no",
            field=models.CharField(db_index=True, editable=False, max_length=48, unique=True),
        ),
        migrations.RunPython(forwards_status_reviewed_to_in_review, noop_reverse),
        migrations.AlterField(
            model_name="purchaseneed",
            name="status",
            field=models.CharField(
                choices=[
                    ("OPEN", "Open"),
                    ("IN_REVIEW", "In Review"),
                    ("ORDERED", "Ordered"),
                    ("PARTIALLY_FULFILLED", "Partially Fulfilled"),
                    ("RECEIVED", "Received"),
                    ("FULFILLED", "Fulfilled"),
                    ("CANCELLED", "Cancelled"),
                    ("CLOSED", "Closed"),
                ],
                db_index=True,
                default="OPEN",
                max_length=24,
            ),
        ),
        migrations.AlterField(
            model_name="purchaseneed",
            name="source_module",
            field=models.CharField(
                choices=[
                    ("DIRECT_SALE", "Direct Sale"),
                    ("SUBSCRIPTION", "Subscription"),
                    ("MANUAL", "Manual"),
                    ("DELIVERY", "Delivery"),
                    ("WINNER_DELIVERY", "Winner Delivery"),
                    ("SUBSCRIPTION_DEMAND", "Subscription Demand"),
                    ("GENERAL", "General"),
                ],
                db_index=True,
                default="GENERAL",
                max_length=32,
            ),
        ),
    ]
