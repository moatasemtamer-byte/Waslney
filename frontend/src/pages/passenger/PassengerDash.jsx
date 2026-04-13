import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../App.jsx';
import * as api from '../../api.js';
import { C, Tabs, Topbar, Badge, DetailRow, CapBar, Stars, btnPrimary, btnSm, btnDanger, card, fmtDate, Spinner, sectSt } from '../../components/UI.jsx';
import TripMap, { ProximityMap } from '../../components/TripMap.jsx';

const SEARCH_RADIUS_M = 10000; // 10 km — wide enough for city-level matching

function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
function estimateWalkTime(m) {
  const min = Math.round(m / 80);
  return min < 1 ? '< 1 min walk' : '~' + min + ' min walk';
}
function formatDist(m) { return m < 1000 ? Math.round(m) + 'm' : (m/1000).toFixed(1) + 'km'; }

// Photon geocoder — CORS-enabled, no key, OSM-backed, Egypt bbox
async function photonSearch(q) {
  if (!q || q.trim().length < 2) return [];
  try {
    // Egypt bounding box: west,south,east,north
    const url = 'https://photon.komoot.io/api/?q=' + encodeURIComponent(q) +
      '&limit=7&lang=en&bbox=24.6,22.0,36.9,31.7';
    const r = await fetch(url);
    const data = await r.json();
    if (!data.features || !data.features.length) return [];
    return data.features.map(f => ({
      place_id: f.properties.osm_id,
      lat: f.geometry.coordinates[1],
      lng: f.geometry.coordinates[0],
      name: buildName(f.properties),
      type: f.properties.type || f.properties.osm_key || '',
      city: f.properties.city || f.properties.county || '',
      raw: f.properties,
    }));
  } catch (err) {
    console.error('Photon search error:', err);
    return [];
  }
}

// Reverse geocode a lat/lng to a human-readable street + city name
async function reverseGeocode(lat, lng) {
  try {
    const url = 'https://photon.komoot.io/reverse?lat=' + lat + '&lon=' + lng + '&limit=1&lang=en';
    const r = await fetch(url);
    const data = await r.json();
    if (!data.features || !data.features.length) return null;
    return buildName(data.features[0].properties);
  } catch { return null; }
}

function buildName(p) {
  const parts = [
    p.name,
    p.street ? (p.housenumber ? p.housenumber + ' ' + p.street : p.street) : null,
    p.district || p.suburb || p.neighbourhood || p.city_district,
    p.city || p.town || p.county,
  ].filter(Boolean);
  // Remove duplicates
  const seen = new Set();
  return parts.filter(x => { if (seen.has(x)) return false; seen.add(x); return true; }).slice(0,3).join(', ');
}

