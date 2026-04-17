import { useState, useRef } from 'react';
import { useAuth } from '../App.jsx';
import { sendOTP, register, login } from '../api.js';
import { WaslneyLogo, Inp, btnPrimary } from '../components/UI.jsx';

// Compress image to max 1200px wide/tall at 80% JPEG quality before upload.
// This shrinks a typical 5 MB phone photo down to ~100–200 KB — well within limits.
function compressImage(file, maxDim = 1200, quality = 0.78) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        // Work out new dimensions keeping aspect ratio
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) { height = Math.round(height * maxDim / width);  width = maxDim; }
          else                { width  = Math.round(width  * maxDim / height); height = maxDim; }
        }
        const canvas = document.createElement('canvas');
        canvas.width  = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function StepDots({ step, total }) {
  return (
    <div style={{ display:'flex', justifyContent:'center', gap:8, marginBottom:28 }}>
      {Array.from({ length: total }, (_, i) => (
        <div key={i} style={{
          height:8, borderRadius:4,
          width: i < step ? 28 : 8,
          background: i < step ? '#fbbf24' : i === step ? '#444' : '#222',
          transition:'all .3s',
        }} />
      ))}
    </div>
  );
}

function PhotoTile({ label, arabic, emoji, value, onChange, error }) {
  const inputRef = useRef();
  return (
    <div style={{ marginBottom:14 }}>
      <div style={{ fontSize:12, color:'#4b7ab5', fontWeight:700, marginBottom:6, textTransform:'uppercase', letterSpacing:'.06em' }}>
        {label}{arabic && <span style={{ color:'#fbbf24', marginLeft:6, fontWeight:600, fontSize:11 }}>({arabic})</span>}
      </div>
      <div onClick={() => inputRef.current.click()} style={{
        border: error ? '2px solid rgba(248,113,113,0.6)' : value ? '2px solid rgba(34,197,94,0.5)' : '2px dashed #2a2a2a',
        borderRadius:14, padding:'14px 16px', cursor:'pointer',
        display:'flex', alignItems:'center', gap:14,
        background: value ? 'rgba(34,197,94,0.05)' : '#0d0d0d',
        transition:'all .2s',
      }}>
        {value
          ? <img src={value} alt="" style={{ width:56, height:56, objectFit:'cover', borderRadius:10, border:'1px solid rgba(34,197,94,0.4)', flexShrink:0 }} />
          : <div style={{ width:56, height:56, display:'flex', alignItems:'center', justifyContent:'center', fontSize:28, background:'#1a1a1a', borderRadius:10, flexShrink:0 }}>{emoji}</div>
        }
        <div>
          <div style={{ fontSize:13, fontWeight:600, color: value ? '#22c55e' : '#fff' }}>
            {value ? '✓ Photo uploaded' : 'Tap to upload'}
          </div>
          <div style={{ fontSize:11, color:'#555', marginTop:2 }}>
            {value ? 'Tap to change' : 'JPG or PNG — auto-compressed'}
          </div>
        </div>
      </div>
      {error && <div style={{ fontSize:11, color:'#f87171', marginTop:5 }}>{error}</div>}
      <input ref={inputRef} type="file" accept="image/*" style={{ display:'none' }}
        onChange={async e => {
          const file = e.target.files[0];
          if (!file) return;
          if (file.size > 15 * 1024 * 1024) { alert('File too large. Max 15 MB.'); return; }
          try {
            onChange(await compressImage(file));
          } catch { alert('Could not read image. Please try a different file.'); }
        }}
      />
    </div>
  );
}

