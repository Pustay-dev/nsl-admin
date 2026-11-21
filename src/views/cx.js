// Customer-journey analytics: journey funnel, friction, and "what to test next". Data: rpc admin_cx_report (see supabase/migrations/*cx_analytics*).
// Events come from the theme tracker (assets/nsl-cx.js) after the visitor allowed analytics cookies; portraits, carts and paid orders
// come from the shop's own tables through the creator session, so "Paid" is a real paid order, not a pixel.
import { html, useState, Kpi, Bars, HBar, Empty, copy } from '../ui.js';
import { fmt } from '../api.js';

const p1 = (a, b) => (b ? (Math.round((a / b) * 1000) / 10).toLocaleString('cs-CZ') + ' %' : '–');
const rate = (a, b) => (b ? a / b : 0);
const PAGE = { index: 'Home', creator: 'Creator', product: 'Product', cart: 'Cart', styles: 'Styles page', page: 'Other page', other: 'Other', collection: 'Collection', search: 'Search', blog: 'Blog', article: 'Article' };
const CHANNEL = { meta: 'Meta (Facebook / Instagram)', google_ads: 'Google Ads', seznam_ads: 'Seznam Ads', paid_other: 'Other paid', email: 'E-mail', organic_search: 'Search (organic)', social: 'Social (organic)', referral: 'Other websites', direct: 'Direct / unknown' };
const KIND = { rage: 'Rage clicks', dead: 'Dead clicks', disabled: 'Greyed-out button', slow: 'Slow page' };
const KIND_HELP = { rage: '3+ fast clicks on the same spot: the visitor is frustrated', dead: 'Clicked a link or button and nothing happened', disabled: 'Pressed a button that is greyed out (e.g. "Create" before a photo)' };
const STEP = { upload_start: 'Chose photo(s)', generate_click: 'Pressed "Create"', gen_wait_start: 'Waited for a portrait', portrait_ready: 'Portrait appeared', continue_click: 'Pressed "Show on wall"', view_customize: 'Opened size & price', size_pick: 'Picked a size', buy_click: 'Pressed "Add to cart"', cart_add: 'Cart add succeeded', cart_add_failed: 'Cart add failed', retry_click: 'Retry / regenerate', new_photo_click: 'Started over / new photo', style_create_click: 'Created in another style', fullscreen_open: 'Opened full-screen preview', email_submit: 'Submitted e-mail', error_shown: 'Saw an error message', view_create: 'Create step', view_order: 'Order step', status: 'Status messages' };

export const FUNNEL = [
  ['landed', 'Visited the site'], ['creator', 'Opened the creator'], ['upload', 'Added a photo'], ['generate', 'Pressed "Create"'], ['portrait', 'Got a portrait'],
  ['customize', 'Opened size & price'], ['size', 'Picked a size'], ['cart', 'Added to cart'], ['checkout', 'Went to checkout'], ['paid', 'Paid'],
];

function Funnel({ F }) {
  const rows = FUNNEL.map(([k, l], i) => ({ k, l, n: F[k] || 0, prev: i ? F[FUNNEL[i - 1][0]] || 0 : 0 }));
  // biggest absolute leak between two steps that both have enough people to mean something
  let leak = -1, best = 0;
  rows.forEach((r, i) => { if (i && r.prev >= 20 && r.prev - r.n > best) { best = r.prev - r.n; leak = i; } });
  return html`<div class="col" style="gap:10px">${rows.map((r, i) => html`<div>
      <div class="row between small"><span>${r.l} ${i === leak && html`<span class="amber tiny"> · biggest leak (−${best})</span>`}</span>
        <span><b>${fmt.n(r.n)}</b> <span class="dim tiny">${i ? p1(r.n, rows[0].n) + ' of visitors · ' + p1(r.n, r.prev) + ' of previous' : ''}</span></span></div>
      <${HBar} v=${r.n} max=${rows[0].n} cls=${i === leak ? 'f' : ''}/></div>`)}</div>`;
}

