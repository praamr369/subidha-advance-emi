import uuid
from decimal import Decimal
from django.db import transaction
from django.db.models import Sum, Q, F
from django.utils import timezone
from accounting.models import (
    FinanceAccount,
    SalarySheet,
    SalarySheetStatus,
    PayrollPeriod,
    PayrollPeriodStatus,
    ExpenseVoucher,
    ExpenseVoucherStatus,
    EmployeeExpenseClaim,
    ExpenseClaimStatus,
    VendorSettlement,
    VendorSettlementStatus,
    JournalEntry,
    UnifiedPayableIdempotency,
    UnifiedPayableIdempotencyStatus,
)
from subscriptions.models import AuditLog, CommissionPayoutBatch
from subscriptions.services.audit_service import log_audit

def get_unified_payables(payable_type=None, search=None, status_category=None, party_type=None, party_id=None):
    """Aggregate every outgoing payable into one normalized queue.

    ``party_type`` + ``party_id`` scope the queue to a single party for the
    per-profile payout panels:
      * EMPLOYEE -> salary + expense_claim for that employee
      * VENDOR   -> vendor_settlement + vendor_outstanding for that vendor
      * PARTNER  -> individual commissions for that partner
    Bulk commission payout batches are not party-scoped, so they are excluded
    whenever a specific party is requested.
    """
    items = []
    # Normalize the party scope once so every block can guard against it.
    party_id = int(party_id) if party_id not in (None, "") else None
    party_type = (party_type or None) and str(party_type).upper()

    def _party_ok(item_party_type: str) -> bool:
        """A block runs unless a different party was explicitly requested."""
        if party_id is None:
            return True
        return party_type == item_party_type

    # 1. Salary (SalarySheet)
    if (not payable_type or payable_type == "salary") and _party_ok("EMPLOYEE"):
        qs = SalarySheet.objects.all()
        if party_id is not None:
            qs = qs.filter(employee_id=party_id)
        if status_category == "DRAFT":
            qs = qs.filter(status=SalarySheetStatus.DRAFT)
        elif status_category == "READY_TO_PAY":
            qs = qs.filter(status=SalarySheetStatus.APPROVED)
        elif status_category == "PAID":
            qs = qs.filter(status__in=[SalarySheetStatus.PAID, SalarySheetStatus.POSTED])
        elif status_category == "ALL":
            pass # No filter
        else: # Default to ready to pay
            qs = qs.filter(status=SalarySheetStatus.APPROVED)

        if search:
            qs = qs.filter(Q(employee__name__icontains=search))
        for p in qs.select_related("employee", "payroll_period"):
            emp_name = p.employee.name if p.employee else "Unknown Employee"
            items.append({
                "id": f"salary_{p.id}",
                "payable_type": "salary",
                "payable_type_label": "Salary",
                "payable_id": p.id,
                "reference": f"{p.year}-{p.month} ({emp_name})",
                "party_name": emp_name,
                "party_type": "EMPLOYEE",
                "amount": str(p.net_amount or Decimal("0.00")),
                "outstanding": str(p.net_amount or Decimal("0.00")) if p.status not in [SalarySheetStatus.PAID, SalarySheetStatus.POSTED] else "0.00",
                "status": p.status,
                "date": str(p.payroll_period.end_date) if p.payroll_period else None,
                "journal_posted": p.status in [SalarySheetStatus.POSTED, SalarySheetStatus.PAID],
                "journal_id": getattr(p, 'posted_journal_entry_id', None),
                "needs_posting": p.status == SalarySheetStatus.APPROVED,
                "notes": getattr(p, 'notes', ''),
            })

    # 2. Vendor Settlement (VendorSettlement)
    if (not payable_type or payable_type == "vendor_settlement") and _party_ok("VENDOR"):
        qs = VendorSettlement.objects.all()
        if party_id is not None:
            qs = qs.filter(vendor_id=party_id)
        if status_category == "DRAFT":
            qs = qs.filter(status=VendorSettlementStatus.DRAFT)
        elif status_category == "READY_TO_PAY":
            # Vendor doesn't have APPROVED, so we use DRAFT as ready to pay as well if needed, but let's just use DRAFT for ready
            qs = qs.filter(status=VendorSettlementStatus.DRAFT)
        elif status_category == "PAID":
            qs = qs.filter(status=VendorSettlementStatus.POSTED)
        elif status_category == "ALL":
            pass
        else:
            qs = qs.filter(status=VendorSettlementStatus.DRAFT)

        if search:
            qs = qs.filter(Q(settlement_no__icontains=search) | Q(vendor__name__icontains=search))
        for v in qs.select_related("vendor"):
            items.append({
                "id": f"vendor_{v.id}",
                "payable_type": "vendor_settlement",
                "payable_type_label": "Vendor Settlement",
                "payable_id": v.id,
                "reference": v.settlement_no,
                "party_name": v.vendor.name if v.vendor else "Unknown Vendor",
                "party_type": "VENDOR",
                "amount": str(v.amount or Decimal("0.00")),
                "outstanding": str(v.amount or Decimal("0.00")) if v.status != VendorSettlementStatus.POSTED else "0.00",
                "status": v.status,
                "date": str(v.settlement_date) if v.settlement_date else None,
                "journal_posted": bool(v.posted_journal_entry_id),
                "journal_id": getattr(v, 'posted_journal_entry_id', None),
                "needs_posting": v.status == VendorSettlementStatus.DRAFT,
                "notes": v.notes,
            })

    # 3. Commission Payout Batch (bulk — not scoped to a single party)
    if (not payable_type or payable_type == "payout_batch") and party_id is None:
        qs = CommissionPayoutBatch.objects.all()
        if status_category == "DRAFT":
            qs = qs.filter(status=CommissionPayoutBatch.Status.DRAFT)
        elif status_category == "READY_TO_PAY":
            qs = qs.filter(status=CommissionPayoutBatch.Status.FINALIZED)
        elif status_category == "PAID":
            qs = qs.filter(status=CommissionPayoutBatch.Status.PAID)
        elif status_category == "ALL":
            pass
        else:
            qs = qs.filter(status=CommissionPayoutBatch.Status.FINALIZED)

        if search:
            qs = qs.filter(Q(batch_code__icontains=search))
            
        batch_ids = [str(b.id) for b in qs]
        batch_journals = {
            je.source_id: je.id 
            for je in JournalEntry.objects.filter(source_model="CommissionPayoutBatch", source_id__in=batch_ids)
        }
        
        for b in qs:
            jid = batch_journals.get(str(b.id))
            items.append({
                "id": f"batch_{b.id}",
                "payable_type": "payout_batch",
                "payable_type_label": "Commission Payout",
                "payable_id": b.id,
                "reference": b.batch_code,
                "party_name": "Partners (Bulk)",
                "party_type": "PARTNER",
                "amount": str(b.total_amount or Decimal("0.00")),
                "outstanding": str(b.total_amount or Decimal("0.00")) if b.status != CommissionPayoutBatch.Status.PAID else "0.00",
                "status": b.status,
                "date": str(b.payout_date) if b.payout_date else None,
                "journal_posted": bool(jid),
                "journal_id": jid,
                "needs_posting": b.status == CommissionPayoutBatch.Status.FINALIZED,
                "notes": getattr(b, 'notes', ''),
            })

    # 3.5 Individual Commissions
    if (not payable_type or payable_type == "commission") and _party_ok("PARTNER"):
        from subscriptions.models import Commission, CommissionStatus
        qs = Commission.objects.select_related('partner').all()
        if party_id is not None:
            qs = qs.filter(partner_id=party_id)
        if status_category == "DRAFT":
            qs = qs.none()
        elif status_category == "READY_TO_PAY":
            qs = qs.filter(status=CommissionStatus.PENDING)
        elif status_category == "PAID":
            qs = qs.filter(status=CommissionStatus.SETTLED)
        elif status_category == "ALL":
            pass
        else:
            qs = qs.filter(status=CommissionStatus.PENDING)
            
        if search:
            qs = qs.filter(Q(partner__first_name__icontains=search) | Q(partner__last_name__icontains=search) | Q(partner__username__icontains=search))
            
        # Get journal IDs via payout line -> batch -> journal entry
        comm_ids = [c.id for c in qs]
        from subscriptions.models import CommissionPayoutLine
        lines = CommissionPayoutLine.objects.filter(commission_id__in=comm_ids).select_related('payout_batch')
        batch_ids_for_lines = list(set(str(l.payout_batch_id) for l in lines))
        
        journals_for_lines = {
            je.source_id: je.id 
            for je in JournalEntry.objects.filter(source_model="CommissionPayoutBatch", source_id__in=batch_ids_for_lines)
        }
        
        comm_journals = {}
        for l in lines:
            if str(l.payout_batch_id) in journals_for_lines:
                comm_journals[l.commission_id] = journals_for_lines[str(l.payout_batch_id)]
            
        for c in qs:
            jid = comm_journals.get(c.id)
            items.append({
                "id": f"comm_ind_{c.id}",
                "payable_type": "commission",
                "payable_type_label": "Commission",
                "payable_id": c.id,
                "reference": f"COMM-{c.id}",
                "party_name": getattr(c.partner, 'get_full_name', lambda: c.partner.username)() or c.partner.username,
                "party_type": "PARTNER",
                "amount": str(c.commission_amount),
                "outstanding": str(c.commission_amount) if c.status == CommissionStatus.PENDING else "0.00",
                "status": "READY_TO_PAY" if c.status == CommissionStatus.PENDING else "POSTED" if c.status == CommissionStatus.SETTLED else c.status,
                "date": str(c.created_at.date()),
                "journal_posted": bool(jid),
                "journal_id": jid,
                "needs_posting": False,
                "notes": f"Individual commission for partner",
            })

    # 4. Expense Claim
    if (not payable_type or payable_type == "expense_claim") and _party_ok("EMPLOYEE"):
        qs = EmployeeExpenseClaim.objects.all()
        if party_id is not None:
            qs = qs.filter(employee_id=party_id)
        if status_category == "DRAFT":
            qs = qs.filter(status=ExpenseClaimStatus.DRAFT)
        elif status_category == "READY_TO_PAY":
            qs = qs.filter(status=ExpenseClaimStatus.APPROVED)
        elif status_category == "PAID":
            qs = qs.filter(status__in=[ExpenseClaimStatus.PAID, ExpenseClaimStatus.POSTED])
        elif status_category == "ALL":
            pass
        else:
            qs = qs.filter(status=ExpenseClaimStatus.APPROVED)

        if search:
            qs = qs.filter(Q(claim_no__icontains=search) | Q(employee__name__icontains=search))
        for e in qs.select_related("employee"):
            emp_name = e.employee.name if e.employee else "Unknown Employee"
            items.append({
                "id": f"expense_{e.id}",
                "payable_type": "expense_claim",
                "payable_type_label": "Expense Claim",
                "payable_id": e.id,
                "reference": getattr(e, 'claim_no', ''),
                "party_name": emp_name,
                "party_type": "EMPLOYEE",
                "amount": str(e.approved_amount or e.claimed_amount or Decimal("0.00")),
                "outstanding": str(e.approved_amount or Decimal("0.00")) if e.status not in [ExpenseClaimStatus.PAID, ExpenseClaimStatus.POSTED] else "0.00",
                "status": e.status,
                "date": str(e.expense_date) if e.expense_date else None,
                "journal_posted": e.status in [ExpenseClaimStatus.PAID, ExpenseClaimStatus.POSTED],
                "journal_id": getattr(e, 'posted_journal_entry_id', None),
                "needs_posting": e.status == ExpenseClaimStatus.APPROVED,
                "notes": getattr(e, 'notes', ''),
            })

    # 5. Vendor Outstanding Balances (as a payable type)
    if (not payable_type or payable_type == "vendor_outstanding") and _party_ok("VENDOR"):
        if status_category in ["READY_TO_PAY", "ALL", None]:
            from accounting.services.vendor_ledger_service import get_vendor_outstanding
            from accounting.models import Vendor
            vendors = Vendor.objects.all()
            if party_id is not None:
                vendors = vendors.filter(id=party_id)
            if search:
                vendors = vendors.filter(Q(name__icontains=search) | Q(vendor_code__icontains=search))
            for v in vendors:
                out_data = get_vendor_outstanding(v)
                outstanding_amt = Decimal(out_data.get("outstanding", "0.00"))
                if outstanding_amt > Decimal("0.00"):
                    items.append({
                        "id": f"vendor_out_{v.id}",
                        "payable_type": "vendor_outstanding",
                        "payable_type_label": "Vendor Ledger Outstanding",
                        "payable_id": v.id,
                        "reference": v.vendor_code or f"Vendor-{v.id}",
                        "party_name": v.name,
                        "party_type": "VENDOR",
                        "amount": str(outstanding_amt),
                        "outstanding": str(outstanding_amt),
                        "status": "READY_TO_PAY",
                        "date": str(timezone.now().date()),
                        "journal_posted": False,
                        "journal_id": None,
                        "needs_posting": False,
                        "notes": "Outstanding balance from vendor ledger",
                    })

    # 6. Customer Deposit & Credit Refunds
    if (not payable_type or payable_type in ("credit_refund", "deposit_refund")) and _party_ok("CUSTOMER"):
        if status_category in ["READY_TO_PAY", "ALL", None]:
            from contracts.services.rent_lease_billing_service import list_admin_deposit_register
            dep_data = list_admin_deposit_register(limit=500)
            for row in dep_data.get("results", []):
                if row.get("can_record_refund") or row.get("can_approve_refund"):
                    amt_str = str(row.get("refundable_amount") or row.get("held_amount") or row.get("deposit_amount") or "0.00")
                    ref_str = str(row.get("reference_key") or row.get("contract_reference") or f"SUB-{row['subscription_id']}")
                    cname = str(row.get("customer_name") or "Unknown Customer")
                    if search and search.lower() not in (ref_str + " " + cname).lower():
                        continue
                    items.append({
                        "id": f"dep_ref_{row['subscription_id']}",
                        "payable_type": "credit_refund",
                        "payable_type_label": "Customer Deposit Refund",
                        "payable_id": row["subscription_id"],
                        "reference": ref_str,
                        "party_name": cname,
                        "party_type": "CUSTOMER",
                        "amount": amt_str,
                        "outstanding": amt_str,
                        "status": "READY_TO_PAY",
                        "date": str(timezone.now().date()),
                        "journal_posted": bool(row.get("refund_record_transaction_id")),
                        "journal_id": getattr(row, "posted_journal_entry_id", None),
                        "needs_posting": bool(row.get("can_approve_refund")),
                        "notes": f"Security deposit refund for {row.get('plan_type', 'subscription')} contract {ref_str}",
                    })

    # Calculate summary
    total_items = len(items)
    total_outstanding = sum(Decimal(i["outstanding"]) for i in items)
    needs_posting_count = sum(1 for i in items if i["needs_posting"])

    type_summary = []
    for ptype in set(i["payable_type"] for i in items):
        ptype_items = [i for i in items if i["payable_type"] == ptype]
        type_summary.append({
            "payable_type": ptype,
            "label": ptype_items[0]["payable_type_label"] if ptype_items else ptype,
            "count": len(ptype_items),
            "total": str(sum(Decimal(i["outstanding"]) for i in ptype_items)),
        })

    return {
        "total_items": total_items,
        "total_outstanding": str(total_outstanding),
        "needs_posting_count": needs_posting_count,
        "type_summary": type_summary,
        "items": sorted(items, key=lambda x: x["date"] or "", reverse=True),
    }

