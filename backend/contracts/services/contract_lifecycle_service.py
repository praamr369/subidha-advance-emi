"""Contract lifecycle management service.

Handles state transitions: approve, activate, lock terms, cancel, close.
All financial mutations that need to accompany state changes happen here.
"""
from __future__ import annotations

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from subscriptions.models import (
    AuditLog,
    PlanType,
    Subscription,
    SubscriptionStatus,
)
from subscriptions.services.audit_service import log_audit
from contracts.services.contract_number_service import assign_subscription_number
from subscriptions.services.state_machine import change_subscription_status


def _require_actor(performed_by) -> None:
    if not performed_by:
        raise ValidationError("performed_by is required for contract lifecycle transitions.")


@transaction.atomic
def approve_contract(*, subscription: Subscription, performed_by) -> Subscription:
    """Move contract from DRAFT / REQUESTED / PENDING_APPROVAL → APPROVED."""
    _require_actor(performed_by)

    allowed_from = {
        SubscriptionStatus.DRAFT,
        SubscriptionStatus.REQUESTED,
        SubscriptionStatus.PENDING_APPROVAL,
    }
    if subscription.status not in allowed_from:
        raise ValidationError(
            f"Cannot approve a contract in status '{subscription.status}'. "
            f"Expected one of: {', '.join(sorted(allowed_from))}."
        )

    change_subscription_status(subscription, SubscriptionStatus.APPROVED)
    assign_subscription_number(subscription)
    subscription.refresh_from_db(fields=["subscription_number"])

    log_audit(
        action_type=AuditLog.ActionType.CONTRACT_APPROVED,
        instance=subscription,
        performed_by=performed_by,
        metadata={"contract_number": subscription.subscription_number},
    )
    return subscription


@transaction.atomic
def activate_contract(*, subscription: Subscription, performed_by) -> Subscription:
    """Move contract from APPROVED → ACTIVE and lock financial terms."""
    _require_actor(performed_by)

    if subscription.status != SubscriptionStatus.APPROVED:
        raise ValidationError(
            f"Cannot activate a contract in status '{subscription.status}'. Must be APPROVED first."
        )

    _run_activation_gates(subscription)
    # Additive KYC/document readiness gate. No-op unless KYC gating is enabled
    # (and never applies to direct sale). Raises a controlled HTTP 400.
    from customers.services.kyc_readiness_service import enforce_contract_kyc_gate

    enforce_contract_kyc_gate(subscription=subscription, stage="activate")
    from contracts.services.contract_activation_readiness_service import (
        assert_contract_activation_ready,
    )

    assert_contract_activation_ready(subscription, stage="activate")
    change_subscription_status(subscription, SubscriptionStatus.ACTIVE)
    _lock_financial_terms(subscription, performed_by)

    log_audit(
        action_type=AuditLog.ActionType.CONTRACT_ACTIVATED,
        instance=subscription,
        performed_by=performed_by,
        metadata={"contract_number": subscription.subscription_number, "plan_type": subscription.plan_type},
    )

    if subscription.plan_type in (PlanType.RENT, PlanType.LEASE):
        from contracts.services.rent_lease_billing_service import generate_monthly_demands_for_subscription
        generate_monthly_demands_for_subscription(subscription=subscription, performed_by=performed_by)

    try:
        from reminders.services.whatsapp_outbox_service import queue_contract_activated

        queue_contract_activated(subscription)
    except Exception:  # pragma: no cover - best-effort outbox
        pass

    return subscription


def _run_activation_gates(subscription: Subscription) -> None:
    """Raise ValidationError if contract fails activation prerequisites."""
    errors: dict[str, str] = {}

    if not subscription.customer_id:
        errors["customer"] = "Customer is required before activation."
    if not subscription.product_id:
        errors["product"] = "Product is required before activation."

    if subscription.plan_type == PlanType.EMI:
        if not subscription.batch_id:
            errors["batch"] = "Batch is required for Advance EMI activation."
        if not subscription.lucky_id_id:
            errors["lucky_id"] = "Lucky ID is required for Advance EMI activation."

    if subscription.plan_type in (PlanType.RENT, PlanType.LEASE):
        profile_attr = "rent_profile" if subscription.plan_type == PlanType.RENT else "lease_profile"
        try:
            profile = getattr(subscription, profile_attr)
            if not profile.security_deposit_amount or profile.security_deposit_amount <= 0:
                errors["security_deposit"] = "Security deposit must be recorded before activation."
        except Exception:
            errors["profile"] = f"{subscription.plan_type} profile is missing."

    if errors:
        raise ValidationError(errors)


