import { useMemo, useState } from "react";
import type { LeaderboardDto, LeaderboardRowDto } from "@worldcup-ai-pk/shared";

interface LeaderboardPageProps {
  leaderboard: LeaderboardDto;
}

type SettledView = "overall" | "result" | "score";

const settledViews: Array<{ id: SettledView; label: string }> = [
  { id: "overall", label: "综合榜" },
  { id: "result", label: "胜平负榜" },
  { id: "score", label: "比分榜" }
];

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

function formatRecentScores(row: LeaderboardRowDto): string {
  return row.recentScores.length > 0 ? row.recentScores.join(" / ") : "-";
}

function sortSettledRows(rows: LeaderboardRowDto[], view: SettledView): LeaderboardRowDto[] {
  const sortedRows = [...rows];

  sortedRows.sort((left, right) => {
    if (view === "result") {
      return (
        right.resultHits - left.resultHits ||
        right.resultAccuracy - left.resultAccuracy ||
        right.totalScore - left.totalScore ||
        left.modelDisplayName.localeCompare(right.modelDisplayName, "zh-CN")
      );
    }

    if (view === "score") {
      return (
        right.exactScoreHits - left.exactScoreHits ||
        right.totalScore - left.totalScore ||
        left.modelDisplayName.localeCompare(right.modelDisplayName, "zh-CN")
      );
    }

    return (
      right.totalScore - left.totalScore ||
      right.resultHits - left.resultHits ||
      right.exactScoreHits - left.exactScoreHits ||
      left.modelDisplayName.localeCompare(right.modelDisplayName, "zh-CN")
    );
  });

  return sortedRows;
}

function SummaryCard({ title, row, metric }: { title: string; row: LeaderboardRowDto | undefined; metric: string }) {
  return (
    <article className="leaderboard-summary-card">
      <span>{title}</span>
      {row ? (
        <>
          <strong>{row.modelDisplayName}</strong>
          <small>{metric}</small>
        </>
      ) : (
        <>
          <strong>-</strong>
          <small>等待结算</small>
        </>
      )}
    </article>
  );
}

function SettledRankCard({ row, rank, view }: { row: LeaderboardRowDto; rank: number; view: SettledView }) {
  const primaryMetric =
    view === "result"
      ? { label: "胜平负命中", value: `${row.resultHits} 场` }
      : view === "score"
        ? { label: rank === 1 ? "比分全中" : "全中场次", value: `${row.exactScoreHits} 场` }
        : { label: "总分", value: `${row.totalScore}` };

  const secondaryMetrics =
    view === "result"
      ? [
          { label: rank === 1 ? "胜平负命中率" : "命中率", value: formatPercent(row.resultAccuracy) },
          { label: "已结算", value: `${row.finishedMatchesCounted} 场` },
          { label: "总分", value: `${row.totalScore}` }
        ]
      : view === "score"
        ? [
            { label: "已结算", value: `${row.finishedMatchesCounted} 场` },
            { label: "总分", value: `${row.totalScore}` },
            { label: "最近得分", value: formatRecentScores(row) }
          ]
        : [
            { label: "已结算", value: `${row.finishedMatchesCounted} 场` },
            { label: "胜平负命中", value: `${row.resultHits} 场` },
            { label: "比分全中", value: `${row.exactScoreHits} 场` },
            { label: rank === 1 ? "最近得分" : "近场得分", value: formatRecentScores(row) }
          ];

  return (
    <article className="settled-rank-card" data-testid="settled-rank-card">
      <div className="rank-badge">#{rank}</div>
      <div className="rank-model">
        <strong>{row.modelDisplayName}</strong>
        <span>{primaryMetric.label}</span>
      </div>
      <div className="rank-primary-metric">
        <strong>{primaryMetric.value}</strong>
      </div>
      <dl className="rank-metrics">
        {secondaryMetrics.map((metric) => (
          <div key={metric.label}>
            <dt>{metric.label}</dt>
            <dd>{metric.value}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

export function LeaderboardPage({ leaderboard }: LeaderboardPageProps) {
  const [settledView, setSettledView] = useState<SettledView>("overall");
  const overallRows = useMemo(() => sortSettledRows(leaderboard.settledRows, "overall"), [leaderboard.settledRows]);
  const resultRows = useMemo(() => sortSettledRows(leaderboard.settledRows, "result"), [leaderboard.settledRows]);
  const scoreRows = useMemo(() => sortSettledRows(leaderboard.settledRows, "score"), [leaderboard.settledRows]);
  const visibleRows = settledView === "result" ? resultRows : settledView === "score" ? scoreRows : overallRows;

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
            <>
              <div className="leaderboard-summary-grid">
                <SummaryCard title="综合榜第一名" row={overallRows[0]} metric={`总分 ${overallRows[0]?.totalScore ?? 0}`} />
                <SummaryCard title="胜平负榜第一名" row={resultRows[0]} metric={`命中 ${resultRows[0]?.resultHits ?? 0} 场`} />
                <SummaryCard title="比分榜第一名" row={scoreRows[0]} metric={`全中 ${scoreRows[0]?.exactScoreHits ?? 0} 场`} />
              </div>
              <div className="leaderboard-tabs" aria-label="真实计分榜类型">
                {settledViews.map((view) => (
                  <button
                    aria-pressed={settledView === view.id}
                    className={settledView === view.id ? "active" : ""}
                    key={view.id}
                    type="button"
                    onClick={() => setSettledView(view.id)}
                  >
                    {view.label}
                  </button>
                ))}
              </div>
              <div className="settled-ranking-list" data-testid="settled-ranking-list">
                {visibleRows.map((row, index) => (
                  <SettledRankCard key={row.modelId} row={row} rank={index + 1} view={settledView} />
                ))}
              </div>
            </>
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
            <div className="table-scroll active-leaderboard-table">
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
