// A/B tests: create a test in three questions, watch visitor -> paid order per variant, end it and (optionally) ship the winner.
// Data: admin_ab_* RPCs (migrations 20261113160000 + 20261116160000). The shop applies the change itself (theme assets/nsl-ab2.js, patch 1.4); nothing to edit in the theme per test.
import { html, useState, useMemo, Icon, Pill, Modal, Empty, Skel, Seg, usePeriod, copy, useLoad, usePoll } from '../ui.js';
import { MetaAB } from './meta.js';
import { rpc, fmt } from '../api.js';
import { toast, useStore } from '../store.js';
import { go } from '../router.js';

const METRICS = [
  { v: 'creator', l: 'Opened the creator', short: 'creator' },
  { v: 'generated', l: 'Got a portrait', short: 'portrait' },
  { v: 'carted', l: 'Added to cart', short: 'cart' },
  { v: 'ordered', l: 'Ordered (paid, non-test)', short: 'order' },
];
const mLabel = v => METRICS.find(m => m.v === v)?.l || v;
const STATUS = { draft: ['draft', 'draft'], running: ['live', 'running'], paused: ['hidden', 'paused'], stopped: ['draft', 'stopped'] };
const pill = s => html`<${Pill} s=${STATUS[s]?.[0] || s} label=${STATUS[s]?.[1] || s}/>`;
const pct = (x, n) => (n ? (100 * x / n).toFixed(x / n < 0.1 ? 2 : 1) + ' %' : '–');
const MIN_VISITORS = 100, MIN_CONV = 20, MIN_DAYS = 7, DECIDE = 0.95, MDE = 0.3; // guard-rails for calling a winner

/* ---------- statistics (Bayesian, Beta(1,1) prior; seeded so the number doesn't jitter between refreshes) ---------- */
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function gauss(r) { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function gamma(k, r) { // Marsaglia–Tsang
  if (k < 1) return gamma(k + 1, r) * Math.pow(r(), 1 / k);
  const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) { let x, v; do { x = gauss(r); v = 1 + c * x; } while (v <= 0); v = v * v * v; const u = r(); if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v; }
}
const beta = (a, b, r) => { const x = gamma(a, r); return x / (x + gamma(b, r)); };
export function compare(A, B, draws = 20000) {
  const r = rng(A.n * 7919 + A.x * 104729 + B.n * 1299709 + B.x * 15485863 + 1);
  let win = 0; const lift = new Float64Array(draws);
  for (let i = 0; i < draws; i++) { const a = beta(1 + A.x, 1 + A.n - A.x, r), b = beta(1 + B.x, 1 + B.n - B.x, r); if (b > a) win++; lift[i] = b / a - 1; }
  lift.sort();
  return { pB: win / draws, lift: lift[draws >> 1], lo: lift[Math.floor(draws * 0.05)], hi: lift[Math.floor(draws * 0.95)] };
}
// visitors per arm to detect a relative lift `mde` (two-sided α = 0.05, power 0.8)
export function needed(p, mde = MDE) {
  if (!(p > 0)) return null;
  const p2 = Math.min(0.99, p * (1 + mde));
  return Math.ceil(7.85 * (p * (1 - p) + p2 * (1 - p2)) / ((p2 - p) ** 2));
}

/* ---------- the meter ---------- */
function Meter({ p, ready }) {
  const x = Math.max(0, Math.min(1, p ?? 0.5)) * 100;
  const tone = p == null ? 'dim' : p >= DECIDE ? 'b' : p <= 1 - DECIDE ? 'a' : 'mid';
  return html`<div class=${'abm ' + (ready ? '' : 'early')} role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow=${Math.round(x)} aria-label="Chance B beats A">
    <div class="abm-track"><span class="abm-zone a"></span><span class="abm-zone b"></span><span class="abm-needle" style=${'left:' + x + '%'}></span></div>
    <div class="abm-scale"><span>A wins</span><span>keep running</span><span>B wins</span></div>
    <div class=${'abm-val ' + tone}>${p == null ? '–' : (p * 100).toFixed(0) + ' %'}<span> chance B beats A</span></div>
  </div>`;
}

