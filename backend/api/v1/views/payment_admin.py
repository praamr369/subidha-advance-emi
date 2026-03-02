from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404

from subscriptions.models import Payment
from subscriptions.services.payment_service import verify_payment


class AdminVerifyPaymentView(APIView):

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):

        if not request.user.is_superuser:
            return Response(
                {"error": "Only admin allowed"},
                status=403
            )

        payment = get_object_or_404(Payment, pk=pk)

        try:
            verify_payment(payment, request.user)
        except Exception as e:
            return Response(
                {"error": str(e)},
                status=400
            )

        return Response({"status": "verified"})