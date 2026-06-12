import type { Database } from "better-sqlite3";
import type { MatchStatus } from "@worldcup-ai-pk/shared";

interface ApiFootballFixture {
  fixture?: {
    id?: number;
    date?: string;
    venue?: {
      name?: string | null;
    } | null;
    status?: {
      short?: string;
    } | null;
  };
  league?: {
    round?: string;
  };
  teams?: {
    home?: {
      id?: number;
      name?: string;
      logo?: string | null;
    };
    away?: {
      id?: number;
      name?: string;
      logo?: string | null;
    };
  };
  goals?: {
    home?: number | null;
    away?: number | null;
  };
}

export interface FixtureImportResult {
  imported: number;
}

function mapStatus(statusShort: string | undefined): MatchStatus {
  if (statusShort === "FT" || statusShort === "AET" || statusShort === "PEN") {
    return "finished";
  }

  if (statusShort === "1H" || statusShort === "HT" || statusShort === "2H" || statusShort === "ET" || statusShort === "BT" || statusShort === "P" || statusShort === "SUSP" || statusShort === "INT") {
    return "live";
  }

  if (statusShort === "PST") {
    return "postponed";
  }

  if (statusShort === "CANC" || statusShort === "ABD" || statusShort === "AWD" || statusShort === "WO") {
    return "cancelled";
  }

  return "scheduled";
}

function requireNumber(value: number | undefined, label: string): number {
  if (typeof value !== "number") {
    throw new Error(`API-Football fixture is missing ${label}`);
  }

  return value;
}

function requireString(value: string | undefined, label: string): string {
  if (!value) {
    throw new Error(`API-Football fixture is missing ${label}`);
  }

  return value;
}

export function importApiFootballFixturesResponse(
  db: Database,
  apiResponse: unknown,
  syncedAt = new Date()
): FixtureImportResult {
  const response = apiResponse && typeof apiResponse === "object" && "response" in apiResponse
    ? (apiResponse as { response: unknown }).response
    : [];
  const fixtures = Array.isArray(response) ? (response as ApiFootballFixture[]) : [];
  const statement = db.prepare(
    `
      INSERT INTO matches (
        id,
        api_football_fixture_id,
        stage,
        kickoff_at,
        status,
        venue,
        home_team_id,
        home_team_name,
        home_team_logo_url,
        away_team_id,
        away_team_name,
        away_team_logo_url,
        home_score,
        away_score,
        last_synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(api_football_fixture_id) DO UPDATE SET
        stage = excluded.stage,
        kickoff_at = excluded.kickoff_at,
        status = excluded.status,
        venue = excluded.venue,
        home_team_id = excluded.home_team_id,
        home_team_name = excluded.home_team_name,
        home_team_logo_url = excluded.home_team_logo_url,
        away_team_id = excluded.away_team_id,
        away_team_name = excluded.away_team_name,
        away_team_logo_url = excluded.away_team_logo_url,
        home_score = excluded.home_score,
        away_score = excluded.away_score,
        last_synced_at = excluded.last_synced_at
    `
  );

  const transaction = db.transaction((items: ApiFootballFixture[]) => {
    for (const item of items) {
      const fixtureId = requireNumber(item.fixture?.id, "fixture.id");
      const kickoffDate = requireString(item.fixture?.date, "fixture.date");
      const homeTeamId = requireNumber(item.teams?.home?.id, "teams.home.id");
      const homeTeamName = requireString(item.teams?.home?.name, "teams.home.name");
      const awayTeamId = requireNumber(item.teams?.away?.id, "teams.away.id");
      const awayTeamName = requireString(item.teams?.away?.name, "teams.away.name");

      statement.run(
        `api-football-${fixtureId}`,
        fixtureId,
        item.league?.round ?? "Unknown",
        new Date(kickoffDate).toISOString(),
        mapStatus(item.fixture?.status?.short),
        item.fixture?.venue?.name ?? null,
        String(homeTeamId),
        homeTeamName,
        item.teams?.home?.logo ?? null,
        String(awayTeamId),
        awayTeamName,
        item.teams?.away?.logo ?? null,
        item.goals?.home ?? null,
        item.goals?.away ?? null,
        syncedAt.toISOString()
      );
    }
  });

  transaction(fixtures);

  return { imported: fixtures.length };
}
