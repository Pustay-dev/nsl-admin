import { html, useEffect, useRef, useState, Icon, Pill, Drawer, Modal,  Seg, Empty, Skel, SImg, Lightbox, SortSelect, Picker, Pager, Emerald, usePeriod, confirm, copy, useLoad, usePoll } from '../ui.js';
import { PreviewThumb } from '../preview.js';
import { lang } from '../i18n.js';
import { rpc, fn, fmt, signed } from '../api.js';
import { toast, useStore } from '../store.js';
import { go } from '../router.js';
import { SessionCooldown } from './cooldown.js';
import { ZoomViewer } from '../zoom.js';
import { SupplierZipOrder, SupplierZipPanel, useSupplierZip } from './supplier-zip.js';
import { AdvanceFulfilment, FulfilmentBadge, orderFulfilment } from './order-fulfilment.js';
import { RepairLoading, RepairRegion, repairPending, uploadQcPrint, useRepairOrders } from './portrait-repair.js';

const FILTERS = [{ v: 'all', l: 'all' }, { v: 'generated', l: 'generated' }, { v: 'carts', l: 'carts' }, { v: 'orders', l: 'orders' }, { v: 'contacts', l: 'email' }, { v: 'failed', l: 'failed' }, { v: 'restricted', l: 'restricted' }, { v: 'archived', l: 'reset' }];
const SORTS = [{ v: 'hot', l: 'Hottest leads' }, { v: 'recent', l: 'Last active' }, { v: 'value', l: 'Cart / order value' }, { v: 'generations', l: 'Most portraits' }, { v: 'newest', l: 'Newest' }, { v: 'failures', l: 'Most failures' }];
const keep = (k, v) => { try { v === undefined ? (v = localStorage.getItem('nsl-admin-' + k)) : localStorage.setItem('nsl-admin-' + k, v); } catch { /* storage blocked */ } return v; };

// Customers: a slim table. 10 rows by default, "Show all" switches to 50 per page. Row = open the session; thumbnail = full picture.
const PAGE = 50, PEEK = 10;
export function Customers({ openId }) {
  const [q, setQ] = useState(''); const [qq, setQQ] = useState(''); const [filter, setFilter] = useState('all'); const [page, setPage] = useState(0);
  const [all, setAll] = useState(false);
  const [sort, setSort] = useState(() => keep('cust-sort') || 'hot');
  useEffect(() => { const t = setTimeout(() => { setQQ(q); setPage(0); }, 250); return () => clearTimeout(t); }, [q]);
  const { data, error, reload } = useLoad(() => rpc('admin_sessions', { p_search: qq || null, p_filter: filter, p_limit: PAGE, p_offset: page * PAGE, p_sort: sort }), [qq, filter, page, sort]);
  const [internal, setInternal] = useState(() => new Set()); // sessions marked "internal" (team/test devices): the drawer can toggle it
  const loadInternal = () => rpc('admin_internal_sessions').then(a => setInternal(new Set(a || []))).catch(() => {});
  useEffect(() => { loadInternal(); }, []);
  usePoll(() => reload(true), 20000); // live: new sessions, portraits and carts appear without a page reload
  const pick = (id, v) => { setPage(0); if (id === 'show') setFilter(v); else { setSort(v); keep('cust-sort', v); } };
  const P = usePeriod();
  const inP = data ? data.rows.filter(r => P.inWindow(r.last_at)) : []; // customers active in the chosen period
  const rows = all ? inP : inP.slice(0, PEEK);
  // the RPC's total counts every session (it ignores the filter), so the page count is only shown for "all" without a search
  const pages = all && data && filter === 'all' && !qq ? Math.max(1, Math.ceil(data.total / PAGE)) : null;
  return html`<div class="page">
    <div class="head"><h1>Customers</h1><span class="grow"></span>
      <input class="in" style="max-width:260px" placeholder="Search email, ref, id" value=${q} onInput=${e => setQ(e.target.value)}/>
      <${Picker} groups=${[{ id: 'show', title: 'Show', value: filter, options: FILTERS }, { id: 'sort', title: 'Sort by', value: sort, options: SORTS }]} onChange=${pick}/></div>
    ${error && html`<div class="card red">${error.message}</div>`}
    <div class="card tbl-wrap" style="padding:0">
      <table class="tbl slim"><thead><tr><th></th><th>Email</th><th class="num">Portraits</th><th class="num hide-m">Errors</th><th class="num">Orders</th><th class="num">Cart</th><th class="hide-m">Last seen</th></tr></thead>
      <tbody>${!data ? html`<tr><td colspan="7"><${Skel} hgt="240"/></td></tr>` : rows.map(r => html`<tr class="click" key=${r.id} onClick=${() => go('customers/' + r.id)}>
        <td style="width:48px"><${PreviewThumb} path=${r.thumb}/></td>
        <td class="trunc" style="max-width:260px">${r.email || html`<span class="dim">${r.label || r.ref || r.id.slice(0, 8)}</span>`}${r.restricted ? html` <span class="flag res">restricted</span>` : ''}${internal.has(r.id) ? html` <span class="tag">internal</span>` : ''}</td>
        <td class="num">${r.generations || html`<span class="dim">–</span>`}</td>
        <td class=${'num hide-m ' + (r.failed ? 'red' : 'dim')}>${r.failed || '–'}</td>
        <td class="num"><${Emerald} n=${r.orders}/>${!r.orders && r.test_orders ? html`<span class="tag">${r.test_orders} test</span>` : ''}</td>
        <td class="num">${r.cart ? fmt.czk(r.cart_value) : html`<span class="dim">–</span>`}</td>
        <td class="hide-m small muted">${fmt.ago(r.last_at)}</td></tr>`)}
      ${data && !inP.length && html`<tr><td colspan="7"><${Empty}>Nobody here</${Empty}></td></tr>`}</tbody></table>
      ${data && !all && data.rows.length > PEEK && html`<div class="more-rows"><button class="btn ghost sm" onClick=${() => setAll(true)}>Show all</button></div>`}
    </div>
    ${all && html`<div class="row between"><button class="btn ghost sm" onClick=${() => { setAll(false); setPage(0); }}>Show fewer</button><${Pager} page=${page} pages=${pages} more=${data && data.rows.length === PAGE} onPage=${setPage}/></div>`}
    ${openId && html`<${SessionDrawer} key=${openId} id=${openId} isInternal=${internal.has(openId)} onInternal=${loadInternal} onClose=${() => go('customers')} onChanged=${() => reload(true)}/>`}
  </div>`;
}

