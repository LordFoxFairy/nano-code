import { z } from 'zod';
import { StructuredTool } from '@langchain/core/tools';
import TurndownService from 'turndown';
import * as cheerio from 'cheerio';

/**
 * WebFetch Tool - Fetches web content and converts HTML to markdown
 *
 * Based on Claude Code's WebFetch implementation with simplified options.
 * Uses native Node.js fetch API (v18+) for HTTP requests.
 */
export class WebFetchTool extends StructuredTool {
  name = 'web_fetch';

  description = `Fetch and analyze web page content. Retrieves HTML from a URL and converts it to markdown format.
Use this when you need to:
- Read documentation from websites
- Analyze web page content
- Extract information from online resources

IMPORTANT: Only fetch URLs that have been explicitly provided by the user or that came from previous search results.`;

  schema = z.object({
    url: z.string().url().describe('The URL to fetch content from'),
    prompt: z.string().optional().describe('Optional analysis prompt to apply to the fetched content'),
  });

  private turndownService: TurndownService;
  private maxContentLength: number;
  private allowedDomains?: string[];
  private blockedDomains?: string[];

  constructor(options?: {
    maxContentLength?: number;
    allowedDomains?: string[];
    blockedDomains?: string[];
  }) {
    super();

    // Initialize Turndown with sensible defaults
    this.turndownService = new TurndownService({
      headingStyle: 'atx',
      hr: '---',
      bulletListMarker: '-',
      codeBlockStyle: 'fenced',
    });

    // Add custom rules for better markdown conversion
    this.turndownService.addRule('strikethrough', {
      filter: ['del', 's', 'strike'],
      replacement: (content) => `~~${content}~~`,
    });

    this.maxContentLength = options?.maxContentLength || 100000; // 100KB default
    this.allowedDomains = options?.allowedDomains;
    this.blockedDomains = options?.blockedDomains;
  }

  async _call(input: { url: string; prompt?: string }): Promise<string> {
    const { url, prompt } = input;

    try {
      // Validate URL
      const urlObj = new URL(url);

      // Check domain restrictions
      if (this.allowedDomains && !this.allowedDomains.some((d) => urlObj.hostname.endsWith(d))) {
        return `Error: Domain ${urlObj.hostname} is not in allowed domains list`;
      }

      if (this.blockedDomains && this.blockedDomains.some((d) => urlObj.hostname.endsWith(d))) {
        return `Error: Domain ${urlObj.hostname} is blocked`;
      }

      // Fetch the content using native fetch
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'NanoCode/1.0 (AI Coding Assistant)',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(30000), // 30 second timeout
      });

      if (!response.ok) {
        return `Error fetching URL: ${response.status} ${response.statusText}`;
      }

      const contentType = response.headers.get('content-type') || '';

      // Handle PDF files
      if (contentType.includes('application/pdf')) {
        return `Error: PDF files are not supported by web_fetch. URL points to a PDF document.`;
      }

      // Handle non-HTML content
      if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
        const text = await response.text();
        return this.formatResult(url, text.slice(0, this.maxContentLength), prompt);
      }

      // Parse HTML
      const html = await response.text();
      const $ = cheerio.load(html);

      // Remove unwanted elements
      $('script, style, nav, footer, iframe, noscript').remove();

      // Extract main content (try common content containers first)
      let mainContent = $('main, article, .content, #content, .post, .entry-content').first();
      if (mainContent.length === 0) {
        mainContent = $('body');
      }

      // Convert to markdown
      let markdown = this.turndownService.turndown(mainContent.html() || '');

      // Truncate if too long
      if (markdown.length > this.maxContentLength) {
        markdown = markdown.slice(0, this.maxContentLength) + '\n\n[Content truncated...]';
      }

      return this.formatResult(url, markdown, prompt);
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError' || error.name === 'TimeoutError') {
          return `Error: Request timeout while fetching ${url}`;
        }
        return `Error fetching URL: ${error.message}`;
      }
      return `Unknown error while fetching ${url}`;
    }
  }

  private formatResult(url: string, content: string, prompt?: string): string {
    let result = `# Content from ${url}\n\n${content}`;

    if (prompt) {
      result += `\n\n---\n\nAnalysis prompt: ${prompt}`;
    }

    return result;
  }
}

/**
 * Factory function to create WebFetchTool with options
 */
export function createWebFetchTool(options?: {
  maxContentLength?: number;
  allowedDomains?: string[];
  blockedDomains?: string[];
}): WebFetchTool {
  return new WebFetchTool(options);
}
