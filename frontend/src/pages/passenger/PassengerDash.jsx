import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../App.jsx';
import * as api from '../../api.js';
import { C, Tabs, Topbar, Badge, StatCard, DetailRow, CapBar, Stars, Inp, btnPrimary, btnSm, btnDanger, card, fmtDate, Spinner, sectSt, Avatar } from '../../components/UI.jsx';
import TripMap from '../../components/TripMap.jsx';

const SEARCH_RADIUS_M = 3000; // 3km radius to match stops

function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function estimateWalkTime(meters) {
  const minutes = Math.round(meters / 80); // ~80m/min walking
  if (minutes < 1) return '< 1 min walk';
  return `~${minutes} min walk`;
}

function formatDist(m) {
  return m < 1000 ? `${Math.round(m)}m` : `${(m/1000).toFixed(1)}km`;
}

// Geocode a text address using Nominatim (free, no key)
async function geocodeAddress(address) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1&countrycodes=eg`;
  const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
  const data = await res.json();
  if (!data.length) return null;
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), name: data[0].display_name };
}

export default function PassengerDash() {
  const { user, logout, notify } = useAuth();
  const [tab, setTab]   = useState('search');
  const [sub, setSub]   = useState(null);

  // search
  const [from, setFrom] = useState('');
  const [to,   setTo]   = useState('');
  const [trips, setTrips] = useState([]);
  const [searching, setSearching] = useState(false);
  const [userLocation, setUserLocation] = useState(null); // { lat, lng }
  const [locationStatus, setLocationStatus] = useState('');
  const [matchedTrips, setMatchedTrips] = useState([]); // trips with nearby stops

  // booking
  const [selTrip,  setSelTrip]  = useState(null);
  const [selPickup, setSelPickup] = useState(null);  // chosen pickup stop
  const [selDropoff, setSelDropoff] = useState(null); // chosen dropoff stop
  const [seats,    setSeats]    = useState(1);
  const [booking,  setBooking]  = useState(false);
  const [confirmedBooking, setConfirmedBooking] = useState(null);

  // my bookings
  const [myBookings, setMyBookings] = useState([]);
  const [loadingB, setLoadingB] = useState(false);

  // rating
  const [rateTrip,    setRateTrip]    = useState(null);
  const [ratingStars, setRatingStars] = useState(0);
  const [rateComment, setRateComment] = useState('');

  // notifications
  const [notifs,    setNotifs]    = useState([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const unread = notifs.filter(n => !n.is_read).length;

  useEffect(() => { loadNotifs(); }, []);

  async function loadNotifs() {
    try { setNotifs(await api.getNotifications()); } catch {}
  }
  async function openNotifs() {
    setNotifOpen(true);
    try { await api.markNotifRead(); setNotifs(n => n.map(x => ({ ...x, is_read:1 }))); } catch {}
  }

  // Get user GPS location
  function requestLocation() {
    if (!navigator.geolocation) { setLocationStatus('GPS not available'); return; }
    setLocationStatus('Getting your location...');
    navigator.geolocation.getCurrentPosition(
      pos => {
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocationStatus('📍 Location found');
      },
      () => setLocationStatus('Location denied — walking time estimates unavailable'),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  useEffect(() => { requestLocation(); }, []);

  async function searchTrips() {
    if (!to.trim()) { notify('Enter destination', 'Type where you want to go.', 'error'); return; }
    setSearching(true);
    setMatchedTrips([]);
    try {
      const all = await api.getTrips();

      // Geocode the destination
      const toCoord = await geocodeAddress(to);
      const fromCoord = from.trim() ? await geocodeAddress(from) : userLocation ? { lat: userLocation.lat, lng: userLocation.lng } : null;

      // For each trip, find nearby pickup stops (near fromCoord) and dropoff stops (near toCoord)
      const enriched = [];
      for (const trip of all) {
        const stops = trip.stops || [];
        const pickupStops  = stops.filter(s => s.type === 'pickup');
        const dropoffStops = stops.filter(s => s.type === 'dropoff');

        // Find closest pickup stop to user's from location
        let bestPickup = null;
        let bestPickupDist = Infinity;
        if (fromCoord) {
          for (const ps of pickupStops) {
            const d = haversineDistance(fromCoord.lat, fromCoord.lng, parseFloat(ps.lat), parseFloat(ps.lng));
            if (d < bestPickupDist && d <= SEARCH_RADIUS_M) {
              bestPickupDist = d;
              bestPickup = { ...ps, distFromUser: d };
            }
          }
        } else {
          // No location — just use first pickup stop
          bestPickup = pickupStops[0] || null;
          bestPickupDist = 0;
        }

        // Find closest dropoff stop to destination
        let bestDropoff = null;
        let bestDropoffDist = Infinity;
        if (toCoord) {
          for (const ds of dropoffStops) {
            const d = haversineDistance(toCoord.lat, toCoord.lng, parseFloat(ds.lat), parseFloat(ds.lng));
            if (d < bestDropoffDist && d <= SEARCH_RADIUS_M) {
              bestDropoffDist = d;
              bestDropoff = { ...ds, distFromDest: d };
            }
          }
        } else {
          // No destination coord — text match fallback
          const textMatch = trip.to_loc?.toLowerCase().includes(to.toLowerCase());
          if (textMatch) bestDropoff = dropoffStops[0] || null;
        }

        // Only include trip if both a nearby pickup and dropoff were found
        if (bestPickup && bestDropoff) {
          enriched.push({ ...trip, bestPickup, bestDropoff, bestPickupDist, bestDropoffDist });
        } else if (!toCoord && trip.to_loc?.toLowerCase().includes(to.toLowerCase())) {
          // Fallback: text match only
          enriched.push({ ...trip, bestPickup: pickupStops[0]||null, bestDropoff: dropoffStops[0]||null, bestPickupDist: 0, bestDropoffDist: 0 });
        }
      }

      // Sort by pickup distance
      enriched.sort((a, b) => a.bestPickupDist - b.bestPickupDist);
      setMatchedTrips(enriched);
      setTrips(all);

      if (!enriched.length) notify('No trips found', 'No trips with stops near those locations.', 'info');
    } catch(e) { notify('Error', e.message, 'error'); }
    finally { setSearching(false); }
  }

  async function loadBookings() {
    setLoadingB(true);
    try { setMyBookings(await api.getMyBookings()); } catch {}
    finally { setLoadingB(false); }
  }

  useEffect(() => {
    if (tab === 'bookings' || tab === 'history') loadBookings();
  }, [tab]);

  function openTrip(trip) {
    setSelTrip(trip);
    setSelPickup(trip.bestPickup || null);
    setSelDropoff(trip.bestDropoff || null);
    setSeats(1);
    setSub('detail');
  }

  async function confirmBook() {
    const avail = selTrip.total_seats - selTrip.booked_seats;
    if (seats > avail) { notify('Not enough seats', `Only ${avail} available.`, 'error'); return; }
    setBooking(true);
    try {
      const b = await api.bookTrip({ trip_id: selTrip.id, seats, pickup_note: from || selPickup?.label || '' });
      setConfirmedBooking(b);
      setSub('confirmed');
      notify('Booking confirmed!', `Pickup at ${selTrip.pickup_time}`);
    } catch(e) { notify('Error', e.message, 'error'); }
    finally { setBooking(false); }
  }

  async function cancelBooking(id) {
    try {
      await api.cancelBooking(id);
      notify('Booking cancelled', 'Seat is now available again.');
      loadBookings();
    } catch(e) { notify('Error', e.message, 'error'); }
  }

  async function submitRating() {
    if (!ratingStars) { notify('Pick stars', 'Tap a star to rate.', 'error'); return; }
    try {
      await api.submitRating({ trip_id: rateTrip.trip_id, stars: ratingStars, comment: rateComment });
      notify('Rating submitted!', `${ratingStars} stars — thank you!`);
      setRateTrip(null); setRatingStars(0); setRateComment('');
      loadBookings();
    } catch(e) { notify('Error', e.message, 'error'); }
  }

  const activeBookings  = myBookings.filter(b => b.status === 'confirmed');
  const historyBookings = myBookings.filter(b => b.status === 'completed' || b.status === 'cancelled');

  return (
    <div style={{ minHeight:'100vh', background:C.bg }}>
      <Topbar role="passenger" name={user.name} onLogout={logout} notifCount={unread} onNotif={openNotifs} />
      <div style={{ maxWidth:860, margin:'0 auto', padding:'28px 20px' }}>

        {notifOpen && (
          <div style={{ ...card, marginBottom:20 }}>
            <div style={{ display:'flex', alignItems:'center', marginBottom:12 }}>
              <span style={{ fontWeight:500 }}>Notifications</span>
              <button onClick={() => setNotifOpen(false)} style={{ ...btnSm, marginLeft:'auto' }}>✕</button>
            </div>
            {notifs.length === 0 && <p style={{ color:C.text2, fontSize:13 }}>No notifications.</p>}
            {notifs.map(n => (
              <div key={n.id} style={{ padding:'10px 0', borderBottom:`1px solid ${C.border}`, fontSize:13, color: n.is_read ? C.text2 : C.text }}>
                {n.message} <span style={{ fontSize:11, color:C.text3, marginLeft:8 }}>{fmtDate(n.created_at)}</span>
              </div>
            ))}
          </div>
        )}

        <Tabs
          tabs={[{ id:'search', label:'Search trips' }, { id:'bookings', label:`Bookings (${activeBookings.length})` }, { id:'history', label:'History' }]}
          active={tab} onSet={t => { setTab(t); setSub(null); }}
        />

        {/* ── SEARCH ── */}
        {tab === 'search' && sub === null && (
          <div>
            <div style={{ ...card, marginBottom:20 }}>
              {/* Location status */}
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12, fontSize:12, color: userLocation ? C.green : C.text3 }}>
                <span>{userLocation ? '📍' : '📵'}</span>
                <span>{locationStatus || 'Detecting your location...'}</span>
                {!userLocation && (
                  <button onClick={requestLocation} style={{ marginLeft:'auto', background:C.greenDim, color:C.green, border:`1px solid ${C.greenBorder}`, borderRadius:5, padding:'2px 10px', fontSize:11, cursor:'pointer', fontFamily:"'Sora',sans-serif" }}>
                    Enable GPS
                  </button>
                )}
              </div>
              <Inp label="📍 Your location / area" value={from} onChange={e => setFrom(e.target.value)} placeholder="e.g. Nasr City, Cairo" />
              <Inp label="🏁 Destination area"     value={to}   onChange={e => setTo(e.target.value)}   placeholder="e.g. Maadi, Cairo" />
              <button onClick={searchTrips} disabled={searching} style={{ ...btnPrimary, opacity: searching ? .6:1 }}>
                {searching ? 'Searching…' : '🔍 Find trips near me'}
              </button>
            </div>

            {matchedTrips.length > 0 && (
              <div>
                <p style={sectSt}>{matchedTrips.length} trip{matchedTrips.length !== 1 ? 's':''} found near you</p>
                {matchedTrips.map(t => {
                  const avail = t.total_seats - t.booked_seats;
                  return (
                    <div key={t.id} onClick={() => openTrip(t)}
                      style={{ ...card, marginBottom:12, cursor:'pointer' }}>
                      <div style={{ display:'flex', alignItems:'center', marginBottom:10 }}>
                        <Badge type={avail <= 0 ? 'red' : avail <= 3 ? 'amber' : 'green'}>
                          {avail <= 0 ? 'Full' : `${avail} seats left`}
                        </Badge>
                        <span style={{ marginLeft:'auto', fontSize:11, color:C.text3 }}>{fmtDate(t.date)}</span>
                      </div>

                      <div style={{ display:'flex', gap:16 }}>
                        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', paddingTop:3 }}>
                          <div style={{ width:8, height:8, borderRadius:'50%', background:C.green }} />
                          <div style={{ width:1, height:28, background:C.border2, margin:'4px 0' }} />
                          <div style={{ width:8, height:8, borderRadius:'50%', background:C.blue }} />
                        </div>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:14, fontWeight:500, marginBottom:2 }}>{t.from_loc}</div>
                          {/* Nearby pickup stop */}
                          {t.bestPickup && (
                            <div style={{ fontSize:11, color:C.green, marginBottom:6, display:'flex', alignItems:'center', gap:6 }}>
                              🟢 Pickup: <b>{t.bestPickup.label || 'Pickup point'}</b>
                              {t.bestPickupDist > 0 && <span style={{ color:C.text3 }}>· {formatDist(t.bestPickupDist)} from you · {estimateWalkTime(t.bestPickupDist)}</span>}
                            </div>
                          )}
                          <div style={{ fontSize:14, fontWeight:500, marginBottom:2 }}>{t.to_loc}</div>
                          {/* Nearby dropoff stop */}
                          {t.bestDropoff && (
                            <div style={{ fontSize:11, color:C.blue, display:'flex', alignItems:'center', gap:6 }}>
                              🔵 Drop-off: <b>{t.bestDropoff.label || 'Drop-off point'}</b>
                              {t.bestDropoffDist > 0 && <span style={{ color:C.text3 }}>· {formatDist(t.bestDropoffDist)} from destination</span>}
                            </div>
                          )}
                        </div>
                        <div style={{ textAlign:'right' }}>
                          <div style={{ fontSize:22, fontWeight:300, color:C.green }}>{t.price}</div>
                          <div style={{ fontSize:10, color:C.text3 }}>EGP/seat</div>
                          <div style={{ marginTop:4, fontSize:11, color:C.text3 }}>{t.pickup_time}</div>
                          <div style={{ marginTop:4, fontSize:12, color:C.amber }}>★ {parseFloat(t.avg_rating).toFixed(1)}</div>
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
        {tab === 'search' && sub === 'detail' && selTrip && (
          <div>
            <button onClick={() => setSub(null)} style={{ ...btnSm, marginBottom:20 }}>← Back</button>
            <h2 style={{ fontSize:20, fontWeight:400, marginBottom:4 }}>{selTrip.from_loc} → {selTrip.to_loc}</h2>
            <p style={{ color:C.text2, fontSize:13, marginBottom:20 }}>{fmtDate(selTrip.date)}</p>

            <TripMap
              tripId={selTrip.id}
              pickupLat={selPickup?.lat}   pickupLng={selPickup?.lng}
              dropoffLat={selDropoff?.lat} dropoffLng={selDropoff?.lng}
              stops={selTrip.stops || []}
              height={240}
            />

            {/* Pickup & dropoff selection */}
            {(selTrip.stops || []).filter(s => s.type === 'pickup').length > 1 && (
              <div style={{ ...card, marginBottom:14 }}>
                <p style={sectSt}>🟢 Choose your pickup point</p>
                {selTrip.stops.filter(s => s.type === 'pickup').map((s, i) => {
                  const dist = userLocation ? haversineDistance(userLocation.lat, userLocation.lng, parseFloat(s.lat), parseFloat(s.lng)) : null;
                  const isSelected = selPickup?.lat === s.lat && selPickup?.lng === s.lng;
                  return (
                    <div key={i} onClick={() => setSelPickup(s)}
                      style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', borderRadius:8, border:`1px solid ${isSelected ? C.greenBorder : C.border}`, background: isSelected ? C.greenDim : 'transparent', cursor:'pointer', marginBottom:8 }}>
                      <div style={{ width:20, height:20, borderRadius:'50%', background: isSelected ? C.green : C.border2, border:`2px solid ${isSelected ? C.green : C.border}`, flexShrink:0 }} />
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:13, fontWeight:500 }}>{s.label || `Pickup ${i+1}`}</div>
                        {dist !== null && <div style={{ fontSize:11, color:C.text3 }}>{formatDist(dist)} from you · {estimateWalkTime(dist)}</div>}
                      </div>
                      {isSelected && <span style={{ color:C.green, fontSize:16 }}>✓</span>}
                    </div>
                  );
                })}
              </div>
            )}

            {(selTrip.stops || []).filter(s => s.type === 'dropoff').length > 1 && (
              <div style={{ ...card, marginBottom:14 }}>
                <p style={sectSt}>🔵 Choose your drop-off point</p>
                {selTrip.stops.filter(s => s.type === 'dropoff').map((s, i) => {
                  const isSelected = selDropoff?.lat === s.lat && selDropoff?.lng === s.lng;
                  return (
                    <div key={i} onClick={() => setSelDropoff(s)}
                      style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', borderRadius:8, border:`1px solid ${isSelected ? C.blueBorder : C.border}`, background: isSelected ? C.blueDim : 'transparent', cursor:'pointer', marginBottom:8 }}>
                      <div style={{ width:20, height:20, borderRadius:'50%', background: isSelected ? C.blue : C.border2, border:`2px solid ${isSelected ? C.blue : C.border}`, flexShrink:0 }} />
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:13, fontWeight:500 }}>{s.label || `Drop-off ${i+1}`}</div>
                      </div>
                      {isSelected && <span style={{ color:C.blue, fontSize:16 }}>✓</span>}
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ ...card, marginBottom:14 }}>
              <DetailRow label="Pickup area"       val={selTrip.from_loc} />
              {selPickup  && <DetailRow label="Your pickup point"   val={selPickup.label  || `${parseFloat(selPickup.lat).toFixed(4)}, ${parseFloat(selPickup.lng).toFixed(4)}`}  accent={C.green} />}
              {selDropoff && <DetailRow label="Your drop-off point" val={selDropoff.label || `${parseFloat(selDropoff.lat).toFixed(4)}, ${parseFloat(selDropoff.lng).toFixed(4)}`} accent={C.blue} />}
              <DetailRow label="Pickup time"       val={selTrip.pickup_time} accent={C.green} />
              <DetailRow label="Price per seat"    val={`${selTrip.price} EGP`} accent={C.green} />
              <DetailRow label="Driver"            val={selTrip.driver_name} />
              <DetailRow label="License plate"     val={selTrip.driver_plate} />
              <div style={{ display:'flex', justifyContent:'space-between', padding:'10px 0' }}>
                <span style={{ color:C.text2, fontSize:13 }}>Driver rating</span>
                <span style={{ color:C.amber }}><Stars n={parseFloat(selTrip.avg_rating)} /> {parseFloat(selTrip.avg_rating).toFixed(1)}</span>
              </div>
            </div>

            <div style={{ ...card, marginBottom:14 }}>
              <p style={sectSt}>Reserve seats</p>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:20, padding:'12px 0' }}>
                <button onClick={() => setSeats(s => Math.max(1,s-1))} style={{ ...btnSm, width:40, height:40, borderRadius:8, fontSize:18 }}>−</button>
                <span style={{ fontSize:28, fontWeight:300, minWidth:40, textAlign:'center' }}>{seats}</span>
                <button onClick={() => setSeats(s => Math.min(3, Math.min(selTrip.total_seats - selTrip.booked_seats, s+1)))} style={{ ...btnSm, width:40, height:40, borderRadius:8, fontSize:18 }}>+</button>
              </div>
              <p style={{ fontSize:11, color:C.text3, textAlign:'center' }}>Max 3 · {selTrip.total_seats - selTrip.booked_seats} available</p>
            </div>
            <button onClick={confirmBook} disabled={booking || selTrip.total_seats <= selTrip.booked_seats}
              style={{ ...btnPrimary, opacity: (booking || selTrip.total_seats <= selTrip.booked_seats) ? .4:1 }}>
              {booking ? 'Booking…' : selTrip.total_seats <= selTrip.booked_seats ? 'Trip is full' : 'Confirm reservation'}
            </button>
          </div>
        )}

        {/* ── CONFIRMED ── */}
        {tab === 'search' && sub === 'confirmed' && confirmedBooking && (
          <div style={{ textAlign:'center', padding:'20px 0' }}>
            <div style={{ width:64, height:64, borderRadius:'50%', background:C.greenDim, border:`1px solid ${C.greenBorder}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:28, margin:'0 auto 20px' }}>✓</div>
            <h2 style={{ fontSize:22, fontWeight:400, marginBottom:8 }}>Booking confirmed!</h2>
            <p style={{ color:C.text2, fontSize:13, marginBottom:28 }}>You'll get a notification when the driver arrives</p>
            <div style={{ ...card, textAlign:'left', marginBottom:20 }}>
              <DetailRow label="Route"       val={`${confirmedBooking.from_loc} → ${confirmedBooking.to_loc}`} />
              <DetailRow label="Date"        val={fmtDate(confirmedBooking.date)} />
              <DetailRow label="Pickup time" val={confirmedBooking.pickup_time} accent={C.green} />
              <DetailRow label="Seats"       val={confirmedBooking.seats} />
              <DetailRow label="Total"       val={`${confirmedBooking.seats * confirmedBooking.price} EGP`} accent={C.green} />
              <DetailRow label="Driver"      val={confirmedBooking.driver_name} />
              <DetailRow label="Plate"       val={confirmedBooking.driver_plate} />
            </div>
            <button onClick={() => { setTab('bookings'); setSub(null); }} style={btnPrimary}>View my bookings</button>
          </div>
        )}

        {/* ── BOOKINGS ── */}
        {tab === 'bookings' && (
          <div>
            {loadingB && <Spinner />}
            {!loadingB && activeBookings.length === 0 && <p style={{ color:C.text2, fontSize:13 }}>No active bookings. Search for a trip above.</p>}
            {activeBookings.map(b => (
              <div key={b.id} style={{ ...card, marginBottom:12 }}>
                <div style={{ display:'flex', alignItems:'center', marginBottom:10 }}>
                  <Badge type="green">Confirmed</Badge>
                  <span style={{ marginLeft:'auto', fontFamily:'monospace', fontSize:11, color:C.text3 }}>#{b.id}</span>
                </div>
                <div style={{ fontSize:16, fontWeight:400, marginBottom:4 }}>{b.from_loc} → {b.to_loc}</div>
                <div style={{ fontSize:12, color:C.text2, marginBottom:14 }}>{fmtDate(b.date)} · Pickup {b.pickup_time}</div>
                <DetailRow label="Driver" val={b.driver_name} />
                <DetailRow label="Plate"  val={b.driver_plate} />
                <DetailRow label="Seats"  val={b.seats} />
                <div style={{ display:'flex', justifyContent:'space-between', padding:'10px 0', borderBottom:`1px solid ${C.border}` }}>
                  <span style={{ color:C.text2, fontSize:13 }}>Total</span>
                  <span style={{ color:C.green, fontWeight:500 }}>{b.seats * b.price} EGP</span>
                </div>

                {/* Checkin status banner */}
                {b.checkin_status === 'picked' && (
                  <div style={{ marginTop:10, padding:'10px 14px', background:C.greenDim, border:`1px solid ${C.greenBorder}`, borderRadius:8, fontSize:13, color:C.green }}>
                    ✅ You've been picked up — driver is heading to your drop-off
                  </div>
                )}
                {b.checkin_status === 'dropped' && (
                  <div style={{ marginTop:10, padding:'10px 14px', background:C.blueDim, border:`1px solid ${C.blueBorder}`, borderRadius:8, fontSize:13, color:C.blue }}>
                    🏁 You've been dropped off
                  </div>
                )}

                {/* Live map */}
                <div style={{ marginTop:14 }}>
                  <TripMap
                    tripId={b.trip_id}
                    stops={b.stops || []}
                    pickupLat={b.pickup_lat}   pickupLng={b.pickup_lng}
                    dropoffLat={b.dropoff_lat} dropoffLng={b.dropoff_lng}
                    checkinStatus={b.checkin_status}
                    height={220}
                  />
                </div>

                <button style={{ ...btnDanger, marginTop:10 }} onClick={() => cancelBooking(b.id)}>Cancel booking</button>
              </div>
            ))}
          </div>
        )}

        {/* ── HISTORY ── */}
        {tab === 'history' && !rateTrip && (
          <div>
            {loadingB && <Spinner />}
            {!loadingB && historyBookings.length === 0 && <p style={{ color:C.text2, fontSize:13 }}>No past trips yet.</p>}
            {historyBookings.map(b => (
              <div key={b.id} style={{ ...card, marginBottom:12 }}>
                <div style={{ display:'flex', alignItems:'center', marginBottom:8 }}>
                  <Badge type={b.status === 'completed' ? 'blue' : 'red'}>{b.status}</Badge>
                  <span style={{ marginLeft:'auto', fontSize:11, color:C.text3 }}>{fmtDate(b.date)}</span>
                </div>
                <div style={{ fontFamily:'monospace', marginBottom:4 }}>{b.from_loc} → {b.to_loc}</div>
                <div style={{ fontSize:12, color:C.text2, marginBottom:10 }}>{b.seats} seats · {b.seats * b.price} EGP</div>
                {b.status === 'completed' && !b.rated && (
                  <button onClick={() => setRateTrip(b)} style={{ ...btnSm, color:C.amber, borderColor:C.amberBorder }}>Rate this trip ★</button>
                )}
                {b.rated && <span style={{ fontSize:12, color:C.amber }}>★ Rated</span>}
              </div>
            ))}
          </div>
        )}

        {/* ── RATE DRIVER ── */}
        {tab === 'history' && rateTrip && (
          <div style={{ textAlign:'center', padding:'20px 0' }}>
            <button onClick={() => setRateTrip(null)} style={{ ...btnSm, display:'block', margin:'0 auto 20px' }}>← Back</button>
            <div style={{ fontSize:48, marginBottom:12 }}>⭐</div>
            <h2 style={{ fontSize:20, fontWeight:400, marginBottom:6 }}>Rate your driver</h2>
            <p style={{ color:C.text2, fontSize:13, marginBottom:24 }}>{rateTrip.driver_name} · {rateTrip.from_loc} → {rateTrip.to_loc}</p>
            <div style={{ marginBottom:20 }}><Stars n={ratingStars} interactive onSet={setRatingStars} /></div>
            <div style={{ marginBottom:16 }}>
              <textarea value={rateComment} onChange={e => setRateComment(e.target.value)}
                style={{ width:'100%', background:C.bg3, border:`1px solid ${C.border}`, borderRadius:8, padding:'11px 14px', color:C.text, fontFamily:"'Sora',sans-serif", fontSize:14, outline:'none', resize:'none', height:80 }}
                placeholder="Leave a comment (optional)" />
            </div>
            <button onClick={submitRating} style={btnPrimary}>Submit rating</button>
          </div>
        )}

      </div>
    </div>
  );
}
