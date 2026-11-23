import { html, render, useEffect, useRef, useState, Icon, Palette, Toasts, clearCache } from './ui.js';
import { sb, rpc } from './api.js';
import { store, useStore, toast } from './store.js';
import { useRoute, go } from './router.js';
import { Gate, resolveSession } from './auth.js';
import { SHOP_URL, STAGING } from './config.js';
import { Overview } from './views/overview.js';
import { Styles } from './views/styles.js';
import { Customers, Orders } from './views/customers.js';
import { Analytics } from './views/analytics.js';
import { System } from './views/system.js';
import { Experiments } from './views/experiments.js';
import { TopBars } from './views/topbars.js';
import { Wall } from './views/wall.js';
import { lang, setLang } from './i18n.js';

// v2 menu: one start page, the daily work, the numbers, system. Old links (#/mail, #/meta…) land on the nearest page.
const NAV = [
  { id: 'overview', label: 'Overview', icon: 'home', key: 'o' },
  { id: 'orders', label: 'Orders', icon: 'orders', key: 'r', group: 'Work' },
  { id: 'styles', label: 'Styles', icon: 'styles', key: 's', group: 'Work' },
  { id: 'customers', label: 'Customers', icon: 'users', key: 'c', group: 'Work' },
  { id: 'wall', label: 'Wall', icon: 'wall', key: 'w', group: 'Work' },
  { id: 'analytics', label: 'Analytics', icon: 'chart', key: 'a', group: 'Numbers' },
  { id: 'experiments', label: 'A/B tests', icon: 'flask', key: 'x', group: 'Numbers' },
  { id: 'system', label: 'System', icon: 'cog', key: 'y', group: 'Settings' },
];
const PHONE = ['overview', 'orders', 'styles', 'analytics'];
const LEGACY = { meta: ['analytics', 'meta'], 'meta-analytics': ['analytics', 'meta'], 'meta-ab': ['experiments', 'meta'], 'mail-analytics': ['analytics', 'mail'], 'mail-ab': ['experiments'], mail: ['overview'] };

async function lock(reason) {
  clearCache();
  await sb().auth.signOut().catch(() => {});
  store.patch({ user: null, role: null });
  if (reason) toast(reason, 'warn', 5000);
}

function Offline() {
  const online = useStore(s => s.online);
  return online ? null : html`<div class="offline">Offline</div>`;
}

const curTheme = () => document.documentElement.getAttribute('data-theme') || 'dark';
function flipTheme() {
  const nx = curTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', nx);
  try { localStorage.setItem('nsl-theme', nx); } catch { /* storage blocked */ }
}

function Page({ view, arg }) {
  switch (view) {
    case 'styles': return html`<${Styles} openId=${arg}/>`;
    case 'orders': return html`<${Orders}/>`;
    case 'customers': return html`<${Customers} openId=${arg}/>`;
    case 'wall': return html`<${Wall}/>`;
    case 'analytics': return html`<${Analytics} area=${arg}/>`;
    case 'experiments': return html`<${Experiments} openId=${arg}/>`;
    case 'system': return html`<${System}/>`;
    default: return html`<${Overview}/>`;
  }
}

