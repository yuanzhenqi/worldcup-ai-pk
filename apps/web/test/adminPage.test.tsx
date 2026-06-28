import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminPage } from "../src/pages/AdminPage";
import {
  deleteAdminAiModel,
  deleteAdminAiProvider,
  deleteAdminPromptTemplate,
  listAdminContextCacheLogs,
  refreshAdminMatchExternalIntel,
  saveAdminExternalIntelSettings,
  syncAdminDongqiudiMappings,
  syncAdminSportteryMappings,
  testAdminAiModel,
  updateAdminAiModel,
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
    enabled: true,
    contextWindowTokens: 128000,
    maxOutputTokens: 4096,
    requestTimeoutMs: 90000,
    requestRetryCount: 1
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
  getAdminDongqiudiSettings: vi.fn().mockResolvedValue({ enabled: false }),
  getAdminExternalIntelSettings: vi.fn().mockResolvedValue({
    enabled: false,
    provider: "duckduckgo_html",
    summarizerModelId: "",
    cacheMinutes: 60,
    maxResultsPerQuery: 5,
    maxQueriesPerMatch: 8
  }),
  getAdminSportterySettings: vi.fn().mockResolvedValue({ enabled: true }),
  getAdminSummary: vi.fn().mockResolvedValue({ matchCount: 72, scheduledCount: 70, liveCount: 0, finishedCount: 2, latestSyncLog: null }),
  listAdminDongqiudiMappings: vi.fn().mockResolvedValue([]),
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
  saveAdminDongqiudiSettings: vi.fn().mockResolvedValue({ enabled: false }),
  saveAdminSportterySettings: vi.fn().mockResolvedValue({ enabled: false }),
  syncApiFootballFixtures: vi.fn(),
  syncAdminSportteryMappings: vi.fn().mockResolvedValue({ matched: 12, unmatched: 10, totalSportteryMatches: 22 }),
  saveAdminAiProvider: vi.fn(),
  saveAdminAiModel: vi.fn(),
  updateAdminAiModel: vi.fn().mockResolvedValue(model),
  testAdminAiModel: vi.fn().mockResolvedValue({ ok: true, status: 200, message: "模型测试成功", latencyMs: 128 }),
  deleteAdminAiProvider: vi.fn().mockResolvedValue({ deleted: true }),
  deleteAdminAiModel: vi.fn().mockResolvedValue({ deleted: true }),
  deleteAdminDongqiudiMapping: vi.fn().mockResolvedValue({ deleted: true }),
  deleteAdminPromptTemplate: vi.fn().mockResolvedValue({ deleted: true }),
  saveAdminPromptTemplate: vi.fn(),
  updateAdminPromptTemplate: vi.fn().mockResolvedValue(promptTemplate),
  saveAdminTeamDisplayName: vi.fn(),
  saveAdminDongqiudiMapping: vi.fn().mockResolvedValue({ apiFootballFixtureId: 1001, dongqiudiMatchId: 12345, updatedAt: "2026-06-14T08:00:00.000Z" }),
  syncAdminDongqiudiMappings: vi.fn().mockResolvedValue({ matched: 3, unmatched: 1, totalDongqiudiMatches: 4 }),
  refreshAdminMatchExternalIntel: vi.fn().mockResolvedValue({ status: "cached" }),
  saveAdminExternalIntelSettings: vi.fn().mockResolvedValue({
    enabled: false,
    provider: "duckduckgo_html",
    summarizerModelId: "",
    cacheMinutes: 60,
    maxResultsPerQuery: 5,
    maxQueriesPerMatch: 8
  })
}));

describe("AdminPage", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders configuration center modules", async () => {
    render(<AdminPage />);

    expect(await screen.findByText("数据源配置")).toBeInTheDocument();
    expect(screen.getByText("外部情报")).toBeInTheDocument();
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

  it("syncs dongqiudi mappings with one click", async () => {
    render(<AdminPage />);

    fireEvent.click(await screen.findByRole("button", { name: "懂球帝" }));
    fireEvent.click(screen.getByRole("button", { name: "同步懂球帝映射" }));

    expect(syncAdminDongqiudiMappings).toHaveBeenCalledWith();
    expect(
      await screen.findByText("懂球帝映射同步完成：匹配 3 场，未匹配 1 场（懂球帝共 4 场）")
    ).toBeInTheDocument();
  });

  it("edits external intelligence settings", async () => {
    render(<AdminPage />);

    fireEvent.click(await screen.findByRole("button", { name: "数据源" }));
    fireEvent.click(await screen.findByRole("button", { name: "外部情报" }));
    fireEvent.click(screen.getByLabelText("启用统一外部情报"));
    fireEvent.change(screen.getByLabelText("总结模型"), { target: { value: "model-1" } });
    fireEvent.change(screen.getByLabelText("缓存分钟"), { target: { value: "45" } });
    fireEvent.change(screen.getByLabelText("每次查询结果数"), { target: { value: "7" } });
    fireEvent.change(screen.getByLabelText("每场查询数"), { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: "保存外部情报配置" }));

    expect(saveAdminExternalIntelSettings).toHaveBeenCalledWith({
      enabled: true,
      provider: "duckduckgo_html",
      summarizerModelId: "model-1",
      cacheMinutes: 45,
      maxResultsPerQuery: 7,
      maxQueriesPerMatch: 6
    });
  });

  it("refreshes external intelligence for a match", async () => {
    render(<AdminPage />);

    fireEvent.click(await screen.findByRole("button", { name: "外部情报" }));
    fireEvent.change(screen.getByLabelText("比赛 ID"), { target: { value: "match-1" } });
    fireEvent.click(screen.getByRole("button", { name: "刷新比赛外部情报" }));

    expect(refreshAdminMatchExternalIntel).toHaveBeenCalledWith("match-1");
    expect(await screen.findByText("比赛外部情报已刷新")).toBeInTheDocument();
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

  it("shows model delete failures instead of failing silently", async () => {
    vi.mocked(deleteAdminAiModel).mockRejectedValueOnce(new Error("模型已有历史记录"));
    render(<AdminPage />);

    fireEvent.click(await screen.findByRole("button", { name: "模型列表" }));
    fireEvent.click(await screen.findByRole("button", { name: "删除 GPT-4o mini" }));

    expect(await screen.findByText("模型删除失败：模型已有历史记录")).toBeInTheDocument();
  });

  it("loads a model into the form and saves it through update", async () => {
    render(<AdminPage />);

    fireEvent.click(await screen.findByRole("button", { name: "模型列表" }));
    fireEvent.click(await screen.findByRole("button", { name: "编辑 GPT-4o mini" }));

    expect(screen.getByLabelText("模型标识")).toHaveValue("openai/gpt-4o-mini");
    expect(screen.getByLabelText("显示名")).toHaveValue("GPT-4o mini");
    expect(screen.getByLabelText("输出 token 上限")).toHaveValue(4096);

    fireEvent.change(screen.getByLabelText("输出 token 上限"), { target: { value: "20000" } });
    fireEvent.click(screen.getByRole("button", { name: "更新模型" }));

    expect(updateAdminAiModel).toHaveBeenCalledWith("model-1", {
      providerId: "provider-1",
      modelName: "openai/gpt-4o-mini",
      displayName: "GPT-4o mini",
      enabled: true,
      contextWindowTokens: 128000,
      maxOutputTokens: 20000,
      requestTimeoutMs: 90000,
      requestRetryCount: 1
    });
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
