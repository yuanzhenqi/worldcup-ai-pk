import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdminPage } from "../src/pages/AdminPage";

vi.mock("../src/api/client", () => ({
  getAdminApiFootballSettings: vi.fn().mockResolvedValue({ configured: true }),
  getAdminSummary: vi.fn().mockResolvedValue({ matchCount: 72, scheduledCount: 70, liveCount: 0, finishedCount: 2, latestSyncLog: null }),
  listAdminAiProviders: vi.fn().mockResolvedValue([]),
  listAdminAiModels: vi.fn().mockResolvedValue([]),
  listAdminPromptTemplates: vi.fn().mockResolvedValue([]),
  listAdminTeamDisplayNames: vi.fn().mockResolvedValue([]),
  saveAdminApiFootballKey: vi.fn(),
  syncApiFootballFixtures: vi.fn(),
  saveAdminAiProvider: vi.fn(),
  saveAdminAiModel: vi.fn(),
  saveAdminPromptTemplate: vi.fn(),
  saveAdminTeamDisplayName: vi.fn()
}));

describe("AdminPage", () => {
  it("renders configuration center modules", async () => {
    render(<AdminPage />);

    expect(await screen.findByText("数据源配置")).toBeInTheDocument();
    expect(screen.getByText("模型供应商")).toBeInTheDocument();
    expect(screen.getByText("提示词模板")).toBeInTheDocument();
    expect(screen.getByText("球队中文名")).toBeInTheDocument();
  });
});
