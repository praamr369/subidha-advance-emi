import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounting", "0035_kyc_expiry_date"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # ── HR statutory deduction fields on EmployeeProfile ──────────────────
        migrations.AddField(
            model_name="employeeprofile",
            name="pf_number",
            field=models.CharField(blank=True, default="", max_length=40, verbose_name="PF Account Number"),
        ),
        migrations.AddField(
            model_name="employeeprofile",
            name="esi_number",
            field=models.CharField(blank=True, default="", max_length=40, verbose_name="ESI IP Number"),
        ),
        migrations.AddField(
            model_name="employeeprofile",
            name="pt_registration_no",
            field=models.CharField(blank=True, default="", max_length=40, verbose_name="Professional Tax Reg No"),
        ),
        migrations.AddField(
            model_name="employeeprofile",
            name="pf_eligible",
            field=models.BooleanField(default=False, verbose_name="PF Eligible"),
        ),
        migrations.AddField(
            model_name="employeeprofile",
            name="esi_eligible",
            field=models.BooleanField(default=False, verbose_name="ESI Eligible"),
        ),
        migrations.AddField(
            model_name="employeeprofile",
            name="pt_eligible",
            field=models.BooleanField(default=False, verbose_name="Professional Tax Eligible"),
        ),
        migrations.AddField(
            model_name="employeeprofile",
            name="pt_monthly_amount",
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=8, null=True, verbose_name="Professional Tax (₹/month)"),
        ),

        # ── TDSDeduction table ────────────────────────────────────────────────
        migrations.CreateModel(
            name="TDSDeduction",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("updated_at", models.DateTimeField(auto_now=True, db_index=True)),
                ("section", models.CharField(
                    choices=[
                        ("194C", "194C – Contractor/Sub-contractor"),
                        ("194I", "194I – Rent"),
                        ("194J", "194J – Professional/Technical Services"),
                        ("194H", "194H – Commission/Brokerage"),
                        ("194A", "194A – Interest (non-bank)"),
                        ("194Q", "194Q – Purchase of Goods"),
                        ("OTHER", "Other"),
                    ],
                    db_index=True, default="OTHER", max_length=20,
                )),
                ("transaction_date", models.DateField(db_index=True)),
                ("gross_amount", models.DecimalField(decimal_places=2, max_digits=14)),
                ("tds_rate", models.DecimalField(decimal_places=2, help_text="Rate %", max_digits=5)),
                ("tds_amount", models.DecimalField(decimal_places=2, max_digits=14)),
                ("net_amount", models.DecimalField(decimal_places=2, max_digits=14)),
                ("reference_no", models.CharField(blank=True, default="", max_length=80)),
                ("challan_no", models.CharField(blank=True, default="", max_length=80)),
                ("deposit_date", models.DateField(blank=True, null=True)),
                ("status", models.CharField(
                    choices=[
                        ("PENDING", "Pending Deposit"),
                        ("DEPOSITED", "Deposited to Govt"),
                        ("FILED", "Filed in Return"),
                    ],
                    db_index=True, default="PENDING", max_length=20,
                )),
                ("financial_year", models.CharField(blank=True, db_index=True, default="", max_length=10)),
                ("quarter", models.CharField(blank=True, db_index=True, default="", max_length=4)),
                ("notes", models.TextField(blank=True, default="")),
                ("vendor", models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name="tds_deductions",
                    to="accounting.vendor",
                )),
                ("recorded_by", models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name="recorded_tds_deductions",
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={"db_table": "accounting_tds_deductions", "ordering": ["-transaction_date", "-id"]},
        ),

        # ── TCSCollection table ───────────────────────────────────────────────
        migrations.CreateModel(
            name="TCSCollection",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("updated_at", models.DateTimeField(auto_now=True, db_index=True)),
                ("customer_name", models.CharField(db_index=True, max_length=200)),
                ("customer_pan", models.CharField(blank=True, default="", max_length=20)),
                ("section", models.CharField(
                    choices=[
                        ("206C(1H)", "206C(1H) – Sale of Goods (>₹50L)"),
                        ("206C(1)", "206C(1) – Timber/Forest/Scrap"),
                        ("206CCA", "206CCA – Non-filer higher rate"),
                        ("OTHER", "Other"),
                    ],
                    db_index=True, default="OTHER", max_length=20,
                )),
                ("transaction_date", models.DateField(db_index=True)),
                ("sale_amount", models.DecimalField(decimal_places=2, max_digits=14)),
                ("tcs_rate", models.DecimalField(decimal_places=2, help_text="Rate %", max_digits=5)),
                ("tcs_amount", models.DecimalField(decimal_places=2, max_digits=14)),
                ("reference_no", models.CharField(blank=True, default="", max_length=80)),
                ("challan_no", models.CharField(blank=True, default="", max_length=80)),
                ("deposit_date", models.DateField(blank=True, null=True)),
                ("status", models.CharField(
                    choices=[
                        ("PENDING", "Pending Deposit"),
                        ("DEPOSITED", "Deposited to Govt"),
                        ("FILED", "Filed in Return"),
                    ],
                    db_index=True, default="PENDING", max_length=20,
                )),
                ("financial_year", models.CharField(blank=True, db_index=True, default="", max_length=10)),
                ("quarter", models.CharField(blank=True, db_index=True, default="", max_length=4)),
                ("notes", models.TextField(blank=True, default="")),
                ("recorded_by", models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name="recorded_tcs_collections",
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={"db_table": "accounting_tcs_collections", "ordering": ["-transaction_date", "-id"]},
        ),
    ]