def _lock_financial_terms(subscription: Subscription, performed_by) -> None:
    if subscription.terms_locked_at:
        return

    now = timezone.now()
    actor_pk = getattr(performed_by, "pk", None)
    Subscription.objects.filter(pk=subscription.pk).update(
        terms_locked_at=now,
        terms_locked_by_id=actor_pk,
    )
    subscription.terms_locked_at = now

    log_audit(
        action_type=AuditLog.ActionType.CONTRACT_TERMS_LOCKED,
        instance=subscription,
        performed_by=performed_by,
        metadata={
            "total_amount": str(subscription.total_amount),
            "monthly_amount": str(subscription.monthly_amount),
            "tenure_months": subscription.tenure_months,
        },
    )


@transaction.atomic
def cancel_contract(
    *,
    subscription: Subscription,
    performed_by,
    reason: str,
    force_after_activation: bool = False,
) -> Subscription:
    """Cancel a contract. Historical payment/ledger records are never deleted."""
    _require_actor(performed_by)

    pre_activation = {
        SubscriptionStatus.DRAFT,
        SubscriptionStatus.REQUESTED,
        SubscriptionStatus.PENDING_APPROVAL,
        SubscriptionStatus.APPROVED,
    }

    if subscription.status not in pre_activation and not force_after_activation:
        raise ValidationError(
            "Cancellation after activation requires force_after_activation=True and an admin reason. "
            "Paid amounts are preserved; no financial records will be deleted."
        )

    if not reason or not reason.strip():
        raise ValidationError({"reason": "Cancellation reason is required."})

    now = timezone.now()
    Subscription.objects.filter(pk=subscription.pk).update(
        status=SubscriptionStatus.CANCELLED,
        cancellation_reason=reason.strip(),
        cancelled_at=now,
        cancelled_by_id=getattr(performed_by, "pk", None),
    )
    subscription.status = SubscriptionStatus.CANCELLED
    subscription.cancellation_reason = reason.strip()
    subscription.cancelled_at = now

    # Release lucky_id if pre-activation EMI
    if (
        subscription.plan_type == PlanType.EMI
        and subscription.lucky_id_id
        and subscription.status not in (SubscriptionStatus.ACTIVE,)
    ):
        from subscriptions.models import LuckyId, LuckyIdStatus
        LuckyId.objects.filter(pk=subscription.lucky_id_id).update(status=LuckyIdStatus.AVAILABLE)

    # Best-effort stock release
    try:
        from inventory.services.stock_movement_service import release_stock_reservation
        release_stock_reservation(
            inventory_item=subscription.product.inventory_item,
            quantity=1,
            reference_model="Subscription",
            reference_id=str(subscription.pk),
            posted_by=performed_by,
            notes=f"Released on contract cancellation",
        )
    except Exception:
        pass

    log_audit(
        action_type=AuditLog.ActionType.CONTRACT_CANCELLED,
        instance=subscription,
        performed_by=performed_by,
        metadata={"reason": reason[:300]},
    )
    return subscription


@transaction.atomic
def close_contract(*, subscription: Subscription, performed_by) -> Subscription:
    """Move contract to CLOSED (terminal state)."""
    _require_actor(performed_by)

    closable = {SubscriptionStatus.COMPLETED, SubscriptionStatus.RETURNED}
    if subscription.status not in closable:
        raise ValidationError(
            f"Cannot close a contract in status '{subscription.status}'. Expected COMPLETED or RETURNED."
        )

    change_subscription_status(subscription, SubscriptionStatus.CLOSED)

    log_audit(
        action_type=AuditLog.ActionType.CONTRACT_CLOSED,
        instance=subscription,
        performed_by=performed_by,
        metadata={"contract_number": subscription.subscription_number},
    )
    return subscription


