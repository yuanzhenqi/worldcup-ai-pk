import type { BettingArenaDto, BettingArenaRoundDto, BettingArenaRoundStatus, BettingArenaSlipDto } from "@worldcup-ai-pk/shared";
import { useState } from "react";

interface BettingArenaPageProps {
  arena: BettingArenaDto | null;
  loading: boolean;
  error: string | null;
  onTriggerRound: () => Promise<BettingArenaDto>;
  onTriggerModel: (roundId: string, modelId: string) => Promise<BettingArenaDto>;
  onSettleRound: (roundId: string) => Promise<BettingArenaDto>;
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function money(value: number): string {
  return value.toFixed(0);
}

function actionLabel(action: BettingArenaSlipDto["action"]): string {
  return action === "hold" ? "空仓" : "下注";
}

function statusLabel(status: BettingArenaSlipDto["status"]): string {
  const labels: Record<BettingArenaSlipDto["status"], string> = {
    pending: "待处理",
    accepted: "已接收",
    invalid: "无效",
    generation_failed: "生成失败",
    settled: "已结算",
    void: "已退回"
  };
  return labels[status];
}

function roundStatusLabel(status: BettingArenaRoundStatus | null | undefined): string {
  const labels: Record<BettingArenaRoundStatus, string> = {
    draft: "待生成",
    generating: "生成中",
    locked: "已锁定",
    settling: "结算中",
    settled: "已结算",
    failed: "生成失败"
  };
  return status ? labels[status] : "待启动";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatAuditValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  return JSON.stringify(value, null, 2);
}

function formatJsonText(value: string): string {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatDataGap(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (!isRecord(value)) return null;
  const source = readString(value.source);
  const code = readString(value.code);
  const message = readString(value.message);
  if (!source && !code && !message) return JSON.stringify(value);
  return `${source || "unknown"} · ${code || "unknown"}：${message || "未提供说明"}`;
}

function readSourceLinks(value: unknown): Array<{ title: string; url: string; sourceDomain: string; publishedAt: string | null }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const url = readString(item.url);
    if (!url) return [];
    return [
      {
        title: readString(item.title) || url,
        url,
        sourceDomain: readString(item.sourceDomain),
        publishedAt: typeof item.publishedAt === "string" ? item.publishedAt : null
      }
    ];
  });
}

function domainLabel(domain: string): string {
  const labels: Record<string, string> = {
    odds: "指数",
    api_prediction: "官方预测",
    head_to_head: "历史交锋",
    squad: "阵容伤停",
    dongqiudi_intel: "懂球帝情报",
    sporttery: "体彩数据",
    team_profile: "球队资料"
  };
  return labels[domain] ?? domain;
}

function domainStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    cached: "已缓存",
    unavailable: "暂无",
    refresh_failed: "刷新失败",
    not_requested: "未请求"
  };
  return labels[status] ?? status;
}

function poolDisplayName(poolCode: string): string {
  const labels: Record<string, string> = {
    HAD: "胜平负",
    HHAD: "让球胜平负",
    CRS: "比分",
    TTG: "总进球",
    HAFU: "半全场"
  };
  return labels[poolCode] ?? poolCode;
}

function parlayDisplayName(legsCount: number): string {
  return `${legsCount} 串 1`;
}

function summarizeSourceDomains(
  contextDomains: Array<{ domain: string; status: string; summary: string; error: string }>,
  domains: string[],
  emptyText: string
): string {
  const rows = contextDomains.filter((entry) => domains.includes(entry.domain));
  if (rows.length === 0) return emptyText;
  return rows
    .map((entry) => {
      const detail = entry.summary || entry.error || "暂无摘要";
      return `${domainLabel(entry.domain)} ${domainStatusLabel(entry.status)}：${detail}`;
    })
    .join("；");
}

