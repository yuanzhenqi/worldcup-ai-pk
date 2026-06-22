import { useEffect, useState } from "react";
import type { BettingArenaDto, LeaderboardDto, MatchDto, PredictionRequestInputDto, PromptTemplateConfigDto } from "@worldcup-ai-pk/shared";
import {
  createParlayCombination,
  getBettingArena,
  getBettingArenaLedger,
  getBettingArenaRound,
  getMatchContext,
  getMatchPredictionHistory,
  getPredictionRunStatus,
  getPublicLeaderboard,
  getPublicMatches,
  listAdminPromptTemplates,
  refreshMatchContext,
  requestMatchPrediction,
  settleBettingArenaRound,
  syncApiFootballFixtures,
  triggerBettingArenaModel,
  triggerBettingArenaRound
} from "./api/client";
import { AdminPage } from "./pages/AdminPage";
import { BettingArenaPage } from "./pages/BettingArenaPage";
import { FixturesPage } from "./pages/FixturesPage";
import { LeaderboardPage } from "./pages/LeaderboardPage";
import "./styles.css";

export function App() {
  const [matches, setMatches] = useState<MatchDto[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardDto>({ settledRows: [], activeRows: [] });
  const [bettingArena, setBettingArena] = useState<BettingArenaDto | null>(null);
  const [promptTemplates, setPromptTemplates] = useState<PromptTemplateConfigDto[]>([]);
  const [matchesStatus, setMatchesStatus] = useState<"loading" | "loaded" | "failed">("loading");
  const [bettingArenaStatus, setBettingArenaStatus] = useState<"loading" | "loaded" | "failed">("loading");

  useEffect(() => {
    let cancelled = false;

    async function loadInitialData() {
      try {
        const [nextMatches, nextPromptTemplates, nextLeaderboard, nextBettingArena] = await Promise.all([
          getPublicMatches(),
          listAdminPromptTemplates(),
          getPublicLeaderboard(),
          getBettingArena()
        ]);
        if (!cancelled) {
          setMatches(nextMatches);
          setPromptTemplates(nextPromptTemplates);
          setLeaderboard(nextLeaderboard);
          setBettingArena(nextBettingArena);
          setMatchesStatus("loaded");
          setBettingArenaStatus("loaded");
        }
      } catch {
        if (!cancelled) {
          setMatchesStatus("failed");
          setBettingArenaStatus("failed");
        }
      }
    }

    async function loadMatches() {
      try {
        const [nextMatches, nextLeaderboard, nextBettingArena] = await Promise.all([getPublicMatches(), getPublicLeaderboard(), getBettingArena()]);
        if (!cancelled) {
          setMatches(nextMatches);
          setLeaderboard(nextLeaderboard);
          setBettingArena(nextBettingArena);
          setMatchesStatus("loaded");
          setBettingArenaStatus("loaded");
        }
      } catch {
        if (!cancelled) {
          setMatchesStatus("failed");
          setBettingArenaStatus("failed");
        }
      }
    }

    async function syncAndLoadMatches() {
      try {
        await syncApiFootballFixtures();
      } catch {
        // The public page can still show the last loaded schedule if sync is temporarily unavailable.
      }
      await loadMatches();
    }

    void loadInitialData();
    const refreshInterval = window.setInterval(() => {
      void syncAndLoadMatches();
    }, 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(refreshInterval);
    };
  }, []);

  useEffect(() => {
    if (bettingArena?.currentRound?.status !== "generating") return undefined;

    let cancelled = false;
    const interval = window.setInterval(() => {
      void getBettingArena()
        .then((nextArena) => {
          if (!cancelled) {
            setBettingArena(nextArena);
            setBettingArenaStatus("loaded");
          }
        })
        .catch(() => {
          if (!cancelled) {
            setBettingArenaStatus("failed");
          }
        });
    }, 5_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [bettingArena?.currentRound?.id, bettingArena?.currentRound?.status]);

  async function handleRequestPrediction(match: MatchDto, input: PredictionRequestInputDto) {
    const response = await requestMatchPrediction(match.id, input);
    try {
      setMatches(await getPublicMatches());
      setLeaderboard(await getPublicLeaderboard());
    } catch {
      // The request feedback is still useful even if the immediate refresh fails.
    }
    return response;
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">2026 世界杯</p>
          <h1>AI 模型预测 PK</h1>
        </div>
        <nav>
          <a href="#fixtures">赛程</a>
          <a href="#leaderboard">排行榜</a>
          <a href="#betting-arena">实盘投注场</a>
          <a href="#admin">后台</a>
        </nav>
      </header>
      <section className="intro">
        <h2>2026 世界杯 AI 预测竞技场</h2>
        <p>多模型同场预测，赛后真实结算，用排行榜看谁更懂比赛。</p>
      </section>
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
      <LeaderboardPage leaderboard={leaderboard} />
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
      <AdminPage />
    </main>
  );
}
