import { h, render, Fragment } from '../vendor/preact.mjs';
import { useEffect, useRef, useState, useMemo, useCallback, useLayoutEffect } from '../vendor/hooks.mjs';
import htm from '../vendor/htm.mjs';
import { signed, forget, fmt, sb } from './api.js';
import { useStore, toast } from './store.js';
import { t, lang } from './i18n.js';

// Every static text child and placeholder/title/aria-label goes through t() (Czech mode only; English is untouched and free).
const CZ = lang() === 'cs';
const th = !CZ ? h : (type, props, ...kids) => {
  if (typeof type === 'string') {
    if (props) for (const k of ['placeholder', 'title', 'aria-label']) if (typeof props[k] === 'string' && t(props[k]) !== props[k]) props = { ...props, [k]: t(props[k]) };
    for (let i = 0; i < kids.length; i++) if (typeof kids[i] === 'string') kids[i] = t(kids[i]);
  }
  return h(type, props, ...kids);
};
export const html = htm.bind(th);
export { h, render, Fragment, useEffect, useRef, useState, useMemo, useCallback };
export const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- icons (inline, stroke) ---------- */
const P = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  styles: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  users: 'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6M22 19v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8',
  orders: 'M6 2l-2 4v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V6l-2-4zM4 6h16M16 10a4 4 0 0 1-8 0',
  chart: 'M3 3v18h18M7 15l4-4 3 3 5-6',
  cog: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  x: 'M18 6 6 18M6 6l12 12',
  plus: 'M12 5v14M5 12h14',
  bolt: 'M13 2 3 14h9l-1 8 10-12h-9z',
  lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  ext: 'M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6',
  refresh: 'M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5',
  trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6',
  eye: 'M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
  wand: 'M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8 19 13M17.8 6.2 19 5M3 21l9-9M12.2 6.2 11 5',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  ban: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM4.9 4.9l14.2 14.2',
  reset: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5',
  sort: 'M3 6h13M3 12h9M3 18h5M17 10l3-3 3 3M20 7v13',
  archive: 'M21 8v13H3V8M1 3h22v5H1zM10 12h4',
  check: 'M20 6 9 17l-5-5',
  dot: 'M12 12h.01',
  chevl: 'M15 18l-6-6 6-6',
  chevr: 'M9 18l6-6-6-6',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  flask: 'M9 3h6M10 3v6L4 19a1 1 0 0 0 .9 1.5h14.2A1 1 0 0 0 20 19L14 9V3M7 14h10',
};
export const Icon = ({ n, s = 16, c = '' }) => html`<svg class=${c} width=${s} height=${s} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d=${P[n] || P.dot}/></svg>`;
export const Pill = ({ s, label }) => html`<span class=${'pill st-' + s}>${label || String(s || '').replace('_', ' ')}</span>`;

/* ---------- portal: overlays always live in <body>, never inside a scrolled/transformed page ---------- */
export function Portal({ children }) {
  const host = useMemo(() => { const d = document.createElement('div'); d.className = 'portal'; return d; }, []);
  useLayoutEffect(() => { document.body.append(host); return () => { render(null, host); host.remove(); }; }, []);
  useLayoutEffect(() => { render(children, host); });
  return null;
}
// Escape closes only the top-most overlay
const escStack = [];
function useEsc(onClose) {
  const ref = useRef(onClose); ref.current = onClose;
  useEffect(() => { const me = {}; escStack.push(me); const k = e => { if (e.key === 'Escape' && escStack[escStack.length - 1] === me) { e.preventDefault(); ref.current(); } }; addEventListener('keydown', k); return () => { removeEventListener('keydown', k); escStack.splice(escStack.indexOf(me), 1); }; }, []);
}
let locks = 0;
function useLockScroll() {
  useEffect(() => { if (!locks++) document.documentElement.classList.add('locked'); return () => { if (!--locks) document.documentElement.classList.remove('locked'); }; }, []);
}

/* ---------- count-up number ---------- */
export function Num({ v, f = fmt.n, ms = 450 }) {
  const [x, set] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const target = Number(v) || 0, start = from.current, t0 = performance.now();
    if (reduced()) { set(target); from.current = target; return; }
    let raf;
    const tick = t => { const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 4); set(start + (target - start) * e); if (k < 1) raf = requestAnimationFrame(tick); else from.current = target; };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [v]);
  return v == null ? '–' : f(Number.isInteger(Number(v)) ? Math.round(x) : Math.round(x * 10) / 10);
}

