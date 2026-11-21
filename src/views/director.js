import { html, useState, useLoad, Drawer, Empty } from '../ui.js';
import { rpc, sb } from '../api.js';
import { toast } from '../store.js';
import { directorJpeg, safePreview } from '../director-report.js';

export function Director({ role, onClose, onApplied }) {
  const { data, error, reload } = useLoad(() => rpc('admin_director_list'));
  const health = useLoad(() => rpc('admin_director_health'));
  const [busy, setBusy] = useState(false), [input, setInput] = useState(''), [showImport, setShowImport] = useState(false);
  const [selected, setSelected] = useState(null), [notice, setNotice] = useState('');
  const fixture = async (slot, subjects, file) => {
    if (!file || busy) return; setBusy(true);
    try {
      const bmp = await createImageBitmap(file), scale = Math.min(1,2000/Math.max(bmp.width,bmp.height));
      const canvas=document.createElement('canvas'); canvas.width=Math.round(bmp.width*scale); canvas.height=Math.round(bmp.height*scale);
      canvas.getContext('2d').drawImage(bmp,0,0,canvas.width,canvas.height); bmp.close();
      const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',.92));
      if (!blob) throw new Error('Fotografii se nepodařilo načíst.');
      const path=`photos/${slot}/${crypto.randomUUID()}.jpg`;
      const {error}=await sb().storage.from('prompt-tests').upload(path,blob,{contentType:'image/jpeg',upsert:false}); if(error)throw new Error(error.message);
      await rpc('admin_pt_photo_set',{p_slot:slot,p_path:path,p_subjects:subjects}); await health.reload(true); toast('Soukromá testovací fotografie uložena.');
    } catch(e) { toast(e.message,'err',6000); } finally {setBusy(false);}
  };
  const list = Array.isArray(data) ? data : [], p = list.find(x => x.id === selected) || list[0], owner = role === 'owner';
  const decide = async approve => {
    if (!p || busy) return; setBusy(true); setNotice('');
    try {
      const r = await rpc('admin_director_decide', { p_id: p.id, p_fingerprint: p.fingerprint, p_approve: approve });
      setNotice(r.status === 'applied' ? (r.awaiting_images ? 'Výroba zadána. Nové obrázky zůstávají neveřejné.' : 'Schválené změny provedeny.') : 'Návrh zamítnut.');
      await reload(true); await health.reload(true); onApplied();
    } catch (e) { setNotice(e.message + ' · Návrh znovu načtěte; platí vždy jen schválená verze.'); }
    finally { setBusy(false); }
  };
  const download = async () => {
    setBusy(true);
    try { const blob = await directorJpeg(p), url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = 'kreativni-reditel-' + p.id + '.jpg'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000); }
    catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  const copyPrompt = async () => {
    try { const r = await fetch(new URL('../director-prompt.txt', import.meta.url)); if (!r.ok) throw new Error('Prompt unavailable'); await navigator.clipboard.writeText(await r.text()); toast('Prompt zkopírován.'); }
    catch (e) { toast(e.message, 'err'); }
  };
  const upload = async () => {
    setBusy(true);
    try { const parsed = JSON.parse(input); const r = await rpc('admin_director_submit', { p: parsed.body || parsed }); setSelected(r.id); setInput(''); setShowImport(false); await reload(true); }
    catch (e) { toast(e.message, 'err', 6000); } finally { setBusy(false); }
  };
  const expired = p && new Date(p.expires_at).getTime() <= Date.now();
  return html`<${Drawer} title="Kreativní ředitel" sub="Pondělí a čtvrtek · 09:00 · Praha" onClose=${onClose}>
    <p class="muted">Papírový audit → schválit neveřejné testy → zkontrolovat výsledky → zveřejnit hotový balík jedním kliknutím.</p>
    <div class="row wrap"><button class="btn" onClick=${copyPrompt}>Zadání pro audit nyní</button><button class="btn" disabled=${busy} onClick=${() => { reload(true); health.reload(true); }}>Obnovit</button>${role !== 'viewer' && html`<button class="btn ghost" onClick=${() => setShowImport(!showImport)}>Import návrhu</button>`}</div>
    <p class="small"><a href=${new URL('../director-audit-2026-11-19.pdf',import.meta.url).href} target="_blank" rel="noopener">Vytisknout první audit · 19. 11. · PDF, 4 strany</a></p>
    ${health.data && html`<div class="card small"><b>Připravenost výroby</b><p>Model: ${health.data.model} · soukromé fotografie ${health.data.photos}/3 · konfigurace n8n ${health.data.webhook_ready ? 'uložena' : 'chybí'}</p>${health.data.photos !== 3 && html`<p class="amber">Nahrajte tři schválené fotografie. Rodina = 4 lidé a pes, tedy 5 postav. Testy jsou soukromé; nahrání nic negeneruje.</p>`}${role !== 'viewer' && html`<div class="row wrap">${[['family',5,'Rodina + pes'],['kid',1,'Dítě'],['selfie',1,'Obtížné selfie']].map(([slot,n,label])=>html`<label class="btn">${label}<input type="file" accept="image/*" hidden disabled=${busy} onChange=${e=>{fixture(slot,n,e.target.files[0]);e.target.value='';}}/></label>`)}</div>`}${(health.data.tests || []).slice(0,20).map(t => html`<p>${t.variant_id}: ${t.status}${t.error ? ' · ' + t.error : ''}</p>`)}</div>`}
    ${showImport && html`<div class="card"><label class="f">Podklady od agenta<textarea class="in code" value=${input} onInput=${e => setInput(e.target.value)} placeholder="JSON návrhu"/></label><button class="btn" disabled=${busy || !input.trim()} onClick=${upload}>Uložit ke kontrole</button></div>`}
    ${error && html`<div class="card amber">Přehled zatím není dostupný: ${error.message}. Vyžaduje backend pro návrhy; schválení se nikdy neprovede pouze v prohlížeči.</div>`}
    ${!error && !p && html`<${Empty}>Zatím žádný návrh. Agent připraví konkrétní změny. Otevření této stránky nic negeneruje.</${Empty}>`}
    ${p && html`<div class="col"><label class="f">Návrhy<select class="in" value=${p.id} onChange=${e => { setSelected(e.target.value); setNotice(''); }}>${list.map(x => html`<option value=${x.id}>${x.body.title} · ${x.status}</option>`)}</select></label>
      <div class="card"><div class="row between"><h2>${p.body.title}</h2><button class="btn" disabled=${busy} onClick=${download}>Stáhnout souhrn A4 JPG</button></div><p>${p.body.summary}</p><p class="small">${p.body.actions.length} přesných změn. Tiskový souhrn ukazuje hlavní tři; úplný balík je níže.</p>
      <p class="small muted">${p.body.phase === 'production' ? 'Výroba neveřejných kandidátů' : 'Změny katalogu'} · nejvýše ${p.body.image_calls_max} placených obrázků · odhad ${p.body.estimated_cost_czk} Kč ${p.body.phase === 'production' ? '(včetně plánování)' : ''}</p>
      ${p.body.actions.map(a => html`<section class="card"><div class="row wrap">${safePreview(a.preview_url) && html`<img src=${safePreview(a.preview_url)} alt=${a.label} width="120" height="180" loading="lazy"/>`}<div class="grow"><h3>${a.label}</h3><p>${a.visual_direction}</p><p class="small">${a.reason}</p><p class="tiny muted">${{fact:'Fakt',hypothesis:'Experiment',early:'Málo dat'}[a.confidence]} · ${a.evidence}</p></div></div><details><summary>Přesné schvalované změny</summary><pre class="small">${JSON.stringify(a.patch, null, 2)}</pre>${a.qa && html`<p class="small">Kontrola: ${a.qa.notes}</p>`}</details></section>`)}
      <p class="tiny muted">Verze ${p.fingerprint.slice(0,16)} · platnost do ${new Date(p.expires_at).toLocaleString('cs-CZ',{timeZone:'Europe/Prague'})}. Odhad není limitem účtu poskytovatele. Schválení nepublikuje Shopify téma.</p>
      ${notice && html`<p role="status">${notice}</p>`}
      ${p.status === 'review' ? html`<div class="row wrap"><button class="btn primary" disabled=${!owner || busy || expired} onClick=${() => decide(true)}>${busy ? 'Provádím…' : p.body.phase === 'production' ? 'Schválit a zadat výrobu' : 'Zveřejnit hotový balík'}</button><button class="btn" disabled=${!owner || busy} onClick=${() => decide(false)}>Zamítnout</button>${expired && html`<span class="amber">Platnost skončila; agent musí návrh obnovit.</span>`}${!owner && html`<span class="muted">Schvaluje vlastník.</span>`}</div>` : html`<p class="small">${p.status === 'applied' ? 'Provedeno' : 'Zamítnuto'}</p>`}
      </div></div>`}
  </${Drawer}>`;
}
