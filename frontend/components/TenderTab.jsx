// frontend/components/TenderTab.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Drop-in tab for AdminDash: create tenders for trips, monitor live bids,
// manually award / cancel, and see winner assignments.
//
// Usage in AdminDash.jsx:
//   import TenderTab from '../../components/TenderTab.jsx';
//   // inside your tab switcher:
//   {tab === 'tender' && <TenderTab adminToken={token} trips={trips} />}
//
// Add the tab button:
//   <NavBtn t="tender" label="🏷 Tenders" />
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback } from 'react';
import { C } from './UI.jsx';
import socket from '../socket.js';

const font    = "'IBM Plex Mono','Fira Code',monospace";
const fontSans = "'Sora','DM Sans',sans-serif";

const BASE = '/api/tender';
async function req(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function fmtEGP(n)  { return n ? `${Number(n).toLocaleString()} EGP` : '—'; }
function fmtDate(d) { return d ? new Date(d).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '—'; }
function fmtTime(t) { return t ? String(t).slice(0,5) : '—'; }

function useCountdown(endsAt) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    const calc = () => Math.max(0, new Date(endsAt) - Date.now());
    setLeft(calc());
    const iv = setInterval(() => setLeft(calc()), 1000);
    return () => clearInterval(iv);
  }, [endsAt]);
  const h = Math.floor(left / 3600000);
  const m = Math.floor((left % 3600000) / 60000);
  const s = Math.floor((left % 60000) / 1000);
  return { display:`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`, over: left===0, urgent: left<300000 };
}

