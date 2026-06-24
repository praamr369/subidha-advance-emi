"""GSTR-1 / GSTR-3B export report and GSTR-2B ITC reconciliation views."""
from __future__ import annotations

import csv
import io
from datetime import date
from decimal import Decimal, InvalidOperation

from django.db.models import Q, Sum, Value
from django.db.models.functions import Coalesce
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import status
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


def _dec(v, default=Decimal("0.00")) -> Decimal:
    try:
        return Decimal(str(v or 0)).quantize(Decimal("0.01"))
    except (InvalidOperation, TypeError):
        return default


class AdminGstr2bReconcileView(APIView):
    """POST /admin/gstr/2b-reconcile/

    Accept a simplified GSTR-2B B2B invoice list and reconcile against
    our purchase TaxInvoice records.

    Expected body:
        {
          "b2b": [
            {
              "supplier_gstin": "27AADCM0804K1ZH",
              "invoice_no": "INV-001",
              "invoice_date": "2024-01-02",
              "taxable_value": 100000,
              "cgst": 9000,
              "sgst": 9000,
              "igst": 0
            }
          ]
        }

    Also accepts the raw GSTN portal format via the "gstn_raw" key:
        {
          "gstn_raw": {
            "b2b": [{"ctin": "...", "inv": [...]}]
          }
        }
    """

    permission_classes = [IsAuthenticated, IsAdmin]

    def post(self, request):
        from accounting.models import TaxInvoice

        data = request.data or {}

        # Parse input — simplified format or GSTN raw format
        b2b_input: list[dict] = []
        if "b2b" in data:
            b2b_input = list(data["b2b"])
        elif "gstn_raw" in data:
            raw = data["gstn_raw"] or {}
            for supplier_block in raw.get("b2b", []):
                gstin = (supplier_block.get("ctin") or "").strip().upper()
                for inv in supplier_block.get("inv", []):
                    items = inv.get("items", [])
                    cgst_total = sum(_dec(item.get("itm_det", {}).get("cgst", 0)) for item in items)
                    sgst_total = sum(_dec(item.get("itm_det", {}).get("sgst", 0)) for item in items)
                    igst_total = sum(_dec(item.get("itm_det", {}).get("igst", 0)) for item in items)
                    txval_total = sum(_dec(item.get("itm_det", {}).get("txval", 0)) for item in items)
                    b2b_input.append({
                        "supplier_gstin": gstin,
                        "invoice_no": (inv.get("inum") or "").strip().upper(),
                        "invoice_date": (inv.get("dt") or ""),
                        "taxable_value": str(txval_total),
                        "cgst": str(cgst_total),
                        "sgst": str(sgst_total),
                        "igst": str(igst_total),
                    })

        if not b2b_input:
            return Response(
                {"detail": "No B2B records found. Provide 'b2b' list or 'gstn_raw' object."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Normalise 2B records: key = (supplier_gstin, invoice_no_upper)
        b2b_map: dict[tuple, dict] = {}
        for rec in b2b_input:
            gstin = (rec.get("supplier_gstin") or "").strip().upper()
            inv_no = (rec.get("invoice_no") or "").strip().upper()
            if not gstin or not inv_no:
                continue
            b2b_map[(gstin, inv_no)] = {
                "supplier_gstin": gstin,
                "invoice_no": inv_no,
                "invoice_date": rec.get("invoice_date") or "",
                "taxable_value_2b": str(_dec(rec.get("taxable_value", 0))),
                "cgst_2b": str(_dec(rec.get("cgst", 0))),
                "sgst_2b": str(_dec(rec.get("sgst", 0))),
                "igst_2b": str(_dec(rec.get("igst", 0))),
            }

        # Fetch matching TaxInvoice records from books
        all_gstins = [g for g, _ in b2b_map.keys()]
        all_inv_nos = [i for _, i in b2b_map.keys()]
        qs = TaxInvoice.objects.filter(
            supplier_gstin__in=all_gstins,
            invoice_no__in=all_inv_nos,
        ).only(
            "id", "invoice_no", "invoice_date",
            "supplier_gstin", "supplier_name",
            "subtotal_taxable", "cgst_amount", "sgst_amount", "igst_amount",
        )
        books_map: dict[tuple, TaxInvoice] = {
            (obj.supplier_gstin.upper(), (obj.invoice_no or "").upper()): obj
            for obj in qs
        }

        matched = []
        unmatched_in_2b = []

        for key, rec in b2b_map.items():
            book = books_map.get(key)
            if book is None:
                unmatched_in_2b.append({
                    **rec,
                    "match_status": "NOT_IN_BOOKS",
                    "note": "Invoice found in GSTR-2B but not in purchase records.",
                })
            else:
                cgst_diff = _dec(rec["cgst_2b"]) - _dec(book.cgst_amount)
                sgst_diff = _dec(rec["sgst_2b"]) - _dec(book.sgst_amount)
                igst_diff = _dec(rec["igst_2b"]) - _dec(book.igst_amount)
                taxable_diff = _dec(rec["taxable_value_2b"]) - _dec(book.subtotal_taxable)
                has_discrepancy = any(
                    abs(d) >= Decimal("0.50")
                    for d in (cgst_diff, sgst_diff, igst_diff, taxable_diff)
                )
                matched.append({
                    **rec,
                    "tax_invoice_id": book.id,
                    "supplier_name": book.supplier_name,
                    "invoice_date_books": str(book.invoice_date),
                    "taxable_value_books": str(_dec(book.subtotal_taxable)),
                    "cgst_books": str(_dec(book.cgst_amount)),
                    "sgst_books": str(_dec(book.sgst_amount)),
                    "igst_books": str(_dec(book.igst_amount)),
                    "taxable_diff": str(taxable_diff),
                    "cgst_diff": str(cgst_diff),
                    "sgst_diff": str(sgst_diff),
                    "igst_diff": str(igst_diff),
                    "match_status": "DISCREPANCY" if has_discrepancy else "MATCHED",
                })

        # Invoices in books but not in 2B
        b2b_keys = set(b2b_map.keys())
        unmatched_in_books = [
            {
                "tax_invoice_id": obj.id,
                "supplier_gstin": obj.supplier_gstin,
                "supplier_name": obj.supplier_name,
                "invoice_no": obj.invoice_no or "",
                "invoice_date_books": str(obj.invoice_date),
                "taxable_value_books": str(_dec(obj.subtotal_taxable)),
                "cgst_books": str(_dec(obj.cgst_amount)),
                "sgst_books": str(_dec(obj.sgst_amount)),
                "igst_books": str(_dec(obj.igst_amount)),
                "match_status": "NOT_IN_2B",
                "note": "Invoice in purchase records but not in GSTR-2B.",
            }
            for key, obj in books_map.items()
            if key not in b2b_keys
        ]

        summary = {
            "total_in_2b": len(b2b_map),
            "matched": sum(1 for r in matched if r["match_status"] == "MATCHED"),
            "discrepancies": sum(1 for r in matched if r["match_status"] == "DISCREPANCY"),
            "not_in_books": len(unmatched_in_2b),
            "not_in_2b": len(unmatched_in_books),
        }

        return Response({
            "summary": summary,
            "matched": matched,
            "not_in_books": unmatched_in_2b,
            "not_in_2b": unmatched_in_books,
        })
