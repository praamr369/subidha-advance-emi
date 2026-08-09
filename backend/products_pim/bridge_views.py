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