function SegTable({ title, rows, label, hint }) {
  if (!rows || !rows.length) return null;
  return html`<div class="card" style="padding:0;overflow:auto"><h3 style="padding:14px 16px 0">${title} ${hint && html`<span class="dim tiny">${hint}</span>`}</h3>
    <table class="tbl"><thead><tr><th></th><th class="num">Visitors</th><th class="num">Opened creator</th><th class="num">Portrait</th><th class="num">Cart</th><th class="num">Paid</th></tr></thead><tbody>
    ${rows.map(r => html`<tr><td><b>${label ? label(r.k) : r.k}</b>${r.src ? html`<div class="tiny dim">${r.src}</div>` : ''}</td><td class="num">${fmt.n(r.visitors)}</td>
      <td class="num">${p1(r.creator ?? 0, r.visitors)}</td><td class="num">${p1(r.generated, r.visitors)}</td><td class="num">${p1(r.cart, r.visitors)}</td>
      <td class=${'num ' + (r.paid ? 'acid' : '')}>${r.paid || '–'}</td></tr>`)}</tbody></table></div>`;
}

function Quality({ q, days }) {
  const cover = q.sessions ? Math.round((q.sessions_tracked / q.sessions) * 100) : null;
  return html`<div class="card"><h3>Data quality</h3><div class="col" style="gap:6px">
    <div class="row between small"><span class="muted">Events collected</span><b>${fmt.n(q.events)}</b></div>
    <div class="row between small"><span class="muted">Visitors tracked (accepted analytics cookies)</span><b>${fmt.n(q.visitors)}</b></div>
    <div class="row between small"><span class="muted">Creator sessions seen / all new sessions</span><b>${fmt.n(q.sessions_tracked)} / ${fmt.n(q.sessions)}${cover != null ? ' (' + cover + ' %)' : ''}</b></div>
    <div class="row between small"><span class="muted">Real paid orders in period</span><b>${fmt.n(q.orders)}</b></div>
    <div class="row between small"><span class="muted">Last event</span><b>${q.last_event ? fmt.ago(q.last_event) + ' ago' : 'none yet'}</b></div>
    <div class="tiny dim">Only visitors who accepted analytics cookies are tracked, so the numbers show behaviour and rates, not total traffic. Compare with Shopify's own totals for volume. Last ${days} days.</div></div></div>`;
}

function NoData() {
  return html`<${Empty}>No behaviour data yet. It appears after the theme patch "nsl-cx" is live and visitors accept analytics cookies.<br/>Team browsers can be excluded by opening the shop once with <code>?nsl_cx=off</code>.</${Empty}>`;
}

