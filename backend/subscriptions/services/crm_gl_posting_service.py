"""
GL Posting Service for CRM Approvals
Auto-post accounting entries when leads are approved
"""

from decimal import Decimal
from django.utils import timezone
from django.contrib.auth.models import User

from subscriptions.models_crm_pipeline import CRMPipeline


def post_approval_to_accounting(contract, contract_type: str, approval_user: User):
    """
    Post contract to accounting system (GL entries).
    Called after contract approval to update ledgers.

    Args:
        contract: DirectSale/Subscription/RentProfile/LeaseProfile object
        contract_type: 'DIRECT_SALE', 'SUBSCRIPTION', 'RENT', 'LEASE'
        approval_user: User who approved
    """
    try:
        # Get contract details
        customer = getattr(contract, 'customer', None)
        if not customer:
            return None

        amount = get_contract_amount(contract, contract_type)

        if amount <= 0:
            return None

        # Create GL entries
        gl_entry = create_receivable_entry(
            contract=contract,
            contract_type=contract_type,
            customer=customer,
            amount=amount,
            approval_user=approval_user,
        )

        return gl_entry

    except Exception as e:
        print(f"Error posting to accounting: {str(e)}")
        return None


def get_contract_amount(contract, contract_type: str) -> Decimal:
    """Get contract amount based on type"""
    if contract_type == 'DIRECT_SALE':
        return contract.grand_total or Decimal('0')
    elif contract_type in ['SUBSCRIPTION', 'RENT', 'LEASE']:
        return contract.total_amount or Decimal('0')
    return Decimal('0')


def create_receivable_entry(contract, contract_type: str, customer, amount: Decimal, approval_user: User):
    """
    Create GL entry for Accounts Receivable.

    Entry format:
    DR: Accounts Receivable (Asset)       {amount}
    CR: Revenue / Service Income          {amount}
    """
    try:
        from accounting.models import GLEntry, Account

        # Get or create accounts
        ar_account = Account.objects.get(
            account_type='ASSET',
            name__icontains='Accounts Receivable'
        )

        revenue_account = Account.objects.get(
            account_type='INCOME',
            name__icontains='Service Revenue'
        )

        # Create GL entries (debit and credit)
        # Debit: AR
        gl_debit = GLEntry.objects.create(
            account=ar_account,
            debit=amount,
            credit=Decimal('0'),
            description=f'{contract_type} approval - Customer: {customer.name}',
            entity_type=type(contract).__name__,
            entity_id=contract.id,
            posted_by=approval_user,
            posted_at=timezone.now(),
        )

        # Credit: Revenue
        gl_credit = GLEntry.objects.create(
            account=revenue_account,
            debit=Decimal('0'),
            credit=amount,
            description=f'{contract_type} approval - Customer: {customer.name}',
            entity_type=type(contract).__name__,
            entity_id=contract.id,
            posted_by=approval_user,
            posted_at=timezone.now(),
        )

        return gl_debit

    except Exception as e:
        print(f"Error creating GL entries: {str(e)}")
        return None


def get_accounting_summary(days: int = 30):
    """
    Get accounting summary for CRM approvals.
    Shows revenue posted by approval type and stage.
    """
    from django.utils import timezone
    from datetime import timedelta
    from django.db.models import Sum

    end_date = timezone.now()
    start_date = end_date - timedelta(days=days)

    pipelines = CRMPipeline.objects.filter(
        approved_at__range=[start_date, end_date],
        converted_to__isnull=False
    )

    summary = {
        'total_revenue_posted': float(pipelines.aggregate(Sum('revenue'))['revenue__sum'] or 0),
        'by_type': {},
        'by_stage': {},
        'period_days': days,
    }

    # Group by contract type
    for ctype in ['DIRECT_SALE', 'SUBSCRIPTION', 'RENT', 'LEASE']:
        total = float(
            pipelines.filter(converted_to=ctype).aggregate(Sum('revenue'))['revenue__sum'] or 0
        )
        summary['by_type'][ctype] = total

    # Group by stage
    for stage in ['LEAD', 'ENQUIRY', 'QUOTED', 'APPROVED', 'CONVERTED']:
        total = float(
            pipelines.filter(current_stage=stage).aggregate(Sum('revenue'))['revenue__sum'] or 0
        )
        summary['by_stage'][stage] = total

    return summary