function buildSourceBreakdown(input: {
  contextDomains: Array<{ domain: string; status: string; summary: string; error: string }>;
  sportteryPoolsCount: number;
}) {
  return [
    {
      source: "API-Football",
      detail: "仅赛程：比赛时间、场地、球队、状态和比分"
    },
    {
      source: "体彩",
      detail:
        input.sportteryPoolsCount > 0
          ? `投注玩法与赔率：已注入 ${input.sportteryPoolsCount} 个体彩玩法池，并读取体彩赛前摘要`
          : summarizeSourceDomains(input.contextDomains, ["sporttery"], "投注玩法与赔率：未读取到体彩玩法池")
    },
    {
      source: "懂球帝",
      detail: summarizeSourceDomains(input.contextDomains, ["dongqiudi_intel"], "未读取到懂球帝赛前对比数据")
    },
    {
      source: "本地资料",
      detail: summarizeSourceDomains(input.contextDomains, ["team_profile"], "已注入本地球队资料框架，部分球队资料可能为空")
    },
    {
      source: "外部联网情报",
      detail: "当前模型可基于自身联网能力补充公开情报；本地统一采集源尚未配置"
    }
  ];
}

function formatTeamProfile(profile: unknown) {
  const source = isRecord(profile) ? profile : {};
  const keyPlayers = Array.isArray(source.keyPlayers)
    ? source.keyPlayers.flatMap((player) => {
        if (!isRecord(player)) return [];
        const name = readString(player.name);
        const position = readString(player.position);
        const club = readString(player.club);
        return name ? [`${name}${position ? ` / ${position}` : ""}${club ? ` / ${club}` : ""}`] : [];
      })
    : [];
  const injuries = Array.isArray(source.injuries)
    ? source.injuries.flatMap((injury) => {
        if (!isRecord(injury)) return [];
        const player = readString(injury.player);
        const status = readString(injury.status);
        const injuryText = readString(injury.injury);
        return player ? [`${player}${status ? ` / ${status}` : ""}${injuryText ? ` / ${injuryText}` : ""}`] : [];
      })
    : [];
  const worldCupHistory = isRecord(source.worldCupHistory) ? source.worldCupHistory : null;
  const appearances = worldCupHistory ? readNumber(worldCupHistory.appearances) : null;
  const bestResult = worldCupHistory ? readString(worldCupHistory.bestResult) : "";
  const titles = worldCupHistory ? readNumber(worldCupHistory.titles) : null;

  return {
    wc26TeamId: readString(source.wc26TeamId),
    coach: readString(source.coach),
    playingStyle: readString(source.playingStyle),
    keyPlayers,
    injuries,
    worldCupHistory:
      appearances !== null || bestResult || titles !== null
        ? `参赛 ${appearances ?? "-"} 次 · 最好成绩 ${bestResult || "-"} · 冠军 ${titles ?? "-"} 次`
        : "",
    qualifyingSummary: readString(source.qualifyingSummary),
    marketValue: source.marketValue === null ? "暂无身价数据源" : readString(source.marketValue)
  };
}

function formatHistoricalMatchup(matchup: unknown): string {
  if (!isRecord(matchup)) return "暂无两队世界杯历史交锋数据";
  const totalMatches = readNumber(matchup.totalMatches);
  const homeWins = readNumber(matchup.homeWins);
  const draws = readNumber(matchup.draws);
  const awayWins = readNumber(matchup.awayWins);
  const summary = readString(matchup.summary);
  const record =
    totalMatches !== null
      ? `${totalMatches} 场 · 主 ${homeWins ?? "-"} 胜 / ${draws ?? "-"} 平 / 客 ${awayWins ?? "-"} 胜`
      : "暂无战绩统计";
  return summary ? `${record}。${summary}` : record;
}

