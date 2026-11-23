// Overview = today. First what needs a person (orders to check, stuck jobs, generation off), then the few numbers that matter.
// Fixed layout on purpose: no per-user widget board. Data: admin_overview (15 s), admin_orders, admin_analytics, admin_finance_summary, admin_ab_list.
import { html, Kpi, Bars, Pill, Icon, Switch, Empty, SImg, confirm, useRpc, Wait, forgetRpc, usePeriod } from '../ui.js';
import { windowTotals } from './finance.js';
import { rpc, fmt } from '../api.js';
import { toast, useStore } from '../store.js';
import { go } from '../router.js';
import { lang } from '../i18n.js';
const CZ = lang() === 'cs';

function NeedsYou() {
  const ov = useRpc('admin_overview', {}, 15000);
  const orders = useRpc('admin_orders', { p_filter: 'live' }, 30000);
  return html`<${Wait} r=${ov} h=${160}>${d => {
    const k = d.kpi, q = d.queue, list = orders.data || [];
    const qc = list.filter(o => o.production === 'awaiting_qc').length;
    const rows = [
      !q.generation_enabled && { tone: 'red', n: null, t: 'Paid generation is off. Customers cannot create portraits', to: 'system' },
      qc && { tone: 'accent', n: qc, t: 'Orders waiting for quality control', to: 'orders' },
      q.orders_blocked && { tone: 'red', n: q.orders_blocked, t: 'Paid items blocked in production', to: 'orders' },
      q.needs_review && { tone: 'amber', n: q.needs_review, t: 'Generation jobs to review', to: 'system' },
      q.factory_review && { tone: 'amber', n: q.factory_review, t: 'New styles to review', to: 'styles' },
      k.failed_7d && { tone: 'amber', n: k.failed_7d, t: 'Failed portraits, last 7 days', to: 'analytics' },
    ].filter(Boolean);
    return html`<section class="card needs" aria-label="Needs you"><h3>Needs you</h3>
      ${rows.length ? html`<ul class="todo">${rows.map(r => html`<li><button type="button" onClick=${() => go(r.to)}>
          <span class=${'dot ' + r.tone}></span><span class="grow">${r.t}</span>${r.n != null && html`<span class="mono">${r.n}</span>`}<${Icon} n="chevr"/></button></li>`)}</ul>`
        : html`<p class="calm">Nothing needs you right now</p>`}
    </section>`;
  }}</${Wait}>`;
}

function Engine() {
  const role = useStore(s => s.role);
  const r = useRpc('admin_overview', {}, 15000);
  const ab = useRpc('admin_ab_list', {}, 120000);
  const flip = async on => {
    if (!on && !(await confirm({ title: 'Stop all generation?', body: 'Customers will not be able to create portraits until you switch it back on. In-flight jobs finish.', ok: 'Stop generation', danger: true, type: 'STOP' }))) return;
    try { await rpc('admin_generation_switch', { p_enabled: on }); toast(on ? 'Generation enabled' : 'Generation stopped', on ? 'ok' : 'warn'); forgetRpc('admin_overview'); r.reload(true); } catch (e) { toast(e.message, 'err'); }
  };
  const test = (ab.data || []).find(e => e.status === 'running');
  return html`<${Wait} r=${r} h=${160}>${d => { const q = d.queue; return html`<section class="card" aria-label="Engine"><h3>Engine</h3>
    <dl class="facts">
      <div><dt>Paid generation</dt><dd>${role === 'owner' ? html`<${Switch} on=${q.generation_enabled} onChange=${flip} label="Paid generation"/>` : html`<${Pill} s=${q.generation_enabled ? 'live' : 'failed'} label=${q.generation_enabled ? 'on' : 'off'}/>`}</dd></div>
      <div><dt>Queue</dt><dd>${q.queued} queued · ${q.running} running</dd></div>
      <div><dt>Model</dt><dd class="trunc">${q.model || '–'}</dd></div>
      <div><dt>A/B test</dt><dd>${test ? html`<a href=${'#/experiments/' + test.id} class="trunc">${test.name}</a>` : html`<span class="dim">none running</span>`}</dd></div>
    </dl></section>`; }}</${Wait}>`;
}

