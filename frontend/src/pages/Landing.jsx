import { useState, useRef } from 'react';
import { useAuth } from '../App.jsx';
import { sendOTP, register, login } from '../api.js';
import { WaslneyLogo, Inp, btnPrimary } from '../components/UI.jsx';

// ── helpers ────────────────────────────────────────────────────────────────
function toBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload  = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

// ── Photo upload tile ──────────────────────────────────────────────────────
function PhotoTile({ label, arabic, emoji, value, onChange, err }) {
  const ref = useRef();
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, color: '#4b7ab5', fontWeight: 700, marginBottom: 6,
        textTransform: 'uppercase', letterSpacing: '.07em' }}>
        {label}{arabic && <span style={{ color: '#fbbf24', marginLeft: 6, fontWeight: 600 }}>({arabic})</span>}
      </div>
      <div onClick={() => ref.current.click()} style={{
        border: err   ? '1.5px solid rgba(248,113,113,0.6)'
              : value ? '1.5px solid rgba(74,222,128,0.5)'
                      : '1.5px dashed #2a2a2a',
        borderRadius: 14, padding: '14px 16px', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 14,
        background: value ? 'rgba(74,222,128,0.04)' : '#0d0d0d',
        transition: 'border-color .2s',
      }}>
        {value
          ? <img src={value} alt="" style={{ width: 54, height: 54, objectFit: 'cover',
              borderRadius: 10, border: '1px solid rgba(74,222,128,0.4)', flexShrink: 0 }} />
          : <div style={{ width: 54, height: 54, display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 26, background: '#1a1a1a',
              borderRadius: 10, flexShrink: 0 }}>{emoji}</div>
        }
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: value ? '#4ade80' : '#fff' }}>
            {value ? '✓ Uploaded' : 'Tap to upload'}
          </div>
          <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>
            {value ? 'Tap to change' : 'JPG / PNG — max 5 MB'}
          </div>
        </div>
      </div>
      {err && <div style={{ fontSize: 11, color: '#f87171', marginTop: 4 }}>{err}</div>}
      <input ref={ref} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={async e => {
          const file = e.target.files[0];
          if (!file) return;
          if (file.size > 5 * 1024 * 1024) { alert('File too large — max 5 MB'); return; }
          onChange(await toBase64(file));
          e.target.value = '';
        }}
      />
    </div>
  );
}

// ── Step dots ──────────────────────────────────────────────────────────────
function Steps({ step }) { // step 1 | 2 | 3
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 28 }}>
      {[1,2,3].map(i => (
        <div key={i} style={{
          height: 8, borderRadius: 4, transition: 'all .3s',
          width: i < step ? 28 : 8,
          background: i < step ? '#fbbf24' : i === step ? '#444' : '#222',
        }} />
      ))}
    </div>
  );
}

