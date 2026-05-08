# Generated manually for Phase 5 — online customer purchase enquiries / vendor sourcing bridge.

import django.db.models.deletion
from decimal import Decimal

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounting", "0020_vendor_quote_unique_per_request"),
        ("inventory", "0016_alter_purchaseneed_source_module"),
        ("subscriptions", "0064_operationalcancellation_manual_source"),
    ]

    operations = [
        migrations.CreateModel(
            name="CustomerPurchaseEnquiry",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("enquiry_no", models.CharField(db_index=True, max_length=60, unique=True)),
                ("customer_name", models.CharField(max_length=160)),
                ("phone", models.CharField(db_index=True, max_length=20)),
                ("email", models.EmailField(blank=True, default="", max_length=254)),
                ("product_name", models.CharField(blank=True, default="", max_length=255)),
                ("category_text", models.CharField(blank=True, db_index=True, default="", max_length=120)),
                ("material", models.CharField(blank=True, default="", max_length=120)),
                ("quantity", models.DecimalField(decimal_places=3, default=Decimal("1.000"), max_digits=12)),
                ("budget_amount", models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ("delivery_address", models.TextField(blank=True, default="")),
                ("city", models.CharField(blank=True, db_index=True, default="", max_length=100)),
                ("district", models.CharField(blank=True, db_index=True, default="", max_length=100)),
                ("state", models.CharField(blank=True, db_index=True, default="", max_length=100)),
                ("pincode", models.CharField(blank=True, db_index=True, default="", max_length=20)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("NEW", "New"),
                            ("SOURCING", "Sourcing"),
                            ("QUOTE_REQUESTED", "Quote requested"),
                            ("VENDOR_SELECTED", "Vendor selected"),
                            ("CONVERTED", "Converted"),
                            ("CANCELLED", "Cancelled"),
                        ],
                        db_index=True,
                        default="NEW",
                        max_length=24,
                    ),
                ),
                (
                    "customer",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="customer_purchase_enquiries",
                        to="subscriptions.customer",
                    ),
                ),
                (
                    "draft_purchase_order",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="customer_purchase_enquiry_sources",
                        to="inventory.purchaseorder",
                    ),
                ),
                (
                    "product",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="customer_purchase_enquiries",
                        to="subscriptions.product",
                    ),
                ),
                (
                    "public_lead",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="customer_purchase_enquiries",
                        to="subscriptions.publiclead",
                    ),
                ),
                (
                    "selected_vendor_quote",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="selected_for_customer_enquiries",
                        to="accounting.vendorquote",
                    ),
                ),
            ],
            options={
                "db_table": "accounting_customer_purchase_enquiries",
                "ordering": ["-created_at", "-id"],
            },
        ),
        migrations.AddIndex(
            model_name="customerpurchaseenquiry",
            index=models.Index(fields=["status", "created_at"], name="acct_cpe_stat_crt_idx"),
        ),
        migrations.AddIndex(
            model_name="customerpurchaseenquiry",
            index=models.Index(fields=["pincode", "status"], name="acct_cpe_pc_stat_idx"),
        ),
    ]
