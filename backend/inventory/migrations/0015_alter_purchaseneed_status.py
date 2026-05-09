# Additive widen only — longest value is PARTIALLY_FULFILLED (22 chars); extra margin for ops safety.
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("inventory", "0014_purchase_need_stock_workflow_fields"),
    ]

    operations = [
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
                max_length=30,
            ),
        ),
    ]
