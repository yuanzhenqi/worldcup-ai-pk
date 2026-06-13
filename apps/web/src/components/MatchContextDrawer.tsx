import type { FixtureContextDomain, FixtureContextDomainStatus, FixtureContextSummaryDto, MatchDto } from "@worldcup-ai-pk/shared";
import { BottomDrawer } from "./BottomDrawer";

interface MatchContextDrawerProps {
  open: boolean;
  match: MatchDto | null;
  context: FixtureContextSummaryDto | null;
  loading: boolean;
  onClose: () => void;
}

const contextStatusLabels: Record<FixtureContextDomainStatus, string> = {
  cached: "已缓存",
  unavailable: "未获取",
  refresh_failed: "刷新失败",
  not_requested: "未请求"
};

const domainLabels: Record<FixtureContextDomain, string> = {
  odds: "赔率",
  api_prediction: "官方预测",
  head_to_head: "历史交锋",
  squad: "球员/阵容/伤停"
};

const completenessLabels: Record<FixtureContextSummaryDto["completeness"], string> = {
  full: "完整",
  partial: "部分可用",
  base_only: "仅基础信息"
};

export function MatchContextDrawer({ open, match, context, loading, onClose }: MatchContextDrawerProps) {
  const visibleDomains = context?.domains.filter((domain) => domain.domain !== "api_prediction") ?? [];

  return (
    <BottomDrawer open={open} title="预测数据" onClose={onClose}>
      {match ? (
        <div className="context-drawer-content">
          <div className="drawer-match-title">
            <span>{match.statusLabelZh}</span>
            <strong>
              {match.homeTeam.displayNameZh} vs {match.awayTeam.displayNameZh}
            </strong>
          </div>

          <div className="context-summary-bar">
            <span>{context ? completenessLabels[context.completeness] : "等待加载"}</span>
            {loading ? <span>刷新中</span> : null}
          </div>

          {loading && !context ? <p className="drawer-muted">正在加载预测数据...</p> : null}
          {!loading && !context ? <p className="drawer-muted">暂无预测数据缓存。</p> : null}

          {context ? (
            <div className="context-domain-list">
              {visibleDomains.map((domain) => (
                <article className={`context-domain status-${domain.status}`} key={domain.domain}>
                  <header>
                    <strong>{domainLabels[domain.domain]}</strong>
                    <span>{contextStatusLabels[domain.status]}</span>
                  </header>
                  <p>{domain.summary}</p>
                  {domain.error ? <small>{domain.error}</small> : null}
                  {domain.lastSyncedAt ? <time>{new Date(domain.lastSyncedAt).toLocaleString("zh-CN")}</time> : null}
                </article>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </BottomDrawer>
  );
}
