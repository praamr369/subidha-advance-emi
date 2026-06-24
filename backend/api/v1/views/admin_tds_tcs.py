"""TDS / TCS compliance views — record, list, and mark-deposited."""
from __future__ import annotations

from decimal import Decimal, InvalidOperation

from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin


def _money(v) -> Decimal:
    try:
        return Decimal(str(v or 0)).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError):
        return Decimal("0.00")


def _fy(date) -> str:
    """Return financial year string e.g. '2025-26'."""
    d = date or timezone.localdate()
    y = d.year
    return f"{y}-{str(y + 1)[-2:]}" if d.month >= 4 else f"{y - 1}-{str(y)[-2:]}"


def _quarter(date) -> str:
    """Return Q1–Q4 for Indian FY."""
    m = (date or timezone.localdate()).month
    if m in (4, 5, 6):
        return "Q1"
    if m in (7, 8, 9):
        return "Q2"
    if m in (10, 11, 12):
        return "Q3"
    return "Q4"


def _tds_row(d) -> dict:
    return {
        "id": d.id,
        "vendor_id": d.vendor_id,
        "vendor_name": d.vendor.name if d.vendor_id else None,
        "section": d.section,
        "transaction_date": str(d.transaction_date),
        "gross_amount": str(d.gross_amount),
        "tds_rate": str(d.tds_rate),
        "tds_amount": str(d.tds_amount),
        "net_amount": str(d.net_amount),
        "reference_no": d.reference_no,
        "challan_no": d.challan_no,
        "deposit_date": str(d.deposit_date) if d.deposit_date else None,
        "status": d.status,
        "financial_year": d.financial_year,
        "quarter": d.quarter,
        "notes": d.notes,
        "created_at": d.created_at.isoformat(),
    }


def _tcs_row(c) -> dict:
    return {
        "id": c.id,
        "customer_name": c.customer_name,
        "customer_pan": c.customer_pan,
        "section": c.section,
        "transaction_date": str(c.transaction_date),
        "sale_amount": str(c.sale_amount),
        "tcs_rate": str(c.tcs_rate),
        "tcs_amount": str(c.tcs_amount),
        "reference_no": c.reference_no,
        "challan_no": c.challan_no,
        "deposit_date": str(c.deposit_date) if c.deposit_date else None,
        "status": c.status,
        "financial_year": c.financial_year,
        "quarter": c.quarter,
        "notes": c.notes,
        "created_at": c.created_at.isoformat(),
    }


# ─────────────────────────────────────────────────────────────────────────────
# TDS views
# ─────────────────────────────────────────────────────────────────────────────

class AdminTDSDeductionListView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        from accounting.models import TDSDeduction
        qs = TDSDeduction.objects.select_related("vendor").order_by("-transaction_date", "-id")
        fy = request.query_params.get("fy", "")
        qtr = request.query_params.get("quarter", "")
        status = request.query_params.get("status", "")
        if fy:
            qs = qs.filter(financial_year=fy)
        if qtr:
            qs = qs.filter(quarter=qtr)
        if status:
            qs = qs.filter(status=status)
        results = [_tds_row(d) for d in qs[:500]]
        totals = {
            "gross": str(sum(_money(r["gross_amount"]) for r in results)),
            "tds": str(sum(_money(r["tds_amount"]) for r in results)),
        }
        return Response({"count": len(results), "totals": totals, "results": results})

    def post(self, request):
        from accounting.models import TDSDeduction, TDSDeductionStatus
        from accounting.models import Vendor

        vendor_id = request.data.get("vendor_id")
        if not vendor_id:
            return Response({"detail": "vendor_id is required."}, status=400)
        try:
            vendor = Vendor.objects.get(pk=vendor_id)
        except Vendor.DoesNotExist:
            return Response({"detail": "Vendor not found."}, status=404)

        try:
            gross = Decimal(str(request.data.get("gross_amount", 0)))
            rate = Decimal(str(request.data.get("tds_rate", 0)))
            if gross <= 0 or rate <= 0:
                raise ValueError
        except (InvalidOperation, ValueError):
            return Response({"detail": "Valid gross_amount and tds_rate are required."}, status=400)

        tds = (gross * rate / Decimal("100")).quantize(Decimal("0.01"))
        net = gross - tds

        tx_date_raw = request.data.get("transaction_date")
        try:
            from datetime import date
            tx_date = date.fromisoformat(str(tx_date_raw))
        except (TypeError, ValueError):
            tx_date = timezone.localdate()

        d = TDSDeduction(
            vendor=vendor,
            section=request.data.get("section", "OTHER"),
            transaction_date=tx_date,
            gross_amount=gross,
            tds_rate=rate,
            tds_amount=tds,
            net_amount=net,
            reference_no=(request.data.get("reference_no") or "").strip(),
            challan_no=(request.data.get("challan_no") or "").strip(),
            status=TDSDeductionStatus.PENDING,
            financial_year=_fy(tx_date),
            quarter=_quarter(tx_date),
            notes=(request.data.get("notes") or "").strip(),
            recorded_by=request.user,
        )
        d.save()
        return Response(_tds_row(d), status=201)


