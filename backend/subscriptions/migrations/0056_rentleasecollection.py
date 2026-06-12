import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models
from django.db.models import Q

import subscriptions.models_rent_lease_collection


class Migration(migrations.Migration):
    dependencies = [
        ("accounting", "0017_financeaccount_is_real_settlement_account"),
        ("subscriptions", "0055_unified_collection_idempotency"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="RentLeaseCollection",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(db_index=True, auto_now_add=True)),
                ("collection_number", models.CharField(db_index=True, default=subscriptions.models_rent_lease_collection.generate_rent_lease_collection_number, max_length=64, unique=True)),
                ("external_reference_no", models.CharField(blank=True, db_index=True, default="", max_length=120)),
                ("plan_type", models.CharField(db_index=True, max_length=10)),
                ("amount", models.DecimalField(decimal_places=2, max_digits=12)),
                ("payment_date", models.DateField(db_index=True)),
                ("payment_method", models.CharField(db_index=True, max_length=10)),
                ("status", models.CharField(db_index=True, default="ACTIVE", max_length=16)),
                ("idempotency_key", models.CharField(blank=True, db_index=True, default="", max_length=160)),
                ("note", models.TextField(blank=True, default="")),
                ("metadata", models.JSONField(blank=True, default=dict)),
                ("voided_at", models.DateTimeField(blank=True, db_index=True, null=True)),
                ("void_reason", models.TextField(blank=True, default="")),
                ("reversal_reference", models.CharField(blank=True, db_index=True, default="", max_length=120)),
                ("updated_at", models.DateTimeField(auto_now=True, db_index=True)),
                ("contract_reference", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="rent_lease_collections", to="subscriptions.contractreference")),
                ("created_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="created_rent_lease_collections", to=settings.AUTH_USER_MODEL)),
                ("customer", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="rent_lease_collections", to="subscriptions.customer")),
                ("demand", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="rent_lease_collections", to="subscriptions.rentleasebillingdemand")),
                ("finance_account", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="rent_lease_collections", to="accounting.financeaccount")),
                ("subscription", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="rent_lease_collections", to="subscriptions.subscription")),
                ("voided_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="voided_rent_lease_collections", to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "db_table": "rent_lease_collections",
                "ordering": ["-payment_date", "-created_at", "-id"],
            },
        ),
        migrations.AddIndex("rentleasecollection", models.Index(fields=["subscription", "payment_date"], name="rlc_sub_date_idx")),
        migrations.AddIndex("rentleasecollection", models.Index(fields=["demand", "status"], name="rlc_demand_status_idx")),
        migrations.AddIndex("rentleasecollection", models.Index(fields=["customer", "payment_date"], name="rlc_customer_date_idx")),
        migrations.AddIndex("rentleasecollection", models.Index(fields=["plan_type", "status", "payment_date"], name="rlc_plan_status_date_idx")),
        migrations.AddIndex("rentleasecollection", models.Index(fields=["finance_account", "payment_date"], name="rlc_finance_date_idx")),
        migrations.AddConstraint("rentleasecollection", models.CheckConstraint(condition=Q(amount__gt=0), name="chk_rent_lease_collection_amount_positive")),
        migrations.AddConstraint("rentleasecollection", models.CheckConstraint(condition=Q(plan_type="RENT") | Q(plan_type="LEASE"), name="chk_rent_lease_collection_plan_type")),
        migrations.AddConstraint("rentleasecollection", models.UniqueConstraint(fields=("idempotency_key",), condition=~Q(idempotency_key=""), name="uq_rent_lease_collection_idempotency_key")),
        migrations.AddConstraint("rentleasecollection", models.UniqueConstraint(fields=("external_reference_no",), condition=~Q(external_reference_no=""), name="uq_rent_lease_collection_external_ref")),
    ]
