import { html, useEffect, useState, Icon, Pill, Modal, Seg, Switch, Empty, Skel, SImg, confirm, useLoad, usePoll } from '../ui.js';
import { rpc, fmt } from '../api.js';
import { toast } from '../store.js';
import { go } from '../router.js';

const TABS = [['fulfilment', 'Order fulfilment'], ['followup', 'Follow-ups']];

const GATES = [
  ['paid', 'Paid'], ['not_test', 'Real order (not a test)'], ['no_hold', 'No production hold'], ['file', 'Print file stored'],
  ['qc', 'QC approved'], ['ready', 'Status: ready to print'], ['release', 'Kviktisk release enabled'], ['sample', 'Sample approved'],
  ['recipient', 'Delivery address complete'], ['supplier_email', 'Kviktisk e-mail set'],
];
const CARRIERS = ['GLS', 'PPL', 'Zásilkovna', 'WEDO', 'Other'];

const friendly = e => {
  const m = String(e?.message || e || '');
  const g = m.match(/MAIL_GATE_([A-Z_]+)/);
  if (g) { const k = g[1].toLowerCase(); return 'Blocked: ' + ((GATES.find(x => x[0] === k) || [])[1] || k); }
  const map = {
    STALE_PRINT_REVISION: 'This order changed, reload and try again.', SUPPLIER_MAIL_ALREADY_EXISTS: 'A mail to Kviktisk already exists for this order.',
    REDIRECT_ADDRESS_REQUIRED: 'Set the test-redirect address in Settings first.', FROM_EMAIL_REQUIRED: 'Set the sender address first.',
    ADMIN_ROLE_INSUFFICIENT: 'You need the editor role for this.', TRACKING_DETAILS_REQUIRED: 'Carrier and tracking number are required.',
    INVALID_BUTTON_URL: 'Button link must start with https:// or be {{resume_url}}.', INVALID_BUTTON_LABEL: 'Button label must be 1-60 characters.', INVALID_IMAGE_URL: 'Image URL must start with https://.',
    BLOCK_TEXT_TOO_LONG: 'A text block is too long.', INVALID_TEMPLATE: 'Name and subject are required.', INVALID_TEMPLATE_KEY: 'Template name is not valid.', TEMPLATE_NOT_FOUND: 'Pick an existing template.',
    ORDER_NOT_SUBMITTED: 'Only orders already sent to Kviktisk can be marked dispatched.', MAIL_NOT_RESOLVABLE: 'This mail can no longer be changed.',
    ORDER_NOT_SHIPPED: 'Only dispatched orders can be marked delivered.', INVALID_STYLE: 'Style: colours must be like #B84328, logo must be an https:// link.', INVALID_MAIL_STAGE: 'Unknown mail.',
  };
  const uv = m.match(/HTML_UNKNOWN_VARIABLE:([^\n]*)/);
  if (uv) return 'Unknown variable {{' + uv[1].trim() + '}}. Use only the listed variables, exactly like {{order_name}} (no spaces).';
  Object.assign(map, {
    HTML_EMPTY: 'The file is empty.', HTML_TOO_LARGE: 'The file is too large (max 50 KB).', HTML_SUBJECT_MISSING: 'Add <title>subject</title> to the file (max 200 characters).',
    HTML_FORBIDDEN_TAG: 'Not allowed in e-mail: script, style, form, iframe, svg, button, input or similar tags.', HTML_EVENT_HANDLER: 'Not allowed: event attributes such as onclick.',
    HTML_FORBIDDEN_URL: 'Not allowed: javascript:/data: links or non-https CSS urls.', HTML_FORBIDDEN_CSS: 'Not allowed: @import, expression() or srcset.',
    HTML_ATTR_QUOTES: 'Put href/src values in quotes.', HTML_BAD_LINK: 'Every link and image must be https://, mailto: or a {{variable}}.', TEMPLATE_EMPTY: 'Upload the mail first.',
  });
  for (const k in map) if (m.includes(k)) return map[k];
  return m;
};
const mailPill = m => m ? html`<${Pill} s=${m.status === 'sent' ? 'completed' : m.status} label=${m.status.replace('_', ' ') + (m.redirected ? ' (test)' : '')}/>` : html`<span class="dim">–</span>`;

function Step({ ok, label, warn }) {
  return html`<span class="tiny" style=${'margin-right:10px;white-space:nowrap;color:var(--' + (ok ? 'acid' : warn ? 'amber' : 'dim') + ')'}>${ok ? '✓' : '○'} ${label}</span>`;
}

function Banner({ s }) {
  if (!s) return null;
  const off = !s.sending_enabled;
  return html`<div class=${'card ' + (off ? '' : s.redirect_enabled ? '' : 'red')} style="margin-bottom:12px;padding:10px 14px">
    <b>${off ? 'Sending is OFF' : s.redirect_enabled ? 'Test mode: all mail goes to ' + (s.redirect_to || '(no address set)') : 'LIVE: mail goes to the real recipients'}</b>
    <span class="tiny dim"> · ${off ? 'Mails are queued but nothing leaves.' : s.redirect_enabled ? 'Kviktisk and customers receive nothing; the order is not marked as sent.' : 'Sending to Kviktisk marks the order as submitted.'}</span>
  </div>`;
}

function Preview({ item, kind, onClose }) {
  const { data, error } = useLoad(() => rpc('admin_mail_preview', { p_item: item.id, p_kind: kind }), [item.id, kind]);
  return html`<${Modal} title="Email preview" onClose=${onClose} cls="wide" footer=${html`<button class="btn" onClick=${onClose}>Close</button>`}>
    ${error && html`<div class="card red">${friendly(error)}</div>`}
    ${!data && !error && html`<${Skel} hgt="240"/>`}
    ${data && html`<div class="tiny dim">Subject</div><div style="margin-bottom:8px"><b>${data.subject}</b></div>
      <iframe sandbox="" srcdoc=${data.html} style="width:100%;height:420px;border:1px solid var(--line2);border-radius:8px;background:#fff"></iframe>
      <div class="tiny dim" style="margin-top:6px">The print-file link is created at send time.</div>`}
  </${Modal}>`;
}

