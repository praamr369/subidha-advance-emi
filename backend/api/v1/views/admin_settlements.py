from __future__ import annotations

from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import Http404
from rest_framework import generics, permissions, status
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.response import Response

from api.v1.permissions import IsAdmin
from api.v1.serializers.settlements import (
    BankStatementImportSerializer,
    BankStatementImportCreateSerializer,
    BankStatementLineSerializer,
    UpiSettlementImportSerializer,
    UpiSettlementImportCreateSerializer,
    UpiSettlementLineSerializer,
)
from settlements.models import (
    BankStatementImport,
    BankStatementLine,
    UpiSettlementImport,
    UpiSettlementLine,
)
from settlements.services.import_parser_service import (
    process_bank_statement_import,
    process_upi_settlement_import,
)


class BankStatementImportListCreateView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]
    queryset = BankStatementImport.objects.select_related("bank_finance_account", "uploaded_by").all().order_by("-uploaded_at", "-id")

    def get_serializer_class(self):
        if self.request.method == "POST":
            return BankStatementImportCreateSerializer
        return BankStatementImportSerializer

    def perform_create(self, serializer):
        # Save initially as a draft with uploaded_by set
        import_instance = serializer.save(uploaded_by=self.request.user)
        try:
            process_bank_statement_import(import_instance)
        except DjangoValidationError as e:
            # Convert Django ValidationError to DRF ValidationError
            detail = e.message_dict if hasattr(e, "message_dict") else str(e)
            raise DRFValidationError(detail)
        except Exception as e:
            raise DRFValidationError(str(e))

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        # Return the detailed serialized instance after successful parsing
        instance = serializer.instance
        response_serializer = BankStatementImportSerializer(instance)
        headers = self.get_success_headers(response_serializer.data)
        return Response(response_serializer.data, status=status.HTTP_201_CREATED, headers=headers)


class BankStatementImportDetailView(generics.RetrieveAPIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]
    serializer_class = BankStatementImportSerializer
    queryset = BankStatementImport.objects.select_related("bank_finance_account", "uploaded_by").all()


class BankStatementLineListView(generics.ListAPIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]
    serializer_class = BankStatementLineSerializer

    def get_queryset(self):
        import_id = self.kwargs.get("pk")
        if not BankStatementImport.objects.filter(pk=import_id).exists():
            raise Http404("Bank statement import not found.")
        return BankStatementLine.objects.filter(statement_import_id=import_id).order_by("transaction_date", "id")


class UpiSettlementImportListCreateView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]
    queryset = UpiSettlementImport.objects.select_related("upi_finance_account", "uploaded_by").all().order_by("-uploaded_at", "-id")

    def get_serializer_class(self):
        if self.request.method == "POST":
            return UpiSettlementImportCreateSerializer
        return UpiSettlementImportSerializer

    def perform_create(self, serializer):
        import_instance = serializer.save(uploaded_by=self.request.user)
        try:
            process_upi_settlement_import(import_instance)
        except DjangoValidationError as e:
            detail = e.message_dict if hasattr(e, "message_dict") else str(e)
            raise DRFValidationError(detail)
        except Exception as e:
            raise DRFValidationError(str(e))

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        instance = serializer.instance
        response_serializer = UpiSettlementImportSerializer(instance)
        headers = self.get_success_headers(response_serializer.data)
        return Response(response_serializer.data, status=status.HTTP_201_CREATED, headers=headers)


class UpiSettlementImportDetailView(generics.RetrieveAPIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]
    serializer_class = UpiSettlementImportSerializer
    queryset = UpiSettlementImport.objects.select_related("upi_finance_account", "uploaded_by").all()


class UpiSettlementLineListView(generics.ListAPIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]
    serializer_class = UpiSettlementLineSerializer

    def get_queryset(self):
        import_id = self.kwargs.get("pk")
        if not UpiSettlementImport.objects.filter(pk=import_id).exists():
            raise Http404("UPI settlement import not found.")
        return UpiSettlementLine.objects.filter(settlement_import_id=import_id).order_by("settlement_date", "id")
