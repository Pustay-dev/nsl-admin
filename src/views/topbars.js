// Two thin progress bars pinned to the top of every page.
//  1) Conversion: visitor -> PAID order. 100 % of the bar = the conversion goal (default 3 %, per test while one runs).
//     Source: the running A/B test if there is one (both variants together), otherwise the last 7 days of the customer-journey report.
//  2) Profit: from -10 000 Kč to +1 000 000 Kč (a notch marks 0). Source: admin_finance_summary (auto revenue, printing, AI, ads).
import { html, useState, useEffect, useRef } from '../ui.js';
import { rpc, fmt } from '../api.js';
import { go } from '../router.js';

const LO = -10000, HI = 1000000, DEFAULT_GOAL = 10, ROI_MAX = 3; // conversion goal 10 %; return bar scale 0…3 Kč per 1 Kč (notch at 1 = break-even)
const num = (x, d = 1) => Number(x).toLocaleString('cs-CZ', { maximumFractionDigits: d });
const kc = v => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(Math.round(v)).toLocaleString('cs-CZ') + ' Kč';

async function loadConversion() {
  let list = [];
  try { list = await rpc('admin_ab_list'); } catch { /* viewer without the table or offline: fall back */ }
  const run = (list || []).find(e => e.status === 'running');
  if (run) {
    const a = run.arms || {}, v = (a.A?.visitors || 0) + (a.B?.visitors || 0), o = (a.A?.ordered || 0) + (a.B?.ordered || 0);
    return { label: 'Test: ' + run.name, visitors: v, paid: o, goal: DEFAULT_GOAL, test: run.id };
  }
  const r = await rpc('admin_cx_report', { p_days: 7, p_device: null });
  const F = r?.funnel || {};
  return { label: 'Last 7 days', visitors: F.landed || 0, paid: F.paid || 0, goal: DEFAULT_GOAL, test: null };
}

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
  const conv = useSlow(loadConversion, 60000);
  const fin = useSlow(() => rpc('admin_finance_summary'), 120000);

  const rate = conv && conv.visitors ? (100 * conv.paid) / conv.visitors : 0;
  const cp = conv ? Math.max(0, Math.min(100, (rate / conv.goal) * 100)) : 0;
  const profit = fin?.totals?.profit ?? null;
  const pp = profit == null ? 0 : Math.max(0, Math.min(100, ((profit - LO) / (HI - LO)) * 100));
  const zero = ((0 - LO) / (HI - LO)) * 100;
  // return on money in: all revenue ÷ all money out (printing + delivery, AI, ads, other)
  const T = fin?.totals, spent = T ? (T.printing || 0) + (T.generation || 0) + (T.ads || 0) + (T.other || 0) : 0;
  const roi = T && spent > 0 ? (T.revenue || 0) / spent : null;
  const rp = roi == null ? 0 : Math.max(0, Math.min(100, (roi / ROI_MAX) * 100)), be = (1 / ROI_MAX) * 100;

  return html`<div class="topbars" role="group" aria-label="Conversion and profit">
    <button class="tb" onClick=${() => go(conv?.test ? 'experiments/' + conv.test : 'analytics')} title="Visitor → paid order. The number is the real conversion rate; the bar is full when it reaches the goal.">
      <div class="tb-h"><span class="tb-l">Conversion · ${conv?.label || '…'}</span>
        <span class="tb-v">${conv ? html`<b>${conv.paid}</b> <i>paid of ${fmt.n(conv.visitors)} visitors · goal ${num(conv.goal)} %</i>` : '…'}</span>
        <span class="tb-p">${conv ? (conv.visitors ? num(rate, 2) + ' %' : '–') : ''}</span></div>
      <div class="tb-track" role="progressbar" aria-valuemin="0" aria-valuemax=${conv ? conv.goal : 100} aria-valuenow=${conv ? Math.min(rate, conv.goal) : 0} aria-valuetext=${conv ? num(rate, 2) + ' % of ' + num(conv.goal) + ' % goal' : ''} aria-label="Conversion rate towards goal"><i class="g" style=${'width:' + cp + '%'}></i></div>
    </button>
    <button class="tb" onClick=${() => go('system')} title="Profit so far = paid orders − printing & delivery − AI − ads. Scale −10 000 Kč … +1 000 000 Kč.">
      <div class="tb-h"><span class="tb-l">Profit</span>
        <span class="tb-v">${profit == null ? '…' : html`<b class=${profit < 0 ? 'red' : 'acid'}>${kc(profit)}</b> <i>${fin.totals.orders} orders · revenue ${fmt.czk(fin.totals.revenue)}</i>`}</span>
        <span class="tb-p">${profit == null ? '' : num(((profit - LO) / (HI - LO)) * 100, 1) + ' %'}</span></div>
      <div class="tb-track" role="progressbar" aria-valuemin=${LO} aria-valuemax=${HI} aria-valuenow=${profit ?? 0} aria-label="Profit"><i class=${profit != null && profit < 0 ? 'r' : 'g'} style=${'width:' + pp + '%'}></i><u style=${'left:' + zero + '%'}></u></div>
      <div class="tb-ends"><span>−10 000 Kč</span><span style=${'left:' + zero + '%'} class="z">0</span><span>1 000 000 Kč</span></div>
    </button>
    <button class="tb" onClick=${() => go('system')} title="Return on money in: all revenue ÷ all money out (printing + delivery, AI, ads, other). 1 Kč in → X Kč out. The notch is break-even.">
      <div class="tb-h"><span class="tb-l">Return</span>
        <span class="tb-v">${roi == null ? '…' : html`<b class=${roi < 1 ? 'red' : 'acid'}>1 Kč = ${num(roi, 2)} Kč</b> <i>${fmt.czk(T.revenue)} earned on ${fmt.czk(spent)} spent</i>`}</span>
        <span class="tb-p">${roi == null ? '' : '×' + num(roi, 2)}</span></div>
      <div class="tb-track" role="progressbar" aria-valuemin="0" aria-valuemax=${ROI_MAX} aria-valuenow=${roi == null ? 0 : Math.min(roi, ROI_MAX)} aria-valuetext=${roi == null ? '' : '1 Kč in gives ' + num(roi, 2) + ' Kč back'} aria-label="Return on money in"><i class=${roi != null && roi < 1 ? 'r' : 'g'} style=${'width:' + rp + '%'}></i><u style=${'left:' + be + '%'}></u></div>
      <div class="tb-ends"><span>0</span><span style=${'left:' + be + '%'} class="z">1 = break-even</span><span>3 Kč</span></div>
    </button>
  </div>`;
}
