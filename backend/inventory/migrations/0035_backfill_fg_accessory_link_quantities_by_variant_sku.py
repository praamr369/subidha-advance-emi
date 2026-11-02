from decimal import Decimal
from django.db import migrations


def backfill_quantities_correctly(apps, schema_editor):
    FinishedGoodAccessoryLink = apps.get_model('inventory', 'FinishedGoodAccessoryLink')
    ProductRelationship = apps.get_model('products_core', 'ProductRelationship')

    for link in FinishedGoodAccessoryLink.objects.select_related('finished_good', 'accessory').all():
        if not link.accessory or not link.finished_good:
            continue
        fg_item = link.finished_good
        acc_item = link.accessory
        if not acc_item.product_id:
            continue

        rel = None
        # Primary lookup: match by variant SKU directly (SKU is unique across variants)
        if fg_item.sku:
            rel = ProductRelationship.objects.filter(
                parent_variant_sku=fg_item.sku,
                related_product_id=acc_item.product_id,
            ).first()

        # Fallback lookup: match by base product ID
        if not rel and fg_item.product_id:
            rel = ProductRelationship.objects.filter(
                product_id=fg_item.product_id,
                related_product_id=acc_item.product_id,
            ).first()

        if rel and rel.quantity and link.quantity != rel.quantity:
            link.quantity = rel.quantity
            link.save(update_fields=['quantity'])


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0034_finishedgoodaccessorylink_quantity'),
    ]

    operations = [
        migrations.RunPython(backfill_quantities_correctly, reverse_code=migrations.RunPython.noop),
    ]

