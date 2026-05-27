import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("subscriptions", "0074_contract_recontract_customer_consent"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="contractrecontractevent",
            name="admin_approval_status",
            field=models.CharField(
                choices=[
                    ("PENDING", "Pending"),
                    ("APPROVED", "Approved"),
                    ("REJECTED", "Rejected"),
                ],
                db_index=True,
                default="PENDING",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="contractrecontractevent",
            name="admin_approved_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="admin_recontract_approval_decisions",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="contractrecontractevent",
            name="admin_approved_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="contractrecontractevent",
            name="admin_approval_note",
            field=models.TextField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="contractrecontractevent",
            name="admin_approval_snapshot",
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
