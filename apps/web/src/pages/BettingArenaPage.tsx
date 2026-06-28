import { BarChart3, ChevronRight, ClipboardList, History, Loader2, Play, ReceiptText, RefreshCw, Target, Trophy, Wallet } from "lucide-react";
import type { BettingArenaDto, BettingArenaLedgerDto, BettingArenaRoundDto, BettingArenaRoundStatus, BettingArenaSlipDto } from "@worldcup-ai-pk/shared";
import { useEffect, useState } from "react";
import {
  domainLabel,
  domainStatusLabel,
  formatAuditValue,
  formatDataGap,
  formatJsonText,
  getBattleContextSummary,
  isRecord,
  parlayDisplayName,
  poolDisplayName
} from "./bettingArenaViewModels";

interface BettingArenaPageProps {
  arena: BettingArenaDto | null;
  loading: boolean;
  error: string | null;
  onTriggerRound: () => Promise<BettingArenaDto>;
  onTriggerModel: (roundId: string, modelId: string, force?: boolean) => Promise<BettingArenaDto>;
  onSettleRound: (roundId: string) => Promise<BettingArenaDto>;
  onLoadLedger?: (params?: { modelId?: string | null; limit?: number; offset?: number }) => Promise<BettingArenaLedgerDto>;
  onLoadRound?: (roundId: string) => Promise<BettingArenaDto>;
  onRefreshRoundContext?: (roundId: string) => Promise<void>;
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

function getMatchLabelForId(matches: ReturnType<typeof getBattleContextSummary>["matches"], matchId: string): string {
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

function getSlipSettlementStats(slip: BettingArenaSlipDto) {
  const items = slip.settlement?.items ?? [];
  const finishedItems = items.filter((item) => !item.voided);
  const hitItems = finishedItems.filter((item) => item.won);
  const returnedAmount = slip.settlement?.returnedAmount ?? 0;
  const profit = slip.settlement?.profit ?? 0;
  return {
    total: finishedItems.length,
    hit: hitItems.length,
    returnedAmount,
    profit
  };
}

function getSingleSettlement(slip: BettingArenaSlipDto, singleIndex: number): { settled: boolean; hit: boolean; voided: boolean; profit: number } | null {
  const items = slip.settlement?.items ?? [];
  const item = items[singleIndex];
  if (!item || item.type !== "single") return null;
  return {
    settled: true,
    hit: item.won,
    voided: item.voided,
    profit: item.returnedAmount - item.stake
  };
}

function judgeSingleResult(
  single: { poolCode: string; selectionCode: string; goalLine?: number | null },
  match: { status: string; homeScore: number | null; awayScore: number | null }
): "hit" | "miss" | null {
  if (match.status !== "finished" || match.homeScore === null || match.awayScore === null) {
    return null;
  }
  const homeScore =
    single.poolCode === "HHAD" && typeof single.goalLine === "number"
      ? match.homeScore + single.goalLine
      : match.homeScore;
  if (single.selectionCode === "h") return homeScore > match.awayScore ? "hit" : "miss";
  if (single.selectionCode === "d") return homeScore === match.awayScore ? "hit" : "miss";
  if (single.selectionCode === "a") return homeScore < match.awayScore ? "hit" : "miss";
  return null;
}

function getParlayLegSettlement(slip: BettingArenaSlipDto, parlayIndex: number, legIndex: number): { settled: boolean; hit: boolean; voided: boolean } | null {
  const items = slip.settlement?.items ?? [];
  const itemIndex = slip.singles.length + parlayIndex;
  const item = items[itemIndex];
  if (!item || item.type !== "parlay" || !item.legs) return null;
  const leg = item.legs[legIndex];
  if (!leg) return null;
  return {
    settled: true,
    hit: leg.won,
    voided: leg.voided
  };
}

function roundLabel(round: Pick<BettingArenaRoundDto, "roundDate" | "roundSequence"> | null | undefined): string {
  if (!round) return "未创建";
  return `${round.roundDate} 第 ${round.roundSequence} 轮`;
}

function settlementItemStatusLabel(item: NonNullable<BettingArenaSlipDto["settlement"]>["items"][number]): string {
  if (item.voided) return "退回";
  return item.won ? "命中" : "未中";
}

function settlementTone(item: NonNullable<BettingArenaSlipDto["settlement"]>["items"][number]): string {
  if (item.voided) return "void";
  return item.won ? "hit" : "miss";
}

function findSingleForSettlementItem(slip: BettingArenaSlipDto, itemIndex: number) {
  return slip.singles[itemIndex] ?? null;
}

function findParlayForSettlementItem(slip: BettingArenaSlipDto, itemIndex: number) {
  const parlayIndex = itemIndex - slip.singles.length;
  return slip.parlays[parlayIndex] ?? null;
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

export function BettingArenaPage({ arena, loading, error, onTriggerRound, onTriggerModel, onSettleRound, onLoadLedger, onLoadRound, onRefreshRoundContext }: BettingArenaPageProps) {
  const [selectedSlip, setSelectedSlip] = useState<BettingArenaSlipDto | null>(null);
  const [selectedSlipRound, setSelectedSlipRound] = useState<BettingArenaRoundDto | null>(null);
  const [ledger, setLedger] = useState<BettingArenaLedgerDto | null>(null);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [refreshingRoundId, setRefreshingRoundId] = useState<string | null>(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerError, setLedgerError] = useState<string | null>(null);
  const [ledgerModelId, setLedgerModelId] = useState<string | null>(null);
  const [historyRoundArena, setHistoryRoundArena] = useState<BettingArenaDto | null>(null);
  const [historyLoadingId, setHistoryLoadingId] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyModelIds, setBusyModelIds] = useState<Set<string>>(() => new Set());
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!actionMessage && !actionError) return undefined;
    const timeout = window.setTimeout(() => {
      setActionMessage(null);
      setActionError(null);
    }, 6000);
    return () => window.clearTimeout(timeout);
  }, [actionMessage, actionError]);

  const roundGenerating = arena?.currentRound?.status === "generating";
  const busyModelCount = busyModelIds.size;
  const battleContextSummary = getBattleContextSummary(arena?.currentRound);
  const selectedSlipContextSummary = getBattleContextSummary(selectedSlipRound ?? arena?.currentRound);
  const selectedSlipProgress = selectedSlip ? getSlipProgress(selectedSlip, selectedSlipContextSummary.matches) : null;
  const selectedPrompt = splitPrompt(selectedSlip?.prompt ?? "");

  function openSlipDetail(slip: BettingArenaSlipDto, round: BettingArenaRoundDto | null | undefined) {
    setSelectedSlip(slip);
    setSelectedSlipRound(round ?? null);
  }

  function closeSlipDetail() {
    setSelectedSlip(null);
    setSelectedSlipRound(null);
  }

  async function openLedger(modelId: string | null = null) {
    if (!onLoadLedger) return;
    setLedgerLoading(true);
    setLedgerError(null);
    setLedgerModelId(modelId);
    try {
      const nextLedger = await onLoadLedger({ modelId, limit: 50, offset: 0 });
      setLedger(nextLedger);
      setLedgerOpen(true);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "加载投注账本失败";
      setLedgerError(message);
      setLedgerOpen(false);
    } finally {
      setLedgerLoading(false);
    }
  }

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

  async function triggerModel(modelId: string, displayName: string, force = false) {
    if (!arena?.currentRound) return;
    setBusyModelIds((current) => new Set(current).add(modelId));
    setActionError(null);
    setActionMessage(force ? `正在重新生成 ${displayName} 出单...` : `已发送 ${displayName} 单独出单请求。`);
    try {
      await onTriggerModel(arena.currentRound.id, modelId, force);
      setActionMessage(force ? `${displayName} 已重新出单，列表已刷新。` : `${displayName} 出单已返回，列表已刷新。`);
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

  async function loadHistoryRound(roundId: string) {
    if (!onLoadRound) return;
    setHistoryLoadingId(roundId);
    setHistoryError(null);
    try {
      const nextArena = await onLoadRound(roundId);
      setHistoryRoundArena(nextArena);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "加载历史轮次失败";
      setHistoryError(message);
    } finally {
      setHistoryLoadingId(null);
    }
  }

  async function refreshHistoryRoundContext(roundId: string) {
    if (!onRefreshRoundContext || !onLoadRound) return;
    setHistoryError(null);
    setRefreshingRoundId(roundId);
    try {
      await onRefreshRoundContext(roundId);
      const nextArena = await onLoadRound(roundId);
      setHistoryRoundArena(nextArena);
      setActionMessage("已重新采集该轮比赛情报，输入与情报已刷新。");
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "重新采集情报失败";
      setHistoryError(message);
    } finally {
      setRefreshingRoundId(null);
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
            {busy || roundGenerating ? <><Loader2 size={16} aria-hidden="true" /> 生成中</> : <><Play size={16} aria-hidden="true" /> 生成今日出单</>}
          </button>
          <button className="app-button app-button-secondary" type="button" onClick={() => void openLedger(null)} disabled={!onLoadLedger || ledgerLoading}>
            <ClipboardList aria-hidden="true" size={16} />
            查看投注账本
          </button>
          <button className="app-button app-button-secondary" type="button" onClick={settleRound} disabled={busy || !arena?.currentRound}>
            <RefreshCw size={16} aria-hidden="true" />
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
      {ledgerError ? <p className="status-line error">{ledgerError}</p> : null}

      <div className="arena-overview">
        <div>
          <span>当前轮次</span>
          <strong>{roundLabel(arena?.currentRound)}</strong>
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
        <section className="arena-panel arena-standings-panel">
          <h3>AI 资金榜</h3>
          <div className="arena-account-list">
            {(arena?.accounts ?? []).map((account) => (
              <div className="arena-account-row" key={account.modelId}>
                <div className="arena-rank-chip">{account.rank}</div>
                <div>
                  <strong>{account.modelDisplayName}</strong>
                  <span><Wallet size={13} aria-hidden="true" /> 余额 {money(account.availableBankroll)} · 冻结 {money(account.frozenStake)}</span>
                </div>
                <span><BarChart3 size={13} aria-hidden="true" /> 收益率 {percent(account.returnRate)}</span>
                <span><Target size={13} aria-hidden="true" /> 投注项命中率 {account.hitPickCount}/{account.settledPickCount}</span>
                <span><Trophy size={13} aria-hidden="true" /> 盈利出单 {account.profitableSlipCount}/{account.settledOrderCount}</span>
              </div>
            ))}
            {(arena?.accounts ?? []).length === 0 ? <p className="muted">暂无模型账户。</p> : null}
          </div>
        </section>

        <section className="arena-panel arena-orders-panel">
          <h3>当前出单</h3>
          <div className="arena-slip-list">
            {(arena?.accounts ?? []).map((account) => {
              const slip = (arena?.slips ?? []).find((entry) => entry.modelId === account.modelId) ?? null;
              const settlement = slip?.settlement ?? null;
              const profit = settlement ? settlement.profit : null;
              const canRegenerate = Boolean(slip) && slip!.status !== "generation_failed" && !settlement;
              return (
                <div className="arena-slip-card" key={account.modelId}>
                  <div className="arena-slip-card-header">
                    <button
                      aria-label={slip ? `${account.modelDisplayName} 投注详情` : `${account.modelDisplayName} 暂无出单`}
                      className="arena-slip-card-title"
                      type="button"
                      onClick={() => (slip ? openSlipDetail(slip, arena?.currentRound) : null)}
                      disabled={!slip}
                    >
                      <ReceiptText size={18} aria-hidden="true" />
                      <div>
                        <strong>{account.modelDisplayName}</strong>
                        <span>{slip ? `${actionLabel(slip.action)} · ${statusLabel(slip.status)}` : "暂无出单"}</span>
                      </div>
                    </button>
                    <div className="arena-slip-card-actions">
                      <button
                        aria-label={canRegenerate ? `重新生成 ${account.modelDisplayName} 投注单` : `生成 ${account.modelDisplayName} 投注单`}
                        className="icon-action-button"
                        type="button"
                        onClick={() => triggerModel(account.modelId, account.modelDisplayName, canRegenerate)}
                        disabled={!arena?.currentRound || busyModelIds.has(account.modelId)}
                      >
                        {busyModelIds.has(account.modelId) ? <Loader2 size={17} aria-hidden="true" /> : canRegenerate ? <RefreshCw size={17} aria-hidden="true" /> : <Play size={17} aria-hidden="true" />}
                        <span>{busyModelIds.has(account.modelId) ? "生成中" : canRegenerate ? "重新生成" : "单独生成"}</span>
                      </button>
                      <button
                        aria-label={`查看 ${account.modelDisplayName} 投注账本`}
                        className="icon-action-button icon-action-button-secondary"
                        type="button"
                        onClick={() => void openLedger(account.modelId)}
                        disabled={!onLoadLedger || ledgerLoading}
                      >
                        <History size={17} aria-hidden="true" />
                        <span>账本</span>
                      </button>
                    </div>
                  </div>
                  <div className="arena-slip-card-metrics">
                    <span>投入 {money(slip?.totalStake ?? 0)}</span>
                    <span>{settlement ? `返还 ${money(settlement.returnedAmount)}` : `潜在 ${money(slip?.potentialReturn ?? 0)}`}</span>
                    <span className={profit === null || profit >= 0 ? "arena-profit-positive" : "arena-profit-negative"}>
                      {profit === null ? "待结算" : `盈亏 ${profit >= 0 ? "+" : ""}${money(profit)}`}
                    </span>
                  </div>
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

      <section className="arena-panel arena-history-panel">
        <div className="arena-panel-header">
          <h3>历史结算</h3>
          <span>{arena?.history.length ?? 0} 轮</span>
        </div>
        <div className="arena-history-list">
          {(arena?.history ?? []).map((round) => {
            const profit = round.totalReturned - round.totalStaked;
            return (
              <button
                aria-label={`查看 ${round.roundDate} 第 ${round.roundSequence} 轮历史结算`}
                className="arena-history-row"
                disabled={!onLoadRound || historyLoadingId === round.roundId}
                key={round.roundId}
                onClick={() => loadHistoryRound(round.roundId)}
                type="button"
              >
                <strong>
                  {round.roundDate} 第 {round.roundSequence} 轮
                </strong>
                <span>{roundStatusLabel(round.status)}</span>
                <span>投入 {money(round.totalStaked)}</span>
                <span>返还 {money(round.totalReturned)}</span>
                <span className={profit >= 0 ? "arena-profit-positive" : "arena-profit-negative"}>盈亏 {profit >= 0 ? "+" : ""}{money(profit)}</span>
                <span>{historyLoadingId === round.roundId ? "加载中" : round.bestModelDisplayName ? `最佳 ${round.bestModelDisplayName}` : "查看"}</span>
              </button>
            );
          })}
          {(arena?.history ?? []).length === 0 ? <p className="muted">暂无历史结算。</p> : null}
        </div>
      </section>

      {historyError ? <p className="status-line error">{historyError}</p> : null}

      {ledgerOpen ? (
        <div className="arena-detail-drawer" role="dialog" aria-modal="true">
          <div className="arena-detail-panel arena-ledger-panel">
            <div className="arena-detail-header">
              <div>
                <p className="eyebrow">{ledgerModelId ? "模型投注流水" : "全量投注流水"}</p>
                <h3>投注账本</h3>
              </div>
              <button className="app-button app-button-secondary" type="button" onClick={() => setLedgerOpen(false)}>
                关闭
              </button>
            </div>
            {ledgerError ? <p className="status-line error">{ledgerError}</p> : null}
            <div className="arena-ledger-list">
              {(ledger?.items ?? []).map((entry) => {
                const stats = getSlipSettlementStats(entry.slip);
                const hasSettlement = entry.slip.settlement !== null;
                return (
                  <button
                    aria-label={`查看 ${entry.slip.modelDisplayName} ${roundLabel(entry.round)}投注明细`}
                    className="arena-ledger-row"
                    key={entry.slip.id}
                    type="button"
                    onClick={() => {
                      setLedgerOpen(false);
                      openSlipDetail(entry.slip, entry.round);
                    }}
                  >
                    <div>
                      <strong>{entry.slip.modelDisplayName}</strong>
                      <span>{roundLabel(entry.round)} · {actionLabel(entry.slip.action)} · {statusLabel(entry.slip.status)}</span>
                    </div>
                    <span>投入 {money(entry.slip.totalStake)}</span>
                    {hasSettlement ? (
                      <>
                        <span>返还 {money(stats.returnedAmount)}</span>
                        <span className={stats.profit >= 0 ? "arena-profit-positive" : "arena-profit-negative"}>
                          盈亏 {stats.profit >= 0 ? "+" : ""}{money(stats.profit)}
                        </span>
                      </>
                    ) : (
                      <>
                        <span>潜在 {money(entry.slip.potentialReturn)}</span>
                        <span className="arena-status-pill void">待结算</span>
                      </>
                    )}
                    {hasSettlement ? <span>命中 {stats.hit}/{stats.total}</span> : <span>命中待定</span>}
                    <ChevronRight size={18} aria-hidden="true" />
                  </button>
                );
              })}
            </div>
            {(ledger?.items ?? []).length === 0 ? <p className="muted">暂无投注流水。</p> : null}
          </div>
        </div>
      ) : null}

      {historyRoundArena?.currentRound ? (() => {
        const historyRoundId = historyRoundArena.currentRound.id;
        return (
        <div className="arena-detail-drawer" role="dialog" aria-modal="true">
          <div className="arena-detail-panel arena-history-detail-panel">
            <div className="arena-detail-header">
              <div>
                <p className="eyebrow">历史结算追溯</p>
                <h3>历史轮次详情</h3>
              </div>
              <div className="section-actions">
                {onRefreshRoundContext ? (
                  <button
                    className="app-button app-button-secondary"
                    type="button"
                    disabled={refreshingRoundId === historyRoundId}
                    onClick={() => refreshHistoryRoundContext(historyRoundId)}
                  >
                    {refreshingRoundId === historyRoundId ? "采集中..." : "重新采集情报"}
                  </button>
                ) : null}
                <button className="app-button app-button-secondary" type="button" onClick={() => setHistoryRoundArena(null)}>
                  关闭
                </button>
              </div>
            </div>
            <div className="arena-input-summary">
              <div>
                <span>轮次</span>
                <strong>{roundLabel(historyRoundArena.currentRound)}</strong>
              </div>
              <div>
                <span>状态</span>
                <strong>{roundStatusLabel(historyRoundArena.currentRound.status)}</strong>
              </div>
              <div>
                <span>投入</span>
                <strong>{money(historyRoundArena.currentRound.totalStaked)}</strong>
              </div>
              <div>
                <span>返还</span>
                <strong>{money(historyRoundArena.currentRound.settledReturn)}</strong>
              </div>
            </div>
            <div className="arena-history-slip-list">
              {historyRoundArena.slips.map((slip) => {
                const stats = getSlipSettlementStats(slip);
                return (
                  <button
                    aria-label={`查看 ${slip.modelDisplayName} 历史出单`}
                    className="arena-history-slip-row"
                    key={slip.id}
                    onClick={() => {
                      setHistoryRoundArena(null);
                      openSlipDetail(slip, historyRoundArena.currentRound);
                    }}
                    type="button"
                  >
                    <strong>{slip.modelDisplayName}</strong>
                    <span>{actionLabel(slip.action)} · {statusLabel(slip.status)}</span>
                    <span>投入 {money(slip.totalStake)}</span>
                    <span>返还 {money(stats.returnedAmount)}</span>
                    <span className={stats.profit >= 0 ? "arena-profit-positive" : "arena-profit-negative"}>
                      盈亏 {stats.profit >= 0 ? "+" : ""}{money(stats.profit)}
                    </span>
                    <span>命中 {stats.hit} / {stats.total}</span>
                  </button>
                );
              })}
              {historyRoundArena.slips.length === 0 ? <p className="muted">这一轮没有模型出单记录。</p> : null}
            </div>
          </div>
        </div>
        );
      })() : null}

      {selectedSlip ? (
        <div className="arena-detail-drawer" role="dialog" aria-modal="true">
          <div className="arena-detail-panel">
            <div className="arena-detail-header">
              <div>
                <p className="eyebrow">模型出单详情</p>
                <h3>{selectedSlip.modelDisplayName}</h3>
              </div>
              <button className="app-button app-button-secondary" type="button" onClick={closeSlipDetail}>
                关闭
              </button>
            </div>
            <p>{selectedSlip.strategySummary || selectedSlip.validationError || "暂无详细说明。"}</p>
            <div className="arena-slip-summary-row">
              <div>
                <span>投入</span>
                <strong>{money(selectedSlip.totalStake)}</strong>
              </div>
              <div>
                <span>潜在返还</span>
                <strong>{money(selectedSlip.potentialReturn)}</strong>
              </div>
              <div>
                <span>投注项</span>
                <strong>{selectedSlip.singles.length} 单场 + {selectedSlip.parlays.length} 串关</strong>
              </div>
              {selectedSlip.settlement ? (
                <div>
                  <span>盈亏</span>
                  <strong className={selectedSlip.settlement.profit >= 0 ? "arena-profit-positive" : "arena-profit-negative"}>
                    {selectedSlip.settlement.profit >= 0 ? "+" : ""}{money(selectedSlip.settlement.profit)}
                  </strong>
                </div>
              ) : null}
            </div>

            {selectedSlipProgress ? (
              <div className="arena-result-progress">
                <strong>
                  赛果进度 {selectedSlipProgress.finished}/{selectedSlipProgress.total} 已出
                </strong>
                <div>
                  {selectedSlipProgress.matchIds.map((matchId) => (
                    <span className="arena-result-match" key={matchId}>
                      <span>{getMatchLabelForId(selectedSlipContextSummary.matches, matchId)}</span>
                      <span>{getMatchResultLabel(selectedSlipContextSummary.matches, matchId)}</span>
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="arena-detail-table">
              <h4>单场投注</h4>
              {selectedSlip.singles.length === 0 ? <span className="muted">无单场投入</span> : null}
              {selectedSlip.singles.map((single, singleIndex) => {
                const settlement = getSingleSettlement(selectedSlip, singleIndex);
                const matchForSingle = selectedSlipContextSummary.matches.find((m) => m.matchId === single.matchId);
                const liveResult = !settlement && matchForSingle
                  ? judgeSingleResult(single, matchForSingle)
                  : null;
                const hasLiveResult = liveResult !== null;
                return (
                <div className="arena-pick-card" key={`${single.matchId}-${single.poolCode}-${single.selectionCode}`}>
                  <div className="arena-pick-card-header">
                    <strong>{getMatchLabelForId(selectedSlipContextSummary.matches, single.matchId)}</strong>
                    <div className="arena-pick-card-header-meta">
                      {settlement ? (
                        <span className={`arena-status-pill ${settlement.voided ? "void" : settlement.hit ? "hit" : "miss"}`}>
                          {settlement.voided ? "退回" : settlement.hit ? "命中" : "未中"}
                        </span>
                      ) : hasLiveResult ? (
                        <span className={`arena-status-pill ${liveResult === "hit" ? "hit" : "miss"}`}>
                          赛果判定：{liveResult === "hit" ? "命中" : "未中"}
                        </span>
                      ) : null}
                      <span className="arena-pick-odds">赔率 {single.lockedOdds.toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="arena-pick-card-body">
                    <span>{poolDisplayName(single.poolCode)} · {single.selectionLabel}</span>
                    <span>
                      投入 {money(single.stake)}
                      {settlement
                        ? ` · 返还 ${money(settlement.hit ? single.stake * single.lockedOdds : settlement.voided ? single.stake : 0)}`
                        : hasLiveResult
                          ? ` · 赛果返还 ${money(liveResult === "hit" ? single.stake * single.lockedOdds : 0)}`
                          : ` · 潜在 ${money(single.stake * single.lockedOdds)}`}
                    </span>
                  </div>
                  {single.rationale ? <p className="arena-pick-card-reason">{single.rationale}</p> : null}
                </div>
                );
              })}

              <h4>串关</h4>
              {selectedSlip.parlays.length === 0 ? <span className="muted">无串关投入</span> : null}
              {selectedSlip.parlays.map((parlay, parlayIndex) => (
                <div className="arena-pick-card" key={parlay.parlayName}>
                  <div className="arena-pick-card-header">
                    <strong>{parlayDisplayName(parlay.legs.length)} · {parlay.parlayName}</strong>
                    <span className="arena-pick-odds">组合赔率 {parlay.combinedOdds.toFixed(2)}</span>
                  </div>
                  <div className="arena-pick-card-body">
                    <span>投入 {money(parlay.stake)} · 潜在 {money(parlay.stake * parlay.combinedOdds)}</span>
                  </div>
                  <div className="arena-pick-card-legs">
                    {parlay.legs.map((leg, legIndex) => {
                      const legSettlement = getParlayLegSettlement(selectedSlip, parlayIndex, legIndex);
                      const matchForLeg = selectedSlipContextSummary.matches.find((m) => m.matchId === leg.matchId);
                      const liveLegResult = !legSettlement && matchForLeg
                        ? judgeSingleResult(leg, matchForLeg)
                        : null;
                      return (
                      <span key={`${parlay.parlayName}-${leg.matchId}-${leg.poolCode}-${leg.selectionCode}`}>
                        {getMatchLabelForId(selectedSlipContextSummary.matches, leg.matchId)} · {poolDisplayName(leg.poolCode)} · {leg.selectionLabel} · {leg.lockedOdds.toFixed(2)}
                        {legSettlement ? (
                          <span className={`arena-status-pill ${legSettlement.voided ? "void" : legSettlement.hit ? "hit" : "miss"}`} style={{ marginLeft: 6, fontSize: 11 }}>
                            {legSettlement.voided ? "退回" : legSettlement.hit ? "命中" : "未中"}
                          </span>
                        ) : liveLegResult ? (
                          <span className={`arena-status-pill ${liveLegResult === "hit" ? "hit" : "miss"}`} style={{ marginLeft: 6, fontSize: 11 }}>
                            判定：{liveLegResult === "hit" ? "命中" : "未中"}
                          </span>
                        ) : null}
                      </span>
                      );
                    })}
                  </div>
                  {parlay.rationale ? <p className="arena-pick-card-reason">{parlay.rationale}</p> : null}
                </div>
              ))}

              <h4>风险分桶汇总</h4>
              <p className="arena-pick-hint">以下为上方单场 + 串关按风险类型的分类汇总，不是额外投注。小计为该桶下投注项总投入，合计应等于出单总投入 {money(selectedSlip.totalStake)}。</p>
              {selectedSlip.portfolioBuckets.length === 0 ? <span className="muted">模型未输出分桶。</span> : null}
              {selectedSlip.portfolioBuckets.map((bucket) => (
                <div className="arena-pick-card" key={`${bucket.bucket}-${bucket.label}`}>
                  <div className="arena-pick-card-header">
                    <strong>{bucket.label}</strong>
                    {bucket.stake > 0 ? <span className="arena-pick-odds">小计 {money(bucket.stake)}</span> : null}
                  </div>
                  {bucket.items.length > 0 ? (
                    <div className="arena-pick-card-body">
                      <span>{bucket.items.join("、")}</span>
                    </div>
                  ) : null}
                  {bucket.rationale ? <p className="arena-pick-card-reason">{bucket.rationale}</p> : null}
                </div>
              ))}
            </div>

            {selectedSlip.settlement ? (
              <div className="arena-settlement-box">
                <strong>结算明细</strong>
                <div className="arena-settlement-list">
                  {selectedSlip.settlement.items.map((item, index) => {
                    const single = item.type === "single" ? findSingleForSettlementItem(selectedSlip, index) : null;
                    const parlay = item.type === "parlay" ? findParlayForSettlementItem(selectedSlip, index) : null;
                    const primaryLabel =
                      item.type === "single" && single
                        ? `${getMatchLabelForId(selectedSlipContextSummary.matches, single.matchId)} · ${poolDisplayName(single.poolCode)} · ${single.selectionLabel}`
                        : `${parlayDisplayName(parlay?.legs.length ?? item.legs.length)} · ${item.name || parlay?.parlayName || "串关"}`;
                    const profit = item.returnedAmount - item.stake;
                    return (
                      <div className="arena-settlement-item" key={`${item.type}-${index}`}>
                        <div>
                          <span className={`arena-status-pill ${settlementTone(item)}`}>{settlementItemStatusLabel(item)}</span>
                          <strong>{primaryLabel}</strong>
                        </div>
                        <span>
                          {settlementItemStatusLabel(item)} · 返还 {money(item.returnedAmount)} · 盈亏 {profit >= 0 ? "" : "-"}
                          {money(Math.abs(profit))}
                        </span>
                        {item.type === "parlay"
                          ? item.legs.map((leg) => (
                              <small key={`${index}-${leg.matchId}-${leg.won}-${leg.voided}`}>
                                {getMatchLabelForId(selectedSlipContextSummary.matches, leg.matchId)} · {leg.voided ? "待退回" : leg.won ? "命中" : "未中"}
                              </small>
                            ))
                          : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
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

    </section>
  );
}
