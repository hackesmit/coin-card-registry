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
