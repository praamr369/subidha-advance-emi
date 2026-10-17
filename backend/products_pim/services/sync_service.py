from django.db import transaction
from products_pim.models import ProductVariant, PimProduct
from products_core.models import Product, ProductCategoryMaster, ProductSubcategoryMaster

class PIMSyncService:
    @staticmethod
    def get_variant_display_name(variant: ProductVariant) -> str:
        if getattr(variant, "variant_name", None) and str(variant.variant_name).strip():
            return str(variant.variant_name).strip()[:255]
        pim_product = variant.product
        attributes = []
        # Prefer variant-defining attributes first so operational titles stay concise (e.g. Size, Color)
        v_attrs = list(variant.attribute_values.select_related('attribute').all())
        variant_defining_attrs = [va for va in v_attrs if getattr(va.attribute, 'is_variant_defining', False)]
        chosen_attrs = variant_defining_attrs if variant_defining_attrs else v_attrs

        for v_attr in chosen_attrs:
            val = v_attr.value_text
            if not val and v_attr.value_number is not None:
                val = str(v_attr.value_number).rstrip('0').rstrip('.')
            if not val and v_attr.value_boolean is not None:
                val = "Yes" if v_attr.value_boolean else "No"
                
            if val:
                attributes.append(f"{v_attr.attribute.name}: {val}")
                
        if attributes:
            display_name = f"{pim_product.name} ({', '.join(attributes)})"
        else:
            display_name = pim_product.name

        # Product.name in products_core has max_length=255. Ensure safety against DB overflow!
        if len(display_name) > 255:
            display_name = display_name[:252] + "..."
        return display_name

    @staticmethod
    @transaction.atomic
    def rename_variant_sku(variant: ProductVariant, old_sku: str) -> ProductVariant:
        """Synchronize an admin-approved SKU rename across PIM and operations.

        Foreign-key history is preserved; only the human-readable identifier
        fields are changed. The caller must have already validated the new SKU
        on ``variant``.
        """
        new_sku = (variant.sku or "").strip()
        old_sku = (old_sku or "").strip()
        if not old_sku or old_sku == new_sku:
            return variant

        if ProductVariant.objects.exclude(pk=variant.pk).filter(sku=new_sku).exists():
            from rest_framework.exceptions import ValidationError
            raise ValidationError({"sku": "A variant already uses this SKU."})

        from products_core.models import Product as CoreProduct
        from products_pim.models import PimProduct

        child = PimProduct.objects.filter(code=old_sku, parent_id=variant.product_id).first()
        if child:
            if PimProduct.objects.exclude(pk=child.pk).filter(code=new_sku).exists():
                from rest_framework.exceptions import ValidationError
                raise ValidationError({"sku": "A PIM product already uses this code."})
            child.code = new_sku
            child.save(update_fields=["code", "updated_at"])

        operational = variant.operational_product
        if operational:
            if CoreProduct.objects.exclude(pk=operational.pk).filter(product_code=new_sku).exists():
                from rest_framework.exceptions import ValidationError
                raise ValidationError({"sku": "An operational product already uses this code."})
            operational.product_code = new_sku
            operational.sku = new_sku
            operational.save(update_fields=["product_code", "sku"])

        return variant

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
            sku_key = (variant.sku or "")[:50]
            core_product, created = Product.objects.get_or_create(
                product_code=sku_key,
                defaults={
                    "name": PIMSyncService.get_variant_display_name(variant)[:255],
                    "base_price": variant.price,
                }
            )
            # Link them
            variant.operational_product = core_product
            variant.save(update_fields=['operational_product'])

        # Update core_product fields
        core_product.name = PIMSyncService.get_variant_display_name(variant)[:255]
        core_product.base_price = variant.price
        
        old_product_code = core_product.product_code
        core_product.sku = (variant.sku or "")[:60]
        core_product.product_code = (variant.sku or "")[:50]
        core_product.is_active = variant.is_active
        if variant.image:
            core_product.image = variant.image
            
        child_pim = PimProduct.objects.filter(code=variant.sku, parent_id=pim_product.id).first()
        if child_pim:
            child_pim.name = core_product.name
            child_pim.save(update_fields=['name', 'updated_at'])
            
        # Sync brand and warranty from PIM Base Product
        core_product.brand = pim_product.brand
        core_product.warranty_enabled = pim_product.warranty_enabled
        core_product.warranty_months_manufacturing = pim_product.warranty_months_manufacturing
        core_product.warranty_months_structural = pim_product.warranty_months_structural
        core_product.warranty_months_extended_max = pim_product.warranty_months_extended_max
        core_product.extended_warranty_cost_percentage = pim_product.extended_warranty_cost_percentage

        
        # Try to sync category if names match, this is best-effort since models are separate
        if pim_product.category:
            core_product.category = pim_product.category.name
            try:
                cat = ProductCategoryMaster.objects.filter(name=pim_product.category.name).first()
                if cat:
                    core_product.category_master = cat
            except Exception:
                pass
                
        if pim_product.subcategory:
            core_product.subcategory = pim_product.subcategory.name
            try:
                subcat = ProductSubcategoryMaster.objects.filter(name=pim_product.subcategory.name).first()
                if subcat:
                    core_product.subcategory_master = subcat
            except Exception:
                pass

        # Sync PIM attributes into the core product's base_specs JSON dictionary
        base_specs = {}
        
        # 1. Base product attributes
        for p_attr in pim_product.attributes.select_related('attribute').all():
            base_specs[p_attr.attribute.slug] = p_attr.display_value
            
        # 2. Variant-specific attribute overrides
        for v_attr in variant.attribute_values.select_related('attribute').all():
            dtype = v_attr.attribute.data_type
            if dtype in ('TEXT', 'CHOICE', 'MULTI_CHOICE'):
                val = v_attr.value_text
            elif dtype in ('NUMBER', 'DECIMAL'):
                if v_attr.value_number is not None:
                    val = float(v_attr.value_number)
                elif v_attr.value_text:
                    try:
                        val = float(v_attr.value_text)
                    except (ValueError, TypeError):
                        val = v_attr.value_text
                else:
                    val = None
            elif dtype == 'BOOLEAN':
                if v_attr.value_boolean is not None:
                    val = v_attr.value_boolean
                elif v_attr.value_text:
                    val = True if str(v_attr.value_text).strip().lower() in ('yes', 'true', '1') else False if str(v_attr.value_text).strip().lower() in ('no', 'false', '0') else None
                else:
                    val = None
            else:
                val = v_attr.value_text
            base_specs[v_attr.attribute.slug] = val
            
        core_product.base_specs = base_specs

        core_product.save()

        try:
            from inventory.services.inventory_profile_service import prepare_inventory_profile_for_product
            prepare_inventory_profile_for_product(product_id=core_product.id)
        except Exception:
            pass
            
        if old_product_code and old_product_code != variant.sku:
            try:
                from subscriptions.models import Product as RegisterProduct
                register = RegisterProduct.objects.filter(product_code=old_product_code).first()
                if register:
                    register.product_code = variant.sku
                    register.save(update_fields=["product_code"])
            except Exception:
                pass

        return core_product
