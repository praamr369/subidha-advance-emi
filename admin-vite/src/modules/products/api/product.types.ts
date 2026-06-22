export type LifecycleStatus = "ACTIVE" | "UPCOMING" | "DISCONTINUED" | "MAINTENANCE";

export type PlanType = "EMI" | "RENT" | "LEASE";

export type ProductAdmin = {
  id: number;
  product_code: string;
  name: string;
  base_price: string;
  category_master: number | null;
  category_master_name: string | null;
  subcategory_master: number | null;
  subcategory_master_name: string | null;
  category: string;
  subcategory: string;
  sku: string | null;
  unit_of_measure_master: number | null;
  unit_of_measure_master_name: string | null;
  unit_of_measure: string;
  description: string;
  image: string | null;
  is_active: boolean;
  plan_type_default: PlanType;
  is_emi_enabled: boolean;
  is_rent_enabled: boolean;
  is_lease_enabled: boolean;
  is_rent_ready: boolean;
  is_lease_ready: boolean;
  is_direct_sale_enabled: boolean;
  lifecycle_status: LifecycleStatus;
  inventory_profile_id: number | null;
  inventory_ready: boolean;
  inventory_stock_tracking_enabled: boolean;
  inventory_delivery_stock_bridge_enabled: boolean;
  created_at: string;
};

export type ProductCreatePayload = {
  name: string;
  product_code: string;
  base_price: string;
  category_master?: number | null;
  subcategory_master?: number | null;
  category?: string;
  subcategory?: string;
  sku?: string;
  unit_of_measure_master?: number | null;
  unit_of_measure?: string;
  description?: string;
  is_active?: boolean;
  plan_type_default?: PlanType;
  is_emi_enabled?: boolean;
  is_rent_enabled?: boolean;
  is_lease_enabled?: boolean;
  is_direct_sale_enabled?: boolean;
  lifecycle_status?: LifecycleStatus;
};

export type ProductUpdatePayload = Partial<ProductCreatePayload> & {
  clear_image?: boolean;
};

export type ProductListParams = {
  page?: number;
  page_size?: number;
  q?: string;
  category?: string;
  subcategory?: string;
  unit_of_measure?: string;
};

export type CatalogCategory = {
  id: number;
  name: string;
};

export type CatalogSubcategory = {
  id: number;
  name: string;
  category_id: number;
  category_name: string;
};

export type CatalogUnitOfMeasure = {
  id: number;
  code: string;
  name: string;
};

export type CatalogOptions = {
  categories: CatalogCategory[];
  subcategories: CatalogSubcategory[];
  unit_of_measure_masters: CatalogUnitOfMeasure[];
  unit_of_measure_options: string[];
};

export type CategoryMaster = {
  id: number;
  name: string;
  description: string;
  is_active: boolean;
  created_at: string;
};

export type SubcategoryMaster = {
  id: number;
  category: number;
  category_name: string;
  name: string;
  description: string;
  is_active: boolean;
  created_at: string;
};

export type UnitOfMeasureMaster = {
  id: number;
  code: string;
  name: string;
  description: string;
  is_active: boolean;
  created_at: string;
};