function Arm({ k, a, metric, best }) {
  const steps = [['visitors', 'Visitors'], ['creator', 'Creator'], ['generated', 'Portrait'], ['carted', 'Cart'], ['ordered', 'Order']];
  return html`<div class=${'card ab-arm ' + k.toLowerCase() + (best ? ' best' : '')}>
    <div class="row"><span class=${'ab-badge ' + k.toLowerCase()}>${k}</span><span class="muted small">${k === 'A' ? 'control' : 'challenger'}</span><span class="grow"></span>${best && html`<span class="tag acid">leading</span>`}</div>
    <div class="ab-rate">${pct(a[metric], a.visitors)}</div>
    <div class="tiny dim">${fmt.n(a[metric])} of ${fmt.n(a.visitors)} visitors · ${mLabel(metric).toLowerCase()}</div>
    <div class="ab-funnel">${steps.map(([key, l]) => html`<div class=${key === metric ? 'on' : ''}><span>${l}</span><div class="bar"><i style=${'width:' + (a.visitors ? Math.max(2, 100 * a[key] / a.visitors) : 0) + '%'}></i></div><b>${fmt.n(a[key])}</b><span class="dim">${key === 'visitors' ? '' : pct(a[key], a.visitors)}</span></div>`)}</div>
  </div>`;
}

