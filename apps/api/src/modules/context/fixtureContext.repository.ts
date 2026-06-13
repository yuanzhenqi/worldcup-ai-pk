import { randomUUID } from "node:crypto";
import type { Database } from "better-sqlite3";
import type {
  FixtureContextDomain,
  FixtureContextDomainStatus,
  FixtureContextSummaryDto
} from "@worldcup-ai-pk/shared";

interface FixtureContextSnapshotInput {
  matchId: string;
  completeness: FixtureContextSummaryDto["completeness"];
  domains: FixtureContextSummaryDto["domains"];
  raw: unknown;
  now?: Date;
}

interface FixtureDataSyncLogInput {
  matchId: string;
  domain: FixtureContextDomain;
  status: FixtureContextDomainStatus;
  error: string | null;
  now?: Date;
}

interface FixtureContextSnapshotRow {
  id: string;
  match_id: string;
  odds_summary_json: string;
  api_prediction_summary_json: string;
  head_to_head_summary_json: string;
  squad_summary_json: string;
  completeness: FixtureContextSummaryDto["completeness"];
  created_at: string;
}

interface FixtureDataSyncLogRow {
  domain: FixtureContextDomain;
  status: FixtureContextDomainStatus;
  error: string | null;
  synced_at: string;
}

const emptyDomainSummaries: FixtureContextSummaryDto["domains"] = [
  { domain: "odds", status: "not_requested", summary: "未请求", lastSyncedAt: null, error: null },
  { domain: "api_prediction", status: "not_requested", summary: "未请求", lastSyncedAt: null, error: null },
  { domain: "head_to_head", status: "not_requested", summary: "未请求", lastSyncedAt: null, error: null },
  { domain: "squad", status: "not_requested", summary: "未请求", lastSyncedAt: null, error: null }
];

function getDomainSummary(domains: FixtureContextSummaryDto["domains"], domain: FixtureContextDomain) {
  return domains.find((summary) => summary.domain === domain) ?? emptyDomainSummaries.find((summary) => summary.domain === domain)!;
}

export function saveFixtureContextSnapshot(db: Database, input: FixtureContextSnapshotInput): { id: string } {
  const id = randomUUID();
  const createdAt = (input.now ?? new Date()).toISOString();

  db.prepare(
    `
      INSERT INTO fixture_context_snapshots (
        id,
        match_id,
        odds_summary_json,
        api_prediction_summary_json,
        head_to_head_summary_json,
        squad_summary_json,
        completeness,
        raw_json,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  ).run(
    id,
    input.matchId,
    JSON.stringify(getDomainSummary(input.domains, "odds")),
    JSON.stringify(getDomainSummary(input.domains, "api_prediction")),
    JSON.stringify(getDomainSummary(input.domains, "head_to_head")),
    JSON.stringify(getDomainSummary(input.domains, "squad")),
    input.completeness,
    JSON.stringify(input.raw),
    createdAt
  );

  return { id };
}

export function getLatestFixtureContextSummary(db: Database, matchId: string): FixtureContextSummaryDto | null {
  const row = db
    .prepare(
      `
        SELECT
          id,
          match_id,
          odds_summary_json,
          api_prediction_summary_json,
          head_to_head_summary_json,
          squad_summary_json,
          completeness,
          created_at
        FROM fixture_context_snapshots
        WHERE match_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `
    )
    .get(matchId) as FixtureContextSnapshotRow | undefined;

  if (!row) {
    return null;
  }

  return {
    matchId: row.match_id,
    completeness: row.completeness,
    createdAt: row.created_at,
    domains: [
      JSON.parse(row.odds_summary_json),
      JSON.parse(row.api_prediction_summary_json),
      JSON.parse(row.head_to_head_summary_json),
      JSON.parse(row.squad_summary_json)
    ]
  };
}

export function writeFixtureDataSyncLog(db: Database, input: FixtureDataSyncLogInput): void {
  db.prepare(
    `
      INSERT INTO fixture_data_sync_logs (
        id,
        match_id,
        domain,
        status,
        error,
        synced_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `
  ).run(randomUUID(), input.matchId, input.domain, input.status, input.error, (input.now ?? new Date()).toISOString());
}

export function listFixtureDataSyncLogs(db: Database, matchId: string) {
  const rows = db
    .prepare(
      `
        SELECT domain, status, error, synced_at
        FROM fixture_data_sync_logs
        WHERE match_id = ?
        ORDER BY synced_at DESC
      `
    )
    .all(matchId) as FixtureDataSyncLogRow[];

  return rows.map((row) => ({
    domain: row.domain,
    status: row.status,
    error: row.error,
    syncedAt: row.synced_at
  }));
}
