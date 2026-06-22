import type {
  AdminSummaryDto,
  AiModelConfigDto,
  AiProviderConfigDto,
  BettingArenaDto,
  BettingArenaLedgerDto,
  ExternalIntelSettingsDto,
  FixtureContextSummaryDto,
  LeaderboardDto,
  MatchDto,
  ParlayCombinationInputDto,
  ParlayCombinationRunDto,
  PredictionDataOptionsDto,
  PredictionRequestInputDto,
  PredictionRequestResponseDto,
  PredictionRunHistoryDto,
  PredictionRunStatusDto,
  PromptTemplateConfigDto,
  TeamDisplayNameDto
} from "@worldcup-ai-pk/shared";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "";

interface ApiResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}

interface ApiRequestInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  cache?: RequestCache;
}

function request(url: string, init?: ApiRequestInit): Promise<ApiResponse> {
  if (typeof globalThis.fetch === "function") {
    return init ? globalThis.fetch(url, init) : globalThis.fetch(url);
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(init?.method ?? "GET", url);

    Object.entries(init?.headers ?? {}).forEach(([key, value]) => {
      xhr.setRequestHeader(key, value);
    });

    xhr.onload = () => {
      resolve({
        ok: xhr.status >= 200 && xhr.status < 300,
        status: xhr.status,
        json: async () => JSON.parse(xhr.responseText)
      });
    };
    xhr.onerror = () => {
      reject(new Error(`API request failed with status ${xhr.status}`));
    };
    xhr.send(init?.body);
  });
}

export interface ApiFootballSettingsStatus {
  configured: boolean;
}

export interface SportterySettingsStatus {
  enabled: boolean;
}

export interface AdminSportteryMappingDto {
  apiFootballFixtureId: number;
  sportteryMatchId: number;
  updatedAt: string;
}

export interface AdminSportteryMappingSyncResult {
  matched: number;
  unmatched: number;
  totalSportteryMatches: number;
}

export interface RawFixturesCaptureResult {
  captured: boolean;
  error?: string;
  errors?: unknown;
}

export interface SaveAiProviderRequest {
  name: string;
  displayName: string;
  baseUrl: string;
  apiKey: string;
  enabled: boolean;
}

export interface SaveAiModelRequest {
  providerId: string;
  modelName: string;
  displayName: string;
  enabled: boolean;
  contextWindowTokens: number;
  maxOutputTokens: number;
  requestTimeoutMs: number;
  requestRetryCount: number;
}

export interface SavePromptTemplateRequest {
  name: string;
  description: string;
  fullPrompt: string;
  promptSummary: string;
  scope: string;
  enabled: boolean;
  isDefault: boolean;
}

export interface AdminContextCacheLogDto {
  matchId: string;
  domain: string;
  status: string;
  error: string | null;
  syncedAt: string;
}

export interface AdminAiModelTestResult {
  ok: boolean;
  status: number;
  message: string;
  latencyMs: number;
}

export async function getPublicHealth(): Promise<{ ok: boolean; service: string }> {
  const response = await request(`${apiBaseUrl}/api/public/health`);
  if (!response.ok) {
    throw new Error(`Public API health request failed with status ${response.status}`);
  }
  return (await response.json()) as { ok: boolean; service: string };
}

export async function getPublicMatches(): Promise<MatchDto[]> {
  const response = await request(`${apiBaseUrl}/api/public/matches`);
  if (!response.ok) {
    throw new Error(`Public matches request failed with status ${response.status}`);
  }
  const body = (await response.json()) as { matches: MatchDto[] };
  return body.matches;
}