function Dispatch({ item, notifyDefault, onClose, onDone }) {
  const [carrier, setCarrier] = useState(item.shipping_carrier || (item.recipient?.shipping_method || '').match(/GLS|PPL|WEDO|Z[aá]silkovna/i)?.[0] || 'GLS');
  const [tracking, setTracking] = useState(item.tracking_number || '');
  const [notify, setNotify] = useState(notifyDefault !== false);
  const [busy, setBusy] = useState(false);
  const go_ = async () => {
    setBusy(true);
    try {
      const r = await rpc('admin_mail_mark_dispatched', { p_item: item.id, p_revision: item.revision, p_carrier: carrier, p_tracking: tracking, p_notify: notify });
      toast(r.customer_mail?.queued ? 'Dispatched, customer mail queued' : 'Dispatched'); onDone();
    } catch (e) { toast(friendly(e), 'warn', 6000); } finally { setBusy(false); }
  };
  return html`<${Modal} title="Mark dispatched" onClose=${onClose} footer=${html`<button class="btn" onClick=${onClose}>Cancel</button><button class="btn primary" disabled=${busy || !tracking.trim()} onClick=${go_}>Mark dispatched</button>`}>
    <label class="f">Carrier<select class="in" value=${carrier} onChange=${e => setCarrier(e.target.value)}>${CARRIERS.map(c => html`<option>${c}</option>`)}</select></label>
    <label class="f" style="margin-top:10px">Tracking number<input class="in" value=${tracking} onInput=${e => setTracking(e.target.value)}/></label>
    <div class="row" style="gap:10px;margin-top:12px"><${Switch} on=${notify} onChange=${setNotify} label="Notify customer"/><span class="tiny">Send the customer a "shipped" e-mail${item.is_test_order ? ' (test order: goes to the test address)' : ''}</span></div>
  </${Modal}>`;
}

const STAGES = [['paid', 'Paid'], ['printing', 'Printing'], ['shipped', 'Shipped'], ['delivered', 'Delivered']];

function ItemModal({ item, settings, stages, onClose, reload }) {
  const [prev, setPrev] = useState(null);
  const [disp, setDisp] = useState(false);
  const [busy, setBusy] = useState(false);
  const g = item.gates || {}, rc = item.recipient;
  const blockers = GATES.filter(([k]) => !g[k]);
  const act = async (fn, okMsg) => { setBusy(true); try { const r = await fn(); toast(typeof okMsg === 'function' ? okMsg(r) : okMsg); reload(); } catch (e) { toast(friendly(e), 'warn', 6000); } finally { setBusy(false); } };
  const sendReal = async () => {
    const ok = await confirm({ title: 'Send to Kviktisk?', body: settings?.redirect_enabled ? 'Test mode is ON: the mail goes to ' + settings.redirect_to + ' and the order is NOT marked as submitted.' : 'The order mail goes to ' + settings.supplier_email + ' and the order is marked as submitted. This cannot be undone.', ok: 'Send', danger: !settings?.redirect_enabled });
    if (ok) act(() => rpc('admin_mail_send_supplier', { p_item: item.id, p_revision: item.revision }), r => r.duplicate ? 'Already queued' : 'Queued');
  };
  const markDelivered = async () => {
    const on = (stages || []).find(s => s.stage === 'delivered')?.enabled;
    const ok = await confirm({ title: 'Mark as delivered?', body: on ? 'The customer gets the "delivered" e-mail' + (settings?.redirect_enabled ? ' (test mode: it goes to the test address).' : '.') : 'No customer e-mail is sent (the "delivered" mail is switched off).', ok: 'Mark delivered' });
    if (ok) act(() => rpc('admin_mail_mark_delivered', { p_item: item.id, p_notify: !!on }), r => r.duplicate ? 'Already delivered' : (r.customer_mail?.queued ? 'Delivered, customer mail queued' : 'Delivered'));
  };
  const cm = item.customer_mails || {};
  return html`<${Modal} title=${'Order ' + (item.order_name || '#' + item.shopify_order_id) + (item.is_test_order ? ' (test)' : '')} onClose=${onClose} cls="wide"
    footer=${html`<button class="btn" onClick=${() => go('customers/' + item.session_id)}>Customer</button><span class="grow"></span><button class="btn" onClick=${onClose}>Close</button>`}>
    <div class="grid g2" style="gap:14px">
      <div><div class="tiny dim">Product</div><div>Canvas ${(item.size_cm || '').replace('x', '×')} cm × ${item.quantity}</div>
        <div class="tiny dim" style="margin-top:10px">Status</div><div><${Pill} s=${item.production_status}/> <${Pill} s=${item.qc_status === 'approved' ? 'completed' : 'pending'} label=${'QC ' + item.qc_status}/></div>
        ${item.print_reference && html`<div class="tiny dim" style="margin-top:10px">Our reference</div><div><b>${item.print_reference}</b></div>`}
        ${item.tracking_number && html`<div class="tiny dim" style="margin-top:10px">Tracking</div><div>${item.shipping_carrier} · ${item.tracking_number}</div>`}</div>
      <div><div class="tiny dim">Recipient</div>${rc ? html`<div>${rc.name}${rc.company ? ' · ' + rc.company : ''}<br/>${rc.address1}${rc.address2 ? ', ' + rc.address2 : ''}<br/>${rc.zip} ${rc.city}, ${rc.country_code}<br/>
        <span class="tiny">${rc.email} · ${rc.phone || 'no phone'}</span><br/><span class="tiny dim">${rc.shipping_method || ''}</span>${rc.note && html`<br/><span class="tiny amber">Note: ${rc.note}</span>`}</div>` : html`<div class="amber">No recipient data</div>`}</div>
    </div>
    <div style="margin-top:14px"><div class="tiny dim" style="margin-bottom:4px">Checklist for sending to Kviktisk</div>
      <div class="row wrap" style="gap:2px 0">${GATES.map(([k, l]) => html`<${Step} ok=${g[k]} label=${l} warn=${!g[k]}/>`)}</div></div>
    <div class="row wrap" style="gap:16px;margin-top:12px"><div class="tiny dim">To Kviktisk: ${mailPill(item.supplier_mail)}</div><div class="tiny dim">Test: ${mailPill(item.test_mail)}</div>${STAGES.map(([k, l]) => html`<div class="tiny dim">${l} mail: ${mailPill(cm['customer_' + k])}</div>`)}</div>
    ${item.supplier_mail?.error && html`<div class="tiny red" style="margin-top:6px">${item.supplier_mail.error}</div>`}
    <div class="row wrap" style="gap:8px;margin-top:16px">
      <button class="btn" onClick=${() => setPrev('supplier_order')}><${Icon} n="eye" s="14"/> Preview e-mail</button>
      <button class="btn" disabled=${busy || !g.file || !g.recipient || !settings?.redirect_to} title=${!settings?.redirect_to ? 'Set the test address in Settings' : ''} onClick=${() => act(() => rpc('admin_mail_send_test', { p_item: item.id, p_revision: item.revision }), 'Test mail queued')}>Send test to me</button>
      <button class="btn primary" disabled=${busy || blockers.length > 0} title=${blockers.length ? 'Blocked: ' + blockers.map(b => b[1]).join(', ') : ''} onClick=${sendReal}>Send to Kviktisk</button>
      <button class="btn" disabled=${busy || item.production_status !== 'submitted'} onClick=${() => setDisp(true)}>Mark dispatched</button>
      <button class="btn" disabled=${busy || item.production_status !== 'fulfilled' || !!item.delivered_at} onClick=${markDelivered}>${item.delivered_at ? 'Delivered ' + fmt.ago(item.delivered_at) : 'Mark delivered'}</button>
    </div>
    ${blockers.length > 0 && html`<div class="tiny dim" style="margin-top:8px">Blocked by: ${blockers.map(b => b[1]).join(' · ')}</div>`}
    ${prev && html`<${Preview} item=${item} kind=${prev} onClose=${() => setPrev(null)}/>`}
    ${disp && html`<${Dispatch} item=${item} notifyDefault=${!!(stages || []).find(s => s.stage === 'shipped')?.enabled} onClose=${() => setDisp(false)} onDone=${() => { setDisp(false); reload(); }}/>`}
  </${Modal}>`;
}

