import { html, useEffect, useState, Icon, Pill, Drawer, Modal, Seg, Empty, Skel, SImg, Lightbox, SortSelect, confirm, copy, useLoad, usePoll } from '../ui.js';
import { rpc, fn, fmt, signed } from '../api.js';
import { toast, useStore } from '../store.js';
import { go } from '../router.js';
import { SessionCooldown } from './cooldown.js';
import { ZoomViewer } from '../zoom.js';
import { useColumns } from '../columns.js';

const FILTERS = [{ v: 'all', l: 'all' }, { v: 'generated', l: 'generated' }, { v: 'carts', l: 'carts' }, { v: 'orders', l: 'orders' }, { v: 'contacts', l: 'email' }, { v: 'failed', l: 'failed' }, { v: 'restricted', l: 'restricted' }, { v: 'archived', l: 'reset' }];
const SORTS = [{ v: 'hot', l: 'Hottest leads' }, { v: 'recent', l: 'Last active' }, { v: 'value', l: 'Cart / order value' }, { v: 'generations', l: 'Most portraits' }, { v: 'newest', l: 'Newest' }, { v: 'failures', l: 'Most failures' }];
const CUST_COLS = [{ id: 'thumb', label: 'Thumbnail' }, { id: 'session', label: 'Session', always: true }, { id: 'email', label: 'Email' }, { id: 'gens', label: 'Gens' }, { id: 'fail', label: 'Fail' }, { id: 'cool', label: 'Cool' }, { id: 'cart', label: 'Cart' }, { id: 'orders', label: 'Orders' }, { id: 'score', label: 'Score' }, { id: 'styles', label: 'Styles' }, { id: 'seen', label: 'Seen' }];
const ORDER_COLS = [{ id: 'thumb', label: 'Thumbnail' }, { id: 'order', label: 'Order', always: true }, { id: 'style', label: 'Style' }, { id: 'spec', label: 'Spec' }, { id: 'payment', label: 'Payment' }, { id: 'qc', label: 'Quality control', always: true }, { id: 'session', label: 'Session' }, { id: 'when', label: 'When' }];
const keep = (k, v) => { try { v === undefined ? (v = localStorage.getItem('nsl-admin-' + k)) : localStorage.setItem('nsl-admin-' + k, v); } catch { /* storage blocked */ } return v; };

