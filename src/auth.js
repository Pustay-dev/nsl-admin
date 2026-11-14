import { html, useEffect, useRef, useState, Icon } from './ui.js';
import { sb, rpc } from './api.js';
import { VERSION } from './config.js';

// Resolve where the current browser session stands: none | enroll | challenge | denied | ok
export async function resolveSession() {
  const { data: { session } } = await sb().auth.getSession();
  if (!session) return { step: 'login' };
  const { data: aal, error } = await sb().auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) return { step: 'login' };
  if (aal.currentLevel !== 'aal2') return { step: aal.nextLevel === 'aal2' ? 'challenge' : 'enroll' };
  const who = await rpc('admin_whoami');
  if (!who?.member) return { step: 'denied', who };
  return { step: 'ok', who };
}

const BOOT = [
  ['nsl/admin v' + VERSION, ''],
  ['link   supabase:eu-west-1', 'ok'],
  ['policy allowlist · totp(aal2) · rls · audit', 'ok'],
  ['await  credentials', ''],
];

function Boot() {
  const [n, setN] = useState(0);
  useEffect(() => { if (n < BOOT.length) { const t = setTimeout(() => setN(n + 1), 170); return () => clearTimeout(t); } }, [n]);
  return html`<div class="boot">${BOOT.slice(0, n).map(([t, ok], i) => html`<div>${'> ' + t}${ok && html` <span class="ok">[${ok}]</span>`}${i === n - 1 && i === BOOT.length - 1 && html`<span class="caret"></span>`}</div>`)}</div>`;
}

function Otp({ onDone, busy }) {
  const refs = Array.from({ length: 6 }, () => useRef());
  const [v, setV] = useState(['', '', '', '', '', '']);
  useEffect(() => refs[0].current?.focus(), []);
  const put = (i, ch) => {
    const next = [...v]; next[i] = ch; setV(next);
    if (ch && i < 5) refs[i + 1].current.focus();
    if (next.every(Boolean)) onDone(next.join(''), () => { setV(['', '', '', '', '', '']); refs[0].current.focus(); });
  };
  const paste = e => {
    const d = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6);
    if (d.length === 6) { e.preventDefault(); setV(d.split('')); onDone(d, () => setV(['', '', '', '', '', ''])); }
  };
  return html`<div class="otp" onPaste=${paste}>${v.map((c, i) => html`<input ref=${refs[i]} inputmode="numeric" autocomplete=${i === 0 ? 'one-time-code' : 'off'} maxlength="1" aria-label=${'digit ' + (i + 1)} disabled=${busy} value=${c}
    onInput=${e => put(i, e.target.value.replace(/\D/g, '').slice(-1))}
    onKeyDown=${e => { if (e.key === 'Backspace' && !v[i] && i) refs[i - 1].current.focus(); }}/>`)}</div>`;
}

