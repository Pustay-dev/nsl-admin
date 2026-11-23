import { html, useState, Kpi, Bars, Heatmap, HBar, Seg, Skel, Empty, Picker, Emerald, usePeriod, useLoad } from '../ui.js';
import { lang } from '../i18n.js';
import { rpc, fmt } from '../api.js';
import { go } from '../router.js';
import { Journey, Friction, Optimise } from './cx.js';
import { CooldownReport } from './cooldown.js';
import { StyleAnalytics } from './style-analytics.js';
import { MetaAnalytics } from './meta.js';

const TABS = [['overview', 'Overview'], ['journey', 'Customer journey'], ['styles', 'Styles'], ['friction', 'Friction'], ['optimise', 'Optimise'], ['cooldown', 'Cooldown']];

// Journey / Friction / Optimise share one report (rpc admin_cx_report); Overview keeps the original production analytics.
function CxTab({ tab, days, head, device, setDevice, tabs }) {
  const { data, error, loading } = useLoad(() => rpc('admin_cx_report', { p_days: days, p_device: device || null }), [days, device]);
  const bar = html`<div class="row between" style="margin-bottom:12px;gap:8px;flex-wrap:wrap">${tabs}
    <${Seg} value=${device || ''} onChange=${v => setDevice(v || null)} options=${[{ v: '', l: 'All devices' }, { v: 'mobile', l: 'Phone' }, { v: 'desktop', l: 'Computer' }]}/></div>`;
  if (error) return html`<div class="page">${head}${bar}<div class="card red">${error.message}</div></div>`;
  if (!data) return html`<div class="page">${head}${bar}<div class="grid g4">${[1, 2, 3, 4].map(() => html`<${Skel} hgt="96"/>`)}</div></div>`;
  return html`<div class="page">${head}${bar}${tab === 'journey' ? html`<${Journey} d=${data} days=${days}/>` : tab === 'friction' ? html`<${Friction} d=${data}/>` : html`<${Optimise} d=${data} days=${days}/>`}${loading ? html`<span class="tiny dim">refreshing…</span>` : ''}</div>`;
}

const AREAS = [{ v: 'website', l: 'Website' }, { v: 'meta', l: 'Ads' }, { v: 'mail', l: 'Mail' }];
const CS = lang() === 'cs';

// One Analytics page: Website (own tracking), Ads (Meta joined to our orders), Mail (our own outbox).
// Each area opens with the plain story; the detailed reports sit in one closed "More detail" section.
export function Analytics({ area }) {
  const a = area === 'meta' || area === 'mail' ? area : 'website';
  const { days } = usePeriod();
  const head = html`<div class="head"><h1>Analytics</h1>
    <${Seg} value=${a} onChange=${v => go(v === 'website' ? 'analytics' : 'analytics/' + v)} options=${AREAS}/></div>`;
  if (a === 'meta') return html`<div class="page">${head}<${MetaAnalytics} days=${days}/></div>`;
  if (a === 'mail') return html`<div class="page">${head}<${MailStats} days=${days}/></div>`;
  return html`<div class="page">${head}<${SimpleWebsite} days=${days}/>
    <details class="more"><summary>More detail</summary><${Website} days=${days} head=${null}/></details></div>`;
}

const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
// The whole website in four steps, a daily chart and the styles people pick. Written for someone who has never seen analytics.
function SimpleWebsite({ days }) {
  const { data, error } = useLoad(() => rpc('admin_analytics', { p_days: days }), [days]);
  if (error) return html`<div class="card red">${error.message}</div>`;
  if (!data) return html`<${Skel} hgt="300"/>`;
  const F = data.funnel;
  const steps = [['sessions', 'Came to create'], ['generated', 'Made a portrait'], ['carted', 'Put it in the cart'], ['paid', 'Paid']];
  const top = [...data.styles].sort((a, b) => (b.orders - a.orders) || (b.generated - a.generated)).slice(0, 5);
  const story = CS
    ? `Za ${days === 1 ? 'poslední den' : 'posledních ' + days + ' dní'} přišlo tvořit ${fmt.n(F.sessions)} lidí. ${fmt.n(F.generated)} si udělalo portrét a ${fmt.n(F.paid)} zaplatilo. To je ${pct(F.paid, F.sessions)} % ze všech.`
    : `In the last ${days} day(s) ${fmt.n(F.sessions)} people came to create. ${fmt.n(F.generated)} made a portrait and ${fmt.n(F.paid)} paid. That is ${pct(F.paid, F.sessions)} % of everyone.`;
  return html`<p class="story">${story}</p>
    <div class="steps">${steps.map(([k, l], i) => html`<div class=${'step' + (k === 'paid' ? ' paid' : '')}>
        ${i > 0 && html`<span class="step-arrow" title="continue from the step before">${pct(F[k], F[steps[i - 1][0]])} %</span>`}
        <span class="step-l">${l}</span><b class="step-n">${k === 'paid' ? html`<${Emerald} n=${F[k] || 0}/>` : fmt.n(F[k] || 0)}</b></div>`)}</div>
    <div class="ov-main" style="margin-top:16px">
      <section class="card"><h3>Every day<span class="grow"></span><span class="legend"><span><i class="k-g"></i>portraits</span><span><i class="k-s"></i>orders</span></span></h3>
        ${data.daily.length ? html`<${Bars} data=${data.daily} series=${[{ key: 'generated', cls: 'g', label: 'portraits' }, { key: 'orders', cls: 's', label: 'orders' }]}/>` : html`<${Empty}>Nothing yet</${Empty}>`}</section>
      <section class="card"><h3>Favourite styles</h3>
        ${top.length ? html`<ul class="list">${top.map(s => html`<li><span class="grow trunc">${s.name}</span><span class="small muted">${fmt.n(s.generated)}</span><${Emerald} n=${s.orders}/></li>`)}</ul>` : html`<${Empty}>Nothing yet</${Empty}>`}</section>
    </div>`;
}

