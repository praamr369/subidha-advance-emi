from django.db.models import Q
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from billing.services.direct_sale_delivery_queue import (
    DIRECT_SALE_SUCCESS_TERMINAL_STATUSES,
    apply_direct_sale_case_filters,
    direct_sale_delivery_cases_queryset,
    merge_delivery_summaries,
    serialize_direct_sale_delivery_case,
)
from service_desk.models import ServiceDeskCaseStatus
from api.v1.serializers.delivery import (
    AdminDeliveryDirectSaleSourceSerializer,
    AdminDeliveryDirectSaleSourcesQuerySerializer,
    AdminDeliverySourceSubscriptionsQuerySerializer,
    AdminDeliverySourceSubscriptionSerializer,
    AdminSubscriptionDeliveryCreateSerializer,
    AdminSubscriptionDeliveryMarkDeliveredSerializer,
    AdminSubscriptionDeliveryReadSerializer,
    AdminSubscriptionDeliveryReasonSerializer,
    AdminSubscriptionDeliveryTransitionSerializer,
    AdminSubscriptionDeliveryUpdateSerializer,
)
from billing.models import DirectSale, DirectSaleStatus
from billing.services.direct_sale_delivery_bridge_service import sync_direct_sale_delivery_case
from subscriptions.models import DeliveryStatus, Subscription, SubscriptionDelivery
from subscriptions.services.delivery_service import get_subscription_delivery_prefetch
from subscriptions.services.document_pdf_service import render_delivery_handover_pdf
from subscriptions.services.delivery_service import (
    build_delivery_report_summary,
    cancel_subscription_delivery,
    create_subscription_delivery,
    get_delivery_queryset,
    mark_subscription_delivery_delivered,
    mark_subscription_delivery_failed,
    mark_subscription_delivery_returned,
    request_subscription_delivery_return,
    transition_subscription_delivery_status,
    update_subscription_delivery_metadata,
)


def _apply_delivery_filters(queryset, request):
    q = (request.query_params.get("q") or "").strip()
    status_filter = (request.query_params.get("status") or "").strip().upper()
    customer_filter = (request.query_params.get("customer") or "").strip()
    subscription_filter = (request.query_params.get("subscription") or "").strip()
    batch_filter = (request.query_params.get("batch") or "").strip()
    bucket = (request.query_params.get("bucket") or "").strip().upper()
    date_from = (request.query_params.get("date_from") or "").strip()
    date_to = (request.query_params.get("date_to") or "").strip()

    if status_filter and status_filter in DeliveryStatus.values:
        queryset = queryset.filter(status=status_filter)

    if customer_filter:
        if customer_filter.isdigit():
            queryset = queryset.filter(subscription__customer_id=int(customer_filter))
        else:
            queryset = queryset.none()

    if subscription_filter:
        if subscription_filter.isdigit():
            queryset = queryset.filter(subscription_id=int(subscription_filter))
        else:
            queryset = queryset.none()

    if batch_filter:
        if batch_filter.isdigit():
            queryset = queryset.filter(subscription__batch_id=int(batch_filter))
        else:
            queryset = queryset.none()

    if bucket == "DELIVERED":
        queryset = queryset.filter(status=DeliveryStatus.DELIVERED)
    elif bucket == "READY_DISPATCH":
        queryset = queryset.filter(status=DeliveryStatus.SCHEDULED)
    elif bucket == "PENDING":
        queryset = queryset.filter(
            status__in=[
                DeliveryStatus.PENDING,
                DeliveryStatus.SCHEDULED,
                DeliveryStatus.DISPATCHED,
                DeliveryStatus.OUT_FOR_DELIVERY,
                DeliveryStatus.RETURN_REQUESTED,
            ]
        )

    if date_from:
        queryset = queryset.filter(created_at__date__gte=date_from)

    if date_to:
        queryset = queryset.filter(created_at__date__lte=date_to)

    if q:
        filters = (
            Q(delivery_reference__icontains=q)
            | Q(receiver_name__icontains=q)
            | Q(receiver_phone__icontains=q)
            | Q(delivery_address_snapshot__icontains=q)
            | Q(notes__icontains=q)
            | Q(failure_reason__icontains=q)
            | Q(subscription__customer__name__icontains=q)
            | Q(subscription__customer__phone__icontains=q)
            | Q(subscription__product__name__icontains=q)
            | Q(subscription__batch__batch_code__icontains=q)
        )
        if q.isdigit():
            filters = filters | Q(id=int(q)) | Q(subscription_id=int(q)) | Q(subscription__customer_id=int(q))
        queryset = queryset.filter(filters)

    return queryset


class AdminDeliveryListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        source_type = (request.query_params.get("source_type") or "ALL").strip().upper()
        include_sub = source_type in ("ALL", "SUBSCRIPTION")
        include_ds = source_type in ("ALL", "DIRECT_SALE")

        bucket_upper = (request.query_params.get("bucket") or "").strip().upper()
        ds_active_only = bucket_upper != "DELIVERED"

        subscription_rows: list[dict] = []
        sub_count = 0
        sub_summary = build_delivery_report_summary(SubscriptionDelivery.objects.none())

        if include_sub:
            queryset = _apply_delivery_filters(get_delivery_queryset(), request)
            serializer = AdminSubscriptionDeliveryReadSerializer(queryset[:200], many=True)
            subscription_rows = list(serializer.data)
            sub_summary = build_delivery_report_summary(queryset)
            sub_count = queryset.count()

        include_direct_sale_cases_flag = (
            request.query_params.get("include_direct_sale_cases") or "true"
        ).strip().lower() not in {
            "false",
            "0",
            "no",
        }
        include_ds_merge = include_ds and include_direct_sale_cases_flag

        ds_payloads: list[dict] = []
        if include_ds_merge:
            ds_qs = apply_direct_sale_case_filters(
                direct_sale_delivery_cases_queryset(active_only=ds_active_only),
                request,
            )
            ds_cases = list(ds_qs[:400])
            ds_payloads = [serialize_direct_sale_delivery_case(c) for c in ds_cases]
            pending_ds = sum(
                1
                for c in ds_cases
                if c.status in (ServiceDeskCaseStatus.OPEN, ServiceDeskCaseStatus.UNDER_REVIEW)
            )
            scheduled_ds = sum(1 for c in ds_cases if c.status == ServiceDeskCaseStatus.AUTHORIZED)
            ofd_ds = sum(1 for c in ds_cases if c.status == ServiceDeskCaseStatus.IN_SERVICE)
            delivered_ds = sum(1 for c in ds_cases if c.status in DIRECT_SALE_SUCCESS_TERMINAL_STATUSES)
            sub_summary = merge_delivery_summaries(
                subscription_summary=sub_summary,
                direct_sale_cases_count=len(ds_cases),
                pending_ds=pending_ds,
                scheduled_ds=scheduled_ds,
                ofd_ds=ofd_ds,
                delivered_ds=delivered_ds,
            )

        if not include_sub and not include_ds_merge:
            return Response(
                {
                    "count": 0,
                    "subscription_delivery_count": 0,
                    "direct_sale_delivery_count": 0,
                    "summary": sub_summary,
                    "results": [],
                }
            )

        if include_sub and not include_ds_merge:
            return Response(
                {
                    "count": sub_count,
                    "subscription_delivery_count": sub_count,
                    "direct_sale_delivery_count": 0,
                    "summary": sub_summary,
                    "results": subscription_rows,
                }
            )

        if include_ds_merge and not include_sub:
            total_count = len(ds_payloads)
            return Response(
                {
                    "count": total_count,
                    "subscription_delivery_count": 0,
                    "direct_sale_delivery_count": len(ds_payloads),
                    "summary": sub_summary,
                    "results": ds_payloads[:200],
                }
            )

        merged: list[dict] = []
        i_sub = 0
        i_ds = 0
        while len(merged) < 200 and (i_sub < len(subscription_rows) or i_ds < len(ds_payloads)):
            ts_sub = subscription_rows[i_sub].get("created_at") if i_sub < len(subscription_rows) else None
            ts_ds = ds_payloads[i_ds].get("created_at") if i_ds < len(ds_payloads) else None
            pick_sub = False
            if ts_sub and ts_ds:
                pick_sub = ts_sub >= ts_ds
            elif ts_sub:
                pick_sub = True
            elif ts_ds:
                pick_sub = False
            else:
                pick_sub = i_sub < len(subscription_rows)

            if pick_sub and i_sub < len(subscription_rows):
                row = dict(subscription_rows[i_sub])
                row.setdefault("record_kind", "SUBSCRIPTION_DELIVERY")
                row.setdefault("source_type", "SUBSCRIPTION")
                merged.append(row)
                i_sub += 1
            elif i_ds < len(ds_payloads):
                merged.append(ds_payloads[i_ds])
                i_ds += 1
            elif i_sub < len(subscription_rows):
                row = dict(subscription_rows[i_sub])
                row.setdefault("record_kind", "SUBSCRIPTION_DELIVERY")
                row.setdefault("source_type", "SUBSCRIPTION")
                merged.append(row)
                i_sub += 1
            else:
                break

        total_count = sub_count + len(ds_payloads)

        return Response(
            {
                "count": total_count,
                "subscription_delivery_count": sub_count,
                "direct_sale_delivery_count": len(ds_payloads),
                "summary": sub_summary,
                "results": merged,
            }
        )

    def post(self, request):
        serializer = AdminSubscriptionDeliveryCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data
        direct_sale = validated.get("direct_sale")

        if direct_sale is not None:
            case = sync_direct_sale_delivery_case(sale=direct_sale, actor=request.user)
            if case is None:
                raise serializers.ValidationError(
                    {"detail": "Unable to open delivery tracking for this sale (delivery may be disabled)."}
                )
            return Response(
                serialize_direct_sale_delivery_case(case),
                status=status.HTTP_201_CREATED,
            )

        try:
            delivery = create_subscription_delivery(
                subscription=validated["subscription"],
                performed_by=request.user,
                status=validated.get("status", DeliveryStatus.PENDING),
                delivery_reference=validated.get("delivery_reference"),
                scheduled_date=validated.get("scheduled_date"),
                receiver_name=validated.get("receiver_name", ""),
                receiver_phone=validated.get("receiver_phone", ""),
                delivery_address_snapshot=validated.get(
                    "delivery_address_snapshot",
                    "",
                ),
                notes=validated.get("notes", ""),
            )
        except ValueError as exc:
            raise serializers.ValidationError({"detail": str(exc)}) from exc

        return Response(
            AdminSubscriptionDeliveryReadSerializer(delivery).data,
            status=status.HTTP_201_CREATED,
        )


