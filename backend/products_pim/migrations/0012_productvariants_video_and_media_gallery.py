from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("products_pim", "0011_attributeoption_extra_cost"),
    ]

    operations = [
        # Add video to ProductVariant
        migrations.AddField(
            model_name="productvariant",
            name="video",
            field=models.FileField(blank=True, null=True, upload_to="pim/variants/videos/"),
        ),
        # New ProductMediaItem model
        migrations.CreateModel(
            name="ProductMediaItem",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("product", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="media_items", to="products_pim.pimproduct")),
                ("variant", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="media_items", to="products_pim.productvariant")),
                ("kind", models.CharField(choices=[("IMAGE", "Image"), ("VIDEO", "Video")], default="IMAGE", max_length=10)),
                ("scope", models.CharField(choices=[("ALL_VARIANTS", "Shared across all variants"), ("VARIANT", "Specific variant only")], default="ALL_VARIANTS", max_length=20)),
                ("file", models.FileField(upload_to="pim/gallery/")),
                ("title", models.CharField(blank=True, max_length=200)),
                ("is_hero", models.BooleanField(default=False, help_text="Hero image shown as primary in catalog")),
                ("display_order", models.PositiveIntegerField(default=0)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={
                "verbose_name": "Product Media Item",
                "verbose_name_plural": "Product Media Items",
                "ordering": ["display_order", "-created_at"],
            },
        ),
    ]
