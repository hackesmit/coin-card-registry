import * as db from '/db.js';
import { fetchPrice } from '/api.js';
import { initJacob, setCollectionValue } from '/jacob.js';

// ---------- state ----------
let items = [];
let sortKey = 'updated';
let sortDir = 'desc';
let filterType = 'all';
let searchText = '';

const $ = (sel) => document.querySelector(sel);
const rowsEl = $('#rows');
const emptyEl = $('#empty-state');

// ---------- helpers ----------
function uid() {
  return (crypto.randomUUID && crypto.randomUUID()) || 'id-' + Math.random().toString(36).slice(2);
}

function fmtMoney(n, currency) {
  if (n == null || !Number.isFinite(n)) return '—';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD' }).format(n);
  } catch {
    return `${currency || ''} ${n.toFixed(2)}`.trim();
  }
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString();
}

// Effective value = manual override if set, else the eBay-sold estimate.
function effectiveValue(item) {
  if (item.useManual && Number.isFinite(item.manualValue)) {
    return { value: item.manualValue, currency: item.paidCurrency || 'USD', manual: true };
  }
  if (item.snapshot && Number.isFinite(item.snapshot.value)) {
    return { value: item.snapshot.value, currency: item.snapshot.currency || 'USD', manual: false };
  }
  return { value: null, currency: null, manual: false };
}

function gainLoss(item) {
  const ev = effectiveValue(item);
  const paid = Number.isFinite(item.pricePaid) ? item.pricePaid : null;
  if (ev.value == null || paid == null) return { comparable: false };
  if (ev.currency && item.paidCurrency && ev.currency !== item.paidCurrency) {
    return { comparable: false, reason: 'currency' };
  }
  const abs = Math.round((ev.value - paid) * 100) / 100;
  const pct = paid > 0 ? Math.round(((ev.value - paid) / paid) * 1000) / 10 : null;
  return { comparable: true, abs, pct, currency: ev.currency };
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.hidden = true), 2600);
}

