# Unified CRM Lead-to-Sale Fluid Workflow (Odoo-style)

## Vision
**Single unified CRM pipeline where leads flow seamlessly from inquiry → approval → auto-contract creation → sale tracking**

---

## Current vs Desired Workflow

### Current (Fragmented - Hard to Track)
```
Lead (PublicLead)
  ↓
OnlineRequest (DRAFT) - separate records for each type
  ├→ ProductRequest (SUBMITTED)
  ├→ SubscriptionRequest (PENDING)  
  ├→ RentProfile (DRAFT)
  └→ LeaseProfile (DRAFT)
  
Each creates separate approval flow - CONFUSING for operators
```

### Desired (Unified - Odoo-style)
```
Lead (PublicLead)
  ↓
Online Enquiry (OnlineRequest) - SINGLE entry point
  ↓ [Quote Sent]
  ↓ [Approval Required] → Choose ONE option:
    ├→ [Approve as Direct Sale] → Auto-creates DirectSale
    ├→ [Approve as EMI/Subscription] → Auto-creates Subscription + EMI schedule
    ├→ [Approve as Rent] → Auto-creates RentProfile + Monthly demands
    └→ [Approve as Lease] → Auto-creates LeaseProfile + Monthly demands
  ↓ [Auto-Created Contract Ready]
  ↓ [Customer Signature/Confirmation]
  ↓ [Sale/Revenue Tracking]

SINGLE view, SIMPLE workflow, AUTO conversions
```

---

## Backend Implementation

### 1. New Fields on OnlineRequest Model

```python
# subscriptions/models_online_request.py

class OnlineRequest(models.Model):
    # Existing fields...
    request_type = models.CharField()  # DIRECT_SALE, ADVANCE_EMI, RENT, LEASE
    
    # NEW FIELDS FOR UNIFIED WORKFLOW:
    approval_status = models.CharField(
        max_length=20,
        choices=[
            ('DRAFT', 'Draft - Awaiting Quote'),
            ('QUOTED', 'Quoted - Awaiting Approval'),
            ('APPROVED', 'Approved - Contract Created'),
            ('CONVERTED', 'Converted - Sale/Subscription Active'),
            ('REJECTED', 'Rejected'),
            ('LOST', 'Lost Lead'),
        ],
        default='DRAFT'
    )
    
    approved_by = models.ForeignKey(User, null=True, blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    
    # Which contract type was approved?
    approved_entity_type = models.CharField(
        max_length=20,
        choices=[
            ('DIRECT_SALE', 'Direct Sale'),
            ('SUBSCRIPTION', 'EMI/Subscription'),
            ('RENT', 'Rent Contract'),
            ('LEASE', 'Lease Contract'),
        ],
        null=True,
        blank=True
    )
    
    # Links to created contracts
    approved_direct_sale = models.OneToOneField('DirectSale', null=True, blank=True)
    approved_subscription = models.OneToOneField('Subscription', null=True, blank=True)
    approved_rent_profile = models.OneToOneField('RentProfile', null=True, blank=True)
    approved_lease_profile = models.OneToOneField('LeaseProfile', null=True, blank=True)
    
    # Auto-convert toggle
    auto_conversion_enabled = models.BooleanField(default=True)
    conversion_notes = models.TextField(blank=True)
    expected_close_date = models.DateField(null=True, blank=True)
```

### 2. New CRMPipeline Model (Unified Tracking)

