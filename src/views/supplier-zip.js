import { html, useState, confirm, useLoad } from '../ui.js';
import { rpc } from '../api.js';
import { toast } from '../store.js';
import { lang } from '../i18n.js';

const t = (cs, en) => lang() === 'cs' ? cs : en;
const labels = {
  queued: ['Ve frontě KvikTisku', 'Queued for KvikTisk'],
  leased: ['Dávka se odesílá', 'Sending batch'],
  needs_review: ['Ověřte odeslání ZIPu', 'Verify ZIP delivery'],
  failed: ['Ověřte odeslání ZIPu', 'Verify ZIP delivery'],
  sent: ['ZIP předán poště', 'ZIP accepted by mail server'],
};
const review = ['needs_review', 'failed'];

export function useSupplierZip(role) {
  const canEdit = role === 'owner' || role === 'editor';
  const settings = useLoad(() => canEdit ? rpc('admin_mail_settings_get') : Promise.resolve(null), [canEdit]);
  const installed = typeof settings.data?.supplier_zip_enabled === 'boolean';
  const outbox = useLoad(() => installed ? rpc('admin_mail_outbox_list', { p_limit: 200 }) : Promise.resolve([]), [installed]);
  const rows = (outbox.data || []).filter(row => row.delivery_transport === 'supplier_zip');
  return { installed, settings, outbox, rows };
}

export function SupplierZipOrder({ order, zip }) {
  const [busy, setBusy] = useState(false);
  if (!zip.installed) return null;
  const matching = order.items.map(item => zip.rows.find(row => row.order_item_id === item.id));
  const status = ['needs_review', 'failed', 'leased', 'queued', 'sent'].find(s => matching.some(row => row?.status === s));
  const ready = zip.settings.data?.supplier_zip_enabled && zip.settings.data?.sending_enabled &&
    zip.outbox.data && !zip.outbox.error && !status && order.items.every(o =>
      o.qc === 'approved' && o.production === 'ready_to_print' && o.payment === 'paid' && o.has_file && !o.hold && !o.test);
  const queue = async e => {
    e.stopPropagation();
    setBusy(true);
    try {
      const ok = await confirm({
        title: t('Zařadit objednávku do nočního ZIPu?', 'Queue this order for the nightly ZIP?'),
        body: t('Zařaďte jen objednávku, která ještě nebyla předána k tisku. Všechny její portréty se odešlou společně.',
          'Only queue a new order that has not been handed to the printer. All its portraits go together.'),
        ok: t('Zařadit do dávky', 'Queue for batch'),
      });
      if (!ok) return;
      const [item] = order.items;
      await rpc('admin_mail_queue_supplier_zip', { p_item: item.id, p_revision: item.revision });
      toast(t('Objednávka zařazená do nočního ZIPu', 'Order queued for the nightly ZIP'));
      zip.outbox.reload(true);
    } catch (error) { toast(error.message, 'warn', 7000); }
    finally { setBusy(false); }
  };
  return html`
    ${status && html`<span class=${'tiny ' + (review.includes(status) ? 'amber' : 'dim')} style="display:block;margin-top:3px">${t(...labels[status])}</span>`}
    ${ready && html`<button class="btn sm ghost" style="margin-top:3px" disabled=${busy} onClick=${queue}>${t('Zařadit do ZIPu', 'Queue for ZIP')}</button>`}
  `;
}

