import React, { useState, useEffect, useRef } from 'react';
import { PlaceSearch as AreaSearch } from '../../components/LeafletSearch.jsx';
import { useAuth } from '../../App.jsx';
import * as api from '../../api.js';
import * as tenderApi from '../../api_tender.js';
import { C, WaslneyLogo, Tabs, Topbar, Badge, StatCard, DetailRow, CapBar, CapBarLabeled, Stars, Inp, Sel, btnPrimary, btnSm, btnDanger, card, fmtDate, Spinner, sectSt, Avatar } from '../../components/UI.jsx';
import { AdminMap, StopPicker } from '../../components/TripMap.jsx';
import socket_module, { connectSocket } from '../../socket.js';

// ── Full-screen photo lightbox ─────────────────────────────────────────────
function Lightbox({ src, label, onClose }) {
  if (!src) return null;
  return (
    <div
      onClick={onClose}
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.95)', zIndex:9999, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ position:'absolute', top:20, right:24, cursor:'pointer', color:'#fff', fontSize:28, lineHeight:1 }} onClick={onClose}>✕</div>
      <p style={{ color:'#888', fontSize:12, marginBottom:16, letterSpacing:'.08em', textTransform:'uppercase' }}>{label}</p>
      <img
        src={src}
        alt={label}git add Dockerfile

        style={{ maxWidth:'90vw', maxHeight:'80vh', objectFit:'contain', borderRadius:12, border:'1px solid #222' }}
        onClick={e => e.stopPropagation()}
      />
      <a href={src} target="_blank" rel="noreferrer"
        style={{ marginTop:16, color:'#fbbf24', fontSize:13, textDecoration:'none' }}
        onClick={e => e.stopPropagation()}>
        ↗ Open in new tab
      </a>
    </div>
  );
}

// ── Document thumbnail ─────────────────────────────────────────────────────
function DocThumb({ label, url, onView }) {
  const isImage = url && (url.startsWith('data:image') || url.startsWith('http') || url.match(/\.(jpg|jpeg|png|gif|webp)(\?|$)/i));
  return (
    <div>
      <div style={{ fontSize:11, color:C.text3, marginBottom:6 }}>{label}</div>
      {!url ? (
        <div style={{ background:C.bg3, border:`1px solid ${C.redBorder}`, borderRadius:8, padding:'14px 10px', textAlign:'center', fontSize:12, color:C.red }}>
          ⚠ Not uploaded
        </div>
      ) : isImage ? (
        <div style={{ position:'relative', cursor:'pointer' }} onClick={() => onView(url, label)}>
          <img src={url} alt={label}
            style={{ width:'100%', height:120, objectFit:'cover', borderRadius:8, border:`1px solid ${C.border}`, display:'block' }} />
          <div style={{ position:'absolute', inset:0, borderRadius:8, background:'rgba(0,0,0,0)', display:'flex', alignItems:'center', justifyContent:'center', transition:'background .15s' }}
            onMouseEnter={e => e.currentTarget.style.background='rgba(0,0,0,0.5)'}
            onMouseLeave={e => e.currentTarget.style.background='rgba(0,0,0,0)'}>
            <span style={{ color:'#fff', fontSize:22, opacity:0 }}
              onMouseEnter={e => { e.currentTarget.style.opacity=1; }}
              onMouseLeave={e => { e.currentTarget.style.opacity=0; }}>
              🔍
            </span>
          </div>
          <button onClick={() => onView(url, label)}
            style={{ marginTop:6, width:'100%', background:C.bg3, border:`1px solid ${C.border}`, borderRadius:6, padding:'5px', color:C.text2, fontSize:11, cursor:'pointer', fontFamily:"'Sora',sans-serif" }}>
            View full size
          </button>
        </div>
      ) : (
        <div style={{ background:C.bg3, border:`1px solid ${C.border}`, borderRadius:8, padding:'10px', fontSize:11, color:C.text2, wordBreak:'break-all' }}>
          <a href={url} target="_blank" rel="noreferrer" style={{ color:C.yellow||'#fbbf24' }}>↗ Open document</a>
        </div>
      )}
    </div>
  );
}

