import type { LeaderboardRowDto } from "@worldcup-ai-pk/shared";

interface LeaderboardPageProps {
  rows: LeaderboardRowDto[];
}

export function LeaderboardPage({ rows }: LeaderboardPageProps) {
  return (
    <section id="leaderboard" className="page-section">
      <h2>模型总榜</h2>
      <table>
        <thead>
          <tr>
            <th>模型</th>
            <th>总分</th>
            <th>计分比赛</th>
            <th>赛果命中</th>
            <th>比分命中</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.modelId}>
              <td>{row.modelDisplayName}</td>
              <td>{row.totalScore}</td>
              <td>{row.finishedMatchesCounted}</td>
              <td>{row.resultHits}</td>
              <td>{row.exactScoreHits}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
