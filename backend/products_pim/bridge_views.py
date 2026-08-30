"""Product-keyed PIM endpoints.

These let the operational product module read and edit PIM attributes for a
`subscriptions.Product` by its own id, without the frontend needing to know the
PimProduct id. The PIM record is auto-created/linked on demand, so any product is
immediately editable. Because product and PIM share the linked record, edits here
reflect in the PIM module and vice versa.
"""
from __future__ import annotations

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from api.v1.permissions import IsAdmin
from rest_framework.response import Response
from rest_framework.views import APIView

from products_pim.models import CategoryAttribute, ProductAttribute
from products_pim.serializers import AttributeOptionSerializer
from products_pim.services import ensure_pim_product_for_product


def _resolve_product(product_id):
    from subscriptions.models import Product

    return Product.objects.filter(pk=product_id).first()


def _attribute_schema(pim):
    """Every attribute that applies to this product's category/subcategory, with
    its allowed options and the product's current value."""
    category_attributes = (
        CategoryAttribute.objects.filter(category=pim.category)
        .filter(subcategory__isnull=True)
        .order_by("display_order", "name")
    )
    if pim.subcategory_id:
        category_attributes = (
            CategoryAttribute.objects.filter(category=pim.category)
            .filter(subcategory__in=[None, pim.subcategory_id])
            .order_by("display_order", "name")
        )
    current = {pa.attribute_id: pa for pa in pim.attributes.all()}
    rows = []
    for attr in category_attributes:
        pa = current.get(attr.id)
        rows.append(
            {
                "attribute_id": attr.id,
                "name": attr.name,
                "slug": attr.slug,
                "data_type": attr.data_type,
                "is_required": getattr(attr, "is_required", False),
                "is_variant_defining": getattr(attr, "is_variant_defining", False),
                "options": AttributeOptionSerializer(attr.options.all(), many=True).data,
                "value_text": getattr(pa, "value_text", "") or "",
                "value_number": str(pa.value_number) if pa and pa.value_number is not None else None,
                "value_boolean": pa.value_boolean if pa else None,
                "value_date": pa.value_date.isoformat() if pa and pa.value_date else None,
            }
        )
    return rows


