// Meta (Facebook / Instagram) ads joined to OUR funnel: spend from Meta, visitors / carts / PAID orders from our own tracking.
// Data: rpc admin_meta_report + admin_meta_ab_report (supabase/migrations/20261118152000_meta_ads_v1.sql), filled daily by
// n8n/workflows/meta-insights-sync.json. Read-only pages. Setup: docs/META-INTEGRATION.md.
import { html, useState, Kpi, Bars, HBar, Seg, Skel, Empty, Pill, useLoad } from '../ui.js';
import { rpc, fmt } from '../api.js';
import { perArm } from './cx.js';

const MIN_CLICKS = 100;          // per arm / per ad before any winner talk
const DEFAULT_MIN_SPEND = 300;   // in account currency, before an ad is ranked by CPA
const DAY_OPTS = [{ v: 7, l: '7d' }, { v: 14, l: '14d' }, { v: 30, l: '30d' }, { v: 90, l: '90d' }];

const pct = (v, d = 1) => (v == null ? '–' : (v * 100).toFixed(d) + '%');
const ratio = (a, b) => (b ? a / b : null);
const money = cur => v => (v == null ? '–' : Math.round(v).toLocaleString('cs-CZ') + ' ' + (!cur || cur === 'CZK' ? 'Kč' : cur));
const money2 = cur => v => (v == null ? '–' : Number(v).toLocaleString('cs-CZ', { maximumFractionDigits: 2 }) + ' ' + (!cur || cur === 'CZK' ? 'Kč' : cur));
const STATUS = s => (s === 'ACTIVE' ? 'live' : s === 'PAUSED' || s === 'CAMPAIGN_PAUSED' || s === 'ADSET_PAUSED' ? 'hidden' : s ? 'review' : 'draft');
const stLabel = s => (s ? String(s).toLowerCase().replace(/_/g, ' ') : 'unknown');

function useMeta(days) {
  // Report (spend + per-ad attribution) and shop-wide numbers (ALL real paid orders and finance profit, no utm needed).
  return useLoad(async () => {
    const [report, shop] = await Promise.all([rpc('admin_meta_report', { p_days: days }), rpc('admin_meta_shop', { p_days: days })]);
    return { ...report, shop };
  }, [days]);
}

function Shell({ title, days, setDays, data, loading, children }) {
  return html`<div class="page"><div class="head"><div class="grow"><h1>${title}</h1>
      ${data?.last_sync && html`<div class="tiny dim">Meta data synced ${fmt.ago(data.last_sync)} ago · last ${data.days} days${data.currency ? ' · ' + data.currency : ''}</div>`}</div>
    ${loading && html`<span class="tiny dim">loading…</span>`}${setDays && html`<${Seg} value=${days} onChange=${setDays} options=${DAY_OPTS}/>`}</div>${children}</div>`;
}

function NotConnected() {
  return html`<${Empty}><b>Not connected yet: see docs/META-INTEGRATION.md</b><div class="small dim" style="margin-top:6px">
    Once the n8n workflow "Meta insights sync" runs, spend per ad appears here and is joined to visitors, carts and paid orders.</div></${Empty}>`;
}

// Common loader: either the parent passes days, or the page keeps its own selector.
function useDays(days) {
  const [own, setOwn] = useState(30);
  return days ? [days, null] : [own, setOwn];
}

function Gate({ title, days: d0, render }) {
  const [days, setDays] = useDays(d0);
  const { data, error, loading } = useMeta(days);
  if (error) return html`<${Shell} title=${title} days=${days} setDays=${setDays}><div class="card red">${error.message}</div></${Shell}>`;
  if (!data) return html`<${Shell} title=${title} days=${days} setDays=${setDays}><div class="grid g4">${[1, 2, 3, 4].map(() => html`<${Skel} hgt="96"/>`)}</div></${Shell}>`;
  if (!data.connected) return html`<${Shell} title=${title} days=${days} setDays=${setDays} data=${data}><${NotConnected}/></${Shell}>`;
  return html`<${Shell} title=${title} days=${days} setDays=${setDays} data=${data} loading=${loading}>${render(data, days)}</${Shell}>`;
}

function TrackingNote({ d }) {
  const u = d.unmatched || {};
  if (!u.meta_channel) return null;
  return html`<div class="card" style="border-left:3px solid var(--amber);margin-bottom:12px"><div class="small"><b class="amber">${fmt.n(u.meta_channel)} Meta visitors could not be matched to an ad or campaign</b>${u.paid ? html` (incl. ${u.paid} paid order${u.paid > 1 ? 's' : ''})` : ''}.
    Their links are missing <code>utm_content={{ad.id}}</code> / <code>utm_campaign={{campaign.id}}</code>, so CPA below is too high. Fix the URL parameters in Ads Manager.</div></div>`;
}

