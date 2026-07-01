import { useState } from "react";
import type { BettingArenaDto } from "@worldcup-ai-pk/shared";
import {
  formatAuditValue,
  getBattleContextSummary,
  getMatchLabel,
  poolDisplayName
} from "./bettingArenaViewModels";

interface BettingIntelPageProps {
  arena: BettingArenaDto | null;
  loading: boolean;
  error: string | null;
  onRefreshRoundContext?: (roundId: string) => Promise<void>;
  onReloadRound?: (roundId: string) => Promise<BettingArenaDto | null>;
}

function renderList(items: string[], emptyText: string) {
  if (items.length === 0) return <p className="muted">{emptyText}</p>;
  return (
    <ul className="intel-mini-list">
      {items.map((item, index) => (
        <li key={`${item}-${index}`}>{item}</li>
      ))}
    </ul>
  );
}

function renderSummary(summary: string) {
  if (!summary) return <p className="muted">暂无外部情报摘要</p>;
  if (summary.length <= 160) return <p>{summary}</p>;
  return (
    <>
      <p>{summary.slice(0, 160)}…</p>
      <details className="intel-raw-details">
        <summary>展开原始数据（{summary.length} 字）</summary>
        <p className="intel-raw-text">{summary}</p>
      </details>
    </>
  );
}

