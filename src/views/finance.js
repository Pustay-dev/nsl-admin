// Money: one calculation from live numbers. Revenue = paid orders, AI = real generations, ads = Meta (when its sync is in the
// database), printing + delivery = the set price per size. The manual daily ad amounts are gone from the screen; the days table
// and the price settings are folded away. Data: rpc admin_finance_summary.
import { html, useState, Skel, useLoad, usePeriod } from '../ui.js';
import { rpc, fmt } from '../api.js';
import { toast } from '../store.js';

const SIZES = [['20x30', 'Small (Mini) 20×30'], ['60x40', 'Medium 60×40'], ['60x90', 'Large 60×90']];
const kc = v => (v == null ? '–' : (v < 0 ? '−' : '') + Math.abs(Math.round(v)).toLocaleString('cs-CZ') + ' Kč');

// Totals of the last `days` days (today included) from admin_finance_summary().days; the database counts money per day.
export function windowTotals(data, days) {
  const list = (data.days || []).slice(-Math.max(1, days));
  const t = { orders: 0, revenue: 0, printing: 0, generation: 0, ads: 0, other: 0, profit: 0 };
  for (const d of list) for (const k of Object.keys(t)) t[k] += Number(d[k]) || 0;
  return t;
}

export function FinanceCard({ role }) {
  const { data, error, reload } = useLoad(() => rpc('admin_finance_summary'));
  const P = usePeriod();
  const [f, setF] = useState(null), [busy, setBusy] = useState(false);
  if (error) return html`<div class="card"><h3>Money</h3><div class="red small">${error.message}</div></div>`;
  if (!data) return html`<div class="card"><h3>Money</h3><${Skel} hgt=${160}/></div>`;
  const S = data.settings, T = windowTotals(data, P.days), owner = role === 'owner';
  const v = f || { deliv: S.delivery_czk, print: { ...S.print_cost_czk } };
  const set = (k, x) => setF({ ...v, [k]: x });
  const save = async () => {
    setBusy(true);
    try {
      const num = x => Number(x) || 0;
      await rpc('admin_setting_set', { p_key: 'delivery_czk', p_value: num(v.deliv) });
      await rpc('admin_setting_set', { p_key: 'print_cost_czk', p_value: Object.fromEntries(Object.entries(v.print).map(([k, x]) => [k, num(x)])) });
      toast('Saved'); setF(null); reload(true);
    } catch (e) { toast(e.message, 'err', 6000); }
    setBusy(false);
  };
  const metaLive = !!data.meta_ads_from;
  const last = (data.days || []).slice(-Math.max(1, P.days)).reverse();
  const fixedCost = Number(data.totals?.fixed_business_cost) || 0;
  const fixedCostInPeriod = last.reduce((sum, day) => sum + (Number(day.fixed_business_cost) || 0), 0);
  const otherCosts = T.other - fixedCostInPeriod;
  const profit = T.profit + fixedCostInPeriod - fixedCost;
  const rows = [
    ['Revenue', T.revenue, data.revenue_source === 'shopify_paid_orders' ? 'Shopify paid totals' : 'catalog price estimates', ''],
    ['Printing and delivery', -T.printing, 'set prices', ''],
    ['AI portraits', -T.generation, 'automatic', ''],
    ['Ads', -T.ads, metaLive ? 'from Meta' : 'needs Meta in the database', metaLive ? '' : 'amber'],
  ];
  if (otherCosts) rows.push(['Other costs', -otherCosts]);
  if (fixedCost) rows.push(['Živnost do 1.1.', -fixedCost]);
  return html`<section class="card money"><h3>Money<span class="grow"></span><span class="small muted">${P.label}</span></h3>
    <div class="calc">${rows.map(([l, x, src, tone]) => html`<div class="calc-r"><span>${l}${src && html`<small class=${tone}>${src}</small>`}</span><b>${kc(x)}</b></div>`)}
      <div class="calc-r total"><span>Profit</span><b class=${profit < 0 ? 'gv-bad' : 'gv-good'}>${kc(profit)}</b></div></div>
    ${data.missing_print_cost ? html`<p class="small amber" style="margin:8px 0 0">${data.missing_print_cost} order item(s) have no configured print cost.</p>` : ''}
    ${data.missing_shopify_amounts ? html`<p class="small amber" style="margin:8px 0 0">${data.missing_shopify_amounts} Shopify order(s) have no usable CZK payment total.</p>` : ''}
    <details class="fold"><summary>Day by day</summary>
      <div class="tbl-wrap"><table class="tbl slim"><thead><tr><th>Day</th><th class="num">Orders</th><th class="num">Revenue</th><th class="num">Print</th><th class="num">AI</th><th class="num">Ads</th><th class="num">Profit</th></tr></thead><tbody>
        ${last.map(d => html`<tr><td class="small">${d.day}</td><td class="num">${d.orders || ''}</td><td class="num">${d.revenue ? fmt.n(d.revenue) : ''}</td><td class="num">${d.printing ? fmt.n(d.printing) : ''}</td><td class="num">${fmt.n(d.generation)}</td><td class="num">${d.ads ? fmt.n(d.ads) : ''}</td><td class=${'num ' + (d.profit < 0 ? 'red' : '')}>${fmt.n(d.profit)}</td></tr>`)}</tbody></table></div></details>
    <details class="fold"><summary>Print and delivery costs</summary>
      <div class="tbl-wrap"><table class="tbl slim"><thead><tr><th>Size</th><th class="num">Print costs</th></tr></thead><tbody>
        ${SIZES.map(([k, l]) => html`<tr><td>${l}</td>
          <td class="num"><input class="in" style="width:92px;text-align:right" type="number" min="0" value=${v.print[k] ?? ''} disabled=${!owner} onInput=${e => set('print', { ...v.print, [k]: e.target.value })}/></td></tr>`)}</tbody></table></div>
      <div class="row" style="margin-top:8px;gap:12px;align-items:end"><label class="f grow">Delivery per order (Kč)<input class="in" type="number" min="0" value=${v.deliv} disabled=${!owner} onInput=${e => set('deliv', e.target.value)}/></label>
        ${owner && html`<button class="btn primary" disabled=${busy || !f} onClick=${save}>Save</button>`}</div></details>
  </section>`;
}
