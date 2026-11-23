import { html, useState, Kpi, HBar, Seg, Skel, Empty, useLoad } from '../ui.js';
import { rpc, fmt } from '../api.js';
import { go } from '../router.js';

// Style analytics: which styles get used, which ones sell, which ones leak. Source: admin_analytics().styles (portraits, sessions, failed, orders, avg seconds).
const MIN_SESSIONS = 20;      // below this a conversion rate is noise: shown as "too early"
const REGEN_HIGH = 2.5;       // portraits per session: people keep regenerating = first result not good enough
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
const med = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };

const ROLE = {
  star: ['Star', 'acid', 'Used a lot and sells. Protect it, give it the best spot.'],
  gem: ['Hidden gem', 'blue', 'Sells well but few people try it. Promote: move up in the list, use it in ads and the hero.'],
  leak: ['Leak', 'red', 'Many people try it, few buy. Fix the result or the preview before sending more traffic.'],
  tail: ['Tail', 'dim', 'Little use, little sales. Test a new cover / name once, otherwise retire.'],
  early: ['Too early', 'dim', 'Not enough sessions for a reliable conversion rate yet.'],
};

function analyse(styles) {
  const tot = styles.reduce((a, s) => ({ g: a.g + s.generated, ses: a.ses + s.sessions, o: a.o + s.orders, f: a.f + s.failed }), { g: 0, ses: 0, o: 0, f: 0 });
  const base = tot.ses ? tot.o / tot.ses : 0;
  const volMed = med(styles.map(s => s.sessions));
  const rows = styles.map(s => {
    const conv = s.sessions ? s.orders / s.sessions : 0, reliable = s.sessions >= MIN_SESSIONS;
    const regen = s.sessions ? s.generated / s.sessions : 0, failRate = s.generated + s.failed ? s.failed / (s.generated + s.failed) : 0;
    const high = s.sessions >= volMed, good = conv >= base && s.orders > 0;
    const role = !reliable ? 'early' : high && good ? 'star' : !high && good ? 'gem' : high ? 'leak' : 'tail';
    return { ...s, conv, regen, failRate, index: base ? conv / base : 0, role, reliable };
  });
  return { rows, tot, base };
}

function advice(rows, base) {
  const out = [], by = r => rows.filter(x => x.role === r).sort((a, b) => b.sessions - a.sessions);
  const names = l => l.slice(0, 4).map(x => x.name).join(', ') + (l.length > 4 ? ' +' + (l.length - 4) : '');
  const gem = by('gem'), leak = by('leak'), tail = by('tail');
  const fail = rows.filter(r => r.reliable && r.failRate >= 0.1 && r.failed >= 3).sort((a, b) => b.failRate - a.failRate);
  const regen = rows.filter(r => r.reliable && r.regen >= REGEN_HIGH).sort((a, b) => b.regen - a.regen);
  if (fail.length) out.push({ level: 'Critical', tone: 'red', title: 'Fix failing styles first', why: 'A failed portrait is a lost customer and a wasted paid call. ' + names(fail) + ' fail 10 % or more.', test: 'Check the prompt and reference images of these styles in Styles → open style, then rerun a test portrait.' });
  if (leak.length) out.push({ level: 'Important', tone: 'amber', title: 'Fix the leaks: popular but not selling', why: names(leak) + ' attract above-median traffic but convert below the ' + (base * 100).toFixed(1) + ' % average.', test: 'A/B the style cover and name, then look at the result itself: is the portrait what the card promised? Do not buy ads for these yet.' });
  if (gem.length) out.push({ level: 'Important', tone: 'amber', title: 'Promote the hidden gems', why: names(gem) + ' convert above average but get below-median traffic.', test: 'Move them to the top of the list / collection and use them on the landing hero. Measure sessions and orders again after 7 days.' });
  if (regen.length) out.push({ level: 'Nice to have', tone: 'dim', title: 'People regenerate a lot', why: names(regen) + ' average ' + regen[0].regen.toFixed(1) + '+ portraits per session: the first result often misses.', test: 'Test a stricter prompt or a clearer photo hint ("face forward, good light") for these styles.' });
  if (tail.length) out.push({ level: 'Nice to have', tone: 'dim', title: 'Tail styles: refresh or retire', why: names(tail) + ' get little traffic and no above-average sales. A long list also dilutes choice.', test: 'Fewer, better styles convert better. Hide the weakest until after Christmas, do not delete.' });
  return out;
}

