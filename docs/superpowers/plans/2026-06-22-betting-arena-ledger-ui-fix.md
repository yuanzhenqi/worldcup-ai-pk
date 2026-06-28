# AI Betting Arena Ledger UI Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix zero-valued historical settlement detail rows, clarify bankroll metrics, add a complete betting ledger, and rebuild the AI betting arena UI so model orders, profit, settlement history, and detail dialogs are readable on desktop and mobile.

**Architecture:** Keep API-Football restricted to fixtures and scores. Betting settlement display is rebuilt in the betting arena repository layer, then exposed through existing round summaries and a new ledger endpoint. The frontend renders funds ranking, current orders, ledger history, and detail dialogs from shared DTOs, with `lucide-react` icons for consistent action controls.

**Tech Stack:** TypeScript, Fastify, better-sqlite3, React 18, Vite, Vitest, Testing Library, pnpm workspace, optional `lucide-react` frontend dependency.

## Global Constraints

- Work inside `/Users/yzq/Desktop/project/worldcup-ai-pk`.
- Do not revert unrelated dirty worktree changes.
- Do not use the forbidden English uncertainty word from `/Users/yzq/AGENTS.md`.
- Do not guess identifiers, JSON paths, fields, or route names; read files or tests first.
- Use `apply_patch` for manual edits.
- API-Football provides fixtures, status, score, venue, and team identity only.
- Betting odds and purchase options come from Sporttery data.
- Existing settlement rows with `settlement_json.items` keep current behavior.
- Legacy settlement rows without `settlement_json.items` must reconstruct non-zero item amounts from `parsed_slip_json`.
- Mobile UI must avoid overlapping controls and text overflow.

---

## File Structure

- Modify `packages/shared/src/types.ts`: add ledger DTOs while preserving existing betting arena DTOs.
- Modify `apps/api/src/modules/betting-arena/bettingArena.repository.ts`: reconstruct legacy settlement item amounts, add ledger query, and refine account metric DTO values.
- Modify `apps/api/src/modules/betting-arena/bettingArena.service.ts`: expose ledger service wrapper.
- Modify `apps/api/src/modules/public/public.routes.ts`: register `GET /api/public/betting-arena/ledger`.
- Modify `apps/api/test/bettingArenaRepository.test.ts`: add repository tests for legacy settlement reconstruction and ledger filtering.
- Modify `apps/api/test/bettingArenaApi.test.ts`: add public ledger endpoint test.
- Modify `apps/web/package.json` and `pnpm-lock.yaml`: add `lucide-react`.
- Modify `apps/web/src/api/client.ts`: add `getBettingArenaLedger`.
- Modify `apps/web/src/App.tsx`: pass ledger loader to `BettingArenaPage`.
- Modify `apps/web/src/pages/BettingArenaPage.tsx`: rebuild AI betting arena layout, add ledger view, change metric labels, preserve existing input audit dialogs.
- Modify `apps/web/src/styles.css`: add responsive desktop/mobile betting arena layout and icon-button styles.
- Modify `apps/web/test/bettingArenaPage.test.tsx`: cover metric labels, non-overlap action labels, ledger opening, settlement amounts, and model detail flow.
- Modify `apps/web/test/client.test.ts`: cover ledger client route.
- Modify `apps/web/test/app.test.tsx`: update mocks for new prop and API function.

---

### Task 1: Reconstruct Historical Settlement Item Amounts

**Files:**
- Modify: `apps/api/src/modules/betting-arena/bettingArena.repository.ts`
- Test: `apps/api/test/bettingArenaRepository.test.ts`

**Interfaces:**
- Consumes: `BettingArenaSlipDto.singles`, `BettingArenaSlipDto.parlays`, `BettingArenaSettlementDto.legs`, `SlipRow.parsed_slip_json`
- Produces: `parseSettlement(value: string | null, row: SlipRow): BettingArenaSettlementDto | null` returning non-zero `items` for legacy settlement JSON

- [ ] **Step 1: Write failing repository test for legacy settlement reconstruction**

Add this test inside `describe("betting arena repository and context", () => { ... })` in `apps/api/test/bettingArenaRepository.test.ts`:

