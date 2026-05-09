from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("subscriptions", "0063_branddatasource_businessmediaasset_sociallink_and_more"),
    ]

    operations = [
        migrations.AlterField(
            model_name="operationalcancellation",
            name="cancellation_type",
            field=models.CharField(
                choices=[
                    ("CANCEL_DRAFT", "Cancel Draft"),
                    ("VOID_UNPOSTED", "Void Unposted"),
                    ("CANCEL_WITH_REVERSAL", "Cancel With Reversal"),
                    ("MANUAL_SETTLEMENT", "Manual Settlement"),
                    ("PAYMENT_REVERSAL", "Payment Reversal"),
                    ("DELIVERY_CANCEL", "Delivery Cancel"),
                    ("STOCK_REQUIREMENT_CANCEL", "Stock Requirement Cancel"),
                    ("CONTRACT_TERMINATION", "Contract Termination"),
                ],
                db_index=True,
                max_length=40,
            ),
        ),
        migrations.AlterField(
            model_name="operationalcancellation",
            name="source_id",
            field=models.PositiveBigIntegerField(blank=True, db_index=True, null=True),
        ),
    ]
