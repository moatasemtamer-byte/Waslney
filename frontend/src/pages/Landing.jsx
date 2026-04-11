import { useState } from 'react';
import { useAuth } from '../App.jsx';
import { sendOTP, register, login } from '../api.js';
import { C, Inp, btnPrimary, btnSm } from '../components/UI.jsx';

export default function Landing() {
  const { login: doLogin, notify } = useAuth();
  const [mode,   setMode]   = useState('home');   // home | signup | otp | login
  const [role,   setRole]   = useState('');
  const [form,   setForm]   = useState({ name:'', phone:'', password:'', car:'', plate:'' });
  const [otp,    setOtp]    = useState(['','','','','','']);
  const [devOtp, setDevOtp] = useState('');
  const [loading,setLoading]= useState(false);

  const f = k => e => setForm({ ...form, [k]: e.target.value });

  const roleCards = [
    { key:'passenger', icon:'🧑', label:'Passenger', desc:'Search trips, book seats, track your ride',  col:C.blue   },
    { key:'driver',    icon:'🚐', label:'Driver',    desc:'Manage trips, check in passengers live',     col:C.green  },
    { key:'admin',     icon:'⚙️', label:'Admin',     desc:'Create trips, manage drivers & bookings',   col:C.purple },
  ];

  async function handleSendOTP() {
    if (!form.name || !form.phone || !form.password) { notify('Missing info', 'Fill in all fields.', 'error'); return; }
    if (role === 'driver' && (!form.car || !form.plate)) { notify('Missing info', 'Enter car model and plate.', 'error'); return; }
    setLoading(true);
    try {
      const res = await sendOTP(form.phone);
      setDevOtp(res.dev_otp || '');
      setMode('otp');
      notify('Code sent', `OTP: ${res.dev_otp} (shown for demo)`, 'info');
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

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', padding:'40px 20px',
      background:`radial-gradient(ellipse 80% 50% at 50% -5%, rgba(74,222,128,0.07) 0%, transparent 70%)` }}>

      {/* ── HOME ── */}
      {mode === 'home' && (
        <div style={{ textAlign:'center', maxWidth:720, width:'100%' }}>
          <div style={{ fontSize:11, letterSpacing:'.2em', color:C.green, textTransform:'uppercase', marginBottom:20 }}>Shuttle · Fixed Route Rides</div>
          <h1 style={{ fontSize:'clamp(40px,6vw,68px)', fontWeight:300, letterSpacing:'-.03em', lineHeight:1.1, marginBottom:16 }}>
            Shared rides,<br/><span style={{ color:C.green }}>fixed routes.</span>
          </h1>
          <p style={{ color:C.text2, fontSize:15, lineHeight:1.8, margin:'0 auto 48px', maxWidth:380 }}>
            Book a seat on a pre-planned trip, or drive passengers on your route.
          </p>
          <p style={{ fontSize:12, color:C.text3, letterSpacing:'.08em', textTransform:'uppercase', marginBottom:18 }}>Choose your role</p>
          <div style={{ display:'flex', gap:14, justifyContent:'center', flexWrap:'wrap', marginBottom:32 }}>
            {roleCards.map(r => (
              <div key={r.key} onClick={() => { setRole(r.key); setMode('signup'); }}
                style={{ background:C.bg2, border:`1px solid ${C.border}`, borderTop:`2px solid ${r.col}`, borderRadius:12, padding:'24px 20px', cursor:'pointer', minWidth:180, flex:1, maxWidth:210, transition:'all .2s', textAlign:'left' }}>
                <div style={{ fontSize:26, marginBottom:12 }}>{r.icon}</div>
                <div style={{ fontSize:15, fontWeight:500, color:r.col, marginBottom:6 }}>{r.label}</div>
                <div style={{ fontSize:12, color:C.text2, lineHeight:1.6 }}>{r.desc}</div>
              </div>
            ))}
          </div>
          <button onClick={() => setMode('login')} style={{ ...btnSm, padding:'8px 20px', borderRadius:20 }}>
            Already have an account? Sign in →
          </button>
        </div>
      )}

      {/* ── SIGNUP ── */}
      {mode === 'signup' && (
        <div style={{ background:C.bg2, border:`1px solid ${C.border}`, borderRadius:12, padding:'28px 26px', width:'100%', maxWidth:420 }}>
          <button onClick={() => setMode('home')} style={{ ...btnSm, marginBottom:20 }}>← Back</button>
          <h2 style={{ fontSize:22, fontWeight:400, marginBottom:4 }}>Create account</h2>
          <p style={{ color:C.text2, fontSize:13, marginBottom:24 }}>
            Signing up as <span style={{ color: role==='passenger'?C.blue:role==='driver'?C.green:C.purple, fontWeight:500 }}>{role}</span>
          </p>
          <Inp label="Full name"    value={form.name}     onChange={f('name')}     placeholder="Ahmed Hassan" />
          <Inp label="Phone number" value={form.phone}    onChange={f('phone')}    placeholder="+20 100 000 0000" />
          <Inp label="Password"     value={form.password} onChange={f('password')} placeholder="Choose a password" type="password" />
          {role === 'driver' && <>
            <Inp label="Car model"     value={form.car}   onChange={f('car')}   placeholder="Toyota Hiace 2022" />
            <Inp label="License plate" value={form.plate} onChange={f('plate')} placeholder="أ ب ج 1234" />
          </>}
          <button onClick={handleSendOTP} disabled={loading} style={{ ...btnPrimary, opacity: loading ? .6:1 }}>
            {loading ? 'Sending…' : 'Send verification code'}
          </button>
        </div>
      )}

      {/* ── OTP ── */}
      {mode === 'otp' && (
        <div style={{ background:C.bg2, border:`1px solid ${C.border}`, borderRadius:12, padding:'28px 26px', width:'100%', maxWidth:380, textAlign:'center' }}>
          <button onClick={() => setMode('signup')} style={{ ...btnSm, marginBottom:20 }}>← Back</button>
          <div style={{ fontSize:36, marginBottom:12 }}>📱</div>
          <h2 style={{ fontSize:20, fontWeight:400, marginBottom:8 }}>Verify your number</h2>
          <p style={{ color:C.text2, fontSize:13, marginBottom:6 }}>Code sent to {form.phone}</p>
          {devOtp && <p style={{ color:C.amber, fontSize:12, marginBottom:20 }}>Demo code: <b>{devOtp}</b></p>}
          <div style={{ display:'flex', gap:8, justifyContent:'center', marginBottom:24 }}>
            {otp.map((v,i) => (
              <input key={i} id={`o${i}`} maxLength={1} value={v}
                onChange={e => {
                  const n = [...otp]; n[i] = e.target.value; setOtp(n);
                  if (e.target.value && i < 5) document.getElementById(`o${i+1}`)?.focus();
                }}
                style={{ width:46, height:54, background:C.bg3, border:`1px solid ${C.border}`, borderRadius:8, textAlign:'center', fontSize:22, fontFamily:'monospace', color:C.text, outline:'none' }} />
            ))}
          </div>
          <button onClick={handleVerify} disabled={loading} style={{ ...btnPrimary, opacity: loading ? .6:1 }}>
            {loading ? 'Verifying…' : 'Verify & create account'}
          </button>
        </div>
      )}

      {/* ── LOGIN ── */}
      {mode === 'login' && (
        <div style={{ background:C.bg2, border:`1px solid ${C.border}`, borderRadius:12, padding:'28px 26px', width:'100%', maxWidth:380 }}>
          <button onClick={() => setMode('home')} style={{ ...btnSm, marginBottom:20 }}>← Back</button>
          <h2 style={{ fontSize:22, fontWeight:400, marginBottom:4 }}>Sign in</h2>
          <p style={{ color:C.text2, fontSize:13, marginBottom:24 }}>Default password for seed accounts: <span style={{ color:C.amber, fontFamily:'monospace' }}>password</span></p>
          <Inp label="Phone number" value={form.phone}    onChange={f('phone')}    placeholder="+20 100 111 2222" />
          <Inp label="Password"     value={form.password} onChange={f('password')} placeholder="password" type="password" />
          <button onClick={handleLogin} disabled={loading} style={{ ...btnPrimary, opacity: loading ? .6:1 }}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
          <div style={{ marginTop:14, textAlign:'center' }}>
            <p style={{ fontSize:11, color:C.text3, marginBottom:8 }}>Demo accounts (password: <span style={{ fontFamily:'monospace' }}>password</span>)</p>
            {[
              ['+20100111222','Ahmed (passenger)'],
              ['+20101333444','Khaled (driver)'],
              ['+20100000001','Admin'],
            ].map(([ph,label]) => (
              <button key={ph} onClick={() => setForm({ ...form, phone:ph, password:'password' })}
                style={{ ...btnSm, margin:'3px 4px', borderRadius:20, fontSize:11 }}>
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
