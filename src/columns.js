import { html, useState, useEffect, useRef } from './ui.js';
import { store, useStore } from './store.js';

// Per-user, per-table column visibility, persisted in localStorage `nsl-cols:<user>:<table>`.
// defs: [{ id, label, always?: true }]. Returns { visible(id), set(id, bool), reset(), picker, count, defs }.
const userKey = u => String(u?.id || u?.user_id || u?.email || 'anon');
const read = key => { try { const j = JSON.parse(localStorage.getItem(key) || 'null'); return j && typeof j === 'object' ? j : {}; } catch { return {}; } };
const write = (key, v) => { try { Object.keys(v).length ? localStorage.setItem(key, JSON.stringify(v)) : localStorage.removeItem(key); } catch { /* storage blocked */ } };

export function useColumns(tableId, defs) {
  const user = useStore(s => s.user);
  const key = 'nsl-cols:' + userKey(user || store.get().user) + ':' + tableId;
  const [hidden, setHidden] = useState(() => read(key)); // { id: true } = hidden
  useEffect(() => { setHidden(read(key)); }, [key]);
  const isAlways = id => !!defs.find(d => d.id === id)?.always;
  const visible = id => isAlways(id) || !hidden[id];
  const set = (id, on) => { if (isAlways(id)) return; setHidden(p => { const n = { ...p }; on ? delete n[id] : (n[id] = true); write(key, n); return n; }); };
  const reset = () => { write(key, {}); setHidden({}); };
  const count = defs.filter(d => visible(d.id)).length;
  const api = { visible, set, reset, count, defs };
  api.picker = html`<${ColumnPicker} cols=${api}/>`;
  return api;
}

export function ColumnPicker({ cols }) {
  const [open, setOpen] = useState(false); const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const d = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const k = e => { if (e.key === 'Escape') setOpen(false); };
    addEventListener('pointerdown', d); addEventListener('keydown', k);
    return () => { removeEventListener('pointerdown', d); removeEventListener('keydown', k); };
  }, [open]);
  return html`<span class="colpick" ref=${ref} style="position:relative;display:inline-block">
    <button class="btn sm" onClick=${() => setOpen(!open)} aria-expanded=${open}>Columns</button>
    ${open && html`<div class="card" style="position:absolute;right:0;top:100%;margin-top:4px;z-index:60;padding:8px 10px;min-width:170px;display:flex;flex-direction:column;gap:6px">
      ${cols.defs.map(d => html`<label class="row small" style=${'gap:8px;cursor:' + (d.always ? 'default' : 'pointer') + ';opacity:' + (d.always ? .55 : 1)}>
        <input type="checkbox" checked=${cols.visible(d.id)} disabled=${!!d.always} onChange=${e => cols.set(d.id, e.target.checked)}/>${d.label}</label>`)}
      <button class="btn sm" style="margin-top:2px" onClick=${cols.reset}>Reset</button></div>`}</span>`;
}
