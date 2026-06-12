import type { MatchDto } from "@worldcup-ai-pk/shared";

interface FixturesPageProps {
  matches: MatchDto[];
}

export function FixturesPage({ matches }: FixturesPageProps) {
  return (
    <section id="fixtures" className="page-section">
      <h2>赛程</h2>
      <div className="match-list">
        {matches.map((match) => (
          <article className="match-row" key={match.id}>
            <time>{new Date(match.kickoffAt).toLocaleString("zh-CN")}</time>
            <strong>
              {match.homeTeam.name} vs {match.awayTeam.name}
            </strong>
            <span>{match.status}</span>
            <button disabled={!match.canRequestPrediction}>请求预测</button>
          </article>
        ))}
      </div>
    </section>
  );
}