export function BettingIntelPage({ arena, loading, error, onRefreshRoundContext, onReloadRound }: BettingIntelPageProps) {
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  if (loading) return <p className="status-line">正在加载投注输入...</p>;
  if (error) return <p className="status-line error">{error}</p>;
  if (!arena?.currentRound) return <p className="muted">暂无投注轮次，先在 AI 实盘投注场生成今日出单。</p>;

  const summary = getBattleContextSummary(arena.currentRound);
  const roundId = arena.currentRound.id;

  async function handleRefresh() {
    if (!onRefreshRoundContext) return;
    setRefreshing(true);
    setRefreshError(null);
    setRefreshMessage("正在重新采集当前轮比赛情报...");
    try {
      await onRefreshRoundContext(roundId);
      if (onReloadRound) {
        await onReloadRound(roundId);
      }
      setRefreshMessage("已重新采集当前轮比赛情报，数据已刷新。");
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "重新采集情报失败";
      setRefreshError(message);
      setRefreshMessage(null);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <section className="betting-intel-page" id="betting-intel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Betting Input Audit</p>
          <h2>投注输入总览</h2>
        </div>
        <div className="section-actions">
          <span>{arena.currentRound.roundDate} 第 {arena.currentRound.roundSequence} 轮</span>
          {onRefreshRoundContext ? (
            <button
              className="app-button app-button-secondary"
              type="button"
              disabled={refreshing}
              onClick={handleRefresh}
            >
              {refreshing ? "采集中..." : "重新采集情报"}
            </button>
          ) : null}
        </div>
      </div>

      {refreshMessage ? <p className="status-line">{refreshMessage}</p> : null}
      {refreshError ? <p className="status-line error">{refreshError}</p> : null}

      <div className="intel-summary-grid">
        <div><span>比赛</span><strong>{summary.matches.length}</strong></div>
        <div><span>玩法池</span><strong>{summary.poolsCount}</strong></div>
        <div><span>投注选项</span><strong>{summary.optionsCount}</strong></div>
        <div><span>数据缺口</span><strong>{summary.dataGapsCount}</strong></div>
      </div>

      <div className="intel-match-list">
        {summary.matches.map((match) => (
          <details className="intel-match-card" key={match.matchId} open>
            <summary>
              <strong>{getMatchLabel(match)}</strong>
              <span>玩法 {match.poolsCount} · 选项 {match.optionsCount} · 缺口 {match.dataGapsCount}</span>
            </summary>

          <div className="intel-match-body">
            <div className="intel-section">
              <h3>数据来源拆解</h3>
              <div className="intel-source-grid">
                {match.sourceBreakdown.map((source) => (
                  <article key={source.source}>
                    <strong>{source.source}：</strong>
                    <span>{source.detail}</span>
                  </article>
                ))}
              </div>
            </div>

            <div className="intel-section">
              <h3>体彩玩法与赔率</h3>
              {match.sportteryPools.length === 0 ? <p className="muted">未读取到体彩可投注玩法</p> : null}
              <div className="intel-pool-list">
                {match.sportteryPools.map((pool) => (
                  <article key={pool.poolCode}>
                    <strong>{poolDisplayName(pool.poolCode)}</strong>
                    <div>
                      {pool.options.map((option) => (
                        <span key={`${pool.poolCode}-${option.code}`}>
                          {option.label} · 赔率 {option.value}{option.goalLine ? ` · 让球 ${option.goalLine}` : ""}
                        </span>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <div className="intel-section two-column">
              <article>
                <h3>主队资料</h3>
                <p>{match.homeTeamProfile.coach || "暂无教练资料"}</p>
                <p>{match.homeTeamProfile.playingStyle || "暂无踢法资料"}</p>
                {renderList(match.homeTeamProfile.keyPlayers, "暂无核心球员资料")}
                {renderList(match.homeTeamProfile.injuries, "暂无伤停资料")}
                <p>{match.homeTeamProfile.marketValue || "暂无球队身价数据源"}</p>
              </article>
              <article>
                <h3>客队资料</h3>
                <p>{match.awayTeamProfile.coach || "暂无教练资料"}</p>
                <p>{match.awayTeamProfile.playingStyle || "暂无踢法资料"}</p>
                {renderList(match.awayTeamProfile.keyPlayers, "暂无核心球员资料")}
                {renderList(match.awayTeamProfile.injuries, "暂无伤停资料")}
                <p>{match.awayTeamProfile.marketValue || "暂无球队身价数据源"}</p>
              </article>
            </div>

            <div className="intel-section">
              <h3>历史交锋</h3>
              <p>{match.historicalMatchup || "暂无历史交锋摘要"}</p>
            </div>

            <div className="intel-section-pair">
              <div className="intel-section">
                <h3>{match.stage.startsWith("Group Stage") ? "小组出线形势" : "小组赛积分（淘汰赛参考）"}</h3>
                {match.groupStandings.length === 0 ? (
                  <p className="muted">{match.stage.startsWith("Group Stage") ? "暂无小组积分数据" : "暂无小组赛积分数据"}</p>
                ) : (
                  <div className="table-scroll">
                    <table className="intel-standings-table">
                      <thead>
                        <tr>
                          <th>排名</th>
                          <th>球队</th>
                          <th>赛</th>
                          <th>胜/平/负</th>
                          <th>积分</th>
                          <th>净胜球</th>
                          {match.stage.startsWith("Group Stage") ? <th>状态</th> : null}
                        </tr>
                      </thead>
                      <tbody>
                        {match.groupStandings.map((row) => {
                          const isPlaying = row.teamName === match.homeTeamName || row.teamName === match.awayTeamName;
                          return (
                            <tr key={`${row.group}-${row.teamId}`} className={isPlaying ? "intel-standings-playing" : ""}>
                              <td>{row.rank}</td>
                              <td>{row.teamName}{isPlaying ? " ·" : ""}</td>
                              <td>{row.played}</td>
                              <td>{row.win}/{row.draw}/{row.lose}</td>
                              <td><strong>{row.points}</strong></td>
                              <td>{row.goalsDiff > 0 ? `+${row.goalsDiff}` : row.goalsDiff}</td>
                              {match.stage.startsWith("Group Stage") ? <td>{row.description ?? "—"}</td> : null}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {match.stage.startsWith("Group Stage") ? <p className="secret-note">{match.groupStandings[0]?.group}</p> : null}
                  </div>
                )}
              </div>

              <div className="intel-section">
                <h3>懂球帝实力对比</h3>
                {(() => {
                  const c = match.dongqiudiComparison;
                  if (!c) return <p className="muted">暂无懂球帝对比数据</p>;
                  const rows: Array<{ label: string; pair: { home: string; away: string } | null }> = [
                    { label: "综合实力", pair: c.comprehensive },
                    { label: "近6场交锋", pair: c.h2h },
                    { label: "近10场战绩", pair: c.recentForm },
                    { label: "场均进球", pair: c.avgGoals },
                    { label: "场均失球", pair: c.avgConceded },
                    { label: "身价", pair: c.marketValue },
                    { label: "场均红黄牌", pair: c.cards }
                  ];
                  const present = rows.filter((r) => r.pair);
                  if (present.length === 0) return <p className="muted">暂无懂球帝对比数据</p>;
                  return (
                    <table className="intel-compare-table">
                      <thead>
                        <tr><th>指标</th><th>{match.homeTeamName || "主"}</th><th>{match.awayTeamName || "客"}</th></tr>
                      </thead>
                      <tbody>
                        {present.map((r) => (
                          <tr key={r.label}>
                            <td>{r.label}</td>
                            <td>{r.pair?.home || "—"}</td>
                            <td>{r.pair?.away || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  );
                })()}
              </div>
            </div>

            <div className="intel-section">
              <h3>外部联网情报</h3>
              {renderSummary(match.externalIntel.summary)}
              <div className="intel-audit-row">
                <strong>返回来源 {match.externalIntel.sourceLinks.length}</strong>
                <span>采集时间：{match.externalIntel.collectedAt || "暂无"}</span>
              </div>
              <div className="intel-news-grid">
                <article><h4>伤停</h4>{renderList(match.externalIntel.injuryNews, "暂无伤停新闻")}</article>
                <article><h4>阵容</h4>{renderList(match.externalIntel.lineupNews, "暂无阵容新闻")}</article>
                <article><h4>动机</h4>{renderList(match.externalIntel.motivation, "暂无动机信息")}</article>
                <article><h4>近期</h4>{renderList(match.externalIntel.recentFormNews, "暂无近期状态新闻")}</article>
                <article><h4>风险</h4>{renderList(match.externalIntel.riskSignals, "暂无风险信号")}</article>
              </div>
              <div className="intel-source-links">
                {match.externalIntel.sourceLinks.length === 0 ? <p className="muted">暂无来源链接</p> : null}
                {match.externalIntel.sourceLinks.map((source) => (
                  <a href={source.url} key={source.url} rel="noreferrer" target="_blank">{source.title}</a>
                ))}
              </div>
            </div>

            <div className="intel-section">
              <h3>数据缺口</h3>
              {renderList(match.dataGaps, "暂无明显缺口")}
            </div>
          </div>
          </details>
        ))}
      </div>

      <details className="arena-audit-block">
        <summary>完整输入快照</summary>
        <pre className="arena-audit-code">{formatAuditValue(arena.currentRound.battleContext)}</pre>
      </details>
    </section>
  );
}