// cumulative conversion per arm by day
function Trend({ daily, metric }) {
  const days = [...new Set(daily.map(d => d.day))].sort();
  if (days.length < 2) return html`<div class="tiny dim">The trend appears after the second day.</div>`;
  const acc = { A: { n: 0, x: 0 }, B: { n: 0, x: 0 } }, pts = { A: [], B: [] };
  for (const d of days) for (const k of ['A', 'B']) { const r = daily.find(z => z.day === d && z.variant === k); if (r) { acc[k].n += r.visitors; acc[k].x += r[metric]; } pts[k].push(acc[k].n ? acc[k].x / acc[k].n : null); }
  const max = Math.max(0.01, ...pts.A, ...pts.B), w = 640, h = 150;
  const line = arr => arr.map((v, i) => v == null ? '' : (i && arr[i - 1] != null ? 'L' : 'M') + (i / (days.length - 1) * w).toFixed(1) + ' ' + (h - 6 - v / max * (h - 16)).toFixed(1)).join('');
  return html`<svg class="chart ab-trend" viewBox=${`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label="cumulative conversion by day">
    <path class="a" d=${line(pts.A)}/><path class="b" d=${line(pts.B)}/></svg>
    <div class="row tiny dim" style="justify-content:space-between"><span>${fmt.day ? fmt.day(days[0]) : days[0]}</span><span><span class="ab-dot a"></span>A <span class="ab-dot b"></span>B · cumulative, max ${(max * 100).toFixed(1)} %</span><span>${fmt.day ? fmt.day(days[days.length - 1]) : days[days.length - 1]}</span></div>`;
}


// Why did a variant win? Behaviour per arm from the CX tracker (guard-rails: a "win" that adds friction or errors is suspect).
function Behaviour({ id }) {
  const { data } = useLoad(() => rpc('admin_cx_ab', { p_id: id }), [id]);
  const A = data?.A, B = data?.B;
  if (!A || !B || !(A.visitors || B.visitors)) return html`<div class="card"><b>Behaviour per variant</b><div class="tiny dim" style="margin-top:6px">Appears once visitors in the test have accepted analytics cookies and the tracking patch is live.</div></div>`;
  const pc = (x, n) => (n ? Math.round((x / n) * 1000) / 10 + ' %' : '–');
  const rows = [['Saw the page', 'visitors', true], ['Scrolled past 50 %', 'scroll50'], ['Clicked a "create" button', 'cta'], ['Pressed "Create" in the creator', 'generate'], ['Had a rage / dead / greyed-out click', 'friction', false, true], ['Saw an error', 'errors', false, true]];
  const warn = k => { const a = A[k] / Math.max(1, A.visitors), b = B[k] / Math.max(1, B.visitors); return B[k] >= 5 && b > a * 1.5; };
  return html`<div class="card" style="padding:0;overflow:auto"><div class="row" style="padding:14px 16px 0"><b>Behaviour per variant</b><span class="grow"></span><span class="tiny dim">share of visitors in each arm</span></div>
    <table class="tbl"><thead><tr><th></th><th class="num">A</th><th class="num">B</th></tr></thead><tbody>
    ${rows.map(([l, k, raw, bad]) => html`<tr><td>${l}</td>${raw ? html`<td class="num">${fmt.n(A[k])}</td><td class="num">${fmt.n(B[k])}</td>` : html`<td class="num">${pc(A[k], A.visitors)}</td><td class=${'num ' + (bad && warn(k) ? 'red' : '')}>${pc(B[k], B.visitors)}${bad && warn(k) ? ' ⚠' : ''}</td>`}</tr>`)}
    <tr><td>Phone share</td><td class="num">${pc(A.mobile, A.visitors)}</td><td class="num">${pc(B.mobile, B.visitors)}</td></tr>
    <tr><td>Average active time</td><td class="num">${A.active_s != null ? fmt.secs(A.active_s) : '–'}</td><td class="num">${B.active_s != null ? fmt.secs(B.active_s) : '–'}</td></tr></tbody></table>
    <div class="tiny dim" style="padding:8px 16px 12px">A ⚠ means B shows clearly more friction or errors than A: check before trusting a win. A very different phone share between arms also means the split is not comparable.</div></div>`;
}

/* ---------- what can be tested (no theme editing: the shop applies it from the admin) ---------- */
const SECTIONS = [
  ['Popular styles showcase', '[data-ff-showcase]'], ['FAQ', '#otazky'],
];
const PRESETS = [
  { id: 'hero_intro', title: 'Gift or free preview?', hint: 'Home intro. Lead with a gift for people and pets, then explain the free preview.', type: 'text', sel: '.ff-hero__lead', page: 'home', ph: 'New intro text',
    suggestion: 'Proměňte fotku rodičů, dětí nebo mazlíčka v osobní dárek na plátně. Portrét si nejdřív prohlédnete zdarma.' },
  { id: 'hero_start', title: 'First button', hint: 'Home hero. Test if a photo-specific action or a free-preview promise gets more people started.', type: 'text', sel: '[data-ff-start] > .ff-cta__main', page: 'home', ph: 'New button text',
    suggestion: 'Vytvořit náhled zdarma' },
  { id: 'hero_note', title: 'Reassurance under the first button', hint: 'Home hero. Test purchase reassurance against the existing no-card message.', type: 'text', sel: '[data-ff-start] > .ff-cta__sub', page: 'home', ph: 'New reassurance line',
    suggestion: 'Nejdřív náhled zdarma · pak se rozhodnete' },
  { id: 'preview', title: 'Reveal button', hint: 'Home quiz, after size selection. Make it clear that the next step is the portrait preview.', type: 'text', sel: '[data-ff-reveal] > .ff-cta__main', page: 'home', ph: 'New preview button text',
    suggestion: 'Zobrazit můj náhled zdarma' },
  { id: 'showcase', title: 'Popular styles button', hint: 'Below the popular portraits. Test whether inviting visitors to use their own photo makes the next step clearer.', type: 'text', sel: '[data-ff-showcase] .ff-cta__main', page: 'home', ph: 'New showcase button text',
    suggestion: 'Vyzkoušet styl na vlastní fotce' },
  { id: 'hide', title: 'Hide a section', hint: 'Home only. See whether visitors reach paid orders more often on a shorter page.', type: 'hide_section', page: 'home' },
  { id: 'custom', title: 'Something else', hint: 'Any element (CSS selector) on any page', type: 'text', custom: true, page: 'all', ph: 'New text' },
];
const PAGES = [['all', 'All pages'], ['home', 'Home'], ['creator', 'Creator'], ['product', 'Product'], ['cart', 'Cart']];
const SHOP = 'https://nechsenakreslit.cz';
const ERR = {
  AB_ONE_AT_A_TIME: 'Another test is already running. End or pause it first.', AB_NO_CHANGES: 'This test changes nothing yet.', AB_INVALID_CHANGES: 'That change is not allowed (check the selector and text).',
  AB_CHANGES_LOCKED: 'A test that has started cannot be edited.', AB_BAD_TRANSITION: 'That is not possible in the current state.', AB_WINNER_REQUIRED: 'Pick the result first.',
};
const msg = e => ERR[Object.keys(ERR).find(k => String(e?.message || '').includes(k))] || e?.message || 'Failed';
const slug = s => 'ab-' + String(s || 'test').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 26) + '-' + Date.now().toString(36).slice(-4);
const summary = c => (c || []).map(x => x.type === 'text' ? `"${x.value}"` : x.type === 'hide_section' || x.type === 'hide' ? 'hidden' : '').filter(Boolean).join(', ');

/* ---------- new test: three questions ---------- */
function NewTest({ onClose, onDone }) {
  const [p, setP] = useState(null), [val, setVal] = useState(''), [sec, setSec] = useState(SECTIONS[0][1]), [sel, setSel] = useState(''), [page, setPage] = useState('all');
  const [metric, setMetric] = useState('ordered'), [share, setShare] = useState(50), [goal, setGoal] = useState(3), [adv, setAdv] = useState(false), [busy, setBusy] = useState(false), [name, setName] = useState('');
  const pre = PRESETS.find(x => x.id === p);
  const change = !pre ? null : pre.type === 'hide_section' ? { type: 'hide_section', sel: sec, page: 'home' }
    : { type: 'text', sel: pre.custom ? sel.trim() : pre.sel, value: val.trim(), page: pre.custom ? page : pre.page };
  const ok = pre && (pre.type === 'hide_section' || (val.trim() && change.sel && !/[{};<\\]/.test(change.sel)));
  const title = name.trim() || (pre ? (pre.type === 'hide_section' ? 'Without: ' + (SECTIONS.find(s => s[1] === sec)?.[0] || '') : pre.title + ': ' + val.trim().slice(0, 30)) : '');
  const start = async () => {
    setBusy(true);
    try {
      const id = slug(title);
      await rpc('admin_ab_save', { p: { id, name: title, metric, share_b: share, goal_pct: goal, changes: [change], variant_a: 'Original', variant_b: summary([change]) } });
      await rpc('admin_ab_set_status', { p_id: id, p_status: 'running' });
      toast('Test started'); onDone(id);
    } catch (e) { toast(msg(e), 'err', 6000); setBusy(false); }
  };
  return html`<${Modal} title="New A/B test" onClose=${onClose} footer=${html`<button class="btn ghost" onClick=${onClose}>Cancel</button><span class="grow"></span><button class="btn primary" disabled=${!ok || busy} onClick=${start}>${busy ? 'Starting…' : 'Start test'}</button>`}>
    <div class="col" style="gap:14px">
      <div><div class="small"><b>1 · What do you want to test?</b></div>
        <div class="ab-presets">${PRESETS.map(x => html`<button type="button" class=${'ab-preset ' + (p === x.id ? 'on' : '')} onClick=${() => { if (p !== x.id) { setP(x.id); setVal(''); } }}><b>${x.title}</b><span>${x.hint}</span></button>`)}</div></div>
      ${pre && pre.type === 'hide_section' && html`<div><div class="small"><b>2 · Which section should B visitors not see?</b></div>
        <select class="in" value=${sec} onChange=${e => setSec(e.target.value)}>${SECTIONS.map(([l, s]) => html`<option value=${s}>${l}</option>`)}</select></div>`}
      ${pre && pre.type === 'text' && html`<div><div class="small"><b>2 · What should B visitors read instead?</b></div>
        ${pre.custom && html`<div class="grid g2" style="margin:6px 0"><input class="in" placeholder="CSS selector, e.g. .ff-hero__lead" value=${sel} onInput=${e => setSel(e.target.value)}/>
          <select class="in" value=${page} onChange=${e => setPage(e.target.value)}>${PAGES.map(([v, l]) => html`<option value=${v}>${l}</option>`)}</select></div>`}
        <input class="in" maxlength="300" placeholder=${pre.ph} value=${val} onInput=${e => setVal(e.target.value)}/>
        ${pre.suggestion && html`<button type="button" class="btn ghost sm" onClick=${() => setVal(pre.suggestion)}>Use suggestion</button>`}
        <div class="tiny dim" style="margin-top:4px">A (everyone else) keeps today's text. Plain text only.</div></div>`}
      ${pre && html`<div class="tiny dim"><b>3 · We split visitors ${100 - share} / ${share} and count who ends up with a paid order.</b> ${!adv && html`<a href="#/experiments" onClick=${e => { e.preventDefault(); setAdv(true); }}>Advanced</a>`}</div>`}
      ${pre && adv && html`<div class="card col" style="gap:10px"><label class="small">Name<input class="in" placeholder=${title} value=${name} onInput=${e => setName(e.target.value)}/></label>
        <label class="small">Measure<select class="in" value=${metric} onChange=${e => setMetric(e.target.value)}>${METRICS.map(m => html`<option value=${m.v}>${m.l}</option>`)}</select></label>
        <div class="tiny dim">Paid orders are the real goal but need many visitors. "Got a portrait" gives an answer much sooner.</div>
        <label class="small">Share of visitors who see B: <b>${share} %</b><input type="range" min="10" max="90" step="10" value=${share} onInput=${e => setShare(Number(e.target.value))}/></label>
        <label class="small">Conversion goal for the top bar (%)<input class="in" type="number" min="0.1" max="100" step="0.1" value=${goal} onInput=${e => setGoal(Number(e.target.value) || 3)}/></label></div>`}
    </div>
  </${Modal}>`;
}

function EndDialog({ exp, onClose, onDone, verdict }) {
  const [w, setW] = useState(verdict?.pick || 'none'), [note, setNote] = useState(''), [busy, setBusy] = useState(false);
  const go_ = async () => {
    setBusy(true);
    try { await rpc('admin_ab_set_status', { p_id: exp.id, p_status: 'stopped', p_winner: w, p_note: note || null }); toast(w === 'B' ? 'B is now live for everyone' : 'Test ended'); onDone(); }
    catch (e) { toast(msg(e), 'err', 6000); setBusy(false); }
  };
  const opt = (v, t, s) => html`<label class=${'ab-opt ' + (w === v ? 'on' : '')}><input type="radio" name="w" checked=${w === v} onChange=${() => setW(v)}/><span><b>${t}</b><span class="tiny dim">${s}</span></span></label>`;
  return html`<${Modal} title=${'End test: ' + exp.name} onClose=${onClose} footer=${html`<button class="btn ghost" onClick=${onClose}>Cancel</button><span class="grow"></span><button class="btn primary" disabled=${busy} onClick=${go_}>End test</button>`}>
    <div class="col" style="gap:8px">${opt('B', 'Use B for everyone', 'The change goes live on the shop for all visitors right away. You can switch it off here later.')}
      ${opt('A', 'Keep the original (A)', 'Everyone sees what was there before.')}${opt('none', 'No clear winner', 'Everyone sees the original.')}
      <input class="in" placeholder="Note (optional): what did you learn?" value=${note} onInput=${e => setNote(e.target.value)}/></div>
  </${Modal}>`;
}

/* ---------- the plain-language verdict ---------- */
function judge(exp, arms) {
  const m = exp.metric || 'ordered', A = arms.A || {}, B = arms.B || {};
  const nA = A.visitors || 0, nB = B.visitors || 0, xA = A[m] || 0, xB = B[m] || 0;
  const days = exp.started_at ? (Date.now() - Date.parse(exp.started_at)) / 864e5 : 0;
  const cmp = nA >= 10 && nB >= 10 ? compare({ n: nA, x: xA }, { n: nB, x: xB }) : null;
  const need = needed(Math.max(0.01, xA / Math.max(1, nA)));
  const vpd = days > 0.2 ? (nA + nB) / days : 0;
  const enough = nA >= MIN_VISITORS && nB >= MIN_VISITORS && xA + xB >= MIN_CONV && days >= MIN_DAYS;
  const left = need ? Math.max(0, need * 2 - (nA + nB)) : null;
  let tone = 'dim', head = 'Collecting the first visitors', body = 'Visitors count once they accept analytics cookies. Nothing to judge yet.', pick = 'none';
  if (nA + nB >= 10) {
    if (!enough) { tone = 'mid'; head = 'Keep running'; body = `Too early to call it. ${nA < MIN_VISITORS || nB < MIN_VISITORS ? `Need at least ${MIN_VISITORS} visitors per variant (now ${nA} / ${nB}). ` : ''}${xA + xB < MIN_CONV ? `Need ${MIN_CONV}+ ${mLabel(m).toLowerCase()} in total (now ${xA + xB}). ` : ''}${days < MIN_DAYS ? `Run at least ${MIN_DAYS} days (now ${days.toFixed(1)}). ` : ''}`; }
    else if (cmp.pB >= DECIDE) { tone = 'b'; head = 'B is winning'; body = `${Math.round(cmp.pB * 100)} % sure B converts better (about ${cmp.lift >= 0 ? '+' : ''}${Math.round(cmp.lift * 100)} %).`; pick = 'B'; }
    else if (cmp.pB <= 1 - DECIDE) { tone = 'a'; head = 'The original (A) is better'; body = `${Math.round((1 - cmp.pB) * 100)} % sure A converts better.`; pick = 'A'; }
    else { tone = 'mid'; head = 'No clear difference yet'; body = 'Keep running, or end it and keep the original.'; }
  }
  return { cmp, enough, need, vpd, left, tone, head, body, pick, days, nA, nB, xA, xB, m };
}

function Detail({ id, canEdit, onBack, onChanged }) {
  const { data, error, reload } = useLoad(() => rpc('admin_ab_results', { p_id: id }), [id]);
  usePoll(() => reload(true), 12000);
  const [end, setEnd] = useState(false), [busy, setBusy] = useState(false);
  if (error) return html`<${Empty}>${msg(error)}</${Empty}>`;
  if (!data) return html`<${Skel} hgt=${260}/>`;
  const exp = data.experiment, arms = data.arms, J = judge(exp, arms), m = exp.metric;
  const set = async (status, winner) => { setBusy(true); try { await rpc('admin_ab_set_status', { p_id: id, p_status: status, p_winner: winner || null }); toast(status === 'paused' ? 'Paused: everyone sees the original' : 'Running'); await reload(true); onChanged(); } catch (e) { toast(msg(e), 'err', 6000); } setBusy(false); };
  const ship = async on => { setBusy(true); try { await rpc('admin_ab_ship', { p_id: id, p_on: on }); toast(on ? 'B is live for everyone' : 'Back to the original'); await reload(true); onChanged(); } catch (e) { toast(msg(e), 'err', 6000); } setBusy(false); };
  const best = (arms.B?.[m] || 0) / Math.max(1, arms.B?.visitors || 0) > (arms.A?.[m] || 0) / Math.max(1, arms.A?.visitors || 0) ? 'B' : 'A';
  const lowTraffic = J.need && J.need > 3000 && m === 'ordered';
  const chg = exp.changes || [];
  return html`<div class="col" style="gap:14px">
    ${onBack && html`<button class="btn ghost sm" style="align-self:flex-start" onClick=${onBack}>← All tests</button>`}
    <div class="card">
      <div class="row" style="gap:10px;flex-wrap:wrap"><h2 style="margin:0">${exp.name}</h2>${pill(exp.status)}<span class="grow"></span>
        <a class="btn ghost sm" target="_blank" rel="noopener" href=${SHOP + '/?nsl_ab=A'}>Preview A <${Icon} n="ext" s="12"/></a><a class="btn ghost sm" target="_blank" rel="noopener" href=${SHOP + '/?nsl_ab=B'}>Preview B <${Icon} n="ext" s="12"/></a></div>
      <div class="tiny dim" style="margin-top:6px">${chg.map(c => c.type === 'text' ? `Text "${c.value}" on ${c.sel}` : `Hide section ${c.sel}`).join(' · ')} · ${exp.share_b} % see B · measures: ${mLabel(m).toLowerCase()}${exp.started_at ? ' · started ' + fmt.date(exp.started_at) : ''}</div>
      ${exp.status === 'stopped' && html`<div class="ab-ship ${exp.ship ? 'on' : ''}"><b>${exp.winner === 'B' ? (exp.ship ? 'B is live for everyone on the shop.' : 'B won, but is switched off (everyone sees the original).') : exp.winner === 'A' ? 'The original (A) was kept.' : 'No clear winner: the original is shown.'}</b>${exp.decision_note && html`<span class="dim"> · ${exp.decision_note}</span>`}
        ${canEdit && exp.winner === 'B' && html`<span class="grow"></span><button class="btn sm" disabled=${busy} onClick=${() => ship(!exp.ship)}>${exp.ship ? 'Switch B off' : 'Switch B on'}</button>`}</div>`}
    </div>

    ${exp.status !== 'draft' && html`<div class="card ab-verdict-card ${J.tone}"><div class="row"><b style="font-size:17px">${J.head}</b><span class="grow"></span>${exp.status === 'running' && canEdit && html`<button class="btn sm" disabled=${busy} onClick=${() => set('paused')}>Pause</button><button class="btn primary sm" onClick=${() => setEnd(true)}>End test…</button>`}${exp.status === 'paused' && canEdit && html`<button class="btn sm" disabled=${busy} onClick=${() => set('running')}>Resume</button><button class="btn primary sm" onClick=${() => setEnd(true)}>End test…</button>`}</div>
      <div class="small" style="margin-top:6px">${J.body}</div>
      <${Meter} p=${J.cmp?.pB ?? null} ready=${J.enough}/>
      <div class="tiny dim">${J.cmp ? `Range of the true lift of B: ${Math.round(J.cmp.lo * 100)} % to ${Math.round(J.cmp.hi * 100)} % (90 % sure). ` : ''}${J.need ? `To spot a 30 % improvement at the current rate you need about ${fmt.n(J.need)} visitors per variant${J.vpd ? ` (≈ ${Math.max(1, Math.ceil(J.left / J.vpd))} more days at ${Math.round(J.vpd)} visitors/day)` : ''}.` : ''}</div>
      ${lowTraffic && html`<div class="ab-tip">Paid orders are rare, so this will take a long time. For a faster (weaker) signal, start the next test measuring "Got a portrait".</div>`}</div>`}

    <div class="grid g2"><${Arm} k="A" a=${arms.A || {}} metric=${m} best=${J.nA + J.nB > 20 && best === 'A'}/><${Arm} k="B" a=${arms.B || {}} metric=${m} best=${J.nA + J.nB > 20 && best === 'B'}/></div>
    <div class="card"><b>Conversion over time</b><div style="margin-top:8px"><${Trend} daily=${data.daily || []} metric=${m}/></div></div>
    ${exp.status !== 'draft' && html`<${Behaviour} id=${id}/>`}
    ${end && html`<${EndDialog} exp=${exp} verdict=${J} onClose=${() => setEnd(false)} onDone=${() => { setEnd(false); reload(true); onChanged(); }}/>`}
  </div>`;
}

// A/B tests page: Website tests (own theme switch) and Meta ad tests (read-only comparison), one tab each.
export function Experiments({ openId }) {
  const meta = openId === 'meta';
  const { days } = usePeriod();
  const head = html`<div class="head"><h1>A/B tests</h1>
    <${Seg} value=${meta ? 'meta' : 'website'} onChange=${v => go(v === 'meta' ? 'experiments/meta' : 'experiments')} options=${[{ v: 'website', l: 'Website' }, { v: 'meta', l: 'Meta ads' }]}/>
    </div>`;
  return meta ? html`<div class="page">${head}<${MetaAB} days=${days}/></div>` : html`<${WebsiteTests} openId=${openId} head=${head}/>`;
}

function WebsiteTests({ openId, head }) {
  const role = useStore(s => s.role), canEdit = role === 'owner' || role === 'editor';
  const { data, error, reload } = useLoad(() => rpc('admin_ab_list'));
  usePoll(() => reload(true), 15000);
  const [mk, setMk] = useState(false);
  const open = id => go(id ? 'experiments/' + id : 'experiments');
  if (error) return html`<div class="page">${head}<${Empty}>${msg(error)}</${Empty}></div>`;
  if (!data) return html`<div class="page">${head}<${Skel} hgt=${300}/></div>`;
  const running = data.find(e => e.status === 'running') || data.find(e => e.status === 'paused');
  const rest = data.filter(e => e !== running);
  const shown = openId || (running && running.id);
  const cur = data.find(e => e.id === shown);
  return html`<div class="page col" style="gap:16px">${head}
    <div class="row" style="gap:12px;flex-wrap:wrap;margin-top:-12px"><p class="small dim grow" style="margin:0">Change one thing, let half the visitors see it, and see which version brings more paid orders</p>
      ${canEdit && !running && html`<button class="btn primary" onClick=${() => setMk(true)}><${Icon} n="plus" s="14"/> New test</button>`}</div>
    ${!cur && html`<div class="card ab-empty"><${Icon} n="flask" s="28"/><b>No test is running.</b><span class="dim small">Pick what to change (a headline, a button text, hide a section), press Start. Takes under a minute and needs no website editing.</span>${canEdit && html`<button class="btn primary" onClick=${() => setMk(true)}>Start your first test</button>`}</div>`}
    ${cur && html`<${Detail} key=${cur.id} id=${cur.id} canEdit=${canEdit} onBack=${openId && running ? () => open() : null} onChanged=${reload}/>`}
    ${rest.length > 0 && html`<div class="card" style="padding:0;overflow:auto"><div class="row" style="padding:14px 16px 0"><b>${running ? 'Other tests' : 'Past tests'}</b></div>
      <table class="tbl"><thead><tr><th>Test</th><th>Result</th><th class="num">Visitors</th><th class="num">A</th><th class="num">B</th><th></th></tr></thead><tbody>${rest.map(e => { const a = e.arms?.A || {}, b = e.arms?.B || {}, m = e.metric;
        return html`<tr class=${'clickable ' + (e.id === shown ? 'sel' : '')} onClick=${() => open(e.id)}><td><b>${e.name}</b><div class="tiny dim">${summary(e.changes)}</div></td><td>${pill(e.status)} ${e.status === 'stopped' && html`<span class="tiny">${e.winner === 'B' ? (e.ship ? 'B live' : 'B (off)') : e.winner === 'A' ? 'A kept' : 'no winner'}</span>`}</td><td class="num">${fmt.n((a.visitors || 0) + (b.visitors || 0))}</td><td class="num">${pct(a[m] || 0, a.visitors || 0)}</td><td class="num">${pct(b[m] || 0, b.visitors || 0)}</td><td class="num">${e.status === 'draft' && canEdit ? html`<button class="btn ghost sm" onClick=${async ev => { ev.stopPropagation(); try { await rpc('admin_ab_delete', { p_id: e.id }); reload(true); } catch (er) { toast(msg(er), 'err'); } }}>Delete</button>` : ''}</td></tr>`; })}</tbody></table></div>`}
    ${mk && html`<${NewTest} onClose=${() => setMk(false)} onDone=${id => { setMk(false); reload(true); open(id); }}/>`}
  </div>`;
}
