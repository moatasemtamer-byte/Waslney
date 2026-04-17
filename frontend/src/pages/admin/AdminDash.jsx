import React, { useState, useEffect } from 'react';
import { PlaceSearch as AreaSearch } from '../../components/LeafletSearch.jsx';
import { useAuth } from '../../App.jsx';
import * as api from '../../api.js';
import { C, WaslneyLogo, Tabs, Topbar, Badge, StatCard, DetailRow, CapBar, CapBarLabeled, Stars, Inp, Sel, btnPrimary, btnSm, btnDanger, card, fmtDate, Spinner, sectSt, Avatar } from '../../components/UI.jsx';
import { AdminMap, StopPicker } from '../../components/TripMap.jsx';




export default function AdminDash() {
  const { user, logout, notify } = useAuth();
  const [tab,     setTab]     = useState(() => sessionStorage.getItem('adm_tab') || 'overview');
  const goTab = (t) => { sessionStorage.setItem('adm_tab', t); setTab(t); setEditTrip(null); };
  const [trips,   setTrips]   = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [users,   setUsers]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [editTrip, setEditTrip] = useState(null);
  const [stops,   setStops]   = useState([]);
  const [editStops, setEditStops] = useState([]);

  // Driver review state
  const [pendingDrivers, setPendingDrivers] = useState([]);
  const [reviewLoading,  setReviewLoading]  = useState(false);
  const [lightbox,       setLightbox]       = useState(null); // {url, label}
  const [rejectModal,    setRejectModal]    = useState(null); // {id, name}
  const [rejectNote,     setRejectNote]     = useState('');

  const [form, setForm] = useState({
    from_loc:'', to_loc:'', pickup_time:'', dropoff_time:'', date:'', price:'', total_seats:16, driver_id:''
  });
  const f = k => e => setForm({ ...form, [k]: e.target.value });

  useEffect(() => { loadAll(); loadPendingDrivers(); }, []);

  async function loadPendingDrivers() {
    try { setPendingDrivers(await api.getPendingDrivers()); } catch {}
  }

  async function handleReview(driverId, action, note='') {
    setReviewLoading(true);
    try {
      await api.reviewDriver(driverId, { action, rejection_note: note });
      notify(
        action==='approve' ? '✅ Driver approved!' : '❌ Driver rejected',
        action==='approve' ? 'They can now log in and start driving.' : 'Driver has been notified.'
      );
      setRejectModal(null); setRejectNote('');
      loadPendingDrivers();
    } catch(e) { notify('Error', e.message, 'error'); }
    finally { setReviewLoading(false); }
  }

  async function loadAll() {
    setLoading(true);
    try {
      const [t, d, u] = await Promise.all([api.getTrips(), api.getDrivers(), api.getUsers()]);
      setTrips(t); setDrivers(d); setUsers(u);
    } catch(e) { notify('Error', e.message, 'error'); }
    finally { setLoading(false); }
  }

  async function handleCreate() {
    const { from_loc, to_loc, pickup_time, date, price, driver_id } = form;
    if (!from_loc||!to_loc||!pickup_time||!date||!price||!driver_id) {
      notify('Incomplete', 'Fill in all required fields.', 'error'); return;
    }
    if (stops.length < 2) {
      notify('Add stops', 'Please add at least 1 pickup and 1 drop-off point on the map.', 'error'); return;
    }
    try {
      await api.createTrip({ ...form, price: parseFloat(form.price), total_seats: parseInt(form.total_seats)||16, stops });
      notify('Trip created!', `${from_loc} → ${to_loc} on ${date}`);
      setForm({ from_loc:'', to_loc:'', pickup_time:'', dropoff_time:'', date:'', price:'', total_seats:16, driver_id:'' });
      setStops([]);
      loadAll(); setTab('trips');
    } catch(e) { notify('Error', e.message, 'error'); }
  }

  async function handleSaveEdit() {
    try {
      await api.updateTrip(editTrip.id, {
        from_loc:     editTrip.from_loc,
        to_loc:       editTrip.to_loc,
        pickup_time:  editTrip.pickup_time,
        dropoff_time: editTrip.dropoff_time,
        date:         editTrip.date,
        price:        parseFloat(editTrip.price),
        driver_id:    editTrip.driver_id,
        stops:        editStops,
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

  const allTrips    = trips;
  const activeCount = trips.filter(t => t.status==='upcoming'||t.status==='active').length;
  const totalBooked = trips.reduce((s,t) => s+(t.booked_seats||0), 0);
  const passengers   = users.filter(u => u.role==='passenger');
  const driverUsers  = users.filter(u => u.role==='driver');
  const pendingCount = pendingDrivers.filter(d => d.account_status==='pending_review').length;

  return (
    <div style={{ minHeight:'100vh', background:C.bg }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <Topbar role="admin" name="Admin" onLogout={logout} />
      <div style={{ maxWidth:960, margin:'0 auto', padding:'28px 20px' }}>

        <Tabs tabs={[
          { id:'overview',   label:'Overview' },
          { id:'create',     label:'+ Create trip' },
          { id:'trips',      label:'Trips' },
          { id:'drivers',    label:'Drivers' },
          { id:'passengers', label:'Passengers' },
          { id:'reviews',    label: pendingCount > 0 ? `🔍 Reviews (${pendingCount})` : '🔍 Reviews' },
        ]} active={tab} onSet={goTab} />

        {/* ── OVERVIEW ── */}
        {tab === 'overview' && (
          <div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:24 }}>
              <StatCard num={activeCount}        label="Active trips"  color={C.blue} />
              <StatCard num={totalBooked}        label="Seats booked"  color={C.green} />
              <StatCard num={driverUsers.length} label="Drivers"       color={C.purple} />
              <StatCard num={passengers.length}  label="Passengers"    color={C.amber} />
            </div>

            {/* Pending reviews banner */}
            {pendingCount > 0 && (
              <div onClick={() => goTab('reviews')} style={{ background:'rgba(251,191,36,0.07)', border:'1px solid rgba(251,191,36,0.25)', borderRadius:14, padding:'14px 18px', marginBottom:20, display:'flex', alignItems:'center', gap:14, cursor:'pointer' }}>
                <div style={{ fontSize:32 }}>⏳</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:15, fontWeight:700, color:'#fbbf24' }}>
                    {pendingCount} driver account{pendingCount !== 1 ? 's' : ''} awaiting review
                  </div>
                  <div style={{ fontSize:12, color:'#888', marginTop:2 }}>Tap to review documents and approve or reject</div>
                </div>
                <div style={{ fontSize:20, color:'#fbbf24' }}>→</div>
              </div>
            )}

            <p style={sectSt}>Live driver locations</p>
            <AdminMap height={340} />
            <p style={sectSt}>All trips</p>
            {loading && <Spinner />}
            {allTrips.slice(0,6).map(t => (
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
          <div>
            <div style={card}>
              <p style={sectSt}>New trip</p>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <AreaSearch label="📍 Pickup area" placeholder="e.g. Nasr City…" icon="📍" value={form.from_loc ? {name:form.from_loc} : null} onChange={coord => setForm({...form, from_loc: coord ? coord.name : ''})} />
                <AreaSearch label="🏁 Drop-off area" placeholder="e.g. Maadi…" icon="🏁" value={form.to_loc ? {name:form.to_loc} : null} onChange={coord => setForm({...form, to_loc: coord ? coord.name : ''})} />
                <Inp label="📅 Date"              type="date" value={form.date}          onChange={f('date')} />
                <Inp label="🕐 Pickup time"       type="time" value={form.pickup_time}   onChange={f('pickup_time')} />
                <Inp label="🕐 Est. drop-off"     type="time" value={form.dropoff_time}  onChange={f('dropoff_time')} />
                <Inp label="💰 Price/seat (EGP)"  type="number" value={form.price}       onChange={f('price')} placeholder="45" />
                <Inp label="💺 Total seats"       type="number" value={form.total_seats} onChange={f('total_seats')} />
              </div>
              <Sel label="🚐 Assign driver" value={form.driver_id} onChange={f('driver_id')}>
                <option value="">Select driver…</option>
                {driverUsers.map(d => <option key={d.id} value={d.id}>{d.name} — {d.plate}</option>)}
              </Sel>

              <p style={{ ...sectSt, marginTop:20 }}>🗺️ Set pickup & drop-off points on map</p>
              <p style={{ fontSize:12, color:C.text3, marginBottom:12 }}>Click map to alternate between pickup 🟢 and drop-off 🔵 points. Add as many as needed.</p>
              <StopPicker stops={stops} onChange={setStops} height={340} />

              <button onClick={handleCreate} style={btnPrimary}>Create trip</button>
            </div>
          </div>
        )}

        {/* ── MANAGE TRIPS ── */}
        {tab === 'trips' && !editTrip && (
          <div>
            <p style={sectSt}>{allTrips.length} trips total</p>
            {loading && <Spinner />}
            {allTrips.map(t => {
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
                  {t.stops && t.stops.length > 0 && (
                    <div style={{ fontSize:11, color:C.text3, marginBottom:8 }}>
                      {t.stops.filter(s=>s.type==='pickup').length} pickup{t.stops.filter(s=>s.type==='pickup').length!==1?'s':''} · {t.stops.filter(s=>s.type==='dropoff').length} drop-off{t.stops.filter(s=>s.type==='dropoff').length!==1?'s':''}
                    </div>
                  )}
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
                <AreaSearch label="📍 Pickup area" placeholder="e.g. Nasr City…" icon="📍" value={editTrip.from_loc ? {name:editTrip.from_loc} : null} onChange={coord => setEditTrip({...editTrip, from_loc: coord ? coord.name : ''})} />
                <AreaSearch label="🏁 Drop-off area" placeholder="e.g. Maadi…" icon="🏁" value={editTrip.to_loc ? {name:editTrip.to_loc} : null} onChange={coord => setEditTrip({...editTrip, to_loc: coord ? coord.name : ''})} />
                <Inp label="Date" type="date" value={editTrip.date?.slice(0,10)} onChange={e => setEditTrip({...editTrip, date:e.target.value})} />
                <Inp label="Pickup time" type="time" value={editTrip.pickup_time} onChange={e => setEditTrip({...editTrip, pickup_time:e.target.value})} />
                <Inp label="Drop-off time" type="time" value={editTrip.dropoff_time||''} onChange={e => setEditTrip({...editTrip, dropoff_time:e.target.value})} />
                <Inp label="Price (EGP)" type="number" value={editTrip.price} onChange={e => setEditTrip({...editTrip, price:e.target.value})} />
              </div>
              <Sel label="Assign driver" value={editTrip.driver_id} onChange={e => setEditTrip({...editTrip, driver_id:e.target.value})}>
                {driverUsers.map(d => <option key={d.id} value={d.id}>{d.name} — {d.plate}</option>)}
              </Sel>
              <p style={{ ...sectSt, marginTop:16 }}>🗺️ Edit stops on map</p>
              <StopPicker stops={editStops} onChange={setEditStops} height={300} />
              <button onClick={handleSaveEdit} style={btnPrimary}>Save changes</button>
            </div>
          </div>
        )}

        {/* ── DRIVERS ── */}
        {tab === 'drivers' && (
          <div>
            <p style={sectSt}>{driverUsers.length} registered drivers</p>
            {driverUsers.map(d => (
              <div key={d.id} style={{ ...card, marginBottom:12 }}>
                <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12 }}>
                  <Avatar name={d.name} size={44} />
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:500 }}>{d.name}</div>
                    <div style={{ fontSize:12, color:C.text2 }}>{d.car} · <span style={{ fontFamily:'monospace' }}>{d.plate}</span></div>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ color:C.amber, fontSize:14 }}>{'★'.repeat(Math.round(d.avg_rating))}{'☆'.repeat(5-Math.round(d.avg_rating))} {parseFloat(d.avg_rating).toFixed(1)}</div>
                    <div style={{ fontSize:11, color:C.text3 }}>{d.rating_count} reviews</div>
                  </div>
                </div>
                <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:12, display:'flex', gap:20 }}>
                  <div><span style={{ fontSize:18, fontWeight:300, color:C.blue }}>{d.total_trips}</span><div style={{ fontSize:10, color:C.text3, textTransform:'uppercase', letterSpacing:'.06em' }}>Total</div></div>
                  <div><span style={{ fontSize:18, fontWeight:300, color:C.green }}>{d.completed_trips}</span><div style={{ fontSize:10, color:C.text3, textTransform:'uppercase', letterSpacing:'.06em' }}>Done</div></div>
                  <div style={{ marginLeft:'auto', display:'flex', alignItems:'center' }}><Badge type="green">Active</Badge></div>
                </div>
              </div>
            ))}
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

        {/* ── REVIEWS ── */}
        {tab === 'reviews' && (
          <div>
            <p style={sectSt}>
              {pendingDrivers.filter(d=>d.account_status==='pending_review').length} pending
              {pendingDrivers.filter(d=>d.account_status==='rejected').length > 0 &&
                ` · ${pendingDrivers.filter(d=>d.account_status==='rejected').length} rejected`}
            </p>

            {pendingDrivers.length === 0 && (
              <div style={{ textAlign:'center', padding:'60px 20px' }}>
                <div style={{ fontSize:48, marginBottom:12 }}>✅</div>
                <div style={{ fontSize:15, fontWeight:600, color:'#888' }}>All caught up! No accounts to review.</div>
              </div>
            )}

            {pendingDrivers.map(driver => (
              <div key={driver.id} style={{ ...card, marginBottom:16, border: driver.account_status==='pending_review' ? '1px solid rgba(251,191,36,0.2)' : '1px solid rgba(248,113,113,0.15)' }}>

                {/* Header row */}
                <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14 }}>
                  {driver.profile_photo
                    ? <img src={driver.profile_photo} alt="" onClick={()=>setLightbox({url:driver.profile_photo,label:'Profile Photo'})}
                        style={{ width:52, height:52, borderRadius:'50%', objectFit:'cover', border:'2px solid rgba(251,191,36,0.4)', cursor:'pointer', flexShrink:0 }} />
                    : <Avatar name={driver.name} size={52} />
                  }
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:700, fontSize:15, color:'#fff' }}>{driver.name}</div>
                    <div style={{ fontSize:12, color:C.text2, marginTop:1 }}>{driver.phone}</div>
                    <div style={{ fontSize:12, color:C.text3, marginTop:1 }}>{driver.car} · {driver.plate}</div>
                  </div>
                  <div style={{
                    fontSize:11, fontWeight:700, padding:'5px 12px', borderRadius:20, flexShrink:0,
                    color: driver.account_status==='pending_review' ? '#fbbf24' : '#f87171',
                    background: driver.account_status==='pending_review' ? 'rgba(251,191,36,0.1)' : 'rgba(248,113,113,0.1)',
                    border: `1px solid ${driver.account_status==='pending_review' ? 'rgba(251,191,36,0.3)' : 'rgba(248,113,113,0.3)'}`,
                  }}>
                    {driver.account_status==='pending_review' ? '⏳ Pending' : '❌ Rejected'}
                  </div>
                </div>

                <div style={{ fontSize:11, color:C.text3, marginBottom:14 }}>
                  Submitted {driver.submitted_at
                    ? new Date(driver.submitted_at).toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})
                    : fmtDate(driver.created_at)}
                </div>

                {/* Documents grid */}
                <div style={{ fontSize:11, color:C.text2, textTransform:'uppercase', letterSpacing:'.07em', marginBottom:10, fontWeight:700 }}>Documents</div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:16 }}>
                  {[
                    { key:'car_license_photo',     label:'رخصة العربية',  emoji:'🚗' },
                    { key:'driver_license_photo',  label:'رخصة السائق',   emoji:'🪪' },
                    { key:'criminal_record_photo', label:'الفيش الجنائي', emoji:'📋' },
                  ].map(({ key, label, emoji }) => (
                    <div key={key}
                      onClick={() => driver[key] && setLightbox({ url: driver[key], label })}
                      style={{
                        background:'#0d1117', borderRadius:12, padding:'10px 8px', textAlign:'center',
                        border: driver[key] ? '1px solid rgba(96,165,250,0.3)' : '1px solid #1a1a1a',
                        cursor: driver[key] ? 'pointer' : 'default',
                      }}>
                      {driver[key]
                        ? <img src={driver[key]} alt={label} style={{ width:'100%', aspectRatio:'4/3', objectFit:'cover', borderRadius:8, marginBottom:6 }} />
                        : <div style={{ fontSize:26, marginBottom:6, paddingTop:8 }}>{emoji}</div>
                      }
                      <div style={{ fontSize:10, color: driver[key] ? '#60a5fa' : C.text3, fontWeight:600, lineHeight:1.3 }}>{label}</div>
                      {driver[key] && <div style={{ fontSize:9, color:'#3b82f6', marginTop:2 }}>Tap to view</div>}
                    </div>
                  ))}
                </div>

                {/* Actions */}
                {driver.account_status === 'pending_review' && (
                  <div style={{ display:'flex', gap:10 }}>
                    <button onClick={() => handleReview(driver.id, 'approve')} disabled={reviewLoading}
                      style={{ flex:1, background:'linear-gradient(135deg,#16a34a,#22c55e)', color:'#fff', border:'none', borderRadius:12, padding:'13px', fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:"'Sora',sans-serif", opacity:reviewLoading?.6:1 }}>
                      ✅ Approve
                    </button>
                    <button onClick={() => { setRejectModal({ id: driver.id, name: driver.name }); setRejectNote(''); }} disabled={reviewLoading}
                      style={{ flex:1, background:'transparent', color:'#f87171', border:'1px solid rgba(248,113,113,0.35)', borderRadius:12, padding:'13px', fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:"'Sora',sans-serif" }}>
                      ❌ Reject
                    </button>
                  </div>
                )}
                {driver.account_status === 'rejected' && (
                  <button onClick={() => handleReview(driver.id, 'approve')} disabled={reviewLoading}
                    style={{ width:'100%', background:'rgba(34,197,94,0.08)', color:'#22c55e', border:'1px solid rgba(34,197,94,0.25)', borderRadius:12, padding:'12px', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:"'Sora',sans-serif" }}>
                    ↩️ Re-approve this driver
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

      </div>

      {/* ── DOCUMENT LIGHTBOX ── */}
      {lightbox && (
        <div onClick={() => setLightbox(null)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.93)', zIndex:1000, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:24 }}>
          <div style={{ fontSize:13, color:'#888', marginBottom:12 }}>{lightbox.label}</div>
          <img src={lightbox.url} alt={lightbox.label}
            style={{ maxWidth:'90vw', maxHeight:'76vh', borderRadius:16, objectFit:'contain', border:'1px solid #222' }}
            onClick={e => e.stopPropagation()}
          />
          <button onClick={() => setLightbox(null)}
            style={{ marginTop:20, background:'#1a1a1a', border:'1px solid #333', color:'#fff', borderRadius:24, padding:'10px 28px', fontSize:14, cursor:'pointer', fontFamily:"'Sora',sans-serif" }}>
            Close
          </button>
        </div>
      )}

      {/* ── REJECT MODAL ── */}
      {rejectModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', zIndex:900, display:'flex', flexDirection:'column', justifyContent:'flex-end' }}>
          <div style={{ background:'#0d1117', borderRadius:'24px 24px 0 0', padding:'28px 20px 44px', border:'1px solid rgba(248,113,113,0.2)' }}>
            <div style={{ fontSize:18, fontWeight:800, color:'#fff', marginBottom:4, fontFamily:"'Sora',sans-serif" }}>Reject driver?</div>
            <div style={{ fontSize:13, color:'#555', marginBottom:20 }}>{rejectModal.name} will be notified with your reason.</div>

            <div style={{ fontSize:12, color:'#4b7ab5', marginBottom:8, textTransform:'uppercase', letterSpacing:'.06em' }}>Quick reasons</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:14 }}>
              {['Documents unclear / blurry','Documents expired','Information mismatch','Vehicle not eligible','Incomplete submission','Other'].map(r => (
                <button key={r} onClick={() => setRejectNote(r)}
                  style={{ background:rejectNote===r?'rgba(248,113,113,0.15)':'#111', border:`1px solid ${rejectNote===r?'rgba(248,113,113,0.5)':'#222'}`, borderRadius:20, padding:'7px 14px', color:rejectNote===r?'#f87171':'#555', fontSize:12, cursor:'pointer', fontFamily:"'Sora',sans-serif" }}>
                  {r}
                </button>
              ))}
            </div>

            <div style={{ fontSize:12, color:'#4b7ab5', marginBottom:8, textTransform:'uppercase', letterSpacing:'.06em' }}>Custom message (optional)</div>
            <textarea value={rejectNote} onChange={e => setRejectNote(e.target.value)}
              placeholder="Add a specific reason for rejection…" rows={3}
              style={{ width:'100%', boxSizing:'border-box', background:'#111', border:'1px solid #2a2a2a', borderRadius:12, padding:'12px 14px', color:'#fff', fontFamily:"'Sora',sans-serif", fontSize:14, resize:'none', outline:'none', marginBottom:16 }}
            />

            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setRejectModal(null)}
                style={{ flex:1, background:'#111', border:'1px solid #222', color:'#888', borderRadius:12, padding:'14px', fontSize:14, cursor:'pointer', fontFamily:"'Sora',sans-serif" }}>
                Cancel
              </button>
              <button onClick={() => handleReview(rejectModal.id, 'reject', rejectNote)} disabled={reviewLoading}
                style={{ flex:2, background:'linear-gradient(135deg,#7f1d1d,#ef4444)', color:'#fff', border:'none', borderRadius:12, padding:'14px', fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:"'Sora',sans-serif", opacity:reviewLoading?.6:1 }}>
                {reviewLoading ? 'Rejecting…' : '❌ Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
