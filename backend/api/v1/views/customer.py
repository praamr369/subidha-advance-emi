from django.db.models import Sum
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsCustomer
from api.v1.serializers.subscription import SubscriptionSerializer
from subscriptions.models import Emi, Payment


class CustomerDashboard(APIView):
    permission_classes = [IsCustomer]

    def get(self, request):
        customer = getattr(request.user, "customer_profile", None)
        if customer is None:
            return Response({"error": "customer profile missing"}, status=status.HTTP_404_NOT_FOUND)

        subscriptions = customer.subscriptions.select_related("batch", "product", "lucky_id").all().order_by("-created_at")
        emis = Emi.objects.filter(subscription__customer=customer)
        payments = Payment.objects.filter(customer=customer)

        return Response({
            "customer": {
                "id": customer.id,
                "name": customer.name,
                "phone": customer.phone,
                "kyc_status": customer.kyc_status,
            },
            "summary": {
                "active_subscriptions": subscriptions.filter(status="ACTIVE").count(),
                "pending_emis": emis.filter(status="PENDING").count(),
                "paid_emis": emis.filter(status="PAID").count(),
                "total_paid_amount": payments.aggregate(total=Sum("amount"))["total"] or 0,
            },
            "subscriptions": SubscriptionSerializer(subscriptions, many=True).data,
        })
