from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsCustomer
from api.v1.serializers.subscription import SubscriptionSerializer
from subscriptions.models import Customer


class CustomerDashboard(APIView):
    permission_classes = [IsCustomer]

    def get(self, request):
        phone = request.query_params.get("phone")
        if not phone:
            return Response({"error": "phone required"}, status=status.HTTP_400_BAD_REQUEST)

        if request.user.phone != phone:
            return Response({"error": "forbidden"}, status=status.HTTP_403_FORBIDDEN)

        try:
            customer = Customer.objects.get(phone=phone)
        except Customer.DoesNotExist:
            return Response({"error": "not found"}, status=status.HTTP_404_NOT_FOUND)

        subs = customer.subscription_set.all()
        return Response({"customer": customer.name, "subscriptions": SubscriptionSerializer(subs, many=True).data})
