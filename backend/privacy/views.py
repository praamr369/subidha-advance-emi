"""Customer-facing DPDP 2023 privacy endpoints.

The privacy app has held models since 2026-07-10 but never had an HTTP layer,
so every page in the customer privacy section has been calling 404s since the
day after. This is that missing layer.

Scope is deliberately the customer's own rights under DPDP: see what consent
was given, withdraw it, request a copy of their data, raise a grievance, and
see when their data was accessed. Admin-side breach and retention tooling is a
separate surface with a different permission model and is not included here.

Every view resolves the customer from request.user and filters to that
customer. A privacy endpoint that could return another person's consent record
would be the exact harm the module exists to prevent, so the scoping is done
once, in _customer_or_404, rather than per view.
"""
from __future__ import annotations

from datetime import timedelta

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from privacy.models import (
    BreachStatus,
    ConsentAction,
    ConsentEvent,
    ConsentStatus,
    CookieConsent,
    CustomerConsent,
    DataAccessLog,
    DataAccessRequest,
    DataBreachLog,
    DataRequestStatus,
    DataRequestType,
    DPOGrievance,
    PrivacyPreference,
)
from privacy.serializers import (
    AdminDataBreachCreateSerializer,
    AdminDataBreachSerializer,
    AdminDPOGrievanceSerializer,
    ConsentGrantSerializer,
    GrievanceResolveSerializer,
    ConsentWithdrawSerializer,
    CookieConsentSerializer,
    CookieConsentWriteSerializer,
    CustomerConsentSerializer,
    DataAccessLogSerializer,
    DataAccessRequestCreateSerializer,
    DataAccessRequestSerializer,
    DPOGrievanceCreateSerializer,
    DPOGrievanceSerializer,
    PrivacyPreferenceSerializer,
)

# Statutory response windows, per the comments on the model fields.
# Named rather than inlined so a compliance review can find and check them.
DATA_REQUEST_RESPONSE_DAYS = 30      # DPDP 2023: respond to a data request
GRIEVANCE_STAGE_1_DAYS = 30          # DPDP 2023: first-stage redressal
GRIEVANCE_STAGE_2_DAYS = 14          # escalation window after stage 1
COOKIE_CONSENT_VALID_DAYS = 365


def _customer_or_404(request):
    """The customer profile behind the request, or 404.

    404 rather than 403: a signed-in user with no customer profile has no
    privacy record to show, and saying so is not a permissions question.
    """
    customer = getattr(request.user, "customer_profile", None)
    if customer is None:
        from rest_framework.exceptions import NotFound

        raise NotFound("No customer profile is associated with this account.")
    return customer


def _record_consent_event(*, customer, consent_type, action, request, consent=None):
    """Append to the consent evidence trail.

    Called on every decision that changes consent. CustomerConsent holds only
    the current state — see ConsentEvent's docstring — so this is the only
    record that can answer "what did they agree to, and when" after the fact.

    Deliberately inside the same transaction as the state change: an evidence
    trail with gaps where the write failed is worse than none, because the gaps
    are invisible.
    """
    ConsentEvent.objects.create(
        customer=customer,
        consent_type=consent_type,
        action=action,
        purpose_text=(getattr(consent, "purpose_text", "") or ""),
        notice_version=(getattr(consent, "notice_version", "") or ""),
        language_code=(getattr(consent, "language_code", "") or ""),
        occurred_at=timezone.now(),
        source_ip=_client_ip(request),
        given_via="CUSTOMER_PORTAL",
    )


def _client_ip(request) -> str:
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if forwarded:
        return forwarded.split(",")[0].strip()[:45]
    return (request.META.get("REMOTE_ADDR") or "")[:45]


