from django.db import transaction
from products_pim.models import ProductVariant, PimProduct
from products_core.models import Product, ProductCategoryMaster, ProductSubcategoryMaster

class PIMSyncService:
    @staticmethod
    @transaction.atomic
    def sync_variant_to_operational_product(variant: ProductVariant) -> Product:
        """
        Syncs a ProductVariant to the operational products_core.Product.
        If it doesn't exist, it creates one.
        """
        pim_product = variant.product
        
        # Get or create the core Product based on SKU
        # Using SKU as the immutable link key between variant and operational product if link is missing
        if variant.operational_product:
            core_product = variant.operational_product
        else:
            # Fallback to search by sku, or create
            core_product, created = Product.objects.get_or_create(
                product_code=variant.sku, # Using SKU as the operational product_code
                defaults={
                    "name": f"{pim_product.name} ({variant.sku})",
                    "base_price": variant.price,
                }
            )
            # Link them
            variant.operational_product = core_product
            variant.save(update_fields=['operational_product'])

        # Update core_product fields
        core_product.name = f"{pim_product.name} ({variant.sku})"
        core_product.base_price = variant.price
        core_product.sku = variant.sku
        core_product.is_active = variant.is_active
        if variant.image:
            core_product.image = variant.image

        
        # Try to sync category if names match, this is best-effort since models are separate
        if pim_product.category:
            try:
                cat = ProductCategoryMaster.objects.filter(name=pim_product.category.name).first()
                if cat:
                    core_product.category_master = cat
                    core_product.category = cat.name
            except Exception:
                pass
                
        if pim_product.subcategory:
            try:
                subcat = ProductSubcategoryMaster.objects.filter(name=pim_product.subcategory.name).first()
                if subcat:
                    core_product.subcategory_master = subcat
                    core_product.subcategory = subcat.name
            except Exception:
                pass

        core_product.save()
        return core_product
