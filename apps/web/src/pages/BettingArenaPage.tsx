import type { BettingArenaDto, BettingArenaSlipDto } from "@worldcup-ai-pk/shared";
import { useState } from "react";

interface BettingArenaPageProps {
  arena: BettingArenaDto | null;
  loading: boolean;
  error: string | null;
  onTriggerRound: () => Promise<BettingArenaDto>;
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

export function BettingArenaPage({ arena, loading, error, onTriggerRound, onSettleRound }: BettingArenaPageProps) {
  const [selectedSlip, setSelectedSlip] = useState<BettingArenaSlipDto | null>(null);
  const [busy, setBusy] = useState(false);

  async function triggerRound() {
    setBusy(true);
    try {
      await onTriggerRound();
    } finally {
      setBusy(false);
    }
  }

  async function settleRound() {
    if (!arena?.currentRound) return;
    setBusy(true);
    try {
      await onSettleRound(arena.currentRound.id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="betting-arena" className="page-section betting-arena">
      <div className="section-heading">
        <div>
          <p className="eyebrow">AI Live Betting Arena</p>
          <h2>AI 实盘投注场</h2>
        </div>
        <div className="section-actions">
          <button className="app-button app-button-primary" type="button" onClick={triggerRound} disabled={busy}>
            {busy ? "处理中" : "生成今日出单"}
          </button>
          <button className="app-button app-button-secondary" type="button" onClick={settleRound} disabled={busy || !arena?.currentRound}>
            结算当前轮
          </button>
        </div>
      </div>

      {loading ? <p className="status-line">正在加载实盘投注场...</p> : null}
      {error ? <p className="status-line error">{error}</p> : null}

      <div className="arena-overview">
        <div>
          <span>当前轮次</span>
          <strong>{arena?.currentRound?.roundDate ?? "未创建"}</strong>
        </div>
        <div>
          <span>状态</span>
          <strong>{arena?.currentRound?.status ?? "待启动"}</strong>
        </div>
        <div>
          <span>今日投入</span>
          <strong>{money(arena?.currentRound?.totalStaked ?? 0)}</strong>
        </div>
        <div>
          <span>潜在返还</span>
          <strong>{money(arena?.currentRound?.potentialReturn ?? 0)}</strong>
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
            {(arena?.slips ?? []).map((slip) => (
              <button className="arena-slip-row" type="button" key={slip.id} onClick={() => setSelectedSlip(slip)}>
                <strong>{slip.modelDisplayName}</strong>
                <span>
                  {actionLabel(slip.action)} · {statusLabel(slip.status)}
                </span>
                <span>投入 {money(slip.totalStake)}</span>
                <span>潜在 {money(slip.potentialReturn)}</span>
              </button>
            ))}
            {(arena?.slips ?? []).length === 0 ? <p className="muted">今日暂无出单。</p> : null}
          </div>
        </section>
      </div>

      {selectedSlip ? (
        <div className="arena-detail-drawer" role="dialog" aria-modal="true">
          <div className="arena-detail-panel">
            <div className="arena-detail-header">
              <div>
                <p className="eyebrow">AI Slip Detail</p>
                <h3>{selectedSlip.modelDisplayName}</h3>
              </div>
              <button className="app-button app-button-secondary" type="button" onClick={() => setSelectedSlip(null)}>
                关闭
              </button>
            </div>
            <p>{selectedSlip.strategySummary || selectedSlip.validationError || "暂无详细说明。"}</p>
            <div className="arena-detail-table">
              <strong>单场</strong>
              {selectedSlip.singles.length === 0 ? <span className="muted">无单场投入</span> : null}
              {selectedSlip.singles.map((single) => (
                <span key={`${single.matchId}-${single.poolCode}-${single.selectionCode}`}>
                  {single.matchId} · {single.poolCode} · {single.selectionLabel} · {money(single.stake)}
                </span>
              ))}
              <strong>串关</strong>
              {selectedSlip.parlays.length === 0 ? <span className="muted">无串关投入</span> : null}
              {selectedSlip.parlays.map((parlay) => (
                <span key={parlay.parlayName}>
                  {parlay.parlayName} · {parlay.legs.length} 腿 · {money(parlay.stake)}
                </span>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
