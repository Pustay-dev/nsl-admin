// Mails menu group: Mail analytics (delivery numbers, lifecycle reach, honest follow-up comparison) and Mail A/B (customer mails).
// Data: admin_mail_report, admin_mail_ab_* (migration 20261118153000_mail_analytics_ab_v1). Nothing here sends or enqueues mail.
// A/B assignment is NOT wired into the enqueue path yet (docs/MAIL-AB.md); the list RPC reports `wired`, the UI says "Preview only" until then.
import { html, useState, Icon, Pill, Modal, Seg, Empty, Skel, Kpi, HBar, confirm, useLoad, usePoll } from '../ui.js';
import { rpc, fmt } from '../api.js';
import { toast, useStore } from '../store.js';
import { compare } from './experiments.js';

const pct = (x, n) => (n ? (100 * x / n).toFixed(x / n < 0.1 ? 1 : 0) + ' %' : '–');
const secs = s => (s == null ? '–' : s < 120 ? Math.round(s) + ' s' : s < 7200 ? Math.round(s / 60) + ' min' : s < 172800 ? (s / 3600).toFixed(1) + ' h' : (s / 86400).toFixed(1) + ' d');
const KIND = {
  supplier_order: 'Order to Kviktisk', supplier_order_test: 'Kviktisk test', customer_paid: 'Customer: paid', customer_printing: 'Customer: printing',
  customer_shipped: 'Customer: shipped', customer_delivered: 'Customer: delivered', followup: 'Follow-up',
};
const kindLabel = k => KIND[k] || k;
// sample size per arm for a two-sided test, alpha 0.05, power 80 % (same formula as cx.js perArm)
const perArm = (p, lift) => (p > 0 && p < 1 && lift > 0 ? Math.ceil((15.7 * p * (1 - p)) / Math.pow(p * lift, 2)) : null);

const friendly = e => {
  const m = String(e?.message || e || '');
  const map = {
    ADMIN_ROLE_INSUFFICIENT: 'You need the editor role for this.', MAIL_AB_SENDING_OFF: 'Sending is OFF in Mail settings, so the test stays a draft. Nothing was sent.',
    MAIL_AB_STAGE_BUSY: 'Another test is already running on this mail. Stop it first.', MAIL_AB_LOCKED: 'Only draft tests can be edited (results must stay comparable).',
    MAIL_AB_BAD_TRANSITION: 'That status change is not allowed (stopped tests cannot restart; make a new test).', MAIL_AB_VARIANT_EMPTY: 'Write the B subject line.',
    MAIL_AB_NAME_REQUIRED: 'Give the test a name.', MAIL_AB_CLICKS_NOT_TRACKED: 'Clicks are not tracked yet; pick another goal.', MAIL_AB_INVALID_SPLIT: 'Split must be between 10 and 90 %.',
    MAIL_AB_RULE_NOT_FOUND: 'That follow-up rule no longer exists.', INVALID_MAIL_STAGE: 'Pick a mail.', INVALID_TEMPLATE: 'Subject is too long (max 200).', MAIL_AB_NOT_FOUND: 'Test not found.',
  };
  for (const k in map) if (m.includes(k)) return map[k];
  return m;
};

function Note({ tone, children }) {
  return html`<div class=${'card ' + (tone || '')} style="margin-bottom:12px;padding:10px 14px">${children}</div>`;
}

/* =============================== Mail analytics =============================== */
function StatusRow({ c }) {
  const v = k => fmt.n(c?.[k] || 0);
  return html`<span class="tiny">${v('sent')} sent · ${v('queued')} queued · ${v('leased')} sending · ${v('failed')} failed · ${v('needs_review')} needs review · ${v('cancelled')} cancelled</span>`;
}