// References tab: the customer's uploaded photos as a plain grid (click = zoom).
function References({ id }) {
  const { data, error } = useLoad(() => rpc('admin_session_references', { p_id: id }), [id]);
  const [src, setSrc] = useState(null);
  const open = async path => { setSrc(''); try { setSrc(await signed(path, 'references')); } catch { setSrc(null); toast('Could not open the photo', 'warn'); } };
  if (error) return html`<div class="red small">${error.message}</div>`;
  if (!data) return html`<${Skel} hgt="120"/>`;
  if (!data.length) return html`<${Empty}>No reference photos uploaded.</${Empty}>`;
  return html`<div class="thumbs">${data.map(r => html`<button key=${r.path} class="thumb" title=${fmt.date(r.at) + ' · ' + r.status} style="padding:0;border:0;cursor:zoom-in" onClick=${() => open(r.path)}><${SImg} path=${r.path} bucket="references"/></button>`)}</div>
    ${src ? html`<${ZoomViewer} src=${src} alt="Reference photo" onClose=${() => setSrc(null)}/>` : ''}`;
}

function SessionDrawer({ id, onClose, onChanged, isInternal, onInternal }) {
  const role = useStore(s => s.role);
  const { data, error, reload } = useLoad(() => rpc('admin_session', { p_id: id }), [id]);
  const [tab, setTab] = useState('gallery');
  const [label, setLabel] = useState(null);
  const [big, setBig] = useState(null);
  const [busy, setBusy] = useState(false);
  usePoll(() => reload(true), 15000); // live: new portraits/jobs show up while the drawer is open
  if (error) return html`<${Drawer} title="Session" sub=${id} onClose=${onClose}><div class="red">${error.message}</div></${Drawer}>`;
  if (!data) return html`<${Drawer} title="Loading…" sub=${id} onClose=${onClose}><${Skel} hgt="300"/></${Drawer}>`;
  const s = data.session;
  const restricted = !!s.admin_restricted_at, archived = !!s.admin_archived_at;
  const cartTotal = (data.cart?.items || []).reduce((a, c) => a + Number(c.price) * (c.quantity || 1), 0);
  const done = async (p, msg) => { setBusy(true); try { await p; toast(msg); reload(true); onChanged(); } catch (e) { toast(e.message, 'err', 6000); } finally { setBusy(false); } };
  const saveLabel = () => done(rpc('admin_session_label', { p_id: id, p_label: label }).then(() => setLabel(null)), 'Label saved');
  const restrict = async () => {
    const r = await confirm({ title: 'Restrict this customer?', body: 'They keep their gallery and can still order finished portraits, but cannot create new ones. The shop shows its normal "preview limit reached" message. Reversible.', ok: 'Restrict', danger: true, input: 'Reason (internal, optional)' });
    if (r) done(rpc('admin_session_action', { p_id: id, p_action: 'restrict', p_reason: r.value }), 'Customer restricted');
  };
  const reset = async () => {
    if (await confirm({ title: 'Reset this session?', body: 'Nothing is deleted. The gallery is archived and on the next visit this device silently starts a brand-new empty gallery. Orders stay untouched. You can restore it later.', ok: 'Reset session', type: 'RESET' }))
      done(rpc('admin_session_action', { p_id: id, p_action: 'reset' }), 'Session reset: device gets a fresh gallery');
  };
  const del = async () => {
    try {
      const plan = await fn('admin-dashboard', { action: 'delete_preview', session_id: id });
      const body = `${plan.images} portraits, ${plan.uploads} uploads, ${plan.jobs} jobs, ${plan.files} files and ${plan.anonymous_logins} anonymous login(s) are erased. The device simply starts over. Sessions with orders are refused.`;
      if (!(await confirm({ title: 'Delete session permanently?', body, danger: true, ok: 'Delete forever', type: 'DELETE' }))) return;
      await fn('admin-dashboard', { action: 'delete_session', session_id: id, confirmation: id });
      toast('Deletion started'); onChanged(); onClose();
    } catch (e) { toast(e.message, 'err', 6000); }
  };
  // Big preview: browse with arrows; tracked by image id so it survives the live refresh reordering the list.
  const openBig = async img => {
    setBig({ id: img.id, alt: img.style });
    const url = await signed(img.preview || img.thumb);
    setBig(b => (b && b.id === img.id ? { ...b, url } : b));
    if (!url) toast('Preview not available', 'warn');
  };
  const bigIdx = big ? data.images.findIndex(i => i.id === big.id) : -1;
  const step = d => { const n = data.images[bigIdx + d]; if (n) openBig(n); };

  return html`<${Drawer} title=${s.admin_label || s.internal_reference || id.slice(0, 8)} sub=${'session · ' + id} onClose=${onClose}
    actions=${html`${restricted && html`<span class="flag res">restricted</span>`}${archived && html`<span class="flag arc">reset</span>`}<button class="btn ghost sm" onClick=${() => copy(id)}><${Icon} n="copy" s="12"/>id</button>`}
    footer=${html`<span class="tiny dim">created ${fmt.date(s.created_at)} · seen ${fmt.ago(s.last_seen_at || s.updated_at)} ago</span>`}>
    ${role !== 'viewer' && html`<div class="actionbar">
      ${restricted ? html`<button class="btn sm" disabled=${busy} onClick=${() => done(rpc('admin_session_action', { p_id: id, p_action: 'unrestrict' }), 'Restriction lifted')}><${Icon} n="check" s="13"/>Lift restriction</button>`
        : html`<button class="btn sm danger" disabled=${busy} onClick=${restrict}><${Icon} n="ban" s="13"/>Restrict</button>`}
      ${archived ? html`<button class="btn sm" disabled=${busy} onClick=${() => done(rpc('admin_session_action', { p_id: id, p_action: 'restore' }), 'Session restored')}><${Icon} n="refresh" s="13"/>Restore</button>`
        : html`<button class="btn sm" disabled=${busy} onClick=${reset}><${Icon} n="reset" s="13"/>Reset session</button>`}
      <button class="btn sm" disabled=${busy} title="Keeps the session and everything in it; only removes it from Analytics" onClick=${async () => { setBusy(true); try { await rpc('admin_session_set_internal', { p_id: id, p_internal: !isInternal }); toast(isInternal ? 'Counted in Analytics again' : 'Excluded from Analytics'); onInternal?.(); } catch (e) { toast(e.message, 'err', 6000); } finally { setBusy(false); } }}><${Icon} n=${isInternal ? 'check' : 'ban'} s="13"/>${isInternal ? 'Include in Analytics' : 'Exclude from Analytics'}</button>
      ${role === 'owner' && html`<button class="btn sm danger" disabled=${busy} onClick=${del}><${Icon} n="trash" s="13"/>Delete</button>`}
      <span class="tiny dim grow" style="min-width:160px">${restricted ? 'Restricted' + (s.admin_restrict_reason ? ': ' + s.admin_restrict_reason : '') + ' · cannot create portraits' : archived ? 'Reset: the device starts a new gallery on its next visit' : 'Active'}</span>
    </div>`}
    <div class="grid g4" style="margin-bottom:14px">
      <div class="card kpi"><div class="l">portraits</div><div class="v">${data.images.length}</div></div>
      <div class="card kpi"><div class="l">uploads</div><div class="v">${data.uploads.length}</div></div>
      <div class="card kpi"><div class="l">orders</div><div class="v acid">${data.orders.length}</div></div>
      <div class="card kpi"><div class="l">cart</div><div class="v">${fmt.czkMinor(cartTotal)}</div></div>
    </div>
    <${SessionCooldown} id=${id}/>
    <div class="row" style="margin-bottom:14px;gap:8px">
      <input class="in" placeholder="admin label (e.g. 'Petra – grandma gift')" value=${label ?? s.admin_label ?? ''} disabled=${role === 'viewer'} onInput=${e => setLabel(e.target.value)} onKeyDown=${e => e.key === 'Enter' && saveLabel()}/>
      ${label != null && html`<button class="btn primary" onClick=${saveLabel}>Save</button>`}
      ${data.contact && html`<span class="tag trunc" title=${data.contact.verified ? 'verified' : 'unverified'}>${data.contact.email}${data.contact.marketing ? ' · mkt' : ''}</span>`}
    </div>
    <div class="tabs">${['gallery', 'timeline', 'orders', 'cart', 'references'].map(t => html`<button aria-selected=${tab === t} onClick=${() => setTab(t)}>${t}${t === 'gallery' ? ' ' + data.images.length : t === 'cart' && data.cart?.items?.length ? ' ' + data.cart.items.length : ''}</button>`)}</div>
    ${tab === 'references' && html`<${References} id=${id}/>`}
    ${tab === 'gallery' && (data.images.length ? html`<div class="thumbs">${data.images.map((i, k) => html`<button key=${i.id} title=${(i.style || '') + ' · ' + fmt.date(i.at)} class=${'thumb ' + (i.selected ? 'sel' : '')} style=${'padding:0;border:0;cursor:zoom-in;animation:cardIn .4s var(--ease) backwards;animation-delay:' + Math.min(k, 24) * 25 + 'ms'} onClick=${() => openBig(i)}>
        <${SImg} path=${i.thumb || i.preview}/><span class="cap">${i.style || ''}${i.selected ? ' · selected' : ''}</span></button>`)}</div>` : html`<${Empty}>No portraits yet.</${Empty}>`)}
    ${tab === 'timeline' && html`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>When</th><th>Job</th><th>Style</th><th>Subj.</th><th>Status</th><th class="num">Time</th></tr></thead><tbody>
      ${data.jobs.map((j, i) => html`<tr style=${'--i:' + Math.min(i, 20)}><td class="tiny">${fmt.date(j.at)}</td><td class="tiny dim">${j.ref || j.id.slice(0, 8)}</td><td>${j.style}</td><td>${j.subjects ?? '–'}</td><td><${Pill} s=${j.status}/>${j.error && html`<div class="tiny red">${j.error}</div>`}</td><td class="num">${j.seconds != null ? j.seconds + 's' : '–'}</td></tr>`)}
      ${data.uploads.map(u => html`<tr><td class="tiny">${fmt.date(u.at)}</td><td class="tiny dim">upload</td><td>${u.photos} photo(s)</td><td></td><td><${Pill} s=${u.status}/></td><td></td></tr>`)}
    </tbody></table></div>`}
    ${tab === 'orders' && (data.orders.length ? html`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Order</th><th>Spec</th><th>Payment</th><th>Production</th></tr></thead><tbody>${data.orders.map(o => html`<tr>
      <td><b>#${o.shopify_order_id}</b>${o.test && html` <span class="tag">test</span>`}<div class="tiny dim">${fmt.date(o.at)}</div></td>
      <td class="tiny">${o.spec?.material} ${o.spec?.size_cm} × ${o.qty}</td><td><${Pill} s=${o.payment}/></td><td><${Pill} s=${o.production}/>${o.hold && html`<div class="tiny amber">${o.hold}</div>`}${o.tracking && html`<div class="tiny">${o.tracking}</div>`}</td></tr>`)}</tbody></table></div>` : html`<${Empty}>No orders.</${Empty}>`)}
    ${tab === 'cart' && (data.cart?.items?.length ? html`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Item</th><th>Size</th><th class="num">Qty</th><th class="num">Price</th></tr></thead><tbody>${data.cart.items.map(c => html`<tr><td>${c.title}</td><td class="tiny">${c.size}</td><td class="num">${c.quantity}</td><td class="num">${fmt.czkMinor(c.price)}</td></tr>`)}
      <tr><td colspan="3" class="muted">Total</td><td class="num acid"><b>${fmt.czkMinor(cartTotal)}</b></td></tr></tbody></table></div><div class="row" style="margin-top:8px;gap:10px"><span class="tiny dim">updated ${fmt.ago(data.cart.at)} ago</span><span class="grow"></span>${role !== 'viewer' && html`<button class="btn sm danger" disabled=${busy} onClick=${async () => { if (await confirm({ title: 'Clear this cart?', body: 'Empties the cart here at once. The customer\'s real shop cart is emptied the next time they open the shop in that browser. The portraits stay in their gallery.', ok: 'Clear cart', danger: true })) done(rpc('admin_clear_cart', { p_session: id }), 'Cart cleared'); }}><${Icon} n="trash" s="13"/>Clear cart</button>`}</div>` : html`<${Empty}>Empty cart.</${Empty}>`)}
    ${big && html`<${Lightbox} src=${big.url} alt=${big.alt} onClose=${() => setBig(null)} pos=${bigIdx >= 0 ? (bigIdx + 1) + ' / ' + data.images.length : null}
      onPrev=${bigIdx > 0 ? () => step(-1) : null} onNext=${bigIdx >= 0 && bigIdx < data.images.length - 1 ? () => step(1) : null}/>`}
  </${Drawer}>`;
}