// ────────────────────────────────────────────────────────────────────────────
export default function TenderTab({ adminToken, trips = [] }) {
  const [tenders,  setTenders]  = useState([]);
  const [selected, setSelected] = useState(null); // tender detail
  const [creating, setCreating] = useState(false);
  const [cForm,    setCForm]    = useState({ trip_id:'', duration_minutes:60, description:'' });
  const [cErr,     setCErr]     = useState('');
  const [cBusy,    setCBusy]    = useState(false);
  const [loading,  setLoading]  = useState(true);

  const loadTenders = useCallback(async () => {
    try { const d = await req('GET', '/tenders', null, adminToken); setTenders(d); }
    catch {}
  }, [adminToken]);

  useEffect(() => {
    setLoading(true);
    loadTenders().finally(() => setLoading(false));
    const iv = setInterval(loadTenders, 10000);
    return () => clearInterval(iv);
  }, [loadTenders]);

  // Real-time updates
  useEffect(() => {
    socket.on('tender:new',       () => loadTenders());
    socket.on('tender:cancelled', () => loadTenders());
    return () => { socket.off('tender:new'); socket.off('tender:cancelled'); };
  }, [loadTenders]);

  async function createTender() {
    if (!cForm.trip_id) { setCErr('Select a trip'); return; }
    setCBusy(true); setCErr('');
    try {
      await req('POST', '/tenders', cForm, adminToken);
      await loadTenders();
      setCreating(false);
      setCForm({ trip_id:'', duration_minutes:60, description:'' });
    } catch(e) { setCErr(e.message); } finally { setCBusy(false); }
  }

  async function openDetail(id) {
    try {
      const d = await req('GET', `/tenders/${id}`, null, adminToken);
      setSelected(d);
    } catch {}
  }

  async function closeTender(id) {
    if (!window.confirm('Award to lowest bidder now?')) return;
    try {
      const res = await req('POST', `/tenders/${id}/close`, {}, adminToken);
      alert(`Awarded to ${res.winner_company_name} — ${fmtEGP(res.awarded_amount)}`);
      await loadTenders();
      if (selected?.id === id) setSelected(prev => ({ ...prev, status:'awarded' }));
    } catch(e) { alert(e.message); }
  }

  async function cancelTender(id) {
    if (!window.confirm('Cancel this tender?')) return;
    await req('DELETE', `/tenders/${id}`, null, adminToken);
    await loadTenders();
    if (selected?.id === id) setSelected(null);
  }

  // Live bid updates for open detail
  useEffect(() => {
    if (!selected) return;
    const ev = `tender:${selected.id}:bids`;
    socket.on(ev, bids => setSelected(prev => prev ? { ...prev, bids } : prev));
    socket.on(`tender:${selected.id}:awarded`, data => setSelected(prev => prev ? { ...prev, status:'awarded', winner:data } : prev));
    return () => { socket.off(ev); socket.off(`tender:${selected.id}:awarded`); };
  }, [selected?.id]);

  // Trips not yet tendered/awarded
  const eligibleTrips = trips.filter(t => !['tendered','awarded','assigned'].includes(t.status));
  const openTenders   = tenders.filter(t => t.status==='open');
  const closedTenders = tenders.filter(t => t.status!=='open');

  return (
    <div>
      <style>{`
        @keyframes bidFlash{0%{background:rgba(251,191,36,0.15)}100%{background:transparent}}
        @keyframes slideIn{from{transform:translateY(6px);opacity:0}to{transform:translateY(0);opacity:1}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
      `}</style>

      {/* Header row */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
        <div>
          <div style={{ fontSize:20, fontWeight:800 }}>🏷 Tender Management</div>
          <div style={{ fontSize:12, color: C.text2, marginTop:3 }}>Create & monitor reverse-auction bids for trips</div>
        </div>
        <button onClick={() => setCreating(v => !v)} style={{
          background: creating ? C.redDim : C.greenDim,
          color: creating ? C.red : C.green,
          border: `1px solid ${creating ? C.redBorder : C.greenBorder}`,
          borderRadius:10, padding:'10px 18px', cursor:'pointer',
          fontFamily:font, fontSize:12, fontWeight:700,
        }}>
          {creating ? '× Cancel' : '+ New Tender'}
        </button>
      </div>

      {/* Create form */}
      {creating && (
        <div style={{ background:C.bg3, border:`1px solid ${C.greenBorder}`, borderRadius:14, padding:'20px', marginBottom:20, animation:'slideIn .3s ease' }}>
          <div style={{ fontFamily:font, fontSize:11, color: C.green, letterSpacing:'.1em', marginBottom:14 }}>// CREATE TENDER</div>
          <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 2fr', gap:12, marginBottom:12 }}>
            <div>
              <label style={labelSt}>Select Trip *</label>
              <select value={cForm.trip_id} onChange={e => setCForm({...cForm, trip_id:e.target.value})} style={selSt}>
                <option value="">Choose a trip…</option>
                {eligibleTrips.map(t => (
                  <option key={t.id} value={t.id}>
                    #{t.id} — {t.from_loc} → {t.to_loc} · {fmtDate(t.date)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelSt}>Duration (minutes)</label>
              <input type="number" value={cForm.duration_minutes} min={5} max={10080}
                onChange={e => setCForm({...cForm, duration_minutes:parseInt(e.target.value)||60})}
                style={inpSt}
              />
            </div>
            <div>
              <label style={labelSt}>Description (optional)</label>
              <input value={cForm.description} onChange={e => setCForm({...cForm, description:e.target.value})}
                placeholder="e.g. Urgent — A/C bus required" style={inpSt}
              />
            </div>
          </div>
          {cErr && <div style={{ fontSize:11, color:C.red, marginBottom:10 }}>⚠ {cErr}</div>}
          <button onClick={createTender} disabled={cBusy} style={{
            background: cBusy ? C.bg4 : '#fbbf24', color:'#000',
            border:'none', borderRadius:10, padding:'12px 24px',
            fontFamily:font, fontSize:13, fontWeight:700, cursor: cBusy?'default':'pointer',
          }}>
            {cBusy ? 'Creating…' : '⚡ Launch Tender'}
          </button>
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns: selected ? '340px 1fr' : '1fr', gap:20 }}>
        {/* Tender list */}
        <div>
          {/* Open */}
          {openTenders.length > 0 && (
            <>
              <SH label="⚡ Live" count={openTenders.length} color={C.green} />
              <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:20 }}>
                {openTenders.map(t => (
                  <TenderRow key={t.id} tender={t} active={selected?.id===t.id}
                    onClick={() => openDetail(t.id)}
                    onClose={() => closeTender(t.id)}
                    onCancel={() => cancelTender(t.id)}
                    isAdmin
                  />
                ))}
              </div>
            </>
          )}

          {/* Closed */}
          {closedTenders.length > 0 && (
            <>
              <SH label="📁 Closed" count={closedTenders.length} color={C.text2} />
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {closedTenders.map(t => (
                  <TenderRow key={t.id} tender={t} active={selected?.id===t.id}
                    onClick={() => openDetail(t.id)} isAdmin
                  />
                ))}
              </div>
            </>
          )}

          {tenders.length === 0 && !loading && (
            <div style={{ textAlign:'center', padding:'48px 20px', color:C.text2 }}>
              <div style={{ fontSize:36, marginBottom:12 }}>🏷</div>
              <div style={{ fontFamily:font, fontSize:13 }}>No tenders yet</div>
              <div style={{ fontSize:12, color:C.text2, marginTop:6 }}>Create one above to start bidding</div>
            </div>
          )}
        </div>

        {/* Tender detail */}
        {selected && (
          <TenderDetail
            tender={selected}
            onClose={() => setSelected(null)}
            onAward={() => closeTender(selected.id)}
            onCancel={() => cancelTender(selected.id)}
          />
        )}
      </div>
    </div>
  );
}

// ── Tender row card ───────────────────────────────────────
function TenderRow({ tender, active, onClick, onClose, onCancel, isAdmin }) {
  const { display, over, urgent } = useCountdown(tender.ends_at);
  const isOpen = tender.status === 'open';

  return (
    <div onClick={onClick} style={{
      background: active ? '#1a1a27' : C.bg2,
      border: `1px solid ${active ? 'rgba(251,191,36,0.3)' : C.border}`,
      borderRadius:10, padding:'14px', cursor:'pointer', transition:'all .15s',
    }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
        <div>
          <div style={{ fontFamily:font, fontSize:10, color:'#fbbf24', marginBottom:3, letterSpacing:'.06em' }}>
            TENDER #{tender.id} · {tender.from_loc} → {tender.to_loc}
          </div>
          <div style={{ fontSize:11, color:C.text2 }}>{fmtDate(tender.date)} · {fmtTime(tender.pickup_time)}</div>
        </div>
        <StatusBadge status={tender.status} />
      </div>

      <div style={{ display:'flex', gap:16, marginBottom: isAdmin&&isOpen ? 10 : 0 }}>
        <Stat label="Bids" value={tender.bid_count||0} />
        <Stat label="Lowest" value={fmtEGP(tender.lowest_bid)} gold />
        {isOpen && <Stat label="Time" value={over?'ENDED':display} red={urgent} />}
      </div>

      {isAdmin && isOpen && (
        <div style={{ display:'flex', gap:8 }} onClick={e => e.stopPropagation()}>
          <button onClick={onClose} style={{ flex:1, background:C.greenDim, color:C.green, border:`1px solid ${C.greenBorder}`, borderRadius:7, padding:'6px', fontFamily:font, fontSize:11, cursor:'pointer' }}>
            🏆 Award Now
          </button>
          <button onClick={onCancel} style={{ background:C.redDim, color:C.red, border:`1px solid ${C.redBorder}`, borderRadius:7, padding:'6px 10px', fontFamily:font, fontSize:11, cursor:'pointer' }}>
            × Cancel
          </button>
        </div>
      )}
    </div>
  );
}

// ── Tender detail panel ───────────────────────────────────
function TenderDetail({ tender, onClose, onAward, onCancel }) {
  const { display, over, urgent } = useCountdown(tender.ends_at);
  const bids   = tender.bids || [];
  const lowest = bids.length ? Math.min(...bids.map(b=>b.amount)) : null;
  const isOpen = tender.status === 'open';

  return (
    <div style={{ background:C.bg2, border:`1px solid rgba(251,191,36,0.25)`, borderRadius:14, overflow:'hidden' }}>
      {/* Header */}
      <div style={{ background:C.bg3, borderBottom:`1px solid ${C.border}`, padding:'16px 20px', display:'flex', alignItems:'center', gap:12 }}>
        <button onClick={onClose} style={{ background:'transparent', border:'none', color:C.text2, cursor:'pointer', fontSize:18 }}>←</button>
        <div style={{ flex:1 }}>
          <div style={{ fontFamily:font, fontSize:11, color:'#fbbf24', letterSpacing:'.08em' }}>TENDER #{tender.id}</div>
          <div style={{ fontSize:15, fontWeight:700, marginTop:2 }}>{tender.from_loc} → {tender.to_loc}</div>
        </div>
        {isOpen && (
          <div style={{
            background: urgent ? 'rgba(248,113,113,0.1)' : 'rgba(52,211,153,0.1)',
            border: `1px solid ${urgent ? 'rgba(248,113,113,0.3)' : 'rgba(52,211,153,0.3)'}`,
            borderRadius:8, padding:'8px 14px', textAlign:'center',
          }}>
            <div style={{ fontFamily:font, fontSize:20, fontWeight:700, color: over?C.text2:urgent?'#f87171':'#34d399', animation: urgent&&!over?'pulse 1s infinite':'none' }}>
              {over ? 'ENDED' : display}
            </div>
            <div style={{ fontSize:9, color:C.text2, fontFamily:font }}>REMAINING</div>
          </div>
        )}
        <StatusBadge status={tender.status} />
      </div>

      <div style={{ padding:'20px' }}>
        {/* Stats row */}
        <div style={{ display:'flex', gap:12, marginBottom:20 }}>
          <StatCard label="Total Bids"   value={bids.length} />
          <StatCard label="Lowest Bid"   value={fmtEGP(lowest)} accent />
          <StatCard label="Trip Date"    value={fmtDate(tender.date)} />
          <StatCard label="Seats"        value={tender.total_seats||'—'} />
        </div>

        {/* Winner info */}
        {tender.status === 'awarded' && tender.winner && (
          <div style={{ background:'rgba(251,191,36,0.08)', border:'1px solid rgba(251,191,36,0.25)', borderRadius:10, padding:'14px', marginBottom:16, display:'flex', alignItems:'center', gap:12 }}>
            <span style={{ fontSize:24 }}>🏆</span>
            <div>
              <div style={{ fontFamily:font, fontSize:11, color:'#fbbf24' }}>AWARDED TO</div>
              <div style={{ fontSize:15, fontWeight:700, marginTop:2 }}>{tender.winner.company_name}</div>
              <div style={{ fontSize:13, color:C.text2 }}>Winning bid: {fmtEGP(tender.winner.amount)}</div>
            </div>
          </div>
        )}

        {/* Bid board */}
        <div style={{ fontFamily:font, fontSize:11, color:C.text2, letterSpacing:'.08em', marginBottom:10, display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ width:7, height:7, borderRadius:'50%', background:'#34d399', display:'inline-block', animation: isOpen?'pulse 1.5s infinite':'none' }} />
          LIVE BID BOARD · {bids.length} bid{bids.length!==1?'s':''}
        </div>

        {bids.length === 0 ? (
          <div style={{ textAlign:'center', padding:'28px', color:C.text2, fontFamily:font, fontSize:12 }}>No bids yet</div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {bids.map((bid, i) => (
              <div key={bid.id} style={{
                display:'flex', alignItems:'center', gap:12,
                background: i===0 ? 'rgba(251,191,36,0.08)' : C.bg3,
                border:`1px solid ${i===0 ? 'rgba(251,191,36,0.25)' : C.border}`,
                borderRadius:8, padding:'10px 14px',
                animation:'bidFlash .6s ease',
              }}>
                <div style={{ width:26,height:26,borderRadius:'50%',background:i===0?'#fbbf24':C.bg4,color:i===0?'#000':C.text2,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:font,fontSize:11,fontWeight:700,flexShrink:0 }}>
                  {i===0?'★':i+1}
                </div>
                <div style={{ flex:1, fontFamily:font, fontSize:11, color:C.text2 }}>
                  Anonymous Company {String.fromCharCode(65+i)}
                </div>
                <div style={{ fontFamily:font, fontSize:15, fontWeight:700, color: i===0?'#fbbf24':C.text }}>
                  {fmtEGP(bid.amount)}
                </div>
                {i===0 && <span style={{ fontFamily:font, fontSize:9, color:'#fbbf24', background:'rgba(251,191,36,0.12)', border:'1px solid rgba(251,191,36,0.2)', borderRadius:3, padding:'1px 6px' }}>LOWEST</span>}
                {i===bids.length-1 && i>0 && <span style={{ fontFamily:font, fontSize:9, color:'#f87171' }}>HIGH</span>}
              </div>
            ))}
          </div>
        )}

        {/* Admin actions */}
        {isOpen && (
          <div style={{ display:'flex', gap:10, marginTop:16 }}>
            <button onClick={onAward} style={{ flex:1, background:'rgba(52,211,153,0.1)', color:'#34d399', border:'1px solid rgba(52,211,153,0.28)', borderRadius:10, padding:'12px', fontFamily:font, fontSize:12, fontWeight:700, cursor:'pointer' }}>
              🏆 Award to Lowest Bidder
            </button>
            <button onClick={onCancel} style={{ background:'rgba(248,113,113,0.1)', color:'#f87171', border:'1px solid rgba(248,113,113,0.25)', borderRadius:10, padding:'12px 16px', fontFamily:font, fontSize:12, cursor:'pointer' }}>
              × Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Mini components ───────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    open:      ['#34d399','rgba(52,211,153,0.1)','rgba(52,211,153,0.28)','OPEN'],
    awarded:   ['#fbbf24','rgba(251,191,36,0.1)','rgba(251,191,36,0.28)','AWARDED'],
    cancelled: ['#f87171','rgba(248,113,113,0.1)','rgba(248,113,113,0.25)','CANCELLED'],
  };
  const [col, bg, brd, label] = map[status] || map.open;
  return (
    <span style={{ background:bg, color:col, border:`1px solid ${brd}`, borderRadius:4, padding:'2px 8px', fontFamily:font, fontSize:9, fontWeight:700, letterSpacing:'.1em' }}>
      {label}
    </span>
  );
}

function Stat({ label, value, gold, red }) {
  return (
    <div style={{ flex:1 }}>
      <div style={{ fontSize:9, color:C.text2, fontFamily:font, letterSpacing:'.06em' }}>{label}</div>
      <div style={{ fontSize:12, fontWeight:700, color: gold?'#fbbf24':red?'#f87171':C.text, fontFamily:font, marginTop:2 }}>{value}</div>
    </div>
  );
}

function StatCard({ label, value, accent }) {
  return (
    <div style={{ flex:1, background:C.bg3, border:`1px solid ${C.border}`, borderRadius:8, padding:'10px 12px' }}>
      <div style={{ fontSize:10, color:C.text2, fontFamily:font, letterSpacing:'.06em', marginBottom:4 }}>{label}</div>
      <div style={{ fontSize:14, fontWeight:700, color: accent?'#fbbf24':C.text, fontFamily:font }}>{value}</div>
    </div>
  );
}

function SH({ label, count, color }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
      <span style={{ fontFamily:font, fontSize:11, color, fontWeight:700, letterSpacing:'.08em' }}>{label}</span>
      <span style={{ background:'rgba(255,255,255,0.05)', color:C.text2, borderRadius:8, padding:'0 7px', fontFamily:font, fontSize:10 }}>{count}</span>
    </div>
  );
}

const labelSt = { fontSize:10, color:C.text2, fontFamily:font, letterSpacing:'.08em', display:'block', marginBottom:5 };
const inpSt   = { width:'100%', background:C.bg4, border:`1px solid ${C.border}`, borderRadius:8, padding:'10px 12px', color:C.text, fontFamily:fontSans, fontSize:13, outline:'none', boxSizing:'border-box' };
const selSt   = { ...inpSt, cursor:'pointer' };
