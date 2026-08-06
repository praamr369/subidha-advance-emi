from django.db.models import Q
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from api.v1.permissions import IsAdmin

from .models import (
    ProductCategory,
    ProductSubcategory,
    CategoryAttribute,
    AttributeOption,
    PimProduct,
    ProductVariant,
    VariantAttributeValue,
)
from .serializers import (
    ProductCategorySerializer,
    ProductSubcategorySerializer,
    CategoryAttributeSerializer,
    AttributeOptionSerializer,
    PimProductListSerializer,
    PimProductDetailSerializer,
    PimProductCreateUpdateSerializer,
    ProductVariantSerializer,
    ProductVariantCreateSerializer,
    VariantAttributeValueSerializer,
)


class AttributeOptionViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, IsAdmin]
    serializer_class = AttributeOptionSerializer

    def get_queryset(self):
        qs = AttributeOption.objects.all()
        attribute_id = self.request.query_params.get("attribute")
        if attribute_id:
            qs = qs.filter(attribute_id=attribute_id)
        return qs.order_by("display_order", "id")


class ProductCategoryViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, IsAdmin]
    queryset = ProductCategory.objects.filter(is_active=True).prefetch_related("subcategories", "attributes")
    serializer_class = ProductCategorySerializer

    @action(detail=True, methods=["get"])
    def with_attributes(self, request, pk=None):
        category = self.get_object()
        serializer = ProductCategorySerializer(category)
        return Response(serializer.data)


class ProductSubcategoryViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, IsAdmin]
    serializer_class = ProductSubcategorySerializer

    def get_queryset(self):
        qs = ProductSubcategory.objects.filter(is_active=True).select_related("category").prefetch_related("attributes")
        category_id = self.request.query_params.get("category")
        if category_id:
            qs = qs.filter(category_id=category_id)
        return qs


class CategoryAttributeViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, IsAdmin]
    serializer_class = CategoryAttributeSerializer

    def get_queryset(self):
        qs = CategoryAttribute.objects.filter(is_active=True).prefetch_related("options")
        category_id = self.request.query_params.get("category")
        subcategory_id = self.request.query_params.get("subcategory")
        if category_id:
            qs = qs.filter(category_id=category_id)
        if subcategory_id:
            qs = qs.filter(Q(subcategory_id=subcategory_id) | Q(subcategory__isnull=True))
        return qs


class PimProductViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get_queryset(self):
        qs = PimProduct.objects.select_related("category", "subcategory").prefetch_related("attributes__attribute", "variants")
        category_id = self.request.query_params.get("category")
        subcategory_id = self.request.query_params.get("subcategory")
        search = self.request.query_params.get("search")
        is_published = self.request.query_params.get("is_published")
        if category_id:
            category_ids = [c for c in category_id.split(",") if c]
            if category_ids:
                qs = qs.filter(category_id__in=category_ids)
        if subcategory_id:
            qs = qs.filter(subcategory_id=subcategory_id)
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(code__icontains=search))
        if is_published is not None:
            qs = qs.filter(is_published=is_published.lower() == "true")
        return qs

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return PimProductCreateUpdateSerializer
        if self.action == "retrieve":
            return PimProductDetailSerializer
        return PimProductListSerializer

    @action(detail=True, methods=["get"])
    def with_attributes(self, request, pk=None):
        product = self.get_object()
        return Response(PimProductDetailSerializer(product).data)

    @action(detail=True, methods=["get"])
    def variants(self, request, pk=None):
        product = self.get_object()
        variants = product.variants.filter(is_active=True).prefetch_related("attribute_values__attribute")
        return Response(ProductVariantSerializer(variants, many=True).data)

    @action(detail=True, methods=["post"])
    def create_variant(self, request, pk=None):
        product = self.get_object()
        serializer = ProductVariantCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        variant = serializer.save(product=product)
        return Response(ProductVariantSerializer(variant).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["get"])
    def register_status(self, request):
        """Cross-module status: all subscription products with PIM + inventory sync state."""
        from django.db.models import Q
        try:
            from subscriptions.models import Product as SubProduct
        except ImportError:
            return Response({"error": "subscriptions app not available"}, status=500)

        pim_code_to_id = dict(PimProduct.objects.values_list("code", "id"))
        pim_codes = set(pim_code_to_id.keys())

        qs = SubProduct.objects.filter(is_active=True).exclude(product_code="")

        search = request.query_params.get("search", "").strip()
        synced_filter = request.query_params.get("synced", "")
        category_filter = request.query_params.get("category", "")
        page = max(1, int(request.query_params.get("page", 1)))
        page_size = min(100, max(10, int(request.query_params.get("page_size", 50))))

        if search:
            qs = qs.filter(
                Q(name__icontains=search) | Q(product_code__icontains=search) | Q(category__icontains=search)
            )

        if category_filter:
            cat_ids = [c for c in category_filter.split(",") if c]
            if cat_ids:
                cat_names = set(ProductCategory.objects.filter(id__in=cat_ids).values_list("name", flat=True))
                if cat_names:
                    qs = qs.filter(category__in=cat_names)

        all_products = list(qs.values(
            "id", "product_code", "name", "category", "subcategory",
            "base_price", "is_active", "item_type", "stock_type",
        ))

        total = len(all_products)
        synced_codes = {sp["product_code"] for sp in all_products} & pim_codes
        synced_count = len(synced_codes)
        not_synced_count = total - synced_count

        results = []
        for sp in all_products:
            pim_id = pim_code_to_id.get(sp["product_code"])
            is_synced = pim_id is not None
            if synced_filter == "true" and not is_synced:
                continue
            if synced_filter == "false" and is_synced:
                continue
            results.append({
                **sp,
                "pim_product_id": pim_id,
                "pim_synced": is_synced,
            })

        start = (page - 1) * page_size
        return Response({
            "total_register": total,
            "total_pim": PimProduct.objects.count(),
            "synced_count": synced_count,
            "not_synced_count": not_synced_count,
            "count": len(results),
            "results": results[start: start + page_size],
        })

    @action(detail=False, methods=["post"])
    def sync_from_register(self, request):
        """Bulk-import subscription products into PIM. Matches by product_code."""
        try:
            from subscriptions.models import Product as SubProduct
        except ImportError:
            return Response({"error": "subscriptions app not available"}, status=500)

        product_ids = request.data.get("product_ids", [])
        sync_all = request.data.get("all", False)

        if sync_all:
            sub_qs = SubProduct.objects.filter(is_active=True).exclude(product_code="")
        elif product_ids:
            sub_qs = SubProduct.objects.filter(id__in=product_ids).exclude(product_code="")
        else:
            return Response({"error": "Provide product_ids list or all=true"}, status=400)

        # Get/create Unclassified catch-all category
        unclassified, _ = ProductCategory.objects.get_or_create(
            slug="unclassified",
            defaults={"name": "Unclassified", "icon": "📦", "display_order": 999}
        )

        # Build category name → PIM category map for auto-matching
        cat_map = {c.name.lower(): c for c in ProductCategory.objects.all()}

        created = updated = skipped = 0
        errors = []

        for sp in sub_qs:
            try:
                # Try to match subscription product category to PIM category by name
                cat_key = (sp.category or "").strip().lower()
                cat = cat_map.get(cat_key, unclassified)

                pim, was_created = PimProduct.objects.get_or_create(
                    code=sp.product_code,
                    defaults={
                        "name": sp.name,
                        "base_price": sp.base_price,
                        "description": sp.description or "",
                        "category": cat,
                        "source_product": sp,
                        "is_active": sp.is_active,
                        "is_published": False,
                    },
                )
                if was_created:
                    created += 1
                else:
                    if pim.source_product_id != sp.id:
                        pim.source_product = sp
                        pim.save(update_fields=["source_product"])
                    changed = []
                    if str(pim.base_price) != str(sp.base_price):
                        pim.base_price = sp.base_price
                        changed.append("base_price")
                    if pim.name != sp.name:
                        pim.name = sp.name
                        changed.append("name")
                    if changed:
                        pim.save(update_fields=changed)
                        updated += 1
                    else:
                        skipped += 1
            except Exception as exc:
                errors.append({"code": sp.product_code, "error": str(exc)})

        return Response({
            "created": created,
            "updated": updated,
            "skipped": skipped,
            "errors": errors[:20],
            "total_processed": created + updated + skipped + len(errors),
        })

    @action(detail=False, methods=["get"])
    def summary(self, request):
        total = PimProduct.objects.count()
        published = PimProduct.objects.filter(is_published=True).count()
        by_category = list(
            ProductCategory.objects.values("id", "name").annotate(
                product_count=__import__("django.db.models", fromlist=["Count"]).Count("products")
            )
        )
        return Response({"total": total, "published": published, "by_category": by_category})

    @action(detail=False, methods=["get"])
    def low_stock(self, request):
        variants = ProductVariant.objects.filter(
            quantity_on_hand__lte=__import__("django.db.models", fromlist=["F"]).F("reorder_level"),
            is_active=True,
        ).select_related("product__category")
        return Response(ProductVariantSerializer(variants, many=True).data)


class ProductVariantViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get_queryset(self):
        qs = ProductVariant.objects.select_related("product").prefetch_related("attribute_values__attribute")
        product_id = self.request.query_params.get("product")
        if product_id:
            qs = qs.filter(product_id=product_id)
        return qs

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return ProductVariantCreateSerializer
        return ProductVariantSerializer

    @action(detail=True, methods=["patch"])
    def update_stock(self, request, pk=None):
        variant = self.get_object()
        qty = request.data.get("quantity_on_hand")
        reorder = request.data.get("reorder_level")
        if qty is not None:
            variant.quantity_on_hand = int(qty)
        if reorder is not None:
            variant.reorder_level = int(reorder)
        variant.save(update_fields=["quantity_on_hand", "reorder_level"])
        return Response(ProductVariantSerializer(variant).data)

    @action(detail=True, methods=["patch"])
    def update_pricing(self, request, pk=None):
        variant = self.get_object()
        price = request.data.get("price")
        cost_price = request.data.get("cost_price")
        if price is not None:
            variant.price = price
        if cost_price is not None:
            variant.cost_price = cost_price
        variant.save(update_fields=["price", "cost_price"])
        return Response(ProductVariantSerializer(variant).data)
