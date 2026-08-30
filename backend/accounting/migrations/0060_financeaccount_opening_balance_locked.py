from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounting", "0059_customeropeningoutstanding_migration_row"),
    ]

    operations = [
        migrations.AddField(
            model_name="financeaccount",
            name="opening_balance_locked",
            field=models.BooleanField(default=False, db_index=True),
        ),
        migrations.AddField(
            model_name="financeaccount",
            name="opening_balance_set_at",
            field=models.DateTimeField(null=True, blank=True),
        ),
    ]
