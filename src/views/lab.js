import { html, useState, useEffect, useRef, useMemo, Icon, Pill, Skel, SImg, Lightbox, Modal, copy, confirm, useLoad } from '../ui.js';
import { rpc, sb, signed, fmt } from '../api.js';
import { toast, useStore } from '../store.js';

const SLOTS = [
  { slot: 'family', label: 'Family photo', hint: 'group, several faces', subjects: 0 },
  { slot: 'kid', label: 'Kid face', hint: 'child, close-up', subjects: 1 },
  { slot: 'selfie', label: 'Bad selfie', hint: 'low light / blur / angle', subjects: 1 },
];
const LAYERS = [
  { k: 'variant_prompt', label: 'Variant prompt', hint: 'cast, wardrobe, pose for this audience', rows: 7 },
  { k: 'base_prompt', label: 'Style base prompt', hint: 'the look of the whole style (all variants)', rows: 9, needsBase: true },
  { k: 'ref_suffix', label: 'Reference image text', hint: 'text sent with the style reference image', rows: 5, needsRef: true },
  { k: 'global_identity', label: 'Global rules', hint: 'EVERY style, EVERY customer. Owner only.', rows: 9, owner: true },
];

async function toJpeg(file, max = 2000) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return await new Promise(r => c.toBlob(r, 'image/jpeg', 0.92));
}

function Photos({ state, editable, reload }) {
  const [busy, setBusy] = useState('');
  const [lb, setLb] = useState(null);
  const bySlot = Object.fromEntries(state.photos.map(p => [p.slot, p]));
  const upload = async (slot, file, subjects) => {
    if (!file) return; setBusy(slot);
    try {
      const blob = await toJpeg(file);
      const path = `photos/${slot}/${crypto.randomUUID()}.jpg`;
      const { error } = await sb().storage.from('prompt-tests').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
      if (error) throw new Error(error.message);
      await rpc('admin_pt_photo_set', { p_slot: slot, p_path: path, p_subjects: subjects });
      toast('Photo saved'); reload(true);
    } catch (e) { toast(e.message, 'err', 6000); } finally { setBusy(''); }
  };
  const setSubjects = async (slot, n) => { try { await rpc('admin_pt_photo_set', { p_slot: slot, p_path: bySlot[slot].path, p_subjects: n }); reload(true); } catch (e) { toast(e.message, 'err'); } };
  return html`<div class="card"><h3>The 3 hard photos <span class="grow"></span><span class="tiny dim">private</span></h3>
    <div class="grid g3">${SLOTS.map(s => { const p = bySlot[s.slot]; return html`<div class="col" style="gap:8px">
      <div class="row between small"><b>${s.label}</b><span class="tiny dim">${s.hint}</span></div>
      <div style="aspect-ratio:1/1;border:1px solid var(--line2);border-radius:var(--r);overflow:hidden;background:var(--bg2);display:grid;place-items:center;cursor:${p ? 'zoom-in' : 'default'}" onClick=${() => p && signed(p.path, 'prompt-tests').then(setLb)}>
        ${p ? html`<${SImg} path=${p.path} bucket="prompt-tests" alt=${s.label}/>` : html`<span class="dim small">no photo yet</span>`}</div>
      <div class="row" style="gap:6px">
        ${editable && html`<label class="btn sm" style="cursor:pointer"><${Icon} n="upload" s="13"/>${busy === s.slot ? 'Uploading…' : p ? 'Replace' : 'Upload'}<input type="file" accept="image/*" hidden onChange=${e => { upload(s.slot, e.target.files[0], p ? p.subjects : s.subjects); e.target.value = ''; }}/></label>`}
        ${p && html`<label class="tiny dim row" style="gap:4px">people/pets <select class="in" style="width:auto;padding:2px 6px" value=${p.subjects} disabled=${!editable} onChange=${e => setSubjects(s.slot, Number(e.target.value))}><option value="0">auto</option><option value="1">1</option><option value="2">2</option><option value="3">3</option></select></label>`}</div></div>`; })}</div>
    <div class="tiny dim" style="margin-top:8px">“people/pets” = how many main subjects the test tells the model to draw (like the customer's choice). Auto lets the model decide.</div>
    ${lb && html`<${Lightbox} src=${lb} alt="test photo" onClose=${() => setLb(null)}/>`}</div>`;
}

