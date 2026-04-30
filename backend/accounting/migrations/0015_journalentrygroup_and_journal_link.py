from decimal import Decimal

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone
import accounting.models


class Migration(migrations.Migration):
    dependencies = [
        ("accounting", "0014_employeeprofile_address_and_more"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="JournalEntryGroup",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("journal_group_id", models.CharField(db_index=True, default=accounting.models.generate_journal_group_id, max_length=48, unique=True)),
                ("source_module", models.CharField(db_index=True, max_length=160)),
                ("source_object_id", models.CharField(db_index=True, max_length=120)),
                ("transaction_date", models.DateField(db_index=True)),
                ("narration", models.TextField(blank=True, default="")),
                ("total_debit", models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=12)),
                ("total_credit", models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=12)),
                ("is_balanced", models.BooleanField(db_index=True, default=True)),
                ("created_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="created_journal_groups", to=settings.AUTH_USER_MODEL)),
                ("reversed_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="reversed_journal_groups", to=settings.AUTH_USER_MODEL)),
                ("reversal_of", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="reversal_groups", to="accounting.journalentrygroup")),
            ],
            options={
                "db_table": "accounting_journal_entry_groups",
                "ordering": ["-transaction_date", "-created_at", "-id"],
            },
        ),
        migrations.AddIndex(
            model_name="journalentrygroup",
            index=models.Index(fields=["source_module", "source_object_id"], name="accounting_j_source__5b4e91_idx"),
        ),
        migrations.AddIndex(
            model_name="journalentrygroup",
            index=models.Index(fields=["transaction_date", "is_balanced"], name="accounting_j_transac_70571f_idx"),
        ),
        migrations.AddField(
            model_name="journalentry",
            name="journal_group",
            field=models.ForeignKey(blank=True, db_index=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="journal_entries", to="accounting.journalentrygroup"),
        ),
    ]

