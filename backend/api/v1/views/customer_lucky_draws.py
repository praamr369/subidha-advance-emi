"""
Customer-facing Lucky Draws API Views.

Lets a customer see the lucky draws for the batches they participate in
(via their subscriptions), and download a certificate PDF for a draw they won.
"""
from rest_framework import generics, serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsCustomer
from subscriptions.models import AuditLog, LuckyDraw, Subscription


def _customer_or_none(request):
    return getattr(request.user, "customer", None)


def _customer_batch_ids(customer):
    """Batch ids the customer participates in through their subscriptions."""
    return (
        Subscription.objects.filter(customer=customer)
        .exclude(batch__isnull=True)
        .values_list("batch_id", flat=True)
        .distinct()
    )


class CustomerLuckyDrawSerializer(serializers.ModelSerializer):
    batch_code = serializers.CharField(source="batch.batch_code", read_only=True)
    lucky_number = serializers.IntegerField(
        source="winner_lucky_id.lucky_number", read_only=True, default=None
    )
    status = serializers.SerializerMethodField()
    won_by_me = serializers.SerializerMethodField()

    class Meta:
        model = LuckyDraw
        fields = (
            "id",
            "batch",
            "batch_code",
            "draw_month",
            "draw_date",
            "is_revealed",
            "revealed_at",
            "lucky_number",
            "winner_status",
            "settlement_status",
            "waived_emi_count",
            "waived_amount",
            "waiver_scope",
            "status",
            "won_by_me",
        )

    def get_status(self, obj: LuckyDraw) -> str:
        return "COMPLETED" if obj.is_revealed else "PENDING"

    def get_won_by_me(self, obj: LuckyDraw) -> bool:
        customer = self.context.get("customer")
        if customer is None or obj.winner_subscription_id is None:
            return False
        return obj.winner_subscription.customer_id == customer.id


class CustomerLuckyDrawListView(generics.ListAPIView):
    """GET /api/v1/customer/lucky-draws/ — draws for the customer's batches."""

    serializer_class = CustomerLuckyDrawSerializer
    permission_classes = [IsCustomer]

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx["customer"] = _customer_or_none(self.request)
        return ctx

    def get_queryset(self):
        customer = _customer_or_none(self.request)
        if customer is None:
            return LuckyDraw.objects.none()

        queryset = (
            LuckyDraw.objects.filter(batch_id__in=_customer_batch_ids(customer))
            .select_related("batch", "winner_lucky_id", "winner_subscription")
            .order_by("-draw_date", "-id")
        )

        status_param = (self.request.query_params.get("status") or "").strip().upper()
        if status_param == "COMPLETED":
            queryset = queryset.filter(is_revealed=True)
        elif status_param == "PENDING":
            queryset = queryset.filter(is_revealed=False)

        batch_param = (self.request.query_params.get("batch_id") or "").strip()
        if batch_param.isdigit():
            queryset = queryset.filter(batch_id=int(batch_param))

        return queryset

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        serializer = self.get_serializer(queryset, many=True)
        return Response({"count": len(serializer.data), "results": serializer.data})


class CustomerLuckyDrawDetailView(generics.RetrieveAPIView):
    """GET /api/v1/customer/lucky-draws/<id>/ — single draw for the customer."""

    serializer_class = CustomerLuckyDrawSerializer
    permission_classes = [IsCustomer]

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx["customer"] = _customer_or_none(self.request)
        return ctx

    def get_queryset(self):
        customer = _customer_or_none(self.request)
        if customer is None:
            return LuckyDraw.objects.none()
        return (
            LuckyDraw.objects.filter(batch_id__in=_customer_batch_ids(customer))
            .select_related("batch", "winner_lucky_id", "winner_subscription")
        )


class CustomerLuckyDrawCertificateView(APIView):
    """
    GET /api/v1/customer/lucky-draws/<id>/certificate/

    Streams a PDF certificate for a draw the customer actually won.
    """

    permission_classes = [IsCustomer]

    def get(self, request, pk: int):
        customer = _customer_or_none(request)
        if customer is None:
            return Response(
                {"detail": "Customer profile required."},
                status=status.HTTP_403_FORBIDDEN,
            )

        draw = (
            LuckyDraw.objects.filter(
                pk=pk,
                is_revealed=True,
                winner_subscription__customer=customer,
            )
            .select_related("batch", "winner_subscription", "winner_lucky_id")
            .first()
        )
        if draw is None:
            return Response(
                {"detail": "Certificate not available for this draw."},
                status=status.HTTP_404_NOT_FOUND,
            )

        pdf_bytes = _render_lucky_draw_certificate(draw=draw, customer=customer)

        AuditLog.objects.create(
            action_type=AuditLog.ActionType.DRAW_CERTIFICATE_PUBLISHED,
            model_name="LuckyDraw",
            object_id=draw.id,
            performed_by=request.user,
            metadata={
                "event": "CUSTOMER_CERTIFICATE_DOWNLOADED",
                "customer_id": customer.id,
                "draw_month": draw.draw_month,
                "batch_id": draw.batch_id,
            },
        )

        from django.http import HttpResponse

        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = (
            f'attachment; filename="lucky-draw-certificate-{draw.id}.pdf"'
        )
        return response


def _render_lucky_draw_certificate(*, draw, customer) -> bytes:
    """Render a minimal winner certificate PDF using reportlab."""
    import io

    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas

    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4

    pdf.setFont("Helvetica-Bold", 24)
    pdf.drawCentredString(width / 2, height - 50 * mm, "Lucky Draw Winner Certificate")

    pdf.setFont("Helvetica", 12)
    customer_name = getattr(customer, "name", None) or getattr(customer, "full_name", "") or "Customer"
    lucky_number = (
        draw.winner_lucky_id.lucky_number if draw.winner_lucky_id_id else "—"
    )
    lines = [
        f"Awarded to: {customer_name}",
        f"Batch: {draw.batch.batch_code if draw.batch_id else '—'}",
        f"Draw month: {draw.draw_month}",
        f"Lucky number: {lucky_number}",
        f"EMIs waived: {draw.waived_emi_count}",
        f"Amount waived: {draw.waived_amount}",
        f"Draw date: {draw.draw_date.strftime('%d %b %Y') if draw.draw_date else '—'}",
        f"Verification hash: {draw.committed_hash[:32]}...",
    ]
    y = height - 80 * mm
    for line in lines:
        pdf.drawCentredString(width / 2, y, line)
        y -= 10 * mm

    pdf.setFont("Helvetica-Oblique", 10)
    pdf.drawCentredString(
        width / 2, 30 * mm, "This certificate confirms a provably-fair lucky draw win."
    )

    pdf.showPage()
    pdf.save()
    buffer.seek(0)
    return buffer.read()
