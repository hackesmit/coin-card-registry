// Calls the price proxy. The browser never sees the API key — it lives server-side.

export async function fetchPrice({ q, grade, type, days = 90, site = 'ebay.com', refresh = false }) {
  const params = new URLSearchParams({ q, days: String(days), site });
  if (grade) params.set('grade', grade);
  if (type) params.set('type', type);
  if (refresh) params.set('refresh', '1');

  const res = await fetch(`/api/price?${params.toString()}`);
  const data = await res.json().catch(() => ({ error: 'Bad response from price service' }));
  if (!res.ok) {
    throw new Error(data.error || `Price service error (${res.status})`);
  }
  return data;
}
