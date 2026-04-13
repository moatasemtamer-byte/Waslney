import { useState } from 'react';
import { useAuth } from '../App.jsx';
import { sendOTP, register, login } from '../api.js';
import { C, WaslneyLogo, Inp, btnPrimary, btnSm } from '../components/UI.jsx';

export default function Landing() {
  const { login: doLogin, notify } = useAuth();
  const [mode,    setMode]    = useState('home');
  const [role,    setRole]    = useState('');
  const [form,    setForm]    = useState({ name:'', phone:'', password:'', car:'', plate:'' });
  const [otp,     setOtp]     = useState(['','','','','','']);
  const [devOtp,  setDevOtp]  = useState('');
  const [loading, setLoading] = useState(false);

  const f = k => e => setForm({ ...form, [k]: e.target.value });

  async function handleSendOTP() {
    if (!form.name || !form.phone || !form.password) { notify('Missing info', 'Fill in all fields.', 'error'); return; }
    if (role === 'driver' && (!form.car || !form.plate)) { notify('Missing info', 'Enter car model and plate.', 'error'); return; }
    setLoading(true);
    try {
      const res = await sendOTP(form.phone);
      setDevOtp(res.dev_otp || '');
      setMode('otp');
      notify('Code sent', `OTP: ${res.dev_otp}`, 'info');
    } catch(e) { notify('Error', e.message, 'error'); }
    finally { setLoading(false); }
  }

  async function handleVerify() {
    const code = otp.join('');
    if (code.length < 6) { notify('Incomplete', 'Enter all 6 digits.', 'error'); return; }
    setLoading(true);
    try {
      const data = await register({ ...form, role, otp: code });
      doLogin(data.user, data.token);
      notify('Welcome!', 'Account created.');
    } catch(e) { notify('Error', e.message, 'error'); }
    finally { setLoading(false); }
  }

  async function handleLogin() {
    if (!form.phone || !form.password) { notify('Missing info', 'Enter phone and password.', 'error'); return; }
    setLoading(true);
    try {
      const data = await login(form.phone, form.password);
      doLogin(data.user, data.token);
      notify('Welcome back!', data.user.name);
    } catch(e) { notify('Wrong credentials', e.message, 'error'); }
    finally { setLoading(false); }
  }

  // ── HOME ──────────────────────────────────────────────
  if (mode === 'home') return (
    <div style={{ minHeight:'100vh', background:'#000', display:'flex', flexDirection:'column' }}>
      {/* Top bar */}
      <div style={{ padding:'20px 24px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <WaslneyLogo size={30} />
        <button onClick={() => setMode('login')}
          style={{ background:'transparent', border:'1px solid #333', borderRadius:24, padding:'8px 20px', color:'#fff', fontSize:13, fontFamily:"'Sora',sans-serif", cursor:'pointer', fontWeight:600 }}>
          Sign in
        </button>
      </div>

      {/* Hero */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'20px 24px 40px', textAlign:'center' }}>
        {/* Big bus icon */}
        <div style={{ fontSize:72, marginBottom:24, filter:'drop-shadow(0 0 40px rgba(251,191,36,0.4))' }}>🚐</div>
        <h1 style={{ fontSize:'clamp(32px,7vw,56px)', fontWeight:800, color:'#fff', lineHeight:1.1, marginBottom:12, letterSpacing:'-0.02em' }}>
          Get there<br/><span style={{ color:'#fbbf24' }}>together.</span>
        </h1>
        <p style={{ color:'#666', fontSize:15, lineHeight:1.7, maxWidth:320, marginBottom:48 }}>
          Shared rides on fixed routes across Cairo. Book a seat or drive your route.
        </p>

        {/* Main CTA buttons — Uber style */}
        <div style={{ width:'100%', maxWidth:400, display:'flex', flexDirection:'column', gap:12 }}>
          {/* Where to — passenger */}
          <button
            onClick={() => { setRole('passenger'); setMode('signup'); }}
            style={{ background:'#fbbf24', color:'#000', border:'none', borderRadius:16, padding:'18px 24px', fontSize:16, fontWeight:700, cursor:'pointer', fontFamily:"'Sora',sans-serif", display:'flex', alignItems:'center', gap:14, textAlign:'left' }}>
            <span style={{ fontSize:22, background:'rgba(0,0,0,0.15)', borderRadius:10, width:44, height:44, display:'flex', alignItems:'center', justifyContent:'center' }}>🔍</span>
            <div>
              <div style={{ fontSize:16, fontWeight:700 }}>Where to?</div>
              <div style={{ fontSize:12, fontWeight:400, opacity:0.7, marginTop:2 }}>Book a seat on a shared ride</div>
            </div>
          </button>

          {/* Drive — driver */}
          <button
            onClick={() => { setRole('driver'); setMode('signup'); }}
            style={{ background:'#1a1a1a', color:'#fff', border:'1px solid #333', borderRadius:16, padding:'18px 24px', fontSize:16, fontWeight:700, cursor:'pointer', fontFamily:"'Sora',sans-serif", display:'flex', alignItems:'center', gap:14, textAlign:'left' }}>
            <span style={{ fontSize:22, background:'#333', borderRadius:10, width:44, height:44, display:'flex', alignItems:'center', justifyContent:'center' }}>🚐</span>
            <div>
              <div style={{ fontSize:16, fontWeight:700 }}>Drive with Waslney</div>
              <div style={{ fontSize:12, fontWeight:400, color:'#888', marginTop:2 }}>Earn on your daily route</div>
            </div>
          </button>

          {/* Admin — smaller */}
          <button
            onClick={() => { setRole('admin'); setMode('signup'); }}
            style={{ background:'transparent', color:'#555', border:'1px solid #222', borderRadius:12, padding:'12px 20px', fontSize:13, cursor:'pointer', fontFamily:"'Sora',sans-serif", display:'flex', alignItems:'center', gap:10 }}>
            <span>⚙️</span> Admin portal
          </button>
        </div>

        <p style={{ marginTop:24, fontSize:12, color:'#444' }}>
          Already have an account?{' '}
          <span onClick={() => setMode('login')} style={{ color:'#fbbf24', cursor:'pointer', fontWeight:600 }}>Sign in</span>
        </p>
      </div>
    </div>
  );

  // ── SIGNUP ────────────────────────────────────────────
  if (mode === 'signup') return (
    <div style={{ minHeight:'100vh', background:'#000', display:'flex', flexDirection:'column' }}>
      <div style={{ padding:'20px 24px' }}>
        <button onClick={() => setMode('home')} style={{ background:'transparent', border:'none', color:'#fff', fontSize:24, cursor:'pointer', padding:4 }}>←</button>
      </div>
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 24px 40px' }}>
        <div style={{ width:'100%', maxWidth:400 }}>
          <div style={{ marginBottom:32 }}>
            <WaslneyLogo size={28} />
            <h2 style={{ fontSize:26, fontWeight:800, color:'#fff', marginTop:20, marginBottom:6 }}>
              {role === 'passenger' ? 'Create your account' : role === 'driver' ? 'Start driving' : 'Admin access'}
            </h2>
            <p style={{ color:'#666', fontSize:14 }}>
              {role === 'passenger' ? 'Book shared rides across Cairo' : role === 'driver' ? 'Earn on your daily route' : 'Manage the platform'}
            </p>
          </div>

          <Inp label="Full name"    value={form.name}     onChange={f('name')}     placeholder="Ahmed Hassan" />
          <Inp label="Phone number" value={form.phone}    onChange={f('phone')}    placeholder="+20 100 000 0000" />
          <Inp label="Password"     value={form.password} onChange={f('password')} placeholder="Choose a password" type="password" />
          {role === 'driver' && <>
            <Inp label="Car model"     value={form.car}   onChange={f('car')}   placeholder="Toyota Hiace 2022" />
            <Inp label="License plate" value={form.plate} onChange={f('plate')} placeholder="أ ب ج 1234" />
          </>}

          <button onClick={handleSendOTP} disabled={loading}
            style={{ ...btnPrimary, opacity: loading ? .6:1, marginTop:8 }}>
            {loading ? 'Sending…' : 'Continue →'}
          </button>

          <p style={{ textAlign:'center', marginTop:20, fontSize:12, color:'#444' }}>
            Already have an account?{' '}
            <span onClick={() => setMode('login')} style={{ color:'#fbbf24', cursor:'pointer', fontWeight:600 }}>Sign in</span>
          </p>
        </div>
      </div>
    </div>
  );

  // ── OTP ───────────────────────────────────────────────
  if (mode === 'otp') return (
    <div style={{ minHeight:'100vh', background:'#000', display:'flex', flexDirection:'column' }}>
      <div style={{ padding:'20px 24px' }}>
        <button onClick={() => setMode('signup')} style={{ background:'transparent', border:'none', color:'#fff', fontSize:24, cursor:'pointer', padding:4 }}>←</button>
      </div>
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 24px 40px' }}>
        <div style={{ width:'100%', maxWidth:380, textAlign:'center' }}>
          <div style={{ fontSize:48, marginBottom:16 }}>📱</div>
          <h2 style={{ fontSize:24, fontWeight:800, color:'#fff', marginBottom:8 }}>Verify your number</h2>
          <p style={{ color:'#666', fontSize:14, marginBottom:6 }}>Code sent to {form.phone}</p>
          {devOtp && <p style={{ color:'#fbbf24', fontSize:13, marginBottom:28, background:'rgba(251,191,36,0.1)', borderRadius:8, padding:'8px 16px', display:'inline-block' }}>Demo code: <b>{devOtp}</b></p>}
          <div style={{ display:'flex', gap:10, justifyContent:'center', marginBottom:32 }}>
            {otp.map((v,i) => (
              <input key={i} id={`o${i}`} maxLength={1} value={v}
                onChange={e => {
                  const n = [...otp]; n[i] = e.target.value; setOtp(n);
                  if (e.target.value && i < 5) document.getElementById(`o${i+1}`)?.focus();
                }}
                style={{ width:48, height:58, background:'#1a1a1a', border:'1px solid #333', borderRadius:12, textAlign:'center', fontSize:24, fontFamily:'monospace', color:'#fff', outline:'none' }} />
            ))}
          </div>
          <button onClick={handleVerify} disabled={loading}
            style={{ ...btnPrimary, opacity: loading ? .6:1 }}>
            {loading ? 'Verifying…' : 'Verify & continue →'}
          </button>
        </div>
      </div>
    </div>
  );

  // ── LOGIN ─────────────────────────────────────────────
  if (mode === 'login') return (
    <div style={{ minHeight:'100vh', background:'#000', display:'flex', flexDirection:'column' }}>
      <div style={{ padding:'20px 24px' }}>
        <button onClick={() => setMode('home')} style={{ background:'transparent', border:'none', color:'#fff', fontSize:24, cursor:'pointer', padding:4 }}>←</button>
      </div>
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 24px 40px' }}>
        <div style={{ width:'100%', maxWidth:400 }}>
          <div style={{ marginBottom:32 }}>
            <WaslneyLogo size={28} />
            <h2 style={{ fontSize:26, fontWeight:800, color:'#fff', marginTop:20, marginBottom:6 }}>Welcome back</h2>
            <p style={{ color:'#666', fontSize:14 }}>Sign in to your account</p>
          </div>

          <Inp label="Phone number" value={form.phone}    onChange={f('phone')}    placeholder="+20 100 111 2222" />
          <Inp label="Password"     value={form.password} onChange={f('password')} placeholder="Your password" type="password" />

          <button onClick={handleLogin} disabled={loading}
            style={{ ...btnPrimary, opacity: loading ? .6:1, marginTop:8 }}>
            {loading ? 'Signing in…' : 'Sign in →'}
          </button>

          <div style={{ marginTop:24, padding:'16px', background:'#111', borderRadius:12, border:'1px solid #222' }}>
            <p style={{ fontSize:11, color:'#555', marginBottom:10, textAlign:'center', textTransform:'uppercase', letterSpacing:'.08em' }}>Demo accounts (password: password)</p>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap', justifyContent:'center' }}>
              {[
                ['+20100111222','👤 Passenger'],
                ['+20101333444','🚐 Driver'],
                ['+20100000001','⚙️ Admin'],
              ].map(([ph,label]) => (
                <button key={ph} onClick={() => setForm({ ...form, phone:ph, password:'password' })}
                  style={{ background:'#1a1a1a', border:'1px solid #333', borderRadius:8, padding:'7px 14px', color:'#fff', fontSize:12, cursor:'pointer', fontFamily:"'Sora',sans-serif" }}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <p style={{ textAlign:'center', marginTop:20, fontSize:12, color:'#444' }}>
            No account?{' '}
            <span onClick={() => setMode('home')} style={{ color:'#fbbf24', cursor:'pointer', fontWeight:600 }}>Create one →</span>
          </p>
        </div>
      </div>
    </div>
  );
}
