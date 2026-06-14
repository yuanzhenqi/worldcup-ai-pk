import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminPage } from "../src/pages/AdminPage";
import {
  deleteAdminAiModel,
  deleteAdminAiProvider,
  deleteAdminPromptTemplate,
  listAdminContextCacheLogs,
  syncAdminSportteryMappings,
  testAdminAiModel,
  updateAdminPromptTemplate
} from "../src/api/client";

const { model, promptTemplate, provider } = vi.hoisted(() => ({
  provider: {
    id: "provider-1",
    name: "openrouter",
    displayName: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    enabled: true,
    apiKeyConfigured: true
  },
  model: {
    id: "model-1",
    providerId: "provider-1",
    modelName: "openai/gpt-4o-mini",
    displayName: "GPT-4o mini",
    enabled: true
  },
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
  getAdminSportterySettings: vi.fn().mockResolvedValue({ enabled: true }),
  getAdminSummary: vi.fn().mockResolvedValue({ matchCount: 72, scheduledCount: 70, liveCount: 0, finishedCount: 2, latestSyncLog: null }),
  listAdminSportteryMappings: vi.fn().mockResolvedValue([{ apiFootballFixtureId: 1001, sportteryMatchId: 2040170, updatedAt: "2026-06-14T08:00:00.000Z" }]),
  listAdminAiProviders: vi.fn().mockResolvedValue([provider]),
  listAdminAiModels: vi.fn().mockResolvedValue([model]),
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
  saveAdminSportterySettings: vi.fn().mockResolvedValue({ enabled: false }),
  syncApiFootballFixtures: vi.fn(),
  syncAdminSportteryMappings: vi.fn().mockResolvedValue({ matched: 12, unmatched: 10, totalSportteryMatches: 22 }),
  saveAdminAiProvider: vi.fn(),
  saveAdminAiModel: vi.fn(),
  testAdminAiModel: vi.fn().mockResolvedValue({ ok: true, status: 200, message: "模型测试成功", latencyMs: 128 }),
  deleteAdminAiProvider: vi.fn().mockResolvedValue({ deleted: true }),
  deleteAdminAiModel: vi.fn().mockResolvedValue({ deleted: true }),
  deleteAdminPromptTemplate: vi.fn().mockResolvedValue({ deleted: true }),
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

  it("renders and syncs sporttery data source settings", async () => {
    render(<AdminPage />);

    expect(await screen.findByText("体彩赛前情报")).toBeInTheDocument();
    expect(screen.getByText("已启用")).toBeInTheDocument();
    expect(screen.getByText("1 场已映射")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "同步体彩映射" }));

    expect(syncAdminSportteryMappings).toHaveBeenCalled();
    expect(await screen.findByText("体彩映射同步完成：匹配 12 场，未匹配 10 场")).toBeInTheDocument();
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

  it("tests and deletes providers models and prompt templates", async () => {
    render(<AdminPage />);

    fireEvent.click(await screen.findByRole("button", { name: "模型列表" }));
    fireEvent.click(await screen.findByRole("button", { name: "测试 GPT-4o mini" }));
    expect(testAdminAiModel).toHaveBeenCalledWith("model-1");
    expect(await screen.findByText("模型测试成功，耗时 128ms")).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "删除 GPT-4o mini" }));
    expect(deleteAdminAiModel).toHaveBeenCalledWith("model-1");

    fireEvent.click(await screen.findByRole("button", { name: "模型供应商" }));
    fireEvent.click(await screen.findByRole("button", { name: "删除 OpenRouter" }));
    expect(deleteAdminAiProvider).toHaveBeenCalledWith("provider-1");

    fireEvent.click(await screen.findByRole("button", { name: "提示词模板" }));
    fireEvent.click(await screen.findByRole("button", { name: "删除 稳健胜平负预测" }));
    expect(deleteAdminPromptTemplate).toHaveBeenCalledWith("prompt-1");
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