class AdminDeliverySourceSubscriptionsView(APIView):
    """
    Source-driven delivery creation helper.

    Provides a searchable list of subscriptions and their current delivery summary so the
    admin UI can create deliveries without manual/raw subscription id entry.
    """

    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        query_serializer = AdminDeliverySourceSubscriptionsQuerySerializer(data=request.query_params)
        query_serializer.is_valid(raise_exception=True)

        q = (query_serializer.validated_data.get("q") or "").strip()
        plan_type = query_serializer.validated_data.get("plan_type")
        limit = query_serializer.validated_data.get("limit") or 20

        queryset = Subscription.objects.select_related(
            "customer",
            "product",
            "batch",
            "lucky_id",
        ).prefetch_related(get_subscription_delivery_prefetch()).order_by("-created_at", "-id")

        if plan_type:
            queryset = queryset.filter(plan_type=plan_type)

        if q:
            filters = (
                Q(customer__name__icontains=q)
                | Q(customer__phone__icontains=q)
                | Q(product__name__icontains=q)
                | Q(product__product_code__icontains=q)
                | Q(contract_reference__icontains=q)
                | Q(batch__batch_code__icontains=q)
            )
            if q.isdigit():
                filters = filters | Q(id=int(q)) | Q(lucky_id__lucky_number=int(q))
            queryset = queryset.filter(filters)

        serializer = AdminDeliverySourceSubscriptionSerializer(queryset[:limit], many=True)
        return Response(
            {
                "count": queryset.count(),
                "results": serializer.data,
            }
        )


