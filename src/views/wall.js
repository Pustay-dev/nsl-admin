import { html, useEffect, useRef, useState, Icon } from '../ui.js';
import { rpc, signed, forget } from '../api.js';
import { toast } from '../store.js';
import { ZoomViewer } from '../zoom.js';

// Wall: endless grid of finished portraits, nothing else on screen. Paid = images of paid non-test orders, All = every stored portrait.
// Faint corner controls (fade when the mouse rests): Paid/All, − / + columns, fullscreen. Keys: + − F. Click a tile = zoom viewer
// (paid order with a print file opens the print file, otherwise the preview).
const COLS = [2, 3, 4, 6, 8, 12, 16];
const PAGE = 60;
const read = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const keep = (k, v) => { try { localStorage.setItem(k, String(v)); } catch { /* blocked */ } };

function Tile({ it, big, onOpen }) {
  const path = big ? it.preview || it.thumb : it.thumb || it.preview;
  const [url, set] = useState(null); const [dead, setDead] = useState(false); const retried = useRef(false);
  useEffect(() => { let on = true; retried.current = false; signed(path).then(u => on && (u ? set(u) : setDead(true))); return () => { on = false; }; }, [path]);
  // signature expired or file gone: re-sign once, then drop the tile
  const onError = () => { if (retried.current) { setDead(true); return; } retried.current = true; forget(path); signed(path).then(u => (u ? set(u) : setDead(true))); };
  if (dead) return null;
  return html`<button class="wall-t" onClick=${() => onOpen(it)} aria-label="Open portrait">${url ? html`<img src=${url} alt="" loading="lazy" decoding="async" draggable="false" onError=${onError}/>` : ''}</button>`;
}