function MailStats({ days }) {
  const { data, error } = useLoad(() => rpc('admin_mail_report', { p_days: days }), [days]);
  if (error) return html`<div class="card red">${error.message}</div>`;
  if (!data) return html`<div class="grid g4">${[1, 2, 3, 4].map(() => html`<${Skel} hgt="96"/>`)}</div>`;
  const R = data.real || {}, kinds = (data.by_kind || []).filter(k => k.total);
  return html`<p class="small dim" style="margin:0 0 16px">Customer mails now go out from Shopify. These are the mails our own outbox sent in this period.</p>
    <div class="grid g4">
      <${Kpi} label="Sent" v=${R.sent || 0} sub=${'of ' + fmt.n(R.total || 0) + ' real mails'}/>
      <${Kpi} label="Waiting" v=${(R.queued || 0) + (R.leased || 0)}/>
      <${Kpi} label="Failed" v=${R.failed || 0} tone=${R.failed ? 'red' : ''}/>
      <${Kpi} label="Needs review" v=${R.needs_review || 0} tone=${R.needs_review ? 'amber' : ''}/>
    </div>
    ${kinds.length ? html`<div class="card" style="margin-top:16px;padding:0"><table class="tbl"><thead><tr><th>Mail</th><th>To</th><th class="num">Sent</th><th class="num">Failed</th><th class="num">Total</th></tr></thead><tbody>
      ${kinds.map(k => html`<tr><td>${String(k.kind).replaceAll('_', ' ')}</td><td class="dim">${k.audience}</td><td class="num">${k.sent}</td><td class=${'num ' + (k.failed ? 'red' : 'dim')}>${k.failed}</td><td class="num">${k.total}</td></tr>`)}</tbody></table></div>`
      : html`<div style="margin-top:16px"><${Empty}>No mails in this period</${Empty}></div>`}`;
}