class AdminDeliverySourceSubscriptionPrefillView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, subscription_id: int):
        subscription = get_object_or_404(
            Subscription.objects.select_related(
                "customer",
                "product",
                "batch",
                "lucky_id",
            ).prefetch_related(get_subscription_delivery_prefetch()),
            pk=subscription_id,
        )

        customer = subscription.customer
        address_parts = [
            (getattr(customer, "address", "") or "").strip(),
            (getattr(customer, "city", "") or "").strip(),
        ]
        address_snapshot = ", ".join([part for part in address_parts if part])

        return Response(
            {
                "source": AdminDeliverySourceSubscriptionSerializer(subscription).data,
                "defaults": {
                    "receiver_name": (getattr(customer, "name", "") or "").strip(),
                    "receiver_phone": (getattr(customer, "phone", "") or "").strip(),
                    "delivery_address_snapshot": address_snapshot,
                    "notes": "",
                },
            }
        )


class AdminDeliverySummaryView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        queryset = _apply_delivery_filters(get_delivery_queryset(), request)
        return Response(build_delivery_report_summary(queryset))


class AdminDeliveryDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get_object(self, pk):
        return get_object_or_404(get_delivery_queryset(), pk=pk)

    def get(self, request, pk):
        delivery = self.get_object(pk)
        return Response(AdminSubscriptionDeliveryReadSerializer(delivery).data)


class AdminDeliveryPdfView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, pk: int):
        delivery = get_delivery_queryset().filter(pk=pk).first()
        if delivery is None:
            return Response({"detail": "Delivery not found."}, status=status.HTTP_404_NOT_FOUND)
        pdf_bytes = render_delivery_handover_pdf(delivery=delivery)
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = (
            f'attachment; filename="delivery-{delivery.delivery_reference or delivery.id}.pdf"'
        )
        return response

    def patch(self, request, pk):
        delivery = self.get_object(pk)
        serializer = AdminSubscriptionDeliveryUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        delivery = update_subscription_delivery_metadata(
            delivery=delivery,
            performed_by=request.user,
            scheduled_date=serializer.validated_data.get("scheduled_date"),
            receiver_name=serializer.validated_data.get("receiver_name"),
            receiver_phone=serializer.validated_data.get("receiver_phone"),
            delivery_address_snapshot=serializer.validated_data.get("delivery_address_snapshot"),
            notes=serializer.validated_data.get("notes"),
            failure_reason=serializer.validated_data.get("failure_reason"),
        )
        return Response(AdminSubscriptionDeliveryReadSerializer(delivery).data)


class AdminDeliveryTransitionView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk):
        delivery = get_object_or_404(get_delivery_queryset(), pk=pk)
        serializer = AdminSubscriptionDeliveryTransitionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            delivery = transition_subscription_delivery_status(
                delivery=delivery,
                next_status=serializer.validated_data["status"],
                performed_by=request.user,
                scheduled_date=serializer.validated_data.get("scheduled_date"),
                receiver_name=serializer.validated_data.get("receiver_name"),
                receiver_phone=serializer.validated_data.get("receiver_phone"),
                notes=serializer.validated_data.get("notes"),
                failure_reason=serializer.validated_data.get("failure_reason"),
            )
        except ValueError as exc:
            raise serializers.ValidationError({"detail": str(exc)}) from exc

        return Response(AdminSubscriptionDeliveryReadSerializer(delivery).data)


class AdminDeliveryMarkDeliveredView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk):
        delivery = get_object_or_404(get_delivery_queryset(), pk=pk)
        serializer = AdminSubscriptionDeliveryMarkDeliveredSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            delivery = mark_subscription_delivery_delivered(
                delivery=delivery,
                performed_by=request.user,
                receiver_name=serializer.validated_data.get("receiver_name"),
                receiver_phone=serializer.validated_data.get("receiver_phone"),
                notes=serializer.validated_data.get("notes"),
            )
        except ValueError as exc:
            raise serializers.ValidationError({"detail": str(exc)}) from exc

        return Response(AdminSubscriptionDeliveryReadSerializer(delivery).data)


class AdminDeliveryMarkFailedView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk):
        delivery = get_object_or_404(get_delivery_queryset(), pk=pk)
        serializer = AdminSubscriptionDeliveryReasonSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            delivery = mark_subscription_delivery_failed(
                delivery=delivery,
                performed_by=request.user,
                failure_reason=serializer.validated_data["reason"],
                notes=serializer.validated_data.get("notes"),
            )
        except ValueError as exc:
            raise serializers.ValidationError({"detail": str(exc)}) from exc

        return Response(AdminSubscriptionDeliveryReadSerializer(delivery).data)


