// frontend/pages/company/CompanyDash.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Full dashboard for bus companies: register/login, live bidding arena,
// fleet management, won tenders & driver assignment.
import { useState, useEffect, useRef, useCallback } from 'react';
import * as api from '../../api_tender.js';
import socket from '../../socket.js';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// ── Design tokens ─────────────────────────────────────────
const C = {
  bg: '#050508', bg2: '#0c0c12', bg3: '#13131c', bg4: '#1a1a27',
  border: '#1e1e2e', border2: '#2a2a40',
  text: '#e8e8f0', text2: '#8888aa', text3: '#44445a',
  gold: '#f5c842', goldDim: 'rgba(245,200,66,0.10)', goldBorder: 'rgba(245,200,66,0.28)',
  green: '#34d399', greenDim: 'rgba(52,211,153,0.10)', greenBorder: 'rgba(52,211,153,0.28)',
  red: '#f87171',   redDim: 'rgba(248,113,113,0.10)',  redBorder: 'rgba(248,113,113,0.28)',
  blue: '#818cf8',  blueDim: 'rgba(129,140,248,0.10)', blueBorder: 'rgba(129,140,248,0.28)',
  purple: '#c084fc',
};

const font = "'IBM Plex Mono', 'Fira Code', monospace";
const fontSans = "'Sora', 'DM Sans', sans-serif";

// ── Helpers ───────────────────────────────────────────────
function fmtEGP(n) { return `${Number(n).toLocaleString('ar-EG')} EGP`; }
function fmtDate(d) { return d ? new Date(d).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '—'; }
function fmtTime(t) { return t ? t.slice(0,5) : '—'; }

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
  const urgent = left < 300000; // < 5 min
  const over   = left === 0;
  return { h, m, s, urgent, over, ms: left };
}

// ── Auth storage ──────────────────────────────────────────
function getToken()   { return typeof window !== 'undefined' ? localStorage.getItem('company_token')   : null; }
function getCompany() { try { return JSON.parse(localStorage.getItem('company_info') || 'null'); } catch { return null; } }
function saveAuth(token, company) {
  localStorage.setItem('company_token', token);
  localStorage.setItem('company_info', JSON.stringify(company));
}
function clearAuth() { localStorage.removeItem('company_token'); localStorage.removeItem('company_info'); }

