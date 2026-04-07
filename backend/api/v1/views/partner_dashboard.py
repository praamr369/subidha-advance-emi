from decimal import Decimal

from django.db.models import Count, Prefetch, Q, Sum
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsPartner
from api.v1.serializers.partner_collection_request import (
    PartnerCollectionRequestSerializer,
)
from api.v1.serializers.payment import PaymentSerializer
from api.v1.serializers.subscription import (
    SubscriptionDetailSerializer,
    SubscriptionListSerializer,
)
from subscriptions.models import (
    Commission,
    CommissionStatus,
    Customer,
    Emi,
    EmiStatus,
    MONEY_ZERO,
    PartnerCollectionRequest,
    PartnerCollectionRequestStatus,
    Payment,
    Subscription,
    SubscriptionStatus,
)
from subscriptions.services.winner_state_service import winner_history_q


def _money(value) -> str:
    return f"{Decimal(value or MONEY_ZERO):.2f}"


def _get_partner_user(request):
    """
    Canonical partner identity for current codebase.

    Current schema:
    - Subscription.partner points directly to accounts.User
    - No partner_profile model exists
    """
    return request.user


def _serialize_partner_customers(customers):
    return [
        {
            "id": customer.id,
            "name": customer.name,
            "phone": customer.phone,
            "kyc_status": customer.kyc_status,
            "created_at": customer.created_at,
        }
        for customer in customers
    ]


def _partner_customer_queryset(partner):
    return (
        Customer.objects.filter(subscriptions__partner=partner)
        .distinct()
        .order_by("-created_at", "-id")
    )


def _partner_subscription_queryset(partner):
    emi_queryset = (
        Emi.objects.select_related("subscription")
        .prefetch_related("payments")
        .order_by("month_no", "due_date", "id")
    )

    return (
        Subscription.objects.select_related(
            "customer",
            "batch",
            "product",
            "lucky_id",
            "partner",
        )
        .prefetch_related(Prefetch("emis", queryset=emi_queryset))
        .filter(partner=partner)
        .order_by("-created_at", "-id")
    )


def _partner_all_payment_queryset(partner):
    """
    Full operational history, including reversed payments.
    Use this only when audit-style visibility is explicitly needed.
    """
    return (
        Payment.objects.select_related(
            "customer",
            "subscription",
            "subscription__customer",
            "subscription__product",
            "subscription__batch",
            "subscription__partner",
            "subscription__lucky_id",
            "emi",
            "collected_by",
            "verified_by",
        )
        .filter(subscription__partner=partner)
        .order_by("-payment_date", "-id")
    )


def _partner_active_payment_queryset(partner):
    """
    Financial truth for partner-facing revenue and collection visibility.

    Excludes reversed payments so:
    - rejected/cancelled requests never inflate totals
    - reversed rows do not remain in collected amount
    - partner finance summary remains net-correct
    """
    return _partner_all_payment_queryset(partner).exclude(
        allocation_metadata__reversal__is_reversed=True
    )


def _partner_collection_request_queryset(partner):
    return (
        PartnerCollectionRequest.objects.select_related(
            "partner",
            "subscription",
            "customer",
            "reviewed_by",
            "approved_payment",
            "approved_emi",
        )
        .filter(partner=partner)
        .order_by("-created_at", "-id")
    )