export function Journey({ d, days }) {
  const F = d.funnel, q = d.quality;
  if (!F.landed) return html`<${NoData}/>`;
  const daily = d.daily.map(x => ({ ...x, day: x.day }));
  const homeV = F.home || 0;
  return html`<div class="col" style="gap:12px">
    <div class="grid g4">
      <${Kpi} label="Tracked visitors" v=${F.landed} sub=${fmt.n(q.events) + ' events'}/>
      <${Kpi} label="Visitor → portrait" v=${F.landed ? Math.round(rate(F.portrait, F.landed) * 1000) / 10 : 0} f=${v => v + ' %'} sub=${F.portrait + ' of ' + F.landed}/>
      <${Kpi} label="Visitor → paid" v=${F.landed ? Math.round(rate(F.paid, F.landed) * 1000) / 10 : 0} f=${v => v + ' %'} sub=${F.paid + ' paid of ' + F.landed}/>
      <${Kpi} label="Time to first Create press" v=${F.t_gen_med != null ? Math.round(F.t_gen_med) : null} f=${v => fmt.secs(v)} sub=${d.gen_wait && d.gen_wait.n ? 'portrait wait p50 ' + fmt.secs(d.gen_wait.p50) + ' · p90 ' + fmt.secs(d.gen_wait.p90) : 'median'}/>
    </div>
    <div class="grid g2">
      <div class="card"><h3>Customer journey</h3><${Funnel} F=${F}/></div>
      <div class="col" style="gap:12px">
        <div class="card"><h3>Landing page <span class="dim tiny">home page visitors only</span></h3>
          ${[['home', 'Saw the home page'], ['scroll50', 'Scrolled past 50 %'], ['cta', 'Clicked a "create" button']].map(([k, l]) => html`<div class="row between small" style="margin-bottom:6px"><span>${l}</span><span><b>${F[k]}</b> <span class="dim tiny">${p1(F[k], homeV)}</span></span></div><${HBar} v=${F[k]} max=${homeV}/>`)}
          ${d.scroll.filter(s => s.page === 'index').length ? html`<div class="tiny dim" style="margin-top:8px">Scroll reach: ${d.scroll.filter(s => s.page === 'index').map(s => s.depth + '% → ' + p1(s.visitors, homeV)).join(' · ')}</div>` : ''}</div>
        <${Quality} q=${q} days=${days}/>
      </div>
    </div>
    <div class="card"><h3>Visitors per day <span class="grow"></span><span class="legend"><span><i style="background:var(--acid)"></i>visitors</span><span><i style="background:var(--blue)"></i>pressed Create</span><span><i style="background:var(--red)"></i>added to cart</span></span></h3>
      <${Bars} data=${daily} series=${[{ key: 'visitors', cls: 'g', label: 'visitors' }, { key: 'generate', cls: 's', label: 'create' }, { key: 'cart', cls: 'f', label: 'cart' }]}/></div>
    <div class="grid g2">
      <${SegTable} title="By device" rows=${d.devices} label=${k => ({ mobile: 'Phone', tablet: 'Tablet', desktop: 'Computer' }[k] || k)}/>
      <${SegTable} title="By traffic source" rows=${d.channels} label=${k => CHANNEL[k] || k} hint="first visit"/>
    </div>
    <div class="grid g2">
      <${SegTable} title="By landing page" rows=${d.landing}/>
      <${SegTable} title="By campaign (utm_campaign)" rows=${d.campaigns}/>
    </div>
    ${d.sections.length ? html`<div class="card" style="padding:0;overflow:auto"><h3 style="padding:14px 16px 0">Home page sections <span class="dim tiny">who reached it, how long they stayed, clicks inside</span></h3>
      <table class="tbl"><thead><tr><th>Section</th><th></th><th class="num">Reached</th><th class="num">Avg seconds</th><th class="num">Clicks</th><th class="num">"Create" clicks</th></tr></thead><tbody>
      ${d.sections.map(s => html`<tr><td><b>${s.name}</b></td><td style="width:30%"><${HBar} v=${s.reach} max=${homeV}/></td><td class="num">${p1(s.reach, homeV)}</td><td class="num">${s.avg_s}</td><td class="num">${s.clicks || '–'}</td><td class="num">${s.cta_clicks || '–'}</td></tr>`)}</tbody></table></div>` : ''}
  </div>`;
}

