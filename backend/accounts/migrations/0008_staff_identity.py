from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def seed_staff_role_capabilities(apps, schema_editor):
    Capability = apps.get_model("accounts", "Capability")
    RoleCapability = apps.get_model("accounts", "RoleCapability")
    for capability in Capability.objects.all():
        RoleCapability.objects.update_or_create(
            role="STAFF",
            capability=capability,
            defaults={"is_allowed": False},
        )


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("accounting", "0029_rentleasepostingbridgeconfig"),
        ("accounts", "0007_capability_matrix"),
    ]

    operations = [
        migrations.AlterField(
            model_name="rolecapability",
            name="role",
            field=models.CharField(
                choices=[
                    ("ADMIN", "Admin"),
                    ("PARTNER", "Partner"),
                    ("CUSTOMER", "Customer"),
                    ("CASHIER", "Cashier"),
                    ("VENDOR", "Vendor"),
                    ("STAFF", "Staff"),
                ],
                db_index=True,
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name="user",
            name="role",
            field=models.CharField(
                choices=[
                    ("ADMIN", "Admin"),
                    ("PARTNER", "Partner"),
                    ("CUSTOMER", "Customer"),
                    ("CASHIER", "Cashier"),
                    ("VENDOR", "Vendor"),
                    ("STAFF", "Staff"),
                ],
                db_index=True,
                default="CUSTOMER",
                max_length=20,
            ),
        ),
        migrations.CreateModel(
            name="StaffIdentity",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("login_enabled", models.BooleanField(db_index=True, default=True)),
                ("temporary_password_last_set_at", models.DateTimeField(blank=True, db_index=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="created_staff_identities",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "employee",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="staff_identity",
                        to="accounting.employeeprofile",
                    ),
                ),
                (
                    "user",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="staff_identity",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "db_table": "staff_identities",
                "ordering": ["employee_id"],
            },
        ),
        migrations.AddIndex(
            model_name="staffidentity",
            index=models.Index(fields=["login_enabled"], name="staff_ident_login__db34f5_idx"),
        ),
        migrations.RunPython(seed_staff_role_capabilities, migrations.RunPython.noop),
    ]
