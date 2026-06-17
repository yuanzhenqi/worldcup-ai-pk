import teamProfilesData from "./team-profiles";
import injuriesData from "./injuries";
import matchupsData from "./historical-matchups";

export interface Wc26TeamProfile {
  team_id: string;
  coach: string;
  playing_style: string;
  key_players: Array<{ name: string; position: string; club: string }>;
  world_cup_history: { appearances: number; best_result: string; titles: number };
  qualifying_summary: string;
}

export interface Wc26Injury {
  player: string;
  team_id: string;
  position: string;
  injury: string;
  status: string;
  expected_return: string;
  last_updated: string;
  source: string;
}

export interface Wc26Matchup {
  team_a: string;
  team_b: string;
  total_matches: number;
  team_a_wins: number;
  draws: number;
  team_b_wins: number;
  total_goals_team_a: number;
  total_goals_team_b: number;
  summary: string;
  meetings: Array<{ year: number; host_country: string; round: string; score: string; result: string; venue_city: string }>;
}

const profiles = teamProfilesData as Wc26TeamProfile[];
const injuries = injuriesData as Wc26Injury[];
const matchups = matchupsData as Wc26Matchup[];

/**
 * api-football 英文队名（lowercase）→ wc26 team_id（3 字母 ISO）。
 * wc26 数据是早期版本，部分球队（波黑/捷克/刚果/伊拉克/瑞典/土耳其）暂未确认，无法映射。
 */
const NAME_TO_WC26_ID: Record<string, string> = {
  algeria: "alg", argentina: "arg", australia: "aus", austria: "aut",
  belgium: "bel", brazil: "bra", canada: "can", colombia: "col",
  croatia: "cro", ecuador: "ecu", egypt: "egy", england: "eng",
  france: "fra", germany: "ger", ghana: "gha", haiti: "hai",
  iran: "irn", japan: "jpn", jordan: "jor", mexico: "mex",
  morocco: "mar", netherlands: "ned", "new zealand": "nzl",
  norway: "nor", panama: "pan", paraguay: "par", portugal: "por",
  qatar: "qat", "saudi arabia": "ksa", scotland: "sco", senegal: "sen",
  "south africa": "rsa", "south korea": "kor", spain: "esp",
  switzerland: "sui", tunisia: "tun", uruguay: "uru", uzbekistan: "uzb",
  // 别名（api-football 与 wc26 名称差异）
  "cape verde islands": "cpv", "cape verde": "cpv",
  curaçao: "cuw", curacao: "cuw",
  "ivory coast": "civ",
  usa: "usa", "united states": "usa",
};

/** api-football 英文队名 → wc26 team_id。无法映射返回 null。 */
export function resolveWc26TeamId(apiFootballName: string): string | null {
  const key = apiFootballName.toLowerCase().trim();
  return NAME_TO_WC26_ID[key] ?? null;
}

export function getWc26TeamProfile(teamId: string): Wc26TeamProfile | null {
  return profiles.find((p) => p.team_id === teamId) ?? null;
}

export function getWc26Injuries(teamId: string): Wc26Injury[] {
  return injuries.filter((i) => i.team_id === teamId);
}

export function getWc26Matchup(teamIdA: string, teamIdB: string): Wc26Matchup | null {
  return (
    matchups.find(
      (m) =>
        (m.team_a === teamIdA && m.team_b === teamIdB) ||
        (m.team_a === teamIdB && m.team_b === teamIdA)
    ) ?? null
  );
}
