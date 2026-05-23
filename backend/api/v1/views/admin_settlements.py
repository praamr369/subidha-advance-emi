from __future__ import annotations

from decimal import Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import Http404
from django.db.models import Q
from rest_framework import generics, permissions, status
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.response import Response

from api.v1.permissions import IsAdmin
from api.v1.serializers.settlements import (
    BankStatementImportSerializer,
    BankStatementImportCreateSerializer,
    BankStatementLineSerializer,
    CashierDayCloseSerializer,
    CashierDayCloseApprovalSerializer,
    CashierDayCloseRejectSerializer,
    SettlementAllocationCreateSerializer,
    SettlementAllocationSerializer,
    SettlementAllocationVoidSerializer,
    UpiSettlementImportSerializer,
    UpiSettlementImportCreateSerializer,
    UpiSettlementLineSerializer,
)
from settlements.models import (
    BankStatementImport,
    BankStatementLine,
    CashierDayClose,
    SettlementAllocation,
    UpiSettlementImport,
    UpiSettlementLine,
)
from settlements.services.allocation_service import create_manual_allocation, void_allocation
from settlements.services.import_parser_service import (
    process_bank_statement_import,
    process_upi_settlement_import,
)

from accounting.models import FinanceAccount, FinanceAccountKind, MoneyMovement
from subscriptions.models import Payment


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


class SettlementAllocationListCreateView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]
    queryset = SettlementAllocation.objects.select_related(
        "finance_account",
        "payment",
        "receipt",
        "money_movement",
        "matched_by",
    ).all().order_by("-created_at", "-id")

    def get_serializer_class(self):
        if self.request.method == "POST":
            return SettlementAllocationCreateSerializer
        return SettlementAllocationSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        source_type = (self.request.query_params.get("source_type") or "").strip().upper()
        source_id = (self.request.query_params.get("source_id") or "").strip()
        status_value = (self.request.query_params.get("status") or "").strip().upper()
        finance_account = (self.request.query_params.get("finance_account") or "").strip()
        if source_type:
            qs = qs.filter(source_type=source_type)
        if source_id:
            qs = qs.filter(source_id=source_id)
        if status_value:
            qs = qs.filter(status=status_value)
        if finance_account:
            try:
                qs = qs.filter(finance_account_id=int(finance_account))
            except ValueError:
                raise DRFValidationError({"finance_account": "Invalid finance_account filter."})
        return qs

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            allocation = create_manual_allocation(
                actor=request.user,
                source_type=data["source_type"],
                source_id=data["source_id"],
                finance_account_id=data["finance_account"],
                matched_amount=data["matched_amount"],
                payment_id=data.get("payment"),
                receipt_id=data.get("receipt"),
                money_movement_id=data.get("money_movement"),
                note=data.get("note", ""),
            )
        except DjangoValidationError as e:
            detail = e.message_dict if hasattr(e, "message_dict") else str(e)
            raise DRFValidationError(detail)
        except Exception as e:
            raise DRFValidationError(str(e))

        response_serializer = SettlementAllocationSerializer(allocation)
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)


class SettlementAllocationDetailView(generics.RetrieveAPIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]
    serializer_class = SettlementAllocationSerializer
    queryset = SettlementAllocation.objects.select_related(
        "finance_account",
        "payment",
        "receipt",
        "money_movement",
        "matched_by",
    ).all()


class SettlementAllocationVoidView(generics.GenericAPIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]
    serializer_class = SettlementAllocationVoidSerializer
    queryset = SettlementAllocation.objects.all()

    def post(self, request, *args, **kwargs):
        allocation = self.get_object()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reason = serializer.validated_data.get("reason", "")
        try:
            allocation = void_allocation(actor=request.user, allocation=allocation, reason=reason)
        except DjangoValidationError as e:
            detail = e.message_dict if hasattr(e, "message_dict") else str(e)
            raise DRFValidationError(detail)
        except Exception as e:
            raise DRFValidationError(str(e))
        response_serializer = SettlementAllocationSerializer(allocation)
        return Response(response_serializer.data, status=status.HTTP_200_OK)


LOOKUP_LIMIT = 20


def _compact(parts: list[str | None]) -> str:
    return " · ".join([part.strip() for part in parts if part and part.strip()])


def _money(value: Decimal | None) -> str | None:
    if value is None:
        return None
    return f"{value:.2f}"


