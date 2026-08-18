from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('products_pim', '0007_pimproduct_brand_pimproduct_uuid_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='pimproduct',
            name='locked_attributes',
            field=models.JSONField(
                default=list,
                blank=True,
                help_text='List of attribute IDs manually locked by operator',
            ),
        ),
    ]
