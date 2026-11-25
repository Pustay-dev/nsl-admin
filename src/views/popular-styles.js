import { html, useLoad, useState } from '../ui.js';
import { rpc } from '../api.js';
import { lang } from '../i18n.js';
import { toast } from '../store.js';

const t = (cs, en) => lang() === 'cs' ? cs : en;

function Category({ data, editable, onSave }) {
  const initial = Array.from({ length: 4 }, (_, index) =>
    data.options.some(option => option.id === data.manual[index]) ? data.manual[index] : '');
  const [slots, setSlots] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await rpc('admin_set_funnel_popular_styles', { p_category: data.id, p_style_ids: slots.map(id => id || null) });
      setSaved(slots);
      toast(t('Populární styly uloženy', 'Popular styles saved'));
      onSave();
    } catch (error) { toast(error.message, 'err', 6000); }
    finally { setBusy(false); }
  };
  return html`<div class="col">
    ${slots.map((id, index) => html`<label class="f" key=${index}>
      ${index + 1}. ${index === 3 ? t('Jen telefon', 'Phone only') : t('Telefon a počítač', 'Phone and desktop')}
      <select class="in" value=${id} disabled=${busy || !editable} onChange=${e => {
        const next = [...slots]; next[index] = e.target.value; setSlots(next);
      }}>
        <option value="">${t('Automaticky', 'Automatic')}</option>
        ${data.options.map(option => html`<option value=${option.id}
          disabled=${option.id !== id && slots.includes(option.id)}>${option.label} · ${option.paid} ${t('zaplaceno', 'paid')}</option>`)}
      </select>
    </label>`)}
    ${editable && html`<div><button type="button" class="btn sm primary"
      disabled=${busy || slots.every((id, index) => id === saved[index])} onClick=${save}>${t('Uložit', 'Save')}</button></div>`}
  </div>`;
}

export function PopularStyles({ editable }) {
  const { data, error, reload } = useLoad(() => rpc('admin_funnel_popular_styles'), []);
  const [category, setCategory] = useState('');
  const current = data?.find(item => item.id === category) ?? data?.[0];
  if (error) return html`<p class="tiny amber">${t('Populární styly se nepodařilo načíst.', 'Could not load popular styles.')}</p>`;
  if (!data) return html`<p class="tiny dim">${t('Načítám…', 'Loading…')}</p>`;
  if (!current) return null;
  return html`<div class="col">
    <p class="muted small">${t('Automatické pořadí řadí podle zaplacených objednávek, při shodě podle generování.',
      'Automatic ranking uses paid orders first, then generations.')}</p>
    <label class="f">${t('Pro koho je portrét', 'Portrait recipient')}
      <select class="in" value=${current.id} onChange=${e => setCategory(e.target.value)}>
        ${data.map(item => html`<option value=${item.id}>${item.label}</option>`)}
      </select>
    </label>
    <${Category} key=${current.id} data=${current} editable=${editable} onSave=${() => reload(true)}/>
  </div>`;
}
