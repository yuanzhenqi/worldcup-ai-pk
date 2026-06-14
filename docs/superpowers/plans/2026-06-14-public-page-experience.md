# Public Page Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重构公开页首屏、赛程卡片和真实计分榜，让页面聚焦“AI 预测竞技场”和模型 PK。

**Architecture:** 保持现有 React 单页结构，不改 API DTO 和后端结算。`App` 只负责首屏文案，`FixturesPage` 只重排赛程卡片 DOM，`LeaderboardPage` 在现有 `LeaderboardDto` 上做前端排序和榜单切换，所有视觉变化集中在 `apps/web/src/styles.css`。

**Tech Stack:** React, TypeScript, Vite, Vitest, Testing Library, CSS。

---

## File Structure

- Modify: `apps/web/src/App.tsx`
  - 更新公开页首屏标题和说明文案。
- Modify: `apps/web/test/app.test.tsx`
  - 增加首屏文案断言，确保公开页主叙事不再使用旧表达。
- Modify: `apps/web/src/pages/LeaderboardPage.tsx`
  - 增加榜单切换状态、排序函数、摘要卡和排行卡。
  - 保留预测活跃榜的现有数据展示。
- Modify: `apps/web/test/leaderboardPage.test.tsx`
  - 覆盖综合榜、胜平负榜、比分榜、最近得分和空状态。
- Modify: `apps/web/src/pages/FixturesPage.tsx`
  - 调整 `MatchCard` 内部结构，把赛程卡片分成时间、对阵、状态、操作、预测反馈五个区域。
- Modify: `apps/web/test/fixturesPage.test.tsx`
  - 保留现有行为断言，并增加新布局关键 class 的轻量断言。
- Modify: `apps/web/src/styles.css`
  - 更新首屏、赛程卡片、排行榜卡片、移动端样式。

---

### Task 1: App Intro Test

**Files:**
- Modify: `apps/web/test/app.test.tsx`

- [ ] **Step 1: Write the failing test**

In `apps/web/test/app.test.tsx`, inside the existing interval test, after the initial render settles and before the fixture assertion, add these assertions:

```tsx
    expect(screen.getByRole("heading", { name: "2026 世界杯 AI 预测竞技场" })).toBeInTheDocument();
    expect(screen.getByText("多模型同场预测，赛后真实结算，用排行榜看谁更懂比赛。")).toBeInTheDocument();
    expect(screen.queryByText("赛程、赔率与 AI 预测对比")).not.toBeInTheDocument();
```

The local block should become:

```tsx
    render(<App />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByRole("heading", { name: "2026 世界杯 AI 预测竞技场" })).toBeInTheDocument();
    expect(screen.getByText("多模型同场预测，赛后真实结算，用排行榜看谁更懂比赛。")).toBeInTheDocument();
    expect(screen.queryByText("赛程、赔率与 AI 预测对比")).not.toBeInTheDocument();
    expect(screen.getByText("美国")).toBeInTheDocument();
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/web test -- app.test.tsx
```

Expected: FAIL because `App.tsx` still renders `赛程、赔率与 AI 预测对比`.

- [ ] **Step 3: Commit the failing test**

```bash
git add apps/web/test/app.test.tsx
git commit -m "test: cover public intro positioning"
```

---

### Task 2: App Intro Copy

**Files:**
- Modify: `apps/web/src/App.tsx`

- [ ] **Step 1: Update the intro copy**

In `apps/web/src/App.tsx`, replace the current intro section:

```tsx
      <section className="intro">
        <h2>赛程、赔率与 AI 预测对比</h2>
        <p>公开页面展示比赛信息、赔率摘要、AI 预测和模型排行榜。后台仅本机访问。</p>
      </section>
```

with:

```tsx
      <section className="intro">
        <h2>2026 世界杯 AI 预测竞技场</h2>
        <p>多模型同场预测，赛后真实结算，用排行榜看谁更懂比赛。</p>
      </section>
```

