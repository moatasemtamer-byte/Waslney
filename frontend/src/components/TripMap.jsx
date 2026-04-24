import { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getTripLocation } from '../api.js';
import socket, { watchTrip } from '../socket.js';
import { C } from './UI.jsx';

// All markers use custom divIcon — no default icon URLs needed

const CAIRO = [30.0626, 31.2497];

export function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function estimateTime(meters) {
  let kmh;
  if      (meters < 1000)  kmh = 15;
  else if (meters < 5000)  kmh = 25;
  else if (meters < 15000) kmh = 35;
  else                     kmh = 50;
  const minutes = Math.round((meters / 1000) / kmh * 60);
  if (minutes < 1) return '< 1 min';
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes/60)}h ${minutes % 60 > 0 ? ' ' + (minutes%60) + 'm' : ''}`.trim();
}

function formatDist(meters) {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters/1000).toFixed(1)} km`;
}

// ── Shared icon helpers ───────────────────────────────────────────────────────
function makeStopIcon(color) {
  return L.divIcon({
    html: `<div style="width:16px;height:16px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 0 10px ${color}99"></div>`,
    iconSize: [16,16], iconAnchor: [8,8], className: '',
  });
}

function makeNumberedIcon(color, num) {
  return L.divIcon({
    html: `<div style="background:${color};border:2px solid #fff;border-radius:50%;width:20px;height:20px;box-shadow:0 0 8px ${color}99;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#000">${num}</div>`,
    iconSize: [20,20], iconAnchor: [10,10], className: '',
  });
}