```ts
  it("reconstructs non-zero settlement item amounts for legacy settlement rows without items", () => {
    const { db } = createTestDatabase();
    insertModel(db, "model-1", "Model One");
    insertMatch(db, "match-1", { status: "finished", homeTeamName: "德国", awayTeamName: "日本" });
    insertMatch(db, "match-2", {
      apiFootballFixtureId: 9002,
      status: "finished",
      homeTeamId: "home-2",
      homeTeamName: "荷兰",
      awayTeamId: "away-2",
      awayTeamName: "瑞典"
    });
    ensureBettingArenaAccounts(db, new Date("2026-06-20T00:00:00.000Z"));
    const battleContext = buildBattleContext(db, {
      roundDate: "2026-06-20",
      lockTime: "2026-06-20T10:00:00.000Z",
      externalIntel: { summary: "统一外部情报未配置", dataGaps: ["未配置外部联网情报采集"] }
    });
    const round = createBettingArenaRound(db, {
      roundDate: "2026-06-20",
      lockTime: "2026-06-20T10:00:00.000Z",
      battleContext,
      externalIntel: { summary: "统一外部情报未配置", dataGaps: ["未配置外部联网情报采集"] },
      now: new Date("2026-06-20T00:00:00.000Z")
    });
    insertBetSlip(db, {
      id: "slip-legacy",
      roundId: round.id,
      modelId: "model-1",
      totalStake: 300,
      potentialReturn: 520,
      parsedSlip: {
        action: "bet",
        singles: [
          {
            matchId: "match-1",
            poolCode: "HAD",
            selectionCode: "h",
            selectionLabel: "主胜",
            lockedOdds: 1.85,
            stake: 200,
            confidence: 0.63,
            rationale: "德国压制力更强。"
          }
        ],
        parlays: [
          {
            parlayName: "稳健双关",
            stake: 100,
            legs: [
              { matchId: "match-1", poolCode: "HAD", selectionCode: "h", selectionLabel: "主胜", lockedOdds: 1.85 },
              { matchId: "match-2", poolCode: "HAD", selectionCode: "h", selectionLabel: "主胜", lockedOdds: 1.42 }
            ],
            combinedOdds: 2.63,
            confidence: 0.58,
            rationale: "两场主队方向一致。"
          }
        ],
        portfolioBuckets: [],
        skipReasons: [],
        dataGaps: []
      }
    });
    db.prepare(
      `
        INSERT INTO betting_arena_settlements (
          id, round_id, slip_id, model_id, stake, returned_amount, profit, status, settlement_json, settled_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    ).run(
      "settlement-legacy",
      round.id,
      "slip-legacy",
      "model-1",
      300,
      633,
      333,
      "settled",
      JSON.stringify({
        stake: 300,
        returnedAmount: 633,
        profit: 333,
        status: "settled",
        hit: true,
        legs: [
          { matchId: "match-1", won: true, voided: false },
          { matchId: "match-1", won: true, voided: false },
          { matchId: "match-2", won: true, voided: false }
        ]
      }),
      "2026-06-21T14:00:00.000Z",
      "2026-06-21T14:00:00.000Z"
    );

    const summary = getBettingArenaSummary(db, round.id);

    expect(summary.slips[0]?.settlement?.items).toEqual([
      {
        type: "single",
        name: null,
        stake: 200,
        returnedAmount: 370,
        won: true,
        voided: false,
        legs: [{ matchId: "match-1", won: true, voided: false }]
      },
      {
        type: "parlay",
        name: "稳健双关",
        stake: 100,
        returnedAmount: 263,
        won: true,
        voided: false,
        legs: [
          { matchId: "match-1", won: true, voided: false },
          { matchId: "match-2", won: true, voided: false }
        ]
      }
    ]);
    db.close();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- bettingArenaRepository.test.ts -t "reconstructs non-zero settlement item amounts"
```

Expected: FAIL because the legacy fallback emits `stake: 0` and `returnedAmount: 0`.

- [ ] **Step 3: Implement reconstruction helpers**

In `apps/api/src/modules/betting-arena/bettingArena.repository.ts`, replace the current `parseSettlement` fallback with these helpers above `parseSettlement`:

```ts
interface ParsedSettlementLeg {
  matchId: string;
  won: boolean;
  voided: boolean;
}

interface ParsedSlipForSettlement {
  singles: Array<{
    matchId: string;
    stake: number;
    lockedOdds: number;
  }>;
  parlays: Array<{
    parlayName: string;
    stake: number;
    combinedOdds: number;
    legs: Array<{ matchId: string }>;
  }>;
}

function parseSettlementLegs(rawLegs: unknown[]): ParsedSettlementLeg[] {
  return rawLegs.flatMap((leg) => {
    if (!isRecord(leg)) return [];
    return [
      {
        matchId: typeof leg.matchId === "string" ? leg.matchId : "",
        won: leg.won === true,
        voided: leg.voided === true
      }
    ];
  });
}

function parseSlipForSettlement(row: SlipRow): ParsedSlipForSettlement {
  const parsedSlip = parseJsonOrNull(row.parsed_slip_json);
  if (!isRecord(parsedSlip)) return { singles: [], parlays: [] };
  const singles = Array.isArray(parsedSlip.singles)
    ? parsedSlip.singles.flatMap((single) => {
        if (!isRecord(single)) return [];
        const matchId = typeof single.matchId === "string" ? single.matchId : "";
        if (!matchId) return [];
        return [{ matchId, stake: toNumber(single.stake), lockedOdds: toNumber(single.lockedOdds) }];
      })
    : [];
  const parlays = Array.isArray(parsedSlip.parlays)
    ? parsedSlip.parlays.flatMap((parlay) => {
        if (!isRecord(parlay)) return [];
        const parlayName = typeof parlay.parlayName === "string" ? parlay.parlayName : "串关";
        const legs = Array.isArray(parlay.legs)
          ? parlay.legs.flatMap((leg) => {
              if (!isRecord(leg)) return [];
              const matchId = typeof leg.matchId === "string" ? leg.matchId : "";
              return matchId ? [{ matchId }] : [];
            })
          : [];
        return [{ parlayName, stake: toNumber(parlay.stake), combinedOdds: toNumber(parlay.combinedOdds), legs }];
      })
    : [];
  return { singles, parlays };
}

