import { useMemo, useState } from "react";
import type {
  FixtureContextSummaryDto,
  MatchDto,
  MatchStatus,
  PredictionDataOptionsDto,
  PredictionRequestInputDto,
  PredictionRequestResponseDto,
  PredictionRunHistoryDto,
  PredictionRunLogDto,
  PredictionRunPredictionDto,
  PredictionRunStatusDto,
  PromptTemplateConfigDto
} from "@worldcup-ai-pk/shared";
import { MatchContextDrawer } from "../components/MatchContextDrawer";
import { BottomDrawer } from "../components/BottomDrawer";
import { PredictionRequestDrawer } from "../components/PredictionRequestDrawer";

interface FixturesPageProps {
  matches: MatchDto[];
  promptTemplates?: PromptTemplateConfigDto[];
  onLoadMatchContext?: (matchId: string) => Promise<FixtureContextSummaryDto>;
  onRefreshMatchContext?: (matchId: string, dataOptions: PredictionDataOptionsDto) => Promise<FixtureContextSummaryDto>;
  onRequestPrediction?: (match: MatchDto, input: PredictionRequestInputDto) => Promise<PredictionRequestResponseDto>;
  onLoadPredictionRunStatus?: (runId: string) => Promise<PredictionRunStatusDto>;
  onLoadPredictionHistory?: (matchId: string) => Promise<PredictionRunHistoryDto>;
  predictionPollIntervalMs?: number;
}

type FixtureTab = Extract<MatchStatus, "scheduled" | "live" | "finished">;
type PredictionFeedback = {
  message: string;
  tone: "info" | "error";
  logs: PredictionRunLogDto[];
  predictions: PredictionRunPredictionDto[];
};

type PredictionHistoryState = {
  match: MatchDto;
  loading: boolean;
  error: string | null;
  runs: PredictionRunStatusDto[];
};

const statusTabs: Array<{ status: FixtureTab; label: string }> = [
  { status: "scheduled", label: "未开始" },
  { status: "live", label: "进行中" },
  { status: "finished", label: "已结束" }
];

const defaultContextDataOptions: PredictionDataOptionsDto = {
  useOdds: true,
  useApiFootballPrediction: false,
  useHeadToHead: true,
  usePlayerLineupInjuries: true,
  useDongqiudiIntel: true,
  useSporttery: true
};

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

