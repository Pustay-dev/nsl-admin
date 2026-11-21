import { html, Portal, Icon, useState, useRef, useEffect } from './ui.js';

// Full-screen image viewer: wheel zoom, +/- buttons, drag to pan, double-click fit <-> 100%, Esc closes.
export function ZoomViewer({ src, alt = '', onClose }) {
  const [v, setV] = useState({ x: 0, y: 0, k: 1 }); // k = zoom relative to "fit"
  const [nat, setNat] = useState(null); // natural size
  const box = useRef(null); const drag = useRef(null); const vr = useRef(v); vr.current = v;
  const fitK = () => { const b = box.current; return nat && b ? Math.min(1, b.clientWidth / nat.w, b.clientHeight / nat.h) : 1; };
  const zoomAt = (k2, cx, cy) => setV(p => { const k = Math.max(1, Math.min(40, k2)); const r = k / p.k; return k === 1 ? { x: 0, y: 0, k } : { k, x: cx - (cx - p.x) * r, y: cy - (cy - p.y) * r }; });
  const step = f => zoomAt(vr.current.k * f, 0, 0);
  const fit = () => setV({ x: 0, y: 0, k: 1 });
  const full = () => { const f = fitK(); setV(p => ({ x: 0, y: 0, k: f > 0 ? Math.max(1, 1 / f) : 1 })); };
  // Esc closes this viewer first (capture phase on window: runs before the modal underneath sees it)
  useEffect(() => {
    const k = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); } else if (e.key === '+' || e.key === '=') step(1.4); else if (e.key === '-') step(1 / 1.4); };
    addEventListener('keydown', k, true); return () => removeEventListener('keydown', k, true);
  }, [nat]);
  useEffect(() => { document.documentElement.classList.add('locked'); return () => document.documentElement.classList.remove('locked'); }, []);
  // wheel needs a non-passive listener to prevent page scroll
  useEffect(() => {
    const b = box.current; if (!b) return;
    const w = e => { e.preventDefault(); const r = b.getBoundingClientRect(); zoomAt(vr.current.k * Math.exp(-e.deltaY * 0.0018), e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2); };
    b.addEventListener('wheel', w, { passive: false }); return () => b.removeEventListener('wheel', w);
  }, []);
  const down = e => { if (e.button) return; drag.current = { sx: e.clientX, sy: e.clientY, ox: vr.current.x, oy: vr.current.y }; e.currentTarget.setPointerCapture?.(e.pointerId); };
  const move = e => { const d = drag.current; if (d) setV(p => ({ ...p, x: d.ox + e.clientX - d.sx, y: d.oy + e.clientY - d.sy })); };
  const up = () => { drag.current = null; };
  const dbl = e => { if (vr.current.k > 1.01) fit(); else { const f = fitK(); const r = box.current.getBoundingClientRect(); const k2 = f > 0 ? Math.max(1, 1 / f) : 2; zoomAt(k2, e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2); } };
  const pct = nat ? Math.round(fitK() * v.k * 100) : 100;
  return html`<${Portal}><div class="zv" role="dialog" aria-label="Image viewer">
    <div class="zv-bar"><span class="zv-t">${alt}</span><span class="grow"></span>
      <button class="btn sm" onClick=${() => step(1 / 1.4)} title="Zoom out" aria-label="Zoom out">−</button>
      <span class="zv-pct tiny">${pct}%</span>
      <button class="btn sm" onClick=${() => step(1.4)} title="Zoom in" aria-label="Zoom in">+</button>
      <button class="btn sm" onClick=${fit}>Fit</button><button class="btn sm" onClick=${full}>100%</button>
      <button class="btn sm" onClick=${onClose} title="Close (Esc)" aria-label="Close"><${Icon} n="x"/></button></div>
    <div class="zv-box" ref=${box} onPointerDown=${down} onPointerMove=${move} onPointerUp=${up} onPointerCancel=${up} onDblClick=${dbl}>
      <img class="zv-img" src=${src} alt=${alt} draggable="false" onLoad=${e => setNat({ w: e.target.naturalWidth, h: e.target.naturalHeight })} style=${'transform:translate(' + v.x + 'px,' + v.y + 'px) scale(' + v.k + ')'}/>
    </div></div></${Portal}>`;
}
