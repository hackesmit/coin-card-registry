# Publish your Coin & Card Registry (no coding needed)

This guide gets your registry online at its own web link. Once it's live, you just
bookmark the link — it works on your computer and your phone, and there's nothing to
install. **Total time: about 5–10 minutes.** You can do it with an AI assistant (like
Fable) reading this file and walking you through it.

You'll do three things: **(1)** get a free price key, **(2)** click Deploy, **(3)** paste the key.

---

## Step 1 — Get your free price key (SoldComps)

The registry gets real eBay *sold* prices from a service called **SoldComps**.

1. Go to **https://sold-comps.com/** and sign up (the free plan gives 100 price
   lookups per month — plenty to start; paid plans are ~$9/month for 2,000).
2. Copy your API key. It looks like `sc_` followed by a bunch of letters and numbers.
3. Keep it somewhere handy for Step 3. **Do not paste it into any code or share it publicly** —
   it's like a password.

> Don't have the key yet? You can still deploy now and add it later — the site will
> just show *demo* prices until the key is in.

---

## Step 2 — Click Deploy

1. Open this link (it deploys *this* project to your own free Vercel account):

   👉 **https://vercel.com/new/clone?repository-url=https://github.com/hackesmit/coin-card-registry&env=SOLDCOMPS_API_KEY&envDescription=Your%20SoldComps%20key%20for%20real%20eBay%20sold%20prices&envLink=https://sold-comps.com/&project-name=coin-card-registry&repository-name=coin-card-registry**

2. Sign in with **GitHub** (make a free account if you don't have one — click "Continue with GitHub").
3. Vercel will ask to create a copy of the project in your account. Click **Create**.

---

## Step 3 — Paste your key, then Deploy

1. On the deploy screen, Vercel asks for an Environment Variable named
   **`SOLDCOMPS_API_KEY`**. Paste your `sc_...` key from Step 1 into the value box.
2. Click **Deploy** and wait ~1 minute.
3. When it finishes, click **Visit** (or **Continue to Dashboard → Visit**). That web
   address (something like `https://coin-card-registry.vercel.app`) **is your registry.**
   Bookmark it. That's the link you use forever.

Done. 🎉

---

## How do I know it worked?

Open your new link. At the top it should say **"Live: real eBay sold prices."**
- If it says **"DEMO mode"** instead, the key wasn't added correctly — go to your
  Vercel dashboard → your project → **Settings → Environment Variables**, add
  `SOLDCOMPS_API_KEY` with your `sc_...` value, then **Deployments → ⋯ → Redeploy**.

Add a coin or card, hit the 🔍 to see its value and the actual eBay sold listings
behind it.

---

## A couple of things to know

- **Your collection is saved in your browser.** If you always use the same computer,
  it's just there. If you switch computers or clear your browser, use the **Export**
  button now and then to save a backup file (and **Import** to restore it).
- **Your price key stays private.** It lives in Vercel's settings, never in the public
  code, and is never shown to visitors.

---

## For the AI assistant helping with this (e.g. Fable)

You are guiding a **non-technical coin collector** through publishing this repo. Keep it
to the three steps above; don't introduce extra tooling. Concretely:

1. **Confirm the price key.** Ask if they have a SoldComps key (`sc_...`). If not, point
   them to https://sold-comps.com/ to sign up (free tier). Deploying without it is fine —
   the app runs in demo mode until the key is set.
2. **Deploy via the Vercel "Clone" link in Step 2** (already contains this repo URL and
   pre-declares the `SOLDCOMPS_API_KEY` env var). The flow is: sign in with GitHub →
   create the repo copy → paste the key into the `SOLDCOMPS_API_KEY` field → Deploy.
   Prefer this dashboard flow over the CLI — it's friendlier for a non-technical user.
3. **Verify** by opening the deployed URL and checking the header reads "Live," not "DEMO."
   If DEMO, the fix is Settings → Environment Variables → add `SOLDCOMPS_API_KEY` →
   Redeploy.

**Never** commit, print, or embed the API key in the repo — it belongs only in Vercel's
Environment Variables. This project has **no build step** and **no dependencies**
(Node 18+, built-in `fetch`); `public/` is served statically and `api/price.js` is the
serverless price proxy. If they'd rather run it on their own machine instead of hosting,
the command is `node server.js` (optionally with `SOLDCOMPS_API_KEY=sc_... ` in front),
then open http://localhost:3000 — but hosting via the link above is the recommended path.