function takeLegacyLeg(legs: ParsedSettlementLeg[], usedIndexes: Set<number>, matchId: string): ParsedSettlementLeg {
  const foundIndex = legs.findIndex((leg, index) => !usedIndexes.has(index) && leg.matchId === matchId);
  if (foundIndex >= 0) {
    usedIndexes.add(foundIndex);
    return legs[foundIndex];
  }
  return { matchId, won: false, voided: true };
}

function reconstructSettlementItems(row: SlipRow, legs: ParsedSettlementLeg[]): BettingArenaSettlementDto["items"] {
  const parsedSlip = parseSlipForSettlement(row);
  const usedIndexes = new Set<number>();
  const singleItems = parsedSlip.singles.map((single) => {
    const leg = takeLegacyLeg(legs, usedIndexes, single.matchId);
    const returnedAmount = leg.voided ? single.stake : leg.won ? single.stake * single.lockedOdds : 0;
    return {
      type: "single" as const,
      name: null,
      stake: single.stake,
      returnedAmount,
      won: leg.won,
      voided: leg.voided,
      legs: [leg]
    };
  });
  const parlayItems = parsedSlip.parlays.map((parlay) => {
    const parlayLegs = parlay.legs.map((leg) => takeLegacyLeg(legs, usedIndexes, leg.matchId));
    const voided = parlayLegs.length > 0 && parlayLegs.every((leg) => leg.voided);
    const won = parlayLegs.length > 0 && parlayLegs.every((leg) => leg.won || leg.voided) && parlayLegs.some((leg) => leg.won);
    const returnedAmount = voided ? parlay.stake : won ? parlay.stake * parlay.combinedOdds : 0;
    return {
      type: "parlay" as const,
      name: parlay.parlayName,
      stake: parlay.stake,
      returnedAmount,
      won,
      voided,
      legs: parlayLegs
    };
  });
  return [...singleItems, ...parlayItems];
}
```

Then update `parseSettlement` so it uses parsed legs once:

```ts
function parseSettlement(value: string | null, row: SlipRow): BettingArenaSettlementDto | null {
  if (!value) return null;
  const parsed = parseJsonOrNull(value);
  if (!isRecord(parsed)) return null;
  const legs = parseSettlementLegs(Array.isArray(parsed.legs) ? parsed.legs : []);
  const rawItems = Array.isArray(parsed.items) ? parsed.items : reconstructSettlementItems(row, legs);
  return {
    stake: toNumber(row.settlement_stake ?? parsed.stake),
    returnedAmount: toNumber(row.settlement_returned_amount ?? parsed.returnedAmount),
    profit: toNumber(row.settlement_profit ?? parsed.profit),
    status: row.settlement_status ?? (parsed.status === "void" ? "void" : "settled"),
    hit: parsed.hit === true,
    legs,
    items: rawItems.flatMap((item) => {
      if (!isRecord(item)) return [];
      const itemLegs = Array.isArray(item.legs) ? parseSettlementLegs(item.legs) : [];
      return [
        {
          type: item.type === "parlay" ? "parlay" : "single",
          name: typeof item.name === "string" ? item.name : null,
          stake: toNumber(item.stake),
          returnedAmount: toNumber(item.returnedAmount),
          won: item.won === true,
          voided: item.voided === true,
          legs: itemLegs
        }
      ];
    }),
    settledAt: row.settled_at ?? ""
  };
}
```

- [ ] **Step 4: Run focused API test**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- bettingArenaRepository.test.ts -t "reconstructs non-zero settlement item amounts"
```

Expected: PASS.

---

### Task 2: Add Complete Betting Ledger API

**Files:**
- Modify: `packages/shared/src/types.ts`
- Modify: `apps/api/src/modules/betting-arena/bettingArena.repository.ts`
- Modify: `apps/api/src/modules/betting-arena/bettingArena.service.ts`
- Modify: `apps/api/src/modules/public/public.routes.ts`
- Test: `apps/api/test/bettingArenaRepository.test.ts`
- Test: `apps/api/test/bettingArenaApi.test.ts`

**Interfaces:**
- Produces shared DTOs:
  - `BettingArenaLedgerItemDto`
  - `BettingArenaLedgerDto`
- Produces repository function:
  - `listBettingArenaLedger(db: Database, input?: { modelId?: string | null; limit?: number; offset?: number }): BettingArenaLedgerDto`
- Produces service function:
  - `getBettingArenaLedger(db: Database, input?: { modelId?: string | null; limit?: number; offset?: number }): BettingArenaLedgerDto`
- Produces route:
  - `GET /api/public/betting-arena/ledger?modelId=<id>&limit=<n>&offset=<n>`

- [ ] **Step 1: Add shared ledger DTO test compile target**

Modify imports in `apps/api/test/bettingArenaApi.test.ts` only if the test needs a local response type. The test will use response JSON, so no shared import is required.