const QC_ERR = { STALE_PRINT_REVISION: 'This order changed, reload and try again.', PRINT_SPEC_OR_SAMPLE_NOT_APPROVED: 'Print spec / sample is not approved in the supplier profile yet.',
  PRINT_FILE_NOT_FOUND: 'No print file is stored for this order.', INVALID_PRODUCTION_STAGE: 'This order is not waiting for quality control.', REJECTION_NOTE_REQUIRED: 'Write why you reject it.',
  ORDER_PRODUCTION_ON_HOLD: 'The order is on hold.', ADMIN_ROLE_INSUFFICIENT: 'You need the editor role for this.',
  PORTRAIT_REPAIR_DISABLED: 'Automatická oprava teď není zapnutá.', PORTRAIT_REPAIR_IN_PROGRESS: 'Automatická oprava právě probíhá.',
  PRINT_DIMENSIONS_MISMATCH: 'Nahrajte obrázek se stejnými rozměry v pixelech jako stávající tiskový soubor.',
  INVALID_PRINT_IMAGE: 'Použijte 8bitový RGB obrázek bez průhlednosti a otočení.', PRINT_UPLOAD_TOO_LARGE: 'Soubor je větší než 32 MB.',
  PRINT_FILE_UNCHANGED: 'Tento soubor je stejný jako aktuální tisková revize.', QC_UPLOAD_NOT_AVAILABLE: 'Tento soubor už nelze ručně nahradit.',
  PRINT_FORMAT_REQUIRES_REVIEW: 'Tento formát teď nelze použít pro tisk.', PRINT_UPLOAD_FAILED: 'Nahrání náhrady se nezdařilo.' };
