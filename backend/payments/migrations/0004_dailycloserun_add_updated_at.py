from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("payments", "0003_advance_forfeiture")]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name="dailycloserun",
                    name="updated_at",
                    field=models.DateTimeField(auto_now=True),
                )
            ],
            database_operations=[],
        )
    ]