- [ ] **Step 2: Add shared DTOs**

Add after `BettingArenaDto` in `packages/shared/src/types.ts`:

```ts
export interface BettingArenaLedgerItemDto {
  round: BettingArenaRoundDto;
  slip: BettingArenaSlipDto;
}

export interface BettingArenaLedgerDto {
  items: BettingArenaLedgerItemDto[];
  total: number;
  limit: number;
  offset: number;
  modelId: string | null;
}
```

- [ ] **Step 3: Write failing repository ledger test**

Add this test to `apps/api/test/bettingArenaRepository.test.ts`:

```ts
  it("lists betting ledger items across historical rounds with model filtering", () => {
    const { db } = createTestDatabase();
    insertModel(db, "model-1", "Model One");
    insertModel(db, "model-2", "Model Two");
    insertMatch(db, "match-1");
    ensureBettingArenaAccounts(db, new Date("2026-06-20T00:00:00.000Z"));
    const battleContext = buildBattleContext(db, {
      roundDate: "2026-06-20",
      lockTime: "2026-06-20T10:00:00.000Z",
      externalIntel: { summary: "统一外部情报未配置", dataGaps: ["未配置外部联网情报采集"] }
    });
    const firstRound = createBettingArenaRound(db, {
      roundDate: "2026-06-20",
      lockTime: "2026-06-20T10:00:00.000Z",
      battleContext,
      externalIntel: { summary: "统一外部情报未配置", dataGaps: ["未配置外部联网情报采集"] },
      now: new Date("2026-06-20T00:00:00.000Z")
    });
    db.prepare("UPDATE betting_arena_rounds SET status = ? WHERE id = ?").run("settled", firstRound.id);
    const secondRound = createBettingArenaRound(db, {
      roundDate: "2026-06-20",
      lockTime: "2026-06-20T18:00:00.000Z",
      battleContext,
      externalIntel: { summary: "统一外部情报未配置", dataGaps: ["未配置外部联网情报采集"] },
      now: new Date("2026-06-20T12:00:00.000Z")
    });
    insertBetSlip(db, {
      id: "slip-ledger-1",
      roundId: firstRound.id,
      modelId: "model-1",
      totalStake: 100,
      potentialReturn: 185,
      parsedSlip: { action: "bet", singles: [], parlays: [], portfolioBuckets: [], skipReasons: [], dataGaps: [] }
    });
    insertBetSlip(db, {
      id: "slip-ledger-2",
      roundId: secondRound.id,
      modelId: "model-2",
      totalStake: 0,
      potentialReturn: 0,
      parsedSlip: { action: "hold", singles: [], parlays: [], portfolioBuckets: [], skipReasons: ["没有优势"], dataGaps: [] }
    });

    const allLedger = listBettingArenaLedger(db, { limit: 10, offset: 0 });
    const modelLedger = listBettingArenaLedger(db, { modelId: "model-1", limit: 10, offset: 0 });

    expect(allLedger.total).toBe(2);
    expect(allLedger.items.map((item) => item.slip.id)).toEqual(["slip-ledger-2", "slip-ledger-1"]);
    expect(modelLedger).toMatchObject({ total: 1, modelId: "model-1", limit: 10, offset: 0 });
    expect(modelLedger.items[0]?.round.roundId).toBeUndefined();
    expect(modelLedger.items[0]?.round.id).toBe(firstRound.id);
    expect(modelLedger.items[0]?.slip.modelDisplayName).toBe("Model One");
    db.close();
  });
```

Add `listBettingArenaLedger` to the import list at the top of the file.