const qcMsg = e => { const m = String(e?.message || e || ''); const k = Object.keys(QC_ERR).find(x => m.includes(x)); return k ? QC_ERR[k] : m; };

function QcPrintButton({ src, onClick, compact = false }) {
  return html`<button type="button" class="btn ghost" style=${'height:auto;padding:0;border:0;overflow:hidden;cursor:zoom-in;align-self:center;max-width:' + (compact ? '120px' : '100%')}
    onClick=${onClick} aria-label="Zvětšit tiskový soubor"><img src=${src} alt="Tiskový soubor" style="display:block;max-width:100%;max-height:52vh;width:auto;height:auto;object-fit:contain"/></button>`;
}

const sendZipStyle = 'background:#1d4ed8;border-color:#1d4ed8;color:#fff';
const canApprovePrint = o => o.has_file && o.payment === 'paid' && !o.hold && typeof o.test === 'boolean';
const approvePrint = o => rpc('admin_order_qc', { p_item: o.id, p_revision: o.revision, p_action: 'approve', p_note: '' });
function QcModal({ o, onClose, onDone }) {
  const [note, setNote] = useState(''); const [busy, setBusy] = useState(false); const [rej, setRej] = useState(false);
  const [region, setRegion] = useState(null), [uploading, setUploading] = useState(false);
  const input = useRef(null);
  const editor = useStore(s => s.role === 'owner' || s.role === 'editor');
  const pf = usePrintFile(o); const [zoom, setZoom] = useState(false);
  const editing = rej && !o.test && o.repair_available;
  const run = async action => {
    setBusy(true);
    try {
      if (action === 'reject' && editing) {
        await rpc('admin_request_portrait_repair', { p_item: o.id, p_revision: o.revision, p_note: note, p_region: region });
        toast('Oprava zařazena'); onDone(o.id); return;
      }
      await rpc('admin_order_qc', { p_item: o.id, p_revision: o.revision, p_action: action, p_note: note });
      toast(action === 'reject' ? 'Rejected: order blocked' : 'Kontrola dokončena');
      onDone();
    } catch (e) { toast(qcMsg(e), 'warn', 6000); } finally { setBusy(false); }
  };
  const upload = async e => {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (!file || busy || uploading) return;
    setUploading(true);
    try { await uploadQcPrint(o, file); toast('Nahraná revize čeká na kontrolu.'); onDone(); }
    catch (error) { toast(qcMsg(error), 'warn', 6000); }
    finally { setUploading(false); }
  };
  const checks = [[!!o.has_file, 'Print file stored'], [o.payment === 'paid', 'Paid'], [!o.hold, 'No production hold'], [typeof o.test === 'boolean', o.test ? 'Testovací objednávka · ZIP do interní schránky' : 'Typ objednávky ověřen']];
  const hasPrint = !!pf.url;
  const saving = uploading || busy;
  const canReview = editor && o.production === 'awaiting_qc';
  return html`<${Modal} title=${'Quality control · #' + o.shopify_order_id} onClose=${saving ? () => {} : onClose} footer=${html`<button class="btn" onClick=${onClose} disabled=${saving}>Cancel</button>
    ${canReview && html`<button class="btn danger" disabled=${saving || (rej && (!note.trim() || (editing && !region)))} onClick=${() => (rej ? run('reject') : setRej(true))}>${editing ? 'Zamítnout a opravit' : rej ? 'Confirm reject' : 'Reject'}</button>
      <button class="btn primary" style=${sendZipStyle} disabled=${saving || rej || !hasPrint || !checks.every(c => c[0])} onClick=${() => run('approve')}>${o.review_only ? 'Potvrdit opětovnou kontrolu' : 'Odeslat KvikTisku'}</button>`}` }>
    ${editing ? (busy ? html`<${RepairLoading}/>` : hasPrint ? html`<${RepairRegion} src=${pf.url} region=${region} onChange=${setRegion}/>` : html`<span class="small">${pf.loading ? 'Načítám tiskový soubor…' : 'Tiskový soubor se nepodařilo načíst.'}</span>`) : html`<div class="col" style="gap:8px;margin-bottom:12px">
      ${pf.loading ? html`<span class="small" role="status">Načítám tiskový soubor…</span>` : hasPrint ? html`<${QcPrintButton} src=${pf.url} onClick=${() => setZoom(true)}/>` : html`<span class="small amber">${o.has_file ? 'Tiskový soubor se nepodařilo načíst.' : 'Tiskový soubor zatím není k dispozici.'}</span>`}</div>`}
    <div class="row" style="gap:14px;align-items:flex-start">
      <div class="col" style="gap:4px"><div><b>${o.style || '–'}</b></div><div class="small">${o.material} ${o.size} × ${o.qty}</div><div class="tiny dim">revision ${o.revision}</div>
        <div class="col" style="gap:3px;margin-top:6px">${checks.map(([ok, l]) => html`<div class=${'small ' + (ok ? 'acid' : 'red')}>${ok ? '✓' : '✕'} ${l}</div>`)}</div></div></div>
    <div class="tiny dim" style="margin-top:12px">${o.review_only ? 'Potvrzením se uzavře opětovná kontrola. Předchozí odeslání zůstane v historii.' : o.test ? 'Po schválení všech portrétů přijde testovací ZIP do interní schránky.' : 'Po schválení všech portrétů se zařadí ZIP objednávky k odeslání.'}</div>
    <div class="row wrap" style="gap:8px;margin-top:10px;align-items:flex-end">
      ${canReview && html`<label class="f grow">${editing ? 'Co má AI opravit?' : rej ? 'Why is it rejected? (required)' : 'Note (optional)'}<input class="in" maxlength="2000" value=${note} onInput=${e => setNote(e.target.value)}/></label>`}
      ${editor && o.manual_upload_available && html`<input ref=${input} type="file" accept=${o.manual_png_available ? 'image/jpeg,image/png,.jpg,.jpeg,.png' : 'image/jpeg,.jpg,.jpeg'} hidden onChange=${upload}/>
        <button type="button" class="btn" disabled=${saving} onClick=${() => input.current?.click()}><${Icon} n="upload"/>Nahrát náhradu</button>`}
    </div>
    ${uploading && html`<span class="small" role="status">Nahrávám náhradní obrázek…</span>`}
    ${zoom && hasPrint && html`<${ZoomViewer} src=${pf.url} alt=${'Print file · #' + o.shopify_order_id} onClose=${() => setZoom(false)}/>`}
  </${Modal}>`;
}