export async function getPublicLeaderboard(): Promise<LeaderboardDto> {
  const response = await request(`${apiBaseUrl}/api/public/leaderboard`, {
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error(`Public leaderboard request failed with status ${response.status}`);
  }
  return (await response.json()) as LeaderboardDto;
}

export async function getBettingArena(): Promise<BettingArenaDto> {
  const response = await request(`${apiBaseUrl}/api/public/betting-arena`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Public betting arena request failed with status ${response.status}`);
  }
  return (await response.json()) as BettingArenaDto;
}

export async function getBettingArenaRound(roundId: string): Promise<BettingArenaDto> {
  const response = await request(`${apiBaseUrl}/api/public/betting-arena/rounds/${roundId}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Public betting arena round detail request failed with status ${response.status}`);
  }
  return (await response.json()) as BettingArenaDto;
}

export async function getBettingArenaLedger(params: { modelId?: string | null; limit?: number; offset?: number } = {}): Promise<BettingArenaLedgerDto> {
  const query = new URLSearchParams();
  if (params.modelId) query.set("modelId", params.modelId);
  if (typeof params.limit === "number") query.set("limit", String(params.limit));
  if (typeof params.offset === "number") query.set("offset", String(params.offset));
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const response = await request(`${apiBaseUrl}/api/public/betting-arena/ledger${suffix}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Public betting arena ledger request failed with status ${response.status}`);
  }
  return (await response.json()) as BettingArenaLedgerDto;
}

export async function triggerBettingArenaRound(): Promise<BettingArenaDto> {
  const response = await request(`${apiBaseUrl}/api/public/betting-arena/rounds`, {
    method: "POST"
  });
  if (!response.ok) {
    throw new Error(`Public betting arena round request failed with status ${response.status}`);
  }
  return (await response.json()) as BettingArenaDto;
}

export async function triggerBettingArenaModel(roundId: string, modelId: string): Promise<BettingArenaDto> {
  const response = await request(`${apiBaseUrl}/api/public/betting-arena/rounds/${roundId}/models/${modelId}`, {
    method: "POST"
  });
  if (!response.ok) {
    throw new Error(`Public betting arena model request failed with status ${response.status}`);
  }
  return (await response.json()) as BettingArenaDto;
}

export async function settleBettingArenaRound(roundId: string): Promise<BettingArenaDto> {
  const response = await request(`${apiBaseUrl}/api/public/betting-arena/rounds/${roundId}/settle`, {
    method: "POST"
  });
  if (!response.ok) {
    throw new Error(`Public betting arena settlement request failed with status ${response.status}`);
  }
  return (await response.json()) as BettingArenaDto;
}

export async function getMatchContext(matchId: string): Promise<FixtureContextSummaryDto> {
  const response = await request(`${apiBaseUrl}/api/public/matches/${matchId}/context`);
  if (!response.ok) {
    throw new Error(`Public match context request failed with status ${response.status}`);
  }
  return (await response.json()) as FixtureContextSummaryDto;
}

export async function refreshMatchContext(matchId: string, dataOptions: PredictionDataOptionsDto): Promise<FixtureContextSummaryDto> {
  const response = await request(`${apiBaseUrl}/api/public/matches/${matchId}/context/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dataOptions })
  });
  if (!response.ok) {
    throw new Error(`Public match context refresh failed with status ${response.status}`);
  }
  return (await response.json()) as FixtureContextSummaryDto;
}

export async function requestMatchPrediction(matchId: string, input: PredictionRequestInputDto): Promise<PredictionRequestResponseDto> {
  const response = await request(`${apiBaseUrl}/api/public/matches/${matchId}/prediction-request`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  if (!response.ok) {
    throw new Error(`Public prediction request failed with status ${response.status}`);
  }
  return (await response.json()) as PredictionRequestResponseDto;
}

export async function getPredictionRunStatus(runId: string): Promise<PredictionRunStatusDto> {
  const response = await request(`${apiBaseUrl}/api/public/prediction-runs/${runId}`, {
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error(`Public prediction run status request failed with status ${response.status}`);
  }
  return (await response.json()) as PredictionRunStatusDto;
}

export async function getMatchPredictionHistory(matchId: string): Promise<PredictionRunHistoryDto> {
  const response = await request(`${apiBaseUrl}/api/public/matches/${matchId}/prediction-runs`, {
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error(`Public match prediction history request failed with status ${response.status}`);
  }
  return (await response.json()) as PredictionRunHistoryDto;
}

export async function createParlayCombination(input: ParlayCombinationInputDto): Promise<ParlayCombinationRunDto> {
  const response = await request(`${apiBaseUrl}/api/public/parlay-combinations`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  if (!response.ok) {
    throw new Error(`Public parlay combination request failed with status ${response.status}`);
  }
  return (await response.json()) as ParlayCombinationRunDto;
}

export async function getAdminApiFootballSettings(): Promise<ApiFootballSettingsStatus> {
  const response = await request(`${apiBaseUrl}/api/admin/settings/api-football`);
  if (!response.ok) {
    throw new Error(`Admin API-Football settings request failed with status ${response.status}`);
  }
  return (await response.json()) as ApiFootballSettingsStatus;
}

export async function saveAdminApiFootballKey(apiKey: string): Promise<ApiFootballSettingsStatus> {
  const response = await request(`${apiBaseUrl}/api/admin/settings/api-football`, {
    method: "PUT",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ apiKey })
  });
  if (!response.ok) {
    throw new Error(`Admin API-Football settings save failed with status ${response.status}`);
  }
  return (await response.json()) as ApiFootballSettingsStatus;
}

export async function getAdminSportterySettings(): Promise<SportterySettingsStatus> {
  const response = await request(`${apiBaseUrl}/api/admin/settings/sporttery`);
  if (!response.ok) {
    throw new Error(`Admin Sporttery settings request failed with status ${response.status}`);
  }
  return (await response.json()) as SportterySettingsStatus;
}

export async function saveAdminSportterySettings(enabled: boolean): Promise<SportterySettingsStatus> {
  const response = await request(`${apiBaseUrl}/api/admin/settings/sporttery`, {
    method: "PUT",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ enabled })
  });
  if (!response.ok) {
    throw new Error(`Admin Sporttery settings save failed with status ${response.status}`);
  }
  return (await response.json()) as SportterySettingsStatus;
}

