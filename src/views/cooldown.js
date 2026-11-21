// Generation cooldown analytics (policy v2: 5 hot successes, then every 3 -> 3 minute pause).
// Data: rpc admin_cooldown_report / admin_session_cooldown (admin-guarded; see supabase/migrations/*cooldown*).
// Server truth = private.gallery_cooldown_events (written by a trigger when cooldown_count goes up). "Popup seen" is browser telemetry and is
// reported separately. Days are Europe/Prague. Outcomes only count windows that have fully elapsed; the rest show as "waiting".
import { html, Kpi, Bars, Empty, Skel, useLoad, usePoll } from '../ui.js';
import { rpc, fmt } from '../api.js';
import { go } from '../router.js';

const pct = (a, b) => (b ? (Math.round((a / b) * 1000) / 10).toLocaleString('cs-CZ') + ' %' : '–');
const mmss = s => (s == null ? '–' : s >= 3600 ? Math.round(s / 360) / 10 + ' h' : s >= 90 ? Math.round(s / 60) + ' min' : Math.round(s) + ' s');
const when = t => (t ? new Date(t).toLocaleString('cs-CZ', { timeZone: 'Europe/Prague', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : '–');

function Outcome({ label, o }) {
  const o0 = o || { matured: 0, returned: 0, waiting: 0 };
  return html`<tr><td><b>${label}</b></td><td class="num">${o0.matured + o0.waiting}</td><td class="num">${o0.matured}</td>
    <td class="num">${o0.returned}${o0.matured ? html` <span class="dim tiny">${pct(o0.returned, o0.matured)}</span>` : ''}</td>
    <td class=${'num ' + (o0.matured - o0.returned ? 'amber' : '')}>${o0.matured - o0.returned}</td><td class="num dim">${o0.waiting}</td></tr>`;
}

export function CooldownReport({ days }) {
  const { data: d, error, loading, reload } = useLoad(() => rpc('admin_cooldown_report', { p_days: days }), [days]);
  usePoll(() => reload(true), 30000);
  if (error) return html`<div class="card red">${error.message}</div>`;
  if (!d) return html`<div class="grid g4">${[1, 2, 3, 4].map(() => html`<${Skel} hgt="96"/>`)}</div>`;
  const v2 = d.versions.v2 || { sessions: 0, cooled: 0, cooldowns: 0, cooling_now: 0, email_bonus: 0, repeat_cooled: 0 }, v1 = d.versions.v1;
  const I = d.incidence, O = d.outcomes, C = d.conversion, T = d.time_to_next, P = d.popup, E = d.email_gate;
  const cmpRow = (l, x) => html`<tr><td>${l}</td><td class="num">${x.sessions}</td><td class="num">${x.carted} <span class="dim tiny">${pct(x.carted, x.sessions)}</span></td><td class="num">${x.paid} <span class="dim tiny">${pct(x.paid, x.sessions)}</span></td></tr>`;
  return html`<div class="col" style="gap:12px">
    <div class="card"><div class="small">${d.tracking_since
        ? html`Timed cooldown history starts <b>${when(d.tracking_since)}</b> (when the event log went live). Older cooldowns exist only as counters.`
        : html`The event log is live, but no cooldown has started since it began. Timed history, outcomes and conversion fill in as cooldowns happen; the counters below already count everything.`}
      <div class="tiny dim" style="margin-top:4px">Policy v2 only: a cooldown starts when a session finishes its 5th hot portrait in a row (next request within 60 s of the previous finish), then after every 3 hot ones; the pause is 3 minutes. Sessions on older policies are reported separately and are never mixed in. ${loading ? 'Refreshing…' : ''}</div></div></div>

    <div class="grid g4">
      <${Kpi} label="Sessions on policy v2" v=${v2.sessions} sub="all time"/>
      <${Kpi} label="Sessions with a cooldown" v=${v2.cooled} sub=${pct(v2.cooled, v2.sessions) + ' of v2 sessions · ' + v2.repeat_cooled + ' repeated'}/>
      <${Kpi} label="Cooldowns started" v=${v2.cooldowns} sub="sum of counters, all time"/>
      <${Kpi} label="Cooling down now" v=${v2.cooling_now} sub=${v1 ? 'older policy: ' + (v1.cooling_now || 0) + ' now · ' + v1.cooldowns + ' ever in ' + v1.cooled + ' of ' + v1.sessions + ' sessions' : ''}/>
    </div>

    <div class="card"><h3>Incidence <span class="grow"></span><span class="tiny dim">last ${d.days} days · counted from the event log</span></h3>
      <div class="grid g4">
        <${Kpi} label="Generating sessions" v=${I.generating_sessions} sub="finished 1+ portrait"/>
        <${Kpi} label="Hit a cooldown" v=${I.cooled_sessions} sub=${pct(I.cooled_sessions, I.generating_sessions) + ' of generating sessions'}/>
        <${Kpi} label="First cooldowns" v=${I.first} sub="5th hot portrait"/>
        <${Kpi} label="Repeat cooldowns" v=${I.repeat} sub="3 more hot portraits"/>
      </div>
      <h3 style="margin-top:14px">Cooldowns started per day <span class="grow"></span><span class="tiny dim">Europe/Prague days</span></h3>
      <${Bars} data=${d.daily} series=${[{ key: 'started', cls: 's', label: 'cooldowns started' }]}/></div>

    <div class="card" style="padding:0;overflow:auto"><h3 style="padding:14px 16px 0">After the cooldown <span class="tiny dim">did they come back within ${d.window_return_hours} h of it ending?</span></h3>
      <table class="tbl"><thead><tr><th></th><th class="num">Cooldowns</th><th class="num">Window finished</th><th class="num">Generated again</th><th class="num">No return</th><th class="num">Still waiting</th></tr></thead><tbody>
        <${Outcome} label="All" o=${O.all}/><${Outcome} label="First cooldown" o=${O.first}/><${Outcome} label="Repeat cooldown" o=${O.repeat}/></tbody></table>
      <div class="tiny dim" style="padding:8px 16px 14px">Time from cooldown end to the next finished portrait: median <b>${mmss(T.median_secs)}</b> · 90th percentile <b>${mmss(T.p90_secs)}</b> (${T.n} sessions). Cooldowns whose window has not finished yet are not counted as "no return".</div></div>

    <div class="grid g2">
      <div class="card"><h3>Cart and payment after a cooldown <span class="tiny dim">${d.window_conversion_days} days from cooldown start</span></h3>
        <div class="grid g2"><${Kpi} label="Added to cart" v=${C.carted} sub=${pct(C.carted, C.matured) + ' of ' + C.matured + ' finished'}/><${Kpi} label="Paid" v=${C.paid} sub=${pct(C.paid, C.matured) + ' of ' + C.matured + ' finished'}/></div>
        <div class="tiny dim" style="margin-top:6px">${C.waiting} more cooldown(s) are still inside their ${d.window_conversion_days}-day window and are excluded.</div></div>
      <div class="card" style="padding:0;overflow:auto"><h3 style="padding:14px 16px 0">Cooled vs not cooled <span class="tiny dim">whole history of the session</span></h3>
        <table class="tbl"><thead><tr><th></th><th class="num">Sessions</th><th class="num">Cart</th><th class="num">Paid</th></tr></thead><tbody>${cmpRow('Hit a cooldown', d.compare.cooled)}${cmpRow('No cooldown', d.compare.not_cooled)}</tbody></table>
        <div class="tiny dim" style="padding:8px 16px 14px">Descriptive only. Sessions that generate a lot differ from the rest, so this does not show that the cooldown helps or hurts.</div></div>
    </div>

    <div class="grid g2">
      <div class="card"><h3>Cooldown notice seen <span class="tiny dim">browser telemetry, separate from the server cooldown</span></h3>
        ${P.shown ? html`<div class="grid g2"><${Kpi} label="Notices shown" v=${P.shown} sub=${P.sessions + ' sessions'}/><${Kpi} label="Cooled sessions that saw it" v=${P.of_cooled} sub=${pct(P.of_cooled, I.cooled_sessions)}/></div>`
          : html`<div class="small dim">None recorded. The live theme does not report this event yet (see shopify/patches/cooldown-analytics/PATCH.md). Server cooldowns above are real either way; this only measures how many were actually seen.</div>`}</div>
      <div class="card"><h3>Email gate <span class="tiny dim">separate from the cooldown</span></h3>
        <div class="grid g3"><${Kpi} label="Unlocked (all time)" v=${E.granted_total}/><${Kpi} label="Unlocked in period" v=${E.granted_in_window}/><${Kpi} label="Also had a cooldown" v=${E.also_cooled}/></div>
        <div class="tiny dim" style="margin-top:6px">After 5 portraits an email unlocks 100 more, once per gallery. It can happen with or without a cooldown.</div></div>
    </div>

    ${d.cooling_now.length ? html`<div class="card" style="padding:0;overflow:auto"><h3 style="padding:14px 16px 0">Cooling down right now</h3>
      <table class="tbl"><thead><tr><th>Session</th><th class="num">Cooldown #</th><th>Ends</th></tr></thead><tbody>${d.cooling_now.map(c => html`<tr class="click" onClick=${() => go('customers/' + c.session_id)}><td><b>${c.ref || c.session_id.slice(0, 8)}</b>${c.label ? html` <span class="dim tiny">${c.label}</span>` : ''}${c.version !== 2 ? html` <span class="tag">older policy</span>` : ''}</td><td class="num">${c.ordinal}</td><td>${when(c.until)}</td></tr>`)}</tbody></table></div>` : ''}

    ${d.ab.length ? html`<div class="card" style="padding:0;overflow:auto"><h3 style="padding:14px 16px 0">By A/B arm <span class="tiny dim">sessions that could be linked to a test</span></h3>
      <table class="tbl"><thead><tr><th>Test</th><th>Arm</th><th class="num">Generating</th><th class="num">Cooled</th><th class="num">Rate</th></tr></thead><tbody>${d.ab.map(a => html`<tr><td>${a.experiment_id}</td><td>${a.variant}</td><td class="num">${a.generating}</td><td class="num">${a.cooled}</td><td class="num">${pct(a.cooled, a.generating)}</td></tr>`)}</tbody></table></div>` : ''}
  </div>`;
}

// Cooldown card for the customer / gallery drawer. Read-only; never changes policy.
export function SessionCooldown({ id }) {
  const { data: d, error, reload } = useLoad(() => rpc('admin_session_cooldown', { p_id: id }), [id]);
  usePoll(() => reload(true), 15000);
  if (error) return html`<div class="card" style="margin-bottom:14px"><h3>Generation pause</h3><div class="red small">${error.message}</div></div>`;
  if (!d) return html`<div class="card" style="margin-bottom:14px"><${Skel} hgt="64"/></div>`;
  const p = d.policy;
  if (!p) return html`<div class="card" style="margin-bottom:14px"><h3>Generation pause</h3><div class="small dim">No finished portrait yet, so no pause policy has started for this session.</div></div>`;
  const left = p.cooling_now ? Math.max(0, Math.round((new Date(p.cooldown_until) - Date.now()) / 1000)) : 0;
  const hot = p.version === 2 ? p.rapid_streak + ' of ' + p.next_threshold + ' hot portraits to the next pause' : 'older rules (policy v' + p.version + ')';
  return html`<div class="card" style="margin-bottom:14px"><h3>Generation pause <span class="grow"></span><span class=${'tag ' + (p.cooling_now ? 'amber' : '')}>${p.cooling_now ? 'cooling down · ' + mmss(left) + ' left' : 'not cooling down'}</span></h3>
    <div class="row between small"><span class="muted">Pauses so far</span><b>${p.cooldown_count}</b></div>
    <div class="row between small"><span class="muted">Current streak</span><b>${hot}</b></div>
    <div class="row between small"><span class="muted">Last finished portrait</span><b>${when(p.last_success_at)}</b></div>
    <div class="row between small"><span class="muted">Email unlock</span><b>${p.email_bonus_granted_at ? 'unlocked ' + when(p.email_bonus_granted_at) + (p.email_bonus_limit ? ' (+' + p.email_bonus_limit + ')' : '') : 'not used'}</b></div>
    ${d.events.length ? html`<table class="tbl" style="margin-top:8px"><thead><tr><th class="num">#</th><th class="num">After</th><th>Started</th><th>Ended</th><th>Next portrait</th></tr></thead><tbody>${d.events.map(e => html`<tr><td class="num">${e.ordinal}</td><td class="num">${e.threshold} hot</td><td>${when(e.started_at)}</td><td>${when(e.expires_at)}</td><td>${e.next_generation_at ? when(e.next_generation_at) + ' (' + mmss(e.seconds_to_next) + ' later)' : html`<span class="dim">none yet</span>`}</td></tr>`)}</tbody></table>`
      : html`<div class="tiny dim" style="margin-top:6px">${p.cooldown_count ? 'Timed history is only kept from ' + (d.tracking_since ? when(d.tracking_since) : 'when the event log goes live') + '; these pauses are counted but have no timestamps.' : 'No pause has happened.'}</div>`}</div>`;
}
