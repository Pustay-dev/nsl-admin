// A/B tests: live conversion meter + simple controls.
// Data: admin_ab_* RPCs (supabase/migrations/20261113160000_ab_tests_v1.sql). Split happens in the theme (snippets/nsl-ab-head.liquid).
import { html, useState, useMemo, Icon, Pill, Modal, Empty, Skel, copy, useLoad, usePoll } from '../ui.js';
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

function Editor({ exp, onClose, onSaved }) {
  const isNew = !exp;
  const [f, setF] = useState(exp ? { ...exp } : { id: '', name: '', hypothesis: '', variant_a: '', variant_b: '', metric: 'generated' });
  const [busy, setBusy] = useState(false);
  const slug = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  const id = isNew ? (f.id || slug(f.name)) : exp.id;
  const save = async () => {
    setBusy(true);
    try { const r = await rpc('admin_ab_save', { p: { ...f, id } }); toast(isNew ? 'Test created' : 'Saved'); onSaved(r); }
    catch (e) { toast(e.message, 'err', 6000); } finally { setBusy(false); }
  };
  const locked = exp && exp.status !== 'draft';
  return html`<${Modal} title=${isNew ? 'New A/B test' : 'Edit test'} onClose=${onClose}
    footer=${html`<button class="btn ghost" onClick=${onClose}>Cancel</button><button class="btn primary" disabled=${busy || !/^[a-z][a-z0-9-]{2,40}$/.test(id)} onClick=${save}>${isNew ? 'Create draft' : 'Save'}</button>`}>
    <div class="col" style="margin-top:10px">
      <label class="f">Name<input class="in" autofocus value=${f.name} placeholder="Hero: gift headline vs. style headline" onInput=${e => setF({ ...f, name: e.target.value })}/></label>
      <label class="f">ID <span class="hint">${isNew ? 'goes into Theme settings → A/B test · permanent' : 'permanent'}</span><input class="in" disabled=${!isNew} value=${id} onInput=${e => setF({ ...f, id: slug(e.target.value) })}/></label>
      <label class="f">Hypothesis <span class="hint">what you expect and why</span><textarea class="in" rows="2" onInput=${e => setF({ ...f, hypothesis: e.target.value })}>${f.hypothesis || ''}</textarea></label>
      <div class="grid g2"><label class="f">A shows (control)<input class="in" value=${f.variant_a || ''} placeholder="current hero" onInput=${e => setF({ ...f, variant_a: e.target.value })}/></label>
        <label class="f">B shows (challenger)<input class="in" value=${f.variant_b || ''} placeholder="new headline + photo" onInput=${e => setF({ ...f, variant_b: e.target.value })}/></label></div>
      <label class="f">Decide on <span class="hint">${locked ? 'locked once the test started' : 'pick before starting; earlier steps give an answer sooner'}</span>
        <select class="in" disabled=${locked} value=${f.metric} onChange=${e => setF({ ...f, metric: e.target.value })}>${METRICS.map(m => html`<option value=${m.v}>${m.l}</option>`)}</select></label>
    </div></${Modal}>`;
}

function StopDialog({ exp, suggestion, onClose, onDone }) {
  const [winner, setWinner] = useState(suggestion || 'none');
  const [note, setNote] = useState('');
  const go2 = async () => { try { await rpc('admin_ab_set_status', { p_id: exp.id, p_status: 'stopped', p_winner: winner, p_note: note || null }); toast('Test stopped'); onDone(); } catch (e) { toast(e.message, 'err', 6000); } };
  return html`<${Modal} title="Stop test and record the decision" onClose=${onClose}
    footer=${html`<button class="btn ghost" onClick=${onClose}>Cancel</button><button class="btn danger" onClick=${go2}>Stop test</button>`}>
    <div class="col" style="margin-top:10px">
      <div class="seg">${['A', 'B', 'none'].map(w => html`<button aria-pressed=${winner === w} onClick=${() => setWinner(w)}>${w === 'none' ? 'no difference' : 'keep ' + w}</button>`)}</div>
      <label class="f">Decision note <span class="hint">what you learned</span><textarea class="in" rows="2" onInput=${e => setNote(e.target.value)}>${note}</textarea></label>
      <div class="tiny muted">Then in Shopify: Theme settings → A/B test → clear the ID, and delete the losing section (or set the winner to “Vždy”). Counting stops immediately.</div>
    </div></${Modal}>`;
}

