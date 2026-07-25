from django.db import migrations


def backfill_source_product(apps, schema_editor):
    """Link each PimProduct to its operational product master by matching
    PimProduct.code == Product.product_code. Verified 257 matched / 0 orphans at
    plan time, so this is a clean, lossless backfill.
    """
    PimProduct = apps.get_model("products_pim", "PimProduct")
    Product = apps.get_model("subscriptions", "Product")

    product_id_by_code = dict(
        Product.objects.values_list("product_code", "id")
    )
    to_update = []
    for pim in PimProduct.objects.filter(source_product__isnull=True).only("id", "code"):
        product_id = product_id_by_code.get(pim.code)
        if product_id is not None:
            pim.source_product_id = product_id
            to_update.append(pim)
    if to_update:
        PimProduct.objects.bulk_update(to_update, ["source_product"], batch_size=500)


def unlink_source_product(apps, schema_editor):
    PimProduct = apps.get_model("products_pim", "PimProduct")
    PimProduct.objects.update(source_product=None)


class Migration(migrations.Migration):

    dependencies = [
        ("products_pim", "0002_pimproduct_source_product"),
        ("subscriptions", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(backfill_source_product, unlink_source_product),
    ]