class ProductPimDetailView(APIView):
    """GET /admin/products/<product_id>/pim/ — linked PIM record + attribute schema."""

    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request, product_id):
        product = _resolve_product(product_id)
        if product is None:
            return Response({"detail": "Product not found."}, status=status.HTTP_404_NOT_FOUND)
        pim = ensure_pim_product_for_product(product)
        if pim is None:
            return Response(
                {"detail": "Product has no product_code, so it cannot be PIM-linked yet."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(
            {
                "product_id": product.id,
                "pim_product_id": pim.id,
                "code": pim.code,
                "name": pim.name,
                "category_id": pim.category_id,
                "category_name": pim.category.name if pim.category_id else None,
                "subcategory_id": pim.subcategory_id,
                "is_published": pim.is_published,
                "attributes": _attribute_schema(pim),
            }
        )

    def patch(self, request, product_id):
        """Assign the product's PIM category/subcategory (or publish flag). Setting a
        real category is what makes its attribute set appear for editing."""
        from products_pim.models import ProductCategory, ProductSubcategory

        product = _resolve_product(product_id)
        if product is None:
            return Response({"detail": "Product not found."}, status=status.HTTP_404_NOT_FOUND)
        pim = ensure_pim_product_for_product(product)
        if pim is None:
            return Response({"detail": "Product cannot be PIM-linked yet."}, status=status.HTTP_400_BAD_REQUEST)

        category_id = request.data.get("category_id")
        if category_id is not None:
            category = ProductCategory.objects.filter(pk=category_id).first()
            if category is None:
                return Response({"detail": "Category not found."}, status=status.HTTP_400_BAD_REQUEST)
            pim.category = category
            pim.subcategory = None  # reset subcategory when the category changes
        subcategory_id = request.data.get("subcategory_id")
        if subcategory_id is not None:
            subcategory = ProductSubcategory.objects.filter(pk=subcategory_id, category=pim.category).first()
            pim.subcategory = subcategory
        if "is_published" in request.data:
            pim.is_published = bool(request.data.get("is_published"))
        pim.save()
        return Response(
            {
                "product_id": product.id,
                "pim_product_id": pim.id,
                "category_id": pim.category_id,
                "category_name": pim.category.name if pim.category_id else None,
                "subcategory_id": pim.subcategory_id,
                "is_published": pim.is_published,
                "attributes": _attribute_schema(pim),
            }
        )


class ProductPimAccessoriesView(APIView):
    """GET/POST /pim/by-product/<product_id>/accessories/ — list or add accessories."""

    permission_classes = [IsAuthenticated, IsAdmin]

    def _pim_or_404(self, product_id):
        product = _resolve_product(product_id)
        if product is None:
            return None, Response({"detail": "Product not found."}, status=status.HTTP_404_NOT_FOUND)
        pim = ensure_pim_product_for_product(product)
        if pim is None:
            return None, Response({"detail": "Product cannot be PIM-linked yet."}, status=status.HTTP_400_BAD_REQUEST)
        return pim, None

    def get(self, request, product_id):
        from products_pim.serializers import PimProductRelationshipSerializer
        from products_core.models import ProductRelationship
        pim, err = self._pim_or_404(product_id)
        if err:
            return err
        rels = ProductRelationship.objects.filter(product=pim.source_product).select_related("related_product")
        return Response(PimProductRelationshipSerializer(rels, many=True).data)

    def post(self, request, product_id):
        from products_pim.serializers import PimProductRelationshipSerializer
        from products_core.models import ProductRelationship
        from products_pim.models import PimProduct
        pim, err = self._pim_or_404(product_id)
        if err:
            return err
        related_pim_id = request.data.get("related_pim_id")
        if not related_pim_id:
            return Response({"detail": "related_pim_id is required."}, status=status.HTTP_400_BAD_REQUEST)
        related_pim = PimProduct.objects.filter(pk=related_pim_id).first()
        if related_pim is None:
            return Response({"detail": "Related PIM product not found."}, status=status.HTTP_404_NOT_FOUND)
        if related_pim.source_product is None:
            return Response({"detail": "Related PIM product has no linked operational product."}, status=status.HTTP_400_BAD_REQUEST)
        rel, created = ProductRelationship.objects.get_or_create(
            product=pim.source_product,
            related_product=related_pim.source_product,
            defaults={"relationship_type": "ACCESSORY"},
        )
        return Response(PimProductRelationshipSerializer(rel).data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class ProductPimAccessoryDetailView(APIView):
    """DELETE /pim/by-product/<product_id>/accessories/<accessory_id>/"""

    permission_classes = [IsAuthenticated, IsAdmin]

    def delete(self, request, product_id, accessory_id):
        from products_core.models import ProductRelationship
        product = _resolve_product(product_id)
        if product is None:
            return Response({"detail": "Product not found."}, status=status.HTTP_404_NOT_FOUND)
        deleted, _ = ProductRelationship.objects.filter(pk=accessory_id, product=product).delete()
        if not deleted:
            return Response({"detail": "Accessory link not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProductPimVariantPublishControlView(APIView):
    """GET/PATCH /pim/by-product/<product_id>/variants/publish-control/

    GET  — returns base product + every variant with its individual is_published flag.
    PATCH — body: {"variants": [{"id": <pim_product_id>, "is_published": bool}]}
            or {"all": true/false} to flip all at once.
    """

    permission_classes = [IsAuthenticated, IsAdmin]

    def _pim_or_404(self, product_id):
        product = _resolve_product(product_id)
        if product is None:
            return None, Response({"detail": "Product not found."}, status=status.HTTP_404_NOT_FOUND)
        pim = ensure_pim_product_for_product(product)
        if pim is None:
            return None, Response({"detail": "Product cannot be PIM-linked yet."}, status=status.HTTP_400_BAD_REQUEST)
        return pim, None

    def _variant_rows(self, pim):
        rows = []
        for child in pim.child_pim_products.prefetch_related("variants").order_by("code"):
            variant = child.variants.first()
            rows.append({
                "id": child.id,
                "variant_id": variant.id if variant else None,
                "code": child.code,
                "name": child.name or child.code,
                "sku": variant.sku if variant else child.code,
                "is_published": child.is_published,
                "is_active": child.is_active,
                "price": str(variant.price) if variant else None,
            })
        return rows

    def _base_response(self, pim, product_id):
        from subscriptions.models import Product as OperationalProduct
        op = OperationalProduct.objects.filter(pk=product_id).first()
        return {
            "id": pim.id,
            "code": pim.code,
            "name": pim.name or (op.name if op else pim.code),
            "is_published": pim.is_published,
        }

    def _propagate_base(self, pim):
        """If any child is published, the base must be published too."""
        any_published = pim.child_pim_products.filter(is_published=True).exists()
        if any_published and not pim.is_published:
            pim.is_published = True
            pim.save(update_fields=["is_published"])

    def get(self, request, product_id):
        pim, err = self._pim_or_404(product_id)
        if err:
            return err
        return Response({
            "base": self._base_response(pim, product_id),
            "variants": self._variant_rows(pim),
        })

    def patch(self, request, product_id):
        pim, err = self._pim_or_404(product_id)
        if err:
            return err
        data = request.data

        # Bulk toggle all
        if "all" in data:
            flag = bool(data["all"])
            pim.is_published = flag
            pim.save(update_fields=["is_published"])
            pim.child_pim_products.all().update(is_published=flag)
            return Response({
                "base": self._base_response(pim, product_id),
                "variants": self._variant_rows(pim),
            })

        # Toggle base
        if "base_published" in data:
            pim.is_published = bool(data["base_published"])
            pim.save(update_fields=["is_published"])

        # Per-variant toggles — accept EITHER child PimProduct IDs OR ProductVariant IDs
        from products_pim.models import PimProduct, ProductVariant
        variant_updates = data.get("variants", [])
        if variant_updates:
            child_ids = set(pim.child_pim_products.values_list("id", flat=True))
            # Build ProductVariant.id → child PimProduct.id mapping for fallback
            variant_to_child = {
                v_id: pim_id
                for pim_id, v_id in pim.child_pim_products.values_list("id", "variants__id")
                if v_id is not None
            }
            any_published_now = False
            for row in variant_updates:
                vid = row.get("id")
                flag = bool(row.get("is_published", False))
                if vid in child_ids:
                    # Received a child PimProduct ID directly
                    PimProduct.objects.filter(pk=vid).update(is_published=flag)
                elif vid in variant_to_child:
                    # Received a ProductVariant ID — map to its child PimProduct
                    PimProduct.objects.filter(pk=variant_to_child[vid]).update(is_published=flag)
                if flag:
                    any_published_now = True

            # Auto-publish base when any child is published
            if any_published_now and not pim.is_published:
                pim.is_published = True
                pim.save(update_fields=["is_published"])
            else:
                # Re-read base state in case it changed
                pim.refresh_from_db(fields=["is_published"])

        return Response({
            "base": self._base_response(pim, product_id),
            "variants": self._variant_rows(pim),
        })


class ProductPimAttributesView(APIView):
    """PUT /admin/products/<product_id>/pim/attributes/ — upsert attribute values.

    Body: {"attributes": [{"attribute_id": int, "value_text"?, "value_number"?,
    "value_boolean"?, "value_date"?}]}. Writing here updates the shared PIM record,
    so the change shows in the PIM module immediately.
    """

    permission_classes = [IsAuthenticated, IsAdmin]

    def put(self, request, product_id):
        product = _resolve_product(product_id)
        if product is None:
            return Response({"detail": "Product not found."}, status=status.HTTP_404_NOT_FOUND)
        pim = ensure_pim_product_for_product(product)
        if pim is None:
            return Response({"detail": "Product cannot be PIM-linked yet."}, status=status.HTTP_400_BAD_REQUEST)

        incoming = request.data.get("attributes", [])
        if not isinstance(incoming, list):
            return Response({"detail": "attributes must be a list."}, status=status.HTTP_400_BAD_REQUEST)

        valid_attribute_ids = set(
            CategoryAttribute.objects.filter(category=pim.category).values_list("id", flat=True)
        )
        saved = 0
        for row in incoming:
            attribute_id = row.get("attribute_id")
            if attribute_id not in valid_attribute_ids:
                # Ignore attributes that do not belong to this product's category.
                continue
            defaults = {
                "value_text": row.get("value_text", "") or "",
                "value_number": row.get("value_number"),
                "value_boolean": row.get("value_boolean"),
                "value_date": row.get("value_date"),
            }
            ProductAttribute.objects.update_or_create(
                product=pim, attribute_id=attribute_id, defaults=defaults
            )
            saved += 1

        return Response({"saved": saved, "attributes": _attribute_schema(pim)})
