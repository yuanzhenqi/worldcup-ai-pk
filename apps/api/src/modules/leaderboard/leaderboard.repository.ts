import type { Database } from "better-sqlite3";
import type { LeaderboardActiveRowDto, LeaderboardDto, LeaderboardRowDto } from "@worldcup-ai-pk/shared";

interface SettledRowRecord {
  model_id: string;
  model_display_name: string;
  total_score: number | null;
  finished_matches_counted: number;
  result_hits: number | null;
  exact_score_hits: number | null;
}

interface RecentScoreRecord {
  model_id: string;
  total_points: number;
}

interface ActiveRowRecord {
  model_id: string;
  model_display_name: string;
  predictions_count: number;
  parsed_predictions_count: number | null;
  matches_covered: number;
  home_win_votes: number | null;
  draw_votes: number | null;
  away_win_votes: number | null;
  average_confidence: number | null;
  latest_prediction_at: string | null;
}

function toNumber(value: unknown): number {
  return Number(value ?? 0);
}

export function listPublicLeaderboard(db: Database): LeaderboardDto {
  const settledRecords = db
    .prepare(
      `
        SELECT
          ai_models.id AS model_id,
          ai_models.display_name AS model_display_name,
          SUM(prediction_scores.total_points) AS total_score,
          COUNT(prediction_scores.id) AS finished_matches_counted,
          SUM(CASE WHEN prediction_scores.result_points > 0 THEN 1 ELSE 0 END) AS result_hits,
          SUM(CASE WHEN prediction_scores.exact_score_points > 0 THEN 1 ELSE 0 END) AS exact_score_hits
        FROM prediction_scores
        INNER JOIN ai_predictions ON ai_predictions.id = prediction_scores.ai_prediction_id
        INNER JOIN ai_models ON ai_models.id = prediction_scores.model_id
        GROUP BY ai_models.id, ai_models.display_name
        ORDER BY total_score DESC, result_hits DESC, exact_score_hits DESC, model_display_name ASC
      `
    )
    .all() as SettledRowRecord[];

  const recentScoreRecords = db
    .prepare(
      `
        SELECT model_id, total_points
        FROM (
          SELECT
            prediction_scores.model_id AS model_id,
            prediction_scores.total_points AS total_points,
            ROW_NUMBER() OVER (
              PARTITION BY prediction_scores.model_id
              ORDER BY prediction_scores.scored_at DESC, prediction_scores.id DESC
            ) AS row_number
          FROM prediction_scores
        )
        WHERE row_number <= 5
        ORDER BY model_id ASC, row_number ASC
      `
    )
    .all() as RecentScoreRecord[];

  const recentScoresByModel = new Map<string, number[]>();
  for (const record of recentScoreRecords) {
    const scores = recentScoresByModel.get(record.model_id) ?? [];
    scores.push(toNumber(record.total_points));
    recentScoresByModel.set(record.model_id, scores);
  }

  const settledRows: LeaderboardRowDto[] = settledRecords.map((record) => {
    const finishedMatchesCounted = toNumber(record.finished_matches_counted);
    const resultHits = toNumber(record.result_hits);

    return {
      modelId: record.model_id,
      modelDisplayName: record.model_display_name,
      totalScore: toNumber(record.total_score),
      finishedMatchesCounted,
      resultHits,
      resultAccuracy: finishedMatchesCounted > 0 ? resultHits / finishedMatchesCounted : 0,
      exactScoreHits: toNumber(record.exact_score_hits),
      recentScores: recentScoresByModel.get(record.model_id) ?? []
    };
  });

  const activeRecords = db
    .prepare(
      `
        SELECT
          ai_models.id AS model_id,
          ai_models.display_name AS model_display_name,
          COUNT(ai_predictions.id) AS predictions_count,
          SUM(CASE WHEN ai_predictions.parse_status = 'parsed' THEN 1 ELSE 0 END) AS parsed_predictions_count,
          COUNT(DISTINCT ai_predictions.match_id) AS matches_covered,
          SUM(CASE WHEN ai_predictions.predicted_result = 'home' THEN 1 ELSE 0 END) AS home_win_votes,
          SUM(CASE WHEN ai_predictions.predicted_result = 'draw' THEN 1 ELSE 0 END) AS draw_votes,
          SUM(CASE WHEN ai_predictions.predicted_result = 'away' THEN 1 ELSE 0 END) AS away_win_votes,
          AVG(ai_predictions.confidence) AS average_confidence,
          MAX(ai_predictions.created_at) AS latest_prediction_at
        FROM ai_predictions
        INNER JOIN ai_models ON ai_models.id = ai_predictions.model_id
        GROUP BY ai_models.id, ai_models.display_name
        ORDER BY predictions_count DESC, matches_covered DESC, parsed_predictions_count DESC, model_display_name ASC
      `
    )
    .all() as ActiveRowRecord[];

  const activeRows: LeaderboardActiveRowDto[] = activeRecords.map((record) => ({
    modelId: record.model_id,
    modelDisplayName: record.model_display_name,
    predictionsCount: toNumber(record.predictions_count),
    parsedPredictionsCount: toNumber(record.parsed_predictions_count),
    matchesCovered: toNumber(record.matches_covered),
    homeWinVotes: toNumber(record.home_win_votes),
    drawVotes: toNumber(record.draw_votes),
    awayWinVotes: toNumber(record.away_win_votes),
    averageConfidence: record.average_confidence === null ? null : Number(record.average_confidence),
    latestPredictionAt: record.latest_prediction_at
  }));

  return { settledRows, activeRows };
}