// ---------- rendering ----------
function visibleItems() {
  const q = searchText.trim().toLowerCase();
  let list = items.filter((it) => {
    if (filterType !== 'all' && it.type !== filterType) return false;
    if (q) {
      const hay = `${it.title} ${it.grade || ''} ${it.notes || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const dir = sortDir === 'asc' ? 1 : -1;
  list.sort((a, b) => {
    const av = sortValue(a, sortKey);
    const bv = sortValue(b, sortKey);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;   // nulls last
    if (bv == null) return -1;
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });
  return list;
}

function sortValue(item, key) {
  switch (key) {
    case 'type': return item.type;
    case 'title': return (item.title || '').toLowerCase();
    case 'grade': return (item.grade || '').toLowerCase();
    case 'pricePaid': return Number.isFinite(item.pricePaid) ? item.pricePaid : null;
    case 'value': return effectiveValue(item).value;
    case 'gain': { const g = gainLoss(item); return g.comparable ? g.abs : null; }
    case 'updated': return item.updatedAt || '';
    default: return null;
  }
}

function render() {
  const list = visibleItems();
  rowsEl.innerHTML = '';
  emptyEl.hidden = items.length !== 0;
  $('#collection').style.display = items.length === 0 ? 'none' : '';

  for (const it of list) {
    const ev = effectiveValue(it);
    const g = gainLoss(it);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="pill ${it.type}">${it.type === 'card' ? 'Card' : 'Coin'}</span></td>
      <td>
        <div class="item-title">${escapeHtml(it.title)}</div>
        ${it.notes ? `<div class="item-sub">${escapeHtml(it.notes)}</div>` : ''}
      </td>
      <td>${it.grade ? escapeHtml(it.grade) : '<span class="muted">—</span>'}</td>
      <td class="num">${fmtMoney(it.pricePaid, it.paidCurrency)}</td>
      <td class="num">
        ${ev.value != null ? fmtMoney(ev.value, ev.currency) : '<span class="muted">—</span>'}
        ${ev.manual ? '<span class="manual-tag">manual</span>' : ''}
      </td>
      <td class="num">${gainCell(g)}</td>
      <td>${it.snapshot ? fmtDate(it.snapshot.generatedAt) : '<span class="muted">never</span>'}</td>
      <td class="actions-col">
        <span class="row-actions">
          <button class="icon-btn" data-act="view" title="View value & sold comps">🔍</button>
          <button class="icon-btn" data-act="price" title="Get / refresh eBay value">↻</button>
          <button class="icon-btn" data-act="edit" title="Edit">✏️</button>
          <button class="icon-btn" data-act="delete" title="Delete">🗑️</button>
        </span>
      </td>`;
    tr.querySelectorAll('[data-act]').forEach((btn) => {
      btn.addEventListener('click', () => handleRowAction(btn.dataset.act, it.id));
    });
    rowsEl.appendChild(tr);
  }

  renderTotals();
  renderSortIndicators();
}

function gainCell(g) {
  if (!g.comparable) {
    return g.reason === 'currency'
      ? '<span class="muted" title="Value and paid currencies differ">—</span>'
      : '<span class="muted">—</span>';
  }
  const cls = g.abs >= 0 ? 'gain-pos' : 'gain-neg';
  const sign = g.abs >= 0 ? '+' : '';
  const pct = g.pct == null ? '' : ` (${sign}${g.pct}%)`;
  return `<span class="${cls}">${sign}${fmtMoney(g.abs, g.currency)}${pct}</span>`;
}

function renderTotals() {
  $('#t-count').textContent = String(items.length);

  // Totals grouped by currency so we never add USD to EUR.
  const paidBy = {};
  const valBy = {};
  for (const it of items) {
    if (Number.isFinite(it.pricePaid)) {
      paidBy[it.paidCurrency || 'USD'] = (paidBy[it.paidCurrency || 'USD'] || 0) + it.pricePaid;
    }
    const ev = effectiveValue(it);
    if (ev.value != null) {
      valBy[ev.currency || 'USD'] = (valBy[ev.currency || 'USD'] || 0) + ev.value;
    }
  }
  $('#t-paid').textContent = sumLabel(paidBy);
  $('#t-value').textContent = sumLabel(valBy);

  // Jacob reacts to the biggest single-currency total (milestones are rough anyway).
  setCollectionValue(Math.max(0, ...Object.values(valBy)));

  // Gain only for the currencies present on both sides.
  const gainParts = [];
  for (const cur of Object.keys(valBy)) {
    if (paidBy[cur] != null) {
      const diff = Math.round((valBy[cur] - paidBy[cur]) * 100) / 100;
      const sign = diff >= 0 ? '+' : '';
      gainParts.push(`${sign}${fmtMoney(diff, cur)}`);
    }
  }
  const gainEl = $('#t-gain');
  gainEl.textContent = gainParts.length ? gainParts.join('  ') : '—';
  const firstDiff = gainParts.length ? gainParts[0] : '';
  gainEl.className = 'total-val ' + (firstDiff.startsWith('+') ? 'gain-pos' : firstDiff.startsWith('-') ? 'gain-neg' : '');
}

function sumLabel(byCur) {
  const keys = Object.keys(byCur);
  if (keys.length === 0) return '—';
  return keys.map((c) => fmtMoney(byCur[c], c)).join('  ');
}

function renderSortIndicators() {
  document.querySelectorAll('th[data-sort]').forEach((th) => {
    th.classList.toggle('sorted', th.dataset.sort === sortKey);
    th.classList.toggle('asc', th.dataset.sort === sortKey && sortDir === 'asc');
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// ---------- row actions ----------
async function handleRowAction(act, id) {
  const item = items.find((i) => i.id === id);
  if (!item) return;
  if (act === 'edit') return openForm(item);
  if (act === 'view') return openDetail(item);
  if (act === 'price') return priceItem(item);
  if (act === 'delete') {
    if (confirm(`Delete "${item.title}"? This can't be undone.`)) {
      await db.remove(id);
      items = items.filter((i) => i.id !== id);
      render();
      toast('Item deleted');
    }
  }
}

async function priceItem(item, { silent = false } = {}) {
  try {
    if (!silent) toast('Fetching eBay sold prices…');
    const snap = await fetchPrice({
      q: item.title, grade: item.grade, type: item.type, days: 90, site: item.site || 'ebay.com', refresh: true,
    });
    item.snapshot = snap;
    item.updatedAt = new Date().toISOString();
    await db.put(item);
    render();
    if (!silent) {
      toast(snap.count > 0
        ? `Valued at ${fmtMoney(snap.value, snap.currency)} from ${snap.count} sold comps`
        : 'No recent sold listings found — try broadening the search terms');
    }
    return snap;
  } catch (err) {
    if (!silent) toast(`Price lookup failed: ${err.message}`);
    return null;
  }
}

// ---------- add / edit ----------
const dialog = $('#item-dialog');

function openForm(item) {
  $('#dialog-title').textContent = item ? 'Edit item' : 'Add item';
  $('#f-id').value = item?.id || '';
  $('#f-type').value = item?.type || 'coin';
  $('#f-title').value = item?.title || '';
  $('#f-grade').value = item?.grade || '';
  $('#f-paid').value = Number.isFinite(item?.pricePaid) ? item.pricePaid : '';
  $('#f-currency').value = item?.paidCurrency || 'USD';
  $('#f-date').value = item?.dateBought || '';
  $('#f-site').value = item?.site || 'ebay.com';
  $('#f-notes').value = item?.notes || '';
  dialog.showModal();
  $('#f-title').focus();
}

$('#item-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = $('#f-id').value || uid();
  const existing = items.find((i) => i.id === id);
  const paidRaw = $('#f-paid').value;
  const item = {
    id,
    type: $('#f-type').value,
    title: $('#f-title').value.trim(),
    grade: $('#f-grade').value.trim(),
    pricePaid: paidRaw === '' ? null : Number(paidRaw),
    paidCurrency: $('#f-currency').value,
    dateBought: $('#f-date').value || null,
    site: $('#f-site').value,
    notes: $('#f-notes').value.trim(),
    snapshot: existing?.snapshot || null,
    manualValue: existing?.manualValue ?? null,
    useManual: existing?.useManual ?? false,
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  if (!item.title) { toast('Search terms are required'); return; }

  await db.put(item);
  const idx = items.findIndex((i) => i.id === id);
  if (idx >= 0) items[idx] = item; else items.push(item);
  dialog.close();
  render();

  // Auto-price brand-new items so he sees a value immediately.
  if (!existing) {
    playCashRegister();
    priceItem(item);
  }
});

// Cha-ching on every new registration. Muted failures are fine (e.g. autoplay
// restrictions) — the submit click counts as a user gesture in practice.
const cashRegisterSound = new Audio('/sounds/cash-register.mp3');
function playCashRegister() {
  try {
    cashRegisterSound.currentTime = 0;
    cashRegisterSound.play().catch(() => {});
  } catch { /* no audio support — ignore */ }
}

$('#cancel-btn').addEventListener('click', () => dialog.close());

// ---------- detail + manual override ----------
const detailDialog = $('#detail-dialog');

function openDetail(item) {
  const ev = effectiveValue(item);
  const snap = item.snapshot;
  const sourceBadge = snap
    ? `<span class="source-badge ${snap.source === 'mock' ? 'mock' : ''}">${snap.source === 'mock' ? 'demo data' : 'eBay sold'}</span>`
    : '';

  const compsRows = (snap?.comps || []).map((c) => `
    <tr>
      <td class="comp-title"><a href="${c.url || '#'}" target="_blank" rel="noopener" title="${escapeHtml(c.title)}">${escapeHtml(truncate(c.title, 60))}</a>
        ${c.bestOfferAccepted ? '<span class="bo-flag"> · best offer</span>' : ''}</td>
      <td class="muted comp-cond">${c.condition ? escapeHtml(c.condition) : ''}</td>
      <td class="muted comp-date">${fmtDate(c.endedAt)}</td>
      <td class="comp-price">${fmtMoney(c.price, c.currency)}</td>
    </tr>`).join('');

  detailDialog.innerHTML = `
    <div id="detail-body">
      <div class="detail-head">
        <div>
          <span class="pill ${item.type}">${item.type === 'card' ? 'Baseball card' : 'Coin'}</span>
          <h2 style="margin:.4rem 0 .1rem">${escapeHtml(item.title)}</h2>
          <div class="detail-meta">${item.grade ? 'Grade: ' + escapeHtml(item.grade) + ' · ' : ''}${escapeHtml(item.site || 'ebay.com')} ${sourceBadge}</div>
        </div>
        <button class="btn ghost small" id="detail-close">Close</button>
      </div>

      <div style="margin-top:1rem">
        <div class="detail-value">${ev.value != null ? fmtMoney(ev.value, ev.currency) : '—'} ${ev.manual ? '<span class="manual-tag">your price</span>' : ''}</div>
        ${snap && snap.count > 0 ? `<div class="detail-range">eBay estimate ${fmtMoney(snap.value, snap.currency)} · range ${fmtMoney(snap.low, snap.currency)}–${fmtMoney(snap.high, snap.currency)} · ${snap.count} matching sale${snap.count === 1 ? '' : 's'} in last ${snap.days} days${Number.isFinite(snap.scrapedCount) && snap.scrapedCount > snap.count ? ` (${snap.scrapedCount - snap.count} unrelated listings ignored)` : ''}</div>` : ''}
        ${snap && snap.count > 0 && snap.count < 3 ? '<div class="detail-range">Only a couple of close matches — treat this price as rough, or broaden the search terms.</div>' : ''}
        ${snap && snap.count === 0 ? `<div class="detail-range">No closely-matching sold listings found${Number.isFinite(snap.scrapedCount) && snap.scrapedCount > 0 ? ` (${snap.scrapedCount} unrelated listings ignored)` : ''}. Try broader search terms.</div>` : ''}
        ${!snap ? '<div class="detail-range">Not priced yet.</div>' : ''}
      </div>

      <div class="manual-box">
        <div class="row">
          <strong>Your own value:</strong>
          <input type="number" step="0.01" min="0" id="manual-input" placeholder="0.00"
                 value="${Number.isFinite(item.manualValue) ? item.manualValue : ''}" style="width:120px" />
          <span class="muted">${item.paidCurrency || 'USD'}</span>
          <button class="btn small primary" id="manual-save">Use my price</button>
          ${item.useManual ? '<button class="btn small ghost" id="manual-revert">Revert to eBay estimate</button>' : ''}
        </div>
        <div class="muted" style="font-size:.78rem;margin-top:.4rem">Overrides the scraped value for this item until you revert.</div>
      </div>

      <div style="display:flex;gap:.5rem;margin:.4rem 0 0">
        <button class="btn small" id="detail-reprice">↻ Refresh from eBay</button>
        <button class="btn small ghost" id="detail-edit">✏️ Edit details</button>
      </div>

      ${snap && snap.comps && snap.comps.length ? `
      <div class="comps">
        <h3>The sold listings behind this value</h3>
        <table class="comps-table"><tbody>${compsRows}</tbody></table>
      </div>` : ''}
    </div>`;

  detailDialog.showModal();

  $('#detail-close').onclick = () => detailDialog.close();
  $('#detail-edit').onclick = () => { detailDialog.close(); openForm(item); };
  $('#detail-reprice').onclick = async () => {
    detailDialog.close();
    const snap2 = await priceItem(item);
    if (snap2) openDetail(items.find((i) => i.id === item.id));
  };
  $('#manual-save').onclick = async () => {
    const v = Number($('#manual-input').value);
    if (!Number.isFinite(v) || v < 0) { toast('Enter a valid amount'); return; }
    item.manualValue = v;
    item.useManual = true;
    item.updatedAt = new Date().toISOString();
    await db.put(item);
    render();
    openDetail(item);
    toast('Using your price for this item');
  };
  const revert = $('#manual-revert');
  if (revert) revert.onclick = async () => {
    item.useManual = false;
    item.updatedAt = new Date().toISOString();
    await db.put(item);
    render();
    openDetail(item);
    toast('Reverted to eBay estimate');
  };
}

function truncate(s, n) {
  s = String(s || '');
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

// ---------- toolbar ----------
$('#add-btn').addEventListener('click', () => openForm(null));
$('#empty-add-btn').addEventListener('click', () => openForm(null));
$('#filter-type').addEventListener('change', (e) => { filterType = e.target.value; render(); });
$('#search-box').addEventListener('input', (e) => { searchText = e.target.value; render(); });

document.querySelectorAll('th[data-sort]').forEach((th) => {
  th.addEventListener('click', () => {
    const key = th.dataset.sort;
    if (sortKey === key) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    else { sortKey = key; sortDir = key === 'title' || key === 'grade' || key === 'type' ? 'asc' : 'desc'; }
    render();
  });
});

$('#refresh-all-btn').addEventListener('click', async () => {
  if (items.length === 0) return;
  if (!confirm(`Re-price all ${items.length} items from eBay sold listings?`)) return;
  let ok = 0;
  for (let i = 0; i < items.length; i++) {
    toast(`Re-pricing ${i + 1}/${items.length}…`);
    const snap = await priceItem(items[i], { silent: true });
    if (snap) ok++;
  }
  toast(`Re-priced ${ok}/${items.length} items`);
});

// ---------- export / import ----------
$('#export-btn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), items }, null, 2)],
    { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `collection-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Backup downloaded');
});

$('#import-btn').addEventListener('click', () => $('#import-file').click());
$('#import-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const incoming = Array.isArray(data) ? data : data.items;
    if (!Array.isArray(incoming)) throw new Error('Not a valid backup file');
    if (!confirm(`Replace your current collection with ${incoming.length} imported items?`)) return;
    await db.replaceAll(incoming);
    items = await db.getAll();
    render();
    toast(`Imported ${incoming.length} items`);
  } catch (err) {
    toast(`Import failed: ${err.message}`);
  } finally {
    e.target.value = '';
  }
});

// ---------- boot ----------
async function boot() {
  initJacob();
  try {
    items = await db.getAll();
  } catch (err) {
    toast('Could not open local storage: ' + err.message);
    items = [];
  }
  render();
  // Reflect pricing mode from a cheap probe of the API (mock vs live).
  try {
    const probe = await fetchPrice({ q: 'probe', days: 1 });
    if (probe.source === 'mock') {
      $('#mode-note').textContent = 'DEMO mode — realistic mock prices. Add a SoldComps key for real eBay data.';
    } else {
      $('#mode-note').textContent = 'Live: real eBay sold prices, filtered by grade.';
    }
  } catch (err) {
    if (/rejected the price key/i.test(err.message)) {
      $('#mode-note').textContent = '⚠ Price key problem — ' + err.message;
    }
    // otherwise leave default tagline
  }
}

boot();
