// Orchestrates a price lookup: pick the provider, build the query, summarize.
// Shared by the local dev server (server.js) and the Vercel handler (api/price.js).

import { buildKeyword, summarize } from './pricing.js';
import { soldCompsProvider, mockProvider } from './providers.js';

const DEFAULT_DAYS = 90; // his agreed window
const VALID_SITES = new Set([
  'ebay.com', 'ebay.co.uk', 'ebay.de', 'ebay.fr',
  'ebay.it', 'ebay.es', 'ebay.ca', 'ebay.com.au',
]);

/**
 * @param {object} params
 * @param {string} params.q      - the collector's search terms
 * @param {string} [params.grade]- grade / condition, appended to narrow comps
 * @param {number} [params.days] - lookback window (default 90)
 * @param {string} [params.site] - eBay marketplace (default ebay.com)
 * @param {object} [env]         - process.env-like object (for the API key)
 * @returns {Promise<object>} value snapshot payload
 */
export async function getEstimate(params, env = process.env) {
  const q = (params.q ?? '').toString().trim();
  if (!q) {
    const err = new Error('Missing search terms (q).');
    err.status = 400;
    throw err;
  }

  const grade = (params.grade ?? '').toString().trim();
  const days = clampDays(params.days);
  const site = VALID_SITES.has(params.site) ? params.site : 'ebay.com';
  const keyword = buildKeyword(q, grade);

  const apiKey = sanitizeApiKey(env.SOLDCOMPS_API_KEY);
  const useReal = Boolean(apiKey);

  const comps = useReal
    ? await soldCompsProvider(keyword, { days, site, apiKey })
    : await mockProvider(keyword, { days });

  const summary = summarize(comps);

  return {
    keyword,
    grade: grade || null,
    days,
    site,
    source: useReal ? 'soldcomps' : 'mock',
    ...summary, // value, low, high, count, currency
    // Trim comps to what the UI shows ("show him the receipts"), newest first.
    comps: comps
      .filter((c) => Number.isFinite(c.price) && c.price > 0)
      .sort((a, b) => String(b.endedAt).localeCompare(String(a.endedAt)))
      .slice(0, 60),
    generatedAt: new Date().toISOString(),
  };
}

// Keys pasted into dashboard forms often arrive with stray whitespace, wrapping
// quotes, or the whole "SOLDCOMPS_API_KEY=" line — all of which break Bearer auth.
export function sanitizeApiKey(raw) {
  let key = (raw ?? '').toString().trim();
  key = key.replace(/^SOLDCOMPS_API_KEY\s*=\s*/i, '');
  key = key.replace(/^["']+|["']+$/g, '').trim();
  return key;
}

function clampDays(d) {
  const n = Number(d);
  if (!Number.isFinite(n)) return DEFAULT_DAYS;
  return Math.min(365, Math.max(1, Math.round(n)));
}

export { DEFAULT_DAYS, VALID_SITES };
