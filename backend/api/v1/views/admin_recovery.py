"""Defaulter recovery and guarantor API views."""
from __future__ import annotations

from datetime import date
from decimal import Decimal

from django.db.models import Count, Q, Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin

MONEY_ZERO = Decimal("0.00")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _money(v) -> Decimal:
    return Decimal(str(v or 0)).quantize(Decimal("0.01"))


def _aging_bucket(days: int) -> str:
    if days <= 30:
        return "0-30"
    if days <= 60:
        return "31-60"
    if days <= 90:
        return "61-90"
    if days <= 120:
        return "91-120"
    return "120+"


# ---------------------------------------------------------------------------
# Defaulter list — subscriptions with overdue EMIs
# ---------------------------------------------------------------------------

class AdminDefaulterListView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        from subscriptions.models import Emi, EmiStatus, Subscription, SubscriptionStatus

        today = timezone.localdate()
        bucket_filter = request.query_params.get("bucket", "")  # e.g. "31-60"

        overdue_qs = (
            Emi.objects.filter(
                status=EmiStatus.PENDING,
                due_date__lt=today,
                subscription__status__in=[
                    SubscriptionStatus.ACTIVE,
                    SubscriptionStatus.DEFAULTED,
                ],
            )
            .select_related("subscription__customer", "subscription__product")
            .values(
                "subscription_id",
                "subscription__contract_reference",
                "subscription__subscription_number",
                "subscription__customer__name",
                "subscription__customer__phone",
                "subscription__product__name",
                "subscription__plan_type",
                "subscription__status",
                "subscription__monthly_amount",
            )
            .annotate(
                overdue_count=Count("id"),
                overdue_amount=Coalesce(Sum("amount"), Value(MONEY_ZERO)),
                first_due=__import__("django").db.models.Min("due_date"),
            )
            .order_by("first_due")
        )

        rows = []
        for r in overdue_qs:
            first_due = r["first_due"]
            days = (today - first_due).days if first_due else 0
            bucket = _aging_bucket(days)

            if bucket_filter and bucket != bucket_filter:
                continue

            rows.append({
                "subscription_id": r["subscription_id"],
                "contract_ref": r["subscription__subscription_number"] or r["subscription__contract_reference"] or f"SUB-{r['subscription_id']}",
                "customer_name": r["subscription__customer__name"],
                "customer_phone": r["subscription__customer__phone"],
                "product_name": r["subscription__product__name"],
                "plan_type": r["subscription__plan_type"],
                "subscription_status": r["subscription__status"],
                "overdue_emis": r["overdue_count"],
                "overdue_amount": str(_money(r["overdue_amount"])),
                "first_overdue_date": str(first_due) if first_due else None,
                "aging_days": days,
                "aging_bucket": bucket,
            })

        # Bucket summary
        bucket_summary = {"0-30": 0, "31-60": 0, "61-90": 0, "91-120": 0, "120+": 0}
        for row in rows:
            bucket_summary[row["aging_bucket"]] = bucket_summary.get(row["aging_bucket"], 0) + 1

        return Response({
            "total": len(rows),
            "bucket_summary": bucket_summary,
            "defaulters": rows,
        })


# ---------------------------------------------------------------------------
# Recovery case CRUD
# ---------------------------------------------------------------------------

