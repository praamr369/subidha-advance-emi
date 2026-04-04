from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.services.otp_readiness_service import get_otp_delivery_readiness
from api.v1.permissions import IsAdmin


class AdminOtpDeliveryReadinessView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        return Response(get_otp_delivery_readiness())
