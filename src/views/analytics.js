import { html, useState, Kpi, Bars, Heatmap, HBar, Seg, Skel, Empty, useLoad } from '../ui.js';
import { rpc, fmt } from '../api.js';
import { go } from '../router.js';

export function Analytics() {
  const [days, setDays] = useState(30);
  const { data, error, loading } = useLoad(() => rpc('admin_analytics', { p_days: days }), [days]);
  const head = html`<div class="head"><div class="grow"><h1>Analytics</h1></div>
    ${loading && html`<span class="tiny dim">computing…</span>`}<${Seg} value=${days} onChange=${setDays} options=${[{ v: 7, l: '7d' }, { v: 30, l: '30d' }, { v: 90, l: '90d' }, { v: 365, l: '1y' }]}/></div>`;
  if (error) return html`<div class="page">${head}<div class="card red">${error.message}</div></div>`;
  if (!data) return html`<div class="page">${head}<div class="grid g4">${[1, 2, 3, 4].map(() => html`<${Skel} hgt="96"/>`)}</div></div>`;
  const F = data.funnel, sum = k => data.daily.reduce((a, d) => a + (d[k] || 0), 0);
  const gen = sum('generated'), fail = sum('failed');
  const steps = [['sessions', 'Visited creator'], ['uploaded', 'Uploaded photos'], ['generated', 'Got a portrait'], ['multi', 'Tried 2+ portraits'], ['carted', 'Added to cart'], ['contact', 'Left email'], ['paid', 'Paid']];
  const smax = Math.max(1, ...data.styles.map(s => s.generated));
  const aud = Object.entries(data.audiences).sort((a, b) => b[1] - a[1]), amax = Math.max(1, ...aud.map(a => a[1]));

  return html`<div class="page">${head}
    <div class="grid g4">
      <${Kpi} label="Portraits" v=${gen} sub=${fmt.pct(gen, gen + fail) + ' success · ' + fail + ' failed'}/>
      <${Kpi} label="Visit → portrait" v=${F.sessions ? Math.round((F.generated / F.sessions) * 100) : 0} f=${v => v + '%'} sub=${F.generated + ' of ' + F.sessions + ' sessions'}/>
      <${Kpi} label="Latency p50 / p90" v=${data.latency?.p50 ? Math.round(data.latency.p50) : null} f=${v => v + 's'} sub=${'p90 ' + fmt.secs(data.latency?.p90)}/>
      <${Kpi} label="Est. AI spend" v=${data.spend_estimate_czk} f=${fmt.czk} sub=${'@ ' + data.cost_per_generation_czk + ' Kč / submission (System → settings)'}/>
    </div>
    <div class="card" style="margin-top:12px"><h3>Daily activity <span class="grow"></span><span class="legend"><span><i style="background:var(--acid)"></i>portraits</span><span><i style="background:var(--red)"></i>failed</span><span><i style="background:var(--blue)"></i>orders</span></span></h3>
      <${Bars} data=${data.daily} series=${[{ key: 'generated', label: 'portraits' }, { key: 'failed', cls: 'f', label: 'failed' }, { key: 'orders', cls: 's', label: 'orders' }]}/></div>
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
        <div class="card"><h3>Finance log</h3>${data.finance.length ? data.finance.slice(-6).map(f => html`<div class="row between tiny"><span>${f.day}</span><span>${fmt.czk(f.revenue)} rev · ${fmt.czk(f.ads)} ads</span></div>`) : html`<span class="dim small">No entries. Add them under System.</span>`}</div>
      </div>
    </div>
  </div>`;
}
