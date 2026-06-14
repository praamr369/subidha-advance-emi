from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from accounting.services.books_readiness_service import build_accounting_books_readiness


class AccountingBooksReadinessView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        payload = build_accounting_books_readiness()
        return Response(payload)
