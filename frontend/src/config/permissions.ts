export const ROLES = ["ADMIN", "PARTNER", "CUSTOMER"] as const;
export const routeAccess = { admin: ["ADMIN"], partner: ["PARTNER"], customer: ["CUSTOMER"] } as const;
