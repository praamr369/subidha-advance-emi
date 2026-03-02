from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from decimal import Decimal
from datetime import date

from subscriptions.services.ledger_service import (
    emi_ledger,
    subscription_summary,
)


def generate_subscription_statement_pdf(subscription, file_path):
    """
    Generates a customer statement PDF for one subscription.
    """
    c = canvas.Canvas(file_path, pagesize=A4)
    width, height = A4

    y = height - 20 * mm

    # =========================
    # HEADER
    # =========================
    c.setFont("Helvetica-Bold", 14)
    c.drawString(20 * mm, y, "SUBIDHA FURNITURE")
    y -= 6 * mm

    c.setFont("Helvetica", 10)
    c.drawString(20 * mm, y, "Lucky Plan EMI Statement")
    y -= 10 * mm

    # =========================
    # CUSTOMER DETAILS
    # =========================
    customer = subscription.customer
    c.setFont("Helvetica-Bold", 10)
    c.drawString(20 * mm, y, "Customer Details")
    y -= 5 * mm

    c.setFont("Helvetica", 9)
    c.drawString(20 * mm, y, f"Name: {customer.name}")
    y -= 4 * mm
    c.drawString(20 * mm, y, f"Phone: {customer.phone}")
    y -= 6 * mm

    # =========================
    # SUBSCRIPTION DETAILS
    # =========================
    c.setFont("Helvetica-Bold", 10)
    c.drawString(20 * mm, y, "Subscription Details")
    y -= 5 * mm

    c.setFont("Helvetica", 9)
    c.drawString(20 * mm, y, f"Product: {subscription.product.name}")
    y -= 4 * mm
    c.drawString(20 * mm, y, f"Plan Type: {subscription.plan_type}")
    y -= 4 * mm
    c.drawString(20 * mm, y, f"Tenure: {subscription.tenure_months} months")
    y -= 6 * mm

    # =========================
    # FINANCIAL SUMMARY
    # =========================
    summary = subscription_summary(subscription)

    c.setFont("Helvetica-Bold", 10)
    c.drawString(20 * mm, y, "Financial Summary")
    y -= 5 * mm

    c.setFont("Helvetica", 9)
    c.drawString(20 * mm, y, f"Total Amount: ₹{summary['total_due']}")
    y -= 4 * mm
    c.drawString(20 * mm, y, f"Paid: ₹{summary['paid']}")
    y -= 4 * mm
    c.drawString(20 * mm, y, f"Waived: ₹{summary['waived']}")
    y -= 4 * mm
    c.drawString(20 * mm, y, f"Balance: ₹{summary['balance']}")
    y -= 8 * mm

    # =========================
    # EMI LEDGER TABLE
    # =========================
    c.setFont("Helvetica-Bold", 10)
    c.drawString(20 * mm, y, "EMI Ledger")
    y -= 6 * mm

    c.setFont("Helvetica-Bold", 8)
    c.drawString(20 * mm, y, "Month")
    c.drawString(35 * mm, y, "Due Date")
    c.drawString(60 * mm, y, "Amount")
    c.drawString(80 * mm, y, "Paid")
    c.drawString(100 * mm, y, "Balance")
    c.drawString(125 * mm, y, "Status")
    y -= 4 * mm

    c.setFont("Helvetica", 8)
    for row in emi_ledger(subscription):
        c.drawString(20 * mm, y, str(row["month"]))
        c.drawString(35 * mm, y, str(row["due_date"]))
        c.drawString(60 * mm, y, f"₹{row['amount']}")
        c.drawString(80 * mm, y, f"₹{row['paid']}")
        c.drawString(100 * mm, y, f"₹{row['balance']}")
        c.drawString(125 * mm, y, row["status"])
        y -= 4 * mm

        if y < 20 * mm:
            c.showPage()
            y = height - 20 * mm

    # =========================
    # FOOTER
    # =========================
    c.setFont("Helvetica", 7)
    c.drawString(
        20 * mm,
        15 * mm,
        f"Generated on {date.today()} | This is a system-generated statement.",
    )

    c.save()