class SettlementLookupFinanceAccountView(generics.GenericAPIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, *args, **kwargs):
        q = (request.query_params.get("q") or "").strip()
        kind = (request.query_params.get("kind") or "").strip().upper()

        qs = FinanceAccount.objects.select_related("branch", "chart_account").filter(is_real_settlement_account=True, is_active=True)

        if kind:
            if kind not in {FinanceAccountKind.BANK, FinanceAccountKind.UPI, FinanceAccountKind.CASH}:
                raise DRFValidationError({"kind": "Invalid kind. Expected BANK, UPI, or CASH."})
            qs = qs.filter(kind=kind)

        if q:
            q_id = None
            if q.isdigit():
                try:
                    q_id = int(q)
                except ValueError:
                    q_id = None
            filters = Q(name__icontains=q) | Q(upi_handle__icontains=q) | Q(bank_last4__icontains=q)
            if q_id is not None:
                filters = filters | Q(id=q_id)
            qs = qs.filter(filters)

        qs = qs.order_by("name", "id")[:LOOKUP_LIMIT]

        results = []
        for account in qs:
            branch_name = getattr(account.branch, "name", None) if account.branch_id else None
            subtitle = _compact(
                [
                    branch_name,
                    f"Kind {account.kind}" if account.kind else None,
                    f"•••• {account.bank_last4}" if account.bank_last4 else None,
                    account.upi_handle or None,
                ]
            )
            results.append(
                {
                    "id": account.id,
                    "label": account.name,
                    "subtitle": subtitle or None,
                    "metadata": {
                        "kind": account.kind,
                        "branch_id": account.branch_id,
                    },
                }
            )

        return Response({"results": results})


class SettlementResolveFinanceAccountView(generics.GenericAPIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, *args, **kwargs):
        account_id = self.kwargs.get("pk")
        try:
            account = (
                FinanceAccount.objects.select_related("branch", "chart_account")
                .filter(is_real_settlement_account=True, is_active=True)
                .get(pk=account_id)
            )
        except FinanceAccount.DoesNotExist:
            raise Http404("Finance account not found.")

        branch_name = getattr(account.branch, "name", None) if account.branch_id else None
        subtitle = _compact(
            [
                branch_name,
                f"Kind {account.kind}" if account.kind else None,
                f"•••• {account.bank_last4}" if account.bank_last4 else None,
                account.upi_handle or None,
            ]
        )
        return Response(
            {
                "id": account.id,
                "label": account.name,
                "subtitle": subtitle or None,
                "metadata": {
                    "kind": account.kind,
                    "branch_id": account.branch_id,
                },
            }
        )


class SettlementLookupPaymentsView(generics.GenericAPIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, *args, **kwargs):
        q = (request.query_params.get("q") or "").strip()

        qs = Payment.objects.select_related("customer", "subscription").all().order_by("-payment_date", "-id")

        if q:
            q_id = None
            if q.isdigit():
                try:
                    q_id = int(q)
                except ValueError:
                    q_id = None

            filters = (
                Q(reference_no__icontains=q)
                | Q(customer__name__icontains=q)
                | Q(customer__phone__icontains=q)
                | Q(subscription__subscription_number__icontains=q)
            )
            if q_id is not None:
                filters = filters | Q(id=q_id)
            qs = qs.filter(filters)

        qs = qs[:LOOKUP_LIMIT]

        results = []
        for payment in qs:
            reversal = (payment.allocation_metadata or {}).get("reversal", {}) or {}
            is_reversed = bool(reversal.get("is_reversed"))

            customer_name = getattr(payment.customer, "name", None) if payment.customer_id else None
            customer_phone = getattr(payment.customer, "phone", None) if payment.customer_id else None
            subscription_number = getattr(payment.subscription, "subscription_number", None) if payment.subscription_id else None

            subtitle = _compact(
                [
                    payment.payment_date.isoformat() if payment.payment_date else None,
                    payment.method,
                    f"Ref {payment.reference_no}" if payment.reference_no else None,
                    f"{customer_name} ({customer_phone})" if customer_name and customer_phone else customer_name,
                    f"Sub {subscription_number}" if subscription_number else None,
                    "REVERSED" if is_reversed else None,
                ]
            )
            label = _compact([f"Payment #{payment.id}", f"₹{_money(payment.amount)}" if payment.amount is not None else None])

            results.append(
                {
                    "id": payment.id,
                    "label": label,
                    "subtitle": subtitle or None,
                    "amount": _money(payment.amount),
                    "status": "REVERSED" if is_reversed else None,
                    "date": payment.payment_date.isoformat() if payment.payment_date else None,
                    "metadata": {
                        "method": payment.method,
                        "reference_no": payment.reference_no,
                        "customer_name": customer_name,
                        "customer_phone": customer_phone,
                        "subscription_number": subscription_number,
                        "is_reversed": is_reversed,
                    },
                }
            )

        return Response({"results": results})


