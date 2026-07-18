/**
 * CRM Pipeline Kanban Board
 * Drag-drop leads between stages (LEAD, ENQUIRY, QUOTED, APPROVED, CONVERTED)
 */

'use client';

import { useState } from 'react';
import { formatRupee } from '@/lib/utils/currency';

export interface KanbanLead {
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

interface KanbanBoardProps {
  leads: KanbanLead[];
  onStageChange: (leadId: number, newStage: string) => Promise<void>;
  onLeadClick: (lead: KanbanLead) => void;
}

const STAGES = ['LEAD', 'ENQUIRY', 'QUOTED', 'APPROVED', 'CONVERTED'];
const STAGE_COLORS: Record<string, string> = {
  LEAD: 'bg-slate-100 dark:bg-slate-900',
  ENQUIRY: 'bg-blue-100 dark:bg-blue-900',
  QUOTED: 'bg-yellow-100 dark:bg-yellow-900',
  APPROVED: 'bg-purple-100 dark:bg-purple-900',
  CONVERTED: 'bg-green-100 dark:bg-green-900',
};

const STAGE_LABELS: Record<string, string> = {
  LEAD: 'Lead',
  ENQUIRY: 'Online Enquiry',
  QUOTED: 'Quoted',
  APPROVED: 'Approved',
  CONVERTED: 'Converted',
};

export default function KanbanBoard({
  leads,
  onStageChange,
  onLeadClick,
}: KanbanBoardProps) {
  const [draggingLeadId, setDraggingLeadId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const handleDragStart = (e: React.DragEvent, leadId: number) => {
    setDraggingLeadId(leadId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, targetStage: string) => {
    e.preventDefault();

    if (!draggingLeadId) return;

    setLoading(true);
    try {
      await onStageChange(draggingLeadId, targetStage);
    } finally {
      setLoading(false);
      setDraggingLeadId(null);
    }
  };

  return (
    <div className="flex gap-4 overflow-x-auto pb-8 px-4">
      {STAGES.map(stage => {
        const stageleads = leads.filter(l => l.current_stage === stage);
        const stageCount = stageleads.length;

        return (
          <KanbanColumn
            key={stage}
            stage={stage}
            leads={stageleads}
            leadCount={stageCount}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onLeadClick={onLeadClick}
            onDragStart={handleDragStart}
            isLoading={loading}
          />
        );
      })}
    </div>
  );
}

interface KanbanColumnProps {
  stage: string;
  leads: KanbanLead[];
  leadCount: number;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, stage: string) => void;
  onLeadClick: (lead: KanbanLead) => void;
  onDragStart: (e: React.DragEvent, leadId: number) => void;
  isLoading: boolean;
}

function KanbanColumn({
  stage,
  leads,
  leadCount,
  onDragOver,
  onDrop,
  onLeadClick,
  onDragStart,
  isLoading,
}: KanbanColumnProps) {
  return (
    <div className="flex-shrink-0 w-80">
      <div className={`${STAGE_COLORS[stage]} rounded-lg border border-border p-4`}>
        {/* Column Header */}
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-border">
          <div>
            <h3 className="font-semibold text-foreground">{STAGE_LABELS[stage]}</h3>
            <p className="text-sm text-muted-foreground mt-1">{leadCount} leads</p>
          </div>
          <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-primary/20 text-primary font-bold">
            {leadCount}
          </div>
        </div>

        {/* Drop Zone */}
        <div
          className="space-y-3 min-h-96 transition-colors"
          onDragOver={onDragOver}
          onDrop={(e) => onDrop(e, stage)}
        >
          {leads.length === 0 ? (
            <div className="flex items-center justify-center h-96 text-muted-foreground">
              <p className="text-center text-sm">No leads in {STAGE_LABELS[stage]}</p>
            </div>
          ) : (
            leads.map(lead => (
              <LeadCard
                key={lead.id}
                lead={lead}
                onClick={() => onLeadClick(lead)}
                onDragStart={onDragStart}
                disabled={isLoading}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

interface LeadCardProps {
  lead: KanbanLead;
  onClick: () => void;
  onDragStart: (e: React.DragEvent, leadId: number) => void;
  disabled: boolean;
}

function LeadCard({ lead, onClick, onDragStart, disabled }: LeadCardProps) {
  return (
    <div
      draggable={!disabled}
      onDragStart={(e) => onDragStart(e, lead.id)}
      onClick={onClick}
      className={`
        bg-card border border-border rounded-lg p-4 cursor-move
        hover:shadow-md hover:border-primary/50 transition-all
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
      `}
    >
      {/* Lead Name */}
      <div className="font-medium text-sm text-foreground line-clamp-2">
        {lead.lead.customer_name}
      </div>

      {/* Contact Info */}
      <div className="text-xs text-muted-foreground mt-2 space-y-1">
        <div>📞 {lead.lead.phone}</div>
        {lead.request_type && (
          <div className="inline-block px-2 py-1 bg-primary/20 text-primary rounded text-xs font-medium mt-2">
            {lead.request_type}
          </div>
        )}
      </div>

      {/* Amount */}
      <div className="text-sm font-bold text-primary mt-3">
        {formatRupee(lead.quoted_amount)}
      </div>

      {/* Close Date */}
      {lead.expected_close_date && (
        <div className="text-xs text-muted-foreground mt-2">
          Close: {new Date(lead.expected_close_date).toLocaleDateString()}
        </div>
      )}

      {/* Days in Pipeline */}
      <div className="text-xs text-muted-foreground mt-1">
        {lead.days_in_pipeline} days in pipeline
      </div>

      {/* Approval Status */}
      {lead.approved_at && (
        <div className="text-xs bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded px-2 py-1 mt-2">
          ✓ Approved by {lead.approved_by}
        </div>
      )}
    </div>
  );
}
