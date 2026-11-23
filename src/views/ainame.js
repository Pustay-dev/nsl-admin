import { html, useState, useEffect, useRef, Icon } from '../ui.js';
import { rpc } from '../api.js';
import { toast } from '../store.js';

// "AI name": asks the n8n tester (Gemini) for 6 Czech name ideas. getContext() -> { text, audience, collection, hint, existing[] }.
export function AiName({ target, getContext, onPick, disabled, label = 'AI name' }) {
  const [busy, setBusy] = useState(false);
  const [names, setNames] = useState(null);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  const run = async () => {
    setBusy(true); setNames(null);
    try {
      const { id } = await rpc('admin_ai_name', { p_target: target, p_context: getContext() });
      for (let i = 0; i < 40 && alive.current; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const r = await rpc('admin_pt_get', { p_id: id });
        if (r.status === 'done') { setNames(r.result?.names || []); return; }
        if (r.status === 'failed') throw new Error(r.error || 'AI_NAME_FAILED');
      }
      throw new Error('TIMED_OUT');
    } catch (e) { toast(e.message, 'err', 6000); } finally { if (alive.current) setBusy(false); }
  };
  return html`<div class="col" style="gap:6px">
    <div class="row" style="gap:6px"><button type="button" class="btn sm ghost" disabled=${disabled || busy} onClick=${run}><${Icon} n="wand" s="13"/>${busy ? 'Thinking…' : label}</button></div>
    ${names && (names.length ? html`<div class="col" style="gap:4px">${names.map(n => html`<button type="button" class="btn ghost" style="justify-content:flex-start;text-align:left;gap:8px" onClick=${() => { onPick(n); setNames(null); }}>
        <b>${n.name}</b><span class="tiny dim">${n.id}</span><span class="tiny muted trunc">${n.tagline}</span></button>`)}
      <button type="button" class="btn ghost sm" style="align-self:flex-start" onClick=${run}>more ideas</button></div>` : html`<div class="tiny dim">No usable names. Try again.</div>`)}
  </div>`;
}
