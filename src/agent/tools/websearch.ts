import { z } from 'zod';
import { StructuredTool } from '@langchain/core/tools';
import * as cheerio from 'cheerio';

/**
 * WebSearch Tool - Searches the web and returns multiple results with snippets
 *
 * Based on Claude Code's WebSearch implementation.
 * Uses search engines (Google, Brave, or fallback to direct fetch if needed).
 * For this initial implementation, we'll use a simple Google Custom Search JSON API style
 * or a compatible SERP API abstraction.
 *
 * Since we don't have a guaranteed API key for these services in the environment,
 * we will implement a basic scraper for DuckDuckGo HTML which doesn't require an API key,
 * with fallbacks to other methods if configured.
 */

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export class WebSearchTool extends StructuredTool {
  name = 'web_search';

  description = `Search the web for information. Returns multiple results with titles, URLs, and snippets.
Use this when you need to:
- Find up-to-date information
- Research topics
- Find documentation or examples
- Discover new libraries or tools

The tool returns a list of search results. You can then use web_fetch to get the full content of interesting pages.`;

  schema = z.object({
    query: z.string().describe('The search query'),
    limit: z.number().optional().default(10).describe('Number of results to return (default: 10)'),
  });

  private allowedDomains?: string[];
  private blockedDomains?: string[];

  constructor(options?: {
    allowedDomains?: string[];
    blockedDomains?: string[];
  }) {
    super();
    this.allowedDomains = options?.allowedDomains;
    this.blockedDomains = options?.blockedDomains;
  }

  async _call(input: { query: string; limit?: number }): Promise<string> {
    const { query, limit = 10 } = input;

    // Modify query with domain restrictions if present
    let finalQuery = query;
    if (this.allowedDomains && this.allowedDomains.length > 0) {
      const siteOperators = this.allowedDomains.map(d => `site:${d}`).join(' OR ');
      finalQuery = `${query} (${siteOperators})`;
    }

    if (this.blockedDomains && this.blockedDomains.length > 0) {
      const excludeOperators = this.blockedDomains.map(d => `-site:${d}`).join(' ');
      finalQuery = `${query} ${excludeOperators}`;
    }

    try {
      // Primary method: DuckDuckGo HTML scraping (no API key required)
      const results = await this.searchDuckDuckGo(finalQuery, limit);

      if (results.length === 0) {
        return "No results found.";
      }

      return this.formatResults(results);
    } catch (error) {
      if (error instanceof Error) {
        return `Error searching web: ${error.message}`;
      }
      return "Unknown error searching web";
    }
  }

  /**
   * Scrapes DuckDuckGo HTML version
   */
  private async searchDuckDuckGo(query: string, limit: number): Promise<WebSearchResult[]> {
    try {
      // Use the html version which is easier to scrape
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5'
        },
        signal: AbortSignal.timeout(10000) // 10s timeout
      });

      if (!response.ok) {
        throw new Error(`DDG responded with ${response.status}`);
      }

      const html = await response.text();
      const $ = cheerio.load(html);
      const results: WebSearchResult[] = [];

      // DDG HTML structure selectors
      $('.result').each((i, element) => {
        if (results.length >= limit) return false;

        const titleParams = $(element).find('.result__a').text().trim();
        const linkHref = $(element).find('.result__a').attr('href');
        const snippetText = $(element).find('.result__snippet').text().trim();

        // Skip ads or bad results
        if (!linkHref || !titleParams) return;

        // DDG redirect URLs usually look like /l/?kh=-1&uddg=https%3A%2F%2Fexample.com
        let finalUrl = linkHref;
        if (linkHref.startsWith('//duckduckgo.com/l/')) {
           try {
             const urlObj = new URL('https:' + linkHref);
             const uddg = urlObj.searchParams.get('uddg');
             if (uddg) finalUrl = uddg;
           } catch (e) {
             // keep original if parsing fails
           }
        }

        results.push({
          title: titleParams,
          url: finalUrl,
          snippet: snippetText
        });
      });

      return results;
    } catch (error) {
      console.error('DuckDuckGo search failed:', error);
      // Fallback or rethrow depending on strategy
      // For now, return empty array to signal failure
      return [];
    }
  }

  private formatResults(results: WebSearchResult[]): string {
    return results.map((r, i) => {
      return `[${i + 1}] ${r.title}
URL: ${r.url}
Snippet: ${r.snippet}
`;
    }).join('\n---\n\n');
  }
}

/**
 * Factory function to create WebSearchTool with options
 */
export function createWebSearchTool(options?: {
  allowedDomains?: string[];
  blockedDomains?: string[];
}): WebSearchTool {
  return new WebSearchTool(options);
}
