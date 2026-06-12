import type { MatchDto } from "@worldcup-ai-pk/shared";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:4000";

export interface ApiFootballSettingsStatus {
  configured: boolean;
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