class SettlementResolvePaymentsView(generics.GenericAPIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, *args, **kwargs):
        payment_id = self.kwargs.get("pk")
        try:
            payment = Payment.objects.select_related("customer", "subscription").get(pk=payment_id)
        except Payment.DoesNotExist:
            raise Http404("Payment not found.")

        reversal = (payment.allocation_metadata or {}).get("reversal", {}) or {}
        is_reversed = bool(reversal.get("is_reversed"))

        customer_name = getattr(payment.customer, "name", None) if payment.customer_id else None
        customer_phone = getattr(payment.customer, "phone", None) if payment.customer_id else None
        subscription_number = getattr(payment.subscription, "subscription_number", None) if payment.subscription_id else None

        subtitle = _compact(
            [
                payment.payment_date.isoformat() if payment.payment_date else None,
                payment.method,
                f"Ref {payment.reference_no}" if payment.reference_no else None,
                f"{customer_name} ({customer_phone})" if customer_name and customer_phone else customer_name,
                f"Sub {subscription_number}" if subscription_number else None,
                "REVERSED" if is_reversed else None,
            ]
        )
        label = _compact([f"Payment #{payment.id}", f"₹{_money(payment.amount)}" if payment.amount is not None else None])

        return Response(
            {
                "id": payment.id,
                "label": label,
                "subtitle": subtitle or None,
                "amount": _money(payment.amount),
                "status": "REVERSED" if is_reversed else None,
                "date": payment.payment_date.isoformat() if payment.payment_date else None,
                "metadata": {
                    "method": payment.method,
                    "reference_no": payment.reference_no,
                    "customer_name": customer_name,
                    "customer_phone": customer_phone,
                    "subscription_number": subscription_number,
                    "is_reversed": is_reversed,
                },
            }
        )


class SettlementLookupReceiptsView(generics.GenericAPIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, *args, **kwargs):
        from billing.models import ReceiptDocument

        q = (request.query_params.get("q") or "").strip()

        qs = (
            ReceiptDocument.objects.select_related("finance_account")
            .all()
            .order_by("-receipt_date", "-id")
        )

        if q:
            q_id = None
            if q.isdigit():
                try:
                    q_id = int(q)
                except ValueError:
                    q_id = None
            filters = (
                Q(receipt_no__icontains=q)
                | Q(customer_name_snapshot__icontains=q)
                | Q(customer_phone_snapshot__icontains=q)
                | Q(source_reference__icontains=q)
            )
            if q_id is not None:
                filters = filters | Q(id=q_id)
            qs = qs.filter(filters)

        qs = qs[:LOOKUP_LIMIT]

        results = []
        for receipt in qs:
            finance_account_name = getattr(receipt.finance_account, "name", None) if receipt.finance_account_id else None
            subtitle = _compact(
                [
                    receipt.receipt_date.isoformat() if receipt.receipt_date else None,
                    receipt.status,
                    finance_account_name,
                    f"{receipt.customer_name_snapshot} ({receipt.customer_phone_snapshot})"
                    if receipt.customer_name_snapshot and receipt.customer_phone_snapshot
                    else (receipt.customer_name_snapshot or None),
                ]
            )
            label = _compact(
                [
                    f"Receipt {receipt.receipt_no}" if receipt.receipt_no else f"Receipt #{receipt.id}",
                    f"₹{_money(receipt.amount)}" if receipt.amount is not None else None,
                ]
            )
            results.append(
                {
                    "id": receipt.id,
                    "label": label,
                    "subtitle": subtitle or None,
                    "amount": _money(receipt.amount),
                    "status": receipt.status,
                    "date": receipt.receipt_date.isoformat() if receipt.receipt_date else None,
                    "metadata": {
                        "receipt_no": receipt.receipt_no,
                        "receipt_type": receipt.receipt_type,
                        "finance_account_id": receipt.finance_account_id,
                        "finance_account_name": finance_account_name,
                    },
                }
            )

        return Response({"results": results})