class AdminRecoveryCaseListView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        from subscriptions.models import RecoveryCase

        stage = request.query_params.get("stage", "")
        qs = RecoveryCase.objects.select_related(
            "subscription__customer", "subscription__product", "assigned_to"
        ).order_by("-first_overdue_date", "-id")

        if stage:
            qs = qs.filter(stage=stage)

        results = []
        for rc in qs[:200]:
            results.append({
                "id": rc.id,
                "subscription_id": rc.subscription_id,
                "contract_ref": rc.subscription.subscription_number or f"SUB-{rc.subscription_id}",
                "customer_name": rc.subscription.customer.name,
                "customer_phone": rc.subscription.customer.phone,
                "product_name": rc.subscription.product.name,
                "stage": rc.stage,
                "overdue_amount": str(rc.overdue_amount),
                "overdue_emis": rc.overdue_emis,
                "first_overdue_date": str(rc.first_overdue_date) if rc.first_overdue_date else None,
                "aging_days": rc.aging_days,
                "aging_bucket": rc.aging_bucket,
                "assigned_to": rc.assigned_to.get_full_name() or rc.assigned_to.username if rc.assigned_to else None,
                "notes": rc.notes,
                "last_contact_at": rc.last_contact_at.isoformat() if rc.last_contact_at else None,
            })

        return Response({"count": len(results), "results": results})

    def post(self, request):
        from subscriptions.models import Emi, EmiStatus, RecoveryCase, Subscription, SubscriptionStatus

        sub_id = request.data.get("subscription_id")
        if not sub_id:
            return Response({"detail": "subscription_id is required."}, status=400)

        try:
            sub = Subscription.objects.select_related("customer", "product").get(pk=sub_id)
        except Subscription.DoesNotExist:
            return Response({"detail": "Subscription not found."}, status=404)

        today = timezone.localdate()
        overdue_emis = Emi.objects.filter(subscription=sub, status=EmiStatus.PENDING, due_date__lt=today)
        overdue_count = overdue_emis.count()
        overdue_amount = overdue_emis.aggregate(t=Coalesce(Sum("amount"), Value(MONEY_ZERO)))["t"]
        first_due = overdue_emis.order_by("due_date").values_list("due_date", flat=True).first()

        rc, created = RecoveryCase.objects.get_or_create(
            subscription=sub,
            defaults={
                "overdue_amount": overdue_amount,
                "overdue_emis": overdue_count,
                "first_overdue_date": first_due,
                "stage": "IDENTIFIED",
            },
        )
        if not created:
            # Refresh overdue totals
            rc.overdue_amount = overdue_amount
            rc.overdue_emis = overdue_count
            if first_due:
                rc.first_overdue_date = first_due
            rc.save(update_fields=["overdue_amount", "overdue_emis", "first_overdue_date", "updated_at"])

        return Response({"created": created, "id": rc.id, "stage": rc.stage}, status=201 if created else 200)


class AdminRecoveryCaseDetailView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def _get(self, pk):
        from subscriptions.models import RecoveryCase
        try:
            return RecoveryCase.objects.select_related("subscription__customer", "subscription__product", "assigned_to").get(pk=pk)
        except RecoveryCase.DoesNotExist:
            return None

    def get(self, request, pk):
        rc = self._get(pk)
        if not rc:
            return Response({"detail": "Not found."}, status=404)
        return Response({
            "id": rc.id,
            "subscription_id": rc.subscription_id,
            "contract_ref": rc.subscription.subscription_number or f"SUB-{rc.subscription_id}",
            "customer_name": rc.subscription.customer.name,
            "customer_phone": rc.subscription.customer.phone,
            "product_name": rc.subscription.product.name,
            "stage": rc.stage,
            "overdue_amount": str(rc.overdue_amount),
            "overdue_emis": rc.overdue_emis,
            "first_overdue_date": str(rc.first_overdue_date) if rc.first_overdue_date else None,
            "aging_days": rc.aging_days,
            "aging_bucket": rc.aging_bucket,
            "assigned_to_id": rc.assigned_to_id,
            "assigned_to": rc.assigned_to.get_full_name() or rc.assigned_to.username if rc.assigned_to else None,
            "notes": rc.notes,
            "notice_sent_at": rc.notice_sent_at.isoformat() if rc.notice_sent_at else None,
            "field_visit_at": rc.field_visit_at.isoformat() if rc.field_visit_at else None,
            "legal_at": rc.legal_at.isoformat() if rc.legal_at else None,
            "settled_amount": str(rc.settled_amount),
            "settled_at": rc.settled_at.isoformat() if rc.settled_at else None,
            "last_contact_at": rc.last_contact_at.isoformat() if rc.last_contact_at else None,
        })

    def patch(self, request, pk):
        rc = self._get(pk)
        if not rc:
            return Response({"detail": "Not found."}, status=404)

        now = timezone.now()
        allowed = {"stage", "notes", "assigned_to_id", "settled_amount", "last_contact_at"}
        for field in allowed:
            if field in request.data:
                setattr(rc, field, request.data[field])

        new_stage = request.data.get("stage")
        if new_stage == "NOTICE_SENT" and not rc.notice_sent_at:
            rc.notice_sent_at = now
        if new_stage == "FIELD_VISIT" and not rc.field_visit_at:
            rc.field_visit_at = now
        if new_stage == "LEGAL" and not rc.legal_at:
            rc.legal_at = now
        if new_stage == "SETTLED" and not rc.settled_at:
            rc.settled_at = now

        rc.save()
        return self.get(request, pk)


