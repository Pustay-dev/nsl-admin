// Overview widget registry. Each widget loads its own data (useLoad), so a widget that is not on the board costs nothing.
// Shape: { title, desc, size: default 's'|'m'|'l', go: route, Component({ size }) }.
import { html, useEffect, Kpi, Spark, Bars, HBar, Pill, Icon, Switch, Skel, Empty, confirm, useLoad } from '../ui.js';
import { rpc, fmt } from '../api.js';
import { toast, useStore } from '../store.js';
import { go } from '../router.js';
import { TopBars } from './topbars.js';

// Several tiles read the same RPC: share one in-flight request for a couple of seconds.
const inflight = new Map();
function shared(name, args = {}) {
  const key = name + JSON.stringify(args), e = inflight.get(key);
  if (e && Date.now() - e.t < 2500) return e.p;
  const p = rpc(name, args);
  inflight.set(key, { t: Date.now(), p });
  p.catch(() => inflight.delete(key));
  return p;
}
function useRpc(name, args = {}, ms = 0) {
  const a = JSON.stringify(args);
  const r = useLoad(() => shared(name, args), [name, a]);
  useEffect(() => {
    if (!ms) return;
    const t = setInterval(() => document.visibilityState === 'visible' && r.reload(true), ms);
    return () => clearInterval(t);
  }, [r.reload, ms]);
  return r;
}
const useOv = () => useRpc('admin_overview', {}, 15000);
const useAn = () => useRpc('admin_analytics', { p_days: 30 }, 60000);

const Wait = ({ r, h = 96, children }) => r.error && !r.data ? html`<div class="card red tiny">${r.error.message}</div>` : !r.data ? html`<${Skel} hgt=${h}/>` : children(r.data);

/* ---------- KPI tiles ---------- */
const kpi = (use, render) => ({ size }) => { const r = use(); return html`<${Wait} r=${r}>${d => render(d)}</${Wait}>`; };

const KpiPaid = kpi(useOv, d => { const k = d.kpi; return html`<${Kpi} label="Paid orders" v=${k.paid_items} sub=${k.paid_items_7d + ' this week · ' + k.test_items + ' test'} tone=${k.paid_items ? 'acid' : ''}/>`; });
const KpiRevenue = kpi(() => useRpc('admin_finance_summary', {}, 120000), d => html`<${Kpi} label="Revenue" v=${d.totals.revenue} f=${v => fmt.czk(v)} sub=${d.totals.orders + ' orders · profit ' + fmt.czk(d.totals.profit)}/>`);
const KpiConv = kpi(useAn, d => { const F = d.funnel; return html`<${Kpi} label="Visitor → paid · 30d" v=${F.sessions ? Math.round((F.paid / F.sessions) * 1000) / 10 : 0} f=${v => v + ' %'} sub=${F.paid + ' paid of ' + fmt.n(F.sessions) + ' visitors'}/>`; });
const KpiPortraits = kpi(useOv, d => { const k = d.kpi; return html`<${Kpi} label="Portraits today" v=${k.generations_today} sub=${fmt.n(k.generations_7d) + ' in 7 days · ' + fmt.n(k.generations_total) + ' all-time'}/>`; });
const KpiVisitors = kpi(useOv, d => { const k = d.kpi; return html`<${Kpi} label="Visitors today" v=${k.sessions_today} sub=${fmt.n(k.sessions_7d) + ' in 7 days'}/>`; });
const KpiSpend = kpi(useAn, d => html`<${Kpi} label="AI spend · 30d" v=${d.spend_estimate_usd ?? null} f=${v => fmt.usd(v)} sub=${'≈ ' + fmt.czk(d.spend_estimate_czk)}/>`);
const KpiBlocked = kpi(useOv, d => { const n = d.queue.orders_blocked || 0; return html`<${Kpi} label="Blocked orders" v=${n} tone=${n ? 'red' : ''} sub=${n ? 'paid items stuck in production' : 'nothing blocked'}/>`; });
const KpiCarts = kpi(useOv, d => html`<${Kpi} label="Open carts" v=${d.kpi.carts_open} sub=${d.kpi.sessions_today + ' visitors today'}/>`);
const KpiLeads = kpi(useOv, d => html`<${Kpi} label="Leads (emails)" v=${d.kpi.contacts} sub="left an email, all-time"/>`);

