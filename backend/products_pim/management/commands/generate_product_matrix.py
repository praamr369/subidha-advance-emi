from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from products_pim.models import PimProduct, CategoryAttribute, AttributeOption, ProductVariant, VariantAttributeValue
import itertools

class Command(BaseCommand):
    help = "Generates a complete matrix of Product Variants based on the available Attribute Options for a Product's Category."

    def add_arguments(self, parser):
        parser.add_argument("product_code", type=str, help="The code of the PimProduct to generate variants for")
        parser.add_argument(
            "--attributes", 
            type=str, 
            help="Comma-separated list of attribute names to include in the matrix (e.g. 'Size,Polish,Storage'). If omitted, uses all choice attributes of the category."
        )

    def handle(self, *args, **options):
        product_code = options["product_code"]
        attribute_names = options.get("attributes")

        try:
            product = PimProduct.objects.get(code=product_code)
        except PimProduct.DoesNotExist:
            raise CommandError(f"Product with code '{product_code}' does not exist.")

        category = product.category
        
        # Determine which attributes to build the matrix from
        attr_query = category.attributes.filter(data_type__in=["CHOICE", "MULTI_CHOICE"])
        if attribute_names:
            names_list = [n.strip() for n in attribute_names.split(",")]
            attr_query = attr_query.filter(name__in=names_list)

        attributes = list(attr_query)
        if not attributes:
            self.stdout.write(self.style.WARNING("No choice attributes found for matrix generation."))
            return

        # Fetch options for each attribute
        matrix_axes = []
        for attr in attributes:
            options = list(attr.options.all())
            if not options:
                self.stdout.write(self.style.WARNING(f"Attribute '{attr.name}' has no options defined. Skipping."))
                continue
            matrix_axes.append({"attribute": attr, "options": options})

        if not matrix_axes:
            raise CommandError("No valid attributes with options to build a matrix.")

        # Generate Cartesian product of all options
        options_lists = [axis["options"] for axis in matrix_axes]
        combinations = list(itertools.product(*options_lists))
        
        self.stdout.write(self.style.SUCCESS(f"Found {len(matrix_axes)} attributes. Will generate {len(combinations)} variants for {product_code}."))

        created_count = 0
        skipped_count = 0

        with transaction.atomic():
            for combo in combinations:
                # Generate a unique SKU suffix from the options
                suffix_parts = []
                for opt in combo:
                    # Clean up option value for SKU (remove spaces, uppercase)
                    clean_opt = "".join(opt.value.split())[:5].upper()
                    suffix_parts.append(clean_opt)
                
                sku = f"{product.code}-" + "-".join(suffix_parts)

                # Check if variant already exists
                if ProductVariant.objects.filter(product=product, sku=sku).exists():
                    skipped_count += 1
                    continue

                # Create variant
                variant = ProductVariant.objects.create(
                    product=product,
                    sku=sku,
                    price=product.base_price, # Default to base price, can be updated later
                    quantity_on_hand=0, # Make-to-order by default
                )

                # Assign attribute values to the variant
                for axis, opt in zip(matrix_axes, combo):
                    VariantAttributeValue.objects.create(
                        variant=variant,
                        attribute=axis["attribute"],
                        value_text=opt.value
                    )
                
                created_count += 1

        self.stdout.write(self.style.SUCCESS(f"Successfully created {created_count} variants. Skipped {skipped_count} existing."))
