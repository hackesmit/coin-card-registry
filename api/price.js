// Vercel-style serverless function: GET /api/price
// Keeps the SoldComps API key server-side (never shipped to the browser).

import { handlePriceRequest } from '../src/handler.js';

export default async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const query = Object.fromEntries(url.searchParams.entries());
  const { status, body } = await handlePriceRequest(query, process.env);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}
