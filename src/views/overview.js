// Overview = widget centre. Every widget is clickable (goes to its big tab); "Customise" lets each user add, remove, reorder and resize widgets.
// Layout [{id,size}] is cached in localStorage and saved per user via admin_pref_set (falls back to localStorage if the RPC is missing).
import { html, useEffect, useRef, useState, Icon, Drawer, confirm } from '../ui.js';
import { fmt } from '../api.js';
import { rpc } from '../api.js';
import { useStore } from '../store.js';
import { go } from '../router.js';
import { WIDGETS, DEFAULT_LAYOUT, cleanLayout } from './widgets.js';

const PREF = 'overview.layout', SPAN = { s: 1, m: 2, l: 3 };
const lsKey = u => 'nsl-ov-layout:' + u;
const lsGet = u => { try { return cleanLayout(JSON.parse(localStorage.getItem(lsKey(u)))); } catch { return null; } };
const lsSet = (u, v) => { try { localStorage.setItem(lsKey(u), JSON.stringify(v)); } catch { /* private mode */ } };

function Frame({ w, item, edit, i, n, onMove, onSize, onRemove, drag }) {
  const C = w.Component;
  const open = e => { if (edit || e.target.closest('button,a,input,select,[role=switch]')) return; go(w.go); };
  const key = e => { if (!edit && e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); go(w.go); } };
  return html`<div class=${'wc-w wc-' + item.size + (edit ? ' wc-edit' : '') + (drag.over === i && drag.from !== i ? ' wc-over' : '')}
    role=${edit ? 'group' : 'link'} tabindex=${edit ? undefined : 0} aria-label=${w.title + (edit ? '' : ' — open ' + w.go)}
    onClick=${open} onKeyDown=${key}
    draggable=${edit} onDragStart=${e => { drag.set({ from: i, over: i }); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', item.id); } catch { /* old browsers */ } }}
    onDragOver=${e => { if (drag.from == null) return; e.preventDefault(); if (drag.over !== i) drag.set({ from: drag.from, over: i }); }}
    onDrop=${e => { e.preventDefault(); if (drag.from != null && drag.from !== i) onMove(drag.from, i); drag.set({ from: null, over: null }); }}
    onDragEnd=${() => drag.set({ from: null, over: null })}>
    ${edit && html`<div class="wc-bar" onClick=${e => e.stopPropagation()}>
      <span class="wc-grip" title="Drag to reorder" aria-hidden="true">⋮⋮</span><b class="trunc grow">${w.title}</b>
      <span class="seg" role="group" aria-label="Size">${['s', 'm', 'l'].map(s => html`<button type="button" aria-pressed=${item.size === s} onClick=${() => onSize(i, s)}>${s.toUpperCase()}</button>`)}</span>
      <button class="btn ghost sm" disabled=${i === 0} onClick=${() => onMove(i, i - 1)} aria-label=${'Move ' + w.title + ' up'}>↑</button>
      <button class="btn ghost sm" disabled=${i === n - 1} onClick=${() => onMove(i, i + 1)} aria-label=${'Move ' + w.title + ' down'}>↓</button>
      <button class="btn ghost sm" onClick=${() => onRemove(i)} aria-label=${'Remove ' + w.title}><${Icon} n="x" s="14"/></button></div>`}
    <div class="wc-body"><${C} size=${item.size}/></div>
  </div>`;
}

export function Overview() {
  const user = useStore(s => s.user), uk = user?.id || user?.email || 'anon';
  const [layout, setLayout] = useState(() => lsGet(uk) || DEFAULT_LAYOUT);
  const [edit, setEdit] = useState(false), [cat, setCat] = useState(false), [tick, setTick] = useState(0);
  const [dnd, setDnd] = useState({ from: null, over: null });
  const touched = useRef(false), timer = useRef(null), pending = useRef(null);

  // server copy wins unless the user already changed something this session
  useEffect(() => {
    touched.current = false;
    const l = lsGet(uk); if (l) setLayout(l);
    let live = true;
    rpc('admin_pref_get', { p_key: PREF }).then(v => { const c = cleanLayout(v); if (live && c && !touched.current) { setLayout(c); lsSet(uk, c); } }).catch(() => { /* migration not applied yet: localStorage only */ });
    return () => { live = false; };
  }, [uk]);
  const flush = () => { if (pending.current) { const v = pending.current; pending.current = null; clearTimeout(timer.current); rpc('admin_pref_set', { p_key: PREF, p_value: v }).catch(() => {}); } };
  useEffect(() => flush, []);
  const change = next => {
    touched.current = true; setLayout(next); lsSet(uk, next); pending.current = next;
    clearTimeout(timer.current); timer.current = setTimeout(flush, 600);
  };
  const move = (a, b) => { if (b < 0 || b >= layout.length) return; const n = [...layout]; n.splice(b, 0, n.splice(a, 1)[0]); change(n); };
  const size = (i, s) => change(layout.map((x, j) => j === i ? { ...x, size: s } : x));
  const remove = i => change(layout.filter((_, j) => j !== i));
  const add = id => change([...layout, { id, size: WIDGETS[id].size }]);
  const reset = async () => { if (await confirm({ title: 'Reset to default layout?', body: 'Your arrangement of widgets will be replaced.', ok: 'Reset' })) change(DEFAULT_LAYOUT); };
  const missing = Object.keys(WIDGETS).filter(id => !layout.some(x => x.id === id));

  return html`<div class="page">
    <div class="head"><div class="grow"><h1>Overview</h1></div>
      <span class="dim tiny row"><span class="dot pulse"></span>live · ${fmt.date(new Date().toISOString())}</span>
      ${edit ? html`<button class="btn sm" onClick=${() => setCat(true)}><${Icon} n="plus" s="14"/>Add widget</button>
        <button class="btn sm" onClick=${reset}><${Icon} n="reset" s="14"/>Reset to default</button>
        <button class="btn sm primary" onClick=${() => { setEdit(false); flush(); }}><${Icon} n="check" s="14"/>Done</button>`
      : html`<button class="btn sm" onClick=${() => setTick(t => t + 1)}><${Icon} n="refresh" s="14"/>Refresh</button>
        <button class="btn sm" onClick=${() => setEdit(true)}><${Icon} n="cog" s="14"/>Customise</button>`}</div>
    ${edit && html`<div class="wc-hint tiny dim">Drag a widget by its bar (or use the arrows), pick S / M / L for its width, remove with ×. Changes save automatically.</div>`}
    ${layout.length ? html`<div class="wc-grid">${layout.map((it, i) => html`<${Frame} key=${it.id + tick} w=${WIDGETS[it.id]} item=${it} i=${i} n=${layout.length} edit=${edit}
      onMove=${move} onSize=${size} onRemove=${remove} drag=${{ ...dnd, set: setDnd }}/>`)}</div>`
      : html`<div class="card"><div class="empty">No widgets. ${edit ? '' : html`<button class="btn sm" onClick=${() => setEdit(true)}>Customise</button>`}</div></div>`}
    ${cat && html`<${Drawer} title="Add widget" sub="Widget catalogue" onClose=${() => setCat(false)}>
      ${missing.length ? html`<div class="col">${missing.map(id => html`<button class="btn" style="justify-content:space-between;white-space:normal;text-align:left" onClick=${() => add(id)}>
        <span><b>${WIDGETS[id].title}</b><div class="tiny dim">${WIDGETS[id].desc}</div></span><${Icon} n="plus" s="14"/></button>`)}</div>`
        : html`<div class="muted">All widgets are already on your overview.</div>`}
    </${Drawer}>`}
  </div>`;
}
