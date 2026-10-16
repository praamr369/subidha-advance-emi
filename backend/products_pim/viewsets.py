from django.db.models import Q
from products_pim.services.sync_service import PIMSyncService
from rest_framework import viewsets, status
from django.utils.decorators import method_decorator
from django.views.decorators.cache import cache_page
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from api.v1.pagination import AdminListPagination
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

    def create(self, request, *args, **kwargs):
        attribute_id = request.data.get("attribute")
        value = str(request.data.get("value", "")).strip()
        if attribute_id and value:
            existing = AttributeOption.objects.filter(
                attribute_id=attribute_id,
                value__iexact=value,
            ).first()
            if existing:
                serializer = self.get_serializer(existing)
                return Response(serializer.data, status=status.HTTP_200_OK)
        return super().create(request, *args, **kwargs)


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
    # The project default paginator ignores ?page_size (always 20 rows), which made
    # the admin PIM tree show only 20 blueprints and broke its page maths.
    pagination_class = AdminListPagination

    def perform_update(self, serializer):
        instance = self.get_object()
        old_code = instance.code
        old_name = instance.name
        
        pim_product = serializer.save()
        
        name_changed = pim_product.name != old_name
        code_changed = pim_product.code != old_code
        
        if name_changed or code_changed:
            from products_pim.services.sync_service import PIMSyncService
            from products_core.models import Product as CoreProduct
            
            # Sync variants automatically
            for variant in pim_product.variants.select_related("operational_product").all():
                op = variant.operational_product
                
                # If code changed, rename SKU safely if it starts with old_code
                if code_changed and variant.sku and old_code and variant.sku.startswith(old_code):
                    old_variant_sku = variant.sku
                    new_sku = pim_product.code + old_variant_sku[len(old_code):]
                    variant.sku = new_sku
                    variant.save(update_fields=["sku"])
                    try:
                        PIMSyncService.rename_variant_sku(variant, old_sku=old_variant_sku)
                    except Exception:
                        pass
                
                # If name changed, update op.name and child_pim.name
                if name_changed:
                    if op:
                        op.name = PIMSyncService.get_variant_display_name(variant)
                        op.save(update_fields=["name"])
                    
                    # Update variant's PimProduct (child_pim)
                    child_pim = op.pim.first() if op and hasattr(op, "pim") else None
                    if not child_pim:
                        child_pim = PimProduct.objects.filter(code=variant.sku).first()
                    if child_pim:
                        child_pim.name = pim_product.name
                        child_pim.save(update_fields=["name", "updated_at"])


    def get_queryset(self):
        qs = PimProduct.objects.select_related("category", "subcategory", "parent__category", "parent__subcategory", "source_product").prefetch_related(
            "attributes__attribute__options",
            "variants__attribute_values__attribute",
            "child_pim_products",
        )
        category_id = self.request.query_params.get("category")
        subcategory_id = self.request.query_params.get("subcategory")
        search = self.request.query_params.get("search")
        is_published = self.request.query_params.get("is_published")
        product_type = self.request.query_params.get("type")
        # Tree view: page through blueprints only (?roots_only=true), then load their
        # variant SKUs with ?parent=<id>,<id>,… so every blueprint is reachable page by page.
        roots_only = (
            self.request.query_params.get("roots_only", "").lower() == "true"
            or self.action == "tree_summary"
        )
        parent_ids = [p for p in (self.request.query_params.get("parent") or "").split(",") if p.isdigit()]
        if product_type:
            # Variants inherit product_type from base blueprint, but checking parent__product_type is safe too
            qs = qs.filter(Q(product_type=product_type) | Q(parent__product_type=product_type))
        if roots_only:
            qs = qs.filter(parent__isnull=True)
        if parent_ids:
            qs = qs.filter(parent_id__in=parent_ids)
        if category_id:
            category_ids = [c for c in category_id.split(",") if c]
            if category_ids:
                # Match own category OR parent's category (variants inherit from base)
                qs = qs.filter(
                    Q(category_id__in=category_ids) | Q(parent__category_id__in=category_ids)
                )
        if subcategory_id:
            # Match own subcategory OR parent's subcategory (variants may have null subcategory)
            qs = qs.filter(
                Q(subcategory_id=subcategory_id) | Q(parent__subcategory_id=subcategory_id)
            )
        if search:
            match = (
                Q(name__icontains=search) 
                | Q(code__icontains=search)
                | Q(product_type__icontains=search)
                | Q(attributes__value_text__icontains=search)
                # products_core.Product has no SEO fields; its searchable
                # catalog fields are deliberately kept to the stable product
                # code, name, and description contract.
                | Q(source_product__product_code__icontains=search)
                | Q(source_product__name__icontains=search)
                | Q(source_product__description__icontains=search)
            )
            if roots_only:
                # A blueprint is also found through any of its variant SKUs.
                match |= (
                    Q(child_pim_products__name__icontains=search) 
                    | Q(child_pim_products__code__icontains=search)
                    | Q(child_pim_products__attributes__value_text__icontains=search)
                )
            qs = qs.filter(match).distinct()
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
        serializer = PimProductDetailSerializer(product, context=self.get_serializer_context())
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        """
        Publish a blueprint PimProduct and cascade to all its variant children.
        - Sets is_published=True on the base PimProduct
        - Sets is_published=True on every child PimProduct (variant entries)
        - Activates all linked ProductVariant operational records (is_active=True)
        Returns counts so the frontend can show a meaningful confirmation.
        """
        product = self.get_object()
        product.is_published = True
        product.save(update_fields=["is_published"])
        child_count = product.child_pim_products.filter(is_published=False).update(is_published=True)
        variant_count = product.variants.filter(is_active=False).update(is_active=True)
        return Response({
            "published": True,
            "child_pim_published": child_count,
            "variants_activated": variant_count,
            "total_variants": product.variants.count(),
        })

    @action(detail=True, methods=["post"])
    def unpublish(self, request, pk=None):
        """
        Unpublish a blueprint and all its variant children.
        Does NOT deactivate ProductVariant records (keeps operational data intact).
        """
        product = self.get_object()
        product.is_published = False
        product.save(update_fields=["is_published"])
        child_count = product.child_pim_products.filter(is_published=True).update(is_published=False)
        return Response({
            "published": False,
            "child_pim_unpublished": child_count,
        })


    @action(detail=True, methods=["get", "patch"], url_path="variants_publish_control")
    def variants_publish_control(self, request, pk=None):
        pim = self.get_object()
        
        # If this is a variant, redirect logic to its base product
        if pim.parent_id:
            pim = pim.parent

        if request.method == "GET":
            from .bridge_views import ProductPimVariantPublishControlView
            view = ProductPimVariantPublishControlView()
            return Response({
                "base": view._base_response(pim, pim.source_product_id),
                "variants": view._variant_rows(pim),
            })
            
        elif request.method == "PATCH":
            data = request.data
            from .bridge_views import ProductPimVariantPublishControlView
            view = ProductPimVariantPublishControlView()

            # Bulk toggle all
            if "all" in data:
                flag = bool(data["all"])
                pim.is_published = flag
                pim.save(update_fields=["is_published"])
                pim.child_pim_products.all().update(is_published=flag)
                return Response({
                    "base": view._base_response(pim, pim.source_product_id),
                    "variants": view._variant_rows(pim),
                })

            # Toggle base
            if "base_published" in data:
                pim.is_published = bool(data["base_published"])
                pim.save(update_fields=["is_published"])

            # Per-variant toggles
            from products_pim.models import PimProduct
            variant_updates = data.get("variants", [])
            if variant_updates:
                child_ids = set(pim.child_pim_products.values_list("id", flat=True))
                variants_by_sku = {v.sku: v.id for v in pim.variants.all()}
                variant_to_child = {}
                for child in pim.child_pim_products.all():
                    if child.code in variants_by_sku:
                        variant_to_child[variants_by_sku[child.code]] = child.id
                for row in variant_updates:
                    vid = row.get("id")
                    flag = bool(row.get("is_published", False))
                    mode_fields = {key: bool(row[key]) for key in ("is_emi_enabled", "is_rent_enabled", "is_lease_enabled", "is_direct_sale_enabled") if key in row}
                    if vid in child_ids:
                        PimProduct.objects.filter(pk=vid).update(is_published=flag, **mode_fields)
                    elif vid in variant_to_child:
                        PimProduct.objects.filter(pk=variant_to_child[vid]).update(is_published=flag, **mode_fields)
                    target_id = vid if vid in child_ids else variant_to_child.get(vid)
                    if target_id and mode_fields:
                        child = PimProduct.objects.filter(pk=target_id).select_related("source_product").first()
                        if child and child.source_product_id:
                            for field, value in mode_fields.items():
                                setattr(child.source_product, field, value)
                            child.source_product.save(update_fields=list(mode_fields))

                pim.refresh_from_db(fields=["is_published"])

            return Response({
                "base": view._base_response(pim, pim.source_product_id),
                "variants": view._variant_rows(pim),
            })

    @action(detail=True, methods=["post"])
    def auto_bom(self, request, pk=None):
        """
        Auto-generate a ManufacturingBom for this PimProduct variant based on its
        attribute values (wood species, thickness, side rail, dasa, ply, hydraulic, polish).

        Works on variant (child) PimProducts only. Call once per variant after setting
        all attributes. Creates a DRAFT BOM with lines for each mapped raw material.
        Re-calling replaces the existing DRAFT BOM lines (safe to re-run after attr changes).
        """
        from products_pim.services.bom_bridge_service import auto_bom_for_variant
        product = self.get_object()
        if not product.parent_id:
            return Response(
                {"error": "auto_bom works on variant PimProducts only (those with a parent). "
                           "Call this on a child variant, not the base blueprint."},
                status=400,
            )
        result = auto_bom_for_variant(product)
        if "error" in result:
            return Response({"error": result["error"]}, status=400)
        return Response(result, status=200)

    @action(detail=True, methods=["get"])
    def bom_status(self, request, pk=None):
        """
        Return BOM summary for this variant PimProduct:
        existing BOMs, line counts, and linked services.
        """
        from products_core.models import Product as CoreProduct
        from inventory.models import InventoryItem
        from manufacturing.models import ManufacturingBom

        product = self.get_object()
        core = CoreProduct.objects.filter(product_code=product.code).first()
        if not core:
            return Response({"boms": [], "services": [], "warning": "No operational product found"})

        try:
            fg = core.inventory_profile
        except InventoryItem.DoesNotExist:
            return Response({"boms": [], "services": [], "warning": "No inventory profile found"})

        boms = ManufacturingBom.objects.filter(
            finished_good_inventory_item=fg
        ).prefetch_related("lines__inventory_item__product").order_by("-revision_no")

        bom_data = []
        for bom in boms:
            bom_data.append({
                "id": bom.pk,
                "bom_no": bom.bom_no,
                "status": bom.status,
                "revision_no": bom.revision_no,
                "is_default": bom.is_default,
                "lines": [
                    {
                        "inventory_item_id": line.inventory_item_id,
                        "product_code": line.inventory_item.product.product_code,
                        "name": line.inventory_item.product.name,
                        "qty": str(line.quantity_per_unit),
                        "unit": line.inventory_item.unit_of_measure,
                        "wastage_pct": str(line.wastage_percent),
                        "notes": line.notes,
                    }
                    for line in bom.lines.all()
                ],
            })

        services = []
        for link in fg.service_links.select_related("service").all():
            services.append({
                "service_code": link.service.code,
                "service_name": link.service.name,
                "service_type": link.service.service_type,
                "charge_mode": link.charge_mode,
                "price": str(link.sale_price or link.service.standard_price),
                "is_default": link.is_default_included,
            })

        return Response({
            "product_code": product.code,
            "inventory_item_id": fg.pk,
            "boms": bom_data,
            "services": services,
        })

    @action(detail=True, methods=["get"])
    def variants(self, request, pk=None):
        product = self.get_object()
        variants = product.variants.filter(is_active=True).select_related("product").prefetch_related("attribute_values__attribute")
        return Response(ProductVariantSerializer(variants, many=True).data)

    @action(detail=True, methods=["post"])
    def create_variant(self, request, pk=None):
        product = self.get_object()
        serializer = ProductVariantCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        variant = serializer.save(product=product)
        PIMSyncService.sync_variant_to_operational_product(variant)
        return Response(ProductVariantSerializer(variant).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def push_to_variants(self, request, pk=None):
        """Push parent product fields (description, name) to all linked operational products."""
        product = self.get_object()
        push_description = request.data.get("push_description", False)
        push_name = request.data.get("push_name", False)
        updated = 0
        for variant in product.variants.select_related("operational_product").all():
            op = variant.operational_product
            if not op:
                continue
            changed = False
            if push_description and hasattr(op, "description"):
                op.description = product.description
                changed = True
            if push_name:
                op.name = PIMSyncService.get_variant_display_name(variant)
                changed = True
            if changed:
                op.save()
                
                # Also update the variant's PIM record if it exists
                child_pim = op.pim.first() if hasattr(op, "pim") else None
                if not child_pim:
                    child_pim = PimProduct.objects.filter(code=variant.sku).first()

                if child_pim:
                    pim_changed = False
                    if push_description and child_pim.description != product.description:
                        child_pim.description = product.description
                        pim_changed = True
                    if push_name and child_pim.name != product.name:
                        child_pim.name = product.name
                        pim_changed = True
                    if pim_changed:
                        update_fields = []
                        if push_name:
                            update_fields.append("name")
                        if push_description:
                            update_fields.append("description")
                        if update_fields:
                            child_pim.save(update_fields=update_fields)
                        
                updated += 1
        return Response({"updated": updated, "total_variants": product.variants.count()})

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
                Q(name__icontains=search) 
                | Q(product_code__icontains=search) 
                | Q(category__icontains=search)
                | Q(seo_title__icontains=search)
                | Q(seo_description__icontains=search)
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

        # Build SKU→parent-PimProduct map so variant products get linked automatically
        from .models import ProductVariant as PimVariant
        sku_to_parent = {
            v.sku: v.product_id
            for v in PimVariant.objects.values_list("sku", "product_id").iterator()
        }

        created = updated = skipped = 0
        errors = []

        # Cache parent PimProduct objects so variants can inherit category/subcategory
        parent_cache: dict[int, PimProduct] = {}

        for sp in sub_qs:
            try:
                parent_id = sku_to_parent.get(sp.product_code)

                # Variants inherit category/subcategory from their parent; only
                # base products use the subscription product's own category text.
                if parent_id:
                    if parent_id not in parent_cache:
                        try:
                            parent_cache[parent_id] = PimProduct.objects.get(pk=parent_id)
                        except PimProduct.DoesNotExist:
                            parent_cache[parent_id] = None
                    parent_obj = parent_cache[parent_id]
                    cat = parent_obj.category if parent_obj else unclassified
                    subcat = parent_obj.subcategory if parent_obj else None
                else:
                    cat_key = (sp.category or "").strip().lower()
                    cat = cat_map.get(cat_key, unclassified)
                    subcat = None

                sp_brand = getattr(sp, "brand", "") or ""
                pim, was_created = PimProduct.objects.get_or_create(
                    code=sp.product_code,
                    defaults={
                        "name": sp.name,
                        "brand": sp_brand,
                        "base_price": sp.base_price,
                        "description": sp.description or "",
                        "category": cat,
                        "subcategory": subcat,
                        "source_product": sp,
                        "is_active": sp.is_active,
                        "is_published": False,
                        "parent_id": parent_id,
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
                    if sp_brand and pim.brand != sp_brand:
                        pim.brand = sp_brand
                        changed.append("brand")
                    if parent_id and pim.parent_id != parent_id:
                        pim.parent_id = parent_id
                        changed.append("parent_id")
                    # Inherit category/subcategory from parent when variant has wrong category
                    if parent_id and cat and pim.category_id != cat.pk:
                        pim.category = cat
                        changed.append("category")
                    if parent_id and pim.subcategory_id != (subcat.pk if subcat else None):
                        pim.subcategory = subcat
                        changed.append("subcategory")
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

    @action(detail=True, methods=["post"])
    def adopt_orphan_variants(self, request, pk=None):
        """
        For a base product, find all child_pim_products that have no ProductVariant record
        and create the missing records, linking them to the base product and their
        existing operational (products_core) product.
        """
        try:
            from products_core.models import Product as CoreProduct
            base = self.get_object()
            adopted = []
            skipped = []
            errors = []

            for child in base.child_pim_products.all():
                if ProductVariant.objects.filter(sku=child.code).exists():
                    skipped.append(child.code)
                    continue
                # Find the operational product by product_code matching the child's code
                core = CoreProduct.objects.filter(product_code=child.code).first()
                try:
                    from django.db import transaction
                    from decimal import Decimal
                    with transaction.atomic():
                        pv = ProductVariant.objects.create(
                            product=base,
                            operational_product=core,
                            sku=child.code,
                            price=(core.base_price if core else child.base_price) or Decimal("0"),
                            quantity_on_hand=0,
                            reorder_level=5,
                            is_active=True,
                        )
                        PIMSyncService.sync_variant_to_operational_product(pv)
                        pv.refresh_from_db()
                        core = pv.operational_product
                        
                        if core and child.source_product != core:
                            child.source_product = core
                            child.save(update_fields=["source_product"])
                        adopted.append(child.code)
                except Exception as exc:
                    errors.append({"code": child.code, "error": str(exc)})

            status_code = 200 if not errors else 400
            if errors and not adopted:
                msg = "Failed to adopt orphans due to errors."
            elif errors:
                msg = f"Adopted {len(adopted)} orphan variant(s), but encountered errors."
            else:
                msg = f"Adopted {len(adopted)} orphan variant(s). {len(skipped)} already linked."

            return Response({
                "adopted": adopted,
                "skipped": skipped,
                "errors": errors,
                "message": msg,
            }, status=status_code)
        except Exception as exc:
            import traceback
            traceback.print_exc()
            return Response({
                "message": f"Critical error during adoption: {str(exc)}",
                "adopted": [],
                "skipped": [],
                "errors": [{"code": "CRITICAL", "error": str(exc)}]
            }, status=500)

    @action(detail=True, methods=["post"])
    def clean_stale_locks(self, request, pk=None):
        """Remove locked_attributes IDs that have no saved value on this product."""
        product = self.get_object()
        before = list(product.locked_attributes or [])
        valued_ids = set(
            ProductAttribute.objects.filter(
                product=product,
                attribute_id__in=before,
            ).exclude(
                value_text="",
                value_number__isnull=True,
                value_boolean__isnull=True,
                value_date__isnull=True,
            ).values_list("attribute_id", flat=True)
        )
        cleaned = [aid for aid in before if aid in valued_ids]
        removed = [aid for aid in before if aid not in valued_ids]
        product.locked_attributes = cleaned
        product.save(update_fields=["locked_attributes"])
        return Response({
            "before": before,
            "after": cleaned,
            "removed": removed,
            "message": f"Removed {len(removed)} stale lock(s) with no saved value.",
        })

    @action(detail=False, methods=["post"])
    def relink_parents(self, request):
        """
        Re-detect and assign parent PimProduct for all orphan (parentless) variant PIM products.
        Two strategies in order:
        1. Exact SKU match: PimProduct.code == ProductVariant.sku -> parent is variant.product
        2. Code prefix: PimProduct.code starts with another PimProduct.code + separator ('-' or '_')
        """
        # Strategy 1: exact SKU match
        sku_to_parent = {
            sku: product_id
            for sku, product_id in ProductVariant.objects.values_list("sku", "product_id").iterator()
        }
        # Strategy 2: build prefix map from all base PIM products sorted longest-first
        all_codes = list(PimProduct.objects.values_list("code", "id"))
        # Sort by code length descending so we match the most specific prefix first
        code_id_pairs = sorted(all_codes, key=lambda x: len(x[0]), reverse=True)

        updated = []
        orphans = PimProduct.objects.filter(parent__isnull=True)

        for pim in orphans:
            # Strategy 1
            parent_id = sku_to_parent.get(pim.code)
            if parent_id and parent_id != pim.pk:
                pim.parent_id = parent_id
                updated.append(pim)
                continue

            # Strategy 2: find longest other-product code that is a strict prefix
            for base_code, base_id in code_id_pairs:
                if base_id == pim.pk:
                    continue
                sep_pos = len(base_code)
                if (
                    pim.code.startswith(base_code)
                    and len(pim.code) > sep_pos
                    and pim.code[sep_pos] in ("-", "_")
                ):
                    pim.parent_id = base_id
                    updated.append(pim)
                    break

        if updated:
            PimProduct.objects.bulk_update(updated, ["parent_id"])

        return Response({"linked": len(updated), "message": f"Linked {len(updated)} orphan PIM product(s) to parent."})

    @action(detail=False, methods=["post"])
    def repair_variant_categories(self, request):
        """
        Fix variant PimProducts whose category/subcategory don't match their parent.
        Iterates all child PimProducts (parent != null) and copies category+subcategory
        from their parent. Safe to call multiple times (idempotent).
        """
        variants = PimProduct.objects.filter(parent__isnull=False).select_related("parent__category", "parent__subcategory")
        repaired = []
        for v in variants:
            parent = v.parent
            if not parent:
                continue
            changed = []
            if parent.category_id and v.category_id != parent.category_id:
                v.category_id = parent.category_id
                changed.append("category_id")
            if v.subcategory_id != parent.subcategory_id:
                v.subcategory_id = parent.subcategory_id
                changed.append("subcategory_id")
            if changed:
                v.save(update_fields=changed)
                repaired.append(v.code)
        return Response({
            "repaired": repaired,
            "count": len(repaired),
            "message": f"Repaired {len(repaired)} variant(s) to match parent category.",
        })

    @action(detail=False, methods=["get"])
    def tree_summary(self, request):
        """Counts for the PIM tree view — blueprints and their variant SKUs — under its filters."""
        blueprints = self.get_queryset()
        return Response({
            "blueprints": blueprints.count(),
            "published": blueprints.filter(is_published=True).count(),
            "draft": blueprints.filter(is_published=False).count(),
            "variant_skus": PimProduct.objects.filter(parent_id__in=blueprints.order_by().values("pk")).count(),
        })

    # ── "View in your room" AR ───────────────────────────────────────────────

    @action(detail=True, methods=["get"])
    def ar_size_suggestion(self, request, pk=None):
        """AR size (cm) read from this product's attributes — for the admin to confirm, never auto-saved."""
        from .services.ar_service import suggest_ar_size

        return Response({"suggestion": suggest_ar_size(self.get_object())})

    @action(detail=False, methods=["post"])
    def fill_ar_sizes(self, request):
        """Fill *blank* AR sizes from attributes on every active finished good. Never overwrites."""
        from decimal import Decimal

        from .models import PimProduct
        from .services.ar_service import suggest_ar_size

        def dec(value):
            return None if value is None else Decimal(str(value))

        filled = []
        blank = PimProduct.objects.filter(
            is_active=True, product_type="FINISHED_GOOD", ar_width_cm__isnull=True
        ).select_related("parent")
        for pim in blank:
            suggestion = suggest_ar_size(pim)
            if not suggestion:
                continue
            pim.ar_width_cm = dec(suggestion["width_cm"])
            pim.ar_depth_cm = dec(suggestion["depth_cm"])
            pim.ar_height_cm = dec(suggestion["height_cm"])
            pim.save(update_fields=["ar_width_cm", "ar_depth_cm", "ar_height_cm", "updated_at"])
            filled.append({"id": pim.id, "code": pim.code, "name": pim.name, **suggestion})
        return Response({"filled": len(filled), "products": filled[:200]})

    @action(detail=False, methods=["get"])
    def ar_coverage(self, request):
        """How many finished goods customers can place in their room, and which still can't."""
        from django.db.models import Exists, OuterRef, Q

        from .models import MediaKind, PimProduct, ProductMediaItem

        qs = PimProduct.objects.filter(is_active=True, product_type="FINISHED_GOOD")
        if request.query_params.get("published_only", "true").lower() != "false":
            qs = qs.filter(is_published=True)
        qs = qs.annotate(
            has_model=Exists(
                ProductMediaItem.objects.filter(kind=MediaKind.MODEL_3D).filter(
                    Q(product_id=OuterRef("pk")) | Q(product_id=OuterRef("parent_id"))
                )
            )
        )
        sized = Q(ar_width_cm__isnull=False, ar_depth_cm__isnull=False) | Q(
            parent__ar_width_cm__isnull=False, parent__ar_depth_cm__isnull=False
        )
        ready = Q(has_model=True) | sized
        missing = qs.exclude(ready).order_by("name")
        return Response({
            "total": qs.count(),
            "with_model": qs.filter(has_model=True).count(),
            "size_preview_only": qs.filter(sized, has_model=False).count(),
            "not_ready": missing.count(),
            "missing": [
                {"id": p.id, "code": p.code, "name": p.name, "is_published": p.is_published}
                for p in missing[:200]
            ],
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

    @action(detail=True, methods=["get", "post"])
    def accessories(self, request, pk=None):
        from .serializers import PimProductRelationshipSerializer
        from products_core.models import ProductRelationship
        product = self.get_object()

        if not product.source_product_id:
            return Response({"error": "PIM product is not published/linked to an operational product yet."}, status=400)

        if request.method == "GET":
            qs = ProductRelationship.objects.filter(product=product.source_product_id, parent_variant__isnull=True)
            return Response(PimProductRelationshipSerializer(qs, many=True).data)

        # POST method: adding a new accessory
        related_pim_id = request.data.get("related_pim_id")
        if not related_pim_id:
            return Response({"error": "related_pim_id is required."}, status=400)
            
        try:
            related_pim = PimProduct.objects.get(pk=related_pim_id)
        except PimProduct.DoesNotExist:
            return Response({"error": "Related PIM product not found."}, status=404)
            
        if not related_pim.source_product_id:
            return Response({"error": "Related PIM product is not published/linked to an operational product yet."}, status=400)

        rel, created = ProductRelationship.objects.get_or_create(
            product=product.source_product,
            related_product=related_pim.source_product,
            defaults={
                "parent_variant": None,
                "related_variant": None,
                "parent_variant_sku": None,
                "related_variant_sku": None,
            }
        )
        return Response(PimProductRelationshipSerializer(rel).data, status=201 if created else 200)

    @action(detail=True, methods=["delete"], url_path=r"accessories/(?P<accessory_id>\d+)")
    def delete_accessory(self, request, pk=None, accessory_id=None):
        from products_core.models import ProductRelationship
        product = self.get_object()
        
        if not product.source_product_id:
            return Response({"error": "PIM product not linked."}, status=400)
            
        try:
            rel = ProductRelationship.objects.get(pk=accessory_id, product=product.source_product_id)
            rel.delete()
            return Response(status=204)
        except ProductRelationship.DoesNotExist:
            return Response({"error": "Accessory relationship not found."}, status=404)

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


    def _handle_variant_file_uploads(self, request):
        data = request.data.copy() if hasattr(request.data, "copy") else request.data
        from django.core.files.storage import default_storage
        import uuid
        
        if 'image' in request.FILES:
            file_obj = request.FILES['image']
            ext = file_obj.name.split('.')[-1] if '.' in file_obj.name else 'bin'
            filename = f"{uuid.uuid4().hex[:10]}.{ext}"
            path = default_storage.save(f"pim/variants/{filename}", file_obj)
            data['image'] = request.build_absolute_uri(default_storage.url(path))
            
        if 'video' in request.FILES:
            file_obj = request.FILES['video']
            ext = file_obj.name.split('.')[-1] if '.' in file_obj.name else 'bin'
            filename = f"{uuid.uuid4().hex[:10]}.{ext}"
            path = default_storage.save(f"pim/variants/videos/{filename}", file_obj)
            data['video'] = request.build_absolute_uri(default_storage.url(path))
            
        return data

    def create(self, request, *args, **kwargs):
        data = self._handle_variant_file_uploads(request)
        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        from rest_framework.response import Response
        from rest_framework import status
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        old_sku = instance.sku
        data = self._handle_variant_file_uploads(request)
        serializer = self.get_serializer(instance, data=data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        if "sku" in data and instance.sku != old_sku:
            PIMSyncService.rename_variant_sku(instance, old_sku)
            PIMSyncService.sync_variant_to_operational_product(instance)
        if getattr(instance, '_prefetched_objects_cache', None):
            instance._prefetched_objects_cache = {}
        from rest_framework.response import Response
        return Response(serializer.data)

    def perform_update(self, serializer):

        variant = serializer.save()
        PIMSyncService.sync_variant_to_operational_product(variant)

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
        PIMSyncService.sync_variant_to_operational_product(variant)
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
        PIMSyncService.sync_variant_to_operational_product(variant)
        return Response(ProductVariantSerializer(variant).data)

    @action(detail=True, methods=["patch"])
    def update_attributes(self, request, pk=None):
        """Update variant attributes, pricing, and barcode; syncs to operational product and child PIM product."""
        from decimal import Decimal, InvalidOperation
        from django.db import transaction
        from .models import AttributeDataType, ProductAttribute

        with transaction.atomic():
            variant = self.get_object()
            old_sku = variant.sku
            dirty_fields = []

            # Scalar fields
            for field in ("price", "cost_price", "barcode", "reorder_level"):
                val = request.data.get(field)
                if val is not None:
                    setattr(variant, field, val)
                    dirty_fields.append(field)
            if request.data.get("sku") is not None:
                variant.sku = str(request.data.get("sku")).strip()
                dirty_fields.append("sku")
            if dirty_fields:
                variant.save(update_fields=dirty_fields)

            if variant.sku != old_sku:
                PIMSyncService.rename_variant_sku(variant, old_sku)

            # Find matching child PIM product if present
            child_pim = PimProduct.objects.filter(code=variant.sku, parent_id=variant.product_id).first()
            if not child_pim and old_sku:
                child_pim = PimProduct.objects.filter(code=old_sku, parent_id=variant.product_id).first()

            if child_pim:
                child_dirty = []
                if "price" in dirty_fields and variant.price is not None:
                    child_pim.base_price = variant.price
                    child_dirty.append("base_price")
                if "cost_price" in dirty_fields and variant.cost_price is not None:
                    child_pim.cost_price = variant.cost_price
                    child_dirty.append("cost_price")
                if child_dirty:
                    child_pim.save(update_fields=child_dirty)

            # Attribute values (upsert per attribute id)
            for av in request.data.get("attribute_values", []):
                attribute_id = av.get("attribute")
                if not attribute_id:
                    continue

                try:
                    attr_obj = CategoryAttribute.objects.get(id=attribute_id)
                except CategoryAttribute.DoesNotExist:
                    continue

                raw_text = av.get("value_text")
                raw_num = av.get("value_number")
                raw_bool = av.get("value_boolean")

                val_text = str(raw_text).strip() if raw_text is not None else ""
                val_num = None
                val_bool = None

                if attr_obj.data_type in (AttributeDataType.NUMBER, AttributeDataType.DECIMAL):
                    if raw_num is not None:
                        try:
                            val_num = Decimal(str(raw_num))
                        except (InvalidOperation, TypeError, ValueError):
                            val_num = None
                    elif val_text != "":
                        try:
                            val_num = Decimal(val_text)
                        except (InvalidOperation, TypeError, ValueError):
                            val_num = None
                    if val_num is not None and val_text == "":
                        val_text = str(val_num).rstrip('0').rstrip('.') if '.' in str(val_num) else str(val_num)
                elif attr_obj.data_type == AttributeDataType.BOOLEAN:
                    if raw_bool is not None:
                        val_bool = bool(raw_bool)
                    elif val_text != "":
                        low = val_text.lower()
                        if low in ("yes", "true", "1"):
                            val_bool = True
                        elif low in ("no", "false", "0"):
                            val_bool = False
                    if val_bool is not None:
                        val_text = "Yes" if val_bool else "No"
                else:
                    if raw_num is not None and not val_text:
                        val_text = str(raw_num)
                    elif raw_bool is not None and not val_text:
                        val_text = "Yes" if raw_bool else "No"

                is_empty = (val_text == "" and val_num is None and val_bool is None)

                if is_empty:
                    VariantAttributeValue.objects.filter(variant=variant, attribute=attr_obj).delete()
                    if child_pim:
                        ProductAttribute.objects.filter(product=child_pim, attribute=attr_obj).delete()
                else:
                    VariantAttributeValue.objects.update_or_create(
                        variant=variant,
                        attribute=attr_obj,
                        defaults={
                            "value_text": val_text,
                            "value_number": val_num,
                            "value_boolean": val_bool,
                        },
                    )
                    if child_pim:
                        ProductAttribute.objects.update_or_create(
                            product=child_pim,
                            attribute=attr_obj,
                            defaults={
                                "value_text": val_text,
                                "value_number": val_num,
                                "value_boolean": val_bool,
                            },
                        )

            PIMSyncService.sync_variant_to_operational_product(variant)

        variant.refresh_from_db()
        # Re-prefetch for correct serialisation
        variant = ProductVariant.objects.prefetch_related(
            "attribute_values__attribute"
        ).get(pk=variant.pk)
        return Response(ProductVariantSerializer(variant).data)


class ProductMediaItemViewSet(viewsets.ModelViewSet):
    """CRUD for product media gallery items (images + videos)."""
    permission_classes = [IsAuthenticated, IsAdmin]
    parser_classes_override = None

    def get_parser_classes(self):
        from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
        return [MultiPartParser, FormParser, JSONParser]

    @property
    def parser_classes(self):
        from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
        return [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        from .models import ProductMediaItem
        qs = ProductMediaItem.objects.select_related("variant")
        product_id = self.request.query_params.get("product")
        variant_id = self.request.query_params.get("variant")
        kind = self.request.query_params.get("kind")
        if product_id:
            qs = qs.filter(product_id=product_id)
        if variant_id:
            qs = qs.filter(variant_id=variant_id)
        if kind:
            qs = qs.filter(kind=kind)
        return qs

    def get_serializer_class(self):
        from .serializers import ProductMediaItemSerializer
        return ProductMediaItemSerializer


    def _handle_file_uploads(self, request):
        data = request.data.copy() if hasattr(request.data, "copy") else request.data
        from django.core.files.storage import default_storage
        import uuid
        
        if 'file' in request.FILES:
            file_obj = request.FILES['file']
            ext = file_obj.name.split('.')[-1] if '.' in file_obj.name else 'bin'
            filename = f"{uuid.uuid4().hex[:10]}.{ext}"
            path = default_storage.save(f"pim/gallery/{filename}", file_obj)
            data['file'] = request.build_absolute_uri(default_storage.url(path))
            
        if 'ios_file' in request.FILES:
            file_obj = request.FILES['ios_file']
            ext = file_obj.name.split('.')[-1] if '.' in file_obj.name else 'bin'
            filename = f"{uuid.uuid4().hex[:10]}.{ext}"
            path = default_storage.save(f"pim/models/ios/{filename}", file_obj)
            data['ios_file'] = request.build_absolute_uri(default_storage.url(path))
            
        return data

    def create(self, request, *args, **kwargs):
        data = self._handle_file_uploads(request)
        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        from rest_framework.response import Response
        from rest_framework import status
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        data = self._handle_file_uploads(request)
        serializer = self.get_serializer(instance, data=data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        from rest_framework.response import Response
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def set_hero(self, request, pk=None):
        """Mark this item as the hero of its kind; clears hero on the product's other items of that kind.

        Kind-scoped so choosing the primary 3D model never un-stars the hero photo.
        """
        from .models import ProductMediaItem
        item = self.get_object()
        ProductMediaItem.objects.filter(product=item.product, kind=item.kind, is_hero=True).update(is_hero=False)
        item.is_hero = True
        item.save(update_fields=["is_hero"])
        from .serializers import ProductMediaItemSerializer
        return Response(ProductMediaItemSerializer(item, context={"request": request}).data)
