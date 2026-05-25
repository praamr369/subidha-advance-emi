# Generated for Contract Amendment Phase 1 backend foundation.

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("subscriptions", "0070_documentprintsettings"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AlterField(
            model_name="contractamendment",
            name="subscription",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="amendments", to="subscriptions.subscription"),
        ),
        migrations.AlterField(
            model_name="contractamendment",
            name="amendment_type",
            field=models.CharField(choices=[("ADDRESS_CHANGE", "Address Change"), ("CONTACT_CORRECTION", "Contact Correction"), ("LEGAL_DOCUMENT_CORRECTION", "Legal Document Correction"), ("TENURE_EXTENSION", "Tenure Extension"), ("SCHEDULE_CORRECTION", "Schedule Correction"), ("PRODUCT_CHANGE", "Product Change"), ("LUCKY_ID_CHANGE", "Lucky ID Change"), ("BATCH_CHANGE", "Batch Change"), ("DEPOSIT_ADJUSTMENT", "Deposit Adjustment"), ("EMI_AMOUNT_CHANGE", "EMI Amount Change"), ("CONTRACT_PRICE_CHANGE", "Contract Price Change"), ("RENT_AMOUNT_CHANGE", "Rent Amount Change"), ("LEASE_TERM_CHANGE", "Lease Term Change"), ("OTHER", "Other"), ("PRODUCT_UPGRADE", "Product Upgrade (Legacy)")], db_index=True, max_length=40),
        ),
        migrations.AlterField(
            model_name="contractamendment",
            name="status",
            field=models.CharField(choices=[("REQUESTED", "Requested"), ("UNDER_REVIEW", "Under Review"), ("APPROVED", "Approved"), ("REJECTED", "Rejected"), ("IMPLEMENTED", "Implemented"), ("CANCELLED", "Cancelled"), ("APPLIED", "Applied (Legacy)")], db_index=True, default="REQUESTED", max_length=20),
        ),
        migrations.AlterField(
            model_name="contractamendment",
            name="previous_values",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AlterField(
            model_name="contractamendment",
            name="new_values",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name="contractamendment",
            name="amendment_no",
            field=models.CharField(blank=True, db_index=True, max_length=40, null=True, unique=True),
        ),
        migrations.AddField(
            model_name="contractamendment",
            name="contract_type",
            field=models.CharField(choices=[("EMI_SUBSCRIPTION", "EMI Subscription"), ("RENT_LEASE", "Rent / Lease")], db_index=True, default="EMI_SUBSCRIPTION", max_length=24),
        ),
        migrations.AddField(
            model_name="contractamendment",
            name="rent_lease_contract",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="rent_lease_contract_amendments", to="subscriptions.subscription"),
        ),
        migrations.AddField(
            model_name="contractamendment",
            name="customer",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="contract_amendments", to="subscriptions.customer"),
        ),
        migrations.AddField(
            model_name="contractamendment",
            name="partner",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="partner_contract_amendments", to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name="contractamendment",
            name="requested_role",
            field=models.CharField(choices=[("CUSTOMER", "Customer"), ("PARTNER", "Partner")], db_index=True, default="CUSTOMER", max_length=16),
        ),
        migrations.AddField(
            model_name="contractamendment",
            name="old_values",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name="contractamendment",
            name="requested_values",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name="contractamendment",
            name="approved_values",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name="contractamendment",
            name="implemented_values",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name="contractamendment",
            name="admin_note",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="contractamendment",
            name="financial_impact_amount",
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True),
        ),
        migrations.AddField(
            model_name="contractamendment",
            name="requires_emi_recalculation",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="contractamendment",
            name="requires_inventory_review",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="contractamendment",
            name="requires_lucky_id_review",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="contractamendment",
            name="requires_accounting_review",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="contractamendment",
            name="requires_rent_lease_review",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="contractamendment",
            name="effective_date",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="contractamendment",
            name="implemented_by",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="implemented_contract_amendments", to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name="contractamendment",
            name="implemented_at",
            field=models.DateTimeField(blank=True, db_index=True, null=True),
        ),
        migrations.AddField(
            model_name="contractamendment",
            name="metadata",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name="contractamendment",
            name="updated_at",
            field=models.DateTimeField(auto_now=True, db_index=True),
        ),
        migrations.AddIndex(
            model_name="contractamendment",
            index=models.Index(fields=["contract_type", "status"], name="contract_am_type_status_idx"),
        ),
        migrations.AddIndex(
            model_name="contractamendment",
            index=models.Index(fields=["customer", "status"], name="contract_am_customer_status_idx"),
        ),
        migrations.AddIndex(
            model_name="contractamendment",
            index=models.Index(fields=["partner", "status"], name="contract_am_partner_status_idx"),
        ),
    ]
