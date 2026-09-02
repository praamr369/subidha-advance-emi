"""
Customer-facing view of their own offers and personalised pricing.

A signed-in customer sees the price they are actually entitled to: the standard
price, plus any offer a staff member has approved for them. Pending grants are
deliberately not shown as a price — an offer is not theirs until it is approved.
"""
from __future__ import annotations

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsCustomer


def _customer_or_error(request):
    customer = getattr(request.user, "customer_profile", None)
    if customer is None:
        return None, Response(
            {"error": "customer profile missing"}, status=status.HTTP_404_NOT_FOUND
        )
    return customer, None


class CustomerMyOffersView(APIView):
    """Offers approved for this customer and currently in force."""

    permission_classes = [IsAuthenticated, IsCustomer]

    def get(self, request):
        from growth.services.customer_offer_service import live_grants_for

        customer, error = _customer_or_error(request)
        if error is not None:
            return error

        offers = []
        for grant in live_grants_for(customer):
            pkg = grant.offer_package
            offers.append(
                {
                    # Customer-facing detail only: the offer's name, what plan it
                    # applies to, and when it runs out. No internal package code,
                    # audience segment, or discount configuration.
                    "name": pkg.name,
                    "plan_type": pkg.plan_template.plan_type,
                    "valid_until": (
                        grant.expires_on.isoformat()
                        if grant.expires_on
                        else (pkg.end_date.isoformat() if pkg.end_date else None)
                    ),
                }
            )

        return Response({"offers": offers, "count": len(offers)})


class CustomerProductPricingView(APIView):
    """
    Personalised scheme pricing for one product.

    Same shape as the public product pricing block, but any offer approved for
    this customer is reflected in the figures.
    """

    permission_classes = [IsAuthenticated, IsCustomer]

    def get(self, request, product_code):
        from products_core.models import Product
        from growth.services.scheme_pricing_service import quote_product

        customer, error = _customer_or_error(request)
        if error is not None:
            return error

        product = (
            Product.objects.filter(
                product_code__iexact=product_code, is_active=True, pim__is_published=True
            )
            .distinct()
            .first()
        )
        if product is None:
            return Response(
                {"error": "Product not found."}, status=status.HTTP_404_NOT_FOUND
            )

        return Response(quote_product(product, public=True, customer=customer))