/* ---------- lists & charts ---------- */
function Attention() {
  const r = useOv();
  return html`<${Wait} r=${r} h=${120}>${data => {
    const k = data.kpi, q = data.queue;
    const alerts = [
      !q.generation_enabled && { t: 'Paid generation is OFF — customers cannot create portraits.', to: 'system', tone: 'red' },
      q.needs_review && { t: q.needs_review + ' generation job(s) need review (ambiguous provider outcome).', to: 'system', tone: 'amber' },
      q.orders_blocked && { t: q.orders_blocked + ' paid order item(s) blocked in production.', to: 'orders', tone: 'red' },
      q.factory_review && { t: q.factory_review + ' style factory run(s) waiting for review.', to: 'styles', tone: 'amber' },
      k.failed_7d && { t: k.failed_7d + ' failed generation(s) in the last 7 days.', to: 'analytics', tone: 'amber' },
    ].filter(Boolean);
    return html`<div class="card"><h3>Attention</h3>
      ${alerts.length ? html`<div class="col">${alerts.map(a => html`<button class="btn" style="justify-content:flex-start;white-space:normal;text-align:left" onClick=${() => go(a.to)}><span class=${'dot ' + (a.tone === 'red' ? 'off' : 'warn')}></span><span>${a.t}</span></button>`)}</div>`
        : html`<div class="muted"><span class="acid">●</span> All clear.</div>`}</div>`;
  }}</${Wait}>`;
}

function Daily() {
  const r = useAn();
  return html`<${Wait} r=${r} h=${200}>${d => html`<div class="card"><h3>Daily activity · 14 days <span class="grow"></span><span class="legend"><span><i style="background:var(--acid)"></i>portraits</span><span><i style="background:var(--red)"></i>failed</span><span><i style="background:var(--blue)"></i>orders</span></span></h3>
    ${d.daily.length ? html`<${Bars} data=${d.daily.slice(-14)} series=${[{ key: 'generated', cls: 'g', label: 'portraits' }, { key: 'failed', cls: 'f', label: 'failed' }, { key: 'orders', cls: 's', label: 'orders' }]}/>` : html`<${Empty}>No activity yet.</${Empty}>`}</div>`}</${Wait}>`;
}

function Spark14() {
  const r = useOv();
  return html`<${Wait} r=${r} h=${180}>${d => html`<div class="card"><h3>Portraits per day · last 14 days <span class="grow"></span><span class="acid">${fmt.n(d.spark.reduce((a, x) => a + x.n, 0))}</span></h3>
    <${Spark} data=${d.spark} w=${640} hgt=${120}/>
    <div class="row between tiny dim" style="margin-top:6px"><span>${d.spark[0] ? fmt.day(d.spark[0].day) : ''}</span><span>today</span></div></div>`}</${Wait}>`;
}

const STEPS = [['sessions', 'Visited creator'], ['uploaded', 'Uploaded photos'], ['generated', 'Got a portrait'], ['multi', 'Tried 2+ portraits'], ['carted', 'Added to cart'], ['contact', 'Left email'], ['paid', 'Paid']];
function Funnel() {
  const r = useAn();
  return html`<${Wait} r=${r} h=${240}>${d => { const F = d.funnel; return html`<div class="card"><h3>Funnel · 30 days</h3>
    <div class="col" style="gap:10px">${STEPS.map(([k, l], i) => html`<div><div class="row between small"><span>${l}</span><span><b>${F[k]}</b> <span class="dim tiny">${i ? fmt.pct(F[k], F.sessions) : ''}</span></span></div><${HBar} v=${F[k]} max=${F.sessions}/></div>`)}</div></div>`; }}</${Wait}>`;
}

function TopStyles() {
  const r = useAn();
  return html`<${Wait} r=${r} h=${200}>${d => { const rows = [...d.styles].sort((a, b) => b.generated - a.generated).slice(0, 6), max = Math.max(1, ...rows.map(s => s.generated));
    return html`<div class="card"><h3>Top styles · 30 days</h3>
      ${rows.length ? html`<div class="col" style="gap:8px">${rows.map(s => html`<div class="row"><span class="small trunc" style="width:110px">${s.name}</span><div class="grow"><${HBar} v=${s.generated} max=${max}/></div><span class="tiny" style="width:64px;text-align:right">${s.generated}${s.orders ? html` · <span class="acid">${s.orders}</span>` : ''}</span></div>`)}</div>` : html`<${Empty}>No generations in range.</${Empty}>`}</div>`; }}</${Wait}>`;
}

