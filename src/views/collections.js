import { html, useState, Icon, Modal, confirm } from '../ui.js';
import { rpc } from '../api.js';
import { toast } from '../store.js';
import { AiName } from './ainame.js';

const slugify = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

function Members({ c, meta, editable, onChanged }) {
  const mine = meta.styles.filter(s => s.collection === c.id);
  const others = meta.styles.filter(s => s.collection !== c.id);
  const [busy, setBusy] = useState('');
  const move = async (s, to) => {
    if (!to || to === s.collection) return;
    const t = meta.collections.find(x => x.id === to);
    if (s.status === 'live' && !(await confirm({ title: 'Move “' + s.name + '” to ' + t.label + '?', body: t.enabled ? 'On the website it moves to that collection.' : 'That collection is hidden on the website, so this live style disappears from the style picker.', ok: 'Move', danger: !t.enabled }))) return;
    setBusy(s.id);
    try { await rpc('admin_style_save', { p: { id: s.id, collection: to, expected_updated_at: s.updated_at } }); toast('“' + s.name + '” → ' + t.label); onChanged(); }
    catch (e) { toast(e.message, 'err', 6000); } finally { setBusy(''); }
  };
  const colLabel = id => meta.collections.find(x => x.id === id)?.label || id;
  return html`<div class="col" style="gap:6px;padding:2px 0 12px 12px">
    ${mine.length ? mine.map(s => html`<div class="row" style="gap:8px" key=${s.id}><span class="grow trunc">${s.name}</span><span class="tiny dim">${s.status}</span>
      ${editable && html`<select class="in" style="width:150px" disabled=${busy === s.id} value="" onChange=${e => move(s, e.target.value)}><option value="">Move to…</option>${meta.collections.filter(x => x.id !== c.id).map(x => html`<option value=${x.id}>${x.label}</option>`)}</select>`}</div>`)
      : html`<div class="tiny dim">No styles yet.</div>`}
    ${editable && others.length > 0 && html`<select class="in" style="max-width:320px" value="" onChange=${e => { const s = others.find(x => x.id === e.target.value); s && move(s, c.id); }}>
      <option value="">+ Add a style here…</option>${others.map(s => html`<option value=${s.id}>${s.name} (now in ${colLabel(s.collection)})</option>`)}</select>`}</div>`;
}

function Row({ c, count, editable, onChanged, meta, open, onToggle }) {
  const [f, setF] = useState({ label: c.label, sort: c.sort, enabled: c.enabled });
  const [busy, setBusy] = useState(false);
  const dirty = f.label !== c.label || Number(f.sort) !== c.sort || f.enabled !== c.enabled;
  const save = async () => {
    if (f.enabled && !c.enabled && !(await confirm({ title: 'Show this collection on the website?', body: 'It appears in the style picker for customers as soon as it contains a live style.', ok: 'Show on website' }))) return;
    if (!f.enabled && c.enabled && count > 0 && !(await confirm({ title: 'Hide this collection?', body: `Its ${count} style(s) disappear from the customer style picker.`, ok: 'Hide', danger: true }))) return;
    setBusy(true);
    try { await rpc('admin_collection_save', { p: { id: c.id, label: f.label, sort: Number(f.sort), enabled: f.enabled } }); toast('Saved ' + c.id); onChanged(); }
    catch (e) { toast(e.message, 'err', 6000); } finally { setBusy(false); }
  };
  const del = async () => {
    if (!(await confirm({ title: 'Delete collection “' + c.label + '”?', body: 'It is empty. This cannot be undone.', ok: 'Delete', danger: true }))) return;
    try { await rpc('admin_collection_delete', { p_id: c.id }); toast('Deleted'); onChanged(); } catch (e) { toast(e.message, 'err', 6000); }
  };
  return html`<div style="border-bottom:1px solid var(--line2)"><div class="row" style="gap:8px;padding:6px 0">
    <input class="in" style="flex:1;min-width:120px" value=${f.label} disabled=${!editable} onInput=${e => setF({ ...f, label: e.target.value })}/>
    <span class="tiny dim" style="width:90px" title=${c.id}>${c.id}</span>
    <button class="btn ghost sm" style="width:84px;justify-content:flex-start" aria-expanded=${open} onClick=${onToggle}>${open ? '▾' : '▸'} ${count} style${count === 1 ? '' : 's'}</button>
    <input class="in" type="number" style="width:64px" title="order" value=${f.sort} disabled=${!editable} onInput=${e => setF({ ...f, sort: e.target.value })}/>
    <label class="tiny row" style="gap:4px"><input type="checkbox" checked=${f.enabled} disabled=${!editable} onChange=${e => setF({ ...f, enabled: e.target.checked })}/>on web</label>
    ${editable && html`<button class="btn sm primary" disabled=${!dirty || busy} onClick=${save}>Save</button>`}
    ${editable && count === 0 && html`<button class="btn sm danger" title="delete empty collection" onClick=${del}><${Icon} n="trash" s="13"/></button>`}</div>
    ${open && html`<${Members} c=${c} meta=${meta} editable=${editable} onChanged=${onChanged}/>`}</div>`;
}

export function CollectionsModal({ meta, role, onClose, onChanged }) {
  const editable = role !== 'viewer';
  const [n, setN] = useState({ label: '', id: '', touched: false });
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState(null);
  const id = n.touched ? n.id : slugify(n.label);
  const taken = meta.collections.some(c => c.id === id);
  const count = cid => meta.styles.filter(s => s.collection === cid).length;
  const create = async () => {
    setBusy(true);
    try { await rpc('admin_collection_save', { p: { id, label: n.label } }); toast('Created “' + n.label + '” (hidden on web until you switch it on)'); setN({ label: '', id: '', touched: false }); onChanged(); }
    catch (e) { toast(e.message, 'err', 6000); } finally { setBusy(false); }
  };
  return html`<${Modal} title="Collections" onClose=${onClose} footer=${html`<button class="btn ghost" onClick=${onClose}>Close</button>`}>
    <div class="col" style="gap:12px;margin-top:8px">
      <div class="muted small">New collections stay hidden on the website until you switch them on. Open a collection to see its styles and move them in or out.</div>
      <div>${meta.collections.map(c => html`<${Row} key=${c.id + ':' + c.label + ':' + c.enabled + ':' + c.sort} c=${c} count=${count(c.id)} editable=${editable} onChanged=${onChanged} meta=${meta} open=${openId === c.id} onToggle=${() => setOpenId(openId === c.id ? null : c.id)}/>`)}</div>
      ${editable && html`<div class="card"><h3>New collection</h3><div class="col" style="gap:8px">
        <div class="row" style="gap:8px"><input class="in" style="flex:1" placeholder="Name (Czech), e.g. Pro páry" maxlength="80" value=${n.label} onInput=${e => setN({ ...n, label: e.target.value })}/>
          <input class="in" style="width:170px" placeholder="id" value=${id} onInput=${e => setN({ ...n, touched: true, id: slugify(e.target.value) })}/></div>
        <${AiName} target="collection" label="AI name" getContext=${() => ({ text: n.label || 'A new collection of portrait styles for the shop', existing: meta.collections.map(c => c.label) })} onPick=${s => setN({ label: s.name, id: s.id, touched: true })}/>
        <div class="row"><button class="btn primary" disabled=${busy || !n.label.trim() || id.length < 2 || taken} onClick=${create}>Create collection</button>${taken && html`<span class="red tiny">id taken</span>`}</div></div></div>`}
    </div></${Modal}>`;
}
