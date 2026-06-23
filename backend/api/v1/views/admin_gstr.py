"""GSTR-1 / GSTR-3B export report view."""
from __future__ import annotations

import csv
import io
from datetime import date
from decimal import Decimal

from django.db.models import Q, Sum, Value
from django.db.models.functions import Coalesce
from django.http import HttpResponse
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin

MONEY_ZERO = Decimal("0.00")

POSTED_STATUSES = {"POSTED", "APPROVED"}


def _parse_date(val: str | None) -> date | None:
    if not val:
        return None
    try:
        return date.fromisoformat(val)
    except (ValueError, TypeError):
        return None


def _money(v) -> Decimal:
    return Decimal(str(v or 0)).quantize(Decimal("0.01"))


def _build_gstr_data(date_from: date | None, date_to: date | None) -> dict:
    """Build B2B, B2CS and HSN summary from BillingInvoice + DirectSale lines."""
    from billing.models import BillingInvoiceLine, DirectSaleLine

    today = timezone.localdate()
    df = date_from or date(today.year, 1, 1)
    dt = date_to or today

    # ── BillingInvoice lines (EMI / service invoices) ──────────────────────
    inv_lines = (
        BillingInvoiceLine.objects.filter(
            invoice__status__in=POSTED_STATUSES,
            invoice__invoice_date__gte=df,
            invoice__invoice_date__lte=dt,
            invoice__tax_mode="GST",
        )
        .select_related("invoice")
        .values(
            "invoice__document_no",
            "invoice__invoice_date",
            "invoice__customer_name_snapshot",
            "invoice__customer_gstin",
            "invoice__place_of_supply_state_code",
            "description",
            "hsn_sac_code",
            "gst_rate",
            "taxable_value",
            "cgst_amount",
            "sgst_amount",
            "igst_amount",
            "line_total",
        )
    )

    # ── DirectSale lines ────────────────────────────────────────────────────
    ds_lines = (
        DirectSaleLine.objects.filter(
            direct_sale__status__in={"CONFIRMED", "DELIVERED", "INVOICED"},
            direct_sale__invoice_date__gte=df,
            direct_sale__invoice_date__lte=dt,
        )
        .select_related("direct_sale")
        .values(
            "direct_sale__invoice_no",
            "direct_sale__invoice_date",
            "direct_sale__customer_name",
            "direct_sale__customer_gstin",
            "direct_sale__place_of_supply",
            "product_name",
            "hsn_sac_code",
            "gst_rate",
            "taxable_value",
            "cgst_amount",
            "sgst_amount",
            "igst_amount",
            "line_total",
        )
    )

    # ── Normalise into uniform dicts ────────────────────────────────────────
    def _norm_inv(r: dict) -> dict:
        return {
            "doc_no": r["invoice__document_no"] or "",
            "doc_date": str(r["invoice__invoice_date"]),
            "customer_name": r["invoice__customer_name_snapshot"] or "",
            "customer_gstin": (r["invoice__customer_gstin"] or "").upper(),
            "pos": r["invoice__place_of_supply_state_code"] or "",
            "description": r["description"] or "",
            "hsn": (r["hsn_sac_code"] or "").upper(),
            "gst_rate": _money(r["gst_rate"]),
            "taxable_value": _money(r["taxable_value"]),
            "cgst": _money(r["cgst_amount"]),
            "sgst": _money(r["sgst_amount"]),
            "igst": _money(r["igst_amount"]),
            "line_total": _money(r["line_total"]),
        }

    def _norm_ds(r: dict) -> dict:
        return {
            "doc_no": r["direct_sale__invoice_no"] or "",
            "doc_date": str(r["direct_sale__invoice_date"]),
            "customer_name": r["direct_sale__customer_name"] or "",
            "customer_gstin": (r["direct_sale__customer_gstin"] or "").upper(),
            "pos": r["direct_sale__place_of_supply"] or "",
            "description": r["product_name"] or "",
            "hsn": (r["hsn_sac_code"] or "").upper(),
            "gst_rate": _money(r["gst_rate"]),
            "taxable_value": _money(r["taxable_value"]),
            "cgst": _money(r["cgst_amount"]),
            "sgst": _money(r["sgst_amount"]),
            "igst": _money(r["igst_amount"]),
            "line_total": _money(r["line_total"]),
        }

    all_lines: list[dict] = [_norm_inv(r) for r in inv_lines] + [_norm_ds(r) for r in ds_lines]

    # ── B2B (customers with GSTIN) ──────────────────────────────────────────
    b2b: dict[str, dict] = {}
    b2cs_taxable = MONEY_ZERO
    b2cs_cgst = MONEY_ZERO
    b2cs_sgst = MONEY_ZERO
    b2cs_igst = MONEY_ZERO

    hsn_map: dict[str, dict] = {}

    for row in all_lines:
        gstin = row["customer_gstin"]
        # B2B vs B2CS
        if gstin and len(gstin) == 15:
            key = (row["doc_no"], gstin)
            if key not in b2b:
                b2b[key] = {
                    "doc_no": row["doc_no"],
                    "doc_date": row["doc_date"],
                    "customer_name": row["customer_name"],
                    "customer_gstin": gstin,
                    "pos": row["pos"],
                    "taxable_value": MONEY_ZERO,
                    "cgst": MONEY_ZERO,
                    "sgst": MONEY_ZERO,
                    "igst": MONEY_ZERO,
                    "invoice_value": MONEY_ZERO,
                }
            b2b[key]["taxable_value"] += row["taxable_value"]
            b2b[key]["cgst"] += row["cgst"]
            b2b[key]["sgst"] += row["sgst"]
            b2b[key]["igst"] += row["igst"]
            b2b[key]["invoice_value"] += row["line_total"]
        else:
            b2cs_taxable += row["taxable_value"]
            b2cs_cgst += row["cgst"]
            b2cs_sgst += row["sgst"]
            b2cs_igst += row["igst"]

        # HSN summary
        hsn = row["hsn"] or "UNCLASSIFIED"
        if hsn not in hsn_map:
            hsn_map[hsn] = {
                "hsn": hsn,
                "rate": row["gst_rate"],
                "taxable_value": MONEY_ZERO,
                "cgst": MONEY_ZERO,
                "sgst": MONEY_ZERO,
                "igst": MONEY_ZERO,
                "total_tax": MONEY_ZERO,
            }
        hsn_map[hsn]["taxable_value"] += row["taxable_value"]
        hsn_map[hsn]["cgst"] += row["cgst"]
        hsn_map[hsn]["sgst"] += row["sgst"]
        hsn_map[hsn]["igst"] += row["igst"]
        hsn_map[hsn]["total_tax"] += row["cgst"] + row["sgst"] + row["igst"]

    b2b_list = sorted(b2b.values(), key=lambda r: r["doc_date"], reverse=True)
    hsn_list = sorted(hsn_map.values(), key=lambda r: r["taxable_value"], reverse=True)

    total_taxable = sum(r["taxable_value"] for r in all_lines)
    total_cgst = sum(r["cgst"] for r in all_lines)
    total_sgst = sum(r["sgst"] for r in all_lines)
    total_igst = sum(r["igst"] for r in all_lines)
    total_tax = total_cgst + total_sgst + total_igst

    return {
        "period": {"from": str(df), "to": str(dt)},
        "summary": {
            "total_invoices": len(set(r["doc_no"] for r in all_lines if r["doc_no"])),
            "total_taxable_value": str(total_taxable),
            "total_cgst": str(total_cgst),
            "total_sgst": str(total_sgst),
            "total_igst": str(total_igst),
            "total_tax": str(total_tax),
            "grand_total": str(total_taxable + total_tax),
            "b2b_invoices": len(b2b_list),
            "b2cs_total": str(b2cs_taxable + b2cs_cgst + b2cs_sgst + b2cs_igst),
        },
        "b2b": [
            {**r, "taxable_value": str(r["taxable_value"]), "cgst": str(r["cgst"]),
             "sgst": str(r["sgst"]), "igst": str(r["igst"]), "invoice_value": str(r["invoice_value"])}
            for r in b2b_list
        ],
        "b2cs": {
            "taxable_value": str(b2cs_taxable),
            "cgst": str(b2cs_cgst),
            "sgst": str(b2cs_sgst),
            "igst": str(b2cs_igst),
            "total": str(b2cs_taxable + b2cs_cgst + b2cs_sgst + b2cs_igst),
        },
        "hsn_summary": [
            {**r, "rate": str(r["rate"]), "taxable_value": str(r["taxable_value"]),
             "cgst": str(r["cgst"]), "sgst": str(r["sgst"]),
             "igst": str(r["igst"]), "total_tax": str(r["total_tax"])}
            for r in hsn_list
        ],
    }