```python
# subscriptions/models.py or new: crm/models.py

class CRMPipeline(models.Model):
    STAGE_CHOICES = [
        ('LEAD', 'Lead'),
        ('ENQUIRY', 'Online Enquiry'),
        ('QUOTED', 'Quoted'),
        ('APPROVED', 'Approved'),
        ('CONVERTED', 'Converted to Contract'),
        ('ACTIVE', 'Active Sale/Subscription'),
        ('LOST', 'Lost'),
        ('WON', 'Won'),
    ]
    
    TYPE_CHOICES = [
        ('DIRECT_SALE', 'Direct Sale'),
        ('SUBSCRIPTION', 'EMI/Subscription'),
        ('RENT', 'Rent'),
        ('LEASE', 'Lease'),
    ]
    
    lead = models.OneToOneField(PublicLead, on_delete=models.CASCADE)
    online_request = models.OneToOneField(OnlineRequest, null=True, on_delete=models.SET_NULL)
    
    current_stage = models.CharField(max_length=20, choices=STAGE_CHOICES)
    request_type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    
    # Approval tracking
    approved_by = models.ForeignKey(User, null=True, blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    
    # Conversion tracking
    converted_to = models.CharField(max_length=20, choices=TYPE_CHOICES, null=True)
    converted_entity_id = models.IntegerField(null=True)  # ID of DirectSale/Subscription/etc
    
    # Revenue tracking
    quoted_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    revenue = models.DecimalField(max_digits=12, decimal_places=2, default=0)  # Contract value
    probability = models.IntegerField(default=50)  # Sales probability %
    expected_close_date = models.DateField(null=True)
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['current_stage', 'created_at']),
            models.Index(fields=['approved_by', 'approved_at']),
        ]
    
    def __str__(self):
        return f"Pipeline {self.lead.customer_name} - {self.current_stage}"
```

### 3. Backend API Endpoints

```python
# api/v1/crm/views.py

from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

class CRMPipelineViewSet(viewsets.ModelViewSet):
    queryset = CRMPipeline.objects.select_related('lead', 'online_request', 'approved_by')
    
    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """
        Approve lead for specific contract type.
        Auto-creates contract if auto_conversion_enabled.
        
        POST /api/v1/crm/pipeline/{id}/approve/
        {
            "approval_type": "DIRECT_SALE",  // or SUBSCRIPTION, RENT, LEASE
            "auto_convert": true,
            "notes": "Approved by operator"
        }
        """
        pipeline = self.get_object()
        approval_type = request.data.get('approval_type')
        auto_convert = request.data.get('auto_convert', True)
        
        # Call approval service
        from crm.services import approve_online_request
        contract = approve_online_request(
            online_request=pipeline.online_request,
            approval_type=approval_type,
            approval_user=request.user,
            auto_convert=auto_convert,
            notes=request.data.get('notes', '')
        )
        
        pipeline.refresh_from_db()
        return Response(CRMPipelineSerializer(pipeline).data)
    
    @action(detail=True, methods=['post'])
    def quote(self, request, pk=None):
        """Send quote to customer"""
        pipeline = self.get_object()
        online_request = pipeline.online_request
        
        # Update status
        online_request.approval_status = 'QUOTED'
        online_request.save()
        
        # Send quote email/SMS
        from crm.services import send_quote_notification
        send_quote_notification(online_request)
        
        pipeline.current_stage = 'QUOTED'
        pipeline.quoted_amount = online_request.total_amount
        pipeline.save()
        
        return Response({'status': 'Quote sent'})
    
    @action(detail=True, methods=['patch'])
    def stage(self, request, pk=None):
        """Move lead between pipeline stages (Kanban drag-drop)"""
        pipeline = self.get_object()
        new_stage = request.data.get('stage')
        
        # Validate state transitions
        valid_transitions = {
            'LEAD': ['ENQUIRY', 'LOST'],
            'ENQUIRY': ['QUOTED', 'LOST'],
            'QUOTED': ['APPROVED', 'LOST'],
            'APPROVED': ['CONVERTED'],
            'CONVERTED': ['ACTIVE', 'WON'],
        }
        
        if new_stage not in valid_transitions.get(pipeline.current_stage, []):
            return Response({'error': 'Invalid stage transition'}, status=400)
        
        pipeline.current_stage = new_stage
        pipeline.save()
        
        return Response(CRMPipelineSerializer(pipeline).data)


# URL routing
# api/v1/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from crm.views import CRMPipelineViewSet

router = DefaultRouter()
router.register('crm/pipeline', CRMPipelineViewSet, basename='crm-pipeline')

urlpatterns = [
    path('', include(router.urls)),
]
```

### 4. Approval Service (Auto-Convert Logic)