class SettlementResolveReceiptsView(generics.GenericAPIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, *args, **kwargs):
        from billing.models import ReceiptDocument

        receipt_id = self.kwargs.get("pk")
        try:
            receipt = ReceiptDocument.objects.select_related("finance_account").get(pk=receipt_id)
        except ReceiptDocument.DoesNotExist:
            raise Http404("Receipt not found.")

        finance_account_name = getattr(receipt.finance_account, "name", None) if receipt.finance_account_id else None
        subtitle = _compact(
            [
                receipt.receipt_date.isoformat() if receipt.receipt_date else None,
                receipt.status,
                finance_account_name,
                f"{receipt.customer_name_snapshot} ({receipt.customer_phone_snapshot})"
                if receipt.customer_name_snapshot and receipt.customer_phone_snapshot
                else (receipt.customer_name_snapshot or None),
            ]
        )
        label = _compact(
            [
                f"Receipt {receipt.receipt_no}" if receipt.receipt_no else f"Receipt #{receipt.id}",
                f"₹{_money(receipt.amount)}" if receipt.amount is not None else None,
            ]
        )
        return Response(
            {
                "id": receipt.id,
                "label": label,
                "subtitle": subtitle or None,
                "amount": _money(receipt.amount),
                "status": receipt.status,
                "date": receipt.receipt_date.isoformat() if receipt.receipt_date else None,
                "metadata": {
                    "receipt_no": receipt.receipt_no,
                    "receipt_type": receipt.receipt_type,
                    "finance_account_id": receipt.finance_account_id,
                    "finance_account_name": finance_account_name,
                },
            }
        )


class SettlementLookupMoneyMovementsView(generics.GenericAPIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, *args, **kwargs):
        q = (request.query_params.get("q") or "").strip()

        qs = (
            MoneyMovement.objects.select_related("from_finance_account", "to_finance_account")
            .all()
            .order_by("-movement_date", "-id")
        )

        if q:
            q_id = None
            if q.isdigit():
                try:
                    q_id = int(q)
                except ValueError:
                    q_id = None
            filters = (
                Q(movement_no__icontains=q)
                | Q(reference_no__icontains=q)
                | Q(from_finance_account__name__icontains=q)
                | Q(to_finance_account__name__icontains=q)
            )
            if q_id is not None:
                filters = filters | Q(id=q_id)
            qs = qs.filter(filters)

        qs = qs[:LOOKUP_LIMIT]

        results = []
        for movement in qs:
            from_name = getattr(movement.from_finance_account, "name", None) if movement.from_finance_account_id else None
            to_name = getattr(movement.to_finance_account, "name", None) if movement.to_finance_account_id else None
            subtitle = _compact(
                [
                    movement.movement_date.isoformat() if movement.movement_date else None,
                    movement.status,
                    f"Ref {movement.reference_no}" if movement.reference_no else None,
                    f"{from_name} → {to_name}" if from_name and to_name else None,
                ]
            )
            label = _compact(
                [
                    f"Movement {movement.movement_no}" if movement.movement_no else f"Movement #{movement.id}",
                    f"₹{_money(movement.amount)}" if movement.amount is not None else None,
                ]
            )
            results.append(
                {
                    "id": movement.id,
                    "label": label,
                    "subtitle": subtitle or None,
                    "amount": _money(movement.amount),
                    "status": movement.status,
                    "date": movement.movement_date.isoformat() if movement.movement_date else None,
                    "metadata": {
                        "movement_no": movement.movement_no,
                        "reference_no": movement.reference_no,
                        "from_finance_account_id": movement.from_finance_account_id,
                        "to_finance_account_id": movement.to_finance_account_id,
                    },
                }
            )

        return Response({"results": results})


