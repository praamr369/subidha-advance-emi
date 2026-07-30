"""
Admin views for previously-missing finance/payment endpoints:
  1. /admin/payments/reversals/              — reversed-payment queue
  2. /admin/payments/reversals/{id}/approve/ — no-op (reversals are immediate)
  3. /admin/payments/reversals/{id}/reject/  — no-op stub
  4. /admin/finance/reconciliation-signoffs/ — ReconciliationSignOff list + create
  5. /admin/finance/reconciliation-signoffs/{id}/sign-off/
  6. /admin/finance/reconciliation-signoffs/{id}/revoke/
  7. /admin/finance/forfeiture-invoices/     — DepositForfeitureTaxInvoice list
  8. /admin/finance/forfeiture-invoices/{id}/issue/
"""
from __future__ import annotations

from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin


# ── 1–3: Payment reversal queue ──────────────────────────────────────────────

class AdminPaymentReversalsView(APIView):
    """
    GET /admin/payments/reversals/
    Returns payments that have been reversed, formatted for the reversals queue UI.
    Reversals in this system are immediate (no PENDING approval step) so all
    reversed payments appear with status=PROCESSED.
    """
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, *args, **kwargs):
        from subscriptions.models import Payment

        qs = (
            Payment.objects
            .filter(allocation_metadata__reversal__is_reversed=True)
            .select_related("subscription__customer", "collected_by")
            .order_by("-payment_date", "-id")[:200]
        )

        results = []
        for p in qs:
            reversal_meta = (p.allocation_metadata or {}).get("reversal", {})
            customer = getattr(getattr(p, "subscription", None), "customer", None)
            customer_name = (
                getattr(customer, "name", None)
                or getattr(customer, "full_name", None)
                or "—"
            ) if customer else "—"
            receipt_qs = getattr(p, "receipts", None)
            receipt_no = "—"
            if receipt_qs is not None:
                try:
                    r = receipt_qs.first()
                    receipt_no = getattr(r, "receipt_no", None) or "—"
                except Exception:
                    pass
            collected_by_name = (
                p.collected_by.get_full_name() or p.collected_by.username
                if getattr(p, "collected_by_id", None) else "—"
            )
            results.append({
                "id": p.id,
                "payment_id": p.id,
                "receipt_number": receipt_no,
                "amount": str(p.amount),
                "reason": reversal_meta.get("reason", "—"),
                "status": "PROCESSED",
                "requested_by": reversal_meta.get("reversed_by_username", collected_by_name),
                "approved_by": None,
                "created_at": str(p.payment_date),
                "processed_at": str(p.payment_date),
                "customer_name": customer_name,
            })

        return Response({"count": len(results), "results": results}, status=status.HTTP_200_OK)


class AdminPaymentReversalActionView(APIView):
    """
    POST /admin/payments/reversals/{pk}/approve/
    POST /admin/payments/reversals/{pk}/reject/
    Reversals in this system are immediate — no approval step exists.
    These stubs return 200 with an explanatory message so the UI doesn't break.
    """
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk=None, action=None, *args, **kwargs):
        return Response(
            {
                "detail": (
                    "Payment reversals in this system are processed immediately "
                    "at the time they are initiated — no separate approval step applies. "
                    "The reversal is already final. To review the payment, visit "
                    f"/admin/payments/{pk}/."
                ),
                "payment_id": pk,
                "action": action,
                "status": "PROCESSED",
            },
            status=status.HTTP_200_OK,
        )


# ── 4–6: Reconciliation sign-offs ────────────────────────────────────────────

def _sign_off_to_dict(so) -> dict:
    return {
        "id": so.id,
        "reconciliation_run_id": so.reconciliation_run_id,
        "status": so.status,
        "signed_off_by": (
            so.signed_off_by.get_full_name() or so.signed_off_by.username
            if so.signed_off_by_id else None
        ),
        "signed_off_at": so.signed_off_at.isoformat() if so.signed_off_at else None,
        "open_item_count_at_sign_off": so.open_item_count_at_sign_off,
        "attestation_note": so.attestation_note,
        "revoked_by": (
            so.revoked_by.get_full_name() or so.revoked_by.username
            if so.revoked_by_id else None
        ),
        "revoked_at": so.revoked_at.isoformat() if so.revoked_at else None,
        "revocation_reason": so.revocation_reason,
        "created_at": so.created_at.isoformat(),
    }


class AdminReconciliationSignOffListView(APIView):
    """GET /admin/finance/reconciliation-signoffs/ — list all sign-offs"""
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, *args, **kwargs):
        from reconciliation.models import ReconciliationSignOff
        qs = (
            ReconciliationSignOff.objects
            .select_related("signed_off_by", "revoked_by", "reconciliation_run")
            .order_by("-created_at")[:100]
        )
        return Response({"count": qs.count(), "results": [_sign_off_to_dict(so) for so in qs]})


