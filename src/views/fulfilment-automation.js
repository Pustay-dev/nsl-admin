// Automatic dispatch window, GLS numbers from KvikTisk that need a decision, and Shopify sync problems.
import { html, useState, confirm, useLoad, usePoll } from '../ui.js';
import { rpc } from '../api.js';
import { toast } from '../store.js';

const time = t => new Date(t).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
const minutesLeft = t => Math.max(0, Math.ceil((new Date(t) - Date.now()) / 60000));
const REASONS = {
  NO_ORDER_OR_NAME: 'Bez čísla objednávky a jména',
  NAME_NOT_MATCHED: 'Jméno neodpovídá žádné odeslané objednávce',
  NAME_MATCHES_SEVERAL_ORDERS: 'Jméno odpovídá více objednávkám',
  ORDER_NUMBER_NOT_FOUND: 'Číslo objednávky neexistuje',
  ORDER_NOT_SENT_TO_SUPPLIER: 'Objednávka ještě nebyla odeslána KvikTisku',
  ORDER_ALREADY_HAS_OTHER_TRACKING: 'Objednávka už má jiné číslo zásilky',
};
const ERRORS = {
  SUPPLIER_SEND_IN_PROGRESS: 'Objednávka se už odesílá. Zastavit ji nelze.',
  AUTO_DISPATCH_NOT_PENDING: 'Objednávka už nečeká na automatické odeslání.',
  ORDER_NUMBER_NOT_FOUND: 'Objednávka s tímto číslem neexistuje.',
  ...REASONS,
};
const msg = error => ERRORS[error?.message] || error?.message || 'Akce se nezdařila.';

export function useAutoDispatch(editor) {
  const pending = useLoad(() => editor ? rpc('admin_auto_dispatch_pending') : Promise.resolve([]), [editor]);
  usePoll(() => pending.reload(true), 15000);
  return pending;
}

// Shown in the order row: when the automatic order leaves for KvikTisk.
export function AutoDispatchTag({ orderId, pending }) {
  const row = (pending?.data || []).find(p => p.shopify_order === orderId);
  if (!row) return null;
  return html`<span class="tiny amber" style="display:block;margin-top:3px" title="Do té doby lze odeslání zastavit">Automaticky odejde v ${time(row.send_at)}</span>`;
}

export function AutoDispatchPanel({ pending, onChanged }) {
  const [busy, setBusy] = useState(null);
  const rows = pending.data || [];
  if (!rows.length) return null;
  const stop = async row => {
    if (!await confirm({
      title: 'Zastavit automatické odeslání ' + (row.order_name || '') + '?',
      body: 'Objednávka se vrátí do ruční kontroly a KvikTisku se nepošle. Automaticky se už znovu neschválí.',
      ok: 'Zastavit odeslání',
    })) return;
    setBusy(row.shopify_order);
    try {
      await rpc('admin_auto_dispatch_stop', { p_order: row.shopify_order });
      toast('Odeslání ' + (row.order_name || '') + ' zastaveno. Objednávka čeká na kontrolu.');
    } catch (error) { toast(msg(error), 'warn', 7000); }
    finally { setBusy(null); pending.reload(true); onChanged(); }
  };
  return html`<div class="card" style="margin-bottom:12px">
    <h2 style="margin:0 0 8px">Automaticky odejde KvikTisku</h2>
    <p class="small muted" style="margin:0 0 10px">Schváleno automaticky. Do odeslání máte čas objednávku zkontrolovat a případně zastavit.</p>
    <div class="col" style="gap:6px">${rows.map(row => html`<div class="row between" key=${row.shopify_order}>
      <span><b class="mono">${row.order_name || row.shopify_order}</b>
        <span class="small muted"> · odejde v ${time(row.send_at)} (${minutesLeft(row.send_at) ? 'za ' + minutesLeft(row.send_at) + ' min' : 'teď'})${row.items > 1 ? ' · ' + row.items + ' portréty' : ''}</span></span>
      <button class="btn sm danger" disabled=${busy === row.shopify_order} onClick=${() => stop(row)}>Zastavit</button>
    </div>`)}</div>
  </div>`;
}

export function TrackingReviewPanel({ editor, onChanged }) {
  const list = useLoad(() => editor ? rpc('admin_supplier_tracking_review') : Promise.resolve([]), [editor]);
  usePoll(() => list.reload(true), 60000);
  const [order, setOrder] = useState({});
  const [busy, setBusy] = useState(null);
  const rows = list.data || [];
  if (!rows.length) return null;
  const resolve = async (row, value) => {
    setBusy(row.id);
    try {
      await rpc('admin_supplier_tracking_resolve', { p_line: row.id, p_order_name: value });
      toast(value ? 'Číslo zásilky přiřazeno k ' + value + '. Shopify objednávku označí jako vyřízenou.' : 'Řádek ignorován.');
    } catch (error) { toast(msg(error), 'warn', 7000); }
    finally { setBusy(null); list.reload(true); onChanged(); }
  };
  return html`<div class="card" style="margin-bottom:12px;border-color:var(--amber)">
    <h2 style="margin:0 0 8px">Čísla zásilek GLS ke kontrole</h2>
    <p class="small muted" style="margin:0 0 10px">Z mailu KvikTisku se tato čísla nepodařilo jednoznačně přiřadit. Zadejte číslo objednávky.</p>
    <div class="col" style="gap:8px">${rows.map(row => html`<div class="row wrap" style="gap:8px" key=${row.id}>
      <span class="grow small"><b class="mono">${row.tracking_number || '–'}</b>${row.raw.trim() !== row.tracking_number ? ' · ' + row.raw : ''}
        <span class="tiny dim" style="display:block">${REASONS[row.reason] || row.reason}</span></span>
      <input class="in" style="width:96px" placeholder="#1023" value=${order[row.id] || ''}
        onInput=${e => setOrder(o => ({ ...o, [row.id]: e.currentTarget.value }))}/>
      <button class="btn sm primary" disabled=${busy === row.id || !/^#?\d{4,6}$/.test((order[row.id] || '').trim())}
        onClick=${() => resolve(row, '#' + (order[row.id] || '').trim().replace(/^#/, ''))}>Přiřadit</button>
      <button class="btn sm ghost" disabled=${busy === row.id} onClick=${() => resolve(row, null)}>Ignorovat</button>
    </div>`)}</div>
  </div>`;
}

export function ShopifySyncProblems({ editor }) {
  const list = useLoad(() => editor ? rpc('admin_shopify_sync_problems') : Promise.resolve([]), [editor]);
  usePoll(() => list.reload(true), 60000);
  const rows = list.data || [];
  if (!rows.length) return null;
  const label = { in_progress: 'stav „In progress“', fulfil: 'vyřízení s číslem GLS' };
  return html`<div class="card" style="margin-bottom:12px;border-color:var(--amber)">
    <h2 style="margin:0 0 8px">Shopify se nepodařilo aktualizovat</h2>
    <div class="col" style="gap:4px">${rows.map(row => html`<div class="small" key=${row.shopify_order + row.action}>
      <b class="mono">${row.order_name || row.shopify_order}</b> · ${label[row.action] || row.action}
      · ${row.status === 'failed' ? 'zastaveno, zkontrolujte v Shopify' : 'zkusí se znovu (' + row.attempts + '×)'}
      ${row.last_error && html`<span class="tiny dim" style="display:block">${row.last_error}</span>`}
    </div>`)}</div>
  </div>`;
}
