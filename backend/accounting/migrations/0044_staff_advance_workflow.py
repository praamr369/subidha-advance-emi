from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.core.validators
import django.utils.timezone
from decimal import Decimal


class Migration(migrations.Migration):
    dependencies = [("accounting", "0043_customer_opening_outstanding"), migrations.swappable_dependency(settings.AUTH_USER_MODEL)]
    operations = [
        migrations.CreateModel(
            name="StaffAdvance",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(db_index=True, default=django.utils.timezone.now)), ("updated_at", models.DateTimeField(auto_now=True)),
                ("request_date", models.DateField(db_index=True)),
                ("amount", models.DecimalField(decimal_places=2, max_digits=12, validators=[django.core.validators.MinValueValidator(Decimal("0.01"))])),
                ("recovered_amount", models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=12, validators=[django.core.validators.MinValueValidator(Decimal("0.00"))])),
                ("reason", models.TextField()),
                ("status", models.CharField(choices=[("DRAFT", "Draft"), ("APPROVED", "Approved"), ("DISBURSED", "Disbursed"), ("PARTIALLY_RECOVERED", "Partially Recovered"), ("RECOVERED", "Recovered"), ("CANCELLED", "Cancelled")], db_index=True, default="DRAFT", max_length=24)),
                ("reference_no", models.CharField(blank=True, db_index=True, default="", max_length=100)),
                ("approved_at", models.DateTimeField(blank=True, null=True)), ("disbursed_at", models.DateTimeField(blank=True, null=True)), ("notes", models.TextField(blank=True, default="")),
                ("approved_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="approved_staff_advances", to=settings.AUTH_USER_MODEL)),
                ("employee", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="staff_advances", to="accounting.employeeprofile")),
                ("finance_account", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="staff_advances", to="accounting.financeaccount")),
                ("posted_journal_entry", models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="posted_staff_advance", to="accounting.journalentry")),
            ], options={"db_table": "accounting_staff_advances", "ordering": ["-request_date", "-id"]},
        ),
        migrations.CreateModel(
            name="StaffAdvanceRecovery",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(db_index=True, default=django.utils.timezone.now)), ("updated_at", models.DateTimeField(auto_now=True)),
                ("recovery_date", models.DateField(db_index=True)),
                ("amount", models.DecimalField(decimal_places=2, max_digits=12, validators=[django.core.validators.MinValueValidator(Decimal("0.01"))])),
                ("reference_no", models.CharField(blank=True, db_index=True, default="", max_length=100)),
                ("finance_account", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="staff_advance_recoveries", to="accounting.financeaccount")),
                ("posted_journal_entry", models.OneToOneField(on_delete=django.db.models.deletion.PROTECT, related_name="posted_staff_advance_recovery", to="accounting.journalentry")),
                ("recorded_by", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="recorded_staff_advance_recoveries", to=settings.AUTH_USER_MODEL)),
                ("staff_advance", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="recoveries", to="accounting.staffadvance")),
            ], options={"db_table": "accounting_staff_advance_recoveries", "ordering": ["-recovery_date", "-id"]},
        ),
    ]