class AdminTDSDeductionMarkDepositedView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def post(self, request, pk):
        from accounting.models import TDSDeduction, TDSDeductionStatus
        try:
            d = TDSDeduction.objects.get(pk=pk)
        except TDSDeduction.DoesNotExist:
            return Response({"detail": "Not found."}, status=404)

        challan = (request.data.get("challan_no") or "").strip()
        deposit_raw = request.data.get("deposit_date")
        try:
            from datetime import date
            deposit_date = date.fromisoformat(str(deposit_raw)) if deposit_raw else timezone.localdate()
        except (TypeError, ValueError):
            deposit_date = timezone.localdate()

        d.challan_no = challan or d.challan_no
        d.deposit_date = deposit_date
        d.status = TDSDeductionStatus.DEPOSITED
        d.save(update_fields=["challan_no", "deposit_date", "status", "updated_at"])
        return Response(_tds_row(d))


# ─────────────────────────────────────────────────────────────────────────────
# TCS views
# ─────────────────────────────────────────────────────────────────────────────

class AdminTCSCollectionListView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        from accounting.models import TCSCollection
        qs = TCSCollection.objects.order_by("-transaction_date", "-id")
        fy = request.query_params.get("fy", "")
        qtr = request.query_params.get("quarter", "")
        status = request.query_params.get("status", "")
        if fy:
            qs = qs.filter(financial_year=fy)
        if qtr:
            qs = qs.filter(quarter=qtr)
        if status:
            qs = qs.filter(status=status)
        results = [_tcs_row(c) for c in qs[:500]]
        totals = {
            "sale": str(sum(_money(r["sale_amount"]) for r in results)),
            "tcs": str(sum(_money(r["tcs_amount"]) for r in results)),
        }
        return Response({"count": len(results), "totals": totals, "results": results})

    def post(self, request):
        from accounting.models import TCSCollection, TCSCollectionStatus
        from datetime import date

        cust_name = (request.data.get("customer_name") or "").strip()
        if not cust_name:
            return Response({"detail": "customer_name is required."}, status=400)

        try:
            sale = Decimal(str(request.data.get("sale_amount", 0)))
            rate = Decimal(str(request.data.get("tcs_rate", 0)))
            if sale <= 0 or rate <= 0:
                raise ValueError
        except (InvalidOperation, ValueError):
            return Response({"detail": "Valid sale_amount and tcs_rate are required."}, status=400)

        tcs = (sale * rate / Decimal("100")).quantize(Decimal("0.01"))

        tx_date_raw = request.data.get("transaction_date")
        try:
            tx_date = date.fromisoformat(str(tx_date_raw))
        except (TypeError, ValueError):
            tx_date = timezone.localdate()

        c = TCSCollection(
            customer_name=cust_name,
            customer_pan=(request.data.get("customer_pan") or "").strip().upper(),
            section=request.data.get("section", "OTHER"),
            transaction_date=tx_date,
            sale_amount=sale,
            tcs_rate=rate,
            tcs_amount=tcs,
            reference_no=(request.data.get("reference_no") or "").strip(),
            challan_no=(request.data.get("challan_no") or "").strip(),
            status=TCSCollectionStatus.PENDING,
            financial_year=_fy(tx_date),
            quarter=_quarter(tx_date),
            notes=(request.data.get("notes") or "").strip(),
            recorded_by=request.user,
        )
        c.save()
        return Response(_tcs_row(c), status=201)