export function Friction({ d }) {
  const F = d.funnel;
  if (!F.landed) return html`<${NoData}/>`;
  const msTone = v => (v == null ? '' : v > 4000 ? 'red' : v > 2500 ? 'amber' : 'acid');
  return html`<div class="col" style="gap:12px">
    <div class="grid g4">
      <${Kpi} label="Visitors with friction" v=${F.landed ? Math.round(rate(F.friction, F.landed) * 1000) / 10 : 0} f=${v => v + ' %'} sub=${F.friction + ' of ' + F.landed + ' (rage, dead or greyed-out clicks)'} tone=${F.friction / Math.max(1, F.landed) > 0.1 ? 'amber' : ''}/>
      <${Kpi} label="Visitors who saw an error" v=${F.landed ? Math.round(rate(F.errors, F.landed) * 1000) / 10 : 0} f=${v => v + ' %'} sub=${F.errors + ' of ' + F.landed} tone=${F.errors ? 'red' : ''}/>
      <${Kpi} label="Portrait wait (median)" v=${d.gen_wait && d.gen_wait.n ? Math.round(d.gen_wait.p50) : null} f=${v => fmt.secs(v)} sub=${d.gen_wait && d.gen_wait.n ? 'p90 ' + fmt.secs(d.gen_wait.p90) + ' · ' + d.gen_wait.n + ' waits' : 'no waits recorded yet'}/>
      <${Kpi} label="Checkout clicks" v=${F.checkout} sub=${F.paid + ' paid'}/>
    </div>
    <div class="card" style="padding:0;overflow:auto"><h3 style="padding:14px 16px 0">Friction hot-spots <span class="dim tiny">where people get stuck</span></h3>
      ${d.friction.length ? html`<table class="tbl"><thead><tr><th>Signal</th><th>Page</th><th>Element</th><th>Section</th><th class="num">Times</th><th class="num">Visitors</th><th class="num">Last</th></tr></thead><tbody>
      ${d.friction.map(r => html`<tr title=${KIND_HELP[r.kind] || ''}><td><span class=${r.kind === 'rage' ? 'red' : 'amber'}>${KIND[r.kind] || r.kind}</span></td><td>${PAGE[r.page] || r.page}</td><td class="tiny">${r.target}</td><td class="tiny dim">${r.sec}</td><td class="num">${r.events}</td><td class="num">${r.visitors}</td><td class="num tiny">${fmt.ago(r.last_at)}</td></tr>`)}</tbody></table>
      <div class="tiny dim" style="padding:8px 16px 12px">Rage = 3+ fast clicks on one spot. Dead = clicked and nothing happened. Greyed-out = pressed a disabled button. Open Clarity recordings for the same page to watch what happened.</div>` : html`<div style="padding:16px"><${Empty}>No friction signals in this period.</${Empty}></div>`}</div>
    <div class="grid g2">
      <div class="card" style="padding:0;overflow:auto"><h3 style="padding:14px 16px 0">Errors people saw</h3>
        ${d.errors.length ? html`<table class="tbl"><thead><tr><th>Where</th><th>Message</th><th class="num">Times</th><th class="num">Visitors</th></tr></thead><tbody>
        ${d.errors.map(e => html`<tr><td>${e.kind === 'creator' ? 'Creator message' : 'Script error'} <span class="dim tiny">${PAGE[e.page] || e.page}</span></td><td class="tiny">${e.msg}</td><td class="num">${e.events}</td><td class="num">${e.visitors}</td></tr>`)}</tbody></table>` : html`<div style="padding:16px"><span class="acid small">none</span></div>`}</div>
      <div class="card" style="padding:0;overflow:auto"><h3 style="padding:14px 16px 0">Page speed and attention <span class="dim tiny">real visitors</span></h3>
        <table class="tbl"><thead><tr><th>Page</th><th class="num">Views</th><th class="num">Active time</th><th class="num">Scroll</th><th class="num">Loaded</th><th class="num">LCP</th></tr></thead><tbody>
        ${d.pages.map(p => html`<tr><td><b>${PAGE[p.page] || p.page}</b></td><td class="num">${p.views}</td><td class="num">${p.active_med_s != null ? fmt.secs(p.active_med_s) : '–'}</td><td class="num">${p.scroll_med != null ? Math.round(p.scroll_med) + ' %' : '–'}</td>
          <td class=${'num ' + msTone(p.load_med_ms)}>${p.load_med_ms != null ? (p.load_med_ms / 1000).toFixed(1) + 's' : '–'}</td><td class=${'num ' + msTone(p.lcp_med_ms)}>${p.lcp_med_ms != null ? (p.lcp_med_ms / 1000).toFixed(1) + 's' : '–'}</td></tr>`)}</tbody></table>
        <div class="tiny dim" style="padding:8px 16px 12px">Medians. LCP = when the main picture/text is visible; under 2.5 s is good, over 4 s is poor.</div></div>
    </div>
    <div class="grid g2">
      <div class="card" style="padding:0;overflow:auto"><h3 style="padding:14px 16px 0">What people click</h3>
        ${d.clicks.length ? html`<table class="tbl"><thead><tr><th>Element</th><th>Page</th><th class="num">Clicks</th><th class="num">Visitors</th></tr></thead><tbody>
        ${d.clicks.map(c => html`<tr><td>${c.cta ? html`<span class="acid tiny">CTA </span>` : ''}${c.name}</td><td class="dim tiny">${PAGE[c.page] || c.page}</td><td class="num">${c.clicks}</td><td class="num">${c.visitors}</td></tr>`)}</tbody></table>` : html`<div style="padding:16px"><${Empty}>No clicks yet.</${Empty}></div>`}</div>
      <div class="col" style="gap:12px">
        <div class="card"><h3>Creator steps <span class="dim tiny">visitors who did it</span></h3>
          ${d.steps.length ? d.steps.filter(s => STEP[s.name]).map(s => html`<div class="row between small"><span>${STEP[s.name]}</span><b>${s.visitors}</b></div>`) : html`<span class="dim small">No creator activity yet.</span>`}</div>
        <div class="card"><h3>Heatmaps and recordings</h3><div class="small muted">Microsoft Clarity (free) shows scroll heatmaps, click heatmaps and session recordings. Paste its project ID in Theme settings → Analytika (CX); it loads only after cookie consent and only on home, creator, product and cart.</div>
          <div style="margin-top:10px"><a class="btn sm" href="https://clarity.microsoft.com/" target="_blank" rel="noopener noreferrer">Open Clarity</a></div></div>
      </div>
    </div>
  </div>`;
}