// Print-ready file of an order item (private bucket print-files): path from the RPC, then a short-lived signed URL.
function usePrintFile(o) {
  const [st, set] = useState({ loading: !!o.has_file, path: null, url: null });
  useEffect(() => {
    if (!o.has_file) { set({ loading: false, path: null, url: null }); return; }
    let on = true; set({ loading: true, path: null, url: null });
    rpc('admin_order_print_path', { p_item: o.id }).then(async p => { const url = p ? await signed(p, 'print-files') : null; if (on) set({ loading: false, path: p || null, url }); }).catch(() => on && set({ loading: false, path: null, url: null }));
    return () => { on = false; };
  }, [o.id, o.has_file, o.revision]);
  return st;
}

// Eye button in the Orders row: opens the print file straight in the zoom viewer (falls back to the customer preview).
function PrintEye({ o }) {
  const [open, setOpen] = useState(false); const [src, setSrc] = useState(null); const [busy, setBusy] = useState(false);
  const click = async e => {
    e.stopPropagation(); if (busy) return; setBusy(true);
    try {
      let u = null;
      if (o.has_file) { const p = await rpc('admin_order_print_path', { p_item: o.id }); u = p ? await signed(p, 'print-files') : null; }
      if (!u && o.thumb) { u = await signed(o.thumb); toast('No print file yet: showing the customer preview', 'warn'); }
      if (!u) toast('Nothing to show for this order', 'warn'); else { setSrc(u); setOpen(true); }
    } catch (err) { toast(String(err?.message || err), 'warn', 5000); } finally { setBusy(false); }
  };
  return html`<button class="btn sm" style="margin-left:6px;padding:2px 6px" title=${o.has_file ? 'Open print file (zoom)' : 'Open preview (no print file yet)'} aria-label="Open print file" disabled=${busy} onClick=${click}><${Icon} n="eye" s=${14}/></button>
    ${open && html`<span onClick=${e => e.stopPropagation()}><${ZoomViewer} src=${src} alt=${'#' + o.shopify_order_id} onClose=${() => setOpen(false)}/></span>`}`;
}