export function Gate({ initial, onReady }) {
  const [step, setStep] = useState(initial?.step || 'login');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [enroll, setEnroll] = useState(null);
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [mode, setMode] = useState('login');   // login | signup
  const [note, setNote] = useState('');
  const [asked, setAsked] = useState(false);

  const advance = async () => {
    const r = await resolveSession();
    if (r.step === 'ok') onReady(r.who); else setStep(r.step);
  };

  useEffect(() => { (async () => {
    if (step !== 'enroll') return;
    setErr('');
    const { data: f } = await sb().auth.mfa.listFactors();
    for (const x of (f?.all || []).filter(x => x.status !== 'verified')) await sb().auth.mfa.unenroll({ factorId: x.id });
    const { data, error } = await sb().auth.mfa.enroll({ factorType: 'totp', friendlyName: 'nsl-admin ' + new Date().toISOString().slice(0, 10) });
    if (error) return setErr(error.message);
    setEnroll(data);
  })(); }, [step]);

  const login = async e => {
    e.preventDefault(); setErr(''); setBusy(true);
    const { error } = await sb().auth.signInWithPassword({ email: email.trim(), password: pw });
    setPw('');
    setBusy(false);
    if (error) return setErr(error.status === 429 ? 'Too many attempts. Wait a minute.' : 'Invalid credentials.');
    advance();
  };

  const signup = async e => {
    e.preventDefault(); setErr('');
    if (pw.length < 12) return setErr('Use at least 12 characters (a passphrase is easiest).');
    setBusy(true);
    const { data, error } = await sb().auth.signUp({ email: email.trim(), password: pw, options: { emailRedirectTo: location.origin + location.pathname } });
    setPw(''); setBusy(false);
    if (error) return setErr(error.status === 429 ? 'Too many attempts. Wait a minute.' : /password/i.test(error.message) ? error.message : 'Could not create the account. Try again or sign in.');
    if (data?.session) return advance();   // project without email confirmation
    setStep('confirm');                    // same screen whether or not the address already existed (no account enumeration)
  };

  const askAccess = async () => {
    setErr(''); setBusy(true);
    try { await rpc('admin_request_access', { p_note: note }); setAsked(true); }
    catch (x) { setErr(x.message === 'REQUESTS_FULL' ? 'Too many pending requests. Ask an owner directly.' : x.message); }
    finally { setBusy(false); }
  };

  const verify = async (code, reset) => {
    setErr(''); setBusy(true);
    try {
      let factorId = enroll?.id;
      if (!factorId) { const { data } = await sb().auth.mfa.listFactors(); factorId = data?.totp?.[0]?.id; }
      const { error } = await sb().auth.mfa.challengeAndVerify({ factorId, code });
      if (error) { setErr('Wrong or expired code.'); reset(); return; }
      await advance();
    } finally { setBusy(false); }
  };

  const signOut = async () => { await sb().auth.signOut(); setStep('login'); setMode('login'); setEnroll(null); setAsked(false); };

  return html`<div class="gate"><div class="box">
    <div class="row"><div class="brand" style="padding:0"><div class="glyph">N</div><b>nsl/admin</b></div><span class="grow"></span><span class="tag">secure</span></div>
    <${Boot}/>
    ${step === 'login' && html`<div class="col">
      <div class="seg" style="align-self:stretch;display:flex"><button style="flex:1" aria-pressed=${mode === 'login'} onClick=${() => { setMode('login'); setErr(''); }}>Sign in</button><button style="flex:1" aria-pressed=${mode === 'signup'} onClick=${() => { setMode('signup'); setErr(''); }}>Create account</button></div>
      <form class="col" onSubmit=${mode === 'login' ? login : signup} autocomplete="on">
        <label class="f">Email<input class="in" type="email" required autocomplete="username" value=${email} onInput=${e => setEmail(e.target.value)} autofocus/></label>
        <label class="f">${mode === 'login' ? 'Password' : 'Choose a password'}<input class="in" type="password" required minlength=${mode === 'signup' ? 12 : 1} autocomplete=${mode === 'login' ? 'current-password' : 'new-password'} value=${pw} onInput=${e => setPw(e.target.value)}/></label>
        ${mode === 'signup' && html`<div class="tiny dim">12+ characters. Next: confirm your email, bind an authenticator, then an owner approves your access.</div>`}
        <button class="btn primary" style="justify-content:center;margin-top:6px" disabled=${busy}><${Icon} n="lock" s="14"/>${mode === 'login' ? (busy ? 'Authenticating…' : 'Sign in') : (busy ? 'Creating…' : 'Create account')}</button>
      </form>
    </div>`}
    ${step === 'confirm' && html`<div class="col">
      <h1>Check your inbox</h1>
      <div class="muted small">We sent a confirmation link to <b>${email}</b>. Open it, then come back here and sign in. (If the link lands on another page, that is fine: the account is confirmed.)</div>
      <button class="btn primary" style="justify-content:center" onClick=${() => { setStep('login'); setMode('login'); setErr(''); }}>I confirmed, sign in</button>
    </div>`}
    ${step === 'enroll' && html`<div class="col">
      <h1>Bind an authenticator</h1>
      <div class="muted small">One-time setup. Scan with Google Authenticator, 1Password, Authy… then enter the 6-digit code. Every future sign-in requires it.</div>
      ${enroll ? html`<img class="qr" src=${enroll.totp.qr_code} alt="TOTP QR code"/>
        <div class="tiny dim" style="text-align:center;word-break:break-all">manual key: <span class="acid">${enroll.totp.secret}</span></div>` : html`<div class="skel" style="height:184px"></div>`}
      <${Otp} onDone=${verify} busy=${busy || !enroll}/>
    </div>`}
    ${step === 'challenge' && html`<div class="col">
      <h1>Second factor</h1><div class="muted small">Enter the code from your authenticator app.</div>
      <${Otp} onDone=${verify} busy=${busy}/>
    </div>`}
    ${step === 'denied' && html`<div class="col">
      ${asked ? html`<h1 class="acid">Request sent</h1><div class="muted small">An owner will see it under System → Access requests. Come back after they approve you; nothing else to do.</div>`
        : html`<h1>Request access</h1><div class="muted small">You are signed in, but not on the admin allowlist yet. Send a request: an owner approves it with one click.</div>
        <label class="f">Note for the owner (optional)<input class="in" maxlength="300" placeholder="e.g. Friend 1, marketing" value=${note} onInput=${e => setNote(e.target.value)}/></label>
        <button class="btn primary" style="justify-content:center" disabled=${busy} onClick=${askAccess}>${busy ? 'Sending…' : 'Request access'}</button>`}
    </div>`}
    <div class="err-line" role="alert">${err}</div>
    ${step !== 'login' && step !== 'confirm' && html`<button class="btn ghost sm" onClick=${signOut}>← use another account</button>`}
  </div></div>`;
}
