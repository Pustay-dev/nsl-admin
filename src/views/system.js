import { html, useState, Icon, Pill, Switch, Skel, Empty, confirm, useLoad } from '../ui.js';
import { rpc, fmt } from '../api.js';
import { toast, useStore } from '../store.js';
import { go } from '../router.js';

export function System() {
  const role = useStore(s => s.role); const me = useStore(s => s.user?.email);
  const { data, error, reload } = useLoad(() => rpc('admin_system'));
  const reqs = useLoad(() => role === 'owner' ? rpc('admin_access_requests') : Promise.resolve([]));
  const [cost, setCost] = useState(null);
  const [mem, setMem] = useState({ email: '', role: 'editor' });
  const [fin, setFin] = useState({ day: new Date().toISOString().slice(0, 10), revenue: '', ads: '', generation: '', printing: '', other: '' });
  if (error) return html`<div class="page"><div class="card red">${error.message}</div></div>`;
  if (!data) return html`<div class="page"><${Skel} hgt="400"/></div>`;
  const owner = role === 'owner';
  const act = async (fnName, args, msg) => { try { await rpc(fnName, args); toast(msg); reload(true); reqs.reload(true); } catch (e) { toast(e.message, 'err', 6000); } };
  const flip = async on => { if (!on && !(await confirm({ title: 'Stop all generation?', body: 'Customers cannot create portraits until re-enabled.', danger: true, ok: 'Stop', type: 'STOP' }))) return; act('admin_generation_switch', { p_enabled: on }, on ? 'Generation on' : 'Generation stopped'); };

  return html`<div class="page">
    <div class="head"><div class="grow"><h1>System</h1></div></div>
    <div class="grid g3">
      <div class="card"><h3>Engine</h3><div class="col" style="gap:12px">
        <div class="row between"><span>Paid generation</span>${owner ? html`<${Switch} on=${data.limits.enabled} onChange=${flip} label="generation"/>` : html`<${Pill} s=${data.limits.enabled ? 'live' : 'failed'}/>`}</div>
        <div class="row between"><span class="muted">Provider / model</span><span class="tiny acid">${data.runtime.provider} · ${data.runtime.model}</span></div>
        <div class="row between"><span class="muted">Auto subject detection</span><span>${data.runtime.auto_subjects_ready ? 'on' : 'off'}</span></div>
        <div class="row between"><span class="muted">Submission cap</span><span>${data.limits.submission_limit >= 2e9 ? '∞' : fmt.n(data.limits.submission_limit)}</span></div>
        <label class="f">Cost per AI submission (Kč) <span class="hint">used for the spend estimate</span>
          <div class="row"><input class="in" type="number" step="0.1" value=${cost ?? data.settings.cost_per_generation_czk} disabled=${!owner} onInput=${e => setCost(e.target.value)}/>
          ${cost != null && html`<button class="btn primary" onClick=${() => { act('admin_setting_set', { p_key: 'cost_per_generation_czk', p_value: Number(cost) }, 'Saved'); setCost(null); }}>Save</button>`}</div></label>
      </div></div>

      <div class="card"><h3>Members</h3>
        ${owner && (reqs.data || []).length > 0 && html`<div class="col" style="margin-bottom:12px;padding:10px;border:1px solid var(--acid);border-radius:var(--r);background:rgba(198,255,51,.05)">
          <div class="tiny acid">ACCESS REQUESTS · ${reqs.data.length}</div>
          ${reqs.data.map(r => html`<div class="col" style="gap:6px"><span class="trunc"><b>${r.email}</b><div class="tiny dim">${r.note ? '“' + r.note + '” · ' : ''}${fmt.ago(r.requested_at)}</div></span>
            <div class="row"><button class="btn primary sm" onClick=${() => act('admin_access_resolve', { p_user_id: r.user_id, p_role: 'editor' }, 'Approved as editor')}>Approve · editor</button>
              <button class="btn sm" onClick=${() => act('admin_access_resolve', { p_user_id: r.user_id, p_role: 'viewer' }, 'Approved as viewer')}>viewer</button>
              <button class="btn ghost sm" onClick=${() => act('admin_access_resolve', { p_user_id: r.user_id, p_role: null }, 'Dismissed')}>Dismiss</button></div></div>`)}
        </div>`}
        <div class="col">${data.members.map(m => html`<div class="row between"><span class="grow trunc"><b>${m.email}</b><div class="tiny dim">${m.role} · ${m.mfa ? html`<span class="acid">mfa ✓</span>` : html`<span class="amber">mfa not set</span>`} · last ${fmt.ago(m.last_sign_in)}</div></span>
          ${owner && m.email !== me && html`<button class="btn ghost sm" aria-label="remove" onClick=${async () => (await confirm({ title: 'Remove ' + m.email + '?', body: 'They lose admin access immediately.', danger: true, ok: 'Remove' })) && act('admin_member_set', { p_email: m.email, p_role: null }, 'Removed')}><${Icon} n="x" s="13"/></button>`}</div>`)}</div>
        ${owner && html`<div class="col" style="margin-top:12px;border-top:1px solid var(--line);padding-top:12px">
          <input class="in" placeholder="email to allow" value=${mem.email} onInput=${e => setMem({ ...mem, email: e.target.value })}/>
          <div class="row"><select class="in" value=${mem.role} onChange=${e => setMem({ ...mem, role: e.target.value })}><option value="viewer">viewer · read only</option><option value="editor">editor · styles & labels</option><option value="owner">owner · everything</option></select>
          <button class="btn primary" disabled=${!/.+@.+\..+/.test(mem.email)} onClick=${() => { act('admin_member_set', { p_email: mem.email, p_role: mem.role }, 'Member saved'); setMem({ email: '', role: 'editor' }); }}>Add</button></div>
          <div class="tiny dim">Or let them use "Create account" on the login page: their request appears above for one-click approval.</div></div>`}
      </div>

      <div class="card"><h3>Finance entry</h3><div class="grid g2">
        <label class="f span2">Day<input class="in" type="date" value=${fin.day} onInput=${e => setFin({ ...fin, day: e.target.value })}/></label>
        ${['revenue', 'ads', 'generation', 'printing', 'other'].map(k => html`<label class="f">${k} (Kč)<input class="in" type="number" value=${fin[k]} onInput=${e => setFin({ ...fin, [k]: e.target.value })}/></label>`)}
        <div class="row end"><button class="btn primary" disabled=${role === 'viewer'} onClick=${() => act('admin_finance_set', { p: Object.fromEntries(Object.entries(fin).map(([k, v]) => [k, k === 'day' ? v : Number(v) || 0])) }, 'Finance saved')}>Save</button></div>
      </div></div>
    </div>

    <div class="grid g2" style="margin-top:12px">
      <div class="card" style="padding:0;overflow:auto"><h3 style="padding:14px 16px 0">Style factory runs</h3>
        <table class="tbl"><thead><tr><th>Style</th><th>Status</th><th class="num">Previews</th><th>When</th></tr></thead><tbody>
        ${data.factory.map(r => html`<tr class="click" onClick=${() => go('styles/' + r.family_id)}><td><b>${r.name}</b><div class="tiny dim">${r.family_id}</div></td><td><${Pill} s=${r.status}/></td><td class="num">${r.previews}/${r.variants}</td><td class="tiny">${fmt.date(r.at)}</td></tr>`)}</tbody></table>
        <div class="tiny dim" style="padding:10px 16px">Example gallery slots: ${Object.entries(data.examples).map(([k, n]) => k + ' ' + n).join(' · ')}</div></div>
      <div class="card" style="padding:0;overflow:auto"><h3 style="padding:14px 16px 0">Recent failures</h3>
        ${data.recent_failures.length ? html`<table class="tbl"><thead><tr><th>Job</th><th>Style</th><th>Error</th><th>When</th></tr></thead><tbody>
        ${data.recent_failures.map(j => html`<tr class="click" onClick=${() => go('customers/' + j.session)}><td class="tiny">${j.ref || j.id.slice(0, 8)}</td><td>${j.style}</td><td><${Pill} s=${j.status}/><div class="tiny red">${j.error || ''}</div></td><td class="tiny">${fmt.ago(j.at)} ago</td></tr>`)}</tbody></table>` : html`<div style="padding:16px"><${Empty}>No failures.</${Empty}></div>`}</div>
    </div>

    <div class="card" style="margin-top:12px;padding:0;overflow:auto"><h3 style="padding:14px 16px 0">Audit log <span class="dim">· every admin write</span></h3>
      ${data.audit.length ? html`<table class="tbl"><thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Target</th><th class="hide-m">Detail</th></tr></thead><tbody>
      ${data.audit.map(a => html`<tr><td class="tiny">${fmt.date(a.at)}</td><td class="tiny">${a.actor}</td><td><span class="acid">${a.action}</span></td><td>${a.target}</td><td class="hide-m tiny dim trunc" style="max-width:380px">${a.detail ? JSON.stringify(a.detail) : ''}</td></tr>`)}</tbody></table>` : html`<div style="padding:16px"><${Empty}>Nothing logged yet.</${Empty}></div>`}</div>
  </div>`;
}
