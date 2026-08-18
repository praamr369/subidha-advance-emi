"""PIM Product Workbench API endpoints - for editing products and variants"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from api.v1.permissions import IsAdmin

from products_pim.models import PimProduct, ProductVariant, CategoryAttribute, AttributeOption
from products_pim.serializers import (
    PimProductDetailSerializer, ProductVariantSerializer
)
from products_pim.services.flexible_variant_service import FlexibleVariantService


class PimProductWorkbenchViewSet(viewsets.ModelViewSet):
    """Product workbench for editing products and managing variants"""

    queryset = PimProduct.objects.all()
    serializer_class = PimProductDetailSerializer
    permission_classes = [IsAuthenticated, IsAdmin]
    lookup_field = 'code'

    @action(detail=True, methods=['post'])
    def preview_variants(self, request, code=None):
        """Preview variant combinations before generating"""
        product = self.get_object()

        pricing_rules = request.data.get('pricing_rules', {})
        # Convert keys from strings to tuples
        pricing_rules = {
            tuple(k.split('::')): v for k, v in pricing_rules.items()
        }
        
        attribute_ids = request.data.get('attribute_ids', None)

        result = FlexibleVariantService.preview_variants(
            product, pricing_rules=pricing_rules, attribute_ids=attribute_ids
        )

        return Response(result.to_dict())

    @action(detail=True, methods=['post'])
    def generate_variants(self, request, code=None):
        """Generate all variant combinations"""
        product = self.get_object()

        pricing_rules = request.data.get('pricing_rules', {})
        # Convert keys from strings to tuples
        pricing_rules = {
            tuple(k.split('::')): v for k, v in pricing_rules.items()
        }
        clear_existing = request.data.get('clear_existing', False)
        attribute_ids = request.data.get('attribute_ids', None)
        
        # Save the chosen attributes if provided
        if attribute_ids is not None:
            product.variant_generating_attributes.set(attribute_ids)

        result = FlexibleVariantService.generate_variants(
            product,
            pricing_rules=pricing_rules,
            clear_existing=clear_existing,
            attribute_ids=attribute_ids
        )

        return Response(result, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'])
    def variant_summary(self, request, code=None):
        """Get quick summary of variants"""
        product = self.get_object()
        summary = FlexibleVariantService.get_variant_summary(product)
        return Response(summary)

    @action(detail=True, methods=['get'])
    def variants_list(self, request, code=None):
        """Get all variants with pagination"""
        product = self.get_object()
        variants = product.variants.all()

        # Pagination
        page_size = request.query_params.get('page_size', 50)
        page = request.query_params.get('page', 1)

        try:
            page_size = int(page_size)
            page = int(page)
        except (ValueError, TypeError):
            page_size = 50
            page = 1

        start = (page - 1) * page_size
        end = start + page_size

        total_count = variants.count()
        variants_page = variants[start:end]

        serializer = ProductVariantSerializer(variants_page, many=True)
        return Response({
            'count': total_count,
            'page_size': page_size,
            'page': page,
            'total_pages': (total_count + page_size - 1) // page_size,
            'results': serializer.data,
        })

    @action(detail=True, methods=['post'])
    def bulk_update_variants(self, request, code=None):
        """Bulk update variant prices and other properties"""
        product = self.get_object()

        updates = request.data.get('updates', {})

        result = FlexibleVariantService.bulk_update_variants(
            product.id, updates
        )

        return Response(result)

    @action(detail=True, methods=['delete'])
    def clear_variants(self, request, code=None):
        """Delete all variants for this product"""
        product = self.get_object()
        count = product.variants.count()
        product.variants.all().delete()

        return Response({
            'deleted': count,
            'message': f'Deleted {count} variants'
        })

    @action(detail=True, methods=['get'])
    def attributes(self, request, code=None):
        """Get all attributes for this product's category"""
        product = self.get_object()

        # Get ALL active attributes for the product category
        all_attrs = CategoryAttribute.objects.filter(
            category=product.category,
            subcategory=product.subcategory,
            is_active=True
        ).order_by('display_order')

        # Which ones did the user save for variant generation?
        saved_attr_ids = list(product.variant_generating_attributes.values_list('id', flat=True))
        
        # If user never saved any, default to the category's `is_variant_defining` defaults
        if not saved_attr_ids and not product.variant_generating_attributes.exists():
            saved_attr_ids = list(
                all_attrs.filter(is_variant_defining=True).values_list('id', flat=True)
            )

        attributes_data = []
        for attr in all_attrs:
            options = AttributeOption.objects.filter(
                attribute=attr, is_active=True
            ).order_by('display_order').values('id', 'value', 'display_name', 'extra_cost')

            attributes_data.append({
                'id': attr.id,
                'name': attr.name,
                'slug': attr.slug,
                'data_type': attr.data_type,
                'is_variant_defining': attr.is_variant_defining,
                'is_selected_for_variants': attr.id in saved_attr_ids,
                'option_count': len(list(options)),
                'options': list(options),
            })

        return Response({
            'category': product.category.name,
            'subcategory': product.subcategory.name if product.subcategory else None,
            'attributes': attributes_data,
        })

