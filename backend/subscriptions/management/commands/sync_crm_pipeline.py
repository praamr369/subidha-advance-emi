"""Management command to sync OnlineRequest records to CRMPipeline"""

from django.core.management.base import BaseCommand
from subscriptions.models import OnlineRequest, PublicLead
from subscriptions.models_crm_pipeline import CRMPipeline


class Command(BaseCommand):
    help = 'Sync existing OnlineRequest records to CRMPipeline for unified workflow'

    def handle(self, *args, **options):
        online_requests = OnlineRequest.objects.all()
        created_count = 0
        updated_count = 0

        for req in online_requests:
            # Map approval_status to pipeline stage
            stage_mapping = {
                'DRAFT': 'LEAD',
                'QUOTED': 'QUOTED',
                'APPROVED': 'APPROVED',
                'CONVERTED': 'CONVERTED',
                'REJECTED': 'LOST',
                'LOST': 'LOST',
            }

            stage = stage_mapping.get(req.approval_status, 'LEAD')

            # Get or create PublicLead if needed
            lead = req.source_public_lead
            if not lead:
                lead, _ = PublicLead.objects.get_or_create(
                    name=req.customer.name if req.customer else 'Unknown',
                    defaults={
                        'phone': req.customer.phone if req.customer else '',
                        'email': req.customer.email if hasattr(req.customer, 'email') else '',
                    }
                )

            # Get or create CRMPipeline
            pipeline, created = CRMPipeline.objects.get_or_create(
                online_request=req,
                defaults={
                    'lead': lead,
                    'current_stage': stage,
                    'request_type': req.request_type,
                    'quoted_amount': float(req.total_amount or 0),
                    'probability': 50,
                    'expected_close_date': req.expected_close_date,
                    'notes': req.conversion_notes,
                }
            )

            if created:
                created_count += 1
                self.stdout.write(
                    self.style.SUCCESS(
                        f'[OK] Created pipeline for {req.request_number}'
                    )
                )
            else:
                # Update existing pipeline
                pipeline.current_stage = stage
                pipeline.request_type = req.request_type
                pipeline.quoted_amount = float(req.total_amount or 0)
                pipeline.expected_close_date = req.expected_close_date
                pipeline.approved_by = req.approved_by
                pipeline.approved_at = req.approved_at
                pipeline.notes = req.conversion_notes

                # Map approved entity type
                if req.approved_entity_type:
                    pipeline.converted_to = req.approved_entity_type
                    if stage == 'CONVERTED':
                        pipeline.current_stage = 'CONVERTED'

                # Set revenue if converted
                if req.approved_direct_sale:
                    pipeline.revenue = float(req.approved_direct_sale.grand_total or 0)
                    pipeline.converted_entity_id = req.approved_direct_sale.id
                elif req.approved_subscription:
                    pipeline.revenue = float(req.approved_subscription.total_amount or 0)
                    pipeline.converted_entity_id = req.approved_subscription.id

                pipeline.save()
                updated_count += 1
                self.stdout.write(
                    self.style.SUCCESS(
                        f'[OK] Updated pipeline for {req.request_number}'
                    )
                )

        self.stdout.write(
            self.style.SUCCESS(
                f'\n[OK] Sync complete: {created_count} created, {updated_count} updated'
            )
        )