function Detail({ id, canEdit }) {
  const { data, error, reload } = useLoad(() => rpc('admin_ab_results', { p_id: id }), [id]);
  usePoll(() => reload(true), 10000);
  const [edit, setEdit] = useState(false), [stop, setStop] = useState(false);
  const e = data?.experiment, arms = data?.arms;
  const st = useMemo(() => {
    if (!arms?.A) return null;
    const m = e.metric, A = { n: arms.A.visitors, x: arms.A[m] }, B = { n: arms.B.visitors, x: arms.B[m] };
    const cmp = A.n && B.n ? compare(A, B) : null;
    const base = (A.x + B.x) / Math.max(1, A.n + B.n);
    const need = needed(base || null);
    const days = e.started_at ? (Date.now() - new Date(e.started_at)) / 864e5 : 0;
    const checks = [
      [`${MIN_VISITORS}+ visitors in each arm`, Math.min(A.n, B.n) >= MIN_VISITORS, `${fmt.n(Math.min(A.n, B.n))} / ${MIN_VISITORS}`],
      [`${MIN_CONV}+ conversions in total`, A.x + B.x >= MIN_CONV, `${fmt.n(A.x + B.x)} / ${MIN_CONV}`],
      [`${MIN_DAYS}+ days (covers weekdays and weekend)`, days >= MIN_DAYS, `${days.toFixed(1)} / ${MIN_DAYS}`],
    ];
    const ready = checks.every(c => c[1]);
    const verdict = !cmp ? ['dim', 'Waiting for the first visitors in both arms.']
      : !ready ? ['amber', 'Too early to call. ' + (cmp.pB >= 0.5 ? 'B' : 'A') + ' is ahead for now, but small numbers swing a lot.']
      : cmp.pB >= DECIDE ? ['acid', 'B wins. Keep B, remove A.']
      : cmp.pB <= 1 - DECIDE ? ['acid', 'A wins. B made it worse; keep A.']
      : ['muted', 'No clear winner yet. Keep running' + (need ? ' (about ' + fmt.n(need) + ' visitors per arm needed to see a 30 % lift).' : '.')];
    const ratio = A.n + B.n ? B.n / (A.n + B.n) : null;
    return { cmp, need, checks, ready, verdict, ratio, suggest: ready && cmp ? (cmp.pB >= DECIDE ? 'B' : cmp.pB <= 1 - DECIDE ? 'A' : 'none') : null };
  }, [data]);

  if (error) return html`<div class="card red">${error.message}</div>`;
  if (!data) return html`<${Skel} hgt="360"/>`;
  const status = async s => { try { await rpc('admin_ab_set_status', { p_id: id, p_status: s }); toast(s === 'running' ? 'Test is live' : 'Test paused'); reload(true); } catch (err) { toast(err.message, 'err', 6000); } };
  const lead = st?.cmp ? (st.cmp.pB >= 0.5 ? 'B' : 'A') : null;
  const ago = data.last_hit ? fmt.ago(data.last_hit) : null;

  return html`<div class="col" style="gap:14px">
    <div class="card">
      <div class="row wrap" style="gap:10px">
        <div class="grow" style="flex:1 1 260px;min-width:0"><div class="row" style="gap:8px">${pill(e.status)}<h2 style="margin:0;font:700 20px var(--disp)">${e.name}</h2></div>
          <div class="tiny dim" style="margin-top:4px">id <b class="acid">${e.id}</b> <button class="btn ghost sm" onClick=${() => copy(e.id)}><${Icon} n="copy" s="12"/></button> · decide on <b>${mLabel(e.metric)}</b>${e.started_at ? ' · started ' + fmt.date(e.started_at) : ''}${e.stopped_at ? ' · stopped ' + fmt.date(e.stopped_at) : ''}</div></div>
        ${e.status === 'running' && html`<span class="tiny dim live" title="Refreshes every 10 s">live${ago ? ' · last visit ' + ago + ' ago' : ''}</span>`}
        ${canEdit && html`<div class="row" style="gap:6px">
          ${e.status === 'draft' && html`<button class="btn primary sm" onClick=${() => status('running')}><${Icon} n="bolt" s="13"/>Start</button>`}
          ${e.status === 'running' && html`<button class="btn sm" onClick=${() => status('paused')}>Pause</button>`}
          ${e.status === 'paused' && html`<button class="btn primary sm" onClick=${() => status('running')}>Resume</button>`}
          ${(e.status === 'running' || e.status === 'paused') && html`<button class="btn danger sm" onClick=${() => setStop(true)}>Stop & decide</button>`}
          ${e.status !== 'stopped' && html`<button class="btn ghost sm" onClick=${() => setEdit(true)}>Edit</button>`}</div>`}
      </div>
      ${e.hypothesis && html`<div class="small muted" style="margin-top:10px">${e.hypothesis}</div>`}
      <div class="row wrap tiny" style="gap:14px;margin-top:8px"><span><span class="ab-dot a"></span>A: ${e.variant_a || html`<span class="dim">not described</span>`}</span><span><span class="ab-dot b"></span>B: ${e.variant_b || html`<span class="dim">not described</span>`}</span></div>
      ${e.status === 'stopped' && html`<div class="card" style="margin-top:12px;background:var(--panel2)"><b class="acid">Decision: ${e.winner === 'none' ? 'no difference' : 'keep ' + e.winner}</b>${e.decision_note && html`<div class="small muted">${e.decision_note}</div>`}</div>`}
      ${e.status === 'draft' && html`<div class="ab-setup tiny"><b>Before you press Start</b><ol>
        <li>Shopify → Online Store → Customize the theme → duplicate the section you test; set the copy to <i>Zobrazit ve variantě: Jen B</i>, the original to <i>Jen A</i>.</li>
        <li>Theme settings → <b>A/B test</b> → ID <code>${e.id}</code>, share of B 50 %. Save.</li>
        <li>Check both looks: add <code>?nsl_ab=A</code> / <code>?nsl_ab=B</code> to the shop URL (not counted).</li>
        <li>Press Start. Visitors are counted only after they accept analytics cookies.</li></ol></div>`}
    </div>

    ${st && html`<div class="card">
      <${Meter} p=${st.cmp?.pB} ready=${st.ready}/>
      <div class=${'ab-verdict ' + st.verdict[0]}>${st.verdict[1]}</div>
      ${st.cmp && html`<div class="tiny muted" style="text-align:center">B vs A: ${st.cmp.lift >= 0 ? '+' : ''}${(st.cmp.lift * 100).toFixed(0)} % (90 % range ${(st.cmp.lo * 100).toFixed(0)} % to ${st.cmp.hi === Infinity ? '∞' : '+' + (st.cmp.hi * 100).toFixed(0)} %)</div>`}
      <div class="ab-checks">${st.checks.map(([l, ok, v]) => html`<span class=${ok ? 'ok' : ''}><${Icon} n=${ok ? 'check' : 'dot'} s="13"/>${l} <span class="dim">${v}</span></span>`)}</div>
      ${st.ratio != null && Math.min(arms.A.visitors, arms.B.visitors) >= 50 && Math.abs(st.ratio - 0.5) > 0.1 && html`<div class="tiny amber" style="text-align:center;margin-top:6px">Split is ${(st.ratio * 100).toFixed(0)} % B. If the theme is set to 50 %, something is off (caching, a missing section, or bots).</div>`}
    </div>`}

    <div class="grid g2"><${Arm} k="A" a=${arms.A} metric=${e.metric} best=${lead === 'A' && st?.ready}/><${Arm} k="B" a=${arms.B} metric=${e.metric} best=${lead === 'B' && st?.ready}/></div>
    <div class="card"><div class="row" style="margin-bottom:8px"><b>Conversion over time</b><span class="grow"></span><span class="tiny dim">${mLabel(e.metric)}</span></div><${Trend} daily=${data.daily} metric=${e.metric}/></div>
    <div class="tiny dim">Counted per visitor (browser), from the moment they first saw the test. Portraits, carts and orders come from the shop's own data, linked through the creator session; test orders are excluded. Visitors who decline analytics cookies are not counted (same for both arms).</div>
    ${edit && html`<${Editor} exp=${e} onClose=${() => setEdit(false)} onSaved=${() => { setEdit(false); reload(true); }}/>`}
    ${stop && html`<${StopDialog} exp=${e} suggestion=${st?.suggest} onClose=${() => setStop(false)} onDone=${() => { setStop(false); reload(true); }}/>`}
  </div>`;
}