function Numbers() {
  const P = usePeriod();
  const an = useRpc('admin_analytics', { p_days: P.days }, 60000);
  const fin = useRpc('admin_finance_summary', {}, 120000);
  const ord = useRpc('admin_orders', { p_filter: 'live' }, 30000);
  const T = fin.data ? windowTotals(fin.data, P.days) : null;
  const paid = ord.data ? new Set(ord.data.filter(o => o.payment === 'paid' && P.inWindow(o.at)).map(o => o.shopify_order_id || o.id)).size : null;
  const cpo = T && T.orders && T.ads ? T.ads / T.orders : null; // ad money per paid order
  return html`<div class="grid g4 stats">
    <${Kpi} label="Paid orders" v=${paid} sub=${P.label}/>
    <${Kpi} label="Revenue" v=${T?.revenue ?? null} f=${fmt.czk} sub=${T ? (CZ ? 'zisk ' : 'profit ') + fmt.czk(T.profit) : ''}/>
    <${Kpi} label="Ads per order" v=${cpo} f=${fmt.czk} sub=${T ? (CZ ? 'reklamy ' : 'ads ') + fmt.czk(T.ads || 0) : ''}/>
    <${Kpi} label="AI spend" v=${an.data?.spend_estimate_usd ?? null} f=${fmt.usd} sub=${an.data ? '≈ ' + fmt.czk(an.data.spend_estimate_czk) : ''}/>
  </div>`;
}

function PaidChart() {
  const P = usePeriod();
  const r = useRpc('admin_analytics', { p_days: P.days }, 60000);
  return html`<${Wait} r=${r} h=${220}>${d => html`<section class="card" aria-label="Paid orders per day"><h3>Paid orders per day<span class="grow"></span><span class="small muted">${P.label}</span></h3>
    ${d.daily.some(x => x.orders) ? html`<${Bars} data=${d.daily} series=${[{ key: 'orders', cls: 's', label: 'orders' }]}/>` : html`<${Empty}>Nothing in this period</${Empty}>`}</section>`}</${Wait}>`;
}

const shortNo = o => { const m = /(\d+)/.exec(o.order_name || ''); return m ? String(Number(m[1]) % 1000).padStart(3, '0') : '…' + String(o.shopify_order_id || '').slice(-4); };
function RecentOrders() {
  const P = usePeriod();
  const r = useRpc('admin_orders', { p_filter: 'live' }, 30000);
  return html`<${Wait} r=${r} h=${120}>${all => { const d = all.filter(o => P.inWindow(o.at)); return html`<section class="card" aria-label="Recent orders"><h3>Recent orders<span class="grow"></span><span class="small muted">${P.label}</span><a class="small" href="#/orders" style="margin-left:12px">All orders</a></h3>
    ${d.length ? html`<div class="fresh">${d.slice(0, 12).map(o => html`<a class="fresh-o" href=${'#/customers/' + o.session}>
        <span class="fresh-img">${o.thumb && html`<${SImg} path=${o.thumb}/>`}</span>
        <span class="fresh-t"><b class="mono">${shortNo(o)}</b><span class="tiny dim">${fmt.ago(o.at)}</span></span></a>`)}</div>`
      : html`<${Empty}>Nothing in this period</${Empty}>`}</section>`; }}</${Wait}>`;
}
/* ---------- Saint Business: the one thing to do today ----------
   Reads the newest note of the daily Claude task (admin_advice_latest, migration 20261123140000). Until that runs,
   it works the tip out here from the same numbers with a few plain rules, and says so. */