- [ ] **Step 2: Run the focused test to verify it passes**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/web test -- app.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/App.tsx
git commit -m "feat: reposition public intro copy"
```

---

### Task 3: Leaderboard Page Tests

**Files:**
- Modify: `apps/web/test/leaderboardPage.test.tsx`

- [ ] **Step 1: Replace the current populated leaderboard test**

Replace the existing `renders settled scoring and prediction activity tables` test with:

```tsx
  it("renders leaderboard summary cards and switches scoring views", async () => {
    const user = userEvent.setup();

    render(
      <LeaderboardPage
        leaderboard={{
          settledRows: [
            {
              modelId: "model-overall",
              modelDisplayName: "Overall-M1",
              totalScore: 18,
              finishedMatchesCounted: 4,
              resultHits: 3,
              resultAccuracy: 0.75,
              exactScoreHits: 0,
              recentScores: [3, 5, 5, 5]
            },
            {
              modelId: "model-score",
              modelDisplayName: "Score-M2",
              totalScore: 9,
              finishedMatchesCounted: 2,
              resultHits: 2,
              resultAccuracy: 1,
              exactScoreHits: 2,
              recentScores: [5, 4]
            },
            {
              modelId: "model-result",
              modelDisplayName: "Result-M3",
              totalScore: 12,
              finishedMatchesCounted: 3,
              resultHits: 2,
              resultAccuracy: 0.67,
              exactScoreHits: 1,
              recentScores: [5, 3, 4]
            }
          ],
          activeRows: [
            {
              modelId: "model-active",
              modelDisplayName: "Active-M4",
              predictionsCount: 4,
              parsedPredictionsCount: 3,
              matchesCovered: 2,
              homeWinVotes: 1,
              drawVotes: 1,
              awayWinVotes: 1,
              averageConfidence: 0.72,
              latestPredictionAt: "2026-06-13T08:00:00.000Z"
            }
          ]
        }}
      />
    );

    expect(screen.getByRole("heading", { name: "模型总榜" })).toBeInTheDocument();
    expect(screen.getByText("综合榜第一名")).toBeInTheDocument();
    expect(screen.getByText("胜平负榜第一名")).toBeInTheDocument();
    expect(screen.getByText("比分榜第一名")).toBeInTheDocument();

    const settledSection = screen.getByTestId("settled-leaderboard");
    expect(within(settledSection).getByRole("button", { name: "综合榜" })).toHaveAttribute("aria-pressed", "true");
    expect(within(settledSection).getAllByText("Overall-M1").length).toBeGreaterThan(0);
    expect(within(settledSection).getByText("最近得分")).toBeInTheDocument();
    expect(within(settledSection).getByText("3 / 5 / 5 / 5")).toBeInTheDocument();

    await user.click(within(settledSection).getByRole("button", { name: "胜平负榜" }));
    expect(within(settledSection).getByRole("button", { name: "胜平负榜" })).toHaveAttribute("aria-pressed", "true");
    expect(within(settledSection).getAllByTestId("settled-rank-card")[0]).toHaveTextContent("Overall-M1");
    expect(within(settledSection).getByText("胜平负命中率")).toBeInTheDocument();

    await user.click(within(settledSection).getByRole("button", { name: "比分榜" }));
    expect(within(settledSection).getByRole("button", { name: "比分榜" })).toHaveAttribute("aria-pressed", "true");
    expect(within(settledSection).getAllByTestId("settled-rank-card")[0]).toHaveTextContent("Score-M2");
    expect(within(settledSection).getByText("比分全中")).toBeInTheDocument();

    const activeSection = screen.getByTestId("active-leaderboard");
    expect(within(activeSection).getByText("Active-M4")).toBeInTheDocument();
    expect(within(activeSection).getByText("1 / 1 / 1")).toBeInTheDocument();
    expect(within(activeSection).getByText("72%")).toBeInTheDocument();
  });
```

Also add `userEvent` to the imports:

```tsx
import userEvent from "@testing-library/user-event";
```

- [ ] **Step 2: Keep the empty-state test and add tab absence coverage**

Extend the existing empty-state test:

```tsx
  it("renders empty states for both leaderboard sections", () => {
    render(<LeaderboardPage leaderboard={{ settledRows: [], activeRows: [] }} />);

    expect(screen.getByText("暂无已结算预测")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "综合榜" })).not.toBeInTheDocument();
    expect(screen.getByText("暂无预测活动")).toBeInTheDocument();
  });
