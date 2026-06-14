import type { FixtureContextDomainStatus, FixtureContextSummaryDto, MatchDto } from "@worldcup-ai-pk/shared";
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

const completenessLabels: Record<FixtureContextSummaryDto["completeness"], string> = {
  full: "完整",
  partial: "部分可用",
  base_only: "仅基础信息"
};

function parseSportterySummarySections(summary: string): Array<{ label: string; value: string }> {
  return summary
    .split(/\n|；(?=(?:官方指数|历史交锋|积分形势|近期状态|特征对比|伤停影响)：)/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separatorIndex = part.indexOf("：");
      return separatorIndex > -1
        ? { label: part.slice(0, separatorIndex), value: part.slice(separatorIndex + 1) }
        : { label: "情报摘要", value: part };
    });
}

export function MatchContextDrawer({ open, match, context, loading, onClose }: MatchContextDrawerProps) {
  const sportteryDomain = context?.domains.find((domain) => domain.domain === "sporttery") ?? null;
  const sportterySections = sportteryDomain ? parseSportterySummarySections(sportteryDomain.summary) : [];

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
              {sportteryDomain ? (
                <article className={`context-domain sporttery-context-domain status-${sportteryDomain.status}`}>
                  <header>
                    <strong>赛前情报</strong>
                    <span>{contextStatusLabels[sportteryDomain.status]}</span>
                  </header>
                  {sportterySections.length > 0 ? (
                    <div className="sporttery-section-list">
                      {sportterySections.map((section) => (
                        <div className="sporttery-section-item" key={`${section.label}-${section.value}`}>
                          <strong>{section.label}</strong>
                          <p>{section.value}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p>{sportteryDomain.summary}</p>
                  )}
                  {sportteryDomain.error ? <small>{sportteryDomain.error}</small> : null}
                  {sportteryDomain.lastSyncedAt ? <time>{new Date(sportteryDomain.lastSyncedAt).toLocaleString("zh-CN")}</time> : null}
                </article>
              ) : (
                <article className="context-domain status-unavailable">
                  <header>
                    <strong>赛前情报</strong>
                    <span>未获取</span>
                  </header>
                  <p>暂无体彩赛前情报。</p>
                </article>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </BottomDrawer>
  );
}
