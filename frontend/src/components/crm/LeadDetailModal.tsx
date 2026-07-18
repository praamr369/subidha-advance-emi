/**
 * Lead Detail Modal - Full lead info + approval buttons
 */

'use client';

import { useState } from 'react';
import { formatRupee } from '@/lib/utils/currency';
import { apiFetch } from '@/lib/api';

interface Lead {
  id: number;
  lead: {
    id: number;
    customer_name: string;
    phone: string;
    email: string;
  };
  current_stage: string;
  request_type: string;
  quoted_amount: number;
  revenue: number;
  probability: number;
  approved_by: string | null;
  approved_at: string | null;
  converted_to: string | null;
  expected_close_date: string | null;
  created_at: string;
  days_in_pipeline: number;
}

interface LeadDetailModalProps {
  lead: Lead;
  open: boolean;
  onClose: () => void;
  onApprove: (approvalType: string, contract: any) => void;
}

type ApprovalType = 'DIRECT_SALE' | 'SUBSCRIPTION' | 'RENT' | 'LEASE';

const APPROVAL_BUTTONS: Array<{
  type: ApprovalType;
  label: string;
  description: string;
  color: string;
  icon: string;
}> = [
  {
    type: 'DIRECT_SALE',
    label: 'Direct Sale',
    description: 'One-time product purchase',
    color: 'bg-blue-600 hover:bg-blue-700',
    icon: '🛍️',
  },
  {
    type: 'SUBSCRIPTION',
    label: 'EMI / Subscription',
    description: 'Monthly payment plan',
    color: 'bg-green-600 hover:bg-green-700',
    icon: '📅',
  },
  {
    type: 'RENT',
    label: 'Rent Contract',
    description: 'Monthly rental agreement',
    color: 'bg-purple-600 hover:bg-purple-700',
    icon: '🏠',
  },
  {
    type: 'LEASE',
    label: 'Lease Contract',
    description: 'Long-term lease agreement',
    color: 'bg-orange-600 hover:bg-orange-700',
    icon: '📜',
  },
];

export default function LeadDetailModal({
  lead,
  open,
  onClose,
  onApprove,
}: LeadDetailModalProps) {
  const [approving, setApproving] = useState(false);
  const [approvingType, setApprovingType] = useState<ApprovalType | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleApprove = async (approvalType: ApprovalType) => {
    setApproving(true);
    setApprovingType(approvalType);
    setError(null);

    try {
      const response = await apiFetch(`/api/v1/crm-pipeline/pipeline/${lead.id}/approve/`, {
        method: 'POST',
        body: JSON.stringify({
          approval_type: approvalType,
          auto_convert: true,
          notes: `Approved as ${approvalType} by operator`,
        }),
      }) as { contract: any };

      onApprove(approvalType, response.contract);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approval failed');
    } finally {
      setApproving(false);
      setApprovingType(null);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-background rounded-lg border border-border shadow-lg max-w-2xl w-full max-h-96 overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 flex items-center justify-between p-6 border-b border-border bg-muted/50">
            <div>
              <h2 className="text-2xl font-bold text-foreground">
                {lead.lead.customer_name}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Lead · {lead.days_in_pipeline} days in pipeline
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground text-2xl"
            >
              ✕
            </button>
          </div>

          <div className="p-6 space-y-6">
            {/* Contact Information */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase">
                  Phone
                </label>
                <p className="text-lg font-medium mt-1">{lead.lead.phone}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase">
                  Email
                </label>
                <p className="text-lg font-medium mt-1">{lead.lead.email}</p>
              </div>
            </div>

            {/* Request Details */}
            <div className="grid grid-cols-3 gap-4 p-4 bg-muted/30 rounded-lg border border-border">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase">
                  Request Type
                </label>
                <p className="text-lg font-bold text-primary mt-1">{lead.request_type}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase">
                  Quote Amount
                </label>
                <p className="text-lg font-bold text-green-600 mt-1">
                  {formatRupee(lead.quoted_amount)}
                </p>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase">
                  Probability
                </label>
                <p className="text-lg font-bold text-blue-600 mt-1">{lead.probability}%</p>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="p-4 bg-red-100 dark:bg-red-900 border border-red-300 dark:border-red-700 rounded-lg">
                <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
              </div>
            )}

            {/* Approval Status */}
            {lead.approved_at ? (
              <div className="p-4 bg-green-100 dark:bg-green-900 border border-green-300 dark:border-green-700 rounded-lg">
                <p className="text-sm text-green-800 dark:text-green-200">
                  ✓ Already approved as {lead.converted_to} by {lead.approved_by}
                </p>
              </div>
            ) : (
              <>
                {/* Approval Buttons */}
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-4">
                    Approve As:
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    {APPROVAL_BUTTONS.map(btn => (
                      <button
                        key={btn.type}
                        onClick={() => handleApprove(btn.type)}
                        disabled={approving}
                        className={`
                          p-4 rounded-lg text-white font-medium transition-all
                          ${btn.color}
                          ${approving && approvingType !== btn.type ? 'opacity-50' : ''}
                          ${approving && approvingType === btn.type ? 'opacity-75' : ''}
                          disabled:opacity-50 disabled:cursor-not-allowed
                        `}
                      >
                        <div className="text-2xl mb-2">{btn.icon}</div>
                        <div className="font-semibold text-sm">{btn.label}</div>
                        <div className="text-xs opacity-90 mt-1">{btn.description}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Info */}
                <div className="p-4 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <p className="text-sm text-blue-900 dark:text-blue-200">
                    💡 Select an approval type above. A contract will be automatically created
                    and the customer will be notified.
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 flex justify-end gap-3 p-6 border-t border-border bg-muted/50">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-border hover:bg-muted transition"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
