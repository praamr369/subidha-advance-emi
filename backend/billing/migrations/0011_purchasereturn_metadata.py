from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("billing", "0010_direct_sale_return_control_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="purchasereturn",
            name="metadata",
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
