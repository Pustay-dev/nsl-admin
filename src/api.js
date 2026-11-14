// Data layer. All reads/writes go through guarded Postgres RPCs (admin_*).
import { SUPABASE_URL, SUPABASE_KEY, FUNCTIONS } from './config.js';
import { store } from './store.js';

const DAY_KEY = 'nsl-admin-day';
export const today = () => new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD, local time
export const dayStorage = {
  getItem(k) {
    try {
      const d = localStorage.getItem(DAY_KEY);
      if (d && d !== today()) { localStorage.removeItem(k); localStorage.removeItem(DAY_KEY); return null; }
      return localStorage.getItem(k);
    } catch { return null; }
  },
  setItem(k, v) { try { if (!localStorage.getItem(DAY_KEY)) localStorage.setItem(DAY_KEY, today()); localStorage.setItem(k, v); } catch { /* blocked */ } },
  removeItem(k) { try { localStorage.removeItem(k); localStorage.removeItem(DAY_KEY); } catch { /* blocked */ } },
};

let client;
export function sb() {
  if (window.__NSL_MOCK_CLIENT__) return window.__NSL_MOCK_CLIENT__; // local UI QA only (dev-server ?mock); never present in production
  if (!client) {
    // Login is kept on this device until the end of the (local) day: the session is stamped with the day it started
    // and discarded on first read after midnight. Manual lock / sign-out clears it immediately.
    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { storage: dayStorage, storageKey: 'nsl-admin-auth', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
      global: { headers: { 'x-client-info': 'nsl-admin/1' } },
    });
  }
  return client;
}

const MESSAGES = {
  ADMIN_MFA_REQUIRED: 'Second factor required.',
  ADMIN_ACCESS_REQUIRED: 'This account is not on the admin allowlist.',
  ADMIN_SIGN_IN_REQUIRED: 'Session expired. Sign in again.',
  ADMIN_ROLE_INSUFFICIENT: 'Your role cannot do that.',
  AUDIENCE_TAKEN: 'Another LIVE variant of this style already serves that audience. Set the other one to hidden/review first.',
  EDIT_CONFLICT: 'Someone saved this in the meantime. Reload and re-apply.',
  INVALID_ID: 'IDs: lowercase letters, digits and dashes; must start with a letter.',
  STYLE_ID_IMMUTABLE: 'IDs cannot be changed.',
  COLLECTION_NOT_EMPTY: 'Move its styles to another collection first.',
  COLLECTION_NOT_FOUND: 'Collection not found.',
  INVALID_IMAGE_URL: 'Pictures must be uploaded here (not linked from elsewhere).',
  INVALID_LABEL: 'The name must be 1–80 characters.',
  INVALID_TARGET: 'Cannot name that.',
  DAILY_NAME_CAP: 'Daily limit of AI name suggestions reached.',
  NO_USABLE_NAMES: 'The AI gave no usable names. Try a hint.',
  BAD_AI_RESPONSE: 'The AI answer was unreadable. Try again.',
  INVALID_SLOT: 'Unknown photo slot.',
  INVALID_PATH: 'That upload path is not allowed.',
  PHOTOS_MISSING: 'Upload all 3 hard photos first.',
  TEST_ALREADY_RUNNING: 'A test is already running. Wait for it to finish.',
  DAILY_TEST_CAP: 'Daily limit of 20 tests reached.',
  DAILY_REFINE_CAP: 'Daily limit of AI refinements reached.',
  WEBHOOK_NOT_CONFIGURED: 'The n8n prompt tester is not connected yet.',
  WEBHOOK_CALL_FAILED: 'Could not reach the n8n prompt tester. Is the workflow active?',
  TIMED_OUT: 'The test timed out (n8n did not answer).',
  STYLE_CHANGED_SINCE_TEST: 'The style changed after this test. Run the test again.',
  CHANGED_SINCE_APPLY: 'The text changed after applying, so it cannot be undone automatically.',
  ALREADY_APPLIED: 'This test was already applied.',
  NOTHING_TO_APPLY: 'This test changed no text, so there is nothing to apply.',
  RUN_NOT_FINISHED: 'The test has not finished yet.',
  INVALID_INSTRUCTION: 'Write a short instruction (3–1000 characters).',
  PROMPT_TOO_LONG: 'A prompt layer is too long (max 12 000 characters).',
  META_TOKEN_MISSING: 'META_ACCESS_TOKEN is not set (Supabase → Edge Functions → Secrets).',
  META_TOKEN_INVALID: 'The Meta token is expired or revoked. Create a new one and replace the secret.',
  META_PERMISSION_DENIED: 'The Meta token is not allowed to do that (needs ads_read, and ads_management for changes).',
  META_RATE_LIMITED: 'Meta rate limit. Try again in a few minutes.',
  META_ACCOUNT_MISSING: 'Enter the ad account ID first.',
  META_API_ERROR: 'Meta rejected the request.',
  BUDGET_STEP_TOO_BIG: 'Budget steps are limited to ±30 % at a time.',
  MAX_BUDGET_NOT_SET: 'Set a max daily budget (Growth → Guard-rails) before raising budgets.',
  OVER_MAX_BUDGET: 'That is above your max daily budget.',
  NO_DAILY_BUDGET: 'This object has no daily budget (lifetime or campaign-level budget).',
  OBJECT_NOT_FOUND: 'Unknown Meta object. Sync first.',
  INVALID_ACCOUNT_ID: 'Use the numeric ad account ID.',
  INVALID_NUMBER: 'Enter a plain number.',
  AB_INVALID_ID: 'Test IDs: lowercase letters, digits and dashes, 3–41 chars, start with a letter.',
  AB_INVALID_METRIC: 'Unknown metric.',
  AB_METRIC_LOCKED: 'The decision metric is locked once a test has started.',
  AB_NOT_FOUND: 'Unknown test.',
  AB_BAD_TRANSITION: 'That status change is not allowed (a stopped test cannot be restarted; create a new one).',
  AB_ONE_AT_A_TIME: 'Another test is running. Pause or stop it first: one test at a time.',
  AB_WINNER_REQUIRED: 'Pick the decision (A, B or no difference) to stop the test.',
};

