from __future__ import annotations

from django.db import transaction
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.pagination import build_paginated_payload
from api.v1.permissions import IsCustomer, IsAdmin, IsPartner
from api.v1.serializers.workbench import (
    WorkbenchItemSerializer,
    WorkbenchActionSerializer,
)
from subscriptions.models_workbench import WorkbenchItem, WorkbenchModule, WorkbenchItemStatus
from subscriptions.services.workbench_service import (
    workbench_base_queryset,
    get_customer_workbench,
    get_user_assigned_items,
    assign_workbench_item,
    complete_workbench_item,
    cancel_workbench_item,
    add_workbench_action,
)
from api.v1.views.customer import _get_customer_or_404_response


class CustomerWorkbenchListView(APIView):
    permission_classes = [IsAuthenticated, IsCustomer]

    def get(self, request):
        customer, err_resp = _get_customer_or_404_response(request)
        if err_resp:
            return err_resp

        module = request.query_params.get("module")
        status_filter = request.query_params.get("status")

        qs = get_customer_workbench(customer, module=module)
        if status_filter:
            qs = qs.filter(status=status_filter)

        return Response(
            build_paginated_payload(
                request,
                qs,
                lambda items: WorkbenchItemSerializer(
                    items, many=True, context={"request": request}
                ).data,
            )
        )


class CustomerWorkbenchDetailView(APIView):
    permission_classes = [IsAuthenticated, IsCustomer]

    def get(self, request, pk):
        customer, err_resp = _get_customer_or_404_response(request)
        if err_resp:
            return err_resp

        try:
            item = workbench_base_queryset().get(pk=pk, customer=customer)
            serializer = WorkbenchItemSerializer(item, context={"request": request})
            return Response(serializer.data)
        except WorkbenchItem.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)


class AdminWorkbenchListView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        module = request.query_params.get("module")
        status_filter = request.query_params.get("status")

        qs = workbench_base_queryset()
        if module:
            qs = qs.filter(module=module)
        if status_filter:
            qs = qs.filter(status=status_filter)

        return Response(
            build_paginated_payload(
                request,
                qs,
                lambda items: WorkbenchItemSerializer(
                    items, many=True, context={"request": request}
                ).data,
            )
        )


class AdminWorkbenchDetailView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request, pk):
        try:
            item = workbench_base_queryset().get(pk=pk)
            serializer = WorkbenchItemSerializer(item, context={"request": request})
            return Response(serializer.data)
        except WorkbenchItem.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)


class WorkbenchAssignView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    @transaction.atomic
    def post(self, request, pk):
        assigned_to_id = request.data.get("assigned_to_id")
        if not assigned_to_id:
            return Response(
                {"assigned_to_id": "Required field."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            from accounts.models import User
            assigned_to = User.objects.get(pk=assigned_to_id)
            item = assign_workbench_item(
                item_id=pk,
                assigned_to=assigned_to,
                performed_by=request.user,
            )
            serializer = WorkbenchItemSerializer(item, context={"request": request})
            return Response(serializer.data)
        except WorkbenchItem.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class WorkbenchCompleteView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    @transaction.atomic
    def post(self, request, pk):
        notes = request.data.get("notes", "")
        result_data = request.data.get("result_data", {})

        try:
            item = complete_workbench_item(
                item_id=pk,
                performed_by=request.user,
                notes=notes,
                result_data=result_data,
            )
            serializer = WorkbenchItemSerializer(item, context={"request": request})
            return Response(serializer.data)
        except WorkbenchItem.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class WorkbenchCancelView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    @transaction.atomic
    def post(self, request, pk):
        notes = request.data.get("notes", "")

        try:
            item = cancel_workbench_item(
                item_id=pk,
                performed_by=request.user,
                notes=notes,
            )
            serializer = WorkbenchItemSerializer(item, context={"request": request})
            return Response(serializer.data)
        except WorkbenchItem.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class WorkbenchActionListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            item = WorkbenchItem.objects.get(pk=pk)
            actions = item.actions.all()
            serializer = WorkbenchActionSerializer(actions, many=True)
            return Response(serializer.data)
        except WorkbenchItem.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)


class WorkbenchActionCreateView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    @transaction.atomic
    def post(self, request, pk):
        action_type = request.data.get("action_type")
        notes = request.data.get("notes", "")
        result_data = request.data.get("result_data", {})

        try:
            action = add_workbench_action(
                item_id=pk,
                action_type=action_type,
                performed_by=request.user,
                notes=notes,
                result_data=result_data,
            )
            serializer = WorkbenchActionSerializer(action)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        except WorkbenchItem.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class AdminAssignedItemsView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        status_filter = request.query_params.get("status")
        qs = get_user_assigned_items(request.user, status=status_filter)

        return Response(
            build_paginated_payload(
                request,
                qs,
                lambda items: WorkbenchItemSerializer(
                    items, many=True, context={"request": request}
                ).data,
            )
        )