export function MailAnalytics(props = {}) {
  const [days, setDays] = useState(props.days || 30);
  const { data: d, loading, error, reload } = useLoad(() => rpc('admin_mail_report', { p_days: days }), [days]);
  usePoll(() => reload(true), 60000);
  if (error && !d) return html`<div class="card red">${String(error.message || error)}</div>`;
  const real = d?.real || {}, test = d?.test || {};
  const problems = (real.failed || 0) + (real.needs_review || 0);
  const kinds = d?.by_kind || [], rules = d?.by_rule || [], life = d?.lifecycle || [], fx = d?.followup_effect, codes = d?.failure_codes || [];
  const maxLife = Math.max(1, ...life.map(s => s.orders || 0));
  const fxSmall = fx && (Math.min(fx.recipients, fx.non_recipients) < 30 || fx.recipients_paid + fx.non_recipients_paid < 10);
  return html`<div>
    <div class="row" style="margin-bottom:12px;gap:10px;flex-wrap:wrap">
      <h2 style="margin:0">Mail analytics</h2><span class="grow"></span>
      <${Seg} value=${days} onChange=${setDays} options=${[{ v: 7, l: '7 d' }, { v: 30, l: '30 d' }, { v: 90, l: '90 d' }]}/>
    </div>
    <${Note}><b>Opens/clicks are not tracked yet.</b> <span class="tiny dim">There is no tracking pixel and no tracked links, so this page shows delivery (queued → sent), lifecycle reach and later paid orders only. Test mails (redirected, <code>test:</code> keys, Kviktisk tests) are excluded from the real numbers and counted separately.</span>
      ${d?.settings && !d.settings.sending_enabled && html`<div class="tiny amber" style="margin-top:4px">Sending is OFF: mails can be queued but nothing leaves, so "sent" stays 0 for now.</div>`}
    </${Note}>
    ${loading && !d ? html`<${Skel} hgt="260"/>` : html`
    <div class="grid g4" style="margin-bottom:12px">
      <${Kpi} label="Sent (real)" v=${real.sent || 0} sub=${'of ' + fmt.n(real.total || 0) + ' real mails'}/>
      <${Kpi} label="Waiting" v=${(real.queued || 0) + (real.leased || 0)} sub="queued or being sent"/>
      <${Kpi} label="Problems" v=${problems} tone=${problems ? 'red' : ''} sub="failed or needs review"/>
      <${Kpi} label="Test mails" v=${test.total || 0} sub=${fmt.n(test.redirected || 0) + ' redirected · not in real numbers'}/>
    </div>

    <div class="grid g2" style="margin-bottom:12px">
      <div class="card"><h3>Customer vs supplier mails</h3>
        ${(d.by_audience || []).length ? (d.by_audience || []).map(a => html`<div class="row" style="gap:10px;margin:6px 0">
          <b style="width:90px">${a.audience === 'customer' ? 'Customers' : 'Kviktisk'}</b>
          <span class="tiny">${fmt.n(a.sent)} sent · ${fmt.n(a.waiting)} waiting · <span class=${a.problems ? 'red' : ''}>${fmt.n(a.problems)} problems</span> · ${fmt.n(a.total)} total</span></div>`)
          : html`<${Empty}>No real mails in this period.</${Empty}>`}
        <div class="tiny dim" style="margin-top:8px">Real: <${StatusRow} c=${real}/></div>
        <div class="tiny dim">Test: <${StatusRow} c=${test}/></div>
      </div>
      <div class="card"><h3>Time to send <span class="tiny dim">from "due" (queued, or the follow-up send window) to sent</span></h3>
        ${d.time_to_send?.n ? html`<div class="grid g3">
          <div><div class="tiny dim">median</div><b>${secs(d.time_to_send.p50_s)}</b></div>
          <div><div class="tiny dim">90 %</div><b>${secs(d.time_to_send.p90_s)}</b></div>
          <div><div class="tiny dim">slowest</div><b>${secs(d.time_to_send.max_s)}</b></div></div>
          <div class="tiny dim" style="margin-top:6px">${fmt.n(d.time_to_send.n)} real mails sent.</div>`
          : html`<${Empty}>Nothing sent yet, so no send times.</${Empty}>`}
      </div>
    </div>

    <h3>By mail</h3>
    <div class="card tbl-wrap" style="padding:0;margin-bottom:12px"><table class="tbl"><thead><tr><th>Mail</th><th>Sent</th><th>Waiting</th><th>Failed</th><th>Review</th><th class="hide-m">Cancelled</th><th class="hide-m">Send time p50 / p90</th><th>Test</th></tr></thead><tbody>
      ${kinds.map(k => html`<tr><td class="tiny"><b>${kindLabel(k.kind)}</b><div class="dim">${k.audience}</div></td><td>${fmt.n(k.sent)}</td><td>${fmt.n(k.queued)}</td>
        <td class=${k.failed ? 'red' : ''}>${fmt.n(k.failed)}</td><td class=${k.needs_review ? 'amber' : ''}>${fmt.n(k.needs_review)}</td><td class="hide-m">${fmt.n(k.cancelled)}</td>
        <td class="hide-m tiny">${secs(k.p50_send_s)} / ${secs(k.p90_send_s)}</td><td class="dim">${fmt.n(k.test)}</td></tr>`)}
      ${!kinds.length && html`<tr><td colspan="8"><${Empty}>No mails in this period.</${Empty}></td></tr>`}</tbody></table></div>

    <div class="grid g2" style="margin-bottom:12px">
      <div class="card"><h3>Order lifecycle <span class="tiny dim">real paid orders created in the period</span></h3>
        ${life.map(s => html`<div style="margin:8px 0"><div class="row tiny"><b style="text-transform:capitalize">${s.stage}</b><span class="grow"></span>
          ${fmt.n(s.orders)} orders · ${fmt.n(s.mail_sent)} mails sent ${s.mail_enabled ? '' : html`<span class="dim">(mail off)</span>`}</div><${HBar} v=${s.orders} max=${maxLife}/></div>`)}
        ${!life.length && html`<${Empty}>No paid orders in this period.</${Empty}>`}
      </div>
      <div class="card"><h3>Follow-ups: later paid orders</h3>
        ${fx ? html`<div class="grid g2">
          <div><div class="tiny dim">got a follow-up</div><b style="font-size:22px">${pct(fx.recipients_paid, fx.recipients)}</b><div class="tiny dim">${fmt.n(fx.recipients_paid)} of ${fmt.n(fx.recipients)} paid within ${fx.window_days} d</div></div>
          <div><div class="tiny dim">no follow-up</div><b style="font-size:22px">${pct(fx.non_recipients_paid, fx.non_recipients)}</b><div class="tiny dim">${fmt.n(fx.non_recipients_paid)} of ${fmt.n(fx.non_recipients)} paid later</div></div></div>
          <div class="tiny amber" style="margin-top:8px">${fx.caveat}</div>
          ${fxSmall && html`<div class="tiny red" style="margin-top:4px">Too few people to read anything into this yet.</div>`}` : html`<${Empty}>No data.</${Empty}>`}
      </div>
    </div>

    <h3>Follow-up rules</h3>
    <div class="card tbl-wrap" style="padding:0;margin-bottom:12px"><table class="tbl"><thead><tr><th>Rule</th><th>Sent</th><th>Waiting</th><th>Problems</th><th class="hide-m">Unsubscribed</th><th>Test</th></tr></thead><tbody>
      ${rules.map(r => html`<tr><td class="tiny"><b>${r.name}</b> ${!r.active && html`<span class="dim">(off)</span>`}</td><td>${fmt.n(r.sent)}</td><td>${fmt.n(r.queued)}</td>
        <td class=${r.problems ? 'red' : ''}>${fmt.n(r.problems)}</td><td class="hide-m">${fmt.n(r.unsubscribed)}</td><td class="dim">${fmt.n(r.test)}</td></tr>`)}
      ${!rules.length && html`<tr><td colspan="6"><${Empty}>No follow-up rules.</${Empty}></td></tr>`}</tbody></table></div>

    <h3>Failure codes</h3>
    <div class="card tbl-wrap" style="padding:0"><table class="tbl"><thead><tr><th>Code</th><th>Real</th><th>Test</th><th class="hide-m">Mails</th></tr></thead><tbody>
      ${codes.map(c => html`<tr><td class="tiny"><code>${c.code}</code></td><td class=${c.n ? 'red' : ''}>${fmt.n(c.n)}</td><td class="dim">${fmt.n(c.test_n)}</td><td class="hide-m tiny">${(c.kinds || []).map(kindLabel).join(', ')}</td></tr>`)}
      ${!codes.length && html`<tr><td colspan="4"><${Empty}>No failures. </${Empty}></td></tr>`}</tbody></table></div>`}
  </div>`;
}

