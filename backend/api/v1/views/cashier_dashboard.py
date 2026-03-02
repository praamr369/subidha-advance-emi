from django.db.models import Sum
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from subscriptions.models import Emi, EmiStatus,Payment
from api.v1.serializers import PaymentSerializer

class CashierDashboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        today_pending = Emi.objects.filter(
            status=EmiStatus.PENDING
        )

        total_pending = today_pending.count()

        total_amount_pending = (
            today_pending.aggregate(total=Sum("amount"))["total"] or 0
        )

        return Response({
            "total_pending_emis": total_pending,
            "total_pending_amount": total_amount_pending,
        })
    
class CashierSearchEmiView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        query = request.query_params.get("q")

        emis = Emi.objects.filter(
            subscription__customer__phone__icontains=query,
            status=EmiStatus.PENDING
        ).select_related("subscription__customer")

        data = []
        for emi in emis:
            data.append({
                "emi_id": emi.id,
                "customer": emi.subscription.customer.name,
                "amount": emi.balance_amount(),
                "due_date": emi.due_date,
            })
            

        return Response(data)