// System: three cards that matter (engine, money, people). Everything rarely needed is folded inside them or below.
import { FinanceCard } from './finance.js';
import { html, useState, Icon, Pill, Switch, Skel, Empty, confirm, useLoad } from '../ui.js';
import { rpc, fmt } from '../api.js';
import { toast, useStore } from '../store.js';
import { go } from '../router.js';

export function System() {
  const role = useStore(s => s.role); const me = useStore(s => s.user?.email);
  const { data, error, reload } = useLoad(() => rpc('admin_system'));
  const reqs = useLoad(() => role === 'owner' ? rpc('admin_access_requests') : Promise.resolve([]));
  const [bill, setBill] = useState(''); const [fx, setFx] = useState(null);
  const [mem, setMem] = useState({ email: '', role: 'editor' });
  if (error) return html`<div class="page"><div class="card red">${error.message}</div></div>`;
  if (!data) return html`<div class="page"><${Skel} hgt="400"/></div>`;
  const owner = role === 'owner';
  const act = async (fnName, args, msg) => { try { await rpc(fnName, args); toast(msg); reload(true); reqs.reload(true); } catch (e) { toast(e.message, 'err', 6000); } };
  const flip = async on => { if (!on && !(await confirm({ title: 'Stop all generation?', body: 'Customers cannot create portraits until re-enabled.', danger: true, ok: 'Stop', type: 'STOP' }))) return; act('admin_generation_switch', { p_enabled: on }, on ? 'Generation on' : 'Generation stopped'); };
  const requests = owner ? reqs.data || [] : [];
  const fails = data.recent_failures || [];

  return html`<div class="page">
    <div class="head"><h1>System</h1></div>
    <div class="grid g3 sys">
      <section class="card"><h3>Engine</h3>
        <div class="calc">
          <div class="calc-r"><span>Paid generation</span>${owner ? html`<${Switch} on=${data.limits.enabled} onChange=${flip} label="Paid generation"/>` : html`<${Pill} s=${data.limits.enabled ? 'live' : 'failed'} label=${data.limits.enabled ? 'on' : 'off'}/>`}</div>
          <div class="calc-r"><span>Model</span><span class="small">${data.runtime.model}</span></div>
          <div class="calc-r"><span>Failures</span><span class=${fails.length ? 'amber' : 'muted'}>${fails.length || '–'}</span></div>
        </div>
        ${fails.length > 0 && html`<details class="fold"><summary>Recent failures</summary>
          <ul class="list">${fails.slice(0, 8).map(j => html`<li class="click" onClick=${() => go('customers/' + j.session)}><span class="grow trunc">${j.style}<span class="tiny red" style="display:block">${j.error || j.status}</span></span><span class="tiny dim">${fmt.ago(j.at)}</span></li>`)}</ul></details>`}
        <details class="fold"><summary>AI price and settings</summary>
          <div class="col" style="gap:12px">
            <div class="calc-r"><span>Provider</span><span class="small">${data.runtime.provider}</span></div>
            <div class="calc-r"><span>Auto subject detection</span><span>${data.runtime.auto_subjects_ready ? 'on' : 'off'}</span></div>
            <div class="calc-r"><span>Submission cap</span><span>${data.limits.submission_limit >= 2e9 ? '∞' : fmt.n(data.limits.submission_limit)}</span></div>
            <label class="f">Real AI bill so far (USD)<span class="hint">sets the price of one portrait (now $${Number(data.settings.cost_per_generation_usd || 0).toFixed(4)})</span>
              <div class="row"><input class="in" type="number" step="0.01" min="0" placeholder="38.55" value=${bill} disabled=${!owner} onInput=${e => setBill(e.target.value)}/>
              ${bill !== '' && html`<button class="btn primary" onClick=${async () => { try { const r = await rpc('admin_ai_spend_calibrate', { p_actual_usd: Number(bill) }); toast('Calibrated: ' + r.cost_per_generation_usd + ' USD'); setBill(''); reload(true); } catch (e) { toast(e.message, 'err', 6000); } }}>Calibrate</button>`}</div></label>
            <label class="f">USD → Kč
              <div class="row"><input class="in" type="number" step="0.1" value=${fx ?? data.settings.usd_czk ?? 22} disabled=${!owner} onInput=${e => setFx(e.target.value)}/>
              ${fx != null && html`<button class="btn primary" onClick=${() => { act('admin_setting_set', { p_key: 'usd_czk', p_value: Number(fx) }, 'Saved'); setFx(null); }}>Save</button>`}</div></label>
          </div></details>
      </section>

      <${FinanceCard} role=${role}/>

      <section class="card"><h3>People<span class="grow"></span>${requests.length > 0 && html`<span class="tag amber">${requests.length} waiting</span>`}</h3>
        ${requests.map(r => html`<div class="req"><span class="trunc"><b>${r.email}</b><span class="tiny dim" style="display:block">${r.note ? '„' + r.note + '“ · ' : ''}${fmt.ago(r.requested_at)}</span></span>
          <div class="row"><button class="btn primary sm" onClick=${() => act('admin_access_resolve', { p_user_id: r.user_id, p_role: 'editor' }, 'Approved')}>Let in</button>
            <button class="btn ghost sm" onClick=${() => act('admin_access_resolve', { p_user_id: r.user_id, p_role: null }, 'Dismissed')}>No</button></div></div>`)}
        <ul class="list">${data.members.map(m => html`<li><span class="grow trunc">${m.email}<span class="tiny dim" style="display:block">${m.role}${m.mfa ? '' : html` · <span class="amber">no 2FA</span>`}</span></span>
          ${owner && m.email !== me && html`<button class="btn ghost sm" aria-label=${'Remove ' + m.email} onClick=${async () => (await confirm({ title: 'Remove ' + m.email + '?', body: 'They lose admin access immediately.', danger: true, ok: 'Remove' })) && act('admin_member_set', { p_email: m.email, p_role: null }, 'Removed')}><${Icon} n="x" s="13"/></button>`}</li>`)}</ul>
        ${owner && html`<details class="fold"><summary>Add a person</summary><div class="col">
          <input class="in" placeholder="Email" value=${mem.email} onInput=${e => setMem({ ...mem, email: e.target.value })}/>
          <div class="row"><select class="in" value=${mem.role} onChange=${e => setMem({ ...mem, role: e.target.value })}><option value="viewer">viewer · read only</option><option value="editor">editor · styles</option><option value="owner">owner · everything</option></select>
          <button class="btn primary" disabled=${!/.+@.+\..+/.test(mem.email)} onClick=${() => { act('admin_member_set', { p_email: mem.email, p_role: mem.role }, 'Saved'); setMem({ email: '', role: 'editor' }); }}>Add</button></div></div></details>`}
      </section>
    </div>

    <details class="more"><summary>Style factory and change log</summary>
      <div class="grid g2" style="margin-top:12px">
        <div class="card" style="padding:0;overflow:auto"><h3 style="padding:16px 16px 0">Style factory</h3>
          <table class="tbl slim"><tbody>${data.factory.map(r => html`<tr class="click" onClick=${() => go('styles/' + r.family_id)}><td>${r.name}</td><td><${Pill} s=${r.status}/></td><td class="num">${r.previews}/${r.variants}</td><td class="tiny">${fmt.date(r.at)}</td></tr>`)}</tbody></table></div>
        <div class="card" style="padding:0;overflow:auto"><h3 style="padding:16px 16px 0">Change log</h3>
          ${data.audit.length ? html`<table class="tbl slim"><tbody>${data.audit.slice(0, 40).map(a => html`<tr><td class="tiny">${fmt.date(a.at)}</td><td class="tiny">${a.actor}</td><td class="small">${a.action}</td><td class="small trunc" style="max-width:200px">${a.target}</td></tr>`)}</tbody></table>` : html`<div style="padding:16px"><${Empty}>Nothing yet</${Empty}></div>`}</div>
      </div></details>
  </div>`;
}