export const Kpi = ({ label, v, sub, f, tone }) => html`<div class="card kpi"><div class="l">${label}</div><div class=${'v ' + (tone || '')}><${Num} v=${v} f=${f}/></div>${sub && html`<div class="s">${sub}</div>`}</div>`;

/* ---------- charts ---------- */
export function Spark({ data, w = 300, hgt = 64, key = 'n' }) {
  const ref = useRef();
  const vals = data.map(d => Number(d[key]) || 0), max = Math.max(1, ...vals);
  const pts = vals.map((v, i) => [(i / Math.max(1, vals.length - 1)) * w, hgt - 4 - (v / max) * (hgt - 10)]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('');
  useEffect(() => { const p = ref.current?.querySelector('.ln'); if (p) p.style.setProperty('--len', Math.ceil(p.getTotalLength())); }, [d]);
  const last = pts[pts.length - 1];
  return html`<svg ref=${ref} class="chart" viewBox=${`0 0 ${w} ${hgt}`} preserveAspectRatio="none" role="img" aria-label="trend">
    <defs><linearGradient id="acidfade" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#c6ff33" stop-opacity=".28"/><stop offset="1" stop-color="#c6ff33" stop-opacity="0"/></linearGradient></defs>
    <path class="area" d=${d + `L${w} ${hgt}L0 ${hgt}Z`}/><path class="ln" d=${d} key=${d}/>
    ${last && html`<circle class="ping" cx=${last[0]} cy=${last[1]} r="3"/><circle cx=${last[0]} cy=${last[1]} r="3" fill="#c6ff33"/>`}
  </svg>`;
}

export function Bars({ data, series, w = 720, hgt = 180, labelEvery }) {
  const n = data.length, gap = n > 40 ? 1 : 3, bw = Math.max(2, (w - 30) / n - gap);
  const totals = data.map(d => series.reduce((a, s) => a + (Number(d[s.key]) || 0), 0));
  const max = Math.max(1, ...totals);
  const every = labelEvery || Math.ceil(n / 8);
  return html`<svg class="chart" viewBox=${`0 0 ${w} ${hgt + 18}`} role="img" aria-label="daily chart">
    ${[0.25, 0.5, 0.75, 1].map(k => html`<line class="ax" x1="30" x2=${w} y1=${hgt - k * hgt} y2=${hgt - k * hgt} stroke-dasharray="2 4"/><text x="0" y=${hgt - k * hgt + 3}>${Math.round(max * k)}</text>`)}
    ${data.map((d, i) => { let y = hgt; return html`<g>${series.map(s => { const v = Number(d[s.key]) || 0, bh = (v / max) * (hgt - 4); y -= bh; return v ? html`<rect class=${'b ' + (s.cls || '')} x=${30 + i * (bw + gap)} y=${y} width=${bw} height=${bh} rx="1.5" style=${`animation-delay:${i * 14}ms`}><title>${d.day}: ${s.label || s.key} ${v}</title></rect>` : null; })}
      ${i % every === 0 && html`<text x=${30 + i * (bw + gap)} y=${hgt + 14}>${fmt.day(d.day)}</text>`}</g>`; })}
  </svg>`;
}

export function Heatmap({ cells }) {
  const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
  cells.forEach(c => { grid[c.dow - 1][c.hour] = c.n; });
  const max = Math.max(1, ...cells.map(c => c.n)), days = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];
  return html`<svg class="chart" viewBox="0 0 520 170" role="img" aria-label="activity by weekday and hour">
    ${grid.map((row, d) => html`<g><text x="0" y=${d * 20 + 14}>${days[d]}</text>${row.map((v, hr) => html`<rect class="hm" x=${24 + hr * 20.6} y=${d * 20} width="18" height="17" rx="2" style=${`animation-delay:${(d * 24 + hr) * 4}ms`} fill=${v ? `rgba(198,255,51,${0.12 + 0.88 * (v / max)})` : '#151a20'}><title>${days[d]} ${hr}:00 · ${v}</title></rect>`)}</g>`)}
    ${[0, 6, 12, 18, 23].map(hr => html`<text x=${24 + hr * 20.6} y="160">${hr}h</text>`)}
  </svg>`;
}