// Regenerate ONE photo with the ChatGPT subscription (no API cost): copy the exact prompt, download the originals, generate in ChatGPT, upload the result back.
function ChatGptModal({ run, slot, label, onClose, onAttached }) {
  const q = useLoad(() => rpc('admin_pt_prompt', { p_run: run.id, p_slot: slot }), [run.id, slot]);
  const [photoUrl, setPhotoUrl] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (q.data) signed(q.data.photo_path, 'prompt-tests').then(setPhotoUrl); }, [q.data]);
  const refUrl = useMemo(() => {
    if (!q.data?.reference_base64) return null;
    const bin = atob(q.data.reference_base64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return URL.createObjectURL(new Blob([u8], { type: 'image/jpeg' }));
  }, [q.data]);
  const upload = async file => {
    if (!file) return; setBusy(true);
    try {
      const blob = await toJpeg(file, 2400);
      const path = `attach/${run.id}/${slot}-${crypto.randomUUID()}.jpg`;
      const { error } = await sb().storage.from('prompt-tests').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
      if (error) throw new Error(error.message);
      await rpc('admin_pt_attach', { p_run: run.id, p_slot: slot, p_path: path });
      toast('Result replaced with your ChatGPT image'); onAttached(); onClose();
    } catch (e) { toast(e.message, 'err', 6000); } finally { setBusy(false); }
  };
  return html`<${Modal} title=${'Regenerate in ChatGPT · ' + label} onClose=${onClose} footer=${html`<button class="btn ghost" onClick=${onClose}>Close</button>`}>
    ${q.error ? html`<div class="red">${q.error.message}</div>` : !q.data ? html`<${Skel} hgt="200"/>` : html`<div class="col" style="gap:10px;margin-top:8px">
      <div class="muted small">Free with your ChatGPT subscription. Four quick steps:</div>
      <ol class="small" style="margin:0 0 0 18px;display:grid;gap:4px"><li><b>Download</b> the photo${q.data.has_reference ? ' and the style reference' : ''} below.</li><li><b>Copy the prompt</b>, open ChatGPT (new chat, image mode), attach ${q.data.has_reference ? 'both images' : 'the photo'} and paste the prompt.</li><li>Save the image ChatGPT makes.</li><li><b>Upload</b> it here. It replaces this result.</li></ol>
      <div class="row wrap" style="gap:8px">
        ${photoUrl && html`<a class="btn sm" href=${photoUrl} download=${slot + '-photo.jpg'} target="_blank" rel="noopener"><${Icon} n="upload" s="13"/>Photo</a>`}
        ${refUrl && html`<a class="btn sm" href=${refUrl} download="style-reference.jpg"><${Icon} n="upload" s="13"/>Style reference</a>`}
        <a class="btn sm" href="https://chatgpt.com/" target="_blank" rel="noopener"><${Icon} n="ext" s="13"/>Open ChatGPT</a></div>
      <textarea class="in" readonly rows="10" style="font:12px/1.5 var(--mono)" value=${q.data.prompt}></textarea>
      <div class="row wrap" style="gap:8px"><button class="btn" onClick=${() => { copy(q.data.prompt); toast('Prompt copied'); }}><${Icon} n="copy" s="13"/>Copy prompt</button>
        <label class="btn primary" style="cursor:pointer"><${Icon} n="upload" s="13"/>${busy ? 'Uploading…' : 'Upload ChatGPT result'}<input type="file" accept="image/*" hidden disabled=${busy} onChange=${e => { upload(e.target.files[0]); e.target.value = ''; }}/></label></div>
      
    </div>`}</${Modal}>`;
}

