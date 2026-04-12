# Generated manually for additive branch rollout on 2026-04-10

from django.db import migrations


def seed_primary_branch_and_backfill(apps, schema_editor):
    Branch = apps.get_model("branch_control", "Branch")
    FinanceAccount = apps.get_model("accounting", "FinanceAccount")
    EmployeeProfile = apps.get_model("accounting", "EmployeeProfile")
    ExpenseVoucher = apps.get_model("accounting", "ExpenseVoucher")
    SalaryPayment = apps.get_model("accounting", "SalaryPayment")
    EmployeeExpenseClaim = apps.get_model("accounting", "EmployeeExpenseClaim")
    EmployeeExpenseClaimPayment = apps.get_model("accounting", "EmployeeExpenseClaimPayment")
    VendorSettlement = apps.get_model("accounting", "VendorSettlement")
    StockLocation = apps.get_model("inventory", "StockLocation")
    PurchaseBill = apps.get_model("inventory", "PurchaseBill")
    Subscription = apps.get_model("subscriptions", "Subscription")
    Payment = apps.get_model("subscriptions", "Payment")
    DirectSale = apps.get_model("billing", "DirectSale")
    BillingInvoice = apps.get_model("billing", "BillingInvoice")
    ReceiptDocument = apps.get_model("billing", "ReceiptDocument")

    primary_branch = Branch.objects.filter(is_primary=True).order_by("id").first()
    if primary_branch is None:
        existing_branch = Branch.objects.order_by("id").first()
        if existing_branch is not None:
            existing_branch.is_primary = True
            existing_branch.save(update_fields=["is_primary"])
            primary_branch = existing_branch
        else:
            primary_branch = Branch.objects.create(
                code="MAIN",
                name="Main Branch",
                status="ACTIVE",
                is_primary=True,
                notes="Auto-created during additive branch-control rollout.",
            )

    FinanceAccount.objects.filter(branch__isnull=True).update(branch=primary_branch)
    StockLocation.objects.filter(branch__isnull=True).update(branch=primary_branch)
    Subscription.objects.filter(branch__isnull=True).update(branch=primary_branch)
    EmployeeProfile.objects.filter(branch__isnull=True).update(branch=primary_branch)
    ExpenseVoucher.objects.filter(branch__isnull=True).update(branch=primary_branch)

    for purchase_bill in PurchaseBill.objects.filter(branch__isnull=True).select_related(
        "stock_location",
        "finance_account",
    ):
        purchase_bill.branch_id = (
            getattr(purchase_bill.stock_location, "branch_id", None)
            or getattr(purchase_bill.finance_account, "branch_id", None)
            or primary_branch.id
        )
        purchase_bill.save(update_fields=["branch"])

    for payment in Payment.objects.filter(branch__isnull=True).select_related(
        "subscription",
        "cash_counter",
    ):
        payment.branch_id = (
            getattr(payment.cash_counter, "branch_id", None)
            or getattr(payment.subscription, "branch_id", None)
            or primary_branch.id
        )
        payment.save(update_fields=["branch"])

    for direct_sale in DirectSale.objects.filter(branch__isnull=True).select_related(
        "cash_counter",
        "finance_account",
    ):
        direct_sale.branch_id = (
            getattr(direct_sale.cash_counter, "branch_id", None)
            or getattr(direct_sale.finance_account, "branch_id", None)
            or primary_branch.id
        )
        direct_sale.save(update_fields=["branch"])

    for invoice in BillingInvoice.objects.filter(branch__isnull=True).select_related(
        "direct_sale",
        "subscription",
        "finance_account",
    ):
        invoice.branch_id = (
            getattr(invoice.direct_sale, "branch_id", None)
            or getattr(invoice.subscription, "branch_id", None)
            or getattr(invoice.finance_account, "branch_id", None)
            or primary_branch.id
        )
        invoice.save(update_fields=["branch"])

    for receipt in ReceiptDocument.objects.filter(branch__isnull=True).select_related(
        "billing_invoice",
        "direct_sale",
        "payment",
        "finance_account",
        "cash_counter",
    ):
        receipt.branch_id = (
            getattr(receipt.cash_counter, "branch_id", None)
            or getattr(receipt.payment, "branch_id", None)
            or getattr(receipt.direct_sale, "branch_id", None)
            or getattr(receipt.billing_invoice, "branch_id", None)
            or getattr(receipt.finance_account, "branch_id", None)
            or primary_branch.id
        )
        receipt.save(update_fields=["branch"])

    for salary_payment in SalaryPayment.objects.filter(branch__isnull=True).select_related(
        "salary_sheet",
        "salary_sheet__employee",
        "finance_account",
    ):
        salary_payment.branch_id = (
            getattr(salary_payment.finance_account, "branch_id", None)
            or getattr(getattr(salary_payment.salary_sheet, "employee", None), "branch_id", None)
            or primary_branch.id
        )
        salary_payment.save(update_fields=["branch"])

    for claim in EmployeeExpenseClaim.objects.filter(branch__isnull=True).select_related(
        "employee",
    ):
        claim.branch_id = (
            getattr(claim.employee, "branch_id", None)
            or primary_branch.id
        )
        claim.save(update_fields=["branch"])

    for claim_payment in EmployeeExpenseClaimPayment.objects.filter(branch__isnull=True).select_related(
        "expense_claim",
        "expense_claim__employee",
        "finance_account",
    ):
        claim_payment.branch_id = (
            getattr(claim_payment.finance_account, "branch_id", None)
            or getattr(getattr(claim_payment.expense_claim, "employee", None), "branch_id", None)
            or primary_branch.id
        )
        claim_payment.save(update_fields=["branch"])

    for settlement in VendorSettlement.objects.filter(branch__isnull=True).select_related(
        "finance_account",
        "purchase_bill",
    ):
        settlement.branch_id = (
            getattr(settlement.finance_account, "branch_id", None)
            or getattr(settlement.purchase_bill, "branch_id", None)
            or primary_branch.id
        )
        settlement.save(update_fields=["branch"])


class Migration(migrations.Migration):

    dependencies = [
        ("branch_control", "0001_initial"),
        ("accounting", "0010_employeeexpenseclaim_branch_and_more"),
        ("inventory", "0006_purchasebill_branch_stocklocation_branch_and_more"),
        ("subscriptions", "0041_payment_branch_payment_cash_counter_and_more"),
        ("billing", "0005_billinginvoice_branch_directsale_branch_and_more"),
    ]

    operations = [
        migrations.RunPython(
            seed_primary_branch_and_backfill,
            migrations.RunPython.noop,
        ),
    ]