```python
# crm/services.py

def approve_online_request(online_request, approval_type, approval_user, auto_convert=True, notes=''):
    """
    Approve lead for specific contract type.
    Auto-creates contract if auto_convert=True.
    """
    from django.utils import timezone
    
    # Step 1: Update approval status
    online_request.approval_status = 'APPROVED'
    online_request.approved_by = approval_user
    online_request.approved_at = timezone.now()
    online_request.approved_entity_type = approval_type
    online_request.conversion_notes = notes
    
    # Step 2: Auto-create contract based on approval type
    created_contract = None
    
    if approval_type == 'DIRECT_SALE' and auto_convert:
        created_contract = create_direct_sale_from_enquiry(online_request)
        online_request.approved_direct_sale = created_contract
        
    elif approval_type == 'SUBSCRIPTION' and auto_convert:
        created_contract = create_subscription_from_enquiry(online_request)
        online_request.approved_subscription = created_contract
        
    elif approval_type == 'RENT' and auto_convert:
        created_contract = create_rent_profile_from_enquiry(online_request)
        online_request.approved_rent_profile = created_contract
        
    elif approval_type == 'LEASE' and auto_convert:
        created_contract = create_lease_profile_from_enquiry(online_request)
        online_request.approved_lease_profile = created_contract
    
    online_request.save()
    
    # Step 3: Update CRM Pipeline
    pipeline = CRMPipeline.objects.get(online_request=online_request)
    pipeline.current_stage = 'APPROVED'
    pipeline.approved_by = approval_user
    pipeline.approved_at = timezone.now()
    pipeline.converted_to = approval_type
    
    if created_contract:
        pipeline.converted_entity_id = created_contract.id
        pipeline.current_stage = 'CONVERTED'
    
    pipeline.save()
    
    # Step 4: Send notifications
    send_approval_notification(online_request, created_contract)
    
    # Step 5: Post to accounting (if amount > threshold)
    if created_contract and created_contract.grand_total > 5000:
        post_to_accounting(created_contract)
    
    return created_contract


def create_direct_sale_from_enquiry(online_request):
    """Auto-create DirectSale from approved OnlineRequest"""
    from billing.models import DirectSale
    
    ds = DirectSale.objects.create(
        customer=online_request.customer,
        online_request=online_request,
        status='DRAFT',
        # Pre-fill from quote
        subtotal=online_request.total_amount,
        tax_total=online_request.estimated_tax or 0,
        grand_total=online_request.total_amount + (online_request.estimated_tax or 0),
        delivery_required=True,
        # Copy customer snapshot
        customer_name_snapshot=online_request.customer.name,
        customer_phone_snapshot=online_request.customer.phone,
    )
    
    # Create line items
    if online_request.product:
        DirectSaleLine.objects.create(
            direct_sale=ds,
            product=online_request.product,
            quantity=online_request.quantity or 1,
            unit_price=online_request.unit_price,
        )
    
    return ds


def create_subscription_from_enquiry(online_request):
    """Auto-create Subscription from approved OnlineRequest"""
    from subscriptions.models import Subscription
    
    sub = Subscription.objects.create(
        customer=online_request.customer,
        online_request=online_request,
        product=online_request.product,
        plan_type='EMI',
        status='DRAFT',
        monthly_amount=online_request.suggested_emi or 0,
        tenure_months=online_request.suggested_tenure or 24,
        total_amount=online_request.total_amount,
    )
    
    # Auto-create EMI schedule
    create_emi_schedule(sub)
    
    return sub


def send_approval_notification(online_request, contract):
    """Notify customer that approval is complete"""
    from crm.notifications import send_sms, send_email
    
    if contract:
        contract_type = type(contract).__name__
        message = f"Your {contract_type} request has been approved! Contract is ready for signature."
    else:
        message = "Your request has been approved. Contract is being prepared."
    
    send_sms(
        phone=online_request.customer.phone,
        message=message
    )
    
    send_email(
        email=online_request.customer.email,
        subject=f"Approval Notification - {online_request.request_type}",
        template='approval_notification',
        context={
            'customer_name': online_request.customer.name,
            'request_type': online_request.request_type,
            'contract': contract,
        }
    )
```

---

