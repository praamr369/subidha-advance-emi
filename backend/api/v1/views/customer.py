from decimal import Decimal

from django.db.models import Count, Prefetch, Q, Sum
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsCustomer
from api.v1.serializers.customer_profile import CustomerProfileSerializer
from api.v1.serializers.delivery import CustomerSubscriptionDeliveryReadSerializer
from api.v1.serializers.payment import PaymentSerializer
from api.v1.serializers.support_requests import (
    CustomerSupportRequestCreateSerializer,
    CustomerSupportRequestReadSerializer,
)
from api.v1.serializers.subscription import (
    SubscriptionDetailSerializer,
    SubscriptionListSerializer,
)
from subscriptions.models import (
    CustomerSupportRequest,
    Emi,
    EmiStatus,
    MONEY_ZERO,
    Payment,
    SubscriptionDelivery,
    SubscriptionStatus,
)
from subscriptions.services.customer_support_service import (
    create_customer_support_request,
)
from subscriptions.services.customer_account_service import build_customer_profile_summary
from subscriptions.services.delivery_service import (
    build_delivery_report_summary,
    get_subscription_delivery_prefetch,
)
from subscriptions.services.subscription_financial_service import (
    get_subscription_detail_queryset,
)
from subscriptions.services.winner_state_service import winner_history_q


def _get_customer_or_404_response(request):
    customer = getattr(request.user, "customer_profile", None)
    if customer is None:
        return None, Response(
            {"error": "customer profile missing"},
            status=status.HTTP_404_NOT_FOUND,
        )
    return customer, None


def _customer_subscription_queryset(customer):
    emi_queryset = (
        Emi.objects.select_related("subscription")
        .prefetch_related("payments")
        .order_by("month_no", "due_date", "id")
    )

    return (
        customer.subscriptions.select_related(
            "batch",
            "product",
            "lucky_id",
            "partner",
        )
        .prefetch_related(
            Prefetch("emis", queryset=emi_queryset),
            get_subscription_delivery_prefetch(),
        )
        .order_by("-created_at", "-id")
    )


def _customer_subscription_detail_queryset(customer):
    return get_subscription_detail_queryset().filter(customer=customer)


def _customer_delivery_queryset(customer):
    return (
        SubscriptionDelivery.objects.select_related(
            "subscription",
            "subscription__customer",
            "subscription__product",
            "subscription__batch",
            "subscription__lucky_id",
        )
        .filter(subscription__customer=customer)
        .order_by("-created_at", "-id")
    )


def _customer_payment_queryset(customer):
    return (
        Payment.objects.select_related(
            "customer",
            "subscription",
            "subscription__product",
            "subscription__batch",
            "subscription__partner",
            "subscription__lucky_id",
            "emi",
            "collected_by",
            "verified_by",
        )
        .filter(customer=customer)
        .order_by("-payment_date", "-id")
    )


def _customer_support_request_queryset(customer):
    return (
        CustomerSupportRequest.objects.select_related(
            "customer",
            "payment",
            "subscription",
        )
        .filter(customer=customer)
        .order_by("-created_at", "-id")
    )


def _safe_decimal(value) -> Decimal:
    if value is None:
        return MONEY_ZERO
    return Decimal(str(value))


def _build_dashboard_outstanding_amount(subscriptions) -> Decimal:
    total_outstanding = MONEY_ZERO

    for subscription in subscriptions:
        for emi in getattr(subscription, "emis", []).all() if hasattr(getattr(subscription, "emis", None), "all") else getattr(subscription, "emis", []):
            amount = _safe_decimal(getattr(emi, "amount", MONEY_ZERO))
            paid = _safe_decimal(
                emi.payments.aggregate(total=Sum("amount")).get("total") or MONEY_ZERO
            )
            waived = amount if getattr(emi, "status", "") == EmiStatus.WAIVED else MONEY_ZERO

            outstanding = amount - paid - waived
            if outstanding < MONEY_ZERO:
                outstanding = MONEY_ZERO

            total_outstanding += outstanding

    return total_outstanding


