import { html, useState, useEffect, useRef, useCallback } from './ui.js';

// Debounced, serialised autosave.
//   token : changes whenever an autosaved field changes (e.g. JSON of the fields)
//   dirty : true while the autosaved fields differ from what is stored
//   save  : async () => void; must send the CURRENT values and update the caller's "stored" baseline
// Saves are never concurrent: edits during a save queue exactly one follow-up. The latest edit is flushed on unmount / tab close.
export function useAutosave(token, dirty, save, delay = 900) {
  const [st, setSt] = useState({ s: 'idle', err: null });
  const saveRef = useRef(save); saveRef.current = save;
  const dirtyRef = useRef(dirty); dirtyRef.current = dirty;
  const busy = useRef(false), again = useRef(false), timer = useRef(0), alive = useRef(true), failed = useRef(false);
  const run = useCallback(async () => {
    if (busy.current) { again.current = true; return; }
    busy.current = true; failed.current = false; again.current = false;
    if (alive.current) setSt({ s: 'saving', err: null });
    try { await saveRef.current(); if (alive.current) setSt({ s: 'saved', err: null }); }
    catch (err) { failed.current = true; if (alive.current) setSt({ s: 'error', err }); }
    finally { busy.current = false; if (again.current && !failed.current && dirtyRef.current) run(); }
  }, []);
  useEffect(() => {
    clearTimeout(timer.current);
    if (dirty) { if (!busy.current) setSt(s => (s.s === 'saving' ? s : { s: 'pending', err: null })); timer.current = setTimeout(run, delay); }
    else if (!busy.current) setSt(s => (s.s === 'pending' ? { s: 'saved', err: null } : s));
    return () => clearTimeout(timer.current);
  }, [token, dirty]);
  useEffect(() => {
    const warn = e => { if (dirtyRef.current || busy.current) { e.preventDefault(); e.returnValue = ''; } };
    const hide = () => { if (document.visibilityState === 'hidden' && dirtyRef.current && !busy.current) run(); };
    addEventListener('beforeunload', warn); document.addEventListener('visibilitychange', hide);
    return () => { alive.current = false; removeEventListener('beforeunload', warn); document.removeEventListener('visibilitychange', hide); if (dirtyRef.current && !busy.current && !failed.current) saveRef.current().catch(() => {}); };
  }, []);
  return { ...st, retry: run, flush: run };
}

export function SaveBadge({ a, readOnly }) {
  if (readOnly) return html`<span class="sv">view only</span>`;
  const { s, err } = a;
  if (s === 'error') return html`<span class="sv bad" title=${err?.message}>${err?.code === 'EDIT_CONFLICT' || /EDIT_CONFLICT|changed/i.test(err?.message || '') ? 'Changed elsewhere' : 'Not saved'} <button class="lnk" onClick=${a.retry}>retry</button></span>`;
  if (s === 'saving') return html`<span class="sv"><i class="spin"></i>Saving</span>`;
  if (s === 'pending') return html`<span class="sv">Editing…</span>`;
  if (s === 'saved') return html`<span class="sv ok">✓ Saved</span>`;
  return html`<span class="sv"></span>`;
}
