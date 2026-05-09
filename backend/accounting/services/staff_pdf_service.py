from __future__ import annotations

from io import BytesIO

from django.utils import timezone

from subscriptions.services.pdf_branding_service import (
    draw_brand_header_footer,
    get_branding_context,
)


def _mask_phone(value: str | None) -> str:
    raw = (value or "").strip()
    if len(raw) < 4:
        return raw or "N/A"
    return f"{'*' * max(0, len(raw) - 4)}{raw[-4:]}"


def _draw_header(*, canvas, width, height, margin_x, document_no: str, title: str) -> str:
    generated_at = timezone.now().strftime("%d %b %Y %H:%M")
    draw_brand_header_footer(
        canvas=canvas,
        width=width,
        height=height,
        margin_x=margin_x,
        branding=get_branding_context(),
        document_no=document_no,
        generated_at=generated_at,
    )
    canvas.setTitle(f"{title} {document_no}")
    return generated_at


def render_staff_profile_pdf(*, employee) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas

    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4, pageCompression=0)
    width, height = A4
    mx = 16 * mm
    cy = height - (52 * mm)

    document_no = employee.employee_code or f"EMP-{employee.id}"
    generated_at = _draw_header(
        canvas=c,
        width=width,
        height=height,
        margin_x=mx,
        document_no=document_no,
        title="Staff Profile",
    )

    def line(text: str, size: int = 10, lead: float = 13.5):
        nonlocal cy
        c.setFont("Helvetica", size)
        c.drawString(mx, cy, text)
        cy -= lead

    line("STAFF PROFILE", size=13, lead=17)
    line(f"Employee Code: {document_no}")
    line(f"Name: {employee.name}")
    line(f"Phone (masked): {_mask_phone(employee.phone)}")
    line(f"Designation: {employee.designation or 'N/A'}")
    line(f"Department: {employee.department or 'N/A'}")
    line(f"Employment Type: {employee.employment_type}")
    line(f"Joining Date: {employee.joining_date}")
    line(f"Branch: {getattr(getattr(employee, 'branch', None), 'name', None) or 'N/A'}")
    line(f"KYC Type/No: {employee.kyc_id_type or 'N/A'} / {employee.kyc_id_number or 'N/A'}")
    line(f"KYC Verified: {'YES' if employee.kyc_verified else 'NO'}")
    line(f"Address: {employee.address or 'N/A'}")
    line(f"Payroll Expense Account: {getattr(getattr(employee, 'payroll_expense_account', None), 'code', None) or 'N/A'}")
    line(f"Generated Timestamp: {generated_at}", size=9)

    c.showPage()
    c.save()
    data = buf.getvalue()
    buf.close()
    return data


def render_salary_agreement_pdf(*, employee) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas

    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4, pageCompression=0)
    width, height = A4
    mx = 16 * mm
    cy = height - (52 * mm)

    document_no = f"SAL-{employee.employee_code or employee.id}"
    generated_at = _draw_header(
        canvas=c,
        width=width,
        height=height,
        margin_x=mx,
        document_no=document_no,
        title="Salary Agreement",
    )

    def line(text: str, size: int = 10, lead: float = 13.5):
        nonlocal cy
        c.setFont("Helvetica", size)
        c.drawString(mx, cy, text)
        cy -= lead

    line("SALARY AGREEMENT SNAPSHOT", size=13, lead=17)
    line(f"Employee: {employee.name} ({employee.employee_code})")
    line(f"Employment Type: {employee.employment_type}")
    line(f"Base Salary: INR {float(employee.base_salary or 0):.2f}")
    line(f"Daily Wage Rate: INR {float(employee.daily_wage_rate or 0):.2f}")
    line(f"Hourly Wage Rate: INR {float(employee.hourly_wage_rate or 0):.2f}")
    line(f"Piece Rate Amount: INR {float(employee.piece_rate_amount or 0):.2f}")
    line(f"Piece Rate Unit: {employee.piece_rate_unit_label or 'N/A'}")
    line(f"Overtime Rate / Hour: INR {float(employee.overtime_rate_per_hour or 0):.2f}")
    line(f"Cost Center: {employee.cost_center_code or 'N/A'}")
    line(f"Salary Effective From: {employee.salary_effective_from or 'N/A'}")
    line("Note: This document is a payroll reference only; it does not post accounting entries.", size=9)
    line(f"Generated Timestamp: {generated_at}", size=9)

    c.showPage()
    c.save()
    data = buf.getvalue()
    buf.close()
    return data
