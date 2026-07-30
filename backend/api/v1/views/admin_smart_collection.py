from __future__ import annotations

import logging
from decimal import Decimal

from rest_framework import permissions, status
from rest_framework.exceptions import ValidationError
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from billing.services.smart_collection_service import plan_smart_collection, execute_smart_collection

logger = logging.getLogger(__name__)


class AdminSmartCollectionOutstandingView(APIView):
    """
    GET /api/v1/admin/billing/smart-collect/outstanding/?customer_id=N
    
    Returns the outstanding summary for a customer.
    """
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request: Request) -> Response:
        customer_id = request.query_params.get("customer_id")
        if not customer_id:
            return Response({"error": "customer_id is required"}, status=status.HTTP_400_BAD_REQUEST)
            
        try:
            # We can reuse the planner with amount=0 to get the opening state
            plan = plan_smart_collection(
                customer_id=int(customer_id),
                amount=Decimal("0.00"),  # Plan will raise ValidationError on 0, so we just catch it or modify plan to allow 0.
                use_existing_advance=False
            )
            return Response(plan, status=status.HTTP_200_OK)
        except ValidationError as e:
            # If the planner doesn't allow 0, we can temporarily bypass by passing 0.01 and stripping allocations
            # Actually, let's just pass 0.01 and strip allocations
            try:
                plan = plan_smart_collection(
                    customer_id=int(customer_id),
                    amount=Decimal("0.01"),
                    use_existing_advance=False
                )
                # Strip allocations and skipped
                plan["allocations"] = []
                plan["skipped"] = []
                plan["input"]["amount"] = "0.00"
                plan["closing"] = plan["opening"] # No change
                return Response(plan, status=status.HTTP_200_OK)
            except (ValueError, ValidationError) as ve:
                return Response({"error": str(ve)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.exception("Unexpected error fetching smart collect outstanding")
            return Response({"error": "An unexpected error occurred."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class AdminSmartCollectionView(APIView):
    """
    POST /api/v1/admin/billing/smart-collect/
    """
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request: Request) -> Response:
        data = request.data
        customer_id = data.get("customer_id")
        amount = data.get("amount")
        dry_run = data.get("dry_run", False)
        use_existing_advance = data.get("use_existing_advance", True)
        
        if not customer_id or not amount:
            return Response({"error": "customer_id and amount are required."}, status=status.HTTP_400_BAD_REQUEST)
            
        try:
            amount_decimal = Decimal(str(amount))
        except Exception:
            return Response({"error": "Invalid amount."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            if dry_run:
                result = plan_smart_collection(
                    customer_id=int(customer_id),
                    amount=amount_decimal,
                    use_existing_advance=bool(use_existing_advance)
                )
            else:
                idempotency_key = data.get("idempotency_key")
                payment_method = data.get("payment_method")
                finance_account_id = data.get("finance_account_id")
                
                if not idempotency_key or not payment_method or not finance_account_id:
                    return Response({"error": "idempotency_key, payment_method, and finance_account_id are required for execution."}, status=status.HTTP_400_BAD_REQUEST)
                    
                result = execute_smart_collection(
                    customer_id=int(customer_id),
                    amount=amount_decimal,
                    payment_method=payment_method,
                    finance_account_id=finance_account_id,
                    collected_by=request.user,
                    use_existing_advance=bool(use_existing_advance),
                    idempotency_key=idempotency_key,
                    branch_id=data.get("branch_id"),
                    cash_counter_id=data.get("cash_counter_id"),
                    reference_no=data.get("reference_no"),
                    notes=data.get("notes")
                )
                
            return Response(result, status=status.HTTP_200_OK)
            
        except (ValueError, ValidationError) as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.exception("Unexpected error in smart collection")
            return Response({"error": "An unexpected error occurred."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