// ── TenderModal — offer an existing trip for tender bidding ───────────────────
function TenderModal({ trip, onClose, onSuccess }) {
  const [deadlineDate, setDeadlineDate] = useState('');
  const [deadlineTime, setDeadlineTime] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  async function handleSubmit() {
    if (!deadlineDate || !deadlineTime) { setErr('Please set both a date and time for the tender deadline.'); return; }
    const deadlineMs = new Date(`${deadlineDate}T${deadlineTime}`).getTime();
    if (deadlineMs <= Date.now()) { setErr('Deadline must be in the future.'); return; }
    const durationMinutes = Math.max(1, Math.round((deadlineMs - Date.now()) / 60000));
    setLoading(true);
    try {
      const token = localStorage.getItem('shuttle_token');
      await tenderApi.createTender({
        trip_id: trip.id,
        duration_minutes: durationMinutes,
        description: `${trip.from_loc} → ${trip.to_loc} on ${trip.date?.slice(0,10)}`
      }, token);
      onSuccess();
    } catch(e) { setErr(e.message || 'Failed to create tender'); }
    finally { setLoading(false); }
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', zIndex:9000, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}
         onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background:'#0c0c12', border:'1px solid #1a2a40', borderRadius:16, padding:28, width:'100%', maxWidth:420, fontFamily:"'Sora',sans-serif" }}>
        <div style={{ fontSize:18, fontWeight:700, color:'#e8e8f0', marginBottom:6 }}>🏢 Offer Trip for Tender</div>
        <div style={{ fontSize:12, color:'#8888aa', marginBottom:20 }}>
          Trip #{trip.id}: {trip.from_loc} → {trip.to_loc} · {trip.date?.slice(0,10)}
        </div>
        <div style={{ fontSize:12, color:'#4b7ab5', fontWeight:700, marginBottom:6, textTransform:'uppercase', letterSpacing:'.06em' }}>Bidding Deadline Date</div>
        <input
          type="date"
          value={deadlineDate}
          onChange={e => { setDeadlineDate(e.target.value); setErr(''); }}
          style={{ width:'100%', background:'#050508', border:'1px solid #2a2a40', borderRadius:8, padding:'10px 12px', color:'#e8e8f0', fontSize:14, marginBottom:12, boxSizing:'border-box' }}
        />
        <div style={{ fontSize:12, color:'#4b7ab5', fontWeight:700, marginBottom:6, textTransform:'uppercase', letterSpacing:'.06em' }}>Bidding Deadline Time</div>
        <input
          type="time"
          value={deadlineTime}
          onChange={e => { setDeadlineTime(e.target.value); setErr(''); }}
          style={{ width:'100%', background:'#050508', border:'1px solid #2a2a40', borderRadius:8, padding:'10px 12px', color:'#e8e8f0', fontSize:14, marginBottom:16, boxSizing:'border-box' }}
        />
        {err && <div style={{ fontSize:12, color:'#f87171', marginBottom:12 }}>{err}</div>}
        <div style={{ display:'flex', gap:10 }}>
          <button onClick={onClose} style={{ flex:1, background:'transparent', border:'1px solid #2a2a40', borderRadius:10, padding:'12px', color:'#8888aa', fontSize:13, cursor:'pointer', fontFamily:"'Sora',sans-serif" }}>
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={loading} style={{ flex:2, background:'#4b7ab5', border:'none', borderRadius:10, padding:'12px', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:"'Sora',sans-serif", opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Opening…' : '🏢 Open for Bidding'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminDash() {
  const { user, logout, notify } = useAuth();
  const [tab, setTab] = useState(() => sessionStorage.getItem('adm_tab') || 'overview');
  const goTab = (t) => { sessionStorage.setItem('adm_tab', t); setTab(t); setEditTrip(null); setViewDriver(null); };

  const [trips,   setTrips]   = useState([]);
  const [drivers, setDrivers] = useState([]); // active only — for dropdowns
  const [allDrivers, setAllDrivers] = useState([]); // all statuses — for Drivers tab
  const [users,   setUsers]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [editTrip, setEditTrip] = useState(null);
  const [stops,    setStops]   = useState([]);
  const [editStops, setEditStops] = useState([]);

  // ── Refs to StopPicker map instances so we can pan them directly ──────────
  const createMapRef = useRef(null); // ref passed to StopPicker in Create Trip
  const editMapRef   = useRef(null); // ref passed to StopPicker in Edit Trip

  // ── Review state ──────────────────────────────────────────────────────────
  const [pendingDrivers, setPendingDrivers] = useState([]);
  const [reviewLoading,  setReviewLoading]  = useState(false);
  const [expandedDriver, setExpandedDriver] = useState(null);
  const [rejectTarget,   setRejectTarget]   = useState(null);
  const [rejectNote,     setRejectNote]     = useState('');

  // ── Driver profile view ───────────────────────────────────────────────────
  const [viewDriver, setViewDriver] = useState(null); // full driver object

  // ── Lightbox ──────────────────────────────────────────────────────────────
  const [lightbox, setLightbox] = useState(null); // { src, label }

  // ── Tender target (offer existing trip for tender) ────────────────────────
  const [tenderTarget, setTenderTarget] = useState(null);

  const [form, setForm] = useState({
    from_loc:'', to_loc:'', pickup_time:'', dropoff_time:'', date:'', price:'', total_seats:16, driver_id:'',
    offer_tender: false, tender_deadline_date: '', tender_deadline_time: ''
  });
  const f = k => e => setForm({ ...form, [k]: e.target.value });

  useEffect(() => {
    loadAll();
    loadPendingDrivers();
    // Connect socket as admin for real-time updates
    connectSocket(user.id, 'admin');
    // Trip status changes (driver starts or completes trip)
    socket_module.on('trip:status:changed', ({ tripId, status }) => {
      setTrips(prev => prev.map(t => String(t.id) === String(tripId) ? { ...t, status } : t));
    });
    // Booking confirmed/cancelled (passenger books)
    socket_module.on('booking:updated', ({ tripId, bookedSeats }) => {
      if (bookedSeats !== undefined) {
        setTrips(prev => prev.map(t => String(t.id) === String(tripId) ? { ...t, booked_seats: Number(bookedSeats) } : t));
      }
    });
    return () => {
      socket_module.off('trip:status:changed');
      socket_module.off('booking:updated');
    };
  }, []);
  useEffect(() => { if (tab === 'review') loadPendingDrivers(); }, [tab]);
  useEffect(() => { if (tab === 'drivers') loadAllDrivers(); }, [tab]);

  async function loadAll() {
    setLoading(true);
    try {
      const [t, d, u] = await Promise.all([api.getTrips(), api.getDrivers(), api.getUsers()]);
      setTrips(t); setDrivers(d); setUsers(u);
    } catch(e) { notify('Error', e.message, 'error'); }
    finally { setLoading(false); }
  }

  async function loadAllDrivers() {
    try {
      const rows = await api.getAllDrivers();
      setAllDrivers(Array.isArray(rows) ? rows : []);
    } catch(e) { notify('Error', 'Could not load drivers', 'error'); }
  }

  async function loadPendingDrivers() {
    setReviewLoading(true);
    try {
      const data = await api.getPendingDrivers();
      setPendingDrivers(Array.isArray(data) ? data : (data.drivers || []));
    } catch(e) { notify('Error', 'Could not load pending drivers', 'error'); }
    finally { setReviewLoading(false); }
  }

  async function handleApprove(id) {
    try {
      await api.approveDriver(id);
      notify('Approved ✅', 'Driver account is now active.');
      setPendingDrivers(p => p.filter(d => d.id !== id));
      setExpandedDriver(null);
      loadAllDrivers();
    } catch(e) { notify('Error', e.message, 'error'); }
  }

  async function handleReject(id) {
    try {
      await api.rejectDriver(id, rejectNote);
      notify('Rejected ❌', 'Driver notified.');
      setPendingDrivers(p => p.filter(d => d.id !== id));
      setRejectTarget(null); setRejectNote(''); setExpandedDriver(null);
      loadAllDrivers();
    } catch(e) { notify('Error', e.message, 'error'); }
  }

  async function handleCreate() {
    const { from_loc, to_loc, pickup_time, date, price, driver_id, offer_tender, tender_deadline_date, tender_deadline_time } = form;
    // If offering as tender, driver is not required
    if (!from_loc||!to_loc||!pickup_time||!date||!price) {
      notify('Incomplete', 'Fill in all required fields.', 'error'); return;
    }
    if (stops.length < 2) {
      notify('Add stops', 'Add at least 1 pickup and 1 drop-off on the map.', 'error'); return;
    }
    if (offer_tender && (!tender_deadline_date || !tender_deadline_time)) {
      notify('Tender deadline required', 'Set a date and time for the tender deadline.', 'error'); return;
    }
    try {
      const tripData = { ...form, price: parseFloat(form.price), total_seats: parseInt(form.total_seats)||16, stops };
      if (offer_tender) tripData.driver_id = null; // no driver for tender trips
      const newTrip = await api.createTrip(tripData);
      if (offer_tender && newTrip && newTrip.id) {
        const deadlineMs = new Date(`${tender_deadline_date}T${tender_deadline_time}`).getTime();
        const durationMinutes = Math.max(1, Math.round((deadlineMs - Date.now()) / 60000));
        // Use the admin token from localStorage
        const token = localStorage.getItem('shuttle_token');
        await tenderApi.createTender({ trip_id: newTrip.id, duration_minutes: durationMinutes, description: `${from_loc} → ${to_loc} on ${date}` }, token);
        notify('Trip + Tender created!', `Bidding closes ${tender_deadline_date} at ${tender_deadline_time}`);
      } else {
        notify('Trip created!', `${from_loc} → ${to_loc} on ${date}`);
      }
      setForm({ from_loc:'', to_loc:'', pickup_time:'', dropoff_time:'', date:'', price:'', total_seats:16, driver_id:'', offer_tender:false, tender_deadline_date:'', tender_deadline_time:'' });
      setStops([]);
      loadAll(); goTab('trips');
    } catch(e) { notify('Error', e.message, 'error'); }
  }

  async function handleSaveEdit() {
    try {
      await api.updateTrip(editTrip.id, {
        from_loc: editTrip.from_loc, to_loc: editTrip.to_loc,
        pickup_time: editTrip.pickup_time, dropoff_time: editTrip.dropoff_time,
        date: editTrip.date, price: parseFloat(editTrip.price),
        driver_id: editTrip.driver_id, stops: editStops,
      });
      notify('Trip updated', 'Changes saved.');
      setEditTrip(null); setEditStops([]);
      loadAll();
    } catch(e) { notify('Error', e.message, 'error'); }
  }

  async function handleCancel(id) {
    try {
      await api.deleteTrip(id);
      notify('Trip cancelled', 'Passengers notified.');
      loadAll();
    } catch(e) { notify('Error', e.message, 'error'); }
  }

  async function handleDeletePermanent(id) {
    if (!window.confirm('Permanently delete this trip from the database? This cannot be undone.')) return;
    try {
      await api.deleteTripPermanent(id);
      notify('Trip deleted', 'Trip permanently removed from database.');
      loadAll();
    } catch(e) { notify('Error', e.message, 'error'); }
  }

  async function handleDeleteAllTrips() {
    if (!window.confirm(`⚠️ DELETE ALL TRIPS?\n\nThis will permanently remove ALL ${trips.length} trip(s) and their bookings from the database. This cannot be undone.\n\nType OK to confirm.`)) return;
    try {
      await api.deleteAllTrips();
      notify('All trips deleted', 'All trips have been permanently removed from the database.');
      loadAll();
    } catch(e) { notify('Error', e.message, 'error'); }
  }

  const activeCount  = trips.filter(t => t.status==='upcoming'||t.status==='active').length;
  const totalBooked  = trips.reduce((s,t) => s+(Number(t.booked_seats)||0), 0);
  const passengers   = users.filter(u => u.role==='passenger');
  const driverUsers  = drivers; // active only, for dropdowns

  // ── Status badge helper ───────────────────────────────────────────────────
  function statusBadge(s) {
    if (s === 'active')         return <Badge type="green">Active</Badge>;
    if (s === 'pending_review') return <Badge type="amber">Pending Review</Badge>;
    if (s === 'rejected')       return <Badge type="red">Rejected</Badge>;
    return <Badge type="amber">{s}</Badge>;
  }

  return (
    <div style={{ minHeight:'100vh', background:C.bg }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Lightbox */}
      {lightbox && <Lightbox src={lightbox.src} label={lightbox.label} onClose={() => setLightbox(null)} />}

      {/* Tender deadline modal */}
      {tenderTarget && (
        <TenderModal
          trip={tenderTarget}
          onClose={() => setTenderTarget(null)}
          onSuccess={() => { setTenderTarget(null); loadAll(); notify('Tender opened!', `Companies can now bid on trip #${tenderTarget.id}`); }}
        />
      )}

      <Topbar role="admin" name={user?.name || 'Admin'} onLogout={logout} />
      <div style={{ maxWidth:960, margin:'0 auto', padding:'28px 20px' }}>

        <Tabs tabs={[
          { id:'overview',       label:'Overview' },
          { id:'create',         label:'+ Trip' },
          { id:'trips',          label:'Trips' },
          { id:'tenders',        label:'🏢 Tenders' },
          { id:'drivers',        label:'Drivers' },
          { id:'passengers',     label:'Passengers' },
          { id:'review',         label:`📋 Review${pendingDrivers.length > 0 ? ` (${pendingDrivers.length})` : ''}` },
          { id:'create-account', label:'👤 New Account' },
        ]} active={tab} onSet={goTab} />

        {/* ── OVERVIEW ── */}
        {tab === 'overview' && (
          <div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:24 }}>
              <StatCard num={activeCount}                                               label="Active trips"   color={C.blue} />
              <StatCard num={totalBooked}                                               label="Seats booked"   color={C.green} />
              <StatCard num={allDrivers.filter(d=>d.account_status==='active').length || driverUsers.length} label="Active drivers"  color={C.purple} />
              <StatCard num={passengers.length}                                         label="Passengers"     color={C.amber} />
            </div>
            {pendingDrivers.length > 0 && (
              <div style={{ background:'rgba(251,191,36,0.06)', border:'1px solid rgba(251,191,36,0.2)', borderRadius:10, padding:'14px 18px', marginBottom:20, display:'flex', alignItems:'center', gap:12, cursor:'pointer' }}
                onClick={() => goTab('review')}>
                <span style={{ fontSize:20 }}>⏳</span>
                <span style={{ color:'#fbbf24', fontSize:13, fontWeight:600 }}>{pendingDrivers.length} driver{pendingDrivers.length!==1?'s':''} waiting for review</span>
                <span style={{ marginLeft:'auto', color:'#fbbf24', fontSize:12 }}>Review now →</span>
              </div>
            )}
            <p style={sectSt}>Live driver locations</p>
            <AdminMap height={340} />
            <p style={sectSt}>Recent trips</p>
            {loading && <Spinner />}
            {trips.slice(0,6).map(t => (
              <div key={t.id} style={{ ...card, marginBottom:10 }}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <Badge type={t.status==='completed'?'blue':t.status==='active'?'green':t.status==='cancelled'?'red':'amber'}>{t.status}</Badge>
                  <span style={{ fontWeight:400 }}>{t.from_loc} → {t.to_loc}</span>
                  <span style={{ marginLeft:'auto', fontSize:12, color:C.text2 }}>{Number(t.booked_seats)||0}/{t.total_seats} seats</span>
                </div>
                <CapBar booked={Number(t.booked_seats)||0} total={t.total_seats} />
              </div>
            ))}
          </div>
        )}

        {/* ── CREATE TRIP ── */}
        {tab === 'create' && (
          <div style={card}>
            <p style={sectSt}>New trip</p>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <AreaSearch label="📍 Pickup area"   placeholder="e.g. Nasr City…" icon="📍" value={form.from_loc?{name:form.from_loc}:null} onChange={c=>{ setForm({...form,from_loc:c?c.name:''}); if(c?.lat && createMapRef.current) createMapRef.current.panTo(c); }} />
              <AreaSearch label="🏁 Drop-off area" placeholder="e.g. Maadi…"     icon="🏁" value={form.to_loc?{name:form.to_loc}:null}   onChange={c=>{ setForm({...form,to_loc:c?c.name:''}); if(c?.lat && createMapRef.current) createMapRef.current.panTo(c); }} />
              <Inp label="📅 Date"             type="date"   value={form.date}         onChange={f('date')} />
              <Inp label="🕐 Pickup time"      type="time"   value={form.pickup_time}  onChange={f('pickup_time')} />
              <Inp label="🕐 Est. drop-off"    type="time"   value={form.dropoff_time} onChange={f('dropoff_time')} />
              <Inp label="💰 Price/seat (EGP)" type="number" value={form.price}        onChange={f('price')}       placeholder="45" />
              <Inp label="💺 Total seats"      type="number" value={form.total_seats}  onChange={f('total_seats')} />
            </div>
            {!form.offer_tender && (
              <Sel label="🚐 Assign driver (optional)" value={form.driver_id} onChange={f('driver_id')}>
                <option value="">Select active driver…</option>
                {driverUsers.map(d => <option key={d.id} value={d.id}>{d.name} — {d.plate}</option>)}
              </Sel>
            )}
            {/* ── Tender toggle ── */}
            <div style={{ marginTop:16, background:C.bg3||'#13131c', border:`1px solid ${form.offer_tender?'#4b7ab5':'#1e1e2e'}`, borderRadius:12, padding:'14px 16px' }}>
              <label style={{ display:'flex', alignItems:'center', gap:12, cursor:'pointer' }}>
                <input
                  type="checkbox"
                  checked={form.offer_tender}
                  onChange={e => setForm(p => ({ ...p, offer_tender: e.target.checked, driver_id: e.target.checked ? '' : p.driver_id }))}
                  style={{ width:18, height:18, accentColor:'#4b7ab5', cursor:'pointer' }}
                />
                <div>
                  <div style={{ fontSize:13, fontWeight:700, color: form.offer_tender ? '#4b7ab5' : C.text||'#e8e8f0' }}>
                    🏢 Offer for company tender (bidding)
                  </div>
                  <div style={{ fontSize:11, color:C.text2||'#8888aa', marginTop:2 }}>
                    Companies will bid for this trip — no driver needed now
                  </div>
                </div>
              </label>
              {form.offer_tender && (
                <div style={{ marginTop:14, display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                  <div>
                    <div style={{ fontSize:11, color:'#4b7ab5', fontWeight:700, marginBottom:6, textTransform:'uppercase', letterSpacing:'.06em' }}>Deadline Date</div>
                    <input
                      type="date"
                      value={form.tender_deadline_date}
                      onChange={e => setForm(p => ({ ...p, tender_deadline_date: e.target.value }))}
                      style={{ width:'100%', background:'#0c0c12', border:'1px solid #2a2a40', borderRadius:8, padding:'10px 12px', color:'#e8e8f0', fontSize:13 }}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize:11, color:'#4b7ab5', fontWeight:700, marginBottom:6, textTransform:'uppercase', letterSpacing:'.06em' }}>Deadline Time</div>
                    <input
                      type="time"
                      value={form.tender_deadline_time}
                      onChange={e => setForm(p => ({ ...p, tender_deadline_time: e.target.value }))}
                      style={{ width:'100%', background:'#0c0c12', border:'1px solid #2a2a40', borderRadius:8, padding:'10px 12px', color:'#e8e8f0', fontSize:13 }}
                    />
                  </div>
                </div>
              )}
            </div>
            <p style={{ ...sectSt, marginTop:20 }}>🗺️ Set pickup & drop-off points on map</p>
            <p style={{ fontSize:12, color:C.text3, marginBottom:12 }}>Click map to add pickup 🟢 and drop-off 🔵 points.</p>
            <StopPicker ref={createMapRef} stops={stops} onChange={setStops} height={340} />
            <button onClick={handleCreate} style={btnPrimary}>
              {form.offer_tender ? '🏢 Create trip & open for bidding' : 'Create trip'}
            </button>
          </div>
        )}

        {/* ── TRIPS ── */}
        {tab === 'trips' && !editTrip && (
          <div>
            <div style={{ display:"flex", alignItems:"center", marginBottom:16 }}>
              <p style={{ ...sectSt, marginBottom:0 }}>{trips.length} trips total</p>
              {trips.length > 0 && (
                <button
                  onClick={handleDeleteAllTrips}
                  style={{ ...btnDanger, marginLeft:"auto", fontSize:12, padding:"7px 14px", display:"flex", alignItems:"center", gap:6 }}
                >
                  🗑️ Delete All Trips
                </button>
              )}
            </div>
            {loading && <Spinner />}
            {trips.map(t => {
              const driver = driverUsers.find(d => d.id === t.driver_id);
              return (
                <div key={t.id} style={{ ...card, marginBottom:12 }}>
                  <div style={{ display:'flex', alignItems:'center', marginBottom:8 }}>
                    <Badge type={t.status==='completed'?'blue':t.status==='active'?'green':t.status==='cancelled'?'red':'amber'}>{t.status}</Badge>
                    <span style={{ marginLeft:'auto', fontSize:11, color:C.text3 }}>{fmtDate(t.date)} · {t.pickup_time}</span>
                  </div>
                  <div style={{ fontSize:16, fontWeight:400, marginBottom:4 }}>{t.from_loc} → {t.to_loc}</div>
                  <div style={{ fontSize:12, color:C.text2, marginBottom:6 }}>
                    Driver: {t.driver_name||driver?.name||'—'} · {t.driver_plate||driver?.plate||'—'} · {t.price} EGP/seat
                  </div>
                  <CapBarLabeled booked={Number(t.booked_seats)||0} total={t.total_seats} />
                  {t.status !== 'cancelled' && t.status !== 'completed' && (
                    <div style={{ display:'flex', gap:8, marginTop:12, flexWrap:'wrap' }}>
                      <button onClick={() => { setEditTrip({...t}); setEditStops(t.stops||[]); }} style={btnSm}>Edit</button>
                      {t.status === 'upcoming' && (
                        <button
                          onClick={() => setTenderTarget(t)}
                          style={{ ...btnSm, color:'#4b7ab5', borderColor:'#1a2a40' }}>
                          🏢 Offer Tender
                        </button>
                      )}
                      <button onClick={() => handleCancel(t.id)} style={btnDanger}>Cancel trip</button>
                    </div>
                  )}
                  <div style={{ display:'flex', gap:8, marginTop:8 }}>
                    <button onClick={() => handleDeletePermanent(t.id)} style={{ ...btnDanger, background:'rgba(239,68,68,0.18)', border:'1px solid rgba(239,68,68,0.4)' }}>🗑 Delete from DB</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── EDIT TRIP ── */}
        {tab === 'trips' && editTrip && (
          <div>
            <button onClick={() => { setEditTrip(null); setEditStops([]); }} style={{ ...btnSm, marginBottom:20 }}>← Cancel</button>
            <div style={card}>
              <p style={sectSt}>Edit trip #{editTrip.id}</p>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <AreaSearch label="📍 Pickup area"   icon="📍" value={editTrip.from_loc?{name:editTrip.from_loc}:null} onChange={c=>{ setEditTrip({...editTrip,from_loc:c?c.name:''}); if(c?.lat && editMapRef.current) editMapRef.current.panTo(c); }} />
                <AreaSearch label="🏁 Drop-off area" icon="🏁" value={editTrip.to_loc?{name:editTrip.to_loc}:null}   onChange={c=>{ setEditTrip({...editTrip,to_loc:c?c.name:''}); if(c?.lat && editMapRef.current) editMapRef.current.panTo(c); }} />
                <Inp label="Date"          type="date"   value={editTrip.date?.slice(0,10)}  onChange={e=>setEditTrip({...editTrip,date:e.target.value})} />
                <Inp label="Pickup time"   type="time"   value={editTrip.pickup_time}        onChange={e=>setEditTrip({...editTrip,pickup_time:e.target.value})} />
                <Inp label="Drop-off time" type="time"   value={editTrip.dropoff_time||''}   onChange={e=>setEditTrip({...editTrip,dropoff_time:e.target.value})} />
                <Inp label="Price (EGP)"   type="number" value={editTrip.price}              onChange={e=>setEditTrip({...editTrip,price:e.target.value})} />
              </div>
              <Sel label="Assign driver" value={editTrip.driver_id} onChange={e=>setEditTrip({...editTrip,driver_id:e.target.value})}>
                {driverUsers.map(d => <option key={d.id} value={d.id}>{d.name} — {d.plate}</option>)}
              </Sel>
              <p style={{ ...sectSt, marginTop:16 }}>🗺️ Edit stops</p>
              <StopPicker ref={editMapRef} stops={editStops} onChange={setEditStops} height={300} />
              <button onClick={handleSaveEdit} style={btnPrimary}>Save changes</button>
            </div>
          </div>
        )}

        {/* ── DRIVERS TAB ── */}
        {tab === 'drivers' && !viewDriver && (
          <div>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
              <p style={{ ...sectSt, margin:0 }}>{allDrivers.length} total drivers</p>
              <div style={{ display:'flex', gap:8, fontSize:12, color:C.text3 }}>
                <span>🟢 {allDrivers.filter(d=>d.account_status==='active').length} active</span>
                <span>🟡 {allDrivers.filter(d=>d.account_status==='pending_review').length} pending</span>
                <span>🔴 {allDrivers.filter(d=>d.account_status==='rejected').length} rejected</span>
              </div>
            </div>
            {allDrivers.length === 0 && <Spinner />}
            {allDrivers.map(d => (
              <div key={d.id} style={{ ...card, marginBottom:12, cursor:'pointer', transition:'border-color .15s', borderColor: d.account_status==='pending_review'?'rgba(251,191,36,0.25)': d.account_status==='rejected'?'rgba(248,113,113,0.2)':C.border }}
                onClick={() => setViewDriver(d)}>
                <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                  {/* Profile photo or avatar */}
                  {d.profile_photo ? (
                    <img src={d.profile_photo} alt={d.name}
                      style={{ width:48, height:48, borderRadius:'50%', objectFit:'cover', border:`2px solid ${d.account_status==='active'?'#4ade80':d.account_status==='pending_review'?'#fbbf24':'#f87171'}`, flexShrink:0 }} />
                  ) : (
                    <Avatar name={d.name} size={48}
                      color={d.account_status==='active'?C.green:d.account_status==='pending_review'?C.amber:C.red}
                      dim={d.account_status==='active'?C.greenDim:d.account_status==='pending_review'?C.amberDim:C.redDim}
                      border={d.account_status==='active'?C.greenBorder:d.account_status==='pending_review'?C.amberBorder:C.redBorder} />
                  )}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:600, fontSize:14 }}>{d.name}</div>
                    <div style={{ fontSize:12, color:C.text2, marginTop:2 }}>
                      {d.car} · <span style={{ fontFamily:'monospace' }}>{d.plate}</span>
                    </div>
                    <div style={{ fontSize:11, color:C.text3, marginTop:2 }}>
                      {d.phone} · Joined {fmtDate(d.created_at)}
                    </div>
                  </div>
                  <div style={{ textAlign:'right', flexShrink:0 }}>
                    {statusBadge(d.account_status)}
                    <div style={{ fontSize:12, color:C.amber, marginTop:6 }}>
                      ★ {parseFloat(d.avg_rating||0).toFixed(1)} <span style={{ color:C.text3 }}>({d.rating_count||0})</span>
                    </div>
                    <div style={{ fontSize:11, color:C.text3, marginTop:2 }}>
                      {d.completed_trips||0} trips done
                    </div>
                  </div>
                </div>
                <div style={{ marginTop:10, fontSize:11, color:C.text3 }}>
                  {d.car_license_photo ? '✅ Docs uploaded' : '⚠ No docs'} · Tap to view full profile →
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── DRIVER PROFILE VIEW ── */}
        {tab === 'drivers' && viewDriver && (
          <div>
            <button onClick={() => setViewDriver(null)} style={{ ...btnSm, marginBottom:20 }}>← Back to drivers</button>
            <div style={{ ...card, marginBottom:16 }}>
              {/* Header */}
              <div style={{ display:'flex', alignItems:'flex-start', gap:16, marginBottom:20 }}>
                {viewDriver.profile_photo ? (
                  <div style={{ cursor:'pointer', flexShrink:0 }} onClick={() => setLightbox({ src:viewDriver.profile_photo, label:'Profile Photo' })}>
                    <img src={viewDriver.profile_photo} alt={viewDriver.name}
                      style={{ width:80, height:80, borderRadius:'50%', objectFit:'cover', border:`3px solid ${viewDriver.account_status==='active'?'#4ade80':'#fbbf24'}` }} />
                    <div style={{ textAlign:'center', fontSize:10, color:C.text3, marginTop:4 }}>View photo</div>
                  </div>
                ) : (
                  <Avatar name={viewDriver.name} size={80} />
                )}
                <div style={{ flex:1 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6 }}>
                    <h2 style={{ fontSize:20, fontWeight:700, margin:0 }}>{viewDriver.name}</h2>
                    {statusBadge(viewDriver.account_status)}
                  </div>
                  <div style={{ fontSize:13, color:C.text2, marginBottom:4 }}>{viewDriver.phone}</div>
                  <div style={{ fontSize:13, color:C.text2, marginBottom:4 }}>
                    {viewDriver.car} · <span style={{ fontFamily:'monospace', color:C.text }}>{viewDriver.plate}</span>
                  </div>
                  <div style={{ fontSize:12, color:C.text3 }}>Joined {fmtDate(viewDriver.created_at)}</div>
                  {viewDriver.rejection_note && (
                    <div style={{ marginTop:10, background:'rgba(248,113,113,0.08)', border:'1px solid rgba(248,113,113,0.2)', borderRadius:8, padding:'8px 12px', fontSize:12, color:'#f87171' }}>
                      <b>Rejection reason:</b> {viewDriver.rejection_note}
                    </div>
                  )}
                </div>
              </div>

              {/* Stats */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:20, borderTop:`1px solid ${C.border}`, paddingTop:16 }}>
                <div style={{ textAlign:'center' }}>
                  <div style={{ fontSize:22, fontWeight:300, color:C.blue }}>{viewDriver.total_trips||0}</div>
                  <div style={{ fontSize:10, color:C.text3, textTransform:'uppercase', letterSpacing:'.06em' }}>Total trips</div>
                </div>
                <div style={{ textAlign:'center' }}>
                  <div style={{ fontSize:22, fontWeight:300, color:C.green }}>{viewDriver.completed_trips||0}</div>
                  <div style={{ fontSize:10, color:C.text3, textTransform:'uppercase', letterSpacing:'.06em' }}>Completed</div>
                </div>
                <div style={{ textAlign:'center' }}>
                  <div style={{ fontSize:22, fontWeight:300, color:C.amber }}>★ {parseFloat(viewDriver.avg_rating||0).toFixed(1)}</div>
                  <div style={{ fontSize:10, color:C.text3, textTransform:'uppercase', letterSpacing:'.06em' }}>Rating</div>
                </div>
                <div style={{ textAlign:'center' }}>
                  <div style={{ fontSize:22, fontWeight:300, color:C.text }}>{viewDriver.rating_count||0}</div>
                  <div style={{ fontSize:10, color:C.text3, textTransform:'uppercase', letterSpacing:'.06em' }}>Reviews</div>
                </div>
              </div>

              {/* Documents */}
              <p style={sectSt}>Documents</p>
              {viewDriver.submitted_at && (
                <p style={{ fontSize:12, color:C.text3, marginBottom:12 }}>
                  Submitted {fmtDate(viewDriver.submitted_at)}
                  {viewDriver.reviewed_at ? ` · Reviewed ${fmtDate(viewDriver.reviewed_at)}` : ''}
                </p>
              )}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14, marginBottom:20 }}>
                <DocThumb label="🚗 Car License"     url={viewDriver.car_license_photo}     onView={(s,l)=>setLightbox({src:s,label:l})} />
                <DocThumb label="🪪 Driver License"  url={viewDriver.driver_license_photo}  onView={(s,l)=>setLightbox({src:s,label:l})} />
                <DocThumb label="📄 Criminal Record" url={viewDriver.criminal_record_photo} onView={(s,l)=>setLightbox({src:s,label:l})} />
              </div>

              {/* Actions for pending drivers only */}
              {viewDriver.account_status === 'pending_review' && (
                <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:16 }}>
                  <p style={{ ...sectSt, marginBottom:12 }}>Review Actions</p>
                  {rejectTarget === viewDriver.id ? (
                    <div style={{ background:C.bg3, border:`1px solid ${C.redBorder}`, borderRadius:10, padding:16 }}>
                      <p style={{ fontSize:13, color:C.red, marginBottom:10, fontWeight:600 }}>Reason for rejection (optional)</p>
                      <textarea value={rejectNote} onChange={e=>setRejectNote(e.target.value)}
                        placeholder="e.g. Blurry photo, expired license…"
                        style={{ width:'100%', boxSizing:'border-box', background:C.bg4, border:`1px solid ${C.border}`, borderRadius:8, padding:'10px 12px', color:C.text, fontFamily:"'Sora',sans-serif", fontSize:13, resize:'none', height:72, outline:'none' }} />
                      <div style={{ display:'flex', gap:8, marginTop:10 }}>
                        <button onClick={()=>handleReject(viewDriver.id)} style={{ ...btnDanger, padding:'9px 22px' }}>Confirm Reject</button>
                        <button onClick={()=>{setRejectTarget(null);setRejectNote('');}} style={btnSm}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display:'flex', gap:10 }}>
                      <button onClick={()=>handleApprove(viewDriver.id)} style={{ ...btnPrimary, width:'auto', padding:'11px 32px' }}>✅ Approve Driver</button>
                      <button onClick={()=>setRejectTarget(viewDriver.id)} style={{ ...btnDanger, padding:'11px 28px' }}>❌ Reject</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── ADMIN TENDERS TAB ── */}
        {tab === 'tenders' && <AdminTendersTab token={localStorage.getItem('shuttle_token')} onAward={loadAll} notify={notify} />}

        {/* ── PASSENGERS ── */}
        {tab === 'passengers' && (
          <div>
            <p style={sectSt}>{passengers.length} registered passengers</p>
            {passengers.map(p => (
              <div key={p.id} style={{ ...card, marginBottom:10 }}>
                <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                  <Avatar name={p.name} color={C.blue} dim={C.blueDim} border={C.blueBorder} size={38} />
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:500, fontSize:14 }}>{p.name}</div>
                    <div style={{ fontSize:12, color:C.text2 }}>{p.phone}</div>
                  </div>
                  <div style={{ textAlign:'right', fontSize:12, color:C.text3 }}>Joined {fmtDate(p.created_at)}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── DRIVER REVIEW TAB ── */}
        {tab === 'review' && (
          <div>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
              <p style={{ ...sectSt, margin:0 }}>
                {pendingDrivers.length} driver{pendingDrivers.length!==1?'s':''} pending review
              </p>
              <button onClick={loadPendingDrivers} style={{ ...btnSm, fontSize:11 }}>↻ Refresh</button>
            </div>

            {reviewLoading && <Spinner />}

            {!reviewLoading && pendingDrivers.length === 0 && (
              <div style={{ ...card, textAlign:'center', padding:'48px 20px' }}>
                <div style={{ fontSize:40, marginBottom:12 }}>✅</div>
                <div style={{ fontWeight:500, marginBottom:6 }}>No drivers pending review</div>
                <p style={{ color:C.text3, fontSize:13 }}>All applications processed.</p>
              </div>
            )}

            {!reviewLoading && pendingDrivers.map(driver => (
              <div key={driver.id} style={{ ...card, marginBottom:16, border: expandedDriver===driver.id?`1px solid rgba(251,191,36,0.3)`:`1px solid ${C.border}` }}>

                {/* Collapsed header */}
                <div style={{ display:'flex', alignItems:'center', gap:12, cursor:'pointer' }}
                  onClick={() => setExpandedDriver(expandedDriver===driver.id?null:driver.id)}>
                  {driver.profile_photo ? (
                    <img src={driver.profile_photo} alt={driver.name}
                      style={{ width:48, height:48, borderRadius:'50%', objectFit:'cover', border:'2px solid #fbbf24', flexShrink:0 }} />
                  ) : (
                    <Avatar name={driver.name} size={48} />
                  )}
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:600, fontSize:15 }}>{driver.name}</div>
                    <div style={{ fontSize:12, color:C.text2, marginTop:2 }}>
                      {driver.phone} · {driver.car} · <span style={{ fontFamily:'monospace' }}>{driver.plate}</span>
                    </div>
                    <div style={{ fontSize:11, color:C.text3, marginTop:2 }}>
                      Submitted {fmtDate(driver.submitted_at||driver.created_at)}
                    </div>
                  </div>
                  <Badge type="amber">Pending</Badge>
                  <span style={{ color:C.text3, fontSize:12, marginLeft:8 }}>{expandedDriver===driver.id?'▲':'▼'}</span>
                </div>

                {/* Expanded */}
                {expandedDriver === driver.id && (
                  <div style={{ marginTop:20, borderTop:`1px solid ${C.border}`, paddingTop:20 }}>

                    {/* Profile photo large */}
                    {driver.profile_photo && (
                      <div style={{ marginBottom:20 }}>
                        <p style={sectSt}>Profile Photo</p>
                        <div style={{ display:'inline-block', cursor:'pointer' }}
                          onClick={() => setLightbox({ src:driver.profile_photo, label:'Profile Photo' })}>
                          <img src={driver.profile_photo} alt="Profile"
                            style={{ height:100, width:100, borderRadius:'50%', objectFit:'cover', border:'2px solid #fbbf24' }} />
                          <div style={{ textAlign:'center', fontSize:11, color:C.text3, marginTop:4 }}>Click to enlarge</div>
                        </div>
                      </div>
                    )}

                    <p style={sectSt}>Documents</p>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:20 }}>
                      <DocThumb label="🚗 Car License"     url={driver.car_license_photo}     onView={(s,l)=>setLightbox({src:s,label:l})} />
                      <DocThumb label="🪪 Driver License"  url={driver.driver_license_photo}  onView={(s,l)=>setLightbox({src:s,label:l})} />
                      <DocThumb label="📄 Criminal Record" url={driver.criminal_record_photo} onView={(s,l)=>setLightbox({src:s,label:l})} />
                    </div>

                    {/* Reject / Approve */}
                    {rejectTarget === driver.id ? (
                      <div style={{ background:C.bg3, border:`1px solid ${C.redBorder}`, borderRadius:10, padding:16 }}>
                        <p style={{ fontSize:13, color:C.red, marginBottom:10, fontWeight:600 }}>Reason for rejection (optional)</p>
                        <textarea value={rejectNote} onChange={e=>setRejectNote(e.target.value)}
                          placeholder="e.g. Blurry photo, expired license…"
                          style={{ width:'100%', boxSizing:'border-box', background:C.bg4, border:`1px solid ${C.border}`, borderRadius:8, padding:'10px 12px', color:C.text, fontFamily:"'Sora',sans-serif", fontSize:13, resize:'none', height:72, outline:'none' }} />
                        <div style={{ display:'flex', gap:8, marginTop:10 }}>
                          <button onClick={()=>handleReject(driver.id)} style={{ ...btnDanger, padding:'9px 22px' }}>Confirm Reject</button>
                          <button onClick={()=>{setRejectTarget(null);setRejectNote('');}} style={btnSm}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display:'flex', gap:10 }}>
                        <button onClick={()=>handleApprove(driver.id)} style={{ ...btnPrimary, width:'auto', padding:'11px 32px' }}>✅ Approve</button>
                        <button onClick={()=>setRejectTarget(driver.id)} style={{ ...btnDanger, padding:'11px 28px' }}>❌ Reject</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── CREATE ACCOUNT TAB ── */}
        {tab === 'create-account' && (
          <CreateAccountTab token={localStorage.getItem('shuttle_token')} notify={notify} />
        )}

      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// CREATE ACCOUNT TAB — admin creates any user type, no email verification
// ──────────────────────────────────────────────────────────────────────────────
function CreateAccountTab({ token, notify }) {
  const ROLES = ['passenger', 'driver', 'company', 'admin'];
  const empty = { name: '', phone: '', email: '', password: '', role: 'passenger', car: '', plate: '' };
  const [form,    setForm]    = React.useState(empty);
  const [loading, setLoading] = React.useState(false);
  const [showPw,  setShowPw]  = React.useState(false);
  const [created, setCreated] = React.useState(null);

  const f = k => e => setForm(p => ({ ...p, [k]: e.target.value }));

  async function handleCreate() {
    if (!form.name || !form.phone || !form.password || !form.role) {
      notify('Missing fields', 'Name, phone, password and role are required.', 'error');
      return;
    }
    if (form.role === 'driver' && (!form.car || !form.plate)) {
      notify('Missing fields', 'Car model and plate are required for drivers.', 'error');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/admin-create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create account');
      setCreated(data.user);
      setForm(empty);
      notify('Account created ✅', `${data.user.name} (${data.user.role}) is ready to log in.`);
    } catch (e) {
      notify('Error', e.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  const roleColor = { passenger: C.blue, driver: C.amber, company: C.purple, admin: C.red };
  const roleEmoji = { passenger: '🎫', driver: '🚐', company: '🏢', admin: '⚙️' };

  return (
    <div style={{ maxWidth: 480 }}>
      <p style={sectSt}>Create a new account — no email verification required</p>

      {/* Role selector */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: C.text3, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 10 }}>Account type</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {ROLES.map(r => (
            <button key={r} onClick={() => setForm(p => ({ ...p, role: r }))}
              style={{
                flex: 1, padding: '10px 6px', borderRadius: 10,
                border: `1.5px solid ${form.role === r ? (roleColor[r] || C.blue) : C.border}`,
                background: form.role === r ? `${roleColor[r] || C.blue}18` : C.bg2,
                color: form.role === r ? (roleColor[r] || C.blue) : C.text2,
                fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: "'Sora',sans-serif",
                textTransform: 'capitalize', transition: 'all .15s',
              }}>
              <div style={{ fontSize: 18, marginBottom: 4 }}>{roleEmoji[r] || '👤'}</div>
              {r}
            </button>
          ))}
        </div>
      </div>

      <Inp label="Full name"           value={form.name}     onChange={f('name')}  placeholder="Ahmed Hassan" />
      <Inp label="Phone number"        value={form.phone}    onChange={f('phone')} placeholder="+20 100 000 0000" />
      <Inp label="Email (optional)"    value={form.email}    onChange={f('email')} placeholder="user@example.com" type="email" />

      {/* Password with show/hide */}
      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 11, color: C.text3, letterSpacing: '.08em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Password</label>
        <div style={{ position: 'relative' }}>
          <input
            style={{ width: '100%', background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '13px 48px 13px 16px', color: '#fff', fontFamily: "'Sora',sans-serif", fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
            value={form.password} onChange={f('password')} placeholder="Set a password" type={showPw ? 'text' : 'password'}
          />
          <button type="button" onClick={() => setShowPw(p => !p)}
            style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: C.text3, fontSize: 18, padding: 0 }}>
            {showPw ? '🙈' : '👁️'}
          </button>
        </div>
      </div>

      {/* Driver-only extra fields */}
      {form.role === 'driver' && (
        <div style={{ background: `${C.amber}0a`, border: `1px solid ${C.amberBorder}`, borderRadius: 12, padding: '14px 16px', marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: C.amber, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 12 }}>Driver details</div>
          <Inp label="Car model"     value={form.car}   onChange={f('car')}   placeholder="Toyota Hiace 2022" />
          <Inp label="License plate" value={form.plate} onChange={f('plate')} placeholder="أ ب ج 1234" />
          <p style={{ fontSize: 11, color: C.text3, margin: '8px 0 0' }}>
            📋 Admin-created driver accounts are activated immediately — no review required.
          </p>
        </div>
      )}

      <button onClick={handleCreate} disabled={loading}
        style={{ ...btnPrimary, opacity: loading ? .6 : 1, marginTop: 4 }}>
        {loading ? 'Creating…' : `Create ${form.role} account →`}
      </button>

      {/* Success confirmation card */}
      {created && (
        <div style={{ marginTop: 20, background: '#0d190d', border: '1px solid rgba(74,222,128,0.25)', borderRadius: 12, padding: '14px 16px' }}>
          <div style={{ fontSize: 11, color: '#4ade80', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>✅ Account created</div>
          <div style={{ fontSize: 13, color: '#fff', fontWeight: 600 }}>{created.name}</div>
          <div style={{ fontSize: 12, color: C.text2, marginTop: 2 }}>{created.phone} · {created.role}</div>
          <div style={{ fontSize: 11, color: C.text3, marginTop: 4 }}>Status: {created.account_status}</div>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// ADMIN TENDERS TAB — live bids view with company names + contact info
// ──────────────────────────────────────────────────────────────────────────────
function AdminTendersTab({ token, onAward, notify }) {
  const font = "'IBM Plex Mono','Fira Code',monospace";
  const [tenders,  setTenders]  = React.useState([]);
  const [loading,  setLoading]  = React.useState(true);
  const [expanded, setExpanded] = React.useState(null);
  const [closing,  setClosing]  = React.useState(null);

  const load = React.useCallback(async () => {
    try {
      const data = await tenderApi.getAdminLiveBids(token);
      setTenders(Array.isArray(data) ? data : []);
    } catch(e) { /* silently fail */ }
    finally { setLoading(false); }
  }, [token]);

  React.useEffect(() => {
    load();
    const iv = setInterval(load, 15000);
    return () => clearInterval(iv);
  }, [load]);

  async function handleClose(tenderId) {
    setClosing(tenderId);
    try {
      const res = await tenderApi.closeTender(tenderId, token);
      notify('Tender awarded! 🏆', `${res.winner_company_name} won with ${Number(res.awarded_amount).toLocaleString('ar-EG')} EGP`);
      load();
      if (onAward) onAward();
    } catch(e) { notify('Error', e.message, 'error'); }
    finally { setClosing(null); }
  }

  async function handleReTender(tenderId) {
    try {
      await tenderApi.reTender(tenderId, {}, token);
      notify('Re-Tender opened! ⚡', 'The trip is now open for new bids.');
      load();
      if (onAward) onAward();
    } catch(e) { notify('Error', e.message, 'error'); }
  }

  const live    = tenders.filter(t => t.status === 'open');
  const awarded = tenders.filter(t => t.status === 'awarded');

  function fmtEGP(n)  { return `${Number(n).toLocaleString('ar-EG')} EGP`; }
  function fmtDate(d) { return d ? new Date(d).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '—'; }
  function fmtTime(t) { return t ? t.slice(0,5) : '—'; }

  if (loading) return <div style={{ textAlign:'center', padding:60, color:C.text3 }}>Loading tenders…</div>;

  return (
    <div>
      {/* Live section */}
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
        <span style={{ width:9, height:9, borderRadius:'50%', background:C.green, display:'inline-block', animation:'pulse 1.5s infinite' }} />
        <span style={{ fontWeight:700, fontSize:15 }}>Live Bids</span>
        <span style={{ background:'rgba(52,211,153,.12)', color:C.green, border:'1px solid rgba(52,211,153,.28)', borderRadius:10, padding:'1px 9px', fontSize:11 }}>{live.length}</span>
        <button onClick={load} style={{ marginLeft:'auto', background:'transparent', border:`1px solid ${C.border}`, borderRadius:7, padding:'5px 12px', color:C.text2, fontSize:11, cursor:'pointer', fontFamily:font }}>↻ Refresh</button>
      </div>

      {live.length === 0 && (
        <div style={{ textAlign:'center', padding:'36px 20px', color:C.text3, background:C.bg2, borderRadius:12, marginBottom:24 }}>
          <div style={{ fontSize:32, marginBottom:8 }}>🏁</div>
          No open tenders right now.
        </div>
      )}

      <div style={{ display:'flex', flexDirection:'column', gap:14, marginBottom:32 }}>
        {live.map(t => (
          <TenderAdminCard
            key={t.id} tender={t} expanded={expanded === t.id}
            onToggle={() => setExpanded(expanded === t.id ? null : t.id)}
            onClose={() => handleClose(t.id)} closing={closing === t.id}
            font={font} fmtEGP={fmtEGP} fmtDate={fmtDate} fmtTime={fmtTime}
          />
        ))}
      </div>

      {awarded.length > 0 && (
        <>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
            <span style={{ fontSize:18 }}>🏆</span>
            <span style={{ fontWeight:700, fontSize:15 }}>Awarded Tenders</span>
            <span style={{ background:'rgba(245,200,66,.10)', color:'#f5c842', border:'1px solid rgba(245,200,66,.28)', borderRadius:10, padding:'1px 9px', fontSize:11 }}>{awarded.length}</span>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {awarded.map(t => (
              <AwardedAdminCard key={t.id} tender={t} font={font} fmtEGP={fmtEGP} fmtDate={fmtDate} fmtTime={fmtTime} onReTender={handleReTender} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function TenderAdminCard({ tender, expanded, onToggle, onClose, closing, font, fmtEGP, fmtDate, fmtTime }) {
  const bids = tender.bids || [];
  const lowestBid = bids.length ? bids[0] : null;

  function BidCountdown({ endsAt }) {
    const [left, setLeft] = React.useState(Math.max(0, new Date(endsAt) - Date.now()));
    React.useEffect(() => {
      const iv = setInterval(() => setLeft(Math.max(0, new Date(endsAt) - Date.now())), 1000);
      return () => clearInterval(iv);
    }, [endsAt]);
    const h = Math.floor(left/3600000);
    const m = Math.floor((left%3600000)/60000);
    const s = Math.floor((left%60000)/1000);
    const urgent = left < 300000;
    const over   = left === 0;
    return (
      <span style={{ fontFamily:font, fontSize:13, fontWeight:700, color: over?C.text3:urgent?C.red:C.green }}>
        {over ? 'ENDED' : `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`}
      </span>
    );
  }

  return (
    <div style={{ background:C.bg2, border:`1px solid ${C.border}`, borderRadius:14, overflow:'hidden' }}>
      <div style={{ padding:'14px 18px', display:'flex', alignItems:'center', gap:14, cursor:'pointer' }} onClick={onToggle}>
        <div style={{ flex:1 }}>
          <div style={{ fontFamily:font, fontSize:10, color:C.green, letterSpacing:'.08em', marginBottom:3 }}>TENDER #{tender.id} · OPEN</div>
          <div style={{ fontSize:14, fontWeight:700 }}>{tender.from_loc} → {tender.to_loc}</div>
          <div style={{ fontSize:12, color:C.text2, marginTop:2 }}>{fmtDate(tender.date)} · {fmtTime(tender.pickup_time)} · {tender.total_seats} seats</div>
        </div>
        <div style={{ textAlign:'right' }}>
          <BidCountdown endsAt={tender.ends_at} />
          <div style={{ fontSize:10, color:C.text3, fontFamily:font, marginTop:2 }}>remaining</div>
        </div>
        <div style={{ textAlign:'center', background:'rgba(245,200,66,.08)', border:'1px solid rgba(245,200,66,.2)', borderRadius:8, padding:'6px 14px' }}>
          <div style={{ fontSize:20, fontWeight:700, color:'#f5c842', fontFamily:font }}>{bids.length}</div>
          <div style={{ fontSize:10, color:C.text3 }}>bids</div>
        </div>
        <div style={{ fontSize:14, color:C.text3 }}>{expanded ? '▲' : '▼'}</div>
      </div>

      {expanded && (
        <div style={{ borderTop:`1px solid ${C.border}` }}>
          {lowestBid && (
            <div style={{ padding:'10px 18px', background:'rgba(245,200,66,.06)', borderBottom:`1px solid rgba(245,200,66,.15)`, display:'flex', alignItems:'center', gap:14 }}>
              <span style={{ fontSize:16 }}>🏆</span>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:700 }}>{lowestBid.company_name}</div>
                <div style={{ fontSize:11, color:C.text2, marginTop:2, display:'flex', gap:14 }}>
                  <span>📞 <strong>{lowestBid.phone || '—'}</strong></span>
                  <span>🚌 {lowestBid.fleet_number || '—'}</span>
                </div>
              </div>
              <div>
                <div style={{ fontFamily:font, fontSize:17, fontWeight:700, color:'#f5c842' }}>{fmtEGP(lowestBid.amount)}</div>
                <div style={{ fontSize:9, color:'#f5c842', fontFamily:font, textAlign:'right' }}>LOWEST BID</div>
              </div>
            </div>
          )}

          <div style={{ padding:'0 18px 14px' }}>
            <div style={{ fontFamily:font, fontSize:10, color:C.text3, letterSpacing:'.08em', padding:'12px 0 8px' }}>ALL BIDS — COMPANY DETAILS</div>
            {bids.length === 0 && <div style={{ fontSize:12, color:C.text3, padding:'8px 0' }}>No bids placed yet.</div>}
            {bids.map((bid, i) => (
              <div key={bid.id} style={{
                display:'flex', alignItems:'center', gap:12, padding:'10px 0',
                borderBottom: i < bids.length-1 ? `1px solid ${C.border}` : 'none',
              }}>
                <div style={{
                  width:26, height:26, borderRadius:'50%',
                  background: i===0 ? '#f5c842' : C.bg3,
                  color: i===0 ? '#000' : C.text2,
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontFamily:font, fontSize:11, fontWeight:700, flexShrink:0,
                }}>
                  {i===0 ? '★' : i+1}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:600 }}>{bid.company_name}</div>
                  <div style={{ fontSize:11, color:C.text2, marginTop:2, display:'flex', gap:16 }}>
                    <span>📞 <strong style={{ color: bid.phone ? C.text : C.text3 }}>{bid.phone || 'No phone'}</strong></span>
                    <span>🚌 {bid.fleet_number || '—'}</span>
                  </div>
                </div>
                <div style={{ fontFamily:font, fontSize:15, fontWeight:700, color: i===0?'#f5c842':C.text }}>
                  {fmtEGP(bid.amount)}
                </div>
              </div>
            ))}
          </div>

          <div style={{ padding:'12px 18px', borderTop:`1px solid ${C.border}`, background:C.bg3, display:'flex', gap:10 }}>
            <button
              onClick={onClose} disabled={!!(closing || bids.length === 0)}
              style={{
                flex:1, background: bids.length && !closing ? '#f5c842' : C.bg4,
                color: bids.length && !closing ? '#000' : C.text3,
                border:'none', borderRadius:10, padding:'12px',
                fontFamily:font, fontSize:12, fontWeight:700,
                cursor: bids.length && !closing ? 'pointer':'not-allowed',
                letterSpacing:'.05em', opacity: closing ? 0.7 : 1,
              }}
            >
              {closing ? 'Awarding…' : bids.length === 0 ? 'No bids to award' : '🏆 Award to Lowest Bidder'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AwardedAdminCard({ tender, font, fmtEGP, fmtDate, fmtTime, onReTender }) {
  const bids = tender.bids || [];
  const [showBids,    setShowBids]    = React.useState(false);
  const [reTendering, setReTendering] = React.useState(false);

  const today     = new Date().toISOString().slice(0, 10);
  const weekEnd   = tender.week_end   || null;
  const weekStart = tender.week_start || null;
  const weekOver  = weekEnd && weekEnd < today;
  const weekActive = weekStart && weekEnd && weekStart <= today && weekEnd >= today;

  async function doReTender() {
    setReTendering(true);
    try { await onReTender(tender.id); }
    finally { setReTendering(false); }
  }

  return (
    <div style={{ background:C.bg2, border:`1px solid ${weekOver ? 'rgba(52,211,153,.28)' : 'rgba(245,200,66,.22)'}`, borderRadius:12, overflow:'hidden' }}>
      <div style={{ padding:'14px 18px', display:'flex', alignItems:'flex-start', gap:14 }}>
        <div style={{ flex:1 }}>
          <div style={{ fontFamily:font, fontSize:10, color:'#f5c842', letterSpacing:'.08em', marginBottom:3 }}>
            TENDER #{tender.id} · AWARDED
            {weekActive && <span style={{ marginLeft:8, color:'#34d399' }}>● WEEK ACTIVE</span>}
            {weekOver   && <span style={{ marginLeft:8, color:'#34d399' }}>✓ WEEK ENDED</span>}
          </div>
          <div style={{ fontSize:14, fontWeight:700 }}>{tender.from_loc} → {tender.to_loc}</div>
          <div style={{ fontSize:12, color:C.text2, marginTop:2 }}>{fmtDate(tender.date)} · {fmtTime(tender.pickup_time)}</div>
          {weekStart && weekEnd && (
            <div style={{ fontSize:11, color:C.text3, fontFamily:font, marginTop:4 }}>
              📅 Assignment week: {weekStart} → {weekEnd}
            </div>
          )}
        </div>
        <div style={{ textAlign:'right' }}>
          <div style={{ fontFamily:font, fontSize:17, fontWeight:700, color:'#f5c842' }}>{fmtEGP(tender.awarded_amount)}</div>
          <div style={{ fontSize:10, color:C.text3, fontFamily:font }}>awarded amount</div>
        </div>
      </div>

      {/* Winner banner */}
      <div style={{ margin:'0 18px 14px', background:'rgba(245,200,66,.07)', border:'1px solid rgba(245,200,66,.2)', borderRadius:10, padding:'12px 14px' }}>
        <div style={{ fontSize:10, color:'#f5c842', fontFamily:font, letterSpacing:'.08em', marginBottom:6 }}>WINNER</div>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <span style={{ fontSize:22 }}>🏆</span>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:14, fontWeight:700 }}>{tender.winner_company_name || '—'}</div>
            <div style={{ fontSize:12, marginTop:3, display:'flex', gap:14 }}>
              <span style={{ color: tender.winner_phone ? C.green : C.text3 }}>
                📞 {tender.winner_phone ? <strong>{tender.winner_phone}</strong> : <em>No phone on file</em>}
              </span>
              {tender.winner_fleet && <span style={{ color:C.text2 }}>🚌 {tender.winner_fleet}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Re-tender button — only shows after week ends */}
      {weekOver && (
        <div style={{ margin:'0 18px 14px', background:'rgba(52,211,153,.07)', border:'1px solid rgba(52,211,153,.28)', borderRadius:10, padding:'12px 14px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontSize:12, fontWeight:700, color:'#34d399' }}>📅 Week assignment has ended</div>
            <div style={{ fontSize:11, color:C.text3, marginTop:3 }}>You can now offer this trip for a new round of bidding.</div>
          </div>
          <button onClick={doReTender} disabled={reTendering} style={{
            background: reTendering ? C.bg3 : 'rgba(52,211,153,.15)', color:'#34d399',
            border:'1px solid rgba(52,211,153,.4)', borderRadius:8,
            padding:'9px 16px', cursor:'pointer', fontFamily:font, fontSize:12, fontWeight:700,
            whiteSpace:'nowrap', flexShrink:0,
          }}>
            {reTendering ? 'Opening…' : '⚡ Re-Tender'}
          </button>
        </div>
      )}

      {/* Show all bids toggle */}
      {bids.length > 0 && (
        <div style={{ borderTop:`1px solid ${C.border}` }}>
          <button onClick={() => setShowBids(s => !s)} style={{ width:'100%', background:'transparent', border:'none', padding:'10px 18px', color:C.text2, fontSize:12, cursor:'pointer', textAlign:'left', fontFamily:font }}>
            {showBids ? '▲ Hide' : '▼ Show'} all {bids.length} bids
          </button>
          {showBids && (
            <div style={{ padding:'0 18px 14px' }}>
              {bids.map((bid, i) => (
                <div key={bid.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'8px 0', borderBottom: i < bids.length-1 ? `1px solid ${C.border}` : 'none' }}>
                  <div style={{ width:22, height:22, borderRadius:'50%', background: i===0?'#f5c842':C.bg3, color: i===0?'#000':C.text2, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:font, fontSize:10, fontWeight:700, flexShrink:0 }}>
                    {i===0?'★':i+1}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:12, fontWeight:600 }}>{bid.company_name}</div>
                    <div style={{ fontSize:11, color:C.text2 }}>📞 {bid.phone || '—'} · 🚌 {bid.fleet_number || '—'}</div>
                  </div>
                  <div style={{ fontFamily:font, fontSize:13, fontWeight:700, color: i===0?'#f5c842':C.text }}>{fmtEGP(bid.amount)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
