import { useMemo, useState } from "react";
import type { MatchDto, MatchStatus } from "@worldcup-ai-pk/shared";

interface FixturesPageProps {
  matches: MatchDto[];
}

type FixtureTab = Extract<MatchStatus, "scheduled" | "live" | "finished">;

const statusTabs: Array<{ status: FixtureTab; label: string }> = [
  { status: "scheduled", label: "未开始" },
  { status: "live", label: "进行中" },
  { status: "finished", label: "已结束" }
];

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "long",
  day: "numeric",
  weekday: "long"
});

const timeFormatter = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit"
});

function getScoreText(match: MatchDto): string {
  if (match.homeScore === null || match.awayScore === null) {
    return "比分待同步";
  }

  return `${match.homeScore} - ${match.awayScore}`;
}

function getStageLabelZh(stage: string): string {
  const groupStageMatch = /^Group Stage - (\d+)$/.exec(stage);
  if (groupStageMatch) {
    return `小组赛第 ${groupStageMatch[1]} 轮`;
  }

  return stage;
}

function countByStatus(matches: MatchDto[], status: FixtureTab): number {
  return matches.filter((match) => match.status === status).length;
}

function getDateKey(match: MatchDto): string {
  return getLocalDateKey(new Date(match.kickoffAt));
}

function getDateLabel(match: MatchDto): string {
  return dateFormatter.format(new Date(match.kickoffAt));
}

function getLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function getUpcomingDateKeys(now = new Date()): Set<string> {
  return new Set([0, 1, 2].map((offset) => getLocalDateKey(addDays(now, offset))));
}

function includesSearchText(match: MatchDto, searchText: string): boolean {
  const normalizedSearch = searchText.trim().toLowerCase();

  if (!normalizedSearch) {
    return true;
  }

  return [
    match.homeTeam.displayNameZh,
    match.homeTeam.name,
    match.awayTeam.displayNameZh,
    match.awayTeam.name
  ].some((value) => value.toLowerCase().includes(normalizedSearch));
}

function groupMatchesByDate(matches: MatchDto[]): Array<{ key: string; label: string; matches: MatchDto[] }> {
  const groups = new Map<string, { key: string; label: string; matches: MatchDto[] }>();

  for (const match of matches) {
    const key = getDateKey(match);
    const group = groups.get(key) ?? { key, label: getDateLabel(match), matches: [] };
    group.matches.push(match);
    groups.set(key, group);
  }

  return Array.from(groups.values());
}

function MatchCard({ match }: { match: MatchDto }) {
  return (
    <article className={`match-card status-${match.status}`}>
      <div className="match-time-block">
        <time>{timeFormatter.format(new Date(match.kickoffAt))}</time>
        <span>{match.venue ?? "场馆待同步"}</span>
      </div>
      <div className="match-main">
        <div className="team-line">
          {match.homeTeam.logoUrl ? <img alt="" src={match.homeTeam.logoUrl} /> : <span className="team-logo-fallback" />}
          <strong>{match.homeTeam.displayNameZh}</strong>
          <small>{match.homeTeam.name}</small>
        </div>
        <div className="team-line">
          {match.awayTeam.logoUrl ? <img alt="" src={match.awayTeam.logoUrl} /> : <span className="team-logo-fallback" />}
          <strong>{match.awayTeam.displayNameZh}</strong>
          <small>{match.awayTeam.name}</small>
        </div>
      </div>
      <div className="match-meta">
        <span>{getStageLabelZh(match.stage)}</span>
        <span>{match.statusLabelZh}</span>
      </div>
      <div className="match-action">
        {match.status === "finished" || match.status === "live" ? <strong className="score-pill">{getScoreText(match)}</strong> : null}
        {match.status === "scheduled" ? (
          <button disabled={!match.canRequestPrediction} type="button">
            请求预测
          </button>
        ) : null}
      </div>
    </article>
  );
}

