// Minimal reactive store: one object, subscribe/patch, a hook for components.
import { useEffect, useState } from '../vendor/hooks.mjs';

const state = { user: null, role: null, lastRpc: null, online: navigator.onLine, toasts: [], overlay: null };
const subs = new Set();

export const store = {
  get: () => state,
  patch(p) { Object.assign(state, typeof p === 'function' ? p(state) : p); subs.forEach(f => f(state)); },
  subscribe(f) { subs.add(f); return () => subs.delete(f); },
};

export function useStore(select = s => s) {
  const [v, set] = useState(() => select(state));
  useEffect(() => store.subscribe(s => set(select(s))), []);
  return v;
}

let tid = 0;
export function toast(text, kind = 'ok', ms = 3600) {
  const id = ++tid;
  store.patch(s => ({ toasts: [...s.toasts.slice(-4), { id, text, kind, ms }] }));
  setTimeout(() => store.patch(s => ({ toasts: s.toasts.filter(t => t.id !== id) })), ms);
}

addEventListener('online', () => store.patch({ online: true }));
addEventListener('offline', () => store.patch({ online: false }));
