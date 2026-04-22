import React, { useState, useEffect } from 'react';
import { PlaceSearch as AreaSearch } from '../../components/LeafletSearch.jsx';
import { useAuth } from '../../App.jsx';
import * as api from '../../api.js';
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

  const [form, setForm] = useState({
    from_loc:'', to_loc:'', pickup_time:'', dropoff_time:'', date:'', price:'', total_seats:16, driver_id:''
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
        setTrips(prev => prev.map(t => String(t.id) === String(tripId) ? { ...t, booked_seats: bookedSeats } : t));
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
    const { from_loc, to_loc, pickup_time, date, price, driver_id } = form;
    if (!from_loc||!to_loc||!pickup_time||!date||!price||!driver_id) {
      notify('Incomplete', 'Fill in all required fields.', 'error'); return;
    }
    if (stops.length < 2) {
      notify('Add stops', 'Add at least 1 pickup and 1 drop-off on the map.', 'error'); return;
    }
    try {
      await api.createTrip({ ...form, price: parseFloat(form.price), total_seats: parseInt(form.total_seats)||16, stops });
      notify('Trip created!', `${from_loc} → ${to_loc} on ${date}`);
      setForm({ from_loc:'', to_loc:'', pickup_time:'', dropoff_time:'', date:'', price:'', total_seats:16, driver_id:'' });
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

  const activeCount  = trips.filter(t => t.status==='upcoming'||t.status==='active').length;
  const totalBooked  = trips.reduce((s,t) => s+(t.booked_seats||0), 0);
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

      <Topbar role="admin" name={user?.name || 'Admin'} onLogout={logout} />
      <div style={{ maxWidth:960, margin:'0 auto', padding:'28px 20px' }}>

        <Tabs tabs={[
          { id:'overview',   label:'Overview' },
          { id:'create',     label:'+ Trip' },
          { id:'trips',      label:'Trips' },
          { id:'drivers',    label:'Drivers' },
          { id:'passengers', label:'Passengers' },
          { id:'review',     label:`📋 Review${pendingDrivers.length > 0 ? ` (${pendingDrivers.length})` : ''}` },
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
                  <span style={{ marginLeft:'auto', fontSize:12, color:C.text2 }}>{t.booked_seats||0}/{t.total_seats} seats</span>
                </div>
                <CapBar booked={t.booked_seats||0} total={t.total_seats} />
              </div>
            ))}
          </div>
        )}

        {/* ── CREATE TRIP ── */}
        {tab === 'create' && (
          <div style={card}>
            <p style={sectSt}>New trip</p>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <AreaSearch label="📍 Pickup area"   placeholder="e.g. Nasr City…" icon="📍" value={form.from_loc?{name:form.from_loc}:null} onChange={c=>setForm({...form,from_loc:c?c.name:''})} />
              <AreaSearch label="🏁 Drop-off area" placeholder="e.g. Maadi…"     icon="🏁" value={form.to_loc?{name:form.to_loc}:null}   onChange={c=>setForm({...form,to_loc:c?c.name:''})} />
              <Inp label="📅 Date"             type="date"   value={form.date}         onChange={f('date')} />
              <Inp label="🕐 Pickup time"      type="time"   value={form.pickup_time}  onChange={f('pickup_time')} />
              <Inp label="🕐 Est. drop-off"    type="time"   value={form.dropoff_time} onChange={f('dropoff_time')} />
              <Inp label="💰 Price/seat (EGP)" type="number" value={form.price}        onChange={f('price')}       placeholder="45" />
              <Inp label="💺 Total seats"      type="number" value={form.total_seats}  onChange={f('total_seats')} />
            </div>
            <Sel label="🚐 Assign driver" value={form.driver_id} onChange={f('driver_id')}>
              <option value="">Select active driver…</option>
              {driverUsers.map(d => <option key={d.id} value={d.id}>{d.name} — {d.plate}</option>)}
            </Sel>
            <p style={{ ...sectSt, marginTop:20 }}>🗺️ Set pickup & drop-off points on map</p>
            <p style={{ fontSize:12, color:C.text3, marginBottom:12 }}>Click map to add pickup 🟢 and drop-off 🔵 points.</p>
            <StopPicker stops={stops} onChange={setStops} height={340} />
            <button onClick={handleCreate} style={btnPrimary}>Create trip</button>
          </div>
        )}

        {/* ── TRIPS ── */}
        {tab === 'trips' && !editTrip && (
          <div>
            <p style={sectSt}>{trips.length} trips total</p>
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
                  <CapBarLabeled booked={t.booked_seats||0} total={t.total_seats} />
                  {t.status !== 'cancelled' && t.status !== 'completed' && (
                    <div style={{ display:'flex', gap:8, marginTop:12 }}>
                      <button onClick={() => { setEditTrip({...t}); setEditStops(t.stops||[]); }} style={btnSm}>Edit</button>
                      <button onClick={() => handleCancel(t.id)} style={btnDanger}>Cancel trip</button>
                    </div>
                  )}
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
                <AreaSearch label="📍 Pickup area"   icon="📍" value={editTrip.from_loc?{name:editTrip.from_loc}:null} onChange={c=>setEditTrip({...editTrip,from_loc:c?c.name:''})} />
                <AreaSearch label="🏁 Drop-off area" icon="🏁" value={editTrip.to_loc?{name:editTrip.to_loc}:null}   onChange={c=>setEditTrip({...editTrip,to_loc:c?c.name:''})} />
                <Inp label="Date"          type="date"   value={editTrip.date?.slice(0,10)}  onChange={e=>setEditTrip({...editTrip,date:e.target.value})} />
                <Inp label="Pickup time"   type="time"   value={editTrip.pickup_time}        onChange={e=>setEditTrip({...editTrip,pickup_time:e.target.value})} />
                <Inp label="Drop-off time" type="time"   value={editTrip.dropoff_time||''}   onChange={e=>setEditTrip({...editTrip,dropoff_time:e.target.value})} />
                <Inp label="Price (EGP)"   type="number" value={editTrip.price}              onChange={e=>setEditTrip({...editTrip,price:e.target.value})} />
              </div>
              <Sel label="Assign driver" value={editTrip.driver_id} onChange={e=>setEditTrip({...editTrip,driver_id:e.target.value})}>
                {driverUsers.map(d => <option key={d.id} value={d.id}>{d.name} — {d.plate}</option>)}
              </Sel>
              <p style={{ ...sectSt, marginTop:16 }}>🗺️ Edit stops</p>
              <StopPicker stops={editStops} onChange={setEditStops} height={300} />
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

      </div>
    </div>
  );
}
