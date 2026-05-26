import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("subscriptions", "0073_contract_recontract_event"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="contractrecontractevent",
            name="customer_consent_status",
            field=models.CharField(
                choices=[
                    ("PENDING", "Pending"),
                    ("ACCEPTED", "Accepted"),
                    ("REJECTED", "Rejected"),
                ],
                db_index=True,
                default="PENDING",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="contractrecontractevent",
            name="customer_consented_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="customer_recontract_consents",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="contractrecontractevent",
            name="customer_consented_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="contractrecontractevent",
            name="customer_consent_note",
            field=models.TextField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="contractrecontractevent",
            name="customer_consent_snapshot",
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
