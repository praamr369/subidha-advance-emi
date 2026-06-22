export type LuckyPlanBatchStatus =
  | "DRAFT"
  | "OPEN"
  | "FULL"
  | "READY_TO_LOCK"
  | "LOCKED"
  | "DRAW_IN_PROGRESS"
  | "DRAW_COMMITTED"
  | "DRAW_COMPLETED"
  | "COMPLETED"
  | "CLOSED"
  | "CANCELLED"
  | "UNKNOWN";

export type LuckyPlanIdStatus = "AVAILABLE" | "ASSIGNED" | "WON" | "UNKNOWN";

export type LuckyPlanDrawStatus = "PENDING" | "REVEALED" | "UNKNOWN";

export type LuckyPlanListParams = {
  page?: number;
  page_size?: number;
  q?: string;
  status?: string;
};

export type LuckyPlanBatchListParams = LuckyPlanListParams;

export type LuckyPlanLuckyIdListParams = {
  page?: number;
  page_size?: number;
  batch_id?: number;
  batch?: number;
  status?: string;
};

export type LuckyPlanDrawListParams = {
  page?: number;
  page_size?: number;
  batch?: number;
  is_revealed?: boolean;
};

export type LuckyPlanBatch = {
  id: number;
  batch_code: string;
  total_slots: number;
  duration_months: number;
  draw_day: number;
  start_date: string;
  status: LuckyPlanBatchStatus | string;
  locked_at: string | null;
  created_at: string;
  updated_at?: string | null;
  available_slots?: number;
  subscription_count?: number;
  lucky_id_count?: number;
  winner_count?: number;
  draw_count?: number;
  [key: string]: unknown;
};

export type LuckyPlanBatchSummary = {
  id: number;
  batch_code: string;
  status: LuckyPlanBatchStatus | string;
  duration_months: number;
  total_slots: number;
  draw_day: number | null;
  start_date: string | null;
  subscription_count: number;
  active_subscription_count: number;
  won_subscription_count: number;
  available_lucky_ids: number;
  assigned_lucky_ids: number;
  won_lucky_ids: number;
  monthly_booked_value: string;
  active_monthly_booked_value: string;
  active_contract_value: string;
  draw_eligible_count: number;
  historical_subscription_count: number;
  cancelled_subscription_count: number;
  archived_subscription_count: number;
  historical_monthly_booked_value: string;
  draw_count: number;
  [key: string]: unknown;
};

export type LuckyPlanBatchControlCenter = {
  batch_id: number;
  batch_code: string;
  target_size: number;
  active_subscriptions: number;
  minimum_threshold: number;
  minimum_threshold_met: boolean;
  recommended_threshold_status: string;
  lock_status: string;
  batch_status: LuckyPlanBatchStatus | string;
  locked_at: string | null;
  snapshot_status: string;
  snapshot_version: number | null;
  snapshot_row_count: number;
  snapshot_hash: string | null;
  commit_status: string;
  public_commit_hash: string | null;
  draw_status: string;
  winner_lucky_number: number | null;
  product_demand_status: string;
  delivery_status: string;
  finance_waiver_posting_status: string;
  finance_waiver_posting_reason: string | null;
  disabled_reasons: {
    lock_batch: string[];
    commit_draw: string[];
    execute_draw: string[];
  };
  [key: string]: unknown;
};

export type LuckyPlanBatchWritePayload = {
  batch_code: string;
  total_slots: number;
  duration_months: number;
  draw_day: number;
  start_date: string;
  status?: LuckyPlanBatchStatus | string;
};

export type LuckyPlanLuckyId = {
  id: number;
  batch: number;
  batch_code: string;
  lucky_number: number;
  status: LuckyPlanIdStatus | string;
  customer_name: string | null;
  subscription_id: number | null;
  subscription_number: string | null;
  current_customer_name: string | null;
  current_subscription_id: number | null;
  current_subscription_code: string | null;
  current_assignment_status: string | null;
  is_currently_assigned: boolean;
  is_available: boolean;
  has_historical_assignment: boolean;
  historical_subscription_status: string | null;
  historical_subscription_code: string | null;
  history_label: string;
  assignable: boolean;
  assignment_state: string;
  assignment_note: string;
  created_at: string;
  [key: string]: unknown;
};

export type LuckyPlanDraw = {
  id: number;
  batch: number;
  batch_code: string;
  draw_commit_id: number | null;
  committed_hash: string;
  revealed_seed: string | null;
  public_commit_hash: string | null;
  commitment_published_at: string | null;
  eligible_snapshot_count: number;
  winner_lucky_id: number | null;
  winner_lucky_number: number | null;
  winner_subscription: number | null;
  winner_subscription_id: number | null;
  winner_subscription_number: string | null;
  winner_customer_name: string | null;
  public_winner_name_masked: string | null;
  draw_date: string;
  draw_month: number;
  is_revealed: boolean;
  revealed_at: string | null;
  verification_status: string;
  public_verification_status: string;
  public_explanation: string | null;
  waived_emi_count: number | null;
  waived_amount: string | null;
  waiver_scope: string | null;
  created_at: string;
  [key: string]: unknown;
};

export type LuckyPlanDrawTimelineItem = {
  id: number;
  action_type: string;
  model_name: string;
  object_id: number | string | null;
  performed_by: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export type LuckyPlanDrawWinnerSettlement = {
  draw_id: number;
  is_revealed: boolean;
  revealed_at: string | null;
  winner_lucky_id: number | null;
  winner_lucky_number: number | null;
  winner_subscription_id: number | null;
  winner_subscription_number: string | null;
  winner_customer_name: string | null;
  waived_emi_count: number | null;
  waived_amount: string | null;
  waiver_scope: string | null;
  waived_emis: Array<{
    id: number;
    month_no: number;
    due_date: string | null;
    amount: string;
    status: string;
  }>;
  [key: string]: unknown;
};

export type LuckyPlanActionResponse = {
  id?: number;
  batch_id?: number;
  status?: string;
  draw_commit_id?: number | null;
  snapshot_hash?: string | null;
  public_commit_hash?: string | null;
  lucky_draw_id?: number | null;
  admin_seed_store_securely?: string | null;
  active_subscription_count?: number;
  eligible_count?: number;
  lock_timestamp?: string | null;
  messages?: string[];
  idempotent?: boolean;
  [key: string]: unknown;
};

export type LuckyPlanBatchMutationPayload = LuckyPlanBatchWritePayload;
