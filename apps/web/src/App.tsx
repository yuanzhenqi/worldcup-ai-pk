import "./styles.css";

export function App() {
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
    </main>
  );
}
