from django.db import migrations, models


LEGACY_NON_SETTLEMENT_NAMES = frozenset(
    {
        "customer receivable",
        "security deposit liability",
        "advance emi collection",
        "rent income",
        "lease income",
        "direct sale income",
        "waiver/loss",
        "partner commission payable",
        "damage deduction/recovery",
        "inventory stock value",
        "ledger posting profiles (system)",
    }
)


def forwards_flag_legacy_accounts(apps, schema_editor):
    FinanceAccount = apps.get_model("accounting", "FinanceAccount")
    for fa in FinanceAccount.objects.iterator():
        key = (fa.name or "").strip().lower()
        if key in LEGACY_NON_SETTLEMENT_NAMES:
            FinanceAccount.objects.filter(pk=fa.pk).update(is_real_settlement_account=False)


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("accounting", "0016_rename_accounting_j_source__5b4e91_idx_accounting__source__f104b3_idx_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="financeaccount",
            name="is_real_settlement_account",
            field=models.BooleanField(db_index=True, default=True),
        ),
        migrations.RunPython(forwards_flag_legacy_accounts, noop_reverse),
    ]
