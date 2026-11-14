import { html, useEffect, useState, Icon, Pill, Drawer, Seg, Empty, Skel, SImg, Lightbox, SortSelect, confirm, copy, useLoad, usePoll } from '../ui.js';
import { rpc, fn, fmt, signed } from '../api.js';
import { toast, useStore } from '../store.js';
import { go } from '../router.js';

const FILTERS = [{ v: 'all', l: 'all' }, { v: 'generated', l: 'generated' }, { v: 'carts', l: 'carts' }, { v: 'orders', l: 'orders' }, { v: 'contacts', l: 'email' }, { v: 'failed', l: 'failed' }, { v: 'restricted', l: 'restricted' }, { v: 'archived', l: 'reset' }];
const SORTS = [{ v: 'hot', l: 'Hottest leads' }, { v: 'recent', l: 'Last active' }, { v: 'value', l: 'Cart / order value' }, { v: 'generations', l: 'Most portraits' }, { v: 'newest', l: 'Newest' }, { v: 'failures', l: 'Most failures' }];
const keep = (k, v) => { try { v === undefined ? (v = localStorage.getItem('nsl-admin-' + k)) : localStorage.setItem('nsl-admin-' + k, v); } catch { /* storage blocked */ } return v; };

export function Customers({ openId }) {
  const [q, setQ] = useState(''); const [qq, setQQ] = useState(''); const [filter, setFilter] = useState('all'); const [page, setPage] = useState(0);
  const [sort, setSort] = useState(() => keep('cust-sort') || 'hot');
  useEffect(() => { const t = setTimeout(() => { setQQ(q); setPage(0); }, 250); return () => clearTimeout(t); }, [q]);
  const { data, loading, error, reload } = useLoad(() => rpc('admin_sessions', { p_search: qq || null, p_filter: filter, p_limit: 50, p_offset: page * 50, p_sort: sort }), [qq, filter, page, sort]);
  const setSortKeep = v => { setSort(v); keep('cust-sort', v); setPage(0); };
  usePoll(() => reload(true), 20000); // live: new sessions, portraits and carts appear without a page reload
  return html`<div class="page">
    <div class="head"><div class="grow"><h1>Customers</h1></div>
      <${SortSelect} value=${sort} options=${SORTS} onChange=${setSortKeep}/></div>
    <div class="row wrap" style="margin-bottom:12px;gap:10px">
      <input class="in" style="max-width:340px" placeholder="search ref, label, email, id…" value=${q} onInput=${e => setQ(e.target.value)}/>
      <${Seg} value=${filter} onChange=${v => { setFilter(v); setPage(0); }} options=${FILTERS}/>
      <span class="grow"></span>${loading ? html`<span class="tiny dim row"><span class="spinner" style="width:12px;height:12px"></span>loading</span>` : html`<span class="tiny dim live" title="Refreshes every 20 s while this tab is open">live</span>`}
    </div>
    ${error && html`<div class="card red">${error.message}</div>`}
    <div class="card tbl-wrap" style="padding:0">
      <table class="tbl"><thead><tr><th></th><th>Session</th><th class="hide-m">Email</th><th class="num">Gens</th><th class="num hide-m">Fail</th><th class="num">Cart</th><th class="num">Orders</th><th class="num hide-m">Score</th><th class="hide-m">Styles</th><th>Seen</th></tr></thead>
      <tbody>${!data ? html`<tr><td colspan="10"><${Skel} hgt="240"/></td></tr>` : data.rows.map((r, i) => html`<tr class="click" key=${r.id} style=${'--i:' + Math.min(i, 20)} onClick=${() => go('customers/' + r.id)}>
        <td style="width:44px"><div class="thumb" style="width:30px">${r.thumb && html`<${SImg} path=${r.thumb}/>`}</div></td>
        <td><b>${r.label || r.ref || r.id.slice(0, 8)}</b> ${r.restricted && html`<span class="flag res">restricted</span>`} ${r.archived && html`<span class="flag arc">reset</span>`}${r.label && html`<div class="tiny dim">${r.ref}</div>`}</td>
        <td class="hide-m tiny">${r.email || html`<span class="dim">–</span>`}</td>
        <td class="num">${r.generations}</td><td class=${'num hide-m ' + (r.failed ? 'red' : 'dim')}>${r.failed}</td>
        <td class="num">${r.cart ? html`<span class="amber">${fmt.czk(r.cart_value)}</span><div class="tiny dim">${r.cart} item${r.cart > 1 ? 's' : ''}</div>` : html`<span class="dim">–</span>`}</td>
        <td class="num">${r.orders ? html`<span class="acid">${r.orders}</span>` : r.test_orders ? html`<span class="tag">${r.test_orders} test</span>` : html`<span class="dim">–</span>`}</td>
        <td class="num hide-m">${r.score > 0 ? html`<span class="score">${r.score}</span>` : html`<span class="dim">–</span>`}</td>
        <td class="hide-m tiny dim trunc" style="max-width:200px">${(r.styles || []).join(', ')}</td>
        <td class="tiny">${fmt.ago(r.last_at)}</td></tr>`)}
      ${data && !data.rows.length && html`<tr><td colspan="10"><${Empty}>No sessions match.</${Empty}></td></tr>`}</tbody></table>
    </div>
    <div class="row end" style="margin-top:10px"><button class="btn sm" disabled=${!page} onClick=${() => setPage(page - 1)}>← prev</button><span class="tiny dim">page ${page + 1}</span><button class="btn sm" disabled=${!data || data.rows.length < 50} onClick=${() => setPage(page + 1)}>next →</button></div>
    ${openId && html`<${SessionDrawer} key=${openId} id=${openId} onClose=${() => go('customers')} onChanged=${() => reload(true)}/>`}
  </div>`;
}

