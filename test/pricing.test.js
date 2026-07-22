import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePrice, median, percentile, summarize, buildKeyword, gainLoss, money,
} from '../src/pricing.js';
import { mockProvider } from '../src/providers.js';
import { getEstimate } from '../src/priceService.js';
import { handlePriceRequest } from '../src/handler.js';

test('parsePrice handles strings, symbols, commas, numbers', () => {
  assert.equal(parsePrice('12.50'), 12.5);
  assert.equal(parsePrice('$1,234.56'), 1234.56);
  assert.equal(parsePrice(9.99), 9.99);
  assert.equal(parsePrice(''), null);
  assert.equal(parsePrice(null), null);
  assert.equal(parsePrice('free'), null);
});

test('median: odd, even, empty', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(median([]), null);
  assert.equal(median([42]), 42);
});

test('percentile(50) equals median; endpoints and interpolation', () => {
  const xs = [10, 20, 30, 40];
  assert.equal(percentile(xs, 50), median(xs));
  assert.equal(percentile(xs, 0), 10);
  assert.equal(percentile(xs, 100), 40);
  assert.equal(percentile([10, 20], 50), 15);
});

test('summarize produces median headline, 10/90 range, count, currency', () => {
  const comps = [
    { price: 100, currency: 'USD' },
    { price: 110, currency: 'USD' },
    { price: 90, currency: 'USD' },
    { price: 0, currency: 'USD' }, // ignored: not > 0
    { price: null, currency: 'USD' }, // ignored
  ];
  const s = summarize(comps);
  assert.equal(s.count, 3);
  assert.equal(s.value, 100);
  assert.equal(s.currency, 'USD');
  assert.ok(s.low <= s.value && s.value <= s.high);
});

test('summarize on empty comps is safe', () => {
  const s = summarize([]);
  assert.equal(s.value, null);
  assert.equal(s.count, 0);
});

test('buildKeyword joins search terms + grade and collapses whitespace', () => {
  assert.equal(buildKeyword('1968 Mexico 25 centavos', 'PCGS MS65'), '1968 Mexico 25 centavos PCGS MS65');
  assert.equal(buildKeyword('  Topps  Mantle ', ''), 'Topps Mantle');
  assert.equal(buildKeyword('', 'PSA 10'), 'PSA 10');
});

test('gainLoss: comparable, currency mismatch, missing', () => {
  assert.deepEqual(gainLoss({ value: 150, valueCurrency: 'USD', paid: 100, paidCurrency: 'USD' }), {
    comparable: true, abs: 50, pct: 50,
  });
  assert.equal(gainLoss({ value: 150, valueCurrency: 'USD', paid: 100, paidCurrency: 'EUR' }).comparable, false);
  assert.equal(gainLoss({ value: null, paid: 100 }).comparable, false);
});

test('mockProvider is deterministic for a keyword and yields priced comps', async () => {
  const a = await mockProvider('1968 Mexico 25 centavos MS65', { days: 90 });
  const b = await mockProvider('1968 Mexico 25 centavos MS65', { days: 90 });
  assert.deepEqual(a, b);
  assert.ok(a.length >= 6);
  assert.ok(a.every((c) => c.price > 0));
});

test('getEstimate (mock mode) returns a full snapshot', async () => {
  const snap = await getEstimate({ q: 'Mickey Mantle 1953 Topps', grade: 'PSA 5' }, {});
  assert.equal(snap.source, 'mock');
  assert.equal(snap.days, 90);
  assert.equal(snap.grade, 'PSA 5');
  assert.ok(snap.value > 0);
  assert.ok(snap.comps.length > 0);
  assert.ok(snap.comps.every((c) => c.price > 0));
});

test('getEstimate rejects missing search terms', async () => {
  await assert.rejects(() => getEstimate({ q: '' }, {}), /Missing search terms/);
});

test('handlePriceRequest caches within TTL and refresh bypasses cache', async () => {
  const first = await handlePriceRequest({ q: 'cache test coin', grade: 'MS63' }, {});
  assert.equal(first.status, 200);
  assert.equal(first.body.cached, false);
  const second = await handlePriceRequest({ q: 'cache test coin', grade: 'MS63' }, {});
  assert.equal(second.body.cached, true);
  const refreshed = await handlePriceRequest({ q: 'cache test coin', grade: 'MS63', refresh: '1' }, {});
  assert.equal(refreshed.body.cached, false);
});

test('handlePriceRequest returns 400 body on bad input', async () => {
  const r = await handlePriceRequest({ q: '' }, {});
  assert.equal(r.status, 400);
  assert.ok(r.body.error);
});

