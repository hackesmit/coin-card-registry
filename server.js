// Zero-dependency local server: serves the static app AND the /api/price proxy.
// Run: node server.js  (optionally SOLDCOMPS_API_KEY=... node server.js)
// This mirrors the Vercel deployment so "works locally" == "works deployed".

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handlePriceRequest } from './src/handler.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PUBLIC_DIR = join(__dirname, 'public');
const PORT = Number(process.env.PORT) || 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === '/api/price') {
      const query = Object.fromEntries(url.searchParams.entries());
      const { status, body } = await handlePriceRequest(query, process.env);
      send(res, status, JSON.stringify(body), 'application/json; charset=utf-8');
      return;
    }

    await serveStatic(url.pathname, res);
  } catch (err) {
    send(res, 500, JSON.stringify({ error: err.message }), 'application/json');
  }
});

async function serveStatic(pathname, res) {
  const rel = pathname === '/' ? '/index.html' : pathname;
  // Prevent path traversal.
  const safe = normalize(rel).replace(/^(\.\.[/\\])+/, '');
  const filePath = join(PUBLIC_DIR, safe);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    send(res, 403, 'Forbidden', 'text/plain');
    return;
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error('not a file');
    const data = await readFile(filePath);
    send(res, 200, data, MIME[extname(filePath)] || 'application/octet-stream');
  } catch {
    send(res, 404, 'Not found', 'text/plain');
  }
}

function send(res, status, body, contentType) {
  res.statusCode = status;
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'no-store');
  res.end(body);
}

server.listen(PORT, () => {
  const mode = process.env.SOLDCOMPS_API_KEY ? 'LIVE (SoldComps)' : 'DEMO (mock prices)';
  console.log(`Coin & Card Registry running at http://localhost:${PORT}  [pricing: ${mode}]`);
  if (!process.env.SOLDCOMPS_API_KEY) {
    console.log('  → No SOLDCOMPS_API_KEY set: using realistic mock prices so you can try everything.');
    console.log('  → Add a key (see .env.example / README) for real eBay sold prices.');
  }
});