class AdminTCSCollectionMarkDepositedView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def post(self, request, pk):
        from accounting.models import TCSCollection, TCSCollectionStatus
        try:
            c = TCSCollection.objects.get(pk=pk)
        except TCSCollection.DoesNotExist:
            return Response({"detail": "Not found."}, status=404)

        challan = (request.data.get("challan_no") or "").strip()
        deposit_raw = request.data.get("deposit_date")
        try:
            from datetime import date
            deposit_date = date.fromisoformat(str(deposit_raw)) if deposit_raw else timezone.localdate()
        except (TypeError, ValueError):
            deposit_date = timezone.localdate()

        c.challan_no = challan or c.challan_no
        c.deposit_date = deposit_date
        c.status = TCSCollectionStatus.DEPOSITED
        c.save(update_fields=["challan_no", "deposit_date", "status", "updated_at"])
        return Response(_tcs_row(c))


# ─────────────────────────────────────────────────────────────────────────────
# Statutory deduction calculator — generate PF/ESI/PT lines for a salary sheet
# ─────────────────────────────────────────────────────────────────────────────

class AdminSalarySheetStatutoryView(APIView):
    """Preview statutory deductions (PF/ESI/PT) for a salary sheet, then apply."""
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request, sheet_id):
        from accounting.models import SalarySheet
        try:
            sheet = SalarySheet.objects.select_related("employee").get(pk=sheet_id)
        except SalarySheet.DoesNotExist:
            return Response({"detail": "Salary sheet not found."}, status=404)

        emp = sheet.employee
        gross = sheet.gross_amount or Decimal("0")
        lines = _compute_statutory(emp, gross)
        return Response({"sheet_id": sheet_id, "employee": emp.name, "gross": str(gross), "statutory_lines": lines})

    def post(self, request, sheet_id):
        """Append statutory deduction lines to the salary sheet (idempotent — skips existing)."""
        from accounting.models import SalarySheet, SalarySheetLine
        try:
            sheet = SalarySheet.objects.select_related("employee").get(pk=sheet_id)
        except SalarySheet.DoesNotExist:
            return Response({"detail": "Salary sheet not found."}, status=404)

        if sheet.status not in ("DRAFT",):
            return Response({"detail": "Statutory lines can only be added to DRAFT salary sheets."}, status=400)

        emp = sheet.employee
        gross = sheet.gross_amount or Decimal("0")
        lines = _compute_statutory(emp, gross)

        existing_labels = set(
            SalarySheetLine.objects.filter(salary_sheet=sheet).values_list("component_name", flat=True)
        )

        added = []
        total_deduction = Decimal("0")
        for line in lines:
            if line["component_name"] in existing_labels:
                continue
            SalarySheetLine.objects.create(
                salary_sheet=sheet,
                component_name=line["component_name"],
                component_type="DEDUCTION",
                source_type="STATUTORY",
                amount=Decimal(str(line["amount"])),
                notes=line.get("notes", ""),
            )
            total_deduction += Decimal(str(line["amount"]))
            added.append(line["component_name"])

        sheet.deductions_amount = (sheet.deductions_amount or Decimal("0")) + total_deduction
        sheet.net_amount = (sheet.gross_amount or Decimal("0")) - sheet.deductions_amount
        sheet.save(update_fields=["deductions_amount", "net_amount", "updated_at"])

        return Response({"added": added, "total_deduction": str(total_deduction)})


def _compute_statutory(emp, gross: Decimal) -> list[dict]:
    lines = []
    PF_RATE = Decimal("12.00")
    ESI_EMP_RATE = Decimal("0.75")

    if emp.pf_eligible and gross > 0:
        # PF on capped basic (₹15,000 statutory wage ceiling)
        pf_wage = min(gross, Decimal("15000"))
        pf_amt = (pf_wage * PF_RATE / 100).quantize(Decimal("0.01"))
        lines.append({"component_name": "PF (Employee 12%)", "amount": str(pf_amt), "notes": f"PF {PF_RATE}% on ₹{pf_wage}"})

    if emp.esi_eligible and Decimal("0") < gross <= Decimal("21000"):
        esi_amt = (gross * ESI_EMP_RATE / 100).quantize(Decimal("0.01"))
        lines.append({"component_name": "ESI (Employee 0.75%)", "amount": str(esi_amt), "notes": f"ESI {ESI_EMP_RATE}% on ₹{gross}"})

    if emp.pt_eligible:
        pt = emp.pt_monthly_amount or Decimal("200")
        lines.append({"component_name": "Professional Tax", "amount": str(pt), "notes": "Monthly PT as per state slab"})

    return lines
