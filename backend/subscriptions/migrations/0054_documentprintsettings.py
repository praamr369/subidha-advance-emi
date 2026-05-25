# Generated for Phase 5A document print branding settings.

import django.db.models.deletion
from django.db import migrations, models

import subscriptions.models_document_print_settings


class Migration(migrations.Migration):

    dependencies = [
        ("subscriptions", "0053_alter_subscriptiondocument_document_type_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="DocumentPrintSettings",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("business_logo", models.ImageField(blank=True, null=True, upload_to=subscriptions.models_document_print_settings.document_print_logo_upload_to)),
                ("business_name", models.CharField(blank=True, default="", max_length=255)),
                ("business_tagline", models.CharField(blank=True, default="", max_length=255)),
                ("print_address", models.TextField(blank=True, default="")),
                ("print_phone", models.CharField(blank=True, default="", max_length=40)),
                ("print_email", models.EmailField(blank=True, default="", max_length=254)),
                ("print_website", models.CharField(blank=True, default="", max_length=255)),
                ("tax_label", models.CharField(blank=True, default="", max_length=120)),
                ("invoice_terms", models.TextField(blank=True, default="")),
                ("receipt_terms", models.TextField(blank=True, default="")),
                ("delivery_challan_terms", models.TextField(blank=True, default="")),
                ("subscription_contract_terms", models.TextField(blank=True, default="")),
                ("rent_lease_contract_terms", models.TextField(blank=True, default="")),
                ("purchase_bill_terms", models.TextField(blank=True, default="")),
                ("vendor_voucher_terms", models.TextField(blank=True, default="")),
                ("account_statement_terms", models.TextField(blank=True, default="")),
                ("report_footer_note", models.TextField(blank=True, default="")),
                ("authorized_signatory_label", models.CharField(blank=True, default="", max_length=120)),
                ("customer_signature_label", models.CharField(blank=True, default="", max_length=120)),
                ("document_layout_density", models.CharField(choices=[("COMFORTABLE", "Comfortable"), ("COMPACT", "Compact")], default="COMFORTABLE", max_length=16)),
                ("show_watermark", models.BooleanField(default=True)),
                ("show_logo", models.BooleanField(default=True)),
                ("is_active", models.BooleanField(db_index=True, default=True)),
                ("business_profile", models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="document_print_settings", to="subscriptions.businessprofile")),
            ],
            options={
                "db_table": "document_print_settings",
                "ordering": ["-created_at", "-id"],
                "indexes": [models.Index(fields=["is_active"], name="document_pr_is_acti_3cb883_idx")],
            },
        ),
    ]
