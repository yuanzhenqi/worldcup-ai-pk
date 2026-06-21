import { load } from "cheerio";
import type { ExternalIntelSearchResult } from "./externalIntel.types";

export interface WebSearchInput {
  query: string;
  maxResults: number;
}

export interface WebSearchProvider {
  search(input: WebSearchInput): Promise<ExternalIntelSearchResult[]>;
}

function getSourceDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function normalizeDuckDuckGoUrl(value: string): string {
  try {
    const url = new URL(value, "https://duckduckgo.com");
    const uddg = url.searchParams.get("uddg");
    return uddg ? decodeURIComponent(uddg) : url.toString();
  } catch {
    return value;
  }
}

export class DuckDuckGoHtmlWebSearchProvider implements WebSearchProvider {
  async search(input: WebSearchInput): Promise<ExternalIntelSearchResult[]> {
    const url = new URL("https://html.duckduckgo.com/html/");
    url.searchParams.set("q", input.query);

    const response = await fetch(url.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "text/html,application/xhtml+xml"
      }
    });

    if (!response.ok) {
      throw new Error(`DuckDuckGo search failed with status ${response.status}`);
    }

    const html = await response.text();
    const $ = load(html);
    const results: ExternalIntelSearchResult[] = [];

    $(".result").each((_index, element) => {
      if (results.length >= input.maxResults) return;

      const title = $(element).find(".result__title").text().replace(/\s+/g, " ").trim();
      const href = $(element).find(".result__a").attr("href");
      const snippet = $(element).find(".result__snippet").text().replace(/\s+/g, " ").trim();
      if (!title || !href) return;

      const normalizedUrl = normalizeDuckDuckGoUrl(href);
      results.push({
        title,
        url: normalizedUrl,
        snippet,
        sourceDomain: getSourceDomain(normalizedUrl),
        publishedAt: null
      });
    });

    return results;
  }
}