# ---------------------------------------------------------------------------
# Guarantor CRUD
# ---------------------------------------------------------------------------

class AdminGuarantorListView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request, subscription_id):
        from subscriptions.models import SubscriptionGuarantor
        rows = SubscriptionGuarantor.objects.filter(subscription_id=subscription_id).order_by("-is_primary", "id")
        return Response([
            {
                "id": g.id,
                "name": g.name,
                "phone": g.phone,
                "relation": g.relation,
                "aadhaar_no": g.aadhaar_no,
                "address": g.address,
                "is_primary": g.is_primary,
                "notes": g.notes,
            }
            for g in rows
        ])

    def post(self, request, subscription_id):
        from subscriptions.models import Subscription, SubscriptionGuarantor
        from django.core.exceptions import ValidationError

        try:
            sub = Subscription.objects.get(pk=subscription_id)
        except Subscription.DoesNotExist:
            return Response({"detail": "Subscription not found."}, status=404)

        g = SubscriptionGuarantor(
            subscription=sub,
            name=(request.data.get("name") or "").strip(),
            phone=(request.data.get("phone") or "").strip(),
            relation=request.data.get("relation") or "OTHER",
            aadhaar_no=(request.data.get("aadhaar_no") or "").strip(),
            address=(request.data.get("address") or "").strip(),
            is_primary=bool(request.data.get("is_primary", False)),
            notes=(request.data.get("notes") or "").strip(),
        )
        try:
            g.full_clean()
            g.save()
        except ValidationError as exc:
            return Response({"detail": str(exc), "errors": exc.message_dict}, status=400)

        return Response({"id": g.id, "name": g.name, "phone": g.phone, "relation": g.relation}, status=201)


class AdminGuarantorDetailView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def patch(self, request, subscription_id, pk):
        from subscriptions.models import SubscriptionGuarantor
        from django.core.exceptions import ValidationError

        try:
            g = SubscriptionGuarantor.objects.get(pk=pk, subscription_id=subscription_id)
        except SubscriptionGuarantor.DoesNotExist:
            return Response({"detail": "Not found."}, status=404)

        for field in ("name", "phone", "relation", "aadhaar_no", "address", "is_primary", "notes"):
            if field in request.data:
                setattr(g, field, request.data[field])
        try:
            g.full_clean()
            g.save()
        except ValidationError as exc:
            return Response({"detail": str(exc)}, status=400)

        return Response({"id": g.id, "name": g.name, "phone": g.phone})

    def delete(self, request, subscription_id, pk):
        from subscriptions.models import SubscriptionGuarantor
        deleted, _ = SubscriptionGuarantor.objects.filter(pk=pk, subscription_id=subscription_id).delete()
        if not deleted:
            return Response({"detail": "Not found."}, status=404)
        return Response(status=204)


# ---------------------------------------------------------------------------
# Scheme CRUD
# ---------------------------------------------------------------------------

