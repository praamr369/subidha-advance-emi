from django.core.management.base import BaseCommand
from products_pim.models import PimProduct
from products_pim.services.core import infer_product_type


class Command(BaseCommand):
    help = "Classifies PIM products (Accessories, Raw Materials, Services, Finished Goods) and syncs operational products."

    def handle(self, *args, **options):
        self.stdout.write("Scanning PIM products for classification...")
        products = list(PimProduct.objects.all())
        updated_count = 0

        for pim in products:
            inferred = infer_product_type(pim)
            changed = False
            fields = []

            # 1. Operational product explicit item_type takes precedence
            op_type = getattr(pim.source_product, "item_type", "") if pim.source_product else ""
            if op_type in ("FINISHED_GOOD", "ACCESSORY", "RAW_MATERIAL", "SERVICE"):
                if pim.product_type != op_type:
                    pim.product_type = op_type
                    changed = True
                    fields.append("product_type")
            elif not pim.product_type or inferred != pim.product_type:
                # Update when classification is missing or needs correction per improved heuristics
                pim.product_type = inferred
                changed = True
                fields.append("product_type")

            if changed:
                pim.save(update_fields=fields)
                updated_count += 1
                self.stdout.write(f"  [+] Classified {pim.code} ({pim.name[:40]}) -> {pim.product_type}")

            # Keep operational product in sync
            if pim.source_product_id:
                sp = pim.source_product
                if getattr(sp, "item_type", None) != pim.product_type:
                    sp.item_type = pim.product_type
                    sp.save(update_fields=["item_type"])
                try:
                    from inventory.models import InventoryItem
                    InventoryItem.objects.filter(product=sp).exclude(stock_item_type=pim.product_type).update(stock_item_type=pim.product_type)
                except Exception:
                    pass

            # Propagate to child variants if this is a parent
            if not pim.parent_id and pim.product_type:
                children = pim.child_pim_products.exclude(product_type=pim.product_type)
                child_count = children.count()
                if child_count > 0:
                    children.update(product_type=pim.product_type)
                    self.stdout.write(f"      Propagated {pim.product_type} to {child_count} child variants of {pim.code}")

        self.stdout.write(self.style.SUCCESS(f"Successfully reviewed {len(products)} products; updated {updated_count} classifications."))