export function Customers({ openId }) {
  const [q, setQ] = useState(''); const [qq, setQQ] = useState(''); const [filter, setFilter] = useState('all'); const [page, setPage] = useState(0);
  const [sort, setSort] = useState(() => keep('cust-sort') || 'hot');
  useEffect(() => { const t = setTimeout(() => { setQQ(q); setPage(0); }, 250); return () => clearTimeout(t); }, [q]);
  const { data, loading, error, reload } = useLoad(() => rpc('admin_sessions', { p_search: qq || null, p_filter: filter, p_limit: 50, p_offset: page * 50, p_sort: sort }), [qq, filter, page, sort]);
  const [cool, setCool] = useState({}); // session id -> { n: cooldowns so far, cooling: bool } (separate read-only RPC; the list RPC is untouched)
  useEffect(() => { const ids = (data?.rows || []).map(r => r.id); if (!ids.length) return; let live = true; rpc('admin_sessions_cooldowns', { p_ids: ids }).then(m => { if (live) setCool(m || {}); }).catch(() => {}); return () => { live = false; }; }, [data]);
  const [internal, setInternal] = useState(() => new Set()); // sessions marked "internal" (team/test devices): kept here, excluded from Analytics
  const loadInternal = () => rpc('admin_internal_sessions').then(a => setInternal(new Set(a || []))).catch(() => {});
  useEffect(() => { loadInternal(); }, []);
  const cols = useColumns('customers', CUST_COLS); const V = cols.visible;
  const setSortKeep = v => { setSort(v); keep('cust-sort', v); setPage(0); };
  usePoll(() => reload(true), 20000); // live: new sessions, portraits and carts appear without a page reload
  return html`<div class="page">
    <div class="head"><div class="grow"><h1>Customers</h1></div>
      <${SortSelect} value=${sort} options=${SORTS} onChange=${setSortKeep}/>${cols.picker}</div>
    <div class="row wrap" style="margin-bottom:12px;gap:10px">
      <input class="in" style="max-width:340px" placeholder="search ref, label, email, id…" value=${q} onInput=${e => setQ(e.target.value)}/>
      <${Seg} value=${filter} onChange=${v => { setFilter(v); setPage(0); }} options=${FILTERS}/>
      <span class="grow"></span>${loading ? html`<span class="tiny dim row"><span class="spinner" style="width:12px;height:12px"></span>loading</span>` : html`<span class="tiny dim live" title="Refreshes every 20 s while this tab is open">live</span>`}
    </div>
    ${error && html`<div class="card red">${error.message}</div>`}
    <div class="card tbl-wrap" style="padding:0">
      <table class="tbl"><thead><tr>${V('thumb') && html`<th></th>`}<th>Session</th>${V('email') && html`<th class="hide-m">Email</th>`}${V('gens') && html`<th class="num">Gens</th>`}${V('fail') && html`<th class="num hide-m">Fail</th>`}${V('cool') && html`<th class="num hide-m" title="Generation pauses (cooldowns) so far">Cool</th>`}${V('cart') && html`<th class="num">Cart</th>`}${V('orders') && html`<th class="num">Orders</th>`}${V('score') && html`<th class="num hide-m">Score</th>`}${V('styles') && html`<th class="hide-m">Styles</th>`}${V('seen') && html`<th>Seen</th>`}</tr></thead>
      <tbody>${!data ? html`<tr><td colspan=${cols.count}><${Skel} hgt="240"/></td></tr>` : data.rows.map((r, i) => html`<tr class="click" key=${r.id} style=${'--i:' + Math.min(i, 20)} onClick=${() => go('customers/' + r.id)}>
        ${V('thumb') && html`<td style="width:44px"><div class="thumb" style="width:30px">${r.thumb && html`<${SImg} path=${r.thumb}/>`}</div></td>`}
        <td><b>${r.label || r.ref || r.id.slice(0, 8)}</b> ${r.restricted && html`<span class="flag res">restricted</span>`} ${r.archived && html`<span class="flag arc">reset</span>`} ${internal.has(r.id) && html`<span class="tag" title="Excluded from Analytics">internal</span>`}${r.label && html`<div class="tiny dim">${r.ref}</div>`}</td>
        ${V('email') && html`<td class="hide-m tiny">${r.email || html`<span class="dim">–</span>`}</td>`}
        ${V('gens') && html`<td class="num">${r.generations}</td>`}${V('fail') && html`<td class=${'num hide-m ' + (r.failed ? 'red' : 'dim')}>${r.failed}</td>`}${V('cool') && html`<td class=${'num hide-m ' + (cool[r.id]?.cooling ? 'amber' : cool[r.id]?.n ? '' : 'dim')}>${cool[r.id]?.n ? cool[r.id].n + (cool[r.id].cooling ? ' ⏸' : '') : 0}</td>`}
        ${V('cart') && html`<td class="num">${r.cart ? html`<span class="amber">${fmt.czk(r.cart_value)}</span><div class="tiny dim">${r.cart} item${r.cart > 1 ? 's' : ''}</div>` : html`<span class="dim">–</span>`}</td>`}
        ${V('orders') && html`<td class="num">${r.orders ? html`<span class="acid">${r.orders}</span>` : r.test_orders ? html`<span class="tag">${r.test_orders} test</span>` : html`<span class="dim">–</span>`}</td>`}
        ${V('score') && html`<td class="num hide-m">${r.score > 0 ? html`<span class="score">${r.score}</span>` : html`<span class="dim">–</span>`}</td>`}
        ${V('styles') && html`<td class="hide-m tiny dim trunc" style="max-width:200px">${(r.styles || []).join(', ')}</td>`}
        ${V('seen') && html`<td class="tiny">${fmt.ago(r.last_at)}</td>`}</tr>`)}
      ${data && !data.rows.length && html`<tr><td colspan=${cols.count}><${Empty}>No sessions match.</${Empty}></td></tr>`}</tbody></table>
    </div>
    <div class="row end" style="margin-top:10px"><button class="btn sm" disabled=${!page} onClick=${() => setPage(page - 1)}>← prev</button><span class="tiny dim">page ${page + 1}</span><button class="btn sm" disabled=${!data || data.rows.length < 50} onClick=${() => setPage(page + 1)}>next →</button></div>
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
  ORDER_PRODUCTION_ON_HOLD: 'The order is on hold.', ADMIN_ROLE_INSUFFICIENT: 'You need the editor role for this.' };
const qcMsg = e => { const m = String(e?.message || e || ''); const k = Object.keys(QC_ERR).find(x => m.includes(x)); return k ? QC_ERR[k] : m; };

// Quality control: look at the order, then approve (-> ready to print, next: Mail -> supplier) or reject (-> blocked, with a reason).
function QcModal({ o, onClose, onDone }) {
  const [note, setNote] = useState(''); const [busy, setBusy] = useState(false); const [rej, setRej] = useState(false);
  const pf = usePrintFile(o); const [zoom, setZoom] = useState(false);
  const [send, setSend] = useState(() => { try { return localStorage.getItem('nsl-qc-send') !== '0'; } catch { return true; } });
  const toggleSend = v => { setSend(v); try { localStorage.setItem('nsl-qc-send', v ? '1' : '0'); } catch { /* storage blocked */ } };
  const gate = m => { const g = String(m).match(/MAIL_GATE_([A-Z_]+)/); return g ? 'blocked by "' + g[1].toLowerCase().replaceAll('_', ' ') + '"' : qcMsg(m); };
  const run = async action => {
    setBusy(true);
    try {
      await rpc('admin_order_qc', { p_item: o.id, p_revision: o.revision, p_action: action, p_note: note });
      if (action === 'reject') { toast('Rejected: order blocked'); onDone(); return; }
      if (!send) { toast('Approved: ready to print'); onDone(); return; }
      try { const r = await rpc('admin_mail_send_supplier', { p_item: o.id, p_revision: o.revision }); toast(r?.duplicate ? 'Approved. Already queued for the supplier' : 'Approved and queued for the supplier'); }
      catch (e) { toast('Approved: ready to print. Not sent: ' + gate(e?.message || e) + ' (see Mail)', 'warn', 8000); }
      onDone();
    } catch (e) { toast(qcMsg(e), 'warn', 6000); } finally { setBusy(false); }
  };
  const checks = [[!!o.has_file, 'Print file stored'], [o.payment === 'paid', 'Paid'], [!o.hold, 'No production hold'], [!o.test, 'Real order (not a test)']];
  const hasPrint = !!pf.url;
  return html`<${Modal} title=${'Quality control · #' + o.shopify_order_id} onClose=${onClose} footer=${html`<button class="btn" onClick=${onClose}>Cancel</button>
    <button class="btn danger" disabled=${busy || (rej && !note.trim())} onClick=${() => (rej ? run('reject') : setRej(true))}>${rej ? 'Confirm reject' : 'Reject'}</button>
    <button class="btn primary" disabled=${busy || rej || !checks.every(c => c[0])} onClick=${() => run('approve')}>${send ? 'Approve & send to supplier' : 'Approve'}</button>`}>
    <div class="col" style="gap:8px;margin-bottom:12px">
      ${o.has_file ? (pf.loading ? html`<div class="thumb" style="width:100%;min-height:200px"></div>` : hasPrint ? html`<button class="thumb" style="width:100%;cursor:zoom-in;padding:0;border:0" title="Open print file (zoom)" onClick=${() => setZoom(true)}><${SImg} path=${pf.path} bucket="print-files" alt="Print file"/></button>
        <div class="row" style="gap:10px"><button class="btn sm" onClick=${() => setZoom(true)}><${Icon} n="eye"/> Open print file (zoom)</button><span class="tiny dim">Print-ready file (private)</span></div>` : html`<div class="small amber">Print file could not be loaded. Showing the customer preview instead.</div>`) : html`<div class="small amber">No print file stored for this order yet. Showing the customer preview instead.</div>`}
      ${!hasPrint && !pf.loading && o.thumb && html`<div class="thumb" style="width:100%"><${SImg} path=${o.thumb}/></div>`}</div>
    <div class="row" style="gap:14px;align-items:flex-start">${hasPrint && o.thumb && html`<div class="col" style="gap:3px;flex:none"><div class="thumb" style="width:70px"><${SImg} path=${o.thumb}/></div><div class="tiny dim">Customer preview</div></div>`}
      <div class="col" style="gap:4px"><div><b>${o.style || '–'}</b></div><div class="small">${o.material} ${o.size} × ${o.qty}</div><div class="tiny dim">revision ${o.revision}</div>
        <div class="col" style="gap:3px;margin-top:6px">${checks.map(([ok, l]) => html`<div class=${'small ' + (ok ? 'acid' : 'red')}>${ok ? '✓' : '✕'} ${l}</div>`)}</div></div></div>
    <div class="tiny dim" style="margin-top:12px">Approving marks the print file as checked and moves the order to <b>ready to print</b>.</div>
    <label class="row" style="gap:8px;margin-top:8px;cursor:pointer"><input type="checkbox" checked=${send} onChange=${e => toggleSend(e.target.checked)}/><span class="small">Also send to the supplier (Kviktisk) in one click. If sending is not possible yet, the order stays ready to print and you can send it from Mail.</span></label>
    <label class="f" style="margin-top:10px">${rej ? 'Why is it rejected? (required)' : 'Note (optional)'}<input class="in" value=${note} onInput=${e => setNote(e.target.value)}/></label>
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
  }, [o.id, o.has_file]);
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
  if (o.production === 'awaiting_qc') return html`<button class="btn sm primary" onClick=${e => { e.stopPropagation(); onOpen(o); }}>Quality control</button>`;
  const tone = o.qc === 'approved' ? 'completed' : o.qc === 'rejected' ? 'failed' : 'pending';
  return html`<${Pill} s=${tone} label=${o.qc === 'approved' ? 'QC approved' : o.qc === 'rejected' ? 'QC rejected' : 'QC pending'}/><div class="tiny dim">${String(o.production || '').replaceAll('_', ' ')}</div>${o.hold && html`<div class="tiny amber">${o.hold}</div>`}`;
}