export function Experiments({ openId }) {
  const role = useStore(s => s.role), canEdit = role === 'owner' || role === 'editor';
  const { data, error, reload } = useLoad(() => rpc('admin_ab_list'), []);
  usePoll(() => reload(true), 15000);
  const [creating, setCreating] = useState(false);
  const list = Array.isArray(data) ? data : [];
  const current = openId || list.find(x => x.status === 'running')?.id || list.find(x => x.status !== 'stopped')?.id || list[0]?.id;

  return html`<div class="page">
    <div class="head"><div class="grow"><h1>A/B tests</h1></div>
      ${canEdit && html`<button class="btn primary" onClick=${() => setCreating(true)}><${Icon} n="plus" s="14"/>New test</button>`}</div>
    ${error && html`<div class="card red">${error.message}</div>`}
    ${!data && !error ? html`<${Skel} hgt="320"/>` : !list.length ? html`<div class="card"><${Empty}>No tests yet. With today's traffic, test one big thing at a time (headline, hero image, main button) and decide on “Got a portrait”: orders are too rare to give an answer before Christmas.</${Empty}></div>`
      : html`<div class="ab-layout">
        <div class="col" style="gap:6px">${list.map(x => html`<button class=${'ab-item ' + (x.id === current ? 'on' : '')} onClick=${() => go('experiments/' + x.id)}>
          <div class="row" style="gap:6px">${pill(x.status)}<b class="trunc">${x.name}</b></div>
          <div class="tiny dim">A ${pct(x.arms?.A?.[x.metric] || 0, x.arms?.A?.visitors)} · B ${pct(x.arms?.B?.[x.metric] || 0, x.arms?.B?.visitors)} · ${fmt.n((x.arms?.A?.visitors || 0) + (x.arms?.B?.visitors || 0))} visitors</div></button>`)}</div>
        <div>${current && html`<${Detail} key=${current} id=${current} canEdit=${canEdit}/>`}</div></div>`}
    ${creating && html`<${Editor} onClose=${() => setCreating(false)} onSaved=${r => { setCreating(false); reload(true); go('experiments/' + r.id); }}/>`}
  </div>`;
}
