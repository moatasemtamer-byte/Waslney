import { useState, useEffect } from 'react';
import { useAuth } from '../../App.jsx';
import * as api from '../../api.js';
import { emitTripStarted, emitTripCompleted, emitCheckinUpdate } from '../../socket.js';
import { C, Tabs, Topbar, Badge, StatCard, DetailRow, CapBar, CapBarLabeled, Stars, btnPrimary, btnSm, btnDanger, card, fmtDate, Spinner, sectSt, Avatar } from '../../components/UI.jsx';
import TripMap from '../../components/TripMap.jsx';

export default function DriverDash() {
  const { user, logout, notify } = useAuth();
  const [tab,     setTab]     = useState('trips');
  const [trips,   setTrips]   = useState([]);
  const [selTrip, setSelTrip] = useState(null);
  const [tripDetail, setTripDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [ratings, setRatings] = useState({ ratings:[], average:null, count:0 });
  const [notifs,  setNotifs]  = useState([]);
  const [notifOpen, setNotifOpen] = useState(false);

  const unread = notifs.filter(n => !n.is_read).length;

  useEffect(() => { loadTrips(); loadRatings(); loadNotifs(); }, []);

  async function loadTrips() {
    setLoading(true);
    try { setTrips(await api.getDriverTrips()); } catch {}
    finally { setLoading(false); }
  }
  async function loadRatings() {
    try { setRatings(await api.getDriverRatings(user.id)); } catch {}
  }
  async function loadNotifs() {
    try { setNotifs(await api.getNotifications()); } catch {}
  }

  async function openTrip(trip) {
    setSelTrip(trip);
    try {
      const detail = await api.getTrip(trip.id);
      setTripDetail(detail);
    } catch(e) { notify('Error', e.message, 'error'); }
  }

  async function handleStart(tripId) {
    try {
      await api.startTrip(tripId);
      emitTripStarted(tripId);
      notify('Trip started!', 'Checklist is now active.');
      const detail = await api.getTrip(tripId);
      setTripDetail(detail);
      setTrips(ts => ts.map(t => t.id === tripId ? { ...t, status:'active' } : t));
    } catch(e) { notify('Error', e.message, 'error'); }
  }

  async function handleComplete(tripId) {
    try {
      await api.completeTrip(tripId);
      emitTripCompleted(tripId);
      notify('Trip completed!', 'All passengers notified.');
      setSelTrip(null); setTripDetail(null);
      loadTrips();
    } catch(e) { notify('Error', e.message, 'error'); }
  }

  async function handleCheckin(bookingId, status) {
    try {
      await api.updateCheckin(bookingId, status);
      if (selTrip) emitCheckinUpdate(selTrip.id, bookingId, status);
      // Refresh detail
      const detail = await api.getTrip(selTrip.id);
      setTripDetail(detail);
      const labels = { picked:'Picked up ✓', noshow:'Marked no-show', dropped:'Dropped off' };
      notify(labels[status] || 'Updated', '');
    } catch(e) { notify('Error', e.message, 'error'); }
  }

  async function openNotifs() {
    setNotifOpen(true);
    try { await api.markNotifRead(); setNotifs(n => n.map(x => ({ ...x, is_read:1 }))); } catch {}
  }

  const upcomingTrips = trips.filter(t => t.status === 'upcoming' || t.status === 'active');
  const historyTrips  = trips.filter(t => t.status === 'completed');

  return (
    <div style={{ minHeight:'100vh', background:C.bg }}>
      <Topbar role="driver" name={user.name} onLogout={logout} notifCount={unread} onNotif={openNotifs} />
      <div style={{ maxWidth:860, margin:'0 auto', padding:'28px 20px' }}>

        {notifOpen && (
          <div style={{ ...card, marginBottom:20 }}>
            <div style={{ display:'flex', alignItems:'center', marginBottom:12 }}>
              <span style={{ fontWeight:500 }}>Notifications</span>
              <button onClick={() => setNotifOpen(false)} style={{ ...btnSm, marginLeft:'auto' }}>✕</button>
            </div>
            {notifs.map(n => (
              <div key={n.id} style={{ padding:'10px 0', borderBottom:`1px solid ${C.border}`, fontSize:13, color: n.is_read ? C.text2 : C.text }}>
                {n.message} <span style={{ fontSize:11, color:C.text3, marginLeft:8 }}>{fmtDate(n.created_at)}</span>
              </div>
            ))}
          </div>
        )}

        <Tabs tabs={[{ id:'trips', label:'My trips' }, { id:'history', label:'History' }, { id:'profile', label:'Profile' }]}
          active={tab} onSet={t => { setTab(t); setSelTrip(null); setTripDetail(null); }} />

        {/* ── TRIPS TAB ── */}
        {tab === 'trips' && !selTrip && (
          <div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:22 }}>
              <StatCard num={upcomingTrips.length}  label="Upcoming"    color={C.blue} />
              <StatCard num={upcomingTrips.reduce((s,t)=>s+(t.booked_seats||0),0)} label="Seats booked" color={C.green} />
              <StatCard num={ratings.average ? parseFloat(ratings.average).toFixed(1) : '—'} label="Rating" color={C.amber} />
            </div>
            <p style={sectSt}>Upcoming & active trips</p>
            {loading && <Spinner />}
            {!loading && upcomingTrips.length === 0 && <p style={{ color:C.text2, fontSize:13 }}>No trips assigned yet.</p>}
            {upcomingTrips.map(t => (
              <div key={t.id} onClick={() => openTrip(t)}
                style={{ ...card, marginBottom:12, cursor:'pointer', transition:'all .15s' }}>
                <div style={{ display:'flex', alignItems:'center', marginBottom:8 }}>
                  <Badge type={t.status === 'active' ? 'green' : 'amber'}>{t.status}</Badge>
                  <span style={{ marginLeft:'auto', fontSize:11, color:C.text3 }}>{fmtDate(t.date)} · {t.pickup_time}</span>
                </div>
                <div style={{ fontSize:16, fontWeight:400, marginBottom:8 }}>{t.from_loc} → {t.to_loc}</div>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, color:C.text2 }}>
                  <span>{t.booked_seats || 0}/{t.total_seats} seats · {t.price} EGP/seat</span>
                  <span style={{ color:C.green, fontSize:12 }}>Tap to manage →</span>
                </div>
                <CapBar booked={t.booked_seats || 0} total={t.total_seats} />
              </div>
            ))}
          </div>
        )}

        {/* ── TRIP DETAIL + MAP + CHECKLIST ── */}
        {tab === 'trips' && selTrip && (
          <div>
            <button onClick={() => { setSelTrip(null); setTripDetail(null); }} style={{ ...btnSm, marginBottom:20 }}>← Back</button>
            <h2 style={{ fontSize:20, fontWeight:400, marginBottom:4 }}>{selTrip.from_loc} → {selTrip.to_loc}</h2>
            <p style={{ color:C.text2, fontSize:13, marginBottom:20 }}>{fmtDate(selTrip.date)} · {selTrip.pickup_time}</p>

            {/* LIVE MAP — driver mode with Share button */}
            <TripMap
              tripId={selTrip.id}
              pickupLat={selTrip.pickup_lat}   pickupLng={selTrip.pickup_lng}
              dropoffLat={selTrip.dropoff_lat} dropoffLng={selTrip.dropoff_lng}
              isDriver={true}
              height={260}
            />

            {!tripDetail && <Spinner />}
            {tripDetail && (
              <>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:20 }}>
                  <StatCard num={tripDetail.bookings?.length || 0}                                                          label="Booked"   color={C.blue} />
                  <StatCard num={tripDetail.bookings?.filter(b=>b.checkin_status==='picked').length  || 0}                  label="Picked"   color={C.green} />
                  <StatCard num={tripDetail.bookings?.filter(b=>b.checkin_status==='noshow').length  || 0}                  label="No-show"  color={C.red} />
                  <StatCard num={tripDetail.bookings?.filter(b=>b.checkin_status==='dropped').length || 0}                  label="Dropped"  color={C.amber} />
                </div>

                {selTrip.status === 'upcoming' && (
                  <button onClick={() => handleStart(selTrip.id)} style={{ ...btnPrimary, marginBottom:20 }}>
                    🚦 Start trip
                  </button>
                )}
                {selTrip.status === 'active' && (
                  <button onClick={() => handleComplete(selTrip.id)}
                    style={{ ...btnPrimary, background:C.amber, color:'#000', marginBottom:20 }}>
                    ✅ Complete trip
                  </button>
                )}

                <p style={sectSt}>Passenger checklist</p>
                {(!tripDetail.bookings || tripDetail.bookings.length === 0) && (
                  <p style={{ color:C.text2, fontSize:13 }}>No passengers yet.</p>
                )}
                {tripDetail.bookings?.map(b => {
                  const st = b.checkin_status || 'pending';
                  const rowBg = st==='picked'?C.greenDim : st==='noshow'?C.redDim : st==='dropped'?C.blueDim : 'transparent';
                  return (
                    <div key={b.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'13px 16px', background:rowBg, borderRadius:8, marginBottom:8, border:`1px solid ${C.border}`, transition:'background .2s' }}>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:14, fontWeight:500 }}>{b.passenger_name}</div>
                        <div style={{ fontSize:12, color:C.text2 }}>{b.seats} seat{b.seats>1?'s':''} · {b.pickup_note || '—'}</div>
                        <div style={{ marginTop:6 }}>
                          {st==='pending' && <Badge type="amber">Pending</Badge>}
                          {st==='picked'  && <Badge type="green">Picked up</Badge>}
                          {st==='noshow'  && <Badge type="red">No-show</Badge>}
                          {st==='dropped' && <Badge type="blue">Dropped off</Badge>}
                        </div>
                      </div>
                      {selTrip.status === 'active' && st === 'pending' && (
                        <div style={{ display:'flex', gap:6 }}>
                          <button onClick={() => handleCheckin(b.id, 'picked')}
                            style={{ width:36, height:36, borderRadius:6, border:`1px solid ${C.greenBorder}`, background:'transparent', color:C.green, fontSize:16, cursor:'pointer' }}>✓</button>
                          <button onClick={() => handleCheckin(b.id, 'noshow')}
                            style={{ width:36, height:36, borderRadius:6, border:`1px solid ${C.redBorder}`, background:'transparent', color:C.red, fontSize:16, cursor:'pointer' }}>✗</button>
                        </div>
                      )}
                      {selTrip.status === 'active' && st === 'picked' && (
                        <button onClick={() => handleCheckin(b.id, 'dropped')}
                          style={{ ...btnSm, color:C.blue, borderColor:C.blueBorder, whiteSpace:'nowrap' }}>Drop off</button>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}

        {/* ── HISTORY TAB ── */}
        {tab === 'history' && (
          <div>
            {historyTrips.length === 0 && <p style={{ color:C.text2, fontSize:13 }}>No completed trips yet.</p>}
            {historyTrips.map(t => (
              <div key={t.id} style={{ ...card, marginBottom:12 }}>
                <div style={{ display:'flex', alignItems:'center', marginBottom:8 }}>
                  <Badge type="blue">Completed</Badge>
                  <span style={{ marginLeft:'auto', fontSize:11, color:C.text3 }}>{fmtDate(t.date)} · {t.pickup_time}</span>
                </div>
                <div style={{ fontFamily:'monospace', marginBottom:4 }}>{t.from_loc} → {t.to_loc}</div>
                <div style={{ fontSize:12, color:C.text2 }}>{t.booked_seats || 0} passengers</div>
              </div>
            ))}
          </div>
        )}

        {/* ── PROFILE TAB ── */}
        {tab === 'profile' && (
          <div>
            <div style={{ ...card, textAlign:'center', padding:28, marginBottom:16 }}>
              <Avatar name={user.name} size={64} />
              <div style={{ fontSize:18, fontWeight:500, marginTop:14, marginBottom:6 }}>{user.name}</div>
              <div style={{ fontSize:12, color:C.text2, marginBottom:10 }}>Driver since {fmtDate(user.created_at)}</div>
              <Stars n={parseFloat(ratings.average) || 0} />
              <span style={{ color:C.amber, marginLeft:8, fontSize:14 }}>{ratings.average || '—'}</span>
            </div>
            <div style={{ ...card, marginBottom:16 }}>
              <p style={sectSt}>Vehicle</p>
              <DetailRow label="Car model"     val={user.car} />
              <DetailRow label="License plate" val={user.plate} />
              <DetailRow label="Capacity"      val="16 seats" />
            </div>
            <div style={{ ...card, marginBottom:16 }}>
              <p style={sectSt}>Stats</p>
              <DetailRow label="Total trips completed"  val={historyTrips.length} />
              <DetailRow label="Total ratings received" val={ratings.count} />
              <DetailRow label="Average rating"         val={ratings.average ? `${parseFloat(ratings.average).toFixed(1)} / 5` : '—'} accent={C.amber} />
            </div>
            {ratings.ratings.length > 0 && (
              <div style={card}>
                <p style={sectSt}>Recent reviews</p>
                {ratings.ratings.slice(0,5).map(r => (
                  <div key={r.id} style={{ padding:'10px 0', borderBottom:`1px solid ${C.border}` }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                      <Stars n={r.stars} />
                      <span style={{ fontSize:11, color:C.text3 }}>{fmtDate(r.created_at)}</span>
                    </div>
                    <div style={{ fontSize:12, color:C.text2 }}>{r.passenger_name} · {r.from_loc} → {r.to_loc}</div>
                    {r.comment && <div style={{ fontSize:13, color:C.text, marginTop:4 }}>"{r.comment}"</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
