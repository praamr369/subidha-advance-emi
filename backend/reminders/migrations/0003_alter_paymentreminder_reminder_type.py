# Generated manually — add RENT_DUE reminder type

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("reminders", "0002_paymentreminder_attempts_and_more"),
    ]

    operations = [
        migrations.AlterField(
            model_name="paymentreminder",
            name="reminder_type",
            field=models.CharField(
                choices=[
                    ("RETAIL_DUE", "Retail Due"),
                    ("EMI_DUE", "EMI Due"),
                    ("EMI_OVERDUE", "EMI Overdue"),
                    ("RENT_DUE", "Rent / Lease Due"),
                    ("FOLLOWUP", "Follow Up"),
                ],
                db_index=True,
                max_length=20,
            ),
        ),
    ]