export const HBar = ({ v, max, cls = '' }) => html`<div class="bar"><i class=${cls} style=${`width:${max ? Math.max(2, (v / max) * 100) : 0}%`}></i></div>`;

/* ---------- overlays ---------- */
export function Drawer({ title, sub, onClose, children, footer, actions }) {
  useLockScroll();
  useEsc(onClose);
  return html`<${Portal}><div class="scrim" onClick=${onClose}></div>
  <aside class="drawer" role="dialog" aria-modal="true" aria-label=${title}>
    <header><div class="grow"><div class="dim tiny trunc">${sub}</div><h2 class="trunc">${title}</h2></div>${actions}<button class="btn ghost" onClick=${onClose} aria-label="Close"><${Icon} n="x"/></button></header>
    <div class="body">${children}</div>${footer && html`<footer>${footer}</footer>`}
  </aside></${Portal}>`;
}

export function Modal({ title, onClose, children, footer, cls = '' }) {
  useLockScroll();
  useEsc(onClose);
  return html`<${Portal}><div class="scrim top" onClick=${onClose}></div>
  <div class=${'modal ' + cls} role="dialog" aria-modal="true" aria-label=${title || 'dialog'}>
    <div class="body">${title && html`<h2>${title}</h2>`}${children}</div>${footer && html`<footer>${footer}</footer>`}
  </div></${Portal}>`;
}

export function Lightbox({ src, alt, onClose, onPrev, onNext, pos }) {
  useLockScroll();
  useEsc(onClose);
  const nav = useRef({}); nav.current = { onPrev, onNext };
  useEffect(() => {
    const k = e => { if (e.key === 'ArrowLeft' && nav.current.onPrev) { e.preventDefault(); nav.current.onPrev(); } if (e.key === 'ArrowRight' && nav.current.onNext) { e.preventDefault(); nav.current.onNext(); } };
    addEventListener('keydown', k); return () => removeEventListener('keydown', k);
  }, []);
  const stop = f => e => { e.stopPropagation(); f(); };
  return html`<${Portal}><div class="lightbox" onClick=${onClose} role="dialog" aria-modal="true" aria-label=${alt || 'image'}>
    ${src ? html`<img key=${src} src=${src} alt=${alt || ''}/>` : html`<div class="spinner"></div>`}
    ${onPrev && html`<button class="btn ghost lb-nav prev" aria-label="Previous" onClick=${stop(onPrev)}><${Icon} n="chevl"/></button>`}
    ${onNext && html`<button class="btn ghost lb-nav next" aria-label="Next" onClick=${stop(onNext)}><${Icon} n="chevr"/></button>`}
    ${pos && html`<span class="lb-count">${pos} · ← →</span>`}
    <button class="btn ghost lb-close" aria-label="Close"><${Icon} n="x"/></button></div></${Portal}>`;
}

// Re-run fn every `ms` while the tab is visible, and once immediately when it becomes visible again.
export function usePoll(fn, ms) {
  const ref = useRef(fn); ref.current = fn;
  useEffect(() => {
    const tick = () => { if (document.visibilityState === 'visible') ref.current(); };
    const i = setInterval(tick, ms);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(i); document.removeEventListener('visibilitychange', tick); };
  }, [ms]);
}

export function confirm({ title, body, ok = 'Confirm', danger = false, type, input }) {
  return new Promise(res => {
    const host = document.createElement('div'); document.body.append(host);
    const close = v => { render(null, host); host.remove(); res(v); };
    function C() {
      const [t, setT] = useState(''); const [val, setVal] = useState('');
      const ready = !type || t.trim() === type;
      const done = () => close(input ? { value: val } : true);
      return html`<${Modal} title=${title} onClose=${() => close(false)} footer=${html`<button class="btn ghost" onClick=${() => close(false)}>Cancel</button><button class=${'btn ' + (danger ? 'danger' : 'primary')} disabled=${!ready} onClick=${done}>${ok}</button>`}>
        <div class="muted" style="margin:6px 0 12px">${body}</div>
        ${input && html`<label class="f">${input}<input class="in" autofocus value=${val} onInput=${e => setVal(e.target.value)}/></label>`}
        ${type && html`<label class="f" style="margin-top:8px">Type <b class="acid">${type}</b> to confirm<input class="in" autofocus=${!input} value=${t} onInput=${e => setT(e.target.value)} onKeyDown=${e => e.key === 'Enter' && ready && done()}/></label>`}
      </${Modal}>`;
    }
    render(html`<${C}/>`, host);
  });
}

