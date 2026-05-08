from __future__ import annotations

from django.db import transaction
from rest_framework import permissions
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User, UserRole
from api.v1.permissions import IsAdmin
from api.v1.serializers.account_links import AccountLinkMutateSerializer
from crm.models import PartyMaster
from subscriptions.models import AuditLog, Customer
from subscriptions.services.audit_service import log_audit


def _linked_user_payload(user: User | None) -> dict | None:
    if user is None:
        return None
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "phone": user.phone,
        "role": user.role,
        "is_active": bool(user.is_active),
        "last_login": user.last_login,
    }


class _AdminBase(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]


class AdminCustomerAccountLinkView(_AdminBase):
    def get(self, request, pk: int):
        customer = Customer.objects.select_related("user").get(pk=pk)
        return Response({"entity_type": "customer", "entity_id": customer.id, "linked_user": _linked_user_payload(customer.user)})

    @transaction.atomic
    def post(self, request, pk: int):
        return self._upsert(request, pk=pk)

    @transaction.atomic
    def patch(self, request, pk: int):
        return self._upsert(request, pk=pk)

    @transaction.atomic
    def delete(self, request, pk: int):
        serializer = AccountLinkMutateSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        customer = Customer.objects.select_related("user").select_for_update(of=("self",)).get(pk=pk)
        old_user = customer.user
        customer.user = None
        customer.save(update_fields=["user"])
        log_audit(
            action_type=AuditLog.ActionType.USER_UPDATED,
            instance=customer,
            performed_by=request.user,
            metadata={"event": "CUSTOMER_ACCOUNT_UNLINKED", "old_user_id": getattr(old_user, "id", None), "new_user_id": None, "reason": serializer.validated_data["reason"]},
        )
        return Response({"entity_type": "customer", "entity_id": customer.id, "linked_user": None})

    def _upsert(self, request, *, pk: int):
        serializer = AccountLinkMutateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        customer = Customer.objects.select_related("user").select_for_update(of=("self",)).get(pk=pk)
        user_id = serializer.validated_data.get("user_id")
        if not user_id:
            raise ValidationError({"user_id": "user_id is required for link/change."})
        target_user = User.objects.filter(pk=user_id).first()
        if target_user is None:
            raise ValidationError({"user_id": "User not found."})
        duplicate_customer = Customer.objects.filter(user=target_user).exclude(pk=customer.pk).first()
        if duplicate_customer is not None:
            raise ValidationError({"user_id": "User is already linked to another customer."})
        old_user = customer.user
        customer.user = target_user
        customer.save(update_fields=["user"])
        if serializer.validated_data.get("disable_portal_access"):
            target_user.is_active = False
            target_user.save(update_fields=["is_active"])
        log_audit(
            action_type=AuditLog.ActionType.USER_UPDATED,
            instance=customer,
            performed_by=request.user,
            metadata={"event": "CUSTOMER_ACCOUNT_LINK_UPDATED", "old_user_id": getattr(old_user, "id", None), "new_user_id": target_user.id, "reason": serializer.validated_data["reason"]},
        )
        return Response({"entity_type": "customer", "entity_id": customer.id, "linked_user": _linked_user_payload(target_user)})


