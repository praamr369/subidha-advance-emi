import type { StatDefinition } from "./ProfileStatsCalculator";

/**
 * CRM-specific stats calculator for KPI calculations across all CRM modules
 * Extends ProfileStatsCalculator with domain-specific metrics
 */
export class CrmStatsCalculator {
  static calculateLeadsStats(data: {
    totalCount: number;
    newCount: number;
    convertedCount: number;
    lostCount: number;
    loading: boolean;
  }): StatDefinition[] {
    return [
      {
        label: "Total Leads",
        value: data.loading ? "—" : data.totalCount,
        tone: "info",
      },
      {
        label: "New",
        value: data.loading ? "—" : data.newCount,
        tone: "default",
      },
      {
        label: "Converted",
        value: data.loading ? "—" : data.convertedCount,
        tone: "success",
      },
      {
        label: "Lost",
        value: data.loading ? "—" : data.lostCount,
        tone: data.lostCount > 0 ? "warning" : "default",
      },
    ];
  }

  static calculatePipelineStats(data: {
    totalCount: number;
    interestedCount: number;
    readyToConvertCount: number;
    kycPendingCount: number;
    loading: boolean;
  }): StatDefinition[] {
    return [
      {
        label: "Pipeline Total",
        value: data.loading ? "—" : data.totalCount,
        tone: "info",
      },
      {
        label: "Interested",
        value: data.loading ? "—" : data.interestedCount,
        tone: "default",
      },
      {
        label: "Ready to Convert",
        value: data.loading ? "—" : data.readyToConvertCount,
        tone: "success",
      },
      {
        label: "KYC Pending",
        value: data.loading ? "—" : data.kycPendingCount,
        tone: data.kycPendingCount > 0 ? "warning" : "default",
      },
    ];
  }

  static calculateFollowUpsStats(data: {
    totalCount: number;
    dueCount: number;
    overdueCount: number;
    completedCount: number;
    loading: boolean;
  }): StatDefinition[] {
    return [
      {
        label: "Total Follow-ups",
        value: data.loading ? "—" : data.totalCount,
        tone: "info",
      },
      {
        label: "Due Today",
        value: data.loading ? "—" : data.dueCount,
        tone: "default",
      },
      {
        label: "Overdue",
        value: data.loading ? "—" : data.overdueCount,
        tone: data.overdueCount > 0 ? "warning" : "default",
      },
      {
        label: "Completed",
        value: data.loading ? "—" : data.completedCount,
        tone: "success",
      },
    ];
  }

  static calculateKycStats(data: {
    totalCount: number;
    pendingCount: number;
    verifiedCount: number;
    expiredCount: number;
    loading: boolean;
  }): StatDefinition[] {
    return [
      {
        label: "Total Customers",
        value: data.loading ? "—" : data.totalCount,
        tone: "info",
      },
      {
        label: "Pending KYC",
        value: data.loading ? "—" : data.pendingCount,
        tone: data.pendingCount > 0 ? "warning" : "default",
      },
      {
        label: "Verified",
        value: data.loading ? "—" : data.verifiedCount,
        tone: "success",
      },
      {
        label: "Expired",
        value: data.loading ? "—" : data.expiredCount,
        tone: data.expiredCount > 0 ? "warning" : "default",
      },
    ];
  }

  static calculateAmlStats(data: {
    totalCount: number;
    flaggedCount: number;
    reviewedCount: number;
    clearedCount: number;
    loading: boolean;
  }): StatDefinition[] {
    return [
      {
        label: "Total Customers",
        value: data.loading ? "—" : data.totalCount,
        tone: "info",
      },
      {
        label: "Flagged for Review",
        value: data.loading ? "—" : data.flaggedCount,
        tone: data.flaggedCount > 0 ? "warning" : "default",
      },
      {
        label: "Reviewed",
        value: data.loading ? "—" : data.reviewedCount,
        tone: "default",
      },
      {
        label: "Cleared",
        value: data.loading ? "—" : data.clearedCount,
        tone: "success",
      },
    ];
  }

  static calculateDisputesStats(data: {
    totalCount: number;
    openCount: number;
    resolvedCount: number;
    pendingReviewCount: number;
    loading: boolean;
  }): StatDefinition[] {
    return [
      {
        label: "Total Disputes",
        value: data.loading ? "—" : data.totalCount,
        tone: "info",
      },
      {
        label: "Open",
        value: data.loading ? "—" : data.openCount,
        tone: data.openCount > 0 ? "warning" : "default",
      },
      {
        label: "Pending Review",
        value: data.loading ? "—" : data.pendingReviewCount,
        tone: "default",
      },
      {
        label: "Resolved",
        value: data.loading ? "—" : data.resolvedCount,
        tone: "success",
      },
    ];
  }
}
