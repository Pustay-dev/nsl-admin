import { html, useState, useEffect, useRef, Icon, Skel, ImageField, confirm } from '../ui.js';
import { rpc, fmt } from '../api.js';
import { toast, useStore } from '../store.js';
import { useAutosave, SaveBadge } from '../autosave.js';

const KEY = 'home';
const TEXT = [
  ['Intro', [['eyebrow', 'Small line above the title', 120], ['heading', 'Title', 160], ['intro', 'Intro text', 500, true], ['cta_label', 'Main button', 60]]],
  ['Three steps', [['step_1', 'Step 1', 120], ['step_2', 'Step 2', 120], ['step_3', 'Step 3', 120]]],
  ['Benefits strip', [1, 2, 3, 4, 5, 6].map(n => ['benefit_' + n, 'Benefit ' + n, 120])],
];
const IMGS = [['image', 'Royal'], ['couple_image', 'Couple'], ['family_image', 'Family'], ['pet_image', 'Pet'], ['western_image', 'Western'], ['viking_image', 'Viking']];
const KEYS = [...TEXT.flatMap(([, fs]) => fs.map(f => f[0])), ...IMGS.map(i => i[0])];
const pick = d => Object.fromEntries(KEYS.map(k => [k, (d && d[k]) || '']));

export function Web() {
  const role = useStore(s => s.role); const editable = role !== 'viewer';
  const [st, setSt] = useState(null); const [err, setErr] = useState(null);
  const [f, setF] = useState(null); const [base, setBase] = useState(null);
  const [live, setLive] = useState({}); const [pub, setPub] = useState(null);
  const ver = useRef(null); const fRef = useRef(); fRef.current = f; const baseRef = useRef(); baseRef.current = base;
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const r = await rpc('admin_site_get', { p_key: KEY });
      ver.current = r.updated_at; const d = pick(r.draft);
      setBase(d); setF(d); setLive(pick(r.live)); setPub(r.published_at); setSt(r); setErr(null);
    } catch (e) { setErr(e); }
  };
  useEffect(() => { load(); }, []);

  const changed = () => KEYS.filter(k => (fRef.current[k] || '') !== (baseRef.current[k] || ''));
  const dirty = !!f && changed().length > 0;
  const a = useAutosave(f ? JSON.stringify(KEYS.map(k => f[k])) : '', dirty && editable, async () => {
    const keys = changed(); if (!keys.length) return;
    const patch = Object.fromEntries(keys.map(k => [k, fRef.current[k]]));
    const r = await rpc('admin_site_save', { p_key: KEY, p: patch, p_expected: ver.current });
    ver.current = r.updated_at; setBase(b => ({ ...b, ...patch })); setSt(s => ({ ...s, dirty: r.dirty }));
  });

  if (err && !f) return html`<div class="page"><div class="card red">${err.message}</div></div>`;
  if (!f) return html`<div class="page"><${Skel} hgt="320"/></div>`;
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  // unpublished = the draft (as saved) differs from what is live
  const unpublished = KEYS.some(k => (base[k] || '') !== (live[k] || '')) || dirty;

  const publish = async () => {
    await a.flush(); if (changed().length) return toast('Wait for the save to finish.', 'warn');
    if (!(await confirm({ title: 'Publish to the live website?', body: 'Visitors see these texts and images on the frontpage within seconds. Empty fields keep the original from Shopify.', ok: 'Publish' }))) return;
    setBusy(true);
    try { const r = await rpc('admin_site_publish', { p_key: KEY, p_expected: ver.current }); ver.current = r.updated_at; setLive(pick(fRef.current)); setPub(r.published_at); toast('Published', 'ok'); }
    catch (e) { toast(e.message, 'err', 6000); } finally { setBusy(false); }
  };
  const discard = async () => {
    if (!(await confirm({ title: 'Discard unpublished changes?', body: 'The draft goes back to what is live now.', ok: 'Discard', danger: true }))) return;
    setBusy(true);
    try { const r = await rpc('admin_site_discard', { p_key: KEY }); ver.current = r.updated_at; const d = pick(r.draft); setBase(d); setF(d); }
    catch (e) { toast(e.message, 'err', 6000); } finally { setBusy(false); }
  };

  return html`<div class="page">
    <div class="head"><div class="grow"><h1>Website</h1></div>
      <${SaveBadge} a=${a} readOnly=${!editable}/>
      ${editable && unpublished && html`<button class="btn sm" disabled=${busy} onClick=${discard}>Discard</button>`}
      ${editable && html`<button class="btn primary sm" disabled=${busy || !unpublished} onClick=${publish}><${Icon} n="bolt" s="13"/>Publish</button>`}</div>
    <div class="muted small" style="margin:-4px 0 14px">${unpublished ? html`<span class="amber">● Unpublished changes</span> · ` : html`<span class="acid">●</span> Live · `}${pub ? 'published ' + fmt.date(pub) : 'nothing published yet, the site uses Shopify’s own texts'}. Empty field = Shopify’s original.</div>

    <div class="col" style="gap:12px">
      ${TEXT.map(([title, fs]) => html`<div class="card"><h3>${title}</h3><div class="grid g2" style="gap:10px">
        ${fs.map(([k, label, max, area]) => html`<label class=${'col' + (area ? ' span2' : '')} style="gap:4px"><span class="tiny dim">${label}</span>
          ${area ? html`<textarea class="in" rows="3" maxlength=${max} value=${f[k]} disabled=${!editable} placeholder="As in Shopify" onInput=${e => set(k, e.target.value)}></textarea>`
            : html`<input class="in" maxlength=${max} value=${f[k]} disabled=${!editable} placeholder="As in Shopify" onInput=${e => set(k, e.target.value)}/>`}</label>`)}</div></div>`)}
      <div class="card"><h3>Hero pictures</h3><div class="grid g3" style="gap:12px">
        ${IMGS.map(([k, label]) => html`<${ImageField} key=${k} label=${label} value=${f[k]} folder="site" disabled=${!editable} onChange=${v => set(k, v)}/>`)}</div>
        <div class="tiny dim" style="margin-top:8px">Shown in the hero mosaic. A different picture per tile; empty keeps Shopify’s image.</div></div>
    </div></div>`;
}
