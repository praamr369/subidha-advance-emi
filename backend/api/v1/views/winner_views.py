from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAdminUser
from rest_framework import status
from django.core.exceptions import ValidationError

from subscriptions.services.winner_service import WinnerService


class ExecuteWinnerView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request):
        subscription_id = request.data.get("subscription_id")
        winner_month = request.data.get("winner_month")

        if not subscription_id or not winner_month:
            return Response(
                {"error": "subscription_id and winner_month are required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            result = WinnerService.execute_winner(
                subscription_id=int(subscription_id),
                winner_month=int(winner_month),
                performed_by=request.user,
            )
            return Response(result, status=status.HTTP_200_OK)

        except ValidationError as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
