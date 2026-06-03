from django.urls import path
from rest_framework import permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from accounting.services.purchase_vendor_bridge_readiness_service import (
    build_accounting_bridge_readiness_with_purchase_vendor,
)
from api.v1.permissions import IsAdmin


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated, IsAdmin])
def accounting_bridge_readiness(request):
    return Response(build_accounting_bridge_readiness_with_purchase_vendor(), status=status.HTTP_200_OK)


urlpatterns = [
    path("accounting/bridge-readiness/", accounting_bridge_readiness),
]