// ────────────────────────────────────────────────────────────────────────────
// ROOT COMPONENT
// ────────────────────────────────────────────────────────────────────────────
export default function CompanyDash({ onExitPortal }) {
  const [token,   setToken]   = useState(getToken);
  const [company, setCompany] = useState(getCompany);
  const [tab,     setTab]     = useState('bids'); // bids | fleet | won | profile

  function onLogin(tok, comp) { saveAuth(tok, comp); setToken(tok); setCompany(comp); }
  function onLogout() { clearAuth(); setToken(null); setCompany(null); if (onExitPortal) onExitPortal(); }

  if (!token || !company) return <AuthScreen onLogin={onLogin} />;

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: fontSans, color: C.text }}>
      {/* Google fonts */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=Sora:wght@300;400;600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: ${C.border2}; border-radius: 4px; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        @keyframes blink { 0%,100%{opacity:1} 49%{opacity:1} 50%,99%{opacity:0} }
        @keyframes slideIn { from{transform:translateY(8px);opacity:0} to{transform:translateY(0);opacity:1} }
        @keyframes bidFlash { 0%{background:rgba(245,200,66,0.18)} 100%{background:transparent} }
      `}</style>

      {/* Top nav */}
      <nav style={{
        background: C.bg2, borderBottom: `1px solid ${C.border}`,
        padding: '0 24px', display: 'flex', alignItems: 'center', gap: 0,
        position: 'sticky', top: 0, zIndex: 100, height: 56,
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginRight:'auto' }}>
          <span style={{ fontSize:22 }}>🚌</span>
          <span style={{ fontFamily: font, fontSize: 14, fontWeight: 600, color: C.gold, letterSpacing: '.05em' }}>
            TENDER_PORTAL
          </span>
          <span style={{ fontSize: 11, color: C.text3, fontFamily: font }}>// {company.company_name}</span>
        </div>
        {['bids','fleet','won','profile'].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: 'transparent',
            color: tab === t ? C.gold : C.text2,
            border: 'none', borderBottom: `2px solid ${tab===t ? C.gold : 'transparent'}`,
            padding: '0 18px', height: 56, cursor: 'pointer',
            fontFamily: font, fontSize: 12, fontWeight: 600,
            textTransform: 'uppercase', letterSpacing: '.08em', transition: 'all .15s',
          }}>
            {{ bids:'⚡ Live Bids', fleet:'🚐 My Fleet', won:'🏆 Won', profile:'⚙ Profile' }[t]}
          </button>
        ))}
        <button onClick={onLogout} style={{
          marginLeft: 16, background: 'transparent', color: C.text3,
          border: `1px solid ${C.border}`, borderRadius: 6,
          padding: '6px 14px', cursor: 'pointer', fontFamily: font, fontSize: 11,
        }}>logout</button>
      </nav>

      {/* Content */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 20px' }}>
        {tab === 'bids'    && <BidsTab    token={token} company={company} />}
        {tab === 'fleet'   && <FleetTab   token={token} />}
        {tab === 'won'     && <WonTab     token={token} company={company} />}
        {tab === 'profile' && <ProfileTab company={company} token={token} />}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// AUTH SCREEN
// ────────────────────────────────────────────────────────────────────────────
function AuthScreen({ onLogin }) {
  const [mode, setMode]   = useState('login'); // login | register
  const [form, setForm]   = useState({ company_name: '', fleet_number: '', password: '', phone: '' });
  const [err,  setErr]    = useState('');
  const [busy, setBusy]   = useState(false);

  async function submit() {
    setErr(''); setBusy(true);
    try {
      let res;
      if (mode === 'login') {
        res = await api.companyLogin({ company_name: form.company_name, password: form.password });
      } else {
        if (!form.fleet_number) { setErr('Fleet number required'); setBusy(false); return; }
        res = await api.companyRegister(form);
      }
      onLogin(res.token, res.company);
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div style={{
      minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center',
      justifyContent: 'center', fontFamily: fontSans,
    }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=Sora:wght@400;600;700&display=swap');*{box-sizing:border-box}`}</style>

      {/* Background grid */}
      <div style={{ position:'fixed', inset:0, backgroundImage:`linear-gradient(${C.border} 1px,transparent 1px),linear-gradient(90deg,${C.border} 1px,transparent 1px)`, backgroundSize:'40px 40px', opacity:.4, pointerEvents:'none' }} />

      <div style={{ position:'relative', width: 420, animation: 'slideIn .4s ease' }}>
        {/* Header */}
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <div style={{ fontSize:48, marginBottom:8 }}>🚌</div>
          <div style={{ fontFamily: font, fontSize: 22, fontWeight: 600, color: C.gold, letterSpacing: '.1em' }}>TENDER_PORTAL</div>
          <div style={{ fontSize: 13, color: C.text2, marginTop:6 }}>Bus company bidding platform</div>
        </div>

        <div style={{ background: C.bg2, border:`1px solid ${C.border}`, borderRadius:16, overflow:'hidden' }}>
          {/* Mode toggle */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', borderBottom:`1px solid ${C.border}` }}>
            {['login','register'].map(m => (
              <button key={m} onClick={() => { setMode(m); setErr(''); }} style={{
                padding:'14px', background: mode===m ? C.bg3 : 'transparent',
                color: mode===m ? C.gold : C.text2, border:'none', cursor:'pointer',
                fontFamily: font, fontSize:12, fontWeight:600, textTransform:'uppercase', letterSpacing:'.1em',
                borderBottom: mode===m ? `2px solid ${C.gold}` : '2px solid transparent',
              }}>
                {m === 'login' ? '→ Login' : '+ Register'}
              </button>
            ))}
          </div>

          <div style={{ padding:'28px 24px', display:'flex', flexDirection:'column', gap:14 }}>
            <FieldInput label="Company Name" value={form.company_name} onChange={v => setForm({...form, company_name:v})} placeholder="e.g. Cairo Express Co." />
            {mode === 'register' && (
              <>
                <FieldInput label="Fleet / Bus Number" value={form.fleet_number} onChange={v => setForm({...form, fleet_number:v})} placeholder="e.g. BUS-2024-CAIRO" />
                <FieldInput label="Contact Phone" value={form.phone} onChange={v => setForm({...form, phone:v})} placeholder="e.g. +20 100 000 0000" />
              </>
            )}
            <FieldInput label="Password" type="password" value={form.password} onChange={v => setForm({...form, password:v})} placeholder="••••••••" onEnter={submit} />

            {err && <div style={{ fontSize:12, color:C.red, background:C.redDim, border:`1px solid ${C.redBorder}`, borderRadius:6, padding:'8px 12px' }}>⚠ {err}</div>}

            <button onClick={submit} disabled={busy} style={{
              background: busy ? C.bg4 : C.gold, color: busy ? C.text2 : '#000',
              border:'none', borderRadius:10, padding:'14px', cursor: busy?'default':'pointer',
              fontFamily: font, fontSize:13, fontWeight:600, letterSpacing:'.05em', marginTop:4,
            }}>
              {busy ? 'Please wait…' : mode === 'login' ? '→ LOGIN' : '+ CREATE ACCOUNT'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// BIDS TAB — Live bidding arena
// ────────────────────────────────────────────────────────────────────────────
function BidsTab({ token, company }) {
  const [tenders, setTenders] = useState([]);
  const [selected, setSelected] = useState(null); // tender id
  const [detail,   setDetail]   = useState(null);
  const [loading,  setLoading]  = useState(true);

  const loadTenders = useCallback(async () => {
    try { const d = await api.getTenders(); setTenders(d); } catch {}
  }, []);

  useEffect(() => {
    setLoading(true);
    loadTenders().finally(() => setLoading(false));
    const iv = setInterval(loadTenders, 15000);
    return () => clearInterval(iv);
  }, [loadTenders]);

  async function openTender(id) {
    setSelected(id);
    try { const d = await api.getTender(id); setDetail(d); } catch {}
  }

  // Listen for real-time bid updates
  useEffect(() => {
    if (!selected) return;
    const event = `tender:${selected}:bids`;
    socket.on(event, (bids) => {
      setDetail(prev => prev ? { ...prev, bids } : prev);
    });
    socket.on('tender:new', () => loadTenders());
    socket.on('tender:cancelled', ({ tender_id }) => {
      if (tender_id === selected) { setSelected(null); setDetail(null); }
      loadTenders();
    });
    return () => { socket.off(event); socket.off('tender:new'); socket.off('tender:cancelled'); };
  }, [selected, loadTenders]);

  const openTenders = tenders.filter(t => t.status === 'open');

  if (loading) return <LoadingState label="Loading live tenders…" />;

  return (
    <div style={{ display:'grid', gridTemplateColumns: selected ? '320px 1fr' : '1fr', gap: 20 }}>
      {/* Tender list */}
      <div>
        <SectionHeader icon="⚡" label="Open Tenders" count={openTenders.length} />
        {openTenders.length === 0 && (
          <EmptyState icon="🏁" label="No open tenders right now" sub="Check back soon — admin will publish new trips for bidding." />
        )}
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {openTenders.map(t => (
            <TenderCard key={t.id} tender={t} active={selected === t.id} onClick={() => openTender(t.id)} />
          ))}
        </div>
      </div>

      {/* Bidding arena */}
      {selected && detail && (
        <BiddingArena
          tender={detail}
          token={token}
          company={company}
          onBack={() => { setSelected(null); setDetail(null); }}
          onBidPlaced={(bids) => setDetail(prev => ({ ...prev, bids }))}
        />
      )}
    </div>
  );
}

function TenderCard({ tender, active, onClick }) {
  const { h, m, s, urgent, over } = useCountdown(tender.ends_at);

  return (
    <div onClick={onClick} style={{
      background: active ? C.bg4 : C.bg2,
      border: `1px solid ${active ? C.goldBorder : C.border}`,
      borderRadius: 12, padding:'16px', cursor:'pointer',
      transition:'all .15s', animation: 'slideIn .3s ease',
    }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
        <div>
          <div style={{ fontFamily: font, fontSize:11, color: C.gold, marginBottom:4, letterSpacing:'.08em' }}>
            TENDER #{tender.id}
          </div>
          <div style={{ fontSize:14, fontWeight:600 }}>{tender.from_loc} → {tender.to_loc}</div>
          <div style={{ fontSize:12, color: C.text2, marginTop:3 }}>{fmtDate(tender.date)} · {fmtTime(tender.pickup_time)}</div>
        </div>
        <div style={{ textAlign:'right' }}>
          <div style={{
            fontFamily: font, fontSize:over?11:14, fontWeight:700,
            color: over ? C.text3 : urgent ? C.red : C.green,
            animation: urgent && !over ? 'pulse 1s infinite' : 'none',
          }}>
            {over ? 'ENDED' : `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`}
          </div>
          <div style={{ fontSize:10, color: C.text3, fontFamily: font }}>remaining</div>
        </div>
      </div>
      <div style={{ display:'flex', gap:12 }}>
        <Stat label="Bids" value={tender.bid_count || 0} />
        <Stat label="Lowest" value={tender.lowest_bid ? fmtEGP(tender.lowest_bid) : '—'} accent />
        <Stat label="Seats" value={tender.total_seats || '—'} />
      </div>
    </div>
  );
}

// ── Full bidding arena ────────────────────────────────────
function BiddingArena({ tender, token, company, onBack, onBidPlaced }) {
  const [amount,   setAmount]   = useState('');
  const [placing,  setPlacing]  = useState(false);
  const [err,      setErr]      = useState('');
  const [success,  setSuccess]  = useState('');
  const [detail,   setDetail]   = useState(tender);
  const { h, m, s, urgent, over } = useCountdown(detail.ends_at);

  // Keep detail in sync when parent updates
  useEffect(() => { setDetail(tender); }, [tender]);

  // Real-time bid list updates via socket
  useEffect(() => {
    const ev = `tender:${tender.id}:bids`;
    socket.on(ev, (bids) => {
      setDetail(prev => ({ ...prev, bids }));
      onBidPlaced && onBidPlaced(bids);
    });
    socket.on(`tender:${tender.id}:awarded`, (data) => {
      setDetail(prev => ({ ...prev, status: 'awarded', winner: data }));
      // No navigation — company stays on the BiddingArena to see the result
    });
    return () => { socket.off(ev); socket.off(`tender:${tender.id}:awarded`); };
  }, [tender.id]);

  async function placeBid() {
    setErr(''); setSuccess('');
    const val = parseFloat(amount);
    if (!val || val <= 0) { setErr('Enter a valid amount'); return; }
    setPlacing(true);
    try {
      const res = await api.placeBid(tender.id, val, token);
      setSuccess(`Bid of ${fmtEGP(val)} placed!`);
      setAmount('');
      setDetail(prev => ({ ...prev, bids: res.bids }));
    } catch(e) { setErr(e.message); }
    finally { setPlacing(false); }
  }

  const bids   = detail.bids || [];
  const lowest = bids.length ? Math.min(...bids.map(b => b.amount)) : null;

  return (
    <div style={{ background: C.bg2, border:`1px solid ${C.goldBorder}`, borderRadius:16, overflow:'hidden' }}>
      {/* Arena header */}
      <div style={{ background: C.bg3, borderBottom:`1px solid ${C.border}`, padding:'16px 20px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <button onClick={onBack} style={{ background:'transparent', border:'none', color:C.text2, cursor:'pointer', fontSize:18, lineHeight:1 }}>←</button>
          <div style={{ flex:1 }}>
            <div style={{ fontFamily:font, fontSize:11, color:C.gold, letterSpacing:'.08em' }}>BIDDING ARENA · TENDER #{tender.id}</div>
            <div style={{ fontSize:16, fontWeight:700, marginTop:2 }}>{detail.from_loc} → {detail.to_loc}</div>
            <div style={{ fontSize:12, color:C.text2 }}>{fmtDate(detail.date)} · Departure {fmtTime(detail.pickup_time)} · {detail.total_seats} seats</div>
          </div>
          {/* Countdown */}
          <div style={{ textAlign:'center', background: over?C.bg4:urgent?C.redDim:C.greenDim, border:`1px solid ${over?C.border:urgent?C.redBorder:C.greenBorder}`, borderRadius:10, padding:'10px 16px' }}>
            <div style={{ fontFamily:font, fontSize:26, fontWeight:700, color: over?C.text3:urgent?C.red:C.green, animation: urgent&&!over?'pulse 1s infinite':'none', letterSpacing:'.05em' }}>
              {over ? 'CLOSED' : `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`}
            </div>
            <div style={{ fontSize:9, color:C.text3, fontFamily:font, letterSpacing:'.1em' }}>TIME REMAINING</div>
          </div>
        </div>
      </div>

      <div style={{ padding:'20px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
        {/* Left: bid form + stats */}
        <div>
          {detail.status === 'awarded' ? (
            <AwardedBanner winner={detail.winner} company={company} />
          ) : over ? (
            <div style={{ background:C.bg3, border:`1px solid ${C.border}`, borderRadius:10, padding:'20px', textAlign:'center' }}>
              <div style={{ fontSize:28, marginBottom:8 }}>🏁</div>
              <div style={{ fontFamily:font, fontSize:13, color:C.text2 }}>BIDDING CLOSED</div>
              <div style={{ fontSize:12, color:C.text3, marginTop:4 }}>Waiting for admin to award</div>
            </div>
          ) : (
            <div style={{ background:C.bg3, border:`1px solid ${C.border}`, borderRadius:12, padding:'20px' }}>
              <div style={{ fontFamily:font, fontSize:11, color:C.text2, marginBottom:14, letterSpacing:'.08em' }}>// PLACE YOUR BID</div>

              {lowest && (
                <div style={{ background:C.goldDim, border:`1px solid ${C.goldBorder}`, borderRadius:8, padding:'10px 14px', marginBottom:14, display:'flex', justifyContent:'space-between' }}>
                  <span style={{ fontSize:12, color:C.text2 }}>Current lowest</span>
                  <span style={{ fontFamily:font, fontSize:14, fontWeight:700, color:C.gold }}>{fmtEGP(lowest)}</span>
                </div>
              )}

              <div style={{ position:'relative', marginBottom:12 }}>
                <span style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', fontSize:13, color:C.text2, fontFamily:font }}>EGP</span>
                <input
                  type="number" value={amount}
                  onChange={e => { setAmount(e.target.value); setErr(''); setSuccess(''); }}
                  onKeyDown={e => e.key==='Enter' && placeBid()}
                  placeholder="0"
                  style={{
                    width:'100%', background:C.bg4, border:`2px solid ${err?C.redBorder:C.goldBorder}`,
                    borderRadius:10, padding:'14px 14px 14px 52px',
                    color:C.text, fontFamily:font, fontSize:22, fontWeight:700, outline:'none',
                  }}
                />
              </div>

              {err     && <div style={{ fontSize:11, color:C.red,   marginBottom:8 }}>⚠ {err}</div>}
              {success && <div style={{ fontSize:11, color:C.green, marginBottom:8 }}>✓ {success}</div>}

              <button onClick={placeBid} disabled={placing||over} style={{
                width:'100%', background: placing?C.bg4:C.gold, color:'#000',
                border:'none', borderRadius:10, padding:'14px',
                fontFamily:font, fontSize:13, fontWeight:700, cursor:'pointer',
                letterSpacing:'.05em', opacity: placing?0.6:1,
              }}>
                {placing ? 'PLACING BID…' : '⚡ SUBMIT BID'}
              </button>

              <div style={{ fontSize:10, color:C.text3, marginTop:10, lineHeight:1.6 }}>
                All companies are anonymous to each other.<br/>
                You can update your bid at any time before timer ends.<br/>
                Lowest bid when time ends wins the tender.
              </div>
            </div>
          )}

          {/* Trip details */}
          <div style={{ background:C.bg3, border:`1px solid ${C.border}`, borderRadius:10, padding:'14px', marginTop:14 }}>
            <div style={{ fontFamily:font, fontSize:10, color:C.text3, letterSpacing:'.1em', marginBottom:10 }}>TRIP DETAILS</div>
            <InfoRow label="Pickup"   value={detail.from_loc} />
            <InfoRow label="Drop-off" value={detail.to_loc} />
            <InfoRow label="Date"     value={fmtDate(detail.date)} />
            <InfoRow label="Time"     value={fmtTime(detail.pickup_time)} />
            <InfoRow label="Seats"    value={detail.total_seats} />
          </div>
        </div>

        {/* Right: live bid board */}
        <div>
          <div style={{ fontFamily:font, fontSize:11, color:C.text2, marginBottom:12, letterSpacing:'.08em', display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ width:8, height:8, borderRadius:'50%', background:C.green, display:'inline-block', animation:'pulse 1.5s infinite' }} />
            LIVE BID BOARD · {bids.length} bid{bids.length!==1?'s':''}
          </div>

          {bids.length === 0 && (
            <div style={{ textAlign:'center', padding:'32px 16px', color:C.text3, fontFamily:font, fontSize:12 }}>
              No bids yet<br/>Be the first to bid
            </div>
          )}

          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {bids.map((bid, i) => (
              <BidRow key={bid.id} bid={bid} rank={i+1} total={bids.length} />
            ))}
          </div>
        </div>
      </div>

      {/* Route Map + Stop Report (full width, below grid) */}
      {(detail.stops && detail.stops.length > 0) && (
        <div style={{ borderTop:`1px solid ${C.border}`, padding:'20px' }}>
          <div style={{ fontFamily:font, fontSize:11, color:C.text2, marginBottom:14, letterSpacing:'.08em' }}>
            🗺 ROUTE MAP · {detail.stops.length} stop{detail.stops.length!==1?'s':''}
          </div>
          <TenderRouteMap stops={detail.stops} fromLoc={detail.from_loc} toLoc={detail.to_loc} />
          <StopReport stops={detail.stops} />
        </div>
      )}
    </div>
  );
}

function BidRow({ bid, rank, total }) {
  const isLowest  = rank === 1;
  const isHighest = rank === total;
  return (
    <div style={{
      display:'flex', alignItems:'center', gap:12,
      background: isLowest ? C.goldDim : C.bg3,
      border:`1px solid ${isLowest ? C.goldBorder : C.border}`,
      borderRadius:8, padding:'10px 14px',
      animation:'bidFlash .6s ease',
    }}>
      <div style={{
        width:26, height:26, borderRadius:'50%',
        background: isLowest ? C.gold : C.bg4,
        color: isLowest ? '#000' : C.text2,
        display:'flex', alignItems:'center', justifyContent:'center',
        fontFamily:font, fontSize:11, fontWeight:700, flexShrink:0,
      }}>
        {rank === 1 ? '★' : rank}
      </div>
      <div style={{ flex:1 }}>
        <div style={{ fontSize:11, color:C.text3, fontFamily:font }}>Anonymous Company {String.fromCharCode(64 + rank)}</div>
      </div>
      <div style={{ fontFamily:font, fontSize:16, fontWeight:700, color: isLowest ? C.gold : isHighest ? C.red : C.text }}>
        {fmtEGP(bid.amount)}
      </div>
      {isLowest && <span style={{ fontSize:10, color:C.gold, fontFamily:font }}>LOWEST</span>}
    </div>
  );
}

function AwardedBanner({ winner, company }) {
  const didWin = winner && company && String(winner.company_id) === String(company.id);
  return (
    <div style={{
      background: didWin ? C.goldDim : C.bg3,
      border: `1px solid ${didWin ? C.goldBorder : C.border}`,
      borderRadius: 12, padding: '20px', textAlign: 'center',
    }}>
      <div style={{ fontSize: 36, marginBottom: 8 }}>{didWin ? '🏆' : '🏁'}</div>
      <div style={{ fontFamily: font, fontSize: 13, color: didWin ? C.gold : C.text2, fontWeight: 700 }}>
        {didWin ? 'YOU WON THIS TENDER!' : 'TENDER AWARDED'}
      </div>
      {winner && (
        <div style={{ fontSize: 12, color: C.text2, marginTop: 6 }}>
          Winning bid: {fmtEGP(winner.amount)}
        </div>
      )}
      {didWin && (
        <div style={{ marginTop: 12, fontSize: 12, color: C.green, background: C.greenDim, border: `1px solid ${C.greenBorder}`, borderRadius: 8, padding: '10px 14px' }}>
          ✓ Go to the <strong>🏆 Won</strong> tab to assign a driver &amp; vehicle.
        </div>
      )}
      {!didWin && winner && (
        <div style={{ fontSize: 11, color: C.text3, marginTop: 6, fontFamily: font }}>
          Another company won this bid.
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// FLEET TAB
// ────────────────────────────────────────────────────────────────────────────
function FleetTab({ token }) {
  const [drivers, setDrivers] = useState([]);
  const [cars,    setCars]    = useState([]);
  const [dForm,   setDForm]   = useState({ name:'', phone:'', license_number:'' });
  const [cForm,   setCForm]   = useState({ plate:'', model:'', capacity:'' });
  const [dErr,    setDErr]    = useState('');
  const [cErr,    setCErr]    = useState('');
  const [busy,    setBusy]    = useState(false);

  useEffect(() => {
    api.getCompanyDrivers(token).then(setDrivers).catch(() => {});
    api.getCompanyCars(token).then(setCars).catch(() => {});
  }, [token]);

  async function addDriver() {
    if (!dForm.name) { setDErr('Driver name required'); return; }
    setBusy(true);
    try {
      const d = await api.addCompanyDriver(dForm, token);
      setDrivers(prev => [...prev, d]);
      setDForm({ name:'', phone:'', license_number:'' });
      setDErr('');
    } catch(e) { setDErr(e.message); } finally { setBusy(false); }
  }

  async function delDriver(id) {
    await api.deleteCompanyDriver(id, token);
    setDrivers(prev => prev.filter(d => d.id !== id));
  }

  async function addCar() {
    if (!cForm.plate) { setCErr('Plate required'); return; }
    setBusy(true);
    try {
      const c = await api.addCompanyCar(cForm, token);
      setCars(prev => [...prev, c]);
      setCForm({ plate:'', model:'', capacity:'' });
      setCErr('');
    } catch(e) { setCErr(e.message); } finally { setBusy(false); }
  }

  async function delCar(id) {
    await api.deleteCompanyCar(id, token);
    setCars(prev => prev.filter(c => c.id !== id));
  }

  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:24 }}>
      {/* Drivers */}
      <div>
        <SectionHeader icon="👤" label="Drivers" count={drivers.length} />
        <div style={{ background:C.bg2, border:`1px solid ${C.border}`, borderRadius:14, overflow:'hidden' }}>
          <div style={{ padding:'16px', borderBottom:`1px solid ${C.border}` }}>
            <div style={{ fontFamily:font, fontSize:10, color:C.text3, letterSpacing:'.1em', marginBottom:10 }}>ADD DRIVER</div>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              <MiniInput placeholder="Full name *" value={dForm.name} onChange={v => setDForm({...dForm,name:v})} />
              <MiniInput placeholder="Phone" value={dForm.phone} onChange={v => setDForm({...dForm,phone:v})} />
              <MiniInput placeholder="License number" value={dForm.license_number} onChange={v => setDForm({...dForm,license_number:v})} />
            </div>
            {dErr && <div style={{ fontSize:11, color:C.red, marginTop:6 }}>⚠ {dErr}</div>}
            <button onClick={addDriver} disabled={busy} style={addBtnStyle}>+ Add Driver</button>
          </div>
          {drivers.map(d => (
            <div key={d.id} style={{ padding:'12px 16px', borderBottom:`1px solid ${C.border}`, display:'flex', alignItems:'center', gap:10, animation:'slideIn .2s ease' }}>
              <div style={{ width:34,height:34,borderRadius:'50%',background:C.bg4,display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,flexShrink:0 }}>👤</div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:600 }}>{d.name}</div>
                <div style={{ fontSize:11, color:C.text2 }}>{d.phone || '—'} · {d.license_number || 'No license'}</div>
              </div>
              <button onClick={() => delDriver(d.id)} style={delBtnStyle}>×</button>
            </div>
          ))}
          {drivers.length === 0 && <EmptyRow label="No drivers added yet" />}
        </div>
      </div>

      {/* Cars */}
      <div>
        <SectionHeader icon="🚌" label="Vehicles" count={cars.length} />
        <div style={{ background:C.bg2, border:`1px solid ${C.border}`, borderRadius:14, overflow:'hidden' }}>
          <div style={{ padding:'16px', borderBottom:`1px solid ${C.border}` }}>
            <div style={{ fontFamily:font, fontSize:10, color:C.text3, letterSpacing:'.1em', marginBottom:10 }}>ADD VEHICLE</div>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              <MiniInput placeholder="Plate number *" value={cForm.plate} onChange={v => setCForm({...cForm,plate:v})} />
              <MiniInput placeholder="Model (e.g. Mercedes Sprinter)" value={cForm.model} onChange={v => setCForm({...cForm,model:v})} />
              <MiniInput placeholder="Capacity (seats)" type="number" value={cForm.capacity} onChange={v => setCForm({...cForm,capacity:v})} />
            </div>
            {cErr && <div style={{ fontSize:11, color:C.red, marginTop:6 }}>⚠ {cErr}</div>}
            <button onClick={addCar} disabled={busy} style={addBtnStyle}>+ Add Vehicle</button>
          </div>
          {cars.map(c => (
            <div key={c.id} style={{ padding:'12px 16px', borderBottom:`1px solid ${C.border}`, display:'flex', alignItems:'center', gap:10, animation:'slideIn .2s ease' }}>
              <div style={{ width:34,height:34,borderRadius:'50%',background:C.bg4,display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,flexShrink:0 }}>🚌</div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:600, fontFamily:font }}>{c.plate}</div>
                <div style={{ fontSize:11, color:C.text2 }}>{c.model || '—'} · {c.capacity ? `${c.capacity} seats` : '—'}</div>
              </div>
              <button onClick={() => delCar(c.id)} style={delBtnStyle}>×</button>
            </div>
          ))}
          {cars.length === 0 && <EmptyRow label="No vehicles added yet" />}
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// WON TAB — Won tenders + weekly assignment + daily driver/car swap
// ────────────────────────────────────────────────────────────────────────────
function WonTab({ token, company }) {
  const [won,       setWon]       = useState([]);
  const [drivers,   setDrivers]   = useState([]);
  const [cars,      setCars]      = useState([]);
  const [expanded,  setExpanded]  = useState(null); // week_assignment_id currently open
  const [dailyData, setDailyData] = useState({});    // { [weekAssignmentId]: { week, daily: [] } }
  const [dayForms,  setDayForms]  = useState({});    // { [weekAssignmentId+date]: { driver_id, car_id } }
  const [saving,    setSaving]    = useState({});    // { [weekAssignmentId+date]: bool }
  const [saveMsg,   setSaveMsg]   = useState({});    // { [weekAssignmentId+date]: string }
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    Promise.all([
      api.getWonTenders(token).then(setWon),
      api.getCompanyDrivers(token).then(setDrivers),
      api.getCompanyCars(token).then(setCars),
    ]).finally(() => setLoading(false));
  }, [token]);

  async function expandWeek(waId) {
    if (expanded === waId) { setExpanded(null); return; }
    setExpanded(waId);
    if (!dailyData[waId]) {
      try {
        const data = await api.getDailyAssignments(waId, token);
        setDailyData(prev => ({ ...prev, [waId]: data }));
      } catch(e) { console.error(e); }
    }
  }

  async function saveDay(waId, date, wa) {
    const key = `${waId}_${date}`;
    const form = dayForms[key] || {};
    if (!form.driver_id || !form.car_id) {
      setSaveMsg(prev => ({ ...prev, [key]: '⚠ Select both driver and vehicle' }));
      return;
    }
    setSaving(prev => ({ ...prev, [key]: true }));
    setSaveMsg(prev => ({ ...prev, [key]: '' }));
    try {
      const res = await api.setDailyAssignment(waId, { driver_id: form.driver_id, car_id: form.car_id, assignment_date: date }, token);
      // Update local dailyData
      setDailyData(prev => {
        const existing = prev[waId] || { week: wa, daily: [] };
        const filtered = existing.daily.filter(d => d.assignment_date !== date);
        return {
          ...prev,
          [waId]: {
            ...existing,
            daily: [...filtered, {
              assignment_date: date,
              driver_name: res.driver_name,
              car_plate: res.car_plate,
              car_model: res.car_model,
            }].sort((a,b) => a.assignment_date < b.assignment_date ? -1 : 1)
          }
        };
      });
      setSaveMsg(prev => ({ ...prev, [key]: `✓ ${res.driver_name} / ${res.car_plate} saved` }));
      setTimeout(() => setSaveMsg(prev => ({ ...prev, [key]: '' })), 3000);
    } catch(e) {
      setSaveMsg(prev => ({ ...prev, [key]: `⚠ ${e.message}` }));
    } finally {
      setSaving(prev => ({ ...prev, [key]: false }));
    }
  }

  // Build an array of 7 dates for a week assignment
  function weekDates(wa) {
    const dates = [];
    const d = new Date(wa.week_start);
    for (let i = 0; i < 7; i++) {
      dates.push(d.toISOString().slice(0, 10));
      d.setDate(d.getDate() + 1);
    }
    return dates;
  }

  const today = new Date().toISOString().slice(0, 10);

  if (loading) return <LoadingState label="Loading won tenders…" />;

  return (
    <div>
      <SectionHeader icon="🏆" label="Won Tenders" count={won.length} />
      {won.length === 0 && <EmptyState icon="🏁" label="No won tenders yet" sub="Win a bid to see your assigned trips here." />}
      <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
        {won.map(t => {
          const waId = t.week_assignment_id;
          const isActive = t.week_active === 1 || t.week_active === true;
          const weekOver = t.week_end && t.week_end < today;
          const data = dailyData[waId];

          return (
            <div key={t.id} style={{
              background: C.bg2,
              border: `1px solid ${isActive ? C.goldBorder : weekOver ? C.border : C.greenBorder}`,
              borderRadius: 14, overflow: 'hidden',
            }}>
              {/* Header row */}
              <div style={{ padding:'16px 20px', display:'flex', alignItems:'center', gap:16 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontFamily:font, fontSize:10, color:C.gold, letterSpacing:'.08em', marginBottom:4 }}>
                    TENDER #{t.id} · WON
                    {isActive && <span style={{ marginLeft:8, color:C.green }}>● WEEK ACTIVE</span>}
                    {weekOver && <span style={{ marginLeft:8, color:C.text3 }}>✓ WEEK ENDED</span>}
                  </div>
                  <div style={{ fontSize:15, fontWeight:700 }}>{t.from_loc} → {t.to_loc}</div>
                  <div style={{ fontSize:12, color:C.text2, marginTop:2 }}>{fmtDate(t.date)} · {fmtTime(t.pickup_time)} · {t.total_seats} seats</div>
                  {waId && (
                    <div style={{ fontSize:11, color:C.text3, fontFamily:font, marginTop:4 }}>
                      Week: {t.week_start} → {t.week_end}
                    </div>
                  )}
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontFamily:font, fontSize:18, fontWeight:700, color:C.gold }}>{fmtEGP(t.awarded_amount)}</div>
                  <div style={{ fontSize:10, color:C.text3, fontFamily:font }}>winning bid</div>
                </div>
              </div>

              {/* Expand: daily schedule */}
              {waId && isActive && (
                <>
                  <div style={{ borderTop:`1px solid ${C.border}`, padding:'10px 20px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <span style={{ fontSize:12, color:C.text2 }}>
                      {isActive ? '📅 Manage daily driver & vehicle assignments' : 'View weekly schedule'}
                    </span>
                    <button onClick={() => expandWeek(waId)} style={{
                      background: C.goldDim, color: C.gold, border:`1px solid ${C.goldBorder}`,
                      borderRadius:8, padding:'7px 16px', cursor:'pointer', fontFamily:font, fontSize:12, fontWeight:600,
                    }}>
                      {expanded === waId ? '▲ Collapse' : '▼ Expand Week'}
                    </button>
                  </div>

                  {expanded === waId && (
                    <div style={{ borderTop:`1px solid ${C.border}`, padding:'20px', background:C.bg3 }}>
                      <div style={{ fontFamily:font, fontSize:10, color:C.text3, letterSpacing:'.1em', marginBottom:16 }}>
                        DAILY DRIVER & VEHICLE SCHEDULE — {t.week_start} TO {t.week_end}
                      </div>

                      {!data ? (
                        <div style={{ textAlign:'center', color:C.text3, fontFamily:font, fontSize:12 }}>Loading…</div>
                      ) : (
                        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                          {weekDates({ week_start: t.week_start, week_end: t.week_end }).map(date => {
                            const key = `${waId}_${date}`;
                            const existingDay = data.daily.find(d => d.assignment_date && d.assignment_date.slice(0,10) === date);
                            const form = dayForms[key] || { driver_id: existingDay?.driver_id || '', car_id: existingDay?.car_id || '' };
                            const isToday = date === today;
                            const isPast  = date < today;
                            const isFuture = date > today;

                            return (
                              <div key={date} style={{
                                background: isToday ? C.goldDim : C.bg4,
                                border:`1px solid ${isToday ? C.goldBorder : C.border}`,
                                borderRadius:10, padding:'12px 14px',
                              }}>
                                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom: existingDay ? 8 : 0 }}>
                                  <div style={{ minWidth:90, fontFamily:font, fontSize:11, fontWeight:700,
                                    color: isToday ? C.gold : isPast ? C.text3 : C.text }}>
                                    {isToday ? '▶ TODAY' : new Date(date+'T00:00:00').toLocaleDateString('en-GB',{weekday:'short',day:'2-digit',month:'short'})}
                                  </div>
                                  {existingDay?.driver_name ? (
                                    <div style={{ flex:1, fontSize:12 }}>
                                      <span style={{ color:C.green }}>✓</span>
                                      {' '}<strong>{existingDay.driver_name}</strong>
                                      {' · '}
                                      <span style={{ fontFamily:font }}>{existingDay.car_plate}</span>
                                      {existingDay.car_model ? ` (${existingDay.car_model})` : ''}
                                    </div>
                                  ) : (
                                    <div style={{ flex:1, fontSize:12, color: isToday ? C.red : C.text3 }}>
                                      {isToday ? '⚠ Not assigned yet' : isFuture ? '— Not set yet' : '— Unassigned'}
                                    </div>
                                  )}
                                </div>

                                {/* Assignment form — only for today and future */}
                                {!isPast && (
                                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr auto', gap:8, marginTop:8, alignItems:'center' }}>
                                    <select
                                      value={form.driver_id}
                                      onChange={e => setDayForms(prev => ({ ...prev, [key]: { ...(prev[key]||{}), driver_id: e.target.value }}))}
                                      style={selectStyle}
                                    >
                                      <option value="">Select driver…</option>
                                      {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                    </select>
                                    <select
                                      value={form.car_id}
                                      onChange={e => setDayForms(prev => ({ ...prev, [key]: { ...(prev[key]||{}), car_id: e.target.value }}))}
                                      style={selectStyle}
                                    >
                                      <option value="">Select vehicle…</option>
                                      {cars.map(c => <option key={c.id} value={c.id}>{c.plate}{c.model ? ` · ${c.model}` : ''}</option>)}
                                    </select>
                                    <button
                                      onClick={() => saveDay(waId, date, { week_start: t.week_start, week_end: t.week_end })}
                                      disabled={saving[key]}
                                      style={{
                                        background: saving[key] ? C.bg3 : C.goldDim,
                                        color: C.gold, border:`1px solid ${C.goldBorder}`,
                                        borderRadius:8, padding:'8px 14px', cursor:'pointer',
                                        fontFamily:font, fontSize:11, fontWeight:700, whiteSpace:'nowrap',
                                      }}
                                    >
                                      {saving[key] ? 'Saving…' : existingDay?.driver_name ? '↻ Update' : '✓ Set'}
                                    </button>
                                  </div>
                                )}
                                {saveMsg[key] && (
                                  <div style={{ fontSize:11, marginTop:6, color: saveMsg[key].startsWith('✓') ? C.green : C.red }}>
                                    {saveMsg[key]}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* Week ended notice */}
              {weekOver && (
                <div style={{ borderTop:`1px solid ${C.border}`, padding:'10px 20px', background:C.bg3 }}>
                  <span style={{ fontSize:12, color:C.text3, fontFamily:font }}>
                    ✓ Week ended {t.week_end}. Admin may re-open this trip for bidding.
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// PROFILE TAB
// ────────────────────────────────────────────────────────────────────────────
function ProfileTab({ company }) {
  return (
    <div style={{ maxWidth:480 }}>
      <SectionHeader icon="⚙" label="Company Profile" />
      <div style={{ background:C.bg2, border:`1px solid ${C.border}`, borderRadius:14, padding:'24px' }}>
        <div style={{ textAlign:'center', marginBottom:24 }}>
          <div style={{ width:72,height:72,borderRadius:'50%',background:C.bg3,border:`2px solid ${C.goldBorder}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:32,margin:'0 auto 12px' }}>🚌</div>
          <div style={{ fontSize:20, fontWeight:700 }}>{company.company_name}</div>
          <div style={{ fontSize:13, color:C.text2, marginTop:4, fontFamily:font }}>{company.fleet_number}</div>
        </div>
        <InfoRow label="Company ID" value={`#${company.id}`} />
        <InfoRow label="Fleet / Bus Number" value={company.fleet_number} />
        {company.phone && <InfoRow label="Contact Phone" value={company.phone} />}
        <div style={{ marginTop:16, fontSize:12, color:C.text3, fontFamily:font, textAlign:'center' }}>
          Contact admin to update company details
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// TENDER ROUTE MAP — shows stops on a Leaflet map for the bidding company
// ────────────────────────────────────────────────────────────────────────────
function TenderRouteMap({ stops, fromLoc, toLoc }) {
  const mapRef  = useRef(null);
  const mapInst = useRef(null);

  useEffect(() => {
    if (!mapRef.current || mapInst.current) return;
    if (!stops || stops.length === 0) return;

    // Filter valid stops
    const valid = stops.filter(s => s.lat != null && s.lng != null);
    if (valid.length === 0) return;

    const center = [parseFloat(valid[0].lat), parseFloat(valid[0].lng)];
    const map = L.map(mapRef.current, { center, zoom: 13, zoomControl: true });
    mapInst.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);

    const coords = [];
    valid.forEach((s, i) => {
      const lat = parseFloat(s.lat);
      const lng = parseFloat(s.lng);
      coords.push([lat, lng]);

      const isPickup  = s.type === 'pickup';
      const isFirst   = i === 0;
      const isLast    = i === valid.length - 1;
      const color     = isPickup ? '#34d399' : '#818cf8';
      const emoji     = isFirst ? '🟢' : isLast ? '🔴' : isPickup ? '🟢' : '🔵';

      const icon = L.divIcon({
        html: `<div style="width:20px;height:20px;border-radius:50%;background:${color};border:2.5px solid #fff;box-shadow:0 0 10px ${color}88;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#000">${i+1}</div>`,
        iconSize: [20, 20], iconAnchor: [10, 10], className: '',
      });

      const label = s.label || (isPickup ? 'Pickup' : 'Drop-off');
      L.marker([lat, lng], { icon })
        .addTo(map)
        .bindPopup(`<b>${emoji} Stop ${i+1}: ${label}</b><br/><span style="font-size:11px;color:#666">${isPickup ? '🟢 Pickup point' : '🔵 Drop-off point'}</span>`);
    });

    // Draw route line
    if (coords.length > 1) {
      L.polyline(coords, { color: '#f5c842', weight: 3, opacity: 0.8, dashArray: '8,5' }).addTo(map);
    }

    // Fit map to all stops
    if (coords.length > 1) {
      map.fitBounds(L.latLngBounds(coords), { padding: [24, 24] });
    }

    return () => {
      if (mapInst.current) { mapInst.current.remove(); mapInst.current = null; }
    };
  }, [stops]);

  return (
    <div
      ref={mapRef}
      style={{ width: '100%', height: 320, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden', marginBottom: 14 }}
    />
  );
}

// ── Stop text report ──────────────────────────────────────
function StopReport({ stops }) {
  if (!stops || stops.length === 0) return null;
  const pickups  = stops.filter(s => s.type === 'pickup');
  const dropoffs = stops.filter(s => s.type === 'dropoff');

  return (
    <div style={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ fontFamily: font, fontSize: 10, color: C.text3, letterSpacing: '.1em', marginBottom: 12 }}>STOP REPORT</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {/* Pickup column */}
        <div>
          <div style={{ fontFamily: font, fontSize: 10, color: C.green, letterSpacing: '.08em', marginBottom: 8 }}>
            🟢 PICKUP POINTS ({pickups.length})
          </div>
          {pickups.map((s, i) => (
            <div key={s.id || i} style={{ display: 'flex', gap: 10, marginBottom: 8, alignItems: 'flex-start' }}>
              <div style={{
                width: 20, height: 20, borderRadius: '50%', background: C.greenDim,
                border: `1.5px solid ${C.greenBorder}`, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: font, fontSize: 9, fontWeight: 700, color: C.green,
              }}>
                {stops.indexOf(s) + 1}
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>
                  {s.label || `Pickup ${i + 1}`}
                </div>
                <div style={{ fontSize: 10, color: C.text3, fontFamily: font, marginTop: 1 }}>
                  {s.lat && s.lng ? `${parseFloat(s.lat).toFixed(5)}, ${parseFloat(s.lng).toFixed(5)}` : 'No coordinates'}
                </div>
              </div>
            </div>
          ))}
          {pickups.length === 0 && <div style={{ fontSize: 11, color: C.text3, fontFamily: font }}>No pickup points</div>}
        </div>
        {/* Dropoff column */}
        <div>
          <div style={{ fontFamily: font, fontSize: 10, color: C.blue, letterSpacing: '.08em', marginBottom: 8 }}>
            🔵 DROP-OFF POINTS ({dropoffs.length})
          </div>
          {dropoffs.map((s, i) => (
            <div key={s.id || i} style={{ display: 'flex', gap: 10, marginBottom: 8, alignItems: 'flex-start' }}>
              <div style={{
                width: 20, height: 20, borderRadius: '50%', background: C.blueDim,
                border: `1.5px solid ${C.blueBorder}`, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: font, fontSize: 9, fontWeight: 700, color: C.blue,
              }}>
                {stops.indexOf(s) + 1}
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>
                  {s.label || `Drop-off ${i + 1}`}
                </div>
                <div style={{ fontSize: 10, color: C.text3, fontFamily: font, marginTop: 1 }}>
                  {s.lat && s.lng ? `${parseFloat(s.lat).toFixed(5)}, ${parseFloat(s.lng).toFixed(5)}` : 'No coordinates'}
                </div>
              </div>
            </div>
          ))}
          {dropoffs.length === 0 && <div style={{ fontSize: 11, color: C.text3, fontFamily: font }}>No drop-off points</div>}
        </div>
      </div>
      {/* Full ordered list */}
      <div style={{ marginTop: 12, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
        <div style={{ fontFamily: font, fontSize: 10, color: C.text3, letterSpacing: '.08em', marginBottom: 8 }}>FULL ROUTE ORDER</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {stops.map((s, i) => (
            <div key={s.id || i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
              <span style={{ fontFamily: font, fontSize: 10, color: C.text3, minWidth: 20 }}>#{i+1}</span>
              <span style={{ color: s.type === 'pickup' ? C.green : C.blue, fontSize: 11 }}>
                {s.type === 'pickup' ? '🟢' : '🔵'} {s.type === 'pickup' ? 'Pickup' : 'Drop-off'}
              </span>
              <span style={{ color: C.text, flex: 1 }}>{s.label || '—'}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// REUSABLE MICRO COMPONENTS
// ────────────────────────────────────────────────────────────────────────────
function SectionHeader({ icon, label, count }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
      <span style={{ fontSize:18 }}>{icon}</span>
      <span style={{ fontFamily:font, fontSize:14, fontWeight:700, letterSpacing:'.04em' }}>{label}</span>
      {count !== undefined && (
        <span style={{ background:C.goldDim, color:C.gold, border:`1px solid ${C.goldBorder}`, borderRadius:10, padding:'1px 8px', fontFamily:font, fontSize:11 }}>{count}</span>
      )}
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div style={{ flex:1 }}>
      <div style={{ fontSize:10, color:C.text3, fontFamily:font, letterSpacing:'.06em' }}>{label}</div>
      <div style={{ fontSize:13, fontWeight:700, color: accent ? C.gold : C.text, fontFamily: accent ? font : fontSans, marginTop:1 }}>{value}</div>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', padding:'7px 0', borderBottom:`1px solid ${C.border}` }}>
      <span style={{ fontSize:11, color:C.text3, fontFamily:font }}>{label}</span>
      <span style={{ fontSize:12, color:C.text }}>{value}</span>
    </div>
  );
}

function FieldInput({ label, value, onChange, type='text', placeholder, onEnter }) {
  return (
    <div>
      <label style={{ fontSize:10, color:C.text3, fontFamily:font, letterSpacing:'.1em', display:'block', marginBottom:5 }}>{label.toUpperCase()}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        onKeyDown={e => e.key==='Enter' && onEnter && onEnter()}
        placeholder={placeholder}
        style={{ width:'100%', background:C.bg4, border:`1px solid ${C.border}`, borderRadius:8, padding:'12px 14px', color:C.text, fontFamily:font, fontSize:13, outline:'none', boxSizing:'border-box' }}
      />
    </div>
  );
}

function MiniInput({ placeholder, value, onChange, type='text' }) {
  return (
    <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      style={{ width:'100%', background:C.bg4, border:`1px solid ${C.border}`, borderRadius:7, padding:'9px 12px', color:C.text, fontFamily:fontSans, fontSize:12, outline:'none', boxSizing:'border-box' }}
    />
  );
}

function LoadingState({ label }) {
  return (
    <div style={{ textAlign:'center', padding:'60px 20px', color:C.text3, fontFamily:font }}>
      <div style={{ fontSize:28, marginBottom:12, animation:'pulse 1s infinite' }}>⚡</div>
      {label}
    </div>
  );
}

function EmptyState({ icon, label, sub }) {
  return (
    <div style={{ textAlign:'center', padding:'48px 20px', color:C.text3 }}>
      <div style={{ fontSize:36, marginBottom:10 }}>{icon}</div>
      <div style={{ fontFamily:font, fontSize:13, marginBottom:6 }}>{label}</div>
      {sub && <div style={{ fontSize:11, color:C.text3, maxWidth:280, margin:'0 auto', lineHeight:1.6 }}>{sub}</div>}
    </div>
  );
}

function EmptyRow({ label }) {
  return (
    <div style={{ padding:'16px', textAlign:'center', fontSize:12, color:C.text3, fontFamily:font }}>{label}</div>
  );
}

const addBtnStyle = {
  width:'100%', marginTop:10, background:C.goldDim, color:C.gold,
  border:`1px solid ${C.goldBorder}`, borderRadius:8, padding:'10px',
  fontFamily:font, fontSize:12, fontWeight:700, cursor:'pointer', letterSpacing:'.05em',
};

const delBtnStyle = {
  background:'transparent', border:'none', color:C.red,
  cursor:'pointer', fontSize:18, lineHeight:1, padding:'2px 4px',
};

const selectStyle = {
  width:'100%', background:C.bg4, border:`1px solid ${C.border}`,
  borderRadius:8, padding:'10px 12px', color:C.text, fontFamily:fontSans,
  fontSize:13, outline:'none', cursor:'pointer',
};
