import { useEffect, useState } from '../vendor/hooks.mjs';

const parse = () => (location.hash.replace(/^#\/?/, '') || 'overview').split('?')[0].split('/').filter(Boolean);

export function go(path) { const h = '#/' + path; if (location.hash !== h) location.hash = h; }

export function useRoute() {
  const [r, set] = useState(parse);
  useEffect(() => { const f = () => set(parse()); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []);
  return r;
}
