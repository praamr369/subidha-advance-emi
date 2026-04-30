from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):
    dependencies = [
        ("subscriptions", "0059_financialledger_control_fields"),
        ("crm", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="CustomerTag",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("name", models.CharField(db_index=True, max_length=64, unique=True)),
                ("color", models.CharField(blank=True, default="", max_length=20)),
                ("is_active", models.BooleanField(db_index=True, default=True)),
            ],
            options={"db_table": "crm_customer_tags", "ordering": ["name", "id"]},
        ),
        migrations.CreateModel(
            name="Lead",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("name", models.CharField(db_index=True, max_length=120)),
                ("phone", models.CharField(db_index=True, max_length=20)),
                ("email", models.EmailField(blank=True, default="", max_length=254)),
                ("address", models.TextField(blank=True, default="")),
                ("source", models.CharField(db_index=True, max_length=60)),
                ("interested_plan_type", models.CharField(choices=[("LUCKY_PLAN", "Lucky Plan"), ("RENT", "Rent"), ("LEASE", "Lease"), ("DIRECT_SALE", "Direct Sale")], db_index=True, default="LUCKY_PLAN", max_length=20)),
                ("stage", models.CharField(choices=[("NEW", "New"), ("CONTACTED", "Contacted"), ("INTERESTED", "Interested"), ("KYC_PENDING", "KYC Pending"), ("READY_TO_CONVERT", "Ready To Convert"), ("CONVERTED", "Converted"), ("LOST", "Lost")], db_index=True, default="NEW", max_length=30)),
                ("next_follow_up_at", models.DateTimeField(blank=True, db_index=True, null=True)),
                ("assigned_to", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="crm_assigned_leads", to=settings.AUTH_USER_MODEL)),
                ("converted_customer", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="crm_converted_leads", to="subscriptions.customer")),
                ("interested_product", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="crm_leads", to="subscriptions.product")),
            ],
            options={"db_table": "crm_leads", "ordering": ["-created_at", "-id"]},
        ),
        migrations.AddIndex(model_name="lead", index=models.Index(fields=["phone", "stage"], name="crm_leads_phone_5dcafa_idx")),
        migrations.AddIndex(model_name="lead", index=models.Index(fields=["assigned_to", "next_follow_up_at"], name="crm_leads_assigne_bf3400_idx")),
        migrations.CreateModel(
            name="CustomerRiskFlag",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("code", models.CharField(db_index=True, max_length=64)),
                ("reason", models.TextField(blank=True, default="")),
                ("severity", models.CharField(db_index=True, default="MEDIUM", max_length=20)),
                ("is_active", models.BooleanField(db_index=True, default=True)),
                ("customer", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="crm_risk_flags", to="subscriptions.customer")),
                ("raised_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="crm_raised_risk_flags", to=settings.AUTH_USER_MODEL)),
            ],
            options={"db_table": "crm_customer_risk_flags", "ordering": ["-created_at", "-id"]},
        ),
        migrations.AddIndex(model_name="customerriskflag", index=models.Index(fields=["customer", "is_active", "severity"], name="crm_customer_customer_921db4_idx")),
        migrations.CreateModel(
            name="CustomerInteraction",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("interaction_type", models.CharField(db_index=True, default="CALL", max_length=40)),
                ("note", models.TextField()),
                ("happened_at", models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ("created_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="crm_customer_interactions", to=settings.AUTH_USER_MODEL)),
                ("customer", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="crm_interactions", to="subscriptions.customer")),
                ("lead", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="customer_interactions", to="crm.lead")),
            ],
            options={"db_table": "crm_customer_interactions", "ordering": ["-happened_at", "-id"]},
        ),
        migrations.CreateModel(
            name="FollowUpTask",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("due_at", models.DateTimeField(db_index=True)),
                ("status", models.CharField(choices=[("OPEN", "Open"), ("DONE", "Done"), ("CANCELLED", "Cancelled")], db_index=True, default="OPEN", max_length=20)),
                ("call_note", models.TextField(blank=True, default="")),
                ("completed_at", models.DateTimeField(blank=True, db_index=True, null=True)),
                ("assigned_to", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="crm_follow_up_tasks", to=settings.AUTH_USER_MODEL)),
                ("customer", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="crm_follow_up_tasks", to="subscriptions.customer")),
                ("lead", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="follow_up_tasks", to="crm.lead")),
            ],
            options={"db_table": "crm_follow_up_tasks", "ordering": ["due_at", "-created_at", "-id"]},
        ),
        migrations.AddIndex(model_name="followuptask", index=models.Index(fields=["status", "due_at"], name="crm_follow_u_status_8d2e0b_idx")),
        migrations.AddIndex(model_name="followuptask", index=models.Index(fields=["assigned_to", "status", "due_at"], name="crm_follow_u_assigne_1e4a3f_idx")),
        migrations.CreateModel(
            name="Opportunity",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("title", models.CharField(max_length=160)),
                ("estimated_value", models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ("stage", models.CharField(choices=[("OPEN", "Open"), ("WON", "Won"), ("LOST", "Lost")], db_index=True, default="OPEN", max_length=20)),
                ("expected_close_date", models.DateField(blank=True, null=True)),
                ("notes", models.TextField(blank=True, default="")),
                ("customer", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="crm_opportunities", to="subscriptions.customer")),
                ("lead", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="opportunities", to="crm.lead")),
                ("owner", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="crm_owned_opportunities", to=settings.AUTH_USER_MODEL)),
            ],
            options={"db_table": "crm_opportunities", "ordering": ["-created_at", "-id"]},
        ),
    ]