function FixtureDateGroups({ groups }: { groups: Array<{ key: string; label: string; matches: MatchDto[] }> }) {
  return (
    <div className="fixture-date-groups">
      {groups.map((group) => (
        <section className="fixture-date-group" key={group.key}>
          <header>
            <h3>{group.label}</h3>
            <span>{group.matches.length} 场</span>
          </header>
          <div className="match-card-list">
            {group.matches.map((match) => (
              <MatchCard key={match.id} match={match} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function FixturesPage({ matches }: FixturesPageProps) {
  const [activeStatus, setActiveStatus] = useState<FixtureTab>("scheduled");
  const [searchText, setSearchText] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [scheduledFoldOpen, setScheduledFoldOpen] = useState(false);

  const stages = useMemo(() => Array.from(new Set(matches.map((match) => match.stage))).sort(), [matches]);
  const filteredMatches = useMemo(
    () =>
      matches.filter((match) => {
        const statusMatches = match.status === activeStatus;
        const stageMatches = stageFilter === "all" || match.stage === stageFilter;
        return statusMatches && stageMatches && includesSearchText(match, searchText);
      }),
    [activeStatus, matches, searchText, stageFilter]
  );
  const scheduledDateKeys = useMemo(() => getUpcomingDateKeys(), []);
  const primaryMatches = useMemo(
    () => (activeStatus === "scheduled" ? filteredMatches.filter((match) => scheduledDateKeys.has(getDateKey(match))) : filteredMatches),
    [activeStatus, filteredMatches, scheduledDateKeys]
  );
  const foldedMatches = useMemo(
    () => (activeStatus === "scheduled" ? filteredMatches.filter((match) => !scheduledDateKeys.has(getDateKey(match))) : []),
    [activeStatus, filteredMatches, scheduledDateKeys]
  );
  const dateGroups = useMemo(() => groupMatchesByDate(primaryMatches), [primaryMatches]);
  const foldedDateGroups = useMemo(() => groupMatchesByDate(foldedMatches), [foldedMatches]);
  const latestSyncHint = matches.length > 0 ? `${matches.length} 场比赛已载入` : "等待同步赛程数据";

  return (
    <section id="fixtures" className="page-section fixtures-console">
      <div className="fixtures-heading">
        <div>
          <p className="eyebrow">World Cup Match Console</p>
          <h2>赛程控制台</h2>
        </div>
        <span className="sync-chip">{latestSyncHint}</span>
      </div>

      <div className="fixture-metrics" aria-label="赛程统计">
        <div>
          <span>全部</span>
          <strong>{matches.length}</strong>
        </div>
        <div>
          <span>未开始</span>
          <strong>{countByStatus(matches, "scheduled")}</strong>
        </div>
        <div>
          <span>进行中</span>
          <strong>{countByStatus(matches, "live")}</strong>
        </div>
        <div>
          <span>已结束</span>
          <strong>{countByStatus(matches, "finished")}</strong>
        </div>
      </div>

      <div className="status-tabs" aria-label="比赛状态筛选">
        {statusTabs.map((tab) => (
          <button
            aria-label={tab.label}
            className={activeStatus === tab.status ? "active" : ""}
            key={tab.status}
            type="button"
            onClick={() => setActiveStatus(tab.status)}
          >
            <span>{tab.label}</span>
            <strong aria-hidden="true">{countByStatus(matches, tab.status)}</strong>
          </button>
        ))}
      </div>

      <div className="fixture-filters">
        <label>
          <span>搜索球队</span>
          <input
            type="search"
            value={searchText}
            placeholder="中文名或原始名"
            onChange={(event) => setSearchText(event.target.value)}
          />
        </label>
        <label>
          <span>轮次</span>
          <select value={stageFilter} onChange={(event) => setStageFilter(event.target.value)}>
            <option value="all">全部轮次</option>
            {stages.map((stage) => (
              <option key={stage} value={stage}>
                {getStageLabelZh(stage)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {matches.length === 0 ? <p className="empty-state">暂无赛程数据。配置 API-Football key 并同步后会显示在这里。</p> : null}
      {matches.length > 0 && dateGroups.length === 0 && foldedMatches.length === 0 ? <p className="empty-state">当前筛选下暂无比赛。</p> : null}

      <FixtureDateGroups groups={dateGroups} />

      {activeStatus === "scheduled" && foldedMatches.length > 0 ? (
        <section className="folded-fixtures">
          <button type="button" onClick={() => setScheduledFoldOpen((isOpen) => !isOpen)}>
            {`其余 ${foldedMatches.length} 场未开始比赛`}
          </button>
          {scheduledFoldOpen ? <FixtureDateGroups groups={foldedDateGroups} /> : null}
        </section>
      ) : null}
    </section>
  );
}
