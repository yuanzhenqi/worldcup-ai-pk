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
