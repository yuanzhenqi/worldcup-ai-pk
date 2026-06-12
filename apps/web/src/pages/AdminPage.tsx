import { FormEvent, useEffect, useState } from "react";
import { captureApiFootballFixturesRaw, getAdminApiFootballSettings, saveAdminApiFootballKey } from "../api/client";

const modules = ["模型配置", "提示词配置", "比赛数据同步", "预测任务", "预测记录", "人工修正", "系统日志"];

export function AdminPage() {
  const [apiKey, setApiKey] = useState("");
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [statusText, setStatusText] = useState("正在读取配置...");

  useEffect(() => {
    let cancelled = false;

    getAdminApiFootballSettings()
      .then((settings) => {
        if (!cancelled) {
          setConfigured(settings.configured);
          setStatusText(settings.configured ? "API-Football key 已配置" : "API-Football key 未配置");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setConfigured(null);
          setStatusText("无法读取本地后台配置，请确认 API 服务正在运行");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
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

  async function handleCaptureRawFixtures() {
    setStatusText("正在抓取 API-Football 原始赛程响应...");

    try {
      await captureApiFootballFixturesRaw();
      setStatusText("原始赛程响应已写入系统日志，下一步可基于真实响应实现字段映射");
    } catch {
      setStatusText("抓取失败，请确认 API-Football key 已配置且可用");
    }
  }

  return (
    <section id="admin" className="page-section admin-section">
      <h2>本地后台</h2>
      <form className="settings-form" onSubmit={handleSubmit}>
        <label htmlFor="api-football-key">API-Football key</label>
        <div className="settings-row">
          <input
            id="api-football-key"
            name="api-football-key"
            type="password"
            value={apiKey}
            placeholder={configured ? "已配置，输入新 key 可覆盖" : "输入 API-Football key"}
            onChange={(event) => setApiKey(event.target.value)}
          />
          <button type="submit">保存</button>
        </div>
        <p className="settings-status">{statusText}</p>
      </form>
      <div className="settings-actions">
        <button type="button" onClick={handleCaptureRawFixtures} disabled={!configured}>
          抓取原始赛程响应
        </button>
      </div>
      <div className="admin-grid">
        {modules.map((module) => (
          <article className="admin-card" key={module}>
            <h3>{module}</h3>
            <p>仅本机访问的后台模块。</p>
          </article>
        ))}
      </div>
    </section>
  );
}
