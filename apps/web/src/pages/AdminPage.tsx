import { FormEvent, useEffect, useState } from "react";
import type {
  AdminSummaryDto,
  AiModelConfigDto,
  AiProviderConfigDto,
  ExternalIntelSettingsDto,
  PromptTemplateConfigDto,
  TeamDisplayNameDto
} from "@worldcup-ai-pk/shared";
import {
  type AdminContextCacheLogDto,
  captureApiFootballFixturesRaw,
  deleteAdminAiModel,
  deleteAdminAiProvider,
  deleteAdminPromptTemplate,
  getAdminApiFootballSettings,
  getAdminExternalIntelSettings,
  getAdminSportterySettings,
  getAdminSummary,
  listAdminAiModels,
  listAdminAiProviders,
  listAdminContextCacheLogs,
  listAdminPromptTemplates,
  listAdminSportteryMappings,
  listAdminTeamDisplayNames,
  saveAdminAiModel,
  saveAdminAiProvider,
  saveAdminApiFootballKey,
  saveAdminExternalIntelSettings,
  saveAdminSportterySettings,
  saveAdminPromptTemplate,
  saveAdminTeamDisplayName,
  syncApiFootballFixtures,
  syncAdminSportteryMappings,
  testAdminAiModel,
  updateAdminAiModel,
  updateAdminPromptTemplate
} from "../api/client";

type AdminModule = "data-source" | "external-intel" | "context-cache" | "providers" | "models" | "prompts" | "teams";

