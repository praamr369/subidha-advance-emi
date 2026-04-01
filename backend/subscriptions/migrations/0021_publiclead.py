from django.db import migrations, models
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        ("subscriptions", "0020_customer_address_customer_city_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="PublicLead",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ("name", models.CharField(max_length=100)),
                ("phone", models.CharField(db_index=True, max_length=10)),
                ("city", models.CharField(blank=True, default="", max_length=100)),
                ("interested_product", models.CharField(blank=True, default="", max_length=255)),
                ("preferred_emi_amount", models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ("notes", models.TextField(blank=True, default="")),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("NEW", "New"),
                            ("CONTACTED", "Contacted"),
                            ("CLOSED", "Closed"),
                        ],
                        db_index=True,
                        default="NEW",
                        max_length=20,
                    ),
                ),
                ("source", models.CharField(default="PUBLIC_SITE", max_length=40)),
            ],
            options={
                "db_table": "public_leads",
                "ordering": ["-created_at", "-id"],
                "indexes": [
                    models.Index(fields=["phone"], name="public_lead_phone_70f926_idx"),
                    models.Index(fields=["status"], name="public_lead_status_b8efe5_idx"),
                    models.Index(fields=["name"], name="public_lead_name_e65431_idx"),
                    models.Index(fields=["created_at"], name="public_lead_created_664347_idx"),
                ],
            },
        ),
    ]
