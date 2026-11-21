import { html, useState, useEffect, useRef, Icon, Pill, Kpi, Bars, HBar, Seg, Skel, Empty, confirm, useLoad } from '../ui.js';
import { rpc, fn, fmt } from '../api.js';
import { toast, useStore } from '../store.js';
import { go } from '../router.js';

const SEV = { high: 0, medium: 1, opportunity: 2, info: 3 };
const SEV_LABEL = { high: 'fix now', medium: 'worth fixing', opportunity: 'opportunity', info: 'setup' };
const st = s => (s === 'ACTIVE' ? 'live' : s === 'PAUSED' ? 'hidden' : 'review');
const sum = (a, k) => a.reduce((t, x) => t + (Number(x[k]) || 0), 0);
const div = (a, b) => (b ? a / b : null);
const pct = v => (v == null ? '–' : (v * 100).toFixed(v < 0.1 ? 2 : 1) + '%');
const x = v => (v == null ? '–' : v.toFixed(2) + '×');

function Setup({ data, owner, reload }) {
  const [acct, setAcct] = useState('');
  const save = async () => { try { await rpc('admin_setting_set', { p_key: 'meta_account_id', p_value: acct.trim() }); toast('Ad account saved'); reload(true); } catch (e) { toast(e.message === 'INVALID_ACCOUNT_ID' ? 'Use the numeric ad account ID (Ads Manager → Account overview).' : e.message, 'err', 6000); } };
  return html`<div class="card" style="border-color:var(--acid)"><h3>Connect Meta Ads</h3>
    <div class="col" style="gap:12px">
      <div class="small"><b class="acid">1</b> &nbsp;Your ad account ID <span class="dim">(numbers only, e.g. 1234567890)</span></div>
      ${data.configured ? html`<div class="small">Saved: <b class="acid">act_${data.account_id}</b></div>` : owner ? html`<div class="row"><input class="in" placeholder="ad account id" value=${acct} onInput=${e => setAcct(e.target.value)}/><button class="btn primary" disabled=${!acct.trim()} onClick=${save}>Save</button></div>` : html`<div class="amber small">An owner has to enter it.</div>`}
      <div class="small"><b class="acid">2</b> &nbsp;Token: in Supabase → <b>Edge Functions → Secrets</b> add <code>META_ACCESS_TOKEN</code> = your System User token (permissions <code>ads_read</code>; add <code>ads_management</code> only if you want the Apply buttons to work). The token never touches this page or the repository.</div>
      <div class="small"><b class="acid">3</b> &nbsp;Press <b>Sync</b>. The page then refreshes itself whenever you open it and the data is older than 4 hours.</div>
    </div></div>`;
}

function Suggestion({ s, owner, onApply, hide }) {
  const a = s.action;
  const tone = s.severity === 'high' ? 'var(--red)' : s.severity === 'opportunity' ? 'var(--acid)' : s.severity === 'medium' ? 'var(--amber)' : 'var(--line2)';
  return html`<div class="card reveal" style=${'border-left:3px solid ' + tone}>
    <div class="row between" style="gap:10px;align-items:flex-start"><div class="grow"><div class="tiny dim" style="text-transform:uppercase;letter-spacing:.06em">${SEV_LABEL[s.severity] || s.severity}</div>
      <b>${s.title}</b><div class="muted small" style="margin-top:4px">${s.why}</div></div>
      <div class="row" style="flex-shrink:0">${a && (owner ? html`<button class="btn primary sm" onClick=${() => onApply(a, s)}><${Icon} n="bolt" s="13"/>${a.label}</button>` : html`<span class="tiny dim">owner applies</span>`)}
        ${!a && (s.kind === 'funnel') && html`<button class="btn sm" onClick=${() => go('analytics')}>Open analytics</button>`}
        <button class="btn ghost sm" aria-label="hide" title="Hide for this session" onClick=${() => hide(s.id)}><${Icon} n="x" s="13"/></button></div></div></div>`;
}