export async function getAdminExternalIntelSettings(): Promise<ExternalIntelSettingsDto> {
  const response = await request(`${apiBaseUrl}/api/admin/settings/external-intel`);
  if (!response.ok) {
    throw new Error(`Admin external intelligence settings request failed with status ${response.status}`);
  }
  return (await response.json()) as ExternalIntelSettingsDto;
}

export async function saveAdminExternalIntelSettings(input: ExternalIntelSettingsDto): Promise<ExternalIntelSettingsDto> {
  const response = await request(`${apiBaseUrl}/api/admin/settings/external-intel`, {
    method: "PUT",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(input)
  });
  if (!response.ok) {
    throw new Error(`Admin external intelligence settings save failed with status ${response.status}`);
  }
  return (await response.json()) as ExternalIntelSettingsDto;
}

export async function refreshAdminMatchExternalIntel(matchId: string): Promise<unknown> {
  const response = await request(`${apiBaseUrl}/api/admin/matches/${matchId}/external-intel/refresh`, {
    method: "POST"
  });
  if (!response.ok) {
    throw new Error(`Admin external intelligence refresh failed with status ${response.status}`);
  }
  return response.json();
}

export async function listAdminSportteryMappings(): Promise<AdminSportteryMappingDto[]> {
  const response = await request(`${apiBaseUrl}/api/admin/sporttery-mappings`);
  if (!response.ok) {
    throw new Error(`Admin Sporttery mappings request failed with status ${response.status}`);
  }
  const body = (await response.json()) as { mappings: AdminSportteryMappingDto[] };
  return body.mappings;
}

export async function syncAdminSportteryMappings(): Promise<AdminSportteryMappingSyncResult> {
  const response = await request(`${apiBaseUrl}/api/admin/sporttery-mappings/sync`, {
    method: "POST"
  });
  if (!response.ok) {
    throw new Error(`Admin Sporttery mappings sync failed with status ${response.status}`);
  }
  return (await response.json()) as AdminSportteryMappingSyncResult;
}

export async function captureApiFootballFixturesRaw(): Promise<RawFixturesCaptureResult> {
  const response = await request(`${apiBaseUrl}/api/admin/sync/api-football/fixtures/raw`, {
    method: "POST"
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as RawFixturesCaptureResult | null;
    throw new Error(body?.error ?? `Raw API-Football fixtures capture failed with status ${response.status}`);
  }
  return (await response.json()) as RawFixturesCaptureResult;
}

export async function getAdminSummary(): Promise<AdminSummaryDto> {
  const response = await request(`${apiBaseUrl}/api/admin/summary`);
  if (!response.ok) {
    throw new Error(`Admin summary request failed with status ${response.status}`);
  }
  return (await response.json()) as AdminSummaryDto;
}

export async function syncApiFootballFixtures(): Promise<{ synced: boolean; imported: number }> {
  const response = await request(`${apiBaseUrl}/api/admin/sync/api-football/fixtures`, {
    method: "POST"
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `API-Football fixtures sync failed with status ${response.status}`);
  }
  return (await response.json()) as { synced: boolean; imported: number };
}

export async function listAdminContextCacheLogs(): Promise<AdminContextCacheLogDto[]> {
  const response = await request(`${apiBaseUrl}/api/admin/context-cache`);
  if (!response.ok) {
    throw new Error(`Admin context cache request failed with status ${response.status}`);
  }
  const body = (await response.json()) as { logs: AdminContextCacheLogDto[] };
  return body.logs;
}

export async function listAdminAiProviders(): Promise<AiProviderConfigDto[]> {
  const response = await request(`${apiBaseUrl}/api/admin/ai-providers`);
  if (!response.ok) {
    throw new Error(`Admin AI providers request failed with status ${response.status}`);
  }
  const body = (await response.json()) as { providers: AiProviderConfigDto[] };
  return body.providers;
}

export async function saveAdminAiProvider(input: SaveAiProviderRequest): Promise<AiProviderConfigDto> {
  const response = await request(`${apiBaseUrl}/api/admin/ai-providers`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(input)
  });
  if (!response.ok) {
    throw new Error(`Admin AI provider save failed with status ${response.status}`);
  }
  return (await response.json()) as AiProviderConfigDto;
}