/* ================= Campaigns ================= */
function Row({ r, depth, cur, open, toggle, hasKids }) {
  const m = money(cur);
  return html`<tr style=${depth ? 'background:var(--panel2)' : ''}>
    <td><div class="row" style=${`gap:6px;padding-left:${depth * 18}px`}>
      ${hasKids ? html`<button class="btn ghost sm" aria-expanded=${open} aria-label=${open ? 'Collapse' : 'Expand'} onClick=${toggle} style="padding:0 6px;font-size:14px;line-height:20px">${open ? '▾' : '▸'}</button>` : html`<span style="width:26px"></span>`}
      ${r.thumb && html`<img src=${r.thumb} alt="" width="28" height="28" style="border-radius:4px;object-fit:cover"/>`}
      <div><div>${r.name || r.id}</div><div class="tiny dim">${r.level} · ${r.id}</div></div></div></td>
    <td><${Pill} s=${STATUS(r.status)} label=${stLabel(r.status)}/></td>
    <td class="num" style="white-space:nowrap">${m(r.spend)}</td><td class="num" style="white-space:nowrap">${fmt.n(r.link_clicks || r.clicks)}</td><td class="num" style="white-space:nowrap">${fmt.n(r.visitors)}</td>
    <td class="num" style="white-space:nowrap">${fmt.n(r.carts)}</td><td class="num" style="white-space:nowrap"><b class=${r.paid ? 'acid' : ''}>${fmt.n(r.paid)}</b></td>
    <td class="num" style="white-space:nowrap">${r.cpa == null ? html`<span class="dim">${r.spend ? 'no sale' : '–'}</span>` : m(r.cpa)}</td></tr>`;
}

export function MetaCampaigns({ days } = {}) {
  const [open, setOpen] = useState({});
  const toggle = id => setOpen(o => ({ ...o, [id]: !o[id] }));
  return html`<${Gate} title="Meta campaigns" days=${days} render=${d => {
    const cur = d.currency;
    const rows = [];
    for (const c of d.campaigns) {
      const sets = d.adsets.filter(s => s.campaign_id === c.id);
      rows.push(html`<${Row} r=${c} depth=${0} cur=${cur} open=${open[c.id]} toggle=${() => toggle(c.id)} hasKids=${sets.length > 0}/>`);
      if (!open[c.id]) continue;
      for (const s of sets) {
        const ads = d.ads.filter(a => a.adset_id === s.id);
        rows.push(html`<${Row} r=${s} depth=${1} cur=${cur} open=${open[s.id]} toggle=${() => toggle(s.id)} hasKids=${ads.length > 0}/>`);
        if (open[s.id]) for (const a of ads) rows.push(html`<${Row} r=${a} depth=${2} cur=${cur}/>`);
      }
    }
    const campOnly = d.campaigns.reduce((t, c) => t + c.visitors, 0) - d.ads.reduce((t, a) => t + a.visitors, 0);
    return html`<${TrackingNote} d=${d}/>
      <div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Campaign / ad set / ad</th><th>Status</th><th class="num">Spend</th><th class="num">Link clicks</th>
        <th class="num">Visitors</th><th class="num">Carts</th><th class="num">Paid</th><th class="num">CPA</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="tiny dim" style="margin-top:8px">Spend and clicks come from Meta. Visitors, carts and paid orders come from our own tracking (consenting visitors only, test and team sessions excluded); each paid order is counted once.
        ${campOnly > 0 ? ` ${campOnly} visitor(s) are matched by campaign only (no ad id in the link), so ad rows can add up to less than the campaign.` : ''}</div></div>`;
  }}/>`;
}