class AdminSchemeListView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def _serialize(self, scheme) -> dict:
        from subscriptions.models import EMIScheme
        return {
            "id": scheme.id,
            "name": scheme.name,
            "code": scheme.code,
            "plan_type": scheme.plan_type,
            "discount_type": scheme.discount_type,
            "value": str(scheme.value),
            "valid_from": str(scheme.valid_from),
            "valid_to": str(scheme.valid_to),
            "max_uses": scheme.max_uses,
            "used_count": scheme.used_count,
            "is_active": scheme.is_active,
            "is_currently_active": scheme.is_currently_active,
            "description": scheme.description,
            "applicable_products": list(scheme.applicable_products.values_list("id", flat=True)),
        }

    def get(self, request):
        from subscriptions.models import EMIScheme
        active_only = request.query_params.get("active_only") == "true"
        qs = EMIScheme.objects.all()
        if active_only:
            today = timezone.localdate()
            qs = qs.filter(is_active=True, valid_from__lte=today, valid_to__gte=today)
        return Response({"count": qs.count(), "results": [self._serialize(s) for s in qs[:100]]})

    def post(self, request):
        from subscriptions.models import EMIScheme, Product
        from django.core.exceptions import ValidationError
        from decimal import Decimal

        d = request.data
        try:
            s = EMIScheme(
                name=(d.get("name") or "").strip(),
                code=(d.get("code") or "").strip().upper(),
                plan_type=(d.get("plan_type") or "").strip(),
                discount_type=d.get("discount_type", "PERCENT"),
                value=Decimal(str(d.get("value", 0))),
                valid_from=d.get("valid_from"),
                valid_to=d.get("valid_to"),
                max_uses=d.get("max_uses") or None,
                is_active=bool(d.get("is_active", True)),
                description=(d.get("description") or "").strip(),
                created_by=request.user,
            )
            s.full_clean()
            s.save()
            product_ids = d.get("applicable_products") or []
            if product_ids:
                s.applicable_products.set(Product.objects.filter(pk__in=product_ids))
        except ValidationError as exc:
            return Response({"detail": str(exc)}, status=400)
        except Exception as exc:
            return Response({"detail": str(exc)}, status=400)

        return Response(self._serialize(s), status=201)


class AdminSchemeDetailView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def _serialize(self, scheme) -> dict:
        return {
            "id": scheme.id,
            "name": scheme.name,
            "code": scheme.code,
            "plan_type": scheme.plan_type,
            "discount_type": scheme.discount_type,
            "value": str(scheme.value),
            "valid_from": str(scheme.valid_from),
            "valid_to": str(scheme.valid_to),
            "max_uses": scheme.max_uses,
            "used_count": scheme.used_count,
            "is_active": scheme.is_active,
            "is_currently_active": scheme.is_currently_active,
            "description": scheme.description,
            "applicable_products": list(scheme.applicable_products.values_list("id", flat=True)),
        }

    def get(self, request, pk):
        from subscriptions.models import EMIScheme
        try:
            return Response(self._serialize(EMIScheme.objects.get(pk=pk)))
        except EMIScheme.DoesNotExist:
            return Response({"detail": "Not found."}, status=404)

    def patch(self, request, pk):
        from subscriptions.models import EMIScheme, Product
        from django.core.exceptions import ValidationError
        from decimal import Decimal

        try:
            s = EMIScheme.objects.get(pk=pk)
        except EMIScheme.DoesNotExist:
            return Response({"detail": "Not found."}, status=404)

        d = request.data
        for field in ("name", "plan_type", "discount_type", "valid_from", "valid_to", "is_active", "description"):
            if field in d:
                setattr(s, field, d[field])
        if "code" in d:
            s.code = (d["code"] or "").strip().upper()
        if "value" in d:
            s.value = Decimal(str(d["value"]))
        if "max_uses" in d:
            s.max_uses = d["max_uses"] or None

        try:
            s.full_clean()
            s.save()
            if "applicable_products" in d:
                s.applicable_products.set(Product.objects.filter(pk__in=(d["applicable_products"] or [])))
        except ValidationError as exc:
            return Response({"detail": str(exc)}, status=400)

        return Response(self._serialize(s))

    def delete(self, request, pk):
        from subscriptions.models import EMIScheme
        deleted, _ = EMIScheme.objects.filter(pk=pk).delete()
        if not deleted:
            return Response({"detail": "Not found."}, status=404)
        return Response(status=204)