export function Wall() {
  const [src, setSrc] = useState(() => (read('nsl-wall-src', 'paid') === 'all' ? 'all' : 'paid'));
  const [ci, setCi] = useState(() => { const i = COLS.indexOf(Number(read('nsl-wall-cols', 6))); return i < 0 ? 3 : i; });
  const [rows, setRows] = useState([]); const [end, setEnd] = useState(false); const [err, setErr] = useState(null);
  const [zoom, setZoom] = useState(null); const [idle, setIdle] = useState(false); const [fs, setFs] = useState(false);
  const box = useRef(null); const sentinel = useRef(null); const busy = useRef(false); const st = useRef({});
  st.current = { rows, end, src, zoom };

  const gen = useRef(0); // bumps on every source switch; answers for an older generation are dropped
  const more = async () => {
    const s = st.current; if (busy.current || s.end) return; busy.current = true;
    const last = s.rows[s.rows.length - 1], g = gen.current;
    try {
      const page = await rpc('admin_wall', { p_source: s.src, p_before_at: last?.at || null, p_before_id: last?.id || null, p_limit: PAGE });
      if (g !== gen.current) return;
      st.current.rows = [...st.current.rows, ...page]; // so a second trigger before re-render pages on from here
      setRows(r => [...r, ...page]); if (page.length < PAGE) { st.current.end = true; setEnd(true); } setErr(null);
    } catch (e) { if (g === gen.current) setErr(e.message || String(e)); }
    finally { if (g === gen.current) busy.current = false; }
  };

  // new source: start over
  useEffect(() => {
    keep('nsl-wall-src', src); gen.current++; busy.current = false; st.current.rows = []; st.current.end = false;
    setRows([]); setEnd(false); setErr(null); if (box.current) box.current.scrollTop = 0;
  }, [src]);
  useEffect(() => { keep('nsl-wall-cols', COLS[ci]); }, [ci]);
  // keep loading while the sentinel is near the viewport (also refills after a source switch or column change)
  useEffect(() => {
    const el = sentinel.current; if (!el || end || err) return;
    const io = new IntersectionObserver(es => { if (es[0].isIntersecting) more(); }, { root: box.current, rootMargin: '1500px 0px' });
    io.observe(el);
    // Backup: the observer's first callback can be lost if the page was hidden or not laid out yet; measure directly too.
    const near = () => { const b = box.current; if (b && b.clientHeight && el.getBoundingClientRect().top - b.getBoundingClientRect().bottom < 1500) more(); };
    const t = setTimeout(near, 60), iv = setInterval(near, 1500);
    return () => { io.disconnect(); clearTimeout(t); clearInterval(iv); };
  }, [rows.length, end, err, src, ci]);

  // controls fade when the mouse rests
  useEffect(() => {
    let t; const wake = () => { setIdle(false); clearTimeout(t); t = setTimeout(() => setIdle(true), 1800); };
    wake(); const b = box.current; b.addEventListener('pointermove', wake); b.addEventListener('scroll', wake, { passive: true });
    return () => { clearTimeout(t); b.removeEventListener('pointermove', wake); b.removeEventListener('scroll', wake); };
  }, []);

  // Fullscreen the whole page (the zoom viewer is portalled to <body>, so it must stay inside the fullscreen subtree); the wall then covers everything.
  // If the browser refuses real fullscreen (embedded views, policy), the wall still covers the whole window.
  const fsRef = useRef(false); fsRef.current = fs;
  const toggleFs = () => {
    if (fsRef.current || document.fullscreenElement) { fsRef.current = false; setFs(false); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); return; }
    fsRef.current = true; setFs(true); document.documentElement.requestFullscreen?.().catch(() => {});
  };
  useEffect(() => {
    const f = () => { const on = !!document.fullscreenElement; fsRef.current = on; setFs(on); }; // browser Esc leaves fullscreen -> leave the cover too
    // fallback cover: Esc leaves it, unless something on top (palette, zoom) already handled that Esc
    const esc = e => { if (e.key === 'Escape' && !e.defaultPrevented && fsRef.current && !st.current.zoom && !document.fullscreenElement) { fsRef.current = false; setFs(false); } };
    document.addEventListener('fullscreenchange', f); addEventListener('keydown', esc);
    return () => { document.removeEventListener('fullscreenchange', f); removeEventListener('keydown', esc); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); };
  }, []);

  const step = d => setCi(i => Math.max(0, Math.min(COLS.length - 1, i + d)));
  useEffect(() => {
    const k = e => {
      if (st.current.zoom || e.ctrlKey || e.metaKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
      if (e.key === '+' || e.key === '=') step(-1); else if (e.key === '-') step(1); else if ((e.key || '').toLowerCase() === 'f') toggleFs();
    };
    addEventListener('keydown', k); return () => removeEventListener('keydown', k);
  }, []);

  const open = async it => {
    try {
      let u = null;
      if (it.item && it.has_file) { const p = await rpc('admin_order_print_path', { p_item: it.item }); u = p ? await signed(p, 'print-files') : null; }
      u ||= await signed(it.preview || it.thumb);
      if (u) setZoom(u); else toast('Could not open the portrait', 'warn');
    } catch (e) { toast(e.message || 'Could not open the portrait', 'warn'); }
  };

  const cols = COLS[ci];
  return html`<div class=${'wall' + (fs ? ' fs' : '') + (idle ? ' idle' : '')}>
    <div class="wall-scroll" ref=${box}>
    <div class="wall-g" style=${'--cols:' + cols}>${rows.map(it => html`<${Tile} key=${it.id} it=${it} big=${cols <= 3} onOpen=${open}/>`)}</div>
    ${end && !rows.length ? html`<div class="wall-empty">${src === 'paid' ? 'No paid portraits yet.' : 'No portraits yet.'}</div>` : ''}
    ${err ? html`<div class="wall-empty"><span>Could not load the wall.</span> <button class="btn sm" onClick=${() => setErr(null)}>Retry</button></div>` : ''}
      <div ref=${sentinel} class="wall-s"></div>
    </div>
    <div class="wall-ctl">
      <div class="seg" role="group"><button type="button" aria-pressed=${src === 'paid'} onClick=${() => setSrc('paid')}>Paid orders</button><button type="button" aria-pressed=${src === 'all'} onClick=${() => setSrc('all')}>All portraits</button></div>
      <button class="btn sm" onClick=${() => step(1)} disabled=${ci === COLS.length - 1} title="Smaller tiles (−)" aria-label="Smaller tiles">−</button>
      <button class="btn sm" onClick=${() => step(-1)} disabled=${ci === 0} title="Bigger tiles (+)" aria-label="Bigger tiles">+</button>
      <button class="btn sm" onClick=${toggleFs} title="Fullscreen (F)" aria-label="Fullscreen"><${Icon} n=${fs ? 'shrink' : 'full'} s="14"/></button>
    </div>
    ${zoom && html`<${ZoomViewer} src=${zoom} onClose=${() => setZoom(null)}/>`}
  </div>`;
}
