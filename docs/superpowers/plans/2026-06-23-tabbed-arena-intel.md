# Tabbed Arena And Betting Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the public app into a five-tab match lab and improve AI betting intelligence visibility, prompt rules, betting history traceability, and betting arena readability.

**Architecture:** Keep the app as a single React view with internal tab state instead of adding routing. Extract betting arena view-model helpers from `BettingArenaPage` into a shared web helper module, create a dedicated `BettingIntelPage`, keep all betting actions inside `BettingArenaPage`, and update prompt construction in the API with stricter reasoning rules.

**Tech Stack:** React 18, Vite, TypeScript, Fastify, better-sqlite3, Vitest, Testing Library, lucide-react, CSS in `apps/web/src/styles.css`.

## Global Constraints

- Work inside `/Users/yzq/Desktop/project/worldcup-ai-pk`.
- Do not revert unrelated dirty worktree changes.
- Use `apply_patch` for manual edits.
- Use TDD: write failing tests before production changes.
- API-Football remains schedule-only in AI 实盘投注场: kickoff time, venue, teams, status, score, and team identity.
- Sporttery remains the source for purchasable betting pools, options, and locked odds.
- Do not introduce React Router in this plan.
- Do not introduce a real market value data source in this plan.
- Do not fetch article full text in this plan; external intelligence uses search result title, snippet, URL, source domain, and available publish time.
- Do not hide empty arrays or empty objects in the UI; show `未采集`, `未配置`, `暂无数据`, or `采集失败`.
- Desktop and mobile layouts must avoid overlapping controls and text overflow.
- Do not use the forbidden uncertainty word from `/Users/yzq/AGENTS.md`.

---

## File Structure

- Modify `apps/web/src/App.tsx`
  - Adds `MainTab` state and five-tab shell.
  - Renders one major module at a time.
  - Keeps existing data loading, sync interval, and betting generation polling.

- Modify `apps/web/test/app.test.tsx`
  - Verifies default tab, tab switching, and existing data refresh wiring.

- Create `apps/web/src/pages/bettingArenaViewModels.ts`
  - Holds pure UI helpers currently embedded in `BettingArenaPage`.
  - Shared by `BettingArenaPage` and new `BettingIntelPage`.

- Modify `apps/web/src/pages/BettingArenaPage.tsx`
  - Imports shared helpers.
  - Removes the large input audit drawer from this page after `BettingIntelPage` owns it.
  - Keeps funds ranking, current orders, model detail drawer, ledger, and historical settlement.

- Create `apps/web/src/pages/BettingIntelPage.tsx`
  - Dedicated view for battle-context audit, data source breakdown, external intelligence, data gaps, and raw input snapshot.

- Create `apps/web/test/bettingIntelPage.test.tsx`
  - Verifies source breakdown, external intelligence groups, empty state, structured data gaps, and raw snapshot.

- Modify `apps/web/test/bettingArenaPage.test.tsx`
  - Keeps existing betting arena coverage green after helper extraction.
  - Adds assertions that first-level betting cards do not show raw prompt text.

- Modify `apps/web/src/styles.css`
  - Adds tab shell styles.
  - Adds betting intelligence page styles.
  - Tightens mobile layout for tabs, current order cards, detail drawers, and intel panels.

- Modify `apps/api/src/modules/betting-arena/bettingArenaPrompts.ts`
  - Adds stronger staged reasoning rules and data-module mapping.

- Modify `apps/api/test/bettingArenaPrompts.test.ts`
  - Locks prompt behavior with exact text assertions.

- Modify `apps/api/src/modules/external-intel/externalIntelCollector.ts`
  - Expands external intelligence query packs.
  - Keeps query and search-result audit fields available in summaries.

- Modify `packages/shared/src/types.ts`
  - Adds reusable external intelligence search result DTO.
  - Adds `queries` and `searchResults` to `ExternalIntelSummaryDto`.

- Modify `apps/api/src/modules/betting-arena/bettingArena.context.ts`
  - Injects `queries` and `searchResults` into `battleContext.matches[].externalIntel`.

- Modify `apps/api/src/modules/betting-arena/bettingArena.service.ts`
  - Adds current-round forced external intelligence refresh.

- Modify `apps/api/src/modules/admin/admin.routes.ts`
  - Adds admin endpoint to refresh current betting round external intelligence.

- Modify `apps/api/test/externalIntelCollector.test.ts`
  - Covers expanded query pack, truncation, audit fields, and failure gaps.

- Modify `apps/api/test/bettingArenaApi.test.ts`
  - Covers current-round external intelligence refresh endpoint.

---

### Task 1: App Tab Shell

**Files:**
- Modify: `apps/web/test/app.test.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Produces: `type MainTab = "fixtures" | "betting" | "intel" | "leaderboard" | "admin"` inside `App.tsx`.
- Consumes: existing `FixturesPage`, `BettingArenaPage`, `LeaderboardPage`, `AdminPage`, and later `BettingIntelPage`.

- [ ] **Step 1: Write failing App tab test**

In `apps/web/test/app.test.tsx`, update page mocks so visible tab checks can find page markers.

Replace the current page mocks with:

```ts
vi.mock("../src/pages/AdminPage", () => ({
  AdminPage: () => <section aria-label="后台配置页面">后台配置页面</section>
}));

vi.mock("../src/pages/LeaderboardPage", () => ({
  LeaderboardPage: vi.fn(() => <section aria-label="排行榜页面">排行榜页面</section>)
}));

