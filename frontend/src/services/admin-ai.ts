import { ApiError, apiFetch, toArray } from "@/lib/api";

export type AiConfidence = "HIGH" | "MEDIUM" | "LOW";

export type AiCitation = {
  sourceId: number;
  sourceTitle: string;
  chunkId: number;
  heading: string;
  excerpt: string;
};

export type AiSafety = {
  actionableFinancialInstruction: boolean;
  permissionFiltered: boolean;
  sourceGrounded: boolean;
};

export type AiQueryResponse = {
  answer: string;
  citations: AiCitation[];
  confidence: AiConfidence;
  retrievalMode: "KEYWORD" | "VECTOR" | "HYBRID";
  requestedRetrievalMode: "AUTO" | "KEYWORD" | "VECTOR" | "HYBRID";
  degraded: boolean;
  degradedReason: string;
  queryLogId: number | null;
  safety: AiSafety;
};

export type AiKnowledgeSource = {
  id: number;
  title: string;
  sourceType: string;
  status: string;
  visibility: string;
  checksum: string;
  version: number;
  metadata: Record<string, unknown>;
  embeddingStatus: "NOT_ENABLED" | "KEYWORD_ONLY" | "PENDING" | "EMBEDDED" | "FAILED";
  hasInlineContent: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AiKnowledgeChunk = {
  id: number;
  sourceId: number;
  chunkIndex: number;
  heading: string;
  contentPreview: string;
  tokenCount: number;
  visibility: string;
  createdAt: string;
};

export type AiQueryLog = {
  id: number;
  userDisplay: string;
  role: string;
  query: string;
  retrievalMode: string;
  requestedRetrievalMode: string;
  degraded: boolean;
  degradedReason: string;
  retrievedChunkIds: number[];
  answerPreview: string;
  latencyMs: number;
  deniedReason: string | null;
  feedbackStatus: string;
  createdAt: string;
};

export type AiReadinessResponse = {
  featureFlags: {
    aiAssistantEnabled: boolean;
    embeddingsEnabled: boolean;
    vectorSearchEnabled: boolean;
  };
  knowledgeBase: {
    sourcesTotal: number;
    sourcesActive: number;
    chunksTotal: number;
    embeddedChunks: number;
    failedSources: number;
  };
  retrieval: {
    defaultMode: "KEYWORD" | "VECTOR" | "HYBRID";
    vectorAvailable: boolean;
    fallbackEnabled: boolean;
  };
  safety: {
    readOnly: boolean;
    financialActionsEnabled: boolean;
    customerPrivateIngestionEnabled: boolean;
  };
  lastActivity: {
    lastIngestionStatus: string;
    lastSourceTitle: string;
    queryLogsCount: number;
    feedbackCount: number;
    unsafeBlockedIngestionCount: number;
  };
  recommendations: string[];
};

export type CreateAiSourceInput = {
  title: string;
  sourceType: string;
  contentText: string;
};

export type SubmitAiFeedbackInput = {
  queryLog: number;
  rating: "HELPFUL" | "NOT_HELPFUL" | "UNSAFE" | "INCORRECT";
  comment?: string;
};

export type BiExplainScope =
  | "ADMIN_DASHBOARD"
  | "BI_CONTROL_CENTER"
  | "FINANCE"
  | "INVENTORY"
  | "DELIVERY"
  | "HR"
  | "SUBSCRIPTIONS"
  | "CRM"
  | "PARTNER"
  | "ADMIN_BI";

export type BiExplainWindow = "TODAY" | "THIS_WEEK" | "THIS_MONTH" | "LAST_MONTH";

export type BiExplanationItem = {
  label: string;
  message: string;
  severity: "INFO" | "WARNING" | "LOW";
};

export type BiExplanationFollowUp = {
  label: string;
  href: string;
};

export type BiExplanationSourceMetric = {
  key: string;
  label: string;
  value: string | number;
  source: string;
};

export type BiExplanationResponse = {
  summary: string;
  highlights: BiExplanationItem[];
  risks: BiExplanationItem[];
  followUp: BiExplanationFollowUp[];
  sourceMetrics: BiExplanationSourceMetric[];
  generatedAt: string;
  safety: {
    readOnly: boolean;
    actionsExecuted: boolean;
  };
};

type RawAiCitation = {
  source_id?: number;
  source_title?: string;
  chunk_id?: number;
  heading?: string;
  excerpt?: string;
};

type RawAiQueryResponse = {
  answer?: string;
  citations?: RawAiCitation[];
  confidence?: AiConfidence;
  retrieval_mode?: "KEYWORD" | "VECTOR" | "HYBRID";
  requested_retrieval_mode?: "AUTO" | "KEYWORD" | "VECTOR" | "HYBRID";
  degraded?: boolean;
  degraded_reason?: string;
  query_log_id?: number;
  safety?: {
    actionable_financial_instruction?: boolean;
    permission_filtered?: boolean;
    source_grounded?: boolean;
  };
};

type RawAiSource = {
  id?: number;
  title?: string;
  source_type?: string;
  status?: string;
  visibility?: string;
  checksum?: string;
  version?: number;
  metadata?: Record<string, unknown>;
  has_inline_content?: boolean;
  created_at?: string;
  updated_at?: string;
};

type RawAiChunk = {
  id?: number;
  source_id?: number;
  chunk_index?: number;
  heading?: string;
  content_preview?: string;
  token_count?: number;
  visibility?: string;
  created_at?: string;
};

type RawAiQueryLog = {
  id?: number;
  user_display?: string;
  role?: string;
  query?: string;
  retrieval_mode?: string;
  requested_retrieval_mode?: string;
  degraded?: boolean;
  degraded_reason?: string;
  retrieved_chunk_ids?: number[];
  answer_preview?: string;
  latency_ms?: number;
  denied_reason?: string | null;
  feedback_status?: string;
  created_at?: string;
};

type RawAiReadinessResponse = {
  feature_flags?: {
    ai_assistant_enabled?: boolean;
    embeddings_enabled?: boolean;
    vector_search_enabled?: boolean;
  };
  knowledge_base?: {
    sources_total?: number;
    sources_active?: number;
    chunks_total?: number;
    embedded_chunks?: number;
    failed_sources?: number;
  };
  retrieval?: {
    default_mode?: "KEYWORD" | "VECTOR" | "HYBRID";
    vector_available?: boolean;
    fallback_enabled?: boolean;
  };
  safety?: {
    read_only?: boolean;
    financial_actions_enabled?: boolean;
    customer_private_ingestion_enabled?: boolean;
  };
  last_activity?: {
    last_ingestion_status?: string;
    last_source_title?: string;
    query_logs_count?: number;
    feedback_count?: number;
    unsafe_blocked_ingestion_count?: number;
  };
  recommendations?: string[];
};

type RawBiExplanationResponse = {
  summary?: string;
  highlights?: Array<{ label?: string; message?: string; severity?: "INFO" | "WARNING" | "LOW" }>;
  risks?: Array<{ label?: string; message?: string; severity?: "INFO" | "WARNING" | "LOW" }>;
  follow_up?: Array<{ label?: string; href?: string }>;
  source_metrics?: Array<{ key?: string; label?: string; value?: string | number; source?: string }>;
  generated_at?: string;
  safety?: {
    read_only?: boolean;
    actions_executed?: boolean;
  };
};

function normalizeCitation(row: RawAiCitation): AiCitation {
  return {
    sourceId: Number(row.source_id ?? 0),
    sourceTitle: row.source_title || "Approved source",
    chunkId: Number(row.chunk_id ?? 0),
    heading: row.heading || "Source excerpt",
    excerpt: row.excerpt || "",
  };
}

function normalizeQueryResponse(payload: RawAiQueryResponse): AiQueryResponse {
  return {
    answer: payload.answer || "",
    citations: Array.isArray(payload.citations) ? payload.citations.map(normalizeCitation) : [],
    confidence: payload.confidence || "LOW",
    retrievalMode: payload.retrieval_mode || "KEYWORD",
    requestedRetrievalMode: payload.requested_retrieval_mode || "AUTO",
    degraded: Boolean(payload.degraded),
    degradedReason: payload.degraded_reason || "",
    queryLogId: typeof payload.query_log_id === "number" ? payload.query_log_id : null,
    safety: {
      actionableFinancialInstruction: Boolean(payload.safety?.actionable_financial_instruction),
      permissionFiltered: Boolean(payload.safety?.permission_filtered),
      sourceGrounded: Boolean(payload.safety?.source_grounded),
    },
  };
}

function computeEmbeddingStatus(row: RawAiSource): AiKnowledgeSource["embeddingStatus"] {
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const raw = String((metadata as Record<string, unknown>).embedding_status || "");
  if (raw === "EMBEDDED") return "EMBEDDED";
  if (raw === "PENDING") return "PENDING";
  if (raw === "FAILED") return "FAILED";
  if (raw === "NOT_ENABLED") return "NOT_ENABLED";
  return "KEYWORD_ONLY";
}

function normalizeSource(row: RawAiSource): AiKnowledgeSource {
  return {
    id: Number(row.id ?? 0),
    title: row.title || "Untitled source",
    sourceType: row.source_type || "SYSTEM_HELP",
    status: row.status || "DRAFT",
    visibility: row.visibility || "ADMIN_ONLY",
    checksum: row.checksum || "",
    version: Number(row.version ?? 1),
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
    embeddingStatus: computeEmbeddingStatus(row),
    hasInlineContent: Boolean(row.has_inline_content),
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
  };
}

function normalizeChunk(row: RawAiChunk): AiKnowledgeChunk {
  return {
    id: Number(row.id ?? 0),
    sourceId: Number(row.source_id ?? 0),
    chunkIndex: Number(row.chunk_index ?? 0),
    heading: row.heading || "Source excerpt",
    contentPreview: row.content_preview || "",
    tokenCount: Number(row.token_count ?? 0),
    visibility: row.visibility || "ADMIN_ONLY",
    createdAt: row.created_at || "",
  };
}

function normalizeQueryLog(row: RawAiQueryLog): AiQueryLog {
  return {
    id: Number(row.id ?? 0),
    userDisplay: row.user_display || "Admin",
    role: row.role || "ADMIN",
    query: row.query || "",
    retrievalMode: row.retrieval_mode || "KEYWORD",
    requestedRetrievalMode: row.requested_retrieval_mode || "AUTO",
    degraded: Boolean(row.degraded),
    degradedReason: row.degraded_reason || "",
    retrievedChunkIds: Array.isArray(row.retrieved_chunk_ids) ? row.retrieved_chunk_ids : [],
    answerPreview: row.answer_preview || "",
    latencyMs: Number(row.latency_ms ?? 0),
    deniedReason: row.denied_reason ?? null,
    feedbackStatus: row.feedback_status || "",
    createdAt: row.created_at || "",
  };
}

function normalizeReadiness(payload: RawAiReadinessResponse): AiReadinessResponse {
  return {
    featureFlags: {
      aiAssistantEnabled: Boolean(payload.feature_flags?.ai_assistant_enabled),
      embeddingsEnabled: Boolean(payload.feature_flags?.embeddings_enabled),
      vectorSearchEnabled: Boolean(payload.feature_flags?.vector_search_enabled),
    },
    knowledgeBase: {
      sourcesTotal: Number(payload.knowledge_base?.sources_total ?? 0),
      sourcesActive: Number(payload.knowledge_base?.sources_active ?? 0),
      chunksTotal: Number(payload.knowledge_base?.chunks_total ?? 0),
      embeddedChunks: Number(payload.knowledge_base?.embedded_chunks ?? 0),
      failedSources: Number(payload.knowledge_base?.failed_sources ?? 0),
    },
    retrieval: {
      defaultMode: payload.retrieval?.default_mode || "KEYWORD",
      vectorAvailable: Boolean(payload.retrieval?.vector_available),
      fallbackEnabled: Boolean(payload.retrieval?.fallback_enabled),
    },
    safety: {
      readOnly: Boolean(payload.safety?.read_only),
      financialActionsEnabled: Boolean(payload.safety?.financial_actions_enabled),
      customerPrivateIngestionEnabled: Boolean(payload.safety?.customer_private_ingestion_enabled),
    },
    lastActivity: {
      lastIngestionStatus: payload.last_activity?.last_ingestion_status || "",
      lastSourceTitle: payload.last_activity?.last_source_title || "",
      queryLogsCount: Number(payload.last_activity?.query_logs_count ?? 0),
      feedbackCount: Number(payload.last_activity?.feedback_count ?? 0),
      unsafeBlockedIngestionCount: Number(payload.last_activity?.unsafe_blocked_ingestion_count ?? 0),
    },
    recommendations: Array.isArray(payload.recommendations) ? payload.recommendations : [],
  };
}

function normalizeBiItem(row: { label?: string; message?: string; severity?: "INFO" | "WARNING" | "LOW" }): BiExplanationItem {
  return {
    label: row.label || "Item",
    message: row.message || "",
    severity: row.severity || "INFO",
  };
}

function normalizeBiExplanation(payload: RawBiExplanationResponse): BiExplanationResponse {
  return {
    summary: payload.summary || "",
    highlights: Array.isArray(payload.highlights) ? payload.highlights.map(normalizeBiItem) : [],
    risks: Array.isArray(payload.risks) ? payload.risks.map(normalizeBiItem) : [],
    followUp: Array.isArray(payload.follow_up)
      ? payload.follow_up.map((row) => ({ label: row.label || "Follow-up", href: row.href || "/admin/bi" }))
      : [],
    sourceMetrics: Array.isArray(payload.source_metrics)
      ? payload.source_metrics.map((row) => ({
          key: row.key || "metric",
          label: row.label || "Metric",
          value: row.value ?? 0,
          source: row.source || "/api/v1/admin/bi/summary/",
        }))
      : [],
    generatedAt: payload.generated_at || "",
    safety: {
      readOnly: Boolean(payload.safety?.read_only),
      actionsExecuted: Boolean(payload.safety?.actions_executed),
    },
  };
}

export function isAiDisabledError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 503;
}

