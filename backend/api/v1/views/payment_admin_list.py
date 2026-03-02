from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from subscriptions.models import Payment, PaymentStatus


class AdminPendingPaymentsView(APIView):

    permission_classes = [IsAuthenticated]

    def get(self, request):

        if not request.user.is_superuser:
            return Response({"error": "Admin only"}, status=403)

        payments = (
            Payment.objects
            .filter(status=PaymentStatus.PENDING)
            .select_related("customer", "emi", "collected_by")
            .order_by("-created_at")
        )

        data = []

        for p in payments:
            data.append({
                "id": p.id,
                "customer": p.customer.name,
                "phone": p.customer.phone,
                "emi_id": p.emi.id if p.emi else None,
                "amount": str(p.amount),
                "method": p.method,
                "reference_no": p.reference_no,
                "collected_by": (
                    p.collected_by.username if p.collected_by else None
                ),
                "payment_date": p.payment_date,
                "created_at": p.created_at,
            })

        return Response(data)