from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("ai_assistant", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="aiknowledgesource",
            name="content_text",
            field=models.TextField(blank=True, default=""),
        ),
    ]