class AdminDeliveryCancelView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk):
        delivery = get_object_or_404(get_delivery_queryset(), pk=pk)
        serializer = AdminSubscriptionDeliveryReasonSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            delivery = cancel_subscription_delivery(
                delivery=delivery,
                performed_by=request.user,
                reason=serializer.validated_data["reason"],
                notes=serializer.validated_data.get("notes"),
            )
        except ValueError as exc:
            raise serializers.ValidationError({"detail": str(exc)}) from exc

        return Response(AdminSubscriptionDeliveryReadSerializer(delivery).data)


class AdminDeliveryRequestReturnView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk):
        delivery = get_object_or_404(get_delivery_queryset(), pk=pk)
        serializer = AdminSubscriptionDeliveryMarkDeliveredSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            delivery = request_subscription_delivery_return(
                delivery=delivery,
                performed_by=request.user,
                notes=serializer.validated_data.get("notes"),
            )
        except ValueError as exc:
            raise serializers.ValidationError({"detail": str(exc)}) from exc

        return Response(AdminSubscriptionDeliveryReadSerializer(delivery).data)


class AdminDeliveryMarkReturnedView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk):
        delivery = get_object_or_404(get_delivery_queryset(), pk=pk)
        serializer = AdminSubscriptionDeliveryMarkDeliveredSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            delivery = mark_subscription_delivery_returned(
                delivery=delivery,
                performed_by=request.user,
                notes=serializer.validated_data.get("notes"),
            )
        except ValueError as exc:
            raise serializers.ValidationError({"detail": str(exc)}) from exc

        return Response(AdminSubscriptionDeliveryReadSerializer(delivery).data)


class AdminDeliverySourceDirectSalesView(APIView):
    """Search direct-sale sources eligible for delivery desk tracking."""

    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        query_serializer = AdminDeliveryDirectSaleSourcesQuerySerializer(data=request.query_params)
        query_serializer.is_valid(raise_exception=True)

        q = (query_serializer.validated_data.get("q") or "").strip()
        limit = query_serializer.validated_data.get("limit") or 20

        queryset = (
            DirectSale.objects.select_related("customer")
            .prefetch_related("billing_invoices")
            .filter(delivery_required=True)
            .exclude(status=DirectSaleStatus.CANCELLED)
            .order_by("-created_at", "-id")
        )

        if q:
            filters = (
                Q(sale_no__icontains=q)
                | Q(customer_name_snapshot__icontains=q)
                | Q(customer_phone_snapshot__icontains=q)
                | Q(billing_invoices__document_no__icontains=q)
            )
            if q.isdigit():
                filters = filters | Q(id=int(q)) | Q(billing_invoices__id=int(q))
            queryset = queryset.filter(filters).distinct()

        total = queryset.count()
        serializer = AdminDeliveryDirectSaleSourceSerializer(queryset[:limit], many=True)
        return Response({"count": total, "results": serializer.data})


class AdminDeliverySourceDirectSalePrefillView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, direct_sale_id: int):
        sale = get_object_or_404(
            DirectSale.objects.select_related("customer").prefetch_related("billing_invoices"),
            pk=direct_sale_id,
        )
        snapshot_lines = "\n".join(
            [
                line
                for line in [
                    (sale.delivery_snapshot_address_line1 or "").strip(),
                    (sale.delivery_snapshot_address_line2 or "").strip(),
                    " ".join(
                        [
                            (sale.delivery_snapshot_city or "").strip(),
                            (sale.delivery_snapshot_state or "").strip(),
                            (sale.delivery_snapshot_pincode or "").strip(),
                        ]
                    ).strip(),
                ]
                if line
            ]
        )
        cust = sale.customer
        receiver_name = (sale.customer_name_snapshot or "").strip() or (
            getattr(cust, "name", "") if cust else ""
        ).strip()
        receiver_phone = (sale.customer_phone_snapshot or "").strip() or (
            getattr(cust, "phone", "") if cust else ""
        ).strip()
        payload = AdminDeliveryDirectSaleSourceSerializer(sale).data
        return Response(
            {
                "source": payload,
                "defaults": {
                    "receiver_name": receiver_name,
                    "receiver_phone": receiver_phone,
                    "delivery_address_snapshot": snapshot_lines,
                    "notes": "",
                },
            }
        )