function Outbox({ rows, reload }) {
  const act = async (id, a) => {
    let confirmation = null;
    if (a === 'confirm_sent') { const ok = await confirm({ title: 'Mark as sent?', body: 'Only do this after you checked the mail really left (provider log / sent folder). A real Kviktisk order is then marked as submitted.', ok: 'Mark sent', danger: true }); if (!ok) return; }
    try { await rpc('admin_mail_outbox_resolve', { p_id: id, p_action: a, p_confirmation: confirmation }); toast('Updated'); reload(); } catch (e) { toast(friendly(e), 'warn', 6000); }
  };
  return html`<div class="card tbl-wrap" style="padding:0"><table class="tbl"><thead><tr><th>Mail</th><th>To</th><th>Status</th><th class="hide-m">Error</th><th>When</th><th></th></tr></thead><tbody>
    ${!rows ? html`<tr><td colspan="6"><${Skel} hgt="80"/></td></tr>` : rows.map(r => html`<tr>
      <td class="tiny"><b>${r.kind.replace('_', ' ')}</b><div class="dim trunc" style="max-width:260px">${r.subject}</div></td>
      <td class="tiny">${r.actual_to || r.to_email}${r.redirected && html`<div class="dim">was: ${r.to_email}</div>`}</td>
      <td>${mailPill(r)}</td><td class="hide-m tiny red">${r.error_code || ''}</td><td class="tiny">${fmt.ago(r.sent_at || r.created_at)}</td>
      <td style="white-space:nowrap">${['needs_review', 'failed'].includes(r.status) && html`<button class="btn ghost" onClick=${() => act(r.id, 'requeue')}>Retry</button><button class="btn ghost" onClick=${() => act(r.id, 'confirm_sent')}>Was sent</button>`}
        ${['needs_review', 'failed', 'queued'].includes(r.status) && html`<button class="btn ghost" onClick=${() => act(r.id, 'cancel')}>Cancel</button>`}</td></tr>`)}
    ${rows && !rows.length && html`<tr><td colspan="6"><${Empty}>No mails yet.</${Empty}></td></tr>`}</tbody></table></div>`;
}

function Settings({ s, reload }) {
  const [f, setF] = useState(s || {});
  useEffect(() => { setF(s || {}); }, [s?.updated_at]);
  if (!s) return null;
  const set = (k, v) => setF({ ...f, [k]: v });
  const sty = { brand: '#B84328', ink: '#27211E', bg: '#FFF4E9', ...(f.style || {}) };
  const setSty = (k, v) => setF({ ...f, style: { ...sty, [k]: v } });
  const save = async () => {
    if (f.sending_enabled && !s.sending_enabled) {
      const ok = await confirm({ title: 'Turn sending ON?', body: f.redirect_enabled ? 'Queued mails will be sent to the test address only.' : 'Mails will go to REAL recipients (Kviktisk, customers).', ok: 'Turn on', danger: !f.redirect_enabled });
      if (!ok) return;
    }
    if (!f.redirect_enabled && s.redirect_enabled) {
      const ok = await confirm({ title: 'Disable test redirect?', body: 'Real orders will be e-mailed to Kviktisk and customers get shipping mails.', ok: 'Disable redirect', danger: true });
      if (!ok) return;
    }
    try {
      await rpc('admin_mail_settings_set', { p: { sending_enabled: !!f.sending_enabled, redirect_enabled: !!f.redirect_enabled, redirect_to: f.redirect_to || '', supplier_email: f.supplier_email || '', from_email: f.from_email || '', from_name: f.from_name || '', reply_to: f.reply_to || '', followup_gap_days: Number(f.followup_gap_days ?? 3), resume_url: f.resume_url || 'https://nechsenakreslit.cz/', style: { brand: sty.brand, ink: sty.ink, bg: sty.bg, logo_url: sty.logo_url || '', shop_name: sty.shop_name || '', footer: sty.footer || '' } } });
      toast('Saved'); reload();
    } catch (e) { toast(friendly(e), 'warn', 6000); }
  };
  const field = (k, l, ph) => html`<label class="f">${l}<input class="in" placeholder=${ph || ''} value=${f[k] || ''} onInput=${e => set(k, e.target.value)}/></label>`;
  return html`<div class="card" style="padding:14px"><div class="grid g2" style="gap:12px">
    <div class="row" style="gap:10px"><${Switch} on=${f.sending_enabled} onChange=${v => set('sending_enabled', v)} label="Sending"/><div><b>Sending</b><div class="tiny dim">Off = nothing leaves the queue</div></div></div>
    <div class="row" style="gap:10px"><${Switch} on=${f.redirect_enabled} onChange=${v => set('redirect_enabled', v)} label="Test redirect"/><div><b>Test redirect</b><div class="tiny dim">On = every mail goes to the test address</div></div></div>
    ${field('redirect_to', 'Test address (your own)', 'you@example.com')}${field('supplier_email', 'Kviktisk order address', 'objednavky@kviktisk.example')}
    ${field('from_email', 'Sender address', 'objednavky@nakreslime.cz')}${field('from_name', 'Sender name')}${field('reply_to', 'Reply-to (optional)')}
    ${field('resume_url', 'Follow-up button link (shop URL)', 'https://nechsenakreslit.cz/')}<label class="f">Min. days between follow-ups to one person<input class="in" type="number" value=${f.followup_gap_days ?? 3} onInput=${e => set('followup_gap_days', e.target.value)}/></label>
  </div>
    <h4 style="margin:16px 0 4px">Our style</h4><div class="tiny dim" style="margin-bottom:8px">The wrapper (background, card, logo, footer) added to every upload with "Apply our style" on. Default = site colours. Mails use Arial: the site font Manrope does not load in e-mail clients.</div>
    <div class="grid g2" style="gap:12px">
      <label class="f">Button / accent colour<input class="in" type="color" value=${sty.brand} onInput=${e => setSty('brand', e.target.value)}/></label>
      <label class="f">Text colour<input class="in" type="color" value=${sty.ink} onInput=${e => setSty('ink', e.target.value)}/></label>
      <label class="f">Background colour<input class="in" type="color" value=${sty.bg} onInput=${e => setSty('bg', e.target.value)}/></label>
      <label class="f">Logo (https:// image link, optional)<input class="in" value=${sty.logo_url || ''} onInput=${e => setSty('logo_url', e.target.value)}/></label>
      <label class="f">Shop name<input class="in" value=${sty.shop_name || ''} onInput=${e => setSty('shop_name', e.target.value)}/></label>
      <label class="f">Footer line<input class="in" value=${sty.footer || ''} onInput=${e => setSty('footer', e.target.value)}/></label>
    </div>
    <div class="row" style="margin-top:12px"><button class="btn primary" onClick=${save}>Save settings</button></div></div>`;
}