function Tree({ objects, owner, onToggle, onBudget }) {
  const [open, setOpen] = useState(() => new Set());
  const camps = objects.filter(o => o.level === 'campaign');
  const sets = p => objects.filter(o => o.level === 'adset' && o.parent === p);
  const ads = p => objects.filter(o => o.level === 'ad' && o.parent === p);
  const flip = id => setOpen(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const row = (o, depth, kids) => html`<tr class=${kids ? 'click' : ''} onClick=${() => kids && flip(o.id)}>
    <td style=${'padding-left:' + (10 + depth * 18) + 'px'}><div class="row" style="gap:8px">${o.thumb && html`<img src=${o.thumb} alt="" width="28" height="28" style="border-radius:4px;object-fit:cover" loading="lazy" referrerpolicy="no-referrer"/>`}
      <span class="trunc" style="max-width:260px"><b>${kids ? (open.has(o.id) ? '▾ ' : '▸ ') : ''}${o.name || o.id}</b><div class="tiny dim">${o.level}${o.freq ? ' · freq ' + Number(o.freq).toFixed(1) : ''}</div></span></div></td>
    <td><${Pill} s=${st(o.status)} label=${(o.eff || o.status || '').toLowerCase().replace(/_/g, ' ')}/></td>
    <td class="num">${o.budget != null ? fmt.czk(o.budget) : '–'}</td>
    <td class="num">${fmt.czk(o.spend)}</td><td class="num">${pct(div(o.clicks, o.impr))}</td><td class="num">${fmt.n(o.clicks)}</td>
    <td class="num">${o.purchases ? Math.round(o.purchases) : '–'}</td><td class="num">${o.purchases ? fmt.czk(o.spend / o.purchases) : '–'}</td><td class="num">${o.spend && o.value ? x(o.value / o.spend) : '–'}</td>
    <td class="num" onClick=${e => e.stopPropagation()}>${owner && html`<div class="row" style="justify-content:flex-end;gap:4px">
      ${o.budget != null && html`<button class="btn ghost sm" title="Change daily budget" onClick=${() => onBudget(o)}>Kč</button>`}
      <button class="btn ghost sm" onClick=${() => onToggle(o)}>${o.status === 'ACTIVE' ? 'Pause' : 'Resume'}</button></div>`}</td></tr>`;
  const out = [];
  for (const c of camps) {
    out.push(row(c, 0, sets(c.id).length));
    if (open.has(c.id)) for (const s of sets(c.id)) { out.push(row(s, 1, ads(s.id).length)); if (open.has(s.id)) for (const a of ads(s.id)) out.push(row(a, 2, 0)); }
  }
  return html`<table class="tbl"><thead><tr><th>Campaign › ad set › ad</th><th>Status</th><th class="num">Budget/day</th><th class="num">Spend</th><th class="num">CTR</th><th class="num">Clicks</th><th class="num">Purch.</th><th class="num">CPA</th><th class="num">ROAS</th><th></th></tr></thead><tbody>${out}</tbody></table>`;
}

function Settings({ data, reload }) {
  const S = data.settings; const [v, setV] = useState({});
  const fields = [['meta_target_cpa_czk', 'Target cost per purchase (Kč)', S.target_cpa, 'From your margin per print. Drives pause / cut / scale rules.'], ['meta_break_even_roas', 'Break-even ROAS (×)', S.break_even_roas, 'Revenue ÷ ad spend where you stop losing money.'], ['meta_max_daily_budget_czk', 'Max daily budget per ad set (Kč)', S.max_daily_budget, 'Ceiling for one-click scale-ups. Empty = scale-ups disabled.']];
  const save = async k => { try { await rpc('admin_setting_set', { p_key: k, p_value: v[k] === '' ? null : v[k] }); toast('Saved'); setV(s => { const n = { ...s }; delete n[k]; return n; }); reload(true); } catch (e) { toast(e.message, 'err', 5000); } };
  return html`<div class="card"><h3>Guard-rails</h3><div class="col" style="gap:12px">${fields.map(([k, l, cur, hint]) => html`<label class="f">${l} <span class="hint">${hint}</span>
    <div class="row"><input class="in" type="number" step="any" placeholder="not set" value=${v[k] ?? (cur ?? '')} onInput=${e => setV({ ...v, [k]: e.target.value })}/>${v[k] !== undefined && html`<button class="btn primary" onClick=${() => save(k)}>Save</button>`}</div></label>`)}
    <div class="tiny dim">One-click changes are limited to ±30 % budget per step, never above the ceiling, owner-only, and written to the audit log.</div></div></div>`;
}

export function Growth() {
  const role = useStore(s => s.role); const owner = role === 'owner';
  const [days, setDays] = useState(30);
  const [hidden, setHidden] = useState(() => new Set());
  const [syncing, setSyncing] = useState(false);
  const auto = useRef(false);
  const { data, error, loading, reload } = useLoad(() => rpc('admin_growth', { p_days: days }), [days]);

  const sync = async (manual) => {
    if (syncing) return; setSyncing(true);
    try { const r = await fn('meta-sync', { action: 'sync', force: !!manual }); if (manual) toast(r.skipped ? 'Already fresh' : `Synced ${r.rows} rows`); await reload(true); }
    catch (e) { if (manual) toast(e.message, 'err', 8000); await reload(true); }
    finally { setSyncing(false); }
  };
  useEffect(() => {
    if (!data || auto.current || role === 'viewer' || !data.configured) return;
    const age = data.last_sync?.at ? Date.now() - new Date(data.last_sync.at).getTime() : Infinity;
    if (age > 4 * 3600 * 1000 && data.last_sync?.ok !== false) { auto.current = true; sync(false); } else auto.current = true;
  }, [data?.configured]);

  const apply = async (a, s) => {
    const what = a.op === 'budget' ? `Daily budget ${fmt.czk(a.from)} → ${fmt.czk(a.to)}` : a.op === 'pause' ? 'Status → PAUSED (stops spending immediately)' : 'Status → ACTIVE';
    if (!(await confirm({ title: a.label + ': ' + (a.name || a.object_id), body: `${what}. This changes the live ad account right now. Reason: ${s.why}`, ok: 'Apply on Meta' }))) return;
    try { await fn('meta-sync', { action: 'apply', object_id: a.object_id, op: a.op, value: a.to, reason: s.id }); toast('Applied on Meta'); await reload(true); } catch (e) { toast(e.message, 'err', 8000); }
  };
  const toggle = o => apply({ op: o.status === 'ACTIVE' ? 'pause' : 'resume', object_id: o.id, name: o.name, label: o.status === 'ACTIVE' ? 'Pause' : 'Resume' }, { id: 'manual', why: 'manual change from the Growth table' });
  const budget = async o => {
    const r = await confirm({ title: 'Daily budget: ' + (o.name || o.id), body: `Currently ${fmt.czk(o.budget)}. Steps over ±30 % are refused; raises must stay under your max budget.`, ok: 'Apply on Meta', input: 'New daily budget (Kč)' });
    if (!r) return; const to = Number(String(r.value).replace(',', '.'));
    if (!(to > 0)) return toast('Enter a number', 'err');
    try { await fn('meta-sync', { action: 'apply', object_id: o.id, op: 'budget', value: to, reason: 'manual' }); toast('Budget updated on Meta'); await reload(true); } catch (e) { toast(e.message, 'err', 8000); }
  };

  const head = html`<div class="head"><div class="grow"><h1>Growth</h1></div>
    ${(loading || syncing) && html`<span class="tiny dim">${syncing ? 'syncing Meta…' : 'computing…'}</span>`}
    ${data?.configured && role !== 'viewer' && html`<button class="btn" disabled=${syncing} onClick=${() => sync(true)}><${Icon} n="refresh" s="14"/>Sync</button>`}
    <${Seg} value=${days} onChange=${setDays} options=${[{ v: 7, l: '7d' }, { v: 14, l: '14d' }, { v: 30, l: '30d' }, { v: 90, l: '90d' }]}/></div>`;
  if (error) return html`<div class="page">${head}<div class="card red">${error.message}</div></div>`;
  if (!data) return html`<div class="page">${head}<div class="grid g4">${[1, 2, 3, 4].map(() => html`<${Skel} hgt="96"/>`)}</div></div>`;
  if (!data.configured) return html`<div class="page">${head}<${Setup} data=${data} owner=${owner} reload=${reload}/></div>`;

  const D = data.daily, spend = sum(D, 'spend'), orders = sum(D, 'orders'), revenue = sum(D, 'revenue'), clicks = sum(D, 'link_clicks'), pur = sum(D, 'purchases');
  const camps = data.objects.filter(o => o.level === 'campaign'), mvalue = sum(camps, 'value'), impr = sum(camps, 'impr'), lpv = sum(camps, 'lpv'), atc = sum(camps, 'atc');
  const mer = div(revenue, spend), be = data.settings.break_even_roas;
  const sug = data.insights.filter(s => !hidden.has(s.id)).sort((a, b) => (SEV[a.severity] ?? 9) - (SEV[b.severity] ?? 9));
  const err = data.last_sync && !data.last_sync.ok ? data.last_sync.detail?.code : null;
  const F = data.shop;
  const funnel = [['Paid link clicks', clicks], ['Landing page views (Meta)', lpv], ['Creator sessions (all sources)', F.sessions], ['Got a portrait', F.generated], ['Added to cart', F.carted], ['Orders', F.orders]];

  return html`<div class="page">${head}
    ${err && html`<div class="card" style="border-color:var(--red);margin-bottom:12px"><b class="red">Last sync failed: ${err}</b><div class="muted small">${err === 'META_TOKEN_MISSING' ? 'Add META_ACCESS_TOKEN under Supabase → Edge Functions → Secrets.' : err === 'META_TOKEN_INVALID' ? 'The token is expired or revoked: create a new System User token and replace the secret.' : err === 'META_PERMISSION_DENIED' ? 'The token cannot read this ad account (needs ads_read and the account assigned to the System User).' : 'Try Sync again in a minute.'}</div></div>`}
    ${!data.have_data && !err && html`<div class="card" style="margin-bottom:12px"><b>No Meta data yet.</b><div class="muted small">Press Sync to import the last 30 days.</div></div>`}
    <div class="grid g4">
      <${Kpi} i=${0} label="Ad spend" v=${spend} f=${fmt.czk} sub=${fmt.n(impr) + ' impressions · ' + fmt.n(clicks) + ' link clicks'}/>
      <${Kpi} i=${1} label="Meta purchases" v=${Math.round(pur)} sub=${pur ? 'CPA ' + fmt.czk(spend / pur) : 'no purchase events reported'}/>
      <${Kpi} i=${2} label="Blended ROAS (shop)" v=${mer == null ? null : Math.round(mer * 100) / 100} f=${v => v.toFixed(2) + '×'} tone=${be && mer != null ? (mer >= be ? 'acid' : 'red') : ''} sub=${fmt.czk(revenue) + ' revenue · ' + orders + ' orders' + (be ? ' · break-even ' + be + '×' : '')}/>
      <${Kpi} i=${3} label="Cost per shop order" v=${orders ? Math.round(spend / orders) : null} f=${fmt.czk} sub=${F.sessions ? fmt.czk(spend / F.sessions) + ' per creator session' : ''}/>
    </div>
    <div class="head" style="margin:18px 0 8px"><h3 style="margin:0">Suggestions</h3><span class="tiny dim">${sug.length} · rules use the last 7 days, you confirm every change</span></div>
    <div class="col" style="gap:8px">${sug.length ? sug.map(s => html`<${Suggestion} s=${s} owner=${owner} onApply=${apply} hide=${id => setHidden(h => new Set(h).add(id))}/>`) : html`<div class="card"><span class="acid">Nothing to change right now.</span> <span class="muted small">Rules check wasted spend, cost per purchase, winners, fatigue, weak ads, tracking and funnel leaks.</span></div>`}</div>
    <div class="grid g2" style="margin-top:12px">
      <div class="card"><h3>Spend per day <span class="grow"></span><span class="tiny dim">Kč</span></h3><${Bars} data=${D} series=${[{ key: 'spend', label: 'spend' }]}/></div>
      <div class="card"><h3>Orders vs Meta purchases <span class="grow"></span><span class="legend"><span><i style="background:var(--blue)"></i>shop orders</span><span><i style="background:var(--acid)"></i>Meta purchases</span></span></h3><${Bars} data=${D} series=${[{ key: 'orders', cls: 's', label: 'orders' }, { key: 'purchases', label: 'Meta purchases' }]}/></div>
    </div>
    <div class="grid g2" style="margin-top:12px">
      <div class="card"><h3>Paid traffic → order</h3><div class="col" style="gap:10px">${funnel.map(([l, n], i) => html`<div><div class="row between small"><span>${l}</span><b>${fmt.n(Math.round(n))}</b></div><${HBar} v=${n} max=${Math.max(1, ...funnel.map(f => f[1]))}/></div>`)}
        <div class="tiny dim">Sessions include organic visits. To attribute orders to campaigns exactly, the shop must capture the ad source (UTM / fbclid) on each session; until then compare ad spend with total orders (blended).</div></div></div>
      <${Settings} data=${data} reload=${reload}/>
    </div>
    <div class="card" style="margin-top:12px;padding:0;overflow:auto"><h3 style="padding:14px 16px 0">Campaigns <span class="tiny dim">· last ${days} days · click a row to expand</span></h3>
      ${camps.length ? html`<${Tree} objects=${data.objects} owner=${owner} onToggle=${toggle} onBudget=${budget}/>` : html`<div style="padding:16px"><${Empty}>No campaigns synced yet.</${Empty}></div>`}</div>
    <div class="card" style="margin-top:12px"><h3>Changes made from here</h3>${data.actions.length ? data.actions.map(a => html`<div class="row between tiny" style="padding:3px 0"><span class=${a.ok ? '' : 'red'}>${a.ok ? '✓' : '✗'} ${a.op} ${a.level} ${a.object_id}${a.op === 'budget' ? ' → ' + fmt.czk(a.after?.to) : ''}</span><span class="dim">${a.actor} · ${fmt.ago(a.at)}</span></div>`) : html`<span class="dim small">Nothing applied yet.</span>`}</div>
    <div class="tiny dim" style="margin-top:10px">Last sync: ${data.last_sync ? fmt.ago(data.last_sync.at) + ' ago' + (data.last_sync.ok ? '' : ' (failed)') : 'never'} · account act_${data.account_id}${data.currency ? ' · ' + data.currency : ''}${data.currency && data.currency !== 'CZK' ? ' · amounts are shown as Kč but the account currency differs' : ''}</div>
  </div>`;
}
