// Shared UI components used across all dashboards

export const C = {
  bg:'#09090b', bg2:'#111113', bg3:'#18181b', bg4:'#27272a',
  border:'#27272a', border2:'#3f3f46',
  text:'#fafafa', text2:'#a1a1aa', text3:'#52525b',
  green:'#4ade80',  greenDim:'rgba(74,222,128,0.1)',  greenBorder:'rgba(74,222,128,0.25)',
  blue:'#60a5fa',   blueDim:'rgba(96,165,250,0.1)',   blueBorder:'rgba(96,165,250,0.25)',
  amber:'#fbbf24',  amberDim:'rgba(251,191,36,0.1)',  amberBorder:'rgba(251,191,36,0.25)',
  red:'#f87171',    redDim:'rgba(248,113,113,0.1)',   redBorder:'rgba(248,113,113,0.25)',
  purple:'#c084fc', purpleDim:'rgba(192,132,252,0.1)',purpleBorder:'rgba(192,132,252,0.25)',
};

export const card    = { background:C.bg2, border:`1px solid ${C.border}`, borderRadius:12, padding:'20px 22px' };
export const inputSt = { width:'100%', background:C.bg3, border:`1px solid ${C.border}`, borderRadius:8, padding:'11px 14px', color:C.text, fontFamily:"'Sora',sans-serif", fontSize:14, outline:'none', boxSizing:'border-box' };
export const btnPrimary = { background:C.green, color:'#000', border:'none', borderRadius:8, padding:'12px 18px', fontFamily:"'Sora',sans-serif", fontSize:13, fontWeight:600, cursor:'pointer', width:'100%' };
export const btnSm      = { background:'transparent', color:C.text2, border:`1px solid ${C.border}`, borderRadius:6, padding:'7px 14px', fontFamily:"'Sora',sans-serif", fontSize:12, cursor:'pointer' };
export const btnDanger  = { background:C.redDim, color:C.red, border:`1px solid ${C.redBorder}`, borderRadius:6, padding:'7px 14px', fontFamily:"'Sora',sans-serif", fontSize:12, cursor:'pointer' };
export const labelSt    = { fontSize:11, color:C.text3, letterSpacing:'.08em', textTransform:'uppercase', display:'block', marginBottom:6 };
export const sectSt     = { fontSize:11, color:C.text3, letterSpacing:'.1em', textTransform:'uppercase', marginBottom:14 };
export const dividerSt  = { borderTop:`1px solid ${C.border}`, margin:'14px 0', border:'none', borderTopStyle:'solid' };

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
    <span style={{ background:bg, color:col, border:`1px solid ${brd}`, borderRadius:20, padding:'3px 10px', fontSize:11, fontWeight:500, letterSpacing:'.03em', whiteSpace:'nowrap' }}>
      {children}
    </span>
  );
}

export function StatCard({ num, label, color }) {
  return (
    <div style={{ ...card, textAlign:'center', padding:'16px 10px' }}>
      <div style={{ fontSize:28, fontWeight:300, color: color || C.text }}>{num}</div>
      <div style={{ fontSize:10, color:C.text3, marginTop:4, letterSpacing:'.08em', textTransform:'uppercase' }}>{label}</div>
    </div>
  );
}