// Cell for the Quality control column: button while a file waits for QC, otherwise the state.
function QcCell({ o, onOpen }) {
  if (repairPending(o)) return html`<${RepairLoading}/>`;
  if (o.repair === 'failed' || (o.qc === 'rejected' && o.manual_upload_available)) return html`<button type="button" class="btn sm" disabled=${!o.manual_upload_available} onClick=${e => { e.stopPropagation(); onOpen(o); }}>${o.repair === 'failed' ? 'Oprava se nezdařila' : 'Rejected'} · Nahrát náhradu</button>`;
  if (o.production === 'awaiting_qc') return html`<button class="btn sm primary" onClick=${e => { e.stopPropagation(); onOpen(o); }}>Quality control</button>`;
  if (o.fulfilment) return html`<${FulfilmentBadge} status=${o.fulfilment}/>`;
  const tone = o.qc === 'approved' ? 'ok' : o.qc === 'rejected' ? 'no' : 'wait';
  return html`<span class=${'stamp ' + tone}>${o.qc === 'approved' ? 'Approved' : o.qc === 'rejected' ? 'Rejected' : 'Not checked'}</span><div class="tiny dim">${String(o.production || '').replaceAll('_', ' ')}</div>${o.hold && html`<div class="tiny amber">${o.hold}</div>`}`;
}

// Orders, one row per Shopify order (several portraits merge into one). Our short number: #1014 -> 014.
// A row expands to its portraits; "Check all" approves every portrait waiting in that order in one go.
const ORDER_FILTERS = [{ v: 'all', l: 'all' }, { v: 'live', l: 'real' }, { v: 'test', l: 'test' }, { v: 'blocked', l: 'blocked' }];
const shortNo = g => { const m = /(\d+)/.exec(g.name || ''); return m ? String(Number(m[1]) % 1000).padStart(3, '0') : '…' + String(g.id || '').slice(-4); };
function groupOrders(list) {
  const by = new Map();
  for (const o of list) {
    const k = o.shopify_order_id || o.id;
    if (!by.has(k)) by.set(k, { id: k, name: o.order_name, customer: o.customer_name, email: o.email, session: o.session, at: o.at, test: o.test, items: [] });
    const g = by.get(k); g.items.push(o); if (o.at > g.at) g.at = o.at;
  }
  return [...by.values()].map(g => ({ ...g, waiting: g.items.filter(o => o.production === 'awaiting_qc') }));
}

function QcPrintThumb({ o }) {
  const pf = usePrintFile(o);
  const [zoom, setZoom] = useState(false);
  if (repairPending(o)) return html`<${RepairLoading}/>`;
  if (pf.loading) return html`<span class="tiny" role="status">Načítám tiskový soubor…</span>`;
  if (!pf.url) return html`<span class="tiny amber">${o.hold === 'PRINT_INPUT_INVALID' ? 'Příprava tisku vyžaduje kontrolu' : 'Tiskový soubor není dostupný'}</span>`;
  return html`<${QcPrintButton} src=${pf.url} compact onClick=${() => setZoom(true)}/>
    ${zoom && html`<${ZoomViewer} src=${pf.url} alt="Tiskový soubor" onClose=${() => setZoom(false)}/>`}`;
}