// ── Page shell (topbar + back) ─────────────────────────────────────────────
function Page({ onBack, children, scroll }) {
  return (
    <div style={{ minHeight: '100vh', background: '#000', display: 'flex', flexDirection: 'column', fontFamily: "'Sora',sans-serif" }}>
      <div style={{ padding: '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <button onClick={onBack} style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: 24, cursor: 'pointer', padding: 4 }}>←</button>
        <WaslneyLogo size={26} />
        <div style={{ width: 40 }} />
      </div>
      <div style={{ flex: 1, overflowY: scroll ? 'auto' : 'visible', display: 'flex', alignItems: scroll ? 'flex-start' : 'center', justifyContent: 'center', padding: '0 24px 48px' }}>
        <div style={{ width: '100%', maxWidth: 400 }}>{children}</div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
export default function Landing({ onEnterCompanyPortal }) {
  const { login: doLogin, notify } = useAuth();

  // mode: home | signup | docs | otp | login | driver-status
  const [mode,         setMode]         = useState('home');
  const [role,         setRole]         = useState('');
  const [form,         setForm]         = useState({ name: '', phone: '', email: '', password: '', car: '', plate: '' });
  const [docs,         setDocs]         = useState({ profile: '', carLicense: '', driverLicense: '', criminal: '' });
  const [docErr,       setDocErr]       = useState({});
  const [otp,          setOtp]          = useState(['','','','','','']);
  const [devOtp,       setDevOtp]       = useState('');
  const [loading,      setLoading]      = useState(false);
  const [resendTimer,  setResendTimer]  = useState(0); // seconds left before resend allowed
  const [resetStep,    setResetStep]    = useState('email'); // email | otp | newpass
  const [resetEmail,   setResetEmail]   = useState('');
  const [resetOtp,     setResetOtp]     = useState(['','','','','','']);
  const [newPassword,  setNewPassword]  = useState('');
  const [driverStatus, setDriverStatus] = useState(null); // 'pending_review' | 'rejected'
  const [rejectDetail, setRejectDetail] = useState('');

  const f = k => e => setForm(p => ({ ...p, [k]: e.target.value }));
  const d = k => v  => setDocs(p => ({ ...p, [k]: v }));

  // ── Step 1 → Step 2 (driver) or OTP (others) ─────────────────────────────
  async function handleInfoNext() {
    if (!form.name || !form.phone || !form.password) { notify('Missing info', 'Fill in all fields.', 'error'); return; }
    if (role === 'driver' && (!form.car || !form.plate)) { notify('Missing info', 'Enter car model and plate.', 'error'); return; }
    if (role === 'driver') { setMode('docs'); }
    else { await sendOTPStep(); }
  }

  // ── Step 2 → OTP ──────────────────────────────────────────────────────────
  async function handleDocsNext() {
    const errs = {};
    if (!docs.profile)     errs.profile     = 'Required';
    if (!docs.carLicense)  errs.carLicense  = 'Required';
    if (!docs.driverLicense) errs.driverLicense = 'Required';
    if (!docs.criminal)    errs.criminal    = 'Required';
    setDocErr(errs);
    if (Object.keys(errs).length) { notify('Missing photos', 'Upload all 4 photos to continue.', 'error'); return; }
    await sendOTPStep();
  }

  function startResendTimer() {
    setResendTimer(30);
    const iv = setInterval(() => {
      setResendTimer(t => { if (t <= 1) { clearInterval(iv); return 0; } return t - 1; });
    }, 1000);
  }

  async function sendOTPStep() {
    setLoading(true);
    try {
      const res = await sendOTP(form.email);
      // email OTP - no dev code
      setMode('otp');
      startResendTimer();
      notify('Code sent', 'Check your email for the 6-digit code.', 'info');
    } catch(e) { notify('Error', e.message, 'error'); }
    finally { setLoading(false); }
  }

  async function handleResend() {
    setLoading(true);
    try {
      await sendOTP(form.email);
      setOtp(['','','','','','']);
      startResendTimer();
      notify('Code resent', 'A new code was sent to your email.', 'info');
    } catch(e) { notify('Error', e.message, 'error'); }
    finally { setLoading(false); }
  }

  // ── Forgot password flow ──────────────────────────────────────────────────
  async function handleForgotSendOTP() {
    if (!resetEmail) { notify('Required', 'Enter your email address.', 'error'); return; }
    setLoading(true);
    try {
      await sendOTP(resetEmail);
      setResetStep('otp');
      startResendTimer();
      notify('Code sent', 'Check your email for the 6-digit code.', 'info');
    } catch(e) { notify('Error', e.message, 'error'); }
    finally { setLoading(false); }
  }

  async function handleForgotVerifyOTP() {
    const code = resetOtp.join('');
    if (code.length < 6) { notify('Incomplete', 'Enter all 6 digits.', 'error'); return; }
    setLoading(true);
    try {
      // verify OTP exists by calling reset endpoint
      const res = await fetch('/api/auth/verify-reset-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail, otp: code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Invalid code');
      setResetStep('newpass');
    } catch(e) { notify('Error', e.message, 'error'); }
    finally { setLoading(false); }
  }

  async function handleForgotSetPassword() {
    if (!newPassword || newPassword.length < 6) { notify('Too short', 'Password must be at least 6 characters.', 'error'); return; }
    setLoading(true);
    try {
      const code = resetOtp.join('');
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail, otp: code, password: newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      notify('Password updated!', 'You can now sign in.', 'info');
      setMode('login');
      setResetStep('email'); setResetEmail(''); setResetOtp(['','','','','','']); setNewPassword('');
    } catch(e) { notify('Error', e.message, 'error'); }
    finally { setLoading(false); }
  }

  // ── OTP verify + register ─────────────────────────────────────────────────
  async function handleVerify() {
    const code = otp.join('');
    if (code.length < 6) { notify('Incomplete', 'Enter all 6 digits.', 'error'); return; }
    setLoading(true);
    try {
      const payload = {
        ...form, role, otp: code, email: form.email,
        ...(role === 'driver' ? {
          profile_photo:         docs.profile,
          car_license_photo:     docs.carLicense,
          driver_license_photo:  docs.driverLicense,
          criminal_record_photo: docs.criminal,
        } : {}),
      };
      const data = await register(payload);
      if (role === 'driver') {
        setDriverStatus('pending_review');
        setMode('driver-status');
      } else {
        doLogin(data.user, data.token);
        notify('Welcome!', 'Account created.');
      }
    } catch(e) { notify('Error', e.message, 'error'); }
    finally { setLoading(false); }
  }

  // ── Login ─────────────────────────────────────────────────────────────────
  async function handleLogin() {
    if (!form.phone || !form.password) { notify('Missing info', 'Enter phone and password.', 'error'); return; }
    setLoading(true);
    try {
      const data = await login(form.phone, form.password);
      doLogin(data.user, data.token);
      notify('Welcome back!', data.user.name);
    } catch(e) {
      if (e.message === 'pending_review') {
        setDriverStatus('pending_review'); setRejectDetail(''); setMode('driver-status');
      } else if (e.message === 'rejected') {
        setDriverStatus('rejected'); setRejectDetail(e.detail || ''); setMode('driver-status');
      } else {
        notify('Wrong credentials', e.message, 'error');
      }
    } finally { setLoading(false); }
  }

  function reset() {
    setForm({ name:'', phone:'', email:'', password:'', car:'', plate:'' });
    setDocs({ profile:'', carLicense:'', driverLicense:'', criminal:'' });
    setDocErr({}); setOtp(['','','','','','']); setDevOtp('');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DRIVER STATUS SCREEN (unchanged from original)
  // ══════════════════════════════════════════════════════════════════════════
  if (mode === 'driver-status') return (
    <div style={{ minHeight:'100vh', background:'#000', display:'flex', alignItems:'center', justifyContent:'center', padding:'40px 24px', fontFamily:"'Sora',sans-serif" }}>
      <div style={{ width:'100%', maxWidth:400, textAlign:'center' }}>
        <WaslneyLogo size={36} />
        <div style={{ marginTop:40, marginBottom:32 }}>
          {driverStatus === 'pending_review' ? (
            <>
              <div style={{ width:80, height:80, borderRadius:'50%', background:'rgba(251,191,36,0.1)', border:'2px solid rgba(251,191,36,0.3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:36, margin:'0 auto 24px' }}>⏳</div>
              <h2 style={{ fontSize:24, fontWeight:800, color:'#fff', marginBottom:12 }}>Under Review</h2>
              <p style={{ color:'#666', fontSize:14, lineHeight:1.8, marginBottom:8 }}>
                Your documents have been submitted successfully.
              </p>
              <p style={{ color:'#555', fontSize:13, lineHeight:1.7 }}>
                An admin will review your profile and documents. You'll be able to log in once your account is approved.
              </p>
              <div style={{ marginTop:28, background:'#0d0d0d', border:'1px solid #1a1a1a', borderRadius:12, padding:'14px 18px' }}>
                <p style={{ color:'#444', fontSize:12, margin:0 }}>
                  📧 Check back in 24–48 hours. If you have questions, contact support.
                </p>
              </div>
            </>
          ) : (
            <>
              <div style={{ width:80, height:80, borderRadius:'50%', background:'rgba(248,113,113,0.1)', border:'2px solid rgba(248,113,113,0.3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:36, margin:'0 auto 24px' }}>❌</div>
              <h2 style={{ fontSize:24, fontWeight:800, color:'#fff', marginBottom:12 }}>Account Not Approved</h2>
              <p style={{ color:'#666', fontSize:14, lineHeight:1.8, marginBottom:8 }}>
                Your driver account was not approved.
              </p>
              {rejectDetail ? (
                <div style={{ background:'rgba(248,113,113,0.08)', border:'1px solid rgba(248,113,113,0.2)', borderRadius:10, padding:'12px 16px', marginTop:12 }}>
                  <p style={{ color:'#f87171', fontSize:13, margin:0 }}><b>Reason:</b> {rejectDetail}</p>
                </div>
              ) : (
                <p style={{ color:'#555', fontSize:13, lineHeight:1.7 }}>Please contact support for more information.</p>
              )}
            </>
          )}
        </div>
        <button
          onClick={() => { setMode('home'); setDriverStatus(null); setRejectDetail(''); reset(); }}
          style={{ background:'#fbbf24', color:'#000', border:'none', borderRadius:12, padding:'13px 32px', fontFamily:"'Sora',sans-serif", fontSize:14, fontWeight:700, cursor:'pointer' }}>
          ← Back to Home
        </button>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════════════════
  // HOME
  // ══════════════════════════════════════════════════════════════════════════
  if (mode === 'home') return (
    <div style={{ minHeight:'100vh', background:'#000', display:'flex', flexDirection:'column', fontFamily:"'Sora',sans-serif" }}>
      <div style={{ padding:'18px 24px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <WaslneyLogo size={30} />
        <button
          onClick={() => { setRole('driver'); reset(); setMode('signup'); }}
          style={{ background:'#fbbf24', border:'none', borderRadius:24, padding:'9px 20px', color:'#000', fontSize:13, fontFamily:"'Sora',sans-serif", cursor:'pointer', fontWeight:700, display:'flex', alignItems:'center', gap:6 }}>
          🚐 Login as a driver
        </button>
      </div>
      <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'20px 24px 60px', textAlign:'center' }}>
        <div style={{ fontSize:80, marginBottom:20, filter:'drop-shadow(0 0 40px rgba(251,191,36,0.35))' }}>🚐</div>
        <h1 style={{ fontSize:'clamp(34px,8vw,60px)', fontWeight:800, color:'#fff', lineHeight:1.1, marginBottom:14, letterSpacing:'-0.02em' }}>
          Get there<br/><span style={{ color:'#fbbf24' }}>together.</span>
        </h1>
        <p style={{ color:'#555', fontSize:15, lineHeight:1.7, maxWidth:300, marginBottom:52 }}>
          Shared rides on fixed routes across Cairo. Book a seat fast.
        </p>
        <div style={{ width:'100%', maxWidth:420, display:'flex', flexDirection:'column', gap:10 }}>
          <button
            onClick={() => { setRole('passenger'); reset(); setMode('signup'); }}
            style={{ background:'#fbbf24', color:'#000', border:'none', borderRadius:18, padding:'20px 24px', fontSize:18, fontWeight:700, cursor:'pointer', fontFamily:"'Sora',sans-serif", display:'flex', alignItems:'center', gap:14, textAlign:'left', boxShadow:'0 8px 32px rgba(251,191,36,0.2)' }}>
            <span style={{ fontSize:26, background:'rgba(0,0,0,0.15)', borderRadius:12, width:52, height:52, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>🔍</span>
            <div>
              <div style={{ fontSize:18, fontWeight:800 }}>Where to?</div>
              <div style={{ fontSize:12, fontWeight:400, opacity:0.7, marginTop:3 }}>Book a seat on a shared ride</div>
            </div>
          </button>
          <button
            onClick={() => { setRole('admin'); reset(); setMode('signup'); }}
            style={{ background:'transparent', color:'#333', border:'1px solid #1a1a1a', borderRadius:12, padding:'11px 18px', fontSize:12, cursor:'pointer', fontFamily:"'Sora',sans-serif", display:'flex', alignItems:'center', gap:8, justifyContent:'center' }}>
            ⚙️ Admin portal
          </button>
          <button
            onClick={onEnterCompanyPortal}
            style={{ background:'transparent', color:'#4b7ab5', border:'1px solid #1a2a40', borderRadius:12, padding:'11px 18px', fontSize:12, cursor:'pointer', fontFamily:"'Sora',sans-serif", display:'flex', alignItems:'center', gap:8, justifyContent:'center' }}>
            🏢 Company / Tender portal
          </button>
        </div>
        <p style={{ marginTop:28, fontSize:12, color:'#444' }}>
          Already have an account?{' '}
          <span onClick={() => setMode('login')} style={{ color:'#fbbf24', cursor:'pointer', fontWeight:600 }}>Sign in</span>
        </p>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 1 — Basic info
  // ══════════════════════════════════════════════════════════════════════════
  if (mode === 'signup') return (
    <Page onBack={() => setMode('home')}>
      {role === 'driver' && <Steps step={1} />}
      <div style={{ marginBottom:32, textAlign:'center' }}>
        <div style={{ fontSize:48, marginBottom:12 }}>
          {role === 'passenger' ? '🎫' : role === 'driver' ? '🚐' : '⚙️'}
        </div>
        <h2 style={{ fontSize:26, fontWeight:800, color:'#fff', marginBottom:6 }}>
          {role === 'passenger' ? 'Create your account' : role === 'driver' ? 'Start driving' : 'Admin access'}
        </h2>
        <p style={{ color:'#555', fontSize:14 }}>
          {role === 'passenger' ? 'Book shared rides across Cairo' : role === 'driver' ? 'Submit your documents for review' : 'Manage the platform'}
        </p>
      </div>

      <Inp label="Full name"    value={form.name}     onChange={f('name')}     placeholder="Ahmed Hassan" />
      <Inp label="Phone number" value={form.phone}    onChange={f('phone')}    placeholder="+20 100 000 0000" />
      <Inp label="Email address" value={form.email}    onChange={f('email')}    placeholder="you@example.com" type="email" />
      <Inp label="Password"     value={form.password} onChange={f('password')} placeholder="Choose a password" type="password" />
      {role === 'driver' && <>
        <Inp label="Car model"     value={form.car}   onChange={f('car')}   placeholder="Toyota Hiace 2022" />
        <Inp label="License plate" value={form.plate} onChange={f('plate')} placeholder="أ ب ج 1234" />
        <div style={{ background:'rgba(251,191,36,0.06)', border:'1px solid rgba(251,191,36,0.2)', borderRadius:10, padding:'12px 14px', marginBottom:14 }}>
          <p style={{ color:'#fbbf24', fontSize:12, margin:0, lineHeight:1.6 }}>
            📋 Next you'll upload your profile photo and documents. Your account will be activated once an admin approves them.
          </p>
        </div>
      </>}

      <button onClick={handleInfoNext} disabled={loading}
        style={{ ...btnPrimary, opacity: loading ? .6:1, marginTop:8 }}>
        {loading ? 'Please wait…' : role === 'driver' ? 'Continue to documents →' : 'Continue →'}
      </button>
      <p style={{ textAlign:'center', marginTop:20, fontSize:12, color:'#444' }}>
        Already have an account?{' '}
        <span onClick={() => setMode('login')} style={{ color:'#fbbf24', cursor:'pointer', fontWeight:600 }}>Sign in</span>
      </p>
    </Page>
  );

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 2 — Driver document uploads
  // ══════════════════════════════════════════════════════════════════════════
  if (mode === 'docs') return (
    <Page onBack={() => setMode('signup')} scroll>
      <Steps step={2} />
      <div style={{ marginBottom:24, textAlign:'center' }}>
        <div style={{ fontSize:44, marginBottom:10 }}>📄</div>
        <h2 style={{ fontSize:22, fontWeight:800, color:'#fff', marginBottom:6 }}>Upload your documents</h2>
        <p style={{ color:'#555', fontSize:13, lineHeight:1.6 }}>
          All 4 photos are required. Only our team will see them.
        </p>
      </div>

      {/* Personal */}
      <div style={{ fontSize:11, color:'#fbbf24', fontWeight:700, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:10 }}>Personal</div>
      <PhotoTile label="Profile Photo" emoji="🤳"
        value={docs.profile} onChange={d('profile')} err={docErr.profile} />

      {/* Documents */}
      <div style={{ fontSize:11, color:'#fbbf24', fontWeight:700, textTransform:'uppercase', letterSpacing:'.08em', marginTop:20, marginBottom:10 }}>
        Vehicle &amp; Legal
      </div>
      <PhotoTile label="Car License"     arabic="رخصة العربية"  emoji="🚗"
        value={docs.carLicense}    onChange={d('carLicense')}    err={docErr.carLicense} />
      <PhotoTile label="Driver License"  arabic="رخصة السائق"   emoji="🪪"
        value={docs.driverLicense} onChange={d('driverLicense')} err={docErr.driverLicense} />
      <PhotoTile label="Criminal Record" arabic="الفيش الجنائي" emoji="📋"
        value={docs.criminal}      onChange={d('criminal')}      err={docErr.criminal} />

      <button onClick={handleDocsNext} disabled={loading}
        style={{ ...btnPrimary, opacity: loading ? .6:1, marginTop:16 }}>
        {loading ? 'Please wait…' : 'Continue to verify →'}
      </button>
    </Page>
  );

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 3 — OTP
  // ══════════════════════════════════════════════════════════════════════════
  if (mode === 'otp') return (
    <Page onBack={() => setMode(role === 'driver' ? 'docs' : 'signup')}>
      {role === 'driver' && <Steps step={3} />}
      <div style={{ textAlign:'center' }}>
        <div style={{ fontSize:52, marginBottom:16 }}>✉️</div>
        <h2 style={{ fontSize:24, fontWeight:800, color:'#fff', marginBottom:8 }}>Verify your email</h2>
        <p style={{ color:'#666', fontSize:14, marginBottom:6 }}>Code sent to {form.email}</p>

        <div style={{ display:'flex', gap:10, justifyContent:'center', marginBottom:32 }}>
          {otp.map((v,i) => (
            <input key={i} id={`o${i}`} maxLength={1} value={v}
              onChange={e => {
                const n=[...otp]; n[i]=e.target.value; setOtp(n);
                if (e.target.value && i<5) document.getElementById(`o${i+1}`)?.focus();
              }}
              style={{ width:48, height:58, background:'#1a1a1a', border:'1px solid #333', borderRadius:12, textAlign:'center', fontSize:24, fontFamily:'monospace', color:'#fff', outline:'none' }} />
          ))}
        </div>
        <button onClick={handleVerify} disabled={loading}
          style={{ ...btnPrimary, opacity: loading ? .6:1 }}>
          {loading ? 'Verifying…' : 'Verify & continue →'}
        </button>
        <div style={{ marginTop:20 }}>
          {resendTimer > 0
            ? <p style={{ color:'#555', fontSize:13 }}>Resend code in {resendTimer}s</p>
            : <button onClick={handleResend} disabled={loading} style={{ background:'none', border:'none', color:'#fbbf24', fontSize:13, cursor:'pointer', fontWeight:600 }}>
                Resend code
              </button>
          }
        </div>
      </div>
    </Page>
  );

  // ══════════════════════════════════════════════════════════════════════════
  // LOGIN
  // ══════════════════════════════════════════════════════════════════════════
  // ══════════════════════════════════════════════════════════════════════════
  // FORGOT PASSWORD — step: email
  // ══════════════════════════════════════════════════════════════════════════
  if (mode === 'forgot' && resetStep === 'email') return (
    <Page onBack={() => setMode('login')}>
      <div style={{ textAlign:'center', marginBottom:32 }}>
        <div style={{ fontSize:48, marginBottom:12 }}>🔑</div>
        <h2 style={{ fontSize:24, fontWeight:800, color:'#fff', marginBottom:8 }}>Reset password</h2>
        <p style={{ color:'#666', fontSize:14 }}>Enter your email and we'll send a reset code</p>
      </div>
      <Inp label="Email address" value={resetEmail} onChange={e => setResetEmail(e.target.value)} placeholder="you@example.com" type="email" />
      <button onClick={handleForgotSendOTP} disabled={loading}
        style={{ ...btnPrimary, opacity: loading ? .6:1, marginTop:8 }}>
        {loading ? 'Sending…' : 'Send reset code →'}
      </button>
    </Page>
  );

  // FORGOT PASSWORD — step: otp
  if (mode === 'forgot' && resetStep === 'otp') return (
    <Page onBack={() => setResetStep('email')}>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontSize:52, marginBottom:16 }}>✉️</div>
        <h2 style={{ fontSize:24, fontWeight:800, color:'#fff', marginBottom:8 }}>Enter reset code</h2>
        <p style={{ color:'#666', fontSize:14, marginBottom:28 }}>Code sent to {resetEmail}</p>
        <div style={{ display:'flex', gap:10, justifyContent:'center', marginBottom:32 }}>
          {resetOtp.map((v,i) => (
            <input key={i} id={`r${i}`} maxLength={1} value={v}
              onChange={e => {
                const n=[...resetOtp]; n[i]=e.target.value; setResetOtp(n);
                if (e.target.value && i<5) document.getElementById(`r${i+1}`)?.focus();
              }}
              style={{ width:48, height:58, background:'#1a1a1a', border:'1px solid #333', borderRadius:12, textAlign:'center', fontSize:24, fontFamily:'monospace', color:'#fff', outline:'none' }} />
          ))}
        </div>
        <button onClick={handleForgotVerifyOTP} disabled={loading}
          style={{ ...btnPrimary, opacity: loading ? .6:1 }}>
          {loading ? 'Verifying…' : 'Verify code →'}
        </button>
        <div style={{ marginTop:20 }}>
          {resendTimer > 0
            ? <p style={{ color:'#555', fontSize:13 }}>Resend code in {resendTimer}s</p>
            : <button onClick={async () => { setLoading(true); try { await sendOTP(resetEmail); setResetOtp(['','','','','','']); startResendTimer(); notify('Code resent','Check your email.','info'); } catch(e){notify('Error',e.message,'error');} finally{setLoading(false);} }} disabled={loading}
                style={{ background:'none', border:'none', color:'#fbbf24', fontSize:13, cursor:'pointer', fontWeight:600 }}>
                Resend code
              </button>
          }
        </div>
      </div>
    </Page>
  );

  // FORGOT PASSWORD — step: new password
  if (mode === 'forgot' && resetStep === 'newpass') return (
    <Page onBack={() => setResetStep('otp')}>
      <div style={{ textAlign:'center', marginBottom:32 }}>
        <div style={{ fontSize:48, marginBottom:12 }}>🔒</div>
        <h2 style={{ fontSize:24, fontWeight:800, color:'#fff', marginBottom:8 }}>Set new password</h2>
        <p style={{ color:'#666', fontSize:14 }}>Choose a strong password for your account</p>
      </div>
      <Inp label="New password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="At least 6 characters" type="password" />
      <button onClick={handleForgotSetPassword} disabled={loading}
        style={{ ...btnPrimary, opacity: loading ? .6:1, marginTop:8 }}>
        {loading ? 'Saving…' : 'Save new password →'}
      </button>
    </Page>
  );

  if (mode === 'login') return (
    <Page onBack={() => setMode('home')}>
      <div style={{ marginBottom:32, textAlign:'center' }}>
        <div style={{ fontSize:48, marginBottom:12 }}>👋</div>
        <h2 style={{ fontSize:26, fontWeight:800, color:'#fff', marginBottom:6 }}>Welcome back</h2>
        <p style={{ color:'#666', fontSize:14 }}>Sign in to your account</p>
      </div>
      <Inp label="Phone number" value={form.phone}    onChange={f('phone')}    placeholder="+20 100 111 2222" />
      <Inp label="Password"     value={form.password} onChange={f('password')} placeholder="Your password" type="password" />
      <button onClick={handleLogin} disabled={loading}
        style={{ ...btnPrimary, opacity: loading ? .6:1, marginTop:8 }}>
        {loading ? 'Signing in…' : 'Sign in →'}
      </button>
      <p style={{ textAlign:'right', marginTop:10 }}>
        <span onClick={() => { setResetStep('email'); setResetEmail(''); setMode('forgot'); }}
          style={{ color:'#fbbf24', fontSize:13, cursor:'pointer', fontWeight:600 }}>
          Forgot password?
        </span>
      </p>
      <div style={{ marginTop:24, padding:'16px', background:'#0d0d0d', borderRadius:12, border:'1px solid #1a1a1a' }}>
        <p style={{ fontSize:11, color:'#444', marginBottom:10, textAlign:'center', textTransform:'uppercase', letterSpacing:'.08em' }}>Demo accounts (password: password)</p>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', justifyContent:'center' }}>
          {[
            ['+20100111222','👤 Passenger'],
            ['+20101333444','🚐 Driver'],
            ['+20100000001','⚙️ Admin'],
          ].map(([ph,label]) => (
            <button key={ph} onClick={() => setForm(p => ({ ...p, phone:ph, password:'password' }))}
              style={{ background:'#1a1a1a', border:'1px solid #2a2a2a', borderRadius:8, padding:'7px 14px', color:'#fff', fontSize:12, cursor:'pointer', fontFamily:"'Sora',sans-serif" }}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <p style={{ textAlign:'center', marginTop:20, fontSize:12, color:'#444' }}>
        No account?{' '}
        <span onClick={() => setMode('home')} style={{ color:'#fbbf24', cursor:'pointer', fontWeight:600 }}>Create one →</span>
      </p>
    </Page>
  );
}