export function SupplierZipPanel({ zip, owner }) {
  const [busy, setBusy] = useState(false);
  const [address, setAddress] = useState(null);
  const [redirect, setRedirect] = useState(null);
  if (!zip.installed) return null;
  const settings = zip.settings.data;
  const needsRedirect = settings.sending_enabled && settings.redirect_enabled && !settings.redirect_to?.trim();
  const rows = zip.rows.filter(row => review.includes(row.status));
  const act = async (operation, reload) => {
    setBusy(true);
    try { await operation(); reload(true); }
    catch (error) { toast(error.message, 'warn', 7000); }
    finally { setBusy(false); }
  };
  const saveAddress = event => {
    event.preventDefault();
    return act(async () => {
      const changes = {};
      if (!settings.supplier_zip_enabled && address?.trim()) changes.supplier_email = address.trim();
      if (settings.redirect_enabled && redirect !== null) changes.redirect_to = redirect.trim();
      await rpc('admin_mail_settings_set', { p: changes });
      setAddress(null);
      setRedirect(null);
    }, zip.settings.reload);
  };
  const toggle = async () => {
    const enable = !settings.supplier_zip_enabled;
    const ok = await confirm({
      title: enable ? t('Povolit noční ZIP?', 'Enable the nightly ZIP?') : t('Pozastavit noční ZIP?', 'Pause the nightly ZIP?'),
      body: enable ? t('Zařazené objednávky půjdou v 01:00 na ', 'Queued orders will go at 01:00 to ') + settings.supplier_email + '.'
        : t('Zařazené objednávky zůstanou ve frontě.', 'Queued orders will wait in the outbox.'),
      ok: enable ? t('Povolit', 'Enable') : t('Pozastavit', 'Pause'), danger: enable,
    });
    if (ok) await act(() => rpc('admin_mail_set_supplier_zip', { p_enabled: enable }), zip.settings.reload);
  };
  const resolve = async (row, action) => {
    const sent = action === 'confirm_sent';
    const ok = await confirm({
      title: sent ? t('Potvrdit odeslání položky?', 'Confirm this line was sent?') : t('Znovu zařadit položku?', 'Requeue this line?'),
      body: sent
        ? t('Potvrďte až po ověření, že předchozí ZIP odešel.', 'Confirm after verifying the previous ZIP was sent.')
        : t('Pokračujte po ověření, že KvikTisk předchozí ZIP nedostal. U vícepoložkové objednávky znovu zařaďte všechny položky.',
          'Continue after verifying KvikTisk did not receive the ZIP. Requeue every line in a multi-line order.'),
      ok: sent ? t('Potvrdit odeslání', 'Confirm delivery') : t('Znovu zařadit', 'Requeue'), danger: true,
    });
    if (ok) await act(() => rpc('admin_mail_outbox_resolve', { p_id: row.id, p_action: action }), zip.outbox.reload);
  };
  return html`<details class="card" style="padding:10px 14px;margin-bottom:12px">
    <summary style="cursor:pointer"><b>${t('Noční ZIP pro KvikTisk', 'Nightly KvikTisk ZIP')}</b>
      <span class="tiny dim"> · 01:00 · ${settings.supplier_zip_enabled && settings.sending_enabled ? t('povoleno', 'enabled') : t('pozastaveno', 'paused')}</span>
      ${rows.length > 0 && html`<span class="tiny amber"> · ${rows.length} ${t('ke kontrole', 'to check')}</span>`}
    </summary>
    <div class="col" style="gap:8px;margin-top:12px">
      ${owner && html`<form class="row wrap" style="gap:8px" onSubmit=${saveAddress}>
        <label class="f">${t('Adresa tiskárny', 'Printer email')}
          <input class="in" type="email" placeholder="hesoun@kviktisk.cz" value=${address ?? settings.supplier_email ?? ''} onInput=${e => setAddress(e.target.value)} disabled=${busy || settings.supplier_zip_enabled}/>
        </label>
        ${settings.redirect_enabled && html`<label class="f">${t('Testovací e-mail', 'Test email')}
          <input class="in" type="email" value=${redirect ?? settings.redirect_to ?? ''} onInput=${e => setRedirect(e.target.value)} required=${settings.sending_enabled} disabled=${busy || (settings.supplier_zip_enabled && !needsRedirect)}/>
        </label>`}
        <button type="submit" class="btn sm" disabled=${busy || (!address?.trim() && !redirect?.trim())}>${t('Uložit adresy', 'Save addresses')}</button>
        <button type="button" class="btn sm" disabled=${busy || (!settings.supplier_zip_enabled && (!settings.supplier_email || !settings.sending_enabled))} onClick=${toggle}>
          ${settings.supplier_zip_enabled ? t('Pozastavit', 'Pause') : t('Povolit dávku', 'Enable batches')}
        </button>
      </form>`}
      ${owner && needsRedirect && html`<span class="small amber">${t('Pro uložení adres vyplňte testovací e-mail.', 'Enter a test email to save the addresses.')}</span>`}
      ${owner && settings.redirect_enabled && html`<span class="small dim">${t('Noční ZIP se posílá na adresu tiskárny. Testovací přesměrování platí pro ostatní automatické e-maily.', 'The nightly ZIP goes to the printer address. Test redirect applies to other automated emails.')}</span>`}
      ${zip.outbox.error && html`<span class="small amber">${t('Frontu se nepodařilo načíst.', 'Could not load the ZIP outbox.')}</span>`}
      ${rows.map(row => html`<div key=${row.id} class="row wrap" style="gap:8px">
        <span class="grow small">${row.subject} · ${row.supplier_zip_batch_id?.slice(0, 8) || '—'} · ${row.error_code || '—'}</span>
        ${!row.sent_at && html`<button class="btn sm" disabled=${busy} onClick=${() => resolve(row, 'requeue')}>${t('Znovu zařadit', 'Requeue')}</button>`}
        <button class="btn sm" disabled=${busy} onClick=${() => resolve(row, 'confirm_sent')}>${t('Odesláno', 'Confirm sent')}</button>
      </div>`)}
    </div>
  </details>`;
}
