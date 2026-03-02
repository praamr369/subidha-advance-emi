from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from subscriptions.models import CommissionLedger


from rest_framework.generics import ListAPIView
from subscriptions.models import Commission
from accounts.serializers import CommissionSerializer


class PartnerCommissionListView(ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = CommissionSerializer

    def get_queryset(self):
        return Commission.objects.filter(
            partner=self.request.user
        ).order_by("-created_at")

    def get(self, request):

        user = request.user

        if not user.groups.filter(name="partner").exists():
            return Response({"error": "Partner only"}, status=403)

        entries = (
            CommissionLedger.objects
            .filter(partner=user)
            .select_related("payment", "payment__customer")
            .order_by("-created_at")
        )

        data = []

        for e in entries:
            data.append({
                "id": e.id,
                "customer": e.payment.customer.name,
                "payment_id": e.payment.id,
                "payment_amount": str(e.payment.amount),
                "commission_amount": str(e.amount),
                "created_at": e.created_at,
            })

        return Response(data)