from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("service_desk", "0003_support_ticket_desk"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="servicedeskcase",
            name="payment_exception_approved",
            field=models.BooleanField(db_index=True, default=False),
        ),
        migrations.AddField(
            model_name="servicedeskcase",
            name="payment_exception_approved_at",
            field=models.DateTimeField(blank=True, db_index=True, null=True),
        ),
        migrations.AddField(
            model_name="servicedeskcase",
            name="payment_exception_approved_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="payment_exception_approved_service_desk_cases",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="servicedeskcase",
            name="payment_exception_reason",
            field=models.TextField(blank=True, default=""),
        ),
    ]