def execute_payable_action(payload, executed_by):
    payable_type = payload.get("payable_type")
    payable_id = payload.get("payable_id")
    action = payload.get("action")  # 'approve', 'reject', 'cancel', 'submit'

    with transaction.atomic():
        if payable_type == "salary":
            sheet = SalarySheet.objects.select_for_update().get(id=payable_id)
            if action == "approve":
                sheet.status = SalarySheetStatus.APPROVED
            elif action == "cancel":
                sheet.status = SalarySheetStatus.DRAFT
            sheet.save(update_fields=["status"])
            audited_instance = sheet

        elif payable_type == "vendor_settlement":
            settlement = VendorSettlement.objects.select_for_update().get(id=payable_id)
            if action == "cancel":
                settlement.status = VendorSettlementStatus.CANCELLED
            settlement.save(update_fields=["status"])
            audited_instance = settlement

        elif payable_type == "payout_batch":
            batch = CommissionPayoutBatch.objects.select_for_update().get(id=payable_id)
            if action == "approve" or action == "finalize":
                batch.status = CommissionPayoutBatch.Status.FINALIZED
            elif action == "cancel":
                batch.status = CommissionPayoutBatch.Status.CANCELLED
            batch.save(update_fields=["status"])
            audited_instance = batch

        elif payable_type == "commission":
            from subscriptions.models import Commission, CommissionStatus
            commission = Commission.objects.select_for_update().get(id=payable_id)
            if action == "cancel":
                commission.status = CommissionStatus.REVERSED
            commission.save(update_fields=["status"])
            audited_instance = commission

        elif payable_type == "expense_claim":
            claim = EmployeeExpenseClaim.objects.select_for_update().get(id=payable_id)
            if action == "approve":
                claim.status = ExpenseClaimStatus.APPROVED
            elif action == "reject":
                claim.status = ExpenseClaimStatus.REJECTED
            elif action == "cancel":
                claim.status = ExpenseClaimStatus.CANCELLED
            claim.save(update_fields=["status"])
            audited_instance = claim
        else:
            raise ValueError(f"Unsupported payable type: {payable_type}")

        log_audit(
            action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
            instance=audited_instance,
            performed_by=executed_by,
            metadata={
                "event": "UNIFIED_PAYABLE_ACTION_EXECUTED",
                "payable_type": payable_type,
                "payable_id": payable_id,
                "action": action,
                "resulting_status": getattr(audited_instance, "status", None),
            },
        )

        return {
            "success": True,
            "message": f"Successfully performed '{action}' on {payable_type.replace('_', ' ').title()}",
        }

