import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../App.jsx';
import * as api from '../../api.js';
import { C, Tabs, Topbar, Badge, DetailRow, CapBar, Stars, btnPrimary, btnSm, btnDanger, card, fmtDate, Spinner, sectSt } from '../../components/UI.jsx';
import TripMap from '../../components/TripMap.jsx';
import { PlaceSearch, reverseGeocode } from '../../components/LeafletSearch.jsx';

const SEARCH_RADIUS_M = 3000; // 3 km

function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
function walkTime(m) { const min = Math.round(m/80); return min < 1 ? '< 1 min walk' : '~'+min+' min walk'; }
function fmtM(m) { return m < 1000 ? Math.round(m)+'m' : (m/1000).toFixed(1)+'km'; }

export default function PassengerDash() {
  const { user, logout, notify } = useAuth();
  const [tab, setTab] = useState(() => sessionStorage.getItem('pax_tab') || 'search');
  const [sub, setSub] = useState(null);
  // Persist active tab across browser refresh
  const goTab = (t) => { sessionStorage.setItem('pax_tab', t); setTab(t); setSub(null); setSelBooking(null); };

  const [fromCoord,    setFromCoord]    = useState(null);
  const [toCoord,      setToCoord]      = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [locLabel,     setLocLabel]     = useState('Detecting your location…');
  const [matchedTrips, setMatchedTrips] = useState([]);
  const [searching,    setSearching]    = useState(false);

  const [selTrip,          setSelTrip]          = useState(null);
  const [selPickup,        setSelPickup]        = useState(null);
  const [selDropoff,       setSelDropoff]       = useState(null);
  const [seats,            setSeats]            = useState(1);
  const [booking,          setBooking]          = useState(false);
  const [confirmedBooking, setConfirmedBooking] = useState(null);

  const [myBookings,  setMyBookings]  = useState([]);
  const [loadingB,    setLoadingB]    = useState(false);
  const [selBooking,  setSelBooking]  = useState(null); // clicked booking for detail view
  const [rateTrip,    setRateTrip]    = useState(null);
  const [ratingStars, setRatingStars] = useState(0);
  const [rateComment, setRateComment] = useState('');
  const [notifs,    setNotifs]    = useState([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const unread = notifs.filter(n => !n.is_read).length;

  useEffect(() => { loadNotifs(); getGPS(); }, []);

  async function loadNotifs() { try { setNotifs(await api.getNotifications()); } catch {} }
  async function openNotifs() {
    setNotifOpen(true);
    try { await api.markNotifRead(); setNotifs(n => n.map(x=>({...x,is_read:1}))); } catch {}
  }

  function getGPS() {
    if (!navigator.geolocation) { setLocLabel('GPS not available'); return; }
    setLocLabel('Getting your location…');
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLocation(loc);
        // Reverse geocode: show actual street + city name
        const name = await reverseGeocode(loc.lat, loc.lng);
        setLocLabel('📍 ' + (name || loc.lat.toFixed(4)+', '+loc.lng.toFixed(4)));
        setFromCoord(prev => prev || { ...loc, name: name || 'My location' });
      },
      () => setLocLabel('Location denied — type your area below'),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  async function searchTrips() {
    if (!toCoord) { notify('Enter destination', 'Pick a place from the dropdown first.', 'error'); return; }
    const from = fromCoord || userLocation;
    setSearching(true); setMatchedTrips([]);
    try {
      const all = await api.getTrips();
      const out = [];
      for (const trip of all) {
        const stops      = trip.stops || [];
        const pickups    = stops.filter(s => s.type === 'pickup');
        const dropoffs   = stops.filter(s => s.type === 'dropoff');

        // Best pickup stop near user's FROM location
        let bestP = null, bestPd = Infinity;
        if (from) {
          for (const s of pickups) {
            const d = haversineDistance(from.lat, from.lng, +s.lat, +s.lng);
            if (d < bestPd && d <= SEARCH_RADIUS_M) { bestPd = d; bestP = { ...s, distFromUser: d }; }
          }
        } else { bestP = pickups[0] || null; bestPd = 0; }

        // Best dropoff stop near user's TO location
        let bestD = null, bestDd = Infinity;
        for (const s of dropoffs) {
          const d = haversineDistance(toCoord.lat, toCoord.lng, +s.lat, +s.lng);
          if (d < bestDd && d <= SEARCH_RADIUS_M) { bestDd = d; bestD = { ...s, distFromDest: d }; }
        }

        if (bestP && bestD)
          out.push({ ...trip, bestPickup: bestP, bestDropoff: bestD, bestPickupDist: bestPd, bestDropoffDist: bestDd });
      }
      out.sort((a,b) => (a.bestPickupDist||0)-(b.bestPickupDist||0));
      setMatchedTrips(out);
      if (!out.length) notify('No trips found', 'No trips with stops within 3km of those locations.', 'info');
    } catch(e) { notify('Error', e.message, 'error'); }
    finally { setSearching(false); }
  }

  async function loadBookings() {
    setLoadingB(true);
    try {
      const bks = await api.getMyBookings();
      const enriched = await Promise.all(bks.map(async b => {
        try { const d = await api.getTrip(b.trip_id); return { ...b, stops: d.stops||[] }; }
        catch { return { ...b, stops: [] }; }
      }));
      setMyBookings(enriched);
    } catch {} finally { setLoadingB(false); }
  }

  useEffect(() => { if (tab==='bookings'||tab==='history') loadBookings(); }, [tab]);
  // Silently refresh booking data every 8s when on bookings tab (no visual flash)
  useEffect(() => {
    if (tab !== 'bookings') return;
    const id = setInterval(() => {
      api.getMyBookings().then(async bks => {
        const enriched = await Promise.all(bks.map(async b => {
          try { const d = await api.getTrip(b.trip_id); return { ...b, stops: d.stops||[] }; }
          catch { return { ...b, stops: [] }; }
        }));
        setMyBookings(enriched);
        // Also update selBooking if it's open
        setSelBooking(prev => prev ? (enriched.find(b => b.id===prev.id) || prev) : null);
      }).catch(() => {});
    }, 8000);
    return () => clearInterval(id);
  }, [tab]);

  function openTrip(trip) {
    setSelTrip(trip); setSelPickup(trip.bestPickup||null); setSelDropoff(trip.bestDropoff||null); setSeats(1); setSub('detail');
  }

  async function confirmBook() {
    const avail = selTrip.total_seats - selTrip.booked_seats;
    if (seats > avail) { notify('Not enough seats','Only '+avail+' available.','error'); return; }
    setBooking(true);
    try {
      const b = await api.bookTrip({ trip_id:selTrip.id, seats, pickup_note: fromCoord?.name||selPickup?.label||'' });
      setConfirmedBooking(b); setSub('confirmed');
      notify('Booking confirmed!', 'Pickup at '+selTrip.pickup_time);
    } catch(e) { notify('Error', e.message, 'error'); } finally { setBooking(false); }
  }

  async function cancelBooking(id) {
    try { await api.cancelBooking(id); notify('Booking cancelled',''); loadBookings(); }
    catch(e) { notify('Error', e.message, 'error'); }
  }

  async function submitRating() {
    if (!ratingStars) { notify('Pick stars','Tap a star.','error'); return; }
    try {
      await api.submitRating({ trip_id:rateTrip.trip_id, stars:ratingStars, comment:rateComment });
      notify('Rating submitted!', ratingStars+' stars — thank you!');
      setRateTrip(null); setRatingStars(0); setRateComment(''); loadBookings();
    } catch(e) { notify('Error', e.message, 'error'); }
  }

  const activeBookings  = myBookings.filter(b => b.status==='confirmed');
  const historyBookings = myBookings.filter(b => b.status==='completed'||b.status==='cancelled');

  return (
    <div style={{ minHeight:'100vh', background:C.bg }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <Topbar role="passenger" name={user.name} onLogout={logout} notifCount={unread} onNotif={openNotifs} />
      <div style={{ maxWidth:860, margin:'0 auto', padding:'28px 20px' }}>

        {notifOpen && (
          <div style={{ ...card, marginBottom:20 }}>
            <div style={{ display:'flex', alignItems:'center', marginBottom:12 }}>
              <span style={{ fontWeight:500 }}>Notifications</span>
              <button onClick={() => setNotifOpen(false)} style={{ ...btnSm, marginLeft:'auto' }}>✕</button>
            </div>
            {notifs.length===0 && <p style={{ color:C.text2,fontSize:13 }}>No notifications.</p>}
            {notifs.map(n => (
              <div key={n.id} style={{ padding:'10px 0', borderBottom:'1px solid '+C.border, fontSize:13, color:n.is_read?C.text2:C.text }}>
                {n.message} <span style={{ fontSize:11, color:C.text3, marginLeft:8 }}>{fmtDate(n.created_at)}</span>
              </div>
            ))}
          </div>
        )}

        <Tabs tabs={[{id:'search',label:'Search trips'},{id:'bookings',label:'Bookings ('+activeBookings.length+')'},{id:'history',label:'History'}]}
          active={tab} onSet={goTab} />

        {/* ── SEARCH ── */}
        {tab==='search' && sub===null && (
          <div>
            <div style={{ ...card, marginBottom:20 }}>

              {/* GPS bar showing real street name */}
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16, padding:'9px 13px',
                background: userLocation ? C.greenDim : C.bg4,
                border:'1px solid '+(userLocation ? C.greenBorder : C.border),
                borderRadius:8, fontSize:12, color: userLocation ? C.green : C.text3 }}>
                <span style={{ flex:1 }}>{locLabel}</span>
                {!userLocation && (
                  <button onClick={getGPS} style={{ background:C.greenDim, color:C.green, border:'1px solid '+C.greenBorder, borderRadius:5, padding:'3px 10px', fontSize:11, cursor:'pointer', fontFamily:"'Sora',sans-serif" }}>
                    Enable GPS
                  </button>
                )}
              </div>

              <PlaceSearch label="Your location / pickup area" placeholder="e.g. Nasr City, Giza, Heliopolis…" icon="🟢" value={fromCoord} onChange={setFromCoord} />
              <PlaceSearch label="Destination / drop-off area" placeholder="e.g. Maadi, New Cairo, Downtown…"   icon="🔵" value={toCoord}   onChange={setToCoord} />

              <p style={{ fontSize:11, color:C.text3, marginBottom:14 }}>
                📏 Finds trips with stops within <b style={{ color:C.amber }}>3km</b> of your locations — e.g. type "Pyramids" to find nearby pickup points
              </p>

              <button onClick={searchTrips} disabled={searching || !toCoord}
                style={{ ...btnPrimary, opacity:(searching||!toCoord)?.5:1 }}>
                {searching ? 'Searching…' : '🔍 Find trips near me'}
              </button>
            </div>

            {matchedTrips.length > 0 && (
              <div>
                <p style={sectSt}>{matchedTrips.length} trip{matchedTrips.length!==1?'s':''} with stops near you</p>
                {matchedTrips.map(t => {
                  const avail = t.total_seats - t.booked_seats;
                  return (
                    <div key={t.id} onClick={() => openTrip(t)} style={{ ...card, marginBottom:12, cursor:'pointer' }}>
                      <div style={{ display:'flex', alignItems:'center', marginBottom:10 }}>
                        <Badge type={avail<=0?'red':avail<=3?'amber':'green'}>{avail<=0?'Full':avail+' seats left'}</Badge>
                        <span style={{ marginLeft:'auto', fontSize:11, color:C.text3 }}>{fmtDate(t.date)}</span>
                      </div>
                      <div style={{ display:'flex', gap:16 }}>
                        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', paddingTop:3 }}>
                          <div style={{ width:8, height:8, borderRadius:'50%', background:C.green }} />
                          <div style={{ width:1, height:32, background:C.border2, margin:'4px 0' }} />
                          <div style={{ width:8, height:8, borderRadius:'50%', background:C.blue }} />
                        </div>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:11, color:C.text3, marginBottom:1 }}>{t.from_loc}</div>
                          {t.bestPickup && (
                            <div style={{ fontSize:12, fontWeight:500, color:C.green, marginBottom:8 }}>
                              🟢 {t.bestPickup.label||'Pickup point'}
                              <span style={{ fontWeight:400, color:C.text3, marginLeft:8 }}>
                                {fmtM(t.bestPickupDist)} · {walkTime(t.bestPickupDist)}
                              </span>
                            </div>
                          )}
                          <div style={{ fontSize:11, color:C.text3, marginBottom:1 }}>{t.to_loc}</div>
                          {t.bestDropoff && (
                            <div style={{ fontSize:12, fontWeight:500, color:C.blue }}>
                              🔵 {t.bestDropoff.label||'Drop-off point'}
                              <span style={{ fontWeight:400, color:C.text3, marginLeft:8 }}>
                                {fmtM(t.bestDropoffDist)} from destination
                              </span>
                            </div>
                          )}
                        </div>
                        <div style={{ textAlign:'right', flexShrink:0 }}>
                          <div style={{ fontSize:22, fontWeight:300, color:C.green }}>{t.price}</div>
                          <div style={{ fontSize:10, color:C.text3 }}>EGP/seat</div>
                          <div style={{ fontSize:11, color:C.text3, marginTop:4 }}>{t.pickup_time}</div>
                          <div style={{ fontSize:12, color:C.amber, marginTop:4 }}>★ {parseFloat(t.avg_rating).toFixed(1)}</div>
                        </div>
                      </div>
                      <CapBar booked={t.booked_seats} total={t.total_seats} />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── TRIP DETAIL ── */}
        {tab==='search' && sub==='detail' && selTrip && (
          <div>
            <button onClick={() => setSub(null)} style={{ ...btnSm, marginBottom:20 }}>← Back</button>
            <h2 style={{ fontSize:20, fontWeight:400, marginBottom:4 }}>{selTrip.from_loc} → {selTrip.to_loc}</h2>
            <p style={{ color:C.text2, fontSize:13, marginBottom:20 }}>{fmtDate(selTrip.date)}</p>
            <TripMap tripId={selTrip.id} pickupLat={selPickup?.lat} pickupLng={selPickup?.lng}
              dropoffLat={selDropoff?.lat} dropoffLng={selDropoff?.lng} stops={selTrip.stops||[]} height={240} />

            {/* Pickup point chooser */}
            {(selTrip.stops||[]).filter(s=>s.type==='pickup').length > 1 && (
              <div style={{ ...card, marginBottom:14 }}>
                <p style={sectSt}>🟢 Choose your pickup point</p>
                {selTrip.stops.filter(s=>s.type==='pickup').map((s,i) => {
                  const from = fromCoord || userLocation;
                  const dist = from ? haversineDistance(from.lat, from.lng, +s.lat, +s.lng) : null;
                  const sel  = selPickup?.lat===s.lat && selPickup?.lng===s.lng;
                  return (
                    <div key={i} onClick={() => setSelPickup(s)} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', borderRadius:8, marginBottom:8, cursor:'pointer', border:'1px solid '+(sel?C.greenBorder:C.border), background:sel?C.greenDim:'transparent' }}>
                      <div style={{ width:20, height:20, borderRadius:'50%', flexShrink:0, background:sel?C.green:C.border2, border:'2px solid '+(sel?C.green:C.border) }} />
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:13, fontWeight:500 }}>{s.label||'Pickup '+(i+1)}</div>
                        {dist!==null && <div style={{ fontSize:11, color:C.text3 }}>{fmtM(dist)} · {walkTime(dist)}</div>}
                      </div>
                      {sel && <span style={{ color:C.green }}>✓</span>}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Dropoff point chooser */}
            {(selTrip.stops||[]).filter(s=>s.type==='dropoff').length > 1 && (
              <div style={{ ...card, marginBottom:14 }}>
                <p style={sectSt}>🔵 Choose your drop-off point</p>
                {selTrip.stops.filter(s=>s.type==='dropoff').map((s,i) => {
                  const sel = selDropoff?.lat===s.lat && selDropoff?.lng===s.lng;
                  return (
                    <div key={i} onClick={() => setSelDropoff(s)} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', borderRadius:8, marginBottom:8, cursor:'pointer', border:'1px solid '+(sel?C.blueBorder:C.border), background:sel?C.blueDim:'transparent' }}>
                      <div style={{ width:20, height:20, borderRadius:'50%', flexShrink:0, background:sel?C.blue:C.border2, border:'2px solid '+(sel?C.blue:C.border) }} />
                      <div style={{ flex:1 }}><div style={{ fontSize:13, fontWeight:500 }}>{s.label||'Drop-off '+(i+1)}</div></div>
                      {sel && <span style={{ color:C.blue }}>✓</span>}
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ ...card, marginBottom:14 }}>
              {selPickup  && <DetailRow label="Pickup point"   val={selPickup.label||(parseFloat(selPickup.lat).toFixed(4)+', '+parseFloat(selPickup.lng).toFixed(4))}   accent={C.green} />}
              {selDropoff && <DetailRow label="Drop-off point" val={selDropoff.label||(parseFloat(selDropoff.lat).toFixed(4)+', '+parseFloat(selDropoff.lng).toFixed(4))} accent={C.blue} />}
              <DetailRow label="Pickup time" val={selTrip.pickup_time} accent={C.green} />
              <DetailRow label="Price/seat"  val={selTrip.price+' EGP'} accent={C.green} />
              <DetailRow label="Driver"      val={selTrip.driver_name} />
              <DetailRow label="Plate"       val={selTrip.driver_plate} />
              <div style={{ display:'flex', justifyContent:'space-between', padding:'10px 0' }}>
                <span style={{ color:C.text2, fontSize:13 }}>Driver rating</span>
                <span style={{ color:C.amber }}><Stars n={parseFloat(selTrip.avg_rating)} /> {parseFloat(selTrip.avg_rating).toFixed(1)}</span>
              </div>
            </div>

            <div style={{ ...card, marginBottom:14 }}>
              <p style={sectSt}>Reserve seats</p>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:20, padding:'12px 0' }}>
                <button onClick={() => setSeats(s=>Math.max(1,s-1))} style={{ ...btnSm, width:40, height:40, borderRadius:8, fontSize:18 }}>−</button>
                <span style={{ fontSize:28, fontWeight:300, minWidth:40, textAlign:'center' }}>{seats}</span>
                <button onClick={() => setSeats(s=>Math.min(3,Math.min(selTrip.total_seats-selTrip.booked_seats,s+1)))} style={{ ...btnSm, width:40, height:40, borderRadius:8, fontSize:18 }}>+</button>
              </div>
              <p style={{ fontSize:11, color:C.text3, textAlign:'center' }}>Max 3 · {selTrip.total_seats-selTrip.booked_seats} available</p>
            </div>
            <button onClick={confirmBook} disabled={booking||selTrip.total_seats<=selTrip.booked_seats}
              style={{ ...btnPrimary, opacity:(booking||selTrip.total_seats<=selTrip.booked_seats)?.4:1 }}>
              {booking?'Booking…':selTrip.total_seats<=selTrip.booked_seats?'Trip is full':'Confirm reservation'}
            </button>
          </div>
        )}

        {/* ── CONFIRMED ── */}
        {tab==='search' && sub==='confirmed' && confirmedBooking && (
          <div style={{ textAlign:'center', padding:'20px 0' }}>
            <div style={{ width:64, height:64, borderRadius:'50%', background:C.greenDim, border:'1px solid '+C.greenBorder, display:'flex', alignItems:'center', justifyContent:'center', fontSize:28, margin:'0 auto 20px' }}>✓</div>
            <h2 style={{ fontSize:22, fontWeight:400, marginBottom:8 }}>Booking confirmed!</h2>
            <p style={{ color:C.text2, fontSize:13, marginBottom:28 }}>You'll get a notification when the driver arrives at your pickup point</p>
            <div style={{ ...card, textAlign:'left', marginBottom:20 }}>
              <DetailRow label="Route"       val={confirmedBooking.from_loc+' → '+confirmedBooking.to_loc} />
              <DetailRow label="Date"        val={fmtDate(confirmedBooking.date)} />
              <DetailRow label="Pickup time" val={confirmedBooking.pickup_time} accent={C.green} />
              <DetailRow label="Seats"       val={confirmedBooking.seats} />
              <DetailRow label="Total"       val={(confirmedBooking.seats*confirmedBooking.price)+' EGP'} accent={C.green} />
              <DetailRow label="Driver"      val={confirmedBooking.driver_name} />
              <DetailRow label="Plate"       val={confirmedBooking.driver_plate} />
            </div>
            <button onClick={() => { setTab('bookings'); setSub(null); }} style={btnPrimary}>View my bookings</button>
          </div>
        )}

        {/* ── BOOKINGS LIST ── */}
        {tab==='bookings' && !selBooking && (
          <div>
            {loadingB && <Spinner />}
            {!loadingB && activeBookings.length===0 && <p style={{ color:C.text2,fontSize:13 }}>No active bookings.</p>}
            {activeBookings.map(b => {
              const statusColor = b.checkin_status==='picked' ? C.green : b.checkin_status==='dropped' ? C.blue : C.amber;
              const statusLabel = b.checkin_status==='picked' ? '✅ Picked up' : b.checkin_status==='dropped' ? '🏁 Dropped off' : '⏳ Waiting';
              return (
                <div key={b.id} onClick={() => setSelBooking(b)}
                  style={{ ...card, marginBottom:12, cursor:'pointer', transition:'border-color .15s',
                    borderColor: b.checkin_status==='picked' ? C.greenBorder : b.checkin_status==='dropped' ? C.blueBorder : C.border }}>
                  <div style={{ display:'flex', alignItems:'center', marginBottom:10 }}>
                    <Badge type="green">Confirmed</Badge>
                    <span style={{ marginLeft:8, fontSize:11, color:statusColor, fontWeight:500 }}>{statusLabel}</span>
                    <span style={{ marginLeft:'auto', fontFamily:'monospace', fontSize:11, color:C.text3 }}>#{b.id}</span>
                  </div>
                  <div style={{ fontSize:16, fontWeight:400, marginBottom:4 }}>{b.from_loc} → {b.to_loc}</div>
                  <div style={{ fontSize:12, color:C.text2, marginBottom:10 }}>{fmtDate(b.date)} · Pickup {b.pickup_time}</div>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div style={{ fontSize:12, color:C.text2 }}>
                      {b.driver_name} · {b.seats} seat{b.seats>1?'s':''} · <span style={{ color:C.green }}>{b.seats*b.price} EGP</span>
                    </div>
                    <span style={{ fontSize:12, color:C.text3 }}>Tap for details →</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── BOOKING DETAIL ── */}
        {tab==='bookings' && selBooking && (
          <div>
            <button onClick={() => setSelBooking(null)} style={{ ...btnSm, marginBottom:20 }}>← Back to bookings</button>

            <div style={{ ...card, marginBottom:14 }}>
              <div style={{ display:'flex', alignItems:'center', marginBottom:12 }}>
                <Badge type="green">Confirmed</Badge>
                <span style={{ marginLeft:'auto', fontFamily:'monospace', fontSize:11, color:C.text3 }}>#{selBooking.id}</span>
              </div>
              <h2 style={{ fontSize:18, fontWeight:400, marginBottom:4 }}>{selBooking.from_loc} → {selBooking.to_loc}</h2>
              <p style={{ color:C.text2, fontSize:13, marginBottom:16 }}>{fmtDate(selBooking.date)} · Pickup {selBooking.pickup_time}</p>
              <DetailRow label="Driver"      val={selBooking.driver_name} />
              <DetailRow label="Plate"       val={selBooking.driver_plate} />
              <DetailRow label="Seats"       val={selBooking.seats} />
              <DetailRow label="Price/seat"  val={selBooking.price+' EGP'} />
              <div style={{ display:'flex', justifyContent:'space-between', padding:'10px 0', borderBottom:'1px solid '+C.border }}>
                <span style={{ color:C.text2, fontSize:13 }}>Total</span>
                <span style={{ color:C.green, fontWeight:500 }}>{selBooking.seats*selBooking.price} EGP</span>
              </div>
            </div>

            {/* Status banner */}
            {selBooking.checkin_status==='picked' && (
              <div style={{ ...card, marginBottom:14, background:C.greenDim, border:'1px solid '+C.greenBorder }}>
                <div style={{ fontSize:14, fontWeight:500, color:C.green, marginBottom:6 }}>✅ You've been picked up!</div>
                <div style={{ fontSize:13, color:C.text2 }}>Driver is heading to your drop-off point.</div>
                {(selBooking.stops||[]).find(s=>s.type==='dropoff') && (
                  <div style={{ marginTop:8, fontSize:12, color:C.green }}>
                    🔵 Drop-off: <b>{(selBooking.stops||[]).find(s=>s.type==='dropoff').label||'Drop-off point'}</b>
                  </div>
                )}
              </div>
            )}
            {selBooking.checkin_status==='dropped' && (
              <div style={{ ...card, marginBottom:14, background:C.blueDim, border:'1px solid '+C.blueBorder }}>
                <div style={{ fontSize:14, fontWeight:500, color:C.blue }}>🏁 You've been dropped off</div>
                <div style={{ fontSize:13, color:C.text2, marginTop:4 }}>Trip complete. Head to History to rate your driver.</div>
              </div>
            )}
            {(!selBooking.checkin_status || selBooking.checkin_status==='pending') && (
              <div style={{ ...card, marginBottom:14, background:C.bg4, border:'1px solid '+C.border }}>
                <div style={{ fontSize:13, color:C.text2 }}>⏳ Waiting for driver — you'll get a notification when they arrive at your pickup point.</div>
              </div>
            )}

            {/* Live map */}
            <TripMap
              tripId={selBooking.trip_id}
              stops={selBooking.stops||[]}
              pickupLat={selBooking.pickup_lat}   pickupLng={selBooking.pickup_lng}
              dropoffLat={selBooking.dropoff_lat} dropoffLng={selBooking.dropoff_lng}
              checkinStatus={selBooking.checkin_status}
              height={280}
            />

            <button style={{ ...btnDanger, marginTop:10 }} onClick={() => { cancelBooking(selBooking.id); setSelBooking(null); }}>
              Cancel booking
            </button>
          </div>
        )}

        {/* ── HISTORY ── */}
        {tab==='history' && !rateTrip && (
          <div>
            {loadingB && <Spinner />}
            {!loadingB && historyBookings.length===0 && <p style={{ color:C.text2,fontSize:13 }}>No past trips yet.</p>}
            {historyBookings.map(b => (
              <div key={b.id} style={{ ...card, marginBottom:12 }}>
                <div style={{ display:'flex', alignItems:'center', marginBottom:8 }}>
                  <Badge type={b.status==='completed'?'blue':'red'}>{b.status}</Badge>
                  <span style={{ marginLeft:'auto', fontSize:11, color:C.text3 }}>{fmtDate(b.date)}</span>
                </div>
                <div style={{ fontFamily:'monospace', marginBottom:4 }}>{b.from_loc} → {b.to_loc}</div>
                <div style={{ fontSize:12, color:C.text2, marginBottom:10 }}>{b.seats} seats · {b.seats*b.price} EGP</div>
                {b.status==='completed' && !b.rated && <button onClick={() => setRateTrip(b)} style={{ ...btnSm, color:C.amber, borderColor:C.amberBorder }}>Rate this trip ★</button>}
                {b.rated && <span style={{ fontSize:12, color:C.amber }}>★ Rated</span>}
              </div>
            ))}
          </div>
        )}

        {/* ── RATE ── */}
        {tab==='history' && rateTrip && (
          <div style={{ textAlign:'center', padding:'20px 0' }}>
            <button onClick={() => setRateTrip(null)} style={{ ...btnSm, display:'block', margin:'0 auto 20px' }}>← Back</button>
            <div style={{ fontSize:48, marginBottom:12 }}>⭐</div>
            <h2 style={{ fontSize:20, fontWeight:400, marginBottom:6 }}>Rate your driver</h2>
            <p style={{ color:C.text2, fontSize:13, marginBottom:24 }}>{rateTrip.driver_name} · {rateTrip.from_loc} → {rateTrip.to_loc}</p>
            <div style={{ marginBottom:20 }}><Stars n={ratingStars} interactive onSet={setRatingStars} /></div>
            <textarea value={rateComment} onChange={e=>setRateComment(e.target.value)}
              style={{ width:'100%', background:C.bg3, border:'1px solid '+C.border, borderRadius:8, padding:'11px 14px', color:C.text, fontFamily:"'Sora',sans-serif", fontSize:14, outline:'none', resize:'none', height:80, marginBottom:16 }}
              placeholder="Leave a comment (optional)" />
            <button onClick={submitRating} style={btnPrimary}>Submit rating</button>
          </div>
        )}

      </div>
    </div>
  );
}
