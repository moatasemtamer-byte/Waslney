import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../App.jsx';
import * as api from '../../api.js';
import { C, WaslneyLogo, Badge, DetailRow, CapBar, Stars, btnPrimary, btnSm, btnDanger, card, fmtDate, Spinner, sectSt, Avatar } from '../../components/UI.jsx';
import TripMap, { ProximityMap } from '../../components/TripMap.jsx';
import socket, { connectSocket, watchTrip } from '../../socket.js';

const SEARCH_RADIUS_M = 10000;

function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2-lat1)*Math.PI/180, dLng = (lng2-lng1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
function estimateWalkTime(m) { const min=Math.round(m/80); return min<1?'< 1 min walk':'~'+min+' min walk'; }
function formatDist(m) { return m<1000?Math.round(m)+'m':(m/1000).toFixed(1)+'km'; }

async function photonSearch(q) {
  if (!q||q.trim().length<2) return [];
  try {
    const r = await fetch('https://photon.komoot.io/api/?q='+encodeURIComponent(q)+'&limit=7&lang=en&bbox=24.6,22.0,36.9,31.7');
    const data = await r.json();
    if (!data.features?.length) return [];
    return data.features.map(f => ({
      place_id: f.properties.osm_id, lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0],
      name: [f.properties.name, f.properties.street, f.properties.district||f.properties.suburb, f.properties.city||f.properties.county].filter(Boolean).slice(0,3).join(', '),
      type: f.properties.type||'', city: f.properties.city||f.properties.county||'',
    }));
  } catch { return []; }
}