function Results({ run, state, onApply, onUndo, canApply, canUndo, busy, onAttached, editable }) {
  const [lb, setLb] = useState(null);
  const [gpt, setGpt] = useState(null);
  const slots = run?.result?.slots || [];
  const bySlot = Object.fromEntries(slots.map(s => [s.slot, s]));
  const photo = Object.fromEntries(state.photos.map(p => [p.slot, p]));
  const waiting = run && (run.status === 'queued' || run.status === 'running');
  return html`<div class="card"><h3>Test result <span class="grow"></span>${run && html`<${Pill} s=${run.status === 'done' ? 'live' : run.status === 'failed' ? 'failed' : 'review'} label=${run.status}/>`}</h3>
    ${!run ? html`<div class="dim small">Edit a layer, then run the test (about 3 minutes).</div>` : html`<div class="col" style="gap:10px">
      ${waiting && html`<div class="row small"><span class="skel" style="width:14px;height:14px;border-radius:50%"></span>Generating on the 3 hard photos… ${run.status === 'queued' ? 'waiting for n8n' : 'running'}</div>`}
      ${run.status === 'failed' && html`<div class="red small">Test failed: ${run.error || 'unknown'}. ${run.error === 'WEBHOOK_CALL_FAILED' || run.error === 'WEBHOOK_NOT_CONFIGURED' ? 'The n8n prompt tester is not connected.' : run.error === 'TIMED_OUT' ? 'n8n did not answer: is the “prompt tester” workflow active?' : ''}</div>`}
      <div class="col" style="gap:12px">${SLOTS.map(s => { const r = bySlot[s.slot]; return html`<div class="col" style="gap:6px"><div class="row between"><span class="tiny dim">${s.label}${r?.source === 'chatgpt' ? ' · from ChatGPT' : ''}</span>${editable && !waiting && run.id && html`<button class="btn ghost sm" onClick=${() => setGpt(s)}><${Icon} n="refresh" s="12"/>Regenerate in ChatGPT</button>`}</div>
        <div style="display:grid;grid-template-columns:1fr 2.4fr;gap:8px;align-items:start">
          <div style="aspect-ratio:3/4;border-radius:6px;overflow:hidden;background:var(--bg2)">${photo[s.slot] && html`<${SImg} path=${photo[s.slot].path} bucket="prompt-tests"/>`}</div>
          <div style="aspect-ratio:2/3;border-radius:6px;overflow:hidden;background:var(--bg2);display:grid;place-items:center;cursor:${r?.ok ? 'zoom-in' : 'default'}" onClick=${() => r?.ok && signed(r.path, 'prompt-tests').then(setLb)}>
            ${r?.ok ? html`<${SImg} path=${r.path} bucket="prompt-tests" alt=${s.label + ' result'}/>` : waiting ? html`<div class="skel" style="width:100%;height:100%"></div>` : html`<span class="red tiny" style="padding:6px;text-align:center">${r?.error || '–'}</span>`}</div></div></div>`; })}</div>
      ${run.status === 'done' && html`<div class="row wrap" style="gap:8px">
        ${canApply && html`<button class="btn primary" disabled=${busy} onClick=${onApply}><${Icon} n="check" s="14"/>Apply to live style</button>`}
        ${canUndo && html`<button class="btn danger" disabled=${busy} onClick=${onUndo}><${Icon} n="reset" s="14"/>Undo apply</button>`}
        ${run.applied_at && !run.reverted_at && html`<span class="acid small">applied ${fmt.ago(run.applied_at)} ago</span>`}${run.reverted_at && html`<span class="amber small">reverted</span>`}</div>`}
    </div>`}
    ${lb && html`<${Lightbox} src=${lb} alt="result" onClose=${() => setLb(null)}/>`}
    ${gpt && html`<${ChatGptModal} run=${run} slot=${gpt.slot} label=${gpt.label} onClose=${() => setGpt(null)} onAttached=${onAttached}/>`}</div>`;
}

