from django.db.models import Q
from rest_framework.response import Response

from api.v1.pagination import build_paginated_payload
from api.v1.serializers.subscription import SubscriptionListSerializer
from api.v1.views.admin_resources import SubscriptionAdminViewSet
from api.v1.views.customer import (
    CustomerSubscriptionListView,
    _customer_subscription_queryset,
    _get_customer_or_404_response,
)
from api.v1.views.partner_dashboard import (
    PartnerCustomerListView,
    PartnerSubscriptionListView,
    _get_partner_user,
    _partner_customer_queryset,
    _partner_subscription_queryset,
    _serialize_partner_customers,
)


class PaginatedSubscriptionAdminViewSet(SubscriptionAdminViewSet):
    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        payload = build_paginated_payload(
            request,
            queryset,
            serializer=lambda items: self.get_serializer(items, many=True).data,
        )
        return Response(payload)


class PaginatedPartnerSubscriptionListView(PartnerSubscriptionListView):
    def get(self, request):
        partner = _get_partner_user(request)
        subscriptions = _partner_subscription_queryset(partner)

        status_filter = (request.query_params.get("status") or "").strip()
        plan_type = (request.query_params.get("plan_type") or "").strip()
        customer_id = (request.query_params.get("customer") or "").strip()
        product_id = (request.query_params.get("product") or "").strip()
        batch_id = (request.query_params.get("batch") or "").strip()
        q = (request.query_params.get("q") or "").strip()

        if status_filter:
            subscriptions = subscriptions.filter(status=status_filter)

        if plan_type:
            subscriptions = subscriptions.filter(plan_type=plan_type)

        if customer_id:
            if customer_id.isdigit():
                subscriptions = subscriptions.filter(customer_id=int(customer_id))
            else:
                subscriptions = subscriptions.none()

        if product_id:
            if product_id.isdigit():
                subscriptions = subscriptions.filter(product_id=int(product_id))
            else:
                subscriptions = subscriptions.none()

        if batch_id:
            if batch_id.isdigit():
                subscriptions = subscriptions.filter(batch_id=int(batch_id))
            else:
                subscriptions = subscriptions.none()

        if q:
            search_filter = (
                Q(customer__name__icontains=q)
                | Q(customer__phone__icontains=q)
                | Q(product__name__icontains=q)
                | Q(product__product_code__icontains=q)
                | Q(batch__batch_code__icontains=q)
            )

            if q.isdigit():
                numeric_value = int(q)
                search_filter = (
                    search_filter
                    | Q(id=numeric_value)
                    | Q(customer_id=numeric_value)
                    | Q(product_id=numeric_value)
                    | Q(batch_id=numeric_value)
                    | Q(lucky_id__lucky_number=numeric_value)
                )

            subscriptions = subscriptions.filter(search_filter).distinct()

        payload = build_paginated_payload(
            request,
            subscriptions,
            serializer=lambda items: SubscriptionListSerializer(
                items,
                many=True,
                context={"request": request},
            ).data,
        )
        return Response(payload)


class PaginatedPartnerCustomerListView(PartnerCustomerListView):
    def get(self, request):
        partner = _get_partner_user(request)
        customers = _partner_customer_queryset(partner)

        search = (request.query_params.get("q") or "").strip()
        kyc_status = (request.query_params.get("kyc_status") or "").strip()

        if search:
            customers = customers.filter(
                Q(name__icontains=search) | Q(phone__icontains=search)
            )

        if kyc_status:
            customers = customers.filter(kyc_status=kyc_status)

        payload = build_paginated_payload(
            request,
            customers,
            serializer=_serialize_partner_customers,
        )
        return Response(payload)


class PaginatedCustomerSubscriptionListView(CustomerSubscriptionListView):
    def get(self, request):
        customer, error_response = _get_customer_or_404_response(request)
        if error_response is not None:
            return error_response

        subscriptions = _customer_subscription_queryset(customer)
        status_filter = (request.query_params.get("status") or "").strip()
        if status_filter:
            subscriptions = subscriptions.filter(status=status_filter)

        payload = build_paginated_payload(
            request,
            subscriptions,
            serializer=lambda items: SubscriptionListSerializer(
                items,
                many=True,
                context={"request": request},
            ).data,
        )
        return Response(payload)
