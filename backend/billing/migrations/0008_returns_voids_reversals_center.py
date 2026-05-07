from decimal import Decimal

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.core.validators
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        ("accounting", "0018_alter_financeaccountcoamapping_purpose"),
        ("inventory", "0016_alter_purchaseneed_source_module"),
        ("billing", "0007_directsale_customer_gst_type_and_more"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="CustomerRefund",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("refund_no", models.CharField(db_index=True, max_length=48, unique=True)),
                ("amount", models.DecimalField(decimal_places=2, max_digits=12, validators=[django.core.validators.MinValueValidator(Decimal("0.01"))])),
                ("method", models.CharField(choices=[("CASH_REFUND", "Cash Refund"), ("UPI_REFUND", "UPI Refund"), ("BANK_REFUND", "Bank Refund")], max_length=16)),
                ("status", models.CharField(choices=[("DRAFT", "Draft"), ("APPROVED", "Approved"), ("PAID", "Paid"), ("CANCELLED", "Cancelled")], db_index=True, default="DRAFT", max_length=16)),
                ("reason", models.TextField()),
                ("approved_at", models.DateTimeField(blank=True, db_index=True, null=True)),
                ("paid_at", models.DateTimeField(blank=True, db_index=True, null=True)),
                ("approved_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="approved_customer_refunds", to=settings.AUTH_USER_MODEL)),
                ("paid_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="paid_customer_refunds", to=settings.AUTH_USER_MODEL)),
                ("finance_account", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="customer_refunds", to="accounting.financeaccount")),
                ("posted_journal_entry", models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="customer_refund", to="accounting.journalentry")),
                ("customer", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="customer_refunds", to="subscriptions.customer")),
            ],
            options={"db_table": "billing_customer_refunds", "ordering": ["-created_at", "-id"]},
        ),
        migrations.CreateModel(
            name="DirectSaleReturn",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("return_no", models.CharField(db_index=True, max_length=48, unique=True)),
                ("status", models.CharField(choices=[("DRAFT", "Draft"), ("APPROVED", "Approved"), ("POSTED", "Posted"), ("CANCELLED", "Cancelled")], db_index=True, default="DRAFT", max_length=16)),
                ("reason", models.TextField()),
                ("subtotal", models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=12)),
                ("tax_total", models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=12)),
                ("grand_total", models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=12)),
                ("stock_effect", models.BooleanField(db_index=True, default=True)),
                ("approved_at", models.DateTimeField(blank=True, db_index=True, null=True)),
                ("posted_at", models.DateTimeField(blank=True, db_index=True, null=True)),
                ("approved_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="approved_direct_sale_returns", to=settings.AUTH_USER_MODEL)),
                ("posted_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="posted_direct_sale_returns", to=settings.AUTH_USER_MODEL)),
                ("credit_note", models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="direct_sale_return", to="billing.billingcreditnote")),
                ("customer", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="direct_sale_returns", to="subscriptions.customer")),
                ("direct_sale", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="sale_returns", to="billing.directsale")),
                ("original_invoice", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="sale_returns", to="billing.billinginvoice")),
            ],
            options={"db_table": "billing_direct_sale_returns", "ordering": ["-created_at", "-id"]},
        ),
        migrations.CreateModel(
            name="PurchaseReturn",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("return_no", models.CharField(db_index=True, max_length=48, unique=True)),
                ("status", models.CharField(choices=[("DRAFT", "Draft"), ("POSTED", "Posted"), ("CANCELLED", "Cancelled")], db_index=True, default="DRAFT", max_length=16)),
                ("return_date", models.DateField(db_index=True)),
                ("reason", models.TextField()),
                ("subtotal", models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=12)),
                ("tax_total", models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=12)),
                ("grand_total", models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=12)),
                ("posted_at", models.DateTimeField(blank=True, db_index=True, null=True)),
                ("posted_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="posted_purchase_returns", to=settings.AUTH_USER_MODEL)),
                ("posted_journal_entry", models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="purchase_return", to="accounting.journalentry")),
                ("purchase_bill", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="purchase_returns", to="inventory.purchasebill")),
                ("vendor", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="purchase_returns", to="inventory.vendor")),
            ],
            options={"db_table": "billing_purchase_returns", "ordering": ["-created_at", "-id"]},
        ),
        migrations.CreateModel(
            name="DirectSaleReturnLine",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("description", models.CharField(max_length=255)),
                ("quantity", models.DecimalField(decimal_places=3, max_digits=12, validators=[django.core.validators.MinValueValidator(Decimal("0.001"))])),
                ("unit_price", models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=12)),
                ("taxable_value", models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=12)),
                ("tax_amount", models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=12)),
                ("line_total", models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=12)),
                ("direct_sale_line", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="return_lines", to="billing.directsaleline")),
                ("direct_sale_return", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="lines", to="billing.directsalereturn")),
                ("inventory_item", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="direct_sale_return_lines", to="inventory.inventoryitem")),
            ],
            options={"db_table": "billing_direct_sale_return_lines", "ordering": ["id"]},
        ),
        migrations.CreateModel(
            name="PurchaseReturnLine",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("description", models.CharField(blank=True, default="", max_length=255)),
                ("quantity", models.DecimalField(decimal_places=3, max_digits=12, validators=[django.core.validators.MinValueValidator(Decimal("0.001"))])),
                ("unit_cost", models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=12)),
                ("taxable_value", models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=12)),
                ("tax_amount", models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=12)),
                ("line_total", models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=12)),
                ("inventory_item", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="purchase_return_lines", to="inventory.inventoryitem")),
                ("purchase_bill_line", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="purchase_return_lines", to="inventory.purchasebillline")),
                ("purchase_return", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="lines", to="billing.purchasereturn")),
            ],
            options={"db_table": "billing_purchase_return_lines", "ordering": ["id"]},
        ),
        migrations.CreateModel(
            name="CustomerCreditLedger",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("entry_date", models.DateField(db_index=True)),
                ("reference_no", models.CharField(blank=True, db_index=True, default="", max_length=80)),
                ("credit_amount", models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=12)),
                ("debit_amount", models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=12)),
                ("notes", models.TextField(blank=True, default="")),
                ("credit_note", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="credit_ledger_entries", to="billing.billingcreditnote")),
                ("customer", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="credit_ledger_entries", to="subscriptions.customer")),
                ("direct_sale_return", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="credit_ledger_entries", to="billing.directsalereturn")),
                ("posted_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="posted_customer_credit_entries", to=settings.AUTH_USER_MODEL)),
                ("refund", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="credit_ledger_entries", to="billing.customerrefund")),
            ],
            options={"db_table": "billing_customer_credit_ledger", "ordering": ["entry_date", "id"]},
        ),
        migrations.AddField(
            model_name="customerrefund",
            name="direct_sale_return",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="customer_refunds", to="billing.directsalereturn"),
        ),
        migrations.AddIndex(
            model_name="customerrefund",
            index=models.Index(fields=["status", "created_at"], name="billing_cus_status_31f0ca_idx"),
        ),
        migrations.AddIndex(
            model_name="customerrefund",
            index=models.Index(fields=["customer", "created_at"], name="billing_cus_customer_f8aa50_idx"),
        ),
        migrations.AddIndex(
            model_name="directsalereturn",
            index=models.Index(fields=["status", "created_at"], name="billing_dir_status_b11cc6_idx"),
        ),
        migrations.AddIndex(
            model_name="directsalereturn",
            index=models.Index(fields=["customer", "created_at"], name="billing_dir_customer_780a4d_idx"),
        ),
        migrations.AddIndex(
            model_name="purchasereturn",
            index=models.Index(fields=["status", "return_date"], name="billing_pur_status_1d2336_idx"),
        ),
        migrations.AddIndex(
            model_name="purchasereturn",
            index=models.Index(fields=["vendor", "return_date"], name="billing_pur_vendor_5d703d_idx"),
        ),
        migrations.AddIndex(
            model_name="customercreditledger",
            index=models.Index(fields=["customer", "entry_date", "id"], name="billing_cus_customer_a4b90f_idx"),
        ),
    ]
