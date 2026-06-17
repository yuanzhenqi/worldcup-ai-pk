import type { BettingArenaParlayDto, BettingArenaSingleDto } from "@worldcup-ai-pk/shared";

interface ParsedSlipLike {
  totalStake: number;
  singles: BettingArenaSingleDto[];
  parlays: BettingArenaParlayDto[];
}

interface FinishedMatch {
  matchId: string;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
}

export interface BettingArenaSettlementResult {
  stake: number;
  returnedAmount: number;
  profit: number;
  status: "settled" | "void";
  hit: boolean;
  legs: Array<{ matchId: string; won: boolean; voided: boolean }>;
}

function getMatch(matches: FinishedMatch[], matchId: string): FinishedMatch | null {
  return matches.find((match) => match.matchId === matchId) ?? null;
}

function isSelectionWon(selectionCode: string, match: FinishedMatch): boolean {
  if (match.homeScore === null || match.awayScore === null) return false;
  if (selectionCode === "h") return match.homeScore > match.awayScore;
  if (selectionCode === "d") return match.homeScore === match.awayScore;
  if (selectionCode === "a") return match.homeScore < match.awayScore;
  return false;
}

function settleSingle(single: BettingArenaSingleDto, matches: FinishedMatch[]) {
  const match = getMatch(matches, single.matchId);
  if (!match || match.status !== "finished" || match.homeScore === null || match.awayScore === null) {
    return { returnedAmount: single.stake, won: false, voided: true, matchId: single.matchId };
  }

  const won = isSelectionWon(single.selectionCode, match);
  return { returnedAmount: won ? single.stake * single.lockedOdds : 0, won, voided: false, matchId: single.matchId };
}

function settleParlay(parlay: BettingArenaParlayDto, matches: FinishedMatch[]) {
  const legs = parlay.legs.map((leg) => {
    const match = getMatch(matches, leg.matchId);
    if (!match || match.status !== "finished" || match.homeScore === null || match.awayScore === null) {
      return { matchId: leg.matchId, won: false, voided: true };
    }
    return { matchId: leg.matchId, won: isSelectionWon(leg.selectionCode, match), voided: false };
  });

  if (legs.some((leg) => leg.voided)) {
    return { returnedAmount: parlay.stake, won: false, voided: true, legs };
  }

  const won = legs.every((leg) => leg.won);
  return { returnedAmount: won ? parlay.stake * parlay.combinedOdds : 0, won, voided: false, legs };
}

export function settleParsedSlip(slip: ParsedSlipLike, matches: FinishedMatch[]): BettingArenaSettlementResult {
  const singleResults = slip.singles.map((single) => settleSingle(single, matches));
  const parlayResults = slip.parlays.map((parlay) => settleParlay(parlay, matches));
  const returnedAmount =
    singleResults.reduce((sum, result) => sum + result.returnedAmount, 0) +
    parlayResults.reduce((sum, result) => sum + result.returnedAmount, 0);
  const voided = singleResults.some((result) => result.voided) || parlayResults.some((result) => result.voided);
  const profit = returnedAmount - slip.totalStake;
  const hit = !voided && profit > 0;
  const legs = [
    ...singleResults.map((result) => ({ matchId: result.matchId, won: result.won, voided: result.voided })),
    ...parlayResults.flatMap((result) => result.legs)
  ];

  return {
    stake: slip.totalStake,
    returnedAmount,
    profit,
    status: voided ? "void" : "settled",
    hit,
    legs
  };
}
