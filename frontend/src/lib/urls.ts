export const API_V1 = "/api/v1";

export const apiUrls = {
  auth: {
    login: `${API_V1}/auth/login/`,
    refresh: `${API_V1}/auth/refresh/`,
  },
  admin: {
    productsImportCsv: `${API_V1}/admin/products/import-csv/`,
    subscriptions: `${API_V1}/admin/subscriptions/`,
  },
};