class AdminReconciliationSignOffActionView(APIView):
    """
    POST /admin/finance/reconciliation-signoffs/{pk}/sign-off/
    POST /admin/finance/reconciliation-signoffs/{pk}/revoke/
    """
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk=None, action=None, *args, **kwargs):
        from reconciliation.models import ReconciliationSignOff, ReconciliationSignOffStatus
        from django.core.exceptions import ValidationError as DjangoValidationError
        from django.db import transaction

        from subscriptions.models import AuditLog
        from subscriptions.services.audit_service import log_audit

        try:
            so = ReconciliationSignOff.objects.select_related(
                "signed_off_by", "revoked_by"
            ).get(pk=pk)
        except ReconciliationSignOff.DoesNotExist:
            return Response({"detail": "Sign-off not found."}, status=status.HTTP_404_NOT_FOUND)

        now = timezone.now()

        if action == "sign-off":
            if so.status != ReconciliationSignOffStatus.PENDING:
                return Response(
                    {"detail": f"Cannot sign off a record with status '{so.status}'."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            note = (request.data.get("attestation_note") or "").strip()
            so.status = ReconciliationSignOffStatus.SIGNED_OFF
            so.signed_off_by = request.user
            so.signed_off_at = now
            if note:
                so.attestation_note = note
            try:
                with transaction.atomic():
                    so.save()
                    log_audit(
                        action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
                        instance=so,
                        performed_by=request.user,
                        metadata={
                            "event": "RECONCILIATION_SIGN_OFF_RECORDED",
                            "reconciliation_run_id": so.reconciliation_run_id,
                            "open_item_count_at_sign_off": so.open_item_count_at_sign_off,
                            "attestation_note": so.attestation_note or "",
                        },
                    )
            except DjangoValidationError as exc:
                return Response(
                    {"detail": exc.messages[0] if exc.messages else str(exc)},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            return Response(_sign_off_to_dict(so), status=status.HTTP_200_OK)

        elif action == "revoke":
            if so.status != ReconciliationSignOffStatus.SIGNED_OFF:
                return Response(
                    {"detail": f"Can only revoke a SIGNED_OFF record (current: '{so.status}')."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            reason = (request.data.get("revocation_reason") or "").strip()
            if not reason:
                return Response(
                    {"detail": "revocation_reason is required."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            so.status = ReconciliationSignOffStatus.REVOKED
            so.revoked_by = request.user
            so.revoked_at = now
            so.revocation_reason = reason
            try:
                with transaction.atomic():
                    so.save()
                    log_audit(
                        action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
                        instance=so,
                        performed_by=request.user,
                        metadata={
                            "event": "RECONCILIATION_SIGN_OFF_REVOKED",
                            "reconciliation_run_id": so.reconciliation_run_id,
                            "revocation_reason": reason,
                        },
                    )
            except DjangoValidationError as exc:
                return Response(
                    {"detail": exc.messages[0] if exc.messages else str(exc)},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            return Response(_sign_off_to_dict(so), status=status.HTTP_200_OK)

        return Response({"detail": f"Unknown action '{action}'."}, status=status.HTTP_400_BAD_REQUEST)


# ── 7–8: Deposit forfeiture invoices ─────────────────────────────────────────

def _forfeiture_to_dict(inv) -> dict:
    sub = inv.subscription
    customer = getattr(sub, "customer", None)
    return {
        "id": inv.id,
        "invoice_number": inv.invoice_number,
        "invoice_date": str(inv.invoice_date),
        "status": inv.status,
        "subscription_id": inv.subscription_id,
        "subscription_number": getattr(sub, "subscription_number", None),
        "customer_name": (
            getattr(customer, "name", None)
            or getattr(customer, "full_name", None)
        ) if customer else None,
        "forfeited_amount": str(inv.forfeited_amount),
        "gst_rate": str(inv.gst_rate),
        "cgst_amount": str(inv.cgst_amount),
        "sgst_amount": str(inv.sgst_amount),
        "igst_amount": str(inv.igst_amount),
        "total_tax_amount": str(inv.total_tax_amount),
        "total_invoice_amount": str(inv.total_invoice_amount),
        "forfeiture_reason": inv.forfeiture_reason,
        "issued_by": (
            inv.issued_by.get_full_name() or inv.issued_by.username
            if inv.issued_by_id else None
        ),
        "cancelled_at": inv.cancelled_at.isoformat() if inv.cancelled_at else None,
        "cancel_reason": inv.cancel_reason,
    }


class AdminForfeitureInvoiceListView(APIView):
    """GET /admin/finance/forfeiture-invoices/"""
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, *args, **kwargs):
        from subscriptions.models import DepositForfeitureTaxInvoice
        status_filter = request.query_params.get("status", "").upper().strip()
        qs = (
            DepositForfeitureTaxInvoice.objects
            .select_related("subscription__customer", "issued_by", "cancelled_by")
            .order_by("-invoice_date", "-id")
        )
        if status_filter:
            qs = qs.filter(status=status_filter)
        results = [_forfeiture_to_dict(inv) for inv in qs[:200]]
        return Response({"count": len(results), "results": results})


class AdminForfeitureInvoiceIssueView(APIView):
    """POST /admin/finance/forfeiture-invoices/{pk}/issue/"""
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk=None, *args, **kwargs):
        from django.db import transaction

        from subscriptions.models import (
            AuditLog,
            DepositForfeitureStatus,
            DepositForfeitureTaxInvoice,
        )
        from subscriptions.services.audit_service import log_audit

        try:
            inv = DepositForfeitureTaxInvoice.objects.select_related(
                "subscription__customer", "issued_by"
            ).get(pk=pk)
        except DepositForfeitureTaxInvoice.DoesNotExist:
            return Response({"detail": "Invoice not found."}, status=status.HTTP_404_NOT_FOUND)

        if inv.status != DepositForfeitureStatus.DRAFT:
            return Response(
                {"detail": f"Invoice is already {inv.status} — cannot issue."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            inv.status = DepositForfeitureStatus.ISSUED
            inv.save(update_fields=["status"])
            log_audit(
                action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
                instance=inv,
                performed_by=request.user,
                metadata={
                    "event": "DEPOSIT_FORFEITURE_INVOICE_ISSUED",
                    "invoice_number": inv.invoice_number,
                    "subscription_id": inv.subscription_id,
                    "forfeited_amount": str(inv.forfeited_amount),
                    "total_invoice_amount": str(inv.total_invoice_amount),
                },
            )

        return Response(_forfeiture_to_dict(inv), status=status.HTTP_200_OK)