vi.mock("../src/pages/BettingIntelPage", () => ({
  BettingIntelPage: () => <section aria-label="投注输入与情报页面">投注输入与情报页面</section>
}));
```

Add this test inside `describe("App", () => { ... })`:

```ts
it("switches major modules through top-level tabs", async () => {
  vi.mocked(getPublicMatches).mockResolvedValue([buildMatch({ status: "scheduled", homeScore: null, awayScore: null })]);
  vi.mocked(getPublicLeaderboard).mockResolvedValue({ settledRows: [], activeRows: [] });
  vi.mocked(listAdminPromptTemplates).mockResolvedValue([]);
  vi.mocked(syncApiFootballFixtures).mockResolvedValue({ synced: true, imported: 1 });
  vi.mocked(getBettingArena).mockResolvedValue(emptyBettingArena);
  vi.mocked(getBettingArenaLedger).mockResolvedValue({ items: [], total: 0, limit: 50, offset: 0, modelId: null });
  vi.mocked(getBettingArenaRound).mockResolvedValue(emptyBettingArena);
  vi.mocked(createParlayCombination).mockRejectedValue(new Error("not used in this test"));
  vi.mocked(triggerBettingArenaModel).mockResolvedValue(emptyBettingArena);
  vi.mocked(triggerBettingArenaRound).mockResolvedValue(emptyBettingArena);
  vi.mocked(settleBettingArenaRound).mockResolvedValue(emptyBettingArena);

  render(<App />);

  expect(await screen.findByRole("tab", { name: "赛程预测" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByText("美国")).toBeInTheDocument();
  expect(screen.queryByLabelText("排行榜页面")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("tab", { name: "AI 实盘投注场" }));
  expect(await screen.findByRole("button", { name: "生成今日出单" })).toBeInTheDocument();
  expect(screen.queryByText("美国")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("tab", { name: "投注输入与情报" }));
  expect(screen.getByLabelText("投注输入与情报页面")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("tab", { name: "排行榜" }));
  expect(screen.getByLabelText("排行榜页面")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("tab", { name: "后台配置" }));
  expect(screen.getByLabelText("后台配置页面")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/web test -- app.test.tsx -t "switches major modules"
```

Expected: FAIL because `App.tsx` does not render tab buttons or `BettingIntelPage`.

- [ ] **Step 3: Add placeholder import for later page**

In `apps/web/src/App.tsx`, add:

```ts
import { BettingIntelPage } from "./pages/BettingIntelPage";
```

This will not compile until Task 3 creates the page. If executing tasks one at a time, create the minimal page in the same patch:

```tsx
// apps/web/src/pages/BettingIntelPage.tsx
import type { BettingArenaDto } from "@worldcup-ai-pk/shared";

interface BettingIntelPageProps {
  arena: BettingArenaDto | null;
  loading: boolean;
  error: string | null;
}

export function BettingIntelPage({ arena, loading, error }: BettingIntelPageProps) {
  if (loading) return <p className="status-line">正在加载投注输入...</p>;
  if (error) return <p className="status-line error">{error}</p>;
  if (!arena?.currentRound) return <p className="muted">暂无投注轮次，先在 AI 实盘投注场生成今日出单。</p>;
  return <section aria-label="投注输入与情报页面">投注输入总览</section>;
}
```

- [ ] **Step 4: Implement tab state in App**

In `apps/web/src/App.tsx`, add above `export function App()`:

```ts
type MainTab = "fixtures" | "betting" | "intel" | "leaderboard" | "admin";

const mainTabs: Array<{ id: MainTab; label: string; description: string }> = [
  { id: "fixtures", label: "赛程预测", description: "比赛、预测和历史" },
  { id: "betting", label: "AI 实盘投注场", description: "资金、出单和结算" },
  { id: "intel", label: "投注输入与情报", description: "模型输入数据审计" },
  { id: "leaderboard", label: "排行榜", description: "模型成绩对比" },
  { id: "admin", label: "后台配置", description: "模型和数据源设置" }
];
```

Inside `App`, add:

```ts
const [activeTab, setActiveTab] = useState<MainTab>("fixtures");
```

Replace the current `nav` anchor list with:

```tsx
<nav className="main-tabs" role="tablist" aria-label="主模块">
  {mainTabs.map((tab) => (
    <button
      aria-selected={activeTab === tab.id}
      className={activeTab === tab.id ? "active" : ""}
      key={tab.id}
      onClick={() => setActiveTab(tab.id)}
      role="tab"
      type="button"
    >
      <strong>{tab.label}</strong>
      <span>{tab.description}</span>
    </button>
  ))}
</nav>
```

Replace the unconditional page rendering after status lines with conditional sections:

```tsx
{activeTab === "fixtures" ? (
  <>
    {matchesStatus === "loading" ? <p className="status-line">正在加载赛程...</p> : null}
    {matchesStatus === "failed" ? <p className="status-line error">赛程加载失败，请确认 API 服务正在运行。</p> : null}
    <FixturesPage
      matches={matches}
      promptTemplates={promptTemplates}
      onLoadMatchContext={getMatchContext}
      onRefreshMatchContext={refreshMatchContext}
      onRequestPrediction={handleRequestPrediction}
      onLoadPredictionRunStatus={getPredictionRunStatus}
      onLoadPredictionHistory={getMatchPredictionHistory}
      onCreateParlayCombination={createParlayCombination}
    />
  </>
) : null}

{activeTab === "betting" ? (
  <BettingArenaPage
    arena={bettingArena}
    loading={bettingArenaStatus === "loading"}
    error={bettingArenaStatus === "failed" ? "实盘投注场加载失败，请确认 API 服务正在运行。" : null}
    onTriggerRound={async () => {
      const nextArena = await triggerBettingArenaRound();
      setBettingArena(nextArena);
      return nextArena;
    }}
    onTriggerModel={async (roundId, modelId) => {
      const nextArena = await triggerBettingArenaModel(roundId, modelId);
      setBettingArena(nextArena);
      return nextArena;
    }}
    onSettleRound={async (roundId) => {
      const nextArena = await settleBettingArenaRound(roundId);
      setBettingArena(nextArena);
      return nextArena;
    }}
    onLoadLedger={getBettingArenaLedger}
    onLoadRound={getBettingArenaRound}
  />
) : null}

{activeTab === "intel" ? (
  <BettingIntelPage
    arena={bettingArena}
    loading={bettingArenaStatus === "loading"}
    error={bettingArenaStatus === "failed" ? "投注输入加载失败，请确认 API 服务正在运行。" : null}
  />
) : null}

{activeTab === "leaderboard" ? <LeaderboardPage leaderboard={leaderboard} /> : null}
{activeTab === "admin" ? <AdminPage /> : null}
```

- [ ] **Step 5: Add tab shell CSS**

In `apps/web/src/styles.css`, add near the topbar styles:

```css
.main-tabs {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 8px 0 2px;
}

.main-tabs button {
  align-items: flex-start;
  background: #f6f8f7;
  border: 1px solid #d9e1de;
  border-radius: 8px;
  color: #1d2a2f;
  cursor: pointer;
  display: grid;
  flex: 0 0 auto;
  gap: 2px;
  min-width: 132px;
  padding: 10px 12px;
  text-align: left;
}

.main-tabs button.active {
  background: #0f3f38;
  border-color: #0f3f38;
  color: #ffffff;
}

.main-tabs button strong {
  font-size: 14px;
  line-height: 1.2;
  white-space: nowrap;
}

.main-tabs button span {
  color: inherit;
  font-size: 11px;
  line-height: 1.2;
  opacity: 0.78;
  white-space: nowrap;
}

@media (max-width: 760px) {
  .topbar {
    align-items: stretch;
    gap: 10px;
  }

  .main-tabs {
    margin-inline: -4px;
    padding-bottom: 4px;
  }

  .main-tabs button {
    min-width: 118px;
    padding: 9px 10px;
  }
}
```

- [ ] **Step 6: Run App tests**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/web test -- app.test.tsx
```

Expected: PASS.

---

### Task 2: Shared Betting Arena View Models

**Files:**
- Create: `apps/web/src/pages/bettingArenaViewModels.ts`
- Modify: `apps/web/src/pages/BettingArenaPage.tsx`
- Test: `apps/web/test/bettingArenaPage.test.tsx`

**Interfaces:**
- Produces:
  - `isRecord(value: unknown): value is Record<string, unknown>`
  - `formatAuditValue(value: unknown): string`
  - `formatJsonText(value: string): string`
  - `formatDataGap(value: unknown): string | null`
  - `poolDisplayName(poolCode: string): string`
  - `getBattleContextSummary(round: BettingArenaRoundDto | null | undefined): BattleContextSummary`
  - `getMatchLabel(match: BattleContextMatchSummary): string`
- Consumes: `BettingArenaRoundDto` from `@worldcup-ai-pk/shared`.

- [ ] **Step 1: Write failing helper import test through existing page**

In `apps/web/test/bettingArenaPage.test.tsx`, keep the existing test `shows betting input audit data and per-model input output details`. It will fail after helper extraction if the UI loses behavior. No new test is required for helper extraction because the page tests already cover source breakdown, external intelligence, team profiles, and data gaps.

- [ ] **Step 2: Create helper file**

Create `apps/web/src/pages/bettingArenaViewModels.ts` with the pure helper code moved from `BettingArenaPage.tsx`.

The file must export:

```ts
import type { BettingArenaRoundDto } from "@worldcup-ai-pk/shared";

export interface BattleContextMatchSummary {
  matchId: string;
  title: string;
  kickoffAt: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  poolsCount: number;
  optionsCount: number;
  dataGapsCount: number;
  dataGaps: string[];
  homeTeamName: string;
  awayTeamName: string;
  homeTeamProfile: ReturnType<typeof formatTeamProfile>;
  awayTeamProfile: ReturnType<typeof formatTeamProfile>;
  historicalMatchup: {
    totalMatches: number | null;
    homeWins: number | null;
    draws: number | null;
    awayWins: number | null;
    summary: string;
  };
  externalIntel: {
    status: string;
    summary: string;
    injuryNews: string[];
    lineupNews: string[];
    motivation: string[];
    recentFormNews: string[];
    riskSignals: string[];
    sourceLinks: Array<{ title: string; url: string; sourceDomain: string; publishedAt: string | null }>;
    collectedAt: string;
  };
  sourceBreakdown: Array<{ source: string; detail: string }>;
  sportteryPools: Array<{ poolCode: string; options: Array<{ code: string; label: string; value: string; goalLine?: string | null }> }>;
}

export interface BattleContextSummary {
  matches: BattleContextMatchSummary[];
  poolsCount: number;
  optionsCount: number;
  dataGapsCount: number;
}
```

Move these functions from `BettingArenaPage.tsx` into the helper file and export them:

```ts
export function isRecord(value: unknown): value is Record<string, unknown> { ... }
export function formatAuditValue(value: unknown): string { ... }
export function formatJsonText(value: string): string { ... }
export function formatDataGap(value: unknown): string | null { ... }
export function domainLabel(domain: string): string { ... }
export function domainStatusLabel(status: string): string { ... }
export function poolDisplayName(poolCode: string): string { ... }
export function parlayDisplayName(legsCount: number): string { ... }
export function getBattleContextSummary(round: BettingArenaRoundDto | null | undefined): BattleContextSummary { ... }
```

When moving `getBattleContextSummary`, extend external intel extraction so arrays are preserved:

```ts
const externalIntelSummary = {
  status: readString(externalIntel?.status),
  summary: readString(externalIntel?.summary),
  injuryNews: readStringList(externalIntel?.injuryNews),
  lineupNews: readStringList(externalIntel?.lineupNews),
  motivation: readStringList(externalIntel?.motivation),
  recentFormNews: readStringList(externalIntel?.recentFormNews),
  riskSignals: readStringList(externalIntel?.riskSignals),
  sourceLinks: readSourceLinks(externalIntel?.sourceLinks),
  collectedAt: readString(externalIntel?.collectedAt)
};
```

Add the helper:

```ts
function readStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.flatMap((item) => (typeof item === "string" ? [item] : [])) : [];
}
```

Also export:

```ts
export function getMatchLabel(match: Pick<BattleContextMatchSummary, "homeTeamName" | "awayTeamName" | "title">): string {
  return match.title || `${match.homeTeamName || "主队"} 对 ${match.awayTeamName || "客队"}`;
}
```

- [ ] **Step 3: Import helpers in BettingArenaPage**

In `apps/web/src/pages/BettingArenaPage.tsx`, remove local copies of moved helpers and add:

```ts
import {
  formatAuditValue,
  formatDataGap,
  formatJsonText,
  getBattleContextSummary,
  getMatchLabel,
  isRecord,
  parlayDisplayName,
  poolDisplayName
} from "./bettingArenaViewModels";
```

Update local match label calls to use `getMatchLabel(match)`.

- [ ] **Step 4: Run BettingArenaPage test**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/web test -- bettingArenaPage.test.tsx
```

Expected: PASS.

---

### Task 3A: External Intelligence Collection Calls And Audit Fields

**Files:**
- Modify: `packages/shared/src/types.ts`
- Modify: `apps/api/src/modules/external-intel/externalIntelCollector.ts`
- Modify: `apps/api/src/modules/betting-arena/bettingArena.context.ts`
- Modify: `apps/api/src/modules/betting-arena/bettingArena.service.ts`
- Modify: `apps/api/src/modules/admin/admin.routes.ts`
- Modify: `apps/api/test/externalIntelCollector.test.ts`
- Modify: `apps/api/test/bettingArenaApi.test.ts`

**Interfaces:**
- Produces: `ExternalIntelSearchResultDto`.
- Produces: `ExternalIntelSummaryDto.queries: string[]`.
- Produces: `ExternalIntelSummaryDto.searchResults: ExternalIntelSearchResultDto[]`.
- Produces: `refreshCurrentRoundExternalIntel(db: Database, now?: Date): Promise<{ refreshed: number; matches: Array<{ matchId: string; status: ExternalIntelStatus; queriesCount: number; searchResultsCount: number; dataGaps: Array<string | StructuredDataGapDto> }> }>`
- Produces: `POST /api/admin/betting-arena/external-intel/refresh-current-round`.
- Consumes: existing `collectExternalIntelForMatch(db, input)` and `DuckDuckGoHtmlWebSearchProvider`.

- [ ] **Step 1: Write failing query-pack and audit-field tests**

In `apps/api/test/externalIntelCollector.test.ts`, add:

```ts
it("builds expanded external intelligence queries in priority order", () => {
  expect(
    buildExternalIntelQueries({
      homeTeamName: "Germany",
      awayTeamName: "Japan",
      kickoffAt: "2026-06-22T10:00:00.000Z",
      maxQueries: 8
    })
  ).toEqual([
    "Germany Japan 伤停 首发 世界杯",
    "Germany Japan injury lineup World Cup",
    "Germany Japan press conference team news",
    "Germany Japan motivation rotation World Cup",
    "Germany Japan predicted lineup",
    "Germany Japan recent form last matches",
    "Germany Japan key players availability",
    "Germany Japan squad market value"
  ]);
});

it("stores executed queries and search results in the summary audit fields", async () => {
  const { db } = createTestDatabase();
  seedMatch(db);
  const provider: WebSearchProvider = {
    search: vi.fn().mockResolvedValue([
      {
        title: "Germany predicted lineup",
        url: "https://example.com/lineup",
        snippet: "Germany expected to keep the same front three.",
        sourceDomain: "example.com",
        publishedAt: null
      }
    ])
  };

  db.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)").run(
    "externalIntel.enabled",
    "true",
    "2026-06-21T10:00:00.000Z"
  );

  const result = await collectExternalIntelForMatch(db, {
    matchId: "match-1",
    homeTeamName: "Germany",
    awayTeamName: "Japan",
    kickoffAt: "2026-06-22T10:00:00.000Z",
    maxQueries: 5,
    webSearchProvider: provider,
    now: new Date("2026-06-21T10:00:00.000Z"),
    forceRefresh: true
  });

  expect(result.queries).toHaveLength(5);
  expect(result.summary.queries).toEqual(result.queries);
  expect(result.summary.searchResults).toEqual(result.searchResults);
  expect(result.summary.searchResults[0]).toMatchObject({ title: "Germany predicted lineup", url: "https://example.com/lineup" });
});
```

- [ ] **Step 2: Run collector tests to verify failure**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- externalIntelCollector.test.ts -t "expanded external intelligence queries|summary audit fields"
```

Expected: FAIL because the query pack has only 4 queries and `ExternalIntelSummaryDto` does not expose `queries` or `searchResults`.

- [ ] **Step 3: Add shared external intelligence audit fields**

In `packages/shared/src/types.ts`, replace the inline search result type in `ExternalIntelSnapshotDto` with a named DTO.

Add after `ExternalIntelSourceLinkDto`:

```ts
export interface ExternalIntelSearchResultDto {
  title: string;
  url: string;
  snippet: string;
  sourceDomain: string;
  publishedAt: string | null;
}
```

Add to `ExternalIntelSummaryDto`:

```ts
  queries: string[];
  searchResults: ExternalIntelSearchResultDto[];
```

Change `ExternalIntelSnapshotDto.searchResults` to:

```ts
  searchResults: ExternalIntelSearchResultDto[];
```

- [ ] **Step 4: Populate audit fields in collector**

In `apps/api/src/modules/external-intel/externalIntelCollector.ts`, update `buildExternalIntelQueries` to:

```ts
export function buildExternalIntelQueries(input: ExternalIntelQueryInput): string[] {
  return [
    `${input.homeTeamName} ${input.awayTeamName} 伤停 首发 世界杯`,
    `${input.homeTeamName} ${input.awayTeamName} injury lineup World Cup`,
    `${input.homeTeamName} ${input.awayTeamName} press conference team news`,
    `${input.homeTeamName} ${input.awayTeamName} motivation rotation World Cup`,
    `${input.homeTeamName} ${input.awayTeamName} predicted lineup`,
    `${input.homeTeamName} ${input.awayTeamName} recent form last matches`,
    `${input.homeTeamName} ${input.awayTeamName} key players availability`,
    `${input.homeTeamName} ${input.awayTeamName} squad market value`
  ].slice(0, Math.max(1, input.maxQueries));
}
```

Update `buildFallbackSummary` input type:

```ts
function buildFallbackSummary(input: {
  status: ExternalIntelSummaryDto["status"];
  queries?: string[];
  results: ExternalIntelSearchResult[];
  collectedAt: string;
  reason: string;
  extraDataGaps?: ExternalIntelSummaryDto["dataGaps"];
}): ExternalIntelSummaryDto {
```

Add to the returned summary:

```ts
    queries: input.queries ?? [],
    searchResults: input.results,
```

Update `parseSummary` to preserve audit fields:

```ts
      queries: Array.isArray(parsed.queries) ? readStringArray(parsed.queries) : fallback.queries,
      searchResults: Array.isArray(parsed.searchResults) ? parsed.searchResults as ExternalIntelSearchResult[] : fallback.searchResults,
```

Before inserting the snapshot in `collectExternalIntelForMatch`, set:

```ts
    summary.queries = queries;
    summary.searchResults = searchResults;
```

For the top-level catch fallback, pass `queries`:

```ts
      queries,
      results: [],
```

For the disabled settings fallback, keep empty queries:

```ts
      queries: [],
      results: [],
```

- [ ] **Step 5: Inject audit fields from cached snapshots into battle context**

In `apps/api/src/modules/betting-arena/bettingArena.context.ts`, update `parseExternalIntelSummary` return shape so it always includes:

```ts
    queries: Array.isArray(parsed.queries) ? parsed.queries.flatMap((item) => (typeof item === "string" ? [item] : [])) : [],
    searchResults: Array.isArray(parsed.searchResults)
      ? parsed.searchResults.flatMap((item) => {
          if (!isRecord(item)) return [];
          const title = readStringValue(item.title);
          const url = readStringValue(item.url);
          if (!title || !url) return [];
          return [
            {
              title,
              url,
              snippet: readStringValue(item.snippet),
              sourceDomain: readStringValue(item.sourceDomain),
              publishedAt: typeof item.publishedAt === "string" || item.publishedAt === null ? item.publishedAt : null
            }
          ];
        })
      : [],
```

Update the no-snapshot fallback in `getExternalIntelForMatch`:

```ts
      queries: [],
      searchResults: [],
```

- [ ] **Step 6: Write failing current-round refresh endpoint test**

In `apps/api/test/bettingArenaApi.test.ts`, add a test near the existing betting arena admin/public tests:

```ts
it("refreshes external intelligence for the current betting arena round", async () => {
  const { app, db } = await buildTestApp();
  insertModel(db, "model-1", "Model One");
  insertMatch(db, "match-1", {
    status: "scheduled",
    kickoffAt: "2026-06-23T12:00:00.000Z",
    homeTeamName: "Germany",
    awayTeamName: "Japan"
  });
  db.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)").run(
    "externalIntel.enabled",
    "true",
    "2026-06-23T08:00:00.000Z"
  );
  await triggerBettingArenaRound(db, new Date("2026-06-23T08:00:00.000Z"));

  const response = await app.inject({
    method: "POST",
    url: "/api/admin/betting-arena/external-intel/refresh-current-round"
  });

  expect(response.statusCode).toBe(200);
  expect(response.json()).toMatchObject({
    refreshed: 1,
    matches: [expect.objectContaining({ matchId: "match-1" })]
  });
});
```

If `buildTestApp`, `insertModel`, or `insertMatch` helper names differ in this file, read the existing test helper definitions in `apps/api/test/bettingArenaApi.test.ts` and use the exact helper names already present there.

- [ ] **Step 7: Run endpoint test to verify failure**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- bettingArenaApi.test.ts -t "refreshes external intelligence"
```

Expected: FAIL because the admin route and service function do not exist.

- [ ] **Step 8: Add current-round refresh service**

In `apps/api/src/modules/betting-arena/bettingArena.service.ts`, export:

```ts
export async function refreshCurrentRoundExternalIntel(db: Database, now = new Date()) {
  const current = getBettingArenaSummary(db).currentRound;
  if (!current || !current.battleContext || typeof current.battleContext !== "object" || !("matches" in current.battleContext)) {
    return { refreshed: 0, matches: [] };
  }

  const matches = Array.isArray((current.battleContext as { matches: unknown }).matches)
    ? (current.battleContext as { matches: unknown[] }).matches
    : [];
  const webSearchProvider = new DuckDuckGoHtmlWebSearchProvider();
  const results = [];

  for (const rawMatch of matches) {
    if (!rawMatch || typeof rawMatch !== "object") continue;
    const match = rawMatch as { matchId?: unknown; homeTeamName?: unknown; awayTeamName?: unknown; kickoffAt?: unknown };
    if (typeof match.matchId !== "string" || typeof match.homeTeamName !== "string" || typeof match.awayTeamName !== "string" || typeof match.kickoffAt !== "string") {
      continue;
    }
    const result = await collectExternalIntelForMatch(db, {
      matchId: match.matchId,
      homeTeamName: match.homeTeamName,
      awayTeamName: match.awayTeamName,
      kickoffAt: match.kickoffAt,
      webSearchProvider,
      now,
      forceRefresh: true
    });
    results.push({
      matchId: result.matchId,
      status: result.status,
      queriesCount: result.queries.length,
      searchResultsCount: result.searchResults.length,
      dataGaps: result.dataGaps
    });
  }

  return { refreshed: results.length, matches: results };
}
```

- [ ] **Step 9: Add admin route**

In `apps/api/src/modules/admin/admin.routes.ts`, import:

```ts
import { refreshCurrentRoundExternalIntel } from "../betting-arena/bettingArena.service";
```

Add route near the existing external-intel refresh route:

```ts
  app.post("/betting-arena/external-intel/refresh-current-round", async () =>
    refreshCurrentRoundExternalIntel(options.db)
  );
```

- [ ] **Step 10: Run external intelligence API tests**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- externalIntelCollector.test.ts bettingArenaApi.test.ts
```

Expected: PASS.

---

### Task 3: Dedicated Betting Intelligence Page

**Files:**
- Create or replace: `apps/web/src/pages/BettingIntelPage.tsx`
- Create: `apps/web/test/bettingIntelPage.test.tsx`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Consumes:
  - `BettingArenaDto | null`
  - `getBattleContextSummary(round)`
  - `formatAuditValue(value)`
  - `getMatchLabel(match)`
- Produces: `BettingIntelPage({ arena, loading, error })`.

- [ ] **Step 1: Write failing BettingIntelPage test**

Create `apps/web/test/bettingIntelPage.test.tsx`:

```tsx
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { BettingArenaDto } from "@worldcup-ai-pk/shared";
import { afterEach, describe, expect, it } from "vitest";
import { BettingIntelPage } from "../src/pages/BettingIntelPage";

const arena: BettingArenaDto = {
  accounts: [],
  slips: [],
  history: [],
  currentRound: {
    id: "round-1",
    roundDate: "2026-06-23",
    roundSequence: 1,
    status: "locked",
    lockTime: "2026-06-23T10:00:00.000Z",
    eligibleMatchCount: 1,
    modelsCount: 1,
    totalStaked: 0,
    potentialReturn: 0,
    settledReturn: 0,
    battleContext: {
      roundDate: "2026-06-23",
      lockTime: "2026-06-23T10:00:00.000Z",
      matches: [
        {
          matchId: "match-1",
          kickoffAt: "2026-06-24T12:00:00.000Z",
          status: "scheduled",
          homeScore: null,
          awayScore: null,
          homeTeamName: "德国",
          awayTeamName: "日本",
          contextDomains: [
            { domain: "dongqiudi_intel", status: "cached", summary: "懂球帝显示德国控球优势明显。", error: null },
            { domain: "sporttery", status: "cached", summary: "体彩玩法已缓存。", error: null },
            { domain: "team_profile", status: "cached", summary: "球队资料已缓存。", error: null }
          ],
          sportteryPools: [
            {
              poolCode: "HAD",
              options: [
                { code: "h", label: "主胜", value: "1.85" },
                { code: "d", label: "平", value: "3.20" }
              ]
            },
            {
              poolCode: "HHAD",
              options: [{ code: "a", label: "让负", value: "1.72", goalLine: "-1.00" }]
            }
          ],
          homeTeamProfile: {
            coach: "Home Coach",
            playingStyle: "High press",
            keyPlayers: [{ name: "Home Star", position: "FW", club: "Home Club" }],
            injuries: [{ player: "Home Defender", status: "Doubtful", injury: "Knock" }],
            worldCupHistory: { appearances: 3, bestResult: "Quarter-finals", titles: 0 },
            qualifyingSummary: "Qualified strongly.",
            marketValue: null
          },
          awayTeamProfile: {
            coach: "Away Coach",
            playingStyle: "Compact block",
            keyPlayers: [],
            injuries: [],
            worldCupHistory: { appearances: 1, bestResult: "Group stage", titles: 0 },
            qualifyingSummary: "Playoff route.",
            marketValue: null
          },
          historicalMatchup: {
            totalMatches: 2,
            homeWins: 1,
            draws: 1,
            awayWins: 0,
            summary: "德国历史交锋占优。"
          },
          externalIntel: {
            status: "cached",
            summary: "德国主力前锋可出场。",
            queries: ["Germany Japan predicted lineup", "Germany Japan key players availability"],
            searchResults: [
              {
                title: "Germany lineup report",
                url: "https://example.com/lineup",
                snippet: "Germany expected lineup notes.",
                sourceDomain: "example.com",
                publishedAt: null
              }
            ],
            injuryNews: ["后卫需要赛前评估"],
            lineupNews: ["中场可能轮换"],
            motivation: ["争取提前出线"],
            recentFormNews: ["近三场保持不败"],
            riskSignals: ["轮换幅度不明"],
            sourceLinks: [{ title: "Team news", url: "https://example.com/news", sourceDomain: "example.com", publishedAt: null }],
            confidence: "medium",
            dataGaps: [],
            collectedAt: "2026-06-23T09:00:00.000Z"
          },
          dataGaps: ["暂无球队身价数据源", { source: "external_intel", code: "search_partial_failed", message: "部分外部情报搜索失败：timeout" }]
        }
      ]
    },
    createdAt: "2026-06-23T10:00:00.000Z",
    updatedAt: "2026-06-23T10:00:00.000Z"
  }
};

describe("BettingIntelPage", () => {
  afterEach(() => cleanup());

  it("shows betting input sources, external intelligence groups, and data gaps", () => {
    render(<BettingIntelPage arena={arena} loading={false} error={null} />);

    expect(screen.getByRole("heading", { name: "投注输入总览" })).toBeInTheDocument();
    expect(screen.getByText("比赛 1")).toBeInTheDocument();
    expect(screen.getByText("玩法池 2")).toBeInTheDocument();
    expect(screen.getByText("投注选项 3")).toBeInTheDocument();
    expect(screen.getByText("德国 对 日本")).toBeInTheDocument();
    expect(screen.getByText("API-Football：仅赛程：比赛时间、场地、球队、状态和比分")).toBeInTheDocument();
    expect(screen.getByText(/体彩：投注玩法与赔率/)).toBeInTheDocument();
    expect(screen.getByText("实际查询词")).toBeInTheDocument();
    expect(screen.getByText("Germany Japan predicted lineup")).toBeInTheDocument();
    expect(screen.getByText("Germany Japan key players availability")).toBeInTheDocument();
    expect(screen.getByText("返回来源 1")).toBeInTheDocument();
    expect(screen.getByText("胜平负")).toBeInTheDocument();
    expect(screen.getByText("让球胜平负")).toBeInTheDocument();
    expect(screen.getByText("主胜 · 赔率 1.85")).toBeInTheDocument();
    expect(screen.getByText("让负 · 赔率 1.72 · 让球 -1.00")).toBeInTheDocument();
    expect(screen.getByText("伤停")).toBeInTheDocument();
    expect(screen.getByText("后卫需要赛前评估")).toBeInTheDocument();
    expect(screen.getByText("阵容")).toBeInTheDocument();
    expect(screen.getByText("中场可能轮换")).toBeInTheDocument();
    expect(screen.getByText("动机")).toBeInTheDocument();
    expect(screen.getByText("争取提前出线")).toBeInTheDocument();
    expect(screen.getByText("近期")).toBeInTheDocument();
    expect(screen.getByText("近三场保持不败")).toBeInTheDocument();
    expect(screen.getByText("风险")).toBeInTheDocument();
    expect(screen.getByText("轮换幅度不明")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Team news" })).toHaveAttribute("href", "https://example.com/news");
    expect(screen.getAllByText("暂无球队身价数据源").length).toBeGreaterThan(0);
    expect(screen.getByText("external_intel · search_partial_failed：部分外部情报搜索失败：timeout")).toBeInTheDocument();
  });

  it("shows an empty state when no betting round exists", () => {
    render(<BettingIntelPage arena={{ accounts: [], currentRound: null, slips: [], history: [] }} loading={false} error={null} />);

    expect(screen.getByText("暂无投注轮次，先在 AI 实盘投注场生成今日出单。")).toBeInTheDocument();
  });

  it("keeps the raw battle context collapsed until requested", () => {
    render(<BettingIntelPage arena={arena} loading={false} error={null} />);

    const details = screen.getByText("完整输入快照").closest("details");
    if (!(details instanceof HTMLDetailsElement)) {
      throw new Error("Raw context details not found");
    }
    expect(details.open).toBe(false);

    fireEvent.click(within(details).getByText("完整输入快照"));
    expect(details.open).toBe(true);
    expect(within(details).getByText(/"matchId": "match-1"/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/web test -- bettingIntelPage.test.tsx
```

Expected: FAIL because the page is missing or only has a minimal placeholder.

- [ ] **Step 3: Implement BettingIntelPage**

Replace `apps/web/src/pages/BettingIntelPage.tsx` with:

```tsx
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

export function BettingIntelPage({ arena, loading, error }: BettingIntelPageProps) {
  if (loading) return <p className="status-line">正在加载投注输入...</p>;
  if (error) return <p className="status-line error">{error}</p>;
  if (!arena?.currentRound) return <p className="muted">暂无投注轮次，先在 AI 实盘投注场生成今日出单。</p>;

  const summary = getBattleContextSummary(arena.currentRound);

  return (
    <section className="betting-intel-page" id="betting-intel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Betting Input Audit</p>
          <h2>投注输入总览</h2>
        </div>
        <span>{arena.currentRound.roundDate} 第 {arena.currentRound.roundSequence} 轮</span>
      </div>

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
              <p>{match.historicalMatchup.summary || "暂无历史交锋摘要"}</p>
            </div>

            <div className="intel-section">
              <h3>外部联网情报</h3>
              <p>{match.externalIntel.summary || "暂无外部情报摘要"}</p>
              <div className="intel-audit-row">
                <strong>返回来源 {match.externalIntel.searchResults.length}</strong>
                <span>采集时间：{match.externalIntel.collectedAt || "暂无"}</span>
              </div>
              <article className="intel-query-box">
                <h4>实际查询词</h4>
                {renderList(match.externalIntel.queries, "暂无实际查询词")}
              </article>
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
```

- [ ] **Step 4: Add BettingIntelPage CSS**

In `apps/web/src/styles.css`, add:

```css
.betting-intel-page {
  display: grid;
  gap: 16px;
}

.intel-summary-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.intel-summary-grid div,
.intel-match-card,
.intel-section {
  background: #ffffff;
  border: 1px solid #d8dee4;
  border-radius: 8px;
}

.intel-summary-grid div {
  display: grid;
  gap: 4px;
  padding: 14px;
}

.intel-summary-grid span,
.intel-match-card summary span {
  color: #596a67;
  font-size: 12px;
}

.intel-summary-grid strong {
  font-size: 22px;
}

.intel-match-list {
  display: grid;
  gap: 12px;
}

.intel-match-card {
  overflow: hidden;
}

.intel-match-card summary {
  align-items: center;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  padding: 14px;
}

.intel-section {
  display: grid;
  gap: 10px;
  margin: 12px;
  padding: 14px;
}

.intel-section h3,
.intel-section h4 {
  margin: 0;
}

.intel-source-grid,
.intel-news-grid,
.intel-section.two-column {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.intel-source-grid article,
.intel-news-grid article,
.intel-pool-list article {
  background: #f7f9f8;
  border: 1px solid #e2e8e5;
  border-radius: 8px;
  display: grid;
  gap: 6px;
  padding: 10px;
}

.intel-pool-list {
  display: grid;
  gap: 10px;
}

.intel-pool-list article div {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.intel-pool-list article div span,
.intel-source-links a {
  background: #eef5f2;
  border-radius: 999px;
  color: #0f3f38;
  font-size: 12px;
  font-weight: 800;
  padding: 6px 8px;
  text-decoration: none;
}

.intel-mini-list {
  margin: 0;
  padding-left: 18px;
}

.intel-source-links {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.intel-audit-row {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: space-between;
}

.intel-query-box {
  background: #f7f9f8;
  border: 1px solid #e2e8e5;
  border-radius: 8px;
  display: grid;
  gap: 6px;
  padding: 10px;
}

@media (max-width: 760px) {
  .intel-summary-grid,
  .intel-source-grid,
  .intel-news-grid,
  .intel-section.two-column {
    grid-template-columns: 1fr;
  }

  .intel-match-card summary {
    align-items: flex-start;
    flex-direction: column;
    gap: 4px;
  }
}
```

- [ ] **Step 5: Run BettingIntelPage test**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/web test -- bettingIntelPage.test.tsx
```

Expected: PASS.

---

### Task 4: BettingArenaPage First-Level Cleanup

**Files:**
- Modify: `apps/web/src/pages/BettingArenaPage.tsx`
- Modify: `apps/web/test/bettingArenaPage.test.tsx`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Consumes: helper exports from `bettingArenaViewModels.ts`.
- Produces: first-level betting arena without the large input audit drawer.

- [ ] **Step 1: Write failing first-level cleanup test**

In `apps/web/test/bettingArenaPage.test.tsx`, add:

```ts
it("keeps raw prompt and battle context out of first-level betting arena", () => {
  render(
    <BettingArenaPage
      arena={arena}
      loading={false}
      error={null}
      onTriggerRound={vi.fn()}
      onTriggerModel={vi.fn()}
      onSettleRound={vi.fn()}
    />
  );

  expect(screen.getByRole("heading", { name: "AI 实盘投注场" })).toBeInTheDocument();
  expect(screen.queryByText("投注输入面板")).not.toBeInTheDocument();
  expect(screen.queryByText("完整输入快照")).not.toBeInTheDocument();
  expect(screen.queryByText("account_context={}")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Model One 投注详情" }));
  expect(screen.getByText("提示词拆解")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/web test -- bettingArenaPage.test.tsx -t "keeps raw prompt"
```

Expected: FAIL because `投注输入面板` still exists in the first-level betting arena.

- [ ] **Step 3: Remove input panel state and button from BettingArenaPage**

In `apps/web/src/pages/BettingArenaPage.tsx`:

Remove state:

```ts
const [inputPanelOpen, setInputPanelOpen] = useState(false);
```

Remove the button:

```tsx
<button className="app-button app-button-secondary" type="button" onClick={() => setInputPanelOpen(true)} disabled={!arena?.currentRound}>
  <ClipboardList size={16} aria-hidden="true" />
  投注输入面板
</button>
```

Remove the `inputPanelOpen ? (...) : null` drawer block that renders `投注输入面板`.

Keep `selectedSlip` prompt audit in the model detail drawer.

- [ ] **Step 4: Ensure first-level cards keep compact summaries**

In current order cards, keep only:

```tsx
<div className="arena-slip-card-metrics">
  <span>投入 {money(slip?.totalStake ?? 0)}</span>
  <span>{settlement ? `返还 ${money(settlement.returnedAmount)}` : `潜在 ${money(slip?.potentialReturn ?? 0)}`}</span>
  <span className={profit === null || profit >= 0 ? "arena-profit-positive" : "arena-profit-negative"}>
    {profit === null ? "待结算" : `盈亏 ${profit >= 0 ? "+" : ""}${money(profit)}`}
  </span>
</div>
```

If `portfolioBuckets` are shown on first level, render only bucket labels and stake:

```tsx
{slip?.portfolioBuckets.length ? (
  <div className="arena-slip-bucket-strip">
    {slip.portfolioBuckets.slice(0, 4).map((bucket) => (
      <span key={bucket.bucket}>{bucket.label} {money(bucket.stake)}</span>
    ))}
  </div>
) : null}
```

- [ ] **Step 5: Add bucket strip CSS**

In `apps/web/src/styles.css`, add:

```css
.arena-slip-bucket-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.arena-slip-bucket-strip span {
  background: #f0f5f3;
  border-radius: 999px;
  color: #173f37;
  font-size: 12px;
  font-weight: 800;
  padding: 5px 8px;
}
```

- [ ] **Step 6: Run BettingArenaPage tests**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/web test -- bettingArenaPage.test.tsx
```

Expected: PASS.

---

### Task 5: Prompt Rule Upgrade

**Files:**
- Modify: `apps/api/test/bettingArenaPrompts.test.ts`
- Modify: `apps/api/src/modules/betting-arena/bettingArenaPrompts.ts`

**Interfaces:**
- Consumes: `buildBettingArenaPrompt(input: { battleContext: unknown; accountContext: unknown }): string`
- Produces: stronger prompt rules with exact text anchors.

- [ ] **Step 1: Write failing prompt assertions**

In `apps/api/test/bettingArenaPrompts.test.ts`, add these assertions to the existing test:

```ts
expect(prompt).toContain("推理步骤 1：先判断每场比赛的赛果方向，不得引用赔率作为判断权重");
expect(prompt).toContain("推理步骤 2：筛选适合单场的比赛，说明命中路径、失败路径和资金占比");
expect(prompt).toContain("推理步骤 3：筛选适合串关的组合，逐腿说明组合逻辑");
expect(prompt).toContain("推理步骤 4：结合 account_history 的历史投入、命中、亏损回撤和可用资金决定本轮投入比例");
expect(prompt).toContain("external_intel：最新新闻、阵容、伤停、动机、风险信号和来源链接");
expect(prompt).toContain("至少评估一组价值区机会");
expect(prompt).toContain("至少评估一组防冷或回避理由");
expect(prompt).toContain("如果数据不足，允许空仓，但必须说明哪些数据缺失、哪些比赛被回避、需要什么情报才会下注");
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- bettingArenaPrompts.test.ts
```

Expected: FAIL because the new exact prompt text is absent.

- [ ] **Step 3: Update prompt builder**

In `apps/api/src/modules/betting-arena/bettingArenaPrompts.ts`, update the returned string list so it includes these lines before the JSON contract:

```ts
"推理步骤 1：先判断每场比赛的赛果方向，不得引用赔率作为判断权重。",
"推理步骤 2：筛选适合单场的比赛，说明命中路径、失败路径和资金占比。",
"推理步骤 3：筛选适合串关的组合，逐腿说明组合逻辑。",
"推理步骤 4：结合 account_history 的历史投入、命中、亏损回撤和可用资金决定本轮投入比例。",
"推理步骤 5：最后输出结构化投注单；若数据不足则空仓。",
"输入数据模块：external_intel：最新新闻、阵容、伤停、动机、风险信号和来源链接。",
"策略要求：至少评估一组价值区机会。",
"策略要求：至少评估一组防冷或回避理由。",
"策略要求：如果数据不足，允许空仓，但必须说明哪些数据缺失、哪些比赛被回避、需要什么情报才会下注。",
```

Keep the existing JSON schema output line unchanged:

```ts
"JSON 字段必须包含 action,total_stake,singles,parlays,portfolio_buckets,strategy_summary,risk_level,bankroll_plan,skip_reasons,data_gaps。",
```

- [ ] **Step 4: Run prompt test**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- bettingArenaPrompts.test.ts
```

Expected: PASS.

---

### Task 6: Ledger History Readability

**Files:**
- Modify: `apps/web/test/bettingArenaPage.test.tsx`
- Modify: `apps/web/src/pages/BettingArenaPage.tsx`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Consumes: existing `BettingArenaLedgerDto`.
- Produces: ledger rows with round, model, status, stake, return/potential, profit/pending, and hit item count.

- [ ] **Step 1: Write failing ledger hit count test**

In `apps/web/test/bettingArenaPage.test.tsx`, add:

```ts
it("shows hit item counts in betting ledger rows", async () => {
  const onLoadLedger = vi.fn().mockResolvedValue({
    items: [{ round: arena.currentRound, slip: arena.slips[0] }],
    total: 1,
    limit: 50,
    offset: 0,
    modelId: null
  });
  render(
    <BettingArenaPage
      arena={arena}
      loading={false}
      error={null}
      onTriggerRound={vi.fn()}
      onTriggerModel={vi.fn()}
      onSettleRound={vi.fn()}
      onLoadLedger={onLoadLedger}
    />
  );

  fireEvent.click(screen.getByRole("button", { name: "查看投注账本" }));

  const ledgerHeading = await screen.findByRole("heading", { name: "投注账本" });
  const ledgerDialog = ledgerHeading.closest('[role="dialog"]');
  if (!(ledgerDialog instanceof HTMLElement)) {
    throw new Error("Ledger dialog not found");
  }
  expect(within(ledgerDialog).getByText("命中 1/1")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/web test -- bettingArenaPage.test.tsx -t "hit item counts"
```

Expected: FAIL because ledger rows do not display hit item counts.

- [ ] **Step 3: Add ledger hit count rendering**

In the ledger row map in `BettingArenaPage.tsx`, after `const stats = getSlipSettlementStats(entry.slip);`, render:

```tsx
{hasSettlement ? <span>命中 {stats.hit}/{stats.total}</span> : <span>命中待定</span>}
```

Update `.arena-ledger-row` CSS grid to allow four metric columns:

```css
.arena-ledger-row {
  grid-template-columns: minmax(220px, 1fr) repeat(4, minmax(86px, auto)) auto;
}
```

Keep the mobile rule:

```css
@media (max-width: 760px) {
  .arena-ledger-row {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 4: Run BettingArenaPage tests**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/web test -- bettingArenaPage.test.tsx
```

Expected: PASS.

---

### Task 7: Full Web Integration And Responsive Visual Check

**Files:**
- Modify: `apps/web/src/styles.css`
- Read: `package.json`
- Read: `apps/web/package.json`

**Interfaces:**
- Consumes all prior tasks.
- Produces verified web UI behavior.

- [ ] **Step 1: Run web targeted tests**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/web test -- app.test.tsx bettingArenaPage.test.tsx bettingIntelPage.test.tsx client.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run API targeted tests**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- bettingArenaPrompts.test.ts externalIntelCollector.test.ts externalIntelRepository.test.ts bettingArenaApi.test.ts bettingArenaRepository.test.ts bettingArenaSlip.test.ts bettingArenaSettlement.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run typechecks**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/web typecheck
corepack pnpm --filter @worldcup-ai-pk/api typecheck
```

Expected: both commands exit 0.

- [ ] **Step 4: Start or reuse local services**

Check scripts:

```bash
cat package.json
cat apps/web/package.json
cat apps/api/package.json
```

Start the API and web dev server using the existing repo scripts. If a port is occupied, use the repo's configured alternate command or Vite `--host 0.0.0.0 --port <free-port>`.

- [ ] **Step 5: Browser visual verification**

Use the in-app browser or Playwright to verify:

- Desktop width 1440:
  - Five tabs are visible.
  - Only one major module renders at a time.
  - `AI 实盘投注场` cards do not overlap.
  - `投注输入与情报` shows source breakdown and external intelligence groups.

- Mobile width 390:
  - Tabs scroll horizontally.
  - Current order action buttons do not overlap.
  - Betting intel match cards stack into one column.
  - Model detail drawer fills the screen and can scroll.

- [ ] **Step 6: Constraint scan**

Run:

```bash
rg -n "candi""date" apps packages docs -g '!node_modules'
```

Expected: no matches.

---

## Self-Review Checklist

- Spec coverage:
  - Tab shell: Task 1.
  - Dedicated betting input and intelligence page: Tasks 2 and 3.
  - External intelligence calls and audit fields: Task 3A.
  - Betting arena first-level cleanup: Task 4.
  - Prompt rules: Task 5.
  - Historical betting traceability: Task 6.
  - Visual and mobile verification: Task 7.

- Type consistency:
  - `MainTab` values match all `activeTab` checks.
  - `BettingIntelPage` props match the import and `App.tsx` usage.
  - `getBattleContextSummary` and helper names are exported once from `bettingArenaViewModels.ts`.
  - Ledger stats reuse existing `getSlipSettlementStats`.

- Execution notes:
  - Do not batch production changes before RED tests.
  - Keep `BettingArenaPage` behavior intact while moving input audit to `BettingIntelPage`.
  - If an existing dirty worktree contains nearby changes, preserve them and patch around them.