class AdminGstrReportView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        date_from = _parse_date(request.query_params.get("date_from"))
        date_to = _parse_date(request.query_params.get("date_to"))
        export = request.query_params.get("export") == "csv"

        data = _build_gstr_data(date_from, date_to)

        if export:
            return self._csv_response(data)
        return Response(data)

    def _csv_response(self, data: dict) -> HttpResponse:
        buf = io.StringIO()
        writer = csv.writer(buf)

        # B2B section
        writer.writerow(["=== B2B INVOICES ==="])
        writer.writerow(["Invoice No", "Date", "Customer", "GSTIN", "POS", "Taxable Value", "CGST", "SGST", "IGST", "Invoice Value"])
        for row in data["b2b"]:
            writer.writerow([
                row["doc_no"], row["doc_date"], row["customer_name"], row["customer_gstin"],
                row["pos"], row["taxable_value"], row["cgst"], row["sgst"], row["igst"], row["invoice_value"],
            ])

        writer.writerow([])
        writer.writerow(["=== B2CS SUMMARY ==="])
        b = data["b2cs"]
        writer.writerow(["Taxable Value", "CGST", "SGST", "IGST", "Total"])
        writer.writerow([b["taxable_value"], b["cgst"], b["sgst"], b["igst"], b["total"]])

        writer.writerow([])
        writer.writerow(["=== HSN SUMMARY ==="])
        writer.writerow(["HSN/SAC", "GST Rate %", "Taxable Value", "CGST", "SGST", "IGST", "Total Tax"])
        for row in data["hsn_summary"]:
            writer.writerow([row["hsn"], row["rate"], row["taxable_value"], row["cgst"], row["sgst"], row["igst"], row["total_tax"]])

        writer.writerow([])
        s = data["summary"]
        writer.writerow(["=== TOTALS ==="])
        writer.writerow(["Period", f"{data['period']['from']} to {data['period']['to']}"])
        writer.writerow(["Total Taxable", s["total_taxable_value"]])
        writer.writerow(["Total CGST", s["total_cgst"]])
        writer.writerow(["Total SGST", s["total_sgst"]])
        writer.writerow(["Total IGST", s["total_igst"]])
        writer.writerow(["Total Tax", s["total_tax"]])
        writer.writerow(["Grand Total", s["grand_total"]])

        buf.seek(0)
        filename = f"GSTR_{data['period']['from']}_{data['period']['to']}.csv"
        response = HttpResponse(buf.getvalue(), content_type="text/csv")
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response