function getBattleContextSummary(round: BettingArenaRoundDto | null | undefined) {
  const battleContext = round?.battleContext;
  const matches = isRecord(battleContext) && Array.isArray(battleContext.matches) ? battleContext.matches : [];
  const matchRows = matches.flatMap((match) => {
    if (!isRecord(match)) return [];
    const sportteryPools = Array.isArray(match.sportteryPools) ? match.sportteryPools : [];
    const dataGaps = Array.isArray(match.dataGaps) ? match.dataGaps : [];
    const contextDomains = Array.isArray(match.contextDomains)
      ? match.contextDomains.flatMap((domain) => {
          if (!isRecord(domain)) return [];
          return [
            {
              domain: readString(domain.domain),
              status: readString(domain.status),
              summary: readString(domain.summary),
              error: readString(domain.error)
            }
          ];
        })
      : [];
    const externalIntel = isRecord(match.externalIntel) ? match.externalIntel : null;
    const optionsCount = sportteryPools.reduce((total, pool) => {
      if (!isRecord(pool) || !Array.isArray(pool.options)) return total;
      return total + pool.options.length;
    }, 0);
    return [
      {
        matchId: readString(match.matchId),
        homeTeamName: readString(match.homeTeamName),
        awayTeamName: readString(match.awayTeamName),
        kickoffAt: readString(match.kickoffAt),
        status: readString(match.status),
        homeScore: readNumber(match.homeScore),
        awayScore: readNumber(match.awayScore),
        poolsCount: sportteryPools.length,
        optionsCount,
        dataGapsCount: dataGaps.length,
        dataGaps: dataGaps.flatMap((item) => {
          const formatted = formatDataGap(item);
          return formatted ? [formatted] : [];
        }),
        homeTeamProfile: formatTeamProfile(match.homeTeamProfile),
        awayTeamProfile: formatTeamProfile(match.awayTeamProfile),
        historicalMatchup: formatHistoricalMatchup(match.historicalMatchup),
        contextDomains,
        externalIntel: {
          status: readString(externalIntel?.status),
          summary: readString(externalIntel?.summary),
          sourceLinks: readSourceLinks(externalIntel?.sourceLinks),
          collectedAt: readString(externalIntel?.collectedAt)
        },
        sourceBreakdown: buildSourceBreakdown({ contextDomains, sportteryPoolsCount: sportteryPools.length })
      }
    ];
  });

  return {
    matches: matchRows,
    poolsCount: matchRows.reduce((total, match) => total + match.poolsCount, 0),
    optionsCount: matchRows.reduce((total, match) => total + match.optionsCount, 0),
    dataGapsCount: matchRows.reduce((total, match) => total + match.dataGapsCount, 0)
  };
}

function getMatchLabel(matches: ReturnType<typeof getBattleContextSummary>["matches"], matchId: string): string {
  const match = matches.find((entry) => entry.matchId === matchId);
  if (!match) return matchId;
  if (!match.homeTeamName && !match.awayTeamName) return matchId;
  return `${match.homeTeamName || matchId} 对 ${match.awayTeamName || "对手"}`;
}

function getMatchResultLabel(matches: ReturnType<typeof getBattleContextSummary>["matches"], matchId: string): string {
  const match = matches.find((entry) => entry.matchId === matchId);
  if (!match) return "未找到赛程";
  if (match.status === "finished" && match.homeScore !== null && match.awayScore !== null) {
    return `已完赛 ${match.homeScore}-${match.awayScore}`;
  }
  return "待赛果";
}

function getSlipMatchIds(slip: BettingArenaSlipDto): string[] {
  const ids = new Set<string>();
  for (const single of slip.singles) {
    if (single.matchId) ids.add(single.matchId);
  }
  for (const parlay of slip.parlays) {
    for (const leg of parlay.legs) {
      if (leg.matchId) ids.add(leg.matchId);
    }
  }
  return [...ids];
}

function getSlipProgress(slip: BettingArenaSlipDto, matches: ReturnType<typeof getBattleContextSummary>["matches"]) {
  const matchIds = getSlipMatchIds(slip);
  if (matchIds.length === 0) return null;
  const finished = matchIds.filter((matchId) => {
    const match = matches.find((entry) => entry.matchId === matchId);
    return match?.status === "finished" && match.homeScore !== null && match.awayScore !== null;
  }).length;
  return { total: matchIds.length, finished, matchIds };
}

function splitPrompt(prompt: string) {
  const accountMarker = "account_context=";
  const battleMarker = "battle_context=";
  const accountIndex = prompt.indexOf(accountMarker);
  const battleIndex = prompt.indexOf(battleMarker);
  if (accountIndex < 0 || battleIndex < 0 || battleIndex < accountIndex) {
    return {
      rules: prompt || "暂无提示规则快照。",
      accountContext: "暂无账户上下文快照。",
      battleContext: "暂无比赛数据快照。",
      fullPrompt: prompt || "暂无提示词快照。"
    };
  }

  const rules = prompt.slice(0, accountIndex).trim();
  const accountContext = prompt.slice(accountIndex + accountMarker.length, battleIndex).trim();
  const battleContext = prompt.slice(battleIndex + battleMarker.length).trim();
  return {
    rules: rules || "暂无提示规则快照。",
    accountContext: accountContext ? formatJsonText(accountContext) : "暂无账户上下文快照。",
    battleContext: battleContext ? formatJsonText(battleContext) : "暂无比赛数据快照。",
    fullPrompt: prompt || "暂无提示词快照。"
  };
}