/* ================= Analytics ================= */
function Funnel({ t, cur }) {
  const m = money2(cur);
  const steps = [['impressions', 'Impressions (Meta)'], ['link_clicks', 'Link clicks (Meta)'], ['lpv', 'Landing page views (Meta)'], ['visitors', 'Tracked visitors (ours)'],
    ['creator', 'Opened the creator'], ['carts', 'Added to cart'], ['paid', 'Paid orders']];
  const max = Math.max(1, t.impressions || 0);
  return html`<div class="card"><h3>Cost per funnel step</h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Step</th><th class="num">Count</th><th class="num">From previous</th><th class="num">Cost each</th><th style="width:30%"></th></tr></thead><tbody>
    ${steps.map(([k, l], i) => { const v = t[k] || 0, prev = i ? t[steps[i - 1][0]] || 0 : null; return html`<tr><td>${l}</td><td class="num">${fmt.n(v)}</td>
      <td class="num dim">${prev == null ? '' : pct(ratio(v, prev))}</td><td class="num">${k === 'impressions' ? (v ? m((t.spend * 1000) / v) + ' / 1000' : '–') : v ? m(t.spend / v) : '–'}</td>
      <td><${HBar} v=${Math.log10(1 + v)} max=${Math.log10(1 + max)}/></td></tr>`; })}</tbody></table></div>
    <div class="tiny dim" style="margin-top:6px">Meta counts link clicks; we only see visitors who accepted analytics cookies, so the drop from "landing page views" to "tracked visitors" is partly consent, not leakage. Bar length is log scale.</div></div>`;
}

function Ranking({ ads, cur }) {
  const [min, setMin] = useState(DEFAULT_MIN_SPEND);
  const m = money(cur);
  const elig = ads.filter(a => (a.spend || 0) >= min);
  const sorted = [...elig].sort((a, b) => (a.cpa ?? Infinity) - (b.cpa ?? Infinity) || b.paid - a.paid);
  const best = sorted.filter(a => a.paid > 0).slice(0, 5);
  const worst = [...sorted].reverse().filter(a => !best.includes(a)).slice(0, 5);
  const warn = a => ((a.link_clicks || a.clicks) < MIN_CLICKS ? `under ${MIN_CLICKS} clicks` : !a.paid ? 'no paid order yet' : a.paid < 3 ? 'only ' + a.paid + ' sale' + (a.paid > 1 ? 's' : '') : '');
  const list = (rows, empty) => rows.length ? html`<table class="tbl"><tbody>${rows.map(a => html`<tr><td><div>${a.name || a.id}</div><div class="tiny dim">${a.id}${warn(a) ? html` · <span class="amber">${warn(a)}</span>` : ''}</div></td>
      <td class="num">${m(a.spend)}</td><td class="num">${a.paid} paid</td><td class="num"><b>${a.cpa == null ? 'no sale' : m(a.cpa)}</b></td></tr>`)}</tbody></table>` : html`<div class="small dim">${empty}</div>`;
  return html`<div class="card"><h3>Best and worst ads by CPA <span class="grow"></span>
      <label class="tiny dim row" style="gap:6px">min. spend <input class="in" type="number" min="0" style="width:90px" value=${min} onInput=${e => setMin(Number(e.target.value) || 0)}/></label></h3>
    <div class="tiny dim" style="margin-bottom:8px">${elig.length} of ${ads.length} ads spent at least ${m(min)} and are ranked. Below that, any CPA is luck.</div>
    <div class="grid g2"><div><div class="small acid" style="margin-bottom:4px">Lowest CPA</div>${list(best, 'No ranked ad has a paid order yet.')}</div>
      <div><div class="small red" style="margin-bottom:4px">Highest CPA / no sale</div>${list(worst, 'Nothing to flag.')}</div></div></div>`;
}

