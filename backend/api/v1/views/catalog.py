"""Portal-facing product catalog endpoints.

The admin approves (activates) products and toggles their purpose flags
(EMI / Rent / Lease / Direct Sale). Customers, partners, and vendors all read
that same approved catalog through the role-scoped views below:

* Customers browse approved products by purpose to raise EMI / direct-sale /
  rent / lease / purchase requests.
* Partners browse the same catalog to raise requests on behalf of a customer.
* Vendors see which product categories they supply to the business.
"""
from __future__ import annotations

from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.pagination import build_paginated_payload
from api.v1.permissions import IsCustomer, IsPartner, IsVendor
from products.services.catalog_browse_service import (
    approved_catalog_queryset,
    catalog_categories,
    filter_catalog,
    purpose_catalog_summary,
    serialize_catalog_product,
    serialize_catalog_product_detail,
)


def _filtered_catalog(request):
    return filter_catalog(
        approved_catalog_queryset(),
        purpose=request.query_params.get("purpose"),
        category=request.query_params.get("category"),
        search=request.query_params.get("search") or request.query_params.get("q"),
    )


class _CatalogListMixin:
    """Shared paginated catalog list for any authenticated portal role."""

    def get(self, request):
        queryset = _filtered_catalog(request)
        payload = build_paginated_payload(
            request,
            queryset,
            serializer=lambda items: [
                serialize_catalog_product(product, request) for product in items
            ],
            default_page_size=24,
        )
        return payload if isinstance(payload, Response) else Response(payload)


class _CatalogDetailMixin:
    """Shared catalog detail view for any authenticated portal role."""

    def get(self, request, pk):
        from django.shortcuts import get_object_or_404

        queryset = approved_catalog_queryset()
        product = get_object_or_404(queryset, pk=pk)
        return Response(serialize_catalog_product_detail(product, request))


class _CatalogFacetsMixin:
    """Category + purpose facets for the catalog filter rail."""

    def get(self, request):
        base = approved_catalog_queryset()
        return Response(
            {
                "categories": catalog_categories(base),
                "purposes": purpose_catalog_summary(base),
                "total": base.count(),
            }
        )


class CustomerCatalogListView(_CatalogListMixin, APIView):
    permission_classes = [permissions.IsAuthenticated, IsCustomer]


class CustomerCatalogDetailView(_CatalogDetailMixin, APIView):
    permission_classes = [permissions.IsAuthenticated, IsCustomer]


class CustomerCatalogFacetsView(_CatalogFacetsMixin, APIView):
    permission_classes = [permissions.IsAuthenticated, IsCustomer]


class PartnerCatalogListView(_CatalogListMixin, APIView):
    permission_classes = [permissions.IsAuthenticated, IsPartner]


class PartnerCatalogDetailView(_CatalogDetailMixin, APIView):
    permission_classes = [permissions.IsAuthenticated, IsPartner]


class PartnerCatalogFacetsView(_CatalogFacetsMixin, APIView):
    permission_classes = [permissions.IsAuthenticated, IsPartner]


class VendorCatalogListView(_CatalogListMixin, APIView):
    permission_classes = [permissions.IsAuthenticated, IsVendor]


class VendorCatalogDetailView(_CatalogDetailMixin, APIView):
    permission_classes = [permissions.IsAuthenticated, IsVendor]


class VendorCatalogFacetsView(_CatalogFacetsMixin, APIView):
    permission_classes = [permissions.IsAuthenticated, IsVendor]