class CustomerDashboard(APIView):
    permission_classes = [IsCustomer]

    def get(self, request):
        customer, error_response = _get_customer_or_404_response(request)
        if error_response is not None:
            return error_response

        subscriptions = _customer_subscription_queryset(customer)

        emi_summary = Emi.objects.filter(subscription__customer=customer).aggregate(
            pending_emis=Count("id", filter=Q(status=EmiStatus.PENDING)),
            paid_emis=Count("id", filter=Q(status=EmiStatus.PAID)),
            waived_emis=Count("id", filter=Q(status=EmiStatus.WAIVED)),
        )

        total_paid_amount = (
            Payment.objects.filter(customer=customer).aggregate(total=Sum("amount"))[
                "total"
            ]
            or MONEY_ZERO
        )

        outstanding_amount = _build_dashboard_outstanding_amount(subscriptions)

        return Response(
            {
                "customer": {
                    "id": customer.id,
                    "name": customer.name,
                    "phone": customer.phone,
                    "kyc_status": customer.kyc_status,
                },
                "summary": {
                    "active_subscriptions": subscriptions.filter(
                        status=SubscriptionStatus.ACTIVE
                    ).count(),
                    "pending_emis": emi_summary["pending_emis"] or 0,
                    "paid_emis": emi_summary["paid_emis"] or 0,
                    "waived_emis": emi_summary["waived_emis"] or 0,
                    "total_paid_amount": str(total_paid_amount),
                    "outstanding_amount": str(outstanding_amount),
                },
                "subscriptions": SubscriptionListSerializer(
                    subscriptions,
                    many=True,
                    context={"request": request},
                ).data,
            }
        )