class ConsentListView(APIView):
    """Every consent decision on record for this customer."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        customer = _customer_or_404(request)
        consents = CustomerConsent.objects.filter(customer=customer).order_by(
            "consent_type", "-created_at"
        )
        return Response(CustomerConsentSerializer(consents, many=True).data)


class ConsentGrantView(APIView):
    """Record consent for one purpose.

    CustomerConsent is unique_together on (customer, consent_type), so it holds
    only the current decision and re-granting overwrites it. The evidence DPDP
    2023 expects — what was agreed, when, against which notice version — lives
    in ConsentEvent, which this appends to in the same transaction.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        customer = _customer_or_404(request)
        payload = ConsentGrantSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data

        # Current state is updated in place; the evidence is appended.
        with transaction.atomic():
            consent, created = CustomerConsent.objects.update_or_create(
                customer=customer,
                consent_type=data["consent_type"],
                defaults={
                    "status": ConsentStatus.GIVEN,
                    "purpose_text": data.get("purpose_text") or "",
                    "notice_version": data.get("notice_version") or "",
                    "language_code": data.get("language_code") or "en",
                    "given_at": timezone.now(),
                    "given_by_ip": _client_ip(request),
                    "given_via": "CUSTOMER_PORTAL",
                    # Re-granting clears the previous withdrawal.
                    "withdrawn_at": None,
                },
            )
            _record_consent_event(
                customer=customer,
                consent_type=data["consent_type"],
                action=ConsentAction.GRANTED,
                request=request,
                consent=consent,
            )

        return Response(
            CustomerConsentSerializer(consent).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class ConsentWithdrawView(APIView):
    """Withdraw by consent type."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        customer = _customer_or_404(request)
        payload = ConsentWithdrawSerializer(data=request.data)
        payload.is_valid(raise_exception=True)

        # Atomic with its event: a withdrawal recorded in state but missing
        # from the trail is an invisible gap in the evidence.
        with transaction.atomic():
            updated = CustomerConsent.objects.filter(
                customer=customer,
                consent_type=payload.validated_data["consent_type"],
                status=ConsentStatus.GIVEN,
            ).update(status=ConsentStatus.WITHDRAWN, withdrawn_at=timezone.now())

            if updated:
                _record_consent_event(
                    customer=customer,
                    consent_type=payload.validated_data["consent_type"],
                    action=ConsentAction.WITHDRAWN,
                    request=request,
                )

        # Withdrawing something never granted is not an error from the
        # customer's side — the end state they asked for is the end state.
        # No event is recorded in that case: nothing changed, so there is
        # nothing to evidence.
        return Response({"withdrawn": updated})


class ConsentWithdrawByIdView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, consent_id: int):
        customer = _customer_or_404(request)
        consent = get_object_or_404(
            CustomerConsent, pk=consent_id, customer=customer
        )

        if consent.status == ConsentStatus.GIVEN:
            consent.status = ConsentStatus.WITHDRAWN
            consent.withdrawn_at = timezone.now()
            consent.save(update_fields=["status", "withdrawn_at", "updated_at"])
            _record_consent_event(
                customer=customer,
                consent_type=consent.consent_type,
                action=ConsentAction.WITHDRAWN,
                request=request,
                consent=consent,
            )

        return Response(CustomerConsentSerializer(consent).data)


class CookieConsentView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        customer = _customer_or_404(request)
        record = (
            CookieConsent.objects.filter(customer=customer)
            .order_by("-consent_given_at", "-id")
            .first()
        )
        if record is None:
            # No stored preference yet. Report the lawful default rather than
            # 404 — essential only, nothing else assumed.
            return Response(
                {
                    "essential_allowed": True,
                    "analytics_allowed": False,
                    "marketing_allowed": False,
                    "third_party_allowed": False,
                    "consent_given_at": None,
                    "expires_at": None,
                }
            )
        return Response(CookieConsentSerializer(record).data)

    def post(self, request):
        customer = _customer_or_404(request)
        payload = CookieConsentWriteSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        now = timezone.now()

        # session_id is unique on the model, so a session gets one row that is
        # updated on each change. An authenticated portal request may have no
        # session key at all (token auth), and an empty string would collide
        # across customers — fall back to a per-customer identifier instead.
        session_key = request.session.session_key or f"customer-{customer.pk}"

        record, created = CookieConsent.objects.update_or_create(
            session_id=session_key[:100],
            defaults={
                "customer": customer,
                "essential_allowed": True,
                "analytics_allowed": payload.validated_data["analytics_allowed"],
                "marketing_allowed": payload.validated_data["marketing_allowed"],
                "third_party_allowed": payload.validated_data["third_party_allowed"],
                "consent_given_at": now,
                "expires_at": now + timedelta(days=COOKIE_CONSENT_VALID_DAYS),
                "ip_address": _client_ip(request),
                "user_agent": request.META.get("HTTP_USER_AGENT", "")[:500],
            },
        )
        return Response(
            CookieConsentSerializer(record).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class DataAccessRequestView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        customer = _customer_or_404(request)
        requests = DataAccessRequest.objects.filter(customer=customer).order_by(
            "-requested_at"
        )
        return Response(DataAccessRequestSerializer(requests, many=True).data)

    def post(self, request):
        customer = _customer_or_404(request)
        payload = DataAccessRequestCreateSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        now = timezone.now()

        record = DataAccessRequest.objects.create(
            customer=customer,
            request_type=payload.validated_data["request_type"],
            description=payload.validated_data.get("description") or "",
            status=DataRequestStatus.RECEIVED,
            requested_at=now,
            due_date=now + timedelta(days=DATA_REQUEST_RESPONSE_DAYS),
            response_format=payload.validated_data.get("response_format") or "",
        )
        return Response(
            DataAccessRequestSerializer(record).data, status=status.HTTP_201_CREATED
        )


class DataExportView(APIView):
    """Ask for a copy of your data.

    Recorded as an INFORMATION request rather than served inline: assembling a
    customer's data spans a dozen modules and is reviewed before release, so
    this opens the statutory clock instead of pretending to answer instantly.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        customer = _customer_or_404(request)
        now = timezone.now()
        record = DataAccessRequest.objects.create(
            customer=customer,
            request_type=DataRequestType.INFORMATION,
            description="Data export requested from the customer privacy portal.",
            status=DataRequestStatus.RECEIVED,
            requested_at=now,
            due_date=now + timedelta(days=DATA_REQUEST_RESPONSE_DAYS),
            response_format=str(request.data.get("format") or "")[:50],
        )
        return Response(
            DataAccessRequestSerializer(record).data, status=status.HTTP_201_CREATED
        )


class GrievanceView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        customer = _customer_or_404(request)
        grievances = DPOGrievance.objects.filter(customer=customer).order_by("-filed_at")
        return Response(DPOGrievanceSerializer(grievances, many=True).data)

    def post(self, request):
        customer = _customer_or_404(request)
        payload = DPOGrievanceCreateSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        now = timezone.now()
        stage_1_due = now + timedelta(days=GRIEVANCE_STAGE_1_DAYS)

        record = DPOGrievance.objects.create(
            customer=customer,
            grievance_type=payload.validated_data["grievance_type"],
            title=payload.validated_data["title"],
            description=payload.validated_data["description"],
            filed_at=now,
            stage_1_due=stage_1_due,
            stage_2_due=stage_1_due + timedelta(days=GRIEVANCE_STAGE_2_DAYS),
        )
        return Response(
            DPOGrievanceSerializer(record).data, status=status.HTTP_201_CREATED
        )


class CommunicationPreferencesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        customer = _customer_or_404(request)
        prefs, _ = PrivacyPreference.objects.get_or_create(customer=customer)
        return Response(PrivacyPreferenceSerializer(prefs).data)

    def patch(self, request):
        customer = _customer_or_404(request)
        prefs, _ = PrivacyPreference.objects.get_or_create(customer=customer)
        serializer = PrivacyPreferenceSerializer(prefs, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def post(self, request):
        # The portal sends POST; treat it as the same partial update rather
        # than making the page's verb choice a compatibility problem.
        return self.patch(request)


class PrivacyAuditLogView(APIView):
    """When this customer's data was accessed, and why."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        customer = _customer_or_404(request)
        try:
            limit = min(int(request.query_params.get("limit", 50)), 200)
            offset = max(int(request.query_params.get("offset", 0)), 0)
        except (TypeError, ValueError):
            limit, offset = 50, 0

        queryset = DataAccessLog.objects.filter(customer=customer).order_by(
            "-accessed_at"
        )
        total = queryset.count()
        rows = queryset[offset : offset + limit]
        return Response(
            {
                "count": total,
                "results": DataAccessLogSerializer(rows, many=True).data,
            }
        )


class PrivacyDashboardSummaryView(APIView):
    """Counts behind the customer's privacy landing page."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        customer = _customer_or_404(request)
        now = timezone.now()

        open_requests = DataAccessRequest.objects.filter(customer=customer).exclude(
            status__in=[DataRequestStatus.COMPLETED, DataRequestStatus.REJECTED]
        )
        open_grievances = DPOGrievance.objects.filter(customer=customer).exclude(
            status="RESOLVED"
        )

        return Response(
            {
                "active_consents": CustomerConsent.objects.filter(
                    customer=customer, status=ConsentStatus.GIVEN
                ).count(),
                "withdrawn_consents": CustomerConsent.objects.filter(
                    customer=customer, status=ConsentStatus.WITHDRAWN
                ).count(),
                "open_data_requests": open_requests.count(),
                "overdue_data_requests": open_requests.filter(due_date__lt=now).count(),
                "open_grievances": open_grievances.count(),
                "data_access_events": DataAccessLog.objects.filter(
                    customer=customer
                ).count(),
            }
        )


# ===========================================================================
# Admin / back-office
#
# Everything above is the customer's half. It shipped first, which left the
# system able to *accept* a grievance or a breach report and unable to answer
# one: staff had no screen and no endpoint. These are the other half.
#
# Two admin pages exist per concept (breaches/breach-notifications,
# data-retention/retention-schedule) using different URL conventions. Both
# 404'd, so neither is established. Each concept is implemented once here and
# mounted at both paths rather than built twice — see routes/privacy.py.
# ===========================================================================


def _audit(action_type, *, performed_by, model_name, object_id, metadata=None):
    """Record a back-office action against the shared audit trail.

    Privacy actions are exactly the ones a regulator asks to see evidence of,
    so these writes are not optional decoration. They are deliberately inside
    the caller's transaction: an action that happened without an audit row, or
    an audit row for an action that rolled back, are both worse than failing.
    """
    from subscriptions.models import AuditLog

    AuditLog.objects.create(
        action_type=action_type,
        performed_by=performed_by,
        model_name=model_name,
        object_id=str(object_id),
        metadata=metadata or {},
    )


class AdminGrievanceListView(APIView):
    """The DPO queue: every grievance, newest first.

    Unlike the customer view this is not filtered to one customer, so it is
    admin-only — the permission class is the whole access control here.
    """

    permission_classes = [IsAdmin]

    def get(self, request):
        grievances = (
            DPOGrievance.objects.select_related("customer", "assigned_to_dpo")
            .all()
            .order_by("-filed_at")
        )
        return Response(AdminDPOGrievanceSerializer(grievances, many=True).data)


class AdminGrievanceResolveView(APIView):
    permission_classes = [IsAdmin]

    @transaction.atomic
    def post(self, request, grievance_id):
        grievance = get_object_or_404(DPOGrievance, pk=grievance_id)

        if grievance.status == "RESOLVED":
            # Not an error worth 400-ing a queue over, but it must not
            # overwrite the original resolution or move resolved_at — the
            # first resolution is the one with statutory meaning.
            return Response(
                AdminDPOGrievanceSerializer(grievance).data, status=status.HTTP_200_OK
            )

        payload = GrievanceResolveSerializer(data=request.data)
        payload.is_valid(raise_exception=True)

        now = timezone.now()
        grievance.status = "RESOLVED"
        grievance.resolution_notes = payload.validated_data["resolution_notes"]
        grievance.resolved_at = now
        if grievance.stage_1_completed_at is None:
            grievance.stage_1_completed_at = now
        if grievance.assigned_to_dpo is None:
            grievance.assigned_to_dpo = request.user
        grievance.save(
            update_fields=[
                "status",
                "resolution_notes",
                "resolved_at",
                "stage_1_completed_at",
                "assigned_to_dpo",
                "updated_at",
            ]
        )

        _audit(
            "PRIVACY_GRIEVANCE_RESOLVED",
            performed_by=request.user,
            model_name="DPOGrievance",
            object_id=grievance.pk,
            metadata={
                "grievance_type": grievance.grievance_type,
                # Whether the statutory deadline was met is the fact a
                # regulator asks about; deriving it later from timestamps
                # relies on the deadline never having been edited.
                "within_stage_1_deadline": bool(
                    grievance.stage_1_due and now <= grievance.stage_1_due
                ),
            },
        )
        return Response(AdminDPOGrievanceSerializer(grievance).data)


# Action name -> (new status, timestamp field it stamps).
# Hyphenated because that is what the admin page sends.
BREACH_ACTIONS = {
    "investigate": (BreachStatus.INVESTIGATING, None),
    "notify-board": (BreachStatus.NOTIFIED_BOARD, "board_notified_at"),
    "notify-principals": (BreachStatus.NOTIFIED_PRINCIPALS, "notified_at"),
    "close": (BreachStatus.CLOSED, "closed_at"),
}


class AdminDataBreachListView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        breaches = DataBreachLog.objects.all().order_by("-discovered_at")
        return Response(AdminDataBreachSerializer(breaches, many=True).data)

    @transaction.atomic
    def post(self, request):
        payload = AdminDataBreachCreateSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data

        breach = DataBreachLog.objects.create(
            title=data["title"],
            breach_description=data["description"],
            severity=data["severity"],
            affected_customer_count=data["affected_records"],
            data_types_affected=data.get("data_types_affected") or [],
            # A breach with no stated discovery time defaults to now. The
            # statutory clock runs from discovery, so this is the earliest
            # defensible value, never a backdated one.
            discovered_at=data.get("discovered_at") or timezone.now(),
            status=BreachStatus.REPORTED,
        )
        _audit(
            "PRIVACY_BREACH_REPORTED",
            performed_by=request.user,
            model_name="DataBreachLog",
            object_id=breach.pk,
            metadata={
                "severity": breach.severity,
                "affected_customer_count": breach.affected_customer_count,
            },
        )
        return Response(
            AdminDataBreachSerializer(breach).data, status=status.HTTP_201_CREATED
        )


class AdminDataBreachActionView(APIView):
    """Advance a breach through the DPDP response sequence.

    Deliberately not a strict state machine. A breach can be notified to the
    Board before or after the principals depending on severity and what is
    known, and refusing a legitimate ordering would leave staff unable to
    record what actually happened. What it does refuse is an unknown action,
    and it never un-stamps a timestamp that is already set — the first
    notification is the one that counts for the statutory clock.
    """

    permission_classes = [IsAdmin]

    @transaction.atomic
    def post(self, request, breach_id, action):
        if action not in BREACH_ACTIONS:
            return Response(
                {
                    "detail": "Unknown action '{}'.".format(action),
                    "allowed": sorted(BREACH_ACTIONS),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        breach = get_object_or_404(DataBreachLog, pk=breach_id)
        new_status, stamp_field = BREACH_ACTIONS[action]

        breach.status = new_status
        updated = ["status", "updated_at"]
        if stamp_field and getattr(breach, stamp_field) is None:
            setattr(breach, stamp_field, timezone.now())
            updated.append(stamp_field)
        if action == "notify-board" and not breach.authority_notified:
            breach.authority_notified = True
            updated.append("authority_notified")
        breach.save(update_fields=updated)

        _audit(
            "PRIVACY_BREACH_" + action.replace("-", "_").upper(),
            performed_by=request.user,
            model_name="DataBreachLog",
            object_id=breach.pk,
            metadata={"severity": breach.severity, "new_status": breach.status},
        )
        return Response(AdminDataBreachSerializer(breach).data)


class AdminDataBreachNotifyView(AdminDataBreachActionView):
    """Alias for the older admin page, which posts to `{id}/notify/`.

    That page predates the board/principal split and means "notify the
    principals". Mapped explicitly rather than guessed at the URL layer.
    """

    def post(self, request, breach_id):
        return super().post(request, breach_id, "notify-principals")