# ---------------------------------------------------------------------------
# Staff sales targets + leaderboard
# ---------------------------------------------------------------------------

class AdminStaffTargetListView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        from crm.models import StaffSalesTarget

        year = int(request.query_params.get("year") or timezone.now().year)
        month = request.query_params.get("month")
        qs = StaffSalesTarget.objects.filter(year=year).select_related("staff")
        if month:
            qs = qs.filter(month=int(month))

        return Response([
            {
                "id": t.id,
                "staff_id": t.staff_id,
                "staff_name": t.staff.get_full_name() or t.staff.username,
                "month": t.month,
                "year": t.year,
                "target_leads": t.target_leads,
                "target_conversions": t.target_conversions,
                "target_revenue": str(t.target_revenue),
                "notes": t.notes,
            }
            for t in qs
        ])

    def post(self, request):
        from crm.models import StaffSalesTarget
        from django.core.exceptions import ValidationError
        from decimal import Decimal

        d = request.data
        staff_id = d.get("staff_id")
        if not staff_id:
            return Response({"detail": "staff_id is required."}, status=400)

        t, created = StaffSalesTarget.objects.update_or_create(
            staff_id=staff_id,
            month=int(d.get("month") or timezone.now().month),
            year=int(d.get("year") or timezone.now().year),
            defaults={
                "target_leads": int(d.get("target_leads", 0)),
                "target_conversions": int(d.get("target_conversions", 0)),
                "target_revenue": Decimal(str(d.get("target_revenue", 0))),
                "notes": (d.get("notes") or "").strip(),
            },
        )
        return Response({"id": t.id, "created": created}, status=201 if created else 200)


class AdminLeaderboardView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        from crm.models import Lead, StaffSalesTarget
        from django.db.models import Count
        from decimal import Decimal

        year = int(request.query_params.get("year") or timezone.now().year)
        month = int(request.query_params.get("month") or timezone.now().month)

        # Leads assigned this month by staff
        from django.db.models.functions import TruncMonth
        import datetime
        period_start = date(year, month, 1)
        import calendar
        period_end = date(year, month, calendar.monthrange(year, month)[1])

        lead_stats = (
            Lead.objects.filter(
                assigned_to__isnull=False,
                created_at__date__gte=period_start,
                created_at__date__lte=period_end,
            )
            .values("assigned_to", "assigned_to__username", "assigned_to__first_name", "assigned_to__last_name")
            .annotate(
                leads_assigned=Count("id"),
                leads_converted=Count("id", filter=Q(stage="CONVERTED")),
            )
            .order_by("-leads_converted", "-leads_assigned")
        )

        # Map targets
        targets_map: dict[int, StaffSalesTarget] = {
            t.staff_id: t
            for t in StaffSalesTarget.objects.filter(year=year, month=month)
        }

        rows = []
        for i, r in enumerate(lead_stats, 1):
            sid = r["assigned_to"]
            target = targets_map.get(sid)
            name = f"{r['assigned_to__first_name'] or ''} {r['assigned_to__last_name'] or ''}".strip() or r["assigned_to__username"]
            conv = r["leads_converted"]
            tgt_conv = target.target_conversions if target else 0
            rows.append({
                "rank": i,
                "staff_id": sid,
                "staff_name": name,
                "leads_assigned": r["leads_assigned"],
                "leads_converted": conv,
                "target_conversions": tgt_conv,
                "conversion_rate": round(conv / r["leads_assigned"] * 100, 1) if r["leads_assigned"] else 0,
                "target_hit": conv >= tgt_conv if tgt_conv else None,
                "target_revenue": str(target.target_revenue) if target else None,
            })

        return Response({
            "period": {"year": year, "month": month},
            "leaderboard": rows,
        })
