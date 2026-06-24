import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("subscriptions", "0102_settlement_type"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # ── AML / PEP flags on Customer ───────────────────────────────────────
        migrations.AddField(
            model_name="customer",
            name="is_pep",
            field=models.BooleanField(db_index=True, default=False, verbose_name="Politically Exposed Person (PEP)"),
        ),
        migrations.AddField(
            model_name="customer",
            name="pep_flagged_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="customer",
            name="pep_flagged_by",
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="pep_flagged_customers",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="customer",
            name="aml_cleared",
            field=models.BooleanField(db_index=True, default=False, verbose_name="AML Screening Cleared"),
        ),
        migrations.AddField(
            model_name="customer",
            name="aml_cleared_at",
            field=models.DateTimeField(blank=True, null=True),
        ),

        # ── AMLScreeningRecord table ──────────────────────────────────────────
        migrations.CreateModel(
            name="AMLScreeningRecord",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("screening_date", models.DateField(db_index=True)),
                ("result", models.CharField(
                    choices=[
                        ("CLEAR", "Clear — no match found"),
                        ("WATCHLIST_HIT", "Watchlist hit — requires review"),
                        ("PEP_CONFIRMED", "PEP confirmed"),
                        ("SANCTIONED", "Sanctioned — blocked"),
                        ("PENDING", "Pending screening"),
                    ],
                    db_index=True, default="PENDING", max_length=20,
                )),
                ("checked_rbi_defaulter_list", models.BooleanField(default=False)),
                ("checked_interpol", models.BooleanField(default=False)),
                ("checked_ofac", models.BooleanField(default=False)),
                ("checked_un_sanctions", models.BooleanField(default=False)),
                ("checked_pep_list", models.BooleanField(default=False)),
                ("notes", models.TextField(blank=True, default="")),
                ("watchlist_reference", models.CharField(blank=True, default="", max_length=200)),
                ("next_review_date", models.DateField(blank=True, db_index=True, null=True)),
                ("is_latest", models.BooleanField(db_index=True, default=True)),
                ("customer", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="aml_screenings",
                    to="subscriptions.customer",
                )),
                ("screened_by", models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name="aml_screenings_performed",
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={"db_table": "customer_aml_screenings", "ordering": ["-screening_date", "-id"]},
        ),
    ]
