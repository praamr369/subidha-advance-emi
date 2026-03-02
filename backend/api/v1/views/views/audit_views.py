from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response

from subscriptions.services.audit_service import system_financial_audit


@api_view(["GET"])
@permission_classes([IsAdminUser])
def financial_audit_report(request):
    report = system_financial_audit()
    return Response(report)