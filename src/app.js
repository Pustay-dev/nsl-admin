import { html, render, useEffect, useState, Icon, Palette, Toasts, clearCache } from './ui.js';
import { sb, rpc } from './api.js';
import { store, useStore, toast } from './store.js';
import { useRoute, go } from './router.js';
import { Gate, resolveSession } from './auth.js';
import { VERSION, SHOP_URL, STAGING, STAGING_ONLY } from './config.js';
import { Overview } from './views/overview.js';
import { Styles } from './views/styles.js';
import { Customers, Orders } from './views/customers.js';
import { Analytics } from './views/analytics.js';
import { System } from './views/system.js';
import { Experiments } from './views/experiments.js';
import { Mail } from './views/mail.js';
import { MetaCampaigns, MetaAnalytics, MetaAB } from './views/meta.js';
import { MailAnalytics, MailAB } from './views/mail-extra.js';
import { TopBars } from './views/topbars.js';
import { Wall } from './views/wall.js';
import { lang, setLang } from './i18n.js';

const NAV = [
  { id: 'overview', label: 'Overview', icon: 'home', key: 'o' },
  { id: 'styles', label: 'Styles', icon: 'styles', key: 's', group: 'Website' },
  { id: 'customers', label: 'Customers', icon: 'users', key: 'c', group: 'Website' },
  { id: 'orders', label: 'Orders', icon: 'orders', key: 'r', group: 'Website' },
  { id: 'wall', label: 'Wall', icon: 'wall', key: 'w', group: 'Website' },
  { id: 'analytics', label: 'Analytics', icon: 'chart', key: 'a', group: 'Website' },
  { id: 'experiments', label: 'A/B testing', icon: 'flask', key: 'x', group: 'Website' },
  { id: 'meta', label: 'Campaigns', icon: 'bolt', key: 'k', group: 'Meta' },
  { id: 'meta-analytics', label: 'Analytics', icon: 'chart', key: 'n', group: 'Meta' },
  { id: 'meta-ab', label: 'A/B testing', icon: 'flask', key: 'b', group: 'Meta' },
  { id: 'mail', label: 'Mailing', icon: 'bolt', key: 'm', group: 'Mails' },
  { id: 'mail-analytics', label: 'Analytics', icon: 'chart', key: 'l', group: 'Mails' },
  { id: 'mail-ab', label: 'A/B testing', icon: 'flask', key: 'j', group: 'Mails' },
  { id: 'system', label: 'System', icon: 'cog', key: 'y' },
].filter(n => STAGING || !STAGING_ONLY.includes(n.id));

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
  try { localStorage.setItem('nsl-theme', nx); } catch {}
}

