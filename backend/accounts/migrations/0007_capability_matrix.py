from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


CAPABILITY_SEED = [
    ("billing.view", "Billing View", "View billing and collection surfaces."),
    ("billing.collect", "Billing Collect", "Collect customer payments."),
    ("billing.override_allocation", "Billing Override Allocation", "Override payment allocation flows."),
    ("accounting.view", "Accounting View", "View accounting and ledger surfaces."),
    ("accounting.reverse_entry", "Accounting Reverse Entry", "Reverse accounting journal entries."),
    ("batch.lock", "Batch Lock", "Lock batch before draw execution."),
    ("draw.commit", "Draw Commit", "Commit batch draw state."),
    ("draw.complete", "Draw Complete", "Complete and execute draw."),
    ("inventory.adjust", "Inventory Adjust", "Post inventory stock adjustments."),
    ("vendor.manage", "Vendor Manage", "Manage vendor records."),
    ("crm.manage", "CRM Manage", "Manage CRM records."),
    ("reports.export", "Reports Export", "Export sensitive report payloads."),
    ("business_setup.reset", "Business Setup Reset", "Execute destructive business reset."),
]


def seed_capabilities_and_role_matrix(apps, schema_editor):
    Capability = apps.get_model("accounts", "Capability")
    RoleCapability = apps.get_model("accounts", "RoleCapability")

    for code, label, description in CAPABILITY_SEED:
        Capability.objects.update_or_create(
            code=code,
            defaults={
                "label": label,
                "description": description,
                "is_active": True,
            },
        )

    role_defaults = {
        "ADMIN": {code for code, _, _ in CAPABILITY_SEED},
        "CASHIER": {"billing.view", "billing.collect"},
        "PARTNER": {"billing.view", "crm.manage"},
        "CUSTOMER": set(),
    }

    for role, allowed_codes in role_defaults.items():
        for code, _, _ in CAPABILITY_SEED:
            capability = Capability.objects.filter(code=code).first()
            if capability is None:
                continue
            RoleCapability.objects.update_or_create(
                role=role,
                capability=capability,
                defaults={"is_allowed": code in allowed_codes},
            )


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0006_passwordresetrequest_last_sent_at_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="Capability",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("code", models.CharField(db_index=True, max_length=120, unique=True)),
                ("label", models.CharField(max_length=160)),
                ("description", models.TextField(blank=True, default="")),
                ("is_active", models.BooleanField(db_index=True, default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={"db_table": "capabilities", "ordering": ["code", "id"]},
        ),
        migrations.CreateModel(
            name="RoleCapability",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("role", models.CharField(choices=[("ADMIN", "Admin"), ("PARTNER", "Partner"), ("CUSTOMER", "Customer"), ("CASHIER", "Cashier")], db_index=True, max_length=20)),
                ("is_allowed", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("capability", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="role_assignments", to="accounts.capability")),
            ],
            options={"db_table": "role_capabilities", "ordering": ["role", "capability__code", "id"]},
        ),
        migrations.CreateModel(
            name="UserCapabilityOverride",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("is_allowed", models.BooleanField(default=False)),
                ("note", models.CharField(blank=True, default="", max_length=255)),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("capability", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="user_overrides", to="accounts.capability")),
                ("created_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="created_capability_overrides", to=settings.AUTH_USER_MODEL)),
                ("updated_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="updated_capability_overrides", to=settings.AUTH_USER_MODEL)),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="capability_overrides", to=settings.AUTH_USER_MODEL)),
            ],
            options={"db_table": "user_capability_overrides", "ordering": ["user_id", "capability__code", "id"]},
        ),
        migrations.AddConstraint(
            model_name="rolecapability",
            constraint=models.UniqueConstraint(fields=("role", "capability"), name="unique_role_capability_assignment"),
        ),
        migrations.AddConstraint(
            model_name="usercapabilityoverride",
            constraint=models.UniqueConstraint(fields=("user", "capability"), name="unique_user_capability_override"),
        ),
        migrations.AddIndex(
            model_name="rolecapability",
            index=models.Index(fields=["role", "is_allowed"], name="role_capabi_role_84bc13_idx"),
        ),
        migrations.AddIndex(
            model_name="rolecapability",
            index=models.Index(fields=["capability", "is_allowed"], name="role_capabi_capabil_3fb94d_idx"),
        ),
        migrations.AddIndex(
            model_name="usercapabilityoverride",
            index=models.Index(fields=["user", "is_allowed"], name="user_capabi_user_id_b60eb3_idx"),
        ),
        migrations.AddIndex(
            model_name="usercapabilityoverride",
            index=models.Index(fields=["capability", "is_allowed"], name="user_capabi_capabil_5ad5c2_idx"),
        ),
        migrations.RunPython(seed_capabilities_and_role_matrix, migrations.RunPython.noop),
    ]
