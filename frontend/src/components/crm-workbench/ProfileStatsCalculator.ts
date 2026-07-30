export type StatDefinition = {
  label: string;
  value: string | number;
  tone?: "info" | "success" | "warning" | "default";
};

export type ProfileStatsResult = {
  stats: StatDefinition[];
  summary: Record<string, any>;
};

/**
 * Centralized stats calculator for profile pages.
 * Prevents KPI duplication by calculating all metrics once in the header.
 */
export class ProfileStatsCalculator {
  static calculateCustomerStats(data: {
    totalCount: number;
    activeCount: number;
    pendingKycCount: number;
    activeSubscriptionsCount: number;
    loading: boolean;
  }): StatDefinition[] {
    return [
      {
        label: "Total Customers",
        value: data.loading ? "—" : data.totalCount,
        tone: "info",
      },
      {
        label: "Active",
        value: data.loading ? "—" : data.activeCount,
        tone: "success",
      },
      {
        label: "Pending KYC",
        value: data.loading ? "—" : data.pendingKycCount,
        tone: data.pendingKycCount > 0 ? "warning" : "success",
      },
      {
        label: "Active Subscriptions",
        value: data.loading ? "—" : data.activeSubscriptionsCount,
        tone: "default",
      },
    ];
  }

  static calculatePartnerStats(data: {
    totalCount: number;
    activeCount: number;
    totalSubscriptions: number;
    totalMonthlyBook: string | number;
    loading: boolean;
  }): StatDefinition[] {
    return [
      {
        label: "Partners",
        value: data.loading ? "—" : data.totalCount,
        tone: "info",
      },
      {
        label: "Active",
        value: data.loading ? "—" : data.activeCount,
        tone: "success",
      },
      {
        label: "Subscriptions",
        value: data.loading ? "—" : data.totalSubscriptions,
        tone: "default",
      },
      {
        label: "Monthly Book",
        value: data.loading ? "—" : `₹${Number(data.totalMonthlyBook || 0).toFixed(0)}`,
        tone: "default",
      },
    ];
  }

  static calculateVendorStats(data: {
    totalCount: number;
    activeCount: number;
    inactiveCount: number;
    loading: boolean;
  }): StatDefinition[] {
    return [
      {
        label: "Vendors",
        value: data.loading ? "—" : data.totalCount,
        tone: "info",
      },
      {
        label: "Active",
        value: data.loading ? "—" : data.activeCount,
        tone: "success",
      },
      {
        label: "Inactive",
        value: data.loading ? "—" : data.inactiveCount,
        tone: data.inactiveCount > 0 ? "warning" : "default",
      },
    ];
  }

  static calculateBranchStats(data: {
    totalCount: number;
    activeCount: number;
    primaryCount: number;
    loading: boolean;
  }): StatDefinition[] {
    return [
      {
        label: "Branches",
        value: data.loading ? "—" : data.totalCount,
        tone: "info",
      },
      {
        label: "Active",
        value: data.loading ? "—" : data.activeCount,
        tone: "success",
      },
      {
        label: "Primary",
        value: data.loading ? "—" : data.primaryCount,
        tone: "default",
      },
    ];
  }

  static calculateStaffStats(data: {
    totalCount: number;
    activeCount: number;
    inactiveCount: number;
    loading: boolean;
  }): StatDefinition[] {
    return [
      {
        label: "Staff Members",
        value: data.loading ? "—" : data.totalCount,
        tone: "info",
      },
      {
        label: "Active",
        value: data.loading ? "—" : data.activeCount,
        tone: "success",
      },
      {
        label: "Inactive",
        value: data.loading ? "—" : data.inactiveCount,
        tone: data.inactiveCount > 0 ? "warning" : "default",
      },
    ];
  }
}
