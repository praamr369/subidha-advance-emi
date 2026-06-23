import django.utils.timezone
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("crm", "0004_lead_source_choices_notes_public_lead"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="StaffSalesTarget",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(default=django.utils.timezone.now, db_index=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("month", models.PositiveSmallIntegerField()),
                ("year", models.PositiveSmallIntegerField()),
                ("target_leads", models.PositiveIntegerField(default=0)),
                ("target_conversions", models.PositiveIntegerField(default=0)),
                ("target_revenue", models.DecimalField(max_digits=14, decimal_places=2, default=0)),
                ("notes", models.TextField(blank=True, default="")),
                ("staff", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="sales_targets", to=settings.AUTH_USER_MODEL, db_index=True)),
            ],
            options={
                "db_table": "crm_staff_sales_targets",
                "ordering": ["-year", "-month", "staff"],
            },
        ),
        migrations.AlterUniqueTogether(
            name="staffsalestarget",
            unique_together={("staff", "month", "year")},
        ),
        migrations.AddIndex(
            model_name="staffsalestarget",
            index=models.Index(fields=["year", "month"], name="staff_target_year_month_idx"),
        ),
    ]
