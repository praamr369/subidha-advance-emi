from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db.models import Prefetch

from subscriptions.models import (
    Emi,
    EmiStatus,
    FinancialLedger,
    LedgerDirection,
    LedgerEntryType,
    MONEY_ZERO,
    Payment,
    Subscription,
)
from subscriptions.services.emi_reconciliation import (
    effective_paid_for_emi,
    effective_paid_for_subscription,
    reconcile_emi_ledger,
    reconcile_subscription_emis,
)


def q2(value: Decimal) -> Decimal:
    return (value or MONEY_ZERO).quantize(Decimal("0.01"))


def _is_payment_reversed(payment: Payment) -> bool:
    metadata = payment.allocation_metadata or {}
    reversal = metadata.get("reversal") or {}
    return bool(reversal.get("is_reversed"))


class Command(BaseCommand):
    help = "Validate financial integrity for subscriptions, EMIs, payments, and ledger consistency (read-only)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--only-inconsistent",
            action="store_true",
            help="Show only inconsistent subscription summary rows.",
        )
        parser.add_argument(
            "--subscription-id",
            type=int,
            help="Restrict validation to a single subscription id.",
        )
        parser.add_argument(
            "--batch-id",
            type=int,
            help="Restrict validation to subscriptions in a batch.",
        )

    def handle(self, *args, **options):
        inconsistencies: list[str] = []

        only_inconsistent = options.get("only_inconsistent", False)
        subscription_id = options.get("subscription_id")
        batch_id = options.get("batch_id")

        subscriptions = Subscription.objects.all().order_by("id")
        if subscription_id:
            subscriptions = subscriptions.filter(id=subscription_id)
        if batch_id:
            subscriptions = subscriptions.filter(batch_id=batch_id)

        subscriptions = subscriptions.prefetch_related(
            Prefetch(
                "emis",
                queryset=Emi.objects.prefetch_related(
                    "payments",
                    "ledger_entries",
                ).order_by("month_no"),
            ),
            Prefetch(
                "payments",
                queryset=Payment.objects.select_related("emi").order_by("id"),
            ),
        )

        checked_count = 0
        flagged_count = 0

        for subscription in subscriptions.iterator(chunk_size=200):
            checked_count += 1

            emis = list(subscription.emis.all())
            payments = list(subscription.payments.all())

            reconciliation = reconcile_subscription_emis(subscription)

            total_due = q2(sum((emi.amount for emi in emis), start=MONEY_ZERO))
            effective_paid = effective_paid_for_subscription(subscription)
            waived = q2(
                sum(
                    (emi.amount for emi in emis if emi.status == EmiStatus.WAIVED),
                    start=MONEY_ZERO,
                )
            )
            outstanding = q2(total_due - effective_paid - waived)
            if outstanding < MONEY_ZERO:
                outstanding = MONEY_ZERO

            subscription_consistent = (
                q2(subscription.total_amount) == total_due
                and q2(subscription.total_amount)
                == q2(effective_paid + waived + outstanding)
                and bool(reconciliation.get("is_consistent"))
            )

            # -----------------------------------------------------------------
            # EMI-level checks
            # -----------------------------------------------------------------
            for emi in emis:
                emi_effective_paid = effective_paid_for_emi(emi)
                emi_waived = q2(emi.amount) if emi.status == EmiStatus.WAIVED else MONEY_ZERO
                emi_outstanding = q2(emi.amount - emi_effective_paid - emi_waived)
                if emi_outstanding < MONEY_ZERO:
                    emi_outstanding = MONEY_ZERO

                expected_emi_status = (
                    EmiStatus.WAIVED
                    if emi.status == EmiStatus.WAIVED
                    else (EmiStatus.PAID if emi_effective_paid >= q2(emi.amount) else EmiStatus.PENDING)
                )

                emi_consistent = q2(emi.amount) == q2(
                    emi_effective_paid + emi_waived + emi_outstanding
                )

                if not emi_consistent:
                    inconsistencies.append(
                        f"Subscription {subscription.id}: EMI {emi.id} invariant failed | "
                        f"amount={emi.amount} effective_paid={emi_effective_paid} "
                        f"waived={emi_waived} outstanding={emi_outstanding}"
                    )

                if emi.status != expected_emi_status:
                    inconsistencies.append(
                        f"Subscription {subscription.id}: EMI {emi.id} status mismatch | "
                        f"stored={emi.status} expected={expected_emi_status}"
                    )

                ledger_check = reconcile_emi_ledger(emi)
                if not ledger_check["is_consistent"]:
                    inconsistencies.append(
                        f"Subscription {subscription.id}: EMI {emi.id} ledger mismatch | "
                        f"payment_effective_total={ledger_check['payment_effective_total']} "
                        f"ledger_net_total={ledger_check['ledger_net_total']}"
                    )

            # -----------------------------------------------------------------
            # Payment-level checks
            # -----------------------------------------------------------------
            seen_references: dict[str, int] = {}

            for payment in payments:
                reference_no = (payment.reference_no or "").strip()
                if reference_no:
                    if reference_no in seen_references:
                        inconsistencies.append(
                            f"Subscription {subscription.id}: duplicate payment reference | "
                            f"reference_no={reference_no} first_payment={seen_references[reference_no]} second_payment={payment.id}"
                        )
                    else:
                        seen_references[reference_no] = payment.id

                if payment.emi_id is None:
                    inconsistencies.append(
                        f"Subscription {subscription.id}: Payment {payment.id} is not linked to an EMI"
                    )
                    continue

                if payment.subscription_id != payment.emi.subscription_id:
                    inconsistencies.append(
                        f"Subscription {subscription.id}: Payment {payment.id} subscription/EMI mismatch | "
                        f"payment_subscription={payment.subscription_id} emi_subscription={payment.emi.subscription_id}"
                    )

                if not _is_payment_reversed(payment):
                    ledger_entry = getattr(payment, "ledger_entry", None)
                    if ledger_entry is None:
                        inconsistencies.append(
                            f"Subscription {subscription.id}: Payment {payment.id} missing ledger entry"
                        )
                    else:
                        if ledger_entry.entry_type != LedgerEntryType.EMI_PAYMENT:
                            inconsistencies.append(
                                f"Subscription {subscription.id}: Payment {payment.id} ledger entry type mismatch | "
                                f"stored={ledger_entry.entry_type} expected={LedgerEntryType.EMI_PAYMENT}"
                            )

                        if ledger_entry.entry_direction != LedgerDirection.CREDIT:
                            inconsistencies.append(
                                f"Subscription {subscription.id}: Payment {payment.id} ledger direction mismatch | "
                                f"stored={ledger_entry.entry_direction} expected={LedgerDirection.CREDIT}"
                            )

                        if q2(ledger_entry.amount) != q2(payment.amount):
                            inconsistencies.append(
                                f"Subscription {subscription.id}: Payment {payment.id} ledger amount mismatch | "
                                f"payment_amount={payment.amount} ledger_amount={ledger_entry.amount}"
                            )
                else:
                    reversal_exists = FinancialLedger.objects.filter(
                        entry_type=LedgerEntryType.PAYMENT_REVERSAL,
                        emi_id=payment.emi_id,
                        allocation_context__reversed_payment_id=payment.id,
                    ).exists()

                    if not reversal_exists:
                        inconsistencies.append(
                            f"Subscription {subscription.id}: Reversed payment {payment.id} missing compensating reversal ledger entry"
                        )

            # -----------------------------------------------------------------
            # Orphan reversal ledger checks
            # -----------------------------------------------------------------
            reversal_ledgers = FinancialLedger.objects.filter(
                emi__subscription=subscription,
                entry_type=LedgerEntryType.PAYMENT_REVERSAL,
            )

            for row in reversal_ledgers:
                reversed_payment_id = (row.allocation_context or {}).get("reversed_payment_id")
                if not reversed_payment_id:
                    inconsistencies.append(
                        f"Subscription {subscription.id}: Reversal ledger {row.id} missing reversed_payment_id in allocation_context"
                    )
                    continue

                try:
                    reversed_payment = next(p for p in payments if p.id == reversed_payment_id)
                except StopIteration:
                    inconsistencies.append(
                        f"Subscription {subscription.id}: Reversal ledger {row.id} references missing payment {reversed_payment_id}"
                    )
                    continue

                if not _is_payment_reversed(reversed_payment):
                    inconsistencies.append(
                        f"Subscription {subscription.id}: Reversal ledger {row.id} references payment {reversed_payment_id} that is not marked reversed"
                    )

            if not only_inconsistent or not subscription_consistent:
                consistent_label = "true" if subscription_consistent else "false"
                self.stdout.write(
                    f"Subscription ID: {subscription.id} | "
                    f"Paid: {effective_paid} | Waived: {waived} | Outstanding: {outstanding} | "
                    f"Consistent: {consistent_label}"
                )

            if not subscription_consistent:
                flagged_count += 1
                inconsistencies.append(
                    f"Subscription {subscription.id}: total={subscription.total_amount}, "
                    f"emi_total={total_due}, paid={effective_paid}, waived={waived}, "
                    f"outstanding={outstanding}"
                )

        self.stdout.write("")
        self.stdout.write("Summary:")
        self.stdout.write(f"- checked: {checked_count}")
        self.stdout.write(f"- flagged: {flagged_count}")

        self.stdout.write("")
        self.stdout.write("Inconsistencies:")
        if inconsistencies:
            for item in inconsistencies:
                self.stdout.write(f"- {item}")
        else:
            self.stdout.write("- none")