/* =============================== Mail A/B =============================== */
const ST = { draft: ['draft', 'draft'], running: ['live', 'running'], stopped: ['draft', 'stopped'] };
const pill = s => html`<${Pill} s=${ST[s]?.[0] || s} label=${ST[s]?.[1] || s}/>`;
const GOALS = [
  { v: 'paid_order', l: 'Paid order afterwards' },
  { v: 'reorder', l: 'Another order (re-order)' },
  { v: 'click', l: 'Click (not tracked yet)', off: true },
];
const goalLabel = v => GOALS.find(g => g.v === v)?.l || v;
const VERDICT = {
  not_measurable: ['dim', 'Not measurable', 'Clicks are not tracked yet, so this goal has no data.'],
  no_data: ['dim', 'No real mails yet', 'Nothing of this test has been sent to a real customer yet.'],
  too_small: ['amber', 'Too small to call', null],
  b_better: ['acid', 'B wins', 'B brought more conversions, and the difference is bigger than chance. You can make B the normal text.'],
  a_better: ['red', 'Keep the original (A)', 'The original subject did better. Stop the test and keep A.'],
  no_difference: ['', 'No clear difference', 'Enough mails were sent and neither subject is clearly better. Keep whichever you prefer.'],
};

function TestForm({ mails, test, onClose, onSaved }) {
  const [f, setF] = useState(() => ({ name: '', stage: mails[0]?.stage || 'paid', split: 50, goal: 'paid_order', window_days: 14, variant_b_subject: '', note: '', ...(test || {}) }));
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF({ ...f, [k]: v });
  const mail = mails.find(m => m.stage === f.stage);
  const save = async () => {
    setBusy(true);
    try {
      await rpc('admin_mail_ab_save', { p: { id: test?.id || null, name: f.name, stage: f.stage, split: Number(f.split), goal: f.goal, window_days: Number(f.window_days),
        variant_b_subject: f.variant_b_subject, variant_b_blocks: test?.variant_b_blocks || null, note: f.note } });
      toast('Saved as draft'); onSaved();
    } catch (e) { toast(friendly(e), 'warn', 6000); } finally { setBusy(false); }
  };
  return html`<${Modal} title=${test ? 'Edit draft test' : 'New mail test'} onClose=${onClose}
    footer=${html`<button class="btn ghost" onClick=${onClose}>Cancel</button><button class="btn primary" disabled=${busy || !f.name.trim() || !f.variant_b_subject.trim()} onClick=${save}>Save draft</button>`}>
    <label class="f">Name<input class="in" maxlength="120" placeholder="Paid mail: warmer subject" value=${f.name} onInput=${e => set('name', e.target.value)}/></label>
    <label class="f">Mail<select class="in" value=${f.stage} onChange=${e => set('stage', e.target.value)}>
      ${mails.map(m => html`<option value=${m.stage}>${m.label}${m.active ? '' : ' (off)'}</option>`)}</select></label>
    <div class="tiny dim" style="margin:-4px 0 10px">A (current subject): <b>${mail?.subject || '–'}</b></div>
    <label class="f">B subject<input class="in" maxlength="200" placeholder="Same placeholders work, e.g. {{order_name}}" value=${f.variant_b_subject} onInput=${e => set('variant_b_subject', e.target.value)}/></label>
    <div class="tiny dim" style="margin:-4px 0 10px">Subject-only test: B uses the same body as A.${test?.variant_b_blocks ? ' (This test has a custom B body set via the API; it is kept.)' : ''}</div>
    <label class="f">Split: <b>${f.split} %</b> get B, ${100 - f.split} % get A
      <input type="range" min="10" max="90" step="5" value=${f.split} onInput=${e => set('split', Number(e.target.value))}/></label>
    <div class="grid g2" style="gap:10px">
      <label class="f">Goal<select class="in" value=${f.goal} onChange=${e => set('goal', e.target.value)}>
        ${GOALS.map(g => html`<option value=${g.v} disabled=${g.off}>${g.l}</option>`)}</select></label>
      <label class="f">Count orders within (days)<input class="in" type="number" min="1" max="90" value=${f.window_days} onInput=${e => set('window_days', e.target.value)}/></label>
    </div>
    <label class="f">Note<input class="in" maxlength="500" value=${f.note || ''} onInput=${e => set('note', e.target.value)}/></label>
    <div class="tiny dim">Saving never sends anything. A test can only be started while sending is ON in Mail settings.</div>
  </${Modal}>`;
}

