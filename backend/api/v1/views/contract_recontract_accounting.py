from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from subscriptions.models import ContractAmendment, ContractRecontractEvent
from subscriptions.services.product_recontract_accounting_service import (
    execute_product_recontract_accounting,
)


def _validation_response(exc: DjangoValidationError) -> Response:
    if hasattr(exc, "message_dict"):
        return Response(exc.message_dict, status=status.HTTP_400_BAD_REQUEST)
    if hasattr(exc, "messages"):
        messages = exc.messages
        if len(messages) == 1:
            return Response({"detail": messages[0]}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"detail": messages}, status=status.HTTP_400_BAD_REQUEST)
    return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)


class AdminContractAmendmentProductRecontractAccountingPostingView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk: int):
        amendment = ContractAmendment.objects.filter(pk=pk).first()
        if not amendment:
            return Response({"detail": "Amendment not found."}, status=status.HTTP_404_NOT_FOUND)

        event = (
            ContractRecontractEvent.objects.filter(
                amendment=amendment,
                status=ContractRecontractEvent.Status.PREVIEWED,
            )
            .order_by("-created_at", "-id")
            .first()
        )
        if not event:
            return Response(
                {"detail": "No active product recontract event exists for this amendment."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            payload = execute_product_recontract_accounting(
                event=event,
                requested_by=request.user,
            )
        except DjangoValidationError as exc:
            return _validation_response(exc)

        return Response(payload, status=status.HTTP_201_CREATED)
