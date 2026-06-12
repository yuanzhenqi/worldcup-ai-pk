export interface ScoreInput {
  homeScore: number;
  awayScore: number;
}

export interface ScoreBreakdown {
  resultPoints: number;
  exactScorePoints: number;
  homeGoalsPoints: number;
  awayGoalsPoints: number;
  totalPoints: number;
}

function outcome(score: ScoreInput): "home" | "draw" | "away" {
  if (score.homeScore > score.awayScore) return "home";
  if (score.homeScore < score.awayScore) return "away";
  return "draw";
}

export function scorePrediction(finalScore: ScoreInput, predictedScore: ScoreInput): ScoreBreakdown {
  const resultPoints = outcome(finalScore) === outcome(predictedScore) ? 3 : 0;
  const exactScorePoints =
    finalScore.homeScore === predictedScore.homeScore && finalScore.awayScore === predictedScore.awayScore ? 5 : 0;
  const homeGoalsPoints = finalScore.homeScore === predictedScore.homeScore ? 1 : 0;
  const awayGoalsPoints = finalScore.awayScore === predictedScore.awayScore ? 1 : 0;

  return {
    resultPoints,
    exactScorePoints,
    homeGoalsPoints,
    awayGoalsPoints,
    totalPoints: resultPoints + exactScorePoints + homeGoalsPoints + awayGoalsPoints
  };
}
