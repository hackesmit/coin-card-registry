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