function OrderQc({ g, onClose, onDone }) {
  const [busy, setBusy] = useState(false), [one, setOne] = useState(null);
  const ready = g.waiting.filter(canApprovePrint);
  const approveAll = async () => {
    setBusy(true); let ok = 0;
    for (const o of ready) { try { await approvePrint(o); ok++; } catch (e) { toast(qcMsg(e), 'warn', 6000); } }
    setBusy(false); toast(ok + ' / ' + ready.length + ' zkontrolováno'); onDone();
  };
  return html`<${Modal} title=${'Quality control · ' + shortNo(g)} onClose=${onClose} cls="qc-all" footer=${html`<button class="btn lg ghost" onClick=${onClose}>Cancel</button>
      <button class="btn lg primary" style=${sendZipStyle} disabled=${busy || !ready.length} onClick=${approveAll}>${busy ? 'Zpracovávám…' : (ready.every(o => o.review_only) ? 'Potvrdit opětovnou kontrolu' : 'Odeslat KvikTisku')} (${ready.length})</button>`}>
    <div class="qc-grid">${g.items.map(o => html`<div class="qc-item" key=${o.id}>
      <${QcPrintThumb} o=${o}/>
      <span class="small">${o.style || '–'} · ${o.size}</span>
      ${o.hold && html`<span class="tiny amber">${o.hold}</span>`}
      ${(o.production === 'awaiting_qc' || o.manual_upload_available) && html`<button class="btn sm ghost" onClick=${() => setOne(o)}>Check alone</button>`}</div>`)}</div>
    ${one && html`<${QcModal} o=${one} onClose=${() => setOne(null)} onDone=${id => { setOne(null); onDone(id, true); }}/>`}
  </${Modal}>`;
}

function OrderRow({ g, onQc, onCustomer, zip, editor, onChanged }) {
  const [open, setOpen] = useState(false);
  const approved = g.items.every(o => o.qc === 'approved'), rejected = g.items.some(o => o.qc === 'rejected');
  const status = orderFulfilment(g.items);
  return html`<tbody class=${'og' + (open ? ' open' : '')}>
    <tr class="click" onClick=${() => setOpen(o => !o)}>
      <td style="width:28px"><${Icon} n="chevr" s="14" c="og-chev"/></td>
      <td><span class="og-thumbs">${g.items.slice(0, 3).map(o => html`<span class="thumb og-t">${repairPending(o) ? html`<span class="spinner" style="width:14px;height:14px" aria-hidden="true"></span>` : o.repair_path ? html`<${SImg} path=${o.repair_path} bucket="print-files"/>` : html`<${SImg} path=${o.thumb}/>`}</span>`)}${g.items.length > 3 && html`<span class="tiny dim" style="margin-left:3px" title="Additional portraits">+${g.items.length - 3}</span>`}</span></td>
      <td style="white-space:nowrap"><b class="mono og-no">${shortNo(g)}</b>${g.test ? html` <span class="tag">test</span>` : ''}${g.items.length > 1 ? html`<span class="tiny dim" style="display:block">${g.items.length} ${lang() === 'cs' ? 'portréty' : 'portraits'}</span>` : ''}</td>
      <td>${g.waiting.length ? html`<button class="btn sm primary" onClick=${e => { e.stopPropagation(); onQc(g); }}>Quality control${g.waiting.length > 1 ? html`<span> (${g.waiting.length})</span>` : ''}</button>`
        : g.items.some(repairPending) ? html`<${RepairLoading}/>` : status ? html`<${FulfilmentBadge} status=${status}/>`
          : html`<span class=${'stamp ' + (rejected ? 'no' : approved ? 'ok' : 'wait')}>${rejected ? 'Rejected' : approved ? 'Approved' : 'Not checked'}</span>`}
        <${SupplierZipOrder} order=${g} zip=${zip}/></td>
      <td class="small muted" style="white-space:nowrap">${fmt.date(g.at)}</td>
      <td class="hide-m small trunc" style="max-width:260px">${g.session ? html`<button type="button" class="btn ghost sm" onClick=${e => { e.stopPropagation(); onCustomer(g.session); }}>${g.customer || g.email || 'Customer'}</button>` : g.customer || g.email || '–'}${g.customer && g.email && html`<span class="tiny dim" style="display:block">${g.email}</span>`}</td>
    </tr>
    ${open && g.items.map(o => html`<tr class="og-item">
      <td></td><td>${repairPending(o) ? '' : o.repair_path ? html`<span class="thumb og-t"><${SImg} path=${o.repair_path} bucket="print-files"/></span>` : html`<${PreviewThumb} path=${o.thumb}/>`}</td>
      <td class="small">${o.style || '–'}<span class="tiny dim" style="display:block">${o.material} ${o.size} × ${o.qty}</span></td>
      <td><${QcCell} o=${o} onOpen=${x => onQc({ ...g, selected: x })}/></td>
      <td>${!repairPending(o) && html`<${PrintEye} o=${o}/>`}</td>
      <td class="hide-m">${o.session ? html`<button type="button" class="btn ghost sm" onClick=${() => onCustomer(o.session)}>Customer</button>` : ''}</td></tr>`)}
    ${open && editor && status && status !== 'done' && html`<tr class="og-item"><td></td><td colspan="5"><${AdvanceFulfilment} orderId=${g.id} status=${status} onChanged=${onChanged}/></td></tr>`}
  </tbody>`;
}

