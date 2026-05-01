from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("subscriptions", "0060_alter_auditlog_action_type"),
        ("inventory", "0009_purchaseorder_goodsreceipt_purchaseorderline_and_more"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="purchaseneed",
            name="customer",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="inventory_purchase_needs",
                to="subscriptions.customer",
            ),
        ),
        migrations.AddField(
            model_name="purchaseneed",
            name="priority",
            field=models.CharField(
                choices=[("LOW", "Low"), ("MEDIUM", "Medium"), ("HIGH", "High"), ("URGENT", "Urgent")],
                db_index=True,
                default="MEDIUM",
                max_length=12,
            ),
        ),
        migrations.AddField(
            model_name="purchaseneed",
            name="source_module",
            field=models.CharField(
                choices=[
                    ("DIRECT_SALE", "Direct Sale"),
                    ("WINNER_DELIVERY", "Winner Delivery"),
                    ("SUBSCRIPTION_DEMAND", "Subscription Demand"),
                    ("GENERAL", "General"),
                ],
                db_index=True,
                default="GENERAL",
                max_length=32,
            ),
        ),
        migrations.AddField(
            model_name="purchaseneed",
            name="source_object_id",
            field=models.CharField(blank=True, db_index=True, default="", max_length=120),
        ),
        migrations.AlterField(
            model_name="purchaseneed",
            name="status",
            field=models.CharField(
                choices=[
                    ("OPEN", "Open"),
                    ("REVIEWED", "Reviewed"),
                    ("ORDERED", "Ordered"),
                    ("RECEIVED", "Received"),
                    ("CANCELLED", "Cancelled"),
                    ("CLOSED", "Closed"),
                ],
                db_index=True,
                default="OPEN",
                max_length=12,
            ),
        ),
        migrations.AddIndex(
            model_name="purchaseneed",
            index=models.Index(fields=["source_module", "status", "priority"], name="inventory_pn_src_sta_pri_idx"),
        ),
    ]
