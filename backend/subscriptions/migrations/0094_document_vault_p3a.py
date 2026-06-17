"""P3A: Document Vault — additive fields on SubscriptionDocument + new DocumentAccessLog.

All new fields on SubscriptionDocument have null-safe or blank-safe defaults
so existing rows remain valid without any data migration.
"""
import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("subscriptions", "0093_month_end_close"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # --- Additive fields on SubscriptionDocument ---
        migrations.AddField(
            model_name="subscriptiondocument",
            name="checksum_sha256",
            field=models.CharField(blank=True, default="", max_length=64),
        ),
        migrations.AddField(
            model_name="subscriptiondocument",
            name="expires_on",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="subscriptiondocument",
            name="signed_status",
            field=models.CharField(
                choices=[
                    ("UNSIGNED", "Unsigned"),
                    ("SIGNED", "Signed"),
                    ("NOT_REQUIRED", "Not Required"),
                    ("UNKNOWN", "Unknown"),
                ],
                default="UNKNOWN",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="subscriptiondocument",
            name="access_level",
            field=models.CharField(
                choices=[
                    ("INTERNAL", "Internal"),
                    ("SENSITIVE", "Sensitive"),
                    ("HIGHLY_SENSITIVE", "Highly Sensitive"),
                ],
                default="INTERNAL",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="subscriptiondocument",
            name="verified_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="verified_subscription_documents",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="subscriptiondocument",
            name="verified_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="subscriptiondocument",
            name="rejection_reason",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="subscriptiondocument",
            name="metadata",
            field=models.JSONField(blank=True, default=dict),
        ),
        # --- New DocumentAccessLog model ---
        migrations.CreateModel(
            name="DocumentAccessLog",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "created_at",
                    models.DateTimeField(
                        db_index=True, default=django.utils.timezone.now
                    ),
                ),
                (
                    "document",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="access_logs",
                        to="subscriptions.subscriptiondocument",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="document_access_logs",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "action",
                    models.CharField(
                        choices=[
                            ("VIEW", "View"),
                            ("DOWNLOAD", "Download"),
                            ("VERIFY", "Verify"),
                            ("REJECT", "Reject"),
                            ("REPLACE", "Replace"),
                            ("UPLOAD", "Upload"),
                        ],
                        db_index=True,
                        max_length=20,
                    ),
                ),
                (
                    "accessed_at",
                    models.DateTimeField(
                        db_index=True, default=django.utils.timezone.now
                    ),
                ),
                (
                    "ip_address",
                    models.GenericIPAddressField(blank=True, null=True),
                ),
                (
                    "user_agent",
                    models.TextField(blank=True, default=""),
                ),
                (
                    "metadata",
                    models.JSONField(blank=True, default=dict),
                ),
            ],
            options={
                "db_table": "document_access_logs",
                "ordering": ["-accessed_at", "-id"],
            },
        ),
    ]
