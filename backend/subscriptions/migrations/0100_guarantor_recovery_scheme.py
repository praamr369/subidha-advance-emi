from decimal import Decimal

import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("subscriptions", "0099_customer_reminder_channel_preference_p2q11"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # SubscriptionGuarantor
        migrations.CreateModel(
            name="SubscriptionGuarantor",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(default=django.utils.timezone.now, db_index=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("name", models.CharField(max_length=200)),
                ("phone", models.CharField(max_length=20, db_index=True)),
                ("relation", models.CharField(max_length=16, choices=[("SPOUSE","Spouse"),("PARENT","Parent"),("SIBLING","Sibling"),("FRIEND","Friend"),("EMPLOYER","Employer"),("OTHER","Other")], default="OTHER")),
                ("aadhaar_no", models.CharField(max_length=20, blank=True, default="")),
                ("address", models.TextField(blank=True, default="")),
                ("is_primary", models.BooleanField(default=False, db_index=True)),
                ("notes", models.TextField(blank=True, default="")),
                ("subscription", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="guarantors", to="subscriptions.subscription")),
            ],
            options={"db_table": "subscriptions_guarantors", "ordering": ["-is_primary", "id"]},
        ),
        migrations.AddIndex(
            model_name="subscriptionguarantor",
            index=models.Index(fields=["subscription", "is_primary"], name="sub_guarantor_sub_primary_idx"),
        ),

        # RecoveryCase
        migrations.CreateModel(
            name="RecoveryCase",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(default=django.utils.timezone.now, db_index=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("stage", models.CharField(max_length=20, choices=[("IDENTIFIED","Identified"),("NOTICE_SENT","Notice Sent"),("FIELD_VISIT","Field Visit"),("LEGAL","Legal"),("SETTLED","Settled"),("WRITTEN_OFF","Written Off")], default="IDENTIFIED", db_index=True)),
                ("overdue_amount", models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))),
                ("overdue_emis", models.PositiveIntegerField(default=0)),
                ("first_overdue_date", models.DateField(null=True, blank=True, db_index=True)),
                ("notice_sent_at", models.DateTimeField(null=True, blank=True)),
                ("field_visit_at", models.DateTimeField(null=True, blank=True)),
                ("legal_at", models.DateTimeField(null=True, blank=True)),
                ("settled_amount", models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))),
                ("settled_at", models.DateTimeField(null=True, blank=True)),
                ("notes", models.TextField(blank=True, default="")),
                ("last_contact_at", models.DateTimeField(null=True, blank=True)),
                ("subscription", models.OneToOneField(on_delete=django.db.models.deletion.PROTECT, related_name="recovery_case", to="subscriptions.subscription")),
                ("assigned_to", models.ForeignKey(null=True, blank=True, on_delete=django.db.models.deletion.SET_NULL, related_name="assigned_recovery_cases", to=settings.AUTH_USER_MODEL)),
            ],
            options={"db_table": "subscriptions_recovery_cases", "ordering": ["-first_overdue_date", "-id"]},
        ),
        migrations.AddIndex(
            model_name="recoverycase",
            index=models.Index(fields=["stage", "first_overdue_date"], name="recovery_stage_date_idx"),
        ),
        migrations.AddIndex(
            model_name="recoverycase",
            index=models.Index(fields=["assigned_to", "stage"], name="recovery_assigned_stage_idx"),
        ),

        # EMIScheme
        migrations.CreateModel(
            name="EMIScheme",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(default=django.utils.timezone.now, db_index=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("name", models.CharField(max_length=200, db_index=True)),
                ("code", models.CharField(max_length=40, unique=True, db_index=True)),
                ("plan_type", models.CharField(max_length=12, blank=True, default="")),
                ("discount_type", models.CharField(max_length=24, choices=[("PERCENT","Percentage discount"),("FLAT_AMOUNT","Flat amount off"),("WAIVE_INSTALLMENTS","Waive N installments")], default="PERCENT")),
                ("value", models.DecimalField(max_digits=10, decimal_places=2)),
                ("valid_from", models.DateField(db_index=True)),
                ("valid_to", models.DateField(db_index=True)),
                ("max_uses", models.PositiveIntegerField(null=True, blank=True)),
                ("used_count", models.PositiveIntegerField(default=0)),
                ("is_active", models.BooleanField(default=True, db_index=True)),
                ("description", models.TextField(blank=True, default="")),
                ("applicable_products", models.ManyToManyField(blank=True, related_name="emi_schemes", to="subscriptions.product")),
                ("created_by", models.ForeignKey(null=True, blank=True, on_delete=django.db.models.deletion.SET_NULL, related_name="created_emi_schemes", to=settings.AUTH_USER_MODEL)),
            ],
            options={"db_table": "subscriptions_emi_schemes", "ordering": ["-valid_from", "-id"]},
        ),
        migrations.AddIndex(
            model_name="emischeme",
            index=models.Index(fields=["is_active", "valid_from", "valid_to"], name="scheme_active_dates_idx"),
        ),
    ]
