import { html, useEffect, useState, useMemo, useRef, Icon, Pill, Drawer, Popup, Modal, Seg, Switch, Empty, Skel, ImageField, SortSelect, Picker, Emerald, usePeriod, uploadStyleImage, toJpegBase64, confirm, copy, useLoad } from '../ui.js';
import { ImageTile } from '../preview.js';
import { rpc, fmt } from '../api.js';
import { TestLab } from './lab.js';
import { AiName } from './ainame.js';
import { useAutosave, SaveBadge } from '../autosave.js';
import { useOnWebsite, WebChip } from '../live.js';
import { CollectionsModal } from './collections.js';
import { toast, useStore } from '../store.js';
import { go } from '../router.js';
import { Director } from './director.js';

const STATUSES = ['live', 'review', 'draft', 'hidden', 'retired'];
const STATUS_HELP = { live: 'listed + generatable', review: 'waiting for a decision', draft: 'work in progress', hidden: 'generatable via direct link, not listed', retired: 'never generatable, kept for history' };
const AUD_SHORT = { men: 'M', women: 'W', couples: 'C', children: 'K', family: 'F', pets: 'P', seniors: 'S' };
const SORTS = [{ v: 'smart', l: 'Smart (status · momentum)' }, { v: 'trending', l: 'Trending 7 days' }, { v: 'popular', l: 'Most generated' }, { v: 'conversion', l: 'Best conversion' }, { v: 'attention', l: 'Needs attention' }, { v: 'newest', l: 'Newest' }, { v: 'name', l: 'A → Z' }];
const RANK = { live: 4, review: 3, hidden: 2, draft: 1, retired: 0 };
const sum = (x, k) => x.variants.reduce((a, v) => a + (Number(v[k]) || 0), 0);
// what is missing for a style to be healthy on the shop
export function issues(x) {
  const out = [], live = x.variants.filter(v => v.status === 'live');
  if (x.status === 'review') out.push('waiting for review');
  if (x.status === 'live' && !live.length) out.push('live style without a live variant');
  if (x.status === 'live' && !x.cover_url) out.push('no cover image');
  if (live.some(v => !v.image)) out.push('variant without card image');
  if (x.status === 'live' && live.length === 1) out.push('serves only 1 audience');
  if (x.status === 'live' && (x.examples_ready ?? 0) < 6) out.push('example gallery ' + (x.examples_ready ?? 0) + '/6');
  return out;
}
const SORTERS = {
  smart: x => RANK[x.status] * 1e6 + sum(x, 'generated_7d') * 40 + x.generated_total + sum(x, 'orders') * 200,
  trending: x => sum(x, 'generated_7d') * 1e3 + x.generated_total,
  popular: x => x.generated_total,
  conversion: x => (x.generated_total ? sum(x, 'orders') / x.generated_total : 0) * 1e4 + sum(x, 'orders'),
  attention: x => issues(x).length * 100 + RANK[x.status],
  newest: x => new Date(x.created_at).getTime(),
};
const keep = (k, v) => { try { v === undefined ? (v = localStorage.getItem('nsl-admin-' + k)) : localStorage.setItem('nsl-admin-' + k, v); } catch { /* blocked */ } return v; };
const slug = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

// Three statuses on screen (the database keeps five): draft counts as "To review", retired as "Hidden".
const SHOWN = s => (s === 'live' ? 'live' : s === 'review' || s === 'draft' ? 'review' : 'hidden');
const SHOWN_LABEL = { live: 'Live', review: 'To review', hidden: 'Hidden' };
const SHOWN_PILL = { live: 'live', review: 'review', hidden: 'hidden' };
const StatusPill = ({ s }) => html`<${Pill} s=${SHOWN_PILL[SHOWN(s)]} label=${SHOWN_LABEL[SHOWN(s)]}/>`;
const STATUS_OPTS = counts => [{ v: 'all', l: 'all' }, ...['live', 'review', 'hidden'].map(s => ({ v: s, l: SHOWN_LABEL[s] + (counts[s] ? ' ' + counts[s] : '') }))];

function useRecent(days) {
  // last 3 days per style (admin_style_recent, migration 20261123120000). Until it is applied: false -> cards fall back to 7 days.
  const [r, setR] = useState(null);
  useEffect(() => { rpc('admin_style_recent', { p_days: days }).then(setR).catch(() => setR(false)); }, [days]);
  return r;
}

