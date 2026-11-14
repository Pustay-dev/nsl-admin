import { html, useEffect, useState, useMemo, useRef, Icon, Pill, Drawer, Modal, Seg, Switch, Empty, Skel, ImageField, SortSelect, confirm, copy, useLoad } from '../ui.js';
import { rpc, fmt } from '../api.js';
import { ExamplesTab } from './examples.js';
import { TestLab } from './lab.js';
import { AiName } from './ainame.js';
import { useAutosave, SaveBadge } from '../autosave.js';
import { useOnWebsite, WebChip } from '../live.js';
import { CollectionsModal } from './collections.js';
import { toast, useStore } from '../store.js';
import { go } from '../router.js';

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

export function Styles({ openId }) {
  const role = useStore(s => s.role);
  const { data, error, reload } = useLoad(() => rpc('admin_styles'));
  const [q, setQ] = useState(''); const [col, setCol] = useState('all'); const [st, setSt] = useState('active');
  const [modal, setModal] = useState(null);
  const [sort, setSort] = useState(() => keep('style-sort') || 'smart');
  const list = useMemo(() => {
    if (!data) return [];
    const s = q.toLowerCase().trim();
    return data.styles.filter(x => (col === 'all' || x.collection === col)
      && (st === 'all' || (st === 'active' ? ['live', 'review', 'hidden'].includes(x.status) : x.status === st))
      && (!s || (x.name + ' ' + x.id + ' ' + x.variants.map(v => v.id + ' ' + v.name).join(' ')).toLowerCase().includes(s)))
      .sort(sort === 'name' ? (a, b) => a.name.localeCompare(b.name, 'cs') : (a, b) => SORTERS[sort](b) - SORTERS[sort](a));
  }, [data, q, col, st, sort]);
  if (error && !data) return html`<div class="page"><div class="card red">${error.message}</div></div>`;
  const open = data && openId ? data.styles.find(x => x.id === openId) : null;
  const counts = data ? STATUSES.reduce((o, k) => ({ ...o, [k]: data.styles.filter(x => x.status === k).length }), {}) : {};
  const audiences = data?.audiences.filter(a => a.enabled) || [];

  return html`<div class="page">
    <div class="head"><div class="grow"><h1>Styles</h1></div>
      <button class="btn" onClick=${() => setModal('collections')} disabled=${!data}><${Icon} n="archive" s="14"/>Collections</button>
      ${role !== 'viewer' && html`<button class="btn" onClick=${() => setModal('factory')} disabled=${role !== 'owner'}><${Icon} n="wand" s="14"/>AI factory</button>
      <button class="btn primary" onClick=${() => setModal('new')}><${Icon} n="plus" s="14"/>New style</button>`}
    </div>
    <div class="row wrap" style="margin-bottom:14px;gap:10px">
      <div class="row" style="flex:1;min-width:220px;max-width:340px"><input class="in" placeholder="search styles & variants…" value=${q} onInput=${e => setQ(e.target.value)}/></div>
      <div class="row wrap" style="gap:6px">
        <button class="chip" aria-pressed=${col === 'all'} onClick=${() => setCol('all')}>all</button>
        ${data?.collections.map(c => html`<button class="chip" aria-pressed=${col === c.id} onClick=${() => setCol(c.id)}>${c.label}</button>`)}
      </div>
      <span class="grow"></span>
      <${SortSelect} value=${sort} options=${SORTS} onChange=${v => { setSort(v); keep('style-sort', v); }}/>
      <${Seg} value=${st} onChange=${setSt} options=${[{ v: 'active', l: 'active' }, ...STATUSES.map(s => ({ v: s, l: s + (counts[s] != null ? ' ' + counts[s] : '') })), { v: 'all', l: 'all' }]}/>
    </div>
    ${!data ? html`<div class="sgrid">${Array.from({ length: 8 }, () => html`<${Skel} hgt="230"/>`)}</div>` : list.length ? html`<div class="sgrid">
      ${list.map((x, i) => html`<button class="scard" key=${x.id} style=${'--i:' + Math.min(i, 30)} onClick=${() => go('styles/' + x.id)}>
        <div class="cover">${x.cover_url || x.variants[0]?.image ? html`<img src=${x.cover_url || x.variants.find(v => v.image)?.image} alt="" loading="lazy"/>` : ''}<${Pill} s=${x.status}/>
          <span class="gen"><span class="acid">${fmt.n(x.generated_total)}</span> gens${sum(x, 'generated_7d') ? html` · <span class="acid">+${sum(x, 'generated_7d')}</span> 7d` : ''}</span>${issues(x).length ? html`<span class="badge" title=${issues(x).join(' · ')}>${issues(x).length} fix</span>` : ''}</div>
        <div class="body"><div class="row between"><span class="name trunc">${x.name}</span>${x.has_reference && html`<span class="tag" title="style reference image">ref</span>`}</div>
          <div class="tiny dim trunc">${x.id} · ${data.collections.find(c => c.id === x.collection)?.label || x.collection}</div>
          <div class="slots">${audiences.map(a => { const v = x.variants.find(v => v.audience === a.id && v.status === 'live') || x.variants.find(v => v.audience === a.id && v.status !== 'retired'); return html`<span class=${'slot ' + (v ? v.status : '')} title=${a.label + (v ? ' · ' + v.name + ' · ' + v.status : ' · empty')}>${AUD_SHORT[a.id] || a.id[0]}</span>`; })}</div>
        </div></button>`)}
    </div>` : html`<${Empty}>Nothing matches.</${Empty}>`}
    ${open && html`<${StyleDrawer} key=${open.id} style=${open} meta=${data} onClose=${() => go('styles')} onSaved=${() => reload(true)} role=${role}/>`}
    ${modal === 'new' && html`<${NewStyle} meta=${data} onClose=${() => setModal(null)} onDone=${id => { setModal(null); reload(true).then(() => go('styles/' + id)); }}/>`}
    ${modal === 'collections' && html`<${CollectionsModal} meta=${data} role=${role} onClose=${() => setModal(null)} onChanged=${() => reload(true)}/>`}
    ${modal === 'factory' && html`<${Factory} meta=${data} onClose=${() => setModal(null)} onDone=${() => { setModal(null); reload(true); }}/>`}
  </div>`;
}

