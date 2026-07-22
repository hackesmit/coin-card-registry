// Price-source adapters. Each returns a normalized comps array so the rest of the
// app never depends on a specific vendor's field names. This is the "swappable seam":
// to move to PriceCharting or eBay's official API later, add an adapter here — the
// serverless proxy, the UI, and the tests stay unchanged.

import { parsePrice } from './pricing.js';

const SOLDCOMPS_BASE = 'https://api.sold-comps.com/v1/scrape';

/**
 * Normalized comp shape returned by every provider:
 * {
 *   title, price (number|null), currency, condition, endedAt (ISO),
 *   url, buyingFormat, bestOfferAccepted (bool)
 * }
 */

/**
 * Real SoldComps adapter. Docs: GET /v1/scrape, Bearer auth.
 * Returns real completed eBay sales (price, condition, date) — no eBay dev account.
 */
export async function soldCompsProvider(keyword, { days = 90, site = 'ebay.com', apiKey, fetchImpl = fetch } = {}) {
  const url = new URL(SOLDCOMPS_BASE);
  url.searchParams.set('keyword', keyword);
  url.searchParams.set('daysToScrape', String(clamp(days, 1, 365)));
  url.searchParams.set('ebaySite', site);
  url.searchParams.set('count', '240');
  url.searchParams.set('sortOrder', 'endedRecently');

  const res = await fetchImpl(url.toString(), {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
  });

  if (!res.ok) {
    const body = await safeText(res);
    const msg = res.status === 401 || res.status === 403
      ? 'SoldComps rejected the price key. Re-paste your sc_... key in Vercel → Settings → Environment Variables (no spaces or quotes), then Redeploy.'
      : `SoldComps ${res.status}: ${body.slice(0, 200)}`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  const items = Array.isArray(data.items) ? data.items : [];
  return items.map((it) => ({
    title: it.title ?? '',
    // Headline is the item's sold price; fall back to totalPrice if soldPrice is absent.
    price: parsePrice(it.soldPrice ?? it.totalPrice),
    currency: it.soldCurrency ?? null,
    condition: it.condition ?? null,
    endedAt: it.endedAt ?? it.scrapedAt ?? null,
    url: it.url ?? null,
    buyingFormat: it.buyingFormat ?? null,
    bestOfferAccepted: Boolean(it.bestOfferAccepted),
  }));
}

/**
 * Deterministic mock adapter — used when no SOLDCOMPS_API_KEY is configured so the
 * whole app is runnable and testable offline. Prices are derived from a hash of the
 * keyword, so the same item always gets the same believable spread of "sold" comps.
 */
export async function mockProvider(keyword, { days = 90 } = {}) {
  const seed = hash(keyword);
  const base = 8 + (seed % 400); // headline roughly $8–$408
  const n = 6 + (seed % 12); // 6–17 comps
  const conditions = ['Ungraded', 'Graded', 'Used', 'New'];
  const items = [];
  for (let i = 0; i < n; i++) {
    const wobble = (((seed >> (i % 16)) % 61) - 30) / 100; // -30%..+30%
    const price = Math.max(1, base * (1 + wobble));
    const daysAgo = (seed + i * 37) % Math.max(1, days);
    items.push({
      title: `${keyword} — sample sold comp #${i + 1}`,
      price: Math.round(price * 100) / 100,
      currency: 'USD',
      condition: conditions[(seed + i) % conditions.length],
      endedAt: isoDaysAgo(daysAgo, seed + i),
      url: 'https://www.ebay.com/',
      buyingFormat: i % 3 === 0 ? 'auction' : 'buyItNow',
      bestOfferAccepted: i % 5 === 0,
    });
  }
  return items;
}

// --- helpers ---

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, Number(n) || lo));
}

async function safeText(res) {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

// Deterministic date N days ago (no Date.now nondeterminism in the seedable part;
// uses a fixed reference so mock output is stable across runs and testable).
function isoDaysAgo(daysAgo, extraHours) {
  const ref = Date.parse('2026-07-22T12:00:00Z');
  const ms = ref - daysAgo * 86400000 - (extraHours % 24) * 3600000;
  return new Date(ms).toISOString();
}
