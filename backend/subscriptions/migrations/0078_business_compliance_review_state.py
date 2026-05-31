# Generated manually for BC-2 additive compliance review workflow.

import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("subscriptions", "0077_contractrecontractfinancialimpactpreview"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="BusinessComplianceDocumentReviewState",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "review_status",
                    models.CharField(
                        choices=[
                            ("PENDING", "Pending"),
                            ("UNDER_REVIEW", "Under Review"),
                            ("APPROVED", "Approved"),
                            ("REJECTED", "Rejected"),
                            ("EXPIRED", "Expired"),
                        ],
                        db_index=True,
                        default="PENDING",
                        max_length=20,
                    ),
                ),
                ("reviewed_at", models.DateTimeField(blank=True, null=True)),
                ("rejected_reason", models.TextField(blank=True, default="")),
                ("expires_at", models.DateField(blank=True, db_index=True, null=True)),
                ("approved_public_summary", models.BooleanField(db_index=True, default=False)),
                ("public_summary_approved_at", models.DateTimeField(blank=True, null=True)),
                ("source_template_key", models.CharField(blank=True, db_index=True, default="", max_length=80)),
                ("evidence_uploaded_at", models.DateTimeField(blank=True, null=True)),
                ("last_action_reason", models.TextField(blank=True, default="")),
                (
                    "document",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="review_state",
                        to="subscriptions.businesscompliancedocument",
                    ),
                ),
                (
                    "public_summary_approved_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="approved_business_compliance_public_summaries",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "db_table": "business_compliance_document_review_states",
                "ordering": ["-created_at", "-id"],
                "indexes": [
                    models.Index(fields=["review_status", "approved_public_summary"], name="bc_doc_review_status_pub_idx"),
                    models.Index(fields=["expires_at", "review_status"], name="bc_doc_review_expiry_idx"),
                ],
            },
        ),
    ]
