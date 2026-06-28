import { useEffect, useMemo, useRef, useState } from "react";
import type {
  BettingRiskLevel,
  FixtureContextSummaryDto,
  MatchDto,
  MatchStatus,
  ParlayCombinationRunDto,
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
  onCreateParlayCombination?: (input: { matchIds: string[]; riskLevel: BettingRiskLevel; stakeUnits: number }) => Promise<ParlayCombinationRunDto>;
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
  useApiFootballPrediction: true,
  useHeadToHead: true,
  usePlayerLineupInjuries: true,
  useDongqiudiIntel: true,
  useSporttery: true,
  useTeamProfile: true
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

function getRiskLabel(riskLevel: "low" | "medium" | "high") {
  if (riskLevel === "low") return "低风险";
  if (riskLevel === "high") return "高风险";
  return "中风险";
}

function getPrimaryLeg(prediction: PredictionRunPredictionDto) {
  return prediction.singleCombination?.primaryPlan.legs[0] ?? null;
}

function getLatestSingleCombination(feedback?: PredictionFeedback) {
  return feedback?.predictions.find((prediction) => getPrimaryLeg(prediction))?.singleCombination ?? null;
}

function getPrimaryLegText(prediction: PredictionRunPredictionDto): string {
  const leg = getPrimaryLeg(prediction);
  if (!leg) {
    return "未生成";
  }
  return `${leg.poolCode} · ${leg.selectionLabel}`;
}

function getPredictionStatusText(prediction: PredictionRunPredictionDto): string {
  return getPrimaryLeg(prediction) ? "已生成组合" : "仅赛果";
}

function normalizeParlayStakeUnits(stakeUnits: number): number {
  return Math.max(1, Math.floor(Number.isFinite(stakeUnits) ? stakeUnits : 1));
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
  onOpenReport,
  selectedForParlay,
  onToggleParlay,
  canSelectParlay,
  selectableForBatch,
  selectedForBatch,
  onToggleBatchSelect
}: {
  match: MatchDto;
  feedback?: PredictionFeedback;
  isRequesting: boolean;
  onOpenPrediction: (match: MatchDto) => void;
  onOpenContext: (match: MatchDto) => void;
  onOpenHistory?: (match: MatchDto) => void;
  onOpenReport: (feedback: PredictionFeedback) => void;
  selectedForParlay: boolean;
  onToggleParlay: (matchId: string) => void;
  canSelectParlay: boolean;
  selectableForBatch: boolean;
  selectedForBatch: boolean;
  onToggleBatchSelect?: (matchId: string) => void;
}) {
  const hasHistory = match.hasAiPrediction || Boolean(feedback?.predictions.length);
  const failedPredictionCount = feedback?.logs.filter((log) => log.level === "error").length ?? 0;
  const consensus = feedback ? buildPredictionConsensus(feedback.predictions, failedPredictionCount) : null;
  const latestSingleCombination = getLatestSingleCombination(feedback);

  return (
    <article className={`match-card match-card-shell status-${match.status} ${selectableForBatch ? "match-card-selectable" : ""} ${selectedForBatch ? "match-card-selected" : ""}`}>
      {selectableForBatch ? (
        <button
          aria-label={selectedForBatch ? `取消选择 ${match.homeTeam.displayNameZh} vs ${match.awayTeam.displayNameZh}` : `选择 ${match.homeTeam.displayNameZh} vs ${match.awayTeam.displayNameZh} 进行批量预测`}
          className={`batch-select-checkbox ${selectedForBatch ? "checked" : ""}`}
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleBatchSelect?.(match.id);
          }}
        />
      ) : null}
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
          <button
            className="app-button app-button-primary"
            disabled={!match.canRequestPrediction || isRequesting}
            type="button"
            onClick={() => onOpenPrediction(match)}
          >
            {isRequesting ? "请求中" : "预测"}
          </button>
        ) : null}
        <button type="button" className="app-button app-button-secondary" onClick={() => onOpenContext(match)}>
          数据
        </button>
        {hasHistory && onOpenHistory ? (
          <button type="button" className="app-button app-button-secondary" onClick={() => onOpenHistory(match)}>
            历史
          </button>
        ) : null}
      </div>
      {feedback ? (
        <div className="prediction-feedback-block">
          <span className={`prediction-feedback ${feedback.tone}`}>{feedback.message}</span>
          {feedback.predictions.length > 0 ? (
            <>
              {latestSingleCombination ? (
                <div className="match-betting-summary">
                  <span>最新组合方案</span>
                  <strong>{latestSingleCombination.primaryPlan.planName}</strong>
                  <small>
                    {getRiskLabel(latestSingleCombination.primaryPlan.riskLevel)} · {latestSingleCombination.primaryPlan.stakeUnits} 注
                  </small>
                  <dl className="betting-plan-grid">
                    <div>
                      <dt>玩法</dt>
                      <dd>{latestSingleCombination.primaryPlan.legs[0]?.poolCode ?? "未生成"}</dd>
                    </div>
                    <div>
                      <dt>选择</dt>
                      <dd>{latestSingleCombination.primaryPlan.legs[0]?.selectionLabel ?? "未生成"}</dd>
                    </div>
                    <div>
                      <dt>触发条件</dt>
                      <dd>{latestSingleCombination.primaryPlan.expectedScenario}</dd>
                    </div>
                    <div>
                      <dt>规避项</dt>
                      <dd>{latestSingleCombination.primaryPlan.avoidReason ?? "暂无"}</dd>
                    </div>
                  </dl>
                  <button
                    type="button"
                    className={`app-button app-button-secondary parlay-toggle ${selectedForParlay ? "selected" : ""}`}
                    disabled={!canSelectParlay}
                    onClick={() => onToggleParlay(match.id)}
                  >
                    {selectedForParlay ? "已加入" : "加入串关"}
                  </button>
                </div>
              ) : null}
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
                      <th>主方案</th>
                      <th>状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {feedback.predictions.map((prediction) => (
                      <tr key={prediction.id}>
                        <td>{prediction.modelDisplayName}</td>
                        <td>{getPredictionResultText(prediction)}</td>
                        <td>{formatPredictionScore(prediction)}</td>
                        <td>{`${Math.round(prediction.confidence * 100)}%`}</td>
                        <td>{getPrimaryLegText(prediction)}</td>
                        <td>{getPredictionStatusText(prediction)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button type="button" className="app-button app-button-secondary" onClick={() => onOpenReport(feedback)}>
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
  onOpenReport,
  selectedParlayMatchIds,
  onToggleParlay,
  canSelectParlay,
  batchSelectedMatchIds,
  onToggleBatchSelect
}: {
  groups: Array<{ key: string; label: string; matches: MatchDto[] }>;
  predictionFeedbackByMatchId: Record<string, PredictionFeedback>;
  requestingMatchIds: Set<string>;
  onOpenPrediction: (match: MatchDto) => void;
  onOpenContext: (match: MatchDto) => void;
  onOpenHistory?: (match: MatchDto) => void;
  onOpenReport: (feedback: PredictionFeedback) => void;
  selectedParlayMatchIds: Set<string>;
  onToggleParlay: (matchId: string) => void;
  canSelectParlay: boolean;
  batchSelectedMatchIds: Set<string>;
  onToggleBatchSelect: (matchId: string) => void;
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
                selectedForParlay={selectedParlayMatchIds.has(match.id)}
                onToggleParlay={onToggleParlay}
                canSelectParlay={canSelectParlay}
                selectableForBatch={match.status === "scheduled" && match.canRequestPrediction}
                selectedForBatch={batchSelectedMatchIds.has(match.id)}
                onToggleBatchSelect={onToggleBatchSelect}
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
  onCreateParlayCombination,
  predictionPollIntervalMs = 1500
}: FixturesPageProps) {
  const [activeStatus, setActiveStatus] = useState<FixtureTab>("scheduled");
  const [searchText, setSearchText] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [scheduledFoldOpen, setScheduledFoldOpen] = useState(false);
  const [predictionFeedbackByMatchId, setPredictionFeedbackByMatchId] = useState<Record<string, PredictionFeedback>>({});
  const [requestingMatchIds, setRequestingMatchIds] = useState<Set<string>>(() => new Set());
  const [loadedHistoryMatchIds, setLoadedHistoryMatchIds] = useState<Set<string>>(() => new Set());
  const [activePredictionMatch, setActivePredictionMatch] = useState<MatchDto | null>(null);
  const [activePredictionReport, setActivePredictionReport] = useState<PredictionRunPredictionDto | null>(null);
  const [activePredictionHistory, setActivePredictionHistory] = useState<PredictionHistoryState | null>(null);
  const [activeContextMatch, setActiveContextMatch] = useState<MatchDto | null>(null);
  const [contextByMatchId, setContextByMatchId] = useState<Record<string, FixtureContextSummaryDto>>({});
  const [contextLoadingMatchIds, setContextLoadingMatchIds] = useState<Set<string>>(() => new Set());
  const [selectedParlayMatchIds, setSelectedParlayMatchIds] = useState<Set<string>>(() => new Set());
  const [parlayRiskLevel, setParlayRiskLevel] = useState<BettingRiskLevel>("medium");
  const [parlayStakeUnits, setParlayStakeUnits] = useState(2);
  const [parlayGenerating, setParlayGenerating] = useState(false);
  const [parlayResult, setParlayResult] = useState<ParlayCombinationRunDto | null>(null);
  const [parlayError, setParlayError] = useState<string | null>(null);
  const [batchPredicting, setBatchPredicting] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);
  const [batchMessage, setBatchMessage] = useState<string | null>(null);
  const [batchSelectedMatchIds, setBatchSelectedMatchIds] = useState<Set<string>>(() => new Set());
  const [batchConfigOpen, setBatchConfigOpen] = useState(false);
  const [batchTaskTypes, setBatchTaskTypes] = useState<PredictionRequestInputDto["taskTypes"]>(["match_analysis", "scoreline", "single_bet_combo"]);
  const [batchDataOptions, setBatchDataOptions] = useState<PredictionDataOptionsDto>(defaultContextDataOptions);
  const [batchOutputStyle, setBatchOutputStyle] = useState<PredictionRequestInputDto["outputStyle"]>("concise");

  const batchMode = batchSelectedMatchIds.size > 0;
  const selectedBatchMatches = useMemo(
    () => matches.filter((match) => batchSelectedMatchIds.has(match.id)),
    [matches, batchSelectedMatchIds]
  );
  const selectedParlayMatchIdsRef = useRef(selectedParlayMatchIds);
  const parlayRequestVersionRef = useRef(0);

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
  const displayedMatches = useMemo(() => {
    if (activeStatus !== "finished") return primaryMatches;
    return [...primaryMatches].sort((a, b) => new Date(b.kickoffAt).getTime() - new Date(a.kickoffAt).getTime());
  }, [activeStatus, primaryMatches]);
  const dateGroups = useMemo(() => groupMatchesByDate(displayedMatches), [displayedMatches]);
  const foldedDateGroups = useMemo(() => groupMatchesByDate(foldedMatches), [foldedMatches]);
  const parlayReadyMatchIds = useMemo(
    () =>
      matches
        .filter((match) => Boolean(getLatestSingleCombination(predictionFeedbackByMatchId[match.id])))
        .map((match) => match.id),
    [matches, predictionFeedbackByMatchId]
  );
  const selectedParlayMatches = useMemo(
    () => parlayReadyMatchIds.filter((matchId) => selectedParlayMatchIds.has(matchId)),
    [parlayReadyMatchIds, selectedParlayMatchIds]
  );
  const canCreateParlay = selectedParlayMatches.length >= 2 && Boolean(onCreateParlayCombination);
  const latestSyncHint = matches.length > 0 ? `${matches.length} 场比赛已载入` : "等待同步赛程数据";

  useEffect(() => {
    const currentMatchIds = new Set(matches.map((match) => match.id));
    const currentSelectedIds = selectedParlayMatchIdsRef.current;
    const nextSelectedIds = new Set([...currentSelectedIds].filter((matchId) => currentMatchIds.has(matchId)));

    if (nextSelectedIds.size === currentSelectedIds.size) {
      return;
    }

    invalidateParlayRequest();
    selectedParlayMatchIdsRef.current = nextSelectedIds;
    setSelectedParlayMatchIds(nextSelectedIds);
  }, [matches]);

  useEffect(() => {
    if (!onLoadPredictionHistory) {
      return;
    }

    const matchesToLoad = matches.filter((match) => match.hasAiPrediction && !loadedHistoryMatchIds.has(match.id));
    if (matchesToLoad.length === 0) {
      return;
    }

    let cancelled = false;

    for (const match of matchesToLoad) {
      void onLoadPredictionHistory(match.id)
        .then((history) => {
          if (cancelled) {
            return;
          }
          const latestRun = history.runs.find((run) => run.predictions.length > 0);
          if (!latestRun) {
            return;
          }
          setPredictionFeedbackByMatchId((currentFeedback) => ({
            ...currentFeedback,
            [match.id]: getPredictionFeedback(latestRun)
          }));
        })
        .catch(() => undefined)
        .finally(() => {
          if (cancelled) {
            return;
          }
          setLoadedHistoryMatchIds((currentIds) => new Set(currentIds).add(match.id));
        });
    }

    return () => {
      cancelled = true;
    };
  }, [loadedHistoryMatchIds, matches, onLoadPredictionHistory]);

  async function predictSingleMatch(match: MatchDto, input: PredictionRequestInputDto): Promise<void> {
    if (!onRequestPrediction) {
      return;
    }

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

  async function handlePredictionSubmit(input: PredictionRequestInputDto) {
    if (!activePredictionMatch) {
      return;
    }

    const match = activePredictionMatch;
    await predictSingleMatch(match, input);
    setActivePredictionMatch(null);
  }

  function toggleBatchTaskType(value: PredictionRequestInputDto["taskTypes"][number]) {
    setBatchTaskTypes((currentTypes) => {
      if (currentTypes.includes(value)) {
        const nextTypes = currentTypes.filter((type) => type !== value);
        return nextTypes.length > 0 ? nextTypes : currentTypes;
      }
      return [...currentTypes, value];
    });
  }

  const batchTaskOptions: Array<{ value: PredictionRequestInputDto["taskTypes"][number]; label: string }> = [
    { value: "match_analysis", label: "赛果" },
    { value: "scoreline", label: "比分" },
    { value: "single_bet_combo", label: "单场组合" }
  ];

  async function handlePredictTomorrow() {
    if (!onRequestPrediction || batchPredicting) {
      return;
    }

    const tomorrowKey = getLocalDateKey(addDays(new Date(), 1));
    const tomorrowMatches = matches.filter(
      (match) => match.status === "scheduled" && match.canRequestPrediction && getDateKey(match) === tomorrowKey
    );

    if (tomorrowMatches.length === 0) {
      const allScheduledTomorrow = matches.filter(
        (match) => match.status === "scheduled" && getDateKey(match) === tomorrowKey
      );
      if (allScheduledTomorrow.length === 0) {
        setBatchMessage("明天没有未开始的比赛");
      } else {
        setBatchMessage(`明天 ${allScheduledTomorrow.length} 场未开始比赛暂不支持预测（可能已被限制频次）`);
      }
      window.setTimeout(() => setBatchMessage(null), 5000);
      return;
    }

    setBatchPredicting(true);
    setBatchProgress({ current: 0, total: tomorrowMatches.length });
    setBatchMessage(null);

    const batchInput: PredictionRequestInputDto = {
      taskTypes: batchTaskTypes,
      dataOptions: batchDataOptions,
      promptTemplateId: null,
      customPrompt: "",
      outputStyle: batchOutputStyle,
      refreshContext: true
    };

    for (let i = 0; i < tomorrowMatches.length; i += 1) {
      setBatchProgress({ current: i + 1, total: tomorrowMatches.length });
      await predictSingleMatch(tomorrowMatches[i], batchInput);
    }

    setBatchPredicting(false);
    setBatchProgress(null);
    setBatchMessage(`已完成 ${tomorrowMatches.length} 场比赛预测`);
    window.setTimeout(() => setBatchMessage(null), 5000);
  }

  function handleToggleBatchSelect(matchId: string) {
    setBatchSelectedMatchIds((currentIds) => {
      const nextIds = new Set(currentIds);
      if (nextIds.has(matchId)) {
        nextIds.delete(matchId);
      } else {
        nextIds.add(matchId);
      }
      return nextIds;
    });
  }

  async function handlePredictSelected() {
    if (!onRequestPrediction || batchPredicting || selectedBatchMatches.length === 0) {
      return;
    }

    setBatchPredicting(true);
    setBatchProgress({ current: 0, total: selectedBatchMatches.length });
    setBatchMessage(null);

    const batchInput: PredictionRequestInputDto = {
      taskTypes: batchTaskTypes,
      dataOptions: batchDataOptions,
      promptTemplateId: null,
      customPrompt: "",
      outputStyle: batchOutputStyle,
      refreshContext: true
    };

    for (let i = 0; i < selectedBatchMatches.length; i += 1) {
      setBatchProgress({ current: i + 1, total: selectedBatchMatches.length });
      await predictSingleMatch(selectedBatchMatches[i], batchInput);
    }

    setBatchPredicting(false);
    setBatchProgress(null);
    setBatchSelectedMatchIds(new Set());
    setBatchMessage(`已完成 ${selectedBatchMatches.length} 场比赛预测`);
    window.setTimeout(() => setBatchMessage(null), 5000);
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

  function toggleParlayMatch(matchId: string) {
    invalidateParlayRequest();
    setSelectedParlayMatchIds((currentIds) => {
      const nextIds = new Set(currentIds);
      if (nextIds.has(matchId)) {
        nextIds.delete(matchId);
      } else {
        nextIds.add(matchId);
      }
      selectedParlayMatchIdsRef.current = nextIds;
      return nextIds;
    });
  }

  function invalidateParlayRequest() {
    parlayRequestVersionRef.current += 1;
    setParlayGenerating(false);
    setParlayResult(null);
    setParlayError(null);
  }

  async function handleCreateParlayCombination() {
    if (!onCreateParlayCombination || !canCreateParlay) {
      return;
    }
    const requestVersion = parlayRequestVersionRef.current + 1;
    parlayRequestVersionRef.current = requestVersion;
    setParlayGenerating(true);
    setParlayError(null);
    try {
      const stakeUnits = normalizeParlayStakeUnits(parlayStakeUnits);
      const result = await onCreateParlayCombination({
        matchIds: selectedParlayMatches,
        riskLevel: parlayRiskLevel,
        stakeUnits
      });
      if (parlayRequestVersionRef.current !== requestVersion) {
        return;
      }
      setParlayResult(result);
    } catch {
      if (parlayRequestVersionRef.current !== requestVersion) {
        return;
      }
      setParlayError("串关组合生成失败，请检查所选比赛是否都有单场方案。");
    } finally {
      if (parlayRequestVersionRef.current === requestVersion) {
        setParlayGenerating(false);
      }
    }
  }

  return (
    <section id="fixtures" className="page-section fixtures-console">
      <div className="fixtures-heading">
        <div>
          <p className="eyebrow">World Cup Match Console</p>
          <h2>赛程控制台</h2>
        </div>
        <div className="fixtures-heading-actions">
          {batchMessage ? (
            <span className={`batch-progress-chip ${batchMessage.includes("不") || batchMessage.includes("限制") ? "batch-message-warn" : ""}`}>
              {batchMessage}
            </span>
          ) : null}
          {batchProgress ? (
            <span className="batch-progress-chip">
              一键预测中 {batchProgress.current}/{batchProgress.total}
            </span>
          ) : null}
          <button
            className="app-button app-button-primary"
            disabled={batchPredicting || !onRequestPrediction}
            type="button"
            onClick={handlePredictTomorrow}
          >
            {batchPredicting ? "预测中..." : "一键预测明日"}
          </button>
          <button
            className={`app-button app-button-secondary ${batchConfigOpen ? "active" : ""}`}
            type="button"
            onClick={() => setBatchConfigOpen((open) => !open)}
          >
            ⚙ 配置 {batchConfigOpen ? "▲" : "▼"}
          </button>
          <span className="sync-chip">{latestSyncHint}</span>
        </div>
      </div>

      {batchConfigOpen ? (
        <div className="batch-config-panel">
          <div className="batch-config-row">
            <span className="batch-config-label">任务</span>
            <div className="batch-config-chips">
              {batchTaskOptions.map((option) => (
                <button
                  key={option.value}
                  className={`batch-config-chip ${batchTaskTypes.includes(option.value) ? "active" : ""}`}
                  type="button"
                  onClick={() => toggleBatchTaskType(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="batch-config-row">
            <span className="batch-config-label">数据</span>
            <label className="batch-config-switch">
              <input
                type="checkbox"
                checked={batchDataOptions.useSporttery}
                onChange={(event) =>
                  setBatchDataOptions({ ...batchDataOptions, useSporttery: event.target.checked })
                }
              />
              <span>体彩</span>
            </label>
          </div>
          <div className="batch-config-row">
            <span className="batch-config-label">输出</span>
            <div className="batch-config-chips">
              <button
                className={`batch-config-chip ${batchOutputStyle === "concise" ? "active" : ""}`}
                type="button"
                onClick={() => setBatchOutputStyle("concise")}
              >
                简洁
              </button>
              <button
                className={`batch-config-chip ${batchOutputStyle === "detailed" ? "active" : ""}`}
                type="button"
                onClick={() => setBatchOutputStyle("detailed")}
              >
                详细
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
      {matches.length > 0 ? (
        <section className="parlay-workspace">
          <div>
            <span>串关工作台</span>
            <strong>{selectedParlayMatches.length > 0 ? `已选 ${selectedParlayMatches.length} 场` : "从已生成单场组合的比赛中选择 2 场以上"}</strong>
            <small>{selectedParlayMatches.length < 2 ? `还需 ${2 - selectedParlayMatches.length} 场` : "已满足生成条件"}</small>
          </div>
          <div className="parlay-controls">
            <label>
              <span>风险</span>
              <select
                value={parlayRiskLevel}
                onChange={(event) => {
                  setParlayRiskLevel(event.target.value as BettingRiskLevel);
                  invalidateParlayRequest();
                }}
              >
                <option value="low">低风险</option>
                <option value="medium">中风险</option>
                <option value="high">高风险</option>
              </select>
            </label>
            <label>
              <span>注数</span>
              <input
                min={1}
                step={1}
                type="number"
                value={parlayStakeUnits}
                onChange={(event) => {
                  setParlayStakeUnits(normalizeParlayStakeUnits(Number(event.target.value)));
                  invalidateParlayRequest();
                }}
              />
            </label>
            <button
              type="button"
              className="app-button app-button-primary"
              disabled={!canCreateParlay || parlayGenerating}
              onClick={handleCreateParlayCombination}
            >
              {parlayGenerating ? "生成中" : "生成串关组合"}
            </button>
          </div>
          {parlayResult ? <p className="parlay-result">{parlayResult.summary}</p> : null}
          {parlayError ? <p className="parlay-error">{parlayError}</p> : null}
        </section>
      ) : null}

      <FixtureDateGroups
        groups={dateGroups}
        predictionFeedbackByMatchId={predictionFeedbackByMatchId}
        requestingMatchIds={requestingMatchIds}
        onOpenPrediction={setActivePredictionMatch}
        onOpenContext={handleOpenContext}
        onOpenHistory={onLoadPredictionHistory ? handleOpenPredictionHistory : undefined}
        onOpenReport={(feedback) => setActivePredictionReport(feedback.predictions[0] ?? null)}
        selectedParlayMatchIds={selectedParlayMatchIds}
        onToggleParlay={toggleParlayMatch}
        canSelectParlay={Boolean(onCreateParlayCombination)}
        batchSelectedMatchIds={batchSelectedMatchIds}
        onToggleBatchSelect={handleToggleBatchSelect}
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
              selectedParlayMatchIds={selectedParlayMatchIds}
              onToggleParlay={toggleParlayMatch}
              canSelectParlay={Boolean(onCreateParlayCombination)}
              batchSelectedMatchIds={batchSelectedMatchIds}
              onToggleBatchSelect={handleToggleBatchSelect}
            />
          ) : null}
        </section>
      ) : null}

      {batchMode ? (
        <div className="batch-action-bar">
          <div className="batch-action-bar-inner">
            <span>
              <strong>已选 {batchSelectedMatchIds.size} 场</strong>
            </span>
            <div className="batch-action-bar-buttons">
              <button
                className="app-button app-button-secondary"
                type="button"
                onClick={() => setBatchSelectedMatchIds(new Set())}
                disabled={batchPredicting}
              >
                取消选择
              </button>
              <button
                className="app-button app-button-primary"
                type="button"
                onClick={handlePredictSelected}
                disabled={batchPredicting || selectedBatchMatches.length === 0}
              >
                {batchPredicting ? "预测中..." : `一键预测已选 ${selectedBatchMatches.length} 场`}
              </button>
            </div>
          </div>
        </div>
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
