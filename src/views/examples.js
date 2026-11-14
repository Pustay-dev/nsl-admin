// Example gallery editor: ONE set of 6 slots per style, shown on the shop for every variant of the style.
import { html, useState, useRef, Icon, Pill, Lightbox, Skel, confirm, useLoad } from '../ui.js';
import { rpc, sb } from '../api.js';
import { SUPABASE_URL } from '../config.js';
import { toast, useStore } from '../store.js';

const pub = p => p ? SUPABASE_URL + '/storage/v1/object/public/style-examples/' + p.split('/').map(encodeURIComponent).join('/') : null;

async function jpeg(file, maxW, q) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, maxW / bmp.width);
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(bmp, 0, 0, c.width, c.height);
  return await new Promise(r => c.toBlob(r, 'image/jpeg', q));
}
async function uploadExample(file, familyId, category) {
  if (!/^image\//.test(file.type)) throw new Error('Use a JPG, PNG or WebP image.');
  const [display, thumb] = await Promise.all([jpeg(file, 768, 0.86), jpeg(file, 360, 0.82)]);
  const folder = familyId + '/' + crypto.randomUUID();
  const st = sb().storage.from('style-examples');
  for (const [name, blob] of [['display.jpg', display], ['thumb.jpg', thumb]]) {
    const { error } = await st.upload(folder + '/' + name, blob, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false });
    if (error) throw error;
  }
  await rpc('admin_example_upload', { p_family_id: familyId, p_category: category, p_image_path: folder + '/display.jpg', p_thumbnail_path: folder + '/thumb.jpg' });
}

export function ExamplesTab({ style, onChanged }) {
  const role = useStore(s => s.role);
  const { data, error, reload } = useLoad(() => rpc('admin_examples', { p_family_id: style.id }), [style.id]);
  const [big, setBig] = useState(null);
  if (error) return html`<div class="red">${error.message}</div>`;
  if (!data) return html`<${Skel} hgt="320"/>`;
  const done = () => { reload(true); onChanged?.(); };
  const fillAll = async () => {
    if (!(await confirm({ title: 'Generate the missing examples with AI?', body: 'Queues ' + (6 - data.slots.filter(s => s.id).length) + ' paid image(s) based on the variant "' + data.source_variant + '". They are created when the "Style examples" n8n workflow runs.', ok: 'Queue' }))) return;
    try { await rpc('admin_queue_examples', { p_family_id: style.id }); toast('Missing slots queued'); done(); } catch (e) { toast(e.message, 'err'); }
  };
  const missing = data.slots.filter(s => !s.id).length;
  return html`<div class="col" style="gap:14px">
    <div class="card ex-variant">
      <div class="row wrap" style="margin-bottom:12px">
        <b>${style.name}</b><span class="tiny dim">one gallery for every variant</span>
        <span class="grow"></span>
        ${data.on_shop ? html`<span class="flag ok"><${Icon} n="check" s="11"/> on shop · ${data.shown}/6 shown</span>` : html`<span class="flag warn">not on shop · ${data.ready}/6 ready</span>`}
        ${role === 'owner' && missing > 0 && html`<button class="btn sm" onClick=${fillAll}><${Icon} n="wand" s="13"/>Generate ${missing} missing</button>`}
      </div>
      <div class="exgrid">${data.slots.map((s, si) => html`<${Slot} key=${s.category} s=${s} familyId=${style.id} maxSubjects=${data.max_subjects} i=${si} role=${role} onView=${() => setBig({ src: pub(s.image_path), alt: style.name + ' · ' + s.label })} onDone=${done}/>`)}</div>
    </div>
    <div class="tiny dim">The shop shows this gallery on the page of every variant (men, women, couples…) once all 6 slots are ready; hidden images are skipped. Uploads are stored as JPEG (768 px + 360 px thumbnail). AI regeneration uses the prompt of <span class="acid">${data.source_variant || '—'}</span>.</div>
    ${big && html`<${Lightbox} src=${big.src} alt=${big.alt} onClose=${() => setBig(null)}/>`}
  </div>`;
}

