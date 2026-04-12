import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../App.jsx';
import * as api from '../../api.js';
import { C, Tabs, Topbar, Badge, DetailRow, CapBar, Stars, btnPrimary, btnSm, btnDanger, card, fmtDate, Spinner, sectSt } from '../../components/UI.jsx';
import TripMap from '../../components/TripMap.jsx';

const SEARCH_RADIUS_M = 2000; // 2 km

function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
function estimateWalkTime(m) {
  const min = Math.round(m / 80);
  return min < 1 ? '< 1 min walk' : `~${min} min walk`;
}
function formatDist(m) { return m < 1000 ? `${Math.round(m)}m` : `${(m/1000).toFixed(1)}km`; }

// ── Nominatim autocomplete ─────────────────────────────────────────────────────
function NominatimSearch({ label, placeholder, icon, value, onChange }) {
  const [query,    setQuery]    = useState(value?.name || '');
  const [results,  setResults]  = useState([]);
  const [open,     setOpen]     = useState(false);
  const [loading,  setLoading]  = useState(false);
  const debRef  = useRef(null);
  const wrapRef = useRef(null);

  useEffect(() => { if (!value) setQuery(''); }, [value]);

  useEffect(() => {
    const fn = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  function onInput(e) {
    const q = e.target.value;
    setQuery(q);
    onChange(null);
    clearTimeout(debRef.current);
    if (q.length < 2) { setResults([]); setOpen(false); return; }
    debRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        // Use our backend proxy — avoids browser CORS + adds proper User-Agent
        const r = await fetch(`/api/geocode/search?q=${encodeURIComponent(q)}`);
        const d = await r.json();
        const results = Array.isArray(d) ? d : [];
        setResults(results); setOpen(results.length > 0);
      } catch (err) {
        console.error('Geocode error:', err);
        setResults([]);
      } finally { setLoading(false); }
    }, 400);
  }

  function pick(item) {
    const name = [item.address?.neighbourhood || item.address?.suburb || item.address?.city_district || item.name, item.address?.city || item.address?.town, item.address?.state].filter(Boolean).slice(0,3).join(', ') || item.display_name.split(',').slice(0,3).join(',');
    const coord = { lat: parseFloat(item.lat), lng: parseFloat(item.lon), name };
    setQuery(name); setResults([]); setOpen(false);
    onChange(coord);
  }

  return (
    <div ref={wrapRef} style={{ position:'relative', marginBottom:14 }}>
      <label style={{ display:'block', fontSize:12, color:C.text3, marginBottom:6, fontFamily:"'Sora',sans-serif" }}>{icon} {label}</label>
      <div style={{ position:'relative' }}>
        <input
          value={query} onChange={onInput} onFocus={() => results.length && setOpen(true)}
          placeholder={placeholder}
          style={{ width:'100%', boxSizing:'border-box', background:C.bg3, border:`1px solid ${value ? C.greenBorder : C.border}`, borderRadius:8, padding:'10px 36px 10px 14px', color:C.text, fontFamily:"'Sora',sans-serif", fontSize:14, outline:'none' }}
        />
        {loading && <div style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', width:14, height:14, border:`2px solid ${C.border}`, borderTopColor:C.green, borderRadius:'50%', animation:'spin .6s linear infinite' }} />}
        {!loading && value && <span style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', color:C.green, fontSize:14 }}>✓</span>}
      </div>
      {open && results.length > 0 && (
        <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, right:0, zIndex:9999, background:C.bg3, border:`1px solid ${C.border}`, borderRadius:8, boxShadow:'0 8px 32px rgba(0,0,0,.55)', overflow:'hidden' }}>
          {results.map((item, i) => {
            const addr = item.address || {};
            const main = [addr.neighbourhood || addr.suburb || addr.city_district || item.name, addr.city || addr.town].filter(Boolean).slice(0,2).join(', ') || item.display_name.split(',').slice(0,2).join(',');
            const sub  = item.display_name.split(',').slice(1,4).join(',');
            return (
              <div key={item.place_id || i} onMouseDown={() => pick(item)}
                style={{ padding:'10px 14px', cursor:'pointer', borderBottom:`1px solid ${C.border}`, fontFamily:"'Sora',sans-serif" }}
                onMouseEnter={e => e.currentTarget.style.background=C.bg4} onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                <div style={{ fontSize:13, color:C.text }}>{main}</div>
                <div style={{ fontSize:10, color:C.text3, marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{sub}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function PassengerDash() {
  const { user, logout, notify } = useAuth();
  const [tab, setTab] = useState('search');
  const [sub, setSub] = useState(null);

  const [fromCoord,    setFromCoord]    = useState(null);
  const [toCoord,      setToCoord]      = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [locationStatus, setLocationStatus] = useState('');
  const [matchedTrips, setMatchedTrips] = useState([]);
  const [searching,    setSearching]    = useState(false);

  const [selTrip,          setSelTrip]          = useState(null);
  const [selPickup,        setSelPickup]        = useState(null);
  const [selDropoff,       setSelDropoff]       = useState(null);
  const [seats,            setSeats]            = useState(1);
  const [booking,          setBooking]          = useState(false);
  const [confirmedBooking, setConfirmedBooking] = useState(null);

  const [myBookings, setMyBookings] = useState([]);
  const [loadingB,   setLoadingB]   = useState(false);

  const [rateTrip,    setRateTrip]    = useState(null);
  const [ratingStars, setRatingStars] = useState(0);
  const [rateComment, setRateComment] = useState('');

  const [notifs,    setNotifs]    = useState([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const unread = notifs.filter(n => !n.is_read).length;

  useEffect(() => { loadNotifs(); requestLocation(); }, []);

  async function loadNotifs() { try { setNotifs(await api.getNotifications()); } catch {} }
  async function openNotifs() {
    setNotifOpen(true);
    try { await api.markNotifRead(); setNotifs(n => n.map(x => ({ ...x, is_read:1 }))); } catch {}
  }

  function requestLocation() {
    if (!navigator.geolocation) { setLocationStatus('GPS not available'); return; }
    setLocationStatus('Getting your location…');
    navigator.geolocation.getCurrentPosition(
      pos => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLocation(loc);
        setLocationStatus('📍 Location found');
        setFromCoord(prev => prev || { ...loc, name: 'My current location' });
      },
      () => setLocationStatus('Location denied — type your area below'),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  async function searchTrips() {
    const effectiveFrom = fromCoord || userLocation;
    if (!toCoord) { notify('Enter destination', 'Select a destination from the dropdown.', 'error'); return; }
    setSearching(true); setMatchedTrips([]);
    try {
      const all = await api.getTrips();
      const enriched = [];
      for (const trip of all) {
        const stops        = trip.stops || [];
        const pickupStops  = stops.filter(s => s.type === 'pickup');
        const dropoffStops = stops.filter(s => s.type === 'dropoff');

        let bestPickup = null, bestPickupDist = Infinity;
        if (effectiveFrom) {
          for (const ps of pickupStops) {
            const d = haversineDistance(effectiveFrom.lat, effectiveFrom.lng, parseFloat(ps.lat), parseFloat(ps.lng));
            if (d < bestPickupDist && d <= SEARCH_RADIUS_M) { bestPickupDist = d; bestPickup = { ...ps, distFromUser: d }; }
          }
        } else { bestPickup = pickupStops[0] || null; bestPickupDist = 0; }

        let bestDropoff = null, bestDropoffDist = Infinity;
        for (const ds of dropoffStops) {
          const d = haversineDistance(toCoord.lat, toCoord.lng, parseFloat(ds.lat), parseFloat(ds.lng));
          if (d < bestDropoffDist && d <= SEARCH_RADIUS_M) { bestDropoffDist = d; bestDropoff = { ...ds, distFromDest: d }; }
        }

        if (bestPickup && bestDropoff)
          enriched.push({ ...trip, bestPickup, bestDropoff, bestPickupDist, bestDropoffDist });
      }
      enriched.sort((a, b) => a.bestPickupDist - b.bestPickupDist);
      setMatchedTrips(enriched);
      if (!enriched.length) notify('No trips found', 'No trips with stops within 2km of those locations.', 'info');
    } catch(e) { notify('Error', e.message, 'error'); }
    finally { setSearching(false); }
  }

  async function loadBookings() {
    setLoadingB(true);
    try {
      const bks = await api.getMyBookings();
      const enriched = await Promise.all(bks.map(async b => {
        try { const d = await api.getTrip(b.trip_id); return { ...b, stops: d.stops || [] }; }
        catch { return { ...b, stops: [] }; }
      }));
      setMyBookings(enriched);
    } catch {} finally { setLoadingB(false); }
  }

  useEffect(() => { if (tab === 'bookings' || tab === 'history') loadBookings(); }, [tab]);

  function openTrip(trip) { setSelTrip(trip); setSelPickup(trip.bestPickup||null); setSelDropoff(trip.bestDropoff||null); setSeats(1); setSub('detail'); }

  async function confirmBook() {
    const avail = selTrip.total_seats - selTrip.booked_seats;
    if (seats > avail) { notify('Not enough seats', `Only ${avail} available.`, 'error'); return; }
    setBooking(true);
    try {
      const b = await api.bookTrip({ trip_id: selTrip.id, seats, pickup_note: fromCoord?.name || selPickup?.label || '' });
      setConfirmedBooking(b); setSub('confirmed');
      notify('Booking confirmed!', `Pickup at ${selTrip.pickup_time}`);
    } catch(e) { notify('Error', e.message, 'error'); } finally { setBooking(false); }
  }

  async function cancelBooking(id) {
    try { await api.cancelBooking(id); notify('Booking cancelled', ''); loadBookings(); }
    catch(e) { notify('Error', e.message, 'error'); }
  }

  async function submitRating() {
    if (!ratingStars) { notify('Pick stars', 'Tap a star to rate.', 'error'); return; }
    try {
      await api.submitRating({ trip_id: rateTrip.trip_id, stars: ratingStars, comment: rateComment });
      notify('Rating submitted!', `${ratingStars} stars — thank you!`);
      setRateTrip(null); setRatingStars(0); setRateComment(''); loadBookings();
    } catch(e) { notify('Error', e.message, 'error'); }
  }

  const activeBookings  = myBookings.filter(b => b.status === 'confirmed');
  const historyBookings = myBookings.filter(b => b.status === 'completed' || b.status === 'cancelled');

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
            {notifs.length === 0 && <p style={{ color:C.text2, fontSize:13 }}>No notifications.</p>}
            {notifs.map(n => (
              <div key={n.id} style={{ padding:'10px 0', borderBottom:`1px solid ${C.border}`, fontSize:13, color: n.is_read ? C.text2 : C.text }}>
                {n.message} <span style={{ fontSize:11, color:C.text3, marginLeft:8 }}>{fmtDate(n.created_at)}</span>
              </div>
            ))}
          </div>
        )}

        <Tabs tabs={[{id:'search',label:'Search trips'},{id:'bookings',label:`Bookings (${activeBookings.length})`},{id:'history',label:'History'}]}
          active={tab} onSet={t => { setTab(t); setSub(null); }} />

        {/* ── SEARCH ── */}
        {tab === 'search' && sub === null && (
          <div>
            <div style={{ ...card, marginBottom:20 }}>
              {/* GPS bar */}
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16, fontSize:12,
                color: userLocation ? C.green : C.text3, background: userLocation ? C.greenDim : C.bg4,
                border:`1px solid ${userLocation ? C.greenBorder : C.border}`, borderRadius:8, padding:'8px 12px' }}>
                <span>{userLocation ? '📍' : '📵'}</span>
                <span style={{ flex:1 }}>{locationStatus || 'Detecting location…'}</span>
                {!userLocation && (
                  <button onClick={requestLocation}
                    style={{ background:C.greenDim, color:C.green, border:`1px solid ${C.greenBorder}`, borderRadius:5, padding:'3px 10px', fontSize:11, cursor:'pointer', fontFamily:"'Sora',sans-serif" }}>
                    Enable GPS
                  </button>
                )}
              </div>

              <NominatimSearch label="Your location / pickup area" placeholder="e.g. Nasr City, Maadi…" icon="🟢" value={fromCoord} onChange={setFromCoord} />
              <NominatimSearch label="Destination area" placeholder="e.g. Maadi, New Cairo, Downtown…" icon="🔵" value={toCoord} onChange={setToCoord} />

              <p style={{ fontSize:11, color:C.text3, marginBottom:14 }}>
                📏 Shows trips with pickup & drop-off stops within <b style={{ color:C.amber }}>2km</b> of your selected locations
              </p>

              <button onClick={searchTrips} disabled={searching || !toCoord}
                style={{ ...btnPrimary, opacity: (searching || !toCoord) ? .5 : 1 }}>
                {searching ? 'Searching…' : '🔍 Find trips near me'}
              </button>
            </div>

            {matchedTrips.length > 0 && (
              <div>
                <p style={sectSt}>{matchedTrips.length} trip{matchedTrips.length !== 1?'s':''} with nearby stops</p>
                {matchedTrips.map(t => {
                  const avail = t.total_seats - t.booked_seats;
                  return (
                    <div key={t.id} onClick={() => openTrip(t)} style={{ ...card, marginBottom:12, cursor:'pointer' }}>
                      <div style={{ display:'flex', alignItems:'center', marginBottom:10 }}>
                        <Badge type={avail<=0?'red':avail<=3?'amber':'green'}>{avail<=0?'Full':`${avail} seats left`}</Badge>
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
                          {t.bestPickup && (
                            <div style={{ fontSize:11, color:C.green, marginBottom:8, display:'flex', alignItems:'center', gap:5, flexWrap:'wrap' }}>
                              🟢 <b>{t.bestPickup.label || 'Pickup point'}</b>
                              {t.bestPickupDist > 0 && <span style={{ color:C.text3 }}>· {formatDist(t.bestPickupDist)} · {estimateWalkTime(t.bestPickupDist)}</span>}
                            </div>
                          )}
                          <div style={{ fontSize:14, fontWeight:500, marginBottom:2 }}>{t.to_loc}</div>
                          {t.bestDropoff && (
                            <div style={{ fontSize:11, color:C.blue, display:'flex', alignItems:'center', gap:5, flexWrap:'wrap' }}>
                              🔵 <b>{t.bestDropoff.label || 'Drop-off point'}</b>
                              {t.bestDropoffDist > 0 && <span style={{ color:C.text3 }}>· {formatDist(t.bestDropoffDist)} from destination</span>}
                            </div>
                          )}
                        </div>
                        <div style={{ textAlign:'right', flexShrink:0 }}>
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
            <TripMap tripId={selTrip.id} pickupLat={selPickup?.lat} pickupLng={selPickup?.lng}
              dropoffLat={selDropoff?.lat} dropoffLng={selDropoff?.lng} stops={selTrip.stops||[]} height={240} />

            {(selTrip.stops||[]).filter(s=>s.type==='pickup').length > 1 && (
              <div style={{ ...card, marginBottom:14 }}>
                <p style={sectSt}>🟢 Choose your pickup point</p>
                {selTrip.stops.filter(s=>s.type==='pickup').map((s,i) => {
                  const dist = userLocation ? haversineDistance(userLocation.lat,userLocation.lng,parseFloat(s.lat),parseFloat(s.lng)) : null;
                  const sel  = selPickup?.lat===s.lat && selPickup?.lng===s.lng;
                  return (
                    <div key={i} onClick={() => setSelPickup(s)}
                      style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', borderRadius:8, marginBottom:8, cursor:'pointer',
                        border:`1px solid ${sel?C.greenBorder:C.border}`, background: sel?C.greenDim:'transparent' }}>
                      <div style={{ width:20, height:20, borderRadius:'50%', flexShrink:0, background:sel?C.green:C.border2, border:`2px solid ${sel?C.green:C.border}` }} />
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:13, fontWeight:500 }}>{s.label||`Pickup ${i+1}`}</div>
                        {dist!==null && <div style={{ fontSize:11, color:C.text3 }}>{formatDist(dist)} · {estimateWalkTime(dist)}</div>}
                      </div>
                      {sel && <span style={{ color:C.green }}>✓</span>}
                    </div>
                  );
                })}
              </div>
            )}

            {(selTrip.stops||[]).filter(s=>s.type==='dropoff').length > 1 && (
              <div style={{ ...card, marginBottom:14 }}>
                <p style={sectSt}>🔵 Choose your drop-off point</p>
                {selTrip.stops.filter(s=>s.type==='dropoff').map((s,i) => {
                  const sel = selDropoff?.lat===s.lat && selDropoff?.lng===s.lng;
                  return (
                    <div key={i} onClick={() => setSelDropoff(s)}
                      style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', borderRadius:8, marginBottom:8, cursor:'pointer',
                        border:`1px solid ${sel?C.blueBorder:C.border}`, background: sel?C.blueDim:'transparent' }}>
                      <div style={{ width:20, height:20, borderRadius:'50%', flexShrink:0, background:sel?C.blue:C.border2, border:`2px solid ${sel?C.blue:C.border}` }} />
                      <div style={{ flex:1 }}><div style={{ fontSize:13, fontWeight:500 }}>{s.label||`Drop-off ${i+1}`}</div></div>
                      {sel && <span style={{ color:C.blue }}>✓</span>}
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ ...card, marginBottom:14 }}>
              <DetailRow label="Pickup area"    val={selTrip.from_loc} />
              {selPickup  && <DetailRow label="Your pickup"   val={selPickup.label  || `${parseFloat(selPickup.lat).toFixed(4)}, ${parseFloat(selPickup.lng).toFixed(4)}`}  accent={C.green} />}
              {selDropoff && <DetailRow label="Your drop-off" val={selDropoff.label || `${parseFloat(selDropoff.lat).toFixed(4)}, ${parseFloat(selDropoff.lng).toFixed(4)}`} accent={C.blue} />}
              <DetailRow label="Pickup time"   val={selTrip.pickup_time} accent={C.green} />
              <DetailRow label="Price/seat"    val={`${selTrip.price} EGP`} accent={C.green} />
              <DetailRow label="Driver"        val={selTrip.driver_name} />
              <DetailRow label="Plate"         val={selTrip.driver_plate} />
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
              <p style={{ fontSize:11, color:C.text3, textAlign:'center' }}>Max 3 · {selTrip.total_seats - selTrip.booked_seats} available</p>
            </div>
            <button onClick={confirmBook} disabled={booking || selTrip.total_seats <= selTrip.booked_seats}
              style={{ ...btnPrimary, opacity:(booking||selTrip.total_seats<=selTrip.booked_seats)?.4:1 }}>
              {booking ? 'Booking…' : selTrip.total_seats<=selTrip.booked_seats ? 'Trip is full' : 'Confirm reservation'}
            </button>
          </div>
        )}

        {/* ── CONFIRMED ── */}
        {tab === 'search' && sub === 'confirmed' && confirmedBooking && (
          <div style={{ textAlign:'center', padding:'20px 0' }}>
            <div style={{ width:64, height:64, borderRadius:'50%', background:C.greenDim, border:`1px solid ${C.greenBorder}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:28, margin:'0 auto 20px' }}>✓</div>
            <h2 style={{ fontSize:22, fontWeight:400, marginBottom:8 }}>Booking confirmed!</h2>
            <p style={{ color:C.text2, fontSize:13, marginBottom:28 }}>You'll get a notification when the driver arrives at your pickup point</p>
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
            {!loadingB && activeBookings.length === 0 && <p style={{ color:C.text2, fontSize:13 }}>No active bookings.</p>}
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
                {b.checkin_status === 'picked' && (
                  <div style={{ marginTop:10, padding:'12px 14px', background:C.greenDim, border:`1px solid ${C.greenBorder}`, borderRadius:8, fontSize:13, color:C.green }}>
                    ✅ You've been picked up — driver is heading to your drop-off
                    {(b.stops||[]).find(s=>s.type==='dropoff') && (
                      <div style={{ marginTop:4, fontSize:11, color:C.text2 }}>Drop-off: <b>{(b.stops||[]).find(s=>s.type==='dropoff').label || 'Drop-off point'}</b></div>
                    )}
                  </div>
                )}
                {b.checkin_status === 'dropped' && (
                  <div style={{ marginTop:10, padding:'10px 14px', background:C.blueDim, border:`1px solid ${C.blueBorder}`, borderRadius:8, fontSize:13, color:C.blue }}>
                    🏁 You've been dropped off
                  </div>
                )}
                <div style={{ marginTop:14 }}>
                  <TripMap tripId={b.trip_id} stops={b.stops||[]} pickupLat={b.pickup_lat} pickupLng={b.pickup_lng}
                    dropoffLat={b.dropoff_lat} dropoffLng={b.dropoff_lng} checkinStatus={b.checkin_status} height={220} />
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
                  <Badge type={b.status==='completed'?'blue':'red'}>{b.status}</Badge>
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

        {/* ── RATE ── */}
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