export function Toasts() {
  const toasts = useStore(s => s.toasts);
  return html`<div class="toasts" aria-live="polite">${toasts.map(t => html`<div key=${t.id} class=${'toast ' + (t.kind === 'err' ? 'err' : t.kind === 'warn' ? 'warn' : '')}>
    ${t.kind !== 'err' && t.kind !== 'warn' && html`<svg class="tick" viewBox="0 0 24 24" width="16" height="16"><path d="M20 6 9 17l-5-5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`}
    <span>${t.text}</span><i class="tbar" style=${'animation-duration:' + (t.ms || 3600) + 'ms'}></i></div>`)}</div>`;
}

/* ---------- command palette ---------- */
export function Palette({ commands, onClose }) {
  const [q, setQ] = useState(''); const [i, setI] = useState(0);
  const list = useMemo(() => {
    const s = q.toLowerCase().trim();
    if (!s) return commands.slice(0, 40);
    return commands.map(c => ({ c, score: score(c.label.toLowerCase() + ' ' + (c.hint || '').toLowerCase(), s) })).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 40).map(x => x.c);
  }, [q, commands]);
  useEffect(() => setI(0), [q]);
  const run = c => { onClose(); setTimeout(() => c.run(), 0); };
  return html`<${Modal} cls="palette" onClose=${onClose}>
    <input class="in" autofocus placeholder="Type a command, style, or session…  (↑↓ ⏎)" value=${q} onInput=${e => setQ(e.target.value)}
      onKeyDown=${e => { if (e.key === 'ArrowDown') { e.preventDefault(); setI(Math.min(list.length - 1, i + 1)); } if (e.key === 'ArrowUp') { e.preventDefault(); setI(Math.max(0, i - 1)); } if (e.key === 'Enter' && list[i]) run(list[i]); }}/>
    <ul role="listbox">${list.map((c, k) => html`<li role="option" aria-selected=${k === i} style=${'--i:' + Math.min(k, 12)} onMouseEnter=${() => setI(k)} onClick=${() => run(c)}><${Icon} n=${c.icon || 'dot'}/><span>${c.label}</span><span class="k">${c.hint || ''}</span></li>`)}
    ${!list.length && html`<li class="dim">No match</li>`}</ul>
  </${Modal}>`;
}
function score(text, q) {
  let ti = 0, s = 0, streak = 0;
  for (const ch of q) { const f = text.indexOf(ch, ti); if (f < 0) return 0; streak = f === ti ? streak + 1 : 0; s += 1 + streak * 2 - (f - ti) * 0.05; ti = f + 1; }
  return s + (text.startsWith(q) ? 10 : 0);
}

/* ---------- images ---------- */
export function SImg({ path, bucket = 'previews', alt = '' }) {
  const [url, set] = useState(null);
  const retried = useRef(false);
  useEffect(() => { let on = true; retried.current = false; signed(path, bucket).then(u => on && set(u)); return () => { on = false; }; }, [path]);
  // A signed URL lives 15 min; if the browser only fetches it later (lazy load, long-open tab) it fails. Re-sign once.
  const onError = () => { if (retried.current) return; retried.current = true; forget(path, bucket); signed(path, bucket).then(set); };
  return url ? html`<img src=${url} alt=${alt} loading="lazy" decoding="async" onError=${onError}/>` : html`<div class="skel" style="width:100%;height:100%"></div>`;
}