- [ ] **Step 4: Run repository ledger test to verify it fails**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- bettingArenaRepository.test.ts -t "lists betting ledger items"
```

Expected: FAIL because `listBettingArenaLedger` is not exported.

- [ ] **Step 5: Implement `listBettingArenaLedger`**

In `apps/api/src/modules/betting-arena/bettingArena.repository.ts`, import `BettingArenaLedgerDto` from shared. Then add below `getBettingArenaSummary`:

```ts
export function listBettingArenaLedger(
  db: Database,
  input: { modelId?: string | null; limit?: number; offset?: number } = {}
): BettingArenaLedgerDto {
  ensureBettingArenaAccounts(db);
  const modelId = input.modelId ?? null;
  const limit = Math.max(1, Math.min(100, Math.trunc(input.limit ?? 50)));
  const offset = Math.max(0, Math.trunc(input.offset ?? 0));
  const whereSql = modelId ? "WHERE betting_arena_slips.model_id = ? AND ai_models.deleted_at IS NULL" : "WHERE ai_models.deleted_at IS NULL";
  const countParams = modelId ? [modelId] : [];
  const totalRow = db
    .prepare(
      `
        SELECT COUNT(*) AS total
        FROM betting_arena_slips
        INNER JOIN ai_models ON ai_models.id = betting_arena_slips.model_id
        ${whereSql}
      `
    )
    .get(...countParams) as { total: number };
  const rows = db
    .prepare(
      `
        SELECT
          betting_arena_rounds.id,
          betting_arena_rounds.round_date,
          betting_arena_rounds.round_sequence,
          betting_arena_rounds.status,
          betting_arena_rounds.lock_time,
          betting_arena_rounds.battle_context_json,
          betting_arena_rounds.created_at,
          betting_arena_rounds.updated_at,
          COALESCE(betting_arena_slips.total_stake, 0) AS total_staked,
          COALESCE(betting_arena_slips.potential_return, 0) AS potential_return,
          COALESCE(betting_arena_settlements.returned_amount, 0) AS settled_return,
          betting_arena_slips.id AS slip_id
        FROM betting_arena_slips
        INNER JOIN betting_arena_rounds ON betting_arena_rounds.id = betting_arena_slips.round_id
        INNER JOIN ai_models ON ai_models.id = betting_arena_slips.model_id
        LEFT JOIN betting_arena_settlements ON betting_arena_settlements.slip_id = betting_arena_slips.id
        ${whereSql}
        ORDER BY betting_arena_rounds.round_date DESC, betting_arena_rounds.round_sequence DESC, betting_arena_slips.created_at DESC
        LIMIT ? OFFSET ?
      `
    )
    .all(...countParams, limit, offset) as Array<RoundRow & { slip_id: string }>;
  const items = rows.flatMap((row) => {
    const round = toRoundDto(db, row, countAccounts(db));
    const slip = listRoundSlips(db, round.id, round.battleContext).find((entry) => entry.id === row.slip_id);
    return slip ? [{ round, slip }] : [];
  });
  return {
    items,
    total: toNumber(totalRow.total),
    limit,
    offset,
    modelId
  };
}
```

- [ ] **Step 6: Add service and route**

In `apps/api/src/modules/betting-arena/bettingArena.service.ts`, import `BettingArenaLedgerDto` and `listBettingArenaLedger`, then add:

```ts
export function getBettingArenaLedger(
  db: Database,
  input: { modelId?: string | null; limit?: number; offset?: number } = {}
): BettingArenaLedgerDto {
  return listBettingArenaLedger(db, input);
}
```

In `apps/api/src/modules/public/public.routes.ts`, add `getBettingArenaLedger` to the betting arena service import and add this route before `GET /betting-arena/rounds/:roundId`:

```ts
  app.get<{ Querystring: { modelId?: string; limit?: string; offset?: string } }>("/betting-arena/ledger", async (request) =>
    getBettingArenaLedger(options.db, {
      modelId: request.query.modelId ?? null,
      limit: request.query.limit ? Number(request.query.limit) : undefined,
      offset: request.query.offset ? Number(request.query.offset) : undefined
    })
  );
```

- [ ] **Step 7: Write public route test**

Add to `apps/api/test/bettingArenaApi.test.ts`:

```ts
  it("returns betting arena ledger history through the public API", async () => {
    const { app, db } = await buildTestApp();
    const round = createBettingArenaRound(db, {
      roundDate: "2026-06-20",
      lockTime: "2026-06-20T10:00:00.000Z",
      battleContext: {
        roundDate: "2026-06-20",
        lockTime: "2026-06-20T10:00:00.000Z",
        matches: [],
        externalIntel: { summary: "统一外部情报未配置", dataGaps: [] }
      },
      externalIntel: { summary: "统一外部情报未配置", dataGaps: [] },
      now: new Date("2026-06-20T00:00:00.000Z")
    });
    db.prepare(
      `
        INSERT INTO betting_arena_slips (
          id, round_id, model_id, action, status, total_stake, potential_return, risk_level,
          raw_response, output_json, parsed_slip_json, account_context_json, validation_error, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    ).run(
      "slip-ledger-api",
      round.id,
      "model-1",
      "hold",
      "accepted",
      0,
      0,
      "low",
      "{}",
      "{}",
      JSON.stringify({ action: "hold", strategySummary: "观望", singles: [], parlays: [], portfolioBuckets: [], skipReasons: ["没有优势"], dataGaps: [] }),
      "{}",
      null,
      "2026-06-20T10:00:00.000Z",
      "2026-06-20T10:00:00.000Z"
    );

    const response = await app.inject({ method: "GET", url: "/api/public/betting-arena/ledger?modelId=model-1&limit=10&offset=0" });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body).toMatchObject({ total: 1, limit: 10, offset: 0, modelId: "model-1" });
    expect(body.items[0].slip.id).toBe("slip-ledger-api");
    await app.close();
    db.close();
  });
```

- [ ] **Step 8: Run focused API tests**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- bettingArenaRepository.test.ts bettingArenaApi.test.ts -t "ledger"
```

Expected: PASS.

---

### Task 3: Rebuild Betting Arena Frontend Data Flow

**Files:**
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `apps/web/src/api/client.ts`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/pages/BettingArenaPage.tsx`
- Test: `apps/web/test/client.test.ts`
- Test: `apps/web/test/app.test.tsx`
- Test: `apps/web/test/bettingArenaPage.test.tsx`

**Interfaces:**
- Consumes: `BettingArenaLedgerDto`
- Produces API client function:
  - `getBettingArenaLedger(params?: { modelId?: string | null; limit?: number; offset?: number }): Promise<BettingArenaLedgerDto>`
- Produces page prop:
  - `onLoadLedger?: (params?: { modelId?: string | null; limit?: number; offset?: number }) => Promise<BettingArenaLedgerDto>`

- [ ] **Step 1: Add icon dependency**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/web add lucide-react
```

Expected: `apps/web/package.json` contains `lucide-react` in `dependencies`, and `pnpm-lock.yaml` updates.

- [ ] **Step 2: Add client test**

In `apps/web/test/client.test.ts`, add a test matching the current request mock style in that file:

```ts
  it("loads betting arena ledger with query parameters", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [], total: 0, limit: 25, offset: 50, modelId: "model-1" })
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await getBettingArenaLedger({ modelId: "model-1", limit: 25, offset: 50 });

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/public/betting-arena/ledger?modelId=model-1&limit=25&offset=50"), {
      cache: "no-store"
    });
    expect(result).toEqual({ items: [], total: 0, limit: 25, offset: 50, modelId: "model-1" });
  });
