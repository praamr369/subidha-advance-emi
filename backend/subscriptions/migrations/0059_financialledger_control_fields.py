from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):
    dependencies = [
        ("accounting", "0015_journalentrygroup_and_journal_link"),
        ("subscriptions", "0058_rename_business_eve_event_t_d43f6b_idx_business_ev_event_t_ba4439_idx_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="financialledger",
            name="journal_group",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="financial_ledger_entries", to="accounting.journalentrygroup"),
        ),
        migrations.AddField(
            model_name="financialledger",
            name="posted_at",
            field=models.DateTimeField(db_index=True, default=django.utils.timezone.now),
        ),
        migrations.AddField(
            model_name="financialledger",
            name="posting_side",
            field=models.CharField(blank=True, default="", max_length=6),
        ),
        migrations.AddField(
            model_name="financialledger",
            name="posting_status",
            field=models.CharField(db_index=True, default="POSTED", max_length=16),
        ),
    ]