function RecentOrders() {
  const r = useRpc('admin_orders', { p_filter: 'live' }, 30000);
  return html`<${Wait} r=${r} h=${160}>${d => { const rows = d.slice(0, 6);
    return html`<div class="card"><h3>Recent orders</h3>
      ${rows.length ? html`<div class="col" style="gap:8px">${rows.map(o => html`<div class="row between small"><span class="trunc"><b>#${o.shopify_order_id || '?'}</b> <span class="dim">${o.style || ''} · ${o.size || ''}</span></span><span class="row"><span class="tiny dim">${fmt.ago(o.at)} ago</span><${Pill} s=${o.production}/></span></div>`)}</div>` : html`<${Empty}>No paid orders yet.</${Empty}>`}</div>`; }}</${Wait}>`;
}

function Engine() {
  const role = useStore(s => s.role);
  const r = useOv();
  const flip = async on => {
    if (!on && !(await confirm({ title: 'Stop all generation?', body: 'Customers will not be able to create portraits until you switch it back on. In-flight jobs finish.', ok: 'Stop generation', danger: true, type: 'STOP' }))) return;
    try { await rpc('admin_generation_switch', { p_enabled: on }); toast(on ? 'Generation enabled' : 'Generation stopped', on ? 'ok' : 'warn'); r.reload(true); } catch (e) { toast(e.message, 'err'); }
  };
  return html`<${Wait} r=${r} h=${220}>${d => { const q = d.queue; return html`<div class="card"><h3>Engine</h3>
    <div class="col" style="gap:12px">
      <div class="row between"><span class="row"><span class=${'dot ' + (q.generation_enabled ? 'pulse' : 'off')}></span>Paid generation</span>
        ${role === 'owner' ? html`<${Switch} on=${q.generation_enabled} onChange=${flip} label="Toggle generation"/>` : html`<${Pill} s=${q.generation_enabled ? 'live' : 'failed'} label=${q.generation_enabled ? 'on' : 'off'}/>`}</div>
      <div class="row between"><span class="muted">Queue</span><span>${q.queued} queued · ${q.running} running</span></div>
      <div class="row between"><span class="muted">Needs review</span><span class=${q.needs_review ? 'amber' : ''}>${q.needs_review}</span></div>
      <div class="row between"><span class="muted">Submissions</span><span>${fmt.n(q.submissions)}${q.submission_limit < 2e9 ? ' / ' + fmt.n(q.submission_limit) : ''}</span></div>
      <div class="row between"><span class="muted">Model</span><span class="tiny acid trunc">${q.model}</span></div>
      <div class="row between"><span class="muted">Style factory</span><span>${q.factory_pending} running · ${q.factory_review} review</span></div>
    </div></div>`; }}</${Wait}>`;
}

function Feed() {
  const r = useOv();
  return html`<${Wait} r=${r} h=${240}>${d => html`<div class="card"><h3><span class="dot pulse"></span>Live feed</h3>
    <ul class="feed">${d.feed.map((f, i) => html`<li key=${f.type + f.at + f.ref} style=${'--i:' + Math.min(i, 12)}>
      <time>${fmt.ago(f.at)} ago</time>
      <${Icon} n=${f.type === 'job' ? 'bolt' : f.type === 'order' ? 'orders' : 'users'} s="14" c=${f.type === 'order' ? 'acid' : 'dim'}/>
      <span class="trunc">${f.type === 'job' ? html`<b>${f.style}</b> <span class="dim">${f.ref || ''}</span>${f.error ? html` <span class="red">${f.error}</span>` : ''}`
        : f.type === 'order' ? html`order <b>#${f.ref || '?'}</b>${f.test ? html` <span class="tag">test</span>` : ''}` : html`new session <span class="dim">${f.ref || ''}</span>`}</span>
      <span class="row">${f.seconds != null && f.status === 'completed' ? html`<span class="tiny dim">${f.seconds}s</span>` : ''}${f.status && html`<${Pill} s=${f.status}/>`}
        ${f.session && html`<button class="btn ghost sm" onClick=${() => go('customers/' + f.session)} aria-label="Open session"><${Icon} n="ext" s="12"/></button>`}</span>
    </li>`)}</ul></div>`}</${Wait}>`;
}

function MailBox() {
  const r = useRpc('admin_mail_outbox_list', { p_limit: 30 }, 60000);
  return html`<${Wait} r=${r} h=${120}>${d => { const c = {}; (d || []).forEach(m => { c[m.status] = (c[m.status] || 0) + 1; }); const ks = Object.keys(c);
    return html`<div class="card"><h3>Mail outbox <span class="dim tiny">last 30</span></h3>
      ${ks.length ? html`<div class="col" style="gap:8px">${ks.map(s => html`<div class="row between"><${Pill} s=${s}/><b>${c[s]}</b></div>`)}</div>` : html`<${Empty}>Outbox is empty.</${Empty}>`}</div>`; }}</${Wait}>`;
}

function AbTests() {
  const r = useRpc('admin_ab_list', {}, 120000);
  return html`<${Wait} r=${r} h=${120}>${d => { const run = (d || []).filter(e => e.status === 'running');
    return html`<div class="card"><h3>A/B tests</h3>
      ${run.length ? html`<div class="col" style="gap:8px">${run.map(e => { const a = e.arms || {}, v = (a.A?.visitors || 0) + (a.B?.visitors || 0), o = (a.A?.ordered || 0) + (a.B?.ordered || 0);
        return html`<div class="row between small"><b class="trunc">${e.name}</b><span class="tiny dim">${fmt.n(v)} visitors · ${o} paid</span></div>`; })}</div>` : html`<div class="muted small">No test running.</div>`}</div>`; }}</${Wait}>`;
}

export const WIDGETS = {
  kpi_paid: { title: 'Paid orders', desc: 'Paid order items, this week, test and carts', size: 's', go: 'orders', Component: KpiPaid },
  kpi_revenue: { title: 'Revenue', desc: 'Revenue and profit so far', size: 's', go: 'system', Component: KpiRevenue },
  kpi_conv: { title: 'Visitor → paid', desc: 'Conversion over 30 days', size: 's', go: 'analytics', Component: KpiConv },
  kpi_portraits: { title: 'Portraits today', desc: 'Generated today, 7 days, all-time', size: 's', go: 'analytics', Component: KpiPortraits },
  kpi_visitors: { title: 'Visitors today', desc: 'Creator sessions today and 7 days', size: 's', go: 'analytics', Component: KpiVisitors },
  kpi_spend: { title: 'AI spend', desc: 'Estimated generation spend, 30 days', size: 's', go: 'analytics', Component: KpiSpend },
  kpi_blocked: { title: 'Blocked orders', desc: 'Paid items stuck in production', size: 's', go: 'orders', Component: KpiBlocked },
  kpi_carts: { title: 'Open carts', desc: 'Carts not yet paid', size: 's', go: 'customers', Component: KpiCarts },
  kpi_leads: { title: 'Leads', desc: 'Visitors who left an email', size: 's', go: 'customers', Component: KpiLeads },
  attention: { title: 'Attention', desc: 'Things that need action now', size: 's', go: 'orders', Component: Attention },
  daily: { title: 'Daily activity', desc: 'Portraits, failures and orders per day', size: 'l', go: 'analytics', Component: Daily },
  spark: { title: 'Portraits per day', desc: 'Trend line, last 14 days', size: 'm', go: 'analytics', Component: Spark14 },
  funnel: { title: 'Funnel', desc: 'Visit to paid, 30 days', size: 'm', go: 'analytics', Component: Funnel },
  top_styles: { title: 'Top styles', desc: 'Most used styles and their orders', size: 'm', go: 'styles', Component: TopStyles },
  recent_orders: { title: 'Recent orders', desc: 'Latest paid orders and their stage', size: 'm', go: 'orders', Component: RecentOrders },
  engine: { title: 'Engine', desc: 'Generation switch, queue, model', size: 's', go: 'system', Component: Engine },
  feed: { title: 'Live feed', desc: 'Jobs, orders and sessions as they happen', size: 'm', go: 'customers', Component: Feed },
  mail: { title: 'Mail outbox', desc: 'Outbox status counts', size: 's', go: 'mail', Component: MailBox },
  ab: { title: 'A/B tests', desc: 'Running experiments', size: 's', go: 'experiments', Component: AbTests },
  topbars: { title: 'Conversion, profit, return', desc: 'The three progress bars', size: 'l', go: 'analytics', Component: TopBars },
};

export const DEFAULT_LAYOUT = [
  ['kpi_paid', 's'], ['kpi_revenue', 's'], ['kpi_conv', 's'], ['kpi_portraits', 's'], ['kpi_visitors', 's'], ['kpi_spend', 's'],
  ['spark', 'm'], ['engine', 's'], ['feed', 'm'], ['attention', 's'],
].map(([id, size]) => ({ id, size }));

// Accept only known ids, valid sizes, no duplicates. Returns null if nothing usable.
export function cleanLayout(v) {
  if (!Array.isArray(v)) return null;
  const seen = new Set(), out = [];
  for (const x of v) {
    if (!x || !WIDGETS[x.id] || seen.has(x.id)) continue;
    seen.add(x.id); out.push({ id: x.id, size: ['s', 'm', 'l'].includes(x.size) ? x.size : WIDGETS[x.id].size });
  }
  return out;
}