// ── Main TripMap ──────────────────────────────────────────────────────────────
export default function TripMap({
  tripId,
  pickupLat, pickupLng, dropoffLat, dropoffLng,
  stops = [],
  isDriver = false,
  checkinStatus = null,
  passengerLat = null, passengerLng = null,
  driverName = null,
  height = 280,
}) {
  const mapRef          = useRef(null);
  const leafletMap      = useRef(null);
  const driverMarker    = useRef(null);
  const navLine         = useRef(null);
  const passengerMarker = useRef(null);
  const stopMarkers     = useRef([]);
  const locationInterval = useRef(null);

  const [sharing,        setSharing]        = useState(false);
  const [error,          setError]          = useState(null);
  const [driverPos,      setDriverPos]      = useState(null);
  const [navInfo,        setNavInfo]        = useState(null);
  const [liveDriverName, setLiveDriverName] = useState(null);

  const initMap = useCallback(() => {
    if (!mapRef.current || leafletMap.current) return;

    const center = stops.length > 0
      ? [parseFloat(stops[0].lat), parseFloat(stops[0].lng)]
      : pickupLat ? [parseFloat(pickupLat), parseFloat(pickupLng)] : CAIRO;

    const map = L.map(mapRef.current, { center, zoom: 13 });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap', maxZoom: 19,
    }).addTo(map);
    leafletMap.current = map;

    drawStops(stops, map);

    if (!stops.length) {
      if (pickupLat && pickupLng)   L.marker([parseFloat(pickupLat),  parseFloat(pickupLng)],  { icon: makeStopIcon('#4ade80') }).addTo(map).bindPopup('<b>Pickup</b>');
      if (dropoffLat && dropoffLng) L.marker([parseFloat(dropoffLat), parseFloat(dropoffLng)], { icon: makeStopIcon('#60a5fa') }).addTo(map).bindPopup('<b>Drop-off</b>');
      if (pickupLat && dropoffLat) {
        L.polyline([[parseFloat(pickupLat), parseFloat(pickupLng)], [parseFloat(dropoffLat), parseFloat(dropoffLng)]], { color:'#4ade80', weight:3, opacity:0.6, dashArray:'8,6' }).addTo(map);
        map.fitBounds([[parseFloat(pickupLat), parseFloat(pickupLng)], [parseFloat(dropoffLat), parseFloat(dropoffLng)]], { padding:[50,50] });
      }
    }

    if (passengerLat && passengerLng) {
      const pIcon = L.divIcon({ html:`<div style="width:14px;height:14px;border-radius:50%;background:#a78bfa;border:2px solid #fff;box-shadow:0 0 8px #a78bfa99"></div>`, iconSize:[14,14], iconAnchor:[7,7], className:'' });
      passengerMarker.current = L.marker([parseFloat(passengerLat), parseFloat(passengerLng)], { icon: pIcon }).addTo(map).bindPopup('<b>📍 Your location</b>');
    }

    if (tripId) {
      getTripLocation(tripId).then(loc => { if (loc?.lat) updateDriverMarker(loc.lat, loc.lng, map); }).catch(() => {});
      watchTrip(tripId);
      socket.on('driver:location', ({ lat, lng, driverName: liveName }) => {
        if (liveName) setLiveDriverName(liveName);
        updateDriverMarker(lat, lng, map, liveName);
        setDriverPos({ lat: parseFloat(lat), lng: parseFloat(lng) });
      });
    }
    setTimeout(() => map.invalidateSize(), 300);
  }, [tripId, pickupLat, pickupLng, dropoffLat, dropoffLng, stops, passengerLat, passengerLng]);

  useEffect(() => {
    initMap();
    return () => {
      socket.off('driver:location');
      clearInterval(locationInterval.current);
      if (leafletMap.current) { leafletMap.current.remove(); leafletMap.current = null; driverMarker.current = null; navLine.current = null; stopMarkers.current = []; }
    };
  }, [initMap]);

  // Passenger nav line
  useEffect(() => {
    if (!driverPos || !leafletMap.current || isDriver) return;
    const map = leafletMap.current;
    if (navLine.current) { map.removeLayer(navLine.current); navLine.current = null; }
    let targetLat, targetLng, targetLabel;
    if (checkinStatus === 'picked') {
      const dropoff = stops.find(s => s.type === 'dropoff') || (dropoffLat ? { lat: dropoffLat, lng: dropoffLng } : null);
      if (dropoff) { targetLat = parseFloat(dropoff.lat); targetLng = parseFloat(dropoff.lng); targetLabel = 'Your drop-off'; }
    } else {
      if (passengerLat && passengerLng) { targetLat = parseFloat(passengerLat); targetLng = parseFloat(passengerLng); targetLabel = 'Your location'; }
      else if (pickupLat) { targetLat = parseFloat(pickupLat); targetLng = parseFloat(pickupLng); targetLabel = 'Your pickup'; }
      else { const pickup = stops.find(s => s.type === 'pickup'); if (pickup) { targetLat = parseFloat(pickup.lat); targetLng = parseFloat(pickup.lng); targetLabel = pickup.label || 'Your pickup'; } }
    }
    if (targetLat) {
      navLine.current = L.polyline([[driverPos.lat, driverPos.lng], [targetLat, targetLng]], { color: checkinStatus==='picked'?'#60a5fa':'#ef4444', weight:5, opacity:0.9 }).addTo(map);
      const dist = haversineDistance(driverPos.lat, driverPos.lng, targetLat, targetLng);
      setNavInfo({ dist: formatDist(dist), time: estimateTime(dist), target: targetLabel, status: checkinStatus });
    }
  }, [driverPos, checkinStatus, stops, pickupLat, pickupLng, dropoffLat, dropoffLng, passengerLat, passengerLng, isDriver]);

  // Driver nav line
  useEffect(() => {
    if (!driverPos || !leafletMap.current || !isDriver || !stops.length) return;
    const map = leafletMap.current;
    if (navLine.current) { map.removeLayer(navLine.current); navLine.current = null; }
    const nextPickup = stops.find(s => s.type === 'pickup');
    if (nextPickup) {
      navLine.current = L.polyline([[driverPos.lat, driverPos.lng], [parseFloat(nextPickup.lat), parseFloat(nextPickup.lng)]], { color:'#4ade80', weight:4, opacity:0.9, dashArray:'10,5' }).addTo(map);
      const dist = haversineDistance(driverPos.lat, driverPos.lng, parseFloat(nextPickup.lat), parseFloat(nextPickup.lng));
      setNavInfo({ dist: formatDist(dist), time: estimateTime(dist), target: nextPickup.label || 'Next pickup' });
    }
  }, [driverPos, isDriver, stops]);

  function drawStops(stopsArr, map) {
    stopMarkers.current.forEach(m => map.removeLayer(m));
    stopMarkers.current = [];
    if (!stopsArr.length) return;
    const bounds = [];
    stopsArr.forEach((s, i) => {
      const color = s.type === 'pickup' ? '#4ade80' : '#60a5fa';
      const label = s.label || (s.type==='pickup' ? `Pickup ${i+1}` : `Drop-off ${i+1}`);
      const m = L.marker([parseFloat(s.lat), parseFloat(s.lng)], { icon: makeStopIcon(color) }).addTo(map).bindPopup(`<b>${label}</b><br/>${s.type==='pickup'?'🟢 Pickup':'🔵 Drop-off'}`);
      stopMarkers.current.push(m);
      bounds.push([parseFloat(s.lat), parseFloat(s.lng)]);
    });
    if (bounds.length > 1) {
      const line = L.polyline(bounds, { color:'#4ade80', weight:3, opacity:0.5, dashArray:'8,6' }).addTo(map);
      stopMarkers.current.push(line);
      map.fitBounds(bounds, { padding:[50,50] });
    }
  }

  function updateDriverMarker(lat, lng, map, liveName) {
    const pos = [parseFloat(lat), parseFloat(lng)];
    const name = liveName || liveDriverName || driverName || 'Driver';
    const icon = L.divIcon({
      html: `<div style="display:flex;flex-direction:column;align-items:center;gap:3px">
        <div style="width:48px;height:48px;border-radius:50%;background:#fbbf24;border:3px solid #fff;box-shadow:0 0 18px rgba(251,191,36,.95);display:flex;align-items:center;justify-content:center;font-size:24px">🚐</div>
        <div style="background:rgba(0,0,0,0.75);color:#fbbf24;font-size:11px;font-weight:700;padding:2px 7px;border-radius:4px;white-space:nowrap;font-family:'Sora',sans-serif;border:1px solid #fbbf2466">${name}</div>
      </div>`,
      iconSize:[60,68], iconAnchor:[30,24], className:'',
    });
    if (driverMarker.current) { driverMarker.current.setLatLng(pos); driverMarker.current.setIcon(icon); }
    else { driverMarker.current = L.marker(pos, { icon }).addTo(map).bindPopup(`<b>🚐 ${name}</b><br/>Live location`); map.panTo(pos, { animate:true, duration:0.5 }); }
  }

  function startSharing() {
    if (!navigator.geolocation) { setError('GPS not available'); return; }
    setSharing(true);
    const send = () => {
      navigator.geolocation.getCurrentPosition(
        pos => {
          const { latitude: lat, longitude: lng } = pos.coords;
          import('../socket.js').then(({ sendLocation }) => sendLocation(tripId, lat, lng));
          if (leafletMap.current) updateDriverMarker(lat, lng, leafletMap.current, null);
          setDriverPos({ lat, lng });
        },
        err => setError('GPS error: ' + err.message),
        { enableHighAccuracy: true }
      );
    };
    send();
    locationInterval.current = setInterval(send, 3000);
  }

  function stopSharing() { setSharing(false); clearInterval(locationInterval.current); }

  const navColor = navInfo?.status === 'picked' ? C.blue : '#ef4444';
  const isHeadingDropoff = navInfo && !isDriver && navInfo.status === 'picked';

  return (
    <div style={{ borderRadius:12, overflow:'hidden', border:`1px solid ${C.border}`, marginBottom:20 }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {navInfo && !isDriver && (
        <div style={{ background: isHeadingDropoff?'#0a1628':'#1c0808', borderLeft:`5px solid ${navColor}`, padding:'16px 18px', display:'flex', alignItems:'center', gap:16 }}>
          <div style={{ background:`${navColor}20`, border:`2px solid ${navColor}`, borderRadius:14, padding:'10px 18px', textAlign:'center', minWidth:90, flexShrink:0 }}>
            <div style={{ fontSize:32, fontWeight:900, color:navColor, lineHeight:1, fontFamily:'monospace' }}>~{navInfo.time}</div>
            <div style={{ fontSize:11, color:C.text3, marginTop:3, fontWeight:700, letterSpacing:1, textTransform:'uppercase' }}>ETA</div>
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:15, fontWeight:700, color:navColor, marginBottom:4 }}>{isHeadingDropoff?'🏁 Heading to your drop-off':'🚐 Driver is on the way'}</div>
            <div style={{ fontSize:13, color:C.text2 }}>
              {(liveDriverName||driverName) && <span style={{ color:'#fbbf24', fontWeight:700 }}>{liveDriverName||driverName}</span>}
              {(liveDriverName||driverName) && ' · '}
              <span style={{ fontWeight:600, color:C.text }}>{navInfo.dist} away</span>
            </div>
          </div>
        </div>
      )}

      <div style={{ position:'relative', height, background:'#0f1923' }}>
        <div ref={mapRef} style={{ height:'100%', width:'100%' }} />
      </div>

      <div style={{ background:C.bg3, padding:'10px 14px', display:'flex', gap:16, flexWrap:'wrap', alignItems:'center', borderTop:`1px solid ${C.border}` }}>
        <span style={{ fontSize:12, color:C.text2, display:'flex', alignItems:'center', gap:5 }}><span style={{ display:'inline-block', width:10, height:10, borderRadius:'50%', background:C.green }} /> Pickup</span>
        <span style={{ fontSize:12, color:C.text2, display:'flex', alignItems:'center', gap:5 }}><span style={{ display:'inline-block', width:10, height:10, borderRadius:'50%', background:C.blue }} /> Drop-off</span>
        {passengerLat && <span style={{ fontSize:12, color:C.text2, display:'flex', alignItems:'center', gap:5 }}><span style={{ display:'inline-block', width:10, height:10, borderRadius:'50%', background:'#a78bfa' }} /> You</span>}
        <span style={{ fontSize:12, color:C.text2, display:'flex', alignItems:'center', gap:5 }}><span style={{ display:'inline-block', width:10, height:10, borderRadius:'50%', background:C.amber }} /> Driver</span>
        {navInfo && isDriver && <span style={{ fontSize:12, color:C.green, fontWeight:500 }}>📍 {navInfo.dist} · ~{navInfo.time} to {navInfo.target}</span>}
        {isDriver && (
          <div style={{ marginLeft:'auto', display:'flex', gap:8, alignItems:'center' }}>
            {error && <span style={{ fontSize:11, color:C.red }}>{error}</span>}
            {!sharing
              ? <button onClick={startSharing} style={{ background:C.greenDim, color:C.green, border:`1px solid ${C.greenBorder}`, borderRadius:6, padding:'5px 12px', fontSize:12, cursor:'pointer', fontFamily:"'Sora',sans-serif" }}>📡 Share location</button>
              : <button onClick={stopSharing}  style={{ background:C.redDim,   color:C.red,   border:`1px solid ${C.redBorder}`,   borderRadius:6, padding:'5px 12px', fontSize:12, cursor:'pointer', fontFamily:"'Sora',sans-serif" }}>⏹ Stop sharing</button>
            }
          </div>
        )}
      </div>
    </div>
  );
}

