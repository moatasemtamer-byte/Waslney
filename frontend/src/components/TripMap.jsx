import { useEffect, useRef, useState } from 'react';
import { getTripLocation } from '../api.js';
import socket, { watchTrip } from '../socket.js';
import { C } from './UI.jsx';

const CAIRO = [30.0626, 31.2497];

// ── Main TripMap ─────────────────────────────────────────
export default function TripMap({
  tripId, pickupLat, pickupLng, dropoffLat, dropoffLng,
  isDriver = false, height = 280,
}) {
  const mapRef           = useRef(null);
  const leafletMap       = useRef(null);
  const driverMarker     = useRef(null);
  const locationInterval = useRef(null);
  const [sharing, setSharing] = useState(false);
  const [error,   setError]   = useState(null);
  const [status,  setStatus]  = useState('Loading map...');

  useEffect(() => {
    // Make sure div is ready
    if (!mapRef.current) return;

    // If Leaflet already loaded just init
    if (window.L) {
      initMap();
      return;
    }

    // Load Leaflet CSS
    if (!document.querySelector('#leaflet-css')) {
      const css = document.createElement('link');
      css.id = 'leaflet-css';
      css.rel = 'stylesheet';
      css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(css);
    }

    // Load Leaflet JS
    if (!document.querySelector('#leaflet-js')) {
      const js = document.createElement('script');
      js.id = 'leaflet-js';
      js.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      js.onload = () => { initMap(); };
      js.onerror = () => setStatus('Failed to load map library');
      document.head.appendChild(js);
    } else {
      // Script tag exists but still loading — wait for it
      const existing = document.querySelector('#leaflet-js');
      existing.addEventListener('load', initMap);
    }

    return () => {
      socket.off('driver:location');
      clearInterval(locationInterval.current);
      // Destroy map instance to allow re-init
      if (leafletMap.current) {
        leafletMap.current.remove();
        leafletMap.current = null;
        driverMarker.current = null;
      }
    };
  }, [tripId, pickupLat, pickupLng, dropoffLat, dropoffLng]);

  function initMap() {
    if (!mapRef.current || leafletMap.current) return;
    const L = window.L;
    if (!L) { setStatus('Map library not ready'); return; }

    setStatus('');

    const center = (pickupLat && pickupLng)
      ? [parseFloat(pickupLat), parseFloat(pickupLng)]
      : CAIRO;

    const map = L.map(mapRef.current, {
      center,
      zoom: 13,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    leafletMap.current = map;

    // Pickup marker
    if (pickupLat && pickupLng) {
      const icon = L.divIcon({
        html: `<div style="width:16px;height:16px;border-radius:50%;background:#4ade80;border:3px solid #fff;box-shadow:0 0 10px rgba(74,222,128,.9)"></div>`,
        iconSize: [16, 16], iconAnchor: [8, 8], className: '',
      });
      L.marker([parseFloat(pickupLat), parseFloat(pickupLng)], { icon })
        .addTo(map).bindPopup('<b>Pickup point</b>');
    }

    // Dropoff marker
    if (dropoffLat && dropoffLng) {
      const icon = L.divIcon({
        html: `<div style="width:16px;height:16px;border-radius:50%;background:#60a5fa;border:3px solid #fff;box-shadow:0 0 10px rgba(96,165,250,.9)"></div>`,
        iconSize: [16, 16], iconAnchor: [8, 8], className: '',
      });
      L.marker([parseFloat(dropoffLat), parseFloat(dropoffLng)], { icon })
        .addTo(map).bindPopup('<b>Drop-off point</b>');
    }

    // Dashed line between points
    if (pickupLat && pickupLng && dropoffLat && dropoffLng) {
      const p1 = [parseFloat(pickupLat),  parseFloat(pickupLng)];
      const p2 = [parseFloat(dropoffLat), parseFloat(dropoffLng)];
      L.polyline([p1, p2], {
        color: '#4ade80', weight: 3, opacity: 0.6, dashArray: '8,6',
      }).addTo(map);
      map.fitBounds([p1, p2], { padding: [50, 50] });
    }

    // Live driver location
    if (tripId) {
      getTripLocation(tripId)
        .then(loc => { if (loc?.lat) placeDriverPin(loc.lat, loc.lng); })
        .catch(() => {});
      watchTrip(tripId);
      socket.on('driver:location', ({ lat, lng }) => {
        placeDriverPin(lat, lng);
        leafletMap.current?.panTo([parseFloat(lat), parseFloat(lng)]);
      });
    }

    // Force map to recalculate size after render
    setTimeout(() => map.invalidateSize(), 300);
  }

  function placeDriverPin(lat, lng) {
    if (!leafletMap.current || !window.L) return;
    const L = window.L;
    const pos = [parseFloat(lat), parseFloat(lng)];
    const icon = L.divIcon({
      html: `<div style="width:30px;height:30px;border-radius:50%;background:#fbbf24;border:3px solid #fff;box-shadow:0 0 12px rgba(251,191,36,.9);display:flex;align-items:center;justify-content:center;font-size:15px;line-height:1">🚐</div>`,
      iconSize: [30, 30], iconAnchor: [15, 15], className: '',
    });
    if (driverMarker.current) {
      driverMarker.current.setLatLng(pos);
    } else {
      driverMarker.current = L.marker(pos, { icon })
        .addTo(leafletMap.current)
        .bindPopup('<b>Driver — live location</b>');
    }
  }

  function startSharing() {
    if (!navigator.geolocation) { setError('GPS not available'); return; }
    setSharing(true);
    const send = () => {
      navigator.geolocation.getCurrentPosition(
        pos => {
          const { latitude: lat, longitude: lng } = pos.coords;
          import('../socket.js').then(({ sendLocation }) => sendLocation(tripId, lat, lng));
          placeDriverPin(lat, lng);
          leafletMap.current?.panTo([lat, lng]);
        },
        err => setError('GPS error: ' + err.message),
        { enableHighAccuracy: true }
      );
    };
    send();
    locationInterval.current = setInterval(send, 4000);
  }

  function stopSharing() {
    setSharing(false);
    clearInterval(locationInterval.current);
  }

  return (
    <div style={{ borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.border}`, marginBottom: 20 }}>
      <div style={{ position: 'relative', height, width: '100%', background: '#0f1923' }}>
        <div ref={mapRef} style={{ height: '100%', width: '100%' }} />
        {status && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            background: '#0f1923', flexDirection: 'column', gap: 8, zIndex: 1,
          }}>
            <div style={{ width: 20, height: 20, border: `2px solid ${C.border2}`, borderTopColor: C.green, borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            <span style={{ fontSize: 12, color: C.text3 }}>{status}</span>
          </div>
        )}
      </div>
      <div style={{ background: C.bg3, padding: '10px 14px', display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', borderTop: `1px solid ${C.border}` }}>
        <span style={{ fontSize: 12, color: C.text2, display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: C.green }} /> Pickup</span>
        <span style={{ fontSize: 12, color: C.text2, display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: C.blue }} /> Drop-off</span>
        <span style={{ fontSize: 12, color: C.text2, display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: C.amber }} /> Driver (live)</span>
        {isDriver && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            {error && <span style={{ fontSize: 11, color: C.red }}>{error}</span>}
            {!sharing
              ? <button onClick={startSharing} style={{ background: C.greenDim, color: C.green, border: `1px solid ${C.greenBorder}`, borderRadius: 6, padding: '5px 12px', fontSize: 12, cursor: 'pointer', fontFamily: "'Sora',sans-serif" }}>📡 Share my location</button>
              : <button onClick={stopSharing}  style={{ background: C.redDim,   color: C.red,   border: `1px solid ${C.redBorder}`,   borderRadius: 6, padding: '5px 12px', fontSize: 12, cursor: 'pointer', fontFamily: "'Sora',sans-serif" }}>⏹ Stop sharing</button>
            }
          </div>
        )}
      </div>
    </div>
  );
}

// ── Admin overview map ────────────────────────────────────
export function AdminMap({ height = 380 }) {
  const mapRef     = useRef(null);
  const leafletMap = useRef(null);
  const pins       = useRef({});
  const [drivers, setDrivers] = useState([]);
  const [status, setStatus]   = useState('Loading map...');

  useEffect(() => {
    import('../api.js').then(({ getAllLocations }) => {
      getAllLocations().then(locs => setDrivers(locs)).catch(() => {});
    });
    socket.on('driver:location:all', ({ driverId, lat, lng }) => {
      setDrivers(prev => {
        const idx = prev.findIndex(d => d.driver_id === driverId);
        if (idx > -1) { const n = [...prev]; n[idx] = { ...n[idx], lat, lng }; return n; }
        return [...prev, { driver_id: driverId, lat, lng }];
      });
    });
    return () => socket.off('driver:location:all');
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;

    const doInit = () => {
      if (leafletMap.current) return;
      const L = window.L;
      setStatus('');
      const map = L.map(mapRef.current, { center: CAIRO, zoom: 11 });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap', maxZoom: 19,
      }).addTo(map);
      leafletMap.current = map;
      setTimeout(() => map.invalidateSize(), 300);
    };

    if (window.L) { doInit(); return; }

    if (!document.querySelector('#leaflet-css')) {
      const css = document.createElement('link');
      css.id = 'leaflet-css';
      css.rel = 'stylesheet';
      css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(css);
    }
    if (!document.querySelector('#leaflet-js')) {
      const js = document.createElement('script');
      js.id = 'leaflet-js';
      js.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      js.onload = doInit;
      document.head.appendChild(js);
    } else {
      document.querySelector('#leaflet-js').addEventListener('load', doInit);
    }
  }, []);

  useEffect(() => {
    if (!leafletMap.current || !window.L) return;
    const L = window.L;
    drivers.forEach(d => {
      if (!d.lat || !d.lng) return;
      const pos = [parseFloat(d.lat), parseFloat(d.lng)];
      const icon = L.divIcon({
        html: `<div style="background:#fbbf24;padding:3px 8px;border-radius:6px;font-size:11px;font-weight:700;color:#000;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.6)">🚐 ${d.driver_name || 'Driver'}</div>`,
        className: '', iconAnchor: [0, 0],
      });
      if (pins.current[d.driver_id]) {
        pins.current[d.driver_id].setLatLng(pos);
      } else {
        pins.current[d.driver_id] = L.marker(pos, { icon })
          .addTo(leafletMap.current)
          .bindPopup(`${d.driver_name} · ${d.from_loc || ''} → ${d.to_loc || ''}`);
      }
    });
  }, [drivers]);

  return (
    <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid #27272a', marginBottom: 20 }}>
      <div style={{ position: 'relative', height, background: '#0f1923' }}>
        <div ref={mapRef} style={{ height: '100%', width: '100%' }} />
        {status && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f1923', flexDirection: 'column', gap: 8, zIndex: 1 }}>
            <div style={{ width: 20, height: 20, border: '2px solid #3f3f46', borderTopColor: '#4ade80', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            <span style={{ fontSize: 12, color: '#52525b' }}>{status}</span>
          </div>
        )}
      </div>
      <div style={{ background: '#18181b', padding: '8px 14px', borderTop: '1px solid #27272a' }}>
        <span style={{ fontSize: 12, color: '#a1a1aa' }}>🚐 {drivers.length} driver{drivers.length !== 1 ? 's' : ''} visible · Updates every 4 seconds</span>
      </div>
    </div>
  );
}
