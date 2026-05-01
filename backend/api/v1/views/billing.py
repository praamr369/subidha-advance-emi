import hashlib
import json
from decimal import Decimal

from django.db import IntegrityError, transaction
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from billing.models import (
    BillingCreditNote,
    BillingDebitNote,
    BillingInstallmentMirror,
    BillingInvoice,
    BillingProfile,
    BillingSyncEvent,
    DirectSale,
    ReceiptDocument,
)
from accounting.services.books_service import build_cash_book, build_daily_billing_book
from billing.services.billing_service import (
    approve_billing_credit_note,
    approve_billing_debit_note,
    approve_billing_invoice,
    confirm_direct_sale,
    generate_emi_payment_receipt,
    mark_direct_sale_delivered,
    post_billing_credit_note,
    post_billing_debit_note,
    post_billing_invoice,
    void_receipt_document,
)
from billing.services.direct_sale_collection_service import collect_direct_sale_payment
from billing.services.billing_sync_service import (
    sync_payment_into_billing,
    sync_subscription_billing_profile,
)
from api.v1.permissions import IsAdmin
from api.v1.serializers.accounting_phase3 import AccountingBookQuerySerializer
from api.v1.serializers.billing import (
    BillingInstallmentMirrorSerializer,
    BillingCreditNoteSerializer,
    BillingDebitNoteSerializer,
    BillingInvoiceSerializer,
    BillingProfileSerializer,
    BillingProfileSyncSerializer,
    BillingSyncEventSerializer,
    DirectSaleCollectionSerializer,
    DirectSaleConfirmSerializer,
    DirectSaleDeliveredSerializer,
    DirectSaleSerializer,
    EmiPaymentReceiptGenerateSerializer,
    EmptyBillingActionSerializer,
    ReceiptDocumentSerializer,
    ReceiptVoidSerializer,
)


class AdminBillingModelViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]
    http_method_names = ["get", "post", "patch", "head", "options"]


class AdminBillingReadOnlyViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]