export function DetailRow({ label, val, accent }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', padding:'10px 0', borderBottom:`1px solid ${C.border}` }}>
      <span style={{ fontSize:13, color:C.text2 }}>{label}</span>
      <span style={{ fontSize:13, fontWeight:500, color: accent || C.text, textAlign:'right', maxWidth:'60%' }}>{val || '—'}</span>
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

export function CapBar({ booked, total }) {
  const pct = Math.min(100, Math.round((booked / total) * 100));
  const col  = pct >= 100 ? C.red : pct >= 80 ? C.amber : C.green;
  return (
    <div style={{ height:4, background:C.bg4, borderRadius:2, overflow:'hidden', marginTop:8 }}>
      <div style={{ height:'100%', width:`${pct}%`, background:col, borderRadius:2, transition:'width .4s' }} />
    </div>
  );
}

export function Stars({ n = 0, interactive = false, onSet }) {
  return (
    <span>
      {[1,2,3,4,5].map(i => (
        <span key={i}
          onClick={() => onSet && onSet(i)}
          style={{ cursor: onSet ? 'pointer':'default', fontSize: interactive ? 28:13, color: i <= Math.round(n) ? C.amber : C.border2, padding: interactive ? '0 4px':'0' }}>
          {i <= Math.round(n) ? '★' : '☆'}
        </span>
      ))}
    </span>
  );
}

export function CapBarLabeled({ booked, total }) {
  return (
    <div>
      <CapBar booked={booked} total={total} />
      <div style={{ fontSize:11, color:C.text3, marginTop:5 }}>{booked}/{total} seats booked</div>
    </div>
  );
}

export function Tabs({ tabs, active, onSet }) {
  return (
    <div style={{ display:'flex', gap:3, background:C.bg3, borderRadius:8, padding:4, marginBottom:26 }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onSet(t.id)}
          style={{ flex:1, padding:'8px 4px', borderRadius:6, border:'none',
            background: active === t.id ? C.bg4 : 'transparent',
            color: active === t.id ? C.text : C.text2,
            fontFamily:"'Sora',sans-serif", fontSize:13, cursor:'pointer',
            fontWeight: active === t.id ? 500 : 400, transition:'all .15s',
            whiteSpace:'nowrap' }}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Topbar({ role, name, onLogout, notifCount = 0, onNotif }) {
  const roleColor = role === 'passenger' ? C.blue : role === 'driver' ? C.green : C.purple;
  return (
    <div style={{ height:54, background:C.bg2, borderBottom:`1px solid ${C.border}`, display:'flex', alignItems:'center', padding:'0 24px', gap:14, position:'sticky', top:0, zIndex:100 }}>
      <span style={{ fontFamily:"'Sora',sans-serif", fontSize:12, letterSpacing:'.15em', color:C.green, textTransform:'uppercase', fontWeight:600 }}>Shuttle</span>
      <span style={{ fontSize:11, padding:'3px 10px', borderRadius:20, background:`${roleColor}1a`, color:roleColor, border:`1px solid ${roleColor}44`, fontWeight:500 }}>{role}</span>
      <span style={{ marginLeft:'auto', fontSize:13, color:C.text2 }}>{name}</span>
      {notifCount > 0 && (
        <button onClick={onNotif} style={{ ...btnSm, position:'relative' }}>
          🔔 <span style={{ background:C.red, color:'#fff', borderRadius:20, fontSize:10, padding:'1px 6px', marginLeft:4 }}>{notifCount}</span>
        </button>
      )}
      <button style={btnSm} onClick={onLogout}>Sign out</button>
    </div>
  );
}

export function Avatar({ name = '', color = C.green, dim = C.greenDim, border = C.greenBorder, size = 44 }) {
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div style={{ width:size, height:size, borderRadius:'50%', background:dim, border:`1px solid ${border}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize: size > 40 ? 16 : 12, fontWeight:600, color, flexShrink:0 }}>
      {initials}
    </div>
  );
}

export function Spinner() {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:40 }}>
      <div style={{ width:24, height:24, border:`2px solid ${C.border2}`, borderTopColor:C.green, borderRadius:'50%', animation:'spin .7s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

export function MapPlaceholderGrid() {
  return (
    <div style={{ height:140, background:C.bg3, borderRadius:8, marginBottom:20, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:6, border:`1px solid ${C.border}`, position:'relative', overflow:'hidden' }}>
      <div style={{ position:'absolute', inset:0, backgroundImage:`linear-gradient(${C.border} 1px,transparent 1px),linear-gradient(90deg,${C.border} 1px,transparent 1px)`, backgroundSize:'36px 36px', opacity:.35 }} />
      <span style={{ fontSize:22, position:'relative' }}>🗺️</span>
      <span style={{ fontSize:12, color:C.text3, position:'relative' }}>Map loads here</span>
    </div>
  );
}

export const fmtDate = (d) => {
  try { return new Date(d).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }); }
  catch { return d; }
};

export const fmtTime = (t) => t || '—';
