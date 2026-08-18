from django.db.models import Q
from products_pim.services.sync_service import PIMSyncService
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
        qs = PimProduct.objects.select_related("category", "subcategory", "parent__category", "parent__subcategory").prefetch_related(
            "attributes__attribute",
            "variants__attribute_values__attribute",
            "child_pim_products",
        )
        category_id = self.request.query_params.get("category")
        subcategory_id = self.request.query_params.get("subcategory")
        search = self.request.query_params.get("search")
        is_published = self.request.query_params.get("is_published")
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
        variants = product.variants.filter(is_active=True).prefetch_related("attribute_values__attribute")
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
                op.name = product.name
                changed = True
            if changed:
                op.save()
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
            if not core:
                errors.append({"code": child.code, "error": "No operational product found"})
                continue
            try:
                pv = ProductVariant.objects.create(
                    product=base,
                    operational_product=core,
                    sku=child.code,
                    price=core.base_price or child.base_price,
                    quantity_on_hand=0,
                    reorder_level=5,
                    is_active=True,
                )
                PIMSyncService.sync_variant_to_operational_product(pv)
                adopted.append(child.code)
            except Exception as exc:
                errors.append({"code": child.code, "error": str(exc)})

        return Response({
            "adopted": adopted,
            "skipped": skipped,
            "errors": errors,
            "message": f"Adopted {len(adopted)} orphan variant(s). {len(skipped)} already linked.",
        })

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
            v.sku: v.product_id
            for v in ProductVariant.objects.values_list("sku", "product_id").iterator()
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
        """Update variant attributes, pricing, and barcode; syncs to operational product."""
        variant = self.get_object()
        dirty_fields = []

        # Scalar fields
        for field in ("price", "cost_price", "barcode", "reorder_level"):
            val = request.data.get(field)
            if val is not None:
                setattr(variant, field, val)
                dirty_fields.append(field)
        if dirty_fields:
            variant.save(update_fields=dirty_fields)

        # Attribute values (upsert per attribute id)
        for av in request.data.get("attribute_values", []):
            attribute_id = av.get("attribute")
            if not attribute_id:
                continue
            VariantAttributeValue.objects.update_or_create(
                variant=variant,
                attribute_id=attribute_id,
                defaults={
                    "value_text": av.get("value_text", ""),
                    "value_number": av.get("value_number"),
                    "value_boolean": av.get("value_boolean"),
                },
            )

        PIMSyncService.sync_variant_to_operational_product(variant)
        variant.refresh_from_db()
        # Re-prefetch for correct serialisation
        variant = ProductVariant.objects.prefetch_related(
            "attribute_values__attribute"
        ).get(pk=variant.pk)
        return Response(ProductVariantSerializer(variant).data)
