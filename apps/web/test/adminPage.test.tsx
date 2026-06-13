import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminPage } from "../src/pages/AdminPage";
import { listAdminContextCacheLogs, updateAdminPromptTemplate } from "../src/api/client";

const { promptTemplate } = vi.hoisted(() => ({
  promptTemplate: {
  id: "prompt-1",
  name: "稳健胜平负预测",
  description: "偏保守地判断胜平负结果",
  fullPrompt: "请预测 {{homeTeam}} 对阵 {{awayTeam}}。",
  promptSummary: "稳健胜平负",
  scope: "match_prediction",
  enabled: true,
  isDefault: true
  }
}));

vi.mock("../src/api/client", () => ({
  getAdminApiFootballSettings: vi.fn().mockResolvedValue({ configured: true }),
  getAdminSummary: vi.fn().mockResolvedValue({ matchCount: 72, scheduledCount: 70, liveCount: 0, finishedCount: 2, latestSyncLog: null }),
  listAdminAiProviders: vi.fn().mockResolvedValue([]),
  listAdminAiModels: vi.fn().mockResolvedValue([]),
  listAdminContextCacheLogs: vi.fn().mockResolvedValue([
    {
      matchId: "match-1",
      domain: "odds",
      status: "cached",
      error: null,
      syncedAt: "2026-06-13T08:00:00.000Z"
    }
  ]),
  listAdminPromptTemplates: vi.fn().mockResolvedValue([promptTemplate]),
  listAdminTeamDisplayNames: vi.fn().mockResolvedValue([]),
  saveAdminApiFootballKey: vi.fn(),
  syncApiFootballFixtures: vi.fn(),
  saveAdminAiProvider: vi.fn(),
  saveAdminAiModel: vi.fn(),
  saveAdminPromptTemplate: vi.fn(),
  updateAdminPromptTemplate: vi.fn().mockResolvedValue(promptTemplate),
  saveAdminTeamDisplayName: vi.fn()
}));

describe("AdminPage", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders configuration center modules", async () => {
    render(<AdminPage />);

    expect(await screen.findByText("数据源配置")).toBeInTheDocument();
    expect(screen.getByText("模型供应商")).toBeInTheDocument();
    expect(screen.getByText("提示词模板")).toBeInTheDocument();
    expect(screen.getByText("球队中文名")).toBeInTheDocument();
    expect(screen.getByText("数据缓存")).toBeInTheDocument();
  });

  it("renders context cache sync logs", async () => {
    render(<AdminPage />);

    fireEvent.click(await screen.findByRole("button", { name: "数据缓存" }));

    expect(listAdminContextCacheLogs).toHaveBeenCalled();
    expect(screen.getByText("match-1")).toBeInTheDocument();
    expect(screen.getByText("odds")).toBeInTheDocument();
    expect(screen.getByText("cached")).toBeInTheDocument();
    expect(screen.getByText("2026/6/13 16:00:00")).toBeInTheDocument();
  });

  it("loads a prompt template into the form and saves it through update", async () => {
    render(<AdminPage />);

    fireEvent.click(await screen.findByRole("button", { name: "提示词模板" }));
    fireEvent.click(await screen.findByRole("button", { name: "编辑 稳健胜平负预测" }));

    expect(screen.getByLabelText("名称")).toHaveValue("稳健胜平负预测");
    expect(screen.getByLabelText("提示词正文")).toHaveValue("请预测 {{homeTeam}} 对阵 {{awayTeam}}。");

    fireEvent.click(screen.getByRole("button", { name: "更新模板" }));

    expect(updateAdminPromptTemplate).toHaveBeenCalledWith("prompt-1", {
      name: "稳健胜平负预测",
      description: "偏保守地判断胜平负结果",
      fullPrompt: "请预测 {{homeTeam}} 对阵 {{awayTeam}}。",
      promptSummary: "稳健胜平负",
      scope: "match_prediction",
      enabled: true,
      isDefault: true
    });
  });
});