export async function deleteAdminAiProvider(id: string): Promise<{ deleted: boolean }> {
  const response = await request(`${apiBaseUrl}/api/admin/ai-providers/${id}`, {
    method: "DELETE"
  });
  if (!response.ok) {
    throw new Error(`Admin AI provider delete failed with status ${response.status}`);
  }
  return (await response.json()) as { deleted: boolean };
}

export async function listAdminAiModels(): Promise<AiModelConfigDto[]> {
  const response = await request(`${apiBaseUrl}/api/admin/ai-models`);
  if (!response.ok) {
    throw new Error(`Admin AI models request failed with status ${response.status}`);
  }
  const body = (await response.json()) as { models: AiModelConfigDto[] };
  return body.models;
}

export async function saveAdminAiModel(input: SaveAiModelRequest): Promise<AiModelConfigDto> {
  const response = await request(`${apiBaseUrl}/api/admin/ai-models`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(input)
  });
  if (!response.ok) {
    throw new Error(`Admin AI model save failed with status ${response.status}`);
  }
  return (await response.json()) as AiModelConfigDto;
}

export async function updateAdminAiModel(id: string, input: SaveAiModelRequest): Promise<AiModelConfigDto> {
  const response = await request(`${apiBaseUrl}/api/admin/ai-models/${id}`, {
    method: "PUT",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(input)
  });
  if (!response.ok) {
    throw new Error(`Admin AI model update failed with status ${response.status}`);
  }
  return (await response.json()) as AiModelConfigDto;
}

export async function testAdminAiModel(id: string): Promise<AdminAiModelTestResult> {
  const response = await request(`${apiBaseUrl}/api/admin/ai-models/${id}/test`, {
    method: "POST"
  });
  if (!response.ok) {
    throw new Error(`Admin AI model test failed with status ${response.status}`);
  }
  return (await response.json()) as AdminAiModelTestResult;
}

export async function deleteAdminAiModel(id: string): Promise<{ deleted: boolean }> {
  const response = await request(`${apiBaseUrl}/api/admin/ai-models/${id}`, {
    method: "DELETE"
  });
  if (!response.ok) {
    throw new Error(`Admin AI model delete failed with status ${response.status}`);
  }
  return (await response.json()) as { deleted: boolean };
}

export async function listAdminPromptTemplates(): Promise<PromptTemplateConfigDto[]> {
  const response = await request(`${apiBaseUrl}/api/admin/prompt-templates`);
  if (!response.ok) {
    throw new Error(`Admin prompt templates request failed with status ${response.status}`);
  }
  const body = (await response.json()) as { promptTemplates: PromptTemplateConfigDto[] };
  return body.promptTemplates;
}

export async function saveAdminPromptTemplate(input: SavePromptTemplateRequest): Promise<PromptTemplateConfigDto> {
  const response = await request(`${apiBaseUrl}/api/admin/prompt-templates`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(input)
  });
  if (!response.ok) {
    throw new Error(`Admin prompt template save failed with status ${response.status}`);
  }
  return (await response.json()) as PromptTemplateConfigDto;
}

export async function updateAdminPromptTemplate(id: string, input: SavePromptTemplateRequest): Promise<PromptTemplateConfigDto> {
  const response = await request(`${apiBaseUrl}/api/admin/prompt-templates/${id}`, {
    method: "PUT",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(input)
  });
  if (!response.ok) {
    throw new Error(`Admin prompt template update failed with status ${response.status}`);
  }
  return (await response.json()) as PromptTemplateConfigDto;
}

export async function deleteAdminPromptTemplate(id: string): Promise<{ deleted: boolean }> {
  const response = await request(`${apiBaseUrl}/api/admin/prompt-templates/${id}`, {
    method: "DELETE"
  });
  if (!response.ok) {
    throw new Error(`Admin prompt template delete failed with status ${response.status}`);
  }
  return (await response.json()) as { deleted: boolean };
}

export async function listAdminTeamDisplayNames(query = ""): Promise<TeamDisplayNameDto[]> {
  const searchParams = new URLSearchParams();
  if (query.trim()) {
    searchParams.set("q", query.trim());
  }
  const queryString = searchParams.toString();
  const response = await request(`${apiBaseUrl}/api/admin/team-display-names${queryString ? `?${queryString}` : ""}`);
  if (!response.ok) {
    throw new Error(`Admin team display names request failed with status ${response.status}`);
  }
  const body = (await response.json()) as { teams: TeamDisplayNameDto[] };
  return body.teams;
}

export async function saveAdminTeamDisplayName(apiFootballTeamId: string, displayNameZh: string): Promise<TeamDisplayNameDto> {
  const response = await request(`${apiBaseUrl}/api/admin/team-display-names/${apiFootballTeamId}`, {
    method: "PUT",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ displayNameZh })
  });
  if (!response.ok) {
    throw new Error(`Admin team display name save failed with status ${response.status}`);
  }
  return (await response.json()) as TeamDisplayNameDto;
}
