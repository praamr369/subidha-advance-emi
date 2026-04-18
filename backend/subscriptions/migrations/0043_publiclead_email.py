from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("subscriptions", "0042_business_setup"),
    ]

    operations = [
        migrations.AddField(
            model_name="publiclead",
            name="email",
            field=models.EmailField(blank=True, default="", max_length=254),
        ),
    ]

