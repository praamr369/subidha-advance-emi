# Generated manually for system_jobs app

import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="SystemJobLog",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "idempotency_key",
                    models.CharField(db_index=True, max_length=220, unique=True),
                ),
                ("job_type", models.CharField(db_index=True, max_length=80)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("PENDING", "Pending"),
                            ("RUNNING", "Running"),
                            ("SUCCESS", "Success"),
                            ("FAILED", "Failed"),
                        ],
                        db_index=True,
                        default="PENDING",
                        max_length=16,
                    ),
                ),
                ("retry_count", models.PositiveIntegerField(default=0)),
                ("failure_reason", models.TextField(blank=True, default="")),
                ("started_at", models.DateTimeField(blank=True, db_index=True, null=True)),
                ("finished_at", models.DateTimeField(blank=True, db_index=True, null=True)),
                ("result_summary", models.JSONField(blank=True, default=dict)),
                ("celery_task_id", models.CharField(blank=True, default="", max_length=120)),
            ],
            options={
                "db_table": "system_job_logs",
                "ordering": ["-started_at", "-id"],
            },
        ),
        migrations.AddIndex(
            model_name="systemjoblog",
            index=models.Index(fields=["job_type", "status"], name="system_job__job_typ_6769c5_idx"),
        ),
        migrations.AddIndex(
            model_name="systemjoblog",
            index=models.Index(fields=["finished_at"], name="system_job__finishe_8a1b2c_idx"),
        ),
        migrations.CreateModel(
            name="Notification",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "audience",
                    models.CharField(
                        blank=True,
                        choices=[("ADMINS", "Admins"), ("CASHIERS", "Cashiers")],
                        db_index=True,
                        default="",
                        max_length=16,
                    ),
                ),
                ("module", models.CharField(db_index=True, max_length=48)),
                ("title", models.CharField(max_length=200)),
                ("body", models.TextField(blank=True, default="")),
                ("payload", models.JSONField(blank=True, default=dict)),
                (
                    "dedupe_key",
                    models.CharField(blank=True, db_index=True, max_length=220, null=True, unique=True),
                ),
                ("read_at", models.DateTimeField(blank=True, db_index=True, null=True)),
                ("created_at", models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                (
                    "recipient",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="system_notifications",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "source_job",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="notifications",
                        to="system_jobs.systemjoblog",
                    ),
                ),
            ],
            options={
                "db_table": "system_notifications",
                "ordering": ["-created_at", "-id"],
            },
        ),
        migrations.AddIndex(
            model_name="notification",
            index=models.Index(fields=["recipient", "read_at"], name="system_noti_recipie_9d3e4f_idx"),
        ),
        migrations.AddIndex(
            model_name="notification",
            index=models.Index(fields=["module", "created_at"], name="system_noti_module__7e8f90_idx"),
        ),
        migrations.CreateModel(
            name="NotificationPreference",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("module", models.CharField(db_index=True, max_length=48)),
                ("enabled", models.BooleanField(db_index=True, default=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="notification_preferences",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "db_table": "system_notification_preferences",
                "ordering": ["user_id", "module"],
                "unique_together": {("user", "module")},
            },
        ),
    ]