## Frontend Implementation

### 1. CRM Pipeline Kanban Board
**Route**: `/admin/crm` (redesigned)

```typescript
// frontend/src/app/(dashboard)/admin/crm/page.tsx

'use client';

import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api';
import ERPPageShell from '@/components/erp/ERPPageShell';
import KanbanBoard from '@/components/crm/KanbanBoard';
import LeadDetailModal from '@/components/crm/LeadDetailModal';

interface CRMPipeline {
  id: number;
  lead: { id: number; customer_name: string; phone: string; email: string };
  online_request: { id: number; total_amount: number; request_type: string };
  current_stage: string;
  quoted_amount: number;
  revenue: number;
  expected_close_date: string;
}

export default function CRMPipelinePage() {
  const [pipeline, setPipeline] = useState<CRMPipeline[]>([]);
  const [selectedLead, setSelectedLead] = useState<CRMPipeline | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadPipeline = async () => {
      try {
        const data = await apiFetch('/api/v1/crm/pipeline/');
        setPipeline(data.results || data);
      } catch (err) {
        console.error('Failed to load CRM pipeline:', err);
      } finally {
        setLoading(false);
      }
    };
    loadPipeline();
  }, []);

  const handleStageChange = async (leadId: number, newStage: string) => {
    try {
      await apiFetch(`/api/v1/crm/pipeline/${leadId}/stage/`, {
        method: 'PATCH',
        body: JSON.stringify({ stage: newStage }),
      });
      
      // Refresh pipeline
      const updated = pipeline.map(p => 
        p.id === leadId ? { ...p, current_stage: newStage } : p
      );
      setPipeline(updated);
    } catch (err) {
      console.error('Failed to update stage:', err);
    }
  };

  return (
    <ERPPageShell
      eyebrow="CRM"
      title="Pipeline - Leads to Sales"
      subtitle="Drag leads between stages. Click to approve and auto-create contracts."
    >
      <KanbanBoard
        leads={pipeline}
        onStageChange={handleStageChange}
        onLeadClick={setSelectedLead}
      />
      
      {selectedLead && (
        <LeadDetailModal
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
          onApprove={() => {
            setSelectedLead(null);
            // Refresh pipeline
            window.location.reload();
          }}
        />
      )}
    </ERPPageShell>
  );
}
```

### 2. Kanban Board Component

```typescript
// frontend/src/components/crm/KanbanBoard.tsx

const STAGES = ['LEAD', 'ENQUIRY', 'QUOTED', 'APPROVED', 'CONVERTED', 'LOST'];

export default function KanbanBoard({ leads, onStageChange, onLeadClick }) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {STAGES.map(stage => (
        <KanbanColumn
          key={stage}
          stage={stage}
          leads={leads.filter(l => l.current_stage === stage)}
          onStageChange={onStageChange}
          onLeadClick={onLeadClick}
        />
      ))}
    </div>
  );
}

function KanbanColumn({ stage, leads, onStageChange, onLeadClick }) {
  const [dragOver, setDragOver] = useState(false);

  return (
    <div className="min-w-sm bg-muted/30 rounded-lg p-4 border border-border">
      <h3 className="font-semibold mb-2">{stage} ({leads.length})</h3>
      
      <div
        className={`space-y-3 min-h-96 ${dragOver ? 'bg-primary/5' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          const leadId = parseInt(e.dataTransfer.getData('leadId'));
          onStageChange(leadId, stage);
          setDragOver(false);
        }}
      >
        {leads.map(lead => (
          <LeadCard
            key={lead.id}
            lead={lead}
            onClick={() => onLeadClick(lead)}
          />
        ))}
      </div>
    </div>
  );
}

function LeadCard({ lead, onClick }) {
  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData('leadId', lead.id)}
      onClick={onClick}
      className="bg-card border border-border rounded-lg p-3 cursor-move hover:shadow-md transition"
    >
      <div className="font-medium text-sm">{lead.lead.customer_name}</div>
      <div className="text-xs text-muted-foreground">{lead.lead.phone}</div>
      <div className="text-sm font-bold text-primary mt-2">
        Rs. {lead.quoted_amount.toLocaleString()}
      </div>
      {lead.expected_close_date && (
        <div className="text-xs text-muted-foreground mt-1">
          Close: {new Date(lead.expected_close_date).toLocaleDateString()}
        </div>
      )}
    </div>
  );
}
```

### 3. Lead Detail Modal with Approval

```typescript
// frontend/src/components/crm/LeadDetailModal.tsx

