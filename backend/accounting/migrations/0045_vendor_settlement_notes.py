from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("accounting", "0044_staff_advance_workflow"),
    ]

    operations = [
        migrations.AddField(
            model_name="vendorsettlement",
            name="notes",
            field=models.TextField(blank=True, default=""),
        ),
    ]