```

- [ ] **Step 3: Run the focused test to verify it fails**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/web test -- leaderboardPage.test.tsx
```

Expected: FAIL because `LeaderboardPage.tsx` still renders the settled leaderboard as a table and has no scoring view buttons.

- [ ] **Step 4: Commit the failing tests**

```bash
git add apps/web/test/leaderboardPage.test.tsx
git commit -m "test: cover leaderboard scoring views"
```

---

### Task 4: Leaderboard Page Implementation

**Files:**
- Modify: `apps/web/src/pages/LeaderboardPage.tsx`
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: Replace `LeaderboardPage.tsx` with the card-and-tab implementation**

Use this complete file content:

```tsx
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
        ? { label: "比分全中", value: `${row.exactScoreHits} 场` }
        : { label: "总分", value: `${row.totalScore}` };

  const secondaryMetrics =
    view === "result"
      ? [
          { label: "胜平负命中率", value: formatPercent(row.resultAccuracy) },
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
            { label: "最近得分", value: formatRecentScores(row) }
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
```

- [ ] **Step 2: Add leaderboard styles**

In `apps/web/src/styles.css`, after the existing `.section-heading-row span` block, add:

```css
.leaderboard-summary-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin-bottom: 12px;
}

.leaderboard-summary-card {
  background: #ffffff;
  border: 1px solid #d8dee4;
  border-radius: 8px;
  display: grid;
  gap: 6px;
  min-width: 0;
  padding: 14px;
}

.leaderboard-summary-card span,
.leaderboard-summary-card small {
  color: #64737a;
  font-size: 12px;
  font-weight: 700;
}

.leaderboard-summary-card strong {
  color: #172026;
  font-size: 18px;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.leaderboard-tabs {
  background: #e8ecef;
  border: 1px solid #d8dee4;
  border-radius: 8px;
  display: grid;
  gap: 4px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin-bottom: 12px;
  padding: 4px;
}

.leaderboard-tabs button {
  background: transparent;
  border: 0;
  border-radius: 6px;
  color: #4c5b63;
  cursor: pointer;
  font: inherit;
  font-size: 14px;
  font-weight: 800;
  min-height: 40px;
  padding: 8px 10px;
}

.leaderboard-tabs button.active {
  background: #ffffff;
  box-shadow: 0 1px 3px rgba(23, 32, 38, 0.12);
  color: #173f35;
}

.settled-ranking-list {
  display: grid;
  gap: 10px;
}

.settled-rank-card {
  align-items: center;
  background: #ffffff;
  border: 1px solid #d8dee4;
  border-radius: 8px;
  display: grid;
  gap: 12px;
  grid-template-columns: 54px minmax(160px, 1fr) minmax(88px, auto) minmax(260px, 1.4fr);
  min-width: 0;
  padding: 12px;
}

.rank-badge {
  align-items: center;
  background: #173f35;
  border-radius: 8px;
  color: #ffffff;
  display: inline-flex;
  font-weight: 900;
  height: 38px;
  justify-content: center;
  width: 46px;
}

.rank-model,
.rank-primary-metric {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.rank-model strong,
.rank-primary-metric strong {
  overflow-wrap: anywhere;
}

.rank-model span {
  color: #64737a;
  font-size: 12px;
  font-weight: 700;
}

.rank-primary-metric {
  justify-items: end;
}

.rank-primary-metric strong {
  font-size: 22px;
}

.rank-metrics {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin: 0;
}

.rank-metrics div {
  background: #f6f8f9;
  border: 1px solid #e1e7ea;
  border-radius: 8px;
  display: grid;
  gap: 3px;
  min-width: 0;
  padding: 8px;
}

.rank-metrics dt,
.rank-metrics dd {
  margin: 0;
  min-width: 0;
}

.rank-metrics dt {
  color: #64737a;
  font-size: 11px;
  font-weight: 800;
}

.rank-metrics dd {
  color: #172026;
  font-size: 13px;
  font-weight: 900;
  overflow-wrap: anywhere;
}

.active-leaderboard-table table {
  min-width: 760px;
}
```