function Scatter({ rows, base }) {
  const w = 720, h = 220, L = 40, B = 24, pts = rows.filter(r => r.sessions > 0);
  const xm = Math.max(1, ...pts.map(r => r.sessions)), ym = Math.max(0.01, ...pts.map(r => r.conv), base * 1.5);
  const X = v => L + (v / xm) * (w - L - 10), Y = v => h - B - (v / ym) * (h - B - 10);
  const col = { star: 'var(--acid)', gem: 'var(--blue)', leak: 'var(--red)', tail: 'var(--dim)', early: 'var(--dim)' };
  return html`<svg class="chart" viewBox=${`0 0 ${w} ${h}`} role="img" aria-label="sessions vs conversion">
    <line class="ax" x1=${L} x2=${w - 10} y1=${Y(base)} y2=${Y(base)} stroke-dasharray="3 4"/><text x=${w - 10} y=${Y(base) - 4} text-anchor="end">average ${(base * 100).toFixed(1)} %</text>
    <line class="ax" x1=${L} x2=${L} y1="6" y2=${h - B}/><line class="ax" x1=${L} x2=${w - 10} y1=${h - B} y2=${h - B}/>
    <text x=${L} y=${h - 6}>0</text><text x=${w - 10} y=${h - 6} text-anchor="end">${xm} sessions →</text><text x="2" y="12">${(ym * 100).toFixed(0)} %</text>
    ${pts.map(r => html`<g style="cursor:pointer" onClick=${() => go('styles/' + r.style)}><circle cx=${X(r.sessions)} cy=${Y(r.conv)} r=${Math.max(4, Math.min(11, 3 + Math.sqrt(r.orders) * 2))} style=${`fill:${col[r.role]};opacity:${r.reliable ? 0.85 : 0.35}`}><title>${r.name}: ${r.sessions} sessions, ${r.orders} orders, ${(r.conv * 100).toFixed(1)} %</title></circle></g>`)}
  </svg>`;
}

