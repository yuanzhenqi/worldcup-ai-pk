import type { MatchDto } from "@worldcup-ai-pk/shared";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:4000";

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
