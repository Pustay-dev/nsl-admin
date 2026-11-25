import { confirm, html, useState } from '../ui.js';
import { rpc } from '../api.js';
import { lang } from '../i18n.js';
import { toast } from '../store.js';

const statuses = ['approved', 'sent', 'handed_to_dls', 'done'];
const labels = {
  approved: ['Schváleno', 'Approved'],
  sent: ['Odesláno', 'Sent'],
  handed_to_dls: ['Předáno DLS', 'Handed to DLS'],
  done: ['Hotovo', 'Done'],
};
const t = (cs, en) => lang() === 'cs' ? cs : en;

export function orderFulfilment(items) {
  const active = items.filter(item => item.production !== 'cancelled');
  const stages = active.map(item => statuses.indexOf(item.fulfilment));
  return stages.length ? statuses[Math.min(...stages)] : undefined;
}

export function FulfilmentBadge({ status }) {
  return html`<span class="stamp ok">${t(...labels[status])}</span>`;
}

export function AdvanceFulfilment({ orderId, status, onChanged }) {
  const [busy, setBusy] = useState(false);
  const next = statuses[statuses.indexOf(status) + 1];
  if (!status || !next) return null;
  const label = t(...labels[next]);
  const advance = async () => {
    setBusy(true);
    try {
      if (!await confirm({
        title: t('Změnit stav objednávky?', 'Update order status?'),
        body: t('Stav všech portrétů v objednávce se zaznamená v adminu. Změna neodešle žádný e-mail.',
          'This records the status of the portraits in the admin. It does not send an email.'),
        ok: label,
      })) return;
      await rpc('admin_order_set_fulfilment', { p_order: orderId, p_status: next });
      onChanged();
    } catch (error) {
      const messages = {
        ORDER_NOT_READY_FOR_FULFILMENT: t('Některý portrét ještě není připravený.', 'One or more portraits are not ready.'),
        SUPPLIER_SEND_IN_PROGRESS: t('Nejdřív ověřte předání ve frontě KvikTisku.', 'Check delivery in the KvikTisk queue first.'),
        INVALID_FULFILMENT_TRANSITION: t('Stav se mezitím změnil. Zkuste to znovu.', 'The status changed. Try again.'),
      };
      toast(messages[error.message] || error.message, 'warn', 6000);
      onChanged();
    } finally { setBusy(false); }
  };
  return html`<button type="button" class="btn sm ghost" disabled=${busy} onClick=${advance}>${t('Označit jako', 'Mark as')} ${label}</button>`;
}
