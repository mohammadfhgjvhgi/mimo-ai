/**
 * MiMo Core — Search Provider interface + adapters
 * -------------------------------------------------
 * Tools that need live web data depend on the SearchProvider interface.
 * The kernel registers the concrete adapter. This keeps tools testable
 * and provider-agnostic.
 *
 * Two adapters:
 *   1. ZAISearchProvider — uses z-ai-web-dev-sdk (optional, cloud)
 *   2. MockSearchProvider — returns deterministic results (offline-safe)
 *
 * getSearchProvider() returns whichever is registered. If none is
 * registered, it falls back to MockSearchProvider so the system always
 * has a working search capability.
 *
 * Runs server-side only.
 */

import { createLogger } from '../logger';

const log = createLogger('search');

export interface SearchResult {
  url: string;
  title: string;
  snippet: string;
  domain: string;
  date: string;
}

export interface SearchProvider {
  search(query: string, num?: number): Promise<readonly SearchResult[]>;
}

/**
 * Offline mock — returns structured results so the research pipeline
 * (ResearchAgent → WebSearchTool → WriterAgent) works without network.
 */
class MockSearchProvider implements SearchProvider {
  async search(query: string, num = 6): Promise<readonly SearchResult[]> {
    log.debug('mock search invoked', { query, num });
    await new Promise((r) => setTimeout(r, 80));
    const q = encodeURIComponent(query);
    const results: SearchResult[] = [];
    for (let i = 0; i < Math.min(num, 6); i++) {
      results.push({
        url: `https://example.com/result-${i + 1}?q=${q}`,
        title: `نتيجة تجريبية #${i + 1} لـ: ${query.slice(0, 60)}`,
        snippet: `هذه نتيجة بحث تجريبية (Mock Provider) للاستعلام "${query.slice(0, 60)}". لتفعيل البحث الحقيقي، اضبط SearchProvider adapter.`,
        domain: 'example.com',
        date: new Date().toISOString().slice(0, 10),
      });
    }
    return results;
  }
}

/**
 * ZAI-backed search (optional). Only imported when ZAI is available.
 */
async function maybeCreateZAISearchProvider(): Promise<SearchProvider | null> {
  try {
    const ZAI = (await import('z-ai-web-dev-sdk')).default;
    const client = await ZAI.create();
    return {
      async search(query: string, num = 6): Promise<readonly SearchResult[]> {
        log.debug('zai web_search invoked', { query, num });
        const results = (await client.functions.invoke('web_search', {
          query,
          num,
        })) as Array<{
          url: string;
          name: string;
          snippet: string;
          host_name: string;
          date?: string;
        }>;
        return (Array.isArray(results) ? results : []).map((r) => ({
          url: r.url,
          title: r.name,
          snippet: r.snippet,
          domain: r.host_name,
          date: r.date ?? '',
        }));
      },
    };
  } catch (err) {
    log.debug('ZAI search provider unavailable — using mock', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

let registered: SearchProvider | null = null;

export function registerSearchProvider(provider: SearchProvider): void {
  registered = provider;
  log.info('search provider registered', { type: provider.constructor.name });
}

/**
 * Returns the registered provider, or a Mock provider as fallback.
 * Never throws — always returns a usable SearchProvider.
 */
export function getSearchProvider(): SearchProvider {
  if (!registered) {
    registered = new MockSearchProvider();
    log.info('mock search provider installed (offline-safe default)');
  }
  return registered;
}

/**
 * Attempt to upgrade to ZAI-backed search. Called by the kernel during
 * boot. If ZAI is unavailable, the mock stays installed.
 */
export async function maybeUpgradeToZAI(): Promise<void> {
  const zaiProvider = await maybeCreateZAISearchProvider();
  if (zaiProvider) {
    registerSearchProvider(zaiProvider);
  }
}
