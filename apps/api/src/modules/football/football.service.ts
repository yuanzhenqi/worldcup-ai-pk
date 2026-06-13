import { ApiFootballClient } from "./apiFootballClient";

export interface FootballServiceConfig {
  apiKey: string;
}

export class FootballService {
  private readonly client: ApiFootballClient;

  constructor(config: FootballServiceConfig) {
    this.client = new ApiFootballClient({ apiKey: config.apiKey });
  }

  getWorldCupFixtures() {
    return this.client.getJson<unknown>("/fixtures", { league: 1, season: 2026 });
  }

  getFixtureOdds(apiFootballFixtureId: number) {
    return this.client.getJson<unknown>("/odds", { fixture: apiFootballFixtureId });
  }

  getFixtureLiveOdds(apiFootballFixtureId: number) {
    return this.client.getJson<unknown>("/odds/live", { fixture: apiFootballFixtureId });
  }

  getFixturePrediction(apiFootballFixtureId: number) {
    return this.client.getJson<unknown>("/predictions", { fixture: apiFootballFixtureId });
  }

  getHeadToHead(homeTeamId: string, awayTeamId: string) {
    return this.client.getJson<unknown>("/fixtures/headtohead", { h2h: `${homeTeamId}-${awayTeamId}` });
  }

  getFixtureInjuries(apiFootballFixtureId: number) {
    return this.client.getJson<unknown>("/injuries", { fixture: apiFootballFixtureId });
  }

  getFixtureLineups(apiFootballFixtureId: number) {
    return this.client.getJson<unknown>("/fixtures/lineups", { fixture: apiFootballFixtureId });
  }

  getTeamSquad(teamId: string) {
    return this.client.getJson<unknown>("/players/squads", { team: teamId });
  }
}
