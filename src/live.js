import { html, useState, useEffect } from './ui.js';
import { FUNCTIONS } from './config.js';

// "Is it on the website yet?": reads the same public catalogue the shop reads (portrait-styles) and compares it with what was just saved.
// Visitors see a change after this catalogue refreshes (CDN cache ≤ ~1 min, stale-while-revalidate ≤ ~5 min) and their next page load.
export async function liveCatalog() {
  const r = await fetch(FUNCTIONS + '/portrait-styles?t=' + Date.now(), { cache: 'no-store', credentials: 'omit' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const d = await r.json();
  return (d.styles || []);
}

// check(styles[]) -> 'live' | 'diff' | 'absent' | 'off'. Re-checks every 8 s (max ~6 min) while the site still shows the old value.
export function useOnWebsite(check, deps, enabled = true) {
  const [s, setS] = useState('checking');
  useEffect(() => {
    if (!enabled) return;
    let on = true, n = 0, t;
    const tick = async () => {
      try {
        const r = check(await liveCatalog());
        if (!on) return; setS(r);
        if (r === 'diff' && ++n < 45) t = setTimeout(tick, 8000);
      } catch { if (on) setS('offline'); }
    };
    setS('checking'); t = setTimeout(tick, 1200);
    return () => { on = false; clearTimeout(t); };
  }, [...deps, enabled]);
  return s;
}

const TXT = {
  live: ['✓ On website', 'ok', 'The public site already shows these values.'],
  diff: ['↻ Reaching website…', '', 'Saved. Visitors see it after the catalogue refreshes (up to ~5 min) and their next page load.'],
  absent: ['Not on website', '', 'Not in the public catalogue: the style must be live (or hidden) in an enabled collection.'],
  off: ['Not public', '', 'Status is draft / review / retired, so customers do not see it.'],
};
export function WebChip({ s }) {
  const t = TXT[s]; if (!t) return null;
  return html`<span class=${'sv ' + t[1]} title=${t[2]}>${t[0]}</span>`;
}