def execute_unified_payable(payload, executed_by, idempotency_key=None, fingerprint=None):
    payable_type = payload.get("payable_type")
    payable_id = payload.get("payable_id")
    finance_account_id = payload.get("finance_account_id")
    amount = Decimal(str(payload.get("amount", "0.00")))
    payment_date = payload.get("payment_date") or timezone.now().date()
    reference_no = payload.get("reference_no", "")
    notes = payload.get("notes", "")

    if not idempotency_key:
        idempotency_key = str(uuid.uuid4())
    if not fingerprint:
        fingerprint = str(uuid.uuid4())

    with transaction.atomic():
        idem_row = (
            UnifiedPayableIdempotency.objects.select_for_update()
            .filter(user_id=getattr(executed_by, "id", None), key=idempotency_key)
            .first()
        )
        if idem_row:
            if idem_row.status == UnifiedPayableIdempotencyStatus.COMPLETED:
                return idem_row.response_body
            raise ValueError("A payment request with this idempotency key is already in progress.")
        
        idem_row = UnifiedPayableIdempotency.objects.create(
            user=executed_by,
            key=idempotency_key,
            fingerprint=fingerprint,
            status=UnifiedPayableIdempotencyStatus.PENDING,
            response_body={},
            response_status=201,
        )

        journal_entry_id = None

        if payable_type == "salary":
            from accounting.services.salary_posting_service import post_salary_sheet, post_salary_payment
            
            sheet = SalarySheet.objects.get(id=payable_id)
            if sheet.status == SalarySheetStatus.APPROVED and not sheet.posted_journal_entry_id:
                post_salary_sheet(salary_sheet_id=payable_id, posted_by=executed_by)
                
            post_salary_payment(
                salary_sheet_id=payable_id,
                payment_date=payment_date,
                amount=amount,
                finance_account_id=finance_account_id,
                reference_no=reference_no,
                posted_by=executed_by
            )
            
        elif payable_type == "vendor_outstanding":
            from accounting.models import FinanceAccount, VendorSettlement, VendorSettlementStatus, JournalEntry, generate_vendor_settlement_no
            from accounting.services.vendor_settlement_service import post_vendor_settlement
            
            settlement = VendorSettlement.objects.create(
                vendor_id=payable_id,
                settlement_no=generate_vendor_settlement_no(),
                settlement_date=payment_date,
                amount=amount,
                status=VendorSettlementStatus.DRAFT,
                finance_account_id=finance_account_id,
                reference_no=reference_no,
                notes=notes
            )
            post_vendor_settlement(vendor_settlement_id=settlement.id, posted_by=executed_by)
            
        elif payable_type == "vendor_settlement":
            from accounting.models import VendorSettlement, VendorSettlementStatus
            from accounting.services.vendor_settlement_service import post_vendor_settlement
            
            settlement = VendorSettlement.objects.select_for_update().get(id=payable_id)
            if settlement.status == VendorSettlementStatus.POSTED:
                raise ValueError("Vendor settlement is already paid.")
            if finance_account_id:
                settlement.finance_account_id = finance_account_id
            settlement.reference_no = reference_no
            settlement.notes = notes
            settlement.save(update_fields=["finance_account_id", "reference_no", "notes"])
            
            post_vendor_settlement(vendor_settlement_id=payable_id, posted_by=executed_by)
            
        elif payable_type == "payout_batch":
            batch = CommissionPayoutBatch.objects.select_for_update().get(id=payable_id)
            if batch.status == CommissionPayoutBatch.Status.PAID:
                raise ValueError("Commission batch is already paid.")
            batch.status = CommissionPayoutBatch.Status.PAID
            if finance_account_id:
                batch.finance_account_id = finance_account_id
            batch.save(update_fields=["status", "finance_account_id"])
            
            if finance_account_id:
                from accounting.services.bridge_run_service import _post_payout_batch_bridge
                _post_payout_batch_bridge(payout_batch=batch, performed_by=executed_by)

        elif payable_type == "commission":
            from subscriptions.models import Commission, CommissionStatus, CommissionPayoutBatch, CommissionPayoutLine
            commission = Commission.objects.select_for_update().get(id=payable_id)
            if commission.status == CommissionStatus.SETTLED:
                raise ValueError("Commission is already paid.")
            
            # Create a one-off batch for this commission payment
            batch = CommissionPayoutBatch.objects.create(
                batch_code=f"BATCH-AUTO-{uuid.uuid4().hex[:6].upper()}",
                payout_date=payment_date,
                total_amount=amount,
                status=CommissionPayoutBatch.Status.PAID,
                finance_account_id=finance_account_id,
                processed_by=executed_by,
                notes=notes or "Auto-generated batch for direct commission payment"
            )
            CommissionPayoutLine.objects.create(
                payout_batch=batch,
                partner=commission.partner,
                amount=amount,
                commission=commission
            )
            commission.status = CommissionStatus.SETTLED
            commission.save(update_fields=["status"])
            
            if finance_account_id:
                from accounting.services.bridge_run_service import _post_payout_batch_bridge
                _post_payout_batch_bridge(payout_batch=batch, performed_by=executed_by)

        elif payable_type == "expense_claim":
            from accounting.services.workforce_service import post_employee_expense_claim, post_employee_expense_claim_payment
            
            claim = EmployeeExpenseClaim.objects.get(id=payable_id)
            if claim.status == ExpenseClaimStatus.APPROVED and not getattr(claim, 'posted_journal_entry_id', None):
                post_employee_expense_claim(expense_claim_id=payable_id, posted_by=executed_by)
                
            post_employee_expense_claim_payment(
                expense_claim_id=payable_id,
                payment_date=payment_date,
                amount=amount,
                finance_account_id=finance_account_id,
                reference_no=reference_no,
                posted_by=executed_by
            )

        elif payable_type in ("credit_refund", "deposit_refund"):
            from subscriptions.models import Subscription
            from contracts.services.rent_lease_billing_service import record_deposit_refund
            sub = Subscription.objects.get(id=payable_id)
            demand = record_deposit_refund(
                subscription=sub,
                amount=amount,
                performed_by=executed_by,
                reference_no=reference_no,
                finance_account_id=finance_account_id,
                payment_method="CASH",
                payment_date=payment_date,
                idempotency_key=idempotency_key,
            )
            from accounting.services.accounting_bridge_security_deposit_service import post_bridge_candidate, candidate_for
            tx = getattr(demand, "_deposit_source_transaction", None)
            if tx:
                cand = candidate_for(tx)
                if cand.get("is_postable"):
                    res = post_bridge_candidate(
                        candidate_id=cand["id"],
                        idempotency_key=cand["idempotency_key"],
                        confirmed=True,
                        posting_note=notes,
                        actor=executed_by
                    )
                    journal_entry_id = res.get("journal_entry", {}).get("id")

        else:
            raise ValueError(f"Unsupported payable type: {payable_type}")

        result = {
            "success": True,
            "payable_type": payable_type,
            "payable_id": payable_id,
            "amount_paid": str(amount),
            "journal_entry_id": journal_entry_id,
            "message": f"Successfully processed payout for {payable_type.replace('_', ' ').title()}",
        }

        idem_row.status = UnifiedPayableIdempotencyStatus.COMPLETED
        idem_row.response_body = result
        idem_row.save(update_fields=["status", "response_body"])

        log_audit(
            action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
            instance=idem_row,
            performed_by=executed_by,
            metadata={
                "event": "UNIFIED_PAYABLE_PAYOUT_EXECUTED",
                "payable_type": payable_type,
                "payable_id": payable_id,
                "amount": str(amount),
                "finance_account_id": finance_account_id,
                "payment_date": str(payment_date),
                "reference_no": reference_no or "",
                "idempotency_key": idempotency_key,
            },
        )

        return result
