from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("subscriptions", "0100_guarantor_recovery_scheme"),
    ]

    operations = [
        migrations.AddField(
            model_name="customerkycdocument",
            name="expiry_date",
            field=models.DateField(
                blank=True,
                db_index=True,
                help_text="Document expiry date. Leave blank for non-expiring documents (e.g. PAN, Voter ID).",
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="partnerkycdocument",
            name="expiry_date",
            field=models.DateField(
                blank=True,
                db_index=True,
                help_text="Document expiry date. Leave blank for non-expiring documents.",
                null=True,
            ),
        ),
    ]
