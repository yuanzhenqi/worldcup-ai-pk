import type { LeaderboardDto } from "@worldcup-ai-pk/shared";

interface LeaderboardPageProps {
  leaderboard: LeaderboardDto;
}

function formatPercent(value: number | null): string {
  if (value === null) {
    return "-";
  }
  return `${Math.round(value * 100)}%`;
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return "-";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function LeaderboardPage({ leaderboard }: LeaderboardPageProps) {
  return (
    <section id="leaderboard" className="page-section">
      <h2>模型总榜</h2>
      <div className="leaderboard-grid">
        <section className="leaderboard-panel" data-testid="settled-leaderboard">
          <div className="section-heading-row">
            <h3>真实计分榜</h3>
            <span>{leaderboard.settledRows.length} 个模型</span>
          </div>
          {leaderboard.settledRows.length === 0 ? (
            <p className="empty-state">暂无已结算预测</p>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>排名</th>
                    <th>模型</th>
                    <th>总分</th>
                    <th>已结算</th>
                    <th>胜平负命中</th>
                    <th>胜平负命中率</th>
                    <th>比分全中</th>
                    <th>近 5 场</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.settledRows.map((row, index) => (
                    <tr key={row.modelId}>
                      <td>{index + 1}</td>
                      <td>{row.modelDisplayName}</td>
                      <td>{row.totalScore}</td>
                      <td>{row.finishedMatchesCounted}</td>
                      <td>{row.resultHits}</td>
                      <td>{formatPercent(row.resultAccuracy)}</td>
                      <td>{row.exactScoreHits}</td>
                      <td>{row.recentScores.length > 0 ? row.recentScores.join(" / ") : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="leaderboard-panel" data-testid="active-leaderboard">
          <div className="section-heading-row">
            <h3>预测活跃榜</h3>
            <span>{leaderboard.activeRows.length} 个模型</span>
          </div>
          {leaderboard.activeRows.length === 0 ? (
            <p className="empty-state">暂无预测活动</p>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>排名</th>
                    <th>模型</th>
                    <th>预测数</th>
                    <th>覆盖比赛</th>
                    <th>可解析</th>
                    <th>胜/平/负观点</th>
                    <th>平均信心</th>
                    <th>最近预测</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.activeRows.map((row, index) => (
                    <tr key={row.modelId}>
                      <td>{index + 1}</td>
                      <td>{row.modelDisplayName}</td>
                      <td>{row.predictionsCount}</td>
                      <td>{row.matchesCovered}</td>
                      <td>{row.parsedPredictionsCount}</td>
                      <td>{`${row.homeWinVotes} / ${row.drawVotes} / ${row.awayWinVotes}`}</td>
                      <td>{formatPercent(row.averageConfidence)}</td>
                      <td>{formatDateTime(row.latestPredictionAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
