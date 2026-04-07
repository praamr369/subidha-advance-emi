from django.db import migrations, models

import subscriptions.models


class Migration(migrations.Migration):

    dependencies = [
        ("subscriptions", "0031_alter_auditlog_action_type"),
    ]

    operations = [
        migrations.AlterField(
            model_name="product",
            name="image",
            field=models.ImageField(
                blank=True,
                null=True,
                upload_to=subscriptions.models.product_image_upload_to,
            ),
        ),
    ]
