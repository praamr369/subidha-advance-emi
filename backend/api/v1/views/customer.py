from django.db.models import Count, Prefetch, Q, Sum
from django.http import HttpResponse
from rest_framework import status
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsCustomer
from api.v1.serializers.customer_profile import CustomerProfileSerializer
from api.v1.serializers.customers import (
    CustomerKycDocumentReadSerializer,
    CustomerKycDocumentUploadSerializer,
    CustomerReferralCreateSerializer,
    CustomerReferralReadSerializer,
    CustomerSearchSerializer,
)
from api.v1.serializers.delivery import CustomerSubscriptionDeliveryReadSerializer
from api.v1.serializers.payment import PaymentSerializer
from api.v1.serializers.support_requests import (
    CustomerSupportRequestCreateSerializer,
    CustomerSupportRequestReadSerializer,
)
from api.v1.serializers.subscription import (
    CustomerDashboardSubscriptionSerializer,
    SubscriptionDetailSerializer,
    SubscriptionListSerializer,
)
from subscriptions.models import (
    AuditLog,
    Customer,
    CustomerKycDocument,
    CustomerReferral,
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
from subscriptions.services.customer_service import (
    approve_kyc,
    create_kyc_update_request,
    create_referral,
    reject_kyc,
)
from subscriptions.services.dashboard_canonical_financial_summary_service import (
    get_dashboard_summary,
)
from subscriptions.services.dashboard_scopes import CustomerScope
from subscriptions.services.delivery_service import (
    build_delivery_report_summary,
    get_subscription_delivery_prefetch,
)
from subscriptions.services.document_pdf_service import render_delivery_handover_pdf
from subscriptions.services.subscription_financial_service import (
    get_subscription_detail_queryset,
)


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


def _money_string(value) -> str:
    return f"{value or MONEY_ZERO:.2f}"


class CustomerDashboard(APIView):
    permission_classes = [IsCustomer]

    def get(self, request):
        _, error_response = _get_customer_or_404_response(request)
        if error_response is not None:
            return error_response

        dashboard = get_dashboard_summary(CustomerScope(), request.user)

        return Response(
            {
                **dashboard.identity,
                "summary": dashboard.summary,
                "subscriptions": CustomerDashboardSubscriptionSerializer(
                    dashboard.subscriptions,
                    many=True,
                    context={
                        "request": request,
                        "use_canonical_financial_summary": True,
                    },
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

        subscriptions = _customer_subscription_detail_queryset(customer).order_by(
            "-created_at", "-id"
        )

        status_filter = (request.query_params.get("status") or "").strip()
        if status_filter:
            subscriptions = subscriptions.filter(status=status_filter)

        return Response(
            {
                "count": subscriptions.count(),
                "results": SubscriptionListSerializer(
                    subscriptions,
                    many=True,
                    context={
                        "request": request,
                        "use_canonical_financial_summary": True,
                    },
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

        recorded_total = payments.aggregate(total=Sum("amount"))["total"] or MONEY_ZERO
        reversed_payments = payments.filter(
            allocation_metadata__reversal__is_reversed=True
        )
        total_amount = (
            payments.exclude(allocation_metadata__reversal__is_reversed=True).aggregate(
                total=Sum("amount")
            )["total"]
            or MONEY_ZERO
        )
        reversed_total = reversed_payments.aggregate(total=Sum("amount"))["total"] or MONEY_ZERO

        return Response(
            {
                "count": payments.count(),
                "total_paid_amount": _money_string(total_amount),
                "recorded_amount_total": _money_string(recorded_total),
                "reversed_amount_total": _money_string(reversed_total),
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


class CustomerDeliveryPdfView(APIView):
    permission_classes = [IsCustomer]

    def get(self, request, pk):
        customer, error_response = _get_customer_or_404_response(request)
        if error_response is not None:
            return error_response
        delivery = _customer_delivery_queryset(customer).filter(pk=pk).first()
        if delivery is None:
            return Response({"detail": "Delivery not found."}, status=status.HTTP_404_NOT_FOUND)
        pdf_bytes = render_delivery_handover_pdf(delivery=delivery)
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = (
            f'attachment; filename="delivery-{delivery.delivery_reference or delivery.id}.pdf"'
        )
        return response


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


# ---------------------------------------------------------------------------
# Phase 1 – Customer Self-Service: Photo, KYC, Referrals
# ---------------------------------------------------------------------------

class CustomerPhotoUploadView(APIView):
    """
    POST /api/v1/customer/profile/photo/

    Customer uploads or replaces their profile photo.
    Audited. Does not touch financial records.
    """

    permission_classes = [IsCustomer]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        customer, error_response = _get_customer_or_404_response(request)
        if error_response is not None:
            return error_response

        photo = request.FILES.get("photo")
        if not photo:
            return Response(
                {"detail": "Photo file is required. Send as 'photo' in multipart/form-data."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        allowed_types = {"image/jpeg", "image/png", "image/webp"}
        if photo.content_type not in allowed_types:
            return Response(
                {"detail": "Only JPEG, PNG, or WebP images are accepted."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        max_size = 5 * 1024 * 1024  # 5 MB
        if photo.size > max_size:
            return Response(
                {"detail": "Photo must be smaller than 5 MB."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Delete old photo file if it exists to avoid orphaned files
        old_photo = customer.profile_photo
        customer.profile_photo = photo
        customer.save(update_fields=["profile_photo"])

        if old_photo:
            try:
                old_photo.delete(save=False)
            except Exception:
                pass  # Non-fatal – orphaned files can be cleaned up later

        AuditLog.objects.create(
            action_type=AuditLog.ActionType.CUSTOMER_PHOTO_UPDATED,
            model_name="Customer",
            object_id=customer.pk,
            performed_by=request.user,
            metadata={"filename": photo.name},
        )

        photo_url = None
        if customer.profile_photo:
            try:
                photo_url = request.build_absolute_uri(customer.profile_photo.url)
            except Exception:
                photo_url = customer.profile_photo.url

        return Response(
            {
                "detail": "Profile photo updated.",
                "photo_url": photo_url,
            },
            status=status.HTTP_200_OK,
        )


class CustomerKycDocumentListView(APIView):
    """
    GET /api/v1/customer/kyc/documents/

    Customer views own KYC documents.
    """

    permission_classes = [IsCustomer]

    def get(self, request):
        customer, error_response = _get_customer_or_404_response(request)
        if error_response is not None:
            return error_response

        docs = (
            CustomerKycDocument.objects.filter(customer=customer)
            .select_related("reviewed_by")
            .order_by("-created_at")
        )
        return Response(
            {
                "count": docs.count(),
                "kyc_status": customer.kyc_status,
                "results": CustomerKycDocumentReadSerializer(
                    docs, many=True, context={"request": request}
                ).data,
            }
        )


class CustomerKycDocumentView(APIView):
    """
    GET/POST /api/v1/customer/kyc-documents/
    """

    permission_classes = [IsCustomer]
    parser_classes = [MultiPartParser, FormParser]

    def get(self, request):
        return CustomerKycDocumentListView().get(request)

    def post(self, request):
        return CustomerKycUpdateRequestView().post(request)


class CustomerKycUpdateRequestView(APIView):
    """
    POST /api/v1/customer/kyc/request-update/

    Customer submits a KYC document for review.
    Status is set to SUBMITTED – never auto-approved.
    """

    permission_classes = [IsCustomer]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        customer, error_response = _get_customer_or_404_response(request)
        if error_response is not None:
            return error_response

        serializer = CustomerKycDocumentUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            doc = create_kyc_update_request(
                customer,
                document_type=serializer.validated_data["document_type"],
                file=serializer.validated_data["file"],
                notes=serializer.validated_data.get("notes", ""),
                uploaded_by=request.user,
            )
        except Exception as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        customer.refresh_from_db(fields=["kyc_status"])
        return Response(
            {
                "detail": "KYC document submitted for review. Admin approval required.",
                "kyc_status": customer.kyc_status,
                "document": CustomerKycDocumentReadSerializer(
                    doc, context={"request": request}
                ).data,
            },
            status=status.HTTP_201_CREATED,
        )


class CustomerReferralListView(APIView):
    """
    GET /api/v1/customer/referrals/

    Customer views own referrals (customers they referred).
    Commission is shown only if commission is enabled on the referral record.
    """

    permission_classes = [IsCustomer]

    def get(self, request):
        customer, error_response = _get_customer_or_404_response(request)
        if error_response is not None:
            return error_response

        referrals = (
            CustomerReferral.objects.filter(referrer=customer)
            .select_related("referred", "referred__user")
            .order_by("-created_at")
        )

        total_commission_approved = sum(
            r.commission_amount
            for r in referrals
            if r.commission_approved
        )

        return Response(
            {
                "count": referrals.count(),
                "commission_summary": {
                    "total_referrals": referrals.count(),
                    "approved_commissions": referrals.filter(commission_approved=True).count(),
                    "total_approved_commission_amount": str(total_commission_approved),
                },
                "results": CustomerReferralReadSerializer(referrals, many=True).data,
            }
        )


class CustomerReferralCreateView(APIView):
    """
    POST /api/v1/customer/referrals/

    Customer creates a referral.  Commission is NOT auto-enabled.
    """

    permission_classes = [IsCustomer]
    parser_classes = [JSONParser]

    def post(self, request):
        customer, error_response = _get_customer_or_404_response(request)
        if error_response is not None:
            return error_response

        serializer = CustomerReferralCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        referred_id = serializer.validated_data["referred_customer_id"]
        try:
            referred = Customer.objects.get(pk=referred_id)
        except Customer.DoesNotExist:
            return Response(
                {"detail": "Referred customer not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            referral = create_referral(
                customer,
                referred,
                created_by=request.user,
                notes=serializer.validated_data.get("notes", ""),
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            {
                "detail": "Referral recorded. Commission requires admin approval.",
                "referral": CustomerReferralReadSerializer(referral).data,
            },
            status=status.HTTP_201_CREATED,
        )