class SettlementResolveMoneyMovementsView(generics.GenericAPIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, *args, **kwargs):
        movement_id = self.kwargs.get("pk")
        try:
            movement = MoneyMovement.objects.select_related("from_finance_account", "to_finance_account").get(pk=movement_id)
        except MoneyMovement.DoesNotExist:
            raise Http404("Money movement not found.")

        from_name = getattr(movement.from_finance_account, "name", None) if movement.from_finance_account_id else None
        to_name = getattr(movement.to_finance_account, "name", None) if movement.to_finance_account_id else None
        subtitle = _compact(
            [
                movement.movement_date.isoformat() if movement.movement_date else None,
                movement.status,
                f"Ref {movement.reference_no}" if movement.reference_no else None,
                f"{from_name} → {to_name}" if from_name and to_name else None,
            ]
        )
        label = _compact(
            [
                f"Movement {movement.movement_no}" if movement.movement_no else f"Movement #{movement.id}",
                f"₹{_money(movement.amount)}" if movement.amount is not None else None,
            ]
        )
        return Response(
            {
                "id": movement.id,
                "label": label,
                "subtitle": subtitle or None,
                "amount": _money(movement.amount),
                "status": movement.status,
                "date": movement.movement_date.isoformat() if movement.movement_date else None,
                "metadata": {
                    "movement_no": movement.movement_no,
                    "reference_no": movement.reference_no,
                    "from_finance_account_id": movement.from_finance_account_id,
                    "to_finance_account_id": movement.to_finance_account_id,
                },
            }
        )


# === Cashier Day Close Admin Views ===


class CashierDayCloseListView(generics.ListAPIView):
    """Admin list view for all cashier day-closes."""
    permission_classes = [permissions.IsAuthenticated, IsAdmin]
    serializer_class = CashierDayCloseSerializer
    queryset = CashierDayClose.objects.select_related(
        "cashier",
        "branch",
        "cash_counter",
        "finance_account",
        "closed_by",
        "approved_by",
    ).all().order_by("-business_date", "-created_at", "-id")
    
    def get_queryset(self):
        qs = super().get_queryset()
        # Filter by status if provided
        status_filter = self.request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter.upper())
        # Filter by cashier if provided
        cashier_id = self.request.query_params.get("cashier_id")
        if cashier_id:
            qs = qs.filter(cashier_id=cashier_id)
        # Filter by date if provided
        business_date = self.request.query_params.get("business_date")
        if business_date:
            qs = qs.filter(business_date=business_date)
        return qs


class CashierDayCloseDetailView(generics.RetrieveAPIView):
    """Admin detail view for a specific cashier day-close."""
    permission_classes = [permissions.IsAuthenticated, IsAdmin]
    serializer_class = CashierDayCloseSerializer
    queryset = CashierDayClose.objects.select_related(
        "cashier",
        "branch",
        "cash_counter",
        "finance_account",
        "closed_by",
        "approved_by",
    ).all()


class CashierDayCloseApproveView(generics.GenericAPIView):
    """Admin approval view: SUBMITTED → APPROVED."""
    permission_classes = [permissions.IsAuthenticated, IsAdmin]
    serializer_class = CashierDayCloseApprovalSerializer
    queryset = CashierDayClose.objects.all()
    
    def post(self, request, *args, **kwargs):
        from settlements.services.cashier_day_close_service import (
            CashierDayCloseApprovalPayload,
            approve_cashier_day_close,
        )
        
        day_close = self.get_object()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        notes = serializer.validated_data.get("notes", "")
        payload = CashierDayCloseApprovalPayload(user_id=request.user.id, notes=notes or None)
        
        try:
            day_close = approve_cashier_day_close(day_close, payload)
        except DjangoValidationError as e:
            detail = e.message_dict if hasattr(e, "message_dict") else str(e)
            raise DRFValidationError(detail)
        except Exception as e:
            raise DRFValidationError(str(e))
        
        response_serializer = CashierDayCloseSerializer(day_close)
        return Response(response_serializer.data, status=status.HTTP_200_OK)


class CashierDayCloseRejectView(generics.GenericAPIView):
    """Admin rejection view: SUBMITTED → REJECTED."""
    permission_classes = [permissions.IsAuthenticated, IsAdmin]
    serializer_class = CashierDayCloseRejectSerializer
    queryset = CashierDayClose.objects.all()
    
    def post(self, request, *args, **kwargs):
        from settlements.services.cashier_day_close_service import (
            CashierDayCloseRejectionPayload,
            reject_cashier_day_close,
        )
        
        day_close = self.get_object()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        notes = serializer.validated_data.get("notes", "")
        payload = CashierDayCloseRejectionPayload(user_id=request.user.id, notes=notes)
        
        try:
            day_close = reject_cashier_day_close(day_close, payload)
        except DjangoValidationError as e:
            detail = e.message_dict if hasattr(e, "message_dict") else str(e)
            raise DRFValidationError(detail)
        except Exception as e:
            raise DRFValidationError(str(e))
        
        response_serializer = CashierDayCloseSerializer(day_close)
        return Response(response_serializer.data, status=status.HTTP_200_OK)
