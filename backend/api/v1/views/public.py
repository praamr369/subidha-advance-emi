from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from subscriptions.models import Product, ProductCategoryMaster
from api.v1.serializers.public import PublicProductSerializer, PublicProductCategorySerializer

def _published_qs():
    """
    Published Products = active + linked PimProduct is published.
    This includes both base blueprint Products AND variant SKU Products
    (variant PimProducts cascade-publish from the base).
    Prefetch everything needed by PublicProductSerializer in one query.
    """
    return (
        Product.objects
        .filter(is_active=True, pim__is_published=True)
        .prefetch_related(
            "pim",
            "pim__attributes__attribute",
            "pim__parent__variants__attribute_values__attribute",
            "pim__parent__variants__operational_product",
            "pim_variant__attribute_values__attribute",
            "pim_variant__operational_product",
        )
        .select_related("category_master")
    )


class PublicProductListView(generics.ListAPIView):
    permission_classes = [AllowAny]
    serializer_class = PublicProductSerializer

    def get_queryset(self):
        qs = _published_qs()
        # By default only show BASE products in the catalogue listing
        # (variant pages are discoverable via the base page or direct URL)
        show_variants = self.request.query_params.get("include_variants", "false").lower() == "true"
        if not show_variants:
            # Base products have no parent PimProduct (pim__parent__isnull=True)
            # Exclude base blueprints with no price — they are placeholders only
            qs = qs.filter(pim__parent__isnull=True).exclude(base_price__isnull=True).exclude(base_price=0)
        return qs


class PublicProductDetailView(generics.RetrieveAPIView):
    permission_classes = [AllowAny]
    serializer_class = PublicProductSerializer
    lookup_field = "id"

    def get_queryset(self):
        return _published_qs()