class AdminPartnerAccountLinkView(_AdminBase):
    def get(self, request, pk: int):
        partner = User.objects.filter(pk=pk, role=UserRole.PARTNER).first()
        if partner is None:
            raise ValidationError({"detail": "Partner not found."})
        return Response({"entity_type": "partner", "entity_id": partner.id, "linked_user": _linked_user_payload(partner)})

    @transaction.atomic
    def post(self, request, pk: int):
        return self._change(request, pk=pk)

    @transaction.atomic
    def patch(self, request, pk: int):
        return self._change(request, pk=pk)

    @transaction.atomic
    def delete(self, request, pk: int):
        serializer = AccountLinkMutateSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        partner = User.objects.filter(pk=pk, role=UserRole.PARTNER).select_for_update().first()
        if partner is None:
            raise ValidationError({"detail": "Partner not found."})
        if serializer.validated_data.get("disable_portal_access", True):
            partner.is_active = False
            partner.save(update_fields=["is_active"])
        log_audit(
            action_type=AuditLog.ActionType.USER_DEACTIVATED,
            instance=partner,
            performed_by=request.user,
            metadata={"event": "PARTNER_PORTAL_ACCESS_DISABLED", "partner_user_id": partner.id, "reason": serializer.validated_data["reason"]},
        )
        return Response({"entity_type": "partner", "entity_id": partner.id, "linked_user": _linked_user_payload(partner)})

    def _change(self, request, *, pk: int):
        serializer = AccountLinkMutateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        partner = User.objects.filter(pk=pk, role=UserRole.PARTNER).select_for_update().first()
        if partner is None:
            raise ValidationError({"detail": "Partner not found."})
        user_id = serializer.validated_data.get("user_id")
        if not user_id:
            raise ValidationError({"user_id": "user_id is required for partner account change."})
        target_user = User.objects.filter(pk=user_id, role=UserRole.PARTNER).first()
        if target_user is None:
            raise ValidationError({"user_id": "Partner user not found."})
        log_audit(
            action_type=AuditLog.ActionType.USER_UPDATED,
            instance=partner,
            performed_by=request.user,
            metadata={"event": "PARTNER_ACCOUNT_LINK_UPDATED", "old_user_id": partner.id, "new_user_id": target_user.id, "reason": serializer.validated_data["reason"]},
        )
        return Response({"entity_type": "partner", "entity_id": partner.id, "linked_user": _linked_user_payload(target_user)})


class AdminPartyAccountLinkView(_AdminBase):
    def get(self, request, pk: int):
        party = PartyMaster.objects.get(pk=pk)
        user_id = int((party.notes_summary or "").split("linked_user_id:")[-1]) if "linked_user_id:" in (party.notes_summary or "") else None
        user = User.objects.filter(pk=user_id).first() if user_id else None
        return Response({"entity_type": "party", "entity_id": party.id, "linked_user": _linked_user_payload(user)})

    @transaction.atomic
    def post(self, request, pk: int):
        return self._upsert(request, pk=pk)

    @transaction.atomic
    def patch(self, request, pk: int):
        return self._upsert(request, pk=pk)

    @transaction.atomic
    def delete(self, request, pk: int):
        serializer = AccountLinkMutateSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        party = PartyMaster.objects.select_for_update(of=("self",)).get(pk=pk)
        old_note = party.notes_summary or ""
        cleaned = "\n".join(line for line in old_note.splitlines() if not line.startswith("linked_user_id:")).strip()
        party.notes_summary = cleaned
        party.save(update_fields=["notes_summary"])
        log_audit(
            action_type=AuditLog.ActionType.CRM_PARTY_LINKED,
            instance=party,
            performed_by=request.user,
            metadata={"event": "PARTY_ACCOUNT_UNLINKED", "reason": serializer.validated_data["reason"]},
        )
        return Response({"entity_type": "party", "entity_id": party.id, "linked_user": None})

    def _upsert(self, request, *, pk: int):
        serializer = AccountLinkMutateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        party = PartyMaster.objects.select_for_update(of=("self",)).get(pk=pk)
        user_id = serializer.validated_data.get("user_id")
        if not user_id:
            raise ValidationError({"user_id": "user_id is required for link/change."})
        user = User.objects.filter(pk=user_id).first()
        if user is None:
            raise ValidationError({"user_id": "User not found."})
        note_lines = [line for line in (party.notes_summary or "").splitlines() if line and not line.startswith("linked_user_id:")]
        note_lines.append(f"linked_user_id:{user.id}")
        party.notes_summary = "\n".join(note_lines)
        party.save(update_fields=["notes_summary"])
        if serializer.validated_data.get("disable_portal_access"):
            user.is_active = False
            user.save(update_fields=["is_active"])
        log_audit(
            action_type=AuditLog.ActionType.CRM_PARTY_LINKED,
            instance=party,
            performed_by=request.user,
            metadata={"event": "PARTY_ACCOUNT_LINK_UPDATED", "new_user_id": user.id, "reason": serializer.validated_data["reason"]},
        )
        return Response({"entity_type": "party", "entity_id": party.id, "linked_user": _linked_user_payload(user)})