function Website({ days, head }) {
  const [tab, setTab] = useState('overview');
  const [device, setDevice] = useState(null);
  const { data, error } = useLoad(() => (tab === 'overview' ? rpc('admin_analytics', { p_days: days }) : Promise.resolve(null)), [days, tab === 'overview']);
  const tabs = html`<div class="tabs" role="tablist" style="margin:0;border:0">${TABS.map(([k, l]) => html`<button role="tab" aria-selected=${tab === k} onClick=${() => setTab(k)}>${l}</button>`)}</div>`;
  if (tab === 'styles') return html`<div class="page">${head}<div style="margin-bottom:12px">${tabs}</div><${StyleAnalytics} days=${days}/></div>`;
  if (tab === 'cooldown') return html`<div class="page">${head}<div style="margin-bottom:12px">${tabs}</div><${CooldownReport} days=${days}/></div>`;
  if (tab !== 'overview') return html`<${CxTab} tab=${tab} days=${days} head=${head} device=${device} setDevice=${setDevice} tabs=${tabs}/>`;
  if (error) return html`<div class="page">${head}${tabs}<div class="card red">${error.message}</div></div>`;
  if (!data) return html`<div class="page">${head}${tabs}<div class="grid g4">${[1, 2, 3, 4].map(() => html`<${Skel} hgt="96"/>`)}</div></div>`;
  const F = data.funnel, sum = k => data.daily.reduce((a, d) => a + (d[k] || 0), 0);
  const gen = sum('generated'), fail = sum('failed');
  const steps = [['sessions', 'Visited creator'], ['uploaded', 'Uploaded photos'], ['generated', 'Got a portrait'], ['multi', 'Tried 2+ portraits'], ['carted', 'Added to cart'], ['contact', 'Left email'], ['paid', 'Paid']];
  const smax = Math.max(1, ...data.styles.map(s => s.generated));
  const aud = Object.entries(data.audiences).sort((a, b) => b[1] - a[1]), amax = Math.max(1, ...aud.map(a => a[1]));

  return html`<div class="page">${head}<div style="margin-bottom:12px">${tabs}</div>
    <div class="grid g4">
      <${Kpi} label="Portraits" v=${gen} sub=${fmt.pct(gen, gen + fail) + ' success · ' + fail + ' failed'}/>
      <${Kpi} label="Visit → portrait" v=${F.sessions ? Math.round((F.generated / F.sessions) * 100) : 0} f=${v => v + '%'} sub=${F.generated + ' of ' + F.sessions + ' sessions'}/>
      <${Kpi} label="Latency p50 / p90" v=${data.latency?.p50 ? Math.round(data.latency.p50) : null} f=${v => v + 's'} sub=${'p90 ' + fmt.secs(data.latency?.p90)}/>
      <${Kpi} label="Est. AI spend" v=${data.spend_estimate_usd ?? null} f=${v => fmt.usd(v)} sub=${'≈ ' + fmt.czk(data.spend_estimate_czk) + ' · $' + Number(data.cost_per_generation_usd || 0).toFixed(4) + ' per portrait request (System → calibrate)'}/>
    </div>
    <div class="card" style="margin-top:12px"><h3>Daily activity <span class="grow"></span><span class="legend"><span><i class="k-g"></i>portraits</span><span><i class="k-f"></i>failed</span><span><i class="k-s"></i>orders</span></span></h3>
      <${Bars} data=${data.daily} series=${[{ key: 'generated', cls: 'g', label: 'portraits' }, { key: 'failed', cls: 'f', label: 'failed' }, { key: 'orders', cls: 's', label: 'orders' }]}/></div>
    <div class="grid g2" style="margin-top:12px">
      <div class="card"><h3>Funnel</h3>
        <div class="col" style="gap:10px">${steps.map(([k, l], i) => html`<div><div class="row between small"><span>${l}</span><span><b>${F[k]}</b> <span class="dim tiny">${i ? fmt.pct(F[k], F.sessions) : ''}</span></span></div><${HBar} v=${F[k]} max=${F.sessions}/></div>`)}</div></div>
      <div class="card"><h3>When people create</h3><${Heatmap} cells=${data.heatmap}/>
        <h3 style="margin-top:14px">Audience mix</h3>
        <div class="col" style="gap:8px">${aud.map(([a, n]) => html`<div class="row"><span style="width:80px" class="small">${a}</span><div class="grow"><${HBar} v=${n} max=${amax}/></div><span class="tiny" style="width:34px;text-align:right">${n}</span></div>`)}</div></div>
    </div>
    <div class="grid g3" style="margin-top:12px">
      <div class="card span2" style="padding:0;overflow:auto"><h3 style="padding:14px 16px 0">Style leaderboard</h3>
        ${data.styles.length ? html`<table class="tbl"><thead><tr><th>Style</th><th></th><th class="num">Portraits</th><th class="num">Sessions</th><th class="num">Fail</th><th class="num">Orders</th><th class="num">Avg</th></tr></thead><tbody>
        ${data.styles.map(s => html`<tr class="click" onClick=${() => go('styles/' + s.style)}><td><b>${s.name}</b><div class="tiny dim">${s.collection}</div></td><td style="width:30%"><${HBar} v=${s.generated} max=${smax}/></td>
          <td class="num">${s.generated}</td><td class="num">${s.sessions}</td><td class=${'num ' + (s.failed ? 'red' : 'dim')}>${s.failed}</td><td class="num">${s.orders ? html`<span class="acid">${s.orders}</span>` : '–'}</td><td class="num tiny">${fmt.secs(s.avg_seconds)}</td></tr>`)}</tbody></table>` : html`<div style="padding:16px"><${Empty}>No generations in range.</${Empty}></div>`}</div>
      <div class="col">
        <div class="card"><h3>Subjects per portrait</h3>${Object.entries(data.subjects).sort().map(([k, n]) => html`<div class="row between small"><span>${k === '0' ? 'auto-detect' : k + ' subject(s)'}</span><b>${n}</b></div>`)}</div>
        <div class="card"><h3>Errors</h3>${data.errors.length ? data.errors.map(e => html`<div class="row between small"><span class="red trunc">${e.code}</span><b>${e.n}</b></div>`) : html`<span class="acid small">none</span>`}</div>
        <div class="card"><h3>Finance log</h3>${data.finance.length ? data.finance.slice(-6).map(f => html`<div class="row between tiny"><span>${f.day}</span><span>${fmt.czk(f.revenue)} rev · ${fmt.czk(f.ads)} ads</span></div>`) : html`<span class="dim small">Finance is automatic now: see System → Finance.</span>`}</div>
      </div>
    </div>
  </div>`;
}
