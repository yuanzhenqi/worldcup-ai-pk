import type { AiPredictionDto, ApiFootballPredictionDto, MatchDto, OddsSummaryDto } from "@worldcup-ai-pk/shared";

interface MatchDetailPageProps {
  match: MatchDto;
  odds: OddsSummaryDto | null;
  apiPrediction: ApiFootballPredictionDto | null;
  aiPredictions: AiPredictionDto[];
}

export function MatchDetailPage({ match, odds, apiPrediction, aiPredictions }: MatchDetailPageProps) {
  return (
    <section className="page-section">
      <h2>
        {match.homeTeam.name} vs {match.awayTeam.name}
      </h2>
      <div className="detail-grid">
        <article>
          <h3>赔率摘要</h3>
          <p>主胜：{odds?.homeWin ?? "-"}</p>
          <p>平局：{odds?.draw ?? "-"}</p>
          <p>客胜：{odds?.awayWin ?? "-"}</p>
          <p>盘口：{odds?.handicap ?? "-"}</p>
          <p>大小球：{odds?.overUnder ?? "-"}</p>
        </article>
        <article>
          <h3>API-Football 参考预测</h3>
          <p>{apiPrediction?.advice ?? "暂无参考预测"}</p>
        </article>
      </div>
      <div className="prediction-list">
        {aiPredictions.map((prediction) => (
          <article className="prediction-card" key={prediction.id}>
            <h3>{prediction.modelDisplayName}</h3>
            <p>
              {prediction.predictedHomeScore}-{prediction.predictedAwayScore}，置信度 {prediction.confidence}
            </p>
            <p>{prediction.shortReason}</p>
            <p>{prediction.oddsInterpretation}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