export async function queryAI(
  query: string,
  topK = 5,
  retrievalMode: "AUTO" | "KEYWORD" | "VECTOR" | "HYBRID" = "AUTO"
): Promise<AiQueryResponse> {
  const payload = await apiFetch<RawAiQueryResponse>("/admin/ai/query/", {
    method: "POST",
    body: {
      query,
      scope: "INTERNAL_DOCS",
      top_k: topK,
      retrieval_mode: retrievalMode,
    },
  });
  return normalizeQueryResponse(payload);
}

export async function getSources(): Promise<AiKnowledgeSource[]> {
  const payload = await apiFetch<unknown>("/admin/ai/sources/");
  return toArray<RawAiSource>(payload).map(normalizeSource);
}

export async function getSource(id: number): Promise<AiKnowledgeSource> {
  const payload = await apiFetch<RawAiSource>(`/admin/ai/sources/${id}/`);
  return normalizeSource(payload);
}

export async function getSourceChunks(id: number): Promise<AiKnowledgeChunk[]> {
  const payload = await apiFetch<unknown>(`/admin/ai/sources/${id}/chunks/`);
  return toArray<RawAiChunk>(payload).map(normalizeChunk);
}

export async function createSource(input: CreateAiSourceInput): Promise<AiKnowledgeSource> {
  const payload = await apiFetch<RawAiSource>("/admin/ai/sources/", {
    method: "POST",
    body: {
      title: input.title,
      source_type: input.sourceType,
      status: "DRAFT",
      visibility: "ADMIN_ONLY",
      content_text: input.contentText,
    },
  });
  return normalizeSource(payload);
}

