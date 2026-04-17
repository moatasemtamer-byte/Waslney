import { useState } from 'react';
import { useAuth } from '../App.jsx';
import { sendOTP, register, login } from '../api.js';
import { WaslneyLogo, Inp, btnPrimary } from '../components/UI.jsx';

export default function Landing() {
  const { login: doLogin, notify } = useAuth();
  const [mode,         setMode]         = useState('home');
  const [role,         setRole]         = useState('');
  const [form,         setForm]         = useState({ name:'', phone:'', password:'', car:'', plate:'' });
  const [otp,          setOtp]          = useState(['','','','','','']);
  const [devOtp,       setDevOtp]       = useState('');
  const [loading,      setLoading]      = useState(false);
  const [driverStatus, setDriverStatus] = useState(null); // 'pending_review' | 'rejected'
  const [rejectDetail, setRejectDetail] = useState('');

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
      // Drivers get no token — they must wait for admin approval
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

  async function handleLogin() {
    if (!form.phone || !form.password) { notify('Missing info', 'Enter phone and password.', 'error'); return; }
    setLoading(true);
    try {
      const data = await login(form.phone, form.password);
      doLogin(data.user, data.token);
      notify('Welcome back!', data.user.name);
    } catch(e) {
      // Backend sends error: 'pending_review' or error: 'rejected' for blocked drivers
      if (e.message === 'pending_review') {
        setDriverStatus('pending_review');
        setRejectDetail('');
        setMode('driver-status');
      } else if (e.message === 'rejected') {
        setDriverStatus('rejected');
        setRejectDetail('');
        setMode('driver-status');
      } else {
        notify('Wrong credentials', e.message, 'error');
      }
    } finally { setLoading(false); }
  }

  // ── DRIVER STATUS SCREEN ──────────────────────────────────────────────────
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
          onClick={() => { setMode('home'); setDriverStatus(null); setRejectDetail(''); }}
          style={{ background:'#fbbf24', color:'#000', border:'none', borderRadius:12, padding:'13px 32px', fontFamily:"'Sora',sans-serif", fontSize:14, fontWeight:700, cursor:'pointer' }}>
          ← Back to Home
        </button>
      </div>
    </div>
  );

  // ── HOME ──────────────────────────────────────────────────────────────────
  if (mode === 'home') return (
    <div style={{ minHeight:'100vh', background:'#000', display:'flex', flexDirection:'column', fontFamily:"'Sora',sans-serif" }}>
      <div style={{ padding:'18px 24px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <WaslneyLogo size={30} />
        <button
          onClick={() => { setRole('driver'); setMode('signup'); }}
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
            onClick={() => { setRole('passenger'); setMode('signup'); }}
            style={{ background:'#fbbf24', color:'#000', border:'none', borderRadius:18, padding:'20px 24px', fontSize:18, fontWeight:700, cursor:'pointer', fontFamily:"'Sora',sans-serif", display:'flex', alignItems:'center', gap:14, textAlign:'left', boxShadow:'0 8px 32px rgba(251,191,36,0.2)' }}>
            <span style={{ fontSize:26, background:'rgba(0,0,0,0.15)', borderRadius:12, width:52, height:52, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>🔍</span>
            <div>
              <div style={{ fontSize:18, fontWeight:800 }}>Where to?</div>
              <div style={{ fontSize:12, fontWeight:400, opacity:0.7, marginTop:3 }}>Book a seat on a shared ride</div>
            </div>
          </button>
          <button
            onClick={() => { setRole('admin'); setMode('signup'); }}
            style={{ background:'transparent', color:'#333', border:'1px solid #1a1a1a', borderRadius:12, padding:'11px 18px', fontSize:12, cursor:'pointer', fontFamily:"'Sora',sans-serif", display:'flex', alignItems:'center', gap:8, justifyContent:'center' }}>
            ⚙️ Admin portal
          </button>
        </div>
        <p style={{ marginTop:28, fontSize:12, color:'#444' }}>
          Already have an account?{' '}
          <span onClick={() => setMode('login')} style={{ color:'#fbbf24', cursor:'pointer', fontWeight:600 }}>Sign in</span>
        </p>
      </div>
    </div>
  );

  // ── SIGNUP ────────────────────────────────────────────────────────────────
  if (mode === 'signup') return (
    <div style={{ minHeight:'100vh', background:'#000', display:'flex', flexDirection:'column', fontFamily:"'Sora',sans-serif" }}>
      <div style={{ padding:'18px 24px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <button onClick={() => setMode('home')} style={{ background:'transparent', border:'none', color:'#fff', fontSize:24, cursor:'pointer', padding:4 }}>←</button>
        <WaslneyLogo size={26} />
        <div style={{ width:40 }} />
      </div>
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 24px 40px' }}>
        <div style={{ width:'100%', maxWidth:400 }}>
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
          <Inp label="Password"     value={form.password} onChange={f('password')} placeholder="Choose a password" type="password" />
          {role === 'driver' && <>
            <Inp label="Car model"     value={form.car}   onChange={f('car')}   placeholder="Toyota Hiace 2022" />
            <Inp label="License plate" value={form.plate} onChange={f('plate')} placeholder="أ ب ج 1234" />
            <div style={{ background:'rgba(251,191,36,0.06)', border:'1px solid rgba(251,191,36,0.2)', borderRadius:10, padding:'12px 14px', marginBottom:14 }}>
              <p style={{ color:'#fbbf24', fontSize:12, margin:0, lineHeight:1.6 }}>
                📋 After registration you'll upload your car license, driver license, and criminal record. Your account will be activated once an admin approves your documents.
              </p>
            </div>
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

  // ── OTP ───────────────────────────────────────────────────────────────────
  if (mode === 'otp') return (
    <div style={{ minHeight:'100vh', background:'#000', display:'flex', flexDirection:'column', fontFamily:"'Sora',sans-serif" }}>
      <div style={{ padding:'18px 24px' }}>
        <button onClick={() => setMode('signup')} style={{ background:'transparent', border:'none', color:'#fff', fontSize:24, cursor:'pointer', padding:4 }}>←</button>
      </div>
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 24px 40px' }}>
        <div style={{ width:'100%', maxWidth:380, textAlign:'center' }}>
          <div style={{ fontSize:52, marginBottom:16 }}>📱</div>
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

  // ── LOGIN ─────────────────────────────────────────────────────────────────
  if (mode === 'login') return (
    <div style={{ minHeight:'100vh', background:'#000', display:'flex', flexDirection:'column', fontFamily:"'Sora',sans-serif" }}>
      <div style={{ padding:'18px 24px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <button onClick={() => setMode('home')} style={{ background:'transparent', border:'none', color:'#fff', fontSize:24, cursor:'pointer', padding:4 }}>←</button>
        <WaslneyLogo size={26} />
        <div style={{ width:40 }} />
      </div>
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 24px 40px' }}>
        <div style={{ width:'100%', maxWidth:400 }}>
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
          <div style={{ marginTop:24, padding:'16px', background:'#0d0d0d', borderRadius:12, border:'1px solid #1a1a1a' }}>
            <p style={{ fontSize:11, color:'#444', marginBottom:10, textAlign:'center', textTransform:'uppercase', letterSpacing:'.08em' }}>Demo accounts (password: password)</p>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap', justifyContent:'center' }}>
              {[
                ['+20100111222','👤 Passenger'],
                ['+20101333444','🚐 Driver'],
                ['+20100000001','⚙️ Admin'],
              ].map(([ph,label]) => (
                <button key={ph} onClick={() => setForm({ ...form, phone:ph, password:'password' })}
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
        </div>
      </div>
    </div>
  );
}