```

Add `getBettingArenaLedger` to the import list in the same file.

- [ ] **Step 3: Implement client function**

In `apps/web/src/api/client.ts`, import `BettingArenaLedgerDto` and add after `getBettingArenaRound`:

```ts
export async function getBettingArenaLedger(params: { modelId?: string | null; limit?: number; offset?: number } = {}): Promise<BettingArenaLedgerDto> {
  const query = new URLSearchParams();
  if (params.modelId) query.set("modelId", params.modelId);
  if (typeof params.limit === "number") query.set("limit", String(params.limit));
  if (typeof params.offset === "number") query.set("offset", String(params.offset));
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const response = await request(`${apiBaseUrl}/api/public/betting-arena/ledger${suffix}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Public betting arena ledger request failed with status ${response.status}`);
  }
  return (await response.json()) as BettingArenaLedgerDto;
}
```

- [ ] **Step 4: Update App wiring**

In `apps/web/src/App.tsx`, add `getBettingArenaLedger` to imports from `./api/client`, then pass:

```tsx
        onLoadLedger={getBettingArenaLedger}
```

to `BettingArenaPage`.

- [ ] **Step 5: Write frontend behavior tests**

In `apps/web/test/bettingArenaPage.test.tsx`, update existing metric test assertions:

```ts
    expect(screen.getByText("投注项命中率 1/1")).toBeInTheDocument();
    expect(screen.getByText("盈利出单 1/1")).toBeInTheDocument();
```

Add this test:

```ts
  it("opens full model betting ledger and then opens a historical slip detail", async () => {
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

    expect(onLoadLedger).toHaveBeenCalledWith({ limit: 50, offset: 0 });
    expect(await screen.findByRole("heading", { name: "投注账本" })).toBeInTheDocument();
    expect(screen.getByText("Model One")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "查看 Model One 2026-06-20 第 1 轮投注明细" }));

    expect(screen.getByRole("heading", { name: "Model One" })).toBeInTheDocument();
    expect(screen.getByText("命中 · 返还 370 · 盈亏 170")).toBeInTheDocument();
  });
```

- [ ] **Step 6: Run focused web tests**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/web test -- client.test.ts app.test.tsx bettingArenaPage.test.tsx
```

Expected: PASS.

---

### Task 4: Rebuild Betting Arena UI and Labels

**Files:**
- Modify: `apps/web/src/pages/BettingArenaPage.tsx`
- Modify: `apps/web/src/styles.css`
- Test: `apps/web/test/bettingArenaPage.test.tsx`

**Interfaces:**
- Consumes existing `BettingArenaPageProps`
- Adds optional prop `onLoadLedger`
- Preserves existing buttons:
  - `投注输入面板`
  - `生成今日出单`
  - `手动同步结算`
  - detail dialogs for slips

- [ ] **Step 1: Update page imports and props**

In `apps/web/src/pages/BettingArenaPage.tsx`, change the imports to:

```ts
import type { BettingArenaDto, BettingArenaLedgerDto, BettingArenaRoundDto, BettingArenaRoundStatus, BettingArenaSlipDto } from "@worldcup-ai-pk/shared";
import { BarChart3, ChevronRight, CircleDollarSign, ClipboardList, FileText, History, Loader2, Play, ReceiptText, RefreshCw, Trophy } from "lucide-react";
import { useMemo, useState } from "react";
```

Add prop:

```ts
  onLoadLedger?: (params?: { modelId?: string | null; limit?: number; offset?: number }) => Promise<BettingArenaLedgerDto>;
```

- [ ] **Step 2: Add ledger state**

Inside `BettingArenaPage`, add:

```ts
  const [ledger, setLedger] = useState<BettingArenaLedgerDto | null>(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerError, setLedgerError] = useState<string | null>(null);
  const [ledgerModelId, setLedgerModelId] = useState<string | null>(null);
```

Add function:

```ts
  async function loadLedger(modelId: string | null = null) {
    if (!onLoadLedger) return;
    setLedgerLoading(true);
    setLedgerError(null);
    setLedgerModelId(modelId);
    try {
      const nextLedger = await onLoadLedger({ modelId, limit: 50, offset: 0 });
      setLedger(nextLedger);
    } catch {
      setLedgerError("投注账本加载失败，请稍后重试。");
    } finally {
      setLedgerLoading(false);
    }
  }
```