class PartnerDashboardView(APIView):
    permission_classes = [IsAuthenticated, IsPartner]

    def get(self, request):
        partner = _get_partner_user(request)

        subscriptions = _partner_subscription_queryset(partner)

        # Financial truth
        active_payments = _partner_active_payment_queryset(partner)

        # Full payment history kept available for future audit use if needed
        all_payments = _partner_all_payment_queryset(partner)

        commissions = Commission.objects.filter(partner=partner)
        collection_requests = _partner_collection_request_queryset(partner)

        total_revenue = (
            active_payments.aggregate(total=Sum("amount"))["total"] or MONEY_ZERO
        )

        total_customers = (
            Customer.objects.filter(subscriptions__partner=partner)
            .distinct()
            .count()
        )

        emi_summary = Emi.objects.filter(subscription__partner=partner).aggregate(
            pending=Count("id", filter=Q(status=EmiStatus.PENDING)),
            paid=Count("id", filter=Q(status=EmiStatus.PAID)),
            waived=Count("id", filter=Q(status=EmiStatus.WAIVED)),
        )

        commission_total = (
            commissions.exclude(status=CommissionStatus.REVERSED).aggregate(
                total=Sum("commission_amount")
            )["total"]
            or MONEY_ZERO
        )

        pending_commission = (
            commissions.filter(status=CommissionStatus.PENDING).aggregate(
                total=Sum("commission_amount")
            )["total"]
            or MONEY_ZERO
        )

        settled_commission = (
            commissions.filter(status=CommissionStatus.SETTLED).aggregate(
                total=Sum("commission_amount")
            )["total"]
            or MONEY_ZERO
        )

        request_summary = collection_requests.aggregate(
            submitted_count=Count(
                "id",
                filter=Q(status=PartnerCollectionRequestStatus.SUBMITTED),
            ),
            under_review_count=Count(
                "id",
                filter=Q(status=PartnerCollectionRequestStatus.UNDER_REVIEW),
            ),
            approved_count=Count(
                "id",
                filter=Q(status=PartnerCollectionRequestStatus.APPROVED),
            ),
            rejected_count=Count(
                "id",
                filter=Q(status=PartnerCollectionRequestStatus.REJECTED),
            ),
            cancelled_count=Count(
                "id",
                filter=Q(status=PartnerCollectionRequestStatus.CANCELLED),
            ),
        )

        # Primary workflow list:
        # keep live/approved progress here, not rejected/cancelled history
        recent_collection_requests = PartnerCollectionRequestSerializer(
            collection_requests.filter(
                status__in=[
                    PartnerCollectionRequestStatus.SUBMITTED,
                    PartnerCollectionRequestStatus.UNDER_REVIEW,
                    PartnerCollectionRequestStatus.APPROVED,
                ]
            )[:10],
            many=True,
        ).data

        # Verified financial activity:
        # only non-reversed real payment rows
        recent_verified_payments = PaymentSerializer(
            active_payments[:10],
            many=True,
        ).data

        # Operational follow-up:
        # rejected/cancelled stay visible, but outside finance totals
        follow_up_queue = PartnerCollectionRequestSerializer(
            collection_requests.filter(
                status__in=[
                    PartnerCollectionRequestStatus.REJECTED,
                    PartnerCollectionRequestStatus.CANCELLED,
                ]
            )[:10],
            many=True,
        ).data

        return Response(
            {
                "partner": {
                    "id": partner.id,
                    "username": getattr(partner, "username", "") or "",
                    "email": getattr(partner, "email", "") or "",
                    "phone": getattr(partner, "phone", "") or "",
                    "role": getattr(partner, "role", "") or "",
                },
                "summary": {
                    "total_customers": total_customers,
                    "total_subscriptions": subscriptions.count(),
                    "active_subscriptions": subscriptions.filter(
                        status=SubscriptionStatus.ACTIVE
                    ).count(),
                    "completed_subscriptions": subscriptions.filter(
                        status=SubscriptionStatus.COMPLETED
                    ).count(),
                    "won_subscriptions": subscriptions.filter(winner_history_q()).distinct().count(),
                    "defaulted_subscriptions": subscriptions.filter(
                        status=SubscriptionStatus.DEFAULTED
                    ).count(),
                    "pending_emis": emi_summary["pending"] or 0,
                    "paid_emis": emi_summary["paid"] or 0,
                    "waived_emis": emi_summary["waived"] or 0,
                    "total_revenue_collected": _money(total_revenue),
                    "total_commission": _money(commission_total),
                    "pending_commission": _money(pending_commission),
                    "settled_commission": _money(settled_commission),
                    "submitted_collection_requests": request_summary["submitted_count"]
                    or 0,
                    "under_review_collection_requests": request_summary[
                        "under_review_count"
                    ]
                    or 0,
                    "approved_collection_requests": request_summary["approved_count"]
                    or 0,
                    "rejected_collection_requests": request_summary["rejected_count"]
                    or 0,
                    "cancelled_collection_requests": request_summary["cancelled_count"]
                    or 0,
                    "verified_payment_count": active_payments.count(),
                    "all_payment_rows_count": all_payments.count(),
                },
                "recent_collection_requests": recent_collection_requests,
                "recent_verified_payments": recent_verified_payments,
                "follow_up_queue": follow_up_queue,
            }
        )


