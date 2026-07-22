// Pure price-math helpers. No I/O — fully unit-testable.

/**
 * Parse a price that may arrive as "12.50", "$12.50", "1,234.56" or a number.
 * Returns a finite number or null.
 */
export function parsePrice(raw) {
  if (raw == null) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const cleaned = String(raw).replace(/[^0-9.]/g, '');
  if (cleaned === '') return null;
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Median of a numeric array. Returns null for empty input. */
export function median(nums) {
  const xs = nums.filter((n) => Number.isFinite(n)).slice().sort((a, b) => a - b);
  if (xs.length === 0) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 === 0 ? (xs[mid - 1] + xs[mid]) / 2 : xs[mid];
}

/**
 * Linear-interpolated percentile (p in 0..100).
 * percentile([...], 50) == median for the same data.
 */
export function percentile(nums, p) {
  const xs = nums.filter((n) => Number.isFinite(n)).slice().sort((a, b) => a - b);
  if (xs.length === 0) return null;
  if (xs.length === 1) return xs[0];
  const rank = (p / 100) * (xs.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return xs[lo];
  const frac = rank - lo;
  return xs[lo] + (xs[hi] - xs[lo]) * frac;
}

/** Round to cents. */
export function money(n) {
  return n == null ? null : Math.round(n * 100) / 100;
}

/**
 * Turn a set of raw sold comps into a value summary.
 * Uses the item price (soldPrice), not shipping-inclusive total, as the headline.
 * Median is the headline (collectible sales are right-skewed); 10th/90th percentile
 * give an honest low/high range.
 *
 * @param {Array<{price:number|null, currency?:string}>} comps
 * @returns {{value:number|null, low:number|null, high:number|null, count:number, currency:string|null}}
 */
export function summarize(comps) {
  const priced = comps.filter((c) => Number.isFinite(c.price) && c.price > 0);
  const prices = priced.map((c) => c.price);
  // Currency = the most common currency among priced comps.
  const currency = mostCommon(priced.map((c) => c.currency).filter(Boolean)) || null;
  return {
    value: money(median(prices)),
    low: money(percentile(prices, 10)),
    high: money(percentile(prices, 90)),
    count: priced.length,
    currency,
  };
}

function mostCommon(arr) {
  const counts = new Map();
  let best = null;
  let bestN = 0;
  for (const v of arr) {
    const n = (counts.get(v) || 0) + 1;
    counts.set(v, n);
    if (n > bestN) {
      bestN = n;
      best = v;
    }
  }
  return best;
}

/**
 * Build the eBay search keyword from the collector's search terms + grade.
 * The grade (e.g. "PCGS MS65", "PSA 10") is what narrows comps to the right
 * condition — his #1 complaint about ucoin was the lack of by-condition pricing.
 */
export function buildKeyword(searchTerms, grade) {
  return [searchTerms, grade]
    .map((s) => (s == null ? '' : String(s).trim()))
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * eBay keyword search is loose: "1808 1 Franc Lyon mint" matches stamps
 * ("Mint Hinged"), Swiss francs, and soccer cards. This filter keeps only comps
 * whose titles actually look like the item, so the median is computed from real
 * matches instead of noise.
 *
 * Rules:
 * - If the query names a year (4 digits), the title must contain it.
 * - Obvious other-kind-of-item titles are dropped per collection type
 *   (stamps/cards for coins, coins/stamps for cards) unless the query asks for them.
 * - Bulk-lot sales ("Lot of 1 Francs") are dropped unless the query says "lot" —
 *   a 50-gram bag sale is not a comp for one coin.
 * - Remaining comps are scored by how many query words their title contains, and
 *   only those within one word of the best match are kept (adaptive: when titles
 *   rarely mention "Lyon mint", matches on the other words still survive).
 */
const NOISE_BY_TYPE = {
  coin: ['stamp', 'banknote', 'billet', 'postcard', 'rookie', 'topps', 'panini', 'psa ', 'vase'],
  card: ['coin', 'banknote', 'stamp', 'medal', 'pcgs', 'ngc'],
};

export function filterRelevantComps(comps, q, type = '') {
  const query = ' ' + String(q || '').toLowerCase() + ' ';
  const tokens = [...new Set(query.split(/[^a-z0-9]+/).filter((t) => t.length >= 2))];
  const years = tokens.filter((t) => /^\d{4}$/.test(t));
  const words = tokens.filter((t) => !/^\d{4}$/.test(t));
  const noise = (NOISE_BY_TYPE[type] || []).filter((n) => !query.includes(n.trim()));
  const allowLots = /\blots?\b/.test(query);
  const denom = extractDenomination(query);

  const scored = [];
  for (const c of comps) {
    const title = ' ' + String(c.title || '').toLowerCase() + ' ';
    if (years.length && !years.some((y) => title.includes(y))) continue;
    if (noise.some((n) => title.includes(n))) continue;
    if (!allowLots && (/\blots? of\b/.test(title) || /^\s*lot\b/.test(title))) continue;
    if (denom && !matchesDenomination(title, denom)) continue;
    const score = words.length ? words.filter((w) => title.includes(w)).length / words.length : 1;
    if (score > 0 || words.length === 0) scored.push({ c, score });
  }
  if (scored.length === 0) return [];

  const best = Math.max(...scored.map((s) => s.score));
  const cutoff = words.length ? Math.max(best - 1 / words.length, 0.001) : 0;
  return scored.filter((s) => s.score >= cutoff).map((s) => s.c);
}

// "1 franc", "5 centimes", "1/2 dollar" in the query — the first
// non-year quantity + unit word pair. Years (4 digits) are dates, not amounts.
function extractDenomination(query) {
  const re = /(\d+(?:\/\d+)?)\s+([a-z]{3,})/g;
  let m;
  while ((m = re.exec(query)) !== null) {
    if (!/^\d{4}$/.test(m[1])) return { num: m[1], unit: m[2].replace(/s$/, '') };
  }
  return null;
}

// A "1 Franc" search must not price against "1/2 Franc" or "5 Francs" sales —
// same words, different coin. The unit word itself is required (a title that
// never says "franc" isn't a franc), and any quantity attached to it must match.
function matchesDenomination(title, { num, unit }) {
  if (!new RegExp(`${unit}s?\\b`).test(title)) return false;
  const m = title.match(new RegExp(`(\\d+/\\d+|\\d+|half|demi|quarter)(?:[\\s-]+[a-z]+)?[\\s-]+${unit}s?\\b`));
  if (!m) return true; // no quantity stated next to the unit — benefit of the doubt
  if (m[1] === num) return true;
  return /^\d{4}$/.test(m[1]); // a year sitting next to the unit is not a quantity
}

/**
 * Gain/loss between an estimated value and the price paid.
 * Only meaningful when the two currencies match; returns {comparable:false}
 * otherwise rather than subtracting apples from oranges.
 */
export function gainLoss({ value, valueCurrency, paid, paidCurrency }) {
  if (!Number.isFinite(value) || !Number.isFinite(paid)) {
    return { comparable: false, reason: 'missing-value' };
  }
  if (valueCurrency && paidCurrency && valueCurrency !== paidCurrency) {
    return { comparable: false, reason: 'currency-mismatch' };
  }
  const abs = money(value - paid);
  const pct = paid > 0 ? Math.round(((value - paid) / paid) * 1000) / 10 : null;
  return { comparable: true, abs, pct };
}