const plural = (n, one, few, many) => n + ' ' + (n === 1 ? one : n >= 2 && n <= 4 ? few : many);
function ruleAdvice(ov, an, meta) {
  const q = ov.queue, F = an.funnel, kc = fmt.czk;
  if (!q.generation_enabled) return { headline: 'Zapni generování. Továrna stojí', action: 'Systém → Motor → Placené generování. Zákazníci si teď nemůžou udělat portrét.', facts: [], quip: 'Bez portrétů není co balit pod stromeček.', area: 'orders' };
  if (q.orders_blocked) return { headline: 'Odblokuj zaseklé objednávky', action: 'Otevři Objednávky, filtr „zaseklé“, a vyřeš důvod u každé.', facts: [{ label: 'Zaseklé', value: q.orders_blocked }], quip: 'Zaplaceno je. Teď to ještě poslat.', area: 'orders' };
  const t = meta?.connected ? meta.totals || {} : null;
  if (t && (t.spend || 0) >= 300 && !(t.paid || 0)) {
    const worst = [...(meta.ads || [])].filter(a => !a.paid).sort((a, b) => (b.spend || 0) - (a.spend || 0))[0];
    return { headline: worst ? 'Vypni reklamu „' + (worst.name || worst.id) + '“' : 'Reklamy pálí peníze bez objednávek',
      action: worst ? 'Za 3 dny utratila ' + kc(worst.spend) + ' a nepřinesla ani jednu objednávku. Pozastav ji v Ads Manageru a peníze dej reklamě, která prodává.' : 'Za 3 dny šlo do reklam ' + kc(t.spend) + ' a nepřišla objednávka. Zkontroluj cílení a odkazy.',
      facts: [{ label: 'Utraceno za 3 dny', value: kc(t.spend) }, { label: 'Kliknutí', value: fmt.n(t.link_clicks || t.clicks || 0) }, { label: 'Objednávky', value: '0' }],
      quip: 'Peníze nejsou konfety. Aspoň ne do Vánoc.', area: 'ads' };
  }
  const steps = [
    { r: F.sessions ? F.generated / F.sessions : 1, b: 0.5, headline: 'Lidi přijdou, ale portrét si neudělají', action: 'Zjednoduš první krok tvůrce: větší tlačítko na nahrání fotky a jedna věta, co dostanou.', area: 'website', label: 'Udělali portrét' },
    { r: F.generated ? F.carted / F.generated : 1, b: 0.25, headline: 'Portréty se líbí, ale nekupují se', action: 'Ukaž cenu a velikosti hned u náhledu a přidej jednu větu o dárku do Vánoc.', area: 'website', label: 'Dali do košíku' },
    { r: F.carted ? F.paid / F.carted : 1, b: 0.4, headline: 'Košík je plný, platba ne', action: 'Projdi pokladnu na mobilu sám a odstraň, co zdržuje: dopravu, pole navíc, překvapení v ceně.', area: 'website', label: 'Zaplatili' },
  ].map(s => ({ ...s, gap: s.r / s.b }));
  const worst = steps.sort((a, b) => a.gap - b.gap)[0];
  if (F.sessions >= 20 && worst.gap < 1) return { headline: worst.headline, action: worst.action, area: worst.area,
    facts: [{ label: 'Přišli za 7 dní', value: fmt.n(F.sessions) }, { label: worst.label, value: Math.round(worst.r * 100) + ' %' }, { label: 'Zaplatili', value: fmt.n(F.paid) }],
    quip: 'Jeden únik zalepíš rychleji než celou loď.' };
  if (F.sessions < 20) return { headline: 'Přiveď víc lidí, jinak nevíme nic', action: 'Za 7 dní přišlo jen ' + plural(F.sessions, 'člověk', 'lidi', 'lidí') + '. Pusť malou reklamu na nejprodávanější styl.', facts: [{ label: 'Přišli za 7 dní', value: fmt.n(F.sessions) }], quip: 'I svatý potřebuje publikum.', area: 'ads' };
  return { headline: 'Jede to. Přidej na tom, co prodává', action: 'Zvedni rozpočet o 20 % u reklamy s nejlevnější objednávkou a nic dalšího neměň.', facts: [{ label: 'Zaplatili za 7 dní', value: fmt.n(F.paid) }], quip: 'Když to funguje, nesahej na to. Jen přilej.', area: 'ads' };
}

function SaintBusiness() {
  const ai = useRpc('admin_advice_latest', {}, 300000);
  const ov = useRpc('admin_overview', {}, 15000);
  const an = useRpc('admin_analytics', { p_days: 7 }, 300000);
  const meta = useRpc('admin_meta_report', { p_days: 3 }, 300000);
  const fromAi = ai.data && ai.data.headline;
  const n = fromAi ? ai.data : ov.data && an.data ? ruleAdvice(ov.data, an.data, meta.data) : null;
  const when = fromAi ? new Date(ai.data.created_at).toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' }) : new Date().toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' });
  return html`<header class="saint" aria-label="Saint Business">
    <div class="saint-light" aria-hidden="true"></div><div class="saint-rays" aria-hidden="true"></div>
    <div class="saint-in">
      <div class="saint-halo" aria-hidden="true"></div>
      <span class="saint-kicker">Svatý Business radí · ${when}</span>
      ${n ? html`<h2 class="saint-h">${n.headline}</h2>
        <p class="saint-act">${n.action}</p>
        ${(n.facts || []).length > 0 && html`<div class="saint-facts">${n.facts.slice(0, 3).map(f => html`<span><small>${f.label}</small><b>${f.value}</b></span>`)}</div>`}
        ${n.why && html`<p class="saint-why">${n.why}</p>`}
        ${n.quip && html`<p class="saint-quip">${n.quip}</p>`}
        <span class="saint-src">${fromAi ? 'Ranní rada od AI' : 'Z pravidel, dokud nezačne radit AI'}</span>`
      : html`<h2 class="saint-h">Svatý Business se modlí nad čísly…</h2>`}
    </div>
  </header>`;
}

export function Overview() {
  return html`<div class="page overview">
    <${SaintBusiness}/>
    <${RecentOrders}/>
    <${NeedsYou}/>
    <${Numbers}/>
    <${PaidChart}/>
    <${Engine}/>
  </div>`;
}