function Shell({ onBack, children }) {
  return (
    <div style={{ minHeight:'100vh', background:'#000', display:'flex', flexDirection:'column', fontFamily:"'Sora',sans-serif" }}>
      <div style={{ padding:'18px 24px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <button onClick={onBack} style={{ background:'transparent', border:'none', color:'#fff', fontSize:24, cursor:'pointer', padding:4 }}>←</button>
        <WaslneyLogo size={26} />
        <div style={{ width:40 }} />
      </div>
      <div style={{ flex:1, overflowY:'auto', padding:'0 24px 48px' }}>
        <div style={{ maxWidth:420, margin:'0 auto' }}>{children}</div>
      </div>
    </div>
  );
}

export default function Landing() {
  const { login: doLogin, notify } = useAuth();
  const [mode,    setMode]    = useState('home');
  const [role,    setRole]    = useState('');
  const [form,    setForm]    = useState({ name:'', phone:'', password:'', car:'', plate:'' });
  const [docs,    setDocs]    = useState({ profile:'', carLicense:'', driverLicense:'', criminalRecord:'' });
  const [docErrs, setDocErrs] = useState({});
  const [otp,     setOtp]     = useState(['','','','','','']);
  const [devOtp,  setDevOtp]  = useState('');
  const [loading, setLoading] = useState(false);
  const [rejMsg,  setRejMsg]  = useState('');

  const f = k => e => setForm(p => ({ ...p, [k]: e.target.value }));
  const d = k => v  => setDocs(p => ({ ...p, [k]: v }));

  function resetAll() {
    setForm({ name:'', phone:'', password:'', car:'', plate:'' });
    setDocs({ profile:'', carLicense:'', driverLicense:'', criminalRecord:'' });
    setDocErrs({}); setOtp(['','','','','','']); setDevOtp('');
  }

  async function handleInfoNext() {
    if (!form.name || !form.phone || !form.password) { notify('Missing info','Fill in all fields.','error'); return; }
    if (role==='driver' && (!form.car||!form.plate)) { notify('Missing info','Enter car model and plate.','error'); return; }
    if (role==='driver') { setMode('docs'); } else { await sendOTPStep(); }
  }

  async function handleDocsNext() {
    const errs = {};
    if (!docs.profile)        errs.profile        = 'Profile photo required';
    if (!docs.carLicense)     errs.carLicense     = 'Car license photo required';
    if (!docs.driverLicense)  errs.driverLicense  = 'Driver license photo required';
    if (!docs.criminalRecord) errs.criminalRecord = 'Criminal record photo required';
    setDocErrs(errs);
    if (Object.keys(errs).length) return;
    await sendOTPStep();
  }

  async function sendOTPStep() {
    setLoading(true);
    try {
      const res = await sendOTP(form.phone);
      setDevOtp(res.dev_otp||''); setMode('otp');
      notify('Code sent',`OTP: ${res.dev_otp}`,'info');
    } catch(e) { notify('Error',e.message,'error'); }
    finally { setLoading(false); }
  }

  async function handleVerify() {
    const code = otp.join('');
    if (code.length<6) { notify('Incomplete','Enter all 6 digits.','error'); return; }
    setLoading(true);
    try {
      const payload = {
        ...form, role, otp: code,
        ...(role==='driver' ? {
          profile_photo:         docs.profile,
          car_license_photo:     docs.carLicense,
          driver_license_photo:  docs.driverLicense,
          criminal_record_photo: docs.criminalRecord,
        } : {})
      };
      const data = await register(payload);
      if (data.user.account_status==='pending_review') { setMode('pending'); }
      else { doLogin(data.user, data.token); notify('Welcome!','Account created.'); }
    } catch(e) { notify('Error',e.message,'error'); }
    finally { setLoading(false); }
  }

  async function handleLogin() {
    if (!form.phone||!form.password) { notify('Missing info','Enter phone and password.','error'); return; }
    setLoading(true);
    try {
      const data = await login(form.phone, form.password);
      doLogin(data.user, data.token); notify('Welcome back!', data.user.name);
    } catch(e) {
      if (e.message==='pending_review') { setMode('pending'); }
      else if (e.message==='rejected') { setRejMsg(e.detail||''); setMode('rejected'); }
      else { notify('Wrong credentials',e.message,'error'); }
    }
    finally { setLoading(false); }
  }

  /* ─── HOME ─────────────────────────────────────────────────────────── */
  if (mode==='home') return (
    <div style={{ minHeight:'100vh', background:'#000', display:'flex', flexDirection:'column', fontFamily:"'Sora',sans-serif" }}>
      <div style={{ padding:'18px 24px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <WaslneyLogo size={30} />
        <button onClick={()=>{setRole('driver');resetAll();setMode('signup');}}
          style={{ background:'#fbbf24', border:'none', borderRadius:24, padding:'9px 20px', color:'#000', fontSize:13, fontFamily:"'Sora',sans-serif", cursor:'pointer', fontWeight:700, display:'flex', alignItems:'center', gap:6 }}>
          🚐 Drive with us
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
          <button onClick={()=>{setRole('passenger');resetAll();setMode('signup');}}
            style={{ background:'#fbbf24', color:'#000', border:'none', borderRadius:18, padding:'20px 24px', fontSize:18, fontWeight:700, cursor:'pointer', fontFamily:"'Sora',sans-serif", display:'flex', alignItems:'center', gap:14, textAlign:'left', boxShadow:'0 8px 32px rgba(251,191,36,0.2)' }}>
            <span style={{ fontSize:26, background:'rgba(0,0,0,0.15)', borderRadius:12, width:52, height:52, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>🔍</span>
            <div>
              <div style={{ fontSize:18, fontWeight:800 }}>Where to?</div>
              <div style={{ fontSize:12, fontWeight:400, opacity:0.7, marginTop:3 }}>Book a seat on a shared ride</div>
            </div>
          </button>
          <button onClick={()=>{setRole('admin');resetAll();setMode('signup');}}
            style={{ background:'transparent', color:'#333', border:'1px solid #1a1a1a', borderRadius:12, padding:'11px 18px', fontSize:12, cursor:'pointer', fontFamily:"'Sora',sans-serif", display:'flex', alignItems:'center', gap:8, justifyContent:'center' }}>
            ⚙️ Admin portal
          </button>
        </div>
        <p style={{ marginTop:28, fontSize:12, color:'#444' }}>
          Already have an account?{' '}
          <span onClick={()=>setMode('login')} style={{ color:'#fbbf24', cursor:'pointer', fontWeight:600 }}>Sign in</span>
        </p>
      </div>
    </div>
  );

  /* ─── STEP 1: Basic info ────────────────────────────────────────────── */
  if (mode==='signup') return (
    <Shell onBack={()=>setMode('home')}>
      {role==='driver' && <StepDots step={1} total={3} />}
      <div style={{ marginBottom:28, textAlign:'center' }}>
        <div style={{ fontSize:48, marginBottom:12 }}>{role==='passenger'?'🎫':role==='driver'?'🚐':'⚙️'}</div>
        <h2 style={{ fontSize:26, fontWeight:800, color:'#fff', marginBottom:6 }}>
          {role==='passenger'?'Create your account':role==='driver'?'Start driving':'Admin access'}
        </h2>
        <p style={{ color:'#555', fontSize:14 }}>
          {role==='passenger'?'Book shared rides across Cairo':role==='driver'?'Earn on your daily route':'Manage the platform'}
        </p>
      </div>
      <Inp label="Full name"    value={form.name}     onChange={f('name')}     placeholder="Ahmed Hassan" />
      <Inp label="Phone number" value={form.phone}    onChange={f('phone')}    placeholder="+20 100 000 0000" />
      <Inp label="Password"     value={form.password} onChange={f('password')} placeholder="Choose a strong password" type="password" />
      {role==='driver' && <>
        <Inp label="Car model"     value={form.car}   onChange={f('car')}   placeholder="Toyota Hiace 2022" />
        <Inp label="License plate" value={form.plate} onChange={f('plate')} placeholder="أ ب ج 1234" />
        <div style={{ background:'rgba(251,191,36,0.07)', border:'1px solid rgba(251,191,36,0.2)', borderRadius:12, padding:'12px 14px', marginBottom:16, fontSize:13, color:'#fbbf24', lineHeight:1.6 }}>
          📋 Next you'll upload your documents. Your account will be reviewed by our team before activation.
        </div>
      </>}
      <button onClick={handleInfoNext} disabled={loading} style={{ ...btnPrimary, opacity:loading?.6:1, marginTop:8 }}>
        {loading?'Please wait…':role==='driver'?'Continue to documents →':'Continue →'}
      </button>
      <p style={{ textAlign:'center', marginTop:20, fontSize:12, color:'#444' }}>
        Already have an account?{' '}
        <span onClick={()=>setMode('login')} style={{ color:'#fbbf24', cursor:'pointer', fontWeight:600 }}>Sign in</span>
      </p>
    </Shell>
  );

  /* ─── STEP 2: Document uploads ──────────────────────────────────────── */
  if (mode==='docs') return (
    <Shell onBack={()=>setMode('signup')}>
      <StepDots step={2} total={3} />
      <div style={{ marginBottom:24, textAlign:'center' }}>
        <div style={{ fontSize:44, marginBottom:10 }}>📄</div>
        <h2 style={{ fontSize:22, fontWeight:800, color:'#fff', marginBottom:6 }}>Upload your documents</h2>
        <p style={{ color:'#555', fontSize:13, lineHeight:1.6 }}>
          All 4 photos are required. Your information is reviewed only by our team.
        </p>
      </div>

      <div style={{ fontSize:12, fontWeight:700, color:'#fbbf24', marginBottom:10, textTransform:'uppercase', letterSpacing:'.07em' }}>Personal</div>
      <PhotoTile label="Profile Photo" emoji="🤳" value={docs.profile} onChange={d('profile')} error={docErrs.profile} />

      <div style={{ fontSize:12, fontWeight:700, color:'#fbbf24', marginTop:20, marginBottom:10, textTransform:'uppercase', letterSpacing:'.07em' }}>Vehicle &amp; Legal Documents</div>
      <PhotoTile label="Car License"     arabic="رخصة العربية"  emoji="🚗" value={docs.carLicense}     onChange={d('carLicense')}     error={docErrs.carLicense} />
      <PhotoTile label="Driver License"  arabic="رخصة السائق"   emoji="🪪" value={docs.driverLicense}  onChange={d('driverLicense')}  error={docErrs.driverLicense} />
      <PhotoTile label="Criminal Record" arabic="الفيش الجنائي" emoji="📋" value={docs.criminalRecord} onChange={d('criminalRecord')} error={docErrs.criminalRecord} />

      <button onClick={handleDocsNext} disabled={loading} style={{ ...btnPrimary, opacity:loading?.6:1, marginTop:16 }}>
        {loading?'Please wait…':'Continue to verify number →'}
      </button>
    </Shell>
  );

  /* ─── STEP 3: OTP ───────────────────────────────────────────────────── */
  if (mode==='otp') return (
    <Shell onBack={()=>setMode(role==='driver'?'docs':'signup')}>
      {role==='driver' && <StepDots step={3} total={3} />}
      <div style={{ textAlign:'center', paddingTop:20 }}>
        <div style={{ fontSize:52, marginBottom:16 }}>📱</div>
        <h2 style={{ fontSize:24, fontWeight:800, color:'#fff', marginBottom:8 }}>Verify your number</h2>
        <p style={{ color:'#666', fontSize:14, marginBottom:6 }}>Code sent to {form.phone}</p>
        {devOtp && <p style={{ color:'#fbbf24', fontSize:13, marginBottom:28, background:'rgba(251,191,36,0.1)', borderRadius:8, padding:'8px 16px', display:'inline-block' }}>Demo code: <b>{devOtp}</b></p>}
        <div style={{ display:'flex', gap:10, justifyContent:'center', marginBottom:32 }}>
          {otp.map((v,i) => (
            <input key={i} id={`o${i}`} maxLength={1} value={v}
              onChange={e => { const n=[...otp]; n[i]=e.target.value; setOtp(n); if(e.target.value&&i<5) document.getElementById(`o${i+1}`)?.focus(); }}
              style={{ width:48, height:58, background:'#1a1a1a', border:'1px solid #333', borderRadius:12, textAlign:'center', fontSize:24, fontFamily:'monospace', color:'#fff', outline:'none' }}
            />
          ))}
        </div>
        <button onClick={handleVerify} disabled={loading} style={{ ...btnPrimary, opacity:loading?.6:1 }}>
          {loading?'Verifying…':'Verify & continue →'}
        </button>
      </div>
    </Shell>
  );

  /* ─── PENDING REVIEW ────────────────────────────────────────────────── */
  if (mode==='pending') return (
    <div style={{ minHeight:'100vh', background:'#000', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'Sora',sans-serif", padding:24 }}>
      <div style={{ maxWidth:380, textAlign:'center' }}>
        <div style={{ fontSize:80, marginBottom:20, filter:'drop-shadow(0 0 30px rgba(251,191,36,0.4))' }}>⏳</div>
        <h2 style={{ fontSize:26, fontWeight:800, color:'#fff', marginBottom:12 }}>Account Under Review</h2>
        <p style={{ color:'#666', fontSize:15, lineHeight:1.7, marginBottom:24 }}>
          Thank you <b style={{ color:'#fff' }}>{form.name||'for registering'}</b>!<br/>
          Our team will review your documents and notify you once your account is approved.
        </p>
        <div style={{ background:'#0d1117', border:'1px solid rgba(251,191,36,0.2)', borderRadius:16, padding:'20px', marginBottom:28, textAlign:'left' }}>
          <div style={{ fontSize:13, fontWeight:700, color:'#fbbf24', marginBottom:12 }}>What happens next?</div>
          {[['🔍','We review your documents','Usually within 24 hours'],['📱','You get notified','Via in-app notification when approved'],['🚐','Start driving','Log in and accept your first trip']].map(([icon,title,sub])=>(
            <div key={title} style={{ display:'flex', gap:12, marginBottom:12 }}>
              <div style={{ fontSize:20, flexShrink:0 }}>{icon}</div>
              <div>
                <div style={{ fontSize:13, fontWeight:600, color:'#fff' }}>{title}</div>
                <div style={{ fontSize:11, color:'#555', marginTop:2 }}>{sub}</div>
              </div>
            </div>
          ))}
        </div>
        <button onClick={()=>{resetAll();setMode('home');}} style={{ ...btnPrimary }}>Back to home</button>
      </div>
    </div>
  );

  /* ─── REJECTED ──────────────────────────────────────────────────────── */
  if (mode==='rejected') return (
    <div style={{ minHeight:'100vh', background:'#000', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'Sora',sans-serif", padding:24 }}>
      <div style={{ maxWidth:380, textAlign:'center' }}>
        <div style={{ fontSize:72, marginBottom:20 }}>❌</div>
        <h2 style={{ fontSize:24, fontWeight:800, color:'#fff', marginBottom:12 }}>Account Not Approved</h2>
        {rejMsg && <div style={{ background:'rgba(248,113,113,0.07)', border:'1px solid rgba(248,113,113,0.2)', borderRadius:12, padding:'14px', marginBottom:20, fontSize:14, color:'#f87171', lineHeight:1.6 }}>{rejMsg}</div>}
        <p style={{ color:'#555', fontSize:14, marginBottom:24 }}>Please contact support if you believe this is a mistake.</p>
        <button onClick={()=>setMode('home')} style={{ ...btnPrimary }}>Back to home</button>
      </div>
    </div>
  );

  /* ─── LOGIN ─────────────────────────────────────────────────────────── */
  if (mode==='login') return (
    <Shell onBack={()=>setMode('home')}>
      <div style={{ marginBottom:32, textAlign:'center', paddingTop:20 }}>
        <div style={{ fontSize:48, marginBottom:12 }}>👋</div>
        <h2 style={{ fontSize:26, fontWeight:800, color:'#fff', marginBottom:6 }}>Welcome back</h2>
        <p style={{ color:'#666', fontSize:14 }}>Sign in to your account</p>
      </div>
      <Inp label="Phone number" value={form.phone}    onChange={f('phone')}    placeholder="+20 100 111 2222" />
      <Inp label="Password"     value={form.password} onChange={f('password')} placeholder="Your password" type="password" />
      <button onClick={handleLogin} disabled={loading} style={{ ...btnPrimary, opacity:loading?.6:1, marginTop:8 }}>
        {loading?'Signing in…':'Sign in →'}
      </button>
      <div style={{ marginTop:24, padding:'16px', background:'#0d0d0d', borderRadius:12, border:'1px solid #1a1a1a' }}>
        <p style={{ fontSize:11, color:'#444', marginBottom:10, textAlign:'center', textTransform:'uppercase', letterSpacing:'.08em' }}>Demo accounts (password: password)</p>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', justifyContent:'center' }}>
          {[['+20100111222','👤 Passenger'],['+20101333444','🚐 Driver'],['+20100000001','⚙️ Admin']].map(([ph,label])=>(
            <button key={ph} onClick={()=>setForm(p=>({...p,phone:ph,password:'password'}))}
              style={{ background:'#1a1a1a', border:'1px solid #2a2a2a', borderRadius:8, padding:'7px 14px', color:'#fff', fontSize:12, cursor:'pointer', fontFamily:"'Sora',sans-serif" }}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <p style={{ textAlign:'center', marginTop:20, fontSize:12, color:'#444' }}>
        No account?{' '}
        <span onClick={()=>setMode('home')} style={{ color:'#fbbf24', cursor:'pointer', fontWeight:600 }}>Create one →</span>
      </p>
    </Shell>
  );
}