// ---- rule-based "what to test next": transparent rules on the numbers above, no AI ----
const IDEAS = {
  creator: ['Visitors rarely open the creator', 'Make the main button clearer and higher; show a finished portrait next to it.', 'Hero CTA: a bigger button, text such as "Vytvořit můj portrét zdarma", visible without scrolling.'],
  upload: ['People open the creator but do not add a photo', 'The upload step is the first effort. Show what a good photo looks like and make the upload area the only obvious action.', 'Creator: replace the empty upload box with an example photo + "Nahrajte fotku" and a one-line tip.'],
  generate: ['A photo is added but "Create" is not pressed', 'The button may look inactive or the next step is unclear.', 'Creator: keep "Vytvořit" visible and enabled-looking once a photo is added; consider auto-start after upload.'],
  portrait: ['"Create" is pressed but no portrait appears', 'Failures or long waiting. Check Errors below and the portrait wait time.', 'Creator: show progress with an honest time estimate and a sample gallery while waiting.'],
  customize: ['People get a portrait but do not continue', 'The path to buying is not obvious or the price is a surprise.', 'Gallery: a prominent "Zobrazit obraz na zdi" button and the price visible on the portrait card.'],
  size: ['Size & price page is opened but no size is picked', 'Choice or price may feel heavy.', 'Pre-select the recommended size and show the price and "doprava zdarma" next to the button.'],
  cart: ['A size is picked but nothing goes to the cart', 'Add-to-cart wording or trust is weak.', 'Purchase bar: clearer label ("Přidat do košíku – 1 190 Kč"), delivery and guarantee line directly under it.'],
  checkout: ['Cart is filled but checkout is not started', 'Cart page friction or surprise costs.', 'Cart: show total, delivery and a single obvious "Pokračovat k platbě" button; remove distractions.'],
  paid: ['Checkout is started but not paid', 'Mostly outside the theme: payment methods, shipping price, trust.', 'Check payment methods and shipping costs in Shopify; test a guarantee badge in the cart before checkout.'],
};
const LEVEL = { critical: 0, important: 1, nice: 2 };

