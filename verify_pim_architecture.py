import os
import django
import sys
from decimal import Decimal

# Setup Django
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings.development')
django.setup()

from products_pim.models import PimProduct, ProductCategory, CategoryAttribute, AttributeOption, ProductVariant
from products_pim.services.flexible_variant_service import FlexibleVariantService
from products_core.models import Product

def verify():
    print("--- Starting PIM Architecture Verification ---")
    
    # 1. Create a Category
    category, _ = ProductCategory.objects.get_or_create(name="Apparel", slug="apparel")
    
    # 2. Create Attributes (Size, Color)
    size_attr, _ = CategoryAttribute.objects.get_or_create(
        category=category, name="Size", slug="size", is_variant_defining=True
    )
    color_attr, _ = CategoryAttribute.objects.get_or_create(
        category=category, name="Color", slug="color", is_variant_defining=True
    )
    
    # 3. Create Options
    AttributeOption.objects.get_or_create(attribute=size_attr, value="M")
    AttributeOption.objects.get_or_create(attribute=size_attr, value="L")
    AttributeOption.objects.get_or_create(attribute=color_attr, value="Red")
    AttributeOption.objects.get_or_create(attribute=color_attr, value="Blue")
    
    # 4. Create Parent PimProduct
    pim_product, _ = PimProduct.objects.get_or_create(
        code="TSHIRT01",
        defaults={
            "name": "Classic T-Shirt",
            "category": category,
            "base_price": Decimal("299.99"),
            "brand": "Acme Corp"
        }
    )
    
    print(f"Parent Product Created: {pim_product.name} [UUID: {pim_product.uuid}]")
    
    # 5. Generate Variants (Matrix Interface simulation)
    print("Generating variants...")
    result = FlexibleVariantService.generate_variants(pim_product)
    
    print(f"Variants created: {result['created']}")
    print(f"Variants skipped (already existed): {result['skipped']}")
    
    # 6. Verify sync to core Product
    variants = ProductVariant.objects.filter(product=pim_product)
    for variant in variants:
        print(f"Variant: {variant.sku} [UUID: {variant.uuid}]")
        
        # Check operational link
        if variant.operational_product:
            core = variant.operational_product
            print(f"  -> Synced to Core Product: {core.product_code} (Base Price: {core.base_price})")
            assert core.product_code == variant.sku, "SKU sync mismatch"
            assert core.base_price == variant.price, "Price sync mismatch"
        else:
            print(f"  -> ERROR: Not synced to Core Product!")
            sys.exit(1)
            
    print("--- Verification Successful! ---")

if __name__ == "__main__":
    verify()