export function StyleAnalytics({ days }) {
  const { data, error } = useLoad(() => rpc('admin_analytics', { p_days: days }), [days]);
  const [sort, setSort] = useState('sessions');
  if (error) return html`<div class="card red">${error.message}</div>`;
  if (!data) return html`<div class="grid g4">${[1, 2, 3, 4].map(() => html`<${Skel} hgt="96"/>`)}</div>`;
  const styles = data.styles || [];
  if (!styles.length) return html`<div class="card"><${Empty}>No portraits in the last ${days} days.</${Empty}></div>`;
  const { rows, tot, base } = analyse(styles);
  const top3 = [...rows].sort((a, b) => b.generated - a.generated).slice(0, 3), top3share = pct(top3.reduce((a, r) => a + r.generated, 0), tot.g);
  const sorted = [...rows].sort((a, b) => sort === 'conv' ? (b.reliable - a.reliable) || b.conv - a.conv : sort === 'orders' ? b.orders - a.orders : sort === 'fail' ? b.failRate - a.failRate : b.sessions - a.sessions);
  const smax = Math.max(1, ...rows.map(r => r.sessions)), recs = advice(rows, base);
  const noSales = rows.filter(r => r.reliable && r.orders === 0).length;
  return html`<div class="col" style="gap:12px">
    <div class="grid g4">
      <${Kpi} label="Styles used" v=${rows.length} sub=${tot.g + ' portraits · ' + tot.ses + ' style sessions'}/>
      <${Kpi} label="Session → order" v=${Math.round(base * 1000) / 10} f=${v => v + ' %'} sub=${tot.o + ' paid order(s) across styles'}/>
      <${Kpi} label="Top 3 share" v=${top3share} f=${v => v + ' %'} sub=${top3.map(r => r.name).join(', ')}/>
      <${Kpi} label="Styles without a sale" v=${noSales} sub=${'with ' + MIN_SESSIONS + '+ sessions in ' + days + ' days'}/>
    </div>
    <div class="card"><h3>Traffic vs conversion <span class="dim tiny">each dot is a style · size = orders · faded = under ${MIN_SESSIONS} sessions</span></h3><${Scatter} rows=${rows} base=${base}/>
      <div class="legend" style="margin-top:6px">${['star', 'gem', 'leak', 'tail'].map(k => html`<span><i style=${'background:' + ({ star: 'var(--acid)', gem: 'var(--blue)', leak: 'var(--red)', tail: 'var(--dim)' })[k]}></i>${ROLE[k][0]}</span>`)}</div></div>
    <div class="card"><h3>What to do with styles <span class="dim tiny">rule-based · bottleneck first</span></h3>
      <div class="col" style="gap:10px">${recs.map(r => html`<div style="padding:12px;border:1px solid var(--line);border-radius:var(--r)"><div class="row between"><b>${r.title}</b><span class=${'tiny ' + r.tone}>${r.level}</span></div>
        <div class="small muted" style="margin-top:4px">${r.why}</div><div class="small" style="margin-top:4px"><span class="dim">Try:</span> ${r.test}</div></div>`)}
        ${!recs.length ? html`<span class="acid small">Nothing stands out yet. Keep collecting data.</span>` : ''}</div></div>
    <div class="card" style="padding:0;overflow:auto"><div class="row between" style="padding:14px 16px 0;flex-wrap:wrap;gap:8px"><h3 style="margin:0">All styles</h3>
      <${Seg} value=${sort} onChange=${setSort} options=${[{ v: 'sessions', l: 'Traffic' }, { v: 'conv', l: 'Conversion' }, { v: 'orders', l: 'Orders' }, { v: 'fail', l: 'Fail rate' }]}/></div>
      <table class="tbl"><thead><tr><th>Style</th><th></th><th class="num">Sessions</th><th class="num">Portraits / session</th><th class="num">Orders</th><th class="num">Conversion</th><th class="num">vs avg</th><th class="num">Fail</th><th class="num">Avg time</th><th>Role</th></tr></thead><tbody>
      ${sorted.map(r => html`<tr class="click" onClick=${() => go('styles/' + r.style)}><td><b>${r.name}</b><div class="tiny dim">${r.collection}</div></td><td style="width:18%"><${HBar} v=${r.sessions} max=${smax}/></td>
        <td class="num">${r.sessions}</td><td class=${'num ' + (r.regen >= REGEN_HIGH ? 'amber' : '')}>${r.regen.toFixed(1)}</td><td class="num">${r.orders ? html`<span class="acid">${r.orders}</span>` : '–'}</td>
        <td class="num">${r.reliable ? (r.conv * 100).toFixed(1) + ' %' : html`<span class="dim tiny">too early</span>`}</td>
        <td class=${'num tiny ' + (!r.reliable ? 'dim' : r.index >= 1 ? 'acid' : 'red')}>${r.reliable ? '×' + r.index.toFixed(1) : ''}</td>
        <td class=${'num ' + (r.failRate >= 0.1 ? 'red' : 'dim')}>${r.failed ? Math.round(r.failRate * 100) + ' %' : '–'}</td><td class="num tiny">${fmt.secs(r.avg_seconds)}</td>
        <td><span class=${'tiny ' + ROLE[r.role][1]} title=${ROLE[r.role][2]}>${ROLE[r.role][0]}</span></td></tr>`)}</tbody></table></div>
    <div class="card"><h3>How to read this</h3><ul class="small muted" style="margin:0;padding-left:18px;display:grid;gap:4px">
      <li><b>Conversion</b> = paid orders / sessions that made a portrait in that style. Needs ${MIN_SESSIONS}+ sessions; before that it is noise.</li>
      <li><b>Portraits / session</b> above ${REGEN_HIGH} means people keep regenerating: the first result misses (prompt, photo advice).</li>
      <li>Not tracked yet: <b>card views and clicks per style</b> (the shop does not log them). Adding one event would show which covers attract and which only get skipped.</li>
      <li>Change one thing per style at a time (cover, name or prompt) and judge by <b>paid orders</b>, not portraits.</li>
    </ul></div>
  </div>`;
}