export function recommend(d, days) {
  const F = d.funnel, out = [], V = F.landed || 0;
  const add = (level, title, why, test, evidence) => out.push({ level, title, why, test, evidence });
  if (V < 30) { add('important', 'Collect more data first', 'Fewer than 30 tracked visitors: rates below would be noise.', 'Keep the tracking on; at the current pace the picture becomes useful after roughly ' + Math.max(1, Math.ceil((30 - V) / Math.max(1, V / days))) + ' more days.', V + ' visitors in ' + days + ' days'); return out; }
  // 1) biggest leak
  const keys = FUNNEL.map(f => f[0]);
  let leak = null;
  keys.forEach((k, i) => { if (!i) return; const prev = F[keys[i - 1]] || 0, cur = F[k] || 0; if (prev >= 20 && (!leak || prev - cur > leak.lost)) leak = { k, lost: prev - cur, prev, cur }; });
  if (leak && IDEAS[leak.k]) {
    const [t, w, test] = IDEAS[leak.k];
    add(leak.lost / leak.prev > 0.5 ? 'critical' : 'important', t, w, test, leak.cur + ' of ' + leak.prev + ' continue (' + p1(leak.cur, leak.prev) + '), ' + leak.lost + ' lost: the biggest leak in the journey');
  }
  // 2) errors in the creator
  const err = d.errors.find(e => e.kind === 'creator' && e.visitors >= 2);
  if (err) add('critical', 'Visitors see an error in the creator', 'Errors lose customers who already did the hard part.', 'Fix the cause first (no A/B test needed). Error: "' + err.msg + '"', err.visitors + ' visitors, ' + err.events + ' times');
  // 3) top friction
  const fr = d.friction.find(f => f.events >= 3 && f.kind !== 'slow');
  if (fr) add('important', fr.kind === 'disabled' ? 'People press a greyed-out button' : fr.kind === 'rage' ? 'People rage-click on one element' : 'A button does nothing when pressed',
    'Frustration signal on ' + (PAGE[fr.page] || fr.page) + (fr.sec ? ' / ' + fr.sec : '') + ': ' + fr.target, fr.kind === 'disabled' ? 'Tell people why it is disabled (e.g. "Nejdřív přidejte fotku") or enable it and guide on click.' : 'Make the element respond instantly (feedback or navigation) or remove the false affordance.', fr.visitors + ' visitors, ' + fr.events + ' times');
  // 4) device gap
  const dv = Object.fromEntries(d.devices.map(x => [x.k, x]));
  if (dv.mobile && dv.desktop && dv.mobile.visitors >= 30 && dv.desktop.visitors >= 30) {
    const m = rate(dv.mobile.generated, dv.mobile.visitors), c = rate(dv.desktop.generated, dv.desktop.visitors);
    if (c > 0 && m / c < 0.6) add('important', 'Phones convert much worse than computers', 'Most traffic is usually on phones; a gap there is the cheapest big win.', 'Test a phone-first creator start: bigger upload target, fewer steps visible, sticky "Vytvořit" button.', 'portrait rate phone ' + p1(dv.mobile.generated, dv.mobile.visitors) + ' vs computer ' + p1(dv.desktop.generated, dv.desktop.visitors));
  }
  // 5) landing page
  if (F.home >= 30 && F.cta / F.home < 0.08) add('important', 'Few visitors click a "create" button on the home page', 'Either the button is not seen or the promise is not clear.', 'Hero: a clearer headline + one primary button above the fold; show a before/after example next to it.', p1(F.cta, F.home) + ' of ' + F.home + ' home visitors click a create button');
  if (F.home >= 30 && F.scroll50 / F.home < 0.5) add('nice', 'Half of the visitors leave before the middle of the home page', 'The first screen does not earn the scroll.', 'Shorten the first screen; put the strongest proof (example portraits, reviews) first.', p1(F.scroll50, F.home) + ' scroll past 50 %');
  // 6) weak source
  const allCreator = rate(F.creator, V);
  const ch = d.channels.find(c => c.visitors >= 30 && c.k !== 'direct' && rate(c.creator, c.visitors) < allCreator * 0.5);
  if (ch) add('nice', (CHANNEL[ch.k] || ch.k) + ' traffic does not use the creator', 'This source brings visitors who do not engage.', 'Give this source its own landing message that matches the ad, or reduce its budget.', ch.visitors + ' visitors, ' + p1(ch.creator, ch.visitors) + ' open the creator (average ' + p1(F.creator, V) + ')');
  // 7) speed
  const slow = d.pages.find(p => p.lcp_med_ms > 2500 && p.views >= 20);
  if (slow) add(slow.lcp_med_ms > 4000 ? 'critical' : 'important', (PAGE[slow.page] || slow.page) + ' loads slowly for real visitors', 'Slow pages lose people before they see the offer (LCP ' + (slow.lcp_med_ms / 1000).toFixed(1) + ' s).', 'Compress the first image, delay non-essential scripts; no A/B test needed.', 'median LCP ' + (slow.lcp_med_ms / 1000).toFixed(1) + ' s');
  return out.sort((a, b) => LEVEL[a.level] - LEVEL[b.level]);
}

// Sample size per arm for a two-sided test, alpha 0.05, power 80 %: n = 15.7 * p(1-p) / (p * lift)^2
export const perArm = (p, lift) => (p > 0 && p < 1 && lift > 0 ? Math.ceil((15.7 * p * (1 - p)) / Math.pow(p * lift, 2)) : null);