export function MetaAnalytics({ days } = {}) {
  return html`<${Gate} title="Meta analytics" days=${days} render=${d => {
    const t = d.totals || {}, cur = d.currency, m = money(cur);
    const notCzk = cur && cur !== 'CZK';
    const roasSub = notCzk ? `spend in ${cur}, revenue in Kč: not comparable` : 'revenue ÷ spend (list price)';
    // Shop-wide: all real paid orders from our own order table and the Finance profit (already net of Meta spend), not only utm-attributed ones.
    const s = d.shop || {}, orders = s.orders || 0;
    const blendedCpa = orders ? (t.spend || 0) / orders : null, blendedRoas = !notCzk && t.spend ? (s.revenue || 0) / t.spend : null;
    const kpis = [
      html`<${Kpi} label="Spend" v=${t.spend} f=${m} sub=${fmt.n(t.link_clicks) + ' link clicks · CPC ' + money2(cur)(t.cpc)}/>`,
      html`<${Kpi} label="Paid orders" v=${orders} sub=${'all shop orders · ' + fmt.n(t.paid) + ' tied to an ad · ' + fmt.n(t.visitors) + ' tracked visitors'} tone=${orders ? 'acid' : ''}/>`,
      html`<${Kpi} label="CPA" v=${blendedCpa} f=${m} sub=${orders ? 'spend ÷ all paid orders' : 'no paid order yet'}/>`,
      html`<${Kpi} label="Profit" v=${s.profit} f=${money('CZK')} sub=${(blendedRoas == null ? '' : 'ROAS ' + blendedRoas.toFixed(2) + '× · ') + 'from Finance, after ads'} tone=${s.profit != null && s.profit < 0 ? 'red' : 'acid'}/>`,
    ];
    const daily = (d.daily || []).map(x => ({ ...x, orders: (s.daily || []).find(y => y.day === x.day)?.orders ?? x.paid }));
    const fewClicks = (t.link_clicks || t.clicks || 0) < MIN_CLICKS, noSales = !orders;
    return html`<${TrackingNote} d=${d}/>
      ${(fewClicks || noSales) && html`<div class="card" style="border-left:3px solid var(--amber);margin-bottom:12px"><div class="small"><b class="amber">Too early to judge.</b>
        ${fewClicks ? ` Only ${fmt.n(t.link_clicks || t.clicks || 0)} link clicks so far (need ~${MIN_CLICKS}+ per ad you compare).` : ''}${noSales ? ' No paid order in this period yet, so CPA is not a real number.' : ''}</div></div>`}
      <div class="grid g4">${kpis}</div>
      <div class="grid g2" style="margin-top:12px">
        <div class="card"><h3>Spend per day</h3><${Bars} data=${daily} series=${[{ key: 'spend', label: 'spend' }]}/></div>
        <div class="card"><h3>Paid orders per day <span class="tiny dim">(all shop orders, ours)</span></h3><${Bars} data=${daily} series=${[{ key: 'orders', label: 'paid orders', cls: 'acid' }]}/></div></div>
      <div style="margin-top:12px"><${Funnel} t=${t} cur=${cur}/></div>
      <div style="margin-top:12px"><${Ranking} ads=${d.ads} cur=${cur}/></div>
      <div class="tiny dim" style="margin-top:10px">Revenue = list price of the ordered size (discounts and shipping not netted), test and team orders excluded. Paid orders, CPA and Profit are shop-wide (all real paid orders; Profit = Finance profit incl. AI cost, ad spend from Meta). Per-ad and per-campaign "Paid" still counts only orders tied to an ad. ${d.attribution}.</div>`;
  }}/>`;
}

