"""
Shared customer views: search, quick-create, profile-summary.
Accessible by admin and partner roles (not public; not customer self-service).

Routes: /api/v1/customers/
"""

from __future__ import annotations

from rest_framework import status
from rest_framework.parsers import JSONParser
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin, IsPartnerOrAdmin
from api.v1.serializers.customers import (
    CustomerQuickCreateSerializer,
    CustomerSearchSerializer,
)
from subscriptions.models import Customer, CustomerSource
from subscriptions.services.customer_service import (
    find_customer_by_phone,
    find_or_create_customer,
    get_customer_operational_profile,
    get_partner_visible_customer_ids,
    normalize_phone,
    search_customers,
)


class CustomerSearchView(APIView):
    """
    GET /api/v1/customers/search/?phone=<>  (phone-first)
    GET /api/v1/customers/search/?q=<>     (generic)
    Accessible to admin and partner.
    Returns up to 20 results.
    """

    permission_classes = [IsPartnerOrAdmin]

    def get(self, request):
        phone = (request.query_params.get("phone") or "").strip()
        q = (request.query_params.get("q") or "").strip()

        if not phone and not q:
            return Response(
                {"detail": "Provide 'phone' or 'q' query parameter."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        actor_role = getattr(request.user, "role", "")
        # Partners may only see their own linked customers.
        partner_user = request.user if actor_role == "PARTNER" else None

        # Phone-exact lookup first for deduplication.
        # For partners the exact match is also scoped: a partner cannot learn
        # details of a customer they are not linked to.
        if phone:
            exact = find_customer_by_phone(phone)
            if exact:
                if partner_user is not None:
                    visible_ids = get_partner_visible_customer_ids(partner_user)
                    if exact.pk not in visible_ids:
                        # Phone exists but is not visible to this partner.
                        # Return empty; creation will still de-duplicate globally.
                        exact = None

            if exact:
                return Response(
                    {
                        "exact_match": True,
                        "count": 1,
                        "results": CustomerSearchSerializer(
                            [exact], many=True, context={"request": request}
                        ).data,
                    }
                )

        results = search_customers(
            phone=phone if phone else None,
            q=q if q else None,
            partner_user=partner_user,
        )
        return Response(
            {
                "exact_match": False,
                "count": len(results) if hasattr(results, "__len__") else results.count(),
                "results": CustomerSearchSerializer(
                    results, many=True, context={"request": request}
                ).data,
            }
        )


class CustomerQuickCreateView(APIView):
    """
    POST /api/v1/customers/create/

    Email-optional quick-create for shop direct sale.
    If phone already exists, returns the existing customer (no duplicate).
    Accessible to admin and partner.
    """

    permission_classes = [IsPartnerOrAdmin]
    parser_classes = [JSONParser]

    def post(self, request):
        serializer = CustomerQuickCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        norm_phone = data["phone"]
        existing = find_customer_by_phone(norm_phone)
        if existing:
            return Response(
                {
                    "created": False,
                    "detail": "Customer with this phone already exists. Returning existing record.",
                    "customer": CustomerSearchSerializer(
                        existing, context={"request": request}
                    ).data,
                },
                status=status.HTTP_200_OK,
            )

        # Determine source from actor role
        actor_role = getattr(request.user, "role", "")
        source = CustomerSource.PARTNER if actor_role == "PARTNER" else CustomerSource.ADMIN
        if data.get("source"):
            source = data["source"]

        try:
            customer, _ = find_or_create_customer(
                name=data["name"],
                phone=norm_phone,
                email=data.get("email", ""),
                address=data.get("address", ""),
                city=data.get("city", ""),
                source=source,
                created_by=request.user,
                created_by_partner=request.user if actor_role == "PARTNER" else None,
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            {
                "created": True,
                "detail": "Customer created successfully.",
                "customer": CustomerSearchSerializer(
                    customer, context={"request": request}
                ).data,
            },
            status=status.HTTP_201_CREATED,
        )


class CustomerProfileSummaryView(APIView):
    """
    GET /api/v1/customers/<id>/profile-summary/

    Full operational profile: subscriptions, payments, invoices, referrals.
    Accessible to admin (unrestricted) and partner (scoped to own linked customers).
    """

    permission_classes = [IsPartnerOrAdmin]

    def get(self, request, pk):
        try:
            customer = Customer.objects.select_related("user").get(pk=pk)
        except Customer.DoesNotExist:
            return Response(
                {"detail": "Customer not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        actor_role = getattr(request.user, "role", "")
        if actor_role == "PARTNER":
            visible_ids = get_partner_visible_customer_ids(request.user)
            if customer.pk not in visible_ids:
                # Return 404 – do not reveal the existence of the customer
                return Response(
                    {"detail": "Customer not found."},
                    status=status.HTTP_404_NOT_FOUND,
                )

        profile = get_customer_operational_profile(customer)
        return Response(profile)