// ── Autocomplete search input component ─────────────────────────────────────
function PlaceSearch({ label, placeholder, icon, value, onChange }) {
  const [query,   setQuery]   = useState(value?.name || '');
  const [results, setResults] = useState([]);
  const [open,    setOpen]    = useState(false);
  const [loading, setLoading] = useState(false);
  const [noRes,   setNoRes]   = useState(false);
  const debRef   = useRef(null);
  const inputRef = useRef(null);
  const listRef  = useRef(null);
  const [pos, setPos] = useState({ top:0, left:0, width:300 });

  useEffect(() => { if (!value) setQuery(''); }, [value]);

  useEffect(() => {
    const close = (e) => {
      if (inputRef.current && !inputRef.current.contains(e.target) &&
          listRef.current  && !listRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  function measure() {
    if (!inputRef.current) return;
    const r = inputRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + window.scrollY + 4, left: r.left + window.scrollX, width: r.width });
  }

  function onInput(e) {
    const q = e.target.value;
    setQuery(q); onChange(null); setNoRes(false);
    clearTimeout(debRef.current);
    if (q.length < 2) { setResults([]); setOpen(false); return; }
    debRef.current = setTimeout(async () => {
      setLoading(true);
      const list = await photonSearch(q);
      setLoading(false);
      setResults(list); setNoRes(list.length === 0);
      if (list.length > 0) { measure(); setOpen(true); } else setOpen(false);
    }, 350);
  }

  function pick(item) {
    setQuery(item.name); setResults([]); setOpen(false); setNoRes(false);
    onChange({ lat: item.lat, lng: item.lng, name: item.name });
  }

  return (
    <div style={{ marginBottom:14 }}>
      <label style={{ display:'block', fontSize:12, color:C.text3, marginBottom:6, fontFamily:"'Sora',sans-serif" }}>
        {icon} {label}
      </label>
      <div ref={inputRef} style={{ position:'relative' }}>
        <input
          value={query} onChange={onInput} onFocus={() => { if (results.length) { measure(); setOpen(true); } }}
          placeholder={placeholder}
          style={{ width:'100%', boxSizing:'border-box', background:C.bg3,
            border:'1px solid ' + (value ? C.greenBorder : C.border),
            borderRadius:8, padding:'11px 42px 11px 14px',
            color:C.text, fontFamily:"'Sora',sans-serif", fontSize:14, outline:'none' }}
        />
        {loading && <div style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', width:14, height:14, border:'2px solid '+C.border, borderTopColor:C.green, borderRadius:'50%', animation:'spin .6s linear infinite' }} />}
        {!loading && value  && <span style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', color:C.green, fontSize:16 }}>✓</span>}
        {!loading && !value && noRes && query.length >= 2 && <span style={{ position:'absolute', right:8, top:'50%', transform:'translateY(-50%)', color:C.red, fontSize:10 }}>no results</span>}
      </div>

      {open && results.length > 0 && (
        <div ref={listRef} style={{ position:'fixed', top:pos.top, left:pos.left, width:pos.width, zIndex:99999, background:C.bg3, border:'1px solid '+C.greenBorder, borderRadius:8, boxShadow:'0 12px 40px rgba(0,0,0,.8)', maxHeight:260, overflowY:'auto' }}>
          {results.map((item, i) => (
            <div key={item.place_id || i}
              onMouseDown={(e) => { e.preventDefault(); pick(item); }}
              style={{ padding:'10px 14px', cursor:'pointer', borderBottom:'1px solid '+C.border, fontFamily:"'Sora',sans-serif" }}
              onMouseEnter={e => e.currentTarget.style.background = C.bg4}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <span style={{ fontSize:13, color:C.text, flex:1 }}>{item.name}</span>
                {item.type && <span style={{ fontSize:9, color:C.text3, background:C.bg4, border:'1px solid '+C.border, borderRadius:3, padding:'1px 5px', whiteSpace:'nowrap' }}>{item.type}</span>}
              </div>
              {item.city && <div style={{ fontSize:10, color:C.text3, marginTop:1 }}>{item.city}</div>}
            </div>
          ))}
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

  const [fromCoord,    setFromCoord]    = useState(null); // { lat, lng, name }
  const [toCoord,      setToCoord]      = useState(null);
  const [userLocation, setUserLocation] = useState(null); // { lat, lng }
  const [locationLabel, setLocationLabel] = useState('Detecting your location…');
  const [matchedTrips, setMatchedTrips]  = useState([]);
  const [searching,    setSearching]     = useState(false);

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
    if (!navigator.geolocation) { setLocationLabel('GPS not available'); return; }
    setLocationLabel('Getting your location…');
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLocation(loc);
        // Reverse geocode to show street name
        const name = await reverseGeocode(loc.lat, loc.lng);
        const label = name || ('GPS: ' + loc.lat.toFixed(4) + ', ' + loc.lng.toFixed(4));
        setLocationLabel('📍 ' + label);
        setFromCoord(prev => prev || { ...loc, name: name || 'My location' });
      },
      () => setLocationLabel('Location denied — type your area below'),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  async function searchTrips() {
    if (!toCoord) { notify('Enter destination', 'Select a place from the dropdown suggestions.', 'error'); return; }
    const effectiveFrom = fromCoord || userLocation;
    setSearching(true); setMatchedTrips([]);
    try {
      const all = await api.getTrips();
      console.log('[Search] total trips from API:', all.length);
      console.log('[Search] effectiveFrom:', effectiveFrom);
      console.log('[Search] toCoord:', toCoord);
      const enriched = [];

      // Normalize text for loose matching
      const norm = s => (s||'').toLowerCase().replace(/[,،\-_]/g,' ').replace(/\s+/g,' ').trim();
      // Extract meaningful words (3+ chars) from a place name
      const keywords = name => norm(name).split(' ').filter(w => w.length >= 3);
      const nameContains = (haystack, needleWords) => needleWords.some(w => norm(haystack).includes(w));

      const fromWords = keywords(fromCoord?.name || '');
      const toWords   = keywords(toCoord?.name   || '');

      for (const trip of all) {
        const stops        = trip.stops || [];
        const pickupStops  = stops.filter(s => s.type === 'pickup');
        const dropoffStops = stops.filter(s => s.type === 'dropoff');

        console.log(`[Trip ${trip.id}] ${trip.from_loc} → ${trip.to_loc} | pickups: ${pickupStops.length} dropoffs: ${dropoffStops.length}`);
        if (pickupStops.length) console.log('  pickup stops:', pickupStops.map(s => `(${s.lat},${s.lng})`));
        if (dropoffStops.length) console.log('  dropoff stops:', dropoffStops.map(s => `(${s.lat},${s.lng})`));

        // ── PICKUP MATCHING (3 levels) ──
        let bestPickup = null, bestPickupDist = 0;

        // Level 1: GPS proximity to any pickup stop
        if (effectiveFrom && pickupStops.length) {
          let minD = Infinity;
          for (const ps of pickupStops) {
            const d = haversineDistance(effectiveFrom.lat, effectiveFrom.lng, parseFloat(ps.lat), parseFloat(ps.lng));
            if (d < minD) { minD = d; bestPickup = { ...ps, distFromUser: d }; bestPickupDist = d; }
          }
          if (minD > SEARCH_RADIUS_M) { bestPickup = null; } // too far
          console.log(`  pickup GPS closest: ${minD.toFixed(0)}m — ${minD <= SEARCH_RADIUS_M ? 'MATCH' : 'too far'}`);
        }

        // Level 2: trip from_loc text matches passenger search area
        if (!bestPickup && fromWords.length) {
          const match = nameContains(trip.from_loc, fromWords);
          console.log(`  pickup name match "${trip.from_loc}" vs [${fromWords}]: ${match}`);
          if (match) {
            bestPickup = pickupStops[0] || { type:'pickup', lat: trip.pickup_lat, lng: trip.pickup_lng, label: trip.from_loc };
            bestPickupDist = (effectiveFrom && bestPickup?.lat)
              ? haversineDistance(effectiveFrom.lat, effectiveFrom.lng, parseFloat(bestPickup.lat), parseFloat(bestPickup.lng))
              : 0;
          }
        }

        // Level 3: no stops at all — use trip pickup_lat/lng
        if (!bestPickup && trip.pickup_lat && effectiveFrom) {
          const d = haversineDistance(effectiveFrom.lat, effectiveFrom.lng, parseFloat(trip.pickup_lat), parseFloat(trip.pickup_lng));
          if (d <= SEARCH_RADIUS_M) {
            bestPickup = { type:'pickup', lat: trip.pickup_lat, lng: trip.pickup_lng, label: trip.from_loc };
            bestPickupDist = d;
          }
        }

        // ── DROPOFF MATCHING (3 levels) ──
        let bestDropoff = null, bestDropoffDist = 0;

        // Level 1: GPS proximity to any dropoff stop
        if (dropoffStops.length) {
          let minD = Infinity;
          for (const ds of dropoffStops) {
            const d = haversineDistance(toCoord.lat, toCoord.lng, parseFloat(ds.lat), parseFloat(ds.lng));
            if (d < minD) { minD = d; bestDropoff = { ...ds, distFromDest: d }; bestDropoffDist = d; }
          }
          if (minD > SEARCH_RADIUS_M) { bestDropoff = null; }
          console.log(`  dropoff GPS closest: ${minD.toFixed(0)}m — ${minD <= SEARCH_RADIUS_M ? 'MATCH' : 'too far'}`);
        }

        // Level 2: trip to_loc text matches destination
        if (!bestDropoff && toWords.length) {
          const match = nameContains(trip.to_loc, toWords);
          console.log(`  dropoff name match "${trip.to_loc}" vs [${toWords}]: ${match}`);
          if (match) {
            bestDropoff = dropoffStops[0] || { type:'dropoff', lat: trip.dropoff_lat, lng: trip.dropoff_lng, label: trip.to_loc };
            bestDropoffDist = (bestDropoff?.lat)
              ? haversineDistance(toCoord.lat, toCoord.lng, parseFloat(bestDropoff.lat), parseFloat(bestDropoff.lng))
              : 0;
          }
        }

        // Level 3: no stops — use trip dropoff_lat/lng
        if (!bestDropoff && trip.dropoff_lat) {
          const d = haversineDistance(toCoord.lat, toCoord.lng, parseFloat(trip.dropoff_lat), parseFloat(trip.dropoff_lng));
          if (d <= SEARCH_RADIUS_M) {
            bestDropoff = { type:'dropoff', lat: trip.dropoff_lat, lng: trip.dropoff_lng, label: trip.to_loc };
            bestDropoffDist = d;
          }
        }

        console.log(`  RESULT: pickup=${!!bestPickup} dropoff=${!!bestDropoff}`);
        if (bestPickup && bestDropoff) {
          enriched.push({ ...trip, bestPickup, bestDropoff, bestPickupDist, bestDropoffDist });
        }
      }

      enriched.sort((a, b) => (a.bestPickupDist||0) - (b.bestPickupDist||0));
      setMatchedTrips(enriched);
      if (!enriched.length) notify('No trips found', 'Try a broader area or different destination.', 'info');
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

  function openTrip(trip) {
    setSelTrip(trip); setSelPickup(trip.bestPickup || null); setSelDropoff(trip.bestDropoff || null); setSeats(1); setSub('detail');
  }

  async function confirmBook() {
    const avail = selTrip.total_seats - selTrip.booked_seats;
    if (seats > avail) { notify('Not enough seats', 'Only ' + avail + ' available.', 'error'); return; }
    setBooking(true);
    try {
      const b = await api.bookTrip({ trip_id: selTrip.id, seats, pickup_note: fromCoord?.name || selPickup?.label || '' });
      setConfirmedBooking(b); setSub('confirmed');
      notify('Booking confirmed!', 'Pickup at ' + selTrip.pickup_time);
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
      notify('Rating submitted!', ratingStars + ' stars — thank you!');
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
              <div key={n.id} style={{ padding:'10px 0', borderBottom:'1px solid '+C.border, fontSize:13, color: n.is_read ? C.text2 : C.text }}>
                {n.message} <span style={{ fontSize:11, color:C.text3, marginLeft:8 }}>{fmtDate(n.created_at)}</span>
              </div>
            ))}
          </div>
        )}

        <Tabs tabs={[{id:'search',label:'Search trips'},{id:'bookings',label:'Bookings ('+activeBookings.length+')'},{id:'history',label:'History'}]}
          active={tab} onSet={t => { setTab(t); setSub(null); }} />

        {/* ── SEARCH ── */}
        {tab === 'search' && sub === null && (
          <div>
            <div style={{ ...card, marginBottom:20 }}>
              {/* GPS location label — shows actual street name */}
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16, fontSize:12,
                color: userLocation ? C.green : C.text3, background: userLocation ? C.greenDim : C.bg4,
                border:'1px solid '+(userLocation ? C.greenBorder : C.border), borderRadius:8, padding:'8px 12px' }}>
                <span style={{ flex:1 }}>{locationLabel}</span>
                {!userLocation && (
                  <button onClick={requestLocation}
                    style={{ background:C.greenDim, color:C.green, border:'1px solid '+C.greenBorder, borderRadius:5, padding:'3px 10px', fontSize:11, cursor:'pointer', fontFamily:"'Sora',sans-serif" }}>
                    Enable GPS
                  </button>
                )}
              </div>

              <PlaceSearch
                label="Your location / pickup area"
                placeholder="e.g. Nasr City, Giza, Heliopolis…"
                icon="🟢"
                value={fromCoord}
                onChange={setFromCoord}
              />
              <PlaceSearch
                label="Destination / drop-off area"
                placeholder="e.g. Maadi, New Cairo, Downtown…"
                icon="🔵"
                value={toCoord}
                onChange={setToCoord}
              />

              <p style={{ fontSize:11, color:C.text3, marginBottom:14 }}>
                📏 Finds trips with stops within <b style={{ color:C.amber }}>10km</b> · also matches by area name
              </p>

              <button onClick={searchTrips} disabled={searching || !toCoord}
                style={{ ...btnPrimary, opacity:(searching || !toCoord) ? .5 : 1 }}>
                {searching ? 'Searching…' : '🔍 Find trips near me'}
              </button>
            </div>

            {matchedTrips.length > 0 && (
              <div>
                <p style={sectSt}>{matchedTrips.length} trip{matchedTrips.length !== 1 ? 's':''} with nearby stops</p>
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
                          <div style={{ width:1, height:28, background:C.border2, margin:'4px 0' }} />
                          <div style={{ width:8, height:8, borderRadius:'50%', background:C.blue }} />
                        </div>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:13, color:C.text3, marginBottom:2 }}>{t.from_loc}</div>
                          {t.bestPickup && (
                            <div style={{ fontSize:12, color:C.green, marginBottom:8, display:'flex', alignItems:'center', gap:5, flexWrap:'wrap' }}>
                              🟢 <b>{t.bestPickup.label || 'Pickup point'}</b>
                              <span style={{ color:C.text3 }}>· {formatDist(t.bestPickupDist)} · {estimateWalkTime(t.bestPickupDist)}</span>
                            </div>
                          )}
                          <div style={{ fontSize:13, color:C.text3, marginBottom:2 }}>{t.to_loc}</div>
                          {t.bestDropoff && (
                            <div style={{ fontSize:12, color:C.blue, display:'flex', alignItems:'center', gap:5, flexWrap:'wrap' }}>
                              🔵 <b>{t.bestDropoff.label || 'Drop-off point'}</b>
                              <span style={{ color:C.text3 }}>· {formatDist(t.bestDropoffDist)} from your destination</span>
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
              dropoffLat={selDropoff?.lat} dropoffLng={selDropoff?.lng} stops={selTrip.stops||[]}
              passengerLat={userLocation?.lat} passengerLng={userLocation?.lng}
              driverName={selTrip.driver_name}
              height={280} />
            {/* Show proximity line from user to pickup */}
            {userLocation && selPickup?.lat && (
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:12, color:C.text3, marginBottom:6 }}>📍 Your location → nearest pickup point</div>
                <ProximityMap passengerLat={userLocation.lat} passengerLng={userLocation.lng} pickupStop={selPickup} height={180} />
              </div>
            )}

            {(selTrip.stops||[]).filter(s=>s.type==='pickup').length > 1 && (
              <div style={{ ...card, marginBottom:14 }}>
                <p style={sectSt}>🟢 Choose your pickup point</p>
                {selTrip.stops.filter(s=>s.type==='pickup').map((s,i) => {
                  const dist = fromCoord ? haversineDistance(fromCoord.lat, fromCoord.lng, parseFloat(s.lat), parseFloat(s.lng)) :
                               userLocation ? haversineDistance(userLocation.lat, userLocation.lng, parseFloat(s.lat), parseFloat(s.lng)) : null;
                  const sel = selPickup?.lat===s.lat && selPickup?.lng===s.lng;
                  return (
                    <div key={i} onClick={() => setSelPickup(s)}
                      style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', borderRadius:8, marginBottom:8, cursor:'pointer',
                        border:'1px solid '+(sel?C.greenBorder:C.border), background:sel?C.greenDim:'transparent' }}>
                      <div style={{ width:20, height:20, borderRadius:'50%', flexShrink:0, background:sel?C.green:C.border2, border:'2px solid '+(sel?C.green:C.border) }} />
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:13, fontWeight:500 }}>{s.label || 'Pickup '+(i+1)}</div>
                        {dist !== null && <div style={{ fontSize:11, color:C.text3 }}>{formatDist(dist)} · {estimateWalkTime(dist)}</div>}
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
                        border:'1px solid '+(sel?C.blueBorder:C.border), background:sel?C.blueDim:'transparent' }}>
                      <div style={{ width:20, height:20, borderRadius:'50%', flexShrink:0, background:sel?C.blue:C.border2, border:'2px solid '+(sel?C.blue:C.border) }} />
                      <div style={{ flex:1 }}><div style={{ fontSize:13, fontWeight:500 }}>{s.label || 'Drop-off '+(i+1)}</div></div>
                      {sel && <span style={{ color:C.blue }}>✓</span>}
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ ...card, marginBottom:14 }}>
              {selPickup  && <DetailRow label="Your pickup point"   val={selPickup.label  || (parseFloat(selPickup.lat).toFixed(4)+', '+parseFloat(selPickup.lng).toFixed(4))}  accent={C.green} />}
              {selDropoff && <DetailRow label="Your drop-off point" val={selDropoff.label || (parseFloat(selDropoff.lat).toFixed(4)+', '+parseFloat(selDropoff.lng).toFixed(4))} accent={C.blue} />}
              <DetailRow label="Pickup time"  val={selTrip.pickup_time} accent={C.green} />
              <DetailRow label="Price/seat"   val={selTrip.price+' EGP'} accent={C.green} />
              <DetailRow label="Driver"       val={selTrip.driver_name} />
              <DetailRow label="Plate"        val={selTrip.driver_plate} />
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
              style={{ ...btnPrimary, opacity:(booking || selTrip.total_seats<=selTrip.booked_seats)?.4:1 }}>
              {booking ? 'Booking…' : selTrip.total_seats<=selTrip.booked_seats ? 'Trip is full' : 'Confirm reservation'}
            </button>
          </div>
        )}

        {/* ── CONFIRMED ── */}
        {tab === 'search' && sub === 'confirmed' && confirmedBooking && (
          <div style={{ textAlign:'center', padding:'20px 0' }}>
            <div style={{ width:64, height:64, borderRadius:'50%', background:C.greenDim, border:'1px solid '+C.greenBorder, display:'flex', alignItems:'center', justifyContent:'center', fontSize:28, margin:'0 auto 20px' }}>✓</div>
            <h2 style={{ fontSize:22, fontWeight:400, marginBottom:8 }}>Booking confirmed!</h2>
            <p style={{ color:C.text2, fontSize:13, marginBottom:28 }}>You'll get a notification when the driver arrives at your pickup point</p>
            <div style={{ ...card, textAlign:'left', marginBottom:20 }}>
              <DetailRow label="Route"       val={confirmedBooking.from_loc+' → '+confirmedBooking.to_loc} />
              <DetailRow label="Date"        val={fmtDate(confirmedBooking.date)} />
              <DetailRow label="Pickup time" val={confirmedBooking.pickup_time} accent={C.green} />
              <DetailRow label="Seats"       val={confirmedBooking.seats} />
              <DetailRow label="Total"       val={(confirmedBooking.seats * confirmedBooking.price)+' EGP'} accent={C.green} />
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
                <div style={{ display:'flex', justifyContent:'space-between', padding:'10px 0', borderBottom:'1px solid '+C.border }}>
                  <span style={{ color:C.text2, fontSize:13 }}>Total</span>
                  <span style={{ color:C.green, fontWeight:500 }}>{b.seats * b.price} EGP</span>
                </div>
                {b.checkin_status === 'picked' && (
                  <div style={{ marginTop:10, padding:'12px 14px', background:C.greenDim, border:'1px solid '+C.greenBorder, borderRadius:8, fontSize:13, color:C.green }}>
                    ✅ You've been picked up — driver is heading to your drop-off
                    {(b.stops||[]).find(s=>s.type==='dropoff') && (
                      <div style={{ marginTop:4, fontSize:11, color:C.text2 }}>Drop-off: <b>{(b.stops||[]).find(s=>s.type==='dropoff').label || 'Drop-off point'}</b></div>
                    )}
                  </div>
                )}
                {b.checkin_status === 'dropped' && (
                  <div style={{ marginTop:10, padding:'10px 14px', background:C.blueDim, border:'1px solid '+C.blueBorder, borderRadius:8, fontSize:13, color:C.blue }}>
                    🏁 You've been dropped off
                  </div>
                )}
                <div style={{ marginTop:14 }}>
                  <TripMap tripId={b.trip_id} stops={b.stops||[]} pickupLat={b.pickup_lat} pickupLng={b.pickup_lng}
                    passengerLat={userLocation?.lat} passengerLng={userLocation?.lng}
                    driverName={b.driver_name}
                    dropoffLat={b.dropoff_lat} dropoffLng={b.dropoff_lng} checkinStatus={b.checkin_status} height={200} />
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
                style={{ width:'100%', background:C.bg3, border:'1px solid '+C.border, borderRadius:8, padding:'11px 14px', color:C.text, fontFamily:"'Sora',sans-serif", fontSize:14, outline:'none', resize:'none', height:80 }}
                placeholder="Leave a comment (optional)" />
            </div>
            <button onClick={submitRating} style={btnPrimary}>Submit rating</button>
          </div>
        )}

      </div>
    </div>
  );
}