const STAGE_HINT = {
  paid: ['Sent automatically when a real order is paid (only orders paid after you switch it on).', 'auto'],
  printing: ['Sent automatically when the order is sent to Kviktisk (only orders after you switch it on).', 'auto'],
  shipped: ['Sent when you press "Mark dispatched" and add the tracking number. Switch on = "Notify customer" is pre-ticked.', 'manual'],
  delivered: ['Sent the moment an order is marked delivered: by the carrier ping (endpoint mail-delivered, not connected yet) or the "Mark delivered" button.', 'manual'],
};
const ORDER_VARS = ['order_name', 'first_name', 'recipient_name', 'address', 'city_zip', 'size', 'quantity', 'carrier', 'tracking_number', 'tracking_url', 'shop_url', 'reference'];
const FOLLOW_VARS = ['resume_url', 'portraits'];
const varList = scope => (scope === 'followup' ? FOLLOW_VARS : ORDER_VARS).map(v => '{{' + v + '}}').join(' ');

const aiPrompt = (scope, style) => [
  'Write ONE e-mail for nakreslime.cz (a shop that turns photos into AI portraits printed on canvas). Copy in Czech, formal "vy". Output ONLY the HTML: no explanation, no code fences.',
  '',
  'FORMAT',
  '- First line: <title>subject</title> (the subject may contain variables).',
  style
    ? '- Then ONLY the e-mail content (heading, paragraphs, button). Do NOT write <html>, <head>, <body>, a page background, an outer container, a logo or a footer: the system wraps your content in our style.'
    : '- A full HTML document (<html><head><title>..</title></head><body>..</body></html>), table layout, centered white card (max 560px, 14px radius, 28px padding) on background #FFF4E9, with a small footer line of your own.',
  '- Mobile first: one column, fluid widths (width:100%; max-width:560px), text 16px, button at least 44px tall, nothing wider than the screen.',
  '- ALL CSS inline (style="..."). No <style>, <script>, <form>, <iframe>, <svg>, <button>, no event attributes (onclick...). Buttons are <a> tags.',
  '- Links and images only https:// (or a variable below, or mailto:). No http://, relative URLs or data: images.',
  '- Font: Arial, Helvetica, sans-serif (web fonts do not work in e-mail).',
  '- Our colours: button #B84328 with white text, text #27211E, soft box #FFF4E9, accent #EA653F.',
  '- Snippets: heading <h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;color:#27211E">; paragraph <p style="margin:0 0 16px">; button <a href="..." style="display:inline-block;background:#B84328;color:#ffffff;text-decoration:none;padding:14px 24px;border-radius:8px;font-weight:bold;font-size:16px">; soft box <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background:#FFF4E9;border-radius:10px;padding:14px 16px">.',
  '- Variables are written exactly like {{name}} (no spaces) and ONLY from this list: ' + varList(scope),
  scope === 'followup' ? '- Do NOT add an unsubscribe link or footer: the system adds it.' : null,
  '- One clear message, at most one main button, under 25 KB.',
  '',
  scope === 'followup' ? 'Mail to write: follow-up reminder (button to {{resume_url}}).' : 'Mail to write: [paid | printing | shipped | delivered] (pick one).',
  'Purpose and tone: [e.g. "shipped: handed to carrier, show the tracking number, button to {{tracking_url}}, friendly, short"]',
].filter(l => l !== null).join('\n');

const shellHtml = (sty, inner) => '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:' + sty.bg + '"><tr><td align="center" style="padding:24px 12px">'
  + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border-radius:14px"><tr><td style="padding:28px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:' + sty.ink + '">'
  + (sty.logo_url ? '<p style="margin:0 0 20px"><img src="' + sty.logo_url + '" alt="' + (sty.shop_name || '') + '" style="max-height:40px;max-width:200px;height:auto"></p>' : '') + inner + '</td></tr></table>'
  + '<div style="max-width:560px;padding-top:12px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#7a6f69;text-align:center">' + (sty.footer || '') + '</div></td></tr></table>';