export default function LeadDetailModal({ lead, onClose, onApprove }) {
  const [approving, setApproving] = useState(false);

  const handleApprove = async (approvalType: string) => {
    setApproving(true);
    try {
      await apiFetch(`/api/v1/crm/pipeline/${lead.id}/approve/`, {
        method: 'POST',
        body: JSON.stringify({
          approval_type: approvalType,  // DIRECT_SALE, SUBSCRIPTION, RENT, LEASE
          auto_convert: true,
        }),
      });
      
      toast.success(`Approved as ${approvalType}`);
      onApprove();
    } catch (err) {
      toast.error('Approval failed');
    } finally {
      setApproving(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{lead.lead.customer_name} - Lead Details</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Lead Info */}
          <div>
            <label className="text-sm font-medium">Contact Info</label>
            <div className="text-sm text-muted-foreground mt-1">
              <div>Phone: {lead.lead.phone}</div>
              <div>Email: {lead.lead.email}</div>
            </div>
          </div>

          {/* Quote Info */}
          <div>
            <label className="text-sm font-medium">Quote Amount</label>
            <div className="text-2xl font-bold text-primary">
              Rs. {lead.online_request.total_amount.toLocaleString()}
            </div>
          </div>

          {/* Request Type */}
          <div>
            <label className="text-sm font-medium">Request Type</label>
            <div className="text-sm">{lead.online_request.request_type}</div>
          </div>

          {/* Approval Options */}
          <div className="border-t pt-4">
            <label className="text-sm font-medium mb-3 block">Approve As:</label>
            <div className="space-y-2">
              <button
                onClick={() => handleApprove('DIRECT_SALE')}
                disabled={approving}
                className="w-full py-2 px-3 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Direct Sale
              </button>
              <button
                onClick={() => handleApprove('SUBSCRIPTION')}
                disabled={approving}
                className="w-full py-2 px-3 bg-green-600 text-white rounded hover:bg-green-700"
              >
                EMI / Subscription
              </button>
              <button
                onClick={() => handleApprove('RENT')}
                disabled={approving}
                className="w-full py-2 px-3 bg-purple-600 text-white rounded hover:bg-purple-700"
              >
                Rent Contract
              </button>
              <button
                onClick={() => handleApprove('LEASE')}
                disabled={approving}
                className="w-full py-2 px-3 bg-orange-600 text-white rounded hover:bg-orange-700"
              >
                Lease Contract
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

---

## Summary & Next Steps

**Completed:**
- ✓ CRM Analytics page with real-time metrics
- ✓ Backend API endpoints for metrics

**To Implement (5 Phases):**

1. **Database & Backend** (Week 1)
   - Add approval fields to OnlineRequest
   - Create CRMPipeline model
   - Implement approval service with auto-conversion

2. **API Endpoints** (Week 1-2)
   - GET /api/v1/crm/pipeline/
   - POST /api/v1/crm/pipeline/{id}/approve/
   - PATCH /api/v1/crm/pipeline/{id}/stage/

3. **Frontend Kanban** (Week 2)
   - Redesign /admin/crm as Kanban board
   - Drag-drop stage transitions
   - Lead detail modal with approval

4. **Approval & Auto-Convert** (Week 3)
   - One-click approve buttons
   - Auto-create DirectSale/Subscription/Rent/Lease
   - Send customer notifications

5. **Analytics & ERP** (Week 4)
   - Pipeline health dashboard
   - Conversion metrics
   - GL posting to accounting

**Success Metrics:**
- Lead approval time: < 5 minutes
- Conversion rate: > 30%
- Operator efficiency: < 2 minutes per lead
- Auto-conversion success: > 95%

Would you like me to start implementing Phase 1 (Database & Backend)?
