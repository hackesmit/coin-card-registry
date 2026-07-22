// Jacob Goldberg — the registry's resident grandfather.
// Always in the corner; speaks on a random 1.5–2.5 minute timer, reacts to
// value milestones, and kvetches when poked. Lines live in /jacob-phrases.json
// so the collector can edit them without touching code.

const SPEAK_MIN_S = 90;
const SPEAK_MAX_S = 150;
const TYPE_MS = 34;
const LINGER_MS = 4000;

const MILESTONES = [
  { at: 100000, pool: 'milestone100k' },
  { at: 10000, pool: 'milestone10k' },
  { at: 1000, pool: 'milestone1k' },
  { at: 0, pool: null },
];

let phrases = { default: ['Nu? Any new treasures today?'], poke: ['Oy!'] };
const decks = {};
let els = null;
let speaking = false;
let soundEnabled = false;
let lastTier = null;
let tierInitialized = false;

export async function initJacob() {
  buildDom();
  try {
    const res = await fetch('/jacob-phrases.json');
    if (res.ok) phrases = await res.json();
  } catch { /* keep tiny built-in fallback */ }

  // Browsers block audio until a user gesture; the first click unlocks it.
  document.addEventListener('click', () => { soundEnabled = true; });

  scheduleNext();
}

// Called by the app whenever totals change. Crossing a milestone upward gets
// an immediate reaction; the first report just sets the baseline silently.
export function setCollectionValue(value) {
  const tier = MILESTONES.find((m) => value >= m.at);
  if (!tierInitialized) {
    tierInitialized = true;
    lastTier = tier;
    return;
  }
  if (tier !== lastTier && tier.pool && MILESTONES.indexOf(tier) < MILESTONES.indexOf(lastTier)) {
    speak(nextPhrase(tier.pool));
  }
  lastTier = tier;
}

// ---------- internals ----------

function buildDom() {
  const wrap = document.createElement('div');
  wrap.id = 'jacob-wrap';
  wrap.innerHTML = `
    <div id="jacob-bubble"><span class="jacob-who">Jacob Goldberg</span><span id="jacob-text"></span></div>
    <img id="jacob-img" src="/jacob/jacob.png" alt="Jacob Goldberg" title="Jacob Goldberg">
  `;
  document.body.appendChild(wrap);

  const audio = document.createElement('audio');
  audio.id = 'jacob-audio';
  audio.src = '/jacob/talking.mp3';
  audio.loop = true;
  audio.preload = 'auto';
  document.body.appendChild(audio);

  els = {
    bubble: wrap.querySelector('#jacob-bubble'),
    text: wrap.querySelector('#jacob-text'),
    img: wrap.querySelector('#jacob-img'),
    audio,
  };

  els.img.addEventListener('click', () => speak(nextPhrase('poke')));
}

function scheduleNext() {
  const delay = (SPEAK_MIN_S + Math.random() * (SPEAK_MAX_S - SPEAK_MIN_S)) * 1000;
  setTimeout(async () => {
    // Prefer the current milestone pool 1 time in 3, otherwise everyday lines.
    const pool = lastTier?.pool && Math.random() < 0.33 ? lastTier.pool : 'default';
    await speak(nextPhrase(pool));
    scheduleNext();
  }, delay);
}

// No repeats until a pool is exhausted, then reshuffle.
function nextPhrase(poolName) {
  const pool = Array.isArray(phrases[poolName]) && phrases[poolName].length
    ? phrases[poolName]
    : phrases.default;
  if (!decks[poolName] || decks[poolName].length === 0) {
    decks[poolName] = [...pool].sort(() => Math.random() - 0.5);
  }
  return decks[poolName].pop();
}

async function speak(text) {
  if (speaking || !els || !text) return;
  speaking = true;
  els.text.textContent = '';
  els.bubble.classList.add('show');
  els.img.classList.add('talking');
  if (soundEnabled) {
    els.audio.currentTime = 0;
    els.audio.play().catch(() => {});
  }

  for (const ch of text) {
    els.text.textContent += ch;
    await sleep(ch === ' ' ? 15 : TYPE_MS);
  }

  els.audio.pause();
  els.img.classList.remove('talking');
  await sleep(LINGER_MS);
  els.bubble.classList.remove('show');
  await sleep(300);
  speaking = false;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
