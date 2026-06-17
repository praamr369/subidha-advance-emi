"""
P2A — Admin API views for ApprovalRequest, BusinessPolicy, ControlException.

All endpoints are gated to ADMIN role only.
Additive. Does not touch any existing view, service, or model.
"""
from __future__ import annotations

from django.shortcuts import get_object_or_404
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from subscriptions.models_control_foundation import (
    ApprovalRequest,
    ApprovalStatus,
    BusinessPolicy,
    ControlException,
    ExceptionStatus,
    PolicyScopeType,
    PolicyValueType,
)
from subscriptions.services.control_approval_service import (
    approve_request,
    cancel_request,
    create_approval_request,
    reject_request,
)
from subscriptions.services.control_exception_service import (
    acknowledge_exception,
    list_open_exceptions,
    resolve_exception,
    suppress_exception,
)
from subscriptions.services.control_policy_service import (
    PolicyKey,
    get_policy_value,
    set_policy_value,
)


# ─────────────────────────────────────────────
# Serialisation helpers
# ─────────────────────────────────────────────

def _approval_payload(req: ApprovalRequest) -> dict:
    return {
        "id": req.pk,
        "source_model": req.source_model,
        "source_id": req.source_id,
        "action_key": req.action_key,
        "requested_by": req.requested_by_id,
        "approved_by": req.approved_by_id,
        "status": req.status,
        "risk_level": req.risk_level,
        "before_snapshot": req.before_snapshot,
        "after_snapshot": req.after_snapshot,
        "request_reason": req.request_reason,
        "decision_reason": req.decision_reason,
        "requested_at": req.requested_at.isoformat() if req.requested_at else None,
        "decided_at": req.decided_at.isoformat() if req.decided_at else None,
        "expires_at": req.expires_at.isoformat() if req.expires_at else None,
        "metadata": req.metadata,
    }


def _policy_payload(p: BusinessPolicy) -> dict:
    return {
        "id": p.pk,
        "key": p.key,
        "value_type": p.value_type,
        "value": p.value,
        "scope_type": p.scope_type,
        "scope_key": p.scope_key,
        "effective_from": p.effective_from.isoformat() if p.effective_from else None,
        "effective_to": p.effective_to.isoformat() if p.effective_to else None,
        "is_active": p.is_active,
        "created_by": p.created_by_id,
        "updated_by": p.updated_by_id,
        "created_at": p.created_at.isoformat(),
        "metadata": p.metadata,
    }


def _exception_payload(exc: ControlException) -> dict:
    return {
        "id": exc.pk,
        "exception_key": exc.exception_key,
        "severity": exc.severity,
        "source_model": exc.source_model,
        "source_id": exc.source_id,
        "title": exc.title,
        "message": exc.message,
        "action_url": exc.action_url,
        "detected_at": exc.detected_at.isoformat(),
        "status": exc.status,
        "acknowledged_by": exc.acknowledged_by_id,
        "acknowledged_at": exc.acknowledged_at.isoformat() if exc.acknowledged_at else None,
        "metadata": exc.metadata,
    }


# ─────────────────────────────────────────────
# Approval endpoints
# ─────────────────────────────────────────────

class AdminApprovalListView(APIView):
    """GET /api/v1/admin/control/approvals/"""
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        qs = ApprovalRequest.objects.select_related("requested_by", "approved_by").order_by("-requested_at")

        status_filter = request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)

        risk_filter = request.query_params.get("risk_level")
        if risk_filter:
            qs = qs.filter(risk_level=risk_filter)

        return Response({"results": [_approval_payload(r) for r in qs[:200]]})


class AdminApprovalApproveView(APIView):
    """POST /api/v1/admin/control/approvals/{id}/approve/"""
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk):
        req = get_object_or_404(ApprovalRequest, pk=pk)
        reason = (request.data.get("decision_reason") or "").strip()
        try:
            updated = approve_request(
                request=req,
                decided_by=request.user,
                decision_reason=reason,
            )
        except (ValueError, Exception) as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(_approval_payload(updated))