function SessionDrawer({ id, onClose, onChanged }) {
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
      ${role === 'owner' && html`<button class="btn sm danger" disabled=${busy} onClick=${del}><${Icon} n="trash" s="13"/>Delete</button>`}
      <span class="tiny dim grow" style="min-width:160px">${restricted ? 'Restricted' + (s.admin_restrict_reason ? ': ' + s.admin_restrict_reason : '') + ' · cannot create portraits' : archived ? 'Reset: the device starts a new gallery on its next visit' : 'Active'}</span>
    </div>`}
    <div class="grid g4" style="margin-bottom:14px">
      <div class="card kpi"><div class="l">portraits</div><div class="v">${data.images.length}</div></div>
      <div class="card kpi"><div class="l">uploads</div><div class="v">${data.uploads.length}</div></div>
      <div class="card kpi"><div class="l">orders</div><div class="v acid">${data.orders.length}</div></div>
      <div class="card kpi"><div class="l">cart</div><div class="v">${fmt.czkMinor(cartTotal)}</div></div>
    </div>
    <div class="row" style="margin-bottom:14px;gap:8px">
      <input class="in" placeholder="admin label (e.g. 'Petra – grandma gift')" value=${label ?? s.admin_label ?? ''} disabled=${role === 'viewer'} onInput=${e => setLabel(e.target.value)} onKeyDown=${e => e.key === 'Enter' && saveLabel()}/>
      ${label != null && html`<button class="btn primary" onClick=${saveLabel}>Save</button>`}
      ${data.contact && html`<span class="tag trunc" title=${data.contact.verified ? 'verified' : 'unverified'}>${data.contact.email}${data.contact.marketing ? ' · mkt' : ''}</span>`}
    </div>
    <div class="tabs">${['gallery', 'timeline', 'orders', 'cart'].map(t => html`<button aria-selected=${tab === t} onClick=${() => setTab(t)}>${t}${t === 'gallery' ? ' ' + data.images.length : t === 'cart' && data.cart?.items?.length ? ' ' + data.cart.items.length : ''}</button>`)}</div>
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
      <tr><td colspan="3" class="muted">Total</td><td class="num acid"><b>${fmt.czkMinor(cartTotal)}</b></td></tr></tbody></table></div><div class="tiny dim" style="margin-top:6px">updated ${fmt.ago(data.cart.at)} ago</div>` : html`<${Empty}>Empty cart.</${Empty}>`)}
    ${big && html`<${Lightbox} src=${big.url} alt=${big.alt} onClose=${() => setBig(null)} pos=${bigIdx >= 0 ? (bigIdx + 1) + ' / ' + data.images.length : null}
      onPrev=${bigIdx > 0 ? () => step(-1) : null} onNext=${bigIdx >= 0 && bigIdx < data.images.length - 1 ? () => step(1) : null}/>`}
  </${Drawer}>`;
}

export function Orders() {
  const [filter, setFilter] = useState('all');
  const { data, error } = useLoad(() => rpc('admin_orders', { p_filter: filter }), [filter]);
  const stages = ['blocked', 'queued', 'preparing', 'ready', 'submitted', 'dispatched'];
  return html`<div class="page">
    <div class="head"><div class="grow"><h1>Orders</h1></div>
      <${Seg} value=${filter} onChange=${setFilter} options=${[{ v: 'all', l: 'all' }, { v: 'live', l: 'real' }, { v: 'test', l: 'test' }, { v: 'blocked', l: 'blocked' }]}/></div>
    ${error && html`<div class="card red">${error.message}</div>`}
    ${data && html`<div class="row wrap" style="gap:8px;margin-bottom:12px">${stages.map((st, i) => { const n = data.filter(o => o.production === st).length; return html`<div class="card reveal" style=${'padding:8px 12px;min-width:110px;--i:' + i}><div class="tiny dim up">${st}</div><div class="disp" style="font-size:20px;font-weight:700">${n}</div></div>`; })}</div>`}
    <div class="card tbl-wrap" style="padding:0"><table class="tbl"><thead><tr><th></th><th>Order</th><th>Style</th><th>Spec</th><th>Payment</th><th>Production</th><th class="hide-m">Session</th><th>When</th></tr></thead><tbody>
      ${!data ? html`<tr><td colspan="8"><${Skel} hgt="200"/></td></tr>` : data.map((o, i) => html`<tr class="click" style=${'--i:' + Math.min(i, 20)} onClick=${() => go('customers/' + o.session)}>
        <td style="width:44px"><div class="thumb" style="width:30px">${o.thumb && html`<${SImg} path=${o.thumb}/>`}</div></td>
        <td><b>#${o.shopify_order_id}</b>${o.test && html` <span class="tag">test</span>`}</td><td>${o.style || '–'}</td><td class="tiny">${o.material} ${o.size} × ${o.qty}</td>
        <td><${Pill} s=${o.payment}/></td><td><${Pill} s=${o.production}/>${o.hold && html`<div class="tiny amber">${o.hold}</div>`}</td><td class="hide-m tiny dim">${o.session_ref}</td><td class="tiny">${fmt.date(o.at)}</td></tr>`)}
      ${data && !data.length && html`<tr><td colspan="8"><${Empty}>No orders.</${Empty}></td></tr>`}</tbody></table></div>
  </div>`;
}