- [ ] **Step 3: Replace account and order row copy**

Change metric text:

```tsx
<span>投注项命中率 {account.hitPickCount}/{account.settledPickCount}</span>
<span>盈利出单 {account.profitableSlipCount}/{account.settledOrderCount}</span>
```

Keep `收益率 {percent(account.returnRate)}`.

- [ ] **Step 4: Replace current order action layout**

Replace the current `arena-slip-row` content with a card header/action layout:

```tsx
<div className="arena-slip-card" key={account.modelId}>
  <button
    aria-label={slip ? `${account.modelDisplayName} 投注详情` : `${account.modelDisplayName} 暂无出单`}
    className="arena-slip-card-main"
    type="button"
    onClick={() => (slip ? openSlipDetail(slip, arena?.currentRound) : null)}
    disabled={!slip}
  >
    <div className="arena-slip-card-title">
      <ReceiptText size={18} aria-hidden="true" />
      <div>
        <strong>{account.modelDisplayName}</strong>
        <span>{slip ? `${actionLabel(slip.action)} · ${statusLabel(slip.status)}` : "暂无出单"}</span>
      </div>
    </div>
    <div className="arena-slip-card-metrics">
      <span>投入 {money(slip?.totalStake ?? 0)}</span>
      <span>{settlement ? `返还 ${money(settlement.returnedAmount)}` : `潜在 ${money(slip?.potentialReturn ?? 0)}`}</span>
      <span className={profit === null || profit >= 0 ? "arena-profit-positive" : "arena-profit-negative"}>
        {profit === null ? "待结算" : `盈亏 ${profit >= 0 ? "+" : ""}${money(profit)}`}
      </span>
    </div>
  </button>
  <div className="arena-slip-card-actions">
    <button
      aria-label={`生成 ${account.modelDisplayName} 投注单`}
      className="icon-action-button"
      type="button"
      onClick={() => triggerModel(account.modelId, account.modelDisplayName)}
      disabled={!arena?.currentRound || busyModelIds.has(account.modelId)}
    >
      {busyModelIds.has(account.modelId) ? <Loader2 size={17} aria-hidden="true" /> : <Play size={17} aria-hidden="true" />}
      <span>{busyModelIds.has(account.modelId) ? "生成中" : "单独生成"}</span>
    </button>
    <button
      aria-label={`查看 ${account.modelDisplayName} 投注账本`}
      className="icon-action-button icon-action-button-secondary"
      type="button"
      onClick={() => loadLedger(account.modelId)}
      disabled={!onLoadLedger || ledgerLoading}
    >
      <History size={17} aria-hidden="true" />
      <span>账本</span>
    </button>
  </div>
</div>
```

- [ ] **Step 5: Add global ledger button and drawer**

Add beside the history panel header:

```tsx
<button className="app-button app-button-secondary" type="button" onClick={() => loadLedger(null)} disabled={!onLoadLedger || ledgerLoading}>
  <ClipboardList size={16} aria-hidden="true" />
  查看投注账本
</button>
```

Add drawer before the selected slip drawer:

```tsx
{ledger ? (
  <div className="arena-detail-drawer" role="dialog" aria-modal="true">
    <div className="arena-detail-panel arena-ledger-panel">
      <div className="arena-detail-header">
        <div>
          <p className="eyebrow">{ledgerModelId ? "模型投注流水" : "全量投注流水"}</p>
          <h3>投注账本</h3>
        </div>
        <button className="app-button app-button-secondary" type="button" onClick={() => setLedger(null)}>
          关闭
        </button>
      </div>
      {ledgerError ? <p className="status-line error">{ledgerError}</p> : null}
      <div className="arena-ledger-list">
        {ledger.items.map((item) => {
          const stats = getSlipSettlementStats(item.slip);
          return (
            <button
              aria-label={`查看 ${item.slip.modelDisplayName} ${roundLabel(item.round)}投注明细`}
              className="arena-ledger-row"
              key={item.slip.id}
              type="button"
              onClick={() => openSlipDetail(item.slip, item.round)}
            >
              <div>
                <strong>{item.slip.modelDisplayName}</strong>
                <span>{roundLabel(item.round)} · {actionLabel(item.slip.action)} · {statusLabel(item.slip.status)}</span>
              </div>
              <span>投入 {money(item.slip.totalStake)}</span>
              <span>返还 {money(stats.returnedAmount)}</span>
              <span className={stats.profit >= 0 ? "arena-profit-positive" : "arena-profit-negative"}>
                盈亏 {stats.profit >= 0 ? "+" : ""}{money(stats.profit)}
              </span>
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          );
        })}
      </div>
      {ledger.items.length === 0 ? <p className="muted">暂无投注流水。</p> : null}
    </div>
  </div>
) : null}
```

- [ ] **Step 6: Add responsive CSS**

Append to `apps/web/src/styles.css`:

```css
.icon-action-button {
  align-items: center;
  background: #123d35;
  border: 0;
  border-radius: 7px;
  color: #ffffff;
  cursor: pointer;
  display: inline-flex;
  font: inherit;
  font-size: 13px;
  font-weight: 800;
  gap: 7px;
  justify-content: center;
  min-height: 38px;
  padding: 8px 11px;
  white-space: nowrap;
}

.icon-action-button-secondary {
  background: #edf4f1;
  color: #123d35;
}

.icon-action-button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.arena-slip-card {
  align-items: stretch;
  background: #ffffff;
  border: 1px solid #d8dee4;
  border-radius: 8px;
  display: grid;
  gap: 12px;
  grid-template-columns: minmax(0, 1fr) auto;
  padding: 12px;
}

.arena-slip-card-main {
  background: transparent;
  border: 0;
  color: inherit;
  cursor: pointer;
  display: grid;
  gap: 12px;
  grid-template-columns: minmax(180px, 1fr) minmax(260px, 1.2fr);
  padding: 0;
  text-align: left;
}

.arena-slip-card-main:disabled {
  cursor: default;
  opacity: 0.7;
}

.arena-slip-card-title {
  align-items: center;
  display: flex;
  gap: 10px;
  min-width: 0;
}

.arena-slip-card-title div,
.arena-slip-card-title strong,
.arena-slip-card-title span {
  min-width: 0;
}

.arena-slip-card-title span {
  color: #5b6870;
  display: block;
  font-size: 13px;
  margin-top: 4px;
}

.arena-slip-card-metrics {
  align-items: center;
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.arena-slip-card-metrics span {
  background: #f5f7f8;
  border-radius: 7px;
  font-size: 13px;
  font-weight: 800;
  padding: 9px 10px;
  text-align: center;
}

.arena-slip-card-actions {
  align-items: center;
  display: flex;
  gap: 8px;
}

.arena-ledger-panel {
  max-width: min(1040px, calc(100vw - 40px));
}

.arena-ledger-list {
  display: grid;
  gap: 10px;
}

.arena-ledger-row {
  align-items: center;
  background: #ffffff;
  border: 1px solid #d8dee4;
  border-radius: 8px;
  color: inherit;
  cursor: pointer;
  display: grid;
  gap: 12px;
  grid-template-columns: minmax(220px, 1fr) repeat(3, minmax(90px, auto)) auto;
  padding: 12px;
  text-align: left;
}

.arena-ledger-row span {
  color: #50606a;
  font-size: 13px;
}

@media (max-width: 760px) {
  .arena-slip-card,
  .arena-slip-card-main,
  .arena-slip-card-metrics,
  .arena-ledger-row {
    grid-template-columns: 1fr;
  }

  .arena-slip-card-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }

  .arena-slip-card-metrics span {
    text-align: left;
  }

  .arena-ledger-panel {
    max-width: calc(100vw - 20px);
  }
}
```

- [ ] **Step 7: Run focused UI tests**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/web test -- bettingArenaPage.test.tsx
```

Expected: PASS.

---

### Task 5: Full Verification and Browser Check

**Files:**
- No source file changes unless verification exposes a defect.

**Interfaces:**
- Verifies existing API, shared types, web UI, and local rendered behavior.

- [ ] **Step 1: Run full automated checks**

Run:

```bash
corepack pnpm test
corepack pnpm typecheck
```

Expected: both commands finish with successful exit codes.

- [ ] **Step 2: Scan for forbidden uncertainty word**

Run:

```bash
rg -n "candi""date" apps packages docs -g '!node_modules'
```

Expected: no matches.

- [ ] **Step 3: Browser smoke test**

Open `http://localhost:5173/` and verify:

- AI 实盘投注场 loads without console errors.
- Current order cards do not overlap on desktop.
- Model row has separate icon buttons for generation and ledger.
- `查看投注账本` opens a large ledger dialog.
- Clicking a ledger row opens that model's slip detail.
- Legacy settlement detail rows show non-zero stake and returned amount when the slip had a stake.
- Mobile viewport around 390px wide keeps buttons and metric chips stacked without text overlap.

- [ ] **Step 4: Final git inspection**

Run:

```bash
git status --short
git diff -- apps/api/src/modules/betting-arena/bettingArena.repository.ts packages/shared/src/types.ts apps/web/src/pages/BettingArenaPage.tsx apps/web/src/styles.css
```

Expected: only planned files and previously existing unrelated dirty files are present.

---

## Self-Review

**Spec coverage:**  
结算明细全 0 is covered by Task 1. 盈利出单率解释 and clearer presentation are covered by Task 4. UI overlap, icon controls, and richer secondary dialogs are covered by Task 4 and Task 5. Model historical betting results and all past betting details are covered by Task 2 and Task 3.

**Placeholder scan:**  
The plan contains no unresolved work markers and no undefined route names. New route and DTO names are defined in this plan before use.

**Type consistency:**  
The ledger uses `BettingArenaLedgerDto`, `BettingArenaLedgerItemDto`, `BettingArenaRoundDto`, and `BettingArenaSlipDto` consistently across shared types, API repository, service, public route, client, and frontend prop wiring.