export function BettingArenaPage({ arena, loading, error, onTriggerRound, onTriggerModel, onSettleRound }: BettingArenaPageProps) {
  const [selectedSlip, setSelectedSlip] = useState<BettingArenaSlipDto | null>(null);
  const [inputPanelOpen, setInputPanelOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [busyModelIds, setBusyModelIds] = useState<Set<string>>(() => new Set());
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const roundGenerating = arena?.currentRound?.status === "generating";
  const busyModelCount = busyModelIds.size;
  const battleContextSummary = getBattleContextSummary(arena?.currentRound);
  const selectedSlipProgress = selectedSlip ? getSlipProgress(selectedSlip, battleContextSummary.matches) : null;
  const selectedPrompt = splitPrompt(selectedSlip?.prompt ?? "");

  async function triggerRound() {
    setBusy(true);
    setActionError(null);
    setActionMessage("已发送出单请求，模型正在生成投注方案。");
    try {
      await onTriggerRound();
      setActionMessage("出单请求已返回，列表已刷新。");
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "生成今日出单失败";
      setActionError(message);
      setActionMessage(null);
    } finally {
      setBusy(false);
    }
  }

  async function settleRound() {
    if (!arena?.currentRound) return;
    setBusy(true);
    setActionError(null);
    setActionMessage("正在结算当前轮。");
    try {
      await onSettleRound(arena.currentRound.id);
      setActionMessage("当前轮结算完成，榜单已刷新。");
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "结算当前轮失败";
      setActionError(message);
      setActionMessage(null);
    } finally {
      setBusy(false);
    }
  }

  async function triggerModel(modelId: string, displayName: string) {
    if (!arena?.currentRound) return;
    setBusyModelIds((current) => new Set(current).add(modelId));
    setActionError(null);
    setActionMessage(`已发送 ${displayName} 单独出单请求。`);
    try {
      await onTriggerModel(arena.currentRound.id, modelId);
      setActionMessage(`${displayName} 出单已返回，列表已刷新。`);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : `${displayName} 单独出单失败`;
      setActionError(message);
      setActionMessage(null);
    } finally {
      setBusyModelIds((current) => {
        const next = new Set(current);
        next.delete(modelId);
        return next;
      });
    }
  }

  return (
    <section id="betting-arena" className="page-section betting-arena">
      <div className="section-heading">
        <div>
          <p className="eyebrow">AI 实盘投注场</p>
          <h2>AI 实盘投注场</h2>
        </div>
        <div className="section-actions">
          <button className="app-button app-button-primary" type="button" onClick={triggerRound} disabled={busy || roundGenerating}>
            {busy || roundGenerating ? "生成中" : "生成今日出单"}
          </button>
          <button className="app-button app-button-secondary" type="button" onClick={() => setInputPanelOpen(true)} disabled={!arena?.currentRound}>
            投注输入面板
          </button>
          <button className="app-button app-button-secondary" type="button" onClick={settleRound} disabled={busy || !arena?.currentRound}>
            结算当前轮
          </button>
        </div>
      </div>

      {loading ? <p className="status-line">正在加载实盘投注场...</p> : null}
      {error ? <p className="status-line error">{error}</p> : null}
      {roundGenerating ? <p className="status-line">当前轮正在生成，页面会自动刷新模型出单进度。</p> : null}
      {busyModelCount > 0 ? <p className="status-line">正在生成 {busyModelCount} 个模型</p> : null}
      {actionMessage ? <p className="status-line">{actionMessage}</p> : null}
      {actionError ? <p className="status-line error">{actionError}</p> : null}

      <div className="arena-overview">
        <div>
          <span>当前轮次</span>
          <strong>{arena?.currentRound?.roundDate ?? "未创建"}</strong>
        </div>
        <div>
          <span>状态</span>
          <strong>{roundStatusLabel(arena?.currentRound?.status)}</strong>
        </div>
        <div>
          <span>今日投入</span>
          <strong>{money(arena?.currentRound?.totalStaked ?? 0)}</strong>
        </div>
        <div>
          <span>潜在返还</span>
          <strong>{money(arena?.currentRound?.potentialReturn ?? 0)}</strong>
        </div>
        <div>
          <span>可用比赛</span>
          <strong>{battleContextSummary.matches.length}</strong>
        </div>
        <div>
          <span>玩法选项</span>
          <strong>{battleContextSummary.optionsCount}</strong>
        </div>
      </div>

      <div className="arena-grid">
        <section className="arena-panel">
          <h3>AI 资金榜</h3>
          <div className="arena-account-list">
            {(arena?.accounts ?? []).map((account) => (
              <div className="arena-account-row" key={account.modelId}>
                <strong>
                  {account.rank}. {account.modelDisplayName}
                </strong>
                <span>余额 {money(account.availableBankroll)}</span>
                <span>收益率 {percent(account.returnRate)}</span>
                <span>命中率 {percent(account.hitRate)}</span>
              </div>
            ))}
            {(arena?.accounts ?? []).length === 0 ? <p className="muted">暂无模型账户。</p> : null}
          </div>
        </section>

        <section className="arena-panel">
          <h3>今日出单矩阵</h3>
          <div className="arena-slip-list">
            {(arena?.accounts ?? []).map((account) => {
              const slip = (arena?.slips ?? []).find((entry) => entry.modelId === account.modelId) ?? null;
              return (
                <div className="arena-slip-row" key={account.modelId}>
                  <button
                    aria-label={slip ? `${account.modelDisplayName} 投注详情` : `${account.modelDisplayName} 暂无出单`}
                    className="arena-slip-main"
                    type="button"
                    onClick={() => (slip ? setSelectedSlip(slip) : null)}
                    disabled={!slip}
                  >
                    <strong>{account.modelDisplayName}</strong>
                    <span>{slip ? `${actionLabel(slip.action)} · ${statusLabel(slip.status)}` : "暂无出单"}</span>
                    <span>投入 {money(slip?.totalStake ?? 0)}</span>
                    <span>潜在 {money(slip?.potentialReturn ?? 0)}</span>
                  </button>
                  <button
                    className="app-button app-button-secondary arena-slip-generate"
                    type="button"
                    onClick={() => triggerModel(account.modelId, account.modelDisplayName)}
                    disabled={!arena?.currentRound || busyModelIds.has(account.modelId)}
                  >
                    {busyModelIds.has(account.modelId) ? "生成中" : `单独生成 ${account.modelDisplayName}`}
                  </button>
                </div>
              );
            })}
            {(arena?.accounts ?? []).length === 0 ? <p className="muted">暂无模型账户。</p> : null}
            {(arena?.accounts ?? []).length > 0 && (arena?.slips ?? []).length === 0 ? (
              <p className="muted">当前轮还没有模型出单，可以逐个模型手动生成。</p>
            ) : null}
          </div>
        </section>
      </div>

      {selectedSlip ? (
        <div className="arena-detail-drawer" role="dialog" aria-modal="true">
          <div className="arena-detail-panel">
            <div className="arena-detail-header">
              <div>
                <p className="eyebrow">模型出单详情</p>
                <h3>{selectedSlip.modelDisplayName}</h3>
              </div>
              <button className="app-button app-button-secondary" type="button" onClick={() => setSelectedSlip(null)}>
                关闭
              </button>
            </div>
            <p>{selectedSlip.strategySummary || selectedSlip.validationError || "暂无详细说明。"}</p>
            {selectedSlipProgress ? (
              <div className="arena-result-progress">
                <strong>
                  赛果进度 {selectedSlipProgress.finished}/{selectedSlipProgress.total} 已出
                </strong>
                <div>
                  {selectedSlipProgress.matchIds.map((matchId) => (
                    <span className="arena-result-match" key={matchId}>
                      <span>{getMatchLabel(battleContextSummary.matches, matchId)}</span>
                      <span>{getMatchResultLabel(battleContextSummary.matches, matchId)}</span>
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="arena-detail-table">
              <strong>单场</strong>
              {selectedSlip.singles.length === 0 ? <span className="muted">无单场投入</span> : null}
              {selectedSlip.singles.map((single) => (
                <div className="arena-pick-row" key={`${single.matchId}-${single.poolCode}-${single.selectionCode}`}>
                  <span>{getMatchLabel(battleContextSummary.matches, single.matchId)}</span>
                  <span>
                    {poolDisplayName(single.poolCode)} · {single.selectionLabel} · 赔率 {single.lockedOdds.toFixed(2)} · 投入 {money(single.stake)} · 潜在{" "}
                    {money(single.stake * single.lockedOdds)}
                  </span>
                </div>
              ))}
              <strong>组合分桶</strong>
              {selectedSlip.portfolioBuckets.length === 0 ? <span className="muted">暂无组合分桶</span> : null}
              {selectedSlip.portfolioBuckets.map((bucket) => (
                <div className="arena-pick-row" key={`${bucket.bucket}-${bucket.label}`}>
                  <span>
                    {bucket.label} · 投入 {money(bucket.stake)}
                  </span>
                  <span>{bucket.rationale}</span>
                </div>
              ))}
              <strong>串关</strong>
              {selectedSlip.parlays.length === 0 ? <span className="muted">无串关投入</span> : null}
              {selectedSlip.parlays.map((parlay) => (
                <div className="arena-pick-row" key={parlay.parlayName}>
                  <span>
                    {parlayDisplayName(parlay.legs.length)} · {parlay.parlayName} · 组合赔率 {parlay.combinedOdds.toFixed(2)} · 投入 {money(parlay.stake)} · 潜在{" "}
                    {money(parlay.stake * parlay.combinedOdds)}
                  </span>
                  {parlay.legs.map((leg) => (
                    <span key={`${parlay.parlayName}-${leg.matchId}-${leg.poolCode}-${leg.selectionCode}`}>
                      {getMatchLabel(battleContextSummary.matches, leg.matchId)} · {poolDisplayName(leg.poolCode)} · {leg.selectionLabel} · 赔率{" "}
                      {leg.lockedOdds.toFixed(2)}
                    </span>
                  ))}
                </div>
              ))}
            </div>
            <div className="arena-audit-stack">
              <h4>输入 / 输出审计</h4>
              <h4>提示词拆解</h4>
              <details>
                <summary>提示规则</summary>
                <pre className="arena-audit-code">{selectedPrompt.rules}</pre>
              </details>
              <details>
                <summary>账户上下文</summary>
                <pre className="arena-audit-code">{selectedPrompt.accountContext}</pre>
              </details>
              <details>
                <summary>比赛数据</summary>
                <pre className="arena-audit-code">{selectedPrompt.battleContext}</pre>
              </details>
              <details>
                <summary>完整原文</summary>
                <pre className="arena-audit-code">{selectedPrompt.fullPrompt}</pre>
              </details>
              <details>
                <summary>账户输入</summary>
                <pre className="arena-audit-code">{formatAuditValue(selectedSlip.accountContext)}</pre>
              </details>
              <details>
                <summary>模型原始返回</summary>
                <pre className="arena-audit-code">{selectedSlip.rawResponse || "暂无原始返回。"}</pre>
              </details>
              <details>
                <summary>解析输出</summary>
                <pre className="arena-audit-code">{selectedSlip.outputJson || "暂无解析输出。"}</pre>
              </details>
            </div>
          </div>
        </div>
      ) : null}

      {inputPanelOpen && arena?.currentRound ? (
        <div className="arena-detail-drawer" role="dialog" aria-modal="true">
          <div className="arena-detail-panel arena-input-panel">
            <div className="arena-detail-header">
              <div>
                <p className="eyebrow">投注输入审计</p>
                <h3>投注输入面板</h3>
              </div>
              <button className="app-button app-button-secondary" type="button" onClick={() => setInputPanelOpen(false)}>
                关闭
              </button>
            </div>
            <div className="arena-input-summary">
              <div>
                <span>比赛</span>
                <strong>{battleContextSummary.matches.length}</strong>
              </div>
              <div>
                <span>玩法池</span>
                <strong>{battleContextSummary.poolsCount}</strong>
              </div>
              <div>
                <span>选项</span>
                <strong>{battleContextSummary.optionsCount}</strong>
              </div>
              <div>
                <span>数据缺口</span>
                <strong>{battleContextSummary.dataGapsCount}</strong>
              </div>
            </div>
            <div className="arena-input-match-list">
              {battleContextSummary.matches.map((match) => (
                <details className="arena-input-match" key={match.matchId}>
                  <summary>
                    <strong>
                      {match.homeTeamName || match.matchId} 对 {match.awayTeamName || "对手"}
                    </strong>
                    <span>{match.kickoffAt}</span>
                    <span>
                      玩法 {match.poolsCount} · 选项 {match.optionsCount} · 缺口 {match.dataGapsCount}
                    </span>
                  </summary>
                  <div className="arena-context-grid">
                    <section>
                      <h4>主队资料</h4>
                      <p>教练：{match.homeTeamProfile.coach || "暂无"}</p>
                      <p>打法：{match.homeTeamProfile.playingStyle || "暂无"}</p>
                      <p>世界杯履历：{match.homeTeamProfile.worldCupHistory || "暂无"}</p>
                      <p>身价：{match.homeTeamProfile.marketValue}</p>
                      <p>核心球员：{match.homeTeamProfile.keyPlayers.slice(0, 4).join("、") || "暂无"}</p>
                      <p>伤停：{match.homeTeamProfile.injuries.slice(0, 4).join("、") || "暂无"}</p>
                    </section>
                    <section>
                      <h4>客队资料</h4>
                      <p>教练：{match.awayTeamProfile.coach || "暂无"}</p>
                      <p>打法：{match.awayTeamProfile.playingStyle || "暂无"}</p>
                      <p>世界杯履历：{match.awayTeamProfile.worldCupHistory || "暂无"}</p>
                      <p>身价：{match.awayTeamProfile.marketValue}</p>
                      <p>核心球员：{match.awayTeamProfile.keyPlayers.slice(0, 4).join("、") || "暂无"}</p>
                      <p>伤停：{match.awayTeamProfile.injuries.slice(0, 4).join("、") || "暂无"}</p>
                    </section>
                    <section>
                      <h4>历史交锋</h4>
                      <p>{match.historicalMatchup}</p>
                    </section>
                    <section>
                      <h4>上下文摘要</h4>
                      {match.contextDomains.length === 0 ? <p>暂无上下文快照。</p> : null}
                      {match.contextDomains.map((domain) => (
                        <p key={`${match.matchId}-${domain.domain}`}>
                          {domainLabel(domain.domain)} · {domainStatusLabel(domain.status)}：{domain.summary || domain.error || "暂无"}
                        </p>
                      ))}
                    </section>
                    <section>
                      <h4>外部情报</h4>
                      <p>{match.externalIntel.summary || "暂无外部情报摘要"}</p>
                      <p>采集时间：{match.externalIntel.collectedAt || "暂无"}</p>
                      {match.externalIntel.sourceLinks.length > 0 ? (
                        <div className="arena-source-links">
                          {match.externalIntel.sourceLinks.map((source) => (
                            <a key={`${match.matchId}-${source.url}`} href={source.url} target="_blank" rel="noreferrer">
                              {source.title}
                            </a>
                          ))}
                        </div>
                      ) : null}
                    </section>
                    <section className="arena-source-breakdown">
                      <h4>数据来源拆解</h4>
                      {match.sourceBreakdown.map((source) => (
                        <p key={`${match.matchId}-${source.source}`}>
                          <strong>{source.source}</strong>：{source.detail}
                        </p>
                      ))}
                    </section>
                    <section>
                      <h4>数据缺口</h4>
                      <p>{match.dataGaps.length > 0 ? match.dataGaps.join("；") : "暂无明显缺口"}</p>
                    </section>
                  </div>
                </details>
              ))}
              {battleContextSummary.matches.length === 0 ? <p className="muted">当前轮没有可注入比赛。</p> : null}
            </div>
            <details>
              <summary>本轮完整输入 JSON</summary>
              <pre className="arena-audit-code">{formatAuditValue(arena.currentRound.battleContext)}</pre>
            </details>
            <details>
              <summary>各模型输入快照</summary>
              <div className="arena-model-inputs">
                {(arena.slips ?? []).map((slip) => (
                  <details key={slip.id}>
                    <summary>{slip.modelDisplayName}</summary>
                    <pre className="arena-audit-code">{slip.prompt || "暂无提示词快照。"}</pre>
                  </details>
                ))}
                {(arena.slips ?? []).length === 0 ? <p className="muted">当前轮还没有模型输入快照。</p> : null}
              </div>
            </details>
          </div>
        </div>
      ) : null}
    </section>
  );
}