class CustomerProfileView(APIView):
    permission_classes = [IsCustomer]

    def get(self, request):
        customer, error_response = _get_customer_or_404_response(request)
        if error_response is not None:
            return error_response

        serializer = CustomerProfileSerializer(customer, context={"request": request})
        return Response(serializer.data)

    def patch(self, request):
        customer, error_response = _get_customer_or_404_response(request)
        if error_response is not None:
            return error_response

        serializer = CustomerProfileSerializer(
            customer,
            data=request.data,
            partial=True,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        customer = serializer.save()

        response_serializer = CustomerProfileSerializer(
            customer,
            context={"request": request},
        )
        payload = response_serializer.data
        payload["detail"] = "Customer profile updated successfully."
        payload["summary"] = build_customer_profile_summary(customer)
        return Response(payload, status=status.HTTP_200_OK)


class CustomerSubscriptionListView(APIView):
    permission_classes = [IsCustomer]

    def get(self, request):
        customer, error_response = _get_customer_or_404_response(request)
        if error_response is not None:
            return error_response

        subscriptions = _customer_subscription_queryset(customer)

        status_filter = (request.query_params.get("status") or "").strip()
        if status_filter:
            subscriptions = subscriptions.filter(status=status_filter)

        return Response(
            {
                "count": subscriptions.count(),
                "results": SubscriptionListSerializer(
                    subscriptions,
                    many=True,
                    context={"request": request},
                ).data,
            }
        )


class CustomerSubscriptionDetailView(APIView):
    permission_classes = [IsCustomer]

    def get(self, request, pk):
        customer, error_response = _get_customer_or_404_response(request)
        if error_response is not None:
            return error_response

        subscription = _customer_subscription_detail_queryset(customer).filter(
            pk=pk
        ).first()

        if subscription is None:
            return Response(
                {"error": "subscription not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(
            SubscriptionDetailSerializer(
                subscription,
                context={"request": request},
            ).data
        )


class CustomerPaymentListView(APIView):
    permission_classes = [IsCustomer]

    def get(self, request):
        customer, error_response = _get_customer_or_404_response(request)
        if error_response is not None:
            return error_response

        payments = _customer_payment_queryset(customer)

        subscription_id = (request.query_params.get("subscription") or "").strip()
        emi_id = (request.query_params.get("emi") or "").strip()
        method = (request.query_params.get("method") or "").strip()

        if subscription_id:
            if subscription_id.isdigit():
                payments = payments.filter(subscription_id=int(subscription_id))
            else:
                payments = payments.none()

        if emi_id:
            if emi_id.isdigit():
                payments = payments.filter(emi_id=int(emi_id))
            else:
                payments = payments.none()

        if method:
            payments = payments.filter(method=method)

        total_amount = payments.aggregate(total=Sum("amount"))["total"] or MONEY_ZERO

        return Response(
            {
                "count": payments.count(),
                "total_paid_amount": str(total_amount),
                "results": PaymentSerializer(payments, many=True).data,
            }
        )


class CustomerPaymentDetailView(APIView):
    permission_classes = [IsCustomer]

    def get(self, request, pk):
        customer, error_response = _get_customer_or_404_response(request)
        if error_response is not None:
            return error_response

        payment = _customer_payment_queryset(customer).filter(pk=pk).first()
        if payment is None:
            return Response(
                {"error": "payment not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(PaymentSerializer(payment).data)


class CustomerDeliveryListView(APIView):
    permission_classes = [IsCustomer]

    def get(self, request):
        customer, error_response = _get_customer_or_404_response(request)
        if error_response is not None:
            return error_response

        queryset = _customer_delivery_queryset(customer)

        status_filter = (request.query_params.get("status") or "").strip().upper()
        subscription_filter = (request.query_params.get("subscription") or "").strip()

        if status_filter:
            queryset = queryset.filter(status=status_filter)

        if subscription_filter:
            if subscription_filter.isdigit():
                queryset = queryset.filter(subscription_id=int(subscription_filter))
            else:
                queryset = queryset.none()

        serializer = CustomerSubscriptionDeliveryReadSerializer(queryset[:100], many=True)

        return Response(
            {
                "count": queryset.count(),
                "summary": build_delivery_report_summary(queryset),
                "results": serializer.data,
            }
        )


class CustomerDeliveryDetailView(APIView):
    permission_classes = [IsCustomer]

    def get(self, request, pk):
        customer, error_response = _get_customer_or_404_response(request)
        if error_response is not None:
            return error_response

        delivery = _customer_delivery_queryset(customer).filter(pk=pk).first()
        if delivery is None:
            return Response(
                {"error": "delivery not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(CustomerSubscriptionDeliveryReadSerializer(delivery).data)


class CustomerSupportRequestListCreateView(APIView):
    permission_classes = [IsCustomer]

    def get(self, request):
        customer, error_response = _get_customer_or_404_response(request)
        if error_response is not None:
            return error_response

        queryset = _customer_support_request_queryset(customer)

        status_filter = (request.query_params.get("status") or "").strip().upper()
        category_filter = (request.query_params.get("category") or "").strip().upper()

        if status_filter:
            queryset = queryset.filter(status=status_filter)

        if category_filter:
            queryset = queryset.filter(category=category_filter)

        serializer = CustomerSupportRequestReadSerializer(queryset[:50], many=True)

        return Response(
            {
                "count": queryset.count(),
                "results": serializer.data,
            }
        )

    def post(self, request):
        customer, error_response = _get_customer_or_404_response(request)
        if error_response is not None:
            return error_response

        serializer = CustomerSupportRequestCreateSerializer(
            data=request.data,
            context={"customer": customer},
        )
        serializer.is_valid(raise_exception=True)

        try:
            support_request = create_customer_support_request(
                customer=customer,
                category=serializer.validated_data["category"],
                message=serializer.validated_data["message"],
                payment=serializer.validated_data.get("payment"),
                subscription=serializer.validated_data.get("subscription"),
                performed_by=request.user,
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            {
                "detail": "Support request submitted successfully.",
                "request": CustomerSupportRequestReadSerializer(support_request).data,
            },
            status=status.HTTP_201_CREATED,
        )


class CustomerSupportRequestDetailView(APIView):
    permission_classes = [IsCustomer]

    def get(self, request, pk):
        customer, error_response = _get_customer_or_404_response(request)
        if error_response is not None:
            return error_response

        support_request = _customer_support_request_queryset(customer).filter(pk=pk).first()
        if support_request is None:
            return Response(
                {"error": "support request not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(CustomerSupportRequestReadSerializer(support_request).data)
