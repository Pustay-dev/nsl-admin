// A4 portrait, 2480 × 3508 pixels. No AI generation or external rendering service.
export const PAPER = { width: 2480, height: 3508 };
export function safePreview(url) {
  return typeof url === 'string' && /^https:\/\/(cdn\.shopify\.com\/s\/files\/|(?:www\.)?nechsenakreslit\.cz\/cdn\/shop\/|nfurbsycuufhfgfnaiej\.supabase\.co\/storage\/v1\/object\/public\/(style-assets|style-previews|style-examples)\/)/.test(url) ? url : '';
}
export function reportLines(ctx, text, width, max) {
  const lines = []; let line = '';
  for (const word of String(text || '').split(/\s+/)) {
    if (line && ctx.measureText(line + ' ' + word).width > width) { lines.push(line); line = word; }
    else line += (line ? ' ' : '') + word;
  }
  if (line) lines.push(line);
  const result = lines.slice(0, max);
  if (lines.length > max && result.length) result[max - 1] = result[max - 1].slice(0, -2) + '…';
  return result;
}
const imageFor = url => new Promise(resolve => {
  if (!safePreview(url)) return resolve(null);
  const img = new Image(); img.crossOrigin = 'anonymous';
  const timer = setTimeout(() => { img.onload = img.onerror = null; resolve(null); }, 8000);
  img.onload = () => { clearTimeout(timer); resolve(img); }; img.onerror = () => { clearTimeout(timer); resolve(null); }; img.src = url;
});
export async function renderDirectorReport(proposal, canvas = document.createElement('canvas')) {
  canvas.width = PAPER.width; canvas.height = PAPER.height;
  const c = canvas.getContext('2d'), b = proposal.body || proposal, local = !proposal.id || !proposal.fingerprint || proposal.status === 'local', ink = '#242522', muted = '#696b62', accent = '#b74a31';
  c.fillStyle = '#faf9f5'; c.fillRect(0, 0, PAPER.width, PAPER.height);
  const text = (s, x, y, size = 34, color = ink, width = 2200, max = 3, bold = false) => {
    c.fillStyle = color; c.font = `${bold ? '600' : '400'} ${size}px Arial, sans-serif`;
    reportLines(c, s, width, max).forEach((l, i) => c.fillText(l, x, y + i * size * 1.32));
  };
  text('NECHSENAKRESLIT.CZ  /  KREATIVNÍ ŘEDITEL', 140, 155, 29, accent, 2200, 1, true);
  text(b.title, 140, 290, 76, ink, 2200, 2, true); text(b.summary, 140, 505, 38, muted, 2200, 3);
  text(local ? 'LOKÁLNÍ KONCEPT · ZATÍM NELZE SCHVÁLIT' : b.phase === 'production' ? 'SCHVÁLIT VÝROBU · NOVÉ OBRÁZKY ZŮSTANOU NEVEŘEJNÉ' : 'SCHVÁLIT A PROVÉST · ZMĚNY KATALOGU', 140, 710, 27, accent, 2200, 1, true);
  c.strokeStyle = '#d9d9d0'; c.lineWidth = 2; c.beginPath(); c.moveTo(140, 755); c.lineTo(2340, 755); c.stroke();
  const highlights = b.actions.slice(0,3), images = await Promise.all(highlights.map(a => imageFor(a.preview_url)));
  highlights.forEach((a, i) => {
    const y = 815 + i * 735, img = images[i]; c.fillStyle = '#eeeee7'; c.fillRect(140, y, 430, 645);
    if (img) { const scale = Math.min(430 / img.width, 645 / img.height); c.drawImage(img, 140 + (430 - img.width * scale) / 2, y + (645 - img.height * scale) / 2, img.width * scale, img.height * scale); }
    else { text(b.phase === 'production' ? 'Nový výtvarný směr' : 'Bez nové ukázky', 180, y + 270, 32, muted, 350, 3); text('Popis návrhu vpravo', 180, y + 405, 25, muted, 350, 2); }
    text(`${String(i + 1).padStart(2, '0')}  ${a.kind === 'factory' ? 'NOVÝ STYL' : 'ÚPRAVA'}`, 630, y + 35, 27, accent, 1650, 1, true);
    text(a.label, 630, y + 115, 50, ink, 1680, 2, true); text(a.visual_direction, 630, y + 270, 34, ink, 1680, 3);
    text('PROČ  ' + a.reason, 630, y + 430, 31, muted, 1680, 3);
    text(({ fact: 'FAKT', hypothesis: 'EXPERIMENT', early: 'MÁLO DAT' }[a.confidence] || 'NÁVRH') + '  ' + a.evidence, 630, y + 575, 28, muted, 1680, 2);
  });
  text(`Placené obrázky: nejvýše ${b.image_calls_max}   ·   Odhad: ${Number(b.estimated_cost_czk).toLocaleString('cs-CZ')} Kč`, 140, 3150, 35, ink, 2200, 1, true);
  text(`Celkem ${b.actions.length} změn. Zde hlavní tři; celý rozsah v Adminu a přiloženém PDF. ` + (b.phase === 'production' ? 'Cena je odhad, nikoli limit účtu.' : 'Schválení platí pro celý uložený balík.'), 140, 3210, 28, muted, 2200, 2);
  text(local ? 'Lokální koncept · čeká na uložení do Adminu a zachycení aktuálního stavu.' : `Návrh ${proposal.id} · ${proposal.fingerprint.slice(0, 16)}`, 140, 3340, 24, muted, 2200, 1);
  text('Přesné změny a schválení: Admin → Styles → Kreativní ředitel. JPG není autorizační odkaz.', 140, 3390, 24, muted, 2200, 2);
  return canvas;
}
export async function directorJpeg(proposal) {
  const canvas = await renderDirectorReport(proposal), blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .95));
  if (!blob) throw new Error('JPG export failed.'); return blob;
}