function StyleCard({ x, recent, audiences, editable, onSaved, periodLabel }) {
  const active = x.variants.filter(v => v.status !== 'retired');
  const vars = active.length ? active : x.variants;
  const [i, setI] = useState(() => Math.max(0, vars.findIndex(v => v.status === 'live')));
  const [showIssues, setShowIssues] = useState(false), [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try { return JSON.parse(keep('style-issues-' + x.id)) || []; } catch { return []; }
  });
  const rail = useRef();
  const index = Math.max(0, Math.min(i, vars.length - 1));
  const v = vars[index];
  const outstanding = issues(x).filter(issue => !dismissed.includes(issue));
  useEffect(() => {
    if (!rail.current) return;
    rail.current.scrollLeft = index * rail.current.clientWidth;
  }, [vars.length]);
  const r = recent && recent[x.id];
  const gens = r ? r.generated : sum(x, 'generated_7d');
  const aud = v && audiences.find(a => a.id === v.audience);
  const edit = variant => go('styles/' + x.id + (variant ? '~' + variant.id : ''));
  const flip = d => {
    const target = (index + d + vars.length) % vars.length;
    rail.current.scrollTo({ left: target * rail.current.clientWidth, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  };
  const dismiss = issue => {
    const next = [...dismissed, issue];
    setDismissed(next);
    keep('style-issues-' + x.id, JSON.stringify(next));
    if (outstanding.length === 1) setShowIssues(false);
  };
  const toggleStatus = async () => {
    if (busy) return;
    const status = v.status === 'live' ? 'hidden' : 'live';
    setBusy(true);
    try {
      if (status === 'hidden' && !(await confirm({ title: 'Hide this style variant?', body: 'It will disappear from the shop listings. Customers with a direct link can still use it.', ok: 'Hide variant', danger: true }))) return;
      if (status === 'live' && x.status !== 'live') await rpc('admin_style_save', { p: { id: x.id, status: 'live', expected_updated_at: x.updated_at } });
      await rpc('admin_variant_save', { p: { id: v.id, status, expected_updated_at: v.updated_at } });
      toast('Status: ' + SHOWN_LABEL[status]);
      await onSaved();
    } catch (e) { toast(e.message, 'err', 6000); onSaved(); } finally { setBusy(false); }
  };
  const toggleable = editable && v && (v.status === 'live' || v.status === 'hidden');
  return html`<div class="scard">
    <div class="cover-wrap">
      <div class="style-slides" ref=${rail} onScroll=${e => { const el = e.currentTarget; if (el.clientWidth) setI(Math.round(el.scrollLeft / el.clientWidth)); }}>
        ${(vars.length ? vars : [null]).map(variant => {
          const image = variant?.image || x.cover_url;
          return html`<button key=${variant?.id || x.id} type="button" class="cover" tabIndex="-1" onClick=${() => edit(variant)} aria-label=${variant?.name || x.name}>${image ? html`<img src=${image} alt="" loading="lazy" draggable="false"/>` : html`<${Icon} n="styles" s="22"/>`}</button>`;
        })}
      </div>
      ${v && (toggleable ? html`<button type="button" class="cover-pill status-toggle" onClick=${toggleStatus} disabled=${busy} title=${v.status === 'live' ? 'Hide variant' : 'Make variant live'}><${StatusPill} s=${v.status}/></button>` : html`<span class="cover-pill"><${StatusPill} s=${v.status}/></span>`)}
      ${outstanding.length > 0 && html`<button type="button" class="badge fix-badge" onClick=${() => setShowIssues(true)}>${outstanding.length} fix</button>`}
      ${vars.length > 1 && html`<button type="button" class="flip l" onClick=${() => flip(-1)} aria-label="Previous variant"><${Icon} n="chevl" s="16"/></button>
        <button type="button" class="flip r" onClick=${() => flip(1)} aria-label="Next variant"><${Icon} n="chevr" s="16"/></button>
        <span class="dots" aria-hidden="true">${vars.map((_, k) => html`<i class=${k === index ? 'on' : ''}></i>`)}</span>`}
    </div>
    <button type="button" class="body" onClick=${() => edit(v)}>
      <span class="row between"><span class="name trunc">${v?.name || x.name}</span><span class="tiny dim">${aud?.label || ''}</span></span>
      <span class="tiny dim trunc" style="display:block">${x.name}</span>
      <span class="sstat"><span class="dim">${r ? periodLabel : '7 days'}</span><span>${fmt.n(gens)} portraits made</span>${r ? html`<${Emerald} n=${r.orders}/>` : ''}</span>
    </button>
    ${showIssues && html`<${Modal} title="Style issues" onClose=${() => setShowIssues(false)}>
      <ul class="style-issues">${outstanding.map(issue => html`<li key=${issue}><span>${issue}</span><button type="button" class="btn ghost sm" onClick=${() => dismiss(issue)}>Dismiss</button></li>`)}</ul>
    </${Modal}>`}
  </div>`;
}
// Prompt lab / test lab from the ☰ menu: pick a style, then the lab opens for it.
function LabDrawer({ kind, meta, onClose, onChanged }) {
  const [id, setId] = useState(meta.styles.find(s => s.status === 'live')?.id || meta.styles[0]?.id);
  const style = meta.styles.find(s => s.id === id);
  return html`<${Drawer} title=${kind === 'test' ? 'Test lab' : 'Prompt lab'} onClose=${onClose}>
    <label class="f" style="margin-bottom:16px">Style<select class="in" value=${id} onChange=${e => setId(e.target.value)}>${meta.styles.map(s => html`<option value=${s.id}>${s.name}</option>`)}</select></label>
    ${style && (kind === 'test' ? html`<${TestLab} key=${style.id} style=${style} onChanged=${onChanged}/>` : html`<${PromptLab} key=${style.id} style=${style}/>`)}
  </${Drawer}>`;
}

export function Styles({ openId }) {
  const role = useStore(s => s.role);
  const { data, error, reload } = useLoad(() => rpc('admin_styles'));
  const P = usePeriod();
  const recent = useRecent(P.days);
  const [q, setQ] = useState(''); const [col, setCol] = useState('all'); const [st, setSt] = useState('all'); const [aud, setAud] = useState('all');
  const [modal, setModal] = useState(null); const [menu, setMenu] = useState(false);
  const [sort, setSort] = useState(() => keep('style-sort') || 'smart');
  const menuRef = useRef();
  useEffect(() => {
    if (!menu) return;
    requestAnimationFrame(() => menuRef.current?.querySelector('.menu-search input')?.focus()); // the menu opens as a search bar
    const off = e => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenu(false); };
    const esc = e => { if (e.key === 'Escape') setMenu(false); };
    addEventListener('pointerdown', off); addEventListener('keydown', esc);
    return () => { removeEventListener('pointerdown', off); removeEventListener('keydown', esc); };
  }, [menu]);
  const list = useMemo(() => {
    if (!data) return [];
    const s = q.toLowerCase().trim();
    return data.styles.filter(x => (col === 'all' || x.collection === col)
      && (aud === 'all' || x.variants.some(v => v.audience === aud && v.status !== 'retired'))
      && (st === 'all' || SHOWN(x.status) === st)
      && (!s || (x.name + ' ' + x.id + ' ' + x.variants.map(v => v.id + ' ' + v.name).join(' ')).toLowerCase().includes(s)))
      .sort(sort === 'name' ? (a, b) => a.name.localeCompare(b.name, 'cs') : (a, b) => SORTERS[sort](b) - SORTERS[sort](a));
  }, [data, q, col, st, sort, aud]);
  if (error && !data) return html`<div class="page"><div class="card red">${error.message}</div></div>`;
  const [openStyle, openVar] = String(openId || '').split('~');
  const open = data && openStyle ? data.styles.find(x => x.id === openStyle) : null;
  const openV = open ? open.variants.find(v => v.id === openVar) || open.variants.find(v => v.status === 'live') || open.variants[0] : null;
  const counts = data ? ['live', 'review', 'hidden'].reduce((o, k) => ({ ...o, [k]: data.styles.filter(x => SHOWN(x.status) === k).length }), {}) : {};
  const audiences = data?.audiences.filter(a => a.enabled) || [];
  const groups = [
    { id: 'aud', title: 'For whom', value: aud, options: [{ v: 'all', l: 'everyone' }, ...audiences.map(a => ({ v: a.id, l: a.label }))] },
    { id: 'col', title: 'Collection', value: col, options: [{ v: 'all', l: 'all collections' }, ...(data?.collections || []).map(c => ({ v: c.id, l: c.label }))] },
    { id: 'sort', title: 'Sort by', value: sort, options: SORTS },
    { id: 'st', title: 'Status', value: st, options: STATUS_OPTS(counts) },
  ];
  const pick = (id, v) => { if (id === 'aud') setAud(v); else if (id === 'col') setCol(v); else if (id === 'st') setSt(v); else { setSort(v); keep('style-sort', v); } };
  const act = m => { setMenu(false); setModal(m); };
  // most used first; owner-only and rare things last
  const items = [
    role !== 'viewer' && { m: 'new', icon: 'plus', l: 'New style' },
    { m: 'collections', icon: 'archive', l: 'Collections', off: !data },
    { m: 'promptlab', icon: 'eye', l: 'Prompt lab', off: !data },
    { m: 'testlab', icon: 'flask', l: 'Test lab', off: !data },
    role !== 'viewer' && { m: 'factory', icon: 'wand', l: 'AI factory', off: role !== 'owner' },
    { m: 'director', icon: 'bolt', l: 'Creative director' },
  ].filter(Boolean);

  return html`<div class="page">
    <div class="head"><h1>Styles</h1>${q && html`<button class="pv" style="border:0;cursor:pointer" onClick=${() => setQ('')} title="Clear search">„${q}" ×</button>`}<span class="grow"></span>
      <${Picker} groups=${groups} onChange=${pick}/>
      <div class="picker" ref=${menuRef}><button class="btn" aria-expanded=${menu} aria-haspopup="menu" onClick=${() => setMenu(m => !m)} aria-label="Style actions"><${Icon} n="more"/></button>
        ${menu && html`<div class="menu" role="menu">
          <label class="menu-search"><${Icon} n="search"/><input class="in" placeholder="Search styles and variants" value=${q} onInput=${e => setQ(e.target.value)} onKeyDown=${e => e.key === 'Enter' && setMenu(false)} autoFocus/></label>
          ${items.map(it => html`<button role="menuitem" disabled=${it.off} onClick=${() => act(it.m)}><${Icon} n=${it.icon}/>${it.l}</button>`)}</div>`}</div>
    </div>
    ${!data ? html`<div class="sgrid">${Array.from({ length: 8 }, () => html`<${Skel} hgt="320"/>`)}</div>` : list.length ? html`<div class="sgrid">
      ${list.map(x => html`<${StyleCard} key=${x.id} x=${x} recent=${recent} audiences=${audiences} periodLabel=${P.days === 1 ? 'Today' : P.label} editable=${role !== 'viewer'} onSaved=${() => reload(true)}/>`)}
    </div>` : html`<${Empty}>Nothing matches</${Empty}>`}
    ${open && openV && html`<${VariantEditor} key=${openV.id} style=${open} v=${openV} meta=${data} onClose=${() => go('styles')} onSaved=${() => reload(true)} role=${role}/>`}
    ${modal === 'new' && html`<${NewStyle} meta=${data} onClose=${() => setModal(null)} onDone=${id => { setModal(null); reload(true).then(() => go('styles/' + id)); }}/>`}
    ${modal === 'director' && html`<${Director} role=${role} onClose=${() => setModal(null)} onApplied=${() => reload(true)}/>`}
    ${modal === 'collections' && html`<${CollectionsModal} meta=${data} role=${role} onClose=${() => setModal(null)} onChanged=${() => reload(true)}/>`}
    ${modal === 'factory' && html`<${Factory} meta=${data} onClose=${() => setModal(null)} onDone=${() => { setModal(null); reload(true); }}/>`}
    ${(modal === 'promptlab' || modal === 'testlab') && data && html`<${LabDrawer} kind=${modal === 'testlab' ? 'test' : 'prompt'} meta=${data} onClose=${() => setModal(null)} onChanged=${() => reload(true)}/>`}
  </div>`;
}

const lsGet = k => { try { return localStorage.getItem('nsl-draft:' + k); } catch { return null; } };
const lsSet = (k, v) => { try { v == null ? localStorage.removeItem('nsl-draft:' + k) : localStorage.setItem('nsl-draft:' + k, v); } catch {} };
const changedKeys = (a, b, keys) => keys.filter(k => (a[k] ?? '') !== (b[k] ?? ''));

// Style fields that autosave. The base prompt of a LIVE style is held as a local draft until "Publish", so half-typed sentences never reach customers.
const S_KEYS = ['collection', 'base_prompt'];
const pickStyle = s => ({ status: s.status, collection: s.collection, base_prompt: s.base_prompt });
function useStyleForm(style, onSaved, editable) {
  const [base, setBase] = useState(() => pickStyle(style));
  const [f, setF] = useState(() => { const s = pickStyle(style); const d = style.status === 'live' ? lsGet(style.id + ':base') : null; return d && d !== s.base_prompt ? { ...s, base_prompt: d } : s; });
  const ver = useRef(style.updated_at);
  const fRef = useRef(f); fRef.current = f;
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const hold = base.status === 'live';
  const keys = hold ? S_KEYS.filter(k => k !== 'base_prompt') : S_KEYS;
  const valid = f.base_prompt.trim().length >= 40;
  const dirty = valid && changedKeys(f, base, keys).length > 0;
  const promptDirty = hold && f.base_prompt !== base.base_prompt;
  useEffect(() => {
    if (new Date(style.updated_at) > new Date(ver.current) && changedKeys(fRef.current, base, S_KEYS).length === 0) { const s = pickStyle(style); setBase(s); setF(s); ver.current = style.updated_at; }
  }, [style.updated_at]);
  useEffect(() => { if (hold) lsSet(style.id + ':base', promptDirty ? f.base_prompt : null); }, [f.base_prompt, hold]);
  const send = async patch => {
    const r = await rpc('admin_style_save', { p: { id: style.id, expected_updated_at: ver.current, ...patch } });
    ver.current = r.updated_at; setBase(b => ({ ...b, ...patch })); onSaved(); return r;
  };
  const a = useAutosave(JSON.stringify(keys.map(k => f[k])), dirty && editable, async () => {
    const snap = fRef.current; const ks = changedKeys(snap, base, keys); if (!ks.length) return;
    await send(Object.fromEntries(ks.map(k => [k, snap[k]])));
  });
  const discard = () => set('base_prompt', base.base_prompt);
  return { f, set, base, a, send, valid, promptDirty, discard, done: () => lsSet(style.id + ':base', null) };
}

const V_KEYS = ['name', 'audience', 'prompt', 'uses_family_base', 'image'];
const V_HELD = ['prompt', 'uses_family_base', 'audience']; // change what customers get: held until "Publish" while the variant is live
const pickVar = v => ({ name: v.name, status: v.status, audience: v.audience || '', prompt: v.prompt, uses_family_base: v.uses_family_base, image: v.image || '' });
function useVariantForm(v, onSaved, editable) {
  const [base, setBase] = useState(() => pickVar(v));
  const [f, setF] = useState(() => { const s = pickVar(v); const d = v.status === 'live' ? lsGet(v.id + ':prompt') : null; return d && d !== s.prompt ? { ...s, prompt: d } : s; });
  const ver = useRef(v.updated_at);
  const fRef = useRef(f); fRef.current = f;
  const set = (k, val) => setF(s => ({ ...s, [k]: val }));
  const hold = base.status === 'live';
  const keys = hold ? V_KEYS.filter(k => !V_HELD.includes(k)) : V_KEYS;
  const heldChanged = hold ? changedKeys(f, base, V_HELD) : [];
  const dirty = f.name.trim().length > 0 && changedKeys(f, base, keys).length > 0;
  useEffect(() => {
    if (new Date(v.updated_at) > new Date(ver.current) && changedKeys(fRef.current, base, V_KEYS).length === 0) { const s = pickVar(v); setBase(s); setF(s); ver.current = v.updated_at; }
  }, [v.updated_at]);
  useEffect(() => { if (hold) lsSet(v.id + ':prompt', f.prompt !== base.prompt ? f.prompt : null); }, [f.prompt, hold]);
  const send = async patch => {
    const r = await rpc('admin_variant_save', { p: { id: v.id, expected_updated_at: ver.current, ...patch } });
    ver.current = r.updated_at; setBase(b => ({ ...b, ...patch })); onSaved(); return r;
  };
  const a = useAutosave(JSON.stringify(keys.map(k => f[k])), dirty && editable, async () => {
    const snap = fRef.current; const ks = changedKeys(snap, base, keys); if (!ks.length) return;
    await send(Object.fromEntries(ks.map(k => [k, snap[k]])));
  });
  const discard = () => setF(s => ({ ...s, ...Object.fromEntries(heldChanged.map(k => [k, base[k]])) }));
  return { f, set, base, a, send, heldChanged, discard, done: () => lsSet(v.id + ':prompt', null) };
}

// "Suggest changes": the prompt-lab AI (cheap text model via n8n, max 60 a day) rewrites the variant prompt from your note.
function useSuggest(variantId, onPrompt, live) {
  const [busy, setBusy] = useState(false), [note, setNote] = useState('');
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  const run = async (instruction, prompt) => {
    if (instruction.trim().length < 3) return toast('Write what to change', 'warn');
    setBusy(true); setNote('');
    try {
      const { id } = await rpc('admin_pt_refine', { p_variant_id: variantId, p_instruction: instruction.trim(), p_layers: { variant_prompt: prompt }, p_run: null });
      for (let n = 0; n < 40; n++) {
        await new Promise(r => setTimeout(r, n ? 3000 : 2000));
        if (!alive.current) return; // editor closed: stop polling
        const r = await rpc('admin_pt_get', { p_id: id });
        if (r.status === 'done') { const p = r.result?.layers?.variant_prompt; if (p) { onPrompt(p); setNote(r.result.rationale || ''); toast(live ? 'AI suggestion is in the prompt. Check it, then Publish' : 'AI suggestion is in the prompt and saved'); } else toast('The AI returned nothing', 'warn'); return; }
        if (r.status === 'failed') { toast('AI could not do it: ' + (r.error || 'try again'), 'err', 6000); return; }
      }
      toast('The AI is taking too long. Try again', 'warn');
    } catch (e) { toast(e.message, 'err', 6000); } finally { setBusy(false); }
  };
  return { busy, note, run };
}

// Prompt history (admin_prompt_history, migration 20261123130000). The button stays hidden until the migration is applied.
function useHistory(variantId) {
  const [list, setList] = useState(null);
  useEffect(() => { rpc('admin_prompt_history', { p_variant: variantId }).then(setList).catch(() => setList(false)); }, [variantId]);
  return list;
}

// Style reference image for Image+Text styles (admin_style_reference*, migration 20261123130000). Before that: not shown.
function useReference(style) {
  const [ref, setRef] = useState(null);
  const load = () => rpc('admin_style_reference', { p_family: style.id }).then(r => setRef(r?.jpeg_base64 ? 'data:image/jpeg;base64,' + r.jpeg_base64 : '')).catch(() => setRef(false));
  useEffect(() => { if (style.has_reference) load(); }, [style.id]);
  return [ref, load];
}

function VariantEditor({ style, v, meta, onClose, onSaved, role }) {
  const editable = role !== 'viewer';
  const S = useStyleForm(style, onSaved, editable), V = useVariantForm(v, onSaved, editable);
  const sug = useSuggest(v.id, p => V.set('prompt', p), V.base.status === 'live');
  const history = useHistory(v.id);
  const [ref, reloadRef] = useReference(style);
  const [ask, setAsk] = useState(''); const [hist, setHist] = useState(false); const [pOpen, setPOpen] = useState(false);
  const live = v.status === 'live' || V.base.status === 'live';
  const pending = V.heldChanged.length > 0 || S.promptDirty;
  const others = style.variants.filter(x => x.id !== v.id && x.status !== 'retired').length;
  useEffect(() => { const k = e => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); V.a.flush?.(); S.a.flush?.(); } }; addEventListener('keydown', k); return () => removeEventListener('keydown', k); });

  const setStatus = async val => {
    const cur = SHOWN(V.base.status); if (!editable || val === cur) return;
    const q = val === 'live' ? { title: 'Show to customers?', body: 'This variant appears in the shop now.', ok: 'Go live' } : cur === 'live' ? { title: 'Take it off the shop?', body: val === 'hidden' ? 'Customers with a direct link can still use it.' : 'It waits for review and customers cannot pick it.', ok: 'Yes' } : null;
    if (q && !(await confirm(q))) return;
    try {
      // a live variant needs a live style: switch the style first, so a failure never leaves a live variant under a hidden style
      if (val === 'live' && style.status !== 'live') { await S.a.flush?.(); await S.send({ status: 'live' }); }
      await V.send({ status: val });
      V.set('status', val); toast('Status: ' + SHOWN_LABEL[val]);
    } catch (e) { toast(e.message, 'err', 6000); onSaved(); }
  };
  const publish = async () => {
    if (!(await confirm({ title: 'Publish changes?', body: (S.promptDirty ? 'The base prompt changes for every variant of this style. ' : '') + 'New portraits use it right away.', ok: 'Publish' }))) return;
    try {
      await V.a.flush?.(); await S.a.flush?.();
      if (S.promptDirty) { await S.send({ base_prompt: S.f.base_prompt }); S.done(); }
      if (V.heldChanged.length) { await V.send(Object.fromEntries(V.heldChanged.map(k => [k, V.f[k]]))); V.done(); }
      toast('Published');
    } catch (e) { toast(e.message, 'err', 6000); }
  };
  const uploadCard = async file => { try { const u = await uploadStyleImage(file, style.id + '/' + v.id); if (u) V.set('image', u); } catch (e) { toast('Upload failed: ' + (e.message || e), 'err', 6000); } };
  const uploadRef = async file => {
    if (!(await confirm({ title: 'Replace the style image?', body: 'Every new portrait in this style is made with the new picture.', ok: 'Replace' }))) return;
    try { const b = await toJpegBase64(file); if (!b) return; await rpc('admin_style_reference_set', { p_family: style.id, p_jpeg_base64: b }); toast('Style image replaced'); reloadRef(); onSaved(); } catch (e) { toast(e.message, 'err', 6000); }
  };

  return html`<${Popup} title=${V.f.name || v.name} sub=${style.name} onClose=${onClose}
    actions=${html`<${SaveBadge} a=${V.a} readOnly=${!editable}/>${S.a.s === 'error' || S.a.err ? html`<${SaveBadge} a=${S.a} readOnly=${!editable}/>` : ''}`}
    footer=${(pending && editable) || (style.factory && ['ready', 'needs_review'].includes(style.factory.status) && !['live', 'retired'].includes(style.status) && role === 'owner') ? html`<span class="grow"></span>
      ${style.factory && ['ready', 'needs_review'].includes(style.factory.status) && !['live', 'retired'].includes(style.status) && role === 'owner' && html`<${FactoryPublish} id=${style.id} onDone=${onSaved}/>`}
      ${pending && editable && html`<button class="btn lg ghost" onClick=${() => { V.discard(); S.discard(); }}>Discard draft</button><button class="btn lg primary" onClick=${publish}>Publish</button>`}` : null}>
    <div class="ve">
      <div class="ve-row3">
        <div class="col" style="gap:4px"><label class="f">Name<input class="in lg" value=${V.f.name} disabled=${!editable} onInput=${e => V.set('name', e.target.value)}/></label>
          ${editable && html`<${AiName} target="variant" getContext=${() => ({ text: (V.f.prompt || '') + '\n' + (S.f.base_prompt || '').slice(0, 1500), audience: V.f.audience || '', existing: style.variants.map(x => x.name) })} onPick=${s => V.set('name', s.name)}/>`}</div>
        <label class="f">Audience<select class="in lg" value=${V.f.audience} disabled=${!editable} onChange=${e => V.set('audience', e.target.value)}>${meta.audiences.map(a => html`<option value=${a.id}>${a.label}</option>`)}</select></label>
        <label class="f">Collection<select class="in lg" value=${S.f.collection} disabled=${!editable} onChange=${e => S.set('collection', e.target.value)}>${meta.collections.map(c => html`<option value=${c.id}>${c.label}</option>`)}</select>
          ${others > 0 && html`<span class="hint">For the whole style</span>`}</label>
      </div>
      <div class="f"><span>Status</span><div class="bigseg" role="group" aria-label="Status">${['live', 'review', 'hidden'].map(s => html`<button type="button" class=${'s-' + s} aria-pressed=${SHOWN(V.f.status) === s} disabled=${!editable} onClick=${() => setStatus(s)}>${SHOWN_LABEL[s]}</button>`)}</div></div>
      <div class="ve-imgs">
        <${ImageTile} label="Card image" src=${V.f.image} onUpload=${editable ? uploadCard : null}/>
        ${style.has_reference && html`<${ImageTile} label="Style image" src=${ref || null} onUpload=${editable && ref !== false ? uploadRef : null}
          note=${ref === false ? 'Shown after the database update' : ''}/>`}
      </div>
      <section class="ve-prompt">
        <button type="button" class="ve-toggle" aria-expanded=${pOpen} onClick=${() => setPOpen(o => !o)}><span>Prompt</span>${pending && html`<span class="tag">Draft</span>`}<span class="grow"></span><${Icon} n="chevr"/></button>
        ${pOpen && html`<div class="ve-pbody">
          ${V.f.uses_family_base && html`<label class="f">Base prompt<textarea class="in code" rows="6" disabled=${!editable} value=${S.f.base_prompt} onInput=${e => S.set('base_prompt', e.target.value)}></textarea>
            ${others > 0 && html`<span class="hint amber">Changes every variant of this style</span>`}</label>`}
          <div class="f"><span class="row between"><span>${V.f.uses_family_base ? 'Variant prompt' : 'Full prompt'}</span>
              ${history && history.length > 0 && html`<button type="button" class="btn ghost sm" onClick=${() => setHist(true)}>History</button>`}</span>
            <textarea class="in code" rows="8" disabled=${!editable} value=${V.f.prompt} onInput=${e => V.set('prompt', e.target.value)}></textarea></div>
          ${editable && html`<div class="f"><span>Suggest changes</span>
            <div class="row"><input class="in lg" placeholder="E.g. warmer light, less busy background" value=${ask} onInput=${e => setAsk(e.target.value)} onKeyDown=${e => e.key === 'Enter' && !sug.busy && sug.run(ask, V.f.prompt)}/>
              <button class="btn lg" disabled=${sug.busy} onClick=${() => sug.run(ask, V.f.prompt)}>${sug.busy ? html`<span class="spin"></span>` : html`<${Icon} n="wand"/>`}Suggest</button></div>
            ${sug.note && html`<span class="hint">${sug.note}</span>`}</div>`}
          ${!S.valid && editable && html`<span class="tiny amber">Base prompt needs 40+ characters</span>`}
        </div>`}
      </section>
    </div>
    ${hist && html`<${Modal} title="Prompt history" onClose=${() => setHist(false)}>
      <div class="col">${history.map(h => html`<div class="hist"><div class="row between"><b class="mono">v${h.version}</b><span class="tiny dim">${fmt.date(h.at)}</span></div>
        <pre class="prompt" style="max-height:160px">${h.prompt}</pre>
        ${editable && html`<button class="btn sm" onClick=${() => { V.set('prompt', h.prompt); setHist(false); toast(live ? 'Version loaded. Check it, then Publish' : 'Version loaded and saved'); }}>Use v${h.version}</button>`}</div>`)}</div>
    </${Modal}>`}
  </${Popup}>`;
}

function PromptLab({ style }) {
  const [vid, setVid] = useState(style.variants.find(v => v.status === 'live')?.id || style.variants[0]?.id);
  const [n, setN] = useState(0);
  const { data, loading, error } = useLoad(() => vid ? rpc('admin_prompt_preview', { p_variant_id: vid, p_subjects: n }) : null, [vid, n]);
  const parts = data ? data.prompt.split(/\n(?=[A-Z][A-Z ,'\-–—]{6,}\n?)/) : [];
  return html`<div class="col">
    <div class="row wrap"><select class="in" style="max-width:320px" value=${vid} onChange=${e => setVid(e.target.value)}>${style.variants.map(v => html`<option value=${v.id}>${v.name} · ${v.audience || '–'} · ${v.status}</option>`)}</select>
      <${Seg} value=${n} onChange=${setN} options=${[{ v: 0, l: 'auto' }, { v: 1, l: '1' }, { v: 2, l: '2' }, { v: 3, l: '3' }]}/>
      <span class="grow"></span>${data && html`<span class="tiny dim">${fmt.n(data.chars)} chars${data.reference_image ? ' · + reference image' : ''}</span><button class="btn sm" onClick=${() => copy(data.prompt)}><${Icon} n="copy" s="12"/>copy</button>`}</div>
    <div class="tiny dim">Exactly what the worker sends to the image model for a customer (global rules → style base → variant → subject rule).</div>
    ${error ? html`<div class="red">${error.message}</div>` : loading && !data ? html`<${Skel} hgt="300"/>` : data && html`<pre class="prompt">${parts.map(p => { const m = p.match(/^([A-Z][A-Z ,'\-–—]{6,})\n?/); return m ? html`<span class="h">${m[1]}</span>${'\n'}${p.slice(m[0].length)}${'\n\n'}` : p + '\n\n'; })}</pre>`}
  </div>`;
}

function FactoryPublish({ id, onDone }) {
  const go_ = async () => {
    if (!(await confirm({ title: 'Publish factory style?', body: 'Makes every variant live and starts the 6-image example gallery per variant (paid image generations).', ok: 'Publish', type: 'PUBLISH' }))) return;
    try { await rpc('admin_factory_publish', { p_family_id: id }); toast('Published'); onDone(); } catch (e) { toast(e.message, 'err'); }
  };
  return html`<button class="btn" onClick=${go_}><${Icon} n="bolt" s="14"/>Publish review</button>`;
}

function NewStyle({ meta, onClose, onDone }) {
  const [f, setF] = useState({ name: '', id: '', collection: meta.collections[0].id, base_prompt: '', cover_url: '' });
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const id = touched ? f.id : slug(f.name);
  const ok = id.length > 1 && f.name.trim() && f.base_prompt.trim().length >= 40 && !meta.styles.some(s => s.id === id);
  const create = async () => {
    setBusy(true);
    try { await rpc('admin_style_save', { p: { id, name: f.name, collection: f.collection, base_prompt: f.base_prompt, cover_url: f.cover_url, status: 'draft' } }); toast('Created ' + id + ' (draft)'); onDone(id); }
    catch (e) { toast(e.message, 'err', 6000); } finally { setBusy(false); }
  };
  return html`<${Modal} title="New style" onClose=${onClose} footer=${html`<button class="btn ghost" onClick=${onClose}>Cancel</button><button class="btn primary" disabled=${!ok || busy} onClick=${create}>Create draft</button>`}>
    <div class="col" style="margin-top:10px">
      <label class="f">Name<input class="in" autofocus value=${f.name} onInput=${e => setF({ ...f, name: e.target.value })}/></label>
      <${AiName} target="style" getContext=${() => ({ text: f.base_prompt || f.name, collection: meta.collections.find(c => c.id === f.collection)?.label || '', existing: meta.styles.map(s => s.name) })} onPick=${s => setF({ ...f, name: s.name })}/>
      <label class="f">ID <span class="hint">${meta.styles.some(s => s.id === id) ? html`<span class="red">taken</span>` : 'permanent'}</span><input class="in" value=${id} onInput=${e => { setTouched(true); setF({ ...f, id: slug(e.target.value) }); }}/></label>
      <label class="f">Collection<select class="in" value=${f.collection} onChange=${e => setF({ ...f, collection: e.target.value })}>${meta.collections.map(c => html`<option value=${c.id}>${c.label}</option>`)}</select></label>
      <${ImageField} label="Cover image" hint="optional" value=${f.cover_url} folder=${id || 'new'} onChange=${v => setF({ ...f, cover_url: v })}/>
      <label class="f">Base prompt (the look) <span class="hint">min 40 chars · ${f.base_prompt.length}</span><textarea class="in code" onInput=${e => setF({ ...f, base_prompt: e.target.value })}>${f.base_prompt}</textarea></label>
      <div class="tiny dim">Starts as <b>draft</b>. Add variants per audience, check the prompt lab, then set it live.</div>
    </div></${Modal}>`;
}

function Factory({ meta, onClose, onDone }) {
  const [f, setF] = useState({ display_name: '', family_id: '', concept: '', categories: ['men', 'women'], reference_urls: '' });
  const [busy, setBusy] = useState(false);
  const id = f.family_id || slug(f.display_name);
  const auds = meta.audiences.filter(a => a.enabled);
  const ok = id.length > 1 && f.display_name.trim() && f.concept.trim().length >= 10 && f.categories.length;
  const toggle = c => setF(s => ({ ...s, categories: s.categories.includes(c) ? s.categories.filter(x => x !== c) : [...s.categories, c] }));
  const send = async () => {
    if (!(await confirm({ title: 'Send to the AI style factory?', body: `The n8n factory will plan "${f.display_name}" and generate ${f.categories.length} paid preview image(s) within ~5 minutes. It lands here as a draft/review style.`, ok: 'Send' }))) return;
    setBusy(true);
    try {
      const refs = f.reference_urls.split(/\s+/).filter(Boolean).slice(0, 3);
      const r = await rpc('admin_factory_request', { p: { family_id: id, display_name: f.display_name, concept: f.concept, categories: f.categories, reference_urls: refs } });
      toast('Factory: ' + (r?.result || 'sent') + ' · ' + (r?.status || ''), r?.result === 'queued' ? 'ok' : 'warn', 6000); onDone();
    } catch (e) { toast(e.message, 'err', 6000); } finally { setBusy(false); }
  };
  return html`<${Modal} title="AI style factory" onClose=${onClose} footer=${html`<button class="btn ghost" onClick=${onClose}>Cancel</button><button class="btn primary" disabled=${!ok || busy} onClick=${send}><${Icon} n="wand" s="14"/>Queue</button>`}>
    <div class="col" style="margin-top:10px">
      <label class="f">Style name (Czech)<input class="in" autofocus value=${f.display_name} onInput=${e => setF({ ...f, display_name: e.target.value })}/></label>
      <label class="f">ID<input class="in" value=${id} onInput=${e => setF({ ...f, family_id: slug(e.target.value) })}/></label>
      <label class="f">Concept / art brief <span class="hint">medium, palette, setting, mood · ${f.concept.length}</span><textarea class="in" onInput=${e => setF({ ...f, concept: e.target.value })}>${f.concept}</textarea></label>
      <div class="f"><span class="up tiny muted">Audiences (one variant each)</span><div class="row wrap" style="gap:6px">${auds.map(a => html`<button type="button" class="chip" aria-pressed=${f.categories.includes(a.id)} onClick=${() => toggle(a.id)}>${a.label}</button>`)}</div></div>
      <label class="f">Reference image URLs <span class="hint">optional · up to 3 · public https</span><input class="in" value=${f.reference_urls} onInput=${e => setF({ ...f, reference_urls: e.target.value })}/></label>
    </div></${Modal}>`;
}