/* ================= A/B ================= */
// Two-proportion z-test (pooled), two-sided p-value.
export function twoProp(x1, n1, x2, n2) {
  if (!n1 || !n2) return null;
  const p1 = x1 / n1, p2 = x2 / n2, p = (x1 + x2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  if (!se) return { p1, p2, z: 0, pval: 1 };
  const z = (p2 - p1) / se;
  return { p1, p2, z, pval: 2 * (1 - normCdf(Math.abs(z))) };
}
function normCdf(z) { // Abramowitz-Stegun 7.1.26
  const t = 1 / (1 + 0.3275911 * z / Math.SQRT2);
  const e = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return 0.5 * (1 + e);
}
export function verdict(A, B) {
  const ca = A.link_clicks || A.clicks || 0, cb = B.link_clicks || B.clicks || 0;
  const t = twoProp(A.paid, A.visitors, B.paid, B.visitors);
  if (ca < MIN_CLICKS || cb < MIN_CLICKS) return { k: 'too early', why: `Need ~${MIN_CLICKS} clicks per arm (A ${ca}, B ${cb}).`, t };
  if (!A.paid && !B.paid) return { k: 'too early', why: 'Neither arm has a paid order yet.', t };
  if (!t) return { k: 'too early', why: 'No tracked visitors on one arm: check utm parameters.', t };
  const lead = t.p2 > t.p1 ? 'B' : 'A';
  if (t.pval < 0.05 && A.paid + B.paid >= 10) return { k: 'clear winner', lead, why: `${lead} converts better (p = ${t.pval.toFixed(3)}).`, t };
  if (t.pval < 0.2) return { k: 'lean ' + lead, lead, why: `${lead} is ahead but this could still be chance (p = ${t.pval.toFixed(2)}). Keep running.`, t };
  return { k: 'too early', why: `No real difference yet (p = ${t.pval.toFixed(2)}).`, t };
}

function Picker({ d, value, onChange, label }) {
  const grp = (l, rows) => rows.length ? html`<optgroup label=${l}>${rows.map(r => html`<option value=${r.id}>${r.name || r.id} (${r.id})</option>`)}</optgroup>` : null;
  return html`<label class="f">${label}<select class="in" value=${value} onChange=${e => onChange(e.target.value)}><option value="">choose…</option>
    ${grp('Ads', d.ads)}${grp('Ad sets', d.adsets)}${grp('Campaigns', d.campaigns)}</select></label>`;
}

function AbResult({ a, b, days, cur }) {
  const { data, error, loading } = useLoad(() => rpc('admin_meta_ab_report', { p_a: a, p_b: b, p_days: days }), [a, b, days]);
  if (error) return html`<div class="card red">${error.message === 'META_UNKNOWN_ID' ? 'One of the ids has no Meta data in this period.' : error.message}</div>`;
  if (!data) return html`<${Skel} hgt="180"/>`;
  const [A, B] = data.arms, v = verdict(A, B), m = money(cur);
  const base = ((A.paid + B.paid) / Math.max(1, A.visitors + B.visitors)) || null;
  const need = base ? perArm(base, 0.3) : null;
  const tone = v.k === 'clear winner' ? 'acid' : v.k.startsWith('lean') ? 'amber' : 'dim';
  const rows = [['Level', x => x.lvl], ['Spend', x => m(x.spend)], ['Impressions', x => fmt.n(x.impressions)], ['Link clicks', x => fmt.n(x.link_clicks || x.clicks)],
    ['CTR', x => pct(ratio(x.clicks, x.impressions), 2)], ['Tracked visitors', x => fmt.n(x.visitors)], ['Opened creator', x => fmt.n(x.creator)], ['Carts', x => fmt.n(x.carts)],
    ['Paid orders', x => fmt.n(x.paid)], ['Paid per visitor', x => pct(ratio(x.paid, x.visitors), 2)], ['Cart per visitor', x => pct(ratio(x.carts, x.visitors))], ['CPA', x => (x.paid ? m(x.spend / x.paid) : 'no sale')]];
  return html`<div class="card" style="margin-top:12px">${loading && html`<span class="tiny dim">loading…</span>`}
    <div class="row between" style="margin-bottom:10px"><div><div class="tiny dim" style="text-transform:uppercase;letter-spacing:.06em">verdict · paid orders per visitor</div>
      <div class=${tone} style="font-size:22px;font-weight:600">${v.k}</div><div class="small">${v.why}</div>
      ${A.lvl !== B.lvl && html`<div class="small amber" style="margin-top:4px">A is ${A.lvl === 'ad' ? 'an' : 'a'} ${A.lvl}, B is ${B.lvl === 'ad' ? 'an' : 'a'} ${B.lvl}. If one contains the other, the arms share visitors and the test is meaningless; compare like with like.</div>`}</div></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th></th><th class="num">A · ${A.name || A.id}</th><th class="num">B · ${B.name || B.id}</th></tr></thead><tbody>
      ${rows.map(([l, f]) => html`<tr><td>${l}</td><td class="num">${f(A)}</td><td class="num">${f(B)}</td></tr>`)}</tbody></table></div>
    <div class="tiny dim" style="margin-top:8px">Two-proportion z-test on paid orders ÷ tracked visitors. A winner needs ${MIN_CLICKS}+ clicks per arm, at least one sale and p ${"<"} 0.05 with 10+ sales in total.
      ${need ? ` At the current rate (${pct(base, 2)}) spotting a 30% lift needs about ${fmt.n(need)} visitors per arm.` : ''}</div></div>`;
}

export function MetaAB({ days } = {}) {
  const [a, setA] = useState(''), [b, setB] = useState('');
  return html`<${Gate} title="Meta A/B testing" days=${days} render=${(d, dd) => html`
    <div class="card" style="border-left:3px solid var(--blue);margin-bottom:12px"><div class="small"><b>Run tests in Meta, read them here.</b> Create creative or audience tests with Meta's own A/B test tool (Ads Manager → Experiments) so Meta splits the audience fairly.
      This page cannot create or change tests; it compares the result that matters to us, paid orders per visitor, by ad / ad set / campaign id.</div></div>
    <div class="card"><div class="grid g2"><${Picker} d=${d} value=${a} onChange=${setA} label="Arm A"/><${Picker} d=${d} value=${b} onChange=${setB} label="Arm B"/></div>
      ${a && b && a === b && html`<div class="small amber" style="margin-top:8px">Pick two different items.</div>`}</div>
    ${a && b && a !== b ? html`<${AbResult} a=${a} b=${b} days=${dd} cur=${d.currency}/>` : html`<div class="small dim" style="margin-top:12px">Pick two ads (best: the two ads of one Meta A/B test), ad sets or campaigns.</div>`}`}/>`;
}
