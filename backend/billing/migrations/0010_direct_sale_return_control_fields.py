from decimal import Decimal

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("inventory", "0016_alter_purchaseneed_source_module"),
        ("billing", "0009_rename_billing_cus_customer_a4b90f_idx_billing_cus_custome_354f9e_idx_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="directsalereturn",
            name="exchange_amount_due",
            field=models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=12),
        ),
        migrations.AddField(
            model_name="directsalereturn",
            name="exchange_customer_credit",
            field=models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=12),
        ),
        migrations.AddField(
            model_name="directsalereturn",
            name="metadata",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name="directsalereturn",
            name="return_kind",
            field=models.CharField(
                choices=[
                    ("POST_INVOICE_CANCEL", "Post-Invoice Cancel"),
                    ("DELIVERED_RETURN", "Delivered Return"),
                    ("DELIVERED_EXCHANGE", "Delivered Exchange"),
                    ("DAMAGED_RETURN", "Damaged Return"),
                    ("PARTIAL_RETURN", "Partial Return"),
                ],
                db_index=True,
                default="DELIVERED_RETURN",
                max_length=24,
            ),
        ),
        migrations.AddField(
            model_name="directsalereturn",
            name="stock_destination",
            field=models.CharField(
                choices=[
                    ("SELLABLE", "Sellable"),
                    ("INSPECTION", "Inspection"),
                    ("DAMAGED", "Damaged"),
                    ("SERVICE", "Service"),
                ],
                db_index=True,
                default="SELLABLE",
                max_length=16,
            ),
        ),
        migrations.AddField(
            model_name="directsalereturn",
            name="stock_location",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="direct_sale_returns",
                to="inventory.stocklocation",
            ),
        ),
    ]