function getPredictionFeedback(response: PredictionRequestResponseDto | PredictionRunStatusDto): PredictionFeedback {
  switch (response.status) {
    case "scheduled":
      return { message: "预测已排程", tone: "info", logs: response.logs, predictions: response.predictions };
    case "running":
      return { message: "预测执行中", tone: "info", logs: response.logs, predictions: response.predictions };
    case "completed":
      return {
        message: response.predictionsCount > 0 ? `已完成 ${response.predictionsCount} 个模型预测` : response.message,
        tone: "info",
        logs: response.logs,
        predictions: response.predictions
      };
    case "failed":
      return { message: response.message || "预测失败", tone: "error", logs: response.logs, predictions: response.predictions };
    case "rate_limited":
      return { message: "30 分钟内已生成过预测", tone: "error", logs: response.logs, predictions: response.predictions };
    case "rejected":
      return { message: "当前比赛不可请求预测", tone: "error", logs: response.logs, predictions: response.predictions };
  }
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

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

const predictionResultLabels: Record<PredictionRunPredictionDto["predictedResult"], string> = {
  home: "主胜",
  draw: "平局",
  away: "客胜"
};

function formatPredictionScore(prediction: PredictionRunPredictionDto): string {
  return `${prediction.predictedHomeScore}-${prediction.predictedAwayScore}`;
}

function getPredictionResultText(prediction: PredictionRunPredictionDto): string {
  return predictionResultLabels[prediction.predictedResult];
}

function buildPredictionConsensus(predictions: PredictionRunPredictionDto[], failedCount: number) {
  const resultCounts = predictions.reduce(
    (counts, prediction) => {
      counts[prediction.predictedResult] += 1;
      return counts;
    },
    { home: 0, draw: 0, away: 0 } as Record<PredictionRunPredictionDto["predictedResult"], number>
  );
  const topResult = (Object.entries(resultCounts) as Array<[PredictionRunPredictionDto["predictedResult"], number]>).sort(
    (left, right) => right[1] - left[1]
  )[0];
  const scoreCounts = new Map<string, number>();

  for (const prediction of predictions) {
    const score = formatPredictionScore(prediction);
    scoreCounts.set(score, (scoreCounts.get(score) ?? 0) + 1);
  }

  const topScore = [...scoreCounts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? "未形成共识";

  return {
    successCount: predictions.length,
    failedCount,
    topResultText: topResult && topResult[1] > 0 ? predictionResultLabels[topResult[0]] : "未形成共识",
    topScore,
    resultDistributionText: `主胜 ${resultCounts.home} / 平 ${resultCounts.draw} / 客胜 ${resultCounts.away}`
  };
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

function MatchCard({
  match,
  feedback,
  isRequesting,
  onOpenPrediction,
  onOpenContext,
  onOpenHistory,
  onOpenReport
}: {
  match: MatchDto;
  feedback?: PredictionFeedback;
  isRequesting: boolean;
  onOpenPrediction: (match: MatchDto) => void;
  onOpenContext: (match: MatchDto) => void;
  onOpenHistory?: (match: MatchDto) => void;
  onOpenReport: (feedback: PredictionFeedback) => void;
}) {
  const hasHistory = match.hasAiPrediction || Boolean(feedback?.predictions.length);
  const failedPredictionCount = feedback?.logs.filter((log) => log.level === "error").length ?? 0;
  const consensus = feedback ? buildPredictionConsensus(feedback.predictions, failedPredictionCount) : null;

  return (
    <article className={`match-card match-card-shell status-${match.status}`}>
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
      <div className="match-status-block">
        <span>{getStageLabelZh(match.stage)}</span>
        <span>{match.statusLabelZh}</span>
        {match.status === "finished" || match.status === "live" ? <strong className="score-pill">{getScoreText(match)}</strong> : null}
      </div>
      <div className="match-action match-action-stack">
        {match.status === "scheduled" ? (
          <button disabled={!match.canRequestPrediction || isRequesting} type="button" onClick={() => onOpenPrediction(match)}>
            {isRequesting ? "请求中" : "预测"}
          </button>
        ) : null}
        <button type="button" className="secondary-action" onClick={() => onOpenContext(match)}>
          数据
        </button>
        {hasHistory && onOpenHistory ? (
          <button type="button" className="secondary-action" onClick={() => onOpenHistory(match)}>
            历史
          </button>
        ) : null}
      </div>
      {feedback ? (
        <div className="prediction-feedback-block">
          <span className={`prediction-feedback ${feedback.tone}`}>{feedback.message}</span>
          {feedback.predictions.length > 0 ? (
            <>
              <div className="prediction-consensus-summary">
                <span>{`综合观点：${consensus?.topResultText ?? "未形成共识"}`}</span>
                <span>{`参考比分：${consensus?.topScore ?? "未形成共识"}`}</span>
                <span>{consensus?.resultDistributionText}</span>
                <span>{`成功 ${consensus?.successCount ?? 0} / 失败 ${consensus?.failedCount ?? 0}`}</span>
              </div>
              <div className="table-scroll prediction-summary-table">
                <table>
                  <thead>
                    <tr>
                      <th>AI 模型</th>
                      <th>胜平负</th>
                      <th>比分</th>
                      <th>信心</th>
                      <th>胜负手</th>
                    </tr>
                  </thead>
                  <tbody>
                    {feedback.predictions.map((prediction) => (
                      <tr key={prediction.id}>
                        <td>{prediction.modelDisplayName}</td>
                        <td>{getPredictionResultText(prediction)}</td>
                        <td>{formatPredictionScore(prediction)}</td>
                        <td>{`${Math.round(prediction.confidence * 100)}%`}</td>
                        <td>{prediction.shortReason || prediction.analysisReport.slice(0, 80) || "未给出"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button type="button" className="secondary-action" onClick={() => onOpenReport(feedback)}>
                查看报告
              </button>
            </>
          ) : (
            <p className="muted">AI 正在生成预测，完成后这里会汇总各模型观点。</p>
          )}
        </div>
      ) : null}
    </article>
  );
}

function FixtureDateGroups({
  groups,
  predictionFeedbackByMatchId,
  requestingMatchIds,
  onOpenPrediction,
  onOpenContext,
  onOpenHistory,
  onOpenReport
}: {
  groups: Array<{ key: string; label: string; matches: MatchDto[] }>;
  predictionFeedbackByMatchId: Record<string, PredictionFeedback>;
  requestingMatchIds: Set<string>;
  onOpenPrediction: (match: MatchDto) => void;
  onOpenContext: (match: MatchDto) => void;
  onOpenHistory?: (match: MatchDto) => void;
  onOpenReport: (feedback: PredictionFeedback) => void;
}) {
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
              <MatchCard
                key={match.id}
                match={match}
                feedback={predictionFeedbackByMatchId[match.id]}
                isRequesting={requestingMatchIds.has(match.id)}
                onOpenPrediction={onOpenPrediction}
                onOpenContext={onOpenContext}
                onOpenHistory={onOpenHistory}
                onOpenReport={onOpenReport}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function FixturesPage({
  matches,
  promptTemplates = [],
  onLoadMatchContext,
  onRefreshMatchContext,
  onRequestPrediction,
  onLoadPredictionRunStatus,
  onLoadPredictionHistory,
  predictionPollIntervalMs = 1500
}: FixturesPageProps) {
  const [activeStatus, setActiveStatus] = useState<FixtureTab>("scheduled");
  const [searchText, setSearchText] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [scheduledFoldOpen, setScheduledFoldOpen] = useState(false);
  const [predictionFeedbackByMatchId, setPredictionFeedbackByMatchId] = useState<Record<string, PredictionFeedback>>({});
  const [requestingMatchIds, setRequestingMatchIds] = useState<Set<string>>(() => new Set());
  const [activePredictionMatch, setActivePredictionMatch] = useState<MatchDto | null>(null);
  const [activePredictionReport, setActivePredictionReport] = useState<PredictionRunPredictionDto | null>(null);
  const [activePredictionHistory, setActivePredictionHistory] = useState<PredictionHistoryState | null>(null);
  const [activeContextMatch, setActiveContextMatch] = useState<MatchDto | null>(null);
  const [contextByMatchId, setContextByMatchId] = useState<Record<string, FixtureContextSummaryDto>>({});
  const [contextLoadingMatchIds, setContextLoadingMatchIds] = useState<Set<string>>(() => new Set());

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

  async function handlePredictionSubmit(input: PredictionRequestInputDto) {
    if (!onRequestPrediction || !activePredictionMatch) {
      return;
    }

    const match = activePredictionMatch;
    setRequestingMatchIds((currentIds) => new Set(currentIds).add(match.id));

    try {
      const response = await onRequestPrediction(match, input);
      setPredictionFeedbackByMatchId((currentFeedback) => ({
        ...currentFeedback,
        [match.id]: getPredictionFeedback(response)
      }));
      if (response.context) {
        setContextByMatchId((currentContexts) => ({ ...currentContexts, [match.id]: response.context as FixtureContextSummaryDto }));
      }
      setActivePredictionMatch(null);

      if (response.status === "running" && response.runId && onLoadPredictionRunStatus) {
        let latestStatus: PredictionRunStatusDto | null = null;
        for (let attempt = 0; attempt < 120; attempt += 1) {
          await wait(predictionPollIntervalMs);
          latestStatus = await onLoadPredictionRunStatus(response.runId);
          setPredictionFeedbackByMatchId((currentFeedback) => ({
            ...currentFeedback,
            [match.id]: getPredictionFeedback(latestStatus as PredictionRunStatusDto)
          }));
          if (latestStatus.status !== "running") {
            break;
          }
        }
      }
    } catch {
      setPredictionFeedbackByMatchId((currentFeedback) => ({
        ...currentFeedback,
        [match.id]: {
          message: "预测请求失败，请稍后重试",
          tone: "error",
          logs: [],
          predictions: []
        }
      }));
    } finally {
      setRequestingMatchIds((currentIds) => {
        const nextIds = new Set(currentIds);
        nextIds.delete(match.id);
        return nextIds;
      });
    }
  }

  async function loadContext(match: MatchDto) {
    if (!onLoadMatchContext) {
      return;
    }

    setContextLoadingMatchIds((currentIds) => new Set(currentIds).add(match.id));
    try {
      const context = await onLoadMatchContext(match.id);
      setContextByMatchId((currentContexts) => ({ ...currentContexts, [match.id]: context }));
    } finally {
      setContextLoadingMatchIds((currentIds) => {
        const nextIds = new Set(currentIds);
        nextIds.delete(match.id);
        return nextIds;
      });
    }
  }

  function handleOpenContext(match: MatchDto) {
    setActiveContextMatch(match);
    if (onRefreshMatchContext) {
      void handleRefreshContextForMatch(match);
    } else {
      void loadContext(match);
    }
  }

  async function handleRefreshContextForMatch(match: MatchDto) {
    if (!onRefreshMatchContext) {
      return;
    }

    setContextLoadingMatchIds((currentIds) => new Set(currentIds).add(match.id));
    try {
      const context = await onRefreshMatchContext(match.id, defaultContextDataOptions);
      setContextByMatchId((currentContexts) => ({ ...currentContexts, [match.id]: context }));
    } finally {
      setContextLoadingMatchIds((currentIds) => {
        const nextIds = new Set(currentIds);
        nextIds.delete(match.id);
        return nextIds;
      });
    }
  }

  async function handleOpenPredictionHistory(match: MatchDto) {
    if (!onLoadPredictionHistory) {
      return;
    }

    setActivePredictionHistory({ match, loading: true, error: null, runs: [] });
    try {
      const history = await onLoadPredictionHistory(match.id);
      setActivePredictionHistory({ match, loading: false, error: null, runs: history.runs });
    } catch {
      setActivePredictionHistory({ match, loading: false, error: "历史记录加载失败，请稍后重试", runs: [] });
    }
  }

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

      <FixtureDateGroups
        groups={dateGroups}
        predictionFeedbackByMatchId={predictionFeedbackByMatchId}
        requestingMatchIds={requestingMatchIds}
        onOpenPrediction={setActivePredictionMatch}
        onOpenContext={handleOpenContext}
        onOpenHistory={onLoadPredictionHistory ? handleOpenPredictionHistory : undefined}
        onOpenReport={(feedback) => setActivePredictionReport(feedback.predictions[0] ?? null)}
      />

      {activeStatus === "scheduled" && foldedMatches.length > 0 ? (
        <section className="folded-fixtures">
          <button type="button" onClick={() => setScheduledFoldOpen((isOpen) => !isOpen)}>
            {`其余 ${foldedMatches.length} 场未开始比赛`}
          </button>
          {scheduledFoldOpen ? (
            <FixtureDateGroups
              groups={foldedDateGroups}
              predictionFeedbackByMatchId={predictionFeedbackByMatchId}
              requestingMatchIds={requestingMatchIds}
              onOpenPrediction={setActivePredictionMatch}
              onOpenContext={handleOpenContext}
              onOpenHistory={onLoadPredictionHistory ? handleOpenPredictionHistory : undefined}
              onOpenReport={(feedback) => setActivePredictionReport(feedback.predictions[0] ?? null)}
            />
          ) : null}
        </section>
      ) : null}

      <PredictionRequestDrawer
        open={Boolean(activePredictionMatch)}
        match={activePredictionMatch}
        promptTemplates={promptTemplates}
        submitting={activePredictionMatch ? requestingMatchIds.has(activePredictionMatch.id) : false}
        onClose={() => setActivePredictionMatch(null)}
        onSubmit={handlePredictionSubmit}
      />
      <MatchContextDrawer
        open={Boolean(activeContextMatch)}
        match={activeContextMatch}
        context={activeContextMatch ? contextByMatchId[activeContextMatch.id] ?? null : null}
        loading={activeContextMatch ? contextLoadingMatchIds.has(activeContextMatch.id) : false}
        onClose={() => setActiveContextMatch(null)}
      />
      <BottomDrawer open={Boolean(activePredictionHistory)} title="历史预测记录" size="wide" onClose={() => setActivePredictionHistory(null)}>
        {activePredictionHistory ? (
          <div className="prediction-history-list">
            <p>
              {activePredictionHistory.match.homeTeam.displayNameZh} vs {activePredictionHistory.match.awayTeam.displayNameZh}
            </p>
            {activePredictionHistory.loading ? <p className="status-line">正在加载历史记录...</p> : null}
            {activePredictionHistory.error ? <p className="status-line error">{activePredictionHistory.error}</p> : null}
            {!activePredictionHistory.loading && !activePredictionHistory.error && activePredictionHistory.runs.length === 0 ? (
              <p className="empty-state">暂无历史预测记录</p>
            ) : null}
            {!activePredictionHistory.loading && !activePredictionHistory.error
              ? activePredictionHistory.runs.map((run) => {
                  const failedPredictionCount = run.logs.filter((log) => log.level === "error").length;
                  const consensus = buildPredictionConsensus(run.predictions, failedPredictionCount);

                  return (
                    <article className="prediction-history-card" key={run.runId}>
                      <header>
                        <div>
                          <h3>{run.message}</h3>
                          <span>{run.status === "running" ? "执行中" : run.status === "failed" ? "执行失败" : "已完成"}</span>
                        </div>
                        <strong>{run.predictionsCount} 个模型结果</strong>
                      </header>
                      <div className="prediction-consensus-summary history-summary">
                        <span>{`综合观点：${consensus.topResultText}`}</span>
                        <span>{`参考比分：${consensus.topScore}`}</span>
                        <span>{consensus.resultDistributionText}</span>
                        <span>{`成功 ${consensus.successCount} / 失败 ${consensus.failedCount}`}</span>
                      </div>
                      {run.predictions.length > 0 ? (
                        <div className="table-scroll prediction-summary-table history-prediction-table">
                          <table>
                            <thead>
                              <tr>
                                <th>AI 模型</th>
                                <th>胜平负</th>
                                <th>比分</th>
                                <th>信心</th>
                                <th>胜负手</th>
                                <th>报告</th>
                              </tr>
                            </thead>
                            <tbody>
                              {run.predictions.map((prediction) => (
                                <tr key={prediction.id}>
                                  <td>{prediction.modelDisplayName}</td>
                                  <td>{getPredictionResultText(prediction)}</td>
                                  <td>{formatPredictionScore(prediction)}</td>
                                  <td>{`${Math.round(prediction.confidence * 100)}%`}</td>
                                  <td>{prediction.shortReason || prediction.analysisReport.slice(0, 80) || "未给出"}</td>
                                  <td>
                                    <button type="button" className="table-action" onClick={() => setActivePredictionReport(prediction)}>
                                      查看
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="muted">本次预测还没有可展示的模型结果。</p>
                      )}
                    </article>
                  );
                })
              : null}
          </div>
        ) : null}
      </BottomDrawer>
      <BottomDrawer open={Boolean(activePredictionReport)} title="预测分析报告" onClose={() => setActivePredictionReport(null)}>
        {activePredictionReport ? (
          <div className="prediction-report-list">
            <article className="prediction-report-card" key={activePredictionReport.id}>
              <header>
                <h3>{activePredictionReport.modelDisplayName}</h3>
                <strong>
                  {activePredictionReport.predictedHomeScore} - {activePredictionReport.predictedAwayScore}
                </strong>
              </header>
              <p>置信度：{activePredictionReport.confidence}</p>
              <p>{activePredictionReport.shortReason}</p>
              <p>市场背景：{activePredictionReport.oddsInterpretation}</p>
              <div>
                <span>关键因素</span>
                <ul>
                  {activePredictionReport.keyFactors.map((factor) => (
                    <li key={factor}>{factor}</li>
                  ))}
                </ul>
              </div>
              <div>
                <span>风险点</span>
                <ul>
                  {activePredictionReport.riskPoints.map((riskPoint) => (
                    <li key={riskPoint}>{riskPoint}</li>
                  ))}
                </ul>
              </div>
              <p>{activePredictionReport.analysisReport}</p>
            </article>
          </div>
        ) : null}
      </BottomDrawer>
    </section>
  );
}
