"""
Workbench Lead Workflow API
Full lead management integrated into workbench
"""

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from django.db import transaction
from django.utils import timezone

from subscriptions.models import PublicLead, Customer
from api.v1.permissions import IsAdmin


class WorkbenchLeadDetailView(APIView):
    """Get full lead details for a customer"""
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request, customer_id):
        """Get lead details for customer"""
        try:
            customer = Customer.objects.get(id=customer_id)

            # Get lead by multiple matching criteria
            lead = None

            # 1. Try converted customer link
            lead = PublicLead.objects.filter(
                converted_customer=customer
            ).first()

            # 2. Try email match
            if not lead and customer.user:
                lead = PublicLead.objects.filter(
                    email=customer.user.email
                ).first()

            # 3. Try phone match (most reliable)
            if not lead and customer.phone:
                lead = PublicLead.objects.filter(
                    phone=customer.phone
                ).first()

            # 4. Try name match
            if not lead and customer.name:
                lead = PublicLead.objects.filter(
                    name=customer.name
                ).first()

            if not lead:
                return Response({
                    "status": "success",
                    "data": None,
                    "message": "No lead assigned to this customer"
                })

            return Response({
                "status": "success",
                "data": {
                    "id": lead.id,
                    "name": lead.name,
                    "phone": lead.phone or "N/A",
                    "email": lead.email or "N/A",
                    "source": lead.customer_source or "Unknown",
                    "status": lead.status,
                    "stage": self._get_stage(lead.status),
                    "assigned_to": lead.assigned_to.get_full_name() if lead.assigned_to else "Unassigned",
                    "assigned_to_id": lead.assigned_to_id,
                    "notes": lead.notes or "",
                    "created_at": lead.created_at.isoformat(),
                    "next_stage": self._get_next_stage(lead.status),
                    "prev_stage": self._get_prev_stage(lead.status),
                }
            })

        except Customer.DoesNotExist:
            return Response(
                {"error": "Customer not found"},
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @staticmethod
    def _get_stage(status_val):
        """Map status to pipeline stage"""
        stages = {
            "NEW": "New Lead",
            "CONTACTED": "Contacted",
            "QUALIFIED": "Qualified",
            "PROPOSAL_SENT": "Proposal Sent",
            "NEGOTIATION": "Negotiating",
            "CONVERTED": "Won",
            "LOST": "Lost",
        }
        return stages.get(status_val, status_val)

    @staticmethod
    def _get_next_stage(status_val):
        """Get next stage in pipeline"""
        next_stages = {
            "NEW": "CONTACTED",
            "CONTACTED": "QUALIFIED",
            "QUALIFIED": "PROPOSAL_SENT",
            "PROPOSAL_SENT": "NEGOTIATION",
            "NEGOTIATION": "CONVERTED",
            "CONVERTED": None,
            "LOST": "QUALIFIED",
        }
        return next_stages.get(status_val)

    @staticmethod
    def _get_prev_stage(status_val):
        """Get previous stage in pipeline"""
        prev_stages = {
            "NEW": None,
            "CONTACTED": "NEW",
            "QUALIFIED": "CONTACTED",
            "PROPOSAL_SENT": "QUALIFIED",
            "NEGOTIATION": "PROPOSAL_SENT",
            "CONVERTED": "NEGOTIATION",
            "LOST": None,
        }
        return prev_stages.get(status_val)


class WorkbenchLeadUpdateView(APIView):
    """Update lead details"""
    permission_classes = [IsAuthenticated, IsAdmin]

    @transaction.atomic
    def post(self, request, customer_id, lead_id):
        """Update lead stage, status, or notes"""
        try:
            lead = PublicLead.objects.get(id=lead_id)

            # Update stage
            if "new_stage" in request.data:
                new_stage = request.data.get("new_stage")
                lead.status = new_stage

            # Update notes
            if "notes" in request.data:
                lead.notes = request.data.get("notes")

            # Update assignment
            if "assigned_to_id" in request.data:
                assigned_to_id = request.data.get("assigned_to_id")
                if assigned_to_id:
                    from django.contrib.auth.models import User
                    assigned_to = User.objects.get(id=assigned_to_id)
                    lead.assigned_to = assigned_to
                else:
                    lead.assigned_to = None

            lead.save()

            return Response({
                "status": "success",
                "message": "Lead updated successfully",
                "data": {
                    "id": lead.id,
                    "status": lead.status,
                    "stage": WorkbenchLeadDetailView._get_stage(lead.status),
                    "notes": lead.notes or "",
                    "assigned_to": lead.assigned_to.get_full_name() if lead.assigned_to else "Unassigned",
                }
            })

        except PublicLead.DoesNotExist:
            return Response(
                {"error": "Lead not found"},
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class WorkbenchLeadFollowUpView(APIView):
    """Manage lead follow-up tasks"""
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request, customer_id, lead_id):
        """Get follow-up tasks for lead"""
        try:
            from subscriptions.models import CRMFollowUpTask

            lead = PublicLead.objects.get(id=lead_id)
            tasks = CRMFollowUpTask.objects.filter(
                lead=lead
            ).order_by('-created_at')

            return Response({
                "status": "success",
                "data": [
                    {
                        "id": task.id,
                        "title": task.title or "Follow-up",
                        "description": task.description or "",
                        "due_date": task.due_date.isoformat() if task.due_date else None,
                        "status": task.status,
                        "created_at": task.created_at.isoformat(),
                    }
                    for task in tasks
                ][:10]  # Last 10 tasks
            })

        except PublicLead.DoesNotExist:
            return Response(
                {"error": "Lead not found"},
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @transaction.atomic
    def post(self, request, customer_id, lead_id):
        """Create follow-up task"""
        try:
            from subscriptions.models import CRMFollowUpTask

            lead = PublicLead.objects.get(id=lead_id)

            task = CRMFollowUpTask.objects.create(
                lead=lead,
                title=request.data.get("title", "Follow-up"),
                description=request.data.get("description", ""),
                due_date=request.data.get("due_date"),
                status="OPEN",
                created_by=request.user,
            )

            return Response({
                "status": "success",
                "message": "Follow-up task created",
                "data": {
                    "id": task.id,
                    "title": task.title,
                    "due_date": task.due_date.isoformat() if task.due_date else None,
                    "status": task.status,
                }
            })

        except PublicLead.DoesNotExist:
            return Response(
                {"error": "Lead not found"},
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


# URL Configuration
from django.urls import path

urlpatterns = [
    path(
        'admin/workbench/customer/<int:customer_id>/lead/',
        WorkbenchLeadDetailView.as_view(),
        name='workbench-lead-detail'
    ),
    path(
        'admin/workbench/customer/<int:customer_id>/lead/<int:lead_id>/update/',
        WorkbenchLeadUpdateView.as_view(),
        name='workbench-lead-update'
    ),
    path(
        'admin/workbench/customer/<int:customer_id>/lead/<int:lead_id>/followup/',
        WorkbenchLeadFollowUpView.as_view(),
        name='workbench-lead-followup'
    ),
]
