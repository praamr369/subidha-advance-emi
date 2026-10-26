"""Rent and Lease flexible contract item amendment service.

Allows multi-product Rent and Lease contracts to have individual line items
returned, closed, upgraded, or added flexibly without breaking the strict single-product
integrity of Advance EMI (Lucky Plan) contracts.
"""
from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from contracts.models import ContractItem, Subscription
from contracts.services.rent_lease_billing_service import _monthly_demand_type
from products_core.models import Product
from subscriptions.models import AuditLog, ContractAmendment, PlanType, RentLeaseBillingDemand, RentLeaseDemandStatus, SubscriptionStatus
from subscriptions.services.audit_service import log_audit

MONEY_ZERO = Decimal("0.00")

_TERMINAL_STATUSES = {
    SubscriptionStatus.CANCELLED,
    SubscriptionStatus.CLOSED,
    SubscriptionStatus.COMPLETED,
    SubscriptionStatus.DEFAULTED,
    SubscriptionStatus.RETURNED,
    "TERMINATED",
    "REVERSED",
}


def _q2(val: Decimal) -> Decimal:
    return Decimal(str(val)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _serialize_item(item: ContractItem) -> dict[str, Any]:
    return {
        "id": item.id,
        "product_id": item.product_id,
        "product_name": getattr(item.product, "name", "Product"),
        "product_code": getattr(item.product, "product_code", ""),
        "quantity": item.quantity,
        "unit_base_price": str(item.unit_base_price),
        "total_base_price": str(item.total_base_price),
        "monthly_yield_percent": str(item.monthly_yield_percent),
        "monthly_amount": str(item.monthly_amount),
        "security_deposit_percent": str(item.security_deposit_percent),
        "security_deposit_amount": str(item.security_deposit_amount),
        "status": getattr(item, "status", "ACTIVE"),
        "returned_quantity": getattr(item, "returned_quantity", 0),
        "returned_at": item.returned_at.isoformat() if getattr(item, "returned_at", None) else None,
    }


def normalize_item_actions(raw_values: dict[str, Any]) -> list[dict[str, Any]]:
    """Extract and normalize a list of item action descriptors from amendment values."""
    if not isinstance(raw_values, dict):
        return []

    # Priority 1: explicitly nested item_actions array
    raw_actions = raw_values.get("item_actions")
    if isinstance(raw_actions, list) and len(raw_actions) > 0:
        normalized = []
        for act in raw_actions:
            if isinstance(act, dict):
                normalized.append({
                    "contract_item_id": act.get("contract_item_id") or act.get("item_id"),
                    "action": (act.get("action") or "RETURN").upper(),
                    "quantity": act.get("quantity") or act.get("return_quantity"),
                    "new_product_id": act.get("new_product_id") or act.get("product_id") or act.get("approved_product_id"),
                    "new_quantity": act.get("new_quantity"),
                    "reason": (act.get("reason") or act.get("note") or "").strip(),
                })
        return normalized

    # Priority 2: single-item action encoded at top-level
    item_id = raw_values.get("contract_item_id") or raw_values.get("item_id")
    action = (raw_values.get("action") or raw_values.get("item_action") or "").upper()
    if item_id or action:
        return [{
            "contract_item_id": item_id,
            "action": action or "RETURN",
            "quantity": raw_values.get("quantity") or raw_values.get("return_quantity"),
            "new_product_id": raw_values.get("new_product_id") or raw_values.get("product_id") or raw_values.get("approved_product_id"),
            "new_quantity": raw_values.get("new_quantity"),
            "reason": (raw_values.get("reason") or raw_values.get("note") or "").strip(),
        }]

    # Fallback: if approved_product_id provided without item_id on a 1-item contract
    new_pid = raw_values.get("approved_product_id") or raw_values.get("product_id") or raw_values.get("new_product_id")
    if new_pid:
        return [{
            "contract_item_id": None,
            "action": "UPGRADE",
            "new_product_id": new_pid,
            "quantity": raw_values.get("quantity", 1),
            "reason": (raw_values.get("reason") or raw_values.get("note") or "").strip(),
        }]

    return []


def validate_item_actions_for_subscription(
    subscription: Subscription,
    actions: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Validate item actions against an active RENT or LEASE subscription."""
    if subscription.plan_type not in (PlanType.RENT, PlanType.LEASE):
        raise ValidationError(
            f"Flexible product amendments are only supported for RENT and LEASE contracts (got {subscription.plan_type}). "
            "Advance EMI contracts must follow strict single-product recontracting."
        )

    if subscription.status in _TERMINAL_STATUSES:
        raise ValidationError(
            f"Contract SUB-{subscription.id} is in terminal status '{subscription.status}' and cannot be amended."
        )

    if not actions:
        raise ValidationError("At least one item action (RETURN, CLOSE, UPGRADE, or ADD) is required.")

    active_items = list(subscription.contract_items.filter(status="ACTIVE").order_by("id"))
    if not active_items:
        raise ValidationError(f"Contract SUB-{subscription.id} has no active contract items to amend.")

    items_by_id = {it.id: it for it in active_items}
    validated_actions = []

    # Track simulated post-amendment active count to ensure contract doesn't become empty
    simulated_surviving_items = set(items_by_id.keys())

    for idx, act in enumerate(actions):
        action_name = act.get("action", "").upper()
        if action_name not in {"RETURN", "CLOSE", "UPGRADE", "ADD"}:
            raise ValidationError(
                f"Action #{idx + 1}: Unsupported action '{action_name}'. Must be RETURN, CLOSE, UPGRADE, or ADD."
            )

        item_id = act.get("contract_item_id")
        target_item: ContractItem | None = None

        if action_name in {"RETURN", "CLOSE", "UPGRADE"}:
            if not item_id and len(active_items) == 1:
                target_item = active_items[0]
                item_id = target_item.id
            elif item_id:
                try:
                    item_id = int(item_id)
                except (ValueError, TypeError):
                    raise ValidationError(f"Action #{idx + 1}: Invalid contract_item_id '{item_id}'.")
                target_item = items_by_id.get(item_id)
                if not target_item:
                    raise ValidationError(
                        f"Action #{idx + 1}: ContractItem #{item_id} is not an active item on contract SUB-{subscription.id}."
                    )
            else:
                raise ValidationError(
                    f"Action #{idx + 1}: contract_item_id is required because contract has multiple items."
                )

        if action_name == "RETURN":
            assert target_item is not None
            raw_qty = act.get("quantity")
            if raw_qty is None or raw_qty == "":
                return_qty = target_item.quantity
            else:
                try:
                    return_qty = int(raw_qty)
                except (ValueError, TypeError):
                    raise ValidationError(f"Action #{idx + 1}: Return quantity must be an integer.")
            if return_qty <= 0 or return_qty > target_item.quantity:
                raise ValidationError(
                    f"Action #{idx + 1}: Return quantity must be between 1 and available quantity ({target_item.quantity})."
                )
            if return_qty == target_item.quantity:
                simulated_surviving_items.discard(target_item.id)
            validated_actions.append({
                "action": "RETURN",
                "contract_item_id": target_item.id,
                "target_item": target_item,
                "return_quantity": return_qty,
                "is_full_return": return_qty == target_item.quantity,
                "reason": act.get("reason", ""),
            })

        elif action_name == "CLOSE":
            assert target_item is not None
            simulated_surviving_items.discard(target_item.id)
            validated_actions.append({
                "action": "CLOSE",
                "contract_item_id": target_item.id,
                "target_item": target_item,
                "reason": act.get("reason", ""),
            })

        elif action_name == "UPGRADE":
            assert target_item is not None
            new_pid = act.get("new_product_id")
            if not new_pid:
                raise ValidationError(f"Action #{idx + 1}: Upgrade requires new_product_id.")
            try:
                new_product = Product.objects.get(pk=int(new_pid))
            except (Product.DoesNotExist, ValueError, TypeError):
                raise ValidationError(f"Action #{idx + 1}: Target product #{new_pid} does not exist.")

            if not getattr(new_product, "is_active", True):
                raise ValidationError(f"Action #{idx + 1}: Product '{new_product.name}' is inactive.")

            if subscription.plan_type == PlanType.RENT and not getattr(new_product, "is_rent_enabled", False):
                raise ValidationError(f"Action #{idx + 1}: Product '{new_product.name}' is not enabled for RENT.")
            if subscription.plan_type == PlanType.LEASE and not getattr(new_product, "is_lease_enabled", False):
                raise ValidationError(f"Action #{idx + 1}: Product '{new_product.name}' is not enabled for LEASE.")

            new_qty = int(act.get("new_quantity") or target_item.quantity)
            if new_qty <= 0:
                raise ValidationError(f"Action #{idx + 1}: New quantity must be positive.")

            validated_actions.append({
                "action": "UPGRADE",
                "contract_item_id": target_item.id,
                "target_item": target_item,
                "new_product": new_product,
                "new_quantity": new_qty,
                "monthly_yield_percent": target_item.monthly_yield_percent,
                "security_deposit_percent": target_item.security_deposit_percent,
                "reason": act.get("reason", ""),
            })

        elif action_name == "ADD":
            pid = act.get("new_product_id") or act.get("product_id")
            if not pid:
                raise ValidationError(f"Action #{idx + 1}: Adding item requires product_id.")
            try:
                product = Product.objects.get(pk=int(pid))
            except (Product.DoesNotExist, ValueError, TypeError):
                raise ValidationError(f"Action #{idx + 1}: Product #{pid} does not exist.")

            if not getattr(product, "is_active", True):
                raise ValidationError(f"Action #{idx + 1}: Product '{product.name}' is inactive.")
            if subscription.plan_type == PlanType.RENT and not getattr(product, "is_rent_enabled", False):
                raise ValidationError(f"Action #{idx + 1}: Product '{product.name}' is not enabled for RENT.")
            if subscription.plan_type == PlanType.LEASE and not getattr(product, "is_lease_enabled", False):
                raise ValidationError(f"Action #{idx + 1}: Product '{product.name}' is not enabled for LEASE.")

            add_qty = int(act.get("quantity") or 1)
            if add_qty <= 0:
                raise ValidationError(f"Action #{idx + 1}: Quantity must be positive.")

            yield_pct = Decimal(str(act.get("monthly_yield_percent") or "5.00"))
            deposit_pct = Decimal(str(act.get("security_deposit_percent") or "20.00"))

            validated_actions.append({
                "action": "ADD",
                "product": product,
                "quantity": add_qty,
                "monthly_yield_percent": yield_pct,
                "security_deposit_percent": deposit_pct,
                "reason": act.get("reason", ""),
            })
            simulated_surviving_items.add(-999)  # Added item ensures contract is not empty

    if not simulated_surviving_items:
        raise ValidationError(
            "Contract amendment cannot remove all products. At least one active product must remain. "
            "To terminate the entire contract, use contract cancellation."
        )

    return validated_actions


def preview_rent_lease_item_amendment(amendment: ContractAmendment) -> dict[str, Any]:
    """Generate a comprehensive preview of multi-product changes and financial impact."""
    source = amendment.source_contract()
    if not source:
        raise ValidationError({"detail": "Source rent/lease contract is required for preview."})

    active_items = list(source.contract_items.filter(status="ACTIVE").order_by("id"))
    current_items_data = [_serialize_item(it) for it in active_items]

    current_product_value = sum((it.total_base_price for it in active_items), MONEY_ZERO)
    current_monthly_amount = sum((it.monthly_amount for it in active_items), MONEY_ZERO)
    current_deposit_amount = sum((it.security_deposit_amount for it in active_items), MONEY_ZERO)
    current_total_amount = Decimal(str(source.total_amount or MONEY_ZERO))

    raw_actions = normalize_item_actions(amendment.requested_values or amendment.new_values or {})
    blockers: list[str] = []
    validated_actions: list[dict[str, Any]] = []

    try:
        validated_actions = validate_item_actions_for_subscription(source, raw_actions)
    except ValidationError as err:
        if hasattr(err, "message_dict"):
            blockers.extend([f"{k}: {v}" for k, v in err.message_dict.items()])
        elif hasattr(err, "messages"):
            blockers.extend(err.messages)
        else:
            blockers.append(str(err))

    # Simulate proposed items
    proposed_items_data: list[dict[str, Any]] = []
    if not blockers and validated_actions:
        # Build simulation dictionary
        sim_items: dict[int, dict[str, Any]] = {}
        for it in active_items:
            sim_items[it.id] = {
                "id": it.id,
                "product_id": it.product_id,
                "product_name": getattr(it.product, "name", "Product"),
                "product_code": getattr(it.product, "product_code", ""),
                "quantity": it.quantity,
                "unit_base_price": it.unit_base_price,
                "monthly_yield_percent": it.monthly_yield_percent,
                "security_deposit_percent": it.security_deposit_percent,
                "action": "KEEP",
            }

        added_counter = -1
        for act in validated_actions:
            action_name = act["action"]
            if action_name == "RETURN":
                iid = act["contract_item_id"]
                if act["is_full_return"]:
                    sim_items[iid]["action"] = "RETURNED"
                    sim_items[iid]["quantity"] = 0
                else:
                    sim_items[iid]["quantity"] -= act["return_quantity"]
                    sim_items[iid]["action"] = "PARTIAL_RETURN"
            elif action_name == "CLOSE":
                iid = act["contract_item_id"]
                sim_items[iid]["action"] = "CLOSED"
                sim_items[iid]["quantity"] = 0
            elif action_name == "UPGRADE":
                iid = act["contract_item_id"]
                sim_items[iid]["action"] = "UPGRADED_OLD"
                sim_items[iid]["quantity"] = 0
                # Add proposed upgraded item
                np = act["new_product"]
                sim_items[added_counter] = {
                    "id": added_counter,
                    "product_id": np.id,
                    "product_name": np.name,
                    "product_code": getattr(np, "product_code", ""),
                    "quantity": act["new_quantity"],
                    "unit_base_price": getattr(np, "base_price", MONEY_ZERO),
                    "monthly_yield_percent": act["monthly_yield_percent"],
                    "security_deposit_percent": act["security_deposit_percent"],
                    "action": "UPGRADED_NEW",
                }
                added_counter -= 1
            elif action_name == "ADD":
                p = act["product"]
                sim_items[added_counter] = {
                    "id": added_counter,
                    "product_id": p.id,
                    "product_name": p.name,
                    "product_code": getattr(p, "product_code", ""),
                    "quantity": act["quantity"],
                    "unit_base_price": getattr(p, "base_price", MONEY_ZERO),
                    "monthly_yield_percent": act["monthly_yield_percent"],
                    "security_deposit_percent": act["security_deposit_percent"],
                    "action": "ADDED",
                }
                added_counter -= 1

        proposed_product_value = MONEY_ZERO
        proposed_monthly_amount = MONEY_ZERO
        proposed_deposit_amount = MONEY_ZERO

        for s_item in sim_items.values():
            qty = s_item["quantity"]
            if qty > 0:
                tbp = _q2(s_item["unit_base_price"] * Decimal(qty))
                ma = _q2(tbp * s_item["monthly_yield_percent"] / Decimal("100.00"))
                sda = _q2(tbp * s_item["security_deposit_percent"] / Decimal("100.00"))
                proposed_product_value += tbp
                proposed_monthly_amount += ma
                proposed_deposit_amount += sda
                proposed_items_data.append({
                    "id": s_item["id"],
                    "product_id": s_item["product_id"],
                    "product_name": s_item["product_name"],
                    "product_code": s_item["product_code"],
                    "quantity": qty,
                    "unit_base_price": str(s_item["unit_base_price"]),
                    "total_base_price": str(tbp),
                    "monthly_yield_percent": str(s_item["monthly_yield_percent"]),
                    "monthly_amount": str(ma),
                    "security_deposit_percent": str(s_item["security_deposit_percent"]),
                    "security_deposit_amount": str(sda),
                    "action_tag": s_item["action"],
                })

        tenure = int(source.tenure_months or 0)
        proposed_total_amount = _q2(proposed_monthly_amount * Decimal(tenure))
    else:
        proposed_product_value = current_product_value
        proposed_monthly_amount = current_monthly_amount
        proposed_deposit_amount = current_deposit_amount
        proposed_total_amount = current_total_amount

    # Count pending demands
    from subscriptions.models import RentLeaseBillingDemand
    pending_demands = RentLeaseBillingDemand.objects.filter(
        subscription=source,
        demand_type=_monthly_demand_type(source),
        status=RentLeaseDemandStatus.PENDING,
        collected_amount=MONEY_ZERO,
    ).count()

    return {
        "amendment_id": amendment.pk,
        "amendment_type": amendment.amendment_type,
        "amendment_status": amendment.status,
        "contract_type": amendment.contract_type,
        "current_contract_id": source.pk,
        "current_contract_reference": source.contract_reference or source.subscription_number,
        "customer_id": source.customer_id,
        "customer_name": source.customer.name if source.customer else None,
        "current_product": getattr(source.product, "name", None),
        "requested_product_id": None,
        "current_items": current_items_data,
        "proposed_items": proposed_items_data,
        "item_actions": raw_actions,
        "current_product_value": str(current_product_value),
        "proposed_product_value": str(proposed_product_value),
        "product_value_difference": str(proposed_product_value - current_product_value),
        "current_monthly_amount": str(current_monthly_amount),
        "proposed_monthly_amount": str(proposed_monthly_amount),
        "monthly_amount_difference": str(proposed_monthly_amount - current_monthly_amount),
        "current_tenure_months": source.tenure_months,
        "requested_tenure_months": source.tenure_months,
        "current_total_amount": str(current_total_amount),
        "proposed_total_amount": str(proposed_total_amount),
        "total_amount_difference": str(proposed_total_amount - current_total_amount),
        "current_deposit_amount": str(current_deposit_amount),
        "proposed_deposit_amount": str(proposed_deposit_amount),
        "deposit_difference": str(proposed_deposit_amount - current_deposit_amount),
        "pending_demand_count": str(pending_demands),
        "demand_schedule_impact_summary": (
            f"Updates {pending_demands} future monthly demand(s) from "
            f"₹{current_monthly_amount} to ₹{proposed_monthly_amount}."
            if pending_demands > 0 else "No pending uncollected monthly demands."
        ),
        "deposit_liability_risk": (
            "Security deposit adjustment required."
            if proposed_deposit_amount != current_deposit_amount else "Security deposit unchanged."
        ),
        "accounting_impact_category": "Updated rental schedule ledger entries.",
        "reconciliation_impact_category": "Contract value re-aligned to active item inventory.",
        "delivery_possession_risk": "Requires store staff to verify returned or exchanged furniture asset.",
        "execution_supported": len(blockers) == 0,
        "blocker_reasons": blockers,
    }


@transaction.atomic
def apply_rent_lease_item_amendment(
    *,
    amendment: ContractAmendment,
    performed_by,
) -> ContractAmendment:
    """Execute product contract amendment on a RENT or LEASE subscription.

    Atomically updates ContractItems, Subscription financial totals, Rent/Lease profile
    deposit, and pending uncollected billing demands. Preserves append-only auditability.
    """
    locked_amendment = ContractAmendment.objects.select_for_update().get(pk=amendment.pk)
    if locked_amendment.status == "IMPLEMENTED":
        raise ValidationError({"detail": "This amendment is already implemented."})
    if locked_amendment.status != "APPROVED":
        raise ValidationError(
            {"detail": f"Cannot implement amendment in status '{locked_amendment.status}'. Must be APPROVED."}
        )

    source = locked_amendment.source_contract()
    if not source:
        raise ValidationError({"detail": "Source contract is missing on amendment."})

    subscription = Subscription.objects.select_for_update().get(pk=source.pk)
    if subscription.plan_type not in (PlanType.RENT, PlanType.LEASE):
        raise ValidationError({"detail": f"Invalid plan type '{subscription.plan_type}' for rent/lease amendment."})

    actions_raw = normalize_item_actions(
        locked_amendment.approved_values
        if (locked_amendment.approved_values and len(locked_amendment.approved_values) > 0)
        else locked_amendment.requested_values
    )
    validated_actions = validate_item_actions_for_subscription(subscription, actions_raw)

    before_items = [_serialize_item(it) for it in subscription.contract_items.filter(status="ACTIVE").order_by("id")]
    before_totals = {
        "monthly_amount": str(subscription.monthly_amount),
        "total_amount": str(subscription.total_amount),
        "product_id": subscription.product_id,
        "items_count": len(before_items),
    }

    now = timezone.now()

    # Apply actions to ContractItems
    for act in validated_actions:
        action_name = act["action"]
        if action_name == "RETURN":
            target_item = act["target_item"]
            ret_qty = act["return_quantity"]
            if act["is_full_return"]:
                target_item.status = "RETURNED"
                target_item.returned_quantity += ret_qty
                target_item.returned_at = now
                target_item.notes = act.get("reason", "Customer returned item")
                target_item.save(update_fields=["status", "returned_quantity", "returned_at", "notes"])
            else:
                target_item.quantity -= ret_qty
                target_item.returned_quantity += ret_qty
                target_item.notes = act.get("reason", f"Customer returned {ret_qty} unit(s)")
                dep_pct = Decimal(str(target_item.security_deposit_percent or Decimal("20.00")))
                t_base = _q2(target_item.unit_base_price * Decimal(target_item.quantity))
                target_item.total_base_price = t_base
                target_item.monthly_amount = _q2(t_base * target_item.monthly_yield_percent / Decimal("100.00"))
                target_item.security_deposit_amount = _q2(t_base * dep_pct / Decimal("100.00"))
                target_item.save()

        elif action_name == "CLOSE":
            target_item = act["target_item"]
            target_item.status = "CLOSED"
            target_item.returned_quantity += target_item.quantity
            target_item.returned_at = now
            target_item.notes = act.get("reason", "Item closed by amendment")
            target_item.save(update_fields=["status", "returned_quantity", "returned_at", "notes"])

        elif action_name == "UPGRADE":
            target_item = act["target_item"]
            target_item.status = "UPGRADED"
            target_item.returned_at = now
            target_item.notes = act.get("reason", f"Upgraded to {act['new_product'].name}")
            target_item.save(update_fields=["status", "returned_at", "notes"])

            # Create new active item for the upgraded product
            np = act["new_product"]
            unit_price = getattr(np, "base_price", MONEY_ZERO)
            ContractItem.objects.create(
                subscription=subscription,
                product=np,
                quantity=act["new_quantity"],
                unit_base_price=unit_price,
                monthly_yield_percent=act["monthly_yield_percent"],
                security_deposit_percent=act["security_deposit_percent"],
                notes=f"Upgraded from Item #{target_item.id} ({getattr(target_item.product, 'name', '')})",
            )

        elif action_name == "ADD":
            p = act["product"]
            unit_price = getattr(p, "base_price", MONEY_ZERO)
            ContractItem.objects.create(
                subscription=subscription,
                product=p,
                quantity=act["quantity"],
                unit_base_price=unit_price,
                monthly_yield_percent=act["monthly_yield_percent"],
                security_deposit_percent=act["security_deposit_percent"],
                notes=act.get("reason", "Added via contract amendment"),
            )

    # Recalculate Subscription and Profile from active items
    surviving_items = list(subscription.contract_items.filter(status="ACTIVE").select_related("product").order_by("id"))
    if not surviving_items:
        raise ValidationError({"detail": "Cannot implement amendment: zero active contract items remaining."})

    new_product_value = sum((it.total_base_price for it in surviving_items), MONEY_ZERO)
    new_monthly_amount = sum((it.monthly_amount for it in surviving_items), MONEY_ZERO)
    new_deposit_amount = sum((it.security_deposit_amount for it in surviving_items), MONEY_ZERO)
    new_total_amount = _q2(new_monthly_amount * Decimal(subscription.tenure_months or 0))

    primary_product = surviving_items[0].product
    subscription.product = primary_product
    subscription.monthly_amount = new_monthly_amount
    subscription.total_amount = new_total_amount

    items_snapshot = [
        {
            "product_id": it.product_id,
            "product_name": getattr(it.product, "name", ""),
            "product_code": getattr(it.product, "product_code", ""),
            "quantity": it.quantity,
            "unit_base_price": str(it.unit_base_price),
            "total_base_price": str(it.total_base_price),
            "monthly_yield_percent": str(it.monthly_yield_percent),
            "monthly_amount": str(it.monthly_amount),
            "security_deposit_percent": str(it.security_deposit_percent),
            "security_deposit_amount": str(it.security_deposit_amount),
            "status": it.status,
        }
        for it in surviving_items
    ]

    subscription.product_snapshot = {
        **(subscription.product_snapshot or {}),
        "product_id": primary_product.id,
        "product_code": getattr(primary_product, "product_code", ""),
        "name": getattr(primary_product, "name", ""),
        "items_count": len(surviving_items),
        "items": items_snapshot,
    }

    subscription.pricing_snapshot = {
        **(subscription.pricing_snapshot or {}),
        "monthly_amount": str(new_monthly_amount),
        "total_amount": str(new_total_amount),
        "total_product_value": str(new_product_value),
        "items_count": len(surviving_items),
    }

    subscription.save(update_fields=["product", "monthly_amount", "total_amount", "product_snapshot", "pricing_snapshot"])

    # Update profile deposit
    effective_deposit_percent = (
        (new_deposit_amount * Decimal("100.00") / new_product_value).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        if new_product_value > MONEY_ZERO else Decimal("20.00")
    )

    if subscription.plan_type == PlanType.RENT and hasattr(subscription, "rent_profile"):
        rent_prof = subscription.rent_profile
        rent_prof.security_deposit_amount = new_deposit_amount
        rent_prof.refundable_security_deposit = new_deposit_amount
        rent_prof.security_deposit_percent = effective_deposit_percent
        rent_prof.save(update_fields=["security_deposit_amount", "refundable_security_deposit", "security_deposit_percent"])
    elif subscription.plan_type == PlanType.LEASE and hasattr(subscription, "lease_profile"):
        lease_prof = subscription.lease_profile
        lease_prof.security_deposit_amount = new_deposit_amount
        lease_prof.security_deposit_percent = effective_deposit_percent
        lease_prof.save(update_fields=["security_deposit_amount", "security_deposit_percent"])

    # Update future uncollected monthly billing demands
    from subscriptions.models import RentLeaseBillingDemand
    uncollected_demands = RentLeaseBillingDemand.objects.filter(
        subscription=subscription,
        demand_type=_monthly_demand_type(subscription),
        status=RentLeaseDemandStatus.PENDING,
        collected_amount=MONEY_ZERO,
    )
    demands_updated_count = uncollected_demands.update(amount=new_monthly_amount)

    after_items = [_serialize_item(it) for it in surviving_items]
    after_totals = {
        "monthly_amount": str(new_monthly_amount),
        "total_amount": str(new_total_amount),
        "product_id": subscription.product_id,
        "items_count": len(surviving_items),
        "deposit_amount": str(new_deposit_amount),
    }

    # Mark amendment as implemented
    locked_amendment.status = "IMPLEMENTED"
    locked_amendment.implemented_by = performed_by
    locked_amendment.implemented_at = now
    locked_amendment.implemented_values = {
        "phase": "RENT_LEASE_FLEXIBLE_ITEM_AMENDMENT",
        "contract_type": "RENT_LEASE",
        "actions_executed": actions_raw,
        "before": {"totals": before_totals, "items": before_items},
        "after": {"totals": after_totals, "items": after_items},
        "updated_uncollected_demands_count": demands_updated_count,
    }
    locked_amendment.metadata = {
        **(locked_amendment.metadata or {}),
        "implementation_phase": "RENT_LEASE_FLEXIBLE_ITEM_AMENDMENT",
        "demands_updated_count": demands_updated_count,
    }
    locked_amendment.save(update_fields=["status", "implemented_by", "implemented_at", "implemented_values", "metadata", "updated_at"])

    log_audit(
        action_type=AuditLog.ActionType.CONTRACT_AMENDMENT_IMPLEMENTED,
        instance=subscription,
        performed_by=performed_by,
        metadata={
            "amendment_id": locked_amendment.pk,
            "amendment_no": locked_amendment.amendment_no,
            "amendment_type": locked_amendment.amendment_type,
            "contract_type": "RENT_LEASE",
            "subscription_id": subscription.id,
            "before_monthly_amount": before_totals["monthly_amount"],
            "new_monthly_amount": str(new_monthly_amount),
            "surviving_items_count": len(surviving_items),
            "uncollected_demands_updated": demands_updated_count,
        },
    )

    return locked_amendment
