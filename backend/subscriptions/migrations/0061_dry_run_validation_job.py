import uuid

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("subscriptions", "0060_alter_auditlog_action_type"),
    ]

    operations = [
        migrations.CreateModel(
            name="DryRunValidationJob",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("run_id", models.UUIDField(db_index=True, default=uuid.uuid4, editable=False, unique=True)),
                ("checks", models.JSONField(default=list)),
                ("options", models.JSONField(default=dict)),
                (
                    "status",
                    models.CharField(
                        choices=[("COMPLETED", "Completed"), ("FAILED", "Failed")],
                        db_index=True,
                        default="COMPLETED",
                        max_length=16,
                    ),
                ),
                ("summary", models.JSONField(default=dict)),
                ("results", models.JSONField(default=list)),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="dry_run_validation_jobs",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
            ],
            options={
                "db_table": "subscriptions_dry_run_validation_jobs",
                "ordering": ["-created_at", "-id"],
            },
        ),
    ]