const adminModules: Array<{ id: AdminModule; label: string }> = [
  { id: "data-source", label: "数据源配置" },
  { id: "external-intel", label: "外部情报" },
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
  enabled: true,
  contextWindowTokens: 0,
  maxOutputTokens: 0,
  requestTimeoutMs: 90000,
  requestRetryCount: 1
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

const initialExternalIntelSettings: ExternalIntelSettingsDto = {
  enabled: false,
  provider: "duckduckgo_html",
  summarizerModelId: "",
  cacheMinutes: 60,
  maxResultsPerQuery: 5,
  maxQueriesPerMatch: 4
};

export function AdminPage() {
  const [activeModule, setActiveModule] = useState<AdminModule>("data-source");
  const [apiKey, setApiKey] = useState("");
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [sportteryEnabled, setSportteryEnabled] = useState<boolean | null>(null);
  const [externalIntelSettings, setExternalIntelSettings] = useState<ExternalIntelSettingsDto>(initialExternalIntelSettings);
  const [sportteryMappingsCount, setSportteryMappingsCount] = useState(0);
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
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [editingPromptTemplateId, setEditingPromptTemplateId] = useState<string | null>(null);
  const [statusText, setStatusText] = useState("正在读取配置...");

  async function loadTeams(query = teamSearch) {
    const nextTeams = await listAdminTeamDisplayNames(query);
    setTeams(nextTeams);
    setTeamEdits(Object.fromEntries(nextTeams.map((team) => [team.apiFootballTeamId, team.displayNameZh])));
  }

  async function loadAdminData() {
    const [
      settings,
      sportterySettings,
      externalIntel,
      sportteryMappings,
      nextSummary,
      nextProviders,
      nextModels,
      nextPromptTemplates,
      nextContextCacheLogs,
      nextTeams
    ] = await Promise.all([
      getAdminApiFootballSettings(),
      getAdminSportterySettings(),
      getAdminExternalIntelSettings(),
      listAdminSportteryMappings(),
      getAdminSummary(),
      listAdminAiProviders(),
      listAdminAiModels(),
      listAdminPromptTemplates(),
      listAdminContextCacheLogs(),
      listAdminTeamDisplayNames("")
    ]);

    setConfigured(settings.configured);
    setSportteryEnabled(sportterySettings.enabled);
    setExternalIntelSettings(externalIntel);
    setSportteryMappingsCount(sportteryMappings.length);
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

  async function handleToggleSporttery() {
    const nextEnabled = !(sportteryEnabled ?? false);
    setStatusText(nextEnabled ? "正在启用体彩赛前情报..." : "正在停用体彩赛前情报...");

    try {
      const settings = await saveAdminSportterySettings(nextEnabled);
      setSportteryEnabled(settings.enabled);
      setStatusText(settings.enabled ? "体彩赛前情报已启用" : "体彩赛前情报已停用");
    } catch (error) {
      setStatusText(error instanceof Error ? `体彩配置保存失败：${error.message}` : "体彩配置保存失败，请确认本地后台 API 可访问");
    }
  }

  async function handleSaveExternalIntelSettings() {
    setStatusText("正在保存外部情报配置...");

    try {
      const saved = await saveAdminExternalIntelSettings(externalIntelSettings);
      setExternalIntelSettings(saved);
      setStatusText("外部情报配置已保存");
    } catch (error) {
      setStatusText(error instanceof Error ? `外部情报配置保存失败：${error.message}` : "外部情报配置保存失败，请确认本地后台 API 可访问");
    }
  }

  async function handleSyncSportteryMappings() {
    setStatusText("正在同步体彩映射...");

    try {
      const result = await syncAdminSportteryMappings();
      const mappings = await listAdminSportteryMappings();
      setSportteryMappingsCount(mappings.length);
      setStatusText(`体彩映射同步完成：匹配 ${result.matched} 场，未匹配 ${result.unmatched} 场`);
    } catch (error) {
      setStatusText(error instanceof Error ? `体彩映射同步失败：${error.message}` : "体彩映射同步失败，请确认本地后台 API 可访问");
    }
  }

  async function handleSaveProvider(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await saveAdminAiProvider(providerForm);
    setProviderForm(initialProviderForm);
    setProviders(await listAdminAiProviders());
    setStatusText("模型供应商已保存");
  }

  async function handleDeleteProvider(provider: AiProviderConfigDto) {
    await deleteAdminAiProvider(provider.id);
    const [nextProviders, nextModels] = await Promise.all([listAdminAiProviders(), listAdminAiModels()]);
    setProviders(nextProviders);
    setModels(nextModels);
    setStatusText("模型供应商已删除");
  }

  async function handleSaveModel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (editingModelId) {
      await updateAdminAiModel(editingModelId, modelForm);
    } else {
      await saveAdminAiModel(modelForm);
    }
    setModelForm(initialModelForm);
    setEditingModelId(null);
    setModels(await listAdminAiModels());
    setStatusText(editingModelId ? "模型配置已更新" : "模型配置已保存");
  }

  function handleEditModel(model: AiModelConfigDto) {
    setEditingModelId(model.id);
    setModelForm({
      providerId: model.providerId,
      modelName: model.modelName,
      displayName: model.displayName,
      enabled: model.enabled,
      contextWindowTokens: model.contextWindowTokens,
      maxOutputTokens: model.maxOutputTokens,
      requestTimeoutMs: model.requestTimeoutMs,
      requestRetryCount: model.requestRetryCount
    });
    setStatusText(`正在编辑模型：${model.displayName}`);
  }

  function handleCancelEditModel() {
    setEditingModelId(null);
    setModelForm(initialModelForm);
    setStatusText("已取消模型编辑");
  }

  async function handleTestModel(model: AiModelConfigDto) {
    setStatusText(`正在测试模型：${model.displayName}`);
    const result = await testAdminAiModel(model.id);
    setStatusText(`${result.message}，耗时 ${result.latencyMs}ms`);
  }

  async function handleDeleteModel(model: AiModelConfigDto) {
    try {
      await deleteAdminAiModel(model.id);
      setModels(await listAdminAiModels());
      setStatusText("模型已删除");
    } catch (error) {
      setStatusText(error instanceof Error ? `模型删除失败：${error.message}` : "模型删除失败");
    }
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

  async function handleDeletePromptTemplate(template: PromptTemplateConfigDto) {
    await deleteAdminPromptTemplate(template.id);
    if (editingPromptTemplateId === template.id) {
      setPromptForm(initialPromptForm);
      setEditingPromptTemplateId(null);
    }
    setPromptTemplates(await listAdminPromptTemplates());
    setStatusText("提示词模板已删除");
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
              aria-label={module.id === "data-source" ? "数据源" : undefined}
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
                <span>{sportteryEnabled ? "体彩赛前情报已启用" : "体彩赛前情报未启用"}</span>
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
              <section className="admin-subsection">
                <header>
                  <h4>赛程基础数据</h4>
                  <span>{configured ? "API-Football key 已配置" : "API-Football key 未配置"}</span>
                </header>
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
              </section>
            </>
          ) : null}

          {activeModule === "external-intel" ? (
            <>
              <header>
                <h3>{selectedModule?.label}</h3>
                <span>{externalIntelSettings.enabled ? "已启用" : "未启用"}</span>
              </header>
              <section className="admin-subsection">
                <header>
                  <h4>外部情报</h4>
                  <span>{externalIntelSettings.enabled ? "已启用" : "未启用"}</span>
                </header>
                <label className="checkbox-line">
                  <input
                    aria-label="启用统一外部情报"
                    type="checkbox"
                    checked={externalIntelSettings.enabled}
                    onChange={(event) => setExternalIntelSettings((current) => ({ ...current, enabled: event.target.checked }))}
                  />
                  启用统一外部情报
                </label>
                <label>
                  总结模型
                  <select
                    aria-label="总结模型"
                    value={externalIntelSettings.summarizerModelId}
                    onChange={(event) => setExternalIntelSettings((current) => ({ ...current, summarizerModelId: event.target.value }))}
                  >
                    <option value="">不使用模型总结，只注入搜索摘要</option>
                    {models.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.displayName}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  缓存分钟
                  <input
                    aria-label="缓存分钟"
                    type="number"
                    min={5}
                    max={1440}
                    value={externalIntelSettings.cacheMinutes}
                    onChange={(event) => setExternalIntelSettings((current) => ({ ...current, cacheMinutes: Number(event.target.value) }))}
                  />
                </label>
                <button className="app-button app-button-primary" type="button" onClick={handleSaveExternalIntelSettings}>
                  保存外部情报配置
                </button>
              </section>
            </>
          ) : null}

          {activeModule === "data-source" ? (
            <>
              <section className="admin-subsection">
                <header>
                  <h4>体彩赛前情报</h4>
                  <span>{sportteryEnabled ? "已启用" : "未启用"}</span>
                </header>
                <p className="secret-note">用于预测上下文：官方指数、历史交锋、积分形势、近期状态、特征对比和伤停影响。</p>
                <div className="settings-actions">
                  <button type="button" onClick={handleToggleSporttery}>
                    {sportteryEnabled ? "停用体彩情报" : "启用体彩情报"}
                  </button>
                  <button type="button" onClick={handleSyncSportteryMappings}>
                    同步体彩映射
                  </button>
                </div>
                <p className="secret-note">{sportteryMappingsCount} 场已映射</p>
              </section>
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
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {providers.map((provider) => (
                    <tr key={provider.id}>
                      <td>{provider.displayName}</td>
                      <td>{provider.name}</td>
                      <td>{provider.baseUrl}</td>
                      <td>{provider.enabled ? "启用" : "停用"} · {provider.apiKeyConfigured ? "key 已配置" : "key 未配置"}</td>
                      <td>
                        <button type="button" onClick={() => handleDeleteProvider(provider)} aria-label={`删除 ${provider.displayName}`}>
                          删除
                        </button>
                      </td>
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
                <label>
                  <span>上下文窗口 token</span>
                  <input
                    type="number"
                    min="0"
                    value={modelForm.contextWindowTokens}
                    onChange={(event) => setModelForm({ ...modelForm, contextWindowTokens: Number(event.target.value) })}
                  />
                </label>
                <label>
                  <span>输出 token 上限</span>
                  <input
                    type="number"
                    min="0"
                    value={modelForm.maxOutputTokens}
                    onChange={(event) => setModelForm({ ...modelForm, maxOutputTokens: Number(event.target.value) })}
                  />
                </label>
                <label>
                  <span>超时 ms</span>
                  <input
                    type="number"
                    min="1000"
                    value={modelForm.requestTimeoutMs}
                    onChange={(event) => setModelForm({ ...modelForm, requestTimeoutMs: Number(event.target.value) })}
                  />
                </label>
                <label>
                  <span>超时重试次数</span>
                  <input
                    type="number"
                    min="0"
                    value={modelForm.requestRetryCount}
                    onChange={(event) => setModelForm({ ...modelForm, requestRetryCount: Number(event.target.value) })}
                  />
                </label>
                <button type="submit">{editingModelId ? "更新模型" : "保存模型"}</button>
                {editingModelId ? (
                  <button type="button" onClick={handleCancelEditModel}>
                    取消编辑
                  </button>
                ) : null}
              </form>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>显示名</th>
                    <th>模型标识</th>
                    <th>供应商</th>
                    <th>请求配置</th>
                    <th>状态</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {models.map((model) => (
                    <tr key={model.id}>
                      <td>{model.displayName}</td>
                      <td>{model.modelName}</td>
                      <td>{providers.find((provider) => provider.id === model.providerId)?.displayName ?? model.providerId}</td>
                      <td>
                        上下文 {model.contextWindowTokens || "默认"} · 输出 {model.maxOutputTokens || "默认"} · 超时 {model.requestTimeoutMs}ms · 重试{" "}
                        {model.requestRetryCount}
                      </td>
                      <td>{model.enabled ? "启用" : "停用"}</td>
                      <td>
                        <button type="button" onClick={() => handleEditModel(model)} aria-label={`编辑 ${model.displayName}`}>
                          编辑
                        </button>
                        <button type="button" onClick={() => handleTestModel(model)} aria-label={`测试 ${model.displayName}`}>
                          测试
                        </button>
                        <button type="button" onClick={() => handleDeleteModel(model)} aria-label={`删除 ${model.displayName}`}>
                          删除
                        </button>
                      </td>
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
                        <button type="button" onClick={() => handleDeletePromptTemplate(template)} aria-label={`删除 ${template.name}`}>
                          删除
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
