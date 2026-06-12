const modules = ["模型配置", "提示词配置", "比赛数据同步", "预测任务", "预测记录", "人工修正", "系统日志"];

export function AdminPage() {
  return (
    <section id="admin" className="page-section admin-section">
      <h2>本地后台</h2>
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
