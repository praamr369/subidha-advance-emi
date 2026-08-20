from decimal import Decimal

import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("payments", "0002_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="AdvanceForfeiture",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ("status", models.CharField(
                    choices=[
                        ("PENDING_REVIEW", "Pending Review"),
                        ("CONTACT_ATTEMPTED", "Contact Attempted"),
                        ("FORFEITED", "Forfeited"),
                        ("REVERSED", "Reversed"),
                    ],
                    db_index=True,
                    default="PENDING_REVIEW",
                    max_length=20,
                )),
                ("forfeited_amount", models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=12)),
                ("dormant_since", models.DateField(help_text="Date of last customer activity related to this advance.")),
                ("contact_attempts", models.JSONField(default=list, help_text="[{date, method, outcome, recorded_by}] — documented contact attempts.")),
                ("forfeiture_date", models.DateField(blank=True, null=True)),
                ("legal_basis", models.CharField(default="Limitation Act 1963 s.3 — 3-year dormancy", max_length=200)),
                ("income_recognition_note", models.TextField(default="IT Act s.41(1) cessation of liability")),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("reversed_at", models.DateTimeField(blank=True, null=True)),
                ("reversal_reason", models.TextField(blank=True, default="")),
                ("advance", models.OneToOneField(on_delete=django.db.models.deletion.PROTECT, related_name="forfeiture", to="payments.customeradvance")),
                ("forfeited_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="forfeited_advances", to=settings.AUTH_USER_MODEL)),
                ("reversed_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="reversed_advance_forfeitures", to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "db_table": "customer_advance_forfeitures",
                "ordering": ["-created_at"],
            },
        ),
        # Bad-debt fields on RecoveryCase
        migrations.AddField(
            model_name="recoverycase",
            name="npa_classified_at",
            field=models.DateTimeField(blank=True, help_text="When classified as NPA (>90 days overdue)", null=True),
        ),
        migrations.AddField(
            model_name="recoverycase",
            name="provisioning_percent",
            field=models.DecimalField(decimal_places=2, default=Decimal("0.00"), help_text="10% sub-standard / 50% doubtful / 100% loss", max_digits=5),
        ),
        migrations.AddField(
            model_name="recoverycase",
            name="written_off_amount",
            field=models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=12),
        ),
        migrations.AddField(
            model_name="recoverycase",
            name="written_off_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="recoverycase",
            name="written_off_by",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="written_off_recovery_cases", to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name="recoverycase",
            name="write_off_legal_notice_date",
            field=models.DateField(blank=True, help_text="Date legal demand notice issued under CPC s.80", null=True),
        ),
        migrations.AddField(
            model_name="recoverycase",
            name="write_off_legal_notice_ref",
            field=models.CharField(blank=True, default="", help_text="Legal notice reference number", max_length=100),
        ),
    ]