function Planner({ d, days }) {
  const F = d.funnel, V = F.landed || 0, perDay = V / days;
  const metrics = [['portrait', 'Got a portrait'], ['cart', 'Added to cart'], ['paid', 'Paid']];
  const [m, setM] = useState('portrait');
  const [lift, setLift] = useState(20);
  const base = V ? rate(F[m], V) : 0;
  const n = perArm(base, lift / 100);
  const daysNeeded = n && perDay ? Math.ceil((n * 2) / perDay) : null;
  return html`<div class="card"><h3>Test planner <span class="dim tiny">can this store prove a win before Christmas?</span></h3>
    <div class="row" style="gap:12px;flex-wrap:wrap">
      <label class="f">Goal<select class="in" value=${m} onChange=${e => setM(e.target.value)}>${metrics.map(([k, l]) => html`<option value=${k}>${l}</option>`)}</select></label>
      <label class="f">Smallest lift worth detecting (%)<input class="in" type="number" min="5" max="200" step="5" value=${lift} onInput=${e => setLift(Number(e.target.value) || 20)}/></label>
    </div>
    <div class="grid g3" style="margin-top:10px">
      <div><div class="tiny dim">Current rate</div><b>${p1(F[m], V)}</b></div>
      <div><div class="tiny dim">Visitors needed per variant</div><b>${n ? fmt.n(n) : '–'}</b></div>
      <div><div class="tiny dim">Days at current traffic (${perDay.toFixed(1)} tracked / day)</div><b class=${daysNeeded && daysNeeded > 21 ? 'amber' : ''}>${daysNeeded ? daysNeeded + ' days' : '–'}</b></div>
    </div>
    <div class="tiny dim" style="margin-top:8px">${daysNeeded && daysNeeded > 21 ? 'Too slow for a clean A/B test on this goal. Test a bigger change, pick a goal higher up the funnel (portrait), or just ship the obvious fix.' : 'Run one test at a time and let it run for full weeks. Count only visitors who accepted analytics cookies.'}</div></div>`;
}

// "Done" marks on Optimise items: kept in this browser only, keyed by the recommendation title.
const DONE_KEY = 'nsl-optimise-done';
const loadDone = () => { try { return JSON.parse(localStorage.getItem(DONE_KEY) || '{}'); } catch { return {}; } };

export function Optimise({ d, days }) {
  const recs = recommend(d, days), F = d.funnel;
  const [done, setDone] = useState(loadDone);
  const toggle = t => setDone(prev => { const n = { ...prev }; if (n[t]) delete n[t]; else n[t] = new Date().toISOString().slice(0, 10); try { localStorage.setItem(DONE_KEY, JSON.stringify(n)); } catch {} return n; });
  const tone = { critical: 'red', important: 'amber', nice: 'dim' }, label = { critical: 'Critical', important: 'Important', nice: 'Nice to have' };
  return html`<div class="col" style="gap:12px">
    <div class="card"><h3>What to fix or test next <span class="dim tiny">rule-based on the last ${days} days · bottleneck first</span></h3>
      ${!F.landed ? html`<${NoData}/>` : html`<div class="col" style="gap:12px">${recs.map(r => html`<div style=${'padding:12px;border:1px solid var(--line);border-radius:var(--r);' + (done[r.title] ? 'opacity:.5' : '')}>
        <div class="row between"><label class="row" style="gap:8px;cursor:pointer"><input type="checkbox" checked=${!!done[r.title]} onChange=${() => toggle(r.title)}/><b style=${done[r.title] ? 'text-decoration:line-through' : ''}>${r.title}</b>${done[r.title] ? html`<span class="tiny acid">done ${done[r.title]}</span>` : ''}</label><span class=${'tiny ' + tone[r.level]}>${label[r.level]}</span></div>
        <div class="small muted" style="margin-top:4px">${r.why}</div>
        <div class="small" style="margin-top:6px"><span class="dim">Evidence:</span> ${r.evidence}</div>
        <div class="small" style="margin-top:4px"><span class="dim">Try:</span> ${r.test}</div>
        <div style="margin-top:8px"><button class="btn sm" onClick=${() => copy(r.title + '\nEvidence: ' + r.evidence + '\nTry: ' + r.test)}>Copy as test idea</button></div></div>`)}
        ${!recs.length ? html`<span class="acid small">Nothing stands out. Keep collecting data.</span>` : ''}</div>`}</div>
    ${F.landed ? html`<${Planner} d=${d} days=${days}/>` : ''}
    <div class="card"><h3>How to use this</h3><ol class="small muted" style="margin:0;padding-left:18px;display:grid;gap:4px">
      <li>Fix errors and speed first: they need no test.</li>
      <li>Pick the biggest leak above, write one hypothesis, and change only that (one A/B test at a time, see A/B tests).</li>
      <li>Decide on <b>paid orders</b>, not clicks; use friction and scroll numbers to learn why a variant won.</li>
      <li>Do not change the funnel in the last weeks before Christmas (fulfilment mode): ship only fixes.</li>
    </ol></div>
  </div>`;
}
