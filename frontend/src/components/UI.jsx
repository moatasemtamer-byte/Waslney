// Shared UI — Waslney brand: black primary, yellow secondary

export const C = {
  bg:'#000000', bg2:'#0d0d0d', bg3:'#1a1a1a', bg4:'#262626',
  border:'#2a2a2a', border2:'#3a3a3a',
  text:'#ffffff', text2:'#a0a0a0', text3:'#555555',
  // Waslney yellow as primary accent
  green:'#fbbf24',  greenDim:'rgba(251,191,36,0.12)',  greenBorder:'rgba(251,191,36,0.3)',
  // Keep blue/red/purple for status colors
  blue:'#60a5fa',   blueDim:'rgba(96,165,250,0.1)',   blueBorder:'rgba(96,165,250,0.25)',
  amber:'#fbbf24',  amberDim:'rgba(251,191,36,0.12)', amberBorder:'rgba(251,191,36,0.3)',
  red:'#f87171',    redDim:'rgba(248,113,113,0.1)',   redBorder:'rgba(248,113,113,0.25)',
  purple:'#c084fc', purpleDim:'rgba(192,132,252,0.1)',purpleBorder:'rgba(192,132,252,0.25)',
};

export const card    = { background:C.bg2, border:`1px solid ${C.border}`, borderRadius:16, padding:'20px 22px' };
export const inputSt = { width:'100%', background:C.bg3, border:`1px solid ${C.border}`, borderRadius:12, padding:'14px 16px', color:C.text, fontFamily:"'Sora',sans-serif", fontSize:14, outline:'none', boxSizing:'border-box' };
export const btnPrimary = { background:'#fbbf24', color:'#000', border:'none', borderRadius:12, padding:'14px 18px', fontFamily:"'Sora',sans-serif", fontSize:14, fontWeight:700, cursor:'pointer', width:'100%' };
export const btnSm      = { background:'transparent', color:C.text2, border:`1px solid ${C.border}`, borderRadius:8, padding:'7px 14px', fontFamily:"'Sora',sans-serif", fontSize:12, cursor:'pointer' };
export const btnDanger  = { background:C.redDim, color:C.red, border:`1px solid ${C.redBorder}`, borderRadius:8, padding:'10px 14px', fontFamily:"'Sora',sans-serif", fontSize:13, cursor:'pointer' };
export const labelSt    = { fontSize:11, color:C.text3, letterSpacing:'.08em', textTransform:'uppercase', display:'block', marginBottom:6 };
export const sectSt     = { fontSize:11, color:C.text3, letterSpacing:'.1em', textTransform:'uppercase', marginBottom:14 };
export const dividerSt  = { borderTop:`1px solid ${C.border}`, margin:'14px 0', border:'none', borderTopStyle:'solid' };

// Waslney Logo SVG component
export function WaslneyLogo({ size = 32 }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
      <svg width={size * 2.2} height={size} viewBox="0 0 88 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Bus body */}
        <rect x="2" y="10" width="36" height="22" rx="4" fill="#fbbf24"/>
        {/* Windshield */}
        <rect x="28" y="13" width="8" height="10" rx="2" fill="#000" opacity="0.5"/>
        {/* Windows */}
        <rect x="6" y="13" width="6" height="7" rx="1.5" fill="#000" opacity="0.4"/>
        <rect x="14" y="13" width="6" height="7" rx="1.5" fill="#000" opacity="0.4"/>
        {/* Wheels */}
        <circle cx="12" cy="34" r="5" fill="#000"/>
        <circle cx="12" cy="34" r="2.5" fill="#fbbf24"/>
        <circle cx="28" cy="34" r="5" fill="#000"/>
        <circle cx="28" cy="34" r="2.5" fill="#fbbf24"/>
        {/* Arrow */}
        <line x1="40" y1="20" x2="82" y2="20" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round"/>
        <polyline points="74,13 82,20 74,27" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      </svg>
      <span style={{ fontSize: size * 0.55, fontWeight:800, color:'#fbbf24', fontFamily:"'Sora',sans-serif", letterSpacing:'0.05em' }}>WASLNEY</span>
    </div>
  );
}

export function Badge({ type = 'green', children }) {
  const map = {
    green:  [C.greenDim,  C.green,  C.greenBorder],
    blue:   [C.blueDim,   C.blue,   C.blueBorder],
    amber:  [C.amberDim,  C.amber,  C.amberBorder],
    red:    [C.redDim,    C.red,    C.redBorder],
    purple: [C.purpleDim, C.purple, C.purpleBorder],
  };
  const [bg, col, brd] = map[type] || map.green;
  return (
    <span style={{ background:bg, color:col, border:`1px solid ${brd}`, borderRadius:20, padding:'3px 10px', fontSize:11, fontWeight:600, whiteSpace:'nowrap' }}>
      {children}
    </span>
  );
}

export function StatCard({ num, label, color }) {
  return (
    <div style={{ ...card, textAlign:'center', padding:'16px 10px' }}>
      <div style={{ fontSize:28, fontWeight:700, color: color || C.amber }}>{num}</div>
      <div style={{ fontSize:10, color:C.text3, marginTop:4, letterSpacing:'.08em', textTransform:'uppercase' }}>{label}</div>
    </div>
  );
}

