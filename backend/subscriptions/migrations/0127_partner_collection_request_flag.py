from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("subscriptions", "0126_business_profile_indian_fields"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="partnercollectionrequest",
            name="is_flagged_bad",
            field=models.BooleanField(
                db_index=True,
                default=False,
                help_text="Admin-marked flag: payment submitted but money was not received. Visible to partner and customer.",
            ),
        ),
        migrations.AddField(
            model_name="partnercollectionrequest",
            name="flag_reason",
            field=models.TextField(
                blank=True,
                default="",
                help_text="Reason for the bad-request flag. Displayed to partner and customer.",
            ),
        ),
        migrations.AddField(
            model_name="partnercollectionrequest",
            name="flagged_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="flagged_partner_collection_requests",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="partnercollectionrequest",
            name="flagged_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