export function Orders() {
  const [filter, setFilter] = useState('all');
  const { data, error, reload } = useLoad(() => rpc('admin_orders', { p_filter: filter }), [filter]);
  const [qc, setQc] = useState(null);
  const cols = useColumns('orders', ORDER_COLS); const V = cols.visible;
  const stages = ['blocked', 'queued', 'preparing', 'awaiting_qc', 'ready_to_print', 'submitted', 'fulfilled'];
  return html`<div class="page">
    <div class="head"><div class="grow"><h1>Orders</h1></div>
      <${Seg} value=${filter} onChange=${setFilter} options=${[{ v: 'all', l: 'all' }, { v: 'live', l: 'real' }, { v: 'test', l: 'test' }, { v: 'blocked', l: 'blocked' }]}/><span style="margin-left:8px">${cols.picker}</span></div>
    ${error && html`<div class="card red">${error.message}</div>`}
    ${data && html`<div class="row wrap" style="gap:8px;margin-bottom:12px">${stages.map((st, i) => { const n = data.filter(o => o.production === st).length; return html`<div class="card reveal" style=${'padding:8px 12px;min-width:110px;--i:' + i}><div class="tiny dim up">${st}</div><div class="disp" style="font-size:20px;font-weight:700">${n}</div></div>`; })}</div>`}
    <div class="card tbl-wrap" style="padding:0"><table class="tbl"><thead><tr>${V('thumb') && html`<th></th>`}<th>Order</th>${V('style') && html`<th>Style</th>`}${V('spec') && html`<th>Spec</th>`}${V('payment') && html`<th>Payment</th>`}<th>Quality control</th>${V('session') && html`<th class="hide-m">Session</th>`}${V('when') && html`<th>When</th>`}</tr></thead><tbody>
      ${!data ? html`<tr><td colspan=${cols.count}><${Skel} hgt="200"/></td></tr>` : data.map((o, i) => html`<tr class="click" key=${o.id} style=${'--i:' + Math.min(i, 20)} onClick=${() => go('customers/' + o.session)}>
        ${V('thumb') && html`<td style="width:44px"><div class="thumb" style="width:30px">${o.thumb && html`<${SImg} path=${o.thumb}/>`}</div></td>`}
        <td><b>#${o.shopify_order_id}</b>${o.test && html` <span class="tag">test</span>`}<${PrintEye} o=${o}/></td>${V('style') && html`<td>${o.style || '–'}</td>`}${V('spec') && html`<td class="tiny">${o.material} ${o.size} × ${o.qty}</td>`}
        ${V('payment') && html`<td><${Pill} s=${o.payment}/></td>`}<td><${QcCell} o=${o} onOpen=${setQc}/></td>${V('session') && html`<td class="hide-m tiny dim">${o.session_ref}</td>`}${V('when') && html`<td class="tiny">${fmt.date(o.at)}</td>`}</tr>`)}
      ${data && !data.length && html`<tr><td colspan=${cols.count}><${Empty}>No orders.</${Empty}></td></tr>`}</tbody></table></div>
    ${qc && html`<${QcModal} o=${qc} onClose=${() => setQc(null)} onDone=${() => { setQc(null); reload(); }}/>`}
  </div>`;
}
