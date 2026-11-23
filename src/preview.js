// Small 2:3 portrait thumbnail; click opens the full image in the zoom viewer (same viewer as the Wall).
// path = storage path (signed on demand) or url = public URL (style covers).
import { html, useState, useRef, useEffect, SImg, Icon, EscCatcher } from './ui.js';
import { signed } from './api.js';
import { toast } from './store.js';
import { ZoomViewer } from './zoom.js';

// A picture with no visible buttons. Click it: a small menu offers "Full screen" and (if allowed) "Upload new".
// onUpload(file) does the upload and returns a promise; src is a displayable URL (or data: URL).
export function ImageTile({ label, src, onUpload, disabled, note }) {
  const [menu, setMenu] = useState(false), [zoom, setZoom] = useState(false), [busy, setBusy] = useState(false);
  const input = useRef(), box = useRef();
  useEffect(() => {
    if (!menu) return;
    const off = e => { if (box.current && !box.current.contains(e.target)) setMenu(false); };
    addEventListener('pointerdown', off);
    return () => removeEventListener('pointerdown', off);
  }, [menu]);
  const pick = async file => { if (!file) return; setBusy(true); try { await onUpload(file); } finally { setBusy(false); if (input.current) input.current.value = ''; } };
  const canUpload = onUpload && !disabled;
  return html`<div class="itile" ref=${box}>
    <span class="itile-l">${label}</span>
    <button type="button" class="itile-img" aria-haspopup="menu" aria-expanded=${menu} disabled=${!src && !canUpload} onClick=${() => (src || canUpload) && setMenu(m => !m)} aria-label=${label}>
      ${src ? html`<img src=${src} alt=""/>` : html`<${Icon} n="upload" s="20"/>`}${busy && html`<span class="spinner"></span>`}</button>
    ${note && html`<span class="tiny dim">${note}</span>`}
    ${menu && html`<${EscCatcher} onClose=${() => setMenu(false)}/><div class="menu" role="menu" style="left:0;right:auto">
      ${src && html`<button role="menuitem" onClick=${() => { setMenu(false); setZoom(true); }}><${Icon} n="full"/>Full screen</button>`}
      ${canUpload && html`<button role="menuitem" onClick=${() => { setMenu(false); input.current.click(); }}><${Icon} n="upload"/>Upload new</button>`}</div>`}
    <input ref=${input} type="file" accept="image/jpeg,image/png,image/webp,image/heic" hidden onChange=${e => pick(e.target.files[0])}/>
    ${zoom && html`<${ZoomViewer} src=${src} alt=${label} onClose=${() => setZoom(false)}/>`}
  </div>`;
}

export function PreviewThumb({ path, url, bucket = 'previews', alt = '', w = 32 }) {
  const [src, setSrc] = useState(null);
  if (!path && !url) return html`<span class="thumb ph" style=${'width:' + w + 'px'}></span>`;
  const open = async e => {
    e.stopPropagation();
    try { const u = url || (await signed(path, bucket)); if (u) setSrc(u); else toast('Could not open the picture', 'warn'); }
    catch { toast('Could not open the picture', 'warn'); }
  };
  return html`<button type="button" class="thumb pt" style=${'width:' + w + 'px'} onClick=${open} aria-label="Open full size">
      ${url ? html`<img src=${url} alt=${alt} loading="lazy"/>` : html`<${SImg} path=${path} bucket=${bucket} alt=${alt}/>`}</button>
    ${src && html`<span onClick=${e => e.stopPropagation()}><${ZoomViewer} src=${src} alt=${alt} onClose=${() => setSrc(null)}/></span>`}`;
}
