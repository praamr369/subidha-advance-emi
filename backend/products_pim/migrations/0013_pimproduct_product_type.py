from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("products_pim", "0012_productvariants_video_and_media_gallery"),
    ]

    operations = [
        migrations.AddField(
            model_name="pimproduct",
            name="product_type",
            field=models.CharField(
                choices=[
                    ("FINISHED_GOOD", "Finished Good"),
                    ("RAW_MATERIAL", "Raw Material"),
                    ("ACCESSORY", "Accessory"),
                    ("SERVICE", "Service"),
                ],
                db_index=True,
                default="FINISHED_GOOD",
                max_length=20,
            ),
        ),
    ]
