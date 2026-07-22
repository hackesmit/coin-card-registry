// Transport-agnostic request handler for the price proxy, with a small TTL cache
// so repeated lookups of the same item sip API requests instead of gulping them.
// Used by both server.js (local/long-lived) and api/price.js (Vercel serverless).

import { getEstimate } from './priceService.js';

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const cache = new Map(); // key -> { at, payload }

/**
 * @param {object} query - parsed query params { q, grade, days, site, refresh }
 * @param {object} env   - process.env-like
 * @returns {Promise<{status:number, body:object}>}
 */
export async function handlePriceRequest(query, env = process.env) {
  try {
    const key = cacheKey(query);
    const now = Date.now();

    if (!truthy(query.refresh)) {
      const hit = cache.get(key);
      if (hit && now - hit.at < CACHE_TTL_MS) {
        return { status: 200, body: { ...hit.payload, cached: true } };
      }
    }

    const payload = await getEstimate(query, env);
    cache.set(key, { at: now, payload });
    return { status: 200, body: { ...payload, cached: false } };
  } catch (err) {
    const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 502;
    return { status, body: { error: err.message || 'Price lookup failed' } };
  }
}

function cacheKey(q) {
  return [q.q || '', q.grade || '', q.days || '', q.site || '', q.type || ''].join('|').toLowerCase();
}

function truthy(v) {
  return v === true || v === '1' || v === 'true';
}
