"""
Cashier Day Close API Views

Provides endpoints for cashiers to:
- Create draft day-close records
- List their own day-close records
- View details of their own records
- Submit draft records for admin review

Guarantees:
- Cashier can only access/modify own records
- Cashier cannot approve/reject records
- No source record mutation
- No accounting entry creation
"""

from __future__ import annotations

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Q
from rest_framework import generics, permissions, status
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.response import Response

from api.v1.permissions import IsCashier
from api.v1.serializers.settlements import (
    CashierDayCloseSerializer,
    CashierDayCloseCreateSerializer,
    CashierDayCloseSubmitSerializer,
)
from settlements.models import CashierDayClose
from settlements.services.cashier_day_close_service import (
    CashierDayCloseCreatePayload,
    CashierDayCloseSubmitPayload,
    compute_system_cash_total,
    create_cashier_day_close_draft,
    submit_cashier_day_close,
)


class CashierDayClosePreviewView(generics.GenericAPIView):
    """
    Preview computed day-close context for cashier (evidence capture only).

    Returns:
    - business_date
    - system_cash_total (snapshot computation for UI preview)
    """

    permission_classes = [permissions.IsAuthenticated, IsCashier]

    def get(self, request, *args, **kwargs):
        from django.utils import timezone

        business_date = (request.query_params.get("business_date") or "").strip()
        if not business_date:
            business_date = str(timezone.now().date())

        def _parse_optional_int(value: str | None):
            if value in (None, ""):
                return None
            try:
                return int(value)
            except (TypeError, ValueError):
                raise DRFValidationError({"detail": "Invalid query parameter; expected integer."})

        branch_id = _parse_optional_int(request.query_params.get("branch_id"))
        cash_counter_id = _parse_optional_int(request.query_params.get("cash_counter_id"))
        finance_account_id = _parse_optional_int(request.query_params.get("finance_account_id"))

        system_cash_total = compute_system_cash_total(
            cashier_id=request.user.id,
            business_date=business_date,
            branch_id=branch_id,
            cash_counter_id=cash_counter_id,
            finance_account_id=finance_account_id,
        )

        return Response(
            {
                "business_date": business_date,
                "system_cash_total": f"{system_cash_total:.2f}",
            },
            status=status.HTTP_200_OK,
        )


class CashierDayCloseCurrentView(generics.GenericAPIView):
    """Get or create current business-date day-close for cashier."""
    permission_classes = [permissions.IsAuthenticated, IsCashier]
    serializer_class = CashierDayCloseSerializer
    
    def get(self, request, *args, **kwargs):
        from django.utils import timezone
        
        # Get today's day-close (if exists)
        today = timezone.now().date()
        cash_counter_id = request.query_params.get("cash_counter_id")
        try:
            cash_counter_id = int(cash_counter_id) if cash_counter_id not in (None, "") else None
        except (TypeError, ValueError):
            raise DRFValidationError({"detail": "Invalid query parameter; expected integer."})

        qs = (
            CashierDayClose.objects.filter(cashier_id=request.user.id, business_date=today)
            .exclude(status="VOIDED")
            .order_by("-created_at", "-id")
        )
        if cash_counter_id is not None:
            qs = qs.filter(cash_counter_id=cash_counter_id)

        day_close = qs.first()
        
        if not day_close:
            return Response({"detail": "No day-close exists for today."}, status=status.HTTP_404_NOT_FOUND)
        
        serializer = self.get_serializer(day_close)
        return Response(serializer.data, status=status.HTTP_200_OK)


class CashierDayCloseListCreateView(generics.ListCreateAPIView):
    """List own day-closes or create a new draft."""
    permission_classes = [permissions.IsAuthenticated, IsCashier]
    serializer_class = CashierDayCloseSerializer
    
    def get_queryset(self):
        return (
            CashierDayClose.objects
            .filter(cashier_id=self.request.user.id)
            .select_related("branch", "cash_counter", "finance_account", "closed_by", "approved_by")
            .order_by("-business_date", "-created_at", "-id")
        )
    
    def get_serializer_class(self):
        if self.request.method == "POST":
            return CashierDayCloseCreateSerializer
        return CashierDayCloseSerializer
    
    def perform_create(self, serializer):
        # Cashier creates a draft for themselves
        data = serializer.validated_data
        system_cash_total = compute_system_cash_total(
            cashier_id=self.request.user.id,
            business_date=str(data["business_date"]),
            branch_id=data.get("branch"),
            cash_counter_id=data.get("cash_counter"),
            finance_account_id=data.get("finance_account"),
        )
        payload = CashierDayCloseCreatePayload(
            cashier_id=self.request.user.id,
            business_date=str(data["business_date"]),
            counted_cash=data["counted_cash"],
            system_cash_total=system_cash_total,
            branch_id=data.get("branch"),
            cash_counter_id=data.get("cash_counter"),
            finance_account_id=data.get("finance_account"),
            opening_cash=data.get("opening_cash", 0),
            notes=data.get("notes", ""),
        )
        try:
            self.object = create_cashier_day_close_draft(payload)
        except DjangoValidationError as e:
            detail = e.message_dict if hasattr(e, "message_dict") else str(e)
            raise DRFValidationError(detail)
        except Exception as e:
            raise DRFValidationError(str(e))
    
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        response_serializer = CashierDayCloseSerializer(self.object)
        headers = self.get_success_headers(response_serializer.data)
        return Response(response_serializer.data, status=status.HTTP_201_CREATED, headers=headers)


class CashierDayCloseDetailView(generics.RetrieveAPIView):
    """Get details of own day-close record."""
    permission_classes = [permissions.IsAuthenticated, IsCashier]
    serializer_class = CashierDayCloseSerializer
    
    def get_queryset(self):
        # Cashier can only view own records
        return (
            CashierDayClose.objects
            .filter(cashier_id=self.request.user.id)
            .select_related("branch", "cash_counter", "finance_account", "closed_by", "approved_by")
        )


class CashierDayCloseSubmitView(generics.GenericAPIView):
    """Submit a DRAFT day-close record for admin review."""
    permission_classes = [permissions.IsAuthenticated, IsCashier]
    serializer_class = CashierDayCloseSubmitSerializer
    
    def get_queryset(self):
        # Cashier can only submit own records
        return CashierDayClose.objects.filter(cashier_id=self.request.user.id)
    
    def post(self, request, *args, **kwargs):
        day_close = self.get_object()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        payload = CashierDayCloseSubmitPayload(user_id=request.user.id)
        
        try:
            day_close = submit_cashier_day_close(day_close, payload)
        except DjangoValidationError as e:
            detail = e.message_dict if hasattr(e, "message_dict") else str(e)
            raise DRFValidationError(detail)
        except Exception as e:
            raise DRFValidationError(str(e))
        
        response_serializer = CashierDayCloseSerializer(day_close)
        return Response(response_serializer.data, status=status.HTTP_200_OK)
