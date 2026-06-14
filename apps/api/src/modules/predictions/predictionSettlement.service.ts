import type { Database } from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { scorePrediction } from "./scoring";

interface EligiblePredictionRow {
  prediction_id: string;
  match_id: string;
  model_id: string;
  final_home_score: number;
  final_away_score: number;
  predicted_home_score: number;
  predicted_away_score: number;
}

export function settleFinishedMatchPredictions(db: Database, now = new Date()): number {
  const rows = db
    .prepare(
      `
        SELECT
          ai_predictions.id AS prediction_id,
          ai_predictions.match_id AS match_id,
          ai_predictions.model_id AS model_id,
          matches.home_score AS final_home_score,
          matches.away_score AS final_away_score,
          ai_predictions.predicted_home_score AS predicted_home_score,
          ai_predictions.predicted_away_score AS predicted_away_score
        FROM ai_predictions
        INNER JOIN matches ON matches.id = ai_predictions.match_id
        LEFT JOIN prediction_scores ON prediction_scores.ai_prediction_id = ai_predictions.id
        WHERE matches.status = 'finished'
          AND matches.home_score IS NOT NULL
          AND matches.away_score IS NOT NULL
          AND ai_predictions.parse_status = 'parsed'
          AND ai_predictions.eligible_for_scoring = 1
          AND prediction_scores.id IS NULL
      `
    )
    .all() as EligiblePredictionRow[];

  const insert = db.prepare(
    `
      INSERT INTO prediction_scores (
        id,
        ai_prediction_id,
        match_id,
        model_id,
        result_points,
        exact_score_points,
        home_goals_points,
        away_goals_points,
        total_points,
        scored_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  );

  const scoredAt = now.toISOString();
  const transaction = db.transaction((items: EligiblePredictionRow[]) => {
    for (const row of items) {
      const score = scorePrediction(
        { homeScore: row.final_home_score, awayScore: row.final_away_score },
        { homeScore: row.predicted_home_score, awayScore: row.predicted_away_score }
      );

      insert.run(
        randomUUID(),
        row.prediction_id,
        row.match_id,
        row.model_id,
        score.resultPoints,
        score.exactScorePoints,
        score.homeGoalsPoints,
        score.awayGoalsPoints,
        score.totalPoints,
        scoredAt
      );
    }
  });

  transaction(rows);
  return rows.length;
}