class PartnerSubscriptionListView(APIView):
    permission_classes = [IsAuthenticated, IsPartner]

    def get(self, request):
        partner = _get_partner_user(request)

        subscriptions = _partner_subscription_queryset(partner)

        status_filter = (request.query_params.get("status") or "").strip()
        plan_type = (request.query_params.get("plan_type") or "").strip()
        customer_id = (request.query_params.get("customer") or "").strip()
        product_id = (request.query_params.get("product") or "").strip()
        batch_id = (request.query_params.get("batch") or "").strip()

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


class PartnerSubscriptionDetailView(APIView):
    permission_classes = [IsAuthenticated, IsPartner]

    def get(self, request, pk):
        partner = _get_partner_user(request)

        subscription = _partner_subscription_queryset(partner).filter(pk=pk).first()
        if subscription is None:
            return Response(
                {"detail": "Subscription not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(
            SubscriptionDetailSerializer(
                subscription,
                context={"request": request},
            ).data
        )


class PartnerCustomerListView(APIView):
    permission_classes = [IsAuthenticated, IsPartner]

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

        return Response(
            {
                "count": customers.count(),
                "results": _serialize_partner_customers(customers),
            }
        )


class PartnerCustomerDetailView(APIView):
    permission_classes = [IsAuthenticated, IsPartner]

    def get(self, request, pk):
        partner = _get_partner_user(request)

        customer = _partner_customer_queryset(partner).filter(pk=pk).first()
        if customer is None:
            return Response({"detail": "Customer not found."}, status=404)

        subscriptions = _partner_subscription_queryset(partner).filter(customer=customer)
        payments = _partner_active_payment_queryset(partner).filter(customer=customer)
        emis = Emi.objects.filter(subscription__partner=partner, subscription__customer=customer)

        total_collected = payments.aggregate(total=Sum("amount"))["total"] or MONEY_ZERO

        return Response(
            {
                "customer": {
                    "id": customer.id,
                    "name": customer.name,
                    "phone": customer.phone,
                    "kyc_status": customer.kyc_status,
                    "created_at": customer.created_at,
                },
                "summary": {
                    "total_subscriptions": subscriptions.count(),
                    "active_subscriptions": subscriptions.filter(
                        status=SubscriptionStatus.ACTIVE
                    ).count(),
                    "completed_subscriptions": subscriptions.filter(
                        status=SubscriptionStatus.COMPLETED
                    ).count(),
                    "won_subscriptions": subscriptions.filter(winner_history_q()).distinct().count(),
                    "defaulted_subscriptions": subscriptions.filter(
                        status=SubscriptionStatus.DEFAULTED
                    ).count(),
                    "pending_emis": emis.filter(status=EmiStatus.PENDING).count(),
                    "paid_emis": emis.filter(status=EmiStatus.PAID).count(),
                    "waived_emis": emis.filter(status=EmiStatus.WAIVED).count(),
                    "total_collected": _money(total_collected),
                },
                "subscriptions": SubscriptionListSerializer(
                    subscriptions,
                    many=True,
                    context={"request": request},
                ).data,
                "recent_payments": PaymentSerializer(
                    payments[:20],
                    many=True,
                ).data,
            }
        )


class PartnerPaymentListView(APIView):
    permission_classes = [IsAuthenticated, IsPartner]

    def get(self, request):
        partner = _get_partner_user(request)

        # Partner-facing payment register should show financial truth only
        payments = _partner_active_payment_queryset(partner)

        method = (request.query_params.get("method") or "").strip()
        subscription_id = (request.query_params.get("subscription") or "").strip()
        customer_id = (request.query_params.get("customer") or "").strip()
        emi_id = (request.query_params.get("emi") or "").strip()
        q = (request.query_params.get("q") or "").strip()

        if method:
            payments = payments.filter(method=method)

        if subscription_id:
            if subscription_id.isdigit():
                payments = payments.filter(subscription_id=int(subscription_id))
            else:
                payments = payments.none()

        if customer_id:
            if customer_id.isdigit():
                payments = payments.filter(customer_id=int(customer_id))
            else:
                payments = payments.none()

        if emi_id:
            if emi_id.isdigit():
                payments = payments.filter(emi_id=int(emi_id))
            else:
                payments = payments.none()

        if q:
            payments = payments.filter(
                Q(reference_no__icontains=q)
                | Q(customer__name__icontains=q)
                | Q(customer__phone__icontains=q)
                | Q(subscription__product__name__icontains=q)
                | Q(subscription__product__product_code__icontains=q)
                | Q(subscription__batch__batch_code__icontains=q)
            )

        total_amount = payments.aggregate(total=Sum("amount"))["total"] or MONEY_ZERO

        return Response(
            {
                "count": payments.count(),
                "total_collected": _money(total_amount),
                "results": PaymentSerializer(payments, many=True).data,
            }
        )


class PartnerPaymentDetailView(APIView):
    permission_classes = [IsAuthenticated, IsPartner]

    def get(self, request, pk):
        partner = _get_partner_user(request)

        payment = _partner_active_payment_queryset(partner).filter(pk=pk).first()
        if payment is None:
            return Response(
                {"detail": "Partner payment not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        payload = PaymentSerializer(payment, context={"request": request}).data

        return Response(
            {
                "payment": payload,
                "status_label": "RECORDED",
            }
        )


class PartnerEarningsSummaryView(APIView):
    permission_classes = [IsAuthenticated, IsPartner]

    def get(self, request):
        partner = _get_partner_user(request)

        # Earnings summary must also exclude reversed rows
        payments = _partner_active_payment_queryset(partner)
        commissions = Commission.objects.filter(partner=partner)

        total_collected = payments.aggregate(total=Sum("amount"))["total"] or MONEY_ZERO

        total_commission = (
            commissions.exclude(status=CommissionStatus.REVERSED).aggregate(
                total=Sum("commission_amount")
            )["total"]
            or MONEY_ZERO
        )

        pending_commission = (
            commissions.filter(status=CommissionStatus.PENDING).aggregate(
                total=Sum("commission_amount")
            )["total"]
            or MONEY_ZERO
        )

        settled_commission = (
            commissions.filter(status=CommissionStatus.SETTLED).aggregate(
                total=Sum("commission_amount")
            )["total"]
            or MONEY_ZERO
        )

        monthly_collection = list(
            payments.values("payment_date__year", "payment_date__month")
            .annotate(total=Sum("amount"))
            .order_by("payment_date__year", "payment_date__month")
        )

        monthly_commission = list(
            commissions.exclude(status=CommissionStatus.REVERSED)
            .values("created_at__year", "created_at__month")
            .annotate(total=Sum("commission_amount"))
            .order_by("created_at__year", "created_at__month")
        )

        return Response(
            {
                "total_collected": _money(total_collected),
                "total_commission": _money(total_commission),
                "pending_commission": _money(pending_commission),
                "settled_commission": _money(settled_commission),
                "monthly_collection": monthly_collection,
                "monthly_commission": monthly_commission,
            }
        )