// Resize in the browser (max 1600px, WebP) then upload to the public `style-assets` bucket.
async function toWebp(file, max = 1600) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return await new Promise(r => c.toBlob(r, 'image/webp', 0.86));
}
export function ImageField({ label, value, onChange, folder, disabled, hint }) {
  const [busy, setBusy] = useState(false); const [drag, setDrag] = useState(false);
  const input = useRef();
  const upload = async file => {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type) && !/\.(jpe?g|png|webp|heic)$/i.test(file.name)) return toast('Use JPG, PNG or WebP.', 'warn');
    if (file.size > 25 * 1024 * 1024) return toast('Image is over 25 MB.', 'warn');
    setBusy(true);
    try {
      const blob = await toWebp(file);
      const path = `${folder}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}.webp`;
      const { error } = await sb().storage.from('style-assets').upload(path, blob, { contentType: 'image/webp', cacheControl: '31536000', upsert: false });
      if (error) throw error;
      const { data } = sb().storage.from('style-assets').getPublicUrl(path);
      onChange(data.publicUrl); toast('Image uploaded · ' + Math.round(blob.size / 1024) + ' kB WebP');
    } catch (e) { toast('Upload failed: ' + (e.message || e), 'err', 6000); } finally { setBusy(false); }
  };
  return html`<div class="f"><span class="up tiny muted">${label} ${hint && html`<span class="hint">${hint}</span>`}</span>
    <div class=${'drop ' + (drag ? 'over ' : '') + (busy ? 'busy' : '')}
      onDragOver=${e => { e.preventDefault(); !disabled && setDrag(true); }} onDragLeave=${() => setDrag(false)}
      onDrop=${e => { e.preventDefault(); setDrag(false); !disabled && upload(e.dataTransfer.files[0]); }}>
      <div class="drop-img">${value ? html`<img src=${value} alt=""/>` : html`<${Icon} n="upload" s="22"/>`}${busy && html`<div class="spinner"></div>`}</div>
      <div class="col grow" style="gap:6px;min-width:0">
        <div class="row wrap"><button type="button" class="btn sm" disabled=${disabled || busy} onClick=${() => input.current.click()}><${Icon} n="upload" s="13"/>${busy ? 'Uploading…' : 'Upload image'}</button>
          ${value && !disabled && html`<button type="button" class="btn ghost sm" onClick=${() => onChange('')}><${Icon} n="x" s="12"/>clear</button>`}
          <span class="tiny dim">or drop a file · resized to WebP</span></div>
        <input class="in" placeholder="https://… (or paste a URL)" value=${value || ''} disabled=${disabled} onInput=${e => onChange(e.target.value)}/>
      </div>
      <input ref=${input} type="file" accept="image/jpeg,image/png,image/webp,image/heic" hidden onChange=${e => upload(e.target.files[0])}/>
    </div></div>`;
}

export const Empty = ({ children }) => html`<div class="empty">${children}</div>`;
export const Skel = ({ hgt = 120 }) => html`<div class="skel" style=${`height:${hgt}px`}></div>`;

export function Seg({ value, options, onChange }) {
  return html`<div class="seg" role="group">${options.map(o => html`<button type="button" aria-pressed=${value === o.v} onClick=${() => onChange(o.v)}>${o.l}</button>`)}</div>`;
}
export function Switch({ on, onChange, label }) {
  return html`<button type="button" class="switch" role="switch" aria-checked=${!!on} aria-label=${label} onClick=${() => onChange(!on)}></button>`;
}
export function SortSelect({ value, options, onChange }) {
  return html`<label class="sortsel"><${Icon} n="sort" s="14"/><select class="in" value=${value} onChange=${e => onChange(e.target.value)} aria-label="Sort">${options.map(o => html`<option value=${o.v}>${o.l}</option>`)}</select></label>`;
}

export async function copy(text) { try { await navigator.clipboard.writeText(text); toast('Copied to clipboard'); } catch { toast('Clipboard blocked', 'warn'); } }

// Stale-while-revalidate: a page you have seen before paints instantly from memory, then refreshes in the background.
// The key is the loader's source + its deps, so every call site caches separately. Cleared on lock / sign-out.
const SWR = new Map();
export const clearCache = () => SWR.clear();
const remember = (key, data) => { if (data == null) return; SWR.delete(key); SWR.set(key, data); if (SWR.size > 90) SWR.delete(SWR.keys().next().value); };
export function useLoad(fn, deps = []) {
  const key = String(fn) + '|' + JSON.stringify(deps);
  const [st, set] = useState(() => { const h = SWR.get(key); return { loading: h === undefined, data: h === undefined ? null : h, error: null }; });
  const n = useRef(0);
  const run = useCallback(async (quiet) => {
    const k = ++n.current;
    const h = SWR.get(key);
    if (!quiet) { if (h !== undefined) set({ loading: false, data: h, error: null }); else set(s => ({ ...s, loading: true })); }
    try { const data = await fn(); remember(key, data); if (k === n.current) set({ loading: false, data, error: null }); }
    catch (error) { if (k === n.current) set(s => ({ loading: false, data: s.data, error })); }
  }, deps);
  useEffect(() => { run(); }, [run]);
  return { ...st, reload: run };
}
