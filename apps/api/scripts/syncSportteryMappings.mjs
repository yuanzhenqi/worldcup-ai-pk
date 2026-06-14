/**
 * 体彩 matchId 自动映射脚本（纯 fetch，无需 Playwright）。
 * 抓 webapi.sporttery.cn 的全赛程 → 按中文队名匹配 api-football 比赛 → upsert 映射。
 * 用法：先启动 api，再 `node apps/api/scripts/syncSportteryMappings.mjs`
 */
const API = process.env.API_BASE ?? "http://127.0.0.1:4000";

// 1. 拉 api-football 比赛，建立 "主队中文|客队中文" → fixtureId
const matches = (await (await fetch(`${API}/api/public/matches`)).json()).matches;
const byTeams = new Map();
for (const m of matches) {
  byTeams.set(`${m.homeTeam.displayNameZh}|${m.awayTeam.displayNameZh}`, m.apiFootballFixtureId);
}
console.log(`api-football 比赛: ${matches.length} 场`);

// 2. 拉体彩全赛程
const resp = await (
  await fetch("https://webapi.sporttery.cn/gateway/uniform/football/getMatchListV1.qry?clientCode=3001", {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0 Safari/537.36",
      Referer: "https://www.sporttery.cn/"
    }
  })
).json();
const lists = resp?.value?.matchInfoList ?? [];
console.log(`体彩赛程: ${lists.length} 天\n`);

// 3. 按主客中文名匹配 + upsert
let matched = 0;
const unmatched = new Set();
for (const day of lists) {
  for (const m of day.subMatchList ?? []) {
    const home = m.homeTeamAbbName;
    const away = m.awayTeamAbbName;
    if (!home || !away) continue;
    const fixtureId = byTeams.get(`${home}|${away}`);
    if (fixtureId) {
      const r = await fetch(`${API}/api/admin/sporttery-mappings`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apiFootballFixtureId: fixtureId, sportteryMatchId: m.matchId })
      });
      if (r.ok) {
        matched++;
        console.log(`  ✓ ${home} vs ${away} : ${fixtureId} → ${m.matchId}`);
      }
    } else {
      unmatched.add(`${home} vs ${away}`);
    }
  }
}

console.log(`\n=== 映射完成: ${matched} 场，未匹配 ${unmatched.size} 场 ===`);
[...unmatched].slice(0, 20).forEach((u) => console.log("  ✗", u));