export class ApiError extends Error {
  constructor(code, raw) { super(MESSAGES[code] || code); this.code = code; this.raw = raw; }
}

function codeOf(err) {
  const m = String(err?.message || err || 'REQUEST_FAILED');
  const known = m.match(/[A-Z][A-Z0-9_]{5,}/);
  if (err?.code === '23514') return 'CONSTRAINT: ' + m.replace(/^.*constraint "?([a-z_]+)"?.*$/s, '$1');
  return known ? known[0] : m;
}

export async function rpc(name, args = {}) {
  const t0 = performance.now();
  const { data, error } = await sb().rpc(name, args);
  const ms = Math.round(performance.now() - t0);
  store.patch({ lastRpc: { name, ms, ok: !error, at: Date.now() } });
  if (error) {
    const code = codeOf(error);
    if (code === 'ADMIN_SIGN_IN_REQUIRED' || code === 'ADMIN_MFA_REQUIRED') window.dispatchEvent(new CustomEvent('nsl:reauth', { detail: code }));
    throw new ApiError(code, error);
  }
  return data;
}

// Edge function bridge (session deletion needs service-side storage + auth cleanup).
export async function fn(name, body) {
  const { data: { session } } = await sb().auth.getSession();
  const r = await fetch(FUNCTIONS + '/' + name, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: 'Bearer ' + session?.access_token },
    body: JSON.stringify(body),
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(json.error || 'HTTP_' + r.status);
  return json;
}

// Short-lived signed URLs for private previews; batched and cached.
const cache = new Map();
const pending = new Map();
let timer = null;
// Drop a cached URL (e.g. the <img> failed because the 15 min signature expired) so the next call re-signs.
export function forget(path, bucket = 'previews') { cache.delete(bucket + ':' + path); }
export function signed(path, bucket = 'previews') {
  if (!path) return Promise.resolve(null);
  const key = bucket + ':' + path;
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return Promise.resolve(hit.url);
  return new Promise(res => {
    if (!pending.has(key)) pending.set(key, { bucket, path, waiters: [] });
    pending.get(key).waiters.push(res);
    clearTimeout(timer);
    timer = setTimeout(flush, 30);
  });
}
async function flush() {
  const batch = [...pending.values()]; pending.clear();
  const byBucket = {};
  for (const b of batch) (byBucket[b.bucket] ||= []).push(b);
  for (const [bucket, items] of Object.entries(byBucket)) {
    for (let i = 0; i < items.length; i += 100) {
      const chunk = items.slice(i, i + 100);
      const { data } = await sb().storage.from(bucket).createSignedUrls(chunk.map(x => x.path), 900).catch(() => ({ data: null }));
      chunk.forEach((x, k) => {
        const url = data?.[k]?.signedUrl || null;
        if (url) cache.set(bucket + ':' + x.path, { url, exp: Date.now() + 840_000 });
        x.waiters.forEach(w => w(url));
      });
    }
  }
}

export const fmt = {
  n: v => (v == null ? '–' : Number(v).toLocaleString('cs-CZ')),
  pct: (a, b) => (!b ? '–' : Math.round((a / b) * 100) + '%'),
  czk: v => (v == null ? '–' : Math.round(v).toLocaleString('cs-CZ') + ' Kč'),
  // Shopify cart prices arrive in haléře (minor units): 119000 → 1 190 Kč
  czkMinor: v => (v == null ? '–' : Math.round(Number(v) / 100).toLocaleString('cs-CZ') + ' Kč'),
  secs: v => (v == null ? '–' : v >= 120 ? Math.round(v / 60) + 'm' : Math.round(v) + 's'),
  ago(t) {
    if (!t) return '–';
    const s = (Date.now() - new Date(t).getTime()) / 1000;
    if (s < 60) return Math.max(1, Math.round(s)) + 's';
    if (s < 3600) return Math.round(s / 60) + 'm';
    if (s < 86400) return Math.round(s / 3600) + 'h';
    return Math.round(s / 86400) + 'd';
  },
  date: t => (t ? new Date(t).toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : '–'),
  day: t => new Date(t).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' }),
};