export function DetailRow({ label, val, accent }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', padding:'12px 0', borderBottom:`1px solid ${C.border}` }}>
      <span style={{ fontSize:13, color:C.text2 }}>{label}</span>
      <span style={{ fontSize:13, fontWeight:600, color: accent || C.text, textAlign:'right', maxWidth:'60%' }}>{val || '—'}</span>
    </div>
  );
}

export function Inp({ label, ...props }) {
  return (
    <div style={{ marginBottom:14 }}>
      {label && <label style={labelSt}>{label}</label>}
      <input style={inputSt} {...props} />
    </div>
  );
}

export function Sel({ label, children, ...props }) {
  return (
    <div style={{ marginBottom:14 }}>
      {label && <label style={labelSt}>{label}</label>}
      <select style={{ ...inputSt, appearance:'none' }} {...props}>{children}</select>
    </div>
  );
}

export function Tabs({ tabs, active, onSet }) {
  return (
    <div style={{ display:'flex', gap:4, marginBottom:24, background:C.bg2, borderRadius:12, padding:4 }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onSet(t.id)}
          style={{ flex:1, padding:'10px 8px', borderRadius:10, border:'none', cursor:'pointer', fontFamily:"'Sora',sans-serif", fontSize:12, fontWeight:600, transition:'all .15s',
            background: active===t.id ? '#fbbf24' : 'transparent',
            color: active===t.id ? '#000' : C.text3,
          }}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Topbar({ role, name, onLogout, notifCount, onNotif }) {
  return (
    <div style={{ background:C.bg, borderBottom:`1px solid ${C.border}`, padding:'14px 20px', display:'flex', alignItems:'center', gap:12, position:'sticky', top:0, zIndex:100 }}>
      <WaslneyLogo size={28} />
      <div style={{ flex:1 }} />
      {role && <span style={{ fontSize:11, color:C.text3, background:C.bg3, border:`1px solid ${C.border}`, borderRadius:20, padding:'3px 10px' }}>{role}</span>}
      {notifCount > 0 && (
        <button onClick={onNotif} style={{ background:'transparent', border:'none', cursor:'pointer', position:'relative', padding:4 }}>
          <span style={{ fontSize:20 }}>🔔</span>
          <span style={{ position:'absolute', top:0, right:0, background:'#ef4444', color:'#fff', borderRadius:'50%', fontSize:9, width:16, height:16, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700 }}>{notifCount}</span>
        </button>
      )}
      {onNotif && notifCount === 0 && (
        <button onClick={onNotif} style={{ background:'transparent', border:'none', cursor:'pointer', padding:4 }}>
          <span style={{ fontSize:20 }}>🔔</span>
        </button>
      )}
      <span style={{ fontSize:13, color:C.text2 }}>{name}</span>
      <button onClick={onLogout} style={{ ...btnSm, padding:'6px 12px', fontSize:11 }}>Sign out</button>
    </div>
  );
}

export function CapBar({ booked, total }) {
  const pct = total > 0 ? (booked / total) * 100 : 0;
  const col = pct > 85 ? C.red : pct > 60 ? C.amber : '#fbbf24';
  return (
    <div style={{ marginTop:10 }}>
      <div style={{ background:C.bg3, borderRadius:4, height:4, overflow:'hidden' }}>
        <div style={{ width:`${pct}%`, height:'100%', background:col, borderRadius:4, transition:'width .3s' }} />
      </div>
    </div>
  );
}

export function CapBarLabeled({ booked, total }) {
  const pct = total > 0 ? (booked / total) * 100 : 0;
  const col = pct > 85 ? C.red : pct > 60 ? C.amber : '#fbbf24';
  return (
    <div style={{ marginTop:10 }}>
      <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:C.text3, marginBottom:4 }}>
        <span>{booked} booked</span><span>{total - booked} left</span>
      </div>
      <div style={{ background:C.bg3, borderRadius:4, height:5, overflow:'hidden' }}>
        <div style={{ width:`${pct}%`, height:'100%', background:col, borderRadius:4 }} />
      </div>
    </div>
  );
}

export function Stars({ n = 0, interactive = false, onSet }) {
  return (
    <span>
      {[1,2,3,4,5].map(i => (
        <span key={i} onClick={() => interactive && onSet && onSet(i)}
          style={{ color: i <= Math.round(n) ? C.amber : C.border2, fontSize:18, cursor: interactive ? 'pointer':'default' }}>★</span>
      ))}
    </span>
  );
}

export function Spinner() {
  return (
    <div style={{ display:'flex', justifyContent:'center', padding:24 }}>
      <div style={{ width:24, height:24, border:`2px solid ${C.border}`, borderTopColor:C.amber, borderRadius:'50%', animation:'spin .7s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

export function Avatar({ name='', size=40, color, dim, border: brd }) {
  const bg = dim || 'rgba(251,191,36,0.15)';
  const col = color || C.amber;
  const b = brd || 'rgba(251,191,36,0.3)';
  return (
    <div style={{ width:size, height:size, borderRadius:'50%', background:bg, border:`1px solid ${b}`, display:'flex', alignItems:'center', justifyContent:'center', color:col, fontWeight:700, fontSize:size*0.38, flexShrink:0 }}>
      {(name||'?')[0].toUpperCase()}
    </div>
  );
}

export function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
}