async function reverseGeocode(lat, lng) {
  try {
    const r = await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}&limit=1&lang=en`);
    const data = await r.json();
    if (!data.features?.length) return null;
    const p = data.features[0].properties;
    return [p.name, p.street, p.city||p.county].filter(Boolean).slice(0,2).join(', ');
  } catch { return null; }
}

// Search input with autocomplete
function PlaceSearch({ placeholder, icon, value, onChange }) {
  const [query, setQuery] = useState(value?.name||'');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const [pos, setPos] = useState({top:0,left:0,width:300});

  useEffect(() => { if (!value) setQuery(''); }, [value]);
  useEffect(() => {
    const close = e => {
      if (inputRef.current&&!inputRef.current.contains(e.target)&&listRef.current&&!listRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  function measure() {
    if (!inputRef.current) return;
    const r = inputRef.current.getBoundingClientRect();
    setPos({ top: r.bottom+window.scrollY+4, left: r.left+window.scrollX, width: r.width });
  }
  function onInput(e) {
    const q = e.target.value; setQuery(q); onChange(null);
    clearTimeout(debRef.current);
    if (q.length<2) { setResults([]); setOpen(false); return; }
    debRef.current = setTimeout(async () => {
      setLoading(true);
      const list = await photonSearch(q);
      setLoading(false); setResults(list);
      if (list.length) { measure(); setOpen(true); } else setOpen(false);
    }, 350);
  }
  function pick(item) {
    setQuery(item.name); setResults([]); setOpen(false);
    onChange({ lat:item.lat, lng:item.lng, name:item.name });
  }

  return (
    <div style={{ position:'relative', flex:1 }}>
      <div ref={inputRef} style={{ position:'relative' }}>
        <span style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', fontSize:16 }}>{icon}</span>
        <input value={query} onChange={onInput} onFocus={() => { if(results.length){measure();setOpen(true);} }}
          placeholder={placeholder}
          style={{ width:'100%', boxSizing:'border-box', background:C.bg3, border:`1px solid ${value?'#fbbf24':C.border}`, borderRadius:12, padding:'14px 40px 14px 42px', color:C.text, fontFamily:"'Sora',sans-serif", fontSize:15, outline:'none' }} />
        {loading && <div style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', width:14, height:14, border:'2px solid #333', borderTopColor:'#fbbf24', borderRadius:'50%', animation:'spin .6s linear infinite' }} />}
        {!loading && value && <span style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', color:'#fbbf24', fontSize:16 }}>✓</span>}
      </div>
      {open && results.length>0 && (
        <div ref={listRef} style={{ position:'fixed', top:pos.top, left:pos.left, width:pos.width, zIndex:99999, background:'#1a1a1a', border:'1px solid #fbbf2444', borderRadius:12, boxShadow:'0 12px 40px rgba(0,0,0,.9)', maxHeight:260, overflowY:'auto' }}>
          {results.map((item,i) => (
            <div key={item.place_id||i} onMouseDown={e=>{e.preventDefault();pick(item);}}
              style={{ padding:'12px 16px', cursor:'pointer', borderBottom:'1px solid #222' }}
              onMouseEnter={e=>e.currentTarget.style.background='#222'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
              <div style={{ fontSize:14, color:'#fff' }}>{item.name}</div>
              {item.city && <div style={{ fontSize:11, color:'#555', marginTop:2 }}>{item.city}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Bottom nav bar
function BottomNav({ active, onSet, bookingCount }) {
  const tabs = [
    { id:'home',     icon:'🏠', label:'Home' },
    { id:'activity', icon:'📋', label:'Activity', badge: bookingCount },
    { id:'account',  icon:'👤', label:'Account' },
  ];
  return (
    <div style={{ position:'fixed', bottom:0, left:0, right:0, background:'#000', borderTop:'1px solid #1a1a1a', display:'flex', zIndex:200, paddingBottom:'env(safe-area-inset-bottom)' }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onSet(t.id)}
          style={{ flex:1, background:'transparent', border:'none', cursor:'pointer', padding:'12px 0 10px', display:'flex', flexDirection:'column', alignItems:'center', gap:4, position:'relative' }}>
          <span style={{ fontSize:22 }}>{t.icon}</span>
          <span style={{ fontSize:10, color: active===t.id ? '#fbbf24' : '#555', fontFamily:"'Sora',sans-serif", fontWeight: active===t.id?700:400 }}>{t.label}</span>
          {t.badge>0 && <span style={{ position:'absolute', top:8, right:'calc(50% - 18px)', background:'#fbbf24', color:'#000', borderRadius:'50%', fontSize:9, width:16, height:16, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700 }}>{t.badge}</span>}
          {active===t.id && <div style={{ position:'absolute', bottom:0, left:'25%', right:'25%', height:2, background:'#fbbf24', borderRadius:2 }} />}
        </button>
      ))}
    </div>
  );
}

export default function PassengerDash() {
  const { user, logout, notify } = useAuth();
  const [tab, setTab] = useState(() => {
    const h = window.location.hash.replace('#','');
    return ['home','activity','account'].includes(h) ? h : 'home';
  });
  const [selTrip,     setSelTrip]     = useState(null);
  const [selPickup,   setSelPickup]   = useState(null);
  const [selDropoff,  setSelDropoff]  = useState(null);
  const [selBooking,  setSelBooking]  = useState(null);

  // Search
  const [fromCoord,    setFromCoord]    = useState(null);
  const [toCoord,      setToCoord]      = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [locationLabel,setLocationLabel]= useState('Detecting location…');
  const [matchedTrips, setMatchedTrips] = useState([]);
  const [searching,    setSearching]    = useState(false);

  // Bookings
  const [myBookings, setMyBookings] = useState([]);
  const [loadingB,   setLoadingB]   = useState(false);
  const [seats,      setSeats]      = useState(1);
  const [booking,    setBooking]    = useState(false);
  const [confirmedBooking, setConfirmedBooking] = useState(null);

  // Rating
  const [rateTrip,    setRateTrip]    = useState(null);
  const [ratingStars, setRatingStars] = useState(0);
  const [rateComment, setRateComment] = useState('');

  // Notifications
  const [notifs,    setNotifs]    = useState([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const unread = notifs.filter(n=>!n.is_read).length;

  const activeBookings  = myBookings.filter(b=>b.status==='confirmed');
  const historyBookings = myBookings.filter(b=>b.status==='completed'||b.status==='cancelled');

  const changeTab = (t) => { setTab(t); setSelTrip(null); setSelBooking(null); window.location.hash=t; };

  // Init
  useEffect(() => {
    loadNotifs(); requestLocation();
    connectSocket(user.id, 'passenger');
    socket.on('checkin:update', ({ bookingId, status }) => {
      setMyBookings(prev => prev.map(b => b.id===bookingId ? {...b, checkin_status:status} : b));
      setSelBooking(prev => prev?.id===bookingId ? {...prev, checkin_status:status} : prev);
    });
    return () => socket.off('checkin:update');
  }, [user.id]);

  useEffect(() => { myBookings.forEach(b => { if(b.trip_id) watchTrip(b.trip_id); }); }, [myBookings.length]);
  useEffect(() => { if(tab==='activity') loadBookings(); }, [tab]);

  async function loadNotifs() { try { setNotifs(await api.getNotifications()); } catch {} }
  async function openNotifs() {
    setNotifOpen(true);
    try { await api.markNotifRead(); setNotifs(n=>n.map(x=>({...x,is_read:1}))); } catch {}
  }

  function requestLocation() {
    if (!navigator.geolocation) { setLocationLabel('GPS not available'); return; }
    navigator.geolocation.getCurrentPosition(async pos => {
      const loc = { lat:pos.coords.latitude, lng:pos.coords.longitude };
      setUserLocation(loc);
      const name = await reverseGeocode(loc.lat, loc.lng);
      setLocationLabel('📍 '+(name||'Your location'));
      setFromCoord(prev => prev || { ...loc, name: name||'My location' });
    }, () => setLocationLabel('Enable GPS for better results'), { enableHighAccuracy:true, timeout:10000 });
  }

  async function loadBookings() {
    if (myBookings.length===0) setLoadingB(true);
    try {
      const bks = await api.getMyBookings();
      const enriched = await Promise.all(bks.map(async b => {
        const existing = myBookings.find(x=>x.id===b.id);
        if (existing?.stops?.length) return {...b, stops:existing.stops};
        try { const d=await api.getTrip(b.trip_id); return {...b, stops:d.stops||[]}; }
        catch { return {...b, stops:[]}; }
      }));
      setMyBookings(enriched);
      const savedId = sessionStorage.getItem('selBookingId');
      if (savedId) { const found=enriched.find(b=>String(b.id)===String(savedId)); if(found) setSelBooking(found); }
    } catch {} finally { setLoadingB(false); }
  }

  async function searchTrips() {
    if (!toCoord) { notify('Enter destination','Select from dropdown.','error'); return; }
    const effectiveFrom = fromCoord||userLocation;
    setSearching(true); setMatchedTrips([]);
    try {
      const all = await api.getTrips();
      const norm = s=>(s||'').toLowerCase().replace(/[,،\-_]/g,' ').replace(/\s+/g,' ').trim();
      const keywords = name=>norm(name).split(' ').filter(w=>w.length>=3);
      const nameContains = (hay,words)=>words.some(w=>norm(hay).includes(w));
      const fromWords = keywords(fromCoord?.name||'');
      const toWords   = keywords(toCoord?.name||'');
      const enriched  = [];

      for (const trip of all) {
        const stops = trip.stops||[];
        const pickupStops  = stops.filter(s=>s.type==='pickup');
        const dropoffStops = stops.filter(s=>s.type==='dropoff');

        let bestPickup=null, bestPickupDist=0;
        if (effectiveFrom&&pickupStops.length) {
          let minD=Infinity;
          for (const ps of pickupStops) {
            const d=haversineDistance(effectiveFrom.lat,effectiveFrom.lng,parseFloat(ps.lat),parseFloat(ps.lng));
            if (d<minD) { minD=d; bestPickup={...ps,distFromUser:d}; bestPickupDist=d; }
          }
          if (minD>SEARCH_RADIUS_M) bestPickup=null;
        }
        if (!bestPickup&&fromWords.length&&nameContains(trip.from_loc,fromWords)) {
          bestPickup=pickupStops[0]||{type:'pickup',lat:trip.pickup_lat,lng:trip.pickup_lng,label:trip.from_loc};
          bestPickupDist=bestPickup?.lat&&effectiveFrom?haversineDistance(effectiveFrom.lat,effectiveFrom.lng,parseFloat(bestPickup.lat),parseFloat(bestPickup.lng)):0;
        }
        if (!bestPickup&&!effectiveFrom) { bestPickup=pickupStops[0]||null; bestPickupDist=0; }

        let bestDropoff=null, bestDropoffDist=0;
        if (dropoffStops.length) {
          let minD=Infinity;
          for (const ds of dropoffStops) {
            const d=haversineDistance(toCoord.lat,toCoord.lng,parseFloat(ds.lat),parseFloat(ds.lng));
            if (d<minD) { minD=d; bestDropoff={...ds,distFromDest:d}; bestDropoffDist=d; }
          }
          if (minD>SEARCH_RADIUS_M) bestDropoff=null;
        }
        if (!bestDropoff&&toWords.length&&nameContains(trip.to_loc,toWords)) {
          bestDropoff=dropoffStops[0]||{type:'dropoff',lat:trip.dropoff_lat,lng:trip.dropoff_lng,label:trip.to_loc};
          bestDropoffDist=bestDropoff?.lat?haversineDistance(toCoord.lat,toCoord.lng,parseFloat(bestDropoff.lat),parseFloat(bestDropoff.lng)):0;
        }

        if (bestPickup&&bestDropoff) enriched.push({...trip,bestPickup,bestDropoff,bestPickupDist,bestDropoffDist});
      }

      if (enriched.length) {
        enriched.sort((a,b)=>(a.bestPickupDist||0)-(b.bestPickupDist||0));
        setMatchedTrips(enriched);
      } else {
        const fallback=all.map(trip=>({...trip,bestPickup:trip.stops?.find(s=>s.type==='pickup'),bestDropoff:trip.stops?.find(s=>s.type==='dropoff'),isFallback:true}));
        setMatchedTrips(fallback);
        notify('Showing all trips','No exact match found — showing all available.','info');
      }
    } catch(e) { notify('Error',e.message,'error'); }
    finally { setSearching(false); }
  }

  async function confirmBook() {
    setBooking(true);
    try {
      const b=await api.bookTrip({trip_id:selTrip.id,seats,pickup_note:fromCoord?.name||selPickup?.label||''});
      setConfirmedBooking(b); setSelTrip(null); changeTab('activity');
      notify('Booking confirmed!',`Pickup at ${selTrip.pickup_time}`);
    } catch(e) {
      const msg = e.message || '';
      if (msg === 'already_reserved' || msg.toLowerCase().includes('already')) {
        notify('Already reserved', 'You already have an active booking on this trip. Cancel it first to rebook.', 'warning');
      } else if (msg.toLowerCase().includes('not enough') || msg.toLowerCase().includes('seats')) {
        notify('No seats available', msg, 'error');
      } else {
        notify('Error', msg, 'error');
      }
    }
    finally { setBooking(false); }
  }

  async function cancelBooking(id) {
    try { await api.cancelBooking(id); notify('Cancelled',''); loadBookings(); } catch(e) { notify('Error',e.message,'error'); }
  }

  async function submitRating() {
    if (!ratingStars) { notify('Pick stars','Tap a star.','error'); return; }
    try {
      await api.submitRating({trip_id:rateTrip.trip_id,stars:ratingStars,comment:rateComment});
      notify('Rated!',`${ratingStars} stars`); setRateTrip(null); setRatingStars(0); setRateComment(''); loadBookings();
    } catch(e) { notify('Error',e.message,'error'); }
  }

  // ── RENDER ─────────────────────────────────────────────
  return (
    <div style={{ minHeight:'100vh', background:'#000', paddingBottom:80 }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Top bar */}
      <div style={{ background:'#000', borderBottom:'1px solid #1a1a1a', padding:'14px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', position:'sticky', top:0, zIndex:100 }}>
        <WaslneyLogo size={26} />
        <button onClick={openNotifs} style={{ background:'transparent', border:'none', cursor:'pointer', position:'relative', padding:4 }}>
          <span style={{ fontSize:22 }}>🔔</span>
          {unread>0 && <span style={{ position:'absolute', top:0, right:0, background:'#fbbf24', color:'#000', borderRadius:'50%', fontSize:9, width:16, height:16, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700 }}>{unread}</span>}
        </button>
      </div>

      {/* Notifications panel */}
      {notifOpen && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', zIndex:300, display:'flex', flexDirection:'column', justifyContent:'flex-end' }}>
          <div style={{ background:'#111', borderRadius:'20px 20px 0 0', padding:'24px 20px', maxHeight:'70vh', overflowY:'auto' }}>
            <div style={{ display:'flex', alignItems:'center', marginBottom:20 }}>
              <span style={{ fontSize:18, fontWeight:700, color:'#fff' }}>Notifications</span>
              <button onClick={()=>setNotifOpen(false)} style={{ marginLeft:'auto', background:'transparent', border:'none', color:'#666', fontSize:24, cursor:'pointer' }}>✕</button>
            </div>
            {notifs.length===0 && <p style={{ color:'#555', fontSize:14 }}>No notifications yet.</p>}
            {notifs.map(n=>(
              <div key={n.id} style={{ padding:'12px 0', borderBottom:'1px solid #1a1a1a', fontSize:14, color:n.is_read?'#555':'#fff' }}>
                {n.message}
                <div style={{ fontSize:11, color:'#444', marginTop:4 }}>{fmtDate(n.created_at)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ maxWidth:640, margin:'0 auto', padding:'0 16px' }}>

        {/* ── HOME TAB ── */}
        {tab==='home' && !selTrip && (
          <div style={{ paddingTop:24 }}>
            <div style={{ marginBottom:28 }}>
              <h2 style={{ fontSize:26, fontWeight:800, color:'#fff', marginBottom:4 }}>Good day, {user.name.split(' ')[0]} 👋</h2>
              <p style={{ fontSize:13, color:'#555' }}>{locationLabel}</p>
            </div>

            {/* Uber-style search bar */}
            <div style={{ background:'#111', borderRadius:20, padding:'16px', marginBottom:24, border:'1px solid #1a1a1a' }}>
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4, paddingLeft:4 }}>
                    <div style={{ width:10, height:10, borderRadius:'50%', background:'#fbbf24', border:'2px solid #000', boxShadow:'0 0 0 2px #fbbf24' }} />
                    <div style={{ width:1, height:20, background:'#333' }} />
                    <div style={{ width:10, height:10, borderRadius:3, background:'#60a5fa' }} />
                  </div>
                  <div style={{ flex:1, display:'flex', flexDirection:'column', gap:8 }}>
                    <PlaceSearch icon="📍" placeholder="Your location / pickup area" value={fromCoord} onChange={setFromCoord} />
                    <PlaceSearch icon="🏁" placeholder="Where to?" value={toCoord} onChange={setToCoord} />
                  </div>
                </div>
                <button onClick={searchTrips} disabled={searching||!toCoord}
                  style={{ background: toCoord?'#fbbf24':'#1a1a1a', color: toCoord?'#000':'#555', border:'none', borderRadius:12, padding:'14px', fontSize:14, fontWeight:700, cursor: toCoord?'pointer':'default', fontFamily:"'Sora',sans-serif", marginTop:4, transition:'all .2s' }}>
                  {searching ? 'Searching…' : '🔍 Find trips near me'}
                </button>
              </div>
              <p style={{ fontSize:11, color:'#444', marginTop:10, textAlign:'center' }}>Finds stops within 10km · matches by area name</p>
            </div>

            {/* Results */}
            {matchedTrips.length>0 && (
              <div>
                <p style={{ fontSize:13, color:'#555', marginBottom:16 }}>{matchedTrips.length} trip{matchedTrips.length!==1?'s':''} found</p>
                {matchedTrips.map(t => {
                  const avail=t.total_seats-t.booked_seats;
                  return (
                    <div key={t.id} onClick={() => { setSelTrip(t); setSelPickup(t.bestPickup||null); setSelDropoff(t.bestDropoff||null); setSeats(1); }}
                      style={{ background:'#111', borderRadius:16, padding:'20px', marginBottom:12, cursor:'pointer', border:'1px solid #1a1a1a', transition:'border-color .15s' }}
                      onMouseEnter={e=>e.currentTarget.style.borderColor='#fbbf2466'} onMouseLeave={e=>e.currentTarget.style.borderColor='#1a1a1a'}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14 }}>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:16, fontWeight:700, color:'#fff', marginBottom:4 }}>{t.from_loc} → {t.to_loc}</div>
                          <div style={{ fontSize:12, color:'#555' }}>{fmtDate(t.date)} · {t.pickup_time}</div>
                        </div>
                        <div style={{ textAlign:'right', marginLeft:16 }}>
                          <div style={{ fontSize:24, fontWeight:800, color:'#fbbf24' }}>{t.price}</div>
                          <div style={{ fontSize:11, color:'#555' }}>EGP/seat</div>
                        </div>
                      </div>
                      {t.bestPickup && (
                        <div style={{ background:'rgba(251,191,36,0.08)', borderRadius:10, padding:'10px 12px', marginBottom:8 }}>
                          <div style={{ fontSize:12, color:'#fbbf24', fontWeight:600, marginBottom:2 }}>🟢 {t.bestPickup.label||'Nearest pickup'}</div>
                          {t.bestPickupDist>0&&<div style={{ fontSize:11, color:'#666' }}>{formatDist(t.bestPickupDist)} · {estimateWalkTime(t.bestPickupDist)}</div>}
                        </div>
                      )}
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <Badge type={avail<=0?'red':avail<=3?'amber':'green'}>{avail<=0?'Full':`${avail} seats left`}</Badge>
                          <span style={{ fontSize:12, color:'#fbbf24' }}>★ {parseFloat(t.avg_rating).toFixed(1)}</span>
                        </div>
                        <span style={{ fontSize:12, color:'#444' }}>View →</span>
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
        {tab==='home' && selTrip && (
          <div style={{ paddingTop:16 }}>
            <button onClick={()=>setSelTrip(null)} style={{ background:'transparent', border:'none', color:'#fff', fontSize:24, cursor:'pointer', padding:'4px 0', marginBottom:16 }}>←</button>
            <h2 style={{ fontSize:20, fontWeight:700, color:'#fff', marginBottom:4 }}>{selTrip.from_loc} → {selTrip.to_loc}</h2>
            <p style={{ color:'#555', fontSize:13, marginBottom:20 }}>{fmtDate(selTrip.date)} · {selTrip.pickup_time}</p>

            <TripMap tripId={selTrip.id} pickupLat={selPickup?.lat} pickupLng={selPickup?.lng}
              dropoffLat={selDropoff?.lat} dropoffLng={selDropoff?.lng} stops={selTrip.stops||[]}
              passengerLat={userLocation?.lat} passengerLng={userLocation?.lng}
              driverName={selTrip.driver_name} height={260} />

            {userLocation&&selPickup?.lat && (
              <div style={{ marginBottom:14 }}>
                <p style={{ fontSize:12, color:'#555', marginBottom:6 }}>📍 Your location → pickup point</p>
                <ProximityMap passengerLat={userLocation.lat} passengerLng={userLocation.lng} pickupStop={selPickup} height={160} />
              </div>
            )}

            {/* Pickup selector */}
            {(selTrip.stops||[]).filter(s=>s.type==='pickup').length>1 && (
              <div style={{ ...card, marginBottom:14 }}>
                <p style={sectSt}>Choose your pickup point</p>
                {selTrip.stops.filter(s=>s.type==='pickup').map((s,i) => {
                  const dist=fromCoord?haversineDistance(fromCoord.lat,fromCoord.lng,parseFloat(s.lat),parseFloat(s.lng)):null;
                  const sel=selPickup?.lat===s.lat&&selPickup?.lng===s.lng;
                  return (
                    <div key={i} onClick={()=>setSelPickup(s)} style={{ display:'flex', alignItems:'center', gap:10, padding:'12px', borderRadius:10, marginBottom:8, cursor:'pointer', border:`1px solid ${sel?'#fbbf24':C.border}`, background:sel?'rgba(251,191,36,0.08)':'transparent' }}>
                      <div style={{ width:20,height:20,borderRadius:'50%',flexShrink:0,background:sel?'#fbbf24':C.border2,border:`2px solid ${sel?'#fbbf24':C.border}` }} />
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:13, fontWeight:600, color:'#fff' }}>{s.label||'Pickup '+(i+1)}</div>
                        {dist!==null&&<div style={{ fontSize:11, color:'#555' }}>{formatDist(dist)} · {estimateWalkTime(dist)}</div>}
                      </div>
                      {sel&&<span style={{ color:'#fbbf24', fontWeight:700 }}>✓</span>}
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ ...card, marginBottom:14 }}>
              {selPickup&&<DetailRow label="Pickup point" val={selPickup.label||(parseFloat(selPickup.lat).toFixed(4)+', '+parseFloat(selPickup.lng).toFixed(4))} accent="#fbbf24" />}
              <DetailRow label="Pickup time"   val={selTrip.pickup_time} accent="#fbbf24" />
              <DetailRow label="Price/seat"    val={selTrip.price+' EGP'} accent="#fbbf24" />
              <DetailRow label="Driver"        val={selTrip.driver_name} />
              <DetailRow label="Car"           val={selTrip.driver_car} />
              <DetailRow label="Plate"         val={selTrip.driver_plate} />
              <div style={{ display:'flex', justifyContent:'space-between', padding:'12px 0' }}>
                <span style={{ color:'#555', fontSize:13 }}>Rating</span>
                <span style={{ color:'#fbbf24' }}>★ {parseFloat(selTrip.avg_rating).toFixed(1)}</span>
              </div>
            </div>

            <div style={{ ...card, marginBottom:20 }}>
              <p style={sectSt}>Reserve seats</p>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:24, padding:'12px 0' }}>
                <button onClick={()=>setSeats(s=>Math.max(1,s-1))} style={{ width:44,height:44,borderRadius:22,border:'1px solid #333',background:'transparent',color:'#fff',fontSize:20,cursor:'pointer' }}>−</button>
                <span style={{ fontSize:32, fontWeight:800, color:'#fff', minWidth:40, textAlign:'center' }}>{seats}</span>
                <button onClick={()=>setSeats(s=>Math.min(3,Math.min(selTrip.total_seats-selTrip.booked_seats,s+1)))} style={{ width:44,height:44,borderRadius:22,border:'1px solid #333',background:'transparent',color:'#fff',fontSize:20,cursor:'pointer' }}>+</button>
              </div>
              <p style={{ fontSize:11, color:'#555', textAlign:'center' }}>{selTrip.total_seats-selTrip.booked_seats} seats available · max 3</p>
            </div>
            <button onClick={confirmBook} disabled={booking||selTrip.total_seats<=selTrip.booked_seats}
              style={{ ...btnPrimary, opacity:(booking||selTrip.total_seats<=selTrip.booked_seats)?.4:1 }}>
              {booking?'Booking…':selTrip.total_seats<=selTrip.booked_seats?'Trip is full':`Confirm — ${seats * selTrip.price} EGP`}
            </button>
          </div>
        )}

        {/* ── ACTIVITY TAB ── */}
        {tab==='activity' && !selBooking && (
          <div style={{ paddingTop:24 }}>
            <h2 style={{ fontSize:22, fontWeight:800, color:'#fff', marginBottom:20 }}>Your trips</h2>

            {activeBookings.length>0 && (
              <>
                <p style={{ fontSize:11, color:'#555', letterSpacing:'.1em', textTransform:'uppercase', marginBottom:12 }}>Active</p>
                {activeBookings.map(b => {
                  const st=b.checkin_status;
                  return (
                    <div key={b.id} onClick={()=>{ setSelBooking(b); sessionStorage.setItem('selBookingId',b.id); }}
                      style={{ background:'#111', borderRadius:16, padding:'20px', marginBottom:12, cursor:'pointer', border:`1px solid ${st==='picked'?'#4ade8044':st==='dropped'?'#60a5fa44':'#1a1a1a'}` }}>
                      <div style={{ display:'flex', alignItems:'center', marginBottom:10 }}>
                        <Badge type={st==='picked'?'green':st==='dropped'?'blue':'amber'}>
                          {st==='picked'?'✅ Picked up':st==='dropped'?'🏁 Dropped off':'⏳ Confirmed'}
                        </Badge>
                        <span style={{ marginLeft:'auto', fontSize:12, color:'#555' }}>{fmtDate(b.date)}</span>
                      </div>
                      <div style={{ fontSize:16, fontWeight:700, color:'#fff', marginBottom:4 }}>{b.from_loc} → {b.to_loc}</div>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:8 }}>
                        <div style={{ fontSize:12, color:'#555' }}>{b.driver_name} · {b.pickup_time}</div>
                        <div style={{ fontSize:15, fontWeight:700, color:'#fbbf24' }}>{b.seats*b.price} EGP</div>
                      </div>
                    </div>
                  );
                })}
              </>
            )}

            {historyBookings.length>0 && (
              <>
                <p style={{ fontSize:11, color:'#555', letterSpacing:'.1em', textTransform:'uppercase', marginBottom:12, marginTop:24 }}>History</p>
                {historyBookings.map(b=>(
                  <div key={b.id} style={{ background:'#111', borderRadius:16, padding:'16px 20px', marginBottom:10, border:'1px solid #1a1a1a' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                      <Badge type={b.status==='completed'?'blue':'red'}>{b.status}</Badge>
                      <span style={{ fontSize:11, color:'#555' }}>{fmtDate(b.date)}</span>
                    </div>
                    <div style={{ fontSize:14, fontWeight:600, color:'#fff', marginBottom:4 }}>{b.from_loc} → {b.to_loc}</div>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <span style={{ fontSize:12, color:'#555' }}>{b.seats} seats · {b.seats*b.price} EGP</span>
                      {b.status==='completed'&&!b.rated&&(
                        <button onClick={()=>setRateTrip(b)} style={{ background:'rgba(251,191,36,0.1)', border:'1px solid #fbbf2444', borderRadius:8, padding:'5px 12px', color:'#fbbf24', fontSize:12, cursor:'pointer', fontFamily:"'Sora',sans-serif" }}>Rate ★</button>
                      )}
                      {b.rated&&<span style={{ fontSize:12, color:'#fbbf24' }}>★ Rated</span>}
                    </div>
                  </div>
                ))}
              </>
            )}

            {!loadingB&&myBookings.length===0&&(
              <div style={{ textAlign:'center', paddingTop:60 }}>
                <div style={{ fontSize:48, marginBottom:16 }}>🎫</div>
                <p style={{ color:'#555', fontSize:14 }}>No trips yet</p>
                <button onClick={()=>changeTab('home')} style={{ ...btnPrimary, marginTop:16, maxWidth:200, margin:'16px auto 0' }}>Book a ride →</button>
              </div>
            )}
            {loadingB&&<Spinner/>}
          </div>
        )}

        {/* ── BOOKING DETAIL ── */}
        {tab==='activity' && selBooking && (() => {
          const b=myBookings.find(x=>x.id===selBooking.id)||selBooking;
          const st=b.checkin_status;
          return (
            <div style={{ paddingTop:16 }}>
              <button onClick={()=>{ setSelBooking(null); sessionStorage.removeItem('selBookingId'); }} style={{ background:'transparent', border:'none', color:'#fff', fontSize:24, cursor:'pointer', padding:'4px 0', marginBottom:16 }}>←</button>
              <h2 style={{ fontSize:20, fontWeight:700, color:'#fff', marginBottom:4 }}>{b.from_loc} → {b.to_loc}</h2>
              <p style={{ color:'#555', fontSize:13, marginBottom:16 }}>{fmtDate(b.date)} · Pickup {b.pickup_time}</p>

              {(!st||st==='pending') && (
                <div style={{ padding:'14px 16px', background:'rgba(251,191,36,0.08)', border:'1px solid #fbbf2433', borderRadius:12, marginBottom:16, display:'flex', alignItems:'center', gap:12 }}>
                  <span style={{ fontSize:24 }}>⏳</span>
                  <div>
                    <div style={{ fontSize:13, fontWeight:700, color:'#fbbf24' }}>Waiting for driver</div>
                    <div style={{ fontSize:12, color:'#666', marginTop:2 }}>Driver will appear on map when they start sharing location</div>
                  </div>
                </div>
              )}
              {st==='picked' && (
                <div style={{ padding:'14px 16px', background:'rgba(74,222,128,0.08)', border:'1px solid #4ade8033', borderRadius:12, marginBottom:16, display:'flex', alignItems:'center', gap:12 }}>
                  <span style={{ fontSize:24 }}>✅</span>
                  <div style={{ fontSize:13, fontWeight:700, color:'#4ade80' }}>You've been picked up!</div>
                </div>
              )}

              <TripMap
                tripId={b.trip_id} stops={b.stops||[]}
                pickupLat={b.pickup_lat||(b.stops||[]).find(s=>s.type==='pickup')?.lat}
                pickupLng={b.pickup_lng||(b.stops||[]).find(s=>s.type==='pickup')?.lng}
                dropoffLat={b.dropoff_lat||(b.stops||[]).find(s=>s.type==='dropoff')?.lat}
                dropoffLng={b.dropoff_lng||(b.stops||[]).find(s=>s.type==='dropoff')?.lng}
                passengerLat={userLocation?.lat} passengerLng={userLocation?.lng}
                driverName={b.driver_name} checkinStatus={st} height={300} />

              <div style={{ ...card, marginBottom:16 }}>
                <DetailRow label="Driver"      val={b.driver_name} />
                <DetailRow label="Plate"       val={b.driver_plate} />
                <DetailRow label="Car"         val={b.driver_car} />
                <DetailRow label="Seats"       val={b.seats} />
                <DetailRow label="Pickup time" val={b.pickup_time} accent="#fbbf24" />
                <div style={{ display:'flex', justifyContent:'space-between', padding:'12px 0' }}>
                  <span style={{ color:'#555', fontSize:13 }}>Total</span>
                  <span style={{ color:'#fbbf24', fontWeight:700, fontSize:16 }}>{b.seats*b.price} EGP</span>
                </div>
              </div>
              <button style={{ ...btnDanger, width:'100%' }} onClick={()=>{ cancelBooking(b.id); setSelBooking(null); sessionStorage.removeItem('selBookingId'); }}>Cancel booking</button>
            </div>
          );
        })()}

        {/* ── RATE ── */}
        {tab==='activity' && rateTrip && !selBooking && (
          <div style={{ paddingTop:40, textAlign:'center' }}>
            <button onClick={()=>setRateTrip(null)} style={{ background:'transparent', border:'none', color:'#fff', fontSize:24, cursor:'pointer', marginBottom:20 }}>←</button>
            <div style={{ fontSize:56, marginBottom:12 }}>⭐</div>
            <h2 style={{ fontSize:22, fontWeight:800, color:'#fff', marginBottom:6 }}>Rate your driver</h2>
            <p style={{ color:'#555', fontSize:14, marginBottom:28 }}>{rateTrip.driver_name} · {rateTrip.from_loc} → {rateTrip.to_loc}</p>
            <div style={{ marginBottom:24 }}><Stars n={ratingStars} interactive onSet={setRatingStars} /></div>
            <textarea value={rateComment} onChange={e=>setRateComment(e.target.value)}
              style={{ width:'100%', background:'#111', border:'1px solid #222', borderRadius:12, padding:'14px', color:'#fff', fontFamily:"'Sora',sans-serif", fontSize:14, outline:'none', resize:'none', height:80, boxSizing:'border-box' }}
              placeholder="Leave a comment (optional)" />
            <button onClick={submitRating} style={{ ...btnPrimary, marginTop:16 }}>Submit rating</button>
          </div>
        )}

        {/* ── ACCOUNT TAB ── */}
        {tab==='account' && (
          <div style={{ paddingTop:24 }}>
            <div style={{ textAlign:'center', paddingBottom:28 }}>
              <Avatar name={user.name} size={72} />
              <h2 style={{ fontSize:22, fontWeight:800, color:'#fff', marginTop:16, marginBottom:4 }}>{user.name}</h2>
              <p style={{ color:'#555', fontSize:13 }}>{user.phone} · Passenger</p>
            </div>

            <div style={{ ...card, marginBottom:14 }}>
              <p style={sectSt}>Account info</p>
              <DetailRow label="Name"    val={user.name} />
              <DetailRow label="Phone"   val={user.phone} />
              <DetailRow label="Role"    val="Passenger" />
              <DetailRow label="Member since" val={fmtDate(user.created_at)} />
            </div>

            <div style={{ ...card, marginBottom:14 }}>
              <p style={sectSt}>Trip stats</p>
              <DetailRow label="Total trips"     val={historyBookings.filter(b=>b.status==='completed').length} />
              <DetailRow label="Active bookings" val={activeBookings.length} />
            </div>

            <button onClick={logout} style={{ ...btnDanger, width:'100%', marginTop:8, padding:'14px', fontSize:14 }}>Sign out</button>
          </div>
        )}

      </div>

      <BottomNav active={tab} onSet={changeTab} bookingCount={activeBookings.length} />
    </div>
  );
}