const lsGet = k => { try { return localStorage.getItem('nsl-draft:' + k); } catch { return null; } };
const lsSet = (k, v) => { try { v == null ? localStorage.removeItem('nsl-draft:' + k) : localStorage.setItem('nsl-draft:' + k, v); } catch {} };
const changedKeys = (a, b, keys) => keys.filter(k => (a[k] ?? '') !== (b[k] ?? ''));

// Style fields that autosave. Prompt text of a LIVE style is held as a local draft until "Publish", so half-typed sentences never reach customers.
const S_KEYS = ['name', 'collection', 'tagline', 'cover_url', 'notes', 'sort', 'base_prompt'];
const pickStyle = s => ({ name: s.name, status: s.status, collection: s.collection, tagline: s.tagline || '', cover_url: s.cover_url || '', notes: s.notes || '', base_prompt: s.base_prompt, sort: s.sort });

function StyleDrawer({ style, meta, onClose, onSaved, role }) {
  const [tab, setTab] = useState('settings');
  const editable = role !== 'viewer';
  const [base, setBase] = useState(() => pickStyle(style));
  const [f, setF] = useState(() => { const s = pickStyle(style); const d = style.status === 'live' ? lsGet(style.id + ':base') : null; return d && d !== s.base_prompt ? { ...s, base_prompt: d } : s; });
  const ver = useRef(style.updated_at);
  const fRef = useRef(f); fRef.current = f;
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const hold = base.status === 'live';
  const keys = hold ? S_KEYS.filter(k => k !== 'base_prompt') : S_KEYS;
  const valid = f.name.trim().length > 0 && f.base_prompt.trim().length >= 40 && !Number.isNaN(Number(f.sort));
  const dirty = valid && changedKeys(f, base, keys).length > 0;
  const promptDirty = hold && f.base_prompt !== base.base_prompt;

  // someone else (or another tab) changed this style: adopt it unless we have unsaved edits
  useEffect(() => {
    if (new Date(style.updated_at) > new Date(ver.current) && changedKeys(fRef.current, base, S_KEYS.filter(k => k !== 'status')).length === 0) { const s = pickStyle(style); setBase(s); setF(s); ver.current = style.updated_at; }
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
  const publishPrompt = async () => {
    if (!(await confirm({ title: 'Publish prompt?', body: 'Every new portrait in this style uses it right away.', ok: 'Publish' }))) return;
    try { await a.flush?.(); const r = await send({ base_prompt: f.base_prompt }); lsSet(style.id + ':base', null); toast('Published · rev ' + r.revision); } catch (e) { toast(e.message, 'err', 6000); }
  };
  const setStatus = async v => {
    if (!editable || v === base.status) return;
    const q = v === 'live' ? { title: 'Show to customers?', body: 'The style appears in the shop now.', ok: 'Go live' } : v === 'retired' ? { title: 'Retire this style?', body: 'All its variants become unavailable.', ok: 'Retire', danger: true } : v === 'hidden' && base.status === 'live' ? { title: 'Hide from the picker?', body: 'Customers with a direct link can still use it.', ok: 'Hide' } : null;
    if (q && !(await confirm(q))) return;
    try { await send({ status: v }); set('status', v); toast('Status: ' + v); } catch (e) { toast(e.message, 'err', 6000); }
  };
  useEffect(() => { const k = e => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); a.flush?.(); } }; addEventListener('keydown', k); return () => removeEventListener('keydown', k); });
  const live = style.variants.filter(v => v.status === 'live');
  const iss = issues(style);
  const [colModal, setColModal] = useState(false);
  const [coverBusy, setCoverBusy] = useState(false);
  const coverTargets = base.cover_url ? style.variants.filter(v => (v.image || '') !== base.cover_url) : [];
  const applyCover = async () => {
    if (!(await confirm({ title: 'Use this cover as the card image of ' + coverTargets.length + ' variant(s)?', body: 'It replaces their current card images. Live variants change on the website within minutes.', ok: 'Apply', danger: true }))) return;
    setCoverBusy(true);
    try { for (const v of coverTargets) await rpc('admin_variant_save', { p: { id: v.id, image: base.cover_url, expected_updated_at: v.updated_at } }); toast('Card image updated · ' + coverTargets.length + ' variant(s)'); onSaved(); }
    catch (e) { toast(e.message, 'err', 6000); onSaved(); } finally { setCoverBusy(false); }
  };
  // The website shows each VARIANT (name, card image, audience), never the style's own name: check those.
  const pubVars = style.variants.filter(v => ['live', 'hidden'].includes(v.status));
  const web = useOnWebsite(list => {
    if (!['live', 'hidden'].includes(base.status) || !pubVars.length) return 'off';
    const ok = v => { const x = list.find(s => s.id === v.id); return x && x.display_name === v.name && (x.example_image_url || '') === (v.image || '') && (x.audience || '') === (v.audience || ''); };
    const found = pubVars.filter(v => list.some(s => s.id === v.id));
    return !found.length ? 'absent' : pubVars.every(ok) ? 'live' : 'diff';
  }, [base.status, base.collection, JSON.stringify(pubVars.map(v => [v.id, v.name, v.image, v.audience]))]);

  return html`<${Drawer} title=${f.name || style.name} sub=${style.id} onClose=${onClose}
    actions=${html`<${WebChip} s=${web}/><${SaveBadge} a=${a} readOnly=${!editable}/>`}
    footer=${html`${!valid && editable ? html`<span class="tiny amber">${!f.name.trim() ? 'Name needed' : 'Base prompt needs 40+ characters'} · not saved</span>` : ''}<span class="grow"></span>
      ${promptDirty && editable && html`<button class="btn primary" onClick=${publishPrompt}>Publish prompt</button>`}
      ${style.factory && ['ready', 'needs_review'].includes(style.factory.status) && !['live', 'retired'].includes(style.status) && role === 'owner' && html`<${FactoryPublish} id=${style.id} onDone=${onSaved}/>`}
      ${role === 'owner' && html`<${RemoveStyle} style=${style} onDone=${() => { onSaved(); onClose(); }}/>`}`}>
    <div class="tabs" role="tablist">${['settings', 'base prompt', 'variants', 'examples', 'prompt lab', 'test lab', 'stats'].map(t => html`<button role="tab" aria-selected=${tab === t} onClick=${() => setTab(t)}>${t}${t === 'variants' ? ' ' + live.length + '/' + style.variants.length : t === 'examples' ? ' ' + (style.examples_ready ?? 0) + '/6' : ''}</button>`)}</div>

    ${colModal && html`<${CollectionsModal} meta=${meta} role=${role} onClose=${() => setColModal(false)} onChanged=${onSaved}/>`}
    ${tab === 'settings' && html`<div class="grid g2">
      <div class="col span2" style="gap:6px"><label class="f">Name<input class="in" value=${f.name} disabled=${!editable} onInput=${e => set('name', e.target.value)}/></label>
        <div class="tiny dim">Internal group name. Customers see the variant names: ${style.variants.filter(v => ['live', 'hidden'].includes(v.status)).map(v => v.name).join(', ') || '–'} <button type="button" class="lnk" onClick=${() => setTab('variants')}>Rename them</button></div>
        ${editable && html`<${AiName} target="style" getContext=${() => ({ text: f.base_prompt, collection: meta.collections.find(c => c.id === f.collection)?.label || '', existing: meta.styles.map(s => s.name) })} onPick=${s => { set('name', s.name); if (!f.tagline && s.tagline) set('tagline', s.tagline); }}/>`}</div>
      <div class="span2"><${Seg} value=${f.status} onChange=${setStatus} options=${STATUSES.map(s => ({ v: s, l: s }))}/></div>
      <label class="f">Collection<span class="row" style="gap:6px"><select class="in grow" value=${f.collection} disabled=${!editable} onChange=${e => e.target.value === '__new' ? setColModal(true) : set('collection', e.target.value)}>${meta.collections.map(c => html`<option value=${c.id}>${c.label}${c.enabled ? '' : ' (hidden on web)'}</option>`)}${editable && html`<option value="__new">+ New collection…</option>`}</select>
        <button type="button" class="btn sm" onClick=${() => setColModal(true)}>Manage</button></span></label>
      <label class="f">Order<input class="in" type="number" value=${f.sort} disabled=${!editable} onInput=${e => set('sort', e.target.value === '' ? '' : Number(e.target.value))}/></label>
      <label class="f span2">Tagline<input class="in" maxlength="200" value=${f.tagline} disabled=${!editable} onInput=${e => set('tagline', e.target.value)}/></label>
      <div class="span2"><${ImageField} label="Cover" value=${f.cover_url} folder=${style.id} disabled=${!editable} onChange=${v => set('cover_url', v)}/>
        <div class="row" style="gap:8px;margin-top:6px">${editable && html`<button type="button" class="btn sm" disabled=${coverBusy || f.cover_url !== base.cover_url || !coverTargets.length} onClick=${applyCover}>${coverBusy ? 'Applying…' : coverTargets.length ? 'Use as card image on ' + coverTargets.length + ' variant' + (coverTargets.length === 1 ? '' : 's') : base.cover_url ? '✓ Already the card image' : 'Set a cover first'}</button>`}
          <span class="tiny dim">The website shows each variant's card image, so this puts the cover there.</span></div></div>
      <label class="f span2">Notes<textarea class="in" rows="3" disabled=${!editable} value=${f.notes} onInput=${e => set('notes', e.target.value)}></textarea></label>
      ${iss.length ? html`<div class="span2 note">${iss.join(' · ')}</div>` : ''}
    </div>`}

    ${tab === 'base prompt' && html`<div class="col">
      <textarea class="in code" style="min-height:380px" disabled=${!editable} value=${f.base_prompt} onInput=${e => set('base_prompt', e.target.value)}></textarea>
      <div class="row between tiny dim"><span>${f.base_prompt.length} chars${hold ? (promptDirty ? ' · draft, not live yet' : ' · live') : ''}</span><span class="row" style="gap:6px">${promptDirty && html`<button class="btn ghost sm" onClick=${() => set('base_prompt', base.base_prompt)}>discard draft</button>`}<button class="btn ghost sm" onClick=${() => copy(f.base_prompt)}><${Icon} n="copy" s="12"/>copy</button></span></div>
    </div>`}

    ${tab === 'variants' && html`<${Variants} style=${style} meta=${meta} onSaved=${onSaved} editable=${editable}/>`}
    ${tab === 'examples' && html`<${ExamplesTab} style=${style} onChanged=${onSaved}/>`}
    ${tab === 'prompt lab' && html`<${PromptLab} style=${style}/>`}
    ${tab === 'test lab' && html`<${TestLab} style=${style} onChanged=${() => onSaved && onSaved()}/>`}
    ${tab === 'stats' && html`<div class="col">
      <table class="tbl"><thead><tr><th>Variant</th><th>Audience</th><th>Status</th><th class="num">Gens</th><th class="num">7d</th><th class="num">Orders</th><th>Last</th></tr></thead>
      <tbody>${style.variants.map(v => html`<tr><td><b>${v.name}</b><div class="tiny dim">${v.id}</div></td><td>${v.audience || '–'}</td><td><${Pill} s=${v.status}/></td>
        <td class="num">${fmt.n(v.generated_total)}</td><td class="num">${v.generated_7d}</td><td class="num">${v.orders}</td><td class="tiny">${fmt.ago(v.last_generated)}</td></tr>`)}</tbody></table>
    </div>`}
  </${Drawer}>`;
}

