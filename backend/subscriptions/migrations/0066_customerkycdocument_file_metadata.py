from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("subscriptions", "0065_relax_emi_lucky_constraint_for_cancelled"),
    ]

    operations = [
        migrations.AddField(
            model_name="customerkycdocument",
            name="content_type",
            field=models.CharField(blank=True, default="", max_length=100),
        ),
        migrations.AddField(
            model_name="customerkycdocument",
            name="file_size",
            field=models.PositiveBigIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="customerkycdocument",
            name="original_filename",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
    ]