class AdminApprovalRejectView(APIView):
    """POST /api/v1/admin/control/approvals/{id}/reject/"""
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk):
        req = get_object_or_404(ApprovalRequest, pk=pk)
        reason = (request.data.get("decision_reason") or "").strip()
        try:
            updated = reject_request(
                request=req,
                decided_by=request.user,
                decision_reason=reason,
            )
        except (ValueError, Exception) as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(_approval_payload(updated))


# ─────────────────────────────────────────────
# Policy endpoints
# ─────────────────────────────────────────────

class AdminPolicyListView(APIView):
    """GET /api/v1/admin/control/policies/"""
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        qs = BusinessPolicy.objects.filter(is_active=True).order_by("key", "scope_type")

        key_filter = request.query_params.get("key")
        if key_filter:
            qs = qs.filter(key=key_filter)

        scope_filter = request.query_params.get("scope_type")
        if scope_filter:
            qs = qs.filter(scope_type=scope_filter)

        return Response({"results": [_policy_payload(p) for p in qs]})


class AdminPolicyUpdateView(APIView):
    """POST /api/v1/admin/control/policies/set/

    Body: { key, value, value_type?, scope_type?, scope_key?, effective_from?, effective_to?, metadata? }
    """
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    _ALLOWED_VALUE_TYPES = {vt.value for vt in PolicyValueType}
    _ALLOWED_SCOPE_TYPES = {st.value for st in PolicyScopeType}

    def post(self, request):
        key = (request.data.get("key") or "").strip()
        if not key:
            return Response({"detail": "key is required."}, status=status.HTTP_400_BAD_REQUEST)

        value = request.data.get("value")
        if value is None:
            return Response({"detail": "value is required."}, status=status.HTTP_400_BAD_REQUEST)

        value_type = (request.data.get("value_type") or PolicyValueType.BOOL).strip().upper()
        if value_type not in self._ALLOWED_VALUE_TYPES:
            return Response(
                {"detail": f"value_type must be one of {sorted(self._ALLOWED_VALUE_TYPES)}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        scope_type = (request.data.get("scope_type") or PolicyScopeType.GLOBAL).strip().upper()
        if scope_type not in self._ALLOWED_SCOPE_TYPES:
            return Response(
                {"detail": f"scope_type must be one of {sorted(self._ALLOWED_SCOPE_TYPES)}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        scope_key = (request.data.get("scope_key") or "").strip()
        effective_from = request.data.get("effective_from")
        effective_to = request.data.get("effective_to")
        metadata = request.data.get("metadata") or {}

        try:
            policy = set_policy_value(
                key=key,
                value=value,
                value_type=value_type,
                scope_type=scope_type,
                scope_key=scope_key,
                effective_from=effective_from,
                effective_to=effective_to,
                updated_by=request.user,
                metadata=metadata,
            )
        except Exception as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(_policy_payload(policy), status=status.HTTP_201_CREATED)


# ─────────────────────────────────────────────
# Exception endpoints
# ─────────────────────────────────────────────

class AdminExceptionListView(APIView):
    """GET /api/v1/admin/control/exceptions/"""
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        severity = request.query_params.get("severity")
        exception_key = request.query_params.get("exception_key")
        source_model = request.query_params.get("source_model")

        results = list_open_exceptions(
            severity=severity or None,
            exception_key=exception_key or None,
            source_model=source_model or None,
        )
        return Response({"results": results})


class AdminExceptionAcknowledgeView(APIView):
    """POST /api/v1/admin/control/exceptions/{id}/acknowledge/"""
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk):
        exc = get_object_or_404(ControlException, pk=pk)
        try:
            updated = acknowledge_exception(exception=exc, acknowledged_by=request.user)
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(_exception_payload(updated))


class AdminExceptionResolveView(APIView):
    """POST /api/v1/admin/control/exceptions/{id}/resolve/"""
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk):
        exc = get_object_or_404(ControlException, pk=pk)
        try:
            updated = resolve_exception(exception=exc)
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(_exception_payload(updated))


class AdminExceptionSuppressView(APIView):
    """POST /api/v1/admin/control/exceptions/{id}/suppress/"""
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk):
        exc = get_object_or_404(ControlException, pk=pk)
        try:
            updated = suppress_exception(exception=exc)
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(_exception_payload(updated))