function ArmCard({ k, a, best }) {
  return html`<div class=${'card ab-arm ' + k.toLowerCase() + (best ? ' best' : '')}>
    <div class="row"><span class=${'ab-badge ' + k.toLowerCase()}>${k}</span><span class="muted small">${k === 'A' ? 'current subject' : 'new subject'}</span><span class="grow"></span>${best && html`<span class="tag acid">leading</span>`}</div>
    <div class="ab-rate">${a.conversions == null ? '–' : pct(a.conversions, a.sent)}</div>
    <div class="tiny dim">${a.conversions == null ? 'goal not tracked' : fmt.n(a.conversions) + ' of ' + fmt.n(a.sent) + ' sent converted'}</div>
    <div class="tiny" style="margin-top:6px">${fmt.n(a.recipients)} assigned · ${fmt.n(a.sent)} sent · ${fmt.n(a.queued)} waiting · <span class=${a.failed ? 'red' : ''}>${fmt.n(a.failed)} failed</span></div>
  </div>`;
}

function Results({ id, list }) {
  const { data: r, error, reload } = useLoad(() => rpc('admin_mail_ab_report', { p_id: id }), [id]);
  usePoll(() => reload(true), 30000);
  if (error && !r) return html`<div class="card red">${friendly(error)}</div>`;
  if (!r) return html`<${Skel} hgt="200"/>`;
  const A = r.arms?.A || {}, B = r.arms?.B || {}, t = r.test || {};
  const [tone, head, body] = VERDICT[r.verdict] || ['', r.verdict, ''];
  const sent = (A.sent || 0) + (B.sent || 0);
  const need = r.needed_per_arm || perArm(r.base_rate || 0.02, 0.3);
  const startedDays = t.started_at ? Math.max(1, ((t.stopped_at ? new Date(t.stopped_at).getTime() : Date.now()) - new Date(t.started_at).getTime()) / 864e5) : null;
  const perDay = startedDays && sent ? sent / startedDays : null;
  const daysLeft = perDay ? Math.ceil(Math.max(0, need * 2 - sent) / perDay) : null;
  const xmas = Math.ceil((new Date('2026-12-20T00:00:00+01:00').getTime() - Date.now()) / 864e5);
  const hopeless = daysLeft == null ? need > 300 : daysLeft > xmas;
  const bayes = A.sent && B.sent && A.conversions != null ? compare({ n: A.sent, x: A.conversions }, { n: B.sent, x: B.conversions }) : null;
  const bestB = bayes && bayes.pB >= 0.5;
  return html`<div>
    <div class=${'card ' + (tone === 'red' ? 'red' : '')} style="margin-bottom:12px">
      <div class="row" style="gap:10px"><b class=${tone} style="font-size:18px">${head}</b><span class="grow"></span><span class="tiny dim">${goalLabel(t.goal)} · ${t.window_days} d window</span></div>
      <div class="muted" style="margin-top:4px">${body || r.why}</div>
      <div class="tiny dim" style="margin-top:6px">${r.goal_note}</div>
    </div>
    <div class="card amber" style="margin-bottom:12px;padding:10px 14px">
      <b>Sample size.</b> <span class="tiny">To see a 30 % better result at a ${(100 * (r.base_rate || 0.02)).toFixed(1)} % base rate this test needs about <b>${fmt.n(need)}</b> sent mails per variant (${fmt.n(need * 2)} total); ${fmt.n(sent)} sent so far.
      ${perDay ? ` At the current ${perDay.toFixed(1)} mails/day that is ~${fmt.n(daysLeft)} more days.` : ''}
      ${hopeless && html`<b class="red"> With the current order volume this test cannot reach significance before Christmas.</b> Treat any result as a hint, not proof, or test a bigger change.`}</span>
    </div>
    <div class="grid g2" style="margin-bottom:12px"><${ArmCard} k="A" a=${A} best=${bayes && !bestB}/><${ArmCard} k="B" a=${B} best=${bestB}/></div>
    ${bayes && html`<div class="tiny dim">Bayesian view (same as the website tester): ${(bayes.pB * 100).toFixed(0)} % chance B beats A; lift ${(bayes.lift * 100).toFixed(0)} % (90 % range ${(bayes.lo * 100).toFixed(0)}…${(bayes.hi * 100).toFixed(0)} %).</div>`}
    <div class="tiny dim" style="margin-top:6px">Test mails (redirected / <code>test:</code> keys) never count. ${!list.wired && 'While the hook is missing nobody is assigned, so all numbers stay 0.'}</div>
  </div>`;
}