test('money rounds to cents', () => {
  assert.equal(money(1.005), 1.0); // float artifact tolerated; documents behavior
  assert.equal(money(2.346), 2.35);
  assert.equal(money(null), null);
});

// --- API key sanitizing (common Vercel paste mistakes) ---
const { sanitizeApiKey } = await import('../src/priceService.js');
test('sanitizeApiKey strips whitespace, quotes, and pasted var name', () => {
  assert.equal(sanitizeApiKey(' sc_abc123 \n'), 'sc_abc123');
  assert.equal(sanitizeApiKey('"sc_abc123"'), 'sc_abc123');
  assert.equal(sanitizeApiKey("'sc_abc123'"), 'sc_abc123');
  assert.equal(sanitizeApiKey('SOLDCOMPS_API_KEY=sc_abc123'), 'sc_abc123');
  assert.equal(sanitizeApiKey(undefined), '');
  assert.equal(sanitizeApiKey('   '), '');
});

// --- comp relevance filtering (real junk titles from a live lookup) ---
const { filterRelevantComps } = await import('../src/pricing.js');
test('filterRelevantComps drops wrong-year, wrong-kind, and bulk-lot comps', () => {
  const comps = [
    { title: '1808 France 1 Franc Napoleon Lyon (D) Mint', price: 60 },
    { title: 'France, Napoleon 1/2 Franc 1808 A', price: 68.2 },
    { title: '2025-26 Panini Select Ligue 1 Khalis Merah RC Swatches Patch', price: 45 },
    { title: 'French Colonies Levant Stamp Collection Part 1 - Mint Hinged', price: 4.76 },
    { title: '1914-B Switzerland 1 Franc Silver! High Grade!', price: 25 },
    { title: 'Lot of 1 Francs France silver 49g lot 3171', price: 73.57 },
    { title: '1844 W 1 Franc France silver lot 3207', price: 11.37 },
    { title: 'RARE Lalique Bacchantes Small Vase Nudes Deep Dark Green', price: 1190 },
    { title: '1921 France 1 Franc - Chamber Of Commerce - Paris Mint', price: 2.75 },
  ];
  const kept = filterRelevantComps(comps, '1808 1 Franc Lyon mint', 'coin');
  const titles = kept.map((c) => c.title);
  assert.ok(titles.includes('1808 France 1 Franc Napoleon Lyon (D) Mint'));
  for (const t of titles) assert.ok(t.includes('1808'), `wrong year survived: ${t}`);
  assert.ok(!titles.some((t) => /stamp|panini|vase|lot of/i.test(t)));
});

test('filterRelevantComps adapts when titles omit qualifier words', () => {
  const comps = [
    { title: '1808 France 1 Franc Napoleon', price: 55 },
    { title: '1808 Ferdinand VII King of Spain Bronze', price: 89 },
  ];
  const kept = filterRelevantComps(comps, '1808 1 Franc Lyon mint', 'coin');
  assert.equal(kept.length, 1);
  assert.ok(kept[0].title.includes('Franc'));
});

test('filterRelevantComps keeps card comps and rejects coins for cards', () => {
  const comps = [
    { title: '1955 Topps Roberto Clemente Rookie PSA 4', price: 400 },
    { title: '1955 Silver Quarter Coin High Grade', price: 12 },
  ];
  const kept = filterRelevantComps(comps, '1955 Topps Roberto Clemente', 'card');
  assert.equal(kept.length, 1);
  assert.ok(kept[0].title.includes('Clemente'));
});

test('filterRelevantComps rejects wrong denominations (1/2 Franc, 5 Francs, medal)', () => {
  const comps = [
    { title: 'Napoleon I - France - 1808 1 Franc silver coin, 0.9 fineness, KM#696.1', price: 86 },
    { title: '1808 H NAPOLEON BONAPARTE 1 SILVER FRANC (LA ROCHELLE LOWER MINTAGE)', price: 34.78 },
    { title: 'Napoleon I - 1/2 Half Franc 1808 A Paris', price: 25.04 },
    { title: 'France 1/2 Franc 1808, Coin, Silver, Napoleon, Inv#I521', price: 25 },
    { title: '1808-B AU+ France 5 Francs Napoleon I Rouen Mint Silver Coin', price: 299.95 },
    { title: '1808 (Minted 1818 in France) Ferdinand VII King of Spain Bronze Medal', price: 89 },
  ];
  const kept = filterRelevantComps(comps, '1808 1 Franc Lyon mint', 'coin');
  assert.equal(kept.length, 2);
  assert.ok(kept.every((c) => /1 (silver )?franc/i.test(c.title)));
});
