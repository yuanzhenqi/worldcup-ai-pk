import type {
  AdminSummaryDto,
  AiModelConfigDto,
  AiProviderConfigDto,
  MatchDto,
  PromptTemplateConfigDto,
  TeamDisplayNameDto
} from "@worldcup-ai-pk/shared";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:4000";

export interface ApiFootballSettingsStatus {
  configured: boolean;
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

export async function getPublicHealth(): Promise<{ ok: boolean; service: string }> {
  const response = await fetch(`${apiBaseUrl}/api/public/health`);
  if (!response.ok) {
    throw new Error(`Public API health request failed with status ${response.status}`);
  }
  return (await response.json()) as { ok: boolean; service: string };
}

export async function getPublicMatches(): Promise<MatchDto[]> {
  const response = await fetch(`${apiBaseUrl}/api/public/matches`);
  if (!response.ok) {
    throw new Error(`Public matches request failed with status ${response.status}`);
  }
  const body = (await response.json()) as { matches: MatchDto[] };
  return body.matches;
}

export async function getAdminApiFootballSettings(): Promise<ApiFootballSettingsStatus> {
  const response = await fetch(`${apiBaseUrl}/api/admin/settings/api-football`);
  if (!response.ok) {
    throw new Error(`Admin API-Football settings request failed with status ${response.status}`);
  }
  return (await response.json()) as ApiFootballSettingsStatus;
}

export async function saveAdminApiFootballKey(apiKey: string): Promise<ApiFootballSettingsStatus> {
  const response = await fetch(`${apiBaseUrl}/api/admin/settings/api-football`, {
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

export async function captureApiFootballFixturesRaw(): Promise<RawFixturesCaptureResult> {
  const response = await fetch(`${apiBaseUrl}/api/admin/sync/api-football/fixtures/raw`, {
    method: "POST"
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as RawFixturesCaptureResult | null;
    throw new Error(body?.error ?? `Raw API-Football fixtures capture failed with status ${response.status}`);
  }
  return (await response.json()) as RawFixturesCaptureResult;
}

export async function getAdminSummary(): Promise<AdminSummaryDto> {
  const response = await fetch(`${apiBaseUrl}/api/admin/summary`);
  if (!response.ok) {
    throw new Error(`Admin summary request failed with status ${response.status}`);
  }
  return (await response.json()) as AdminSummaryDto;
}

export async function syncApiFootballFixtures(): Promise<{ synced: boolean; imported: number }> {
  const response = await fetch(`${apiBaseUrl}/api/admin/sync/api-football/fixtures`, {
    method: "POST"
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `API-Football fixtures sync failed with status ${response.status}`);
  }
  return (await response.json()) as { synced: boolean; imported: number };
}

export async function listAdminAiProviders(): Promise<AiProviderConfigDto[]> {
  const response = await fetch(`${apiBaseUrl}/api/admin/ai-providers`);
  if (!response.ok) {
    throw new Error(`Admin AI providers request failed with status ${response.status}`);
  }
  const body = (await response.json()) as { providers: AiProviderConfigDto[] };
  return body.providers;
}

export async function saveAdminAiProvider(input: SaveAiProviderRequest): Promise<AiProviderConfigDto> {
  const response = await fetch(`${apiBaseUrl}/api/admin/ai-providers`, {
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

export async function listAdminAiModels(): Promise<AiModelConfigDto[]> {
  const response = await fetch(`${apiBaseUrl}/api/admin/ai-models`);
  if (!response.ok) {
    throw new Error(`Admin AI models request failed with status ${response.status}`);
  }
  const body = (await response.json()) as { models: AiModelConfigDto[] };
  return body.models;
}

export async function saveAdminAiModel(input: SaveAiModelRequest): Promise<AiModelConfigDto> {
  const response = await fetch(`${apiBaseUrl}/api/admin/ai-models`, {
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

export async function listAdminPromptTemplates(): Promise<PromptTemplateConfigDto[]> {
  const response = await fetch(`${apiBaseUrl}/api/admin/prompt-templates`);
  if (!response.ok) {
    throw new Error(`Admin prompt templates request failed with status ${response.status}`);
  }
  const body = (await response.json()) as { promptTemplates: PromptTemplateConfigDto[] };
  return body.promptTemplates;
}

export async function saveAdminPromptTemplate(input: SavePromptTemplateRequest): Promise<PromptTemplateConfigDto> {
  const response = await fetch(`${apiBaseUrl}/api/admin/prompt-templates`, {
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

export async function listAdminTeamDisplayNames(query = ""): Promise<TeamDisplayNameDto[]> {
  const searchParams = new URLSearchParams();
  if (query.trim()) {
    searchParams.set("q", query.trim());
  }
  const queryString = searchParams.toString();
  const response = await fetch(`${apiBaseUrl}/api/admin/team-display-names${queryString ? `?${queryString}` : ""}`);
  if (!response.ok) {
    throw new Error(`Admin team display names request failed with status ${response.status}`);
  }
  const body = (await response.json()) as { teams: TeamDisplayNameDto[] };
  return body.teams;
}

export async function saveAdminTeamDisplayName(apiFootballTeamId: string, displayNameZh: string): Promise<TeamDisplayNameDto> {
  const response = await fetch(`${apiBaseUrl}/api/admin/team-display-names/${apiFootballTeamId}`, {
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
