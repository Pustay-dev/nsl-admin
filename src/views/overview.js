import { html, useEffect, Kpi, Spark, Pill, Icon, Switch, Skel, confirm, useLoad } from '../ui.js';
import { rpc, fmt } from '../api.js';
import { toast, useStore } from '../store.js';
import { go } from '../router.js';

export function Overview() {
  const role = useStore(s => s.role);
  const { data, loading, error, reload } = useLoad(() => rpc('admin_overview'));
  useEffect(() => { const t = setInterval(() => document.visibilityState === 'visible' && reload(true), 15000); return () => clearInterval(t); }, [reload]);
  if (error && !data) return html`<div class="page"><div class="card red">${error.message}</div></div>`;
  if (!data) return html`<div class="page"><div class="grid g4">${[1, 2, 3, 4].map(() => html`<${Skel} hgt="96"/>`)}</div></div>`;
  const k = data.kpi, q = data.queue;

  const flip = async on => {
    if (!on && !(await confirm({ title: 'Stop all generation?', body: 'Customers will not be able to create portraits until you switch it back on. In-flight jobs finish.', ok: 'Stop generation', danger: true, type: 'STOP' }))) return;
    try { await rpc('admin_generation_switch', { p_enabled: on }); toast(on ? 'Generation enabled' : 'Generation stopped', on ? 'ok' : 'warn'); reload(true); } catch (e) { toast(e.message, 'err'); }
  };

  const alerts = [
    !q.generation_enabled && { t: 'Paid generation is OFF — customers cannot create portraits.', to: 'system', tone: 'red' },
    q.needs_review && { t: q.needs_review + ' generation job(s) need review (ambiguous provider outcome).', to: 'system', tone: 'amber' },
    q.orders_blocked && { t: q.orders_blocked + ' paid order item(s) blocked in production.', to: 'orders', tone: 'red' },
    q.factory_review && { t: q.factory_review + ' style factory run(s) waiting for review.', to: 'styles', tone: 'amber' },
    k.failed_7d && { t: k.failed_7d + ' failed generation(s) in the last 7 days.', to: 'analytics', tone: 'amber' },
  ].filter(Boolean);

  return html`<div class="page">
    <div class="head"><div class="grow"><h1>Overview</h1></div>
      <span class="dim tiny row"><span class="dot pulse"></span>live · ${fmt.date(data.now)}</span>
      <button class="btn sm" onClick=${() => reload()} disabled=${loading}><${Icon} n="refresh" s="14"/>Refresh</button></div>

    <div class="grid g4">
      <${Kpi} label="Portraits today" v=${k.generations_today} sub=${fmt.n(k.generations_7d) + ' in 7 days · ' + fmt.n(k.generations_total) + ' all-time'}/>
      <${Kpi} label="Sessions today" v=${k.sessions_today} sub=${fmt.n(k.sessions_7d) + ' in 7 days · ' + k.contacts + ' left an email'}/>
      <${Kpi} label="Paid items" v=${k.paid_items} sub=${k.paid_items_7d + ' this week · ' + k.test_items + ' test · ' + k.carts_open + ' open carts'} tone=${k.paid_items ? 'acid' : ''}/>
      <${Kpi} label="Avg generation" v=${k.avg_seconds_7d} f=${v => v + 's'} sub=${k.styles_live + ' styles · ' + k.variants_live + ' live variants'}/>
    </div>

    <div class="grid g3" style="margin-top:12px">
      <div class="card span2">
        <h3>Portraits per day · last 14 days <span class="grow"></span><span class="acid">${fmt.n(data.spark.reduce((a, d) => a + d.n, 0))}</span></h3>
        <${Spark} data=${data.spark} w=${640} hgt=${120}/>
        <div class="row between tiny dim" style="margin-top:6px"><span>${fmt.day(data.spark[0].day)}</span><span>today</span></div>
      </div>
      <div class="card">
        <h3>Engine</h3>
        <div class="col" style="gap:12px">
          <div class="row between"><span class="row"><span class=${'dot ' + (q.generation_enabled ? 'pulse' : 'off')}></span>Paid generation</span>
            ${role === 'owner' ? html`<${Switch} on=${q.generation_enabled} onChange=${flip} label="Toggle generation"/>` : html`<${Pill} s=${q.generation_enabled ? 'live' : 'failed'} label=${q.generation_enabled ? 'on' : 'off'}/>`}</div>
          <div class="row between"><span class="muted">Queue</span><span>${q.queued} queued · ${q.running} running</span></div>
          <div class="row between"><span class="muted">Needs review</span><span class=${q.needs_review ? 'amber' : ''}>${q.needs_review}</span></div>
          <div class="row between"><span class="muted">Submissions</span><span>${fmt.n(q.submissions)}${q.submission_limit < 2e9 ? ' / ' + fmt.n(q.submission_limit) : ''}</span></div>
          <div class="row between"><span class="muted">Model</span><span class="tiny acid trunc">${q.model}</span></div>
          <div class="row between"><span class="muted">Style factory</span><span>${q.factory_pending} running · ${q.factory_review} review</span></div>
        </div>
      </div>
    </div>

    <div class="grid g3" style="margin-top:12px">
      <div class="card span2">
        <h3><span class="dot pulse"></span>Live feed</h3>
        <ul class="feed">${data.feed.map((f, i) => html`<li key=${f.type + f.at + f.ref} style=${'--i:' + Math.min(i, 12)}>
          <time>${fmt.ago(f.at)} ago</time>
          <${Icon} n=${f.type === 'job' ? 'bolt' : f.type === 'order' ? 'orders' : 'users'} s="14" c=${f.type === 'order' ? 'acid' : 'dim'}/>
          <span class="trunc">${f.type === 'job' ? html`<b>${f.style}</b> <span class="dim">${f.ref || ''}</span>${f.error ? html` <span class="red">${f.error}</span>` : ''}`
            : f.type === 'order' ? html`order <b>#${f.ref || '?'}</b>${f.test ? html` <span class="tag">test</span>` : ''}` : html`new session <span class="dim">${f.ref || ''}</span>`}</span>
          <span class="row">${f.seconds != null && f.status === 'completed' ? html`<span class="tiny dim">${f.seconds}s</span>` : ''}${f.status && html`<${Pill} s=${f.status}/>`}
            ${f.session && html`<button class="btn ghost sm" onClick=${() => go('customers/' + f.session)} aria-label="Open session"><${Icon} n="ext" s="12"/></button>`}</span>
        </li>`)}</ul>
      </div>
      <div class="card">
        <h3>Attention</h3>
        ${alerts.length ? html`<div class="col">${alerts.map(a => html`<button class="btn" style="justify-content:flex-start;white-space:normal;text-align:left" onClick=${() => go(a.to)}><span class=${'dot ' + (a.tone === 'red' ? 'off' : 'warn')}></span><span>${a.t}</span></button>`)}</div>`
          : html`<div class="muted"><span class="acid">●</span> All clear.</div>`}
      </div>
    </div>
  </div>`;
}