function Variants({ style, meta, onSaved, editable }) {
  const [adding, setAdding] = useState(false);
  const free = meta.audiences.filter(a => a.enabled && !style.variants.some(v => v.audience === a.id && v.status !== 'retired'));
  return html`<div class="col" style="gap:10px">
    ${style.variants.map(v => html`<${VariantCard} key=${v.id} v=${v} style=${style} meta=${meta} onSaved=${onSaved} editable=${editable}/>`)}
    ${editable && (adding ? html`<${VariantCard} v=${{ id: style.id + '-' + (free[0]?.id || 'new'), name: style.name, status: 'draft', audience: free[0]?.id || meta.audiences[0].id, prompt: '', uses_family_base: true, max_subjects: 3, max_photos: 3, subject_type: 'human_pet', isNew: true }}
        style=${style} meta=${meta} editable onSaved=${() => { setAdding(false); onSaved(); }} onCancel=${() => setAdding(false)}/>`
      : html`<button class="btn" style="align-self:flex-start" onClick=${() => setAdding(true)}><${Icon} n="plus" s="14"/>Add variant</button>`)}
  </div>`;
}

const V_KEYS = ['name', 'audience', 'prompt', 'uses_family_base', 'image', 'max_subjects', 'notes'];
const V_HELD = ['prompt', 'uses_family_base', 'audience']; // change what customers get: held until "Publish" while the variant is live
const pickVar = v => ({ id: v.id, name: v.name, status: v.status, audience: v.audience || '', prompt: v.prompt, uses_family_base: v.uses_family_base, image: v.image || '', max_subjects: v.max_subjects, notes: v.notes || '' });