class DirectSaleViewSet(AdminBillingModelViewSet):
    queryset = DirectSale.objects.select_related(
        "customer",
        "doc_series",
        "finance_account",
        "confirmed_by",
    ).prefetch_related("lines", "billing_invoices")
    serializer_class = DirectSaleSerializer
    search_fields = ["sale_no", "customer_name_snapshot", "customer_phone_snapshot", "delivery_reference"]
    ordering_fields = ["sale_date", "created_at", "sale_no"]
    ordering = ["-sale_date", "-created_at", "-id"]

    def _idempotency_key(self, request):
        key = (
            request.headers.get("Idempotency-Key")
            or request.headers.get("X-Idempotency-Key")
            or ""
        ).strip()
        return key

    def _request_payload_hash(self, request):
        payload = json.dumps(request.data, sort_keys=True, default=str, separators=(",", ":"))
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()

    def _idempotent_response(self, sale):
        payload = DirectSaleSerializer(sale, context=self.get_serializer_context())
        return Response(payload.data, status=status.HTTP_200_OK)

    def create(self, request, *args, **kwargs):
        idempotency_key = self._idempotency_key(request)
        payload_hash = self._request_payload_hash(request) if idempotency_key else ""
        if idempotency_key:
            sale = DirectSale.objects.filter(idempotency_key=idempotency_key).first()
            if sale:
                if sale.idempotency_payload_hash != payload_hash:
                    return Response(
                        {"detail": "Idempotency-Key was already used with a different direct-sale payload."},
                        status=status.HTTP_409_CONFLICT,
                    )
                return self._idempotent_response(sale)

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            with transaction.atomic():
                save_kwargs = (
                    {
                        "idempotency_key": idempotency_key,
                        "idempotency_payload_hash": payload_hash,
                    }
                    if idempotency_key
                    else {}
                )
                sale = serializer.save(**save_kwargs)
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        except IntegrityError:
            if idempotency_key:
                sale = DirectSale.objects.filter(idempotency_key=idempotency_key).first()
                if sale and sale.idempotency_payload_hash == payload_hash:
                    return self._idempotent_response(sale)
            raise

        headers = self.get_success_headers(serializer.data)
        return Response(
            DirectSaleSerializer(sale, context=self.get_serializer_context()).data,
            status=status.HTTP_201_CREATED,
            headers=headers,
        )

    def get_queryset(self):
        queryset = super().get_queryset()
        customer_id = self.request.query_params.get("customer")
        branch_id = self.request.query_params.get("branch")
        cash_counter_id = self.request.query_params.get("cash_counter")
        status_value = self.request.query_params.get("status")
        delivery_required = self.request.query_params.get("delivery_required")
        if customer_id:
            queryset = queryset.filter(customer_id=customer_id)
        if branch_id:
            queryset = queryset.filter(branch_id=branch_id)
        if cash_counter_id:
            queryset = queryset.filter(cash_counter_id=cash_counter_id)
        if status_value:
            queryset = queryset.filter(status=status_value)
        if delivery_required in {"true", "false"}:
            queryset = queryset.filter(delivery_required=delivery_required == "true")
        if self.request.query_params.get("outstanding_only") in {"1", "true", "TRUE", "yes", "YES"}:
            queryset = queryset.filter(status="INVOICED", balance_total__gt=Decimal("0.00"))
        return queryset

    def get_serializer_class(self):
        if self.action == "confirm_sale":
            return DirectSaleConfirmSerializer
        if self.action == "mark_delivered":
            return DirectSaleDeliveredSerializer
        if self.action == "collect_payment":
            return DirectSaleCollectionSerializer
        return super().get_serializer_class()

    @action(detail=True, methods=["post"], url_path="confirm")
    def confirm_sale(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            sale, updated = confirm_direct_sale(
                direct_sale_id=int(pk),
                confirmed_by=request.user,
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        payload = DirectSaleSerializer(sale, context=self.get_serializer_context())
        return Response({"updated": updated, "direct_sale": payload.data})

    @action(detail=True, methods=["post"], url_path="mark-delivered")
    def mark_delivered(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            sale, updated = mark_direct_sale_delivered(
                direct_sale_id=int(pk),
                delivered_by=request.user,
                delivery_reference=serializer.validated_data.get("delivery_reference", ""),
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        payload = DirectSaleSerializer(sale, context=self.get_serializer_context())
        return Response({"updated": updated, "direct_sale": payload.data})

    @action(detail=True, methods=["post"], url_path="collect")
    def collect_payment(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            result = collect_direct_sale_payment(
                direct_sale_id=int(pk),
                amount=serializer.validated_data["amount"],
                collected_by=request.user,
                receipt_date=serializer.validated_data.get("receipt_date"),
                finance_account_id=serializer.validated_data.get("finance_account_id"),
                branch_id=serializer.validated_data.get("branch_id"),
                cash_counter_id=serializer.validated_data.get("cash_counter_id"),
                reference_no=serializer.validated_data.get("reference_no"),
                notes=serializer.validated_data.get("notes"),
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc

        return Response(
            {
                "created": result["created"],
                "direct_sale": DirectSaleSerializer(
                    result["direct_sale"],
                    context=self.get_serializer_context(),
                ).data,
                "invoice": BillingInvoiceSerializer(
                    result["invoice"],
                    context=self.get_serializer_context(),
                ).data,
                "receipt": ReceiptDocumentSerializer(
                    result["receipt"],
                    context=self.get_serializer_context(),
                ).data,
                "outstanding_before": str(result["outstanding_before"]),
                "outstanding_after": str(result["outstanding_after"]),
            },
            status=status.HTTP_201_CREATED if result["created"] else status.HTTP_200_OK,
        )


class BillingInvoiceViewSet(AdminBillingModelViewSet):
    queryset = BillingInvoice.objects.select_related(
        "customer",
        "subscription",
        "direct_sale",
        "doc_series",
        "finance_account",
        "posted_journal_entry",
    ).prefetch_related("lines").all()
    serializer_class = BillingInvoiceSerializer
    search_fields = ["document_no", "customer_name_snapshot", "customer_phone_snapshot"]
    ordering_fields = ["invoice_date", "created_at", "document_no"]
    ordering = ["-invoice_date", "-created_at", "-id"]

    def get_queryset(self):
        queryset = super().get_queryset()
        subscription_id = self.request.query_params.get("subscription")
        customer_id = self.request.query_params.get("customer")
        direct_sale_id = self.request.query_params.get("direct_sale")
        branch_id = self.request.query_params.get("branch")
        billing_channel = self.request.query_params.get("billing_channel")
        status_value = self.request.query_params.get("status")
        source_type = self.request.query_params.get("source_type")
        document_type = self.request.query_params.get("document_type")

        if subscription_id:
            queryset = queryset.filter(subscription_id=subscription_id)
        if customer_id:
            queryset = queryset.filter(customer_id=customer_id)
        if direct_sale_id:
            queryset = queryset.filter(direct_sale_id=direct_sale_id)
        if branch_id:
            queryset = queryset.filter(branch_id=branch_id)
        if billing_channel:
            queryset = queryset.filter(billing_channel=billing_channel)
        if status_value:
            queryset = queryset.filter(status=status_value)
        if source_type:
            queryset = queryset.filter(source_type=source_type)
        if document_type:
            queryset = queryset.filter(document_type=document_type)
        return queryset

    def get_serializer_class(self):
        if self.action in {"approve", "post_invoice"}:
            return EmptyBillingActionSerializer
        return super().get_serializer_class()

    @action(detail=True, methods=["post"], url_path="approve")
    def approve(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            invoice, updated = approve_billing_invoice(invoice_id=int(pk), approved_by=request.user)
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        payload = BillingInvoiceSerializer(invoice, context=self.get_serializer_context())
        return Response({"updated": updated, "invoice": payload.data})

    @action(detail=True, methods=["post"], url_path="post")
    def post_invoice(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            invoice, updated = post_billing_invoice(invoice_id=int(pk), posted_by=request.user)
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        payload = BillingInvoiceSerializer(invoice, context=self.get_serializer_context())
        return Response({"updated": updated, "invoice": payload.data})


class BillingCreditNoteViewSet(AdminBillingModelViewSet):
    queryset = BillingCreditNote.objects.select_related("doc_series", "original_invoice", "posted_journal_entry").prefetch_related("lines").all()
    serializer_class = BillingCreditNoteSerializer
    search_fields = ["note_no", "reason", "original_invoice__document_no"]
    ordering_fields = ["note_date", "created_at", "note_no"]
    ordering = ["-note_date", "-created_at", "-id"]

    def get_queryset(self):
        queryset = super().get_queryset()
        original_invoice_id = self.request.query_params.get("original_invoice")
        direct_sale_id = self.request.query_params.get("direct_sale")
        if original_invoice_id:
            queryset = queryset.filter(original_invoice_id=original_invoice_id)
        if direct_sale_id:
            queryset = queryset.filter(original_invoice__direct_sale_id=direct_sale_id)
        return queryset

    def get_serializer_class(self):
        if self.action in {"approve", "post_note"}:
            return EmptyBillingActionSerializer
        return super().get_serializer_class()

    @action(detail=True, methods=["post"], url_path="approve")
    def approve(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            note, updated = approve_billing_credit_note(
                credit_note_id=int(pk),
                approved_by=request.user,
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        payload = BillingCreditNoteSerializer(note, context=self.get_serializer_context())
        return Response({"updated": updated, "credit_note": payload.data})

    @action(detail=True, methods=["post"], url_path="post")
    def post_note(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            note, updated = post_billing_credit_note(
                credit_note_id=int(pk),
                posted_by=request.user,
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        payload = BillingCreditNoteSerializer(note, context=self.get_serializer_context())
        return Response({"updated": updated, "credit_note": payload.data})


class BillingDebitNoteViewSet(AdminBillingModelViewSet):
    queryset = BillingDebitNote.objects.select_related("doc_series", "original_invoice", "posted_journal_entry").prefetch_related("lines").all()
    serializer_class = BillingDebitNoteSerializer
    search_fields = ["note_no", "reason", "original_invoice__document_no"]
    ordering_fields = ["note_date", "created_at", "note_no"]
    ordering = ["-note_date", "-created_at", "-id"]

    def get_queryset(self):
        queryset = super().get_queryset()
        original_invoice_id = self.request.query_params.get("original_invoice")
        direct_sale_id = self.request.query_params.get("direct_sale")
        if original_invoice_id:
            queryset = queryset.filter(original_invoice_id=original_invoice_id)
        if direct_sale_id:
            queryset = queryset.filter(original_invoice__direct_sale_id=direct_sale_id)
        return queryset

    def get_serializer_class(self):
        if self.action in {"approve", "post_note"}:
            return EmptyBillingActionSerializer
        return super().get_serializer_class()

    @action(detail=True, methods=["post"], url_path="approve")
    def approve(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            note, updated = approve_billing_debit_note(
                debit_note_id=int(pk),
                approved_by=request.user,
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        payload = BillingDebitNoteSerializer(note, context=self.get_serializer_context())
        return Response({"updated": updated, "debit_note": payload.data})

    @action(detail=True, methods=["post"], url_path="post")
    def post_note(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            note, updated = post_billing_debit_note(
                debit_note_id=int(pk),
                posted_by=request.user,
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        payload = BillingDebitNoteSerializer(note, context=self.get_serializer_context())
        return Response({"updated": updated, "debit_note": payload.data})


class ReceiptDocumentViewSet(AdminBillingModelViewSet):
    queryset = ReceiptDocument.objects.select_related(
        "finance_account",
        "billing_invoice",
        "direct_sale",
        "customer",
        "subscription",
        "payment",
        "posted_journal_entry",
    ).all()
    serializer_class = ReceiptDocumentSerializer
    search_fields = ["receipt_no", "customer_name_snapshot", "customer_phone_snapshot"]
    ordering_fields = ["receipt_date", "created_at", "receipt_no"]
    ordering = ["-receipt_date", "-created_at", "-id"]

    def get_queryset(self):
        queryset = super().get_queryset()
        payment_id = self.request.query_params.get("payment")
        billing_invoice_id = self.request.query_params.get("billing_invoice")
        direct_sale_id = self.request.query_params.get("direct_sale")
        subscription_id = self.request.query_params.get("subscription")
        branch_id = self.request.query_params.get("branch")
        cash_counter_id = self.request.query_params.get("cash_counter")
        receipt_type = self.request.query_params.get("receipt_type")
        source_type = self.request.query_params.get("source_type")

        if payment_id:
            queryset = queryset.filter(payment_id=payment_id)
        if billing_invoice_id:
            queryset = queryset.filter(billing_invoice_id=billing_invoice_id)
        if direct_sale_id:
            queryset = queryset.filter(direct_sale_id=direct_sale_id)
        if subscription_id:
            queryset = queryset.filter(subscription_id=subscription_id)
        if branch_id:
            queryset = queryset.filter(branch_id=branch_id)
        if cash_counter_id:
            queryset = queryset.filter(cash_counter_id=cash_counter_id)
        if receipt_type:
            queryset = queryset.filter(receipt_type=receipt_type)
        if source_type:
            queryset = queryset.filter(source_type=source_type)
        return queryset

    def get_serializer_class(self):
        if self.action == "void_document":
            return ReceiptVoidSerializer
        return super().get_serializer_class()

    @action(detail=True, methods=["post"], url_path="void")
    def void_document(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            receipt, updated = void_receipt_document(
                receipt_id=int(pk),
                performed_by=request.user,
                reason=serializer.validated_data["reason"],
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        payload = ReceiptDocumentSerializer(receipt, context=self.get_serializer_context())
        return Response({"updated": updated, "receipt": payload.data})


class BillingProfileViewSet(AdminBillingReadOnlyViewSet):
    queryset = (
        BillingProfile.objects.select_related("subscription", "customer", "product")
        .prefetch_related("installments", "sync_events")
        .all()
    )
    serializer_class = BillingProfileSerializer
    search_fields = [
        "subscription__contract_reference",
        "customer__name",
        "product__name",
        "product__product_code",
    ]
    ordering_fields = ["contract_start_date", "last_synced_at", "created_at"]
    ordering = ["-contract_start_date", "-last_synced_at", "-id"]

    def get_queryset(self):
        queryset = super().get_queryset()
        subscription_id = self.request.query_params.get("subscription")
        customer_id = self.request.query_params.get("customer")
        product_id = self.request.query_params.get("product")
        branch_id = self.request.query_params.get("branch")
        activation_state = self.request.query_params.get("activation_state")
        invoice_eligible = self.request.query_params.get("invoice_eligible")

        if subscription_id:
            queryset = queryset.filter(subscription_id=subscription_id)
        if customer_id:
            queryset = queryset.filter(customer_id=customer_id)
        if product_id:
            queryset = queryset.filter(product_id=product_id)
        if branch_id:
            queryset = queryset.filter(subscription__branch_id=branch_id)
        if activation_state:
            queryset = queryset.filter(activation_state=activation_state)
        if invoice_eligible in {"true", "false"}:
            queryset = queryset.filter(invoice_eligible=invoice_eligible == "true")
        return queryset

    def get_serializer_class(self):
        if self.action == "sync_profile":
            return BillingProfileSyncSerializer
        return super().get_serializer_class()

    @action(detail=True, methods=["post"], url_path="sync")
    def sync_profile(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        profile = self.get_object()
        synced_profile, event, created = sync_subscription_billing_profile(
            subscription_id=profile.subscription_id,
            source_model="BillingProfile",
            source_id=str(profile.id),
            event_type="PROFILE_REFRESH",
            performed_by=request.user,
        )
        payload = BillingProfileSerializer(synced_profile, context=self.get_serializer_context())
        return Response(
            {
                "updated": True,
                "event_created": created,
                "billing_profile": payload.data,
                "billing_sync_event_id": event.id,
            }
        )


class BillingInstallmentMirrorViewSet(AdminBillingReadOnlyViewSet):
    queryset = BillingInstallmentMirror.objects.select_related(
        "billing_profile",
        "billing_profile__subscription",
        "billing_profile__customer",
        "billing_profile__product",
        "emi",
    ).all()
    serializer_class = BillingInstallmentMirrorSerializer
    search_fields = [
        "billing_profile__customer__name",
        "billing_profile__product__name",
        "billing_profile__product__product_code",
    ]
    ordering_fields = ["due_date", "month_no", "created_at"]
    ordering = ["due_date", "month_no", "id"]

    def get_queryset(self):
        queryset = super().get_queryset()
        profile_id = self.request.query_params.get("billing_profile")
        subscription_id = self.request.query_params.get("subscription")
        status_snapshot = self.request.query_params.get("status_snapshot")
        if profile_id:
            queryset = queryset.filter(billing_profile_id=profile_id)
        if subscription_id:
            queryset = queryset.filter(billing_profile__subscription_id=subscription_id)
        if status_snapshot:
            queryset = queryset.filter(status_snapshot=status_snapshot)
        return queryset


class BillingSyncEventViewSet(AdminBillingReadOnlyViewSet):
    queryset = BillingSyncEvent.objects.select_related(
        "billing_profile",
        "billing_profile__subscription",
        "performed_by",
    ).all()
    serializer_class = BillingSyncEventSerializer
    search_fields = ["source_model", "source_id", "event_type", "idempotency_key"]
    ordering_fields = ["synced_at", "created_at", "event_type"]
    ordering = ["-synced_at", "-id"]

    def get_queryset(self):
        queryset = super().get_queryset()
        billing_profile_id = self.request.query_params.get("billing_profile")
        subscription_id = self.request.query_params.get("subscription")
        event_type = self.request.query_params.get("event_type")
        if billing_profile_id:
            queryset = queryset.filter(billing_profile_id=billing_profile_id)
        if subscription_id:
            queryset = queryset.filter(billing_profile__subscription_id=subscription_id)
        if event_type:
            queryset = queryset.filter(event_type=event_type)
        return queryset


class EmiPaymentReceiptGenerateView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, payment_id: int):
        serializer = EmiPaymentReceiptGenerateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            receipt, created = generate_emi_payment_receipt(
                payment_id=payment_id,
                finance_account_id=serializer.validated_data["finance_account_id"],
                performed_by=request.user,
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        payload = ReceiptDocumentSerializer(receipt)
        return Response({"created": created, "receipt": payload.data}, status=status.HTTP_200_OK)


class BillingPaymentSyncView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, payment_id: int):
        try:
            profile, event, created = sync_payment_into_billing(
                payment_id=payment_id,
                performed_by=request.user,
                event_type="PAYMENT_SYNC",
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        payload = BillingProfileSerializer(profile)
        return Response(
            {
                "created": created,
                "billing_profile": payload.data,
                "billing_sync_event_id": event.id,
            },
            status=status.HTTP_200_OK,
        )


class BillingDailyBookView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        serializer = AccountingBookQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        return Response(build_daily_billing_book(**serializer.validated_data))


class BillingCashBookView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        serializer = AccountingBookQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        payload = build_cash_book(
            finance_account_id=request.query_params.get("finance_account_id"),
            **serializer.validated_data,
        )
        return Response(payload)
