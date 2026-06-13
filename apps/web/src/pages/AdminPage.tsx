import { FormEvent, useEffect, useState } from "react";
import type { AdminSummaryDto, AiModelConfigDto, AiProviderConfigDto, PromptTemplateConfigDto, TeamDisplayNameDto } from "@worldcup-ai-pk/shared";
import {
  type AdminContextCacheLogDto,
  captureApiFootballFixturesRaw,
  getAdminApiFootballSettings,
  getAdminSummary,
  listAdminAiModels,
  listAdminAiProviders,
  listAdminContextCacheLogs,
  listAdminPromptTemplates,
  listAdminTeamDisplayNames,
  saveAdminAiModel,
  saveAdminAiProvider,
  saveAdminApiFootballKey,
  saveAdminPromptTemplate,
  saveAdminTeamDisplayName,
  syncApiFootballFixtures,
  updateAdminPromptTemplate
} from "../api/client";

type AdminModule = "data-source" | "context-cache" | "providers" | "models" | "prompts" | "teams";

const adminModules: Array<{ id: AdminModule; label: string }> = [
  { id: "data-source", label: "数据源配置" },
  { id: "context-cache", label: "数据缓存" },
  { id: "providers", label: "模型供应商" },
  { id: "models", label: "模型列表" },
  { id: "prompts", label: "提示词模板" },
  { id: "teams", label: "球队中文名" }
];

const promptVariables = ["{{homeTeam}}", "{{awayTeam}}", "{{kickoffAt}}", "{{stage}}", "{{venue}}"];

const initialProviderForm = {
  displayName: "",
  name: "",
  baseUrl: "",
  apiKey: "",
  enabled: true
};

const initialModelForm = {
  providerId: "",
  modelName: "",
  displayName: "",
  enabled: true
};

const initialPromptForm = {
  name: "",
  description: "",
  promptSummary: "",
  scope: "match_prediction",
  fullPrompt: "",
  enabled: true,
  isDefault: false
};

