// Money line pinned to the top of every page: profit and return as plain, coloured figures.
//  Profit and return come from admin_finance_summary (auto revenue, printing, AI, ads). Tap a figure to open where it comes from.
import { html, useState, useEffect, useRef, Picker, periodGroup, usePeriod } from '../ui.js';
import { setPeriod } from '../store.js';
import { windowTotals } from './finance.js';
import { rpc, fmt } from '../api.js';
import { go } from '../router.js';

const num = (x, d = 1) => Number(x).toLocaleString('cs-CZ', { maximumFractionDigits: d });
const kc = v => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(Math.round(v)).toLocaleString('cs-CZ') + ' Kč';

function useSlow(fn, ms) {
  const [d, setD] = useState(null), alive = useRef(true), f = useRef(fn);
  f.current = fn;
  useEffect(() => {
    alive.current = true;
    const run = () => { if (!document.hidden) f.current().then(x => alive.current && setD(x)).catch(() => {}); };
    run();
    const t = setInterval(run, ms), vis = () => { if (!document.hidden) run(); };
    document.addEventListener('visibilitychange', vis);
    return () => { alive.current = false; clearInterval(t); document.removeEventListener('visibilitychange', vis); };
  }, []);
  return d;
}

export function TopBars() {
  const fin = useSlow(() => rpc('admin_finance_summary'), 120000);
  const P = usePeriod();
  const T = fin ? windowTotals(fin, P.days) : null;
  if (T && fin.totals?.fixed_business_cost) {
    const included = (fin.days || []).slice(-P.days)
      .reduce((sum, day) => sum + (Number(day.fixed_business_cost) || 0), 0);
    // The headline carries all accrued fixed costs across reporting windows.
    const outsideWindow = fin.totals.fixed_business_cost - included;
    T.other += outsideWindow;
    T.profit -= outsideWindow;
  }
  const spent = T ? T.printing + T.generation + T.ads + T.other : 0;
  const roi = T && spent > 0 ? (T.revenue || 0) / spent : null;

  return html`<div class="goal" role="group" aria-label="Goal">
    <${Picker} groups=${[periodGroup(P.hours)]} onChange=${(_, v) => setPeriod(v)} label="Showing"/>
    <button class="goal-fig" onClick=${() => go('system')} title="Profit for the selected period, including accrued fixed costs">
      <span class="goal-l">Profit</span><span class=${'mono ' + (T ? (T.profit < 0 ? 'gv-bad' : 'gv-good') : '')}>${T ? kc(T.profit) : '…'}</span></button>
    <button class="goal-fig" onClick=${() => go('system')} title="All revenue divided by all money spent. 1 is break-even">
      <span class="goal-l">Return</span><span class=${'mono ' + (roi == null ? '' : roi < 1 ? 'gv-bad' : roi < 1.5 ? 'gv-mid' : 'gv-good')}>${roi == null ? '–' : '×' + num(roi, 2)}</span></button>
  </div>`;
}
