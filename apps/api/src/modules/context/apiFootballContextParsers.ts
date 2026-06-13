import type { FixtureContextDomainStatus } from "@worldcup-ai-pk/shared";

interface ParsedContextDomain {
  status: FixtureContextDomainStatus;
  summary: string;
  raw: unknown;
}

function getResponseArray(response: unknown): unknown[] {
  if (!response || typeof response !== "object" || !("response" in response)) {
    return [];
  }

  const value = (response as { response: unknown }).response;
  return Array.isArray(value) ? value : [];
}

function stringifyOdd(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function parseFixtureOddsSummary(response: unknown): ParsedContextDomain {
  const first = getResponseArray(response)[0];
  if (!first || typeof first !== "object" || !("bookmakers" in first)) {
    return { status: "unavailable", summary: "未获取赔率", raw: response };
  }

  const bookmakers = (first as { bookmakers: unknown }).bookmakers;
  const firstBookmaker = Array.isArray(bookmakers) ? bookmakers[0] : null;
  if (!firstBookmaker || typeof firstBookmaker !== "object") {
    return { status: "unavailable", summary: "未获取赔率", raw: response };
  }

  const bookmakerName = typeof (firstBookmaker as { name?: unknown }).name === "string" ? (firstBookmaker as { name: string }).name : "Bookmaker";
  const bets = (firstBookmaker as { bets?: unknown }).bets;
  const matchWinnerBet = Array.isArray(bets)
    ? bets.find((bet) => typeof bet === "object" && bet && (bet as { name?: unknown }).name === "Match Winner")
    : null;

  if (!matchWinnerBet || typeof matchWinnerBet !== "object") {
    return { status: "unavailable", summary: "未获取胜平负赔率", raw: response };
  }

  const values = (matchWinnerBet as { values?: unknown }).values;
  const rows = Array.isArray(values) ? values : [];
  const home = rows.find((row) => typeof row === "object" && row && (row as { value?: unknown }).value === "Home") as { odd?: unknown } | undefined;
  const draw = rows.find((row) => typeof row === "object" && row && (row as { value?: unknown }).value === "Draw") as { odd?: unknown } | undefined;
  const away = rows.find((row) => typeof row === "object" && row && (row as { value?: unknown }).value === "Away") as { odd?: unknown } | undefined;

  const homeOdd = stringifyOdd(home?.odd);
  const drawOdd = stringifyOdd(draw?.odd);
  const awayOdd = stringifyOdd(away?.odd);

  if (!homeOdd || !drawOdd || !awayOdd) {
    return { status: "unavailable", summary: "未获取完整胜平负赔率", raw: response };
  }

  return {
    status: "cached",
    summary: `${bookmakerName}：主胜 ${homeOdd}，平局 ${drawOdd}，客胜 ${awayOdd}`,
    raw: response
  };
}

export function parseApiFootballFixturePrediction(response: unknown): ParsedContextDomain {
  const first = getResponseArray(response)[0];
  if (!first || typeof first !== "object" || !("predictions" in first)) {
    return { status: "unavailable", summary: "未获取 API-Football 官方预测", raw: response };
  }

  const predictions = (first as { predictions: unknown }).predictions;
  if (!predictions || typeof predictions !== "object") {
    return { status: "unavailable", summary: "未获取 API-Football 官方预测", raw: response };
  }

  const winner = (predictions as { winner?: { name?: unknown } }).winner?.name;
  const advice = (predictions as { advice?: unknown }).advice;
  const percent = (predictions as { percent?: { home?: unknown; draw?: unknown; away?: unknown } }).percent;

  return {
    status: "cached",
    summary: `预测赢家：${typeof winner === "string" ? winner : "未给出"}；建议：${typeof advice === "string" ? advice : "未给出"}；主胜 ${
      typeof percent?.home === "string" ? percent.home : "-"
    }，平局 ${typeof percent?.draw === "string" ? percent.draw : "-"}，客胜 ${typeof percent?.away === "string" ? percent.away : "-"}`,
    raw: response
  };
}

function readNestedString(value: unknown, keys: string[]): string | null {
  let current = value;
  for (const key of keys) {
    if (!current || typeof current !== "object" || !(key in current)) {
      return null;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "string" && current.trim() ? current.trim() : null;
}

function readNestedNumber(value: unknown, keys: string[]): number | null {
  let current = value;
  for (const key of keys) {
    if (!current || typeof current !== "object" || !(key in current)) {
      return null;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "number" ? current : null;
}

export function parseFixtureHeadToHeadSummary(response: unknown): ParsedContextDomain {
  const fixtures = getResponseArray(response);
  if (fixtures.length === 0) {
    return { status: "unavailable", summary: "未获取历史交锋", raw: response };
  }

  const latestRows = fixtures.slice(0, 5).map((fixture) => {
    const homeName = readNestedString(fixture, ["teams", "home", "name"]) ?? "主队";
    const awayName = readNestedString(fixture, ["teams", "away", "name"]) ?? "客队";
    const homeGoals = readNestedNumber(fixture, ["goals", "home"]);
    const awayGoals = readNestedNumber(fixture, ["goals", "away"]);
    if (homeGoals === null || awayGoals === null) {
      return `${homeName} vs ${awayName}（比分未公布）`;
    }
    return `${homeName} ${homeGoals ?? "-"}-${awayGoals ?? "-"} ${awayName}`;
  });

  return {
    status: "cached",
    summary: `历史交锋 ${fixtures.length} 场；最近：${latestRows.join("；")}`,
    raw: response
  };
}

function getSquadPlayerCount(response: unknown): number {
  const first = getResponseArray(response)[0];
  if (!first || typeof first !== "object" || !("players" in first)) {
    return 0;
  }
  const players = (first as { players: unknown }).players;
  return Array.isArray(players) ? players.length : 0;
}

export function parseFixtureSquadSummary(input: { injuries: unknown; lineups: unknown; homeSquad: unknown; awaySquad: unknown }): ParsedContextDomain {
  const injuries = getResponseArray(input.injuries);
  const lineups = getResponseArray(input.lineups);
  const homeSquadCount = getSquadPlayerCount(input.homeSquad);
  const awaySquadCount = getSquadPlayerCount(input.awaySquad);

  if (injuries.length === 0 && lineups.length === 0 && homeSquadCount === 0 && awaySquadCount === 0) {
    return {
      status: "unavailable",
      summary: "未获取球员、阵容、伤停信息",
      raw: input
    };
  }

  const injurySummary =
    injuries.length > 0
      ? `伤停 ${injuries.length} 人：${injuries
          .slice(0, 5)
          .map((injury) => {
            const teamName = readNestedString(injury, ["team", "name"]) ?? "球队";
            const playerName = readNestedString(injury, ["player", "name"]) ?? "球员";
            const reason = readNestedString(injury, ["reason"]) ?? "原因未给出";
            return `${teamName} ${playerName} ${reason}`;
          })
          .join("；")}`
      : "伤停 0 人";
  const lineupSummary =
    lineups.length > 0
      ? `已公布阵容：${lineups
          .slice(0, 2)
          .map((lineup) => {
            const teamName = readNestedString(lineup, ["team", "name"]) ?? "球队";
            const formation = readNestedString(lineup, ["formation"]) ?? "阵型未给出";
            return `${teamName} ${formation}`;
          })
          .join("；")}`
      : "阵容未公布";
  const squadSummary = `名单人数：主队 ${homeSquadCount} 人，客队 ${awaySquadCount} 人`;

  return {
    status: "cached",
    summary: `${injurySummary}；${lineupSummary}；${squadSummary}`,
    raw: input
  };
}
