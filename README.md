# Coin & Card Registry

A personal collection book for one collector that holds **coins and baseball cards in one registry** and prices each item from **real eBay _sold_ listings, filtered by grade** — the thing catalog sites like ucoin.net get wrong.

### ▶ Just want to put it online? No coding needed.

**[Read DEPLOY.md](DEPLOY.md)** for a 5-minute, click-by-click guide (an AI assistant can walk you through it), or hit the button:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/hackesmit/coin-card-registry&env=SOLDCOMPS_API_KEY&envDescription=Your%20SoldComps%20key%20for%20real%20eBay%20sold%20prices&envLink=https://sold-comps.com/&project-name=coin-card-registry&repository-name=coin-card-registry)

You'll sign in with GitHub, paste a free price key, and get your own web link to bookmark. Everything below is for developers.

---

> His complaint about ucoin: *"the price is always way off from the last eBay sale, and there's no filter by condition."* This app fixes exactly that — it shows what an item **in a specific grade actually sold for**, and shows you the receipts.

## What it does

- One registry for **coins + baseball cards**, each with your purchase price, grade, and notes.
- **"Get value"** pulls real completed eBay sales (last **90 days**) for that item + grade, and reports the **median** as the headline value with a **low–high range** and **the actual sold listings** it used.
- **Sort & filter** the whole collection by type, grade, value, or gain/loss.
- **Edit the price yourself** — override any item's value with your own number and revert to the eBay estimate anytime.
- **Totals** for what you paid vs. what it's worth (kept per-currency so USD and EUR never get mixed).
- **Export / Import** JSON backups (your collection lives in your browser; back it up so you don't lose it).

Photo/image recognition is intentionally **not** included (that's a separate, harder system) — you register items by text.

## Running it locally

Requires Node 18+ (uses the built-in test runner and global `fetch`). **Zero npm dependencies.**

```bash
cd coin-card-registry
node server.js
# open http://localhost:3000
```

Out of the box it runs in **DEMO mode**: realistic *mock* prices so you can try every feature without an API key.

## Turning on real eBay prices

Pricing comes from [SoldComps](https://sold-comps.com/) — a maintained API that returns real eBay sold listings without needing an eBay developer account or approval (free tier = 100 lookups/month; ~$9/mo for 2,000).

1. Sign up and get a key (looks like `sc_...`).
2. Set it and restart:

```bash
SOLDCOMPS_API_KEY=sc_your_key_here node server.js
```

The header will switch from "DEMO mode" to "Live". The key stays **server-side** — it is never sent to the browser.

## Deploying (Vercel)

The repo is already Vercel-shaped:

- `public/` — the static app (served at `/`)
- `api/price.js` — the serverless price proxy (`GET /api/price`)

Steps: `vercel` (or connect the repo in the dashboard), then add `SOLDCOMPS_API_KEY` as an Environment Variable. Netlify/Cloudflare Pages work the same way with a functions dir.

## How pricing works

1. Your **search terms + grade** become an eBay search keyword (e.g. `1968 Mexico 25 centavos PCGS MS65`). Grade is what narrows comps to the right condition.
2. The proxy calls SoldComps → real completed sales.
3. It computes the **median** (collectible prices are right-skewed, so median beats average) plus the **10th/90th percentile** as a range, and returns the underlying comps.
4. Results are cached for 10 minutes to sip API requests; "Refresh" bypasses the cache.

## Swapping the price source

All vendor-specific code lives in `src/providers.js`. To move to PriceCharting or eBay's official API later, add an adapter there that returns the same normalized comp shape — the proxy, UI, and tests don't change.

## Project layout

```
server.js            Local server: static files + /api/price (mirrors Vercel)
api/price.js          Vercel serverless handler
src/
  handler.js          Request handling + 10-min TTL cache
  priceService.js     Orchestrates a lookup (provider + query + summary)
  providers.js        SoldComps adapter + deterministic mock adapter
  pricing.js          Pure math: median, percentile, keyword, gain/loss
public/
  index.html app.js styles.css db.js api.js   The browser app
test/pricing.test.js  Unit tests (node --test)
```

## Tests

```bash
node --test
```
