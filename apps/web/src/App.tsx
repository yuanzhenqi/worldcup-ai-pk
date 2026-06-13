import { useEffect, useState } from "react";
import type { MatchDto, PredictionRequestInputDto, PromptTemplateConfigDto } from "@worldcup-ai-pk/shared";
import {
  getMatchContext,
  getPublicMatches,
  listAdminPromptTemplates,
  refreshMatchContext,
  requestMatchPrediction,
  syncApiFootballFixtures
} from "./api/client";
import { AdminPage } from "./pages/AdminPage";
import { FixturesPage } from "./pages/FixturesPage";
import { LeaderboardPage } from "./pages/LeaderboardPage";
import "./styles.css";

export function App() {
  const [matches, setMatches] = useState<MatchDto[]>([]);
  const [promptTemplates, setPromptTemplates] = useState<PromptTemplateConfigDto[]>([]);
  const [matchesStatus, setMatchesStatus] = useState<"loading" | "loaded" | "failed">("loading");

  useEffect(() => {
    let cancelled = false;

    async function loadInitialData() {
      try {
        const [nextMatches, nextPromptTemplates] = await Promise.all([getPublicMatches(), listAdminPromptTemplates()]);
        if (!cancelled) {
          setMatches(nextMatches);
          setPromptTemplates(nextPromptTemplates);
          setMatchesStatus("loaded");
        }
      } catch {
        if (!cancelled) {
          setMatchesStatus("failed");
        }
      }
    }

    async function loadMatches() {
      try {
        const nextMatches = await getPublicMatches();
        if (!cancelled) {
          setMatches(nextMatches);
          setMatchesStatus("loaded");
        }
      } catch {
        if (!cancelled) {
          setMatchesStatus("failed");
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

  async function handleRequestPrediction(match: MatchDto, input: PredictionRequestInputDto) {
    const response = await requestMatchPrediction(match.id, input);
    try {
      setMatches(await getPublicMatches());
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
          <a href="#admin">后台</a>
        </nav>
      </header>
      <section className="intro">
        <h2>赛程、赔率与 AI 预测对比</h2>
        <p>公开页面展示比赛信息、赔率摘要、AI 预测和模型排行榜。后台仅本机访问。</p>
      </section>
      {matchesStatus === "loading" ? <p className="status-line">正在加载赛程...</p> : null}
      {matchesStatus === "failed" ? <p className="status-line error">赛程加载失败，请确认 API 服务正在运行。</p> : null}
      <FixturesPage
        matches={matches}
        promptTemplates={promptTemplates}
        onLoadMatchContext={getMatchContext}
        onRefreshMatchContext={refreshMatchContext}
        onRequestPrediction={handleRequestPrediction}
      />
      <LeaderboardPage rows={[]} />
      <AdminPage />
    </main>
  );
}