export function Orders() {
  const role = useStore(s => s.role);
  const zip = useSupplierZip(role);
  const [filter, setFilter] = useState('all');
  const { data, error, reload, onQueued } = useRepairOrders(filter);
  const [watchHandoffUntil, setWatchHandoffUntil] = useState(0);
  const [bulkBusy, setBulkBusy] = useState(false);
  const editor = role === 'owner' || role === 'editor';
  const sendAll = async () => {
    setBulkBusy(true);
    try {
      const candidates = groupOrders(await rpc('admin_orders_with_fulfilment', { p_filter: 'all' }))
        .filter(g => g.waiting.length && g.items.every(o => !o.review_only && canApprovePrint(o) &&
          (o.production === 'awaiting_qc' || (o.production === 'ready_to_print' && o.qc === 'approved'))));
      if (!candidates.length) { toast('Žádná kompletní objednávka nečeká na odeslání.'); return; }
      const numbers = candidates.map(shortNo).join(', ');
      if (!await confirm({
        title: 'Odeslat všechny objednávky ke kontrole?',
        body: 'Potvrdíte tiskové soubory objednávek ' + numbers + '. Každá půjde v samostatném ZIPu.',
        ok: 'Odeslat VŠE',
      })) return;

      const failures = [];
      let checked = 0;
      for (const order of candidates) {
        try {
          for (const item of order.waiting) await approvePrint(item);
          checked++;
        } catch (error) { failures.push(shortNo(order) + ' · ' + qcMsg(error)); }
      }
      toast('Kontrola potvrzena u ' + checked + ' z ' + candidates.length + ' objednávek.');
      if (failures.length) toast(failures.join(' | '), 'warn', 10000);
    } catch (error) { toast(qcMsg(error), 'warn', 6000); }
    finally {
      setBulkBusy(false);
      setWatchHandoffUntil(Date.now() + 90_000);
      reload(true);
    }
  };
  usePoll(() => {
    if (Date.now() < watchHandoffUntil || zip.rows.some(row => row.status === 'queued' || row.status === 'leased')) {
      reload(true);
      if (zip.installed) zip.outbox.reload(true);
    }
  }, 3000);
  const [qc, setQc] = useState(null); const [all, setAll] = useState(false); const [page, setPage] = useState(0);
  const [customer, setCustomer] = useState(null), [internal, setInternal] = useState(new Set());
  const loadInternal = () => rpc('admin_internal_sessions').then(rows => setInternal(new Set(rows || []))).catch(() => {});
  const openCustomer = id => { setCustomer(id); loadInternal(); };
  const P = usePeriod();
  // the period hides older orders, but anything still waiting for quality control always stays on the list
  const groups = data ? groupOrders(data).filter(g => g.waiting.length || g.items.some(repairPending) || P.inWindow(g.at)) : [], pages = Math.max(1, Math.ceil(groups.length / PAGE));
  const rows = all ? groups.slice(page * PAGE, (page + 1) * PAGE) : groups.slice(0, PEEK);
  const waiting = groups.filter(g => g.waiting.length).length;
  const done = (id, keepGroupOpen = false) => {
    if (id) onQueued(id);
    else setWatchHandoffUntil(Date.now() + 90_000);
    if (!keepGroupOpen) setQc(null);
    reload(true);
  };
  const currentQc = qc && (groups.find(g => g.id === qc.id) || qc);
  const single = qc?.selected || (currentQc?.items.length === 1 ? currentQc.items[0] : null);
  return html`<div class="page">
    <div class="head"><h1>Orders</h1>${waiting ? html`<span class="small muted">${waiting} to check</span>` : ''}<span class="grow"></span>
      ${editor && html`<button class="btn primary" style=${sendZipStyle} disabled=${bulkBusy || !zip.settings.data?.supplier_zip_enabled || !zip.settings.data?.sending_enabled} onClick=${sendAll}>${bulkBusy ? 'Zpracovávám…' : 'Odeslat VŠE'}</button>`}
      <${Picker} groups=${[{ id: 'show', title: 'Show', value: filter, options: ORDER_FILTERS }]} onChange=${(_, v) => { setFilter(v); setPage(0); }}/></div>
    ${error && html`<div class="card red">${error.message}</div>`}
    <${SupplierZipPanel} zip=${zip} owner=${role === 'owner'}/>
    <div class="card tbl-wrap" style="padding:0"><table class="tbl slim orders"><thead><tr><th></th><th></th><th>Order no.</th><th>${lang() === 'cs' ? 'Stav' : 'Status'}</th><th>When</th><th class="hide-m">Customer</th></tr></thead>
      ${!data ? html`<tbody><tr><td colspan="6"><${Skel} hgt="200"/></td></tr></tbody>` : rows.map(g => html`<${OrderRow} key=${g.id} g=${g} onQc=${setQc} onCustomer=${openCustomer} zip=${zip} editor=${editor} onChanged=${() => reload(true)}/>`)}
      ${data && !groups.length && html`<tbody><tr><td colspan="6"><${Empty}>No orders yet</${Empty}></td></tr></tbody>`}</table>
      ${data && !all && groups.length > PEEK && html`<div class="more-rows"><button class="btn ghost sm" onClick=${() => setAll(true)}>Show all</button></div>`}</div>
    ${all && pages > 1 && html`<${Pager} page=${page} pages=${pages} onPage=${setPage}/>`}
    ${currentQc && (single ? html`<${QcModal} o=${single} onClose=${() => setQc(null)} onDone=${done}/>` : html`<${OrderQc} g=${currentQc} onClose=${() => setQc(null)} onDone=${done}/>`)}
    ${customer && html`<${SessionDrawer} key=${customer} id=${customer} isInternal=${internal.has(customer)} onInternal=${loadInternal} onClose=${() => setCustomer(null)} onChanged=${() => reload(true)}/>`}
  </div>`;
}