function Shell() {
  const route = useRoute();
  const { user, role } = useStore(s => ({ user: s.user, role: s.role }));
  const [palette, setPalette] = useState(false);
  const [styleIdx, setStyleIdx] = useState([]);
  const [, bump] = useState(0);
  const view = !STAGING && STAGING_ONLY.includes(route[0]) ? 'overview' : route[0], arg = route[1];

  useEffect(() => {
    let chord = null, chordT;
    const onKey = e => {
      const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(p => !p); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') { e.preventDefault(); lock('Console locked.'); return; }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === '/') { e.preventDefault(); setPalette(true); return; }
      if (chord === 'g') { const n = NAV.find(x => x.key === e.key); if (n) go(n.id); chord = null; return; }
      if (e.key === 'g') { chord = 'g'; clearTimeout(chordT); chordT = setTimeout(() => (chord = null), 900); }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => { if (palette && !styleIdx.length) rpc('admin_styles').then(d => setStyleIdx(d.styles)).catch(() => {}); }, [palette]);

  const commands = [
    ...NAV.map(n => ({ label: 'Go to ' + (n.group ? n.group + ' · ' : '') + n.label, icon: n.icon, hint: 'g ' + n.key, run: () => go(n.id) })),
    { label: 'New style', icon: 'plus', hint: 'styles', run: () => go('styles') },
    { label: 'Switch language', icon: 'ext', hint: 'CZ / EN', run: () => setLang(lang() === 'cs' ? 'en' : 'cs') },
    { label: 'Switch theme', icon: curTheme() === 'dark' ? 'sun' : 'moon', hint: 'light / dark', run: () => { flipTheme(); bump(x => x + 1); } },
    { label: 'Open shop', icon: 'ext', hint: SHOP_URL.replace('https://', ''), run: () => window.open(SHOP_URL, '_blank', 'noopener') },
    { label: 'Lock console', icon: 'lock', hint: 'Ctrl L', run: () => lock('Console locked.') },
    ...styleIdx.map(s => ({ label: s.name, icon: 'styles', hint: s.status + ' · ' + s.id, run: () => go('styles/' + s.id) })),
    ...styleIdx.flatMap(s => s.variants.map(v => ({ label: v.name + ' · ' + (v.audience || ''), icon: 'dot', hint: 'variant ' + v.id, run: () => go('styles/' + s.id) }))),
  ];

  const page = view === 'styles' ? html`<${Styles} openId=${arg}/>` : view === 'customers' ? html`<${Customers} openId=${arg}/>` : view === 'orders' ? html`<${Orders}/>` : view === 'wall' ? html`<${Wall}/>`
    : view === 'mail' ? html`<${Mail}/>` : view === 'analytics' ? html`<${Analytics}/>` : view === 'experiments' ? html`<${Experiments} openId=${arg}/>` : view === 'meta' ? html`<${MetaCampaigns}/>` : view === 'meta-analytics' ? html`<${MetaAnalytics}/>` : view === 'meta-ab' ? html`<${MetaAB}/>` : view === 'mail-analytics' ? html`<${MailAnalytics}/>` : view === 'mail-ab' ? html`<${MailAB}/>` : view === 'system' ? html`<${System}/>` : html`<${Overview}/>`;

  return html`<div class="shell">
    <nav class="side" aria-label="Main">
      <div class="brand"><div class="glyph">N</div><b>nakreslime</b></div>
      <div class="nav col" style="gap:2px">${NAV.map((n, i) => html`${n.group && n.group !== NAV[i - 1]?.group ? html`<div class="tiny dim up" style="padding:12px 10px 4px;letter-spacing:.08em">${n.group}</div>` : ''}<a href=${'#/' + n.id} aria-current=${(view || 'overview') === n.id ? 'page' : undefined} title=${(n.group ? n.group + ' · ' : '') + n.label}><${Icon} n=${n.icon}/><span>${n.label}</span></a>`)}</div>
      <div class="side-foot">
        <button class="btn ghost sm" style="justify-content:flex-start" onClick=${() => setPalette(true)}><${Icon} n="search" s="14"/>Search<span class="grow"></span><kbd>Ctrl K</kbd></button>
        <div class="row" style="gap:4px"><button class="btn ghost sm grow" onClick=${() => { flipTheme(); bump(x => x + 1); }} title="Light / dark"><${Icon} n=${curTheme() === 'dark' ? 'sun' : 'moon'} s="14"/></button>
          <button class="btn ghost sm grow" onClick=${() => setLang(lang() === 'cs' ? 'en' : 'cs')} title="Language"><b style="font-size:12px">${lang() === 'cs' ? 'EN' : 'CZ'}</b></button>
          <button class="btn ghost sm grow" onClick=${() => lock('Locked.')} title="Lock (Ctrl L)"><${Icon} n="lock" s="14"/></button></div>
        <div class="who" title=${user?.email}>${user?.email} · ${role}</div>
      </div>
    </nav>
    ${STAGING && html`<div class="stage-bar">TESTOVACÍ PROSTŘEDÍ · stejná databáze jako ostrý admin · nové věci vidí jen tady, dokud je neschválíte</div>`}
    <main class="main" key=${view}><${TopBars}/>${page}</main>
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
    const reauth = e => { if (store.get().user) lock(e.detail === 'ADMIN_MFA_REQUIRED' ? 'Second factor needed again.' : 'Session expired.'); };
    addEventListener('nsl:reauth', reauth);
    // login persists on the device (no daily expiry, no idle lock; Ctrl L still locks)
    return () => { sub?.subscription?.unsubscribe(); removeEventListener('nsl:reauth', reauth); };
  }, []);
  if (!boot) return html`<div class="gate"><div class="box"><span class="dim">booting…</span></div></div>`;
  return html`${user ? html`<${Shell}/>` : html`<${Gate} initial=${boot.step === 'ok' ? { step: 'login' } : boot} onReady=${who => store.patch({ user: who, role: who.role })}/>`}<${Toasts}/>`;
}

if (!window.supabase) document.getElementById('app').textContent = 'Failed to load the Supabase client.';
else render(html`<${Root}/>`, document.getElementById('app'));