export function MailAB(props = {}) {
  const role = useStore(s => s.role), canEdit = role === 'owner' || role === 'editor';
  const { data: d, error, reload } = useLoad(() => rpc('admin_mail_ab_list'), []);
  const [open, setOpen] = useState(null);
  const [form, setForm] = useState(null); // {} = new, test = edit
  usePoll(() => reload(true), 30000);
  if (error && !d) return html`<div class="card red">${friendly(error)}</div>`;
  if (!d) return html`<${Skel} hgt="240"/>`;
  const tests = d.tests || [], mails = d.mails || [];
  const label = st => mails.find(m => m.stage === st)?.label || st;
  const sel = tests.find(t => t.id === open);
  const setStatus = async (t, s) => {
    if (s === 'running') {
      if (!d.sending_enabled) { toast(friendly('MAIL_AB_SENDING_OFF'), 'warn', 6000); return; }
      const ok = await confirm({ title: 'Start this test?', body: html`From now on ${t.split} % of <b>${label(t.stage)}</b> recipients are meant to get the B subject. ${!d.wired ? 'Assignment is not wired into sending yet, so in practice nothing changes until the hook is approved.' : ''} Running tests cannot be edited.`, ok: 'Start test' });
      if (!ok) return;
    } else {
      const ok = await confirm({ title: 'Stop this test?', body: 'Stopped tests cannot restart (results would mix). Everyone gets A again.', ok: 'Stop test', danger: true });
      if (!ok) return;
    }
    try { await rpc('admin_mail_ab_set_status', { p_id: t.id, p_status: s }); toast(s === 'running' ? 'Test started' : 'Test stopped'); reload(); } catch (e) { toast(friendly(e), 'warn', 6000); }
  };
  return html`<div>
    <div class="row" style="margin-bottom:12px;gap:10px"><h2 style="margin:0">Mail A/B</h2><span class="grow"></span>
      ${canEdit && html`<button class="btn primary" onClick=${() => setForm({})}><${Icon} n="plus"/> New test</button>`}</div>
    ${!d.wired && html`<${Note} tone="amber"><b>Preview only: variant assignment is not wired into sending yet.</b>
      <span class="tiny dim"> Tests can be prepared and reviewed, but every customer still gets the current mail (A). Wiring needs one approved hook line in the enqueue path (docs/MAIL-AB.md).</span></${Note}>`}
    ${!d.sending_enabled && html`<${Note}><b>Sending is OFF.</b> <span class="tiny dim">Tests stay drafts until sending is switched on in Mail settings. Starting a test never turns sending on.</span></${Note}>`}
    <div class="card tbl-wrap" style="padding:0;margin-bottom:12px"><table class="tbl"><thead><tr><th>Test</th><th>Mail</th><th>Status</th><th class="hide-m">Split B</th><th class="hide-m">Goal</th><th>Assigned A / B</th><th></th></tr></thead><tbody>
      ${tests.map(t => html`<tr class=${open === t.id ? 'sel' : ''} style="cursor:pointer" onClick=${() => setOpen(open === t.id ? null : t.id)}>
        <td class="tiny"><b>${t.name}</b><div class="dim trunc" style="max-width:260px">B: ${t.variant_b_subject || '(custom body)'}</div></td>
        <td class="tiny">${label(t.stage)}</td><td>${pill(t.status)}</td><td class="hide-m">${t.split} %</td><td class="hide-m tiny">${goalLabel(t.goal)}</td>
        <td>${fmt.n(t.assigned_a)} / ${fmt.n(t.assigned_b)}</td>
        <td style="white-space:nowrap" onClick=${e => e.stopPropagation()}>${canEdit && html`
          ${t.status === 'draft' && html`<button class="btn ghost" onClick=${() => setForm(t)}>Edit</button>
            <button class="btn ghost" disabled=${!d.sending_enabled} title=${d.sending_enabled ? '' : 'Sending is OFF'} onClick=${() => setStatus(t, 'running')}>Start</button>`}
          ${t.status !== 'stopped' && html`<button class="btn ghost" onClick=${() => setStatus(t, 'stopped')}>${t.status === 'draft' ? 'Archive' : 'Stop'}</button>`}`}</td></tr>`)}
      ${!tests.length && html`<tr><td colspan="7"><${Empty}>No mail tests yet. ${canEdit ? 'Create one to try a different subject line.' : ''}</${Empty}></td></tr>`}</tbody></table></div>
    ${sel && html`<h3>${sel.name} <span class="tiny dim">${label(sel.stage)} · ${sel.started_at ? 'started ' + fmt.date(sel.started_at) : 'not started'}${sel.stopped_at ? ' · stopped ' + fmt.date(sel.stopped_at) : ''}</span></h3>
      <${Results} id=${sel.id} list=${d}/>`}
    ${form && html`<${TestForm} mails=${mails} test=${form.id ? form : null} onClose=${() => setForm(null)} onSaved=${() => { setForm(null); reload(); }}/>`}
  </div>`;
}