@transaction.atomic
def modify_pre_activation_contract(
    *,
    subscription: Subscription,
    performed_by,
    data: dict,
) -> Subscription:
    """Fully modify a contract (Advance EMI, Rent, or Lease) before activation.

    Business Rules:
    - Allowed only when contract is in pre-activation status: DRAFT, REQUESTED, PENDING_APPROVAL, APPROVED.
    - If terms are locked (terms_locked_at is not None) or contract is active/beyond, direct modification
      is blocked with a ValidationError directing admin to Contract Amendments.
    - Blocked if any payment or settled EMI activity has taken place on the contract.
    - Supports full edits matching the contract creation workflow:
      * PlanType.EMI: customer, product, partner, batch, lucky_id, tenure_months, start_date.
        Properly frees previous lucky_id if changed and claims new lucky_id.
        Recomputes total_amount, monthly_amount, and pending draft EMI schedule.
      * PlanType.RENT / LEASE: customer, products/items basket, tenure_months, start_date,
        yield rate %, deposit %, deposit options/buffer/initial payment, handover notes, terms snapshot.
        For LEASE: buyout amount, ownership transfer allowed.
        Synchronizes ContractItem rows and profiles, recomputes financial snapshots, updates deposit demand,
        and regenerates contract PDF.
    - Emits auditable log entry upon completion.
    """
    _require_actor(performed_by)

    pre_activation = {
        SubscriptionStatus.DRAFT,
        SubscriptionStatus.REQUESTED,
        SubscriptionStatus.PENDING_APPROVAL,
        SubscriptionStatus.APPROVED,
    }
    if subscription.status not in pre_activation or subscription.terms_locked_at is not None:
        raise ValidationError(
            f"Contract is already activated (status '{subscription.status}') and terms are locked. "
            "Modifications to active contracts must be processed through Contract Amendments."
        )

    if subscription.payments.exists():
        raise ValidationError("Cannot modify contract terms after payment activity has been recorded.")

    from subscriptions.models import (
        Emi,
        EmiStatus,
        LuckyId,
        LuckyIdStatus,
        ContractItem,
        RentSubscriptionProfile,
        LeaseSubscriptionProfile,
        MONEY_ZERO,
        q2,
    )
    from customers.models import Customer
    from products_core.models import Product
    from decimal import Decimal, ROUND_HALF_UP
    from datetime import date
    from dateutil.relativedelta import relativedelta
    from contracts.services.contract_pdf_service import generate_contract_pdf_for_subscription

    if subscription.emis.filter(status=EmiStatus.PAID).exists():
        raise ValidationError("Cannot modify contract terms after EMI payments have started.")

    plan_type = data.get("plan_type", subscription.plan_type)
    if plan_type not in (PlanType.EMI, PlanType.RENT, PlanType.LEASE):
        plan_type = subscription.plan_type

    # 1. Update Customer if provided
    customer_input = data.get("customer")
    if customer_input is not None:
        if isinstance(customer_input, Customer):
            subscription.customer = customer_input
        elif isinstance(customer_input, (int, str)) and str(customer_input).strip():
            try:
                subscription.customer = Customer.objects.get(pk=int(customer_input))
            except (Customer.DoesNotExist, ValueError):
                raise ValidationError({"customer": "Customer not found."})

    # 2. Update Partner if provided (or explicitly null)
    if "partner" in data:
        partner_input = data.get("partner")
        if partner_input is None or partner_input == "":
            subscription.partner = None
        elif hasattr(partner_input, "pk"):
            subscription.partner = partner_input
        else:
            from accounts.models import User
            try:
                subscription.partner = User.objects.get(pk=int(partner_input))
            except (User.DoesNotExist, ValueError):
                subscription.partner = None

    # 3. Update Start Date if provided
    start_date_val = data.get("start_date")
    if start_date_val:
        if isinstance(start_date_val, str):
            import datetime
            try:
                subscription.start_date = datetime.date.fromisoformat(start_date_val)
            except ValueError:
                pass
        elif isinstance(start_date_val, date):
            subscription.start_date = start_date_val

    # 4. Update Tenure Months if provided
    tenure_months_val = data.get("tenure_months")
    if tenure_months_val is not None:
        try:
            tenure_int = int(tenure_months_val)
            if tenure_int <= 0:
                raise ValidationError({"tenure_months": "Tenure must be greater than zero."})
            subscription.tenure_months = tenure_int
        except (ValueError, TypeError):
            pass

    # 5. Handle PlanType specific modifications
    if plan_type == PlanType.EMI:
        from lucky_plan.models import Batch

        product_input = data.get("product")
        if product_input is not None:
            if isinstance(product_input, Product):
                prod = product_input
            else:
                try:
                    prod = Product.objects.get(pk=int(product_input))
                except (Product.DoesNotExist, ValueError):
                    raise ValidationError({"product": "Product not found."})
            if not getattr(prod, "is_emi_enabled", False):
                raise ValidationError({"product": f"Product '{prod.name}' is not enabled for Advance EMI."})
            subscription.product = prod

        batch_input = data.get("batch")
        if batch_input is not None:
            if isinstance(batch_input, Batch):
                batch_obj = batch_input
            else:
                try:
                    batch_obj = Batch.objects.get(pk=int(batch_input))
                except (Batch.DoesNotExist, ValueError):
                    raise ValidationError({"batch": "Batch not found."})
            subscription.batch = batch_obj
            subscription.tenure_months = batch_obj.duration_months
        elif subscription.batch:
            subscription.tenure_months = subscription.batch.duration_months

        # Lucky ID handling
        if "lucky_id" in data:
            lucky_input = data.get("lucky_id")
            if lucky_input is not None:
                if isinstance(lucky_input, LuckyId):
                    new_lucky = lucky_input
                else:
                    try:
                        new_lucky = LuckyId.objects.select_for_update().get(pk=int(lucky_input))
                    except (LuckyId.DoesNotExist, ValueError):
                        raise ValidationError({"lucky_id": "Lucky ID not found."})

                if subscription.batch_id and new_lucky.batch_id != subscription.batch_id:
                    raise ValidationError({"lucky_id": "Selected Lucky ID does not belong to the selected batch."})

                if subscription.lucky_id_id != new_lucky.id:
                    if new_lucky.status != LuckyIdStatus.AVAILABLE:
                        raise ValidationError({"lucky_id": "Selected Lucky ID is not available."})
                    # Free previous lucky ID if it was assigned to this subscription
                    if subscription.lucky_id_id:
                        LuckyId.objects.filter(pk=subscription.lucky_id_id).update(status=LuckyIdStatus.AVAILABLE)
                    subscription.lucky_id = new_lucky

        # Recompute totals for EMI
        total_amount = q2(Decimal(str(subscription.product.base_price)))
        monthly_amount = q2(total_amount / Decimal(subscription.tenure_months))
        subscription.total_amount = total_amount
        subscription.monthly_amount = monthly_amount
        subscription.plan_type = PlanType.EMI

        # Recompute draft EMI schedule
        from api.v1.serializers.admin_resources import build_emi_amounts
        emi_amounts = build_emi_amounts(total_amount=total_amount, tenure_months=subscription.tenure_months)
        existing_emis = list(subscription.emis.order_by("month_no", "id"))

        for idx, amount in enumerate(emi_amounts, start=1):
            due_date = subscription.start_date + relativedelta(months=idx - 1)
            if idx <= len(existing_emis):
                emi_row = existing_emis[idx - 1]
                emi_row.month_no = idx
                emi_row.due_date = due_date
                emi_row.amount = amount
                emi_row.status = EmiStatus.PENDING
                emi_row.save(update_fields=["month_no", "due_date", "amount", "status", "updated_at"])
            else:
                Emi.objects.create(
                    subscription=subscription,
                    month_no=idx,
                    due_date=due_date,
                    amount=amount,
                    status=EmiStatus.PENDING,
                )
        if len(existing_emis) > len(emi_amounts):
            for excess_emi in existing_emis[len(emi_amounts):]:
                excess_emi.status = EmiStatus.CANCELLED
                excess_emi.save(update_fields=["status", "updated_at"])

        subscription.product_snapshot = {
            "product_id": subscription.product.id,
            "product_code": getattr(subscription.product, "product_code", ""),
            "name": getattr(subscription.product, "name", ""),
            "base_price": str(subscription.product.base_price),
        }
        subscription.pricing_snapshot = {
            "plan_type": PlanType.EMI,
            "tenure_months": subscription.tenure_months,
            "monthly_amount": str(monthly_amount),
            "total_amount": str(total_amount),
        }

    else:
        # PlanType.RENT or PlanType.LEASE
        from contracts.services.rent_lease_contract_service import _normalize_contract_items, _default_terms_snapshot
        from contracts.services.rent_lease_billing_service import ensure_security_deposit_demand

        # Release lucky ID if switching from EMI
        if subscription.lucky_id_id:
            LuckyId.objects.filter(pk=subscription.lucky_id_id).update(status=LuckyIdStatus.AVAILABLE)
            subscription.lucky_id = None
            subscription.batch = None

        subscription.plan_type = plan_type
        monthly_yield_val = Decimal(str(data.get("monthly_yield_percent") or "5.00")).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )
        if monthly_yield_val <= MONEY_ZERO:
            monthly_yield_val = Decimal("5.00")

        deposit_pct_val = Decimal(str(data.get("security_deposit_percent") or "20.00")).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )

        items_input = data.get("items")
        product_input = data.get("product", subscription.product)

        normalized_items = _normalize_contract_items(
            plan_type=plan_type,
            product=product_input,
            items=items_input,
            default_monthly_yield_percent=monthly_yield_val,
            default_security_deposit_percent=deposit_pct_val,
        )

        primary_product = normalized_items[0]["product"]
        product_value = sum((it["total_base_price"] for it in normalized_items), MONEY_ZERO)
        monthly_amount = sum((it["monthly_amount"] for it in normalized_items), MONEY_ZERO)
        total_amount = (monthly_amount * Decimal(subscription.tenure_months)).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )
        deposit_amount = sum((it["security_deposit_amount"] for it in normalized_items), MONEY_ZERO)
        effective_deposit_percent = (
            (deposit_amount * Decimal("100.00") / product_value).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            if product_value > MONEY_ZERO
            else deposit_pct_val
        )

        deposit_payment_option = data.get("deposit_payment_option", "FULL")
        deposit_buffer_days = int(data.get("deposit_buffer_days") or 30)
        initial_deposit_payment = data.get("initial_deposit_payment")

        subscription.product = primary_product
        subscription.total_amount = total_amount
        subscription.monthly_amount = monthly_amount

        handover_notes = data.get("handover_notes", "")
        terms_snapshot = (data.get("contract_terms_snapshot") or "").strip() or _default_terms_snapshot(plan_type=plan_type)

        items_snapshot = [
            {
                "product_id": it["product"].id,
                "product_name": it["product"].name,
                "product_code": getattr(it["product"], "product_code", ""),
                "quantity": it["quantity"],
                "unit_base_price": str(it["unit_base_price"]),
                "total_base_price": str(it["total_base_price"]),
                "monthly_yield_percent": str(it["monthly_yield_percent"]),
                "monthly_amount": str(it["monthly_amount"]),
                "security_deposit_percent": str(it["security_deposit_percent"]),
                "security_deposit_amount": str(it["security_deposit_amount"]),
            }
            for it in normalized_items
        ]

        subscription.product_snapshot = {
            "product_id": primary_product.id,
            "product_code": getattr(primary_product, "product_code", ""),
            "name": getattr(primary_product, "name", ""),
            "base_price": str(getattr(primary_product, "base_price", MONEY_ZERO)),
            "items_count": len(normalized_items),
            "items": items_snapshot,
        }
        subscription.pricing_snapshot = {
            "plan_type": plan_type,
            "tenure_months": subscription.tenure_months,
            "monthly_amount": str(monthly_amount),
            "total_amount": str(total_amount),
            "total_product_value": str(product_value),
            "items_count": len(normalized_items),
            "security_deposit_percent": str(effective_deposit_percent),
            "security_deposit_amount": str(deposit_amount),
            "deposit_payment_option": deposit_payment_option,
            "deposit_buffer_days": deposit_buffer_days,
            "initial_deposit_payment": str(initial_deposit_payment or MONEY_ZERO),
        }

        # Synchronize ContractItem rows
        existing_items = list(subscription.contract_items.order_by("id"))
        for idx, it in enumerate(normalized_items):
            if idx < len(existing_items):
                c_item = existing_items[idx]
                c_item.product = it["product"]
                c_item.quantity = it["quantity"]
                c_item.unit_base_price = it["unit_base_price"]
                c_item.total_base_price = it["total_base_price"]
                c_item.monthly_yield_percent = it["monthly_yield_percent"]
                c_item.monthly_amount = it["monthly_amount"]
                c_item.security_deposit_percent = it["security_deposit_percent"]
                c_item.security_deposit_amount = it["security_deposit_amount"]
                c_item.status = "ACTIVE"
                c_item.save()
            else:
                ContractItem.objects.create(
                    subscription=subscription,
                    product=it["product"],
                    quantity=it["quantity"],
                    unit_base_price=it["unit_base_price"],
                    total_base_price=it["total_base_price"],
                    monthly_yield_percent=it["monthly_yield_percent"],
                    monthly_amount=it["monthly_amount"],
                    security_deposit_percent=it["security_deposit_percent"],
                    security_deposit_amount=it["security_deposit_amount"],
                    status="ACTIVE",
                )
        if len(existing_items) > len(normalized_items):
            for excess_item in existing_items[len(normalized_items):]:
                excess_item.status = "CLOSED"
                excess_item.quantity = 0
                excess_item.notes = "Removed during pre-activation edit"
                excess_item.save(update_fields=["status", "quantity", "notes", "updated_at"])

        # Update Profiles
        if plan_type == PlanType.RENT:
            LeaseSubscriptionProfile.objects.filter(subscription=subscription).delete()
            rent_prof, _ = RentSubscriptionProfile.objects.get_or_create(
                subscription=subscription,
                defaults={
                    "security_deposit_percent": effective_deposit_percent,
                    "monthly_yield_percent": monthly_yield_val,
                    "security_deposit_amount": deposit_amount,
                    "refundable_security_deposit": deposit_amount,
                    "refund_amount": deposit_amount,
                    "handover_notes": handover_notes or "",
                    "contract_terms_snapshot": terms_snapshot,
                },
            )
            rent_prof.security_deposit_percent = effective_deposit_percent
            rent_prof.monthly_yield_percent = monthly_yield_val
            rent_prof.security_deposit_amount = deposit_amount
            rent_prof.refundable_security_deposit = deposit_amount
            rent_prof.refund_amount = deposit_amount
            rent_prof.handover_notes = handover_notes or ""
            rent_prof.contract_terms_snapshot = terms_snapshot
            rent_prof.save()
            subscription.rent_profile = rent_prof

        elif plan_type == PlanType.LEASE:
            RentSubscriptionProfile.objects.filter(subscription=subscription).delete()
            buyout_amt_val = data.get("buyout_amount")
            normalized_buyout = None
            if buyout_amt_val is not None and str(buyout_amt_val).strip() != "":
                normalized_buyout = q2(Decimal(str(buyout_amt_val)))
            transfer_allowed = bool(data.get("ownership_transfer_allowed", False))

            lease_prof, _ = LeaseSubscriptionProfile.objects.get_or_create(
                subscription=subscription,
                defaults={
                    "security_deposit_percent": effective_deposit_percent,
                    "monthly_yield_percent": monthly_yield_val,
                    "security_deposit_amount": deposit_amount,
                    "refundable_security_deposit": deposit_amount,
                    "refund_amount": deposit_amount,
                    "buyout_amount": normalized_buyout,
                    "ownership_transfer_allowed": transfer_allowed,
                    "handover_notes": handover_notes or "",
                    "contract_terms_snapshot": terms_snapshot,
                },
            )
            lease_prof.security_deposit_percent = effective_deposit_percent
            lease_prof.monthly_yield_percent = monthly_yield_val
            lease_prof.security_deposit_amount = deposit_amount
            lease_prof.refundable_security_deposit = deposit_amount
            lease_prof.refund_amount = deposit_amount
            lease_prof.buyout_amount = normalized_buyout
            lease_prof.ownership_transfer_allowed = transfer_allowed
            lease_prof.handover_notes = handover_notes or ""
            lease_prof.contract_terms_snapshot = terms_snapshot
            lease_prof.save()
            subscription.lease_profile = lease_prof

        # Update deposit demand if exists and uncollected
        dep_demand = ensure_security_deposit_demand(subscription=subscription, performed_by=performed_by)
        if dep_demand and dep_demand.collected_amount <= MONEY_ZERO:
            dep_demand.amount = deposit_amount
            dep_demand.save(update_fields=["amount", "updated_at"])

        # Re-generate contract PDF
        try:
            generate_contract_pdf_for_subscription(subscription=subscription, performed_by=performed_by)
        except Exception:
            pass

    subscription.full_clean()
    subscription.save()

    if subscription.lucky_id_id and subscription.plan_type == PlanType.EMI:
        LuckyId.objects.filter(pk=subscription.lucky_id_id).update(status=LuckyIdStatus.ASSIGNED)

    for cache_attr in ("_rent_profile_cache", "_lease_profile_cache"):
        if hasattr(subscription, cache_attr):
            delattr(subscription, cache_attr)

    log_audit(
        action_type=AuditLog.ActionType.CONTRACT_AMENDMENT_APPLIED,
        instance=subscription,
        performed_by=performed_by,
        metadata={
            "event": "PRE_ACTIVATION_CONTRACT_MODIFIED",
            "contract_number": subscription.subscription_number,
            "plan_type": subscription.plan_type,
            "total_amount": str(subscription.total_amount),
            "monthly_amount": str(subscription.monthly_amount),
            "tenure_months": subscription.tenure_months,
        },
    )
    return subscription
