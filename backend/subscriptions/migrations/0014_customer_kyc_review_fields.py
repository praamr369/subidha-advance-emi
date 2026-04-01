from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("subscriptions", "0013_commissionpayoutbatch_commissionpayoutline"),
    ]

    operations = [
        migrations.AddField(
            model_name="customer",
            name="kyc_reviewed_at",
            field=models.DateTimeField(blank=True, db_index=True, null=True),
        ),
        migrations.AddField(
            model_name="customer",
            name="kyc_reviewed_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="kyc_reviewed_customers",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="customer",
            name="kyc_rejection_reason",
            field=models.TextField(blank=True, default=""),
        ),
    ]