// --- minimal ZIP (store, no compression) so the "our style" kit needs no library ---
const CRC_T = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = b => { let c = 0xFFFFFFFF; for (const x of b) c = CRC_T[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function makeZip(files) {
  const enc = new TextEncoder(), out = [], cen = []; let off = 0;
  const u16 = n => [n & 255, (n >> 8) & 255], u32 = n => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
  for (const f of files) {
    const nm = enc.encode(f.name), data = typeof f.data === 'string' ? enc.encode(f.data) : f.data, crc = crc32(data), sz = data.length;
    const lh = new Uint8Array([0x50, 0x4b, 3, 4, 20, 0, 0, 8, 0, 0, 0, 0, 0x21, 0, ...u32(crc), ...u32(sz), ...u32(sz), ...u16(nm.length), 0, 0, ...nm]);
    cen.push(new Uint8Array([0x50, 0x4b, 1, 2, 20, 0, 20, 0, 0, 8, 0, 0, 0, 0, 0x21, 0, ...u32(crc), ...u32(sz), ...u32(sz), ...u16(nm.length), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...u32(off), ...nm]));
    out.push(lh, data); off += lh.length + sz;
  }
  const cs = cen.reduce((a, c) => a + c.length, 0);
  out.push(...cen, new Uint8Array([0x50, 0x4b, 5, 6, 0, 0, 0, 0, ...u16(files.length), ...u16(files.length), ...u32(cs), ...u32(off), 0, 0]));
  return new Blob(out, { type: 'application/zip' });
}
async function downloadKit(sty0) {
  const sty = { brand: '#B84328', ink: '#27211E', bg: '#FFF4E9', logo_url: '', shop_name: 'nakreslime.cz', footer: '', ...(sty0 || {}) };
  const example = '<title>Váš portrét {{order_name}} byl doručen</title>\n<h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;color:' + sty.ink + '">Váš portrét dorazil</h1>\n<p style="margin:0 0 16px">Dobrý den,</p>\n<p style="margin:0 0 16px">zásilka s objednávkou <strong>{{order_name}}</strong> ({{size}}) byla právě doručena.</p>\n<p style="margin:8px 0 22px"><a href="{{shop_url}}" style="display:inline-block;background:' + sty.brand + ';color:#ffffff;text-decoration:none;padding:14px 24px;border-radius:8px;font-weight:bold;font-size:16px">Vytvořit další portrét</a></p>';
  const files = [
    { name: 'README.txt', data: 'NAS STYL (our style) - nakreslime.cz mail kit\r\n\r\n1. Give your AI the prompt in prompt-order.txt (order mails) or prompt-followup.txt (follow-ups) and describe the mail at the bottom.\r\n2. Attach base.html and example-delivered.html so it copies the look.\r\n3. Save the AI answer as .html and upload it in admin -> Mail -> the mail -> "Upload HTML file". Keep "Apply our style" ON: you upload only the content and the system adds background, card, logo and footer.\r\n\r\nstyle.json = the exact colours/sizes in use. Fonts: the site uses Manrope, but web fonts do not work in e-mail, so mails use Arial/Helvetica.\r\nLogo: set the https:// logo link in admin -> Mail -> Settings -> Our style (not in this kit yet).\r\n' },
    { name: 'style.json', data: JSON.stringify({ brand_button: sty.brand, text: sty.ink, background: sty.bg, accent: '#EA653F', site_font: 'Manrope', email_font: 'Arial, Helvetica, sans-serif', card_max_width_px: 560, card_radius_px: 14, button_radius_px: 8, button_padding: '14px 24px', logo_url: sty.logo_url, shop_name: sty.shop_name, footer: sty.footer, shop_url: 'https://nechsenakreslit.cz/' }, null, 2) },
    { name: 'prompt-order.txt', data: aiPrompt('order', true) },
    { name: 'prompt-followup.txt', data: aiPrompt('followup', true) },
    { name: 'base.html', data: '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Shell preview</title></head><body style="margin:0">' + shellHtml(sty, '<h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;color:' + sty.ink + '">Nadpis</h1><p style="margin:0 0 16px">Obsah e-mailu.</p>') + '</body></html>' },
    { name: 'example-delivered.html', data: example },
  ];
  try { const r = await fetch('favicon.svg'); if (r.ok) files.push({ name: 'favicon.svg', data: new Uint8Array(await r.arrayBuffer()) }); } catch { /* optional */ }
  const url = URL.createObjectURL(makeZip(files)), a = document.createElement('a');
  a.href = url; a.download = 'nas-styl.zip'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function useHtmlPreview(htmlText, style, scope) {
  const [prev, setPrev] = useState(null), [err, setErr] = useState('');
  useEffect(() => {
    if (!htmlText) { setPrev(null); setErr(''); return; }
    let dead = false;
    const t = setTimeout(async () => {
      try { const r = await rpc('admin_mail_upload_preview', { p_html: htmlText, p_style: style, p_scope: scope }); if (!dead) { setPrev(r); setErr(''); } }
      catch (e) { if (!dead) { setPrev(null); setErr(friendly(e)); } }
    }, 300);
    return () => { dead = true; clearTimeout(t); };
  }, [htmlText, style, scope]);
  return [prev, err];
}
const readFile = (e, cb) => {
  const f = e.target.files && e.target.files[0]; e.target.value = '';
  if (!f) return;
  if (f.size > 60000) { toast('File is too large (max 50 KB).', 'warn', 5000); return; }
  f.text().then(t => cb({ name: f.name, html: t }));
};
const titleOf = t => ((String(t).match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').trim();

function Frame({ htmlText, mobile }) {
  return html`<iframe sandbox="" srcdoc=${htmlText} style=${'width:' + (mobile ? '360px' : '100%') + ';max-width:100%;height:480px;border:1px solid var(--line2);border-radius:8px;background:#fff;display:block;margin:0 auto'}></iframe>`;
}
function PromptBox({ scope, style }) {
  const text = aiPrompt(scope, style);
  return html`<details style="margin-top:10px"><summary class="tiny" style="cursor:pointer">AI prompt for this mail (copy, paste into your AI, describe the mail at the bottom)</summary>
    <textarea class="in" rows="9" readonly value=${text} style="margin-top:6px;font-size:12px"></textarea>
    <div class="row" style="gap:6px;margin-top:6px"><button class="btn sm" onClick=${() => { try { navigator.clipboard.writeText(text); toast('Prompt copied'); } catch { toast('Copy failed, select the text manually', 'warn'); } }}>Copy prompt</button></div></details>`;
}

function StageEditor({ st, items, settings, onSaved }) {
  const [subject, setSubject] = useState(st.subject || '');
  const [on, setOn] = useState(!!st.enabled);
  const [style, setStyle] = useState(st.style_mode !== false);
  const [file, setFile] = useState(null);
  const [mobile, setMobile] = useState(true);
  const [testItem, setTestItem] = useState('');
  const [busy, setBusy] = useState(false);
  const cand = items.filter(i => i.recipient?.email);
  const [prev, err] = useHtmlPreview(file?.html, style, 'order');
  const dirty = !!file || subject !== (st.subject || '') || on !== !!st.enabled;
  const shown = file ? prev?.html : st.preview_html;
  const pick = f => { setFile(f); const t = titleOf(f.html); if (t) setSubject(t); };
  const save = async () => {
    if (on && !st.enabled) {
      const ok = await confirm({ title: 'Switch this mail on?', body: STAGE_HINT[st.stage][1] === 'auto' ? 'Customers of new real orders will get it automatically. While sending is off or test redirect is on, nothing reaches them.' : 'It will be sent when an order is marked ' + st.stage + '.', ok: 'Switch on' });
      if (!ok) return;
    }
    setBusy(true);
    try {
      if (file) await rpc('admin_mail_stage_upload', { p_stage: st.stage, p_html: file.html, p_style: style, p_subject: subject });
      if (on !== !!st.enabled || (!file && subject !== st.subject)) await rpc('admin_mail_stage_set', { p_stage: st.stage, p_enabled: on, p_subject: file ? null : subject });
      toast('Saved'); onSaved();
    } catch (e) { toast(friendly(e), 'warn', 6000); } finally { setBusy(false); }
  };
  const test = async () => {
    setBusy(true);
    try { const r = await rpc('admin_mail_stage_test', { p_stage: st.stage, p_item: testItem || cand[0].id }); toast(r.queued ? 'Test mail queued to ' + (settings?.redirect_to || 'the test address') : 'Not queued'); onSaved(); }
    catch (e) { toast(friendly(e), 'warn', 6000); } finally { setBusy(false); }
  };
  return html`<div class="card" style="padding:14px">
    <div class="row" style="gap:10px;margin-bottom:10px"><${Switch} on=${on} onChange=${setOn} label="Mail on"/><div><b>${on ? 'On' : 'Off'}</b><div class="tiny dim">${STAGE_HINT[st.stage][0]}</div></div>
      <span class="grow"></span><span class="tiny dim">${st.sent} sent · ${st.queued} queued · v${st.version}</span></div>
    <div class="grid g2" style="gap:14px;align-items:start">
      <div>
        <label class="f">Subject<input class="in" value=${subject} onInput=${e => setSubject(e.target.value)}/></label>
        <div class="row" style="gap:10px;margin:12px 0"><${Switch} on=${style} onChange=${setStyle} label="Apply our style"/><div><b>Apply our style</b><div class="tiny dim">On: upload only the content, we add background, card, logo and footer. Off: your full HTML is sent as is.</div></div></div>
        <label class="btn" style="display:inline-block;cursor:pointer">Upload HTML file<input type="file" accept=".html,.htm,text/html" hidden onChange=${e => readFile(e, pick)}/></label>
        ${file && html` <span class="tiny">${file.name} <button class="btn sm" onClick=${() => setFile(null)}>✕</button></span>`}
        ${!file && st.uploaded === false && html`<div class="tiny dim" style="margin-top:6px">Current mail is the built-in draft. Upload an HTML file to replace it.</div>`}
        ${err && html`<div class="card red" style="margin-top:8px">${err}</div>`}
        <div class="tiny dim" style="margin-top:8px">Variables: ${varList('order')}</div>
        <${PromptBox} scope="order" style=${style}/>
        <div class="row" style="gap:8px;margin-top:10px"><button class="btn sm" onClick=${() => downloadKit(settings?.style)}>Download our-style kit (.zip)</button></div>
      </div>
      <div>
        <div class="row between" style="margin-bottom:6px"><span class="tiny dim">Preview (sample order)${file ? ' of the uploaded file' : ''}</span><${Seg} value=${mobile} onChange=${setMobile} options=${[{ v: true, l: 'Mobile' }, { v: false, l: 'Desktop' }]}/></div>
        ${shown ? html`<${Frame} htmlText=${shown} mobile=${mobile}/>` : html`<${Skel} hgt="300"/>`}
      </div>
    </div>
    <div class="row wrap" style="gap:8px;margin-top:12px;align-items:center">
      <button class="btn primary" disabled=${busy || !dirty || !!err} onClick=${save}>Save</button>
      <span class="grow"></span>
      <select class="in" style="max-width:220px" value=${testItem} onChange=${e => setTestItem(e.target.value)} disabled=${!cand.length}>${cand.map(i => html`<option value=${i.id}>${i.order_name || '#' + i.shopify_order_id}${i.is_test_order ? ' (test)' : ''}</option>`)}</select>
      <button class="btn" disabled=${busy || dirty || !cand.length || !settings?.redirect_to} title=${!settings?.redirect_to ? 'Set the test address in Settings' : dirty ? 'Save first' : 'Queues this mail with real order data to your test address'} onClick=${test}>Send test to me</button>
    </div>
  </div>`;
}

function CustomerMails({ items, settings }) {
  const [stage, setStage] = useState('paid');
  const { data, reload } = useLoad(() => rpc('admin_mail_stages', {}), []);
  const st = (data || []).find(s => s.stage === stage);
  return html`<div>
    <div class="row wrap" style="gap:8px;margin-bottom:10px;align-items:center">${STAGES.map(([k, l], i) => { const s = (data || []).find(x => x.stage === k); return html`${i > 0 && html`<span class="dim">→</span>`}<button class=${'btn ' + (stage === k ? 'primary' : '')} onClick=${() => setStage(k)}>${l}${s && html` <span class=${'tiny ' + (s.enabled ? 'green' : 'dim')}>${s.enabled ? '● on' : '○ off'}</span>`}</button>`; })}</div>
    ${!data ? html`<${Skel} hgt="200"/>` : st ? html`<${StageEditor} key=${st.stage + ':' + st.version} st=${st} items=${items} settings=${settings} onSaved=${() => reload(true)}/>` : html`<${Empty}>Mail not found.</${Empty}>`}
  </div>`;
}

function Fulfilment() {
  const [open, setOpen] = useState(null);
  const { data, error, reload } = useLoad(() => rpc('admin_mail_fulfilment_list', { p_include_test: false, p_limit: 80 }), []);
  const stg = useLoad(() => rpc('admin_mail_stages', {}), []);
  const ob = useLoad(() => rpc('admin_mail_outbox_list', { p_limit: 30 }), []);
  const both = () => { reload(true); ob.reload(true); stg.reload(true); };
  usePoll(both, 20000);
  const items = data?.items || [], s = data?.settings;
  const cur = open && items.find(i => i.id === open);
  return html`<div>
    <${Banner} s=${s}/>
    ${error && html`<div class="card red">${friendly(error)}</div>`}
    <h3 style="margin:0 0 8px">Orders</h3>
    <div class="card tbl-wrap" style="padding:0"><table class="tbl"><thead><tr><th></th><th>Order</th><th>Recipient</th><th>Pipeline</th><th>Kviktisk</th><th class="hide-m">Customer mails</th><th>When</th></tr></thead><tbody>
      ${!data ? html`<tr><td colspan="7"><${Skel} hgt="160"/></td></tr>` : items.map((o, i) => { const g = o.gates || {}; return html`<tr class="click" style=${'--i:' + Math.min(i, 20)} onClick=${() => setOpen(o.id)}>
        <td style="width:44px"><div class="thumb" style="width:30px">${o.preview_path && html`<${SImg} path=${o.preview_path}/>`}</div></td>
        <td><b>${o.order_name || '#' + o.shopify_order_id}</b>${o.is_test_order && html` <span class="tag">test</span>`}<div class="tiny dim">${(o.size_cm || '').replace('x', '×')} × ${o.quantity}</div></td>
        <td class="tiny">${o.recipient ? html`${o.recipient.name}<div class="dim">${o.recipient.city}, ${o.recipient.country_code}</div>${!o.recipient.complete && html`<span class="flag res">address incomplete</span>`}` : html`<span class="flag res">no recipient</span>`}</td>
        <td><${Step} ok=${g.paid} label="paid"/><${Step} ok=${['submitted', 'fulfilled'].includes(o.production_status)} label="printing"/><${Step} ok=${o.production_status === 'fulfilled'} label="shipped"/><${Step} ok=${!!o.delivered_at} label="delivered"/></td>
        <td>${mailPill(o.supplier_mail)}</td><td class="hide-m">${STAGES.map(([k, l]) => html`<${Step} ok=${o.customer_mails?.['customer_' + k]?.status === 'sent'} label=${l.slice(0, 3)}/>`)}</td><td class="tiny">${fmt.ago(o.created_at)}</td></tr>`; })}
      ${data && !items.length && html`<tr><td colspan="7"><${Empty}>No orders.</${Empty}></td></tr>`}</tbody></table></div>
    <h3 style="margin:18px 0 8px">Customer e-mails</h3><${CustomerMails} items=${items} settings=${s}/>
    <h3 style="margin:18px 0 8px">Mail log</h3><${Outbox} rows=${ob.data} reload=${() => ob.reload(true)}/>
    <h3 style="margin:18px 0 8px">Settings</h3><${Settings} s=${s} reload=${() => reload(true)}/>
    ${cur && html`<${ItemModal} item=${cur} settings=${s} stages=${stg.data} onClose=${() => setOpen(null)} reload=${() => both()}/>`}
  </div>`;
}

const TRIGGERS = { portraits: 'Portrait(s) created, no purchase', cart: 'Cart left without purchase', purchased: 'After a purchase (customers)' };
function TemplateUpload({ tpl, onClose, onSaved }) {
  const isNew = !tpl;
  const [name, setName] = useState(tpl?.name || '');
  const [subject, setSubject] = useState(tpl?.subject || '');
  const [style, setStyle] = useState(true);
  const [file, setFile] = useState(null);
  const [mobile, setMobile] = useState(true);
  const [busy, setBusy] = useState(false);
  const [prev, err] = useHtmlPreview(file?.html, style, 'followup');
  const pick = f => { setFile(f); const t = titleOf(f.html); if (t) setSubject(t); };
  const save = async () => {
    const k = isNew ? 'followup_' + name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30) : tpl.key;
    setBusy(true);
    try { await rpc('admin_mail_template_upload', { p_key: k, p_name: name, p_html: file.html, p_style: style, p_subject: subject }); toast('Template saved'); onSaved(); onClose(); }
    catch (e) { toast(friendly(e), 'warn', 6000); } finally { setBusy(false); }
  };
  return html`<${Modal} title=${isNew ? 'New follow-up template' : 'Replace template HTML'} onClose=${onClose} cls="wide" footer=${html`<button class="btn" onClick=${onClose}>Cancel</button><button class="btn primary" disabled=${busy || !file || !name.trim() || !!err} onClick=${save}>Save template</button>`}>
    <div class="grid g2" style="gap:14px;align-items:start">
      <div>
        <label class="f">Name<input class="in" value=${name} onInput=${e => setName(e.target.value)}/></label>
        <label class="f" style="margin-top:8px">Subject<input class="in" value=${subject} onInput=${e => setSubject(e.target.value)}/></label>
        <div class="row" style="gap:10px;margin:12px 0"><${Switch} on=${style} onChange=${setStyle} label="Apply our style"/><div><b>Apply our style</b><div class="tiny dim">On: upload only the content, we add background, card, logo and footer.</div></div></div>
        <label class="btn" style="display:inline-block;cursor:pointer">Upload HTML file<input type="file" accept=".html,.htm,text/html" hidden onChange=${e => readFile(e, pick)}/></label>
        ${file && html` <span class="tiny">${file.name}</span>`}
        ${err && html`<div class="card red" style="margin-top:8px">${err}</div>`}
        <div class="tiny dim" style="margin-top:8px">Variables: ${varList('followup')}. The unsubscribe footer is added automatically.</div>
        <${PromptBox} scope="followup" style=${style}/>
      </div>
      <div>
        <div class="row between" style="margin-bottom:6px"><span class="tiny dim">Preview</span><${Seg} value=${mobile} onChange=${setMobile} options=${[{ v: true, l: 'Mobile' }, { v: false, l: 'Desktop' }]}/></div>
        ${prev ? html`<div style="margin-bottom:6px"><b>${prev.subject}</b></div><${Frame} htmlText=${prev.html} mobile=${mobile}/>` : html`<div class="tiny dim">Upload an HTML file to see the preview.</div>`}
      </div>
    </div>
  </${Modal}>`;
}

function RuleEditor({ rule, templates, onClose, onSaved }) {
  const [f, setF] = useState(rule || { name: '', trigger_type: 'portraits', delay_hours: 24, min_portraits: 1, max_age_days: 14, template_key: templates[0]?.key });
  const [pv, setPv] = useState(null);
  const set = (k, v) => setF({ ...f, [k]: v });
  const num = k => html`<input class="in" type="number" value=${f[k]} onInput=${e => set(k, Number(e.target.value))}/>`;
  const preview = async () => {
    if (!rule) return toast('Save the rule first, then preview the audience.');
    try { setPv(await rpc('admin_mail_rule_preview', { p_id: rule.id })); } catch (e) { toast(friendly(e), 'warn', 6000); }
  };
  const save = async () => {
    try { await rpc('admin_mail_rule_save', { p: { ...f } }); toast('Rule saved'); onSaved(); onClose(); } catch (e) { toast(friendly(e), 'warn', 6000); }
  };
  return html`<${Modal} title=${rule ? 'Edit rule' : 'New rule'} onClose=${onClose} footer=${html`<button class="btn" onClick=${onClose}>Cancel</button><button class="btn primary" onClick=${save}>Save rule</button>`}>
    <label class="f">Name<input class="in" value=${f.name} onInput=${e => set('name', e.target.value)}/></label>
    <label class="f">Trigger<select class="in" value=${f.trigger_type} onChange=${e => set('trigger_type', e.target.value)}>${Object.entries(TRIGGERS).map(([k, l]) => html`<option value=${k}>${l}</option>`)}</select></label>
    <div class="grid g2" style="gap:12px">
      <label class="f">Send after (hours)${num('delay_hours')}</label>
      <label class="f">Ignore older than (days)${num('max_age_days')}</label>
      ${f.trigger_type === 'portraits' && html`<label class="f">Min. portraits${num('min_portraits')}</label>`}
    </div>
    <label class="f">Template<select class="in" value=${f.template_key} onChange=${e => set('template_key', e.target.value)}>${templates.map(t => html`<option value=${t.key}>${t.name}</option>`)}</select></label>
    ${f.trigger_type === 'purchased' && html`<div class="card" style="padding:10px;margin-top:8px"><span class="tiny">Customers only: allowed as soft opt-in for similar products (unsubscribe link is always included). Not for people who never bought. Confirm wording and legality before turning on.</span></div>`}
    <div style="margin-top:12px"><button class="btn" onClick=${preview}>Preview audience</button>
      ${pv && html`<div class="tiny" style="margin-top:8px"><b>${pv.eligible}</b> eligible right now ${pv.sample.length ? '· e.g. ' + pv.sample.map(x => x.email).join(', ') : ''}</div>`}</div>
  </${Modal}>`;
}

function FollowUps() {
  const { data, error, reload } = useLoad(() => rpc('admin_mail_rules_list', {}), []);
  const ob = useLoad(() => rpc('admin_mail_outbox_list', { p_limit: 30 }), []);
  usePoll(() => { reload(true); ob.reload(true); }, 30000);
  const [rule, setRule] = useState(undefined);
  const [tpl, setTpl] = useState(undefined);
  const rules = data?.rules || [], templates = data?.templates || [], s = data?.settings;
  const tname = k => templates.find(t => t.key === k)?.name || k;
  const toggle = async r => {
    if (!r.active) {
      const ok = await confirm({ title: 'Turn rule ON?', body: s?.sending_enabled && !s?.redirect_enabled ? 'Eligible people will receive this e-mail (LIVE).' : 'Mails will be queued; while sending is off or test redirect is on, nobody real receives anything.', ok: 'Turn on', danger: !!(s?.sending_enabled && !s?.redirect_enabled) });
      if (!ok) return;
    }
    try { await rpc('admin_mail_rule_set_active', { p_id: r.id, p_active: !r.active }); reload(true); } catch (e) { toast(friendly(e), 'warn', 6000); }
  };
  const run = async r => {
    const ok = await confirm({ title: 'Queue eligible mails now?', body: 'Normally this runs every 10 minutes. With test redirect on, at most 3 are queued.', ok: 'Run now' });
    if (!ok) return;
    try { const o = await rpc('admin_mail_run_followups', { p_rule: r.id }); toast('Queued: ' + o.queued); reload(true); ob.reload(true); } catch (e) { toast(friendly(e), 'warn', 6000); }
  };
  return html`<div>
    <${Banner} s=${s}/>
    ${error && html`<div class="card red">${friendly(error)}</div>`}
    ${data && data.consented === 0 && html`<div class="card" style="margin-bottom:12px;padding:10px 14px"><b>No marketing consent yet</b><span class="tiny dim"> · ${data.contacts} e-mails collected, 0 with consent. Rules for non-buyers send nothing until the creator e-mail dialog has the consent checkbox (prepared, not published).</span></div>`}
    ${data && html`<div class="row" style="gap:16px;margin-bottom:10px"><span class="tiny dim">Consented <b>${data.consented}</b> / ${data.contacts}</span><span class="tiny dim">Unsubscribed <b>${data.suppressed}</b></span></div>`}
    <div class="row between" style="margin-bottom:8px"><h3 style="margin:0">Rules</h3><button class="btn primary sm" onClick=${() => setRule(null)}>New rule</button></div>
    <div class="card tbl-wrap" style="padding:0"><table class="tbl"><thead><tr><th>Rule</th><th>Trigger</th><th>Template</th><th>Queued / sent</th><th>On</th><th></th></tr></thead><tbody>
      ${rules.map(r => html`<tr><td><b>${r.name}</b><div class="tiny dim">after ${r.delay_hours} h · max ${r.max_age_days} d</div></td><td class="tiny">${TRIGGERS[r.trigger_type]}</td><td class="tiny">${tname(r.template_key)}</td>
        <td class="tiny">${r.queued} / ${r.sent}${r.problems ? html` · <span style="color:var(--red)">${r.problems} problem</span>` : ''}</td>
        <td><${Switch} on=${r.active} onChange=${() => toggle(r)} label="Active"/></td>
        <td class="row" style="gap:4px"><button class="btn sm" onClick=${() => setRule(r)}>Edit</button><button class="btn sm" onClick=${() => run(r)}>Run now</button></td></tr>`)}
      ${data && !rules.length && html`<tr><td colspan="6"><${Empty}>No rules.</${Empty}></td></tr>`}</tbody></table></div>
    <div class="row between" style="margin:16px 0 8px"><h3 style="margin:0">Templates</h3><button class="btn sm" onClick=${() => setTpl(null)}>New template</button></div>
    <div class="card tbl-wrap" style="padding:0"><table class="tbl"><tbody>
      ${templates.map(t => html`<tr><td><b>${t.name}</b><div class="tiny dim">${t.subject}</div></td><td style="text-align:right"><button class="btn sm" onClick=${() => setTpl(t)}>Replace HTML</button></td></tr>`)}</tbody></table></div>
    <h3 style="margin:16px 0 8px">Recent mails</h3>
    <${Outbox} rows=${ob.data} reload=${() => ob.reload(true)}/>
    <h3 style="margin:16px 0 8px">Settings</h3>
    <${Settings} s=${s} reload=${() => reload(true)}/>
    ${rule !== undefined && html`<${RuleEditor} rule=${rule} templates=${templates} onClose=${() => setRule(undefined)} onSaved=${() => reload(true)}/>`}
    ${tpl !== undefined && html`<${TemplateUpload} tpl=${tpl} onClose=${() => setTpl(undefined)} onSaved=${() => reload(true)}/>`}
  </div>`;
}

export function Mail() {
  const [tab, setTab] = useState('fulfilment');
  return html`<div class="page">
    <div class="head"><div class="grow"><h1>Mail</h1></div></div>
    <div class="tabs" role="tablist" style="margin:0 0 12px;border:0">${TABS.map(([k, l]) => html`<button role="tab" aria-selected=${tab === k} onClick=${() => setTab(k)}>${l}</button>`)}</div>
    ${tab === 'fulfilment' ? html`<${Fulfilment}/>` : html`<${FollowUps}/>`}
  </div>`;
}
