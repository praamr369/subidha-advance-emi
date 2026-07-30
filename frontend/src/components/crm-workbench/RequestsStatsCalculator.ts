import type { StatDefinition } from "./ProfileStatsCalculator";

/**
 * Requests module stats calculator for queues and intake pages
 * Handles online enquiries, support, subscriptions, and partner requests
 */
export class RequestsStatsCalculator {
  static calculateOnlineEnquiriesStats(data: {
    totalCount: number;
    newCount: number;
    inProgressCount: number;
    closedCount: number;
    loading: boolean;
  }): StatDefinition[] {
    return [
      {
        label: "Total Enquiries",
        value: data.loading ? "—" : data.totalCount,
        tone: "info",
      },
      {
        label: "New",
        value: data.loading ? "—" : data.newCount,
        tone: data.newCount > 0 ? "warning" : "default",
      },
      {
        label: "In Progress",
        value: data.loading ? "—" : data.inProgressCount,
        tone: "default",
      },
      {
        label: "Closed",
        value: data.loading ? "—" : data.closedCount,
        tone: "success",
      },
    ];
  }

  static calculateSupportRequestsStats(data: {
    totalCount: number;
    openCount: number;
    inProgressCount: number;
    resolvedCount: number;
    loading: boolean;
  }): StatDefinition[] {
    return [
      {
        label: "Total Support Tickets",
        value: data.loading ? "—" : data.totalCount,
        tone: "info",
      },
      {
        label: "Open",
        value: data.loading ? "—" : data.openCount,
        tone: data.openCount > 0 ? "warning" : "default",
      },
      {
        label: "In Progress",
        value: data.loading ? "—" : data.inProgressCount,
        tone: "default",
      },
      {
        label: "Resolved",
        value: data.loading ? "—" : data.resolvedCount,
        tone: "success",
      },
    ];
  }

  static calculateSubscriptionRequestsStats(data: {
    totalCount: number;
    pendingApprovalCount: number;
    approvedCount: number;
    rejectedCount: number;
    loading: boolean;
  }): StatDefinition[] {
    return [
      {
        label: "Total Requests",
        value: data.loading ? "—" : data.totalCount,
        tone: "info",
      },
      {
        label: "Pending Approval",
        value: data.loading ? "—" : data.pendingApprovalCount,
        tone: data.pendingApprovalCount > 0 ? "warning" : "default",
      },
      {
        label: "Approved",
        value: data.loading ? "—" : data.approvedCount,
        tone: "success",
      },
      {
        label: "Rejected",
        value: data.loading ? "—" : data.rejectedCount,
        tone: data.rejectedCount > 0 ? "warning" : "default",
      },
    ];
  }

  static calculatePartnerPaymentRequestsStats(data: {
    totalCount: number;
    pendingReviewCount: number;
    approvedCount: number;
    rejectedCount: number;
    loading: boolean;
  }): StatDefinition[] {
    return [
      {
        label: "Total Requests",
        value: data.loading ? "—" : data.totalCount,
        tone: "info",
      },
      {
        label: "Pending Review",
        value: data.loading ? "—" : data.pendingReviewCount,
        tone: data.pendingReviewCount > 0 ? "warning" : "default",
      },
      {
        label: "Approved",
        value: data.loading ? "—" : data.approvedCount,
        tone: "success",
      },
      {
        label: "Rejected",
        value: data.loading ? "—" : data.rejectedCount,
        tone: data.rejectedCount > 0 ? "warning" : "default",
      },
    ];
  }

  static calculatePartnerCollectionRequestsStats(data: {
    totalCount: number;
    pendingApprovalCount: number;
    approvedCount: number;
    rejectedCount: number;
    loading: boolean;
  }): StatDefinition[] {
    return [
      {
        label: "Total Requests",
        value: data.loading ? "—" : data.totalCount,
        tone: "info",
      },
      {
        label: "Pending Approval",
        value: data.loading ? "—" : data.pendingApprovalCount,
        tone: data.pendingApprovalCount > 0 ? "warning" : "default",
      },
      {
        label: "Approved",
        value: data.loading ? "—" : data.approvedCount,
        tone: "success",
      },
      {
        label: "Rejected",
        value: data.loading ? "—" : data.rejectedCount,
        tone: data.rejectedCount > 0 ? "warning" : "default",
      },
    ];
  }
}