function VariantCard({ v, style, meta, onSaved, onCancel, editable }) {
  const [open, setOpen] = useState(!!v.isNew);
  const [base, setBase] = useState(() => pickVar(v));
  const [f, setF] = useState(() => { const s = pickVar(v); const d = v.status === 'live' && !v.isNew ? lsGet(v.id + ':prompt') : null; return d && d !== s.prompt ? { ...s, prompt: d } : s; });
  const [busy, setBusy] = useState(false);
  const ver = useRef(v.updated_at);
  const fRef = useRef(f); fRef.current = f;
  const set = (k, val) => setF(s => ({ ...s, [k]: val }));
  const hold = !v.isNew && base.status === 'live';
  const keys = hold ? V_KEYS.filter(k => !V_HELD.includes(k)) : V_KEYS;
  const heldChanged = hold ? changedKeys(f, base, V_HELD) : [];
  const valid = f.name.trim().length > 0 && Number(f.max_subjects) >= 1 && Number(f.max_subjects) <= 3;
  const dirty = !v.isNew && valid && changedKeys(f, base, keys).length > 0;
  const web = useOnWebsite(list => {
    if (!['live', 'hidden'].includes(base.status)) return 'off';
    const x = list.find(s => s.id === v.id);
    if (!x) return 'absent';
    return x.display_name === base.name && (x.example_image_url || '') === (base.image || '') && (x.audience || '') === (base.audience || '') ? 'live' : 'diff';
  }, [base.name, base.image, base.audience, base.status], open && !v.isNew);

  useEffect(() => {
    if (!v.isNew && new Date(v.updated_at) > new Date(ver.current) && changedKeys(fRef.current, base, V_KEYS).length === 0) { const s = pickVar(v); setBase(s); setF(s); ver.current = v.updated_at; }
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
  const publish = async () => {
    if (!(await confirm({ title: 'Publish changes?', body: 'New portraits for this variant use them right away.', ok: 'Publish' }))) return;
    try { await send(Object.fromEntries(heldChanged.map(k => [k, f[k]]))); lsSet(v.id + ':prompt', null); toast('Published'); } catch (e) { toast(e.message, 'err', 6000); }
  };
  const setStatus = async val => {
    if (!editable || val === base.status || v.isNew) { set('status', val); return; }
    const q = val === 'live' ? { title: 'Show to customers?', body: 'This variant appears in the shop now.', ok: 'Go live' } : val === 'retired' ? { title: 'Retire variant?', body: 'It disappears for customers.', ok: 'Retire', danger: true } : null;
    if (q && !(await confirm(q))) return;
    try { await send({ status: val }); set('status', val); toast('Status: ' + val); } catch (e) { toast(e.message, 'err', 6000); }
  };
  const create = async () => {
    setBusy(true);
    try { const r = await rpc('admin_variant_save', { p: { ...f, family_id: style.id } }); toast('Created ' + r.id); onSaved(); } catch (e) { toast(e.message, 'err', 7000); } finally { setBusy(false); }
  };
  return html`<div class="card vcard">
    <button class="vhead" onClick=${() => !v.isNew && setOpen(!open)}>
      ${f.image ? html`<img src=${f.image} alt=""/>` : html`<span class="ph"></span>`}
      <span class="grow"><b>${v.isNew ? 'New variant' : f.name}</b><span class="tiny dim"> ${f.audience || '–'}</span></span>
      ${!v.isNew && html`<span class="tiny dim">${fmt.n(v.generated_total)}</span>`}${open && !v.isNew ? html`<${WebChip} s=${web}/><${SaveBadge} a=${a} readOnly=${!editable}/>` : ''}<${Pill} s=${f.status}/>
    </button>
    ${open && html`<div class="grid g2" style="padding:4px 16px 16px">
      ${v.isNew && html`<label class="f span2">ID<input class="in" value=${f.id} onInput=${e => set('id', slug(e.target.value))}/></label>`}
      <div class="col" style="gap:6px"><label class="f">Name<input class="in" value=${f.name} disabled=${!editable} onInput=${e => set('name', e.target.value)}/></label>
        ${editable && html`<${AiName} target="variant" getContext=${() => ({ text: (f.prompt || '') + '\n' + (style.base_prompt || '').slice(0, 1500), audience: f.audience || '', existing: style.variants.map(x => x.name) })} onPick=${s => { set('name', s.name); if (v.isNew && !f.id) set('id', slug(s.id)); }}/>`}</div>
      <label class="f">Audience<select class="in" value=${f.audience} disabled=${!editable} onChange=${e => set('audience', e.target.value)}>${meta.audiences.map(a => html`<option value=${a.id}>${a.label}${a.enabled ? '' : ' (off)'}</option>`)}</select></label>
      <div class="span2 row wrap" style="gap:14px"><${Seg} value=${f.status} onChange=${setStatus} options=${STATUSES.map(s => ({ v: s, l: s }))}/>
        <span class="row tiny muted"><${Switch} on=${f.uses_family_base} onChange=${val => editable && set('uses_family_base', val)} label="uses base prompt"/>uses style base</span>
        <label class="row tiny muted">max subjects <input class="in" type="number" min="1" max="3" style="width:56px" value=${f.max_subjects} disabled=${!editable} onInput=${e => set('max_subjects', Number(e.target.value))}/></label></div>
      <label class="f span2">${f.uses_family_base ? 'Audience prompt' : 'Full prompt'}<textarea class="in code" rows="9" disabled=${!editable} value=${f.prompt} onInput=${e => set('prompt', e.target.value)}></textarea>
        <span class="hint">${f.prompt.length} chars${hold && heldChanged.length ? ' · draft, not live yet' : ''}</span></label>
      <div class="span2"><${ImageField} label="Card image" value=${f.image} folder=${style.id + '/' + (f.id || 'variant')} disabled=${!editable} onChange=${val => set('image', val)}/>
        <div class="tiny dim" style="margin-top:4px">This is the preview picture customers see for this style on the website.</div></div>
      <label class="f span2">Notes<input class="in" value=${f.notes} disabled=${!editable} onInput=${e => set('notes', e.target.value)}/></label>
      ${editable && html`<div class="span2 row end">${!v.isNew && !v.has_history && html`<${DeleteVariant} id=${v.id} onDone=${onSaved}/>`}<span class="grow"></span>
        ${heldChanged.length > 0 && html`<button class="btn ghost" onClick=${() => setF(s => ({ ...s, ...Object.fromEntries(heldChanged.map(k => [k, base[k]])) }))}>Discard draft</button><button class="btn primary" onClick=${publish}>Publish changes</button>`}
        ${v.isNew && html`${onCancel && html`<button class="btn ghost" onClick=${onCancel}>Cancel</button>`}<button class="btn primary" disabled=${busy || !f.name.trim() || f.id.length < 2} onClick=${create}>${busy ? 'Creating…' : 'Create variant'}</button>`}</div>`}
    </div>`}
  </div>`;
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

function DeleteVariant({ id, onDone }) {
  const run = async () => {
    if (!(await confirm({ title: 'Delete variant ' + id + '?', body: 'It was never generated, so nothing depends on it. This cannot be undone.', danger: true, ok: 'Delete', type: 'DELETE' }))) return;
    try { await rpc('admin_variant_delete', { p_id: id }); toast('Variant deleted'); onDone(); } catch (e) { toast(e.message, 'err'); }
  };
  return html`<button class="btn ghost sm red" onClick=${run}><${Icon} n="trash" s="13"/>Delete</button>`;
}

function RemoveStyle({ style, onDone }) {
  const used = style.variants.some(v => v.has_history);
  const run = async () => {
    if (used) {
      if (style.status === 'retired') return toast('Already retired. It has customer history, so it is kept for orders.', 'warn', 5000);
      if (!(await confirm({ title: 'Retire ' + style.name + '?', body: 'Customers have generated this style, so it cannot be deleted (orders and galleries reference it). Retiring removes it from the shop immediately and keeps the history.', danger: true, ok: 'Retire', type: 'RETIRE' }))) return;
      try { await rpc('admin_style_save', { p: { id: style.id, status: 'retired' } }); toast('Retired · removed from the shop'); onDone(); } catch (e) { toast(e.message, 'err'); }
    } else {
      if (!(await confirm({ title: 'Delete ' + style.name + ' permanently?', body: 'Never used by a customer. Deletes the style, its ' + style.variants.length + ' variant(s), example slots and factory records. Uploaded images stay in storage.', danger: true, ok: 'Delete forever', type: 'DELETE' }))) return;
      try { await rpc('admin_style_delete', { p_id: style.id }); toast('Style deleted'); onDone(); } catch (e) { toast(e.message, 'err', 6000); }
    }
  };
  return html`<button class="btn danger sm" onClick=${run}><${Icon} n=${used ? 'archive' : 'trash'} s="13"/>${used ? 'Retire' : 'Delete'}</button>`;
}