export function TestLab({ style, onChanged }) {
  const role = useStore(s => s.role); const editable = role !== 'viewer'; const owner = role === 'owner';
  const st = useLoad(() => rpc('admin_pt_state'), []);
  const [vid, setVid] = useState(style.variants.find(v => v.status === 'live')?.id || style.variants[0]?.id);
  const layers = useLoad(() => vid ? rpc('admin_pt_layers', { p_variant_id: vid }) : null, [vid]);
  const [draft, setDraft] = useState({});
  const [useRef_, setUseRef] = useState(true);
  const [ai, setAi] = useState({ text: '', pick: { variant_prompt: true } });
  const [runId, setRunId] = useState(null);
  const [run, setRun] = useState(null);
  const [refId, setRefId] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const prev = useRef({});

  useEffect(() => { setDraft({}); setNote(''); setRun(null); setRunId(null); }, [vid]);
  const cur = k => (draft[k] !== undefined ? draft[k] : (layers.data?.[k] ?? ''));
  const changed = k => draft[k] !== undefined && draft[k].trim() !== String(layers.data?.[k] ?? '').trim();
  const overrides = () => {
    const o = {}; for (const l of LAYERS) if (changed(l.k)) o[l.k] = draft[l.k].trim();
    if (layers.data?.has_reference && !useRef_) o.use_reference = false;
    return o;
  };
  const textLayers = () => LAYERS.filter(l => changed(l.k));

  // poll the current test / refine run
  useEffect(() => {
    const id = runId || refId; if (!id) return;
    let stop = false;
    const tick = async () => {
      try {
        const r = await rpc('admin_pt_get', { p_id: id }); if (stop) return;
        if (runId) setRun(r);
        if (r.status === 'done' || r.status === 'failed') {
          if (runId) st.reload(true);
          if (refId) {
            setRefId(null); setBusy(false);
            if (r.status === 'done' && r.result?.layers) { prev.current = { ...draft }; setDraft(d => ({ ...d, ...r.result.layers })); setNote(r.result.rationale || ''); toast('AI suggestion loaded: review, then run the test'); }
            else toast('AI could not refine: ' + (r.error || 'try again'), 'err', 6000);
          }
          return;
        }
      } catch (e) { if (!stop) toast(e.message, 'err'); return; }
      if (!stop) setTimeout(tick, 5000);
    };
    const t = setTimeout(tick, 2500);
    return () => { stop = true; clearTimeout(t); };
  }, [runId, refId]);

  const refine = async () => {
    const pick = LAYERS.filter(l => ai.pick[l.k] && (!l.owner || owner)).map(l => l.k);
    const payload = {}; for (const k of pick) payload[k] = cur(k);
    setBusy(true); setNote('');
    try { const r = await rpc('admin_pt_refine', { p_variant_id: vid, p_instruction: ai.text, p_layers: payload, p_run: runId }); setRefId(r.id); }
    catch (e) { toast(e.message, 'err', 6000); setBusy(false); }
  };
  const start = async () => {
    const o = overrides();
    const n = textLayers().length;
    if (!(await confirm({ title: 'Run test on the 3 hard photos?', body: `3 paid image generations (≈ ${fmt.czk(3 * 6)}) with the live model and recipe. ${n ? 'Only the layers you changed are overridden; nothing goes live until you press Apply.' : 'No layer changed: this re-tests the current live prompt.'}`, ok: 'Run test' }))) return;
    setBusy(true);
    try { const r = await rpc('admin_pt_start', { p_variant_id: vid, p_overrides: o }); setRun({ id: r.id, status: 'queued' }); setRunId(r.id); st.reload(true); }
    catch (e) { toast(e.message, 'err', 7000); } finally { setBusy(false); }
  };
  const apply = async () => {
    const ls = Object.keys(run.overrides || {}).filter(k => k !== 'use_reference');
    const names = ls.map(k => LAYERS.find(l => l.k === k)?.label).join(', ');
    if (!(await confirm({ title: 'Apply to the LIVE style?', body: `This changes what every customer's portrait uses, immediately: ${names}.${ls.includes('global_identity') ? ' GLOBAL RULES affect every style.' : ''} You can undo it from this page.`, ok: 'Apply live', type: 'APPLY' }))) return;
    setBusy(true);
    try { await rpc('admin_pt_apply', { p_id: run.id }); toast('Applied. Live now.'); const r = await rpc('admin_pt_get', { p_id: run.id }); setRun(r); layers.reload(true); setDraft({}); st.reload(true); onChanged && onChanged(); }
    catch (e) { toast(e.message === 'STYLE_CHANGED_SINCE_TEST' ? 'Someone changed this style after the test. Run the test again.' : e.message, 'err', 7000); } finally { setBusy(false); }
  };
  const undo = async () => {
    if (!(await confirm({ title: 'Undo this apply?', body: 'Restores the previous text of the applied layers on the live style.', ok: 'Restore previous', danger: true }))) return;
    setBusy(true);
    try { await rpc('admin_pt_revert', { p_id: run.id }); toast('Restored'); const r = await rpc('admin_pt_get', { p_id: run.id }); setRun(r); layers.reload(true); st.reload(true); onChanged && onChanged(); }
    catch (e) { toast(e.message === 'CHANGED_SINCE_APPLY' ? 'The text changed after applying; cannot undo automatically.' : e.message, 'err', 7000); } finally { setBusy(false); }
  };
  const openRun = async id => { try { const r = await rpc('admin_pt_get', { p_id: id }); if (r.kind !== 'test') return; setVid(r.variant); setTimeout(() => { setRun(r); setRunId(r.status === 'queued' || r.status === 'running' ? r.id : null); setDraft(r.overrides || {}); }, 50); } catch (e) { toast(e.message, 'err'); } };

  if (st.error) return html`<div class="red">${st.error.message}</div>`;
  if (!st.data) return html`<${Skel} hgt="300"/>`;
  const S = st.data, L = layers.data;
  const ready = S.photos.length === 3;
  const canApply = editable && run?.status === 'done' && !run.applied_at && Object.keys(run.overrides || {}).some(k => k !== 'use_reference');
  const canUndo = editable && run?.applied_at && !run.reverted_at;
  const anyPick = LAYERS.some(l => ai.pick[l.k] && (!l.owner || owner));

  return html`<div class="col" style="gap:12px">
    ${!S.webhook_ready && html`<div class="card amber small">The n8n prompt tester is not connected yet (import and activate the workflow, then the webhook address is saved).</div>`}
    <${Photos} state=${S} editable=${editable} reload=${st.reload}/>
    <div class="row wrap"><select class="in" style="max-width:340px" value=${vid} onChange=${e => setVid(e.target.value)}>${style.variants.map(v => html`<option value=${v.id}>${v.name} · ${v.audience || '–'} · ${v.status}</option>`)}</select>
      <span class="grow"></span><span class="tiny dim">tests today ${S.today}/${S.cap} · AI refine is cheap, tests cost money</span></div>
    ${!L ? html`<${Skel} hgt="240"/>` : html`<div class="col" style="gap:12px">
      <div class="col" style="gap:10px">
        <div class="card"><h3>Prompt layers <span class="tiny dim">(live text; edit only what you want to test)</span></h3>
          <div class="col" style="gap:12px">${LAYERS.map(l => {
            if (l.needsBase && !L.uses_family_base) return html`<div class="tiny dim">${l.label}: this variant has its own standalone prompt (does not use the style base).</div>`;
            if (l.needsRef && !L.has_reference) return null;
            const dis = !editable || (l.owner && !owner);
            return html`<div class="col" style="gap:4px"><div class="row between"><label class="small"><b>${l.label}</b> ${changed(l.k) && html`<span class="acid tiny">● changed</span>`} <span class="tiny dim">${l.hint}</span></label>
                <label class="tiny dim row" style="gap:4px"><input type="checkbox" checked=${!!ai.pick[l.k]} disabled=${l.owner && !owner} onChange=${e => setAi({ ...ai, pick: { ...ai.pick, [l.k]: e.target.checked } })}/>AI may edit</label></div>
              <textarea class="in" rows=${l.rows} style="font:12px/1.5 var(--mono);resize:vertical" disabled=${dis || busy && !!refId} value=${cur(l.k)} onInput=${e => setDraft({ ...draft, [l.k]: e.target.value })}></textarea>
              ${changed(l.k) && html`<button class="btn ghost sm" style="align-self:flex-start" onClick=${() => { const d = { ...draft }; delete d[l.k]; setDraft(d); }}>reset to live</button>`}</div>`; })}
            ${L.has_reference && html`<label class="row small" style="gap:8px"><input type="checkbox" checked=${useRef_} onChange=${e => setUseRef(e.target.checked)}/>Send the style reference image with the photos <span class="tiny dim">(uncheck to test without it)</span></label>`}
          </div></div>
        <div class="card"><h3><${Icon} n="wand" s="15"/> Refine with AI</h3>
          <div class="col" style="gap:8px"><textarea class="in" rows="3" placeholder="What is wrong? e.g. “the child looks too old and the faces turn into cartoons”, “family members get merged”, “selfie lighting makes skin grey”" value=${ai.text} onInput=${e => setAi({ ...ai, text: e.target.value })}></textarea>
            <div class="row"><button class="btn" disabled=${!editable || busy || ai.text.trim().length < 3 || !anyPick} onClick=${refine}>${refId ? 'Thinking…' : 'Refine ticked layers'}</button>
              ${Object.keys(prev.current).length > 0 && html`<button class="btn ghost sm" onClick=${() => { setDraft(prev.current); prev.current = {}; setNote(''); }}>undo AI edit</button>`}</div>
            ${note && html`<div class="small muted"><b>AI:</b> ${note}</div>`}
            </div></div>
      </div>
      <div class="col" style="gap:10px">
        <${Results} run=${run} state=${S} onApply=${apply} onUndo=${undo} canApply=${canApply} canUndo=${canUndo} busy=${busy} editable=${editable} onAttached=${async () => { try { setRun(await rpc('admin_pt_get', { p_id: run.id })); } catch (e) { toast(e.message, 'err'); } }}/>
        <button class="btn primary" style="justify-content:center;padding:12px" disabled=${!editable || busy || !ready || !S.webhook_ready || (run && (run.status === 'queued' || run.status === 'running')) || S.today >= S.cap} onClick=${start}><${Icon} n="bolt" s="14"/>${!ready ? 'Upload all 3 photos first' : `Run test on 3 hard photos${textLayers().length ? ' (' + textLayers().length + ' layer' + (textLayers().length > 1 ? 's' : '') + ' changed)' : ' (live prompt)'}`}</button>
        <div class="card"><h3>Recent tests</h3>${S.runs.filter(r => r.kind === 'test').length ? S.runs.filter(r => r.kind === 'test').map(r => html`<div class="row between small click" style="padding:4px 0;cursor:pointer" onClick=${() => openRun(r.id)}><span class="trunc">${r.variant}</span><span class="row" style="gap:8px"><${Pill} s=${r.status === 'done' ? 'live' : r.status === 'failed' ? 'failed' : 'review'} label=${r.status}/>${r.applied && html`<span class="acid tiny">applied</span>`}<span class="tiny dim">${fmt.ago(r.at)}</span></span></div>`) : html`<span class="dim small">No tests yet.</span>`}</div>
      </div></div>`}
  </div>`;
}