- [ ] **Step 3: Add mobile leaderboard styles**

In the existing `@media (max-width: 720px)` block in `apps/web/src/styles.css`, add:

```css
  .leaderboard-summary-grid,
  .settled-rank-card {
    grid-template-columns: 1fr;
  }

  .rank-primary-metric {
    justify-items: start;
  }

  .rank-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
```

- [ ] **Step 4: Run the focused leaderboard test**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/web test -- leaderboardPage.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/LeaderboardPage.tsx apps/web/src/styles.css
git commit -m "feat: add leaderboard scoring views"
```

---

### Task 5: Fixture Card Layout Test

**Files:**
- Modify: `apps/web/test/fixturesPage.test.tsx`

- [ ] **Step 1: Add a compact layout assertion to the scheduled fixture test**

In `apps/web/test/fixturesPage.test.tsx`, in `defaults to scheduled fixtures and can switch to finished fixtures`, change the render call to capture `container`:

```tsx
    const { container } = render(
      <FixturesPage
```

and add these assertions after the first scheduled fixture checks:

```tsx
    expect(container.querySelector(".match-card-shell")).toBeInTheDocument();
    expect(container.querySelector(".match-status-block")).toBeInTheDocument();
    expect(container.querySelector(".match-action-stack")).toBeInTheDocument();
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/web test -- fixturesPage.test.tsx
```

Expected: FAIL because the new layout classes do not exist yet.

- [ ] **Step 3: Commit the failing test**

```bash
git add apps/web/test/fixturesPage.test.tsx
git commit -m "test: cover compact fixture cards"
```

---

### Task 6: Fixture Card Implementation

**Files:**
- Modify: `apps/web/src/pages/FixturesPage.tsx`
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: Replace the `MatchCard` return structure**

In `apps/web/src/pages/FixturesPage.tsx`, inside `MatchCard`, replace the current `return (` block with this complete structure:

```tsx
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
```

- [ ] **Step 2: Replace the match card CSS block**

In `apps/web/src/styles.css`, replace the current `.match-card` block through `.match-action { justify-items: end; }` with:

```css
.match-card {
  align-items: center;
  background: #ffffff;
  border: 1px solid #d8dee4;
  border-left: 4px solid #c6d0d5;
  border-radius: 8px;
  display: grid;
  gap: 14px;
  grid-template-columns: minmax(86px, 0.42fr) minmax(260px, 1.3fr) minmax(150px, 0.65fr) 76px;
  padding: 12px 14px;
}

.match-card.status-scheduled {
  border-left-color: #1d6f5b;
}

.match-card.status-live {
  border-left-color: #d14d2f;
}

.match-card.status-finished {
  border-left-color: #3d5662;
}

.match-time-block,
.match-status-block,
.match-action {
  display: grid;
  gap: 6px;
}

.match-time-block time {
  font-size: 18px;
  font-weight: 800;
}

.match-time-block span,
.match-status-block span,
.team-line small {
  color: #64737a;
  font-size: 12px;
}

.match-main {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.team-line {
  align-items: center;
  display: grid;
  gap: 8px;
  grid-template-columns: 24px minmax(80px, max-content) minmax(0, 1fr);
  min-width: 0;
}

.team-line img,
.team-logo-fallback {
  border-radius: 50%;
  height: 24px;
  width: 24px;
}

.team-line img {
  object-fit: contain;
}

.team-logo-fallback {
  background: linear-gradient(135deg, #dfe8e4, #b8c8c2);
  display: inline-block;
}

.team-line strong,
.team-line small {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.match-status-block {
  align-content: center;
}

.match-action {
  align-content: center;
  justify-items: stretch;
}
```

- [ ] **Step 3: Update action and feedback styles**

In `apps/web/src/styles.css`, adjust these existing blocks:

```css
.match-action button {
  background: #173f35;
  border: 0;
  border-radius: 6px;
  color: #ffffff;
  cursor: pointer;
  font: inherit;
  font-size: 14px;
  font-weight: 700;
  min-height: 38px;
  padding: 8px 10px;
  white-space: nowrap;
  width: 100%;
}
```

and:

```css
.prediction-feedback-block {
  border-top: 1px solid #e4e9ec;
  display: grid;
  gap: 8px;
  grid-column: 1 / -1;
  justify-items: start;
  max-width: none;
  padding-top: 10px;
}
```

and:

```css
.prediction-consensus-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: flex-start;
}
```

- [ ] **Step 4: Update the mobile match card CSS**

In the existing `@media (max-width: 720px)` block, replace the current `.match-card`, `.team-line`, `.team-line small`, `.match-action`, `.match-action button`, `.prediction-feedback-block`, and `.prediction-consensus-summary` mobile rules with:

```css
  .match-card {
    align-items: start;
    gap: 12px;
    grid-template-columns: 1fr;
    padding: 16px;
  }

  .match-time-block {
    align-items: center;
    display: flex;
    justify-content: space-between;
    width: 100%;
  }

  .match-status-block {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
  }

  .team-line {
    grid-template-columns: 28px minmax(0, 1fr);
  }

  .team-line small {
    grid-column: 2;
  }

  .match-action {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    width: 100%;
  }

  .match-action button {
    min-height: 42px;
  }

  .prediction-feedback-block {
    width: 100%;
  }

  .prediction-consensus-summary {
    justify-content: flex-start;
  }
```

- [ ] **Step 5: Run the focused fixture test**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/web test -- fixturesPage.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/FixturesPage.tsx apps/web/src/styles.css
git commit -m "feat: compact fixture cards"
```

---

### Task 7: Visual Polish and Responsive Verification

**Files:**
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: Refine intro and page width styles**

In `apps/web/src/styles.css`, replace `.intro`, `.intro h2`, and `.intro p` with:

```css
.intro {
  margin: 44px auto 34px;
  max-width: 1120px;
  padding: 0 24px;
}

.intro h2 {
  color: #172026;
  font-size: 36px;
  letter-spacing: 0;
  line-height: 1.12;
  margin: 0 0 12px;
}

.intro p {
  color: #50606a;
  font-size: 17px;
  line-height: 1.7;
  margin: 0;
  max-width: 680px;
}
```

Also replace `.page-section` with:

```css
.page-section {
  margin: 32px auto;
  max-width: 1120px;
  padding: 0 24px;
}
```

- [ ] **Step 2: Run full frontend checks**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/web test
corepack pnpm --filter @worldcup-ai-pk/web typecheck
```

Expected: both PASS.

- [ ] **Step 3: Run full repo checks**

Run:

```bash
corepack pnpm test
corepack pnpm typecheck
corepack pnpm lint
```

Expected: all PASS.

- [ ] **Step 4: Verify in browser**

If the dev server is not running, start it with the existing project command:

```bash
corepack pnpm dev --host 0.0.0.0
```

Open:

```text
http://localhost:5173/
```

Check desktop width around `1440px`:

- Header reads `2026 世界杯 AI 预测竞技场`.
- Intro subtitle reads `多模型同场预测，赛后真实结算，用排行榜看谁更懂比赛。`.
- Visible public intro does not contain the old headline.
- Scheduled fixture cards no longer have a large empty middle area.
- Leaderboard has three summary cards and can switch `综合榜`、`胜平负榜`、`比分榜`.

Check mobile width around `390px`:

- Fixture cards stack vertically without horizontal scroll.
- Ranking cards stack vertically without horizontal scroll.
- Buttons remain readable and tappable.

- [ ] **Step 5: Commit polish**

```bash
git add apps/web/src/styles.css
git commit -m "style: polish public page layout"
```

---

### Task 8: Final Verification

**Files:**
- No source changes expected.

- [ ] **Step 1: Confirm working tree**

Run:

```bash
git status --short
```

Expected: no output.

- [ ] **Step 2: Confirm recent commits**

Run:

```bash
git log --oneline -8
```

Expected: shows the test, implementation, and style commits from this plan above the current branch history.

- [ ] **Step 3: Report final state**

Final response must include:

- The implemented UI areas: intro, fixture cards, leaderboard views.
- Verification commands and pass status.
- Local URL if the dev server is running.

Do not claim the UI is complete without the test and browser verification from Task 7.
