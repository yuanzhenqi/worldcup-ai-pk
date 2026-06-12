import type { Database } from "better-sqlite3";
import type { MatchDto, MatchStatus } from "@worldcup-ai-pk/shared";

interface MatchRow {
  id: string;
  api_football_fixture_id: number;
  stage: string;
  kickoff_at: string;
  status: MatchStatus;
  venue: string | null;
  home_team_id: string;
  home_team_name: string;
  home_team_display_name_zh: string | null;
  home_team_logo_url: string | null;
  away_team_id: string;
  away_team_name: string;
  away_team_display_name_zh: string | null;
  away_team_logo_url: string | null;
  home_score: number | null;
  away_score: number | null;
  has_ai_prediction: number;
}

function getStatusLabelZh(status: MatchStatus): string {
  switch (status) {
    case "scheduled":
      return "未开始";
    case "live":
      return "进行中";
    case "finished":
      return "已结束";
    case "postponed":
      return "已延期";
    case "cancelled":
      return "已取消";
  }
}

function toMatchDto(row: MatchRow): MatchDto {
  return {
    id: row.id,
    apiFootballFixtureId: row.api_football_fixture_id,
    stage: row.stage,
    kickoffAt: row.kickoff_at,
    status: row.status,
    statusLabelZh: getStatusLabelZh(row.status),
    venue: row.venue,
    homeTeam: {
      id: row.home_team_id,
      name: row.home_team_name,
      displayNameZh: row.home_team_display_name_zh ?? row.home_team_name,
      logoUrl: row.home_team_logo_url
    },
    awayTeam: {
      id: row.away_team_id,
      name: row.away_team_name,
      displayNameZh: row.away_team_display_name_zh ?? row.away_team_name,
      logoUrl: row.away_team_logo_url
    },
    homeScore: row.home_score,
    awayScore: row.away_score,
    hasAiPrediction: row.has_ai_prediction > 0,
    canRequestPrediction: row.status === "scheduled"
  };
}

export function listMatches(db: Database): MatchDto[] {
  const rows = db
    .prepare(
      `
        SELECT
          matches.id,
          matches.api_football_fixture_id,
          matches.stage,
          matches.kickoff_at,
          matches.status,
          matches.venue,
          matches.home_team_id,
          matches.home_team_name,
          home_display.display_name_zh AS home_team_display_name_zh,
          matches.home_team_logo_url,
          matches.away_team_id,
          matches.away_team_name,
          away_display.display_name_zh AS away_team_display_name_zh,
          matches.away_team_logo_url,
          matches.home_score,
          matches.away_score,
          COUNT(ai_predictions.id) AS has_ai_prediction
        FROM matches
        LEFT JOIN ai_predictions ON ai_predictions.match_id = matches.id AND ai_predictions.parse_status = 'parsed'
        LEFT JOIN team_display_names AS home_display ON home_display.api_football_team_id = matches.home_team_id
        LEFT JOIN team_display_names AS away_display ON away_display.api_football_team_id = matches.away_team_id
        GROUP BY matches.id
        ORDER BY matches.kickoff_at ASC
      `
    )
    .all() as MatchRow[];

  return rows.map(toMatchDto);
}