export async function ingestSource(id: number): Promise<{ sourceId: number; status: string; chunkCount: number }> {
  const payload = await apiFetch<{ source_id?: number; status?: string; chunk_count?: number }>(
    `/admin/ai/sources/${id}/ingest/`,
    { method: "POST", body: {} }
  );
  return {
    sourceId: Number(payload.source_id ?? id),
    status: payload.status || "ACTIVE",
    chunkCount: Number(payload.chunk_count ?? 0),
  };
}

export async function submitFeedback(input: SubmitAiFeedbackInput): Promise<void> {
  await apiFetch("/admin/ai/feedback/", {
    method: "POST",
    body: {
      query_log: input.queryLog,
      rating: input.rating,
      comment: input.comment || "",
    },
  });
}

export async function getQueryLogs(): Promise<AiQueryLog[]> {
  const payload = await apiFetch<unknown>("/admin/ai/query-log/");
  return toArray<RawAiQueryLog>(payload).map(normalizeQueryLog);
}

export async function explainBI(scope: BiExplainScope, window: BiExplainWindow): Promise<BiExplanationResponse> {
  const params = new URLSearchParams({ scope, window });
  const payload = await apiFetch<RawBiExplanationResponse>(`/admin/ai/bi-explain/?${params.toString()}`);
  return normalizeBiExplanation(payload);
}

export async function getAiReadiness(): Promise<AiReadinessResponse> {
  const payload = await apiFetch<RawAiReadinessResponse>("/admin/ai/readiness/");
  return normalizeReadiness(payload);
}
