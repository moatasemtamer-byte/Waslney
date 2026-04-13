import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../App.jsx';
import * as api from '../../api.js';
import { emitTripStarted, emitTripCompleted, emitCheckinUpdate } from '../../socket.js';
import { C, WaslneyLogo, Tabs, Topbar, Badge, StatCard, DetailRow, CapBar, CapBarLabeled, Stars, btnPrimary, btnSm, btnDanger, card, fmtDate, Spinner, sectSt, Avatar } from '../../components/UI.jsx';
import TripMap from '../../components/TripMap.jsx';

export default function DriverDash() {
  const { user, logout, notify } = useAuth();
  const [tab,        setTab]       = useState(() => sessionStorage.getItem('drv_tab') || 'trips');
  const goTab = (t) => { sessionStorage.setItem('drv_tab', t); setTab(t); setSelTrip(null); setTripDetail(null); };
  const [trips,      setTrips]     = useState([]);
  const [selTrip,    setSelTrip]   = useState(null);
  const [tripDetail, setTripDetail] = useState(null);
  const [loading,    setLoading]   = useState(false);
  const [ratings,    setRatings]   = useState({ ratings:[], average:null, count:0 });
  const [notifs,     setNotifs]    = useState([]);
  const [notifOpen,  setNotifOpen] = useState(false);
  const [activeStop, setActiveStop] = useState(null); // index of currently expanded stop

  // Pool
  const [poolInvitations,  setPoolInvitations]  = useState([]);
  const [poolLoading,      setPoolLoading]      = useState(false);
  const [poolChat,         setPoolChat]         = useState(null); // {tripId, messages}
  const [fareEditor,       setFareEditor]       = useState(null); // {inv, suggested, custom}
  const [declineModal,     setDeclineModal]     = useState(null); // {invId}
  const [declineReason,    setDeclineReason]    = useState('');
  const [fareLoading,      setFareLoading]      = useState(false);
  const [chatInput,        setChatInput]        = useState('');
  const [sendingChat,      setSendingChat]      = useState(false);
  const [editingStops,     setEditingStops]     = useState(null); // {tripId, stops}
  const chatEndRef = useRef(null);

  const unread = notifs.filter(n => !n.is_read).length;

  useEffect(() => { loadTrips(); loadRatings(); loadNotifs(); loadPoolInvitations(); }, []);

  async function loadPoolInvitations() {
    setPoolLoading(true);
    try { setPoolInvitations(await api.getPoolInvitations()); } catch {}
    finally { setPoolLoading(false); }
  }

  async function openFareEditor(inv) {
    setFareLoading(true);
    try {
      const preview = await api.getPoolFarePreview(inv.id);
      setFareEditor({ inv, suggested: preview.suggested_fare, custom: String(preview.suggested_fare), preview });
    } catch(e) {
      // fallback: use price_preview
      setFareEditor({ inv, suggested: inv.price_preview||0, custom: String(inv.price_preview||0), preview: null });
    } finally { setFareLoading(false); }
  }

  async function handleAcceptPool(invId, farePerPassenger) {
    try {
      const body = farePerPassenger ? { fare_per_passenger: parseFloat(farePerPassenger) } : {};
      const result = await api.acceptPoolInvitation(invId, body);
      notify('Pool trip accepted!', `Trip #${result.tripId} created with ${result.member_count} passengers.`);
      setFareEditor(null);
      loadPoolInvitations(); loadTrips();
    } catch(e) { notify('Error', e.message, 'error'); }
  }

  async function handleDeclinePool(invId) {
    try {
      await api.declinePoolInvitation(invId, { reason: declineReason });
      notify('Declined', declineReason ? `Reason: ${declineReason}` : 'Pool invitation declined.');
      setDeclineModal(null); setDeclineReason('');
      loadPoolInvitations();
    } catch(e) { notify('Error', e.message, 'error'); }
  }



  async function openPoolChat(tripId) {
    try {
      const messages = await api.getPoolChat(tripId);
      setPoolChat({ tripId, messages });
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior:'smooth' }), 100);
    } catch(e) { notify('Error', e.message, 'error'); }
  }

  async function sendChatMessage() {
    if (!chatInput.trim() || !poolChat) return;
    setSendingChat(true);
    try {
      await api.sendPoolMessage(poolChat.tripId, chatInput.trim());
      setChatInput('');
      const messages = await api.getPoolChat(poolChat.tripId);
      setPoolChat(prev => ({ ...prev, messages }));
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior:'smooth' }), 100);
    } catch(e) { notify('Error', e.message, 'error'); }
    finally { setSendingChat(false); }
  }

  async function saveEditedStops() {
    if (!editingStops) return;
    try {
      await api.updatePoolStops(editingStops.tripId, editingStops.stops);
      notify('Stops updated', 'Passengers have been notified.');
      setEditingStops(null); loadTrips();
    } catch(e) { notify('Error', e.message, 'error'); }
  }

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
    setActiveStop(null);
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
      setSelTrip(s => ({ ...s, status:'active' }));
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
      const detail = await api.getTrip(selTrip.id);
      setTripDetail(detail);
      const labels = { picked:'Picked up ✓', noshow:'Marked no-show — booking cancelled', dropped:'Dropped off' };
      notify(labels[status] || 'Updated', '');
    } catch(e) { notify('Error', e.message, 'error'); }
  }

  async function handleStopArrived(stopIndex) {
    try {
      await api.markStopArrived(selTrip.id, stopIndex);
      notify('Passengers notified', 'All passengers alerted you have arrived at this stop.');
      setActiveStop(stopIndex);
      const detail = await api.getTrip(selTrip.id);
      setTripDetail(detail);
    } catch(e) { notify('Error', e.message, 'error'); }
  }

  async function openNotifs() {
    setNotifOpen(true);
    try { await api.markNotifRead(); setNotifs(n => n.map(x => ({ ...x, is_read:1 }))); } catch {}
  }

  const upcomingTrips = trips.filter(t => t.status === 'upcoming' || t.status === 'active');
  const historyTrips  = trips.filter(t => t.status === 'completed');

  // Group bookings by stop index (or all in one group if no stop assigned)
  function getPassengersForStop(bookings, stopIndex, allStops) {
    // All passengers in one group per pickup stop
    return bookings || [];
  }

  return (
    <div style={{ minHeight:'100vh', background:C.bg }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes poolGlow{0%,100%{opacity:.5}50%{opacity:1}} @keyframes fadeInUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}`}</style>
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

        <Tabs tabs={[{ id:'trips', label:'My trips' }, { id:'pool', label:`🚗 Pool${poolInvitations.filter(i=>i.response==='pending').length>0?' ('+poolInvitations.filter(i=>i.response==='pending').length+')':''}`  }, { id:'history', label:'History' }, { id:'profile', label:'Profile' }]}
          active={tab} onSet={goTab} />

        {/* ── TRIPS LIST ── */}
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
                style={{ ...card, marginBottom:12, cursor:'pointer' }}>
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

        {/* ── TRIP DETAIL ── */}
        {tab === 'trips' && selTrip && (
          <div>
            <button onClick={() => { setSelTrip(null); setTripDetail(null); }} style={{ ...btnSm, marginBottom:20 }}>← Back</button>
            <h2 style={{ fontSize:20, fontWeight:400, marginBottom:4 }}>{selTrip.from_loc} → {selTrip.to_loc}</h2>
            <p style={{ color:C.text2, fontSize:13, marginBottom:20 }}>{fmtDate(selTrip.date)} · {selTrip.pickup_time}</p>

            <TripMap
              tripId={selTrip.id}
              pickupLat={selTrip.pickup_lat}   pickupLng={selTrip.pickup_lng}
              dropoffLat={selTrip.dropoff_lat} dropoffLng={selTrip.dropoff_lng}
              stops={tripDetail?.stops || selTrip.stops || []}
              isDriver={true}
              height={260}
            />

            {/* ── All stops Google Maps links ── */}
            {(tripDetail?.stops || selTrip.stops || []).length > 0 && (() => {
              const allStops = tripDetail?.stops || selTrip.stops || [];
              const pickups  = allStops.filter(s => s.type === 'pickup');
              const dropoffs = allStops.filter(s => s.type === 'dropoff');
              const gmLink = (s) => `https://www.google.com/maps/search/?api=1&query=${parseFloat(s.lat).toFixed(6)},${parseFloat(s.lng).toFixed(6)}`;
              return (
                <div style={{ ...card, marginBottom:16 }}>
                  <p style={sectSt}>🗺️ Open stops in Google Maps</p>
                  {pickups.length > 0 && (
                    <div style={{ marginBottom:10 }}>
                      <div style={{ fontSize:11, color:C.text3, marginBottom:6, textTransform:'uppercase', letterSpacing:'.06em' }}>Pickup points</div>
                      <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                        {pickups.map((s, i) => (
                          <a key={i} href={gmLink(s)} target="_blank" rel="noopener noreferrer"
                            style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:12, color:C.green, background:C.greenDim, border:`1px solid ${C.greenBorder}`, borderRadius:6, padding:'5px 12px', textDecoration:'none', fontFamily:"'Sora',sans-serif" }}>
                            🟢 {s.label || `Pickup ${i+1}`}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                  {dropoffs.length > 0 && (
                    <div>
                      <div style={{ fontSize:11, color:C.text3, marginBottom:6, textTransform:'uppercase', letterSpacing:'.06em' }}>Drop-off points</div>
                      <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                        {dropoffs.map((s, i) => (
                          <a key={i} href={gmLink(s)} target="_blank" rel="noopener noreferrer"
                            style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:12, color:C.blue, background:C.blueDim, border:`1px solid ${C.blueBorder}`, borderRadius:6, padding:'5px 12px', textDecoration:'none', fontFamily:"'Sora',sans-serif" }}>
                            🔵 {s.label || `Drop-off ${i+1}`}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {!tripDetail && <Spinner />}
            {tripDetail && (
              <>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:20 }}>
                  <StatCard num={tripDetail.bookings?.length || 0}                                         label="Booked"  color={C.blue} />
                  <StatCard num={tripDetail.bookings?.filter(b=>b.checkin_status==='picked').length  || 0} label="Picked"  color={C.green} />
                  <StatCard num={tripDetail.bookings?.filter(b=>b.checkin_status==='noshow').length  || 0} label="No-show" color={C.red} />
                  <StatCard num={tripDetail.bookings?.filter(b=>b.checkin_status==='dropped').length || 0} label="Dropped" color={C.amber} />
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

                {/* ── PICKUP STOPS CHECKLIST ── */}
                {selTrip.status === 'active' && (() => {
                  const allStops   = tripDetail.stops || [];
                  const pickupStops = allStops.filter(s => s.type === 'pickup');
                  if (!pickupStops.length) return null;

                  return (
                    <div style={{ marginBottom:20 }}>
                      <p style={sectSt}>📍 Pickup stop checklist</p>
                      {pickupStops.map((stop, idx) => {
                        const stopIdx   = stop.stop_order ?? allStops.indexOf(stop);
                        const isArrived = stop.arrived === 1 || stop.arrived === true;
                        const isOpen    = activeStop === stopIdx;

                        // Passengers at this stop (all for now, driver ticks off manually)
                        const pendingPassengers = (tripDetail.bookings || []).filter(b =>
                          !b.checkin_status || b.checkin_status === 'pending'
                        );

                        return (
                          <div key={stopIdx} style={{ ...card, marginBottom:10, border:`1px solid ${isArrived ? C.greenBorder : C.border}`, background: isArrived ? C.greenDim : C.bg3 }}>
                            {/* Stop header */}
                            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                              <div style={{ width:28, height:28, borderRadius:'50%', background: isArrived ? C.green : C.border2, display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, color: isArrived ? '#000' : C.text3, flexShrink:0 }}>
                                {isArrived ? '✓' : idx+1}
                              </div>
                              <div style={{ flex:1 }}>
                                <div style={{ fontSize:14, fontWeight:500, color: isArrived ? C.green : C.text }}>
                                  {stop.label || `Pickup ${idx+1}`}
                                </div>
                                <div style={{ fontSize:11, color:C.text3 }}>{parseFloat(stop.lat).toFixed(4)}, {parseFloat(stop.lng).toFixed(4)}</div>
                              </div>
                              {/* Arrived button */}
                              {!isArrived && (
                                <button
                                  onClick={() => handleStopArrived(stopIdx)}
                                  style={{ background:C.greenDim, color:C.green, border:`1px solid ${C.greenBorder}`, borderRadius:7, padding:'6px 14px', fontSize:12, cursor:'pointer', fontFamily:"'Sora',sans-serif", fontWeight:600 }}>
                                  🚐 I Arrived
                                </button>
                              )}
                              {isArrived && (
                                <button
                                  onClick={() => setActiveStop(isOpen ? null : stopIdx)}
                                  style={{ background:C.bg4, color:C.text2, border:`1px solid ${C.border}`, borderRadius:7, padding:'6px 14px', fontSize:12, cursor:'pointer', fontFamily:"'Sora',sans-serif" }}>
                                  {isOpen ? 'Hide ▲' : 'Check passengers ▼'}
                                </button>
                              )}
                            </div>

                            {/* Passenger checklist dropdown — shows after arrived */}
                            {isArrived && isOpen && pendingPassengers.length > 0 && (
                              <div style={{ marginTop:12, borderTop:`1px solid ${C.border}`, paddingTop:12 }}>
                                <div style={{ fontSize:12, color:C.text3, marginBottom:8 }}>Check passengers at this stop:</div>
                                {pendingPassengers.map(b => (
                                  <div key={b.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:`1px solid ${C.border}` }}>
                                    <div style={{ flex:1 }}>
                                      <div style={{ fontSize:13, fontWeight:500 }}>{b.passenger_name}</div>
                                      <div style={{ fontSize:11, color:C.text2 }}>{b.seats} seat{b.seats>1?'s':''} {b.pickup_note ? '· '+b.pickup_note : ''}</div>
                                    </div>
                                    <div style={{ display:'flex', gap:6 }}>
                                      <button
                                        onClick={() => handleCheckin(b.id, 'picked')}
                                        title="Picked up"
                                        style={{ width:36, height:36, borderRadius:6, border:`1px solid ${C.greenBorder}`, background:'transparent', color:C.green, fontSize:16, cursor:'pointer' }}>✓</button>
                                      <button
                                        onClick={() => handleCheckin(b.id, 'noshow')}
                                        title="No-show — cancels booking"
                                        style={{ width:36, height:36, borderRadius:6, border:`1px solid ${C.redBorder}`, background:'transparent', color:C.red, fontSize:16, cursor:'pointer' }}>✗</button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                            {isArrived && isOpen && pendingPassengers.length === 0 && (
                              <div style={{ marginTop:12, borderTop:`1px solid ${C.border}`, paddingTop:10, fontSize:13, color:C.green }}>
                                ✅ All passengers at this stop checked in
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

                {/* ── FULL PASSENGER CHECKLIST ── */}
                <p style={sectSt}>Passenger checklist</p>
                {(!tripDetail.bookings || tripDetail.bookings.length === 0) && (
                  <p style={{ color:C.text2, fontSize:13 }}>No passengers yet.</p>
                )}
                {tripDetail.bookings?.map(b => {
                  const st = b.checkin_status || 'pending';
                  const rowBg = st==='picked'?C.greenDim : st==='noshow'?C.redDim : st==='dropped'?C.blueDim : 'transparent';
                  const allStops = tripDetail?.stops || selTrip.stops || [];
                  const pickups  = allStops.filter(s => s.type === 'pickup');
                  const dropoffs = allStops.filter(s => s.type === 'dropoff');
                  const gmLink = (s) => `https://www.google.com/maps/search/?api=1&query=${parseFloat(s.lat).toFixed(6)},${parseFloat(s.lng).toFixed(6)}`;

                  return (
                    <div key={b.id} style={{ padding:'13px 16px', background:rowBg, borderRadius:8, marginBottom:8, border:`1px solid ${C.border}`, transition:'background .2s' }}>
                      <div style={{ display:'flex', alignItems:'flex-start', gap:12 }}>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:14, fontWeight:500 }}>{b.passenger_name}</div>
                          <div style={{ fontSize:12, color:C.text2 }}>{b.seats} seat{b.seats>1?'s':''} · {b.pickup_note || '—'}</div>
                          <div style={{ marginTop:6 }}>
                            {st==='pending' && <Badge type="amber">Pending</Badge>}
                            {st==='picked'  && <Badge type="green">Picked up</Badge>}
                            {st==='noshow'  && <Badge type="red">No-show</Badge>}
                            {st==='dropped' && <Badge type="blue">Dropped off</Badge>}
                          </div>
                          {/* Maps links */}
                          <div style={{ display:'flex', gap:8, marginTop:8, flexWrap:'wrap' }}>
                            {pickups[0] && (
                              <a href={gmLink(pickups[0])} target="_blank" rel="noopener noreferrer"
                                style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:11, color:C.green, background:C.greenDim, border:`1px solid ${C.greenBorder}`, borderRadius:5, padding:'3px 9px', textDecoration:'none', fontFamily:"'Sora',sans-serif" }}>
                                🗺️ Pickup
                              </a>
                            )}
                            {dropoffs[0] && (
                              <a href={gmLink(dropoffs[0])} target="_blank" rel="noopener noreferrer"
                                style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:11, color:C.blue, background:C.blueDim, border:`1px solid ${C.blueBorder}`, borderRadius:5, padding:'3px 9px', textDecoration:'none', fontFamily:"'Sora',sans-serif" }}>
                                🗺️ Drop-off
                              </a>
                            )}
                          </div>
                        </div>
                        <div style={{ display:'flex', flexDirection:'column', gap:6, alignItems:'flex-end' }}>
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
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}


        {/* ── POOL INVITATIONS TAB ── */}
        {tab === 'pool' && (
          <div style={{ paddingTop:8 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
              <div>
                <h2 style={{ fontSize:20, fontWeight:800, color:'#fff', margin:0 }}>Pool Ride Invitations</h2>
                <p style={{ fontSize:12, color:'#4b7ab5', margin:'4px 0 0' }}>Passengers requesting a shared ride near you</p>
              </div>
              <button onClick={loadPoolInvitations} style={{ background:'#111', border:'1px solid #1e3a5f', borderRadius:8, padding:'6px 12px', color:'#60a5fa', fontSize:12, cursor:'pointer', fontFamily:"'Sora',sans-serif" }}>
                ↻ Refresh
              </button>
            </div>

            {poolLoading && <Spinner />}

            {!poolLoading && poolInvitations.length === 0 && (
              <div style={{ textAlign:'center', paddingTop:48 }}>
                <div style={{ position:'relative', width:100, height:100, margin:'0 auto 20px', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <div style={{ position:'absolute', inset:0, borderRadius:'50%', border:'2px solid rgba(59,130,246,0.1)', animation:'poolGlow 2s ease-in-out infinite' }}/>
                  <div style={{ position:'absolute', inset:12, borderRadius:'50%', border:'2px solid rgba(59,130,246,0.2)', animation:'poolGlow 2s ease-in-out infinite', animationDelay:'0.4s' }}/>
                  <div style={{ fontSize:36 }}>🚗</div>
                </div>
                <div style={{ fontSize:18, fontWeight:800, color:'#fff', marginBottom:8, fontFamily:"'Sora',sans-serif" }}>Waiting for pool rides</div>
                <p style={{ color:'#4b7ab5', fontSize:13, lineHeight:1.6 }}>When passengers near you request a<br/>Smart Pool ride, you'll see it here.</p>
                <div style={{ marginTop:20, background:'rgba(30,58,95,0.3)', borderRadius:14, padding:'14px 16px', textAlign:'left', border:'1px solid rgba(96,165,250,0.1)', fontSize:12, color:'#60a5fa', lineHeight:1.7 }}>
                  <div style={{ fontWeight:700, marginBottom:6, color:'#93c5fd' }}>💡 Tips to get pool invites</div>
                  <div>✅ Keep your location updated</div>
                  <div>✅ Stay online &amp; active</div>
                  <div>✅ Accept invites within 30 min</div>
                </div>
              </div>
            )}

            {poolInvitations.map((inv, cardIdx) => (
              <div key={inv.id} style={{ background:'#0d1117', borderRadius:20, padding:'20px', marginBottom:14, border:`2px solid ${inv.response==='pending'?'rgba(59,130,246,0.35)':'#1a1a1a'}`, animation:`fadeInUp 0.3s ease-out ${cardIdx*0.07}s both`, boxShadow: inv.response==='pending'?'0 4px 24px rgba(59,130,246,0.1)':'none' }}>
                {/* Header */}
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
                  <div style={{ fontSize:12, fontWeight:700, padding:'4px 12px', borderRadius:20,
                    color: inv.response==='pending'?'#60a5fa':inv.response==='accepted'?'#4ade80':'#f87171',
                    background: inv.response==='pending'?'rgba(96,165,250,0.12)':inv.response==='accepted'?'rgba(74,222,128,0.12)':'rgba(248,113,113,0.12)',
                    border: `1px solid ${inv.response==='pending'?'rgba(96,165,250,0.3)':inv.response==='accepted'?'rgba(74,222,128,0.3)':'rgba(248,113,113,0.3)'}` }}>
                    {inv.response==='pending'?'🟡 New Invite':inv.response==='accepted'?'✅ Accepted':'❌ Declined'}
                  </div>
                  <span style={{ fontSize:11, color:'#555' }}>{inv.desired_date} · {inv.desired_time}</span>
                </div>

                {/* Destination */}
                <div style={{ fontSize:16, fontWeight:800, color:'#fff', marginBottom:12, fontFamily:"'Sora',sans-serif" }}>
                  🏁 {inv.dest_label || 'Destination'}
                </div>

                {/* Earnings preview */}
                {inv.price_preview && (
                  <div style={{ background:'rgba(251,191,36,0.08)', border:'1px solid rgba(251,191,36,0.2)', borderRadius:12, padding:'10px 14px', marginBottom:14, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <span style={{ fontSize:12, color:'#fbbf24', fontWeight:600 }}>💰 Est. earnings</span>
                    <span style={{ fontSize:18, fontWeight:800, color:'#fbbf24', fontFamily:"'Sora',sans-serif" }}>{inv.price_preview} EGP</span>
                  </div>
                )}

                {/* Members listed under each other */}
                {inv.members && inv.members.length > 0 && (
                  <div style={{ marginBottom:14, background:'rgba(30,58,95,0.2)', borderRadius:14, padding:'12px 14px', border:'1px solid rgba(96,165,250,0.1)' }}>
                    <div style={{ fontSize:11, color:'#4b7ab5', marginBottom:10, textTransform:'uppercase', letterSpacing:'.08em', fontFamily:"'Sora',sans-serif" }}>
                      👥 {inv.members.length} Passenger{inv.members.length>1?'s':''} · {inv.total_seats||inv.members.reduce((s,m)=>s+(m.seats||1),0)} total seats
                    </div>
                    {inv.members.map((m, i) => (
                      <div key={i} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 0', borderTop: i>0?'1px solid rgba(96,165,250,0.07)':'none', animation:`fadeInUp 0.25s ease-out ${i*0.06}s both` }}>
                        <div style={{ width:38, height:38, borderRadius:'50%', background:'linear-gradient(135deg,#1e3a5f,#1d4ed8)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, fontWeight:800, color:'#93c5fd', flexShrink:0, border:'2px solid rgba(96,165,250,0.2)' }}>
                          {m.passenger_name?.[0]?.toUpperCase() || '?'}
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:14, fontWeight:700, color:'#fff', fontFamily:"'Sora',sans-serif" }}>{m.passenger_name}</div>
                          <div style={{ fontSize:11, color:'#4b7ab5', marginTop:2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                            📍 {m.origin_label || 'Origin'} → {m.dest_label || 'Destination'}
                          </div>
                        </div>
                        <div style={{ textAlign:'right', flexShrink:0 }}>
                          <div style={{ fontSize:12, fontWeight:700, color:'#fff' }}>{m.seats} seat{m.seats>1?'s':''}</div>
                          <div style={{ width:8, height:8, borderRadius:'50%', background:'#4ade80', margin:'4px auto 0', boxShadow:'0 0 6px #4ade80' }}/>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Smart routing note */}
                {inv.response === 'pending' && inv.members && inv.members.length > 0 && (
                  <div style={{ background:'rgba(30,58,95,0.3)', borderRadius:10, padding:'10px 14px', fontSize:12, color:'#4b7ab5', marginBottom:14, lineHeight:1.5 }}>
                    🗺️ Accept to auto-assign optimised pickup stops for each passenger. You can edit them after.
                  </div>
                )}

                {/* Action buttons */}
                {inv.response === 'pending' && (
                  <div style={{ display:'flex', gap:10 }}>
                    <button onClick={() => openFareEditor(inv)} disabled={fareLoading}
                      style={{ flex:2, background:'linear-gradient(135deg,#1d4ed8,#3b82f6)', color:'#fff', border:'none', borderRadius:12, padding:'14px', fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:"'Sora',sans-serif", boxShadow:'0 4px 14px rgba(59,130,246,0.35)', opacity: fareLoading?0.7:1 }}>
                      {fareLoading ? '⏳ Loading…' : '✅ Set Fare & Accept'}
                    </button>
                    <button onClick={() => { setDeclineModal({invId: inv.id}); setDeclineReason(''); }}
                      style={{ flex:1, background:'transparent', color:'#f87171', border:'1px solid rgba(248,113,113,0.3)', borderRadius:12, padding:'14px', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:"'Sora',sans-serif" }}>
                      ✕ Decline
                    </button>
                  </div>
                )}

                {/* Accepted: show chat + edit stops */}
                {inv.response === 'accepted' && inv.group_trip_id && (
                  <div style={{ display:'flex', gap:10, marginTop:4 }}>
                    <button onClick={() => openPoolChat(inv.group_trip_id || inv.trip_id)}
                      style={{ flex:1, background:'rgba(29,78,216,0.2)', border:'1px solid #1e3a5f', borderRadius:10, padding:'11px', fontSize:13, fontWeight:600, color:'#60a5fa', cursor:'pointer', fontFamily:"'Sora',sans-serif" }}>
                      💬 Group Chat
                    </button>
                    <button onClick={async () => {
                        try {
                          const tripDetail = await api.getTrip(inv.group_trip_id);
                          setEditingStops({ tripId: inv.group_trip_id, stops: tripDetail.stops || [] });
                        } catch(e) { notify('Error', e.message, 'error'); }
                      }}
                      style={{ flex:1, background:'rgba(251,191,36,0.1)', border:'1px solid #fbbf2444', borderRadius:10, padding:'11px', fontSize:13, fontWeight:600, color:'#fbbf24', cursor:'pointer', fontFamily:"'Sora',sans-serif" }}>
                      📍 Edit Stops
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── FARE EDITOR MODAL ── */}
        {fareEditor && (
          <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.92)', zIndex:500, display:'flex', flexDirection:'column', justifyContent:'flex-end' }}>
            <div style={{ background:'#0d1117', borderRadius:'24px 24px 0 0', padding:'28px 20px 44px', maxHeight:'88vh', overflowY:'auto', border:'1px solid rgba(96,165,250,0.2)' }}>
              {/* Header */}
              <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:24 }}>
                <div style={{ width:44, height:44, borderRadius:14, background:'linear-gradient(135deg,#1d4ed8,#3b82f6)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, flexShrink:0 }}>💰</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:19, fontWeight:800, color:'#fff', fontFamily:"'Sora',sans-serif" }}>Set Fare Per Passenger</div>
                  <div style={{ fontSize:12, color:'#60a5fa', marginTop:2 }}>You can use the suggested price or set your own</div>
                </div>
                <button onClick={() => setFareEditor(null)} style={{ background:'rgba(255,255,255,0.06)', border:'none', color:'#888', fontSize:18, cursor:'pointer', width:32, height:32, borderRadius:8 }}>✕</button>
              </div>

              {/* Route summary */}
              <div style={{ background:'rgba(30,58,95,0.3)', borderRadius:14, padding:'14px 16px', marginBottom:20, border:'1px solid rgba(96,165,250,0.1)' }}>
                <div style={{ fontSize:11, color:'#4b7ab5', marginBottom:8, textTransform:'uppercase', letterSpacing:'.08em' }}>Trip</div>
                <div style={{ fontSize:14, fontWeight:700, color:'#fff' }}>→ {fareEditor.inv.dest_label || 'Destination'}</div>
                <div style={{ fontSize:12, color:'#555', marginTop:4 }}>{fareEditor.inv.desired_date} · {fareEditor.inv.desired_time} · {fareEditor.inv.members?.length||0} passenger{fareEditor.inv.members?.length!==1?'s':''}</div>
                {fareEditor.preview?.route_km && (
                  <div style={{ fontSize:12, color:'#4b7ab5', marginTop:4 }}>📍 ~{fareEditor.preview.route_km} km route</div>
                )}
              </div>

              {/* Suggested fare */}
              <div style={{ background:'rgba(251,191,36,0.08)', border:'1px solid rgba(251,191,36,0.2)', borderRadius:14, padding:'16px', marginBottom:20 }}>
                <div style={{ fontSize:11, color:'#fbbf24', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:8 }}>Suggested Fare</div>
                <div style={{ fontSize:28, fontWeight:800, color:'#fbbf24', fontFamily:"'Sora',sans-serif" }}>{fareEditor.suggested} <span style={{ fontSize:14, fontWeight:400 }}>EGP / passenger</span></div>
                {fareEditor.preview && (
                  <div style={{ fontSize:12, color:'#a16207', marginTop:6 }}>
                    Based on {fareEditor.preview.price_per_km} EGP/km · min {fareEditor.preview.min_fare} EGP · {fareEditor.inv.members?.length||1} passengers
                  </div>
                )}
              </div>

              {/* Custom fare input */}
              <div style={{ marginBottom:20 }}>
                <label style={{ fontSize:12, color:'#4b7ab5', display:'block', marginBottom:8, textTransform:'uppercase', letterSpacing:'.06em', fontFamily:"'Sora',sans-serif" }}>Your Fare (EGP per passenger)</label>
                <div style={{ position:'relative' }}>
                  <input
                    type="number" min="1" step="0.5"
                    value={fareEditor.custom}
                    onChange={e => setFareEditor(prev => ({...prev, custom: e.target.value}))}
                    style={{ width:'100%', boxSizing:'border-box', background:'#111', border:'2px solid rgba(96,165,250,0.3)', borderRadius:12, padding:'16px 60px 16px 16px', color:'#fff', fontFamily:"'Sora',sans-serif", fontSize:22, fontWeight:700, outline:'none' }}
                  />
                  <span style={{ position:'absolute', right:16, top:'50%', transform:'translateY(-50%)', fontSize:14, color:'#4b7ab5', fontWeight:600 }}>EGP</span>
                </div>
                {fareEditor.custom && parseFloat(fareEditor.custom) > 0 && fareEditor.inv.members?.length > 0 && (
                  <div style={{ fontSize:13, color:'#4ade80', marginTop:8, fontWeight:600 }}>
                    💰 Total earnings: {(parseFloat(fareEditor.custom) * fareEditor.inv.members.reduce((s,m)=>s+(m.seats||1),0)).toFixed(0)} EGP
                  </div>
                )}
                {/* Quick presets */}
                <div style={{ display:'flex', gap:8, marginTop:12 }}>
                  {[Math.round(fareEditor.suggested*0.8), fareEditor.suggested, Math.round(fareEditor.suggested*1.2), Math.round(fareEditor.suggested*1.5)].map(p=>(
                    <button key={p} onClick={() => setFareEditor(prev=>({...prev, custom: String(p)}))}
                      style={{ flex:1, background: String(p)===fareEditor.custom?'rgba(96,165,250,0.2)':'#111', border:`1px solid ${String(p)===fareEditor.custom?'#3b82f6':'#1a1a1a'}`, borderRadius:10, padding:'8px 4px', color: String(p)===fareEditor.custom?'#60a5fa':'#555', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:"'Sora',sans-serif" }}>
                      {p}
                    </button>
                  ))}
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:'#333', marginTop:4, paddingLeft:2 }}>
                  <span>-20%</span><span>Suggested</span><span>+20%</span><span>+50%</span>
                </div>
              </div>

              {/* Per-passenger breakdown */}
              {fareEditor.preview?.per_passenger && (
                <div style={{ background:'rgba(30,58,95,0.2)', borderRadius:12, padding:'12px 14px', marginBottom:20, border:'1px solid rgba(96,165,250,0.08)' }}>
                  <div style={{ fontSize:11, color:'#4b7ab5', marginBottom:10, textTransform:'uppercase', letterSpacing:'.08em' }}>Per passenger breakdown</div>
                  {fareEditor.preview.per_passenger.map((p,i) => (
                    <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'7px 0', borderTop: i>0?'1px solid rgba(96,165,250,0.07)':'none' }}>
                      <div>
                        <div style={{ fontSize:13, color:'#fff', fontWeight:600 }}>{p.name}</div>
                        <div style={{ fontSize:11, color:'#4b7ab5' }}>{p.origin} → {p.dest}</div>
                      </div>
                      <div style={{ fontSize:13, fontWeight:700, color:'#fbbf24' }}>
                        {fareEditor.custom && parseFloat(fareEditor.custom)>0 ? parseFloat(fareEditor.custom).toFixed(0) : p.suggested_fare} EGP
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={() => handleAcceptPool(fareEditor.inv.id, fareEditor.custom)}
                disabled={!fareEditor.custom || parseFloat(fareEditor.custom) <= 0}
                style={{ width:'100%', background: fareEditor.custom&&parseFloat(fareEditor.custom)>0?'linear-gradient(135deg,#1d4ed8,#3b82f6)':'#1a1a1a', color: fareEditor.custom&&parseFloat(fareEditor.custom)>0?'#fff':'#333', border:'none', borderRadius:14, padding:'16px', fontSize:15, fontWeight:700, cursor: fareEditor.custom&&parseFloat(fareEditor.custom)>0?'pointer':'default', fontFamily:"'Sora',sans-serif", boxShadow: fareEditor.custom&&parseFloat(fareEditor.custom)>0?'0 6px 20px rgba(59,130,246,0.35)':'none' }}>
                ✅ Accept & Confirm {fareEditor.custom ? `— ${fareEditor.custom} EGP/passenger` : ''}
              </button>
            </div>
          </div>
        )}

        {/* ── DECLINE REASON MODAL ── */}
        {declineModal && (
          <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', zIndex:500, display:'flex', flexDirection:'column', justifyContent:'flex-end' }}>
            <div style={{ background:'#0d1117', borderRadius:'24px 24px 0 0', padding:'28px 20px 44px', border:'1px solid rgba(248,113,113,0.2)' }}>
              <div style={{ fontSize:18, fontWeight:800, color:'#fff', marginBottom:6, fontFamily:"'Sora',sans-serif" }}>Decline this trip?</div>
              <div style={{ fontSize:13, color:'#555', marginBottom:20 }}>Passengers will be notified and we'll find another driver.</div>

              <label style={{ fontSize:12, color:'#4b7ab5', display:'block', marginBottom:8, textTransform:'uppercase', letterSpacing:'.06em' }}>Reason (optional)</label>
              <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:12 }}>
                {['Too far','Wrong direction','Already on a trip','Vehicle issue','Other'].map(r=>(
                  <button key={r} onClick={() => setDeclineReason(r)}
                    style={{ background: declineReason===r?'rgba(248,113,113,0.15)':'#111', border:`1px solid ${declineReason===r?'rgba(248,113,113,0.5)':'#222'}`, borderRadius:20, padding:'7px 14px', color: declineReason===r?'#f87171':'#555', fontSize:12, cursor:'pointer', fontFamily:"'Sora',sans-serif" }}>
                    {r}
                  </button>
                ))}
              </div>
              <input value={declineReason} onChange={e=>setDeclineReason(e.target.value)}
                placeholder="Or type your own reason…"
                style={{ width:'100%', boxSizing:'border-box', background:'#111', border:'1px solid #222', borderRadius:12, padding:'12px 14px', color:'#fff', fontFamily:"'Sora',sans-serif", fontSize:13, outline:'none', marginBottom:20 }}
              />

              <div style={{ display:'flex', gap:10 }}>
                <button onClick={() => { setDeclineModal(null); setDeclineReason(''); }}
                  style={{ flex:1, background:'transparent', border:'1px solid #333', borderRadius:12, padding:'14px', color:'#888', fontSize:13, cursor:'pointer', fontFamily:"'Sora',sans-serif" }}>
                  Cancel
                </button>
                <button onClick={() => handleDeclinePool(declineModal.invId)}
                  style={{ flex:2, background:'rgba(248,113,113,0.15)', border:'1px solid rgba(248,113,113,0.4)', borderRadius:12, padding:'14px', color:'#f87171', fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:"'Sora',sans-serif" }}>
                  ✕ Confirm Decline
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── POOL CHAT MODAL ── */}
        {poolChat && (
          <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.95)', zIndex:500, display:'flex', flexDirection:'column' }}>
            <div style={{ background:'#0d1117', borderBottom:'1px solid #1e3a5f', padding:'16px 20px', display:'flex', alignItems:'center' }}>
              <button onClick={() => setPoolChat(null)} style={{ background:'transparent', border:'none', color:'#fff', fontSize:22, cursor:'pointer', marginRight:12 }}>←</button>
              <div>
                <div style={{ fontSize:15, fontWeight:700, color:'#fff' }}>Pool Trip Chat</div>
                <div style={{ fontSize:11, color:'#4b7ab5' }}>Trip #{poolChat.tripId} · You are the <strong style={{color:'#fbbf24'}}>Driver</strong></div>
              </div>
            </div>
            <div style={{ flex:1, overflowY:'auto', padding:'16px 20px', display:'flex', flexDirection:'column', gap:10 }}>
              {poolChat.messages.length === 0 && (
                <div style={{ textAlign:'center', color:'#333', fontSize:13, marginTop:40 }}>No messages yet. Greet your passengers! 🚗</div>
              )}
              {poolChat.messages.map((m, i) => {
                const isMe = m.user_id === user.id;
                const isDriver = m.sender_role === 'driver';
                return (
                  <div key={i} style={{ display:'flex', flexDirection:'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                    <div style={{ fontSize:11, color:'#444', marginBottom:3 }}>
                      {isDriver ? `🚗 ${m.sender_name} (Driver)` : m.sender_name}
                    </div>
                    <div style={{ background: isMe ? '#fbbf24' : '#111', color: isMe ? '#000' : '#fff', borderRadius: isMe ? '16px 16px 4px 16px' : '16px 16px 16px 4px', padding:'10px 14px', maxWidth:'75%', fontSize:13, lineHeight:1.5 }}>
                      {m.message}
                    </div>
                    <div style={{ fontSize:10, color:'#333', marginTop:2 }}>{new Date(m.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</div>
                  </div>
                );
              })}
              <div ref={chatEndRef} />
            </div>
            <div style={{ padding:'12px 16px 32px', background:'#0d1117', borderTop:'1px solid #1a1a1a', display:'flex', gap:8 }}>
              <input value={chatInput} onChange={e=>setChatInput(e.target.value)}
                onKeyDown={e=>e.key==='Enter'&&!e.shiftKey&&sendChatMessage()}
                placeholder="Message to passengers…"
                style={{ flex:1, background:'#111', border:'1px solid #1e3a5f', borderRadius:12, padding:'12px 16px', color:'#fff', fontFamily:"'Sora',sans-serif", fontSize:13, outline:'none' }} />
              <button onClick={sendChatMessage} disabled={sendingChat || !chatInput.trim()}
                style={{ background:'#fbbf24', border:'none', borderRadius:12, padding:'12px 18px', color:'#000', fontSize:16, cursor:'pointer', fontWeight:700 }}>
                {sendingChat ? '…' : '➤'}
              </button>
            </div>
          </div>
        )}

        {/* ── EDIT STOPS MODAL ── */}
        {editingStops && (
          <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.92)', zIndex:500, display:'flex', flexDirection:'column' }}>
            <div style={{ background:'#0d1117', borderBottom:'1px solid #1e3a5f', padding:'16px 20px', display:'flex', alignItems:'center' }}>
              <button onClick={() => setEditingStops(null)} style={{ background:'transparent', border:'none', color:'#fff', fontSize:22, cursor:'pointer', marginRight:12 }}>←</button>
              <div>
                <div style={{ fontSize:15, fontWeight:700, color:'#fff' }}>Edit Pickup & Dropoff Points</div>
                <div style={{ fontSize:11, color:'#4b7ab5' }}>Passengers will be notified of any changes</div>
              </div>
            </div>
            <div style={{ flex:1, overflowY:'auto', padding:'20px' }}>
              <div style={{ background:'rgba(30,58,95,0.3)', borderRadius:10, padding:'10px 14px', fontSize:12, color:'#4b7ab5', marginBottom:20, lineHeight:1.5 }}>
                ℹ️ Edit labels to update where each passenger will be picked up or dropped off. A notification will be sent to each affected passenger.
              </div>
              {editingStops.stops.map((stop, i) => (
                <div key={i} style={{ background:'#111', borderRadius:12, padding:'16px', marginBottom:12, border:`1px solid ${stop.type==='pickup'?'#fbbf2433':'#3b82f633'}` }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                    <span style={{ fontSize:16 }}>{stop.type==='pickup'?'🟢':'🏁'}</span>
                    <span style={{ fontSize:12, fontWeight:700, color: stop.type==='pickup'?'#fbbf24':'#60a5fa', textTransform:'uppercase', letterSpacing:'.06em' }}>
                      {stop.type} {i+1}
                    </span>
                    {stop.passenger_id && <span style={{ fontSize:11, color:'#555' }}>— passenger stop</span>}
                  </div>
                  <input
                    value={stop.label || ''}
                    onChange={e => setEditingStops(prev => ({
                      ...prev,
                      stops: prev.stops.map((s, idx) => idx===i ? {...s, label: e.target.value} : s)
                    }))}
                    placeholder="Location name / description"
                    style={{ width:'100%', boxSizing:'border-box', background:'#1a1a1a', border:'1px solid #333', borderRadius:8, padding:'10px 14px', color:'#fff', fontFamily:"'Sora',sans-serif", fontSize:13, outline:'none' }}
                  />
                  <div style={{ fontSize:11, color:'#333', marginTop:6 }}>
                    Coords: {parseFloat(stop.lat).toFixed(5)}, {parseFloat(stop.lng).toFixed(5)}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ padding:'12px 20px 32px', background:'#0d1117', borderTop:'1px solid #1a1a1a', display:'flex', gap:10 }}>
              <button onClick={() => setEditingStops(null)}
                style={{ flex:1, background:'transparent', border:'1px solid #333', borderRadius:12, padding:'13px', color:'#555', fontSize:14, cursor:'pointer', fontFamily:"'Sora',sans-serif" }}>
                Cancel
              </button>
              <button onClick={saveEditedStops}
                style={{ flex:2, background:'#fbbf24', border:'none', borderRadius:12, padding:'13px', color:'#000', fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:"'Sora',sans-serif" }}>
                💾 Save & Notify Passengers
              </button>
            </div>
          </div>
        )}

        {/* ── HISTORY ── */}
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

        {/* ── PROFILE ── */}
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
