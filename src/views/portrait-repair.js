import { html, useEffect, useLoad, usePoll, useState } from '../ui.js';
import { rpc, sb } from '../api.js';

const SCALE = 100000;
export const repairPending = o => o.repair === 'queued' || o.repair === 'processing';

export async function repairOrders(filter) {
  try { return await rpc('admin_orders_with_portrait_repair', { p_filter: filter }); }
  catch (error) {
    if (!/Could not find the function.*admin_orders_with_portrait_repair/i.test(error?.message ?? '')) throw error;
    return rpc('admin_orders', { p_filter: filter });
  }
}

export function useRepairOrders(filter) {
  const orders = useLoad(() => repairOrders(filter), [filter]);
  const [pending, setPending] = useState(null);
  useEffect(() => {
    if (pending && orders.data?.some(o => o.id === pending && o.repair)) setPending(null);
  }, [orders.data, pending]);
  usePoll(() => {
    if (pending || orders.data?.some(repairPending)) orders.reload(true);
  }, 4500);
  return {
    ...orders,
    data: orders.data?.map(o => o.id === pending && !o.repair ? { ...o, repair: 'queued' } : o) ?? null,
    onQueued: id => setPending(id),
  };
}

export function RepairLoading() {
  return html`<span class="row tiny" role="status" style="gap:6px"><span class="spinner" aria-hidden="true" style="width:14px;height:14px"></span>Oprava portrétu probíhá…</span>`;
}

export async function uploadQcPrint(o, file) {
  if (file.size > 32 * 1024 * 1024) throw new Error('PRINT_UPLOAD_TOO_LARGE');
  const { data, error } = await sb().functions.invoke('admin-qc-upload', {
    body: file, headers: { 'Content-Type': file.type || 'application/octet-stream', 'x-qc-item': o.id, 'x-qc-revision': String(o.revision) },
  });
  if (error) {
    const response = await error.context?.json?.().catch(() => null);
    throw new Error(response?.error || error.message);
  }
  return data;
}

export function RepairRegion({ src, region, onChange }) {
  const [anchor, setAnchor] = useState(null);
  const [preview, setPreview] = useState(null);
  const point = e => {
    const bounds = e.currentTarget.getBoundingClientRect();
    return [e.clientX - bounds.left, e.clientY - bounds.top].map((v, i) =>
      Math.round(Math.max(0, Math.min(1, v / (i ? bounds.height : bounds.width))) * SCALE));
  };
  const rect = (a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];
  const start = e => {
    if (!e.isPrimary || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setAnchor(point(e));
    setPreview(null);
  };
  const end = e => {
    if (!anchor) return;
    const selected = rect(anchor, point(e));
    setAnchor(null);
    setPreview(null);
    onChange(selected[2] - selected[0] >= 100 && selected[3] - selected[1] >= 100 ? selected : null);
  };
  const overlay = preview || region;
  const position = overlay && {
    left: overlay[0] / 1000 + '%', top: overlay[1] / 1000 + '%',
    width: (overlay[2] - overlay[0]) / 1000 + '%', height: (overlay[3] - overlay[1]) / 1000 + '%',
  };
  return html`<div class="col" style="align-items:center;gap:5px">
    <span class="small">Tažením označte oblast, kterou chcete opravit.</span>
    <div style="display:inline-block;position:relative;line-height:0;touch-action:none;cursor:crosshair"
      onPointerDown=${start} onPointerMove=${e => { if (anchor) setPreview(rect(anchor, point(e))); }} onPointerUp=${end}
      onPointerCancel=${() => { setAnchor(null); setPreview(null); }}>
      <img src=${src} alt="Tiskový portrét pro označení oblasti" draggable="false"
        style="display:block;max-width:100%;max-height:54vh;width:auto;height:auto;user-select:none;pointer-events:none"/>
      ${position && html`<div aria-hidden="true" style=${{ ...position, position: 'absolute', outline: '2px solid #fff', background: '#ffffff29', pointerEvents: 'none' }}/>`}
    </div>
    ${region && html`<button class="btn sm ghost" onClick=${() => onChange(null)}>Zrušit označení</button>`}
  </div>`;
}
