// Automatic finance. Revenue, printing + delivery and AI cost are computed from real paid orders and real generations
// (rpc admin_finance_summary). Ads = a daily amount (default 300 Kč) with optional per-day override. Feeds the profit bar on top.
import { html, useState, Skel, useLoad } from '../ui.js';
import { rpc, fmt } from '../api.js';
import { toast } from '../store.js';

const SIZES = [['45x30', 'Small (Mini) 45×30'], ['60x40', 'Medium (Classic) 60×40'], ['60x90', 'Large (Premium) 60×90']];
const kc = v => (v == null ? '–' : (v < 0 ? '−' : '') + Math.abs(Math.round(v)).toLocaleString('cs-CZ') + ' Kč');

export function FinanceCard({ role }) {
  const { data, error, reload } = useLoad(() => rpc('admin_finance_summary'));
  const [f, setF] = useState(null), [day, setDay] = useState(new Date().toISOString().slice(0, 10)), [dads, setDads] = useState(''), [dother, setDother] = useState(''), [busy, setBusy] = useState(false);
  if (error) return html`<div class="card"><h3>Finance</h3><div class="red small">${error.message}</div></div>`;
  if (!data) return html`<div class="card"><h3>Finance</h3><${Skel} hgt=${160}/></div>`;
  const S = data.settings, T = data.totals || {}, owner = role === 'owner', editor = role !== 'viewer';
  const v = f || { ads: S.ads_per_day_czk, start: S.ads_start_date, deliv: S.delivery_czk, price: { ...S.price_czk }, print: { ...S.print_cost_czk } };
  const set = (k, x) => setF({ ...v, [k]: x });
  const save = async () => {
    setBusy(true);
    try {
      const num = x => Number(x) || 0;
      await rpc('admin_setting_set', { p_key: 'ads_per_day_czk', p_value: num(v.ads) });
      await rpc('admin_setting_set', { p_key: 'ads_start_date', p_value: v.start });
      await rpc('admin_setting_set', { p_key: 'delivery_czk', p_value: num(v.deliv) });
      await rpc('admin_setting_set', { p_key: 'price_czk', p_value: Object.fromEntries(Object.entries(v.price).map(([k, x]) => [k, num(x)])) });
      await rpc('admin_setting_set', { p_key: 'print_cost_czk', p_value: Object.fromEntries(Object.entries(v.print).map(([k, x]) => [k, num(x)])) });
      toast('Finance settings saved'); setF(null); reload(true);
    } catch (e) { toast(e.message, 'err', 6000); }
    setBusy(false);
  };
  const saveDay = async () => {
    setBusy(true);
    try { await rpc('admin_finance_set', { p: { day, revenue: 0, ads: Number(dads) || 0, generation: 0, printing: 0, other: Number(dother) || 0 } }); toast('Saved for ' + day); setDads(''); setDother(''); reload(true); }
    catch (e) { toast(e.message, 'err', 6000); }
    setBusy(false);
  };
  const rows = [['Revenue (paid orders)', T.revenue, 'acid'], ['Printing + delivery', -T.printing], ['AI generations', -T.generation], ['Ads', -T.ads], ['Other costs', -T.other]];
  const last = (data.days || []).slice(-8).reverse();
  return html`<div class="card"><h3>Finance <span class="grow"></span><span class="tiny dim">automatic · since ${data.from}</span></h3>
    <div class="col" style="gap:6px">${rows.map(([l, x, c]) => html`<div class="row between small"><span>${l}</span><b class=${c || ''}>${kc(x)}</b></div>`)}
      <div class="row between" style="border-top:1px solid var(--line);padding-top:8px;margin-top:2px"><b>Profit</b><b class=${(T.profit || 0) < 0 ? 'red' : 'acid'} style="font-size:18px">${kc(T.profit)}</b></div>
      <div class="tiny dim">${T.orders || 0} paid orders (test orders excluded). Revenue = list price of the size; discounts and shipping fees are not netted.${data.unpriced ? ` ⚠ ${data.unpriced} order(s) have a size without a price below.` : ''}</div></div>

    <h3 style="margin-top:18px">Last days</h3>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Day</th><th class="num">Orders</th><th class="num">Revenue</th><th class="num">Print</th><th class="num">AI</th><th class="num">Ads</th><th class="num">Profit</th></tr></thead><tbody>
      ${last.map(d => html`<tr><td>${d.day}</td><td class="num">${d.orders || ''}</td><td class="num">${d.revenue ? fmt.n(d.revenue) : ''}</td><td class="num">${d.printing ? fmt.n(d.printing) : ''}</td><td class="num">${fmt.n(d.generation)}</td><td class="num">${d.ads ? fmt.n(d.ads) : ''}</td><td class=${'num ' + (d.profit < 0 ? 'red' : 'acid')}>${fmt.n(d.profit)}</td></tr>`)}</tbody></table></div>

    <h3 style="margin-top:18px">Ads per day <span class="tiny dim">fallback only</span></h3>
    <div class="tiny dim" style="margin-bottom:8px">${data.meta_ads_from ? `Ad spend now comes from Meta (synced daily) from ${data.meta_ads_from}. The amounts below are used only before that date, or if Meta is not connected.` : 'Meta is not connected, so these manual amounts are used.'}</div>
    <div class="grid g2"><label class="f">Daily ad spend (Kč)<input class="in" type="number" min="0" value=${v.ads} disabled=${!owner} onInput=${e => set('ads', e.target.value)}/></label>
      <label class="f">Counted from<input class="in" type="date" value=${v.start} disabled=${!owner} onInput=${e => set('start', e.target.value)}/></label></div>
    <div class="grid g2" style="margin-top:8px"><label class="f">Different amount for one day<input class="in" type="date" value=${day} onInput=${e => setDay(e.target.value)}/></label>
      <label class="f">Ads that day (Kč)<input class="in" type="number" min="0" placeholder=${S.ads_per_day_czk} value=${dads} onInput=${e => setDads(e.target.value)}/></label>
      <label class="f">Other costs that day (Kč)<input class="in" type="number" min="0" value=${dother} onInput=${e => setDother(e.target.value)}/></label>
      <div class="row end" style="align-items:end"><button class="btn" disabled=${!editor || busy || (!dads && !dother)} onClick=${saveDay}>Save day</button></div></div>

    <h3 style="margin-top:18px">Prices and print costs ${!owner && html`<span class="tiny dim">(owner can edit)</span>`}</h3>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Size</th><th class="num">Customer pays (Kč)</th><th class="num">Print cost (Kč)</th></tr></thead><tbody>
      ${SIZES.map(([k, l]) => html`<tr><td>${l}</td><td class="num"><input class="in" style="width:92px;text-align:right" type="number" min="0" value=${v.price[k] ?? ''} disabled=${!owner} onInput=${e => set('price', { ...v.price, [k]: e.target.value })}/></td>
        <td class="num"><input class="in" style="width:92px;text-align:right" type="number" min="0" value=${v.print[k] ?? ''} disabled=${!owner} onInput=${e => set('print', { ...v.print, [k]: e.target.value })}/></td></tr>`)}</tbody></table></div>
    <div class="grid g2" style="margin-top:8px"><label class="f">Delivery per order (Kč)<input class="in" type="number" min="0" value=${v.deliv} disabled=${!owner} onInput=${e => set('deliv', e.target.value)}/></label>
      <div class="row end" style="align-items:end"><button class="btn primary" disabled=${!owner || busy || !f} onClick=${save}>Save settings</button></div></div>
    <div class="tiny dim" style="margin-top:8px">AI cost = real generations × $${Number(S.cost_per_generation_usd).toFixed(4)} × ${S.usd_czk} Kč (calibrate in the Engine card). Printing = print cost + delivery once per order.</div>
  </div>`;
}