// ── StopPicker — admin clicks map to place pickup/dropoff pins ────────────────
export const StopPicker = forwardRef(function StopPicker({ stops, onChange, height = 340 }, ref) {
  const mapRef        = useRef(null);
  const leafletMap    = useRef(null);
  const markers       = useRef([]);
  const stopsRef      = useRef(stops);
  const nextTypeRef   = useRef('pickup');
  const pendingCenter = useRef(null);
  const areaMarker    = useRef(null);
  const [nextType, setNextType] = useState('pickup');

  // Expose panTo(loc) so parent can directly move the map
  useImperativeHandle(ref, () => ({
    panTo(loc) {
      if (!loc?.lat || !loc?.lng) return;
      const lat = parseFloat(loc.lat), lng = parseFloat(loc.lng);
      if (isNaN(lat) || isNaN(lng)) return;
      if (leafletMap.current) {
        leafletMap.current.setView([lat, lng], 15);
        // Flash a temporary yellow label marker
        const icon = L.divIcon({
          html: `<div style="background:#fbbf2444;border:2px solid #fbbf24;border-radius:8px;padding:5px 12px;font-size:12px;color:#fbbf24;white-space:nowrap;font-family:'Sora',sans-serif;font-weight:600;box-shadow:0 2px 12px rgba(0,0,0,.6)">📍 ${loc.name || ''}</div>`,
          className: '', iconAnchor: [0, 0],
        });
        const m = L.marker([lat, lng], { icon, zIndexOffset: 9999 }).addTo(leafletMap.current);
        setTimeout(() => { try { leafletMap.current?.removeLayer(m); } catch(_){} }, 5000);
      } else {
        // Map not initialised yet — queue it
        pendingCenter.current = loc;
      }
    }
  }), []);

  useEffect(() => { stopsRef.current = stops; }, [stops]);
  useEffect(() => { nextTypeRef.current = nextType; }, [nextType]);

  function applyCenter(map, loc) {
    if (!loc || !map) return;
    const lat = parseFloat(loc.lat), lng = parseFloat(loc.lng);
    if (isNaN(lat) || isNaN(lng)) return;
    if (areaMarker.current) { try { map.removeLayer(areaMarker.current); } catch(_){} areaMarker.current = null; }
    map.setView([lat, lng], 15);
    const icon = L.divIcon({
      html: `<div style="background:#fbbf2444;border:2px solid #fbbf24;border-radius:8px;padding:5px 12px;font-size:12px;color:#fbbf24;white-space:nowrap;font-family:'Sora',sans-serif;font-weight:600;box-shadow:0 2px 12px rgba(0,0,0,.5)">📍 ${loc.name || 'Selected area'}</div>`,
      className: '', iconAnchor: [0, 0],
    });
    areaMarker.current = L.marker([lat, lng], { icon, zIndexOffset: 1000 }).addTo(map);
    setTimeout(() => { if (areaMarker.current && leafletMap.current) { try { leafletMap.current.removeLayer(areaMarker.current); } catch(_){} areaMarker.current = null; } }, 6000);
  }

  // Init map once on mount
  useEffect(() => {
    if (!mapRef.current || leafletMap.current) return;
    const map = L.map(mapRef.current, { center: CAIRO, zoom: 12 });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution:'© OpenStreetMap', maxZoom:19 }).addTo(map);
    leafletMap.current = map;

    if (pendingCenter.current) {
      const pc = pendingCenter.current; pendingCenter.current = null;
      const lat = parseFloat(pc.lat), lng = parseFloat(pc.lng);
      if (!isNaN(lat) && !isNaN(lng)) map.setView([lat, lng], 15);
    }

    map.on('click', (e) => {
      const { lat, lng } = e.latlng;
      onChange([...stopsRef.current, { type: nextTypeRef.current, lat: lat.toFixed(6), lng: lng.toFixed(6), label: '' }]);
    });
    setTimeout(() => map.invalidateSize(), 300);

    return () => { if (leafletMap.current) { leafletMap.current.remove(); leafletMap.current = null; } areaMarker.current = null; };
  }, []);

  // Redraw stop markers whenever stops array changes
  useEffect(() => {
    if (!leafletMap.current) return;
    const map = leafletMap.current;
    markers.current.forEach(m => map.removeLayer(m));
    markers.current = [];
    const bounds = [];
    stops.forEach((s, i) => {
      const color = s.type === 'pickup' ? '#4ade80' : '#60a5fa';
      const num = stops.filter((x,j) => x.type===s.type && j<=i).length;
      const m = L.marker([parseFloat(s.lat), parseFloat(s.lng)], { icon: makeNumberedIcon(color, num) })
        .addTo(map)
        .bindPopup(`<b>${s.type==='pickup'?'🟢 Pickup':'🔵 Drop-off'} ${num}</b>${s.label?'<br/>'+s.label:''}`);
      markers.current.push(m);
      bounds.push([parseFloat(s.lat), parseFloat(s.lng)]);
    });
    if (bounds.length > 1) {
      const line = L.polyline(bounds, { color:'#4ade80', weight:2, opacity:0.4, dashArray:'6,5' }).addTo(map);
      markers.current.push(line);
      map.fitBounds(bounds, { padding:[40,40] });
    }
  }, [stops]);

  const pickupCount  = stops.filter(s => s.type==='pickup').length;
  const dropoffCount = stops.filter(s => s.type==='dropoff').length;

  return (
    <div style={{ borderRadius:12, overflow:'hidden', border:`1px solid ${C.border}`, marginBottom:14 }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ background:C.bg4, padding:'10px 14px', borderBottom:`1px solid ${C.border}`, display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
        <span style={{ fontSize:12, color:C.text2 }}>Click map to add:</span>
        <button onClick={() => setNextType('pickup')}
          style={{ background:nextType==='pickup'?C.greenDim:'transparent', color:nextType==='pickup'?C.green:C.text3, border:`1px solid ${nextType==='pickup'?C.greenBorder:C.border}`, borderRadius:6, padding:'4px 12px', fontSize:12, cursor:'pointer', fontFamily:"'Sora',sans-serif", fontWeight:nextType==='pickup'?600:400 }}>
          🟢 Pickup ({pickupCount})
        </button>
        <button onClick={() => setNextType('dropoff')}
          style={{ background:nextType==='dropoff'?C.blueDim:'transparent', color:nextType==='dropoff'?C.blue:C.text3, border:`1px solid ${nextType==='dropoff'?C.blueBorder:C.border}`, borderRadius:6, padding:'4px 12px', fontSize:12, cursor:'pointer', fontFamily:"'Sora',sans-serif", fontWeight:nextType==='dropoff'?600:400 }}>
          🔵 Drop-off ({dropoffCount})
        </button>
        <span style={{ fontSize:11, color:C.text3 }}>{stops.length} total</span>
        {stops.length > 0 && (<>
          <button onClick={() => onChange(stops.slice(0,-1))} style={{ marginLeft:'auto', background:C.redDim, color:C.red, border:`1px solid ${C.redBorder}`, borderRadius:6, padding:'3px 10px', fontSize:11, cursor:'pointer', fontFamily:"'Sora',sans-serif" }}>↩ Undo</button>
          <button onClick={() => onChange([])}                style={{ background:C.redDim, color:C.red, border:`1px solid ${C.redBorder}`, borderRadius:6, padding:'3px 10px', fontSize:11, cursor:'pointer', fontFamily:"'Sora',sans-serif" }}>🗑 Clear</button>
        </>)}
      </div>
      <div style={{ height, background:'#0f1923' }}>
        <div ref={mapRef} style={{ height:'100%', width:'100%' }} />
      </div>
      {stops.length > 0 && (
        <div style={{ background:C.bg3, padding:'10px 14px', borderTop:`1px solid ${C.border}` }}>
          {stops.map((s, i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:8, padding:'4px 0', fontSize:12 }}>
              <span style={{ color:s.type==='pickup'?C.green:C.blue, minWidth:80 }}>{s.type==='pickup'?'🟢':'🔵'} {s.type} {stops.filter((x,j)=>x.type===s.type&&j<=i).length}</span>
              <span style={{ color:C.text3, fontSize:11 }}>{parseFloat(s.lat).toFixed(4)}, {parseFloat(s.lng).toFixed(4)}</span>
              <input value={s.label} onChange={e => { const n=[...stops]; n[i]={...n[i],label:e.target.value}; onChange(n); }}
                placeholder="Label (optional)"
                style={{ background:C.bg4, border:`1px solid ${C.border}`, borderRadius:4, padding:'2px 8px', color:C.text, fontSize:11, fontFamily:"'Sora',sans-serif", outline:'none', flex:1 }} />
              <button onClick={() => onChange(stops.filter((_,j)=>j!==i))} style={{ background:'transparent', border:'none', color:C.red, cursor:'pointer', fontSize:14 }}>×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

// ── AdminMap — live driver overview ──────────────────────────────────────────
export function AdminMap({ height = 380 }) {
  const mapRef     = useRef(null);
  const leafletMap = useRef(null);
  const pins       = useRef({});
  const [drivers, setDrivers] = useState([]);

  useEffect(() => {
    import('../api.js').then(({ getAllLocations }) => { getAllLocations().then(locs => setDrivers(locs)).catch(() => {}); });
    socket.on('driver:location:all', ({ driverId, lat, lng }) => {
      setDrivers(prev => { const idx=prev.findIndex(d=>d.driver_id===driverId); if(idx>-1){const n=[...prev];n[idx]={...n[idx],lat,lng};return n;} return [...prev,{driver_id:driverId,lat,lng}]; });
    });
    return () => socket.off('driver:location:all');
  }, []);

  useEffect(() => {
    if (!mapRef.current || leafletMap.current) return;
    const map = L.map(mapRef.current, { center: CAIRO, zoom: 11 });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution:'© OpenStreetMap', maxZoom:19 }).addTo(map);
    leafletMap.current = map;
    setTimeout(() => map.invalidateSize(), 300);
  }, []);

  useEffect(() => {
    if (!leafletMap.current) return;
    drivers.forEach(d => {
      if (!d.lat || !d.lng) return;
      const pos = [parseFloat(d.lat), parseFloat(d.lng)];
      const icon = L.divIcon({ html:`<div style="background:#fbbf24;padding:3px 8px;border-radius:6px;font-size:11px;font-weight:700;color:#000;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.6)">🚐 ${d.driver_name||'Driver'}</div>`, className:'', iconAnchor:[0,0] });
      if (pins.current[d.driver_id]) pins.current[d.driver_id].setLatLng(pos);
      else pins.current[d.driver_id] = L.marker(pos, {icon}).addTo(leafletMap.current).bindPopup(`${d.driver_name} · ${d.from_loc||''} → ${d.to_loc||''}`);
    });
  }, [drivers]);

  return (
    <div style={{ borderRadius:12, overflow:'hidden', border:'1px solid #27272a', marginBottom:20 }}>
      <div ref={mapRef} style={{ height, width:'100%', background:'#18181b' }} />
      <div style={{ background:'#18181b', padding:'8px 14px', borderTop:'1px solid #27272a' }}>
        <span style={{ fontSize:12, color:'#a1a1aa' }}>🚐 {drivers.length} driver{drivers.length!==1?'s':''} visible · Updates every 4 seconds</span>
      </div>
    </div>
  );
}

// ── ProximityMap — passenger location + nearest pickup ───────────────────────
export function ProximityMap({ passengerLat, passengerLng, pickupStop, height = 220 }) {
  const mapRef     = useRef(null);
  const leafletMap = useRef(null);

  useEffect(() => {
    if (!mapRef.current || leafletMap.current) return;
    const pLat = parseFloat(passengerLat), pLng = parseFloat(passengerLng);
    const sLat = parseFloat(pickupStop.lat), sLng = parseFloat(pickupStop.lng);
    const map = L.map(mapRef.current, { center: [(pLat+sLat)/2, (pLng+sLng)/2], zoom: 14 });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution:'© OpenStreetMap', maxZoom:19 }).addTo(map);
    leafletMap.current = map;
    const pIcon = L.divIcon({ html:`<div style="width:14px;height:14px;border-radius:50%;background:#a78bfa;border:2px solid #fff;box-shadow:0 0 8px #a78bfa99"></div>`, iconSize:[14,14], iconAnchor:[7,7], className:'' });
    L.marker([pLat, pLng], { icon:pIcon }).addTo(map).bindPopup('<b>📍 Your location</b>');
    const sIcon = L.divIcon({ html:`<div style="background:#4ade80;border:2px solid #fff;border-radius:50%;width:18px;height:18px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#000;box-shadow:0 0 8px #4ade8099">P</div>`, iconSize:[18,18], iconAnchor:[9,9], className:'' });
    L.marker([sLat, sLng], { icon:sIcon }).addTo(map).bindPopup(`<b>🟢 ${pickupStop.label||'Pickup point'}</b>`);
    L.polyline([[pLat,pLng],[sLat,sLng]], { color:'#4ade80', weight:3, opacity:0.8, dashArray:'8,5' }).addTo(map);
    map.fitBounds([[pLat,pLng],[sLat,sLng]], { padding:[40,40] });
    setTimeout(() => map.invalidateSize(), 300);
    return () => { if (leafletMap.current) { leafletMap.current.remove(); leafletMap.current = null; } };
  }, [passengerLat, passengerLng, pickupStop]);

  return (
    <div style={{ borderRadius:10, overflow:'hidden', border:`1px solid ${C.border}`, marginTop:10 }}>
      <div ref={mapRef} style={{ height, width:'100%', background:'#0f1923' }} />
    </div>
  );
}
