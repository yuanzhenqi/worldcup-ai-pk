import type { Database } from "better-sqlite3";

/**
 * 一支队伍在世界杯小组积分榜中的位置。
 * teamId 为 API-Football 的 team id（与 matches.home_team_id 一致），用于反查该场所在小组。
 */
export interface GroupStandingRow {
  group: string;
  rank: number;
  teamId: string;
  teamName: string;
  points: number;
  played: number;
  win: number;
  draw: number;
  lose: number;
  goalsFor: number;
  goalsAgainst: number;
  goalsDiff: number;
  /** 出线状态，例如 "Round of 32" / "Champions League" 等；未出线为 null。 */
  description: string | null;
}

export interface WorldCupStandings {
  /** teamId → 该队所在小组完整积分榜。 */
  byTeamId: Map<string, GroupStandingRow[]>;
  collectedAt: string | null;
}

const emptyStandings: WorldCupStandings = { byTeamId: new Map(), collectedAt: null };

function toInt(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

/**
 * 解析 API-Football /standings?league=1&season=2026 响应为按 teamId 反查的小组积分榜。
 * 响应结构：response[0].league.standings = 分组二维数组，每组含各队 rank/team/points/all/description。
 */
export function parseWorldCupStandings(response: unknown): WorldCupStandings {
  const outer = response as { response?: unknown[] } | null;
  const first = Array.isArray(outer?.response) ? outer!.response[0] : null;
  const league = (first as { league?: { standings?: unknown[] } } | null)?.league;
  const groups = Array.isArray(league?.standings) ? league!.standings : [];

  const byTeamId = new Map<string, GroupStandingRow[]>();

  for (const group of groups) {
    if (!Array.isArray(group)) continue;
    const rows: GroupStandingRow[] = [];
    for (const item of group) {
      if (!item || typeof item !== "object") continue;
      const record = item as Record<string, unknown>;
      const team = record.team as { id?: unknown; name?: unknown } | undefined;
      const teamId = team?.id;
      const all = record.all as { played?: unknown; win?: unknown; draw?: unknown; lose?: unknown; goals?: { for?: unknown; against?: unknown } } | undefined;
      if (teamId === undefined || teamId === null) continue;
      rows.push({
        group: typeof record.group === "string" ? record.group : "",
        rank: toInt(record.rank),
        teamId: String(teamId),
        teamName: typeof team?.name === "string" ? team.name : "",
        points: toInt(record.points),
        played: toInt(all?.played),
        win: toInt(all?.win),
        draw: toInt(all?.draw),
        lose: toInt(all?.lose),
        goalsFor: toInt(all?.goals?.for),
        goalsAgainst: toInt(all?.goals?.against),
        goalsDiff: toInt(record.goalsDiff),
        description: typeof record.description === "string" ? record.description : null
      });
    }
    if (rows.length === 0) continue;
    for (const row of rows) {
      byTeamId.set(row.teamId, rows);
    }
  }

  return { byTeamId, collectedAt: new Date().toISOString() };
}

const standingsKey = "worldcup.standings.json";
const standingsCollectedAtKey = "worldcup.standings.collectedAt";

/** 保存解析后的小组积分榜到 app_settings（全局共享，生成轮次时刷新）。 */
export function saveWorldCupStandings(db: Database, standings: WorldCupStandings, now = new Date()): void {
  const iso = now.toISOString();
  const rows: GroupStandingRow[] = [];
  const seen = new Set<string>();
  for (const groupRows of standings.byTeamId.values()) {
    for (const row of groupRows) {
      const key = `${row.group}-${row.teamId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(row);
    }
  }
  const insert = db.prepare(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  );
  insert.run(standingsKey, JSON.stringify(rows), iso);
  insert.run(standingsCollectedAtKey, iso, iso);
}

/** 读取已保存的小组积分榜（生成 battleContext 时按 teamId 反查小组）。 */
export function loadWorldCupStandings(db: Database): WorldCupStandings {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = ?").get(standingsKey) as { value: string } | undefined;
  const collectedAtRow = db.prepare("SELECT value FROM app_settings WHERE key = ?").get(standingsCollectedAtKey) as { value: string } | undefined;
  if (!row?.value) return emptyStandings;
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.value);
  } catch {
    return emptyStandings;
  }
  if (!Array.isArray(parsed)) return emptyStandings;

  const byTeamId = new Map<string, GroupStandingRow[]>();
  // 按 group 聚合，再为组内每队建立反查索引
  const byGroup = new Map<string, GroupStandingRow[]>();
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const r = item as GroupStandingRow;
    if (typeof r.teamId !== "string" || typeof r.group !== "string") continue;
    const list = byGroup.get(r.group) ?? [];
    list.push(r);
    byGroup.set(r.group, list);
  }
  for (const list of byGroup.values()) {
    list.sort((a, b) => a.rank - b.rank);
    for (const r of list) byTeamId.set(r.teamId, list);
  }
  return { byTeamId, collectedAt: collectedAtRow?.value ?? null };
}
