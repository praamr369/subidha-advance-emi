export const dashboardKeys = {
  all: ["dashboard"] as const,
  admin: () => [...dashboardKeys.all, "admin"] as const,
};