function Slot({ s, familyId, maxSubjects, i, role, onView, onDone }) {
  const [busy, setBusy] = useState(false); const [over, setOver] = useState(false);
  const input = useRef();
  const editor = role !== 'viewer', owner = role === 'owner';
  const ready = s.status === 'ready' && s.thumbnail_path;
  const run = async (p, msg) => { setBusy(true); try { await p(); toast(msg); onDone(); } catch (e) { toast(e.message || String(e), 'err', 6000); } finally { setBusy(false); } };
  const upload = file => file && run(() => uploadExample(file, familyId, s.category), 'Example uploaded · ' + s.label);
  const regen = async () => {
    if (!(await confirm({ title: 'Regenerate "' + s.label + '"?', body: 'Queues one paid AI image, created when the "Style examples" n8n workflow runs. Until then this slot is empty, so the gallery is hidden on the shop.', ok: 'Queue regeneration' }))) return;
    run(() => rpc('admin_example_regenerate', { p_family_id: familyId, p_category: s.category }), 'Queued for regeneration');
  };
  const clear = async () => {
    if (!(await confirm({ title: 'Remove this example?', body: 'The slot becomes empty and the gallery disappears from the shop until it is filled again.', danger: true, ok: 'Remove' }))) return;
    run(() => rpc('admin_example_clear', { p_id: s.id }), 'Example removed');
  };
  return html`<div class=${'ex ' + (ready ? '' : 'vacant ') + (s.hidden ? 'is-hidden ' : '') + (over ? 'over' : '')} style=${'--i:' + i}
      onDragOver=${e => { if (editor) { e.preventDefault(); setOver(true); } }} onDragLeave=${() => setOver(false)}
      onDrop=${e => { e.preventDefault(); setOver(false); editor && upload(e.dataTransfer.files[0]); }}>
    <div class="ex-img">
      ${ready ? html`<img src=${pub(s.thumbnail_path)} alt=${s.label} loading="lazy" onClick=${onView}/>` : html`<div class="ex-ph"><${Icon} n="upload" s="20"/><span>${s.status && s.status !== 'ready' ? s.status.replace('_', ' ') : 'empty'}</span></div>`}
      ${busy && html`<div class="ex-busy"><div class="spinner"></div></div>`}
      ${s.hidden && html`<span class="ex-tag">hidden</span>`}
      ${s.source === 'upload' && html`<span class="ex-tag up">uploaded</span>`}
      ${s.status && s.status !== 'ready' && html`<span class="ex-pill"><${Pill} s=${s.status}/></span>`}
    </div>
    <div class="ex-cap"><span class="trunc">${s.label}</span><span class="dim tiny">${s.subjects}×${maxSubjects && s.subjects > maxSubjects ? ' · >max' : ''}</span></div>
    ${editor && html`<div class="ex-actions">
      ${ready && html`<button class="btn ghost sm" title=${s.hidden ? 'Show on shop' : 'Hide from shop'} onClick=${() => run(() => rpc('admin_example_hide', { p_id: s.id, p_hidden: !s.hidden }), s.hidden ? 'Shown on shop' : 'Hidden from shop')}><${Icon} n=${s.hidden ? 'eye' : 'ban'} s="13"/></button>`}
      <button class="btn ghost sm" title=${ready ? 'Replace with upload' : 'Upload image'} onClick=${() => input.current.click()}><${Icon} n="upload" s="13"/></button>
      ${owner && html`<button class="btn ghost sm" title="Regenerate with AI (paid)" onClick=${regen}><${Icon} n="wand" s="13"/></button>`}
      ${s.id && html`<button class="btn ghost sm red" title="Remove" onClick=${clear}><${Icon} n="trash" s="13"/></button>`}
    </div>`}
    <input ref=${input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange=${e => { upload(e.target.files[0]); e.target.value = ''; }}/>
  </div>`;
}
