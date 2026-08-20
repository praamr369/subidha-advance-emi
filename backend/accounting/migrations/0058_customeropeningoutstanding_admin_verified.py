from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("accounting", "0057_alter_financeaccountcoamapping_purpose_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="customeropeningoutstanding",
            name="admin_verified",
            field=models.BooleanField(db_index=True, default=False),
        ),
        migrations.AddField(
            model_name="customeropeningoutstanding",
            name="admin_verified_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="customeropeningoutstanding",
            name="admin_verified_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="verified_opening_outstandings",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="customeropeningoutstanding",
            name="admin_verification_notes",
            field=models.TextField(blank=True, default=""),
        ),
    ]