function Shell() {
  const route = useRoute();
  const { user, role } = useStore(s => ({ user: s.user, role: s.role }));
  const [palette, setPalette] = useState(false);
  const [more, setMore] = useState(false);
  const [styleIdx, setStyleIdx] = useState([]);
  const [, bump] = useState(0);
  // Side menu hides while you work on a page and slides in when the mouse reaches the left edge (pin keeps it open).
  const [pin, setPin] = useState(() => { try { return localStorage.getItem('nsl-side-pin') === '1'; } catch { return false; } });
  const [peek, setPeek] = useState(false);
  const hideT = useRef(0);
  const show = () => { clearTimeout(hideT.current); setPeek(true); };
  const hide = () => { clearTimeout(hideT.current); hideT.current = setTimeout(() => setPeek(false), 600); };
  const store_ = (k, v) => { try { localStorage.setItem(k, v ? '1' : '0'); } catch { /* blocked */ } };
  const [closed, setClosed] = useState(() => { try { return localStorage.getItem('nsl-side-closed') === '1'; } catch { return false; } });
  const togglePin = () => { const nx = !pin; setPin(nx); store_('nsl-side-pin', nx); if (nx) { setClosed(false); store_('nsl-side-closed', false); } };
  // × closes the menu on every page (it still slides in from the left edge); the floating button brings it back.
  const close = () => { setPin(false); store_('nsl-side-pin', false); setClosed(true); store_('nsl-side-closed', true); setPeek(false); };
  const reopen = () => { setClosed(false); store_('nsl-side-closed', false); show(); };
  const legacy = LEGACY[route[0]];
  useEffect(() => { if (legacy) go(legacy.join('/')); }, [route[0]]);
  const view = NAV.some(n => n.id === route[0]) ? route[0] : 'overview', arg = route[1];
  useEffect(() => setMore(false), [view, arg]);

  useEffect(() => {
    let chord = null, chordT;
    const onKey = e => {
      const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(p => !p); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') { e.preventDefault(); lock('Console locked'); return; }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === '/') { e.preventDefault(); setPalette(true); return; }
      if (chord === 'g') { const n = NAV.find(x => x.key === e.key); if (n) go(n.id); chord = null; return; }
      if (e.key === 'g') { chord = 'g'; clearTimeout(chordT); chordT = setTimeout(() => (chord = null), 900); }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => { if (palette && !styleIdx.length) rpc('admin_styles').then(d => setStyleIdx(d.styles)).catch(() => {}); }, [palette]);

  const theme = () => { flipTheme(); bump(x => x + 1); };
  const commands = [
    ...NAV.map(n => ({ label: 'Go to ' + n.label, icon: n.icon, hint: 'g ' + n.key, run: () => go(n.id) })),
    { label: 'Meta numbers', icon: 'chart', hint: 'analytics', run: () => go('analytics/meta') },
    { label: 'New style', icon: 'plus', hint: 'styles', run: () => go('styles') },
    { label: 'Switch language', icon: 'ext', hint: 'CZ / EN', run: () => setLang(lang() === 'cs' ? 'en' : 'cs') },
    { label: 'Switch theme', icon: curTheme() === 'dark' ? 'sun' : 'moon', hint: 'light / dark', run: theme },
    { label: 'Open shop', icon: 'ext', hint: SHOP_URL.replace('https://', ''), run: () => window.open(SHOP_URL, '_blank', 'noopener') },
    { label: 'Lock console', icon: 'lock', hint: 'Ctrl L', run: () => lock('Console locked') },
    ...styleIdx.map(s => ({ label: s.name, icon: 'styles', hint: s.status + ' · ' + s.id, run: () => go('styles/' + s.id) })),
    ...styleIdx.flatMap(s => s.variants.map(v => ({ label: v.name + ' · ' + (v.audience || ''), icon: 'dot', hint: 'variant ' + v.id, run: () => go('styles/' + s.id) }))),
  ];

  const link = n => html`<a href=${'#/' + n.id} aria-current=${view === n.id ? 'page' : undefined}><${Icon} n=${n.icon}/><span>${n.label}</span></a>`;
  const tools = html`<div class="row side-tools">
    <button class="btn ghost sm" onClick=${theme} title="Light / dark" aria-label="Light / dark"><${Icon} n=${curTheme() === 'dark' ? 'sun' : 'moon'}/></button>
    <button class="btn ghost sm" onClick=${() => setLang(lang() === 'cs' ? 'en' : 'cs')} title="Language" aria-label="Language">${lang() === 'cs' ? 'EN' : 'CZ'}</button>
    <button class="btn ghost sm" onClick=${() => lock('Locked')} title="Lock (Ctrl L)" aria-label="Lock"><${Icon} n="lock"/></button></div>`;

  const auto = !pin && (closed || view !== 'overview');
  return html`<div class=${'shell' + (auto ? ' autohide' : '') + (auto && peek ? ' peek' : '')}>
    ${auto && html`<div class="edge" onMouseEnter=${show} aria-hidden="true"></div>
      ${!peek && html`<button class="side-open" onClick=${reopen} aria-label="Open menu" title="Open menu"><${Icon} n="more"/></button>`}`}
    <nav class="side" aria-label="Main" onMouseEnter=${auto ? show : undefined} onMouseLeave=${auto ? hide : undefined} onFocusIn=${auto ? show : undefined}>
      <div class="brand"><b>nakreslime</b><span>admin</span>
        <button class="btn ghost sm pin" aria-pressed=${pin} onClick=${togglePin} title=${pin ? 'Let the menu hide' : 'Keep the menu open'} aria-label="Keep the menu open"><${Icon} n="pin" s="14"/></button>
        <button class="btn ghost sm side-x" onClick=${close} title="Close menu" aria-label="Close menu"><${Icon} n="chevl" s="14"/></button></div>
      <div class="nav">${NAV.map((n, i) => html`${n.group && n.group !== NAV[i - 1]?.group ? html`<div class="nav-g">${n.group}</div>` : ''}${link(n)}`)}</div>
      <div class="side-foot">
        <button class="btn ghost sm search" onClick=${() => setPalette(true)}><${Icon} n="search"/>Search<span class="grow"></span><kbd>Ctrl K</kbd></button>
        ${tools}
        <div class="who" title=${user?.email}>${user?.email} · ${role}</div>
      </div>
    </nav>
    <nav class="phone-bar" aria-label="Main">
      ${NAV.filter(n => PHONE.includes(n.id)).map(link)}
      <button type="button" aria-expanded=${more} onClick=${() => setMore(m => !m)}><${Icon} n="more"/><span>More</span></button>
    </nav>
    ${more && html`<div class="scrim" onClick=${() => setMore(false)}></div><div class="sheet" role="dialog" aria-label="More">
      <div class="nav">${NAV.filter(n => !PHONE.includes(n.id)).map(link)}</div>${tools}<div class="who">${user?.email} · ${role}</div></div>`}
    ${STAGING && html`<div class="stage-bar">Testovací prostředí · stejná databáze jako ostrý admin</div>`}
    <main class="main" key=${view}><${TopBars}/><${Page} view=${view} arg=${arg}/></main>
    <${Offline}/>
    ${palette && html`<${Palette} commands=${commands} onClose=${() => setPalette(false)}/>`}
  </div>`;
}

function Root() {
  const user = useStore(s => s.user);
  const [boot, setBoot] = useState(null);
  useEffect(() => {
    resolveSession().then(r => { if (r.step === 'ok') store.patch({ user: r.who, role: r.who.role }); setBoot(r); }).catch(() => setBoot({ step: 'login' }));
    const { data: sub } = sb().auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT') store.patch({ user: null, role: null }); });
    const reauth = e => { if (store.get().user) lock(e.detail === 'ADMIN_MFA_REQUIRED' ? 'Second factor needed again' : 'Session expired'); };
    addEventListener('nsl:reauth', reauth);
    // login persists on the device (no daily expiry, no idle lock; Ctrl L still locks)
    return () => { sub?.subscription?.unsubscribe(); removeEventListener('nsl:reauth', reauth); };
  }, []);
  if (!boot) return html`<div class="gate"><div class="box"><span class="dim">Loading</span></div></div>`;
  return html`${user ? html`<${Shell}/>` : html`<${Gate} initial=${boot.step === 'ok' ? { step: 'login' } : boot} onReady=${who => store.patch({ user: who, role: who.role })}/>`}<${Toasts}/>`;
}

if (!window.supabase) document.getElementById('app').textContent = 'Failed to load the Supabase client.';
else render(html`<${Root}/>`, document.getElementById('app'));