export function AdminPage() {
  const [activeModule, setActiveModule] = useState<AdminModule>("data-source");
  const [apiKey, setApiKey] = useState("");
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [summary, setSummary] = useState<AdminSummaryDto | null>(null);
  const [providers, setProviders] = useState<AiProviderConfigDto[]>([]);
  const [models, setModels] = useState<AiModelConfigDto[]>([]);
  const [promptTemplates, setPromptTemplates] = useState<PromptTemplateConfigDto[]>([]);
  const [contextCacheLogs, setContextCacheLogs] = useState<AdminContextCacheLogDto[]>([]);
  const [teams, setTeams] = useState<TeamDisplayNameDto[]>([]);
  const [teamSearch, setTeamSearch] = useState("");
  const [teamEdits, setTeamEdits] = useState<Record<string, string>>({});
  const [providerForm, setProviderForm] = useState(initialProviderForm);
  const [modelForm, setModelForm] = useState(initialModelForm);
  const [promptForm, setPromptForm] = useState(initialPromptForm);
  const [editingPromptTemplateId, setEditingPromptTemplateId] = useState<string | null>(null);
  const [statusText, setStatusText] = useState("正在读取配置...");

  async function loadTeams(query = teamSearch) {
    const nextTeams = await listAdminTeamDisplayNames(query);
    setTeams(nextTeams);
    setTeamEdits(Object.fromEntries(nextTeams.map((team) => [team.apiFootballTeamId, team.displayNameZh])));
  }

  async function loadAdminData() {
    const [settings, nextSummary, nextProviders, nextModels, nextPromptTemplates, nextContextCacheLogs, nextTeams] = await Promise.all([
      getAdminApiFootballSettings(),
      getAdminSummary(),
      listAdminAiProviders(),
      listAdminAiModels(),
      listAdminPromptTemplates(),
      listAdminContextCacheLogs(),
      listAdminTeamDisplayNames("")
    ]);

    setConfigured(settings.configured);
    setSummary(nextSummary);
    setProviders(nextProviders);
    setModels(nextModels);
    setPromptTemplates(nextPromptTemplates);
    setContextCacheLogs(nextContextCacheLogs);
    setTeams(nextTeams);
    setTeamEdits(Object.fromEntries(nextTeams.map((team) => [team.apiFootballTeamId, team.displayNameZh])));
    setStatusText(settings.configured ? "API-Football key 已配置" : "API-Football key 未配置");
  }

  useEffect(() => {
    let cancelled = false;

    loadAdminData().catch(() => {
      if (!cancelled) {
        setConfigured(null);
        setStatusText("无法读取本地后台配置，请确认 API 服务正在运行");
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSaveApiFootballKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedKey = apiKey.trim();

    if (!trimmedKey) {
      setStatusText("请输入 API-Football key");
      return;
    }

    setStatusText("正在保存 API-Football key...");

    try {
      const settings = await saveAdminApiFootballKey(trimmedKey);
      setConfigured(settings.configured);
      setApiKey("");
      setStatusText("API-Football key 已保存");
    } catch {
      setStatusText("保存失败，请确认本地后台 API 可访问");
    }
  }

  async function handleSyncFixtures() {
    setStatusText("正在同步 API-Football 赛程...");

    try {
      const result = await syncApiFootballFixtures();
      setStatusText(`赛程同步完成，导入 ${result.imported} 场比赛`);
      setSummary(await getAdminSummary());
    } catch (error) {
      setStatusText(error instanceof Error ? `同步失败：${error.message}` : "同步失败，请确认 API-Football key 已配置且可用");
    }
  }

  async function handleCaptureRawFixtures() {
    setStatusText("正在抓取 API-Football 原始赛程响应...");

    try {
      await captureApiFootballFixturesRaw();
      setStatusText("原始赛程响应已写入系统日志");
    } catch (error) {
      setStatusText(error instanceof Error ? `抓取失败：${error.message}` : "抓取失败，请确认 API-Football key 已配置且可用");
    }
  }

  async function handleSaveProvider(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await saveAdminAiProvider(providerForm);
    setProviderForm(initialProviderForm);
    setProviders(await listAdminAiProviders());
    setStatusText("模型供应商已保存");
  }

  async function handleSaveModel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await saveAdminAiModel(modelForm);
    setModelForm(initialModelForm);
    setModels(await listAdminAiModels());
    setStatusText("模型配置已保存");
  }

  async function handleSavePrompt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (editingPromptTemplateId) {
      await updateAdminPromptTemplate(editingPromptTemplateId, promptForm);
    } else {
      await saveAdminPromptTemplate(promptForm);
    }
    setPromptForm(initialPromptForm);
    setEditingPromptTemplateId(null);
    setPromptTemplates(await listAdminPromptTemplates());
    setStatusText(editingPromptTemplateId ? "提示词模板已更新" : "提示词模板已保存");
  }

  function handleEditPromptTemplate(template: PromptTemplateConfigDto) {
    setEditingPromptTemplateId(template.id);
    setPromptForm({
      name: template.name,
      description: template.description,
      promptSummary: template.promptSummary,
      scope: template.scope,
      fullPrompt: template.fullPrompt,
      enabled: template.enabled,
      isDefault: template.isDefault
    });
    setStatusText(`正在编辑提示词模板：${template.name}`);
  }

  async function handleTeamSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await loadTeams(teamSearch);
  }

  async function handleSaveTeam(team: TeamDisplayNameDto) {
    await saveAdminTeamDisplayName(team.apiFootballTeamId, teamEdits[team.apiFootballTeamId] ?? team.displayNameZh);
    await loadTeams(teamSearch);
    setStatusText("球队中文名已保存");
  }

  const selectedModule = adminModules.find((module) => module.id === activeModule);

  return (
    <section id="admin" className="page-section admin-section">
      <div className="admin-heading">
        <div>
          <p className="eyebrow">Local Configuration</p>
          <h2>本地后台</h2>
        </div>
        <p className="config-status">{statusText}</p>
      </div>

      <div className="admin-layout">
        <nav className="admin-sidebar" aria-label="后台配置模块">
          {adminModules.map((module) => (
            <button
              className={activeModule === module.id ? "admin-module-button active" : "admin-module-button"}
              key={module.id}
              type="button"
              onClick={() => setActiveModule(module.id)}
            >
              {module.label}
            </button>
          ))}
        </nav>

        <div className="admin-panel">
          {activeModule === "data-source" ? (
            <>
              <header>
                <h3>比赛数据</h3>
                <span>{configured ? "API-Football key 已配置" : "API-Football key 未配置"}</span>
              </header>
              <div className="admin-summary-grid">
                <div>
                  <span>比赛</span>
                  <strong>{summary?.matchCount ?? 0}</strong>
                </div>
                <div>
                  <span>未开始</span>
                  <strong>{summary?.scheduledCount ?? 0}</strong>
                </div>
                <div>
                  <span>进行中</span>
                  <strong>{summary?.liveCount ?? 0}</strong>
                </div>
                <div>
                  <span>已结束</span>
                  <strong>{summary?.finishedCount ?? 0}</strong>
                </div>
              </div>
              <form className="admin-form-grid" onSubmit={handleSaveApiFootballKey}>
                <label>
                  <span>API-Football key</span>
                  <input
                    type="password"
                    value={apiKey}
                    placeholder={configured ? "已配置，输入新 key 可覆盖" : "输入 API-Football key"}
                    onChange={(event) => setApiKey(event.target.value)}
                  />
                </label>
                <button type="submit">保存 key</button>
              </form>
              <div className="settings-actions">
                <button type="button" onClick={handleSyncFixtures} disabled={!configured}>
                  同步赛程
                </button>
                <button type="button" onClick={handleCaptureRawFixtures} disabled={!configured}>
                  抓取原始响应
                </button>
              </div>
              {summary?.latestSyncLog ? (
                <p className="secret-note">
                  最近同步：{summary.latestSyncLog.message} · {new Date(summary.latestSyncLog.createdAt).toLocaleString("zh-CN")}
                </p>
              ) : null}
            </>
          ) : null}

          {activeModule === "providers" ? (
            <>
              <header>
                <h3>{selectedModule?.label}</h3>
                <span>{providers.length} 个供应商</span>
              </header>
              <form className="admin-form-grid" onSubmit={handleSaveProvider}>
                <label>
                  <span>显示名</span>
                  <input value={providerForm.displayName} onChange={(event) => setProviderForm({ ...providerForm, displayName: event.target.value })} required />
                </label>
                <label>
                  <span>内部名</span>
                  <input value={providerForm.name} onChange={(event) => setProviderForm({ ...providerForm, name: event.target.value })} required />
                </label>
                <label>
                  <span>Base URL</span>
                  <input value={providerForm.baseUrl} onChange={(event) => setProviderForm({ ...providerForm, baseUrl: event.target.value })} required />
                </label>
                <label>
                  <span>API key</span>
                  <input type="password" value={providerForm.apiKey} onChange={(event) => setProviderForm({ ...providerForm, apiKey: event.target.value })} required />
                </label>
                <label className="checkbox-line">
                  <input type="checkbox" checked={providerForm.enabled} onChange={(event) => setProviderForm({ ...providerForm, enabled: event.target.checked })} />
                  启用
                </label>
                <button type="submit">保存供应商</button>
              </form>
              <p className="secret-note">API key 不会明文回显，只显示是否已配置。</p>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>显示名</th>
                    <th>内部名</th>
                    <th>Base URL</th>
                    <th>状态</th>
                  </tr>
                </thead>
                <tbody>
                  {providers.map((provider) => (
                    <tr key={provider.id}>
                      <td>{provider.displayName}</td>
                      <td>{provider.name}</td>
                      <td>{provider.baseUrl}</td>
                      <td>{provider.enabled ? "启用" : "停用"} · {provider.apiKeyConfigured ? "key 已配置" : "key 未配置"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : null}

          {activeModule === "context-cache" ? (
            <>
              <header>
                <h3>{selectedModule?.label}</h3>
                <span>{contextCacheLogs.length} 条同步记录</span>
              </header>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>比赛</th>
                    <th>数据域</th>
                    <th>状态</th>
                    <th>错误</th>
                    <th>同步时间</th>
                  </tr>
                </thead>
                <tbody>
                  {contextCacheLogs.map((log) => (
                    <tr key={`${log.matchId}-${log.domain}-${log.syncedAt}`}>
                      <td>{log.matchId}</td>
                      <td>{log.domain}</td>
                      <td>{log.status}</td>
                      <td>{log.error ?? "无"}</td>
                      <td>{new Date(log.syncedAt).toLocaleString("zh-CN")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : null}

          {activeModule === "models" ? (
            <>
              <header>
                <h3>{selectedModule?.label}</h3>
                <span>{models.length} 个模型</span>
              </header>
              <form className="admin-form-grid" onSubmit={handleSaveModel}>
                <label>
                  <span>供应商</span>
                  <select value={modelForm.providerId} onChange={(event) => setModelForm({ ...modelForm, providerId: event.target.value })} required>
                    <option value="">选择供应商</option>
                    {providers.map((provider) => (
                      <option key={provider.id} value={provider.id}>
                        {provider.displayName}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>模型标识</span>
                  <input value={modelForm.modelName} onChange={(event) => setModelForm({ ...modelForm, modelName: event.target.value })} required />
                </label>
                <label>
                  <span>显示名</span>
                  <input value={modelForm.displayName} onChange={(event) => setModelForm({ ...modelForm, displayName: event.target.value })} required />
                </label>
                <label className="checkbox-line">
                  <input type="checkbox" checked={modelForm.enabled} onChange={(event) => setModelForm({ ...modelForm, enabled: event.target.checked })} />
                  启用
                </label>
                <button type="submit">保存模型</button>
              </form>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>显示名</th>
                    <th>模型标识</th>
                    <th>供应商</th>
                    <th>状态</th>
                  </tr>
                </thead>
                <tbody>
                  {models.map((model) => (
                    <tr key={model.id}>
                      <td>{model.displayName}</td>
                      <td>{model.modelName}</td>
                      <td>{providers.find((provider) => provider.id === model.providerId)?.displayName ?? model.providerId}</td>
                      <td>{model.enabled ? "启用" : "停用"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : null}

          {activeModule === "prompts" ? (
            <>
              <header>
                <h3>{selectedModule?.label}</h3>
                <span>{promptTemplates.length} 个模板</span>
              </header>
              <form className="admin-form-grid prompt-form" onSubmit={handleSavePrompt}>
                <label>
                  <span>名称</span>
                  <input value={promptForm.name} onChange={(event) => setPromptForm({ ...promptForm, name: event.target.value })} required />
                </label>
                <label>
                  <span>用途描述</span>
                  <input value={promptForm.description} onChange={(event) => setPromptForm({ ...promptForm, description: event.target.value })} />
                </label>
                <label>
                  <span>摘要</span>
                  <input value={promptForm.promptSummary} onChange={(event) => setPromptForm({ ...promptForm, promptSummary: event.target.value })} required />
                </label>
                <label>
                  <span>Scope</span>
                  <input value={promptForm.scope} onChange={(event) => setPromptForm({ ...promptForm, scope: event.target.value })} required />
                </label>
                <label className="full-width-field">
                  <span>提示词正文</span>
                  <textarea value={promptForm.fullPrompt} onChange={(event) => setPromptForm({ ...promptForm, fullPrompt: event.target.value })} required rows={8} />
                </label>
                <label className="checkbox-line">
                  <input type="checkbox" checked={promptForm.enabled} onChange={(event) => setPromptForm({ ...promptForm, enabled: event.target.checked })} />
                  启用
                </label>
                <label className="checkbox-line">
                  <input type="checkbox" checked={promptForm.isDefault} onChange={(event) => setPromptForm({ ...promptForm, isDefault: event.target.checked })} />
                  默认模板
                </label>
                <button type="submit">{editingPromptTemplateId ? "更新模板" : "保存模板"}</button>
              </form>
              <div className="variable-list">
                {promptVariables.map((variable) => (
                  <code key={variable}>{variable}</code>
                ))}
              </div>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>名称</th>
                    <th>摘要</th>
                    <th>状态</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {promptTemplates.map((template) => (
                    <tr key={template.id}>
                      <td>{template.name}</td>
                      <td>{template.promptSummary}</td>
                      <td>{template.enabled ? "启用" : "停用"}{template.isDefault ? " · 默认" : ""}</td>
                      <td>
                        <button type="button" onClick={() => handleEditPromptTemplate(template)} aria-label={`编辑 ${template.name}`}>
                          编辑
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : null}

          {activeModule === "teams" ? (
            <>
              <header>
                <h3>{selectedModule?.label}</h3>
                <span>{teams.length} 支球队</span>
              </header>
              <form className="admin-form-grid" onSubmit={handleTeamSearch}>
                <label>
                  <span>搜索</span>
                  <input value={teamSearch} placeholder="中文名或原始名" onChange={(event) => setTeamSearch(event.target.value)} />
                </label>
                <button type="submit">查询</button>
              </form>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>球队</th>
                    <th>API-Football ID</th>
                    <th>中文名</th>
                    <th>来源</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {teams.map((team) => (
                    <tr key={team.apiFootballTeamId}>
                      <td>
                        <span className="team-cell">
                          {team.logoUrl ? <img alt="" src={team.logoUrl} /> : null}
                          {team.originalName}
                        </span>
                      </td>
                      <td>{team.apiFootballTeamId}</td>
                      <td>
                        <input
                          value={teamEdits[team.apiFootballTeamId] ?? team.displayNameZh}
                          onChange={(event) => setTeamEdits({ ...teamEdits, [team.apiFootballTeamId]: event.target.value })}
                        />
                      </td>
                      <td>{team.source}</td>
                      <td>
                        <button type="button" onClick={() => handleSaveTeam(team)}>
                          保